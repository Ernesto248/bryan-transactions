import { z } from "zod";
import { getPool } from "@/lib/db";
import { roundMoney } from "@/lib/finance-ledger";
import { calculateWireProfit } from "@/lib/wire-profit";
import { loadZelleInventories, previewWire } from "@/lib/zelle-inventory";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const parsedParams = z
    .object({ id: z.string().uuid() })
    .safeParse(await params);
  const searchParams = new URL(request.url).searchParams;
  const query = z.object({
    amount: z.coerce.number().finite().positive(),
    wireFeeUsd: z.coerce.number().finite().min(0).default(0),
    settlementCurrency: z.enum(["USD", "CUP"]).optional(),
    conversionRate: z.coerce.number().finite().positive().optional(),
    feePercent: z.coerce.number().finite().min(0).optional(),
  }).superRefine((value, context) => {
    if (value.settlementCurrency === "CUP" && value.conversionRate === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["conversionRate"], message: "conversionRate is required" });
    }
    if (value.settlementCurrency === "USD" && value.feePercent === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["feePercent"], message: "feePercent is required" });
    }
  }).safeParse({
    amount: searchParams.get("amount") ?? undefined,
    wireFeeUsd: searchParams.get("wireFeeUsd") ?? undefined,
    settlementCurrency: searchParams.get("settlementCurrency") ?? undefined,
    conversionRate: searchParams.get("conversionRate") ?? undefined,
    feePercent: searchParams.get("feePercent") ?? undefined,
  });

  if (!parsedParams.success || !query.success) {
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

    const principalUsd = roundMoney(query.data.amount);
    const wireFeeUsd = roundMoney(query.data.wireFeeUsd);
    const totalDebitUsd = roundMoney(principalUsd + wireFeeUsd);
    const fifoPreview = previewWire(inventory, totalDebitUsd);

    if (!query.data.settlementCurrency) {
      return Response.json({
        ok: true,
        preview: {
          ...fifoPreview,
          requestedUsd: principalUsd,
          principalUsd,
          wireFeeUsd,
          totalDebitUsd,
          profit: null,
        },
      }, { status: 200 });
    }

    const financeStateResult = await client.query(
      `SELECT usd_cup_rate as "usdCupRate" FROM finance_state WHERE id = 1`,
    );
    const globalRate = Number(financeStateResult.rows[0]?.usdCupRate ?? 0);
    if (!Number.isFinite(globalRate) || globalRate <= 0) {
      return Response.json({
        ok: true,
        preview: {
          ...fifoPreview,
          requestedUsd: principalUsd,
          principalUsd,
          wireFeeUsd,
          totalDebitUsd,
          canCreate: false,
          error: "global_rate_required",
          profit: null,
        },
      }, { status: 200 });
    }

    return Response.json({
      ok: true,
      preview: {
        ...fifoPreview,
        requestedUsd: principalUsd,
        principalUsd,
        wireFeeUsd,
        totalDebitUsd,
        profit: calculateWireProfit({
          principalUsd,
          settlementCurrency: query.data.settlementCurrency,
          conversionRate: query.data.conversionRate,
          feePercent: query.data.feePercent,
          globalRate,
          selected: fifoPreview.selected,
        }),
      },
    }, { status: 200 });
  } finally {
    client.release();
  }
}
