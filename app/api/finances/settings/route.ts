import { z } from "zod";
import { getPool, withRetry } from "@/lib/db";

export const runtime = "nodejs";

const NumericSchema = z
  .union([z.number(), z.string().trim().min(1)])
  .transform((value) => (typeof value === "string" ? Number(value) : value))
  .refine((value) => Number.isFinite(value), "must be finite");

const UpdateFinanceSettingsSchema = z
  .object({
    cashUsd: NumericSchema.optional(),
    cashCup: NumericSchema.optional(),
    usdCupRate: z
      .union([
        z.null(),
        z.number(),
        z.string().trim().min(1),
      ])
      .transform((value) =>
        value === null ? null : typeof value === "string" ? Number(value) : value,
      )
      .refine((value) => value === null || (Number.isFinite(value) && value > 0), "rate must be > 0")
      .optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (value) => value.cashUsd !== undefined || value.cashCup !== undefined || value.usdCupRate !== undefined,
    "at least one setting is required",
  );

export async function PATCH(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = UpdateFinanceSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await withRetry(async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT cash_usd as "cashUsd", cash_cup as "cashCup", usd_cup_rate as "usdCupRate"
         FROM finance_state WHERE id = 1 FOR UPDATE`,
      );
      const current = currentResult.rows[0];
      const fieldMap = {
        cashUsd: "cash_usd",
        cashCup: "cash_cup",
        usdCupRate: "usd_cup_rate",
      } as const;
      const updates: string[] = [];
      const values: unknown[] = [];

      for (const field of Object.keys(fieldMap) as Array<keyof typeof fieldMap>) {
        const next = parsed.data[field];
        if (next === undefined) continue;
        const previous = current[field] == null ? null : Number(current[field]);
        if (previous === next) continue;

        values.push(next);
        updates.push(`${fieldMap[field]} = $${values.length}`);
        await client.query(
          `INSERT INTO finance_state_changes
             (field_name, previous_value, new_value, note)
           VALUES ($1, $2, $3, $4)`,
          [field, previous, next, parsed.data.note ?? null],
        );
      }

      if (updates.length > 0) {
        await client.query(
          `UPDATE finance_state SET ${updates.join(", ")}, updated_at = now() WHERE id = 1`,
          values,
        );
      }
      const updatedResult = await client.query(
        `SELECT cash_usd as "cashUsd", cash_cup as "cashCup",
                usd_cup_rate as "usdCupRate", updated_at as "updatedAt"
         FROM finance_state WHERE id = 1`,
      );
      await client.query("COMMIT");
      return updatedResult.rows[0];
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  });

  return Response.json({
    ok: true,
    settings: {
      cashUsd: Number(result.cashUsd),
      cashCup: Number(result.cashCup),
      usdCupRate: result.usdCupRate == null ? null : Number(result.usdCupRate),
      updatedAt: new Date(result.updatedAt).toISOString(),
    },
  });
}
