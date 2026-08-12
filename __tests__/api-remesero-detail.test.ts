import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
vi.mock("@/lib/db", () => ({ getPool: () => ({ connect: connectMock }) }));

async function loadHandler() {
  return (await import("@/app/api/remeseros/[id]/detail/route")).GET;
}

function baseRemesero() {
  return {
    id: "r-1",
    nombre: "Osmel",
    precioActual: 510,
    deudaActual: 50000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

function assignment(id: string, assignedAt: string, unassignedAt: string | null) {
  return {
    assignmentId: id,
    transactionId: "t-1",
    senderName: "Juan",
    bank: "BOA",
    accountName: "Main",
    confirmationCode: id,
    transactionAmount: 100,
    amountUsd: 100,
    priceApplied: 510,
    debtAmount: 51000,
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

describe("GET /api/remeseros/[id]/detail", () => {
  beforeEach(() => connectMock.mockReset());

  it("keeps repeated history visible while reporting its net effect", async () => {
    mockClient([
      [baseRemesero()],
      [],
      [],
      [
        assignment("a-1", "2026-06-01T10:00:00.000Z", "2026-06-01T11:00:00.000Z"),
        assignment("a-2", "2026-06-01T12:00:00.000Z", "2026-06-01T13:00:00.000Z"),
      ],
    ]);

    const res = await (await loadHandler())(
      new Request("http://localhost/api/remeseros/r-1/detail"),
      { params: Promise.resolve({ id: "r-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.detail.assignments).toHaveLength(2);
    expect(json.detail.assignments[0].netOperations).toBe(0);
    expect(json.detail.summary.txCount).toBe(0);
    expect(json.detail.summary.movementCount).toBe(4);
    expect(json.detail.summary.totalUsd).toBe(0);
    expect(json.detail.summary.totalCup).toBe(0);
  });

  it("builds the current range from a manual adjustment and includes pre-cut removals", async () => {
    mockClient([
      [baseRemesero()],
      [],
      [{
        id: "adj-1",
        remeseroId: "r-1",
        debtBefore: 0,
        debtAfter: 10000,
        note: "Inicio",
        adjustedAt: "2026-06-01T10:00:00.000Z",
      }],
      [assignment("a-old", "2026-05-31T10:00:00.000Z", "2026-06-02T10:00:00.000Z")],
    ]);

    const res = await (await loadHandler())(
      new Request("http://localhost/api/remeseros/r-1/detail"),
      { params: Promise.resolve({ id: "r-1" }) },
    );
    const json = await res.json();

    expect(json.detail.rangeOptions[0].cutType).toBe("MANUAL");
    expect(json.detail.selectedRange.inicioDebt).toBe(10000);
    expect(json.detail.summary.txCount).toBe(-1);
    expect(json.detail.summary.totalCup).toBe(-51000);
    expect(json.detail.assignments[0].unassignedInRange).toBe(true);
  });

  it("supports the historical range before the first cut", async () => {
    const client = mockClient([
      [baseRemesero()],
      [],
      [{
        id: "adj-1",
        remeseroId: "r-1",
        debtBefore: 0,
        debtAfter: 10000,
        note: null,
        adjustedAt: "2026-06-01T10:00:00.000Z",
      }],
      [assignment("a-old", "2026-05-31T10:00:00.000Z", null)],
    ]);

    const res = await (await loadHandler())(
      new Request("http://localhost/api/remeseros/r-1/detail?from=&to=2026-06-01T10:00:00.000Z"),
      { params: Promise.resolve({ id: "r-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.detail.selectedRange.from).toBeNull();
    expect(json.detail.selectedRange.to).toBe("2026-06-01T10:00:00.000Z");
    expect(json.detail.selectedRange.inicioDebt).toBe(0);
    expect(client.query.mock.calls[3][1]).toEqual([
      "r-1",
      null,
      new Date("2026-06-01T10:00:00.000Z"),
    ]);
  });

  it("returns 400 for an invalid range", async () => {
    const res = await (await loadHandler())(
      new Request("http://localhost/api/remeseros/r-1/detail?from=2026-04-13T10:00:00.000Z&to=2026-04-13T10:00:00.000Z"),
      { params: Promise.resolve({ id: "r-1" }) },
    );
    expect(res.status).toBe(400);
  });
});
