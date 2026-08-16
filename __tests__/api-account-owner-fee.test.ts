import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
vi.mock("@/lib/db", () => ({ getPool: () => ({ connect: connectMock }) }));

describe("PATCH /api/accounts/[id]", () => {
  beforeEach(() => connectMock.mockReset());

  it("audits and updates the default owner fee, including explicit zero", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ ownerFeePercent: 3 }] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValue({ query, release: vi.fn() });
    const { PATCH } = await import("@/app/api/accounts/[id]/route");
    const response = await PATCH(new Request("http://localhost/api/accounts/2cfc4038-0f11-4f22-a7dd-cd7ec1597120", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ownerFeePercent: 0, note: "Cuenta sin comisión" }) }), { params: Promise.resolve({ id: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ownerFeePercent: 0 });
    const audit = query.mock.calls.find(([sql]) => String(sql).includes("gmail_account_owner_fee_changes"));
    expect(audit?.[1]).toEqual(expect.arrayContaining([3, 0, "Cuenta sin comisión"]));
  });

  it.each([2.5, 100])("accepts a valid decimal or boundary percentage: %s", async (ownerFeePercent) => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ownerFeePercent: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValue({ query, release: vi.fn() });
    const { PATCH } = await import("@/app/api/accounts/[id]/route");
    const response = await PATCH(new Request("http://localhost/api/accounts/2cfc4038-0f11-4f22-a7dd-cd7ec1597120", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerFeePercent }),
    }), { params: Promise.resolve({ id: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ownerFeePercent });
  });

  it.each([-0.01, 100.01])("rejects an out-of-range percentage: %s", async (ownerFeePercent) => {
    const { PATCH } = await import("@/app/api/accounts/[id]/route");
    const response = await PATCH(new Request("http://localhost/api/accounts/2cfc4038-0f11-4f22-a7dd-cd7ec1597120", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerFeePercent }),
    }), { params: Promise.resolve({ id: "2cfc4038-0f11-4f22-a7dd-cd7ec1597120" }) });

    expect(response.status).toBe(400);
  });
});
