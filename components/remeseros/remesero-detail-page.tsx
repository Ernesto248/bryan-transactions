"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  CircleDollarSign,
  Clock3,
  MessageCircle,
  ReceiptText,
  RefreshCcw,
  Settings2,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { RemeseroDetailShell } from "@/components/remeseros/remesero-detail-shell";
import type {
  RemeseroDetailAssignment,
  RemeseroDetailData,
  RemeseroShareSummary,
} from "@/lib/types";
import { buildDetailMovementSummary } from "@/lib/remesero-ledger";
import { cn } from "@/lib/utils";
import {
  isDashboardTab,
  queueDashboardReturnTab,
} from "@/lib/dashboard-tabs";

type RemeseroDetailPageProps = {
  remeseroId: string;
};

function formatLocal(value: number) {
  return new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatLocalFlexible(value: number) {
  return new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatThousandsInput(value: string) {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return "";

  return digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat("es", {
  numeric: "always",
});

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "fecha invalida";

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  if (absMs < minuteMs) {
    return diffMs < 0 ? "hace unos segundos" : "en unos segundos";
  }

  if (absMs < hourMs) {
    return relativeTimeFormatter.format(
      Math.round(diffMs / minuteMs),
      "minute",
    );
  }

  if (absMs < dayMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / hourMs), "hour");
  }

  if (absMs < monthMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / dayMs), "day");
  }

  if (absMs < yearMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / monthMs), "month");
  }

  return relativeTimeFormatter.format(Math.round(diffMs / yearMs), "year");
}

function buildFilteredSummary(assignments: RemeseroDetailAssignment[]) {
  return buildDetailMovementSummary(assignments);
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="text-lg font-semibold leading-tight sm:text-xl">
            {value}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/80 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {hint ? (
        <p className="mt-3 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function RemeseroDetailPage({ remeseroId }: RemeseroDetailPageProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<RemeseroDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [selectedRangeId, setSelectedRangeId] = useState("current");
  const [priceFilter, setPriceFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [cashCup, setCashCup] = useState<number | null>(null);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [revertingById, setRevertingById] = useState<Record<string, boolean>>(
    {},
  );
  const [sharing, setSharing] = useState(false);
  const [editNombre, setEditNombre] = useState("");
  const [editPrecio, setEditPrecio] = useState("");
  const [savingRemesero, setSavingRemesero] = useState(false);
  const [deletingRemesero, setDeletingRemesero] = useState(false);

  const queueRemeserosReturn = useCallback(() => {
    queueDashboardReturnTab("remeseros");
  }, []);

  const loadCashCup = useCallback(async () => {
    try {
      const response = await fetch("/api/finances", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.overview?.settings) setCashCup(Number(payload.overview.settings.cashCup));
    } catch {}
  }, []);

  const navigateToDashboardTab = useCallback(
    (tab: string) => {
      if (!isDashboardTab(tab)) return;
      queueDashboardReturnTab(tab);
      router.push("/");
    },
    [router],
  );

  const resolveCurrentRange = useCallback(() => {
    if (!detail)
      return { from: null as string | null, to: null as string | null };

    const option = detail.rangeOptions.find(
      (row) => row.id === selectedRangeId,
    );
    if (option) {
      return { from: option.from, to: option.to };
    }

    return detail.selectedRange;
  }, [detail, selectedRangeId]);

  const loadDetail = useCallback(
    async (
      from?: string | null,
      to?: string | null,
      shouldShowSpinner = true,
    ) => {
      if (shouldShowSpinner) setLoading(true);
      else setReloading(true);

      setError(null);

      try {
        const url = new URL(
          `/api/remeseros/${remeseroId}/detail`,
          window.location.origin,
        );
        if (from !== undefined) url.searchParams.set("from", from ?? "");
        if (to !== undefined) url.searchParams.set("to", to ?? "");

        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) {
          setError("No se pudo cargar el detalle del remesero");
          return;
        }

        const data = (await res.json()) as {
          ok?: boolean;
          detail?: RemeseroDetailData;
        };

        if (!data?.ok || !data.detail) {
          setError("No se pudo cargar el detalle del remesero");
          return;
        }

        setDetail(data.detail);

        const matched = data.detail.rangeOptions.find(
          (option) =>
            option.from === data.detail?.selectedRange.from &&
            option.to === data.detail?.selectedRange.to,
        );
        setSelectedRangeId(matched?.id ?? "current");
      } catch {
        setError("No se pudo cargar el detalle del remesero");
      } finally {
        setLoading(false);
        setReloading(false);
      }
    },
    [remeseroId],
  );

  useEffect(() => {
    void loadDetail(undefined, undefined, true);
    void loadCashCup();
  }, [loadCashCup, loadDetail]);

  useEffect(() => {
    if (!detail) return;
    setEditNombre(detail.remesero.nombre);
    setEditPrecio(String(detail.remesero.precioActual));
  }, [detail]);

  const filteredAssignments = useMemo(() => {
    if (!detail) return [];

    const normalizedSearch = searchQuery.trim().toLowerCase();

    return detail.assignments.filter((row) => {
      const matchesPrice =
        priceFilter === "all" || row.priceApplied === Number(priceFilter);
      const matchesSearch =
        normalizedSearch.length === 0 ||
        row.senderName.toLowerCase().includes(normalizedSearch) ||
        (row.confirmationCode ?? "").toLowerCase().includes(normalizedSearch);

      return matchesPrice && matchesSearch;
    });
  }, [detail, priceFilter, searchQuery]);

  const filteredSummary = useMemo(
    () => buildFilteredSummary(filteredAssignments),
    [filteredAssignments],
  );

  const priceOptions = useMemo(() => {
    if (!detail) return [] as number[];
    return Array.from(
      new Set(detail.assignments.map((row) => row.priceApplied)),
    ).sort((a, b) => a - b);
  }, [detail]);

  const resetFilters = useCallback(() => {
    setPriceFilter("all");
    setSearchQuery("");
  }, []);

  const handleSettingsOpenChange = useCallback(
    (open: boolean) => {
      setSettingsOpen(open);

      if (!open && detail) {
        setEditNombre(detail.remesero.nombre);
        setEditPrecio(String(detail.remesero.precioActual));
      }
    },
    [detail],
  );

  const handleRangeChange = async (rangeId: string) => {
    if (!detail) return;

    const option = detail.rangeOptions.find((row) => row.id === rangeId);
    if (!option) return;

    setSelectedRangeId(rangeId);
    await loadDetail(option.from, option.to, false);
  };

  const handleCreatePayment = async () => {
    const amount = Number(String(paymentAmount).replace(/,/g, "").trim());
    if (!Number.isFinite(amount) || amount <= 0) return;

    setCreatingPayment(true);
    try {
      const res = await fetch(`/api/remeseros/${remeseroId}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountPaid: amount,
          note: paymentNote.trim() || undefined,
        }),
      });

      if (!res.ok) return;

      setPaymentAmount("");
      setPaymentNote("");

      const currentRange = resolveCurrentRange();
      await Promise.all([loadDetail(currentRange.from, currentRange.to, false), loadCashCup()]);
    } finally {
      setCreatingPayment(false);
    }
  };

  const handleRevertPayment = async (paymentId: string) => {
    setRevertingById((prev) => ({ ...prev, [paymentId]: true }));

    try {
      const res = await fetch(`/api/remeseros/${remeseroId}/payments`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });

      if (!res.ok) return;

      const currentRange = resolveCurrentRange();
      await Promise.all([loadDetail(currentRange.from, currentRange.to, false), loadCashCup()]);
    } finally {
      setRevertingById((prev) => ({ ...prev, [paymentId]: false }));
    }
  };

  const handleShareWhatsapp = async () => {
    setSharing(true);

    try {
      const res = await fetch(`/api/remeseros/${remeseroId}/share-summary`, {
        cache: "no-store",
      });

      if (!res.ok) return;

      const payload = (await res.json()) as {
        ok?: boolean;
        summary?: RemeseroShareSummary;
      };

      if (!payload?.ok || !payload.summary) return;

      const summary = payload.summary;
      const inicioType = summary.inicioDebt >= 0 ? "deuda" : "fondo";
      const finalType = summary.finalDebtType === "DEUDA" ? "deuda" : "fondo";

      const movementGroups = summary.netGroups ?? summary.groups;
      const tiradoLines =
        movementGroups.length === 0
          ? ["Sin movimientos desde el ultimo corte"]
          : movementGroups.map((group) => {
              const amounts = group.amountsUsd
                .map((amount) => formatLocalFlexible(amount))
                .join(", ");
              return `${formatLocalFlexible(group.priceApplied)} (${amounts}) = ${formatLocalFlexible(group.totalUsd)} USD`;
            });

      const lastCutLines = summary.cutAt
        ? [
            summary.cutType === "PAYMENT" && summary.lastPaymentAmount !== null
              ? `Monto pagado: $ ${formatLocalFlexible(summary.lastPaymentAmount)}`
              : `Saldo establecido: $ ${formatLocalFlexible(Math.abs(summary.inicioDebt))} ${inicioType}`,
            `Fecha y hora: ${formatDateTime(summary.cutAt)}`,
            ...(summary.cutNote ? [`Nota: ${summary.cutNote}`] : []),
          ]
        : ["Sin cortes registrados"];

      const message = [
        `*👤 GESTOR:* ${summary.remeseroNombre}`,
        "",
        "*ULTIMO CORTE*",
        ...lastCutLines,
        "",
        "*🚩 INICIO*",
        `💰 $ ${formatLocalFlexible(Math.abs(summary.inicioDebt))} ${inicioType}`,
        "",
        "*MOVIMIENTOS NETOS*",
        ...tiradoLines,
        `🧮 Total USD: ${formatLocalFlexible(summary.totalTiradoUsd)} USD`,
        "",
        "*TOTAL NETO*",
        `💵 $ ${formatLocalFlexible(summary.totalTiradoCup)}`,
        "",
        "*🏁 FINAL*",
        `💸 $ ${formatLocalFlexible(Math.abs(summary.finalDebt))} ${finalType}`,
      ].join("\n");

      const encodedMessage = encodeURIComponent(message);
      const appUrl = `whatsapp://send?text=${encodedMessage}`;
      const webUrl = `https://api.whatsapp.com/send?text=${encodedMessage}`;
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        window.location.href = appUrl;
        return;
      }

      window.open(webUrl, "_blank", "noopener,noreferrer");
    } finally {
      setSharing(false);
    }
  };

  const handleSaveRemesero = async () => {
    const trimmedName = editNombre.trim();
    const parsedPrice = Number(editPrecio);

    if (!trimmedName) return;
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return;

    setSavingRemesero(true);
    try {
      const res = await fetch(`/api/remeseros/${remeseroId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre: trimmedName,
          precioActual: parsedPrice,
        }),
      });

      if (!res.ok) return;

      const currentRange = resolveCurrentRange();
      await loadDetail(currentRange.from, currentRange.to, false);
      setSettingsOpen(false);
    } finally {
      setSavingRemesero(false);
    }
  };

  const handleDeleteRemesero = async () => {
    const confirmed = window.confirm(
      "Seguro que quieres eliminar este remesero? Esta accion no se puede deshacer.",
    );
    if (!confirmed) return;

    setDeletingRemesero(true);
    try {
      const res = await fetch(`/api/remeseros/${remeseroId}`, {
        method: "DELETE",
      });

      if (!res.ok) return;
      queueRemeserosReturn();
      window.location.assign("/");
    } finally {
      setDeletingRemesero(false);
    }
  };

  if (loading) {
    return (
      <RemeseroDetailShell
        onNavigate={navigateToDashboardTab}
        isRefreshing
      >
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-10 w-full sm:w-48" />
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Skeleton className="h-10 w-full sm:w-32" />
              <Skeleton className="h-10 w-full sm:w-36" />
            </div>
          </div>

          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-56" />
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </CardContent>
          </Card>

          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </RemeseroDetailShell>
    );
  }

  if (!detail || error) {
    return (
      <RemeseroDetailShell
        onNavigate={navigateToDashboardTab}
        onRefresh={() => void loadDetail(undefined, undefined, true)}
        isRefreshing={loading}
      >
        <div className="space-y-4">
          <Button asChild variant="outline">
            <Link href="/" onClick={queueRemeserosReturn}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Volver a remeseros
            </Link>
          </Button>
          <p className="text-sm text-destructive">
            {error ?? "No se pudo cargar el detalle"}
          </p>
          <Button
            type="button"
            onClick={() => void loadDetail(undefined, undefined, true)}
          >
            Reintentar
          </Button>
        </div>
      </RemeseroDetailShell>
    );
  }

  const isDebt = detail.remesero.deudaActual >= 0;
  const balanceType = isDebt ? "deuda" : "fondo";
  const balanceAccentClass = isDebt
    ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  const balanceValueClass = isDebt ? "text-amber-200" : "text-emerald-200";
  const currentRangeOption =
    detail.rangeOptions.find((option) => option.id === selectedRangeId) ??
    detail.rangeOptions[0] ??
    null;
  const latestCut = detail.cuts?.[0] ?? null;
  const paymentsPreview = detail.payments.slice(0, 2);
  const visiblePayments = showAllPayments ? detail.payments : paymentsPreview;
  const activePaymentsCount = detail.payments.filter(
    (payment) => payment.revertedAt === null,
  ).length;
  const revertedPaymentsCount = detail.payments.length - activePaymentsCount;
  const hasFilters = priceFilter !== "all" || searchQuery.trim().length > 0;
  const hiddenPaymentsCount = Math.max(
    detail.payments.length - paymentsPreview.length,
    0,
  );
  const selectClassName =
    "h-10 w-full rounded-xl border border-input bg-background/80 px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20";

  return (
    <RemeseroDetailShell
      onNavigate={navigateToDashboardTab}
      onRefresh={() =>
        void loadDetail(
          detail.selectedRange.from,
          detail.selectedRange.to,
          false,
        )
      }
      isRefreshing={reloading}
    >
      <Dialog open={settingsOpen} onOpenChange={handleSettingsOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Configuracion del remesero</DialogTitle>
            <DialogDescription>
              Edita los datos base sin mezclar esta accion con la operacion
              diaria del tramo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nombre</Label>
                <Input
                  id="edit-name"
                  value={editNombre}
                  onChange={(event) => setEditNombre(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price">Precio actual</Label>
                <Input
                  id="edit-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editPrecio}
                  onChange={(event) => setEditPrecio(event.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                onClick={handleSaveRemesero}
                disabled={savingRemesero}
                className="w-full sm:w-auto"
              >
                {savingRemesero ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>

            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                Zona delicada
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Eliminar este remesero borra su registro principal de la
                interfaz. Hazlo solo si ya validaste que no lo necesitas.
              </p>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteRemesero}
                disabled={deletingRemesero}
                className="mt-4 w-full sm:w-auto"
              >
                {deletingRemesero ? "Eliminando..." : "Eliminar remesero"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        <section className="overflow-hidden rounded-3xl border border-border/80 bg-card/95 shadow-sm">
          <div className="border-b border-border/70 px-4 py-4 md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-3">
                <Button
                  asChild
                  variant="ghost"
                  className="w-fit px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  <Link href="/" onClick={queueRemeserosReturn}>
                    <ArrowLeft className="h-4 w-4" /> Volver a remeseros
                  </Link>
                </Button>

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                        {detail.remesero.nombre}
                      </h1>
                      <Badge
                        className={cn(
                          "border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em]",
                          balanceAccentClass,
                        )}
                      >
                        {isDebt ? "Con deuda" : "Con fondo"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-border/70 bg-background/60 px-3 py-1 text-xs uppercase tracking-[0.16em] text-muted-foreground"
                      >
                        Precio{" "}
                        {formatLocalFlexible(detail.remesero.precioActual)}
                      </Badge>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0 rounded-full"
                      onClick={() => setSettingsOpen(true)}
                      aria-label="Abrir configuracion del remesero"
                      title="Configuracion del remesero"
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                    Vista operativa del remesero para controlar saldo, tramo
                    activo y cortes sin perder contexto en móvil o desktop.
                  </p>

                  <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Tramo activo:
                    </span>{" "}
                    {currentRangeOption?.label ?? "Sin tramo disponible"}
                  </div>
                </div>
              </div>

              <div className="flex w-full flex-row gap-2 sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void loadDetail(
                      detail.selectedRange.from,
                      detail.selectedRange.to,
                      false,
                    )
                  }
                  disabled={reloading}
                  className="flex-1 sm:flex-none"
                >
                  <RefreshCcw className="h-4 w-4" />
                  {reloading ? "Actualizando..." : "Actualizar"}
                </Button>
                <Button
                  type="button"
                  onClick={handleShareWhatsapp}
                  disabled={sharing}
                  className="flex-1 sm:flex-none"
                >
                  <MessageCircle className="h-4 w-4" />
                  {sharing ? "Compartiendo..." : "Compartir"}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]">
            <div className="space-y-4">
              <div className="rounded-3xl border border-border/70 bg-background/55 p-5 md:p-6">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  Saldo actual
                </p>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <p
                    className={cn(
                      "text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl",
                      balanceValueClass,
                    )}
                  >
                    {formatLocalFlexible(Math.abs(detail.remesero.deudaActual))}
                  </p>
                  <Badge
                    className={cn(
                      "border px-3 py-1 text-xs uppercase tracking-[0.16em]",
                      balanceAccentClass,
                    )}
                  >
                    {balanceType}
                  </Badge>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {isDebt
                    ? "Este es el monto pendiente que el remesero mantiene frente al negocio."
                    : "Este monto representa saldo a favor disponible para próximos movimientos."}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryMetric
                  icon={Wallet}
                  label="Inicio tramo"
                  value={formatLocal(detail.selectedRange.inicioDebt ?? 0)}
                  hint="Saldo establecido por el corte anterior"
                />
                <SummaryMetric
                  icon={CircleDollarSign}
                  label="Total neto"
                  value={formatLocal(detail.summary.totalCup)}
                  hint="Asignaciones menos desasignaciones"
                />
                <SummaryMetric
                  icon={TrendingUp}
                  label="USD netos"
                  value={formatLocalFlexible(detail.summary.totalUsd)}
                  hint="Monto total en USD del corte"
                />
                <SummaryMetric
                  icon={ReceiptText}
                  label="Operaciones netas"
                  value={String(detail.summary.txCount)}
                  hint={`${detail.summary.movementCount ?? detail.assignments.length} movimientos visibles`}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-border/70 bg-background/55 p-5 md:p-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                Contexto operativo
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Ultimo corte valido
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {latestCut
                      ? latestCut.type === "PAYMENT"
                        ? `$ ${formatLocalFlexible(latestCut.amountPaid ?? 0)} pagados`
                        : `$ ${formatLocalFlexible(Math.abs(latestCut.balanceAfter ?? 0))} de saldo`
                      : "Sin cortes"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {latestCut
                      ? `${latestCut.type === "PAYMENT" ? "Pago" : "Ajuste manual"} · ${formatDateTime(latestCut.cutAt)}`
                      : "Aun no se ha registrado un corte para este remesero."}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Pagos activos
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {activePaymentsCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Reversiones
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {revertedPaymentsCount}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                  Ultima actualizacion del remesero:{" "}
                  {formatDateTime(detail.remesero.updatedAt)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <section className="space-y-6">
            <Card className="border-border/80 bg-card/95">
              <CardHeader className="space-y-2 px-4 py-5 md:px-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Wallet className="h-4 w-4" />
                  Nuevo corte
                </div>
                <CardTitle className="text-xl">Registrar pago</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Coloca el corte antes de revisar el tramo para que la
                  operacion siga el orden natural del flujo.
                </p>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pb-5 md:px-6 md:pb-6">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                  <div className="space-y-2">
                    <Label htmlFor="new-payment">Monto pagado (CUP)</Label>
                    <Input
                      id="new-payment"
                      inputMode="numeric"
                      value={paymentAmount}
                      onChange={(event) =>
                        setPaymentAmount(
                          formatThousandsInput(event.target.value),
                        )
                      }
                      placeholder="1,000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-note">Nota</Label>
                    <Input
                      id="new-note"
                      value={paymentNote}
                      onChange={(event) => setPaymentNote(event.target.value)}
                      placeholder="Transferencia"
                    />
                  </div>
                </div>
                {cashCup !== null && Number(String(paymentAmount).replace(/,/g, "")) > 0 ? (
                  <p className="rounded-lg bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
                    Efectivo CUP: {formatLocalFlexible(cashCup)} → {formatLocalFlexible(cashCup - Number(String(paymentAmount).replace(/,/g, "")))}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">El pago se descontará del efectivo CUP.</p>
                )}
                <Button
                  type="button"
                  onClick={handleCreatePayment}
                  disabled={creatingPayment}
                  className="w-full sm:w-auto"
                >
                  {creatingPayment ? "Registrando..." : "Registrar pago"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/95">
              <CardHeader className="space-y-2 px-4 py-5 md:px-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                  Historial de pagos
                </div>
                <CardTitle className="text-xl">Ultimos pagos</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Mostramos primero los ultimos 2 pagos para no alargar la
                  pantalla; puedes expandir el resto cuando lo necesites.
                </p>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-5 md:px-6 md:pb-6">
                {detail.payments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-background/40 px-4 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      Sin pagos registrados.
                    </p>
                  </div>
                ) : (
                  visiblePayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-2xl border border-border/70 bg-background/45 p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={cn(
                                "text-base font-semibold",
                                payment.revertedAt &&
                                  "line-through text-muted-foreground",
                              )}
                            >
                              $ {formatLocalFlexible(payment.amountPaid)}
                            </p>
                            <Badge
                              variant="outline"
                              className={cn(
                                "border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em]",
                                payment.revertedAt
                                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
                              )}
                            >
                              {payment.revertedAt ? "Revertido" : "Aplicado"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(payment.paidAt)}
                          </p>
                          <p className="break-words text-sm text-muted-foreground">
                            {payment.note ?? "Sin nota"}
                          </p>
                          {payment.revertedAt ? (
                            <p className="text-xs text-destructive">
                              Revertido: {formatDateTime(payment.revertedAt)}
                            </p>
                          ) : null}
                        </div>

                        {!payment.revertedAt ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => void handleRevertPayment(payment.id)}
                            disabled={revertingById[payment.id] === true}
                          >
                            {revertingById[payment.id]
                              ? "Revirtiendo..."
                              : "Revertir"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}

                {!showAllPayments && hiddenPaymentsCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => setShowAllPayments(true)}
                  >
                    Ver mas
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/80 bg-card/95">
              <CardHeader className="border-b border-border/70 px-4 py-5 md:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <SlidersHorizontal className="h-4 w-4" />
                      Actividad del tramo
                    </div>
                    <CardTitle className="text-xl">
                      Historial de movimientos
                    </CardTitle>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      {hasFilters
                        ? `Mostrando ${filteredAssignments.length} de ${detail.assignments.length} registros historicos del tramo seleccionado.`
                        : "Filtros y resultados integrados en una sola zona para reducir scroll y cambios de contexto."}
                    </p>
                  </div>

                  {hasFilters ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={resetFilters}
                      className="w-full sm:w-auto"
                    >
                      Limpiar filtros
                    </Button>
                  ) : null}
                </div>
              </CardHeader>

              <CardContent className="space-y-5 px-4 py-5 md:px-6 md:py-6">
                <div className="grid gap-3 xl:grid-cols-[minmax(250px,1.1fr)_minmax(180px,0.65fr)_minmax(240px,1fr)]">
                  <div className="space-y-2">
                    <Label htmlFor="range">Tramo entre cortes</Label>
                    <select
                      id="range"
                      title="Tramo entre cortes"
                      className={selectClassName}
                      value={selectedRangeId}
                      onChange={(event) =>
                        void handleRangeChange(event.target.value)
                      }
                    >
                      {detail.rangeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price-filter">Precio aplicado</Label>
                    <select
                      id="price-filter"
                      title="Filtrar por precio"
                      className={selectClassName}
                      value={priceFilter}
                      onChange={(event) => setPriceFilter(event.target.value)}
                    >
                      <option value="all">Todos</option>
                      {priceOptions.map((price) => (
                        <option key={price} value={String(price)}>
                          {formatLocalFlexible(price)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="search">Buscar remitente o codigo</Label>
                    <Input
                      id="search"
                      placeholder="Nombre o codigo"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <SummaryMetric
                    icon={TrendingUp}
                    label="USD netos"
                    value={formatLocalFlexible(filteredSummary.totalUsd)}
                    hint={
                      hasFilters
                        ? "Resultados segun filtros activos"
                        : "Monto visible en la lista actual"
                    }
                  />
                  <SummaryMetric
                    icon={Wallet}
                    label="CUP netos"
                    value={formatLocal(filteredSummary.totalCup)}
                    hint={
                      hasFilters
                        ? "Resumen filtrado para este tramo"
                        : "Balance visible en la lista actual"
                    }
                  />
                  <SummaryMetric
                    icon={ReceiptText}
                    label="Operaciones netas"
                    value={String(filteredSummary.txCount)}
                    hint={
                      hasFilters
                        ? `${filteredAssignments.length} registros historicos filtrados`
                        : `${filteredSummary.movementCount ?? filteredAssignments.length} movimientos visibles`
                    }
                  />
                </div>

                <div className="space-y-3">
                  {filteredAssignments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/80 bg-background/40 px-4 py-10 text-center">
                      <p className="text-sm font-medium text-foreground">
                        No hay transacciones para este filtro.
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Cambia el tramo o limpia los filtros para volver a ver
                        actividad.
                      </p>
                    </div>
                  ) : (
                    filteredAssignments.map((row) => (
                      <div
                        key={row.assignmentId}
                        className="rounded-2xl border border-border/70 bg-background/45 p-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold break-words">
                                {row.senderName}
                              </p>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em]",
                                  row.isActive
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                    : "border-border/70 bg-background/70 text-muted-foreground",
                                )}
                              >
                                {row.isActive ? "Activa" : "Desasignada"}
                              </Badge>
                              <Badge variant="outline">
                                {row.netOperations === 1
                                  ? "Suma al tramo"
                                  : row.netOperations === -1
                                    ? "Resta al tramo"
                                    : "Efecto neto 0"}
                              </Badge>
                            </div>

                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                {row.confirmationCode ?? "Sin codigo"}
                              </span>
                              <span>{row.bank ?? "Sin banco"}</span>
                              <span>{row.accountName ?? "Sin cuenta"}</span>
                            </div>

                            <p className="text-xs text-muted-foreground">
                              Asignada: {formatDateTime(row.assignedAt)}
                            </p>
                            {row.unassignedAt ? (
                              <p className="text-xs text-muted-foreground">
                                Desasignada: {formatDateTime(row.unassignedAt)}
                              </p>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-3 gap-2 md:min-w-[280px]">
                            <div className="rounded-xl border border-border/60 bg-background/70 p-3 text-center">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                USD
                              </p>
                              <p className="mt-1 text-sm font-semibold">
                                {formatLocalFlexible(row.amountUsd)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-background/70 p-3 text-center">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                Precio
                              </p>
                              <p className="mt-1 text-sm font-semibold">
                                {formatLocalFlexible(row.priceApplied)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-background/70 p-3 text-center">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                Total
                              </p>
                              <p className="mt-1 text-sm font-semibold">
                                {formatLocal(row.debtAmount)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-6 xl:sticky xl:top-6">
            <Card className="border-border/80 bg-card/95">
              <CardHeader className="space-y-2 px-4 py-5 md:px-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  {hasFilters ? "Resumen filtrado" : "Resumen por precio"}
                </div>
                <CardTitle className="text-lg">
                  Lectura rapida del tramo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-5 md:px-5 md:pb-5">
                {filteredSummary.groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin movimientos en este tramo.
                  </p>
                ) : (
                  filteredSummary.groups.map((group) => (
                    <div
                      key={group.priceApplied}
                      className="rounded-2xl border border-border/70 bg-background/45 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            Precio {formatLocalFlexible(group.priceApplied)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {group.amountsUsd
                              .map((amount) => formatLocalFlexible(amount))
                              .join(", ")}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-border/70 bg-background/70 text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
                        >
                          {group.txCount} ops
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-2">
                        <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            USD
                          </p>
                          <p className="mt-1 font-semibold">
                            {formatLocalFlexible(group.totalUsd)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            CUP
                          </p>
                          <p className="mt-1 font-semibold">
                            {formatLocal(group.totalCup)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </RemeseroDetailShell>
  );
}
