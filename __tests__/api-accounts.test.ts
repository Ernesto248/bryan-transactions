import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
const { loadZelleInventoriesMock, previewWireMock } = vi.hoisted(() => ({
  loadZelleInventoriesMock: vi.fn(),
  previewWireMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: connectMock }),
}));
vi.mock("@/lib/zelle-inventory", () => ({
  loadZelleInventories: loadZelleInventoriesMock,
  previewWire: previewWireMock,
}));

async function loadPostHandler() {
  const mod = await import("@/app/api/accounts/route");
  return mod.POST;
}

function createClient(rowsByCall: unknown[][]) {
  const query = vi.fn();
  for (const rows of rowsByCall) query.mockResolvedValueOnce({ rows });
  const release = vi.fn();
  connectMock.mockResolvedValue({ query, release });
  return { query, release };
}

describe("POST /api/accounts", () => {
  beforeEach(() => {
    connectMock.mockReset();
    loadZelleInventoriesMock.mockReset();
    previewWireMock.mockReset();
    loadZelleInventoriesMock.mockResolvedValue([{ accountId: "account-1" }]);
    previewWireMock.mockReturnValue({
      accountId: "account-1",
      accountName: "Cuenta principal",
      requestedUsd: 10000,
      availableUsd: 12000,
      canCreate: true,
      error: null,
      selected: {
        balanceUsd: 10000,
        inventoryUsd: 10000,
        deficitUsd: 0,
        pricedUsd: 10025,
        unpricedUsd: 0,
        costCup: 6817000,
        averagePrice: 680,
        coveragePercent: 100,
      },
      remaining: {
        balanceUsd: 2000,
        inventoryUsd: 2000,
        deficitUsd: 0,
        pricedUsd: 2000,
        unpricedUsd: 0,
        costCup: 1360000,
        averagePrice: 680,
        coveragePercent: 100,
      },
    });
  });

  it("preserves decimal expense amounts", async () => {
    const { query, release } = createClient([
      [],
      [{ id: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120" }],
      [],
      [],
    ]);
    const POST = await loadPostHandler();
    const response = await POST(new Request("http://localhost/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120",
        movementType: "expense",
        amount: 125.75,
      }),
    }));

    expect(response.status).toBe(201);
    const insertCall = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO account_outflow_movements"));
    expect(insertCall?.[1]).toEqual(expect.arrayContaining([
      "2cfc4038-0f11-4f22-a7dd-cd7ec1597120",
      "expense",
      125.75,
    ]));
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("creates a CUP receivable linked to a wire", async () => {
    const { query } = createClient([
      [],
      [{ id: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120" }],
      [{ usdCupRate: 675 }],
      [{ id: "c-1" }],
      [{ balance: 1000 }],
      [{ id: "d-1" }],
      [],
      [],
    ]);
    const POST = await loadPostHandler();
    const response = await POST(new Request("http://localhost/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120",
        movementType: "wire",
        amount: 10000,
        counterpartyId: "78de4fc2-ea93-49ac-a52f-b1ce22c0dded",
        settlementCurrency: "CUP",
        conversionRate: 700,
        wireFeeUsd: 25,
      }),
    }));

    expect(response.status).toBe(201);
    expect((await response.json()).debtAmount).toBe(7000000);
    expect(previewWireMock).toHaveBeenCalledWith(expect.anything(), 10025);
    const debtCall = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO finance_debt_movements"));
    expect(debtCall?.[1]).toEqual(expect.arrayContaining([7000000, 1000, 7001000]));
    const accountCall = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO account_outflow_movements"));
    expect(accountCall?.[1]).toEqual(expect.arrayContaining(["CUP", 700, 7000000, "d-1"]));
    expect(accountCall?.[1]).toEqual(expect.arrayContaining(["FIFO_PER_ACCOUNT", 10025, 0, 6817000, 680]));
    expect(accountCall?.[1]).toEqual(expect.arrayContaining([25, "EXACT", 675, 6817000, 183000, 271.11]));
  });

  it("rejects a wire above the available account balance before creating debt", async () => {
    previewWireMock.mockReturnValue({
      canCreate: false,
      availableUsd: 500,
    });
    const { query } = createClient([
      [],
      [{ id: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120" }],
      [],
    ]);
    const POST = await loadPostHandler();
    const response = await POST(new Request("http://localhost/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120",
        movementType: "wire",
        amount: 1000,
        counterpartyId: "78de4fc2-ea93-49ac-a52f-b1ce22c0dded",
        settlementCurrency: "CUP",
        conversionRate: 700,
      }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "insufficient_account_balance",
      availableUsd: 500,
    });
    expect(query.mock.calls.every(([sql]) => !String(sql).includes("INSERT INTO finance_debt_movements"))).toBe(true);
  });

  it("requires finance metadata for new wires", async () => {
    const POST = await loadPostHandler();
    const response = await POST(new Request("http://localhost/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120",
        movementType: "wire",
        amount: 10,
      }),
    }));
    expect(response.status).toBe(400);
  });

  it("blocks a wire when the global rate has not been configured", async () => {
    const { query } = createClient([
      [],
      [{ id: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120" }],
      [{ usdCupRate: null }],
      [],
    ]);
    const POST = await loadPostHandler();
    const response = await POST(new Request("http://localhost/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120",
        movementType: "wire",
        amount: 100,
        counterpartyId: "78de4fc2-ea93-49ac-a52f-b1ce22c0dded",
        settlementCurrency: "CUP",
        conversionRate: 700,
      }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "global_rate_required" });
    expect(query.mock.calls.every(([sql]) => !String(sql).includes("INSERT INTO account_outflow_movements"))).toBe(true);
  });
});
