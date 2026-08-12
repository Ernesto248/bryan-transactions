"use client";

import dynamic from "next/dynamic";
import { useState, useMemo, useEffect } from "react";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { BottomNav } from "./bottom-nav";
import { DesktopNav } from "./desktop-nav";
import { StatCard } from "./stat-card";
import { TransactionCard } from "./transaction-card";
import { TransactionsChart } from "./transactions-chart";
import { BankDistributionChart } from "./bank-distribution-chart";
import { BankTotalsCard } from "./bank-totals-card";
import { FilterBar, type DateFilter } from "./filter-bar";
import { AccountsView } from "./accounts-view";
import { RemeserosView } from "./remeseros-view";
import { CreateTransactionDialog } from "./create-transaction-dialog";
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
} from "@/lib/types";
import {
  startOfDay,
  endOfDay,
  subDays,
  subWeeks,
  subMonths,
  isWithinInterval,
} from "date-fns";
import { consumeDashboardReturnTab } from "@/lib/dashboard-tabs";

interface DashboardProps {
  initialTransactions: Transaction[];
}

const FinancesView = dynamic(
  () => import("./finances-view").then((module) => module.FinancesView),
  { loading: () => <p className="text-sm text-muted-foreground">Cargando finanzas...</p> },
);

export function Dashboard({ initialTransactions }: DashboardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [transactions, setTransactions] =
    useState<Transaction[]>(initialTransactions);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [movementsByAccount, setMovementsByAccount] = useState<
    Record<string, AccountMovement[]>
  >({});
  const [remeseros, setRemeseros] = useState<Remesero[]>([]);
  const [paymentsByRemesero, setPaymentsByRemesero] = useState<
    Record<string, RemeseroPayment[]>
  >({});
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

  const bankOptions = useMemo(() => {
    return Array.from(new Set(transactions.map((t) => t.bank))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [transactions]);

  const accountOptions = useMemo(() => {
    return Array.from(new Set(transactions.map((t) => t.accountName))).sort(
      (a, b) => a.localeCompare(b),
    );
  }, [transactions]);

  const remeseroOptions = useMemo(() => {
    return Array.from(
      new Set(
        transactions
          .map((t) => t.assignedRemeseroNombre)
          .filter((name): name is string => Boolean(name && name.trim())),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  const refreshTransactions = async () => {
    try {
      const res = await fetch(apiUrl("/api/transactions"), {
        cache: "no-store",
      });
      if (!res.ok) return;

      const data = (await res.json()) as {
        ok?: boolean;
        transactions?: Transaction[];
      };

      if (!data?.ok || !Array.isArray(data.transactions)) return;
      setTransactions(data.transactions);
    } catch {}
  };

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

  const loadAccountMovements = async (accountId: string) => {
    setLoadingMovementsByAccount((prev) => ({ ...prev, [accountId]: true }));
    try {
      const res = await fetch(apiUrl(`/api/accounts/${accountId}/movements`), {
        cache: "no-store",
      });

      if (!res.ok) return;

      const data = (await res.json()) as {
        ok?: boolean;
        movements?: AccountMovement[];
      };

      if (!data?.ok || !Array.isArray(data.movements)) return;
      const movements = data.movements;
      setMovementsByAccount((prev) => ({
        ...prev,
        [accountId]: movements,
      }));
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

  const loadRemeseroPayments = async (id: string) => {
    setLoadingPaymentsByRemesero((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(apiUrl(`/api/remeseros/${id}/payments`), {
        cache: "no-store",
      });

      if (!res.ok) return;
      const data = (await res.json()) as {
        ok?: boolean;
        payments?: RemeseroPayment[];
      };

      if (!data?.ok || !Array.isArray(data.payments)) return;
      const payments = data.payments;
      setPaymentsByRemesero((prev) => ({ ...prev, [id]: payments }));
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
    void Promise.all([refreshRemeseros(), refreshAccounts()]);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);

    return transactions.filter((transaction) => {
      const matchesBank =
        bankFilter === "all" || transaction.bank === bankFilter;
      const matchesAccount =
        accountFilter === "all" || transaction.accountName === accountFilter;
      const matchesSearch =
        searchQuery === "" ||
        transaction.senderName
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
      const matchesSender =
        senderFilter.trim() === "" ||
        transaction.senderName
          .toLowerCase()
          .includes(senderFilter.trim().toLowerCase());
      const parsedAmount = Number(amountFilter);
      const matchesAmount =
        amountFilter.trim() === "" ||
        (Number.isFinite(parsedAmount) && transaction.amount === parsedAmount);
      const matchesRemesero =
        remeseroFilter === "all"
          ? true
          : remeseroFilter === "unassigned"
            ? !transaction.assignedRemeseroNombre
            : transaction.assignedRemeseroNombre === remeseroFilter;

      // Date filtering
      let matchesDate = true;
      const transactionDate = new Date(transaction.createdAt);

      if (dateFilter === "today") {
        matchesDate = isWithinInterval(transactionDate, {
          start: today,
          end: endOfDay(now),
        });
      } else if (dateFilter === "yesterday") {
        const yesterday = subDays(today, 1);
        matchesDate = isWithinInterval(transactionDate, {
          start: yesterday,
          end: endOfDay(yesterday),
        });
      } else if (dateFilter === "week") {
        matchesDate = isWithinInterval(transactionDate, {
          start: subWeeks(today, 1),
          end: endOfDay(now),
        });
      } else if (dateFilter === "month") {
        matchesDate = isWithinInterval(transactionDate, {
          start: subMonths(today, 1),
          end: endOfDay(now),
        });
      } else if (dateFilter === "custom" && customDateRange.from) {
        const start = startOfDay(customDateRange.from);
        const end = customDateRange.to
          ? endOfDay(customDateRange.to)
          : endOfDay(now);
        matchesDate = isWithinInterval(transactionDate, { start, end });
      }

      return (
        matchesBank &&
        matchesAccount &&
        matchesSearch &&
        matchesSender &&
        matchesAmount &&
        matchesRemesero &&
        matchesDate
      );
    });
  }, [
    bankFilter,
    accountFilter,
    searchQuery,
    senderFilter,
    amountFilter,
    remeseroFilter,
    dateFilter,
    customDateRange,
    transactions,
  ]);

  const baseFilteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesBank =
        bankFilter === "all" || transaction.bank === bankFilter;
      const matchesAccount =
        accountFilter === "all" || transaction.accountName === accountFilter;
      const matchesSearch =
        searchQuery === "" ||
        transaction.senderName
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
      const matchesSender =
        senderFilter.trim() === "" ||
        transaction.senderName
          .toLowerCase()
          .includes(senderFilter.trim().toLowerCase());
      const parsedAmount = Number(amountFilter);
      const matchesAmount =
        amountFilter.trim() === "" ||
        (Number.isFinite(parsedAmount) && transaction.amount === parsedAmount);
      const matchesRemesero =
        remeseroFilter === "all"
          ? true
          : remeseroFilter === "unassigned"
            ? !transaction.assignedRemeseroNombre
            : transaction.assignedRemeseroNombre === remeseroFilter;

      return (
        matchesBank &&
        matchesAccount &&
        matchesSearch &&
        matchesSender &&
        matchesAmount &&
        matchesRemesero
      );
    });
  }, [
    bankFilter,
    accountFilter,
    searchQuery,
    senderFilter,
    amountFilter,
    remeseroFilter,
    transactions,
  ]);

  const toTrend = (current: number, previous: number) => {
    if (!Number.isFinite(current) || !Number.isFinite(previous))
      return undefined;
    if (previous === 0) return undefined;
    const change = ((current - previous) / previous) * 100;
    const rounded = Math.round(change * 10) / 10;
    const value = Object.is(rounded, -0) ? 0 : rounded;
    return { value, isPositive: value >= 0 };
  };

  // Calculate dynamic stats based on filtered transactions
  const stats = useMemo(() => {
    const totalAmount = filteredTransactions.reduce(
      (acc, t) => acc + t.amount,
      0,
    );
    const avgTransaction =
      filteredTransactions.length > 0
        ? totalAmount / filteredTransactions.length
        : 0;

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const yesterdayStart = subDays(todayStart, 1);
    const yesterdayEnd = endOfDay(yesterdayStart);

    const todayTx = baseFilteredTransactions.filter((t) =>
      isWithinInterval(new Date(t.createdAt), {
        start: todayStart,
        end: todayEnd,
      }),
    );
    const yesterdayTx = baseFilteredTransactions.filter((t) =>
      isWithinInterval(new Date(t.createdAt), {
        start: yesterdayStart,
        end: yesterdayEnd,
      }),
    );

    const todayAmount = todayTx.reduce((acc, t) => acc + t.amount, 0);
    const yesterdayAmount = yesterdayTx.reduce((acc, t) => acc + t.amount, 0);

    return {
      totalTransactions: filteredTransactions.length,
      totalAmount,
      avgTransaction,
      totalAmountTrend: toTrend(todayAmount, yesterdayAmount),
      todayTransactions: todayTx.length,
      todayTransactionsTrend: toTrend(todayTx.length, yesterdayTx.length),
    };
  }, [filteredTransactions, baseFilteredTransactions]);

  const bankTotals = useMemo(() => {
    const totals = new Map<string, number>();
    filteredTransactions.forEach((t) =>
      totals.set(t.bank, (totals.get(t.bank) ?? 0) + t.amount),
    );
    return Array.from(totals.entries())
      .map(([bank, totalAmount]) => ({ bank, totalAmount }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredTransactions]);

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
                    <TransactionsChart transactions={filteredTransactions} />
                  </div>
                  <BankDistributionChart transactions={filteredTransactions} />
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
                      {filteredTransactions.length} de {transactions.length}{" "}
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
                </div>
              </div>
            )}

            {activeTab === "accounts" && (
              <AccountsView
                accounts={accounts}
                movementsByAccount={movementsByAccount}
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

      <CreateTransactionDialog
        open={createDialogOpen}
        onOpenChange={handleCreateDialogOpenChange}
        banks={manualBanks}
        gmailAccounts={manualGmailAccounts}
        remeseros={remeseros}
        onCreated={handleManualTransactionCreated}
      />
    </div>
  );
}
