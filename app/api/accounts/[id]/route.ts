import { z } from "zod";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
const Schema = z.object({ ownerFeePercent: z.number().finite().min(0).max(100), note: z.string().trim().max(500).optional() });

export async function PATCH(request: Request, { params }: Params) {
  const parsedParams = z.object({ id: z.string().uuid() }).safeParse(await params);
  const parsedBody = Schema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !parsedBody.success) return Response.json({ ok: false, error: "validation_error" }, { status: 400 });
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT owner_fee_percent as "ownerFeePercent" FROM gmail_accounts WHERE id = $1 FOR UPDATE`, [parsedParams.data.id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return Response.json({ ok: false, error: "account_not_found" }, { status: 404 }); }
    await client.query(`INSERT INTO gmail_account_owner_fee_changes (gmail_account_id, previous_percent, new_percent, note) VALUES ($1, $2, $3, $4)`, [parsedParams.data.id, current.rows[0].ownerFeePercent, parsedBody.data.ownerFeePercent, parsedBody.data.note ?? null]);
    await client.query(`UPDATE gmail_accounts SET owner_fee_percent = $2 WHERE id = $1`, [parsedParams.data.id, parsedBody.data.ownerFeePercent]);
    await client.query("COMMIT");
    return Response.json({ ok: true, accountId: parsedParams.data.id, ownerFeePercent: parsedBody.data.ownerFeePercent });
  } catch { try { await client.query("ROLLBACK"); } catch {} return Response.json({ ok: false, error: "server_error" }, { status: 500 }); }
  finally { client.release(); }
}
