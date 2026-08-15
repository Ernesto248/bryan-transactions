
import { z } from "zod";
import { getPool } from "@/lib/db";
import type { AccountMovement } from "@/lib/types";

export const runtime = "nodejs";

function mapMovementRow(row: any): AccountMovement {
  const fifoPricedUsd = Number(row.fifoPricedUsd ?? 0);
  const fifoUnpricedUsd = Number(row.fifoUnpricedUsd ?? 0);
  const fifoRemainingPricedUsd = Number(row.fifoRemainingPricedUsd ?? 0);
  const fifoRemainingUnpricedUsd = Number(row.fifoRemainingUnpricedUsd ?? 0);
  const fifoSelectedUsd = fifoPricedUsd + fifoUnpricedUsd;
  const fifoRemainingUsd = fifoRemainingPricedUsd + fifoRemainingUnpricedUsd;
  const amount = Number(row.amount ?? 0);
  const wireFeeUsd = row.wireFeeUsd == null ? 0 : Number(row.wireFeeUsd);
  const profitStatus = row.wireProfitStatus === "EXACT"
    || row.wireProfitStatus === "ESTIMATED"
    || row.wireProfitStatus === "UNAVAILABLE"
    ? row.wireProfitStatus
    : null;

  return {
    id: String(row.id),
    accountId: String(row.accountId),
    movementType: row.movementType === "expense" ? "expense" : "wire",
    amount,
    note: row.note ? String(row.note) : null,
    createdAt: new Date(row.createdAt).toISOString(),
    revertedAt: row.revertedAt ? new Date(row.revertedAt).toISOString() : null,
    revertedReason: row.revertedReason ? String(row.revertedReason) : null,
    counterpartyId: row.counterpartyId == null ? null : String(row.counterpartyId),
    counterpartyName: row.counterpartyName == null ? null : String(row.counterpartyName),
    settlementCurrency: row.settlementCurrency === "CUP" ? "CUP" : row.settlementCurrency === "USD" ? "USD" : null,
    conversionRate: row.conversionRate == null ? null : Number(row.conversionRate),
    feePercent: row.feePercent == null ? null : Number(row.feePercent),
    wireFeeUsd: row.wireFeeUsd == null ? null : wireFeeUsd,
    totalDebitUsd: row.movementType === "wire" ? amount + wireFeeUsd : amount,
    debtAmount: row.debtAmount == null ? null : Number(row.debtAmount),
    financeDebtMovementId: row.financeDebtMovementId == null ? null : String(row.financeDebtMovementId),
    fifoValuation: row.fifoMethod === "FIFO_PER_ACCOUNT" && row.fifoValuedAt
      ? {
          method: "FIFO_PER_ACCOUNT",
          valuedAt: new Date(row.fifoValuedAt).toISOString(),
          balanceBeforeUsd: Number(row.fifoBalanceBeforeUsd ?? 0),
          balanceAfterUsd: Number(row.fifoBalanceAfterUsd ?? 0),
          principalUsd: amount,
          wireFeeUsd,
          totalDebitUsd: amount + wireFeeUsd,
          profit: profitStatus
            ? {
                status: profitStatus,
                globalRate: Number(row.wireProfitGlobalRate),
                settlementAmount: Number(row.debtAmount ?? 0),
                fifoCostCup: row.wireProfitFifoCostCup == null ? null : Number(row.wireProfitFifoCostCup),
                profitCup: row.wireProfitCup == null ? null : Number(row.wireProfitCup),
                profitUsd: row.wireProfitUsd == null ? null : Number(row.wireProfitUsd),
              }
            : null,
          selected: {
            balanceUsd: fifoSelectedUsd,
            inventoryUsd: fifoSelectedUsd,
            deficitUsd: 0,
            pricedUsd: fifoPricedUsd,
            unpricedUsd: fifoUnpricedUsd,
            costCup: Number(row.fifoCostCup ?? 0),
            averagePrice: row.fifoAveragePrice == null ? null : Number(row.fifoAveragePrice),
            coveragePercent: fifoSelectedUsd > 0 ? (fifoPricedUsd / fifoSelectedUsd) * 100 : 0,
          },
          remaining: {
            balanceUsd: fifoRemainingUsd,
            inventoryUsd: fifoRemainingUsd,
            deficitUsd: 0,
            pricedUsd: fifoRemainingPricedUsd,
            unpricedUsd: fifoRemainingUnpricedUsd,
            costCup: Number(row.fifoRemainingCostCup ?? 0),
            averagePrice: row.fifoRemainingAveragePrice == null ? null : Number(row.fifoRemainingAveragePrice),
            coveragePercent: fifoRemainingUsd > 0 ? (fifoRemainingPricedUsd / fifoRemainingUsd) * 100 : 0,
          },
        }
      : null,
  };
}
type Params = {
  params: Promise<{ id: string }>;
};

function parseDateParam(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    const parsed = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() })
      .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed;
  } catch {
    return undefined;
  }
}

export async function GET(request: Request, { params }: Params) {
  const parsedParams = z
    .object({ id: z.string().uuid() })
    .safeParse(await params);

  if (!parsedParams.success) {
    return Response.json(
      { ok: false, error: "invalid_account_id" },
      { status: 400 },
    );
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
  const fromParam = parseDateParam(url.searchParams.get("from"));
  const toParam = parseDateParam(url.searchParams.get("to"));

  if (url.searchParams.get("from") && !fromParam) {
    return Response.json({ ok: false, error: "invalid_from" }, { status: 400 });
  }

  if (url.searchParams.get("to") && !toParam) {
    return Response.json({ ok: false, error: "invalid_to" }, { status: 400 });
  }

  const values: unknown[] = [parsedParams.data.id];
  const rangeFilters: string[] = [];

  if (fromParam) {
    values.push(fromParam);
    rangeFilters.push(`m.created_at >= $${values.length}`);
  }

  if (toParam) {
    values.push(toParam);
    rangeFilters.push(`m.created_at <= $${values.length}`);
  }

  if (paginated && cursor) {
    values.push(cursor.createdAt, cursor.id);
    rangeFilters.push(`(m.created_at, m.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
  }

  const rangeWhere =
    rangeFilters.length > 0 ? ` AND ${rangeFilters.join(" AND ")}` : "";

  const client = await getPool().connect();

  try {
    const result = await client.query(
      `
      SELECT
        m.id,
        m.gmail_account_id as "accountId",
        m.movement_type as "movementType",
        m.amount,
        m.note,
        m.created_at as "createdAt",
        m.reverted_at as "revertedAt",
        m.reverted_reason as "revertedReason",
        m.counterparty_id as "counterpartyId",
        counterparty.name as "counterpartyName",
        m.settlement_currency as "settlementCurrency",
        m.conversion_rate as "conversionRate",
        m.fee_percent as "feePercent",
        m.wire_fee_usd as "wireFeeUsd",
        m.debt_amount as "debtAmount",
        m.finance_debt_movement_id as "financeDebtMovementId",
        m.fifo_method as "fifoMethod",
        m.fifo_valued_at as "fifoValuedAt",
        m.fifo_balance_before_usd as "fifoBalanceBeforeUsd",
        m.fifo_balance_after_usd as "fifoBalanceAfterUsd",
        m.fifo_priced_usd as "fifoPricedUsd",
        m.fifo_unpriced_usd as "fifoUnpricedUsd",
        m.fifo_cost_cup as "fifoCostCup",
        m.fifo_average_price as "fifoAveragePrice",
        m.fifo_remaining_priced_usd as "fifoRemainingPricedUsd",
        m.fifo_remaining_unpriced_usd as "fifoRemainingUnpricedUsd",
        m.fifo_remaining_cost_cup as "fifoRemainingCostCup",
        m.fifo_remaining_average_price as "fifoRemainingAveragePrice",
        m.wire_profit_status as "wireProfitStatus",
        m.wire_profit_global_rate as "wireProfitGlobalRate",
        m.wire_profit_fifo_cost_cup as "wireProfitFifoCostCup",
        m.wire_profit_cup as "wireProfitCup",
        m.wire_profit_usd as "wireProfitUsd"
      FROM account_outflow_movements m
      LEFT JOIN finance_counterparties counterparty ON counterparty.id = m.counterparty_id
      WHERE m.gmail_account_id = $1
      ${rangeWhere}
      ORDER BY m.created_at DESC, m.id DESC
      ${paginated ? `LIMIT ${Number(parsedLimit.success ? parsedLimit.data : 20) + 1}` : ""}
      `,
      values,
    );

    const limit = parsedLimit.success ? parsedLimit.data : 20;
    const hasMore = paginated && result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const movements: AccountMovement[] = rows.map(mapMovementRow);

    if (paginated) {
      const last = rows.at(-1);
      const nextCursor = hasMore && last
        ? Buffer.from(JSON.stringify({
            createdAt: new Date(last.createdAt).toISOString(),
            id: String(last.id),
          })).toString("base64url")
        : null;
      return Response.json({
        ok: true,
        movements,
        pageInfo: { hasMore, nextCursor },
      }, { status: 200 });
    }

    return Response.json({ ok: true, movements }, { status: 200 });
  } finally {
    client.release();
  }
}
