import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
const { loadZelleInventoriesMock, summarizeZelleInventoriesMock } = vi.hoisted(() => ({
  loadZelleInventoriesMock: vi.fn(),
  summarizeZelleInventoriesMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: connectMock }),
  withRetry: async <T,>(operation: () => Promise<T>) => operation(),
}));
vi.mock("@/lib/zelle-inventory", () => ({
  loadZelleInventories: loadZelleInventoriesMock,
  summarizeZelleInventories: summarizeZelleInventoriesMock,
}));

function createClient(results: unknown[][]) {
  const client = { query: vi.fn(), release: vi.fn() };
  for (const rows of results) client.query.mockResolvedValueOnce({ rows });
  connectMock.mockResolvedValue(client);
  return client;
}

describe("finance APIs", () => {
  beforeEach(() => {
    connectMock.mockReset();
    loadZelleInventoriesMock.mockReset();
    summarizeZelleInventoriesMock.mockReset();
    loadZelleInventoriesMock.mockResolvedValue([]);
    summarizeZelleInventoriesMock.mockReturnValue({
      summary: {
        balanceUsd: 500,
        inventoryUsd: 500,
        deficitUsd: 0,
        pricedUsd: 400,
        unpricedUsd: 100,
        costCup: 272000,
        averagePrice: 680,
        coveragePercent: 80,
      },
      accounts: [],
    });
  });

  it("returns a complete overview from authoritative sources", async () => {
    const client = createClient([
      [{
        state: { cashUsd: 100, cashCup: 42000, usdCupRate: 420, updatedAt: "2026-08-07T10:00:00.000Z" },
        remeseros: { receivableCup: 16000, payableCup: 100000, netCup: -84000 },
        pending_assignments: { count: 2, amountUsd: 50 },
        changes: [],
        expenses: [{ id: "e-1", currency: "CUP", amount: 500, description: "Mensajeria", balanceBefore: 42000, balanceAfter: 41500, occurredAt: "2026-08-07T10:00:00.000Z" }],
        cash_movements: [],
        exchanges: [],
        wire_profits: {
          lifetimeProfitCup: 183000,
          lifetimeProfitUsd: 271.11,
          lifetimeExactProfitCup: 183000,
          lifetimeExactProfitUsd: 271.11,
          lifetimeEstimatedProfitCup: 0,
          lifetimeEstimatedProfitUsd: 0,
          lifetimeExactCount: 1,
          lifetimeEstimatedCount: 0,
          lifetimePendingCount: 1,
          lifetimeOwnerFeeCup: 140000,
          lifetimeOwnerFeeUsd: 207.41,
          lifetimeNetProfitCup: 43000,
          lifetimeNetProfitUsd: 63.7,
          lifetimeNetExactProfitCup: 43000,
          lifetimeNetExactProfitUsd: 63.7,
          lifetimeNetExactCount: 1,
          lifetimeNetEstimatedCount: 0,
          lifetimeNetPendingCount: 1,
          monthProfitCup: 183000,
          monthProfitUsd: 271.11,
          monthExactProfitCup: 183000,
          monthExactProfitUsd: 271.11,
          monthEstimatedProfitCup: 0,
          monthEstimatedProfitUsd: 0,
          monthExactCount: 1,
          monthEstimatedCount: 0,
          monthPendingCount: 0,
          monthOwnerFeeCup: 140000,
          monthOwnerFeeUsd: 207.41,
          monthNetProfitCup: 43000,
          monthNetProfitUsd: 63.7,
          monthNetExactProfitCup: 43000,
          monthNetExactProfitUsd: 63.7,
          monthNetExactCount: 1,
          monthNetEstimatedCount: 0,
          monthNetPendingCount: 0,
        },
      }],
      [
        { id: "c-1", name: "Miguel", balanceUsd: 25, balanceCup: 10000, archivedAt: null, createdAt: "2026-08-07T10:00:00.000Z", updatedAt: "2026-08-07T10:00:00.000Z" },
        { id: "c-2", name: "Camila", balanceUsd: -75, balanceCup: -52000, archivedAt: null, createdAt: "2026-08-07T10:00:00.000Z", updatedAt: "2026-08-07T10:00:00.000Z" },
      ],
      [{ id: "m-1", counterpartyId: "c-1", currency: "USD", movementType: "RECEIVABLE", amount: 25, note: null, occurredAt: "2026-08-07T10:00:00.000Z", revertedAt: null, revertedReason: null }],
    ]);

    const { GET } = await import("@/app/api/finances/route");
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.overview.totals.external.receivableUsd).toBe(25);
    expect(json.overview.totals.external.payableUsd).toBe(75);
    expect(json.overview.totals.external.netCup).toBe(-42000);
    expect(json.overview.totals.remeseros.receivableCup).toBe(16000);
    expect(json.overview.totals.remeseros.payableCup).toBe(100000);
    expect(json.overview.totals.remeseros.netCup).toBe(-84000);
    expect(json.overview.totals.pendingAssignments).toEqual({ count: 2, amountUsd: 50 });
    expect(json.overview.totals.capitalTotalUsd).toBe(300);
    expect(json.overview.totals.wireProfits).toEqual({
      lifetime: expect.objectContaining({ profitCup: 183000, ownerFeeCup: 140000, netProfitCup: 43000, netProfitUsd: 63.7, netExactCount: 1, netPendingCount: 1 }),
      currentMonth: expect.objectContaining({ profitCup: 183000, ownerFeeCup: 140000, netProfitCup: 43000, netProfitUsd: 63.7, netExactCount: 1, netPendingCount: 0 }),
    });
    expect(json.overview.expenses[0]).toMatchObject({
      currency: "CUP",
      amount: 500,
      balanceAfter: 41500,
    });
    expect(json.overview.counterparties[0].movements[0].signedAmount).toBe(25);
    expect(client.query.mock.calls[0][0]).toContain("GREATEST(-deuda_actual, 0)");
    expect(client.query.mock.calls[0][0]).toContain("-SUM(deuda_actual)");
    expect(client.query.mock.calls[0][0]).toContain("t.amount > 0");
    expect(client.query.mock.calls[0][0]).toContain("t.currency = 'USD'");
    expect(client.query.mock.calls[0][0]).toContain("assignment.unassigned_at IS NULL");
    expect(client.query.mock.calls[0][0]).not.toContain("t.email_id IS NOT NULL");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("returns capital pending when the rate is empty", async () => {
    createClient([
      [{ state: { cashUsd: 100, cashCup: 0, usdCupRate: null, updatedAt: "2026-08-07T10:00:00.000Z" }, remeseros: { receivableCup: 0, payableCup: 0, netCup: 0 }, pending_assignments: { count: 1, amountUsd: 75 }, changes: [], expenses: [], cash_movements: [], exchanges: [] }],
      [],
      [],
    ]);
    const { GET } = await import("@/app/api/finances/route");
    const json = await (await GET()).json();
    expect(json.overview.totals.capitalTotalUsd).toBeNull();
    expect(json.overview.totals.pendingAssignments).toEqual({ count: 1, amountUsd: 75 });
    expect(json.overview.totals.remeseros.netUsd).toBeNull();
  });

  it("updates settings and writes one audit record per changed field", async () => {
    const client = createClient([
      [],
      [{ cashUsd: 0, cashCup: 0, usdCupRate: null }],
      [],
      [],
      [],
      [{ cashUsd: 100, cashCup: 0, usdCupRate: 420, updatedAt: "2026-08-07T10:00:00.000Z" }],
      [],
    ]);
    const { PATCH } = await import("@/app/api/finances/settings/route");
    const response = await PATCH(new Request("http://localhost/api/finances/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cashUsd: 100, usdCupRate: 420, note: "Apertura" }),
    }));

    expect(response.status).toBe(200);
    expect(client.query.mock.calls.filter(([sql]) => String(sql).includes("finance_state_changes"))).toHaveLength(2);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE finance_state SET"))).toBe(true);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("reverts a debt movement instead of deleting it", async () => {
    const client = createClient([
      [],
      [{ id: "42f1f24a-2594-4ddd-bbce-31f662c39ef2", cashMovementId: null, sourceType: null }],
      [],
      [],
    ]);
    const { DELETE } = await import("@/app/api/finances/counterparties/[id]/movements/route");
    const response = await DELETE(new Request("http://localhost/api/finances/counterparties/c-1/movements", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ movementId: "42f1f24a-2594-4ddd-bbce-31f662c39ef2", reason: "Duplicado" }),
    }), { params: Promise.resolve({ id: "c-1" }) });

    expect(response.status).toBe(200);
    const updateCall = client.query.mock.calls.find(([sql]) => String(sql).includes("reverted_at = now()"));
    expect(updateCall?.[0]).toContain("UPDATE finance_debt_movements");
    expect(client.query.mock.calls.every(([sql]) => !String(sql).includes("DELETE FROM"))).toBe(true);
  });

  it("does not archive a counterparty when either currency has a balance", async () => {
    const client = createClient([
      [],
      [{ id: "c-1" }],
      [{ balanceUsd: 10, balanceCup: -10 }],
      [],
    ]);
    const { PATCH } = await import("@/app/api/finances/counterparties/[id]/route");
    const response = await PATCH(new Request("http://localhost/api/finances/counterparties/c-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    }), { params: Promise.resolve({ id: "c-1" }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "counterparty_has_balance" });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE finance_counterparties"))).toBe(false);
  });

  it("permanently deletes a counterparty and all of its manual debt history", async () => {
    const client = createClient([
      [],
      [{ id: "c-1", name: "Miguel" }],
      [{ hasLinkedOperations: false }],
      [],
      [],
      [],
    ]);
    const { DELETE } = await import("@/app/api/finances/counterparties/[id]/route");
    const response = await DELETE(
      new Request("http://localhost/api/finances/counterparties/c-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "c-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      deletedCounterparty: { id: "c-1", name: "Miguel" },
    });
    const deleteCalls = client.query.mock.calls.filter(([sql]) => String(sql).includes("DELETE FROM"));
    expect(deleteCalls).toHaveLength(2);
    expect(String(deleteCalls[0][0])).toContain("finance_debt_movements");
    expect(String(deleteCalls[1][0])).toContain("finance_counterparties");
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("does not delete a counterparty with linked financial operations", async () => {
    const client = createClient([
      [],
      [{ id: "c-1", name: "Miguel" }],
      [{ hasLinkedOperations: true }],
      [],
    ]);
    const { DELETE } = await import("@/app/api/finances/counterparties/[id]/route");
    const response = await DELETE(
      new Request("http://localhost/api/finances/counterparties/c-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "c-1" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "counterparty_has_linked_operations" });
    expect(client.query.mock.calls.every(([sql]) => !String(sql).includes("DELETE FROM"))).toBe(true);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("registers an expense and decreases the selected balance atomically", async () => {
    const client = createClient([
      [],
      [{ cashUsd: 1000, cashCup: 5000 }],
      [{ id: "e-1", currency: "USD", amount: 250.5, description: "Renta", balanceBefore: 1000, balanceAfter: 749.5, occurredAt: "2026-08-07T10:00:00.000Z" }],
      [],
      [],
      [],
    ]);
    const { POST } = await import("@/app/api/finances/expenses/route");
    const response = await POST(new Request("http://localhost/api/finances/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "USD", amount: 250.5, description: "Renta" }),
    }));

    expect(response.status).toBe(201);
    expect((await response.json()).expense.balanceAfter).toBe(749.5);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO finance_expenses"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE finance_state"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO finance_state_changes"))).toBe(true);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("allows an expense to make the selected balance negative", async () => {
    const client = createClient([
      [],
      [{ cashUsd: 100, cashCup: 5000 }],
      [{ id: "e-2", currency: "USD", amount: 150, description: "Renta", balanceBefore: 100, balanceAfter: -50, occurredAt: "2026-08-07T10:00:00.000Z" }],
      [],
      [],
      [],
    ]);
    const { POST } = await import("@/app/api/finances/expenses/route");
    const response = await POST(new Request("http://localhost/api/finances/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "USD", amount: 150, description: "Renta" }),
    }));

    expect(response.status).toBe(201);
    expect((await response.json()).expense.balanceAfter).toBe(-50);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO finance_expenses"))).toBe(true);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });
});
