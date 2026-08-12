import { z } from "zod";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

const CreateCounterpartySchema = z.object({
  name: z.string().trim().min(1).max(160),
});

export async function GET() {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT id, name FROM finance_counterparties
       WHERE archived_at IS NULL ORDER BY name`,
    );
    return Response.json({
      ok: true,
      counterparties: result.rows.map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
      })),
    });
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

  const parsed = CreateCounterpartySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const client = await getPool().connect();
  try {
    const result = await client.query(
      `INSERT INTO finance_counterparties (name)
       VALUES ($1)
       RETURNING id, name, archived_at as "archivedAt",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [parsed.data.name],
    );
    const row = result.rows[0];
    return Response.json({
      ok: true,
      counterparty: {
        id: String(row.id),
        name: String(row.name),
        balanceUsd: 0,
        balanceCup: 0,
        archivedAt: null,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
        movements: [],
      },
    }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "23505") {
      return Response.json({ ok: false, error: "duplicate_counterparty_name" }, { status: 409 });
    }
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
