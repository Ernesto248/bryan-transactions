export const TRANSACTION_TIME_ZONE = "America/New_York";

export function formatTransactionDate(dateString: string) {
  const date = new Date(dateString);

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TRANSACTION_TIME_ZONE,
  }).format(date);
}
