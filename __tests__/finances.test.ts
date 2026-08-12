import { describe, expect, it } from "vitest";
import {
  calculateCapitalTotal,
  formatFinanceNumberInput,
  parseFinanceNumberInput,
  signedFinanceAmount,
} from "@/lib/finances";

describe("finance calculations", () => {
  it("calculates net capital with USD, CUP, Zelle, remeseros and external debts", () => {
    expect(calculateCapitalTotal({
      cashUsd: 100,
      cashCup: 42000,
      usdCupRate: 420,
      zelleUsd: 500,
      remeserosNetCup: -84000,
      externalNetUsd: -50,
      externalNetCup: -42000,
    })).toBe(350);
  });

  it("does not calculate capital without a valid exchange rate", () => {
    expect(calculateCapitalTotal({
      cashUsd: 100,
      cashCup: 0,
      usdCupRate: null,
      zelleUsd: 0,
      remeserosNetCup: 0,
      externalNetUsd: 0,
      externalNetCup: 0,
    })).toBeNull();
  });

  it("keeps Miguel at 25 after +10, -5 and +20", () => {
    const balance =
      signedFinanceAmount("RECEIVABLE", 10) +
      signedFinanceAmount("RECEIVED", 5) +
      signedFinanceAmount("RECEIVABLE", 20);
    expect(balance).toBe(25);
  });

  it("maps payable movements with the opposite sign and allows crossing zero", () => {
    const balance =
      signedFinanceAmount("PAYABLE", 100) +
      signedFinanceAmount("PAID", 120);
    expect(balance).toBe(20);
  });

  it("formats editable financial values with thousands separators", () => {
    expect(formatFinanceNumberInput("1000")).toBe("1,000");
    expect(formatFinanceNumberInput("10000.5")).toBe("10,000.5");
    expect(formatFinanceNumberInput("1,234,567.89")).toBe("1,234,567.89");
    expect(parseFinanceNumberInput("1,234,567.89")).toBe(1234567.89);
  });
});
