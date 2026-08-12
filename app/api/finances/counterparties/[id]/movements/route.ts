
import { z } from "zod";
import { getPool } from "@/lib/db";
import {
  ACTIVE_DEBT_DELTA_SQL,
  appendCashMovement,
  reverseCashMovement,
  roundMoney,
} from "@/lib/finance-ledger";
import { signedFinanceAmount } from "@/lib/finances";
import type { FinanceMovementType } from "@/lib/types";

export const runtime = "nodejs";

const OptionalStringSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(500).optional(),
);

const CreateMovementSchema = z.object({
  currency: z.enum(["USD", "CUP"]),
  movementType: z.enum([
    "RECEIVABLE",
    "RECEIVED",
    "PAYABLE",
    "PAID",
    "SET_RECEIVABLE",
    "SET_PAYABLE",
  ]),
  amount: z
    .union([z.number(), z.string().trim().min(1)])
    .transform((value) => typeof value === "string" ? Number(value) : value)
    .refine((value) => Number.isFinite(value) && value >= 0, "amount must be >= 0"),
  note: OptionalStringSchema,
  occurredAt: z.string().datetime({ offset: true }).optional(),
}).refine(
  (value) => value.amount > 0 || value.movementType.startsWith("SET_"),
  { path: ["amount"], message: "amount must be > 0" },
);

function legacySignedAmount(type: FinanceMovementType, amount: number) {
  return signedFinanceAmount(type, amount);
}
function decodeMovementCursor(value: string | null) {
  if (!value) return null;
  try {
    return z.object({ occurredAt: z.string().datetime(), id: z.string().uuid() })
      .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return undefined;
  }
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const limitResult = z.coerce.number().int().min(1).max(100).safeParse(
    url.searchParams.get("limit") ?? 20,
  );
  const cursor = decodeMovementCursor(url.searchParams.get("cursor"));
  if (!z.string().uuid().safeParse(id).success || !limitResult.success || cursor === undefined) {
    return Response.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const values: unknown[] = [id];
  let cursorWhere = "";
  if (cursor) {
    values.push(cursor.occurredAt, cursor.id);
    cursorWhere = "AND (m.occurred_at, m.id) < ($2::timestamptz, $3::uuid)";
  }
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT m.id, m.counterparty_id as "counterpartyId", m.currency,
              m.movement_type as "movementType", m.amount, m.note,
              m.signed_delta as "signedDelta", m.balance_before as "balanceBefore",
              m.balance_after as "balanceAfter", m.cash_movement_id as "cashMovementId",
              m.source_type as "sourceType", m.source_id as "sourceId",
              m.occurred_at as "occurredAt", m.reverted_at as "revertedAt",
              m.reverted_reason as "revertedReason"
       FROM finance_debt_movements m
       WHERE m.counterparty_id = $1 ${cursorWhere}
       ORDER BY m.occurred_at DESC, m.id DESC
       LIMIT ${limitResult.data + 1}`,
      values,
    );
    const hasMore = result.rows.length > limitResult.data;
    const rows = hasMore ? result.rows.slice(0, limitResult.data) : result.rows;
    const movements = rows.map((row: any) => {
      const movementType = String(row.movementType) as FinanceMovementType;
      const amount = Number(row.amount ?? 0);
      return {
        id: String(row.id),
        counterpartyId: String(row.counterpartyId),
        currency: row.currency === "CUP" ? "CUP" : "USD",
        movementType,
        amount,
        signedAmount: row.signedDelta == null
          ? signedFinanceAmount(movementType, amount)
          : Number(row.signedDelta),
        note: row.note == null ? null : String(row.note),
        balanceBefore: row.balanceBefore == null ? null : Number(row.balanceBefore),
        balanceAfter: row.balanceAfter == null ? null : Number(row.balanceAfter),
        cashMovementId: row.cashMovementId == null ? null : String(row.cashMovementId),
        sourceType: row.sourceType === "WIRE" ? "WIRE" : null,
        sourceId: row.sourceId == null ? null : String(row.sourceId),
        occurredAt: new Date(row.occurredAt).toISOString(),
        revertedAt: row.revertedAt == null ? null : new Date(row.revertedAt).toISOString(),
        revertedReason: row.revertedReason == null ? null : String(row.revertedReason),
      };
    });
    const last = rows.at(-1);
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({
          occurredAt: new Date(last.occurredAt).toISOString(),
          id: String(last.id),
        })).toString("base64url")
      : null;
    return Response.json({ ok: true, movements, pageInfo: { hasMore, nextCursor } });
  } finally {
    client.release();
  }
}

export async function POST(
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

  const parsed = CreateMovementSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const counterpartyResult = await client.query(
      `SELECT id FROM finance_counterparties
       WHERE id = $1 AND archived_at IS NULL FOR UPDATE`,
      [id],
    );
    if (!counterpartyResult.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json({ ok: false, error: "counterparty_not_found" }, { status: 404 });
    }

    const balanceResult = await client.query(
      `SELECT COALESCE(SUM(${ACTIVE_DEBT_DELTA_SQL}), 0) as balance
       FROM finance_debt_movements
       WHERE counterparty_id = $1 AND currency = $2 AND reverted_at IS NULL`,
      [id, parsed.data.currency],
    );
    const balanceBefore = Number(balanceResult.rows[0]?.balance ?? 0);
    const { movementType, amount } = parsed.data;
    let signedDelta: number;

    if (movementType === "SET_RECEIVABLE") {
      signedDelta = roundMoney(amount - balanceBefore);
    } else if (movementType === "SET_PAYABLE") {
      signedDelta = roundMoney(-amount - balanceBefore);
    } else {
      signedDelta = roundMoney(legacySignedAmount(movementType, amount));
    }
    const balanceAfter = roundMoney(balanceBefore + signedDelta);

    const inserted = await client.query(
      `INSERT INTO finance_debt_movements
         (counterparty_id, currency, movement_type, amount, signed_delta,
          balance_before, balance_after, note, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
       RETURNING id, counterparty_id as "counterpartyId", currency,
                 movement_type as "movementType", amount,
                 signed_delta as "signedDelta",
                 balance_before as "balanceBefore", balance_after as "balanceAfter",
                 note, occurred_at as "occurredAt"`,
      [
        id,
        parsed.data.currency,
        movementType,
        amount,
        signedDelta,
        balanceBefore,
        balanceAfter,
        parsed.data.note ?? null,
        parsed.data.occurredAt ?? null,
      ],
    );
    const row = inserted.rows[0];
    let cashMovement = null;

    if (movementType === "RECEIVED" || movementType === "PAID") {
      cashMovement = await appendCashMovement(client, {
        currency: parsed.data.currency,
        signedAmount: movementType === "RECEIVED" ? amount : -amount,
        operationType: "EXTERNAL_DEBT",
        operationId: String(row.id),
        note: parsed.data.note ?? null,
        occurredAt: parsed.data.occurredAt ?? null,
      });
      await client.query(
        `UPDATE finance_debt_movements SET cash_movement_id = $1 WHERE id = $2`,
        [cashMovement.id, row.id],
      );
    }

    await client.query("COMMIT");
    return Response.json({
      ok: true,
      movement: {
        ...row,
        amount: Number(row.amount),
        signedAmount: Number(row.signedDelta),
        balanceBefore: Number(row.balanceBefore),
        balanceAfter: Number(row.balanceAfter),
        cashMovementId: cashMovement?.id ?? null,
        occurredAt: new Date(row.occurredAt).toISOString(),
        revertedAt: null,
        revertedReason: null,
        sourceType: null,
        sourceId: null,
      },
      cashBalanceAfter: cashMovement ? Number(cashMovement.balanceAfter) : null,
    }, { status: 201 });
  } catch {
    try { await client.query("ROLLBACK"); } catch {}
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(
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
  const parsed = z.object({
    movementId: z.string().uuid(),
    reason: OptionalStringSchema,
  }).safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const movementResult = await client.query(
      `SELECT id, cash_movement_id as "cashMovementId", source_type as "sourceType"
       FROM finance_debt_movements
       WHERE id = $1 AND counterparty_id = $2 AND reverted_at IS NULL
       FOR UPDATE`,
      [parsed.data.movementId, id],
    );
    const movement = movementResult.rows[0];
    if (!movement?.id) {
      await client.query("ROLLBACK");
      return Response.json({ ok: false, error: "movement_not_found_or_reverted" }, { status: 404 });
    }
    if (movement.sourceType === "WIRE") {
      await client.query("ROLLBACK");
      return Response.json({ ok: false, error: "linked_wire_must_be_reverted_from_accounts" }, { status: 409 });
    }

    if (movement.cashMovementId) {
      const reversal = await reverseCashMovement(client, {
        cashMovementId: String(movement.cashMovementId),
        reason: parsed.data.reason ?? "Reversión de deuda externa",
      });
      if (!reversal) {
        await client.query("ROLLBACK");
        return Response.json({ ok: false, error: "cash_movement_already_reverted" }, { status: 409 });
      }
    }

    await client.query(
      `UPDATE finance_debt_movements
       SET reverted_at = now(), reverted_reason = $3, updated_at = now()
       WHERE id = $1 AND counterparty_id = $2`,
      [parsed.data.movementId, id, parsed.data.reason ?? null],
    );
    await client.query("COMMIT");
    return Response.json({ ok: true }, { status: 200 });
  } catch {
    try { await client.query("ROLLBACK"); } catch {}
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
