import { z } from "zod";
import { getPool } from "@/lib/db";
import { appendCashMovement, reverseCashMovement, roundMoney } from "@/lib/finance-ledger";

export const runtime = "nodejs";

const PositiveNumberSchema = z
  .union([z.number(), z.string().trim().min(1)])
  .transform((value) => typeof value === "string" ? Number(value) : value)
  .refine((value) => Number.isFinite(value) && value > 0, "must be > 0");

const OptionalStringSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(500).optional(),
);

const CreateExchangeSchema = z.object({
  direction: z.enum(["USD_TO_CUP", "CUP_TO_USD"]),
  sourceAmount: PositiveNumberSchema,
  rate: PositiveNumberSchema,
  note: OptionalStringSchema,
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = CreateExchangeSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const targetAmount = roundMoney(
      parsed.data.direction === "USD_TO_CUP"
        ? parsed.data.sourceAmount * parsed.data.rate
        : parsed.data.sourceAmount / parsed.data.rate,
    );
    const exchangeResult = await client.query(
      `INSERT INTO finance_currency_exchanges
         (direction, source_amount, rate, target_amount, note, occurred_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
       RETURNING id, direction, source_amount as "sourceAmount", rate,
                 target_amount as "targetAmount", note, occurred_at as "occurredAt",
                 reverted_at as "revertedAt", reverted_reason as "revertedReason"`,
      [
        parsed.data.direction,
        parsed.data.sourceAmount,
        parsed.data.rate,
        targetAmount,
        parsed.data.note ?? null,
        parsed.data.occurredAt ?? null,
      ],
    );
    const exchange = exchangeResult.rows[0];
    const sourceCurrency = parsed.data.direction === "USD_TO_CUP" ? "USD" : "CUP";
    const targetCurrency = parsed.data.direction === "USD_TO_CUP" ? "CUP" : "USD";

    await appendCashMovement(client, {
      currency: sourceCurrency,
      signedAmount: -parsed.data.sourceAmount,
      operationType: "CURRENCY_EXCHANGE",
      operationId: String(exchange.id),
      note: parsed.data.note ?? null,
      occurredAt: parsed.data.occurredAt ?? null,
    });
    await appendCashMovement(client, {
      currency: targetCurrency,
      signedAmount: targetAmount,
      operationType: "CURRENCY_EXCHANGE",
      operationId: String(exchange.id),
      note: parsed.data.note ?? null,
      occurredAt: parsed.data.occurredAt ?? null,
    });
    await client.query("COMMIT");

    return Response.json({
      ok: true,
      exchange: {
        ...exchange,
        sourceAmount: Number(exchange.sourceAmount),
        rate: Number(exchange.rate),
        targetAmount: Number(exchange.targetAmount),
        occurredAt: new Date(exchange.occurredAt).toISOString(),
      },
    }, { status: 201 });
  } catch {
    try { await client.query("ROLLBACK"); } catch {}
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
  const parsed = z.object({
    exchangeId: z.string().uuid(),
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
    const exchangeResult = await client.query(
      `SELECT id FROM finance_currency_exchanges
       WHERE id = $1 AND reverted_at IS NULL FOR UPDATE`,
      [parsed.data.exchangeId],
    );
    if (!exchangeResult.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json({ ok: false, error: "exchange_not_found_or_reverted" }, { status: 404 });
    }

    const cashResult = await client.query(
      `SELECT id FROM finance_cash_movements
       WHERE operation_type = 'CURRENCY_EXCHANGE' AND operation_id = $1
         AND reversal_of_id IS NULL
       ORDER BY currency`,
      [parsed.data.exchangeId],
    );
    if (cashResult.rows.length !== 2) {
      await client.query("ROLLBACK");
      return Response.json({ ok: false, error: "exchange_cash_movements_missing" }, { status: 409 });
    }
    for (const row of cashResult.rows) {
      const reversed = await reverseCashMovement(client, {
        cashMovementId: String(row.id),
        reason: parsed.data.reason ?? "Cambio de moneda revertido",
      });
      if (!reversed) {
        await client.query("ROLLBACK");
        return Response.json({ ok: false, error: "exchange_already_reverted" }, { status: 409 });
      }
    }
    await client.query(
      `UPDATE finance_currency_exchanges
       SET reverted_at = now(), reverted_reason = $2, updated_at = now()
       WHERE id = $1`,
      [parsed.data.exchangeId, parsed.data.reason ?? null],
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
