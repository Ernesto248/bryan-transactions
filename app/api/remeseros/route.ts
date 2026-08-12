import { z } from "zod";
import { getPool } from "@/lib/db";
import type { Remesero } from "@/lib/types";

export const runtime = "nodejs";

const CreateRemeseroSchema = z.object({
  nombre: z.string().trim().min(1),
  precioActual: z
    .union([z.number(), z.string().trim()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v >= 0, "precioActual must be >= 0"),
});

function mapRemeseroRow(row: any): Remesero {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    precioActual: Number(row.precioActual ?? 0),
    deudaActual: Number(row.deudaActual ?? 0),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function GET() {
  const client = await getPool().connect();

  try {
    const result = await client.query(
      `
      SELECT
        r.id,
        r.nombre,
        r.precio_actual as "precioActual",
        r.deuda_actual as "deudaActual",
        r.created_at as "createdAt",
        r.updated_at as "updatedAt"
      FROM remeseros r
      WHERE r.deleted_at IS NULL
      ORDER BY r.created_at DESC
      `,
    );

    const remeseros: Remesero[] = result.rows.map(mapRemeseroRow);
    return Response.json({ ok: true, remeseros }, { status: 200 });
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

  const parsed = CreateRemeseroSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const client = await getPool().connect();

  try {
    const inserted = await client.query(
      `
      INSERT INTO remeseros (nombre, precio_actual, deuda_actual)
      VALUES ($1, $2, $3)
      RETURNING id, nombre, precio_actual as "precioActual", deuda_actual as "deudaActual", created_at as "createdAt", updated_at as "updatedAt"
      `,
      [parsed.data.nombre, parsed.data.precioActual, 0],
    );

    const remesero = mapRemeseroRow(inserted.rows[0]);

    return Response.json({ ok: true, remesero }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "23505") {
      return Response.json(
        { ok: false, error: "duplicate_remesero_name" },
        { status: 409 },
      );
    }

    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
