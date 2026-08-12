import { describe, expect, it } from "vitest";
import {
  calculateZelleInventory,
  previewWire,
  summarizeZelleInventories,
} from "@/lib/zelle-inventory";

const baseDate = new Date("2026-08-01T12:00:00.000Z");

function dateAt(minutes: number) {
  return new Date(baseDate.getTime() + minutes * 60_000).toISOString();
}

describe("Zelle FIFO inventory", () => {
  it("values a wire across lots and leaves the correct weighted remainder", () => {
    const inventory = calculateZelleInventory({
      accountId: "account-1",
      accountName: "BDR",
      transactions: [
        { id: "t-1", amountUsd: 3000, priceApplied: 687, occurredAt: dateAt(1) },
        { id: "t-2", amountUsd: 4000, priceApplied: 685, occurredAt: dateAt(2) },
        { id: "t-3", amountUsd: 3000, priceApplied: 680, occurredAt: dateAt(3) },
      ],
      outflows: [],
    });

    const preview = previewWire(inventory, 4000);

    expect(preview.canCreate).toBe(true);
    expect(preview.selected).toMatchObject({
      pricedUsd: 4000,
      unpricedUsd: 0,
      costCup: 2746000,
      averagePrice: 686.5,
      coveragePercent: 100,
    });
    expect(preview.remaining).toMatchObject({
      balanceUsd: 6000,
      averagePrice: 682.5,
      costCup: 4095000,
    });
  });

  it("lets previous expenses consume the oldest lots", () => {
    const inventory = calculateZelleInventory({
      accountId: "account-1",
      accountName: "BDR",
      transactions: [
        { id: "t-1", amountUsd: 3000, priceApplied: 687, occurredAt: dateAt(1) },
        { id: "t-2", amountUsd: 4000, priceApplied: 685, occurredAt: dateAt(3) },
      ],
      outflows: [
        { id: "expense-1", amountUsd: 2500, occurredAt: dateAt(2) },
      ],
    });

    const preview = previewWire(inventory, 1000);

    expect(preview.selected.averagePrice).toBe(686);
    expect(preview.selected.costCup).toBe(686000);
    expect(preview.remaining.balanceUsd).toBe(3500);
    expect(preview.remaining.averagePrice).toBe(685);
  });

  it("reports partial coverage when selected FIFO lots have no active price", () => {
    const inventory = calculateZelleInventory({
      accountId: "account-1",
      accountName: "BDR",
      transactions: [
        { id: "t-1", amountUsd: 100, priceApplied: null, occurredAt: dateAt(1) },
        { id: "t-2", amountUsd: 100, priceApplied: 680, occurredAt: dateAt(2) },
      ],
      outflows: [],
    });

    const preview = previewWire(inventory, 150);

    expect(preview.canCreate).toBe(true);
    expect(preview.selected).toMatchObject({
      pricedUsd: 50,
      unpricedUsd: 100,
      coveragePercent: 33.33,
      averagePrice: 680,
      costCup: 34000,
    });
  });

  it("blocks a wire above the current balance and represents deficits separately", () => {
    const inventory = calculateZelleInventory({
      accountId: "account-1",
      accountName: "BDR",
      transactions: [
        { id: "t-1", amountUsd: 100, priceApplied: 680, occurredAt: dateAt(1) },
        { id: "t-negative", amountUsd: -150, priceApplied: null, occurredAt: dateAt(2) },
      ],
      outflows: [],
    });

    expect(inventory.valuation).toMatchObject({
      balanceUsd: -50,
      inventoryUsd: 0,
      deficitUsd: 50,
      pricedUsd: 0,
    });
    expect(previewWire(inventory, 1).canCreate).toBe(false);
  });

  it("reconciles legacy adjustments as unpriced inventory", () => {
    const inventory = calculateZelleInventory({
      accountId: "account-1",
      accountName: "BDR",
      incomingAdjustment: 50,
      outgoingAdjustment: 25,
      transactions: [
        { id: "t-1", amountUsd: 100, priceApplied: 680, occurredAt: dateAt(1) },
      ],
      outflows: [],
    });

    expect(inventory.valuation).toMatchObject({
      balanceUsd: 125,
      pricedUsd: 75,
      unpricedUsd: 50,
      costCup: 51000,
    });
  });

  it("calculates the global weighted average without mixing account deficits", () => {
    const first = calculateZelleInventory({
      accountId: "a-1",
      accountName: "BDR",
      transactions: [{ id: "t-1", amountUsd: 100, priceApplied: 680, occurredAt: dateAt(1) }],
      outflows: [],
    });
    const second = calculateZelleInventory({
      accountId: "a-2",
      accountName: "Pisco",
      transactions: [{ id: "t-2", amountUsd: 50, priceApplied: 700, occurredAt: dateAt(1) }],
      outflows: [{ id: "w-1", amountUsd: 75, occurredAt: dateAt(2) }],
    });

    const total = summarizeZelleInventories([first, second]);
    expect(total.summary).toMatchObject({
      balanceUsd: 75,
      inventoryUsd: 100,
      deficitUsd: 25,
      averagePrice: 680,
    });
  });
});
