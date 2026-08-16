import type {
  FinanceCurrency,
  FinanceMovementType,
  FinanceOverviewTotals,
} from "@/lib/types";

export function financeMovementSign(type: FinanceMovementType): 1 | -1 {
  return type === "RECEIVABLE" || type === "PAID" || type === "SET_RECEIVABLE"
    ? 1
    : -1;
}

export function signedFinanceAmount(type: FinanceMovementType, amount: number) {
  return financeMovementSign(type) * amount;
}

export function formatFinanceNumberInput(value: string | number) {
  const rawValue = String(value).replace(/,/g, "").trim();
  if (!rawValue) return "";

  const isNegative = rawValue.startsWith("-");
  const unsignedValue = isNegative ? rawValue.slice(1) : rawValue;

  const decimalIndex = unsignedValue.indexOf(".");
  const integerSource = decimalIndex === -1 ? unsignedValue : unsignedValue.slice(0, decimalIndex);
  const decimalSource = decimalIndex === -1 ? null : unsignedValue.slice(decimalIndex + 1);
  const integerDigits = integerSource.replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "0";
  const groupedInteger = integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const prefix = isNegative ? "-" : "";
  if (decimalSource === null) return `${prefix}${groupedInteger}`;
  return `${prefix}${groupedInteger}.${decimalSource.replace(/\D/g, "").slice(0, 2)}`;
}

export function parseFinanceNumberInput(value: string) {
  return Number(value.replace(/,/g, ""));
}

export function calculateCapitalTotal(input: {
  cashUsd: number;
  cashCup: number;
  usdCupRate: number | null;
  zelleUsd: number;
  remeserosNetCup: number;
  externalNetUsd: number;
  externalNetCup: number;
}): number | null {
  if (!input.usdCupRate || input.usdCupRate <= 0) return null;

  return (
    input.cashUsd +
    input.zelleUsd +
    input.externalNetUsd +
    (input.cashCup + input.remeserosNetCup + input.externalNetCup) /
      input.usdCupRate
  );
}

export function emptyFinanceTotals(): FinanceOverviewTotals {
  return {
    zelleUsd: 0,
    zelleValuation: {
      balanceUsd: 0,
      inventoryUsd: 0,
      deficitUsd: 0,
      pricedUsd: 0,
      unpricedUsd: 0,
      costCup: 0,
      averagePrice: null,
      coveragePercent: 0,
      accounts: [],
    },
    remeseros: {
      receivableCup: 0,
      payableCup: 0,
      netCup: 0,
      netUsd: null,
    },
    external: {
      receivableUsd: 0,
      payableUsd: 0,
      netUsd: 0,
      receivableCup: 0,
      payableCup: 0,
      netCup: 0,
      netCupUsd: null,
    },
    capitalTotalUsd: null,
    wireProfits: {
      lifetime: {
        profitCup: 0, profitUsd: 0,
        exactProfitCup: 0, exactProfitUsd: 0,
        estimatedProfitCup: 0, estimatedProfitUsd: 0,
        exactCount: 0, estimatedCount: 0, pendingCount: 0,
        ownerFeeCup: 0, ownerFeeUsd: 0, netProfitCup: 0, netProfitUsd: 0,
        netExactProfitCup: 0, netExactProfitUsd: 0, netEstimatedProfitCup: 0, netEstimatedProfitUsd: 0,
        netExactCount: 0, netEstimatedCount: 0, netPendingCount: 0,
      },
      currentMonth: {
        profitCup: 0, profitUsd: 0,
        exactProfitCup: 0, exactProfitUsd: 0,
        estimatedProfitCup: 0, estimatedProfitUsd: 0,
        exactCount: 0, estimatedCount: 0, pendingCount: 0,
        ownerFeeCup: 0, ownerFeeUsd: 0, netProfitCup: 0, netProfitUsd: 0,
        netExactProfitCup: 0, netExactProfitUsd: 0, netEstimatedProfitCup: 0, netEstimatedProfitUsd: 0,
        netExactCount: 0, netEstimatedCount: 0, netPendingCount: 0,
      },
    },
  };
}

export function financeCurrencyLabel(currency: FinanceCurrency) {
  return currency === "USD" ? "USD" : "CUP";
}
