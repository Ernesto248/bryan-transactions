import { beforeEach, describe, expect, it, vi } from "vitest";

const withRetry = async () => {
  const mod = await import("@/lib/db");
  return mod.withRetry;
};

const isTransientDbError = async () => {
  const mod = await import("@/lib/db");
  return mod.isTransientDbError;
};

class FakeErrorEvent extends Error {
  type = "error";
  defaultPrevented = false;
  cancelable = false;
  timeStamp = Date.now();
  constructor(message?: string) {
    super(message ?? "WebSocket error");
    this.name = "ErrorEvent";
  }
}

describe("withRetry", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("returns the result on first success without retrying", async () => {
    const fn = withRetry;
    const op = vi.fn().mockResolvedValueOnce("ok");
    const result = await (await fn())(op, { maxRetries: 2 });
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error and succeeds", async () => {
    const fn = withRetry;
    const op = vi
      .fn()
      .mockRejectedValueOnce(new FakeErrorEvent())
      .mockResolvedValueOnce("ok");
    const result = await (await fn())(op, { maxRetries: 2 });
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("retries up to maxRetries on transient errors then throws", async () => {
    const fn = withRetry;
    const op = vi
      .fn()
      .mockRejectedValue(new FakeErrorEvent("ws broken"));
    await expect(
      (await fn())(op, { maxRetries: 2 }),
    ).rejects.toThrow("ws broken");
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("does not retry on non-transient errors", async () => {
    const fn = withRetry;
    const pgError = Object.assign(new Error("unique violation"), {
      code: "23505",
    });
    const op = vi.fn().mockRejectedValue(pgError);
    await expect((await fn())(op, { maxRetries: 2 })).rejects.toBe(pgError);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("does not retry on validation errors (Postgres 22xxx)", async () => {
    const fn = withRetry;
    const pgError = Object.assign(new Error("invalid input"), {
      code: "22P02",
    });
    const op = vi.fn().mockRejectedValue(pgError);
    await expect((await fn())(op, { maxRetries: 2 })).rejects.toBe(pgError);
    expect(op).toHaveBeenCalledTimes(1);
  });
});

describe("isTransientDbError", () => {
  it("returns true for ErrorEvent instances", async () => {
    const fn = await isTransientDbError();
    expect(fn(new FakeErrorEvent())).toBe(true);
  });

  it("returns true for errors with no code (driver-level errors)", async () => {
    const fn = await isTransientDbError();
    expect(fn(new Error("connection lost"))).toBe(true);
  });

  it("returns true for errors mentioning websocket in the message", async () => {
    const fn = await isTransientDbError();
    expect(fn(new Error("WebSocket connection broken"))).toBe(true);
  });

  it("returns false for Postgres unique violation (23505)", async () => {
    const fn = await isTransientDbError();
    const err = Object.assign(new Error("dup"), { code: "23505" });
    expect(fn(err)).toBe(false);
  });

  it("returns false for Postgres data errors (22xxx)", async () => {
    const fn = await isTransientDbError();
    const err = Object.assign(new Error("invalid"), { code: "22P02" });
    expect(fn(err)).toBe(false);
  });

  it("returns false for null/undefined", async () => {
    const fn = await isTransientDbError();
    expect(fn(null)).toBe(false);
    expect(fn(undefined)).toBe(false);
  });
});
