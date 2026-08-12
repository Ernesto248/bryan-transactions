import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: connectMock }),
  withRetry: async <T,>(operation: () => Promise<T>) => operation(),
}));

function createClient(rowsByCall: unknown[][]) {
  const query = vi.fn();
  for (const rows of rowsByCall) query.mockResolvedValueOnce({ rows });
  const client = { query, release: vi.fn() };
  connectMock.mockResolvedValue(client);
  return client;
}

describe("linked finance operations", () => {
  beforeEach(() => connectMock.mockReset());

  it("sets a payable balance by storing only the signed adjustment", async () => {
    const client = createClient([
      [],
      [{ id: "c-1" }],
      [{ balance: 25 }],
      [{
        id: "m-1", counterpartyId: "c-1", currency: "USD",
        movementType: "SET_PAYABLE", amount: 100, signedDelta: -125,
        balanceBefore: 25, balanceAfter: -100, note: null,
        occurredAt: "2026-08-08T10:00:00.000Z",
      }],
      [],
    ]);
    const { POST } = await import("@/app/api/finances/counterparties/[id]/movements/route");
    const response = await POST(new Request("http://localhost/api/finances/counterparties/c-1/movements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "USD", movementType: "SET_PAYABLE", amount: 100 }),
    }), { params: Promise.resolve({ id: "c-1" }) });

    expect(response.status).toBe(201);
    expect((await response.json()).movement).toMatchObject({
      signedAmount: -125,
      balanceBefore: 25,
      balanceAfter: -100,
    });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("finance_cash_movements"))).toBe(false);
  });

  it("collects a debt and increases cash even when the debt crosses zero", async () => {
    const client = createClient([
      [],
      [{ id: "c-1" }],
      [{ balance: 100 }],
      [{
        id: "m-2", counterpartyId: "c-1", currency: "USD",
        movementType: "RECEIVED", amount: 150, signedDelta: -150,
        balanceBefore: 100, balanceAfter: -50, note: null,
        occurredAt: "2026-08-08T10:00:00.000Z",
      }],
      [{ cashUsd: 20 }],
      [{ id: "cash-1", balanceBefore: 20, balanceAfter: 170 }],
      [],
      [],
      [],
    ]);
    const { POST } = await import("@/app/api/finances/counterparties/[id]/movements/route");
    const response = await POST(new Request("http://localhost/api/finances/counterparties/c-1/movements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "USD", movementType: "RECEIVED", amount: 150 }),
    }), { params: Promise.resolve({ id: "c-1" }) });

    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.movement.balanceAfter).toBe(-50);
    expect(json.cashBalanceAfter).toBe(170);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("exchanges USD to CUP using two opposite cash movements", async () => {
    const client = createClient([
      [],
      [{
        id: "e-1", direction: "USD_TO_CUP", sourceAmount: 10,
        rate: 700, targetAmount: 7000, note: null,
        occurredAt: "2026-08-08T10:00:00.000Z", revertedAt: null, revertedReason: null,
      }],
      [{ cashUsd: 5 }],
      [{ id: "cash-usd", balanceBefore: 5, balanceAfter: -5 }],
      [],
      [{ cashCup: 100 }],
      [{ id: "cash-cup", balanceBefore: 100, balanceAfter: 7100 }],
      [],
      [],
    ]);
    const { POST } = await import("@/app/api/finances/exchanges/route");
    const response = await POST(new Request("http://localhost/api/finances/exchanges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direction: "USD_TO_CUP", sourceAmount: 10, rate: 700 }),
    }));

    expect(response.status).toBe(201);
    expect((await response.json()).exchange.targetAmount).toBe(7000);
    const cashInserts = client.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO finance_cash_movements"));
    expect(cashInserts[0][1][1]).toBe(-10);
    expect(cashInserts[1][1][1]).toBe(7000);
  });

  it("subtracts new remesero payments from CUP cash", async () => {
    const client = createClient([
      [],
      [{ id: "r-1", deudaActual: 1000 }],
      [{
        id: "p-1", remeseroId: "r-1", amountPaid: 200,
        debtBeforePayment: 1000, debtAfterPayment: 800, note: null,
        paidAt: "2026-08-08T10:00:00.000Z", revertedAt: null,
        revertedReason: null, cashMovementId: null,
      }],
      [{ cashCup: 100 }],
      [{ id: "cash-p", balanceBefore: 100, balanceAfter: -100 }],
      [],
      [],
      [],
      [],
    ]);
    const { POST } = await import("@/app/api/remeseros/[id]/payments/route");
    const response = await POST(new Request("http://localhost/api/remeseros/r-1/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountPaid: 200 }),
    }), { params: Promise.resolve({ id: "r-1" }) });

    expect(response.status).toBe(201);
    expect((await response.json()).payment.cashCupAfter).toBe(-100);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("SET deuda_actual"))).toBe(true);
  });
});
