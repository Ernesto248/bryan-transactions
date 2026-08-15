import type {
  WireFifoPreview,
  ZelleAccountValuation,
  ZelleValuationSummary,
} from "@/lib/types";

type QueryClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

export type ZelleInventoryEvent = {
  id: string;
  amountUsd: number;
  occurredAt: string | Date;
  priceApplied: number | null;
};

export type ZelleOutflowEvent = {
  id: string;
  amountUsd: number;
  occurredAt: string | Date;
};

export type ZelleInventoryInput = {
  accountId: string;
  accountName: string;
  incomingAdjustment?: number;
  outgoingAdjustment?: number;
  transactions: ZelleInventoryEvent[];
  outflows: ZelleOutflowEvent[];
};

type InventoryLot = {
  id: string;
  amountCents: number;
  priceApplied: number | null;
};

export type LoadedZelleInventory = {
  accountId: string;
  accountName: string;
  valuation: ZelleAccountValuation;
  lots: InventoryLot[];
};

const EPSILON_CENTS = 0.5;

function usdToCents(value: number) {
  return Math.round(value * 100);
}

function centsToUsd(value: number) {
  return Number((value / 100).toFixed(2));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function summarizeLots(
  lots: InventoryLot[],
  deficitCents = 0,
): ZelleValuationSummary {
  let pricedCents = 0;
  let unpricedCents = 0;
  let costCupCents = 0;

  for (const lot of lots) {
    if (lot.priceApplied === null) {
      unpricedCents += lot.amountCents;
      continue;
    }

    pricedCents += lot.amountCents;
    costCupCents += Math.round(lot.amountCents * lot.priceApplied);
  }

  const inventoryCents = pricedCents + unpricedCents;
  const averagePrice = pricedCents > 0
    ? round(costCupCents / pricedCents, 6)
    : null;

  return {
    balanceUsd: centsToUsd(inventoryCents - deficitCents),
    inventoryUsd: centsToUsd(inventoryCents),
    deficitUsd: centsToUsd(deficitCents),
    pricedUsd: centsToUsd(pricedCents),
    unpricedUsd: centsToUsd(unpricedCents),
    costCup: Number((costCupCents / 100).toFixed(2)),
    averagePrice,
    coveragePercent: inventoryCents > 0
      ? round((pricedCents / inventoryCents) * 100, 2)
      : 0,
  };
}

function consumeLots(lots: InventoryLot[], amountCents: number) {
  const consumed: InventoryLot[] = [];
  let remainingCents = amountCents;

  while (remainingCents > EPSILON_CENTS && lots.length > 0) {
    const lot = lots[0];
    const consumedCents = Math.min(lot.amountCents, remainingCents);
    consumed.push({ ...lot, amountCents: consumedCents });
    lot.amountCents -= consumedCents;
    remainingCents -= consumedCents;

    if (lot.amountCents <= EPSILON_CENTS) lots.shift();
  }

  return { consumed, deficitCents: Math.max(0, remainingCents) };
}

export function calculateZelleInventory(
  input: ZelleInventoryInput,
): LoadedZelleInventory {
  const lots: InventoryLot[] = [];
  let deficitCents = 0;

  const events = [
    ...input.transactions.map((transaction) => ({
      id: transaction.id,
      kind: transaction.amountUsd >= 0 ? "receipt" as const : "outflow" as const,
      amountCents: usdToCents(Math.abs(transaction.amountUsd)),
      occurredAt: new Date(transaction.occurredAt).getTime(),
      priceApplied: transaction.priceApplied,
    })),
    ...input.outflows.map((outflow) => ({
      id: outflow.id,
      kind: "outflow" as const,
      amountCents: usdToCents(outflow.amountUsd),
      occurredAt: new Date(outflow.occurredAt).getTime(),
      priceApplied: null,
    })),
  ].sort((left, right) =>
    left.occurredAt - right.occurredAt
    || (left.kind === right.kind ? 0 : left.kind === "receipt" ? -1 : 1)
    || left.id.localeCompare(right.id),
  );

  for (const event of events) {
    if (event.amountCents <= 0) continue;

    if (event.kind === "receipt") {
      const absorbedCents = Math.min(deficitCents, event.amountCents);
      deficitCents -= absorbedCents;
      const availableCents = event.amountCents - absorbedCents;
      if (availableCents > EPSILON_CENTS) {
        lots.push({
          id: event.id,
          amountCents: availableCents,
          priceApplied: event.priceApplied,
        });
      }
      continue;
    }

    const result = consumeLots(lots, event.amountCents);
    deficitCents += result.deficitCents;
  }

  const incomingAdjustmentCents = usdToCents(input.incomingAdjustment ?? 0);
  if (incomingAdjustmentCents > 0) {
    const absorbedCents = Math.min(deficitCents, incomingAdjustmentCents);
    deficitCents -= absorbedCents;
    const availableCents = incomingAdjustmentCents - absorbedCents;
    if (availableCents > EPSILON_CENTS) {
      lots.push({
        id: `adjustment:${input.accountId}`,
        amountCents: availableCents,
        priceApplied: null,
      });
    }
  }

  const outgoingAdjustmentCents = usdToCents(input.outgoingAdjustment ?? 0);
  if (outgoingAdjustmentCents > 0) {
    const result = consumeLots(lots, outgoingAdjustmentCents);
    deficitCents += result.deficitCents;
  }

  const summary = summarizeLots(lots, deficitCents);

  return {
    accountId: input.accountId,
    accountName: input.accountName,
    valuation: {
      accountId: input.accountId,
      accountName: input.accountName,
      ...summary,
    },
    lots,
  };
}

export function previewWire(
  inventory: LoadedZelleInventory,
  requestedUsd: number,
): WireFifoPreview {
  const requestedCents = usdToCents(requestedUsd);
  const availableCents = usdToCents(inventory.valuation.inventoryUsd);
  const canCreate = requestedCents > 0
    && inventory.valuation.deficitUsd === 0
    && requestedCents <= availableCents;

  const lots = inventory.lots.map((lot) => ({ ...lot }));
  const selectedResult = consumeLots(lots, Math.min(requestedCents, availableCents));

  return {
    accountId: inventory.accountId,
    accountName: inventory.accountName,
    requestedUsd: centsToUsd(requestedCents),
    availableUsd: inventory.valuation.inventoryUsd,
    canCreate,
    error: canCreate ? null : "insufficient_account_balance",
    selected: summarizeLots(selectedResult.consumed),
    remaining: summarizeLots(lots),
  };
}

export function summarizeZelleInventories(
  inventories: LoadedZelleInventory[],
): { summary: ZelleValuationSummary; accounts: ZelleAccountValuation[] } {
  const accounts = inventories.map((inventory) => inventory.valuation);
  const totals = accounts.reduce(
    (result, account) => ({
      balanceUsd: result.balanceUsd + account.balanceUsd,
      inventoryUsd: result.inventoryUsd + account.inventoryUsd,
      deficitUsd: result.deficitUsd + account.deficitUsd,
      pricedUsd: result.pricedUsd + account.pricedUsd,
      unpricedUsd: result.unpricedUsd + account.unpricedUsd,
      costCup: result.costCup + account.costCup,
    }),
    { balanceUsd: 0, inventoryUsd: 0, deficitUsd: 0, pricedUsd: 0, unpricedUsd: 0, costCup: 0 },
  );

  return {
    summary: {
      balanceUsd: round(totals.balanceUsd, 2),
      inventoryUsd: round(totals.inventoryUsd, 2),
      deficitUsd: round(totals.deficitUsd, 2),
      pricedUsd: round(totals.pricedUsd, 2),
      unpricedUsd: round(totals.unpricedUsd, 2),
      costCup: round(totals.costCup, 2),
      averagePrice: totals.pricedUsd > 0
        ? round(totals.costCup / totals.pricedUsd, 6)
        : null,
      coveragePercent: totals.inventoryUsd > 0
        ? round((totals.pricedUsd / totals.inventoryUsd) * 100, 2)
        : 0,
    },
    accounts,
  };
}

export async function loadZelleInventories(
  client: QueryClient,
  accountId?: string,
): Promise<LoadedZelleInventory[]> {
  const result = await client.query(
    `WITH account_scope AS (
       SELECT id, account_name, incoming_adjustment, outgoing_adjustment
       FROM gmail_accounts
       WHERE ($1::uuid IS NULL OR id = $1)
     ),
     active_assignments AS (
       SELECT transaction_id, price_applied
       FROM remesero_transaction_assignments
       WHERE unassigned_at IS NULL
     )
     SELECT a.id as "accountId", a.account_name as "accountName",
            a.incoming_adjustment as "incomingAdjustment",
            a.outgoing_adjustment as "outgoingAdjustment",
            'account'::text as "rowKind", NULL::text as "eventId",
            NULL::numeric as amount, NULL::timestamptz as "eventAt",
            NULL::numeric as "priceApplied"
     FROM account_scope a
     UNION ALL
     SELECT a.id, a.account_name, a.incoming_adjustment, a.outgoing_adjustment,
            'transaction', t.id::text, t.amount,
            COALESCE(t.occurred_at, t.created_at), aa.price_applied
     FROM account_scope a
     JOIN transactions t ON t.gmail_account_id = a.id
     LEFT JOIN active_assignments aa ON aa.transaction_id = t.id
     UNION ALL
     SELECT a.id, a.account_name, a.incoming_adjustment, a.outgoing_adjustment,
            'outflow', m.id::text,
            (m.amount + COALESCE(m.wire_fee_usd, 0)),
            m.created_at, NULL::numeric
     FROM account_scope a
     JOIN account_outflow_movements m ON m.gmail_account_id = a.id
     WHERE m.reverted_at IS NULL`,
    [accountId ?? null],
  );

  const grouped = new Map<string, ZelleInventoryInput>();
  for (const row of result.rows) {
    const id = String(row.accountId);
    const input = grouped.get(id) ?? {
      accountId: id,
      accountName: String(row.accountName),
      incomingAdjustment: Number(row.incomingAdjustment ?? 0),
      outgoingAdjustment: Number(row.outgoingAdjustment ?? 0),
      transactions: [],
      outflows: [],
    };
    grouped.set(id, input);

    if (row.rowKind === "transaction") {
      input.transactions.push({
        id: String(row.eventId),
        amountUsd: Number(row.amount ?? 0),
        occurredAt: row.eventAt,
        priceApplied: row.priceApplied == null ? null : Number(row.priceApplied),
      });
    } else if (row.rowKind === "outflow") {
      input.outflows.push({
        id: String(row.eventId),
        amountUsd: Number(row.amount ?? 0),
        occurredAt: row.eventAt,
      });
    }
  }

  return [...grouped.values()]
    .map(calculateZelleInventory)
    .sort((left, right) => left.accountName.localeCompare(right.accountName));
}
