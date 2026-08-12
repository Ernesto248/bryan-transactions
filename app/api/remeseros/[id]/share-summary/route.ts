import { getPool } from "@/lib/db";
import {
  assignmentMovementEvents,
  buildMagnitudeGroups,
  buildMovementGroups,
} from "@/lib/remesero-ledger";
import type { RemeseroDetailAssignment, RemeseroShareSummary } from "@/lib/types";

export const runtime = "nodejs";

function idFromParams(params: { id?: string }) {
  return String(params.id ?? "").trim();
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapAssignmentRow(row: any): RemeseroDetailAssignment {
  return {
    assignmentId: String(row.assignmentId),
    transactionId: String(row.transactionId),
    senderName: "",
    bank: null,
    accountName: null,
    confirmationCode: null,
    transactionAmount: toNumber(row.amountUsd),
    amountUsd: toNumber(row.amountUsd),
    priceApplied: toNumber(row.priceApplied),
    debtAmount: toNumber(row.debtAmount),
    assignedAt: new Date(row.assignedAt).toISOString(),
    unassignedAt:
      row.unassignedAt === null || row.unassignedAt === undefined
        ? null
        : new Date(row.unassignedAt).toISOString(),
    isActive: row.unassignedAt === null || row.unassignedAt === undefined,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = idFromParams({ id: rawId });

  if (!id) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const client = await getPool().connect();

  try {
    const remeseroResult = await client.query(
      `
      SELECT id, nombre, deuda_actual as "deudaActual"
      FROM remeseros
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
      `,
      [id],
    );

    const remesero = remeseroResult.rows[0];
    if (!remesero?.id) {
      return Response.json(
        { ok: false, error: "remesero_not_found" },
        { status: 404 },
      );
    }

    const latestCutResult = await client.query(
      `
      SELECT *
      FROM (
        SELECT
          id,
          'PAYMENT'::text as "cutType",
          amount_paid as "amountPaid",
          deuda_despues_pago as "balanceAfter",
          note,
          paid_at as "cutAt"
        FROM remesero_payments
        WHERE remesero_id = $1 AND reverted_at IS NULL

        UNION ALL

        SELECT
          id,
          'MANUAL'::text as "cutType",
          NULL::numeric as "amountPaid",
          debt_after as "balanceAfter",
          note,
          adjusted_at as "cutAt"
        FROM remesero_debt_adjustments
        WHERE remesero_id = $1
      ) cuts
      ORDER BY "cutAt" DESC
      LIMIT 1
      `,
      [id],
    );

    const latestCut = latestCutResult.rows[0] ?? null;
    const cutAt = latestCut?.cutAt ? new Date(latestCut.cutAt) : null;

    const assignmentsResult = await client.query(
      `
      SELECT
        id as "assignmentId",
        transaction_id as "transactionId",
        amount_usd as "amountUsd",
        price_applied as "priceApplied",
        debt_amount as "debtAmount",
        assigned_at as "assignedAt",
        unassigned_at as "unassignedAt"
      FROM remesero_transaction_assignments
      WHERE remesero_id = $1
        AND (
          $2::timestamptz IS NULL
          OR assigned_at > $2::timestamptz
          OR (unassigned_at IS NOT NULL AND unassigned_at > $2::timestamptz)
        )
      ORDER BY LEAST(assigned_at, COALESCE(unassigned_at, assigned_at)), id
      `,
      [id, cutAt],
    );

    const range = { from: cutAt, to: null };
    const events = assignmentsResult.rows
      .map(mapAssignmentRow)
      .flatMap((assignment) => assignmentMovementEvents(assignment, range));

    const groups = buildMagnitudeGroups(events, 1);
    const removedGroups = buildMagnitudeGroups(events, -1);
    const netGroups = buildMovementGroups(events);
    const totalTiradoUsd = events.reduce(
      (total, event) => total + event.direction * event.amountUsd,
      0,
    );
    const totalTiradoCup = events.reduce(
      (total, event) => total + event.direction * event.debtAmount,
      0,
    );
    const netOperationCount = events.reduce(
      (total, event) => total + event.direction,
      0,
    );

    let inicioDebt = latestCut?.id ? toNumber(latestCut.balanceAfter) : 0;

    // Legacy payment rows may not have a captured post-payment balance.
    if (latestCut?.id && latestCut.balanceAfter == null) {
      inicioDebt = toNumber(remesero.deudaActual) - totalTiradoCup;
    }

    const finalDebt = inicioDebt + totalTiradoCup;
    const cutType = latestCut?.cutType === "MANUAL" ? "MANUAL" : latestCut?.id ? "PAYMENT" : null;

    const summary: RemeseroShareSummary = {
      remeseroId: String(remesero.id),
      remeseroNombre: String(remesero.nombre),
      cutAt: cutAt ? cutAt.toISOString() : null,
      cutType,
      cutNote: latestCut?.note == null ? null : String(latestCut.note),
      hasPaymentCut: cutType === "PAYMENT",
      hasManualCut: cutType === "MANUAL",
      lastPaymentAmount:
        cutType === "PAYMENT" && latestCut.amountPaid != null
          ? toNumber(latestCut.amountPaid)
          : null,
      inicioDebt,
      totalTiradoUsd,
      totalTiradoCup,
      finalDebt,
      finalDebtType: finalDebt >= 0 ? "DEUDA" : "FONDO",
      netOperationCount,
      movementCount: events.length,
      groups,
      removedGroups,
      netGroups,
    };

    return Response.json({ ok: true, summary }, { status: 200 });
  } finally {
    client.release();
  }
}
