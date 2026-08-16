import { z } from "zod";
import { getPool } from "@/lib/db";
import type { Transaction } from "@/lib/types";
import { isValidTransactionCursor, loadTransactionFeed } from "@/lib/transaction-feed";

export const runtime = "nodejs";

const OptionalStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}, z.string().trim().optional());

const IngestTransactionSchema = z
  .object({
    emailId: OptionalStringSchema,
    email_id: OptionalStringSchema,
    bankName: z.string().trim().min(1),
    accountName: z.string().trim().min(1).optional(),
    emailAccount: z.string().trim().email().optional(),
    senderName: z.string().trim().min(1).optional().nullable(),
    amount: z
      .union([z.number(), z.string().trim()])
      .transform((v) => (typeof v === "string" ? Number(v) : v)),
    currency: z.string().trim().min(1).default("USD"),
    confirmationCode: z.string().trim().min(1),
    occurredAt: z.string().datetime({ offset: true }).optional().nullable(),
    postedAt: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.accountName && !data.emailAccount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountName"],
        message: "accountName is required",
      });
    }
  })
  .transform((data) => ({
    ...data,
    emailId: data.emailId ?? data.email_id ?? null,
    accountName: data.accountName ?? data.emailAccount!,
  }));

function isAuthorized(request: Request) {
  const expected = process.env.N8N_INGEST_API_KEY;
  if (!expected) return false;

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    return token === expected;
  }

  const apiKey = request.headers.get("x-api-key");
  if (apiKey) return apiKey.trim() === expected;

  return false;
}

async function getOrCreateBankId(
  client: {
    query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
  },
  bankName: string,
) {
  const existing = await client.query(
    "SELECT id FROM banks WHERE name = $1 LIMIT 1",
    [bankName],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id as string;

  try {
    const inserted = await client.query(
      "INSERT INTO banks (name) VALUES ($1) RETURNING id",
      [bankName],
    );
    if (inserted.rows[0]?.id) return inserted.rows[0].id as string;
  } catch {}

  const fallback = await client.query(
    "SELECT id FROM banks WHERE name = $1 LIMIT 1",
    [bankName],
  );
  return fallback.rows[0]?.id ?? null;
}

async function getOrCreateGmailAccountId(
  client: {
    query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
  },
  accountName: string,
) {
  const existing = await client.query(
    "SELECT id FROM gmail_accounts WHERE account_name = $1 LIMIT 1",
    [accountName],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id as string;

  try {
    const inserted = await client.query(
      "INSERT INTO gmail_accounts (account_name) VALUES ($1) RETURNING id",
      [accountName],
    );
    if (inserted.rows[0]?.id) return inserted.rows[0].id as string;
  } catch {}

  const fallback = await client.query(
    "SELECT id FROM gmail_accounts WHERE account_name = $1 LIMIT 1",
    [accountName],
  );
  return fallback.rows[0]?.id ?? null;
}

const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().trim().optional(),
  bank: z.string().trim().optional(), account: z.string().trim().optional(),
  search: z.string().trim().optional(), sender: z.string().trim().optional(), code: z.string().trim().optional(),
  amount: z.coerce.number().finite().optional(), remesero: z.string().trim().optional(),
  from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(),
});

export async function GET(request: Request) {
  const client = await getPool().connect();
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("view") === "page") {
      if (url.searchParams.get("status") && url.searchParams.get("status") !== "active") {
        return Response.json({ ok: false, error: "validation_error" }, { status: 400 });
      }
      const parsed = PageQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success || !isValidTransactionCursor(parsed.data?.cursor)) {
        return Response.json({ ok: false, error: "validation_error" }, { status: 400 });
      }
      const feed = await loadTransactionFeed(client, parsed.data);
      return Response.json({ ok: true, ...feed }, { status: 200 });
    }
    const query = `
      SELECT
        t.id,
        b.name as bank,
        g.account_name as "accountName",
        t.actor_name as "senderName",
        t.amount,
        t.confirmation_code as "confirmationCode",
        t.occurred_at as "createdAt",
        rta.remesero_id as "assignedRemeseroId",
        r.nombre as "assignedRemeseroNombre",
        COALESCE(history.history_count, 0) as "assignmentHistoryCount"
      FROM transactions t
      LEFT JOIN banks b ON t.bank_id = b.id
      LEFT JOIN gmail_accounts g ON t.gmail_account_id = g.id
      LEFT JOIN remesero_transaction_assignments rta ON rta.transaction_id = t.id AND rta.unassigned_at IS NULL
      LEFT JOIN remeseros r ON r.id = rta.remesero_id
      LEFT JOIN (
        SELECT transaction_id, COUNT(*)::int AS history_count
        FROM remesero_transaction_assignments GROUP BY transaction_id
      ) history ON history.transaction_id = t.id
      ORDER BY t.occurred_at DESC
    `;

    const result = await client.query(query);

    const transactions: Transaction[] = result.rows.map((row) => {
      const amount = Number(row.amount);
      const confirmationCode = String(row.confirmationCode ?? "");

      const type = confirmationCode.startsWith("TR-")
        ? "transfer"
        : amount < 0
          ? "withdrawal"
          : "deposit";

      return {
        ...row,
        amount,
        createdAt: row.createdAt
          ? new Date(row.createdAt).toISOString()
          : new Date().toISOString(),
        assignmentHistoryCount: Number(row.assignmentHistoryCount ?? 0),
        type,
      };
    });

    return Response.json({ ok: true, transactions }, { status: 200 });
  } finally {
    client.release();
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = IngestTransactionSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!Number.isFinite(parsed.data.amount)) {
    return Response.json(
      {
        ok: false,
        error: "validation_error",
        details: { amount: ["invalid_number"] },
      },
      { status: 400 },
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const bankId = await getOrCreateBankId(client, parsed.data.bankName);
    const gmailAccountId = await getOrCreateGmailAccountId(
      client,
      parsed.data.accountName,
    );

    if (!gmailAccountId) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "gmail_account_not_found" },
        { status: 400 },
      );
    }

    const occurredAt = parsed.data.occurredAt
      ? new Date(parsed.data.occurredAt)
      : null;
    const postedAt = parsed.data.postedAt
      ? new Date(parsed.data.postedAt)
      : null;

    const insert = await client.query(
      `INSERT INTO transactions
        (email_id, bank_id, gmail_account_id, actor_name, amount, currency, confirmation_code, occurred_at, posted_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        parsed.data.emailId,
        bankId,
        gmailAccountId,
        parsed.data.senderName ?? null,
        parsed.data.amount,
        parsed.data.currency,
        parsed.data.confirmationCode,
        occurredAt,
        postedAt,
      ],
    );

    await client.query("COMMIT");

    if (insert.rows[0]?.id) {
      return Response.json(
        { ok: true, inserted: true, id: insert.rows[0].id },
        { status: 200 },
      );
    }

    return Response.json(
      { ok: false, error: "insert_failed" },
      { status: 500 },
    );
  } catch (err: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    if (err?.code === "23505") {
      return Response.json(
        { ok: false, error: "duplicate_transaction" },
        { status: 409 },
      );
    }

    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
