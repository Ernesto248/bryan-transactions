import { z } from "zod";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

const CreateManualTransactionSchema = z.object({
  senderName: z.string().trim().min(1, "senderName is required"),
  amount: z
    .union([z.number(), z.string().trim()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v > 0, "amount must be > 0"),
  bankId: z.string().uuid(),
  gmailAccountId: z.string().uuid(),
  remeseroId: z.string().uuid().optional(),
  currency: z.string().trim().min(1).default("USD"),
});

type ManualAssignmentResult = {
  id: string;
  remeseroId: string;
  remeseroNombre: string;
  amountUsd: number;
  priceApplied: number;
  debtAmount: number;
  assignedAt: string;
};

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = CreateManualTransactionSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const bankResult = await client.query(
      "SELECT id FROM banks WHERE id = $1 LIMIT 1",
      [data.bankId],
    );
    if (!bankResult.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "bank_not_found" },
        { status: 404 },
      );
    }

    const gmailResult = await client.query(
      "SELECT id FROM gmail_accounts WHERE id = $1 LIMIT 1",
      [data.gmailAccountId],
    );
    if (!gmailResult.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "gmail_account_not_found" },
        { status: 404 },
      );
    }

    let assignment: ManualAssignmentResult | null = null;

    if (data.remeseroId) {
      const remeseroResult = await client.query(
        `SELECT id, nombre, precio_actual
         FROM remeseros
         WHERE id = $1 AND deleted_at IS NULL
         LIMIT 1`,
        [data.remeseroId],
      );
      const remesero = remeseroResult.rows[0];
      if (!remesero?.id) {
        await client.query("ROLLBACK");
        return Response.json(
          { ok: false, error: "remesero_not_found" },
          { status: 404 },
        );
      }

      const txInsertPlaceholder = await client.query(
        `INSERT INTO transactions
          (email_id, bank_id, gmail_account_id, actor_name, amount, currency, confirmation_code, occurred_at)
        VALUES
          (NULL, $1, $2, $3, $4, $5, NULL, now())
        RETURNING id`,
        [
          data.bankId,
          data.gmailAccountId,
          data.senderName,
          data.amount,
          data.currency,
        ],
      );
      const transactionId: string = txInsertPlaceholder.rows[0].id;

      const amountUsd = Number(data.amount);
      const priceApplied = Number(remesero.precio_actual);
      const debtAmount = amountUsd * priceApplied;

      const insertedAssignment = await client.query(
        `INSERT INTO remesero_transaction_assignments
          (transaction_id, remesero_id, amount_usd, price_applied, debt_amount)
        VALUES
          ($1, $2, $3, $4, $5)
        RETURNING id, assigned_at as "assignedAt"`,
        [transactionId, data.remeseroId, amountUsd, priceApplied, debtAmount],
      );

      await client.query(
        `UPDATE remeseros
         SET deuda_actual = deuda_actual + $1, updated_at = now()
         WHERE id = $2`,
        [debtAmount, data.remeseroId],
      );

      await client.query("COMMIT");

      assignment = {
        id: String(insertedAssignment.rows[0].id),
        remeseroId: String(remesero.id),
        remeseroNombre: String(remesero.nombre),
        amountUsd,
        priceApplied,
        debtAmount,
        assignedAt: new Date(insertedAssignment.rows[0].assignedAt).toISOString(),
      };

      return Response.json(
        { ok: true, transaction: { id: transactionId }, assignment },
        { status: 200 },
      );
    }

    const inserted = await client.query(
      `INSERT INTO transactions
        (email_id, bank_id, gmail_account_id, actor_name, amount, currency, confirmation_code, occurred_at)
      VALUES
        (NULL, $1, $2, $3, $4, $5, NULL, now())
      RETURNING id`,
      [
        data.bankId,
        data.gmailAccountId,
        data.senderName,
        data.amount,
        data.currency,
      ],
    );

    await client.query("COMMIT");

    return Response.json(
      { ok: true, transaction: { id: inserted.rows[0].id } },
      { status: 200 },
    );
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
