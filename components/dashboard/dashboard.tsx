"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { BottomNav } from "./bottom-nav";
import { DesktopNav } from "./desktop-nav";
import { StatCard } from "./stat-card";
import { TransactionCard } from "./transaction-card";
import { BankTotalsCard } from "./bank-totals-card";
import { FilterBar, type DateFilter } from "./filter-bar";
import { RemeserosView } from "./remeseros-view";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, Calendar, Plus } from "lucide-react";
import {
  AccountBalance,
  AccountMovement,
  AccountMovementType,
  Bank,
  GmailAccountOption,
  Remesero,
  RemeseroPayment,
  RemeseroShareSummary,
  Transaction,
  TransactionFeed,
  TransactionFeedFilterOptions,
  TransactionFeedPageInfo,
  TransactionFeedSummary,
} from "@/lib/types";
import {
  startOfDay,
  endOfDay,
  subDays,
  subWeeks,
  subMonths,
} from "date-fns";
import { consumeDashboardReturnTab } from "@/lib/dashboard-tabs";

interface DashboardProps {
  initialTransactions: Transaction[];
  initialFeed?: TransactionFeed;
}

const AccountsView = dynamic(
  () => import("./accounts-view").then((module) => module.AccountsView),
  { loading: () => <p className="text-sm text-muted-foreground">Cargando cuentas...</p> },
);

const TransactionsChart = dynamic(
  () => import("./transactions-chart").then((module) => module.TransactionsChart),
  { loading: () => <div className="h-[300px] animate-pulse rounded-lg bg-secondary/40" /> },
);

const BankDistributionChart = dynamic(
  () => import("./bank-distribution-chart").then((module) => module.BankDistributionChart),
  { loading: () => <div className="h-[300px] animate-pulse rounded-lg bg-secondary/40" /> },
);

const CreateTransactionDialog = dynamic(
  () => import("./create-transaction-dialog").then((module) => module.CreateTransactionDialog),
);

const FinancesView = dynamic(
  () => import("./finances-view").then((module) => module.FinancesView),
  { loading: () => <p className="text-sm text-muted-foreground">Cargando finanzas...</p> },
);

const emptyPageInfo: TransactionFeedPageInfo = { hasMore: false, nextCursor: null };

function summaryFromTransactions(items: Transaction[]): TransactionFeedSummary {
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const banks = new Map<string, number>();
  const accounts = new Map<string, number>();
  for (const item of items) {
    banks.set(item.bank, (banks.get(item.bank) ?? 0) + item.amount);
    accounts.set(item.accountName, (accounts.get(item.accountName) ?? 0) + item.amount);
  }
  const distribution = (map: Map<string, number>) => Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const bankDistribution = distribution(banks);
  const accountDistribution = distribution(accounts);
  return {
    totalTransactions: items.length, totalAmount,
    avgTransaction: items.length ? totalAmount / items.length : 0,
    todayTransactions: items.length, todayTransactionsTrend: null, totalAmountTrend: null,
    bankTotals: bankDistribution.map(({ name, value }) => ({ bank: name, totalAmount: value })),
    bankDistribution: bankDistribution.slice(0, 4), accountDistribution: accountDistribution.slice(0, 4),
    chartPoints: items.map((item) => ({ date: item.createdAt.slice(0, 10), bank: item.bank, accountName: item.accountName, amount: item.amount })),
  };
}

function optionsFromTransactions(items: Transaction[]): TransactionFeedFilterOptions {
  return {
    banks: Array.from(new Set(items.map((item) => item.bank))).sort(),
    accounts: Array.from(new Set(items.map((item) => item.accountName))).sort(),
    remeseros: Array.from(new Set(items.flatMap((item) => item.assignedRemeseroNombre ? [item.assignedRemeseroNombre] : []))).sort(),
  };
}

export function Dashboard({ initialTransactions, initialFeed }: DashboardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [transactions, setTransactions] =
    useState<Transaction[]>(initialTransactions);
  const [transactionSummary, setTransactionSummary] = useState<TransactionFeedSummary>(initialFeed?.summary ?? summaryFromTransactions(initialTransactions));
  const [transactionFilterOptions, setTransactionFilterOptions] = useState<TransactionFeedFilterOptions>(initialFeed?.filterOptions ?? optionsFromTransactions(initialTransactions));
  const [transactionPageInfo, setTransactionPageInfo] = useState<TransactionFeedPageInfo>(initialFeed?.pageInfo ?? emptyPageInfo);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [movementsByAccount, setMovementsByAccount] = useState<
    Record<string, AccountMovement[]>
  >({});
  const [movementPagesByAccount, setMovementPagesByAccount] = useState<Record<string, TransactionFeedPageInfo>>({});
  const [remeseros, setRemeseros] = useState<Remesero[]>([]);
  const [paymentsByRemesero, setPaymentsByRemesero] = useState<
    Record<string, RemeseroPayment[]>
  >({});
  const [paymentPagesByRemesero, setPaymentPagesByRemesero] = useState<Record<string, TransactionFeedPageInfo>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingRemeseros, setIsLoadingRemeseros] = useState(false);
  const [loadingMovementsByAccount, setLoadingMovementsByAccount] = useState<
    Record<string, boolean>
  >({});
  const [loadingPaymentsByRemesero, setLoadingPaymentsByRemesero] = useState<
    Record<string, boolean>
  >({});
  const [assigningByTransaction, setAssigningByTransaction] = useState<
    Record<string, boolean>
  >({});
  const [bankFilter, setBankFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [senderFilter, setSenderFilter] = useState("");
  const [amountFilter, setAmountFilter] = useState("");
  const [remeseroFilter, setRemeseroFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("week");
  const [customDateRange, setCustomDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [debouncedSenderFilter, setDebouncedSenderFilter] = useState("");
  const [debouncedAmountFilter, setDebouncedAmountFilter] = useState("");
  const initialFilterRequest = useRef(true);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [manualBanks, setManualBanks] = useState<Bank[]>([]);
  const [manualGmailAccounts, setManualGmailAccounts] = useState<
    GmailAccountOption[]
  >([]);
  const [loadingManualOptions, setLoadingManualOptions] = useState(false);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const queuedTab = consumeDashboardReturnTab();

    if (queuedTab) {
      setActiveTab(queuedTab);
    }

    if (!currentUrl.searchParams.has("tab")) return;

    currentUrl.searchParams.delete("tab");
    const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl || "/");
  }, []);

  const apiUrl = (path: string) => {
    if (typeof window === "undefined") return path;
    return new URL(path, window.location.origin).toString();
  };

  const bankOptions = transactionFilterOptions.banks;
  const accountOptions = transactionFilterOptions.accounts;
  const remeseroOptions = transactionFilterOptions.remeseros;

  const buildTransactionFeedUrl = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams({ view: "page", status: "active", limit: "30" });
    if (cursor) params.set("cursor", cursor);
    if (bankFilter !== "all") params.set("bank", bankFilter);
    if (accountFilter !== "all") params.set("account", accountFilter);
    if (debouncedSearchQuery.trim()) params.set("search", debouncedSearchQuery.trim());
    if (debouncedSenderFilter.trim()) params.set("sender", debouncedSenderFilter.trim());
    if (debouncedAmountFilter.trim()) params.set("amount", debouncedAmountFilter.trim());
    if (remeseroFilter !== "all") params.set("remesero", remeseroFilter);
    const now = new Date();
    let from: Date | undefined;
    let to: Date | undefined;
    if (dateFilter === "today") { from = startOfDay(now); to = endOfDay(now); }
    else if (dateFilter === "yesterday") { from = startOfDay(subDays(now, 1)); to = endOfDay(subDays(now, 1)); }
    else if (dateFilter === "week") { from = subWeeks(startOfDay(now), 1); to = endOfDay(now); }
    else if (dateFilter === "month") { from = subMonths(startOfDay(now), 1); to = endOfDay(now); }
    else if (dateFilter === "custom" && customDateRange.from) { from = startOfDay(customDateRange.from); to = customDateRange.to ? endOfDay(customDateRange.to) : endOfDay(now); }
    if (from) params.set("from", from.toISOString());
    if (to) params.set("to", to.toISOString());
    return `/api/transactions?${params}`;
  }, [accountFilter, bankFilter, customDateRange, dateFilter, debouncedAmountFilter, debouncedSearchQuery, debouncedSenderFilter, remeseroFilter]);

  const refreshTransactions = useCallback(async (options: { append?: boolean; cursor?: string | null; signal?: AbortSignal } = {}) => {
    setIsLoadingTransactions(true);
    try {
      const res = await fetch(buildTransactionFeedUrl(options.cursor), {
        cache: "no-store",
        signal: options.signal,
      });
      if (!res.ok) return;

      const data = (await res.json()) as {
        ok?: boolean;
        transactions?: Transaction[];
        pageInfo?: TransactionFeedPageInfo;
        summary?: TransactionFeedSummary;
        filterOptions?: TransactionFeedFilterOptions;
      };

      if (!data?.ok || !Array.isArray(data.transactions) || !data.pageInfo || !data.summary) return;
      setTransactions((previous) => options.append ? [...previous, ...data.transactions!] : data.transactions!);
      setTransactionPageInfo(data.pageInfo);
      setTransactionSummary(data.summary);
      if (data.filterOptions) setTransactionFilterOptions(data.filterOptions);
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") return;
    } finally {
      if (!options.signal?.aborted) setIsLoadingTransactions(false);
    }
  }, [buildTransactionFeedUrl]);

  const refreshRemeseros = async () => {
    setIsLoadingRemeseros(true);
    try {
      const res = await fetch(apiUrl("/api/remeseros"), { cache: "no-store" });
      if (!res.ok) return;

      const data = (await res.json()) as {
        ok?: boolean;
        remeseros?: Remesero[];
      };

      if (!data?.ok || !Array.isArray(data.remeseros)) return;
      setRemeseros(data.remeseros);
    } catch {
      return;
    } finally {
      setIsLoadingRemeseros(false);
    }
  };

  const refreshAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const res = await fetch(apiUrl("/api/accounts"), { cache: "no-store" });
      if (!res.ok) return;

      const data = (await res.json()) as {
        ok?: boolean;
        accounts?: AccountBalance[];
      };

      if (!data?.ok || !Array.isArray(data.accounts)) return;
      setAccounts(data.accounts);
    } catch {
      return;
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const loadAccountMovements = async (accountId: string, append = false) => {
    setLoadingMovementsByAccount((prev) => ({ ...prev, [accountId]: true }));
    try {
      const params = new URLSearchParams({ view: "page", limit: "20" });
      const cursor = append ? movementPagesByAccount[accountId]?.nextCursor : null;
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(apiUrl(`/api/accounts/${accountId}/movements?${params}`), {
        cache: "no-store",
      });

      if (!res.ok) return;

      const data = (await res.json()) as {
        ok?: boolean;
        movements?: AccountMovement[];
        pageInfo?: TransactionFeedPageInfo;
      };

      if (!data?.ok || !Array.isArray(data.movements)) return;
      const movements = data.movements;
      setMovementsByAccount((prev) => ({
        ...prev,
        [accountId]: append ? [...(prev[accountId] ?? []), ...movements] : movements,
      }));
      if (data.pageInfo) setMovementPagesByAccount((prev) => ({ ...prev, [accountId]: data.pageInfo! }));
    } finally {
      setLoadingMovementsByAccount((prev) => ({ ...prev, [accountId]: false }));
    }
  };

  const createAccountMovement = async (
    accountId: string,
    input: {
      movementType: AccountMovementType;
      amount: number;
      note?: string;
      counterpartyId?: string;
      settlementCurrency?: "USD" | "CUP";
      conversionRate?: number;
      feePercent?: number;
      wireFeeUsd?: number;
    },
  ) => {
    const res = await fetch(apiUrl("/api/accounts"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId,
        movementType: input.movementType,
        amount: input.amount,
        note: input.note,
        counterpartyId: input.counterpartyId,
        settlementCurrency: input.settlementCurrency,
        conversionRate: input.conversionRate,
        feePercent: input.feePercent,
        wireFeeUsd: input.wireFeeUsd,
      }),
    });

    if (!res.ok) return false;

    await Promise.all([refreshAccounts(), loadAccountMovements(accountId)]);
    return true;
  };

  const revertAccountMovement = async (
    accountId: string,
    movementId: string,
    reason?: string,
  ) => {
    const res = await fetch(apiUrl("/api/accounts"), {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ movementId, reason }),
    });

    if (!res.ok) return;

    await Promise.all([refreshAccounts(), loadAccountMovements(accountId)]);
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshTransactions(),
        refreshRemeseros(),
        refreshAccounts(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const createRemesero = async (input: {
    nombre: string;
    precioActual: number;
  }) => {
    const res = await fetch(apiUrl("/api/remeseros"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) return;
    await refreshRemeseros();
  };

  const updateRemesero = async (
    id: string,
    input: {
      nombre?: string;
      precioActual?: number;
      deudaActual?: number;
      deudaActualNote?: string;
    },
  ) => {
    const res = await fetch(apiUrl(`/api/remeseros/${id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) return false;
    await refreshRemeseros();
    return true;
  };

  const deleteRemesero = async (id: string) => {
    const res = await fetch(apiUrl(`/api/remeseros/${id}`), {
      method: "DELETE",
    });

    if (!res.ok) return;
    await refreshRemeseros();
  };

  const loadRemeseroPayments = async (id: string, append = false) => {
    setLoadingPaymentsByRemesero((prev) => ({ ...prev, [id]: true }));
    try {
      const params = new URLSearchParams({ view: "page", limit: "20" });
      const cursor = append ? paymentPagesByRemesero[id]?.nextCursor : null;
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(apiUrl(`/api/remeseros/${id}/payments?${params}`), {
        cache: "no-store",
      });

      if (!res.ok) return;
      const data = (await res.json()) as {
        ok?: boolean;
        payments?: RemeseroPayment[];
        pageInfo?: TransactionFeedPageInfo;
      };

      if (!data?.ok || !Array.isArray(data.payments)) return;
      const payments = data.payments;
      setPaymentsByRemesero((prev) => ({ ...prev, [id]: append ? [...(prev[id] ?? []), ...payments] : payments }));
      if (data.pageInfo) setPaymentPagesByRemesero((prev) => ({ ...prev, [id]: data.pageInfo! }));
    } finally {
      setLoadingPaymentsByRemesero((prev) => ({ ...prev, [id]: false }));
    }
  };

  const createRemeseroPayment = async (
    id: string,
    input: { amountPaid: number; note?: string },
  ) => {
    const res = await fetch(apiUrl(`/api/remeseros/${id}/payments`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) return;

    await Promise.all([refreshRemeseros(), loadRemeseroPayments(id)]);
  };

  const revertRemeseroPayment = async (
    remeseroId: string,
    paymentId: string,
    reason?: string,
  ) => {
    const res = await fetch(apiUrl(`/api/remeseros/${remeseroId}/payments`), {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId, reason }),
    });

    if (!res.ok) return;

    await Promise.all([refreshRemeseros(), loadRemeseroPayments(remeseroId)]);
  };

  const getRemeseroShareSummary = async (
    remeseroId: string,
  ): Promise<RemeseroShareSummary | null> => {
    const res = await fetch(
      apiUrl(`/api/remeseros/${remeseroId}/share-summary`),
      {
        cache: "no-store",
      },
    );

    if (!res.ok) return null;

    const data = (await res.json()) as {
      ok?: boolean;
      summary?: RemeseroShareSummary;
    };

    if (!data?.ok || !data.summary) return null;
    return data.summary;
  };

  const assignTransactionToRemesero = async (
    transactionId: string,
    remeseroId: string,
  ) => {
    setAssigningByTransaction((prev) => ({ ...prev, [transactionId]: true }));
    try {
      const res = await fetch(apiUrl("/api/remeseros/assignments"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionId, remeseroId }),
      });

      if (!res.ok) return;
      await Promise.all([refreshTransactions(), refreshRemeseros()]);
    } finally {
      setAssigningByTransaction((prev) => ({
        ...prev,
        [transactionId]: false,
      }));
    }
  };

  const unassignTransactionFromRemesero = async (transactionId: string) => {
    setAssigningByTransaction((prev) => ({ ...prev, [transactionId]: true }));
    try {
      const res = await fetch(apiUrl("/api/remeseros/assignments"), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });

      if (!res.ok) return;
      await Promise.all([refreshTransactions(), refreshRemeseros()]);
    } finally {
      setAssigningByTransaction((prev) => ({
        ...prev,
        [transactionId]: false,
      }));
    }
  };

  const loadManualOptions = async () => {
    if (loadingManualOptions) return;
    if (manualBanks.length > 0 && manualGmailAccounts.length > 0) return;
    setLoadingManualOptions(true);
    try {
      const [banksRes, accountsRes] = await Promise.all([
        fetch(apiUrl("/api/banks"), { cache: "no-store" }),
        fetch(apiUrl("/api/gmail-accounts"), { cache: "no-store" }),
      ]);

      if (banksRes.ok) {
        const banksData = (await banksRes.json()) as {
          ok?: boolean;
          banks?: Bank[];
        };
        if (banksData.ok && Array.isArray(banksData.banks)) {
          setManualBanks(banksData.banks);
        }
      }

      if (accountsRes.ok) {
        const accountsData = (await accountsRes.json()) as {
          ok?: boolean;
          gmailAccounts?: GmailAccountOption[];
        };
        if (accountsData.ok && Array.isArray(accountsData.gmailAccounts)) {
          setManualGmailAccounts(accountsData.gmailAccounts);
        }
      }
    } finally {
      setLoadingManualOptions(false);
    }
  };

  const handleCreateDialogOpenChange = (open: boolean) => {
    setCreateDialogOpen(open);
    if (open) {
      void loadManualOptions();
    }
  };

  const handleManualTransactionCreated = async (payload: {
    remeseroAssigned: boolean;
  }) => {
    if (payload.remeseroAssigned) {
      await Promise.all([refreshTransactions(), refreshRemeseros()]);
    } else {
      await refreshTransactions();
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setDebouncedSenderFilter(senderFilter);
      setDebouncedAmountFilter(amountFilter);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [amountFilter, searchQuery, senderFilter]);

  useEffect(() => {
    if (initialFilterRequest.current) {
      initialFilterRequest.current = false;
      return;
    }
    const controller = new AbortController();
    void refreshTransactions({ signal: controller.signal });
    return () => controller.abort();
  }, [refreshTransactions]);

  useEffect(() => {
    if ((activeTab === "dashboard" || activeTab === "transactions" || activeTab === "remeseros") && remeseros.length === 0) {
      void refreshRemeseros();
    }
    if (activeTab === "accounts" && accounts.length === 0) {
      void refreshAccounts();
    }
  }, [activeTab]);

  const formatCurrency = (amount: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);

  const filteredTransactions = transactions;
  const stats = {
    ...transactionSummary,
    totalAmountTrend: transactionSummary.totalAmountTrend == null ? undefined : {
      value: transactionSummary.totalAmountTrend,
      isPositive: transactionSummary.totalAmountTrend >= 0,
    },
    todayTransactionsTrend: transactionSummary.todayTransactionsTrend == null ? undefined : {
      value: transactionSummary.todayTransactionsTrend,
      isPositive: transactionSummary.todayTransactionsTrend >= 0,
    },
  };
  const bankTotals = transactionSummary.bankTotals;

  return (
    <div className="min-h-screen bg-background">
      <Header
        onMenuToggle={() => setIsMenuOpen(!isMenuOpen)}
        isMenuOpen={isMenuOpen}
        onRefresh={refreshData}
        isRefreshing={isRefreshing}
      />
      <MobileNav
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="pb-24 md:pb-8">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6">
          <DesktopNav activeTab={activeTab} setActiveTab={setActiveTab} />

          <div className="mt-4 md:mt-6">
            {activeTab === "dashboard" && (
              <div className="space-y-4 md:space-y-6">
                <FilterBar
                  bankFilter={bankFilter}
                  setBankFilter={setBankFilter}
                  bankOptions={bankOptions}
                  accountFilter={accountFilter}
                  setAccountFilter={setAccountFilter}
                  accountOptions={accountOptions}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  senderFilter={senderFilter}
                  setSenderFilter={setSenderFilter}
                  amountFilter={amountFilter}
                  setAmountFilter={setAmountFilter}
                  remeseroFilter={remeseroFilter}
                  setRemeseroFilter={setRemeseroFilter}
                  remeseroOptions={remeseroOptions}
                  dateFilter={dateFilter}
                  setDateFilter={setDateFilter}
                  customDateRange={customDateRange}
                  setCustomDateRange={setCustomDateRange}
                />

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                  <StatCard
                    title="Total Recibido"
                    value={formatCurrency(stats.totalAmount)}
                    subtitle={`${stats.totalTransactions} transacciones`}
                    icon={DollarSign}
                    trend={stats.totalAmountTrend}
                  />
                  <StatCard
                    title="Promedio"
                    value={formatCurrency(stats.avgTransaction)}
                    subtitle="por transacción"
                    icon={TrendingUp}
                  />
                  <BankTotalsCard
                    totals={bankTotals}
                    formatCurrency={formatCurrency}
                  />
                  <StatCard
                    title="Hoy"
                    value={stats.todayTransactions.toString()}
                    subtitle="transacciones"
                    icon={Calendar}
                    trend={stats.todayTransactionsTrend}
                  />
                </div>

                <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
                  <div className="lg:col-span-2">
                    <TransactionsChart points={transactionSummary.chartPoints} />
                  </div>
                  <BankDistributionChart
                    bankDistribution={transactionSummary.bankDistribution}
                    accountDistribution={transactionSummary.accountDistribution}
                  />
                </div>

                <div>
                  <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">
                    Transacciones Recientes
                  </h2>
                  <div className="grid gap-3">
                    {filteredTransactions.slice(0, 5).map((transaction) => (
                      <TransactionCard
                        key={transaction.id}
                        transaction={transaction}
                        remeseros={remeseros}
                        onAssign={assignTransactionToRemesero}
                        onUnassign={unassignTransactionFromRemesero}
                        isAssigning={
                          assigningByTransaction[transaction.id] === true
                        }
                      />
                    ))}
                    {filteredTransactions.length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground">
                          No se encontraron transacciones
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "transactions" && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-foreground">
                      Transacciones
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {filteredTransactions.length} de {transactionSummary.totalTransactions}{" "}
                      transacciones
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => handleCreateDialogOpenChange(true)}
                    className="w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                    Nueva transaccion
                  </Button>
                </div>

                <FilterBar
                  bankFilter={bankFilter}
                  setBankFilter={setBankFilter}
                  bankOptions={bankOptions}
                  accountFilter={accountFilter}
                  setAccountFilter={setAccountFilter}
                  accountOptions={accountOptions}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  senderFilter={senderFilter}
                  setSenderFilter={setSenderFilter}
                  amountFilter={amountFilter}
                  setAmountFilter={setAmountFilter}
                  remeseroFilter={remeseroFilter}
                  setRemeseroFilter={setRemeseroFilter}
                  remeseroOptions={remeseroOptions}
                  dateFilter={dateFilter}
                  setDateFilter={setDateFilter}
                  customDateRange={customDateRange}
                  setCustomDateRange={setCustomDateRange}
                />

                <div className="grid gap-3">
                  {filteredTransactions.map((transaction) => (
                    <TransactionCard
                      key={transaction.id}
                      transaction={transaction}
                      remeseros={remeseros}
                      onAssign={assignTransactionToRemesero}
                      onUnassign={unassignTransactionFromRemesero}
                      isAssigning={
                        assigningByTransaction[transaction.id] === true
                      }
                    />
                  ))}
                  {filteredTransactions.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">
                        No se encontraron transacciones
                      </p>
                    </div>
                  )}
                  {transactionPageInfo.hasMore && (
                    <div className="flex justify-center pt-2">
                      <Button variant="outline" disabled={isLoadingTransactions} onClick={() => void refreshTransactions({ append: true, cursor: transactionPageInfo.nextCursor })}>
                        {isLoadingTransactions ? "Cargando..." : "Cargar más"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "accounts" && (
              <AccountsView
                accounts={accounts}
                movementsByAccount={movementsByAccount}
                movementPagesByAccount={movementPagesByAccount}
                loadingAccounts={isLoadingAccounts}
                loadingMovementsByAccount={loadingMovementsByAccount}
                onRefreshAccounts={refreshAccounts}
                onLoadMovements={loadAccountMovements}
                onCreateMovement={createAccountMovement}
                onRevertMovement={revertAccountMovement}
              />
            )}

            {activeTab === "remeseros" && (
              <RemeserosView
                remeseros={remeseros}
                paymentsByRemesero={paymentsByRemesero}
                paymentPagesByRemesero={paymentPagesByRemesero}
                loadingRemeseros={isLoadingRemeseros}
                loadingPaymentsByRemesero={loadingPaymentsByRemesero}
                onRefreshRemeseros={refreshRemeseros}
                onCreateRemesero={createRemesero}
                onUpdateRemesero={updateRemesero}
                onDeleteRemesero={deleteRemesero}
                onLoadPayments={loadRemeseroPayments}
                onCreatePayment={createRemeseroPayment}
                onRevertPayment={revertRemeseroPayment}
                onGetShareSummary={getRemeseroShareSummary}
              />
            )}

            {activeTab === "finances" && <FinancesView />}
          </div>
        </div>
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {createDialogOpen && (
        <CreateTransactionDialog
          open={createDialogOpen}
          onOpenChange={handleCreateDialogOpenChange}
          banks={manualBanks}
          gmailAccounts={manualGmailAccounts}
          remeseros={remeseros}
          onCreated={handleManualTransactionCreated}
        />
      )}
    </div>
  );
}
