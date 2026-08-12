import { beforeEach, describe, expect, it, vi } from "vitest";

type MockClient = {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

const connectMock = vi.fn();

vi.mock("@/lib/db", () => {
  return {
    getPool: () => ({
      connect: connectMock,
    }),
  };
});

async function loadHandler() {
  const mod = await import("@/app/api/banks/route");
  return mod.GET;
}

describe("GET /api/banks", () => {
  beforeEach(() => {
    connectMock.mockReset();
  });

  it("returns banks ordered by name", async () => {
    const GET = await loadHandler();

    const client: MockClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            { id: "b-chase", name: "Chase" },
            { id: "b-region", name: "Region" },
          ],
        }),
      release: vi.fn(),
    };
    connectMock.mockResolvedValue(client);

    const req = new Request("http://localhost/api/banks");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.banks).toEqual([
      { id: "b-chase", name: "Chase" },
      { id: "b-region", name: "Region" },
    ]);
  });

  it("returns empty list when there are no banks", async () => {
    const GET = await loadHandler();

    const client: MockClient = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    connectMock.mockResolvedValue(client);

    const req = new Request("http://localhost/api/banks");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.banks).toEqual([]);
  });
});
