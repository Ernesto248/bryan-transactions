import { z } from "zod";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

const UpdateCounterpartySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.archived !== undefined, "at least one field is required");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = UpdateCounterpartySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT id FROM finance_counterparties WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!currentResult.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json({ ok: false, error: "counterparty_not_found" }, { status: 404 });
    }

    if (parsed.data.archived === true) {
      const balanceResult = await client.query(
        `SELECT
          COALESCE(SUM(CASE WHEN currency = 'USD' THEN
             COALESCE(signed_delta,
               CASE WHEN movement_type IN ('RECEIVABLE', 'PAID') THEN amount ELSE -amount END)
           ELSE 0 END), 0) as "balanceUsd",
          COALESCE(SUM(CASE WHEN currency = 'CUP' THEN
             COALESCE(signed_delta,
               CASE WHEN movement_type IN ('RECEIVABLE', 'PAID') THEN amount ELSE -amount END)
           ELSE 0 END), 0) as "balanceCup"
         FROM finance_debt_movements
         WHERE counterparty_id = $1 AND reverted_at IS NULL`,
        [id],
      );
      if (
        Number(balanceResult.rows[0]?.balanceUsd ?? 0) !== 0 ||
        Number(balanceResult.rows[0]?.balanceCup ?? 0) !== 0
      ) {
        await client.query("ROLLBACK");
        return Response.json({ ok: false, error: "counterparty_has_balance" }, { status: 409 });
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.name !== undefined) {
      values.push(parsed.data.name);
      updates.push(`name = $${values.length}`);
    }
    if (parsed.data.archived !== undefined) {
      updates.push(`archived_at = ${parsed.data.archived ? "now()" : "NULL"}`);
    }
    values.push(id);
    const updated = await client.query(
      `UPDATE finance_counterparties
       SET ${updates.join(", ")}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING id, name, archived_at as "archivedAt", updated_at as "updatedAt"`,
      values,
    );
    await client.query("COMMIT");
    return Response.json({ ok: true, counterparty: updated.rows[0] });
  } catch (error: any) {
    try { await client.query("ROLLBACK"); } catch {}
    if (error?.code === "23505") {
      return Response.json({ ok: false, error: "duplicate_counterparty_name" }, { status: 409 });
    }
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT id, name FROM finance_counterparties WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!currentResult.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json({ ok: false, error: "counterparty_not_found" }, { status: 404 });
    }

    const linkedResult = await client.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM account_outflow_movements
           WHERE counterparty_id = $1
         ) OR EXISTS (
           SELECT 1 FROM finance_debt_movements
           WHERE counterparty_id = $1
             AND (cash_movement_id IS NOT NULL OR source_type IS NOT NULL)
         ) AS "hasLinkedOperations"`,
      [id],
    );
    if (linkedResult.rows[0]?.hasLinkedOperations === true) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "counterparty_has_linked_operations" },
        { status: 409 },
      );
    }

    await client.query(
      `DELETE FROM finance_debt_movements WHERE counterparty_id = $1`,
      [id],
    );
    await client.query(
      `DELETE FROM finance_counterparties WHERE id = $1`,
      [id],
    );
    await client.query("COMMIT");

    return Response.json({
      ok: true,
      deletedCounterparty: {
        id: String(currentResult.rows[0].id),
        name: String(currentResult.rows[0].name),
      },
    });
  } catch {
    try { await client.query("ROLLBACK"); } catch {}
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
