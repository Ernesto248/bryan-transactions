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
  ownerFeePercent: number;
  selected: ZelleValuationSummary;
};

export function calculateWireSettlementAmount({
  principalUsd,
  settlementCurrency,
  conversionRate,
  feePercent,
}: Omit<CalculateWireProfitInput, "globalRate" | "selected" | "ownerFeePercent">) {
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
  ownerFeePercent,
  selected,
}: CalculateWireProfitInput): WireProfitSnapshot {
  const settlementAmount = calculateWireSettlementAmount({
    principalUsd,
    settlementCurrency,
    conversionRate,
    feePercent,
  });
  const ownerFeeAmount = roundMoney(
    (settlementCurrency === "CUP" ? settlementAmount : principalUsd)
      * ownerFeePercent / 100,
  );
  const ownerFeeCup = roundMoney(
    settlementCurrency === "CUP"
      ? ownerFeeAmount
      : ownerFeeAmount * globalRate,
  );
  const ownerFeeUsd = roundMoney(
    settlementCurrency === "USD"
      ? ownerFeeAmount
      : ownerFeeAmount / globalRate,
  );

  if (selected.pricedUsd <= 0 || selected.averagePrice === null) {
    return {
      status: "UNAVAILABLE",
      globalRate,
      settlementAmount,
      fifoCostCup: null,
      profitCup: null,
      profitUsd: null,
      ownerFeePercent: roundMoney(ownerFeePercent),
      ownerFeeAmount,
      ownerFeeCup,
      ownerFeeUsd,
      netProfitCup: null,
      netProfitUsd: null,
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
  const netProfitCup = roundMoney(profitCup - ownerFeeCup);

  return {
    status,
    globalRate,
    settlementAmount,
    fifoCostCup,
    profitCup,
    profitUsd: roundMoney(profitCup / globalRate),
    ownerFeePercent: roundMoney(ownerFeePercent),
    ownerFeeAmount,
    ownerFeeCup,
    ownerFeeUsd,
    netProfitCup,
    netProfitUsd: roundMoney(netProfitCup / globalRate),
  };
}
