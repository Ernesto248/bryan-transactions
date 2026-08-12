import { getPool } from "@/lib/db";
import type { Bank } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT id, name FROM banks ORDER BY name ASC`,
    );
    const banks: Bank[] = result.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
    }));
    return Response.json({ ok: true, banks }, { status: 200 });
  } finally {
    client.release();
  }
}
