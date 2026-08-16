"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  ChevronDown,
  CircleDollarSign,
  Landmark,
  Plus,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  Scale,
  SlidersHorizontal,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatFinanceNumberInput,
  parseFinanceNumberInput,
} from "@/lib/finances";
import type {
  FinanceCounterparty,
  FinanceCurrency,
  FinanceMovementType,
  FinanceOverview,
  WireProfitPeriodSummary,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type MovementDraft = {
  movementType: FinanceMovementType;
  currency: FinanceCurrency;
  amount: string;
  note: string;
};

const movementLabels: Record<FinanceMovementType, string> = {
  RECEIVABLE: "Me debe (histórico)",
  RECEIVED: "Registrar cobro",
  PAYABLE: "Le debo (histórico)",
  PAID: "Registrar pago",
  SET_RECEIVABLE: "Fijar que me debe",
  SET_PAYABLE: "Fijar que le debo",
};

const movementDescriptions: Record<FinanceMovementType, string> = {
  RECEIVABLE: "Movimiento incremental anterior.",
  RECEIVED: "Reduce la deuda y aumenta tu efectivo en la misma moneda.",
  PAYABLE: "Movimiento incremental anterior.",
  PAID: "Reduce lo que debes y descuenta tu efectivo en la misma moneda.",
  SET_RECEIVABLE: "Establece directamente el total que esa persona te debe.",
  SET_PAYABLE: "Establece directamente el total que tú le debes.",
};

const EMPTY_WIRE_PROFIT_PERIOD: WireProfitPeriodSummary = {
  profitCup: 0,
  profitUsd: 0,
  exactProfitCup: 0,
  exactProfitUsd: 0,
  estimatedProfitCup: 0,
  estimatedProfitUsd: 0,
  exactCount: 0,
  estimatedCount: 0,
  pendingCount: 0,
  ownerFeeCup: 0,
  ownerFeeUsd: 0,
  netProfitCup: 0,
  netProfitUsd: 0,
  netExactProfitCup: 0,
  netExactProfitUsd: 0,
  netEstimatedProfitCup: 0,
  netEstimatedProfitUsd: 0,
  netExactCount: 0,
  netEstimatedCount: 0,
  netPendingCount: 0,
};

const movementOptions: FinanceMovementType[] = [
  "SET_RECEIVABLE",
  "RECEIVED",
  "SET_PAYABLE",
  "PAID",
];

const DEFAULT_MOVEMENT_DRAFT: MovementDraft = {
  movementType: "SET_RECEIVABLE",
  currency: "USD",
  amount: "",
  note: "",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-DO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function BalanceValue({ value, currency }: { value: number; currency: FinanceCurrency }) {
  const kind = value > 0 ? "Me debe" : value < 0 ? "Le debo" : "Saldado";
  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{currency}</p>
      <p className={cn("mt-1 text-lg font-semibold", value > 0 && "text-emerald-400", value < 0 && "text-amber-300")}>
        {formatNumber(Math.abs(value))}
      </p>
      <p className="text-xs text-muted-foreground">{kind}</p>
    </div>
  );
}

function CompactBalanceValue({ value, currency }: { value: number; currency: FinanceCurrency }) {
  const kind = value > 0 ? "Me debe" : value < 0 ? "Le debo" : "Saldado";
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs">
      <span className="font-medium text-muted-foreground">{currency}</span>
      <span className={cn("truncate font-semibold", value > 0 && "text-emerald-400", value < 0 && "text-amber-300")}>
        {kind} {formatNumber(Math.abs(value))}
      </span>
    </div>
  );
}

export function FinancesView() {
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingExchange, setSavingExchange] = useState(false);
  const [creatingCounterparty, setCreatingCounterparty] = useState(false);
  const [newCounterpartyName, setNewCounterpartyName] = useState("");
  const [cashUsd, setCashUsd] = useState("0");
  const [cashCup, setCashCup] = useState("0");
  const [usdCupRate, setUsdCupRate] = useState("");
  const [settingsNote, setSettingsNote] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState<FinanceCurrency>("USD");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [exchangeDirection, setExchangeDirection] = useState<"USD_TO_CUP" | "CUP_TO_USD">("USD_TO_CUP");
  const [exchangeAmount, setExchangeAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [exchangeNote, setExchangeNote] = useState("");
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [movementDrafts, setMovementDrafts] = useState<Record<string, MovementDraft>>({});
  const [savingMovementById, setSavingMovementById] = useState<Record<string, boolean>>({});
  const [expandedCounterpartyIds, setExpandedCounterpartyIds] = useState<Record<string, boolean>>({});
  const [loadedCounterpartyMovementIds, setLoadedCounterpartyMovementIds] = useState<Record<string, boolean>>({});
  const [counterpartyToDelete, setCounterpartyToDelete] = useState<FinanceCounterparty | null>(null);
  const [deletingCounterparty, setDeletingCounterparty] = useState(false);
  const [deleteCounterpartyError, setDeleteCounterpartyError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/finances?view=summary", { cache: "no-store" });
      if (!response?.ok) return;
      const payload = (await response.json()) as { ok?: boolean; overview?: FinanceOverview };
      if (!payload.ok || !payload.overview) return;
      setOverview(payload.overview);
      setExpandedCounterpartyIds({});
      setLoadedCounterpartyMovementIds({});
      setCashUsd(formatFinanceNumberInput(payload.overview.settings.cashUsd));
      setCashCup(formatFinanceNumberInput(payload.overview.settings.cashCup));
      setUsdCupRate(
        payload.overview.settings.usdCupRate == null
          ? ""
          : formatFinanceNumberInput(payload.overview.settings.usdCupRate),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const getDraft = (id: string) => movementDrafts[id] ?? DEFAULT_MOVEMENT_DRAFT;
  const updateDraft = (id: string, patch: Partial<MovementDraft>) => {
    setMovementDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? DEFAULT_MOVEMENT_DRAFT), ...patch },
    }));
  };

  const toggleCounterparty = async (id: string) => {
    const willExpand = !expandedCounterpartyIds[id];
    setExpandedCounterpartyIds((current) => ({ ...current, [id]: willExpand }));
    const counterparty = overview?.counterparties.find((item) => item.id === id);
    if (!willExpand || !overview || !counterparty || loadedCounterpartyMovementIds[id]) return;
    const response = await fetch(`/api/finances/counterparties/${id}/movements?limit=20`, { cache: "no-store" });
    if (!response?.ok) return;
    const payload = await response.json() as { ok?: boolean; movements?: FinanceCounterparty["movements"] };
    if (!payload.ok || !Array.isArray(payload.movements)) return;
    setLoadedCounterpartyMovementIds((current) => ({ ...current, [id]: true }));
    setOverview((current) => current ? {
      ...current,
      counterparties: current.counterparties.map((item) => item.id === id ? { ...item, movements: payload.movements! } : item),
    } : current);
  };

  const saveSettings = async () => {
    const parsedCashUsd = parseFinanceNumberInput(cashUsd);
    const parsedCashCup = parseFinanceNumberInput(cashCup);
    const parsedRate = usdCupRate.trim() === "" ? null : parseFinanceNumberInput(usdCupRate);
    if (!Number.isFinite(parsedCashUsd)) return;
    if (!Number.isFinite(parsedCashCup)) return;
    if (parsedRate !== null && (!Number.isFinite(parsedRate) || parsedRate <= 0)) return;

    setSavingSettings(true);
    try {
      const response = await fetch("/api/finances/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cashUsd: parsedCashUsd,
          cashCup: parsedCashCup,
          usdCupRate: parsedRate,
          note: settingsNote.trim() || undefined,
        }),
      });
      if (!response.ok) return;
      setSettingsNote("");
      setSettingsOpen(false);
      await loadOverview();
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSettingsOpenChange = (open: boolean) => {
    setSettingsOpen(open);
    if (!open || !overview) return;

    setCashUsd(formatFinanceNumberInput(overview.settings.cashUsd));
    setCashCup(formatFinanceNumberInput(overview.settings.cashCup));
    setUsdCupRate(
      overview.settings.usdCupRate == null
        ? ""
        : formatFinanceNumberInput(overview.settings.usdCupRate),
    );
    setSettingsNote("");
  };

  const handleExpenseOpenChange = (open: boolean) => {
    setExpenseOpen(open);
    if (!open) return;

    setExpenseCurrency("USD");
    setExpenseAmount("");
    setExpenseDescription("");
    setExpenseError(null);
  };

  const saveExpense = async () => {
    if (!overview) return;
    const amount = parseFinanceNumberInput(expenseAmount);
    const description = expenseDescription.trim();
    if (!Number.isFinite(amount) || amount <= 0 || !description) return;

    setSavingExpense(true);
    setExpenseError(null);
    try {
      const response = await fetch("/api/finances/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currency: expenseCurrency, amount, description }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setExpenseError("No se pudo registrar el gasto.");
        return;
      }

      setExpenseOpen(false);
      setExpenseAmount("");
      setExpenseDescription("");
      await loadOverview();
    } finally {
      setSavingExpense(false);
    }
  };

  const createCounterparty = async () => {
    const name = newCounterpartyName.trim();
    if (!name) return;
    setCreatingCounterparty(true);
    try {
      const response = await fetch("/api/finances/counterparties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) return;
      setNewCounterpartyName("");
      await loadOverview();
    } finally {
      setCreatingCounterparty(false);
    }
  };

  const createMovement = async (counterparty: FinanceCounterparty) => {
    const draft = getDraft(counterparty.id);
    const amount = parseFinanceNumberInput(draft.amount);
    const isSetter = draft.movementType === "SET_RECEIVABLE" || draft.movementType === "SET_PAYABLE";
    if (!Number.isFinite(amount) || amount < 0 || (!isSetter && amount === 0)) return;
    setSavingMovementById((current) => ({ ...current, [counterparty.id]: true }));
    try {
      const response = await fetch(`/api/finances/counterparties/${counterparty.id}/movements`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, amount, note: draft.note.trim() || undefined }),
      });
      if (!response.ok) return;
      setMovementDrafts((current) => ({ ...current, [counterparty.id]: { ...DEFAULT_MOVEMENT_DRAFT } }));
      await loadOverview();
    } finally {
      setSavingMovementById((current) => ({ ...current, [counterparty.id]: false }));
    }
  };

  const revertMovement = async (counterpartyId: string, movementId: string) => {
    const response = await fetch(`/api/finances/counterparties/${counterpartyId}/movements`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ movementId, reason: "Revertido desde Finanzas" }),
    });
    if (response.ok) await loadOverview();
  };

  const saveExchange = async () => {
    const sourceAmount = parseFinanceNumberInput(exchangeAmount);
    const rate = parseFinanceNumberInput(exchangeRate);
    if (!Number.isFinite(sourceAmount) || sourceAmount <= 0 || !Number.isFinite(rate) || rate <= 0) return;
    setSavingExchange(true);
    setExchangeError(null);
    try {
      const response = await fetch("/api/finances/exchanges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          direction: exchangeDirection,
          sourceAmount,
          rate,
          note: exchangeNote.trim() || undefined,
        }),
      });
      if (!response.ok) {
        setExchangeError("No se pudo registrar el cambio de moneda.");
        return;
      }
      setExchangeOpen(false);
      setExchangeAmount("");
      setExchangeRate("");
      setExchangeNote("");
      await loadOverview();
    } finally {
      setSavingExchange(false);
    }
  };

  const revertExchange = async (exchangeId: string) => {
    const response = await fetch("/api/finances/exchanges", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exchangeId, reason: "Revertido desde Finanzas" }),
    });
    if (response.ok) await loadOverview();
  };

  const archiveCounterparty = async (counterparty: FinanceCounterparty) => {
    if (counterparty.balanceUsd !== 0 || counterparty.balanceCup !== 0) return;
    const response = await fetch(`/api/finances/counterparties/${counterparty.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    if (response.ok) await loadOverview();
  };

  const deleteCounterparty = async () => {
    if (!counterpartyToDelete) return;
    setDeletingCounterparty(true);
    setDeleteCounterpartyError(null);
    try {
      const response = await fetch(`/api/finances/counterparties/${counterpartyToDelete.id}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setDeleteCounterpartyError(
          payload?.error === "counterparty_has_linked_operations"
            ? "No se puede eliminar porque tiene wires, cobros o pagos vinculados. Revierte primero esas operaciones desde su lugar de origen."
            : "No se pudo eliminar la deuda externa.",
        );
        return;
      }
      setCounterpartyToDelete(null);
      await loadOverview();
    } finally {
      setDeletingCounterparty(false);
    }
  };

  if (loading && !overview) {
    return <div className="rounded-2xl border border-border/70 bg-card p-8 text-sm text-muted-foreground">Cargando finanzas...</div>;
  }

  if (!overview) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-card p-8 text-center">
        <p>No se pudo cargar el resumen financiero.</p>
        <Button className="mt-4" onClick={() => void loadOverview()}>Reintentar</Button>
      </div>
    );
  }

  const { settings, totals, counterparties, settingChanges, expenses, exchanges } = overview;
  const wireProfits = totals.wireProfits ?? {
    lifetime: EMPTY_WIRE_PROFIT_PERIOD,
    currentMonth: EMPTY_WIRE_PROFIT_PERIOD,
  };
  const hasRate = settings.usdCupRate !== null;
  const expenseAmountValue = parseFinanceNumberInput(expenseAmount);
  const selectedExpenseBalance = expenseCurrency === "USD" ? settings.cashUsd : settings.cashCup;
  const canSaveExpense = Number.isFinite(expenseAmountValue)
    && expenseAmountValue > 0
    && expenseDescription.trim().length > 0;
  const exchangeAmountValue = parseFinanceNumberInput(exchangeAmount);
  const exchangeRateValue = parseFinanceNumberInput(exchangeRate);
  const exchangeTarget = Number.isFinite(exchangeAmountValue) && exchangeAmountValue > 0
    && Number.isFinite(exchangeRateValue) && exchangeRateValue > 0
    ? exchangeDirection === "USD_TO_CUP"
      ? exchangeAmountValue * exchangeRateValue
      : exchangeAmountValue / exchangeRateValue
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold md:text-2xl">Finanzas</h2>
          <p className="text-sm text-muted-foreground">Posicion financiera actual y deudas externas auditables.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button className="col-span-2 sm:col-auto" variant="outline" onClick={() => void loadOverview()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" /> {loading ? "Actualizando..." : "Actualizar"}
          </Button>
          <Button variant="outline" onClick={() => handleExpenseOpenChange(true)}>
            <ReceiptText className="h-4 w-4" /> Registrar gasto
          </Button>
          <Button variant="outline" onClick={() => setExchangeOpen(true)}>
            <ArrowLeftRight className="h-4 w-4" /> Cambiar moneda
          </Button>
          <Button onClick={() => handleSettingsOpenChange(true)}>
            <SlidersHorizontal className="h-4 w-4" /> Editar balances
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card">
        <CardContent className="p-5 md:p-7">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Scale className="h-4 w-4" /> Capital neto total</div>
          <p className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {totals.capitalTotalUsd === null ? "Pendiente de tasa" : `$ ${formatNumber(totals.capitalTotalUsd)} USD`}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasRate ? `Conversion actual: 1 USD = ${formatNumber(settings.usdCupRate ?? 0)} CUP` : "Ingresa la tasa USD/CUP para convertir los valores en CUP."}
          </p>
          <p className="mt-1 text-xs text-amber-300">
            Reserva incluida: -$ {formatNumber(totals.zelleValuation.unpricedUsd)} USD del Zelle sin precio.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[
          { label: "Efectivo USD", value: `$ ${formatNumber(settings.cashUsd)}`, icon: Banknote },
          { label: "Efectivo CUP", value: `$ ${formatNumber(settings.cashCup)}`, icon: Wallet },
          { label: "Zelle USD", value: `$ ${formatNumber(totals.zelleUsd)}`, icon: Landmark },
          { label: "Remeseros neto", value: `$ ${formatNumber(totals.remeseros.netCup)} CUP`, icon: Users },
        ].map((item) => (
          <Card key={item.label} className="min-w-0 border-border/70 bg-card/80">
            <CardContent className="p-4">
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="mt-1 truncate text-lg font-semibold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="col-span-2 min-w-0 border-amber-500/30 bg-amber-500/10 xl:col-span-1">
          <CardContent className="p-4">
            <CircleDollarSign className="h-4 w-4 text-amber-300" />
            <p className="mt-3 text-xs uppercase tracking-wide text-amber-200">Reserva de Zelle sin precio</p>
            <p className="mt-1 break-words text-lg font-semibold leading-tight text-amber-100">
              - $ {formatNumber(totals.zelleValuation.unpricedUsd)} USD
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tomado de la valoracion actual del Zelle
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-card to-card">
        <CardHeader>
          <CardTitle>Valoración del Zelle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Precio promedio</p>
              <p className="mt-1 text-lg font-semibold">
                {totals.zelleValuation.averagePrice == null
                  ? "Sin valoración"
                  : `${formatNumber(totals.zelleValuation.averagePrice)} CUP/USD`}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Costo valorado</p>
              <p className="mt-1 text-lg font-semibold">{formatNumber(totals.zelleValuation.costCup)} CUP</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Cobertura</p>
              <p className="mt-1 text-lg font-semibold">{formatNumber(totals.zelleValuation.coveragePercent)}%</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNumber(totals.zelleValuation.pricedUsd)} de {formatNumber(totals.zelleValuation.inventoryUsd)} USD
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Sin precio / déficit</p>
              <p className="mt-1 text-lg font-semibold text-amber-300">
                {formatNumber(totals.zelleValuation.unpricedUsd)} USD
              </p>
              {totals.zelleValuation.deficitUsd > 0 ? (
                <p className="mt-1 text-xs text-red-400">Déficit: {formatNumber(totals.zelleValuation.deficitUsd)} USD</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {totals.zelleValuation.accounts.map((account) => (
              <div key={account.accountId} className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{account.accountName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatNumber(account.pricedUsd)} valorados · {formatNumber(account.unpricedUsd)} sin precio
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{formatNumber(account.balanceUsd)} USD</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {account.averagePrice == null ? "Sin promedio" : `${formatNumber(account.averagePrice)} CUP/USD`}
                    </p>
                  </div>
                </div>
                {account.deficitUsd > 0 ? (
                  <p className="mt-2 text-xs text-red-400">Déficit: {formatNumber(account.deficitUsd)} USD</p>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-card to-card">
        <CardHeader>
          <CardTitle>Ganancia de wires</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {[
            { label: "Mes actual", value: wireProfits.currentMonth },
            { label: "Histórico", value: wireProfits.lifetime },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-border/70 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className={`mt-2 text-xl font-semibold ${value.netProfitCup < 0 ? "text-red-400" : "text-emerald-400"}`}>
                {formatNumber(value.netProfitCup)} CUP
              </p>
              <p className={`text-sm ${value.netProfitUsd < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                {formatNumber(value.netProfitUsd)} USD netos
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <p>Exactos <strong className="block text-foreground">{value.netExactCount}</strong></p>
                <p>Estimados <strong className="block text-foreground">{value.netEstimatedCount}</strong></p>
                <p>Pendientes <strong className="block text-foreground">{value.netPendingCount}</strong></p>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Bruta: {formatNumber(value.profitCup)} CUP · Comisión dueños: {formatNumber(value.ownerFeeCup)} CUP
                <br />Exacta neta: {formatNumber(value.netExactProfitCup)} CUP / {formatNumber(value.netExactProfitUsd)} USD
                {" · "}Estimada neta: {formatNumber(value.netEstimatedProfitCup)} CUP / {formatNumber(value.netEstimatedProfitUsd)} USD
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Gastos recientes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {expenses.length === 0 ? <p className="text-sm text-muted-foreground">Sin gastos registrados.</p> : null}
              {expenses.map((expense) => (
                <div key={expense.id} className="rounded-xl border border-border/60 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-medium">{expense.description}</p>
                    <p className="shrink-0 font-semibold text-amber-300">-{formatNumber(expense.amount)} {expense.currency}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(expense.occurredAt)} · Saldo {formatNumber(expense.balanceBefore)} → {formatNumber(expense.balanceAfter)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cambios de moneda</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {exchanges.length === 0 ? <p className="text-sm text-muted-foreground">Sin cambios registrados.</p> : null}
              {exchanges.map((exchange) => {
                const sourceCurrency = exchange.direction === "USD_TO_CUP" ? "USD" : "CUP";
                const targetCurrency = exchange.direction === "USD_TO_CUP" ? "CUP" : "USD";
                return (
                  <div key={exchange.id} className={cn("rounded-xl border border-border/60 p-3 text-sm", exchange.revertedAt && "opacity-50")}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{formatNumber(exchange.sourceAmount)} {sourceCurrency} → {formatNumber(exchange.targetAmount)} {targetCurrency}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Tasa {formatNumber(exchange.rate)} · {formatDate(exchange.occurredAt)}</p>
                      </div>
                      {exchange.revertedAt ? <Badge variant="outline">Revertido</Badge> : (
                        <Button variant="ghost" size="icon" aria-label="Revertir cambio de moneda" onClick={() => void revertExchange(exchange.id)}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Desglose del capital</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Remeseros por cobrar</p>
                <p className="mt-1 text-lg font-semibold text-emerald-400">{formatNumber(totals.remeseros.receivableCup)} CUP</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Deuda con remeseros</p>
                <p className="mt-1 text-lg font-semibold text-amber-300">{formatNumber(totals.remeseros.payableCup)} CUP</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Externas por cobrar</p>
                <p className="mt-1 font-semibold text-emerald-400">{formatNumber(totals.external.receivableUsd)} USD · {formatNumber(totals.external.receivableCup)} CUP</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Externas por pagar</p>
                <p className="mt-1 font-semibold text-amber-300">{formatNumber(totals.external.payableUsd)} USD · {formatNumber(totals.external.payableCup)} CUP</p>
              </div>
              <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-secondary/40 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Efectivo CUP en USD</p>
                  <p className="mt-1 font-semibold">{hasRate ? formatNumber(settings.cashCup / (settings.usdCupRate ?? 1)) : "Pendiente"}</p>
                </div>
                <div className="rounded-xl bg-secondary/40 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Remeseros neto USD</p>
                  <p className="mt-1 font-semibold">{totals.remeseros.netUsd == null ? "Pendiente" : formatNumber(totals.remeseros.netUsd)}</p>
                </div>
                <div className="rounded-xl bg-secondary/40 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Externas CUP neto USD</p>
                  <p className="mt-1 font-semibold">{totals.external.netCupUsd == null ? "Pendiente" : formatNumber(totals.external.netCupUsd)}</p>
                </div>
                <div className="rounded-xl bg-secondary/40 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Externas USD neto</p>
                  <p className="mt-1 font-semibold">{formatNumber(totals.external.netUsd)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deudas externas</CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={newCounterpartyName} onChange={(event) => setNewCounterpartyName(event.target.value)} placeholder="Nombre de la persona" />
                <Button onClick={() => void createCounterparty()} disabled={creatingCounterparty || !newCounterpartyName.trim()}>
                  <Plus className="h-4 w-4" /> Agregar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {counterparties.length === 0 ? <p className="text-sm text-muted-foreground">No hay deudas externas registradas.</p> : null}
              {counterparties.map((counterparty) => {
                const draft = getDraft(counterparty.id);
                const canArchive = counterparty.balanceUsd === 0 && counterparty.balanceCup === 0;
                const isExpanded = expandedCounterpartyIds[counterparty.id] ?? false;
                const detailsId = `finance-counterparty-${counterparty.id}`;
                const movementId = `finance-movement-${counterparty.id}`;
                const currencyId = `finance-currency-${counterparty.id}`;
                const amountId = `finance-amount-${counterparty.id}`;
                const noteId = `finance-note-${counterparty.id}`;
                const amountValue = parseFinanceNumberInput(draft.amount);
                const currentDebt = draft.currency === "USD" ? counterparty.balanceUsd : counterparty.balanceCup;
                const currentCash = draft.currency === "USD" ? settings.cashUsd : settings.cashCup;
                const nextDebt = Number.isFinite(amountValue)
                  ? draft.movementType === "SET_RECEIVABLE"
                    ? amountValue
                    : draft.movementType === "SET_PAYABLE"
                      ? -amountValue
                      : draft.movementType === "RECEIVED"
                        ? currentDebt - amountValue
                        : currentDebt + amountValue
                  : currentDebt;
                const nextCash = draft.movementType === "RECEIVED"
                  ? currentCash + amountValue
                  : draft.movementType === "PAID"
                    ? currentCash - amountValue
                    : currentCash;
                return (
                  <div key={counterparty.id} className="rounded-2xl border border-border/70 bg-background/40 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{counterparty.name}</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <CompactBalanceValue value={counterparty.balanceUsd} currency="USD" />
                          <CompactBalanceValue value={counterparty.balanceCup} currency="CUP" />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 self-end sm:self-auto"
                        aria-expanded={isExpanded}
                        aria-controls={detailsId}
                        aria-label={`${isExpanded ? "Contraer" : "Ver"} detalles de ${counterparty.name}`}
                        onClick={() => toggleCounterparty(counterparty.id)}
                      >
                        {isExpanded ? "Contraer" : "Ver detalles"}
                        <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                      </Button>
                    </div>
                    {isExpanded ? (
                      <div id={detailsId} className="mt-4 border-t border-border/70 pt-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs text-muted-foreground">Cuenta corriente en USD y CUP</p>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" disabled={!canArchive} onClick={() => void archiveCounterparty(counterparty)}>Archivar</Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => {
                                setDeleteCounterpartyError(null);
                                setCounterpartyToDelete(counterparty);
                              }}
                            >
                              <Trash2 className="h-4 w-4" /> Eliminar
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <BalanceValue value={counterparty.balanceUsd} currency="USD" />
                          <BalanceValue value={counterparty.balanceCup} currency="CUP" />
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <Label htmlFor={movementId} className="text-xs">Movimiento</Label>
                            <select id={movementId} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.movementType} onChange={(event) => updateDraft(counterparty.id, { movementType: event.target.value as FinanceMovementType })}>
                              {movementOptions.map((value) => <option key={value} value={value}>{movementLabels[value]}</option>)}
                            </select>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {movementDescriptions[draft.movementType]}
                            </p>
                          </div>
                          <div>
                            <Label htmlFor={currencyId} className="text-xs">Moneda</Label>
                            <select id={currencyId} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.currency} onChange={(event) => updateDraft(counterparty.id, { currency: event.target.value as FinanceCurrency })}>
                              <option value="USD">USD</option><option value="CUP">CUP</option>
                            </select>
                          </div>
                          <div>
                            <Label htmlFor={amountId} className="text-xs">Monto</Label>
                            <Input
                              id={amountId}
                              className="mt-1"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={draft.amount}
                              onChange={(event) => updateDraft(counterparty.id, { amount: formatFinanceNumberInput(event.target.value) })}
                            />
                          </div>
                          <div><Label htmlFor={noteId} className="text-xs">Nota</Label><Input id={noteId} className="mt-1" value={draft.note} onChange={(event) => updateDraft(counterparty.id, { note: event.target.value })} /></div>
                        </div>
                        {draft.amount ? (
                          <div className="mt-3 grid gap-2 rounded-xl bg-secondary/35 p-3 text-xs sm:grid-cols-2">
                            <p>Deuda {draft.currency}: <strong>{formatNumber(currentDebt)} → {formatNumber(nextDebt)}</strong></p>
                            <p>Efectivo {draft.currency}: <strong>{formatNumber(currentCash)} → {formatNumber(nextCash)}</strong></p>
                          </div>
                        ) : null}
                        <Button className="mt-3 w-full sm:w-auto" onClick={() => void createMovement(counterparty)} disabled={savingMovementById[counterparty.id] || !draft.amount}>
                          {savingMovementById[counterparty.id] ? "Guardando..." : "Registrar movimiento"}
                        </Button>
                        {counterparty.movements.length > 0 ? (
                          <div className="mt-4 space-y-2 border-t border-border/70 pt-4">
                            {counterparty.movements.map((movement) => (
                              <div key={movement.id} className={cn("flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3 text-sm", movement.revertedAt && "opacity-50")}>
                                <div className="flex min-w-0 items-center gap-2">
                                  {movement.signedAmount >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-400" /> : <ArrowDownLeft className="h-4 w-4 text-amber-300" />}
                                  <div className="min-w-0"><p className="font-medium">{movementLabels[movement.movementType]} · {formatNumber(movement.amount)} {movement.currency}</p><p className="truncate text-xs text-muted-foreground">{formatDate(movement.occurredAt)}{movement.note ? ` · ${movement.note}` : ""}</p></div>
                                </div>
                                {movement.revertedAt ? <Badge variant="outline">Revertido</Badge> : movement.sourceType === "WIRE" ? <Badge variant="outline">Revertir desde Cuentas</Badge> : <Button variant="ghost" size="icon" aria-label="Revertir movimiento" onClick={() => void revertMovement(counterparty.id, movement.id)}><RotateCcw className="h-4 w-4" /></Button>}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Ultimos cambios</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {settingChanges.length === 0 ? <p className="text-sm text-muted-foreground">Sin cambios manuales.</p> : null}
              {settingChanges.map((change) => (
                <div key={change.id} className="rounded-xl border border-border/60 p-3 text-sm">
                  <p className="font-medium">{change.fieldName}: {change.previousValue == null ? "vacio" : formatNumber(change.previousValue)} → {change.newValue == null ? "vacio" : formatNumber(change.newValue)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(change.changedAt)}{change.note ? ` · ${change.note}` : ""}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        </div>

      <AlertDialog
        open={counterpartyToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletingCounterparty) {
            setCounterpartyToDelete(null);
            setDeleteCounterpartyError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar deuda externa</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán permanentemente {counterpartyToDelete?.name ?? "esta persona"} y todo su historial manual en USD y CUP. Esta acción cambiará el capital actual y no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteCounterpartyError ? (
            <p role="alert" className="text-sm text-destructive">{deleteCounterpartyError}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCounterparty}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingCounterparty}
              onClick={(event) => {
                event.preventDefault();
                void deleteCounterparty();
              }}
            >
              {deletingCounterparty ? "Eliminando..." : "Eliminar definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={exchangeOpen} onOpenChange={setExchangeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar moneda</DialogTitle>
            <DialogDescription>
              La tasa pertenece a esta operación y no modifica la tasa global del capital.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="finance-exchange-direction">Dirección</Label>
              <select
                id="finance-exchange-direction"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={exchangeDirection}
                onChange={(event) => setExchangeDirection(event.target.value as "USD_TO_CUP" | "CUP_TO_USD")}
              >
                <option value="USD_TO_CUP">USD a CUP</option>
                <option value="CUP_TO_USD">CUP a USD</option>
              </select>
            </div>
            <div>
              <Label htmlFor="finance-exchange-amount">Monto de origen</Label>
              <Input id="finance-exchange-amount" inputMode="decimal" placeholder="0.00" value={exchangeAmount} onChange={(event) => setExchangeAmount(formatFinanceNumberInput(event.target.value))} />
            </div>
            <div>
              <Label htmlFor="finance-exchange-rate">Tasa CUP por 1 USD</Label>
              <Input id="finance-exchange-rate" inputMode="decimal" placeholder="Ej. 700" value={exchangeRate} onChange={(event) => setExchangeRate(formatFinanceNumberInput(event.target.value))} />
            </div>
            {exchangeTarget !== null ? (
              <div className="rounded-xl bg-secondary/40 p-3 text-sm">
                Recibirás <strong>{formatNumber(exchangeTarget)} {exchangeDirection === "USD_TO_CUP" ? "CUP" : "USD"}</strong>.
              </div>
            ) : null}
            <div>
              <Label htmlFor="finance-exchange-note">Nota</Label>
              <Input id="finance-exchange-note" maxLength={500} value={exchangeNote} onChange={(event) => setExchangeNote(event.target.value)} placeholder="Opcional" />
            </div>
            {exchangeError ? <p role="alert" className="text-sm text-destructive">{exchangeError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExchangeOpen(false)} disabled={savingExchange}>Cancelar</Button>
            <Button onClick={() => void saveExchange()} disabled={savingExchange || exchangeTarget === null}>
              {savingExchange ? "Cambiando..." : "Confirmar cambio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={expenseOpen} onOpenChange={handleExpenseOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar gasto</DialogTitle>
            <DialogDescription>
              El importe se descontará directamente del efectivo de la moneda seleccionada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="finance-expense-currency">Moneda</Label>
              <select
                id="finance-expense-currency"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={expenseCurrency}
                onChange={(event) => {
                  setExpenseCurrency(event.target.value as FinanceCurrency);
                  setExpenseError(null);
                }}
              >
                <option value="USD">USD</option>
                <option value="CUP">CUP</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Disponible: {formatNumber(selectedExpenseBalance)} {expenseCurrency}
              </p>
            </div>
            <div>
              <Label htmlFor="finance-expense-amount">Monto</Label>
              <Input
                id="finance-expense-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={expenseAmount}
                onChange={(event) => {
                  setExpenseAmount(formatFinanceNumberInput(event.target.value));
                  setExpenseError(null);
                }}
              />
            </div>
            <div>
              <Label htmlFor="finance-expense-description">Concepto</Label>
              <Input
                id="finance-expense-description"
                maxLength={300}
                placeholder="Ej. Renta de oficina"
                value={expenseDescription}
                onChange={(event) => setExpenseDescription(event.target.value)}
              />
            </div>
            {expenseError ? <p role="alert" className="text-sm text-destructive">{expenseError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)} disabled={savingExpense}>
              Cancelar
            </Button>
            <Button onClick={() => void saveExpense()} disabled={savingExpense || !canSaveExpense}>
              {savingExpense ? "Guardando..." : "Guardar gasto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={handleSettingsOpenChange}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Balances y tasa</DialogTitle>
            <DialogDescription>
              Actualiza el efectivo disponible y la tasa CUP por cada USD. Cada cambio quedara auditado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="finance-cash-usd">Efectivo USD</Label>
              <Input
                id="finance-cash-usd"
                inputMode="decimal"
                value={cashUsd}
                onChange={(event) => setCashUsd(formatFinanceNumberInput(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="finance-cash-cup">Efectivo CUP</Label>
              <Input
                id="finance-cash-cup"
                inputMode="decimal"
                value={cashCup}
                onChange={(event) => setCashCup(formatFinanceNumberInput(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="finance-rate">Tasa CUP por 1 USD</Label>
              <Input
                id="finance-rate"
                inputMode="decimal"
                placeholder="Ej. 420"
                value={usdCupRate}
                onChange={(event) => setUsdCupRate(formatFinanceNumberInput(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="finance-note">Nota del cambio</Label>
              <Input
                id="finance-note"
                value={settingsNote}
                onChange={(event) => setSettingsNote(event.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleSettingsOpenChange(false)} disabled={savingSettings}>
              Cancelar
            </Button>
            <Button onClick={() => void saveSettings()} disabled={savingSettings}>
              {savingSettings ? "Guardando..." : "Guardar valores"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
