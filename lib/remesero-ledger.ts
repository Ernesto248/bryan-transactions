import type {
  RemeseroDetailAssignment,
  RemeseroDetailSummary,
  RemeseroShareSummaryGroup,
} from "@/lib/types";

export type RemeseroMovementEvent = {
  direction: 1 | -1;
  occurredAt: string;
  priceApplied: number;
  amountUsd: number;
  debtAmount: number;
};

type MovementRange = {
  from: Date | null;
  to: Date | null;
};

function isWithinRange(value: string, range: MovementRange) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (range.from && date <= range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

export function assignmentMovementEvents(
  assignment: Pick<
    RemeseroDetailAssignment,
    | "assignedAt"
    | "unassignedAt"
    | "priceApplied"
    | "amountUsd"
    | "debtAmount"
  >,
  range: MovementRange,
): RemeseroMovementEvent[] {
  const events: RemeseroMovementEvent[] = [];

  if (isWithinRange(assignment.assignedAt, range)) {
    events.push({
      direction: 1,
      occurredAt: assignment.assignedAt,
      priceApplied: assignment.priceApplied,
      amountUsd: assignment.amountUsd,
      debtAmount: assignment.debtAmount,
    });
  }

  if (
    assignment.unassignedAt &&
    isWithinRange(assignment.unassignedAt, range)
  ) {
    events.push({
      direction: -1,
      occurredAt: assignment.unassignedAt,
      priceApplied: assignment.priceApplied,
      amountUsd: assignment.amountUsd,
      debtAmount: assignment.debtAmount,
    });
  }

  return events;
}

export function annotateAssignmentForRange(
  assignment: RemeseroDetailAssignment,
  range: MovementRange,
): RemeseroDetailAssignment {
  const events = assignmentMovementEvents(assignment, range);
  const netOperations = events.reduce(
    (total, event) => total + event.direction,
    0,
  );

  return {
    ...assignment,
    assignedInRange: events.some((event) => event.direction === 1),
    unassignedInRange: events.some((event) => event.direction === -1),
    movementCount: events.length,
    netOperations,
    netAmountUsd: events.reduce(
      (total, event) => total + event.direction * event.amountUsd,
      0,
    ),
    netDebtAmount: events.reduce(
      (total, event) => total + event.direction * event.debtAmount,
      0,
    ),
  };
}

export function buildMovementGroups(
  events: RemeseroMovementEvent[],
): RemeseroShareSummaryGroup[] {
  const grouped = new Map<
    number,
    {
      txCount: number;
      movementCount: number;
      totalUsd: number;
      totalCup: number;
      amountsUsd: number[];
    }
  >();

  const sortedEvents = [...events].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );

  for (const event of sortedEvents) {
    const current = grouped.get(event.priceApplied) ?? {
      txCount: 0,
      movementCount: 0,
      totalUsd: 0,
      totalCup: 0,
      amountsUsd: [],
    };
    const signedUsd = event.direction * event.amountUsd;

    current.txCount += event.direction;
    current.movementCount += 1;
    current.totalUsd += signedUsd;
    current.totalCup += event.direction * event.debtAmount;
    current.amountsUsd.push(signedUsd);
    grouped.set(event.priceApplied, current);
  }

  return Array.from(grouped.entries())
    .map(([priceApplied, value]) => ({ priceApplied, ...value }))
    .sort((a, b) => a.priceApplied - b.priceApplied);
}

export function buildMagnitudeGroups(
  events: RemeseroMovementEvent[],
  direction: 1 | -1,
): RemeseroShareSummaryGroup[] {
  return buildMovementGroups(
    events
      .filter((event) => event.direction === direction)
      .map((event) => ({ ...event, direction: 1 })),
  );
}

export function buildDetailMovementSummary(
  assignments: RemeseroDetailAssignment[],
): RemeseroDetailSummary {
  const events = assignments.flatMap((assignment) => {
    const assignedEvent = assignment.assignedInRange
      ? [
          {
            direction: 1 as const,
            occurredAt: assignment.assignedAt,
            priceApplied: assignment.priceApplied,
            amountUsd: assignment.amountUsd,
            debtAmount: assignment.debtAmount,
          },
        ]
      : [];
    const unassignedEvent =
      assignment.unassignedInRange && assignment.unassignedAt
        ? [
            {
              direction: -1 as const,
              occurredAt: assignment.unassignedAt,
              priceApplied: assignment.priceApplied,
              amountUsd: assignment.amountUsd,
              debtAmount: assignment.debtAmount,
            },
          ]
        : [];

    return [...assignedEvent, ...unassignedEvent];
  });
  const groups = buildMovementGroups(events);

  return {
    txCount: events.reduce((total, event) => total + event.direction, 0),
    movementCount: events.length,
    totalUsd: events.reduce(
      (total, event) => total + event.direction * event.amountUsd,
      0,
    ),
    totalCup: events.reduce(
      (total, event) => total + event.direction * event.debtAmount,
      0,
    ),
    groups,
  };
}
