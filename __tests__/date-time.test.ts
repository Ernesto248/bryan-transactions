import { describe, expect, it } from "vitest";
import { formatTransactionDate } from "@/lib/date-time";

describe("formatTransactionDate", () => {
  it("uses daylight saving time during summer", () => {
    const formatted = formatTransactionDate("2026-08-06T15:00:00.000Z");

    expect(formatted).toContain("11:00");
  });

  it("uses standard time during winter", () => {
    const formatted = formatTransactionDate("2026-02-05T16:00:00.000Z");

    expect(formatted).toContain("11:00");
  });
});
