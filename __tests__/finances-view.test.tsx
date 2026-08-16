import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinancesView } from "@/components/dashboard/finances-view";
import type { FinanceOverview } from "@/lib/types";

const overview: FinanceOverview = {
  settings: {
    cashUsd: 100,
    cashCup: 42000,
    usdCupRate: 420,
    updatedAt: "2026-08-07T10:00:00.000Z",
  },
  totals: {
    zelleUsd: 500,
    zelleValuation: {
      balanceUsd: 500,
      inventoryUsd: 500,
      deficitUsd: 0,
      pricedUsd: 400,
      unpricedUsd: 100,
      costCup: 272000,
      averagePrice: 680,
      coveragePercent: 80,
      accounts: [{
        accountId: "a-1",
        accountName: "Cuenta principal",
        balanceUsd: 500,
        inventoryUsd: 500,
        deficitUsd: 0,
        pricedUsd: 400,
        unpricedUsd: 100,
        costCup: 272000,
        averagePrice: 680,
        coveragePercent: 80,
      }],
    },
    pendingAssignments: {
      count: 2,
      amountUsd: 50,
    },
    remeseros: {
      receivableCup: 16000,
      payableCup: 100000,
      netCup: -84000,
      netUsd: -200,
    },
    external: {
      receivableUsd: 25,
      payableUsd: 75,
      netUsd: -50,
      receivableCup: 10000,
      payableCup: 52000,
      netCup: -42000,
      netCupUsd: -100,
    },
    capitalTotalUsd: 300,
    wireProfits: {
      lifetime: {
        profitCup: 183000, profitUsd: 271.11,
        exactProfitCup: 183000, exactProfitUsd: 271.11,
        estimatedProfitCup: 0, estimatedProfitUsd: 0,
        exactCount: 1, estimatedCount: 0, pendingCount: 0,
        ownerFeeCup: 140000, ownerFeeUsd: 207.41,
        netProfitCup: 43000, netProfitUsd: 63.7,
        netExactProfitCup: 43000, netExactProfitUsd: 63.7,
        netEstimatedProfitCup: 0, netEstimatedProfitUsd: 0,
        netExactCount: 1, netEstimatedCount: 0, netPendingCount: 0,
      },
      currentMonth: {
        profitCup: 183000, profitUsd: 271.11,
        exactProfitCup: 183000, exactProfitUsd: 271.11,
        estimatedProfitCup: 0, estimatedProfitUsd: 0,
        exactCount: 1, estimatedCount: 0, pendingCount: 0,
        ownerFeeCup: 140000, ownerFeeUsd: 207.41,
        netProfitCup: 43000, netProfitUsd: 63.7,
        netExactProfitCup: 43000, netExactProfitUsd: 63.7,
        netEstimatedProfitCup: 0, netEstimatedProfitUsd: 0,
        netExactCount: 1, netEstimatedCount: 0, netPendingCount: 0,
      },
    },
  },
  counterparties: [],
  settingChanges: [],
  expenses: [],
  cashMovements: [],
  exchanges: [],
};

describe("FinancesView", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the financial overview only when the view mounts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, overview }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FinancesView />);

    expect(await screen.findByText("$ 300 USD")).toBeTruthy();
    expect(screen.getByText("Pendiente de asignar")).toBeTruthy();
    expect(screen.getByText("- $ 50 USD")).toBeTruthy();
    expect(screen.getByText("2 transacciones reservadas")).toBeTruthy();
    expect(screen.getByText("Zelle USD")).toBeTruthy();
    expect(screen.getByText("Deuda con remeseros")).toBeTruthy();
    expect(screen.getByText("Externas por pagar")).toBeTruthy();
    expect(screen.getByText("Ganancia de wires")).toBeTruthy();
    expect(screen.getAllByText("43,000 CUP")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith("/api/finances?view=summary", { cache: "no-store" });
  });

  it("sends editable balances and rate through the audited settings endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, overview }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, overview }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<FinancesView />);

    await screen.findByText("$ 300 USD");
    expect(screen.queryByLabelText("Efectivo USD")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Editar balances" }));

    const cashUsdInput = await screen.findByLabelText("Efectivo USD");
    expect((screen.getByLabelText("Efectivo CUP") as HTMLInputElement).value).toBe("42,000");
    fireEvent.change(cashUsdInput, { target: { value: "250500.5" } });
    expect((cashUsdInput as HTMLInputElement).value).toBe("250,500.5");
    fireEvent.change(screen.getByLabelText("Nota del cambio"), { target: { value: "Conteo de caja" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar valores" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const settingsCall = fetchMock.mock.calls[1];
    expect(settingsCall[0]).toBe("/api/finances/settings");
    expect(JSON.parse(settingsCall[1].body)).toMatchObject({
      cashUsd: 250500.5,
      cashCup: 42000,
      usdCupRate: 420,
      note: "Conteo de caja",
    });
  });

  it("keeps external debt cards collapsed and expands them independently", async () => {
    const counterpartyOverview: FinanceOverview = {
      ...overview,
      counterparties: [
        {
          id: "c-1",
          name: "Miguel",
          balanceUsd: 25,
          balanceCup: -10000,
          archivedAt: null,
          createdAt: "2026-08-07T10:00:00.000Z",
          updatedAt: "2026-08-07T10:00:00.000Z",
          movements: [],
        },
        {
          id: "c-2",
          name: "Camila",
          balanceUsd: 0,
          balanceCup: 0,
          archivedAt: null,
          createdAt: "2026-08-07T10:00:00.000Z",
          updatedAt: "2026-08-07T10:00:00.000Z",
          movements: [],
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, overview: counterpartyOverview }),
    }));

    render(<FinancesView />);

    const expandMiguel = await screen.findByRole("button", { name: "Ver detalles de Miguel" });
    const expandCamila = screen.getByRole("button", { name: "Ver detalles de Camila" });
    expect(expandMiguel.getAttribute("aria-expanded")).toBe("false");
    expect(expandCamila.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Registrar movimiento" })).toBeNull();

    fireEvent.click(expandMiguel);

    expect(await screen.findByRole("button", { name: "Registrar movimiento" })).toBeTruthy();
    expect(screen.getByText("Establece directamente el total que esa persona te debe.")).toBeTruthy();
    const amountInput = screen.getByLabelText("Monto") as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "10000.5" } });
    expect(amountInput.value).toBe("10,000.5");
    fireEvent.change(screen.getByLabelText("Movimiento"), { target: { value: "SET_PAYABLE" } });
    expect(screen.getByText("Establece directamente el total que tú le debes.")).toBeTruthy();
    const collapseMiguel = screen.getByRole("button", { name: "Contraer detalles de Miguel" });
    expect(collapseMiguel.getAttribute("aria-expanded")).toBe("true");
    expect(expandCamila.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(collapseMiguel);
    expect(screen.queryByRole("button", { name: "Registrar movimiento" })).toBeNull();
  });

  it("confirms and permanently deletes an external debt", async () => {
    const counterpartyOverview: FinanceOverview = {
      ...overview,
      counterparties: [{
        id: "c-1",
        name: "Miguel",
        balanceUsd: 25,
        balanceCup: 0,
        archivedAt: null,
        createdAt: "2026-08-07T10:00:00.000Z",
        updatedAt: "2026-08-07T10:00:00.000Z",
        movements: [],
      }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, overview: counterpartyOverview }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, movements: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, overview }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<FinancesView />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver detalles de Miguel" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByRole("heading", { name: "Eliminar deuda externa" })).toBeTruthy();
    expect(screen.getByText(/todo su historial manual/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[2]).toEqual([
      "/api/finances/counterparties/c-1",
      { method: "DELETE" },
    ]);
  });

  it("registers a formatted expense against the selected currency balance", async () => {
    const updatedOverview: FinanceOverview = {
      ...overview,
      settings: { ...overview.settings, cashCup: 31999.5 },
      expenses: [
        {
          id: "e-1",
          currency: "CUP",
          amount: 10000.5,
          description: "Renta",
          balanceBefore: 42000,
          balanceAfter: 31999.5,
          occurredAt: "2026-08-07T10:00:00.000Z",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, overview }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, overview: updatedOverview }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<FinancesView />);

    await screen.findByText("$ 300 USD");
    fireEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));
    fireEvent.change(await screen.findByLabelText("Moneda"), { target: { value: "CUP" } });
    const amountInput = screen.getByLabelText("Monto") as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "10000.5" } });
    expect(amountInput.value).toBe("10,000.5");
    fireEvent.change(screen.getByLabelText("Concepto"), { target: { value: "Renta" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/finances/expenses");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      currency: "CUP",
      amount: 10000.5,
      description: "Renta",
    });
    expect(await screen.findByText("-10,000.5 CUP")).toBeTruthy();
  });
});
