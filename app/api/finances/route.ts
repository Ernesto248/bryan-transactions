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

export async function GET() {
  const client = await getPool().connect();

  try {
    const [stateResult, zelleInventories, remeserosResult, counterpartiesResult, movementsResult, changesResult, expensesResult, cashMovementsResult, exchangesResult] =
      await Promise.all([
        client.query(`
          SELECT cash_usd as "cashUsd", cash_cup as "cashCup",
                 usd_cup_rate as "usdCupRate", updated_at as "updatedAt"
          FROM finance_state WHERE id = 1
        `),
        loadZelleInventories(client),
        client.query(`
          SELECT
            COALESCE(SUM(GREATEST(-deuda_actual, 0)), 0) as "receivableCup",
            COALESCE(SUM(GREATEST(deuda_actual, 0)), 0) as "payableCup",
            COALESCE(-SUM(deuda_actual), 0) as "netCup"
          FROM remeseros WHERE deleted_at IS NULL
        `),
        client.query(`
          SELECT c.id, c.name, c.archived_at as "archivedAt",
                 c.created_at as "createdAt", c.updated_at as "updatedAt",
                 COALESCE(SUM(CASE WHEN m.currency = 'USD' THEN
                   COALESCE(m.signed_delta,
                     CASE WHEN m.movement_type IN ('RECEIVABLE', 'PAID') THEN m.amount ELSE -m.amount END)
                 ELSE 0 END), 0) as "balanceUsd",
                 COALESCE(SUM(CASE WHEN m.currency = 'CUP' THEN
                   COALESCE(m.signed_delta,
                     CASE WHEN m.movement_type IN ('RECEIVABLE', 'PAID') THEN m.amount ELSE -m.amount END)
                 ELSE 0 END), 0) as "balanceCup"
          FROM finance_counterparties c
          LEFT JOIN finance_debt_movements m
            ON m.counterparty_id = c.id AND m.reverted_at IS NULL
          WHERE c.archived_at IS NULL
          GROUP BY c.id
          ORDER BY c.name
        `),
        client.query(`
          WITH ranked AS (
            SELECT m.*,
                   row_number() OVER (
                     PARTITION BY m.counterparty_id
                     ORDER BY m.occurred_at DESC, m.created_at DESC
                   ) AS row_number
            FROM finance_debt_movements m
            JOIN finance_counterparties c ON c.id = m.counterparty_id
            WHERE c.archived_at IS NULL
          )
          SELECT id, counterparty_id as "counterpartyId", currency,
                 movement_type as "movementType", amount, note,
                 signed_delta as "signedDelta",
                 balance_before as "balanceBefore", balance_after as "balanceAfter",
                 cash_movement_id as "cashMovementId",
                 source_type as "sourceType", source_id as "sourceId",
                 occurred_at as "occurredAt", reverted_at as "revertedAt",
                 reverted_reason as "revertedReason"
          FROM ranked WHERE row_number <= 10
          ORDER BY occurred_at DESC, id
        `),
        client.query(`
          SELECT id, field_name as "fieldName", previous_value as "previousValue",
                 new_value as "newValue", note, changed_at as "changedAt"
          FROM finance_state_changes
          ORDER BY changed_at DESC LIMIT 10
        `),
        client.query(`
          SELECT id, currency, amount, description,
                 balance_before as "balanceBefore", balance_after as "balanceAfter",
                 occurred_at as "occurredAt"
          FROM finance_expenses
          ORDER BY occurred_at DESC, created_at DESC
          LIMIT 10
        `),
        client.query(`
          SELECT id, currency, signed_amount as "signedAmount",
                 balance_before as "balanceBefore", balance_after as "balanceAfter",
                 operation_type as "operationType", operation_id as "operationId",
                 reversal_of_id as "reversalOfId", note, occurred_at as "occurredAt"
          FROM finance_cash_movements
          ORDER BY occurred_at DESC, created_at DESC
          LIMIT 20
        `),
        client.query(`
          SELECT id, direction, source_amount as "sourceAmount", rate,
                 target_amount as "targetAmount", note,
                 occurred_at as "occurredAt", reverted_at as "revertedAt",
                 reverted_reason as "revertedReason"
          FROM finance_currency_exchanges
          ORDER BY occurred_at DESC, created_at DESC
          LIMIT 10
        `),
      ]);

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
          remeserosNetCup,
          externalNetUsd,
          externalNetCup,
        }),
      },
    };

    return Response.json({ ok: true, overview }, { status: 200 });
  } finally {
    client.release();
  }
}
