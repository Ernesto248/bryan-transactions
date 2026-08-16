import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();

vi.mock("@/lib/db", () => ({
  getPool: () => ({
    connect: connectMock,
  }),
}));

describe("GET /api/transactions code filter", () => {
  beforeEach(() => {
    connectMock.mockReset();
  });

  it("combines a literal, case-insensitive code fragment with the other filters", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ transaction_rows: [] }],
      }),
      release: vi.fn(),
    };
    connectMock.mockResolvedValue(client);

    const { GET } = await import("@/app/api/transactions/route");
    const response = await GET(new Request(
      "http://localhost/api/transactions?view=page&code=Ab%25_C&sender=Juan",
    ));

    expect(response.status).toBe(200);
    const [sql, values] = client.query.mock.calls[0];
    expect(String(sql)).toContain(
      "STRPOS(LOWER(COALESCE(t.confirmation_code, '')), LOWER(",
    );
    expect(String(sql)).toContain("COALESCE(t.actor_name, '') ILIKE");
    expect(values).toContain("Ab%_C");
    expect(values).toContain("%Juan%");
    expect(values).not.toContain("%Ab%_C%");
  });
});

