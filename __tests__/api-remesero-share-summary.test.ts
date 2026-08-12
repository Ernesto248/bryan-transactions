import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
vi.mock("@/lib/db", () => ({ getPool: () => ({ connect: connectMock }) }));

async function loadHandler() {
  return (await import("@/app/api/remeseros/[id]/share-summary/route")).GET;
}

function assignment(
  id: string,
  assignedAt: string,
  unassignedAt: string | null,
  amountUsd = 100,
  priceApplied = 510,
) {
  return {
    assignmentId: id,
    transactionId: "t-same",
    amountUsd,
    priceApplied,
    debtAmount: amountUsd * priceApplied,
    assignedAt,
    unassignedAt,
  };
}

function mockClient(results: unknown[][]) {
  const client = { query: vi.fn(), release: vi.fn() };
  for (const rows of results) client.query.mockResolvedValueOnce({ rows });
  connectMock.mockResolvedValue(client);
  return client;
}

describe("GET /api/remeseros/[id]/share-summary", () => {
  beforeEach(() => connectMock.mockReset());

  it("uses the latest valid payment as the start cut", async () => {
    const client = mockClient([
      [{ id: "r-1", nombre: "Osmel", deudaActual: 203000 }],
      [{
        id: "p-1",
        cutType: "PAYMENT",
        amountPaid: 50000,
        balanceAfter: 50000,
        note: null,
        cutAt: "2026-04-13T10:00:00.000Z",
      }],
      [
        assignment("a-1", "2026-04-13T12:00:00.000Z", null, 100),
        assignment("a-2", "2026-04-13T13:00:00.000Z", null, 200),
      ],
    ]);

    const res = await (await loadHandler())(
      new Request("http://localhost/api/remeseros/r-1/share-summary"),
      { params: Promise.resolve({ id: "r-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.summary.inicioDebt).toBe(50000);
    expect(json.summary.totalTiradoCup).toBe(153000);
    expect(json.summary.finalDebt).toBe(203000);
    expect(json.summary.netOperationCount).toBe(2);
    expect(json.summary.groups[0].amountsUsd).toEqual([100, 200]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("nets repeated assignment and unassignment cycles to zero", async () => {
    mockClient([
      [{ id: "r-2", nombre: "Jesus", deudaActual: 0 }],
      [],
      Array.from({ length: 13 }, (_, index) =>
        assignment(
          `a-${index}`,
          `2026-05-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
          `2026-05-${String(index + 1).padStart(2, "0")}T11:00:00.000Z`,
        ),
      ),
    ]);

    const res = await (await loadHandler())(
      new Request("http://localhost/api/remeseros/r-2/share-summary"),
      { params: Promise.resolve({ id: "r-2" }) },
    );
    const json = await res.json();

    expect(json.summary.inicioDebt).toBe(0);
    expect(json.summary.netOperationCount).toBe(0);
    expect(json.summary.movementCount).toBe(26);
    expect(json.summary.totalTiradoUsd).toBe(0);
    expect(json.summary.totalTiradoCup).toBe(0);
    expect(json.summary.finalDebt).toBe(0);
    expect(json.summary.netGroups[0].txCount).toBe(0);
  });

  it("subtracts an assignment created before the cut and removed inside it", async () => {
    mockClient([
      [{ id: "r-3", nombre: "Ernesto", deudaActual: -1000 }],
      [{
        id: "p-3",
        cutType: "PAYMENT",
        amountPaid: 1000,
        balanceAfter: 50000,
        note: null,
        cutAt: "2026-05-10T10:00:00.000Z",
      }],
      [assignment("a-old", "2026-05-09T10:00:00.000Z", "2026-05-11T10:00:00.000Z")],
    ]);

    const res = await (await loadHandler())(
      new Request("http://localhost/api/remeseros/r-3/share-summary"),
      { params: Promise.resolve({ id: "r-3" }) },
    );
    const json = await res.json();

    expect(json.summary.netOperationCount).toBe(-1);
    expect(json.summary.totalTiradoUsd).toBe(-100);
    expect(json.summary.totalTiradoCup).toBe(-51000);
    expect(json.summary.finalDebt).toBe(-1000);
    expect(json.summary.groups).toEqual([]);
    expect(json.summary.removedGroups[0].totalCup).toBe(51000);
  });

  it("uses a manual adjustment as the latest auditable cut", async () => {
    mockClient([
      [{ id: "r-4", nombre: "Jesus", deudaActual: 112000 }],
      [{
        id: "adj-1",
        cutType: "MANUAL",
        amountPaid: null,
        balanceAfter: 10000,
        note: "Saldo confirmado",
        cutAt: "2026-06-01T10:00:00.000Z",
      }],
      [assignment("a-1", "2026-06-02T10:00:00.000Z", null, 150, 680)],
    ]);

    const res = await (await loadHandler())(
      new Request("http://localhost/api/remeseros/r-4/share-summary"),
      { params: Promise.resolve({ id: "r-4" }) },
    );
    const json = await res.json();

    expect(json.summary.cutType).toBe("MANUAL");
    expect(json.summary.hasManualCut).toBe(true);
    expect(json.summary.hasPaymentCut).toBe(false);
    expect(json.summary.inicioDebt).toBe(10000);
    expect(json.summary.totalTiradoCup).toBe(102000);
    expect(json.summary.finalDebt).toBe(112000);
  });
});
