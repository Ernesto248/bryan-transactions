import { describe, expect, it } from "vitest";
import { calculateWireProfit } from "@/lib/wire-profit";
import type { ZelleValuationSummary } from "@/lib/types";

function selected(overrides: Partial<ZelleValuationSummary>): ZelleValuationSummary {
  return {
    balanceUsd: 10025,
    inventoryUsd: 10025,
    deficitUsd: 0,
    pricedUsd: 10025,
    unpricedUsd: 0,
    costCup: 6817000,
    averagePrice: 680,
    coveragePercent: 100,
    ...overrides,
  };
}

describe("wire profit", () => {
  it("calculates the confirmed CUP example including the fixed fee in FIFO cost", () => {
    expect(calculateWireProfit({
      principalUsd: 10000,
      settlementCurrency: "CUP",
      conversionRate: 700,
      globalRate: 675,
      ownerFeePercent: 2,
      selected: selected({}),
    })).toEqual({
      status: "EXACT",
      globalRate: 675,
      settlementAmount: 7000000,
      fifoCostCup: 6817000,
      profitCup: 183000,
      profitUsd: 271.11,
      ownerFeePercent: 2,
      ownerFeeAmount: 140000,
      ownerFeeCup: 140000,
      ownerFeeUsd: 207.41,
      netProfitCup: 43000,
      netProfitUsd: 63.7,
    });
  });

  it("estimates unpriced USD using the average of the priced portion", () => {
    expect(calculateWireProfit({
      principalUsd: 150,
      settlementCurrency: "CUP",
      conversionRate: 700,
      globalRate: 675,
      ownerFeePercent: 2,
      selected: selected({
        balanceUsd: 150,
        inventoryUsd: 150,
        pricedUsd: 50,
        unpricedUsd: 100,
        costCup: 34000,
        coveragePercent: 33.33,
      }),
    })).toMatchObject({
      status: "ESTIMATED",
      settlementAmount: 105000,
      fifoCostCup: 102000,
      profitCup: 3000,
      profitUsd: 4.44,
    });
  });

  it("keeps the wire available but leaves profit pending when no USD has a price", () => {
    expect(calculateWireProfit({
      principalUsd: 100,
      settlementCurrency: "USD",
      feePercent: 5,
      globalRate: 675,
      ownerFeePercent: 2,
      selected: selected({
        pricedUsd: 0,
        unpricedUsd: 100,
        costCup: 0,
        averagePrice: null,
        coveragePercent: 0,
      }),
    })).toEqual({
      status: "UNAVAILABLE",
      globalRate: 675,
      settlementAmount: 105,
      fifoCostCup: null,
      profitCup: null,
      profitUsd: null,
      ownerFeePercent: 2,
      ownerFeeAmount: 2,
      ownerFeeCup: 1350,
      ownerFeeUsd: 2,
      netProfitCup: null,
      netProfitUsd: null,
    });
  });

  it("uses the USD principal instead of the client surcharge for the owner commission", () => {
    expect(calculateWireProfit({
      principalUsd: 10000,
      settlementCurrency: "USD",
      feePercent: 5,
      globalRate: 675,
      ownerFeePercent: 2,
      selected: selected({ pricedUsd: 10000, unpricedUsd: 0, costCup: 6800000 }),
    })).toMatchObject({
      settlementAmount: 10500,
      ownerFeeAmount: 200,
      ownerFeeCup: 135000,
      netProfitCup: 152500,
    });
  });
});
