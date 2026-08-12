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
  const mod = await import("@/app/api/transactions/manual/route");
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/transactions/manual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/transactions/manual", () => {
  beforeEach(() => {
    connectMock.mockReset();
  });

  it("returns 400 when senderName is missing", async () => {
    const POST = await loadHandler();
    const res = await POST(
      makeRequest({ amount: 100, bankId: "b-1", gmailAccountId: "g-1" }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("returns 400 when amount is missing", async () => {
    const POST = await loadHandler();
    const res = await POST(
      makeRequest({
        senderName: "John",
        bankId: "b-1",
        gmailAccountId: "g-1",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is zero or negative", async () => {
    const POST = await loadHandler();
    const zero = await POST(
      makeRequest({
        senderName: "John",
        amount: 0,
        bankId: "b-1",
        gmailAccountId: "g-1",
      }),
    );
    expect(zero.status).toBe(400);

    const negative = await POST(
      makeRequest({
        senderName: "John",
        amount: -50,
        bankId: "b-1",
        gmailAccountId: "g-1",
      }),
    );
    expect(negative.status).toBe(400);
  });

  it("returns 400 when bankId is missing", async () => {
    const POST = await loadHandler();
    const res = await POST(
      makeRequest({ senderName: "John", amount: 100, gmailAccountId: "g-1" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when gmailAccountId is missing", async () => {
    const POST = await loadHandler();
    const res = await POST(
      makeRequest({ senderName: "John", amount: 100, bankId: "b-1" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when bank does not exist", async () => {
    const POST = await loadHandler();

    const client: MockClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT bank
        .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
      release: vi.fn(),
    };
    connectMock.mockResolvedValue(client);

    const res = await POST(
      makeRequest({
        senderName: "John",
        amount: 100,
        bankId: "11111111-1111-1111-1111-111111111111",
        gmailAccountId: "22222222-2222-2222-2222-222222222222",
      }),
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("bank_not_found");
  });

  it("returns 404 when gmail_account does not exist", async () => {
    const POST = await loadHandler();

    const client: MockClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "b-1" }] }) // SELECT bank
        .mockResolvedValueOnce({ rows: [] }) // SELECT gmail_account
        .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
      release: vi.fn(),
    };
    connectMock.mockResolvedValue(client);

    const res = await POST(
      makeRequest({
        senderName: "John",
        amount: 100,
        bankId: "11111111-1111-1111-1111-111111111111",
        gmailAccountId: "22222222-2222-2222-2222-222222222222",
      }),
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("gmail_account_not_found");
  });

  it("creates transaction without assignment and returns 200", async () => {
    const POST = await loadHandler();

    const client: MockClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "b-1" }] }) // SELECT bank
        .mockResolvedValueOnce({ rows: [{ id: "g-1" }] }) // SELECT gmail_account
        .mockResolvedValueOnce({ rows: [{ id: "txn-1" }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: vi.fn(),
    };
    connectMock.mockResolvedValue(client);

    const res = await POST(
      makeRequest({
        senderName: "John Doe",
        amount: 250,
        bankId: "11111111-1111-1111-1111-111111111111",
        gmailAccountId: "22222222-2222-2222-2222-222222222222",
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.transaction.id).toBe("txn-1");
    expect(json.assignment).toBeUndefined();
  });

  it("creates transaction and assigns to remesero with correct debt math", async () => {
    const POST = await loadHandler();

    const client: MockClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "b-1" }] }) // SELECT bank
        .mockResolvedValueOnce({ rows: [{ id: "g-1" }] }) // SELECT gmail_account
        .mockResolvedValueOnce({
          rows: [
            {
              id: "r-1",
              nombre: "Osmel",
              precio_actual: "510",
              deleted_at: null,
            },
          ],
        }) // SELECT remesero
        .mockResolvedValueOnce({ rows: [{ id: "txn-1" }] }) // INSERT transaction
        .mockResolvedValueOnce({
          rows: [
            { id: "asg-1", assignedAt: "2026-06-06T12:00:00.000Z" },
          ],
        }) // INSERT assignment
        .mockResolvedValueOnce({ rows: [] }) // UPDATE remesero deuda
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: vi.fn(),
    };
    connectMock.mockResolvedValue(client);

    const res = await POST(
      makeRequest({
        senderName: "John Doe",
        amount: 200,
        bankId: "11111111-1111-1111-1111-111111111111",
        gmailAccountId: "22222222-2222-2222-2222-222222222222",
        remeseroId: "33333333-3333-3333-3333-333333333333",
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.assignment).toBeDefined();
    expect(json.assignment.debtAmount).toBe(200 * 510);
    expect(json.assignment.priceApplied).toBe(510);
    expect(json.assignment.amountUsd).toBe(200);
  });

  it("returns 404 when remesero does not exist", async () => {
    const POST = await loadHandler();

    const client: MockClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "b-1" }] }) // SELECT bank
        .mockResolvedValueOnce({ rows: [{ id: "g-1" }] }) // SELECT gmail_account
        .mockResolvedValueOnce({ rows: [] }) // SELECT remesero (empty)
        .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
      release: vi.fn(),
    };
    connectMock.mockResolvedValue(client);

    const res = await POST(
      makeRequest({
        senderName: "John Doe",
        amount: 200,
        bankId: "11111111-1111-1111-1111-111111111111",
        gmailAccountId: "22222222-2222-2222-2222-222222222222",
        remeseroId: "33333333-3333-3333-3333-333333333333",
      }),
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("remesero_not_found");
  });

  it("accepts amount as a numeric string", async () => {
    const POST = await loadHandler();

    const client: MockClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "b-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "g-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "txn-1" }] })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    connectMock.mockResolvedValue(client);

    const res = await POST(
      makeRequest({
        senderName: "John",
        amount: "150",
        bankId: "11111111-1111-1111-1111-111111111111",
        gmailAccountId: "22222222-2222-2222-2222-222222222222",
      }),
    );

    expect(res.status).toBe(200);
  });
});
