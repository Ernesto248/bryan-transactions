
import { z } from "zod";
import { getPool } from "@/lib/db";
import { appendCashMovement, reverseCashMovement } from "@/lib/finance-ledger";
import type { RemeseroPayment } from "@/lib/types";

export const runtime = "nodejs";

const CreatePaymentSchema = z.object({
  amountPaid: z
    .union([z.number(), z.string().trim()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v > 0, "amountPaid must be > 0"),
  note: z.string().trim().max(500).optional(),
  paidAt: z.string().datetime({ offset: true }).optional(),
});

const RevertPaymentSchema = z.object({
  paymentId: z.string().trim().uuid(),
  reason: z.string().trim().max(500).optional(),
});

function idFromParams(params: { id?: string }) {
  return String(params.id ?? "").trim();
}
function mapPaymentRow(row: any): RemeseroPayment {
  return {
    id: String(row.id),
    remeseroId: String(row.remeseroId),
    amountPaid: Number(row.amountPaid ?? 0),
    debtBeforePayment:
      row.debtBeforePayment === null || row.debtBeforePayment === undefined
        ? null
        : Number(row.debtBeforePayment),
    debtAfterPayment:
      row.debtAfterPayment === null || row.debtAfterPayment === undefined
        ? null
        : Number(row.debtAfterPayment),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    paidAt: new Date(row.paidAt).toISOString(),
    revertedAt:
      row.revertedAt === null || row.revertedAt === undefined
        ? null
        : new Date(row.revertedAt).toISOString(),
    revertedReason:
      row.revertedReason === null || row.revertedReason === undefined
        ? null
        : String(row.revertedReason),
    cashMovementId: row.cashMovementId == null ? null : String(row.cashMovementId),
    cashCupBefore: row.cashCupBefore == null ? null : Number(row.cashCupBefore),
    cashCupAfter: row.cashCupAfter == null ? null : Number(row.cashCupAfter),
  };
}
function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    return z.object({ paidAt: z.string().datetime(), id: z.string().uuid() })
      .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return undefined;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const id = idFromParams(resolvedParams);

  if (!id) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const paginated = url.searchParams.get("view") === "page";
  const parsedLimit = z.coerce.number().int().min(1).max(100).safeParse(
    url.searchParams.get("limit") ?? 20,
  );
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  if ((paginated && !parsedLimit.success) || cursor === undefined) {
    return Response.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const client = await getPool().connect();

  try {
    const remesero = await client.query(
      `
      SELECT id
      FROM remeseros
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
      `,
      [id],
    );

    if (!remesero.rows[0]?.id) {
      return Response.json(
        { ok: false, error: "remesero_not_found" },
        { status: 404 },
      );
    }

    const values: unknown[] = [id];
    let cursorWhere = "";
    if (paginated && cursor) {
      values.push(cursor.paidAt, cursor.id);
      cursorWhere = "AND (payment.paid_at, payment.id) < ($2::timestamptz, $3::uuid)";
    }
    const limit = parsedLimit.success ? parsedLimit.data : 20;
    const result = await client.query(
      `
      SELECT
        payment.id,
        payment.remesero_id as "remeseroId",
        payment.amount_paid as "amountPaid",
        payment.deuda_antes_pago as "debtBeforePayment",
        payment.deuda_despues_pago as "debtAfterPayment",
        payment.note,
        payment.paid_at as "paidAt",
        payment.reverted_at as "revertedAt",
        payment.reverted_reason as "revertedReason",
        payment.cash_movement_id as "cashMovementId",
        cash.balance_before as "cashCupBefore",
        cash.balance_after as "cashCupAfter"
      FROM remesero_payments payment
      LEFT JOIN finance_cash_movements cash ON cash.id = payment.cash_movement_id
      WHERE payment.remesero_id = $1
      ${cursorWhere}
      ORDER BY payment.paid_at DESC, payment.id DESC
      ${paginated ? `LIMIT ${limit + 1}` : ""}
      `,
      values,
    );

    const hasMore = paginated && result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const payments: RemeseroPayment[] = rows.map(mapPaymentRow);
    if (paginated) {
      const last = rows.at(-1);
      const nextCursor = hasMore && last
        ? Buffer.from(JSON.stringify({
            paidAt: new Date(last.paidAt).toISOString(),
            id: String(last.id),
          })).toString("base64url")
        : null;
      return Response.json({ ok: true, payments, pageInfo: { hasMore, nextCursor } }, { status: 200 });
    }
    return Response.json({ ok: true, payments }, { status: 200 });
  } finally {
    client.release();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const id = idFromParams(resolvedParams);

  if (!id) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = CreatePaymentSchema.safeParse(payload);
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
      SELECT id, deuda_actual as "deudaActual"
      FROM remeseros
      WHERE id = $1 AND deleted_at IS NULL
      FOR UPDATE
      LIMIT 1
      `,
      [id],
    );

    if (!remesero.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "remesero_not_found" },
        { status: 404 },
      );
    }

    const debtBeforePayment = Number(remesero.rows[0].deudaActual ?? 0);
    const debtAfterPayment = debtBeforePayment - parsed.data.amountPaid;

    const paidAt = parsed.data.paidAt
      ? new Date(parsed.data.paidAt)
      : new Date();

    const inserted = await client.query(
      `
      INSERT INTO remesero_payments
        (remesero_id, amount_paid, deuda_antes_pago, deuda_despues_pago, note, paid_at)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        remesero_id as "remeseroId",
        amount_paid as "amountPaid",
        deuda_antes_pago as "debtBeforePayment",
        deuda_despues_pago as "debtAfterPayment",
        note,
        paid_at as "paidAt",
        reverted_at as "revertedAt",
        reverted_reason as "revertedReason",
        cash_movement_id as "cashMovementId"
      `,
      [
        id,
        parsed.data.amountPaid,
        debtBeforePayment,
        debtAfterPayment,
        parsed.data.note ?? null,
        paidAt,
      ],
    );

    const paymentRow = inserted.rows[0];

    const cashMovement = await appendCashMovement(client, {
      currency: "CUP",
      signedAmount: -parsed.data.amountPaid,
      operationType: "REMESERO_PAYMENT",
      operationId: String(paymentRow.id),
      note: parsed.data.note ?? `Pago a remesero ${id}`,
      occurredAt: paidAt,
    });
    await client.query(
      `UPDATE remesero_payments SET cash_movement_id = $1 WHERE id = $2`,
      [cashMovement.id, paymentRow.id],
    );

    await client.query(
      `
      UPDATE remeseros
      SET deuda_actual = $1, updated_at = now()
      WHERE id = $2
      `,
      [debtAfterPayment, id],
    );

    await client.query("COMMIT");

    return Response.json({
      ok: true,
      payment: mapPaymentRow({
        ...paymentRow,
        cashMovementId: cashMovement.id,
        cashCupBefore: cashMovement.balanceBefore,
        cashCupAfter: cashMovement.balanceAfter,
      }),
    }, { status: 201 });
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {}

    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const id = idFromParams(resolvedParams);

  if (!id) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = RevertPaymentSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const currentResult = await client.query(
      `
      SELECT
        id,
        remesero_id as "remeseroId",
        amount_paid as "amountPaid",
        deuda_antes_pago as "debtBeforePayment",
        deuda_despues_pago as "debtAfterPayment",
        note,
        paid_at as "paidAt",
        reverted_at as "revertedAt",
        reverted_reason as "revertedReason",
        cash_movement_id as "cashMovementId"
      FROM remesero_payments
      WHERE id = $1 AND remesero_id = $2 AND reverted_at IS NULL
      FOR UPDATE
      `,
      [parsed.data.paymentId, id],
    );

    const current = currentResult.rows[0];
    if (!current?.id) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "payment_not_found_or_already_reverted" },
        { status: 404 },
      );
    }

    if (current.cashMovementId) {
      const reversal = await reverseCashMovement(client, {
        cashMovementId: String(current.cashMovementId),
        reason: parsed.data.reason ?? "Reversión de pago a remesero",
      });
      if (!reversal) {
        await client.query("ROLLBACK");
        return Response.json({ ok: false, error: "cash_movement_already_reverted" }, { status: 409 });
      }
    }

    const updated = await client.query(
      `UPDATE remesero_payments
       SET reverted_at = now(), reverted_reason = $3
       WHERE id = $1 AND remesero_id = $2
       RETURNING id, remesero_id as "remeseroId", amount_paid as "amountPaid",
                 deuda_antes_pago as "debtBeforePayment",
                 deuda_despues_pago as "debtAfterPayment", note,
                 paid_at as "paidAt", reverted_at as "revertedAt",
                 reverted_reason as "revertedReason",
                 cash_movement_id as "cashMovementId"`,
      [parsed.data.paymentId, id, parsed.data.reason ?? null],
    );

    await client.query(
      `
      UPDATE remeseros
      SET deuda_actual = deuda_actual + $1, updated_at = now()
      WHERE id = $2
      `,
      [Number(current.amountPaid ?? 0), id],
    );

    await client.query("COMMIT");

    return Response.json(
      { ok: true, payment: mapPaymentRow(updated.rows[0]) },
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
