import { z } from "zod";
import { getPool } from "@/lib/db";
import { loadZelleInventories, previewWire } from "@/lib/zelle-inventory";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const parsedParams = z
    .object({ id: z.string().uuid() })
    .safeParse(await params);
  const amount = Number(new URL(request.url).searchParams.get("amount"));

  if (!parsedParams.success || !Number.isFinite(amount) || amount <= 0) {
    return Response.json(
      { ok: false, error: "validation_error" },
      { status: 400 },
    );
  }

  const client = await getPool().connect();

  try {
    const inventories = await loadZelleInventories(client, parsedParams.data.id);
    const inventory = inventories[0];

    if (!inventory) {
      return Response.json(
        { ok: false, error: "account_not_found" },
        { status: 404 },
      );
    }

    return Response.json(
      { ok: true, preview: previewWire(inventory, amount) },
      { status: 200 },
    );
  } finally {
    client.release();
  }
}
