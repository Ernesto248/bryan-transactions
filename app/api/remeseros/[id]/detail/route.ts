import { getPool } from "@/lib/db";
import {
  annotateAssignmentForRange,
  buildDetailMovementSummary,
} from "@/lib/remesero-ledger";
import type {
  Remesero,
  RemeseroCut,
  RemeseroDebtAdjustment,
  RemeseroDetailAssignment,
  RemeseroDetailData,
  RemeseroDetailRangeOption,
  RemeseroPayment,
} from "@/lib/types";

export const runtime = "nodejs";

function idFromParams(params: { id?: string }) {
  return String(params.id ?? "").trim();
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateParam(rawValue: string | null) {
  if (!rawValue) return null;
  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCutLabel(isoDate: string) {
  return new Date(isoDate).toLocaleString("es-DO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function mapRemeseroRow(row: any): Remesero {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    precioActual: toNumber(row.precioActual),
    deudaActual: toNumber(row.deudaActual),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function mapPaymentRow(row: any): RemeseroPayment {
  return {
    id: String(row.id),
    remeseroId: String(row.remeseroId),
    amountPaid: toNumber(row.amountPaid),
    debtBeforePayment: row.debtBeforePayment == null ? null : toNumber(row.debtBeforePayment),
    debtAfterPayment: row.debtAfterPayment == null ? null : toNumber(row.debtAfterPayment),
    note: row.note == null ? null : String(row.note),
    paidAt: new Date(row.paidAt).toISOString(),
    revertedAt: row.revertedAt == null ? null : new Date(row.revertedAt).toISOString(),
    revertedReason: row.revertedReason == null ? null : String(row.revertedReason),
    cashMovementId: row.cashMovementId == null ? null : String(row.cashMovementId),
    cashCupBefore: row.cashCupBefore == null ? null : toNumber(row.cashCupBefore),
    cashCupAfter: row.cashCupAfter == null ? null : toNumber(row.cashCupAfter),
  };
}

function mapAdjustmentRow(row: any): RemeseroDebtAdjustment {
  return {
    id: String(row.id),
    remeseroId: String(row.remeseroId),
    debtBefore: toNumber(row.debtBefore),
    debtAfter: toNumber(row.debtAfter),
    note: row.note == null ? null : String(row.note),
    adjustedAt: new Date(row.adjustedAt).toISOString(),
  };
}

function buildCuts(
  payments: RemeseroPayment[],
  adjustments: RemeseroDebtAdjustment[],
): RemeseroCut[] {
  return [
    ...payments
      .filter((payment) => payment.revertedAt === null)
      .map((payment) => ({
        id: payment.id,
        type: "PAYMENT" as const,
        cutAt: payment.paidAt,
        balanceAfter: payment.debtAfterPayment ?? null,
        amountPaid: payment.amountPaid,
        note: payment.note,
      })),
    ...adjustments.map((adjustment) => ({
      id: adjustment.id,
      type: "MANUAL" as const,
      cutAt: adjustment.adjustedAt,
      balanceAfter: adjustment.debtAfter,
      amountPaid: null,
      note: adjustment.note,
    })),
  ].sort((a, b) => b.cutAt.localeCompare(a.cutAt));
}

function buildRangeOptions(cuts: RemeseroCut[]): RemeseroDetailRangeOption[] {
  const options: RemeseroDetailRangeOption[] = [];
  const latest = cuts[0] ?? null;

  options.push({
    id: "current",
    label: latest
      ? `Desde ${latest.type === "PAYMENT" ? "el ultimo pago" : "el ultimo ajuste"} (${formatCutLabel(latest.cutAt)})`
      : "Desde el inicio (sin cortes)",
    from: latest?.cutAt ?? null,
    to: null,
    cutType: latest?.type ?? null,
    inicioDebt: latest ? (latest.balanceAfter ?? undefined) : 0,
  });

  for (let index = 0; index < cuts.length - 1; index += 1) {
    const newer = cuts[index];
    const older = cuts[index + 1];
    options.push({
      id: `between:${newer.id}:${older.id}`,
      label: `Entre ${formatCutLabel(older.cutAt)} y ${formatCutLabel(newer.cutAt)}`,
      from: older.cutAt,
      to: newer.cutAt,
      cutType: older.type,
      inicioDebt: older.balanceAfter ?? undefined,
    });
  }

  if (cuts.length > 0) {
    const oldest = cuts[cuts.length - 1];
    options.push({
      id: `before:${oldest.id}`,
      label: `Antes del primer corte (${formatCutLabel(oldest.cutAt)})`,
      from: null,
      to: oldest.cutAt,
      cutType: null,
      inicioDebt: 0,
    });
  }

  return options;
}

function mapAssignmentRow(row: any): RemeseroDetailAssignment {
  return {
    assignmentId: String(row.assignmentId),
    transactionId: String(row.transactionId),
    senderName: row.senderName == null ? "Sin nombre" : String(row.senderName),
    bank: row.bank == null ? null : String(row.bank),
    accountName: row.accountName == null ? null : String(row.accountName),
    confirmationCode: row.confirmationCode == null ? null : String(row.confirmationCode),
    transactionAmount: toNumber(row.transactionAmount),
    amountUsd: toNumber(row.amountUsd),
    priceApplied: toNumber(row.priceApplied),
    debtAmount: toNumber(row.debtAmount),
    assignedAt: new Date(row.assignedAt).toISOString(),
    unassignedAt: row.unassignedAt == null ? null : new Date(row.unassignedAt).toISOString(),
    isActive: row.unassignedAt == null,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = idFromParams({ id: rawId });
  if (!id) return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });

  const requestUrl = new URL(request.url);
  const hasFromParam = requestUrl.searchParams.has("from");
  const fromParam = parseDateParam(requestUrl.searchParams.get("from"));
  const toParam = parseDateParam(requestUrl.searchParams.get("to"));
  if (fromParam && toParam && fromParam >= toParam) {
    return Response.json({ ok: false, error: "invalid_range" }, { status: 400 });
  }

  const client = await getPool().connect();
  try {
    const remeseroResult = await client.query(
      `SELECT id, nombre, precio_actual as "precioActual", deuda_actual as "deudaActual",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM remeseros WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    if (!remeseroResult.rows[0]?.id) {
      return Response.json({ ok: false, error: "remesero_not_found" }, { status: 404 });
    }
    const remesero = mapRemeseroRow(remeseroResult.rows[0]);

    const paymentsResult = await client.query(
      `SELECT payment.id, payment.remesero_id as "remeseroId",
              payment.amount_paid as "amountPaid",
              payment.deuda_antes_pago as "debtBeforePayment",
              payment.deuda_despues_pago as "debtAfterPayment",
              payment.note, payment.paid_at as "paidAt",
              payment.reverted_at as "revertedAt",
              payment.reverted_reason as "revertedReason",
              payment.cash_movement_id as "cashMovementId",
              cash.balance_before as "cashCupBefore",
              cash.balance_after as "cashCupAfter"
       FROM remesero_payments payment
       LEFT JOIN finance_cash_movements cash ON cash.id = payment.cash_movement_id
       WHERE payment.remesero_id = $1 ORDER BY payment.paid_at DESC`,
      [id],
    );
    const payments = paymentsResult.rows.map(mapPaymentRow);

    const adjustmentsResult = await client.query(
      `SELECT id, remesero_id as "remeseroId", debt_before as "debtBefore",
              debt_after as "debtAfter", note, adjusted_at as "adjustedAt"
       FROM remesero_debt_adjustments WHERE remesero_id = $1 ORDER BY adjusted_at DESC`,
      [id],
    );
    const adjustments = adjustmentsResult.rows.map(mapAdjustmentRow);
    const cuts = buildCuts(payments, adjustments);
    const rangeOptions = buildRangeOptions(cuts);
    const defaultOption = rangeOptions[0];
    const effectiveFrom = hasFromParam
      ? fromParam
      : defaultOption.from
        ? new Date(defaultOption.from)
        : null;
    const effectiveTo = toParam ?? null;
    if (effectiveFrom && effectiveTo && effectiveFrom >= effectiveTo) {
      return Response.json({ ok: false, error: "invalid_range" }, { status: 400 });
    }

    const assignmentsResult = await client.query(
      `SELECT a.id as "assignmentId", a.transaction_id as "transactionId",
              t.actor_name as "senderName", b.name as bank, g.account_name as "accountName",
              t.confirmation_code as "confirmationCode", t.amount as "transactionAmount",
              a.amount_usd as "amountUsd", a.price_applied as "priceApplied",
              a.debt_amount as "debtAmount", a.assigned_at as "assignedAt",
              a.unassigned_at as "unassignedAt"
       FROM remesero_transaction_assignments a
       JOIN transactions t ON t.id = a.transaction_id
       LEFT JOIN banks b ON b.id = t.bank_id
       LEFT JOIN gmail_accounts g ON g.id = t.gmail_account_id
       WHERE a.remesero_id = $1
         AND (
           (($2::timestamptz IS NULL OR a.assigned_at > $2::timestamptz)
             AND ($3::timestamptz IS NULL OR a.assigned_at <= $3::timestamptz))
           OR
           (a.unassigned_at IS NOT NULL
             AND ($2::timestamptz IS NULL OR a.unassigned_at > $2::timestamptz)
             AND ($3::timestamptz IS NULL OR a.unassigned_at <= $3::timestamptz))
         )
       ORDER BY GREATEST(a.assigned_at, COALESCE(a.unassigned_at, a.assigned_at)) DESC`,
      [id, effectiveFrom, effectiveTo],
    );

    const range = { from: effectiveFrom, to: effectiveTo };
    const assignments = assignmentsResult.rows
      .map(mapAssignmentRow)
      .map((assignment) => annotateAssignmentForRange(assignment, range));
    const summary = buildDetailMovementSummary(assignments);
    const matchedOption = rangeOptions.find(
      (option) =>
        option.from === (effectiveFrom?.toISOString() ?? null) &&
        option.to === (effectiveTo?.toISOString() ?? null),
    );
    let inicioDebt = matchedOption?.inicioDebt ?? 0;
    if (matchedOption?.from && matchedOption.inicioDebt == null) {
      inicioDebt = remesero.deudaActual - summary.totalCup;
    }

    const detail: RemeseroDetailData = {
      remesero,
      payments,
      adjustments,
      cuts,
      rangeOptions,
      selectedRange: {
        from: effectiveFrom?.toISOString() ?? null,
        to: effectiveTo?.toISOString() ?? null,
        inicioDebt,
        cutType: matchedOption?.cutType ?? null,
      },
      summary,
      assignments,
    };

    return Response.json({ ok: true, detail }, { status: 200 });
  } finally {
    client.release();
  }
}
