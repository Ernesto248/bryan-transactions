import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: connectMock }),
  withRetry: async <T,>(operation: () => Promise<T>) => operation(),
}));

async function loadHandler() {
  return (await import("@/app/api/remeseros/[id]/route")).PATCH;
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/remeseros/r-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/remeseros/[id]", () => {
  beforeEach(() => connectMock.mockReset());

  it("sets the balance and records an auditable manual cut atomically", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "r-1", deudaActual: 500 }] })
      .mockResolvedValueOnce({ rows: [{ id: "r-1" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "adj-1",
          remeseroId: "r-1",
          debtBefore: 500,
          debtAfter: -1250.5,
          note: "Saldo confirmado",
          adjustedAt: "2026-06-01T10:00:00.000Z",
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValue(client);

    const response = await (await loadHandler())(
      makeRequest({ deudaActual: -1250.5, deudaActualNote: "Saldo confirmado" }),
      { params: Promise.resolve({ id: "r-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.adjustment.debtBefore).toBe(500);
    expect(json.adjustment.debtAfter).toBe(-1250.5);
    expect(client.query.mock.calls[0][0]).toBe("BEGIN");
    expect(client.query.mock.calls[1][0]).toContain("FOR UPDATE");
    expect(client.query.mock.calls[2][0]).toContain("deuda_actual = $1");
    expect(client.query.mock.calls[3][0]).toContain("remesero_debt_adjustments");
    expect(client.query.mock.calls[4][0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("does not create an adjustment when only the price changes", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "r-1", deudaActual: 500 }] })
      .mockResolvedValueOnce({ rows: [{ id: "r-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValue(client);

    const response = await (await loadHandler())(makeRequest({ precioActual: 680 }), {
      params: Promise.resolve({ id: "r-1" }),
    });
    expect(response.status).toBe(200);
    expect(client.query).toHaveBeenCalledTimes(4);
  });

  it("rejects requests without editable fields", async () => {
    const response = await (await loadHandler())(makeRequest({}), {
      params: Promise.resolve({ id: "r-1" }),
    });
    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rejects an empty debt value", async () => {
    const response = await (await loadHandler())(makeRequest({ deudaActual: "" }), {
      params: Promise.resolve({ id: "r-1" }),
    });
    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });
});
