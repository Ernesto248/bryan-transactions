import { z } from "zod";
import { getPool, withRetry } from "@/lib/db";

export const runtime = "nodejs";

const UpdateRemeseroSchema = z
  .object({
    nombre: z.string().trim().min(1).optional(),
    precioActual: z
      .union([z.number(), z.string().trim()])
      .transform((v) => (typeof v === "string" ? Number(v) : v))
      .refine((v) => Number.isFinite(v) && v >= 0, "precioActual must be >= 0")
      .optional(),
    deudaActual: z
      .union([z.number(), z.string().trim().min(1)])
      .transform((v) => (typeof v === "string" ? Number(v) : v))
      .refine((v) => Number.isFinite(v), "deudaActual must be a finite number")
      .optional(),
    deudaActualNote: z.string().trim().max(500).optional(),
  })
  .refine(
    (data) =>
      data.nombre !== undefined ||
      data.precioActual !== undefined ||
      data.deudaActual !== undefined,
    {
      message: "at least one field is required",
    },
  );

function idFromParams(params: { id?: string }) {
  return String(params.id ?? "").trim();
}

export async function PATCH(
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

  const parsed = UpdateRemeseroSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (parsed.data.nombre !== undefined) {
    values.push(parsed.data.nombre);
    updates.push(`nombre = $${values.length}`);
  }

  if (parsed.data.precioActual !== undefined) {
    values.push(parsed.data.precioActual);
    updates.push(`precio_actual = $${values.length}`);
  }

  if (parsed.data.deudaActual !== undefined) {
    values.push(parsed.data.deudaActual);
    updates.push(`deuda_actual = $${values.length}`);
  }

  values.push(id);

  try {
    const result = await withRetry(async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");

        const current = await client.query(
          `
          SELECT id, deuda_actual as "deudaActual"
          FROM remeseros
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE
          LIMIT 1
          `,
          [id],
        );

        if (!current.rows[0]?.id) {
          await client.query("ROLLBACK");
          return null;
        }

        const updated = await client.query(
          `
          UPDATE remeseros
          SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $${values.length} AND deleted_at IS NULL
          RETURNING id
          `,
          values,
        );

        let adjustment = null;
        if (parsed.data.deudaActual !== undefined) {
          const inserted = await client.query(
            `
            INSERT INTO remesero_debt_adjustments
              (remesero_id, debt_before, debt_after, note, adjusted_at)
            VALUES
              ($1, $2, $3, $4, now())
            RETURNING
              id,
              remesero_id as "remeseroId",
              debt_before as "debtBefore",
              debt_after as "debtAfter",
              note,
              adjusted_at as "adjustedAt"
            `,
            [
              id,
              Number(current.rows[0].deudaActual ?? 0),
              parsed.data.deudaActual,
              parsed.data.deudaActualNote ?? null,
            ],
          );
          adjustment = inserted.rows[0] ?? null;
        }

        await client.query("COMMIT");
        return { updated, adjustment };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        throw error;
      } finally {
        client.release();
      }
    });

    if (!result?.updated.rows[0]?.id) {
      return Response.json(
        { ok: false, error: "remesero_not_found" },
        { status: 404 },
      );
    }

    return Response.json(
      {
        ok: true,
        adjustment: result.adjustment
          ? {
              ...result.adjustment,
              debtBefore: Number(result.adjustment.debtBefore ?? 0),
              debtAfter: Number(result.adjustment.debtAfter ?? 0),
              adjustedAt: new Date(result.adjustment.adjustedAt).toISOString(),
            }
          : undefined,
      },
      { status: 200 },
    );
  } catch (err: any) {
    if (err?.code === "23505") {
      return Response.json(
        { ok: false, error: "duplicate_remesero_name" },
        { status: 409 },
      );
    }

    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const id = idFromParams(resolvedParams);

  if (!id) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const client = await getPool().connect();

  try {
    const deleted = await client.query(
      `
      UPDATE remeseros
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
      `,
      [id],
    );

    if (!deleted.rows[0]?.id) {
      return Response.json(
        { ok: false, error: "remesero_not_found" },
        { status: 404 },
      );
    }

    return Response.json({ ok: true }, { status: 200 });
  } finally {
    client.release();
  }
}
