import { z } from "zod";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

const AssignSchema = z.object({
  transactionId: z.string().trim().uuid(),
  remeseroId: z.string().trim().uuid(),
});

const UnassignSchema = z.object({
  transactionId: z.string().trim().uuid(),
});

type AssignmentWebhookEvent = {
  event: "assigned" | "unassigned";
  accountName: string | null;
  emailId: string | null;
};

async function notifyAssignmentWebhook(payload: AssignmentWebhookEvent) {
  const webhookUrl =
    payload.event === "assigned"
      ? process.env.N8N_STAR_WEBHOOK_URL
      : process.env.N8N_UNSTAR_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountName: payload.accountName,
        emailId: payload.emailId,
      }),
    });
  } catch (error) {
    console.error("n8n webhook notification failed", error);
  }
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = AssignSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const remesero = await client.query(
      `
      SELECT id, nombre, precio_actual
      FROM remeseros
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
      `,
      [parsed.data.remeseroId],
    );

    if (!remesero.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "remesero_not_found" },
        { status: 404 },
      );
    }

    const transaction = await client.query(
      `
      SELECT t.id, t.amount, t.email_id, g.account_name as account_name
      FROM transactions t
      LEFT JOIN gmail_accounts g ON g.id = t.gmail_account_id
      WHERE t.id = $1
      LIMIT 1
      `,
      [parsed.data.transactionId],
    );

    if (!transaction.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "transaction_not_found" },
        { status: 404 },
      );
    }

    const amountUsd = Math.abs(Number(transaction.rows[0].amount ?? 0));
    const emailId =
      transaction.rows[0].email_id === null ||
      transaction.rows[0].email_id === undefined
        ? null
        : String(transaction.rows[0].email_id);
    const accountName =
      transaction.rows[0].account_name === null ||
      transaction.rows[0].account_name === undefined
        ? null
        : String(transaction.rows[0].account_name);
    const priceApplied = Number(remesero.rows[0].precio_actual ?? 0);
    const debtAmount = amountUsd * priceApplied;

    const previousAssignment = await client.query(
      `
      UPDATE remesero_transaction_assignments
      SET unassigned_at = now(), updated_at = now()
      WHERE transaction_id = $1 AND unassigned_at IS NULL
      RETURNING remesero_id as "remeseroId", debt_amount as "debtAmount"
      `,
      [parsed.data.transactionId],
    );

    const previous = previousAssignment.rows[0];
    if (previous?.remeseroId) {
      await client.query(
        `
        UPDATE remeseros
        SET deuda_actual = deuda_actual - $1, updated_at = now()
        WHERE id = $2
        `,
        [Number(previous.debtAmount ?? 0), String(previous.remeseroId)],
      );
    }

    const assigned = await client.query(
      `
      INSERT INTO remesero_transaction_assignments
        (transaction_id, remesero_id, amount_usd, price_applied, debt_amount)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING
        id,
        transaction_id as "transactionId",
        remesero_id as "remeseroId",
        amount_usd as "amountUsd",
        price_applied as "priceApplied",
        debt_amount as "debtAmount",
        assigned_at as "assignedAt"
      `,
      [
        parsed.data.transactionId,
        parsed.data.remeseroId,
        amountUsd,
        priceApplied,
        debtAmount,
      ],
    );

    await client.query(
      `
      UPDATE remeseros
      SET deuda_actual = deuda_actual + $1, updated_at = now()
      WHERE id = $2
      `,
      [debtAmount, parsed.data.remeseroId],
    );

    await client.query("COMMIT");

    void notifyAssignmentWebhook({
      event: "assigned",
      accountName,
      emailId,
    });

    return Response.json(
      {
        ok: true,
        assignment: {
          ...assigned.rows[0],
          remeseroNombre: String(remesero.rows[0].nombre),
          amountUsd,
          priceApplied,
          debtAmount,
          assignedAt: new Date(assigned.rows[0].assignedAt).toISOString(),
        },
      },
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

export async function DELETE(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = UnassignSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const transaction = await client.query(
      `
      SELECT t.id, t.email_id, g.account_name as account_name
      FROM transactions t
      LEFT JOIN gmail_accounts g ON g.id = t.gmail_account_id
      WHERE t.id = $1
      LIMIT 1
      `,
      [parsed.data.transactionId],
    );

    if (!transaction.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "transaction_not_found" },
        { status: 404 },
      );
    }

    const emailId =
      transaction.rows[0].email_id === null ||
      transaction.rows[0].email_id === undefined
        ? null
        : String(transaction.rows[0].email_id);
    const accountName =
      transaction.rows[0].account_name === null ||
      transaction.rows[0].account_name === undefined
        ? null
        : String(transaction.rows[0].account_name);

    const updated = await client.query(
      `
      UPDATE remesero_transaction_assignments
      SET unassigned_at = now(), updated_at = now()
      WHERE transaction_id = $1 AND unassigned_at IS NULL
      RETURNING id, remesero_id as "remeseroId", debt_amount as "debtAmount"
      `,
      [parsed.data.transactionId],
    );

    if (!updated.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "active_assignment_not_found" },
        { status: 404 },
      );
    }

    await client.query(
      `
      UPDATE remeseros
      SET deuda_actual = deuda_actual - $1, updated_at = now()
      WHERE id = $2
      `,
      [
        Number(updated.rows[0].debtAmount ?? 0),
        String(updated.rows[0].remeseroId),
      ],
    );

    await client.query("COMMIT");

    void notifyAssignmentWebhook({
      event: "unassigned",
      accountName,
      emailId,
    });

    return Response.json({ ok: true }, { status: 200 });
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {}

    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
