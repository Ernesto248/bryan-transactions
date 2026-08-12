import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { ACTIVE_DEBT_DELTA_SQL, roundMoney } from "@/lib/finance-ledger";
import type { AccountBalance, WireFifoSnapshot } from "@/lib/types";
import { loadZelleInventories, previewWire } from "@/lib/zelle-inventory";

export const runtime = "nodejs";

const OptionalStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}, z.string().trim().optional());

const MovementBaseSchema = z.object({
  accountId: z.string().uuid(),
  amount: z
    .union([z.number(), z.string().trim()])
    .transform((value) => (typeof value === "string" ? Number(value) : value))
    .refine(
      (value) => Number.isFinite(value) && value > 0,
      "amount must be > 0",
    )
    .transform(roundMoney),
  note: OptionalStringSchema,
});

const CreateAccountMovementSchema = MovementBaseSchema.extend({
  movementType: z.enum(["wire", "expense"]),
  counterpartyId: z.string().uuid().optional(),
  settlementCurrency: z.enum(["USD", "CUP"]).optional(),
  conversionRate: z.number().finite().positive().optional(),
  feePercent: z.number().finite().min(0).optional(),
}).superRefine((value, context) => {
  if (value.movementType !== "wire") return;
  if (!value.counterpartyId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["counterpartyId"], message: "counterpartyId is required" });
  }
  if (!value.settlementCurrency) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["settlementCurrency"], message: "settlementCurrency is required" });
  }
  if (value.settlementCurrency === "CUP" && value.conversionRate === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["conversionRate"], message: "conversionRate is required" });
  }
  if (value.settlementCurrency === "USD" && value.feePercent === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["feePercent"], message: "feePercent is required" });
  }
});

function mapAccountRow(row: any): AccountBalance {
  return {
    id: String(row.id),
    accountName: String(row.accountName),
    incomingTotal: Number(row.incomingTotal ?? 0),
    outgoingTotal: Number(row.outgoingTotal ?? 0),
    balance: Number(row.balance ?? 0),
    transactionCount: Number(row.transactionCount ?? 0),
    lastTransactionAt: row.lastTransactionAt
      ? new Date(row.lastTransactionAt).toISOString()
      : null,
  };
}

function parseDateParam(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fromParam = parseDateParam(url.searchParams.get("from"));
  const toParam = parseDateParam(url.searchParams.get("to"));

  if (url.searchParams.get("from") && !fromParam) {
    return Response.json({ ok: false, error: "invalid_from" }, { status: 400 });
  }

  if (url.searchParams.get("to") && !toParam) {
    return Response.json({ ok: false, error: "invalid_to" }, { status: 400 });
  }

  const values: unknown[] = [];
  const txFilters: string[] = [];
  const movementFilters: string[] = [];

  if (fromParam) {
    values.push(fromParam);
    const placeholder = `$${values.length}`;
    txFilters.push(`COALESCE(occurred_at, created_at) >= ${placeholder}`);
    movementFilters.push(`created_at >= ${placeholder}`);
  }

  if (toParam) {
    values.push(toParam);
    const placeholder = `$${values.length}`;
    txFilters.push(`COALESCE(occurred_at, created_at) <= ${placeholder}`);
    movementFilters.push(`created_at <= ${placeholder}`);
  }

  const txWhere =
    txFilters.length > 0 ? `WHERE ${txFilters.join(" AND ")}` : "";
  const movementWhere =
    movementFilters.length > 0 ? `AND ${movementFilters.join(" AND ")}` : "";

  const client = await getPool().connect();

  try {
    const result = await client.query(
      `
      SELECT
        g.id,
        g.account_name as "accountName",
        (COALESCE(tx.total_incoming, 0) + COALESCE(g.incoming_adjustment, 0)) as "incomingTotal",
        (COALESCE(m.total_outgoing, 0) + COALESCE(g.outgoing_adjustment, 0)) as "outgoingTotal",
        (
          (COALESCE(tx.total_incoming, 0) + COALESCE(g.incoming_adjustment, 0))
          - (COALESCE(m.total_outgoing, 0) + COALESCE(g.outgoing_adjustment, 0))
        ) as "balance",
        COALESCE(tx.transaction_count, 0) as "transactionCount",
        tx.last_transaction_at as "lastTransactionAt"
      FROM gmail_accounts g
      LEFT JOIN (
        SELECT
          gmail_account_id,
          SUM(amount) as total_incoming,
          COUNT(*) as transaction_count,
          MAX(COALESCE(occurred_at, created_at)) as last_transaction_at
        FROM transactions
        ${txWhere}
        GROUP BY gmail_account_id
      ) tx ON tx.gmail_account_id = g.id
      LEFT JOIN (
        SELECT
          gmail_account_id,
          SUM(amount) as total_outgoing
        FROM account_outflow_movements
        WHERE reverted_at IS NULL
        ${movementWhere}
        GROUP BY gmail_account_id
      ) m ON m.gmail_account_id = g.id
      ORDER BY g.account_name ASC
      `,
      values,
    );

    const accounts: AccountBalance[] = result.rows.map(mapAccountRow);
    return Response.json({ ok: true, accounts }, { status: 200 });
  } finally {
    client.release();
  }
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = CreateAccountMovementSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const movementId = randomUUID();
    let debtAmount: number | null = null;
    let financeDebtMovementId: string | null = null;
    let fifoValuation: WireFifoSnapshot | null = null;

    const accountResult = await client.query(
      `SELECT id FROM gmail_accounts WHERE id = $1 FOR UPDATE`,
      [parsed.data.accountId],
    );
    if (!accountResult.rows[0]?.id) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "account_not_found" },
        { status: 404 },
      );
    }

    if (parsed.data.movementType === "wire") {
      const inventories = await loadZelleInventories(client, parsed.data.accountId);
      const inventory = inventories[0];
      const valuationPreview = inventory
        ? previewWire(inventory, parsed.data.amount)
        : null;

      if (!valuationPreview?.canCreate) {
        await client.query("ROLLBACK");
        return Response.json(
          {
            ok: false,
            error: "insufficient_account_balance",
            availableUsd: valuationPreview?.availableUsd ?? 0,
          },
          { status: 409 },
        );
      }

      fifoValuation = {
        method: "FIFO_PER_ACCOUNT",
        valuedAt: new Date().toISOString(),
        balanceBeforeUsd: valuationPreview.availableUsd,
        balanceAfterUsd: valuationPreview.remaining.balanceUsd,
        selected: valuationPreview.selected,
        remaining: valuationPreview.remaining,
      };

      const counterpartyResult = await client.query(
        `SELECT id FROM finance_counterparties
         WHERE id = $1 AND archived_at IS NULL FOR UPDATE`,
        [parsed.data.counterpartyId],
      );
      if (!counterpartyResult.rows[0]?.id) {
        await client.query("ROLLBACK");
        return Response.json({ ok: false, error: "counterparty_not_found" }, { status: 404 });
      }

      debtAmount = roundMoney(
        parsed.data.settlementCurrency === "CUP"
          ? parsed.data.amount * (parsed.data.conversionRate ?? 0)
          : parsed.data.amount * (1 + (parsed.data.feePercent ?? 0) / 100),
      );
    }

    if (parsed.data.movementType === "wire" && debtAmount !== null) {
      const balanceResult = await client.query(
        `SELECT COALESCE(SUM(${ACTIVE_DEBT_DELTA_SQL}), 0) as balance
         FROM finance_debt_movements
         WHERE counterparty_id = $1 AND currency = $2 AND reverted_at IS NULL`,
        [parsed.data.counterpartyId, parsed.data.settlementCurrency],
      );
      const balanceBefore = Number(balanceResult.rows[0]?.balance ?? 0);
      const balanceAfter = roundMoney(balanceBefore + debtAmount);
      const debtResult = await client.query(
        `INSERT INTO finance_debt_movements
           (counterparty_id, currency, movement_type, amount, signed_delta,
            balance_before, balance_after, note, source_type, source_id)
         VALUES ($1, $2, 'RECEIVABLE', $3, $3, $4, $5, $6, 'WIRE', $7)
         RETURNING id`,
        [
          parsed.data.counterpartyId,
          parsed.data.settlementCurrency,
          debtAmount,
          balanceBefore,
          balanceAfter,
          parsed.data.note ?? "Wire",
          movementId,
        ],
      );
      financeDebtMovementId = String(debtResult.rows[0].id);
    }

    await client.query(
      `INSERT INTO account_outflow_movements
         (id, gmail_account_id, movement_type, amount, note, counterparty_id,
          settlement_currency, conversion_rate, fee_percent, debt_amount,
          finance_debt_movement_id, fifo_method, fifo_valued_at,
          fifo_balance_before_usd, fifo_balance_after_usd,
          fifo_priced_usd, fifo_unpriced_usd, fifo_cost_cup,
          fifo_average_price, fifo_remaining_priced_usd,
          fifo_remaining_unpriced_usd, fifo_remaining_cost_cup,
          fifo_remaining_average_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [
        movementId,
        parsed.data.accountId,
        parsed.data.movementType,
        parsed.data.amount,
        parsed.data.note ?? null,
        parsed.data.movementType === "wire" ? parsed.data.counterpartyId : null,
        parsed.data.movementType === "wire" ? parsed.data.settlementCurrency : null,
        parsed.data.movementType === "wire" && parsed.data.settlementCurrency === "CUP"
          ? parsed.data.conversionRate : null,
        parsed.data.movementType === "wire" && parsed.data.settlementCurrency === "USD"
          ? parsed.data.feePercent : null,
        debtAmount,
        financeDebtMovementId,
        fifoValuation?.method ?? null,
        fifoValuation?.valuedAt ?? null,
        fifoValuation?.balanceBeforeUsd ?? null,
        fifoValuation?.balanceAfterUsd ?? null,
        fifoValuation?.selected.pricedUsd ?? null,
        fifoValuation?.selected.unpricedUsd ?? null,
        fifoValuation?.selected.costCup ?? null,
        fifoValuation?.selected.averagePrice ?? null,
        fifoValuation?.remaining.pricedUsd ?? null,
        fifoValuation?.remaining.unpricedUsd ?? null,
        fifoValuation?.remaining.costCup ?? null,
        fifoValuation?.remaining.averagePrice ?? null,
      ],
    );

    await client.query("COMMIT");

    return Response.json(
      { ok: true, movementId, financeDebtMovementId, debtAmount, fifoValuation },
      { status: 201 },
    );
  } catch (err: any) {
    try { await client.query("ROLLBACK"); } catch {}
    if (err?.code === "23503") {
      return Response.json(
        { ok: false, error: "account_not_found" },
        { status: 404 },
      );
    }

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

  const parsed = z
    .object({
      movementId: z.string().uuid(),
      reason: OptionalStringSchema,
    })
    .safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const accountLookup = await client.query(
      `SELECT gmail_account_id as "accountId"
       FROM account_outflow_movements
       WHERE id = $1 AND reverted_at IS NULL`,
      [parsed.data.movementId],
    );
    if (!accountLookup.rows[0]?.accountId) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "movement_not_found_or_already_reverted" },
        { status: 404 },
      );
    }

    await client.query(
      `SELECT id FROM gmail_accounts WHERE id = $1 FOR UPDATE`,
      [accountLookup.rows[0].accountId],
    );

    const currentResult = await client.query(
      `SELECT id, finance_debt_movement_id as "financeDebtMovementId"
       FROM account_outflow_movements
       WHERE id = $1 AND reverted_at IS NULL FOR UPDATE`,
      [parsed.data.movementId],
    );
    const current = currentResult.rows[0];

    if (!current?.id) {
      await client.query("ROLLBACK");
      return Response.json(
        { ok: false, error: "movement_not_found_or_already_reverted" },
        { status: 404 },
      );
    }

    if (current.financeDebtMovementId) {
      const debtResult = await client.query(
        `UPDATE finance_debt_movements
         SET reverted_at = now(), reverted_reason = $2, updated_at = now()
         WHERE id = $1 AND reverted_at IS NULL AND source_type = 'WIRE'
         RETURNING id`,
        [current.financeDebtMovementId, parsed.data.reason ?? "Wire revertido"],
      );
      if (!debtResult.rows[0]?.id) {
        await client.query("ROLLBACK");
        return Response.json({ ok: false, error: "linked_debt_already_reverted" }, { status: 409 });
      }
    }

    await client.query(
      `UPDATE account_outflow_movements
       SET reverted_at = now(), reverted_reason = COALESCE($2, reverted_reason), updated_at = now()
       WHERE id = $1`,
      [parsed.data.movementId, parsed.data.reason ?? null],
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
