import { roundMoney } from "@/lib/finance-ledger";
import type {
  FinanceCurrency,
  WireProfitSnapshot,
  ZelleValuationSummary,
} from "@/lib/types";

type CalculateWireProfitInput = {
  principalUsd: number;
  settlementCurrency: FinanceCurrency;
  conversionRate?: number;
  feePercent?: number;
  globalRate: number;
  selected: ZelleValuationSummary;
};

export function calculateWireSettlementAmount({
  principalUsd,
  settlementCurrency,
  conversionRate,
  feePercent,
}: Omit<CalculateWireProfitInput, "globalRate" | "selected">) {
  return roundMoney(
    settlementCurrency === "CUP"
      ? principalUsd * (conversionRate ?? 0)
      : principalUsd * (1 + (feePercent ?? 0) / 100),
  );
}
export function calculateWireProfit({
  principalUsd,
  settlementCurrency,
  conversionRate,
  feePercent,
  globalRate,
  selected,
}: CalculateWireProfitInput): WireProfitSnapshot {
  const settlementAmount = calculateWireSettlementAmount({
    principalUsd,
    settlementCurrency,
    conversionRate,
    feePercent,
  });

  if (selected.pricedUsd <= 0 || selected.averagePrice === null) {
    return {
      status: "UNAVAILABLE",
      globalRate,
      settlementAmount,
      fifoCostCup: null,
      profitCup: null,
      profitUsd: null,
    };
  }

  const status = selected.unpricedUsd > 0 ? "ESTIMATED" : "EXACT";
  const fifoCostCup = status === "EXACT"
    ? roundMoney(selected.costCup)
    : roundMoney(
        selected.costCup + selected.unpricedUsd * selected.averagePrice,
      );
  const revenueCup = settlementCurrency === "CUP"
    ? settlementAmount
    : roundMoney(settlementAmount * globalRate);
  const profitCup = roundMoney(revenueCup - fifoCostCup);

  return {
    status,
    globalRate,
    settlementAmount,
    fifoCostCup,
    profitCup,
    profitUsd: roundMoney(profitCup / globalRate),
  };
}
