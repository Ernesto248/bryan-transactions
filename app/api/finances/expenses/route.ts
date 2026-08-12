import { z } from "zod";
import { getPool, withRetry } from "@/lib/db";

export const runtime = "nodejs";

const PositiveNumericSchema = z
  .union([z.number(), z.string().trim().min(1)])
  .transform((value) => (typeof value === "string" ? Number(value) : value))
  .refine((value) => Number.isFinite(value) && value > 0, "amount must be > 0");

const CreateExpenseSchema = z.object({
  currency: z.enum(["USD", "CUP"]),
  amount: PositiveNumericSchema,
  description: z.string().trim().min(1).max(300),
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = CreateExpenseSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await withRetry(async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const stateResult = await client.query(
        `SELECT cash_usd as "cashUsd", cash_cup as "cashCup"
         FROM finance_state WHERE id = 1 FOR UPDATE`,
      );
      const state = stateResult.rows[0];
      const fieldName = parsed.data.currency === "USD" ? "cashUsd" : "cashCup";
      const columnName = parsed.data.currency === "USD" ? "cash_usd" : "cash_cup";
      const balanceBefore = Number(state[fieldName]);

      const balanceAfter = balanceBefore - parsed.data.amount;
      const expenseResult = await client.query(
        `INSERT INTO finance_expenses
           (currency, amount, description, balance_before, balance_after, occurred_at)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
         RETURNING id, currency, amount, description,
                   balance_before as "balanceBefore", balance_after as "balanceAfter",
                   occurred_at as "occurredAt"`,
        [
          parsed.data.currency,
          parsed.data.amount,
          parsed.data.description,
          balanceBefore,
          balanceAfter,
          parsed.data.occurredAt ?? null,
        ],
      );
      await client.query(
        `UPDATE finance_state
         SET ${columnName} = $1, updated_at = now()
         WHERE id = 1`,
        [balanceAfter],
      );
      await client.query(
        `INSERT INTO finance_state_changes
           (field_name, previous_value, new_value, note)
         VALUES ($1, $2, $3, $4)`,
        [fieldName, balanceBefore, balanceAfter, `Gasto: ${parsed.data.description}`],
      );
      await client.query("COMMIT");

      return { expense: expenseResult.rows[0] };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  });

  const expense = result.expense;
  return Response.json({
    ok: true,
    expense: {
      id: String(expense.id),
      currency: expense.currency,
      amount: Number(expense.amount),
      description: String(expense.description),
      balanceBefore: Number(expense.balanceBefore),
      balanceAfter: Number(expense.balanceAfter),
      occurredAt: new Date(expense.occurredAt).toISOString(),
    },
  }, { status: 201 });
}
