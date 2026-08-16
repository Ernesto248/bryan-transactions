import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilterBar, type DateFilter } from "@/components/dashboard/filter-bar";

function FilterBarHarness() {
  const [bankFilter, setBankFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [senderFilter, setSenderFilter] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const [amountFilter, setAmountFilter] = useState("");
  const [remeseroFilter, setRemeseroFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customDateRange, setCustomDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });

  return (
    <FilterBar
      bankFilter={bankFilter}
      setBankFilter={setBankFilter}
      bankOptions={[]}
      accountFilter={accountFilter}
      setAccountFilter={setAccountFilter}
      accountOptions={[]}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      senderFilter={senderFilter}
      setSenderFilter={setSenderFilter}
      codeFilter={codeFilter}
      setCodeFilter={setCodeFilter}
      amountFilter={amountFilter}
      setAmountFilter={setAmountFilter}
      remeseroFilter={remeseroFilter}
      setRemeseroFilter={setRemeseroFilter}
      remeseroOptions={[]}
      dateFilter={dateFilter}
      setDateFilter={setDateFilter}
      customDateRange={customDateRange}
      setCustomDateRange={setCustomDateRange}
    />
  );
}

describe("FilterBar code filter", () => {
  it("counts and clears the code filter", () => {
    render(<FilterBarHarness />);

    const filtersButton = screen.getByRole("button", { name: /Filtros/i });
    fireEvent.click(filtersButton);

    const input = screen.getByPlaceholderText(
      "Código de confirmación",
    ) as HTMLInputElement;
    const advancedFiltersGrid = input.closest(".grid");
    expect(advancedFiltersGrid?.className).toContain("sm:grid-cols-2");
    expect(advancedFiltersGrid?.className).toContain("xl:grid-cols-4");
    fireEvent.change(input, { target: { value: "WF%_123" } });

    expect(input.value).toBe("WF%_123");
    expect(filtersButton.textContent).toContain("1");

    fireEvent.click(
      screen.getByRole("button", { name: /Limpiar todos los filtros/i }),
    );

    expect(input.value).toBe("");
    expect(filtersButton.textContent).not.toContain("1");
  });
});
