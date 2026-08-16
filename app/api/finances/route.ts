
import { getPool } from "@/lib/db";
import {
  calculateCapitalTotal,
  signedFinanceAmount,
} from "@/lib/finances";
import {
  loadZelleInventories,
  summarizeZelleInventories,
} from "@/lib/zelle-inventory";
import type {
  FinanceCounterparty,
  FinanceCashMovement,
  FinanceCurrencyExchange,
  FinanceDebtMovement,
  FinanceExpense,
  FinanceMovementType,
  FinanceOverview,
  FinanceSettingChange,
} from "@/lib/types";

export const runtime = "nodejs";

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
export async function GET(request?: Request) {
  const client = await getPool().connect();

  try {
    const summaryView = request
      ? new URL(request.url).searchParams.get("view") === "summary"
      : false;
    const [coreResult, zelleInventories, counterpartiesResult, movementsResult] = await Promise.all([
      client.query(`
        SELECT
          (SELECT row_to_json(state_row) FROM (
            SELECT cash_usd as "cashUsd", cash_cup as "cashCup",
                   usd_cup_rate as "usdCupRate", updated_at as "updatedAt"
            FROM finance_state WHERE id = 1
          ) state_row) AS state,
          (SELECT row_to_json(remesero_row) FROM (
            SELECT COALESCE(SUM(GREATEST(-deuda_actual, 0)), 0) as "receivableCup",
                   COALESCE(SUM(GREATEST(deuda_actual, 0)), 0) as "payableCup",
                   COALESCE(-SUM(deuda_actual), 0) as "netCup"
            FROM remeseros WHERE deleted_at IS NULL
          ) remesero_row) AS remeseros,
          (SELECT row_to_json(pending_row) FROM (
            SELECT COUNT(*)::int as "count"
            FROM transactions t
            WHERE t.amount > 0
              AND t.currency = 'USD'
              AND NOT EXISTS (
                SELECT 1
                FROM remesero_transaction_assignments assignment
                WHERE assignment.transaction_id = t.id
                  AND assignment.unassigned_at IS NULL
              )
          ) pending_row) AS pending_assignments,
          (SELECT row_to_json(profit_row) FROM (
            SELECT
              COALESCE(SUM(wire_profit_cup) FILTER (WHERE wire_profit_status IN ('EXACT', 'ESTIMATED')), 0) as "lifetimeProfitCup",
              COALESCE(SUM(wire_profit_usd) FILTER (WHERE wire_profit_status IN ('EXACT', 'ESTIMATED')), 0) as "lifetimeProfitUsd",
              COALESCE(SUM(wire_profit_cup) FILTER (WHERE wire_profit_status = 'EXACT'), 0) as "lifetimeExactProfitCup",
              COALESCE(SUM(wire_profit_usd) FILTER (WHERE wire_profit_status = 'EXACT'), 0) as "lifetimeExactProfitUsd",
              COALESCE(SUM(wire_profit_cup) FILTER (WHERE wire_profit_status = 'ESTIMATED'), 0) as "lifetimeEstimatedProfitCup",
              COALESCE(SUM(wire_profit_usd) FILTER (WHERE wire_profit_status = 'ESTIMATED'), 0) as "lifetimeEstimatedProfitUsd",
              COUNT(*) FILTER (WHERE wire_profit_status = 'EXACT') as "lifetimeExactCount",
              COUNT(*) FILTER (WHERE wire_profit_status = 'ESTIMATED') as "lifetimeEstimatedCount",
              COUNT(*) FILTER (WHERE wire_profit_status = 'UNAVAILABLE') as "lifetimePendingCount",
              COALESCE(SUM(wire_owner_fee_cup), 0) as "lifetimeOwnerFeeCup",
              COALESCE(SUM(wire_owner_fee_usd), 0) as "lifetimeOwnerFeeUsd",
              COALESCE(SUM(wire_net_profit_cup), 0) as "lifetimeNetProfitCup",
              COALESCE(SUM(wire_net_profit_usd), 0) as "lifetimeNetProfitUsd",
              COALESCE(SUM(wire_net_profit_cup) FILTER (WHERE wire_profit_status = 'EXACT'), 0) as "lifetimeNetExactProfitCup",
              COALESCE(SUM(wire_net_profit_usd) FILTER (WHERE wire_profit_status = 'EXACT'), 0) as "lifetimeNetExactProfitUsd",
              COALESCE(SUM(wire_net_profit_cup) FILTER (WHERE wire_profit_status = 'ESTIMATED'), 0) as "lifetimeNetEstimatedProfitCup",
              COALESCE(SUM(wire_net_profit_usd) FILTER (WHERE wire_profit_status = 'ESTIMATED'), 0) as "lifetimeNetEstimatedProfitUsd",
              COUNT(*) FILTER (WHERE wire_profit_status = 'EXACT' AND wire_owner_fee_percent IS NOT NULL) as "lifetimeNetExactCount",
              COUNT(*) FILTER (WHERE wire_profit_status = 'ESTIMATED' AND wire_owner_fee_percent IS NOT NULL) as "lifetimeNetEstimatedCount",
              COUNT(*) FILTER (
                WHERE wire_profit_status = 'UNAVAILABLE'
                  OR (wire_profit_status IN ('EXACT', 'ESTIMATED') AND wire_owner_fee_percent IS NULL)
              ) as "lifetimeNetPendingCount",
              COALESCE(SUM(wire_profit_cup) FILTER (
                WHERE wire_profit_status IN ('EXACT', 'ESTIMATED')
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthProfitCup",
              COALESCE(SUM(wire_profit_usd) FILTER (
                WHERE wire_profit_status IN ('EXACT', 'ESTIMATED')
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthProfitUsd",
              COALESCE(SUM(wire_profit_cup) FILTER (
                WHERE wire_profit_status = 'EXACT'
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthExactProfitCup",
              COALESCE(SUM(wire_profit_usd) FILTER (
                WHERE wire_profit_status = 'EXACT'
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthExactProfitUsd",
              COALESCE(SUM(wire_profit_cup) FILTER (
                WHERE wire_profit_status = 'ESTIMATED'
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthEstimatedProfitCup",
              COALESCE(SUM(wire_profit_usd) FILTER (
                WHERE wire_profit_status = 'ESTIMATED'
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthEstimatedProfitUsd",
              COUNT(*) FILTER (
                WHERE wire_profit_status = 'EXACT'
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ) as "monthExactCount",
              COUNT(*) FILTER (
                WHERE wire_profit_status = 'ESTIMATED'
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ) as "monthEstimatedCount",
              COUNT(*) FILTER (
                WHERE wire_profit_status = 'UNAVAILABLE'
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ) as "monthPendingCount",
              COALESCE(SUM(wire_owner_fee_cup) FILTER (
                WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthOwnerFeeCup",
              COALESCE(SUM(wire_owner_fee_usd) FILTER (
                WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthOwnerFeeUsd",
              COALESCE(SUM(wire_net_profit_cup) FILTER (
                WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthNetProfitCup",
              COALESCE(SUM(wire_net_profit_usd) FILTER (
                WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthNetProfitUsd",
              COALESCE(SUM(wire_net_profit_cup) FILTER (
                WHERE wire_profit_status = 'EXACT' AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthNetExactProfitCup",
              COALESCE(SUM(wire_net_profit_usd) FILTER (
                WHERE wire_profit_status = 'EXACT' AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthNetExactProfitUsd",
              COALESCE(SUM(wire_net_profit_cup) FILTER (
                WHERE wire_profit_status = 'ESTIMATED' AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthNetEstimatedProfitCup",
              COALESCE(SUM(wire_net_profit_usd) FILTER (
                WHERE wire_profit_status = 'ESTIMATED' AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ), 0) as "monthNetEstimatedProfitUsd",
              COUNT(*) FILTER (
                WHERE wire_profit_status = 'EXACT' AND wire_owner_fee_percent IS NOT NULL
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ) as "monthNetExactCount",
              COUNT(*) FILTER (
                WHERE wire_profit_status = 'ESTIMATED' AND wire_owner_fee_percent IS NOT NULL
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ) as "monthNetEstimatedCount",
              COUNT(*) FILTER (
                WHERE (wire_profit_status = 'UNAVAILABLE'
                    OR (wire_profit_status IN ('EXACT', 'ESTIMATED') AND wire_owner_fee_percent IS NULL))
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
              ) as "monthNetPendingCount"
            FROM account_outflow_movements
            WHERE reverted_at IS NULL
          ) profit_row) AS wire_profits,
          (SELECT COALESCE(json_agg(row_to_json(change_row)), '[]') FROM (
            SELECT id, field_name as "fieldName", previous_value as "previousValue",
                   new_value as "newValue", note, changed_at as "changedAt"
            FROM finance_state_changes ORDER BY changed_at DESC LIMIT 10
          ) change_row) AS changes,
          (SELECT COALESCE(json_agg(row_to_json(expense_row)), '[]') FROM (
            SELECT id, currency, amount, description,
                   balance_before as "balanceBefore", balance_after as "balanceAfter",
                   occurred_at as "occurredAt"
            FROM finance_expenses ORDER BY occurred_at DESC, created_at DESC LIMIT 10
          ) expense_row) AS expenses,
          (SELECT COALESCE(json_agg(row_to_json(exchange_row)), '[]') FROM (
            SELECT id, direction, source_amount as "sourceAmount", rate,
                   target_amount as "targetAmount", note,
                   occurred_at as "occurredAt", reverted_at as "revertedAt",
                   reverted_reason as "revertedReason"
            FROM finance_currency_exchanges ORDER BY occurred_at DESC, created_at DESC LIMIT 10
          ) exchange_row) AS exchanges,
          CASE WHEN $1::boolean THEN '[]'::json ELSE
            (SELECT COALESCE(json_agg(row_to_json(cash_row)), '[]') FROM (
              SELECT id, currency, signed_amount as "signedAmount",
                     balance_before as "balanceBefore", balance_after as "balanceAfter",
                     operation_type as "operationType", operation_id as "operationId",
                     reversal_of_id as "reversalOfId", note, occurred_at as "occurredAt"
              FROM finance_cash_movements ORDER BY occurred_at DESC, created_at DESC LIMIT 20
            ) cash_row)
          END AS cash_movements
      `, [summaryView]),
      loadZelleInventories(client),
      client.query(`
        SELECT c.id, c.name, c.archived_at as "archivedAt",
               c.created_at as "createdAt", c.updated_at as "updatedAt",
               COALESCE(SUM(CASE WHEN m.currency = 'USD' THEN
                 COALESCE(m.signed_delta, CASE WHEN m.movement_type IN ('RECEIVABLE', 'PAID') THEN m.amount ELSE -m.amount END)
               ELSE 0 END), 0) as "balanceUsd",
               COALESCE(SUM(CASE WHEN m.currency = 'CUP' THEN
                 COALESCE(m.signed_delta, CASE WHEN m.movement_type IN ('RECEIVABLE', 'PAID') THEN m.amount ELSE -m.amount END)
               ELSE 0 END), 0) as "balanceCup"
        FROM finance_counterparties c
        LEFT JOIN finance_debt_movements m ON m.counterparty_id = c.id AND m.reverted_at IS NULL
        WHERE c.archived_at IS NULL GROUP BY c.id ORDER BY c.name
      `),
      summaryView ? Promise.resolve({ rows: [] }) : client.query(`
        WITH ranked AS (
          SELECT m.*, row_number() OVER (
            PARTITION BY m.counterparty_id ORDER BY m.occurred_at DESC, m.created_at DESC
          ) AS row_number
          FROM finance_debt_movements m
          JOIN finance_counterparties c ON c.id = m.counterparty_id
          WHERE c.archived_at IS NULL
        )
        SELECT id, counterparty_id as "counterpartyId", currency,
               movement_type as "movementType", amount, note,
               signed_delta as "signedDelta", balance_before as "balanceBefore",
               balance_after as "balanceAfter", cash_movement_id as "cashMovementId",
               source_type as "sourceType", source_id as "sourceId",
               occurred_at as "occurredAt", reverted_at as "revertedAt",
               reverted_reason as "revertedReason"
        FROM ranked WHERE row_number <= 10 ORDER BY occurred_at DESC, id
      `),
    ]);
    const core = coreResult.rows[0] ?? {};
    const stateResult = { rows: [core.state ?? {}] };
    const remeserosResult = { rows: [core.remeseros ?? {}] };
    const pendingAssignmentsRow = core.pending_assignments ?? {};
    const changesResult = { rows: Array.isArray(core.changes) ? core.changes : [] };
    const expensesResult = { rows: Array.isArray(core.expenses) ? core.expenses : [] };
    const cashMovementsResult = { rows: Array.isArray(core.cash_movements) ? core.cash_movements : [] };
    const exchangesResult = { rows: Array.isArray(core.exchanges) ? core.exchanges : [] };
    const profitRow = core.wire_profits ?? {};
    const mapProfitPeriod = (prefix: "lifetime" | "month") => ({
      profitCup: toNumber(profitRow[`${prefix}ProfitCup`]),
      profitUsd: toNumber(profitRow[`${prefix}ProfitUsd`]),
      exactProfitCup: toNumber(profitRow[`${prefix}ExactProfitCup`]),
      exactProfitUsd: toNumber(profitRow[`${prefix}ExactProfitUsd`]),
      estimatedProfitCup: toNumber(profitRow[`${prefix}EstimatedProfitCup`]),
      estimatedProfitUsd: toNumber(profitRow[`${prefix}EstimatedProfitUsd`]),
      exactCount: toNumber(profitRow[`${prefix}ExactCount`]),
      estimatedCount: toNumber(profitRow[`${prefix}EstimatedCount`]),
      pendingCount: toNumber(profitRow[`${prefix}PendingCount`]),
      ownerFeeCup: toNumber(profitRow[`${prefix}OwnerFeeCup`]),
      ownerFeeUsd: toNumber(profitRow[`${prefix}OwnerFeeUsd`]),
      netProfitCup: toNumber(profitRow[`${prefix}NetProfitCup`]),
      netProfitUsd: toNumber(profitRow[`${prefix}NetProfitUsd`]),
      netExactProfitCup: toNumber(profitRow[`${prefix}NetExactProfitCup`]),
      netExactProfitUsd: toNumber(profitRow[`${prefix}NetExactProfitUsd`]),
      netEstimatedProfitCup: toNumber(profitRow[`${prefix}NetEstimatedProfitCup`]),
      netEstimatedProfitUsd: toNumber(profitRow[`${prefix}NetEstimatedProfitUsd`]),
      netExactCount: toNumber(profitRow[`${prefix}NetExactCount`]),
      netEstimatedCount: toNumber(profitRow[`${prefix}NetEstimatedCount`]),
      netPendingCount: toNumber(profitRow[`${prefix}NetPendingCount`]),
    });

    const state = stateResult.rows[0] ?? {};
    const settings = {
      cashUsd: toNumber(state.cashUsd),
      cashCup: toNumber(state.cashCup),
      usdCupRate: state.usdCupRate == null ? null : toNumber(state.usdCupRate),
      updatedAt: new Date(state.updatedAt).toISOString(),
    };

    const movementsByCounterparty = new Map<string, FinanceDebtMovement[]>();
    for (const row of movementsResult.rows) {
      const movementType = String(row.movementType) as FinanceMovementType;
      const amount = toNumber(row.amount);
      const signedAmount = row.signedDelta == null
        ? signedFinanceAmount(movementType, amount)
        : toNumber(row.signedDelta);
      const movement: FinanceDebtMovement = {
        id: String(row.id),
        counterpartyId: String(row.counterpartyId),
        currency: row.currency === "CUP" ? "CUP" : "USD",
        movementType,
        amount,
        signedAmount,
        note: row.note == null ? null : String(row.note),
        occurredAt: new Date(row.occurredAt).toISOString(),
        revertedAt: row.revertedAt == null ? null : new Date(row.revertedAt).toISOString(),
        revertedReason: row.revertedReason == null ? null : String(row.revertedReason),
        balanceBefore: row.balanceBefore == null ? null : toNumber(row.balanceBefore),
        balanceAfter: row.balanceAfter == null ? null : toNumber(row.balanceAfter),
        cashMovementId: row.cashMovementId == null ? null : String(row.cashMovementId),
        sourceType: row.sourceType === "WIRE" ? "WIRE" : null,
        sourceId: row.sourceId == null ? null : String(row.sourceId),
      };
      const current = movementsByCounterparty.get(movement.counterpartyId) ?? [];
      current.push(movement);
      movementsByCounterparty.set(movement.counterpartyId, current);
    }

    const counterparties: FinanceCounterparty[] = counterpartiesResult.rows.map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      balanceUsd: toNumber(row.balanceUsd),
      balanceCup: toNumber(row.balanceCup),
      archivedAt: row.archivedAt == null ? null : new Date(row.archivedAt).toISOString(),
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      movements: movementsByCounterparty.get(String(row.id)) ?? [],
    }));

    const external = counterparties.reduce(
      (total, counterparty) => {
        total.receivableUsd += Math.max(counterparty.balanceUsd, 0);
        total.payableUsd += Math.max(-counterparty.balanceUsd, 0);
        total.receivableCup += Math.max(counterparty.balanceCup, 0);
        total.payableCup += Math.max(-counterparty.balanceCup, 0);
        return total;
      },
      { receivableUsd: 0, payableUsd: 0, receivableCup: 0, payableCup: 0 },
    );
    const externalNetUsd = external.receivableUsd - external.payableUsd;
    const externalNetCup = external.receivableCup - external.payableCup;
    const remeseroRow = remeserosResult.rows[0] ?? {};
    const remeserosNetCup = toNumber(remeseroRow.netCup);
    const rate = settings.usdCupRate;
    const zelleValuation = summarizeZelleInventories(zelleInventories);
    const zelleUsd = zelleValuation.summary.balanceUsd;
    const pendingAssignments = {
      count: toNumber(pendingAssignmentsRow.count),
      amountUsd: zelleValuation.summary.unpricedUsd,
    };

    const settingChanges: FinanceSettingChange[] = changesResult.rows.map((row: any) => ({
      id: String(row.id),
      fieldName: row.fieldName,
      previousValue: row.previousValue == null ? null : toNumber(row.previousValue),
      newValue: row.newValue == null ? null : toNumber(row.newValue),
      note: row.note == null ? null : String(row.note),
      changedAt: new Date(row.changedAt).toISOString(),
    }));

    const expenses: FinanceExpense[] = expensesResult.rows.map((row: any) => ({
      id: String(row.id),
      currency: row.currency === "CUP" ? "CUP" : "USD",
      amount: toNumber(row.amount),
      description: String(row.description),
      balanceBefore: toNumber(row.balanceBefore),
      balanceAfter: toNumber(row.balanceAfter),
      occurredAt: new Date(row.occurredAt).toISOString(),
    }));

    const cashMovements: FinanceCashMovement[] = cashMovementsResult.rows.map((row: any) => ({
      id: String(row.id),
      currency: row.currency === "CUP" ? "CUP" : "USD",
      signedAmount: toNumber(row.signedAmount),
      balanceBefore: toNumber(row.balanceBefore),
      balanceAfter: toNumber(row.balanceAfter),
      operationType: row.operationType,
      operationId: String(row.operationId),
      reversalOfId: row.reversalOfId == null ? null : String(row.reversalOfId),
      note: row.note == null ? null : String(row.note),
      occurredAt: new Date(row.occurredAt).toISOString(),
    }));

    const exchanges: FinanceCurrencyExchange[] = exchangesResult.rows.map((row: any) => ({
      id: String(row.id),
      direction: row.direction,
      sourceAmount: toNumber(row.sourceAmount),
      rate: toNumber(row.rate),
      targetAmount: toNumber(row.targetAmount),
      note: row.note == null ? null : String(row.note),
      occurredAt: new Date(row.occurredAt).toISOString(),
      revertedAt: row.revertedAt == null ? null : new Date(row.revertedAt).toISOString(),
      revertedReason: row.revertedReason == null ? null : String(row.revertedReason),
    }));

    const overview: FinanceOverview = {
      settings,
      counterparties,
      settingChanges,
      expenses,
      cashMovements,
      exchanges,
      totals: {
        zelleUsd,
        zelleValuation: {
          ...zelleValuation.summary,
          accounts: zelleValuation.accounts,
        },
        pendingAssignments,
        remeseros: {
          receivableCup: toNumber(remeseroRow.receivableCup),
          payableCup: toNumber(remeseroRow.payableCup),
          netCup: remeserosNetCup,
          netUsd: rate ? remeserosNetCup / rate : null,
        },
        external: {
          ...external,
          netUsd: externalNetUsd,
          netCup: externalNetCup,
          netCupUsd: rate ? externalNetCup / rate : null,
        },
        capitalTotalUsd: calculateCapitalTotal({
          cashUsd: settings.cashUsd,
          cashCup: settings.cashCup,
          usdCupRate: rate,
          zelleUsd,
          unpricedZelleUsd: zelleValuation.summary.unpricedUsd,
          remeserosNetCup,
          externalNetUsd,
          externalNetCup,
        }),
        wireProfits: {
          lifetime: mapProfitPeriod("lifetime"),
          currentMonth: mapProfitPeriod("month"),
        },
      },
    };

    return Response.json({ ok: true, overview }, { status: 200 });
  } finally {
    client.release();
  }
}
