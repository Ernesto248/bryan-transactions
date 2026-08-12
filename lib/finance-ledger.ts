type QueryResult = { rows: any[] };

export type FinanceQueryClient = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
};

export type CashOperationType =
  | "EXTERNAL_DEBT"
  | "REMESERO_PAYMENT"
  | "CURRENCY_EXCHANGE";

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cashField(currency: "USD" | "CUP") {
  return currency === "USD"
    ? { column: "cash_usd", alias: "cashUsd" }
    : { column: "cash_cup", alias: "cashCup" };
}

export async function appendCashMovement(
  client: FinanceQueryClient,
  input: {
    currency: "USD" | "CUP";
    signedAmount: number;
    operationType: CashOperationType;
    operationId: string;
    note?: string | null;
    occurredAt?: string | Date | null;
    reversalOfId?: string | null;
  },
) {
  const signedAmount = roundMoney(input.signedAmount);
  if (!Number.isFinite(signedAmount) || signedAmount === 0) {
    throw new Error("cash movement amount must be non-zero");
  }

  const field = cashField(input.currency);
  const stateResult = await client.query(
    `SELECT ${field.column} as "${field.alias}"
     FROM finance_state WHERE id = 1 FOR UPDATE`,
  );
  const balanceBefore = Number(stateResult.rows[0]?.[field.alias] ?? 0);
  const balanceAfter = roundMoney(balanceBefore + signedAmount);

  const movementResult = await client.query(
    `INSERT INTO finance_cash_movements
       (currency, signed_amount, balance_before, balance_after,
        operation_type, operation_id, reversal_of_id, note, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
     RETURNING id, currency, signed_amount as "signedAmount",
               balance_before as "balanceBefore", balance_after as "balanceAfter",
               operation_type as "operationType", operation_id as "operationId",
               reversal_of_id as "reversalOfId", note, occurred_at as "occurredAt"`,
    [
      input.currency,
      signedAmount,
      balanceBefore,
      balanceAfter,
      input.operationType,
      input.operationId,
      input.reversalOfId ?? null,
      input.note ?? null,
      input.occurredAt instanceof Date
        ? input.occurredAt.toISOString()
        : input.occurredAt ?? null,
    ],
  );

  await client.query(
    `UPDATE finance_state
     SET ${field.column} = $1, updated_at = now()
     WHERE id = 1`,
    [balanceAfter],
  );

  return movementResult.rows[0];
}

export async function reverseCashMovement(
  client: FinanceQueryClient,
  input: { cashMovementId: string; reason?: string | null },
) {
  const originalResult = await client.query(
    `SELECT id, currency, signed_amount as "signedAmount",
            operation_type as "operationType", operation_id as "operationId"
     FROM finance_cash_movements original
     WHERE id = $1 AND reversal_of_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM finance_cash_movements reversal
         WHERE reversal.reversal_of_id = original.id
       )
     FOR UPDATE`,
    [input.cashMovementId],
  );
  const original = originalResult.rows[0];
  if (!original?.id) return null;

  return appendCashMovement(client, {
    currency: original.currency === "CUP" ? "CUP" : "USD",
    signedAmount: -Number(original.signedAmount),
    operationType: original.operationType as CashOperationType,
    operationId: String(original.operationId),
    reversalOfId: String(original.id),
    note: input.reason ?? "Reversión",
  });
}

export const ACTIVE_DEBT_DELTA_SQL = `COALESCE(
  signed_delta,
  CASE WHEN movement_type IN ('RECEIVABLE', 'PAID') THEN amount ELSE -amount END
)`;
