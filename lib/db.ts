import { Pool } from "@neondatabase/serverless"

let pool: Pool | null = null

export function getPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set")
  }

  if (!pool) {
    pool = new Pool({ connectionString })
  }

  return pool
}

export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
};

export function isTransientDbError(err: unknown): boolean {
  if (!err) return false;

  const e = err as { code?: unknown; name?: unknown; type?: unknown; message?: unknown };

  if (e.code && typeof e.code === "string") {
    return false;
  }

  if (e.name === "ErrorEvent" || e.type === "error") {
    return true;
  }

  if (typeof e.message === "string" && /websocket|connection (lost|reset|closed)/i.test(e.message)) {
    return true;
  }

  return false;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 50;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!isTransientDbError(err) || attempt === maxRetries) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
