"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronUp,
  CircleDollarSign,
  DollarSign,
  MessageCircle,
  PencilLine,
  Plus,
} from "lucide-react";
import { CreateRemeseroPaymentDialog } from "./create-remesero-payment-dialog";
import { cn } from "@/lib/utils";
import type {
  Remesero,
  RemeseroPayment,
  RemeseroShareSummary,
  TransactionFeedPageInfo,
} from "@/lib/types";

type RemeserosViewProps = {
  remeseros: Remesero[];
  paymentsByRemesero: Record<string, RemeseroPayment[]>;
  paymentPagesByRemesero?: Record<string, TransactionFeedPageInfo>;
  loadingRemeseros: boolean;
  loadingPaymentsByRemesero: Record<string, boolean>;
  onRefreshRemeseros: () => Promise<void>;
  onCreateRemesero: (input: {
    nombre: string;
    precioActual: number;
  }) => Promise<void>;
  onUpdateRemesero: (
    id: string,
    input: {
      nombre?: string;
      precioActual?: number;
      deudaActual?: number;
      deudaActualNote?: string;
    },
  ) => Promise<boolean>;
  onDeleteRemesero: (id: string) => Promise<void>;
  onLoadPayments: (id: string, append?: boolean) => Promise<void>;
  onCreatePayment: (
    id: string,
    input: { amountPaid: number; note?: string },
  ) => Promise<void>;
  onRevertPayment: (
    remeseroId: string,
    paymentId: string,
    reason?: string,
  ) => Promise<void>;
  onGetShareSummary: (id: string) => Promise<RemeseroShareSummary | null>;
};

type DebtBalanceKind = "deuda" | "fondo";

export function RemeserosView({
  remeseros,
  paymentsByRemesero,
  paymentPagesByRemesero = {},
  loadingRemeseros,
  loadingPaymentsByRemesero,
  onRefreshRemeseros,
  onCreateRemesero,
  onUpdateRemesero,
  onDeleteRemesero,
  onLoadPayments,
  onCreatePayment,
  onRevertPayment,
  onGetShareSummary,
}: RemeserosViewProps) {
  const [newNombre, setNewNombre] = useState("");
  const [newPrecio, setNewPrecio] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [showPaymentsByRemesero, setShowPaymentsByRemesero] = useState<
    Record<string, boolean>
  >({});
  const [editingById, setEditingById] = useState<
    Record<string, { nombre: string; precioActual: string }>
  >({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [deletingById, setDeletingById] = useState<Record<string, boolean>>({});
  const [paymentDraftById, setPaymentDraftById] = useState<
    Record<string, { amountPaid: string; note: string }>
  >({});
  const [creatingPaymentById, setCreatingPaymentById] = useState<
    Record<string, boolean>
  >({});
  const [revertingPaymentById, setRevertingPaymentById] = useState<
    Record<string, boolean>
  >({});
  const [sharingById, setSharingById] = useState<Record<string, boolean>>({});
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [payingRemesero, setPayingRemesero] = useState<Remesero | null>(null);
  const [debtEditingRemesero, setDebtEditingRemesero] =
    useState<Remesero | null>(null);
  const [debtDraft, setDebtDraft] = useState("");
  const [debtBalanceKind, setDebtBalanceKind] =
    useState<DebtBalanceKind>("deuda");
  const [savingDebt, setSavingDebt] = useState(false);
  const [debtEditError, setDebtEditError] = useState<string | null>(null);
  const [priceEditingRemesero, setPriceEditingRemesero] =
    useState<Remesero | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceEditError, setPriceEditError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const deudaTotal = remeseros.reduce(
      (acc, remesero) => acc + remesero.deudaActual,
      0,
    );
    return { deudaTotal };
  }, [remeseros]);

  const formatUsd = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatLocal = (amount: number) => {
    return new Intl.NumberFormat("es-DO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatLocalFlexible = (amount: number) => {
    return new Intl.NumberFormat("es-DO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDateTime = (value: string) => {
    return new Date(value).toLocaleString("es-DO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("es-DO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatThousandsInput = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "");
    if (!digitsOnly) return "";

    return digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const parseThousandsInput = (value: string) => {
    const normalized = value.replace(/,/g, "").trim();
    return Number(normalized);
  };

  const ensureEditing = (remesero: Remesero) => {
    const current = editingById[remesero.id];
    if (current) return current;
    return {
      nombre: remesero.nombre,
      precioActual: String(remesero.precioActual),
    };
  };

  const handleCreate = async () => {
    if (!newNombre.trim()) return;
    const parsedPrice = Number(newPrecio);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return;

    setCreating(true);
    try {
      await onCreateRemesero({
        nombre: newNombre.trim(),
        precioActual: parsedPrice,
      });
      setNewNombre("");
      setNewPrecio("");
      setCreateModalOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedById((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const togglePayments = async (id: string) => {
    const nextVisible = !(showPaymentsByRemesero[id] === true);
    setShowPaymentsByRemesero((prev) => ({ ...prev, [id]: nextVisible }));

    if (nextVisible) {
      await onLoadPayments(id);
    }
  };

  const handleSave = async (id: string) => {
    const draft = editingById[id];
    if (!draft) return;

    const payload: { nombre?: string; precioActual?: number } = {};

    if (draft.nombre.trim()) {
      payload.nombre = draft.nombre.trim();
    }

    if (draft.precioActual.trim() !== "") {
      const parsedPrice = Number(draft.precioActual);
      if (Number.isFinite(parsedPrice) && parsedPrice >= 0) {
        payload.precioActual = parsedPrice;
      }
    }

    if (Object.keys(payload).length === 0) return;

    setSavingById((prev) => ({ ...prev, [id]: true }));
    try {
      await onUpdateRemesero(id, payload);
    } finally {
      setSavingById((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingById((prev) => ({ ...prev, [id]: true }));
    try {
      await onDeleteRemesero(id);
    } finally {
      setDeletingById((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleCreatePayment = async (id: string) => {
    const draft = paymentDraftById[id] ?? { amountPaid: "", note: "" };
    const amountPaid = parseThousandsInput(draft.amountPaid);
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) return;

    setCreatingPaymentById((prev) => ({ ...prev, [id]: true }));
    try {
      await onCreatePayment(id, {
        amountPaid,
        note: draft.note.trim() || undefined,
      });
      setPaymentDraftById((prev) => ({
        ...prev,
        [id]: { amountPaid: "", note: "" },
      }));
    } finally {
      setCreatingPaymentById((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleShareWhatsapp = async (remesero: Remesero) => {
    setSharingById((prev) => ({ ...prev, [remesero.id]: true }));
    try {
      const summary = await onGetShareSummary(remesero.id);
      if (!summary) return;

      const inicioType = summary.inicioDebt >= 0 ? "deuda" : "fondo";
      const finalType = summary.finalDebtType === "DEUDA" ? "deuda" : "fondo";

      const movementGroups = summary.netGroups ?? summary.groups;
      const tiradoLines =
        movementGroups.length === 0
          ? ["Sin movimientos desde el ultimo corte"]
          : movementGroups.map((group) => {
              const price = formatPrice(group.priceApplied);
              const amounts = group.amountsUsd
                .map((amount) => formatLocalFlexible(amount))
                .join(", ");
              return `${price} (${amounts}) = ${formatLocalFlexible(group.totalUsd)} USD`;
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
      const isMobile =
        typeof navigator !== "undefined" &&
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        window.location.href = appUrl;
        return;
      }

      window.open(webUrl, "_blank", "noopener,noreferrer");
    } finally {
      setSharingById((prev) => ({ ...prev, [remesero.id]: false }));
    }
  };

  const handleRevertPayment = async (remeseroId: string, paymentId: string) => {
    setRevertingPaymentById((prev) => ({ ...prev, [paymentId]: true }));
    try {
      await onRevertPayment(remeseroId, paymentId);
    } finally {
      setRevertingPaymentById((prev) => ({ ...prev, [paymentId]: false }));
    }
  };

  const handleOpenPayment = (remesero: Remesero) => {
    setPayingRemesero(remesero);
    setPaymentDialogOpen(true);
  };

  const handleOpenDebtEdit = (remesero: Remesero) => {
    setDebtEditingRemesero(remesero);
    setDebtDraft(String(Math.abs(remesero.deudaActual)));
    setDebtBalanceKind(remesero.deudaActual < 0 ? "fondo" : "deuda");
    setDebtEditError(null);
  };

  const handleOpenPriceEdit = (remesero: Remesero) => {
    setPriceEditingRemesero(remesero);
    setPriceDraft(String(remesero.precioActual));
    setPriceEditError(null);
  };

  const handlePriceDialogOpenChange = (open: boolean) => {
    if (open || savingPrice) return;
    setPriceEditingRemesero(null);
    setPriceDraft("");
    setPriceEditError(null);
  };

  const handleSavePrice = async () => {
    if (!priceEditingRemesero) return;

    const precioActual = Number(priceDraft);
    if (!Number.isFinite(precioActual) || precioActual < 0) {
      setPriceEditError("Ingresa un precio valido igual o mayor que 0.");
      return;
    }

    setSavingPrice(true);
    setPriceEditError(null);
    try {
      const updated = await onUpdateRemesero(priceEditingRemesero.id, {
        precioActual,
      });
      if (!updated) {
        setPriceEditError("No se pudo actualizar el precio.");
        return;
      }

      setPriceEditingRemesero(null);
      setPriceDraft("");
    } finally {
      setSavingPrice(false);
    }
  };

  const handleDebtDialogOpenChange = (open: boolean) => {
    if (open || savingDebt) return;
    setDebtEditingRemesero(null);
    setDebtDraft("");
    setDebtBalanceKind("deuda");
    setDebtEditError(null);
  };

  const handleSaveDebt = async () => {
    if (!debtEditingRemesero) return;

    if (debtDraft.trim() === "") {
      setDebtEditError("Ingresa una deuda valida.");
      return;
    }

    const amount = Number(debtDraft);
    if (!Number.isFinite(amount) || amount < 0) {
      setDebtEditError("Ingresa un monto valido igual o mayor que 0.");
      return;
    }

    const normalizedKind = amount === 0 ? "deuda" : debtBalanceKind;
    const deudaActual = normalizedKind === "fondo" ? -amount : amount;

    setSavingDebt(true);
    setDebtEditError(null);
    try {
      const updated = await onUpdateRemesero(debtEditingRemesero.id, {
        deudaActual,
        deudaActualNote: "Ajuste manual desde la interfaz",
      });
      if (!updated) {
        setDebtEditError("No se pudo actualizar la deuda.");
        return;
      }

      setDebtEditingRemesero(null);
      setDebtDraft("");
      setDebtBalanceKind("deuda");
    } finally {
      setSavingDebt(false);
    }
  };

  const debtDraftIsZero =
    debtDraft.trim() !== "" && Number(debtDraft) === 0;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground">
            Remeseros
          </h2>
          <p className="text-sm text-muted-foreground">
            {remeseros.length} remeseros · Deuda total:{" "}
            {formatLocal(totals.deudaTotal)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRefreshRemeseros}
          disabled={loadingRemeseros}
        >
          {loadingRemeseros ? "Actualizando..." : "Actualizar"}
        </Button>
      </div>

      <div className="grid gap-4">
        {remeseros.map((remesero) => {
          const editing = ensureEditing(remesero);
          const payments = paymentsByRemesero[remesero.id] ?? [];
          const isExpanded = expandedById[remesero.id] === true;
          const paymentsVisible = showPaymentsByRemesero[remesero.id] === true;
          const paymentDraft = paymentDraftById[remesero.id] ?? {
            amountPaid: "",
            note: "",
          };
          const loadingPayments =
            loadingPaymentsByRemesero[remesero.id] === true;

          return (
            <Card
              key={remesero.id}
              className="relative cursor-pointer overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-secondary/20 shadow-sm transition-all duration-200 hover:border-primary/35 hover:shadow-md"
            >
              <Link
                href={`/remeseros/${remesero.id}`}
                aria-label={`Ver detalle de ${remesero.nombre}`}
                className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
              >
                <span className="sr-only">Ver detalle de {remesero.nombre}</span>
              </Link>
              <CardHeader className="pointer-events-none relative z-10 pb-2 space-y-3">
                {isExpanded && (
                  <div className="pointer-events-auto flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleShareWhatsapp(remesero)}
                      disabled={sharingById[remesero.id] === true}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      {sharingById[remesero.id]
                        ? "Compartiendo..."
                        : "Compartir"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => toggleExpanded(remesero.id)}
                    >
                      Contraer <ChevronUp className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
                <div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-border bg-background/80 px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Nombre
                      </p>
                      <CardTitle className="text-sm md:text-base truncate mt-1">
                        {remesero.nombre}
                      </CardTitle>
                    </div>
                    <div className="rounded-xl border border-border bg-background/80 px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Precio
                      </p>
                      <p className="text-sm md:text-base font-semibold text-foreground mt-1">
                        {formatPrice(remesero.precioActual)}
                      </p>
                    </div>
                    <div
                      className={cn(
                        "rounded-xl px-3 py-2",
                        remesero.deudaActual < 0
                          ? "border border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/10"
                          : "border border-primary/20 bg-primary/10",
                      )}
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Deuda actual
                      </p>
                      <p
                        className={cn(
                          "text-sm md:text-base font-semibold mt-1",
                          remesero.deudaActual < 0
                            ? "text-[hsl(var(--success))]"
                            : "text-primary",
                        )}
                      >
                        {formatLocal(remesero.deudaActual)}
                      </p>
                    </div>
                  </div>
                </div>
                {!isExpanded && (
                  <div className="pointer-events-auto mx-auto grid w-full max-w-md grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full min-w-0 justify-center px-2"
                      onClick={() => handleShareWhatsapp(remesero)}
                      disabled={sharingById[remesero.id] === true}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      {sharingById[remesero.id]
                        ? "Compartiendo..."
                        : "Compartir"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full min-w-0 justify-center px-2"
                      onClick={() => handleOpenPayment(remesero)}
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Pagar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full min-w-0 justify-center px-2"
                      onClick={() => handleOpenDebtEdit(remesero)}
                    >
                      <PencilLine className="h-4 w-4 mr-1" />
                      Editar deuda
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full min-w-0 justify-center px-2"
                      onClick={() => handleOpenPriceEdit(remesero)}
                    >
                      <CircleDollarSign className="h-4 w-4 mr-1" />
                      Precio
                    </Button>
                  </div>
                )}
              </CardHeader>
              {isExpanded && (
                <CardContent className="pointer-events-auto relative z-10 space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Deuda actual
                      </p>
                      <p className="text-2xl font-semibold text-foreground">
                        {formatLocal(remesero.deudaActual)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`nombre-${remesero.id}`}>Nombre</Label>
                      <Input
                        id={`nombre-${remesero.id}`}
                        value={editing.nombre}
                        onChange={(event) =>
                          setEditingById((prev) => ({
                            ...prev,
                            [remesero.id]: {
                              ...editing,
                              nombre: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`precio-${remesero.id}`}>
                        Precio actual
                      </Label>
                      <Input
                        id={`precio-${remesero.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={editing.precioActual}
                        onChange={(event) =>
                          setEditingById((prev) => ({
                            ...prev,
                            [remesero.id]: {
                              ...editing,
                              precioActual: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => handleSave(remesero.id)}
                      disabled={savingById[remesero.id] === true}
                    >
                      {savingById[remesero.id]
                        ? "Guardando..."
                        : "Guardar cambios"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleDelete(remesero.id)}
                      disabled={deletingById[remesero.id] === true}
                    >
                      {deletingById[remesero.id] ? "Eliminando..." : "Eliminar"}
                    </Button>
                  </div>

                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium">Historial de pagos</h3>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => togglePayments(remesero.id)}
                        disabled={loadingPayments}
                      >
                        {loadingPayments
                          ? "Cargando..."
                          : paymentsVisible
                            ? "Ocultar pagos"
                            : "Ver pagos"}
                      </Button>
                    </div>

                    {paymentsVisible && (
                      <>
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor={`payment-amount-${remesero.id}`}>
                              Monto pagado (CUP)
                            </Label>
                            <Input
                              id={`payment-amount-${remesero.id}`}
                              type="text"
                              inputMode="numeric"
                              value={paymentDraft.amountPaid}
                              onChange={(event) =>
                                setPaymentDraftById((prev) => ({
                                  ...prev,
                                  [remesero.id]: {
                                    ...paymentDraft,
                                    amountPaid: formatThousandsInput(
                                      event.target.value,
                                    ),
                                  },
                                }))
                              }
                              placeholder="1,000"
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label htmlFor={`payment-note-${remesero.id}`}>
                              Nota (opcional)
                            </Label>
                            <Input
                              id={`payment-note-${remesero.id}`}
                              value={paymentDraft.note}
                              onChange={(event) =>
                                setPaymentDraftById((prev) => ({
                                  ...prev,
                                  [remesero.id]: {
                                    ...paymentDraft,
                                    note: event.target.value,
                                  },
                                }))
                              }
                              placeholder="Transferencia, efectivo, etc"
                            />
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          El pago se descontará del efectivo CUP y al revertirlo se devolverá al balance.
                        </p>

                        <Button
                          type="button"
                          onClick={() => handleCreatePayment(remesero.id)}
                          disabled={creatingPaymentById[remesero.id] === true}
                        >
                          {creatingPaymentById[remesero.id]
                            ? "Registrando..."
                            : "Registrar pago"}
                        </Button>

                        <div className="space-y-2">
                          {payments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Sin pagos registrados
                            </p>
                          ) : (
                            payments.map((payment) => (
                              <div
                                key={payment.id}
                                className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm md:flex-row md:items-center md:justify-between"
                              >
                                <div>
                                  <p
                                    className={
                                      payment.revertedAt
                                        ? "font-medium line-through text-muted-foreground"
                                        : "font-medium"
                                    }
                                  >
                                    {formatUsd(payment.amountPaid)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(payment.paidAt).toLocaleString(
                                      "es-DO",
                                    )}
                                  </p>
                                  {payment.revertedAt && (
                                    <p className="text-xs text-destructive mt-1">
                                      Revertido:{" "}
                                      {new Date(
                                        payment.revertedAt,
                                      ).toLocaleString("es-DO")}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-col items-start gap-2 md:items-end">
                                  <p className="text-xs text-muted-foreground">
                                    {payment.note ?? "Sin nota"}
                                  </p>
                                  {!payment.revertedAt && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        handleRevertPayment(
                                          remesero.id,
                                          payment.id,
                                        )
                                      }
                                      disabled={
                                        revertingPaymentById[payment.id] ===
                                        true
                                      }
                                    >
                                      {revertingPaymentById[payment.id] === true
                                        ? "Revirtiendo..."
                                        : "Revertir"}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                          {paymentPagesByRemesero[remesero.id]?.hasMore && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full"
                              disabled={loadingPayments}
                              onClick={() => void onLoadPayments(remesero.id, true)}
                            >
                              {loadingPayments ? "Cargando..." : "Cargar más pagos"}
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {remeseros.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Aun no hay remeseros creados
            </p>
          </div>
        )}
      </div>

      <Button
        type="button"
        className="fixed right-6 bottom-28 md:bottom-8 h-14 w-14 rounded-full p-0 shadow-lg z-40"
        onClick={() => setCreateModalOpen(true)}
        aria-label="Crear remesero"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear remesero</DialogTitle>
            <DialogDescription>
              Ingresa el nombre y precio inicial del remesero.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="nuevo-remesero-nombre">Nombre</Label>
              <Input
                id="nuevo-remesero-nombre"
                value={newNombre}
                onChange={(event) => setNewNombre(event.target.value)}
                placeholder="Ejemplo: Miguel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nuevo-remesero-precio">Precio</Label>
              <Input
                id="nuevo-remesero-precio"
                type="number"
                min="0"
                step="0.01"
                value={newPrecio}
                onChange={(event) => setNewPrecio(event.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? "Guardando..." : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateRemeseroPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={(open) => {
          setPaymentDialogOpen(open);
          if (!open) {
            setPayingRemesero(null);
          }
        }}
        remesero={
          payingRemesero ?? {
            id: "",
            nombre: "",
            precioActual: 0,
            deudaActual: 0,
            createdAt: "",
            updatedAt: "",
          }
        }
        onCreated={() => {
          void onRefreshRemeseros();
        }}
      />

      <Dialog
        open={priceEditingRemesero !== null}
        onOpenChange={handlePriceDialogOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar precio</DialogTitle>
            <DialogDescription>
              Cambia el precio actual de {priceEditingRemesero?.nombre}. El
              nuevo valor se aplicara a las asignaciones futuras.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="editar-precio-remesero">Precio</Label>
            <Input
              id="editar-precio-remesero"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={priceDraft}
              onChange={(event) => {
                setPriceDraft(event.target.value);
                setPriceEditError(null);
              }}
              placeholder="0.00"
            />
          </div>
          {priceEditError ? (
            <p className="text-sm text-destructive" role="alert">
              {priceEditError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handlePriceDialogOpenChange(false)}
              disabled={savingPrice}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleSavePrice()}
              disabled={savingPrice || priceDraft.trim() === ""}
            >
              {savingPrice ? "Guardando..." : "Guardar precio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={debtEditingRemesero !== null}
        onOpenChange={handleDebtDialogOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar deuda</DialogTitle>
            <DialogDescription>
              Ajusta directamente el saldo de {debtEditingRemesero?.nombre}.
              Selecciona el tipo e ingresa el monto sin signo. Este cambio
              quedara registrado como un corte manual para el siguiente tramo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de saldo</Label>
              <RadioGroup
                value={debtBalanceKind}
                onValueChange={(value) => {
                  if (value === "fondo" && debtDraftIsZero) return;
                  setDebtBalanceKind(value as DebtBalanceKind);
                  setDebtEditError(null);
                }}
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  htmlFor="editar-saldo-deuda"
                  className={cn(
                    "flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                    debtBalanceKind === "deuda"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-secondary/60",
                  )}
                >
                  <RadioGroupItem
                    id="editar-saldo-deuda"
                    value="deuda"
                    aria-label="Deuda"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-semibold">Deuda</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      Saldo por cobrar
                    </span>
                  </span>
                </Label>
                <Label
                  htmlFor="editar-saldo-fondo"
                  className={cn(
                    "flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                    debtDraftIsZero
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer",
                    debtBalanceKind === "fondo"
                      ? "border-[hsl(var(--success))] bg-[hsl(var(--success))]/10"
                      : "border-border hover:bg-secondary/60",
                  )}
                >
                  <RadioGroupItem
                    id="editar-saldo-fondo"
                    value="fondo"
                    disabled={debtDraftIsZero}
                    aria-label="Fondo"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-semibold">Fondo</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      Saldo a favor
                    </span>
                  </span>
                </Label>
              </RadioGroup>
              {debtDraftIsZero && (
                <p className="text-xs text-muted-foreground">
                  Un saldo de 0 se registra automáticamente como deuda.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="editar-deuda-actual">Monto</Label>
              <Input
                id="editar-deuda-actual"
                type="number"
                min="0"
                step="0.01"
                value={debtDraft}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setDebtDraft(nextValue);
                  if (nextValue.trim() !== "" && Number(nextValue) === 0) {
                    setDebtBalanceKind("deuda");
                  }
                  setDebtEditError(null);
                }}
                aria-invalid={debtEditError !== null}
              />
            </div>
            {debtEditError && (
              <p className="text-sm text-destructive" role="alert">
                {debtEditError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDebtDialogOpenChange(false)}
              disabled={savingDebt}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveDebt} disabled={savingDebt}>
              {savingDebt ? "Guardando..." : "Guardar deuda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
