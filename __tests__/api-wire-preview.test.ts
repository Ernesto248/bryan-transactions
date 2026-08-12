import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();

vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: connectMock }),
}));

describe("GET /api/accounts/[id]/wire-preview", () => {
  beforeEach(() => connectMock.mockReset());

  it("returns the selected and remaining FIFO valuation", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            accountId: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120",
            accountName: "Cuenta principal",
            incomingAdjustment: 0,
            outgoingAdjustment: 0,
            rowKind: "account",
            eventId: null,
            amount: null,
            eventAt: null,
            priceApplied: null,
          },
          {
            accountId: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120",
            accountName: "Cuenta principal",
            incomingAdjustment: 0,
            outgoingAdjustment: 0,
            rowKind: "transaction",
            eventId: "t-1",
            amount: 1000,
            eventAt: "2026-08-01T10:00:00.000Z",
            priceApplied: 680,
          },
        ],
      }),
      release: vi.fn(),
    };
    connectMock.mockResolvedValue(client);

    const { GET } = await import("@/app/api/accounts/[id]/wire-preview/route");
    const response = await GET(
      new Request("http://localhost/api/accounts/2cfc4038-0f11-4f22-a7dd-cd7ec1597120/wire-preview?amount=250"),
      { params: Promise.resolve({ id: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.preview).toMatchObject({
      canCreate: true,
      requestedUsd: 250,
      selected: { averagePrice: 680, costCup: 170000 },
      remaining: { balanceUsd: 750, averagePrice: 680 },
    });
    expect(client.release).toHaveBeenCalledOnce();
  });
});
