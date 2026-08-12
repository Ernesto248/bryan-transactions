"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatFinanceNumberInput, parseFinanceNumberInput } from "@/lib/finances";
import type {
  AccountBalance,
  AccountMovement,
  AccountMovementType,
  FinanceCurrency,
  TransactionFeedPageInfo,
  WireFifoPreview,
} from "@/lib/types";

type AccountMovementInput = {
  movementType: AccountMovementType;
  amount: number;
  note?: string;
  counterpartyId?: string;
  settlementCurrency?: FinanceCurrency;
  conversionRate?: number;
  feePercent?: number;
};

type AccountsViewProps = {
  accounts: AccountBalance[];
  movementsByAccount: Record<string, AccountMovement[]>;
  movementPagesByAccount?: Record<string, TransactionFeedPageInfo>;
  loadingAccounts: boolean;
  loadingMovementsByAccount: Record<string, boolean>;
  onRefreshAccounts: () => Promise<void>;
  onLoadMovements: (accountId: string, append?: boolean) => Promise<void>;
  onCreateMovement: (
    accountId: string,
    input: AccountMovementInput,
  ) => Promise<boolean>;
  onRevertMovement: (
    accountId: string,
    movementId: string,
    reason?: string,
  ) => Promise<void>;
};

export function AccountsView({
  accounts,
  movementsByAccount,
  movementPagesByAccount = {},
  loadingAccounts,
  loadingMovementsByAccount,
  onRefreshAccounts,
  onLoadMovements,
  onCreateMovement,
  onRevertMovement,
}: AccountsViewProps) {
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [loadingByAccount, setLoadingByAccount] = useState<
    Record<string, boolean>
  >({});
  const [revertingByMovement, setRevertingByMovement] = useState<
    Record<string, boolean>
  >({});
  const [draftByAccount, setDraftByAccount] = useState<
    Record<
      string,
      {
        movementType: AccountMovementType;
        amount: string;
        note: string;
        counterpartyId: string;
        settlementCurrency: FinanceCurrency;
        conversionRate: string;
        feePercent: string;
      }
    >
  >({});
  const [counterparties, setCounterparties] = useState<Array<{ id: string; name: string }>>([]);
  const [fifoPreviewByAccount, setFifoPreviewByAccount] = useState<Record<string, WireFifoPreview | null>>({});
  const [loadingFifoPreviewByAccount, setLoadingFifoPreviewByAccount] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    void fetch("/api/finances/counterparties", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active && payload?.ok && Array.isArray(payload.counterparties)) {
          setCounterparties(payload.counterparties);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const controllers: AbortController[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const account of accounts) {
      const draft = draftByAccount[account.id];
      const amount = parseFinanceNumberInput(draft?.amount ?? "");
      const shouldLoad = expandedById[account.id] === true
        && (draft?.movementType ?? "wire") === "wire"
        && Number.isFinite(amount)
        && amount > 0;

      if (!shouldLoad) {
        setFifoPreviewByAccount((previous) => ({ ...previous, [account.id]: null }));
        setLoadingFifoPreviewByAccount((previous) => ({ ...previous, [account.id]: false }));
        continue;
      }

      setLoadingFifoPreviewByAccount((previous) => ({ ...previous, [account.id]: true }));
      setFifoPreviewByAccount((previous) => ({ ...previous, [account.id]: null }));
      const controller = new AbortController();
      controllers.push(controller);
      timers.push(setTimeout(() => {
        void fetch(`/api/accounts/${account.id}/wire-preview?amount=${encodeURIComponent(amount)}`, {
          cache: "no-store",
          signal: controller.signal,
        })
          .then(async (response) => response.ok ? response.json() : null)
          .then((payload) => {
            if (payload?.ok && payload.preview) {
              setFifoPreviewByAccount((previous) => ({ ...previous, [account.id]: payload.preview }));
            } else {
              setFifoPreviewByAccount((previous) => ({ ...previous, [account.id]: null }));
            }
          })
          .catch(() => undefined)
          .finally(() => {
            if (!controller.signal.aborted) {
              setLoadingFifoPreviewByAccount((previous) => ({ ...previous, [account.id]: false }));
            }
          });
      }, 300));
    }

    return () => {
      timers.forEach(clearTimeout);
      controllers.forEach((controller) => controller.abort());
    };
  }, [accounts, draftByAccount, expandedById]);

  const totals = useMemo(() => {
    const totalBalance = accounts.reduce(
      (sum, account) => sum + account.balance,
      0,
    );
    const totalIncoming = accounts.reduce(
      (sum, account) => sum + account.incomingTotal,
      0,
    );
    const totalOutgoing = accounts.reduce(
      (sum, account) => sum + account.outgoingTotal,
      0,
    );
    return { totalBalance, totalIncoming, totalOutgoing };
  }, [accounts]);

  const formatLocal = (amount: number) => {
    return new Intl.NumberFormat("es-DO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (value: string | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleString("es-DO", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const getDraft = (accountId: string) => {
    return (
      draftByAccount[accountId] ?? {
        movementType: "wire",
        amount: "",
        note: "",
        counterpartyId: "",
        settlementCurrency: "CUP",
        conversionRate: "",
        feePercent: "",
      }
    );
  };

  const toggleExpanded = async (accountId: string) => {
    const next = !(expandedById[accountId] === true);
    setExpandedById((prev) => ({ ...prev, [accountId]: next }));

    if (next) {
      await onLoadMovements(accountId);
    }
  };

  const handleCreateMovement = async (accountId: string) => {
    const draft = getDraft(accountId);
    const amount = parseFinanceNumberInput(draft.amount);

    if (!Number.isFinite(amount) || amount <= 0) return;
    if (draft.movementType === "wire" && !draft.counterpartyId) return;
    const conversionRate = parseFinanceNumberInput(draft.conversionRate);
    const feePercent = parseFinanceNumberInput(draft.feePercent);
    if (draft.movementType === "wire" && draft.settlementCurrency === "CUP" && (!Number.isFinite(conversionRate) || conversionRate <= 0)) return;
    if (draft.movementType === "wire" && draft.settlementCurrency === "USD" && (!Number.isFinite(feePercent) || feePercent < 0)) return;

    setLoadingByAccount((prev) => ({ ...prev, [accountId]: true }));

    try {
      const created = await onCreateMovement(accountId, {
        movementType: draft.movementType,
        amount,
        note: draft.note.trim() || undefined,
        ...(draft.movementType === "wire" ? {
          counterpartyId: draft.counterpartyId,
          settlementCurrency: draft.settlementCurrency,
          conversionRate: draft.settlementCurrency === "CUP" ? conversionRate : undefined,
          feePercent: draft.settlementCurrency === "USD" ? feePercent : undefined,
        } : {}),
      });
      if (!created) return;
      setDraftByAccount((prev) => ({
        ...prev,
        [accountId]: {
          movementType: "wire",
          amount: "",
          note: "",
          counterpartyId: "",
          settlementCurrency: "CUP",
          conversionRate: "",
          feePercent: "",
        },
      }));
    } finally {
      setLoadingByAccount((prev) => ({ ...prev, [accountId]: false }));
    }
  };

  const handleRevertMovement = async (
    accountId: string,
    movementId: string,
  ) => {
    setRevertingByMovement((prev) => ({ ...prev, [movementId]: true }));
    try {
      await onRevertMovement(accountId, movementId);
    } finally {
      setRevertingByMovement((prev) => ({ ...prev, [movementId]: false }));
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground">
            Cuentas
          </h2>
          <p className="text-sm text-muted-foreground">
            {accounts.length} cuentas · Saldo total:{" "}
            {formatLocal(totals.totalBalance)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRefreshAccounts}
          disabled={loadingAccounts}
        >
          {loadingAccounts ? "Actualizando..." : "Actualizar"}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="min-w-0 overflow-hidden border-border/70 bg-card/60">
          <CardHeader className="px-2 pb-1 pt-3 sm:px-6 sm:pb-2 sm:pt-6">
            <CardTitle className="truncate text-[11px] text-muted-foreground sm:text-sm">
              Saldo
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 px-2 pb-3 sm:px-6 sm:pb-6">
            <p
              className="truncate text-[clamp(0.75rem,3.6vw,1.25rem)] font-semibold tabular-nums leading-tight text-foreground"
              title={formatLocal(totals.totalBalance)}
            >
              {formatLocal(totals.totalBalance)}
            </p>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden border-border/70 bg-card/60">
          <CardHeader className="px-2 pb-1 pt-3 sm:px-6 sm:pb-2 sm:pt-6">
            <CardTitle className="truncate text-[11px] text-muted-foreground sm:text-sm">
              Entradas
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 px-2 pb-3 sm:px-6 sm:pb-6">
            <p
              className="truncate text-[clamp(0.75rem,3.6vw,1.25rem)] font-semibold tabular-nums leading-tight text-foreground"
              title={formatLocal(totals.totalIncoming)}
            >
              {formatLocal(totals.totalIncoming)}
            </p>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden border-border/70 bg-card/60">
          <CardHeader className="px-2 pb-1 pt-3 sm:px-6 sm:pb-2 sm:pt-6">
            <CardTitle className="truncate text-[11px] text-muted-foreground sm:text-sm">
              Salidas
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 px-2 pb-3 sm:px-6 sm:pb-6">
            <p
              className="truncate text-[clamp(0.75rem,3.6vw,1.25rem)] font-semibold tabular-nums leading-tight text-foreground"
              title={formatLocal(totals.totalOutgoing)}
            >
              {formatLocal(totals.totalOutgoing)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        {accounts.map((account) => {
          const isExpanded = expandedById[account.id] === true;
          const draft = getDraft(account.id);
          const draftAmount = parseFinanceNumberInput(draft.amount);
          const draftRate = parseFinanceNumberInput(draft.conversionRate);
          const draftPercent = parseFinanceNumberInput(draft.feePercent);
          const debtPreview = draft.movementType === "wire" && Number.isFinite(draftAmount) && draftAmount > 0
            ? draft.settlementCurrency === "CUP" && Number.isFinite(draftRate) && draftRate > 0
              ? draftAmount * draftRate
              : draft.settlementCurrency === "USD" && Number.isFinite(draftPercent) && draftPercent >= 0
                ? draftAmount * (1 + draftPercent / 100)
                : null
            : null;
          const wireFieldsValid = draft.movementType !== "wire" || (
            draft.counterpartyId.length > 0
            && (draft.settlementCurrency === "CUP"
              ? Number.isFinite(draftRate) && draftRate > 0
              : Number.isFinite(draftPercent) && draftPercent >= 0)
          );
          const movements = movementsByAccount[account.id] ?? [];
          const fifoPreview = fifoPreviewByAccount[account.id] ?? null;
          const loadingFifoPreview = loadingFifoPreviewByAccount[account.id] === true;
          const loadingMovements =
            loadingMovementsByAccount[account.id] === true;

          return (
            <Card
              key={account.id}
              className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-secondary/20 shadow-sm"
            >
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base md:text-lg">
                      {account.accountName}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {account.transactionCount} transferencias · Ultima
                      entrada: {formatDate(account.lastTransactionAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpanded(account.id)}
                  >
                    {isExpanded ? "Contraer" : "Expandir"}
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 ml-1" />
                    ) : (
                      <ChevronDown className="h-4 w-4 ml-1" />
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border bg-background/70 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Saldo actual
                    </p>
                    <p className="text-sm font-semibold text-primary mt-1">
                      {formatLocal(account.balance)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/70 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Entradas
                    </p>
                    <p className="text-sm font-semibold text-foreground mt-1">
                      {formatLocal(account.incomingTotal)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/70 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Salidas
                    </p>
                    <p className="text-sm font-semibold text-foreground mt-1">
                      {formatLocal(account.outgoingTotal)}
                    </p>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="space-y-4 pt-0">
                  <div className="rounded-xl border border-border bg-background/60 p-3 space-y-3">
                    <p className="text-sm font-medium text-foreground">
                      Registrar salida
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Tipo
                        </Label>
                        <Select
                          value={draft.movementType}
                          onValueChange={(value) =>
                            setDraftByAccount((prev) => ({
                              ...prev,
                              [account.id]: {
                                ...draft,
                                movementType: value as AccountMovementType,
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="bg-secondary border-border text-foreground">
                            <SelectValue placeholder="Tipo" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border">
                            <SelectItem value="wire">WIRE</SelectItem>
                            <SelectItem value="expense">GASTO</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Monto
                        </Label>
                        <Input
                          inputMode="decimal"
                          value={draft.amount}
                          onChange={(event) =>
                            setDraftByAccount((prev) => ({
                              ...prev,
                              [account.id]: {
                                ...draft,
                                amount: formatFinanceNumberInput(event.target.value),
                              },
                            }))
                          }
                          placeholder="0.00"
                          className="bg-secondary border-border"
                        />
                      </div>
                      {draft.movementType === "wire" ? (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Persona</Label>
                            <Select value={draft.counterpartyId} onValueChange={(value) => setDraftByAccount((prev) => ({ ...prev, [account.id]: { ...draft, counterpartyId: value } }))}>
                              <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                              <SelectContent className="bg-card border-border">
                                {counterparties.map((counterparty) => <SelectItem key={counterparty.id} value={counterparty.id}>{counterparty.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Deuda en</Label>
                            <Select value={draft.settlementCurrency} onValueChange={(value) => setDraftByAccount((prev) => ({ ...prev, [account.id]: { ...draft, settlementCurrency: value as FinanceCurrency } }))}>
                              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                              <SelectContent className="bg-card border-border"><SelectItem value="CUP">CUP</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{draft.settlementCurrency === "CUP" ? "Tasa CUP/USD" : "Porcentaje"}</Label>
                            <Input inputMode="decimal" value={draft.settlementCurrency === "CUP" ? draft.conversionRate : draft.feePercent} onChange={(event) => setDraftByAccount((prev) => ({ ...prev, [account.id]: { ...draft, [draft.settlementCurrency === "CUP" ? "conversionRate" : "feePercent"]: formatFinanceNumberInput(event.target.value) } }))} placeholder={draft.settlementCurrency === "CUP" ? "700" : "5"} className="bg-secondary border-border" />
                          </div>
                        </>
                      ) : null}
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          Nota (opcional)
                        </Label>
                        <Input
                          value={draft.note}
                          onChange={(event) =>
                            setDraftByAccount((prev) => ({
                              ...prev,
                              [account.id]: {
                                ...draft,
                                note: event.target.value,
                              },
                            }))
                          }
                          placeholder="Referencia"
                          className="bg-secondary border-border"
                        />
                      </div>
                    </div>
                    {debtPreview !== null ? (
                      <p className="rounded-lg bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
                        Se creará una cuenta por cobrar de <strong className="text-foreground">{formatLocal(debtPreview)} {draft.settlementCurrency}</strong>.
                      </p>
                    ) : null}
                    {draft.movementType === "wire" && loadingFifoPreview ? (
                      <p className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                        Calculando costo FIFO...
                      </p>
                    ) : null}
                    {draft.movementType === "wire" && fifoPreview ? (
                      <div className={`space-y-2 rounded-xl border p-3 text-sm ${fifoPreview.canCreate ? "border-sky-500/30 bg-sky-500/10" : "border-red-500/30 bg-red-500/10"}`}>
                        {fifoPreview.canCreate ? (
                          <>
                            <p className="font-medium text-foreground">
                              {fifoPreview.selected.averagePrice == null
                                ? `Estos ${formatLocal(fifoPreview.requestedUsd)} USD todavía no tienen precio asignado.`
                                : `Estos ${formatLocal(fifoPreview.requestedUsd)} USD se tiraron a un promedio de ${formatLocal(fifoPreview.selected.averagePrice)} CUP/USD.`}
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                              <p>Valorados: <strong className="text-foreground">{formatLocal(fifoPreview.selected.pricedUsd)} USD</strong></p>
                              <p>Sin precio: <strong className="text-foreground">{formatLocal(fifoPreview.selected.unpricedUsd)} USD</strong></p>
                              <p>Costo: <strong className="text-foreground">{formatLocal(fifoPreview.selected.costCup)} CUP</strong></p>
                              <p>Cobertura: <strong className="text-foreground">{formatLocal(fifoPreview.selected.coveragePercent)}%</strong></p>
                            </div>
                            {fifoPreview.selected.unpricedUsd > 0 ? (
                              <p className="text-xs text-amber-300">
                                El promedio corresponde solo a la parte valorada; hay {formatLocal(fifoPreview.selected.unpricedUsd)} USD sin precio.
                              </p>
                            ) : null}
                            <p className="border-t border-border/60 pt-2 text-xs text-muted-foreground">
                              Quedarán {formatLocal(fifoPreview.remaining.balanceUsd)} USD
                              {fifoPreview.remaining.averagePrice == null
                                ? " sin promedio disponible"
                                : ` a un promedio de ${formatLocal(fifoPreview.remaining.averagePrice)} CUP/USD`}
                              {fifoPreview.remaining.unpricedUsd > 0
                                ? ` · ${formatLocal(fifoPreview.remaining.unpricedUsd)} USD sin precio`
                                : ""}.
                            </p>
                          </>
                        ) : (
                          <p className="font-medium text-red-300">
                            Saldo insuficiente: hay {formatLocal(fifoPreview.availableUsd)} USD disponibles.
                          </p>
                        )}
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      onClick={() => handleCreateMovement(account.id)}
                      disabled={
                        loadingByAccount[account.id] === true
                        || (draft.movementType === "wire" && (
                          loadingFifoPreview
                          || !fifoPreview
                          || !fifoPreview.canCreate
                          || !wireFieldsValid
                        ))
                      }
                    >
                      {loadingByAccount[account.id] === true
                        ? "Guardando..."
                        : "Registrar"}
                    </Button>
                  </div>

                  <div className="rounded-xl border border-border bg-background/60 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        Historial
                      </p>
                      {loadingMovements && (
                        <p className="text-xs text-muted-foreground">
                          Cargando...
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      {movements.map((movement) => (
                        <div
                          key={movement.id}
                          className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                {movement.movementType}
                              </span>
                              <span className="text-sm font-semibold text-foreground">
                                -{formatLocal(movement.amount)}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(movement.createdAt)}
                            </span>
                          </div>

                          {movement.note && (
                            <p className="text-xs text-muted-foreground">
                              {movement.note}
                            </p>
                          )}
                          {movement.financeDebtMovementId ? (
                            <p className="text-xs text-muted-foreground">
                              {movement.counterpartyName} te debe {formatLocal(movement.debtAmount ?? 0)} {movement.settlementCurrency}
                              {movement.conversionRate != null ? ` · Tasa ${formatLocal(movement.conversionRate)}` : ""}
                              {movement.feePercent != null ? ` · ${formatLocal(movement.feePercent)}%` : ""}
                            </p>
                          ) : null}
                          {movement.movementType === "wire" ? (
                            movement.fifoValuation ? (
                              <div className="rounded-lg bg-secondary/40 px-2.5 py-2 text-xs text-muted-foreground">
                                <p className="font-medium text-foreground">
                                  {movement.fifoValuation.selected.averagePrice == null
                                    ? "Wire sin precio FIFO disponible"
                                    : `Precio FIFO: ${formatLocal(movement.fifoValuation.selected.averagePrice)} CUP/USD`}
                                </p>
                                <p className="mt-1">
                                  {formatLocal(movement.fifoValuation.selected.pricedUsd)} USD valorados · {formatLocal(movement.fifoValuation.selected.unpricedUsd)} USD sin precio · Costo {formatLocal(movement.fifoValuation.selected.costCup)} CUP
                                </p>
                                <p className="mt-1">
                                  Saldo después: {formatLocal(movement.fifoValuation.balanceAfterUsd)} USD
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">Sin valoración FIFO histórica.</p>
                            )
                          ) : null}

                          {movement.revertedAt ? (
                            <p className="text-xs text-amber-500">
                              Revertido {formatDate(movement.revertedAt)}
                            </p>
                          ) : (
                            <div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleRevertMovement(account.id, movement.id)
                                }
                                disabled={
                                  revertingByMovement[movement.id] === true
                                }
                              >
                                {revertingByMovement[movement.id] === true
                                  ? "Revirtiendo..."
                                  : "Revertir"}
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}

                      {movements.length === 0 && !loadingMovements && (
                        <p className="text-sm text-muted-foreground">
                          Esta cuenta no tiene movimientos manuales.
                        </p>
                      )}
                      {movementPagesByAccount[account.id]?.hasMore && (
                        <Button type="button" variant="outline" size="sm" className="w-full" disabled={loadingMovements} onClick={() => void onLoadMovements(account.id, true)}>
                          {loadingMovements ? "Cargando..." : "Cargar más movimientos"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {accounts.length === 0 && (
          <Card className="border-border/70 bg-card/60">
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground">
                No hay cuentas disponibles.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
