"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Remesero, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatTransactionDate } from "@/lib/date-time";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TransactionCardProps {
  transaction: Transaction;
  remeseros?: Remesero[];
  onAssign?: (transactionId: string, remeseroId: string) => Promise<void>;
  onUnassign?: (transactionId: string) => Promise<void>;
  isAssigning?: boolean;
}

const bankColors: Record<string, string> = {
  "Wells Fargo":
    "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20",
  "Bank of America": "bg-destructive/10 text-destructive border-destructive/20",
};

const bankPalette = [
  "bg-blue-500/10 text-blue-300 border-blue-500/20",
  "bg-amber-500/10 text-amber-300 border-amber-500/20",
  "bg-teal-500/10 text-teal-300 border-teal-500/20",
  "bg-rose-500/10 text-rose-300 border-rose-500/20",
  "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
];

const accountPalette = [
  "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20",
  "bg-lime-500/10 text-lime-300 border-lime-500/20",
  "bg-orange-500/10 text-orange-300 border-orange-500/20",
];

function paletteByText(text: string, palette: string[]) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return palette[0];

  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }

  return palette[hash % palette.length];
}

const typeIcons = {
  deposit: ArrowDownLeft,
  withdrawal: ArrowUpRight,
  transfer: ArrowLeftRight,
};

const typeColors = {
  deposit: "text-[hsl(var(--success))]",
  withdrawal: "text-destructive",
  transfer: "text-primary",
};

export function TransactionCard({
  transaction,
  remeseros = [],
  onAssign,
  onUnassign,
  isAssigning = false,
}: TransactionCardProps) {
  const [copied, setCopied] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedRemeseroId, setSelectedRemeseroId] = useState<string>("");
  const TypeIcon = typeIcons[transaction.type];
  const bankBadgeColor =
    bankColors[transaction.bank] ??
    paletteByText(transaction.bank, bankPalette);
  const accountBadgeColor = paletteByText(
    transaction.accountName,
    accountPalette,
  );

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(transaction.confirmationCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAssign = async () => {
    if (!onAssign || !selectedRemeseroId) return;
    await onAssign(transaction.id, selectedRemeseroId);
    setAssignDialogOpen(false);
    setSelectedRemeseroId("");
  };

  return (
    <Card className="bg-card border-border hover:bg-secondary/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "p-2 rounded-full bg-secondary",
              typeColors[transaction.type],
            )}
          >
            <TypeIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-foreground break-words">
                  {transaction.senderName}
                </p>
                <p className="text-xs text-muted-foreground break-words">
                  {transaction.accountName}
                </p>
              </div>
              <p
                className={cn(
                  "text-base md:text-lg font-semibold shrink-0",
                  typeColors[transaction.type],
                )}
              >
                {transaction.type === "withdrawal" ? "-" : "+"}
                {formatAmount(transaction.amount)}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("text-[10px] md:text-xs", bankBadgeColor)}
              >
                {transaction.bank}
              </Badge>
              <Badge
                variant="outline"
                className={cn("text-[10px] md:text-xs", accountBadgeColor)}
              >
                {transaction.accountName}
              </Badge>
              {transaction.assignedRemeseroNombre ? (
                <Badge
                  variant="outline"
                  className="text-[10px] md:text-xs border-primary/30 text-primary bg-primary/10"
                >
                  Asignado: {transaction.assignedRemeseroNombre}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] md:text-xs">
                  Sin asignar
                </Badge>
              )}
              <button
                type="button"
                onClick={copyToClipboard}
                className="flex flex-wrap items-center gap-1 max-w-full min-w-0 text-[10px] md:text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-[hsl(var(--success))]" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span className="font-mono break-all">
                  {transaction.confirmationCode}
                </span>
              </button>
            </div>
            <p className="mt-2 text-[10px] md:text-xs text-muted-foreground">
              {formatTransactionDate(transaction.createdAt)}
            </p>
            {onAssign && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAssignDialogOpen(true)}
                  disabled={remeseros.length === 0 || isAssigning}
                >
                  {isAssigning
                    ? "Asignando..."
                    : transaction.assignedRemeseroId
                      ? "Reasignar"
                      : "Asignar"}
                </Button>
                {transaction.assignedRemeseroId && onUnassign && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => onUnassign(transaction.id)}
                    disabled={isAssigning}
                  >
                    Desasignar
                  </Button>
                )}
                <Dialog
                  open={assignDialogOpen}
                  onOpenChange={setAssignDialogOpen}
                >
                  <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>
                        {transaction.assignedRemeseroId
                          ? "Reasignar transaccion"
                          : "Asignar transaccion"}
                      </DialogTitle>
                      <DialogDescription>
                        Selecciona el remesero para esta transaccion.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Monto USD: {formatAmount(Math.abs(transaction.amount))}
                      </p>
                      <Select
                        value={selectedRemeseroId}
                        onValueChange={setSelectedRemeseroId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un remesero" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[45svh] overflow-y-auto">
                          {remeseros.map((remesero) => (
                            <SelectItem key={remesero.id} value={remesero.id}>
                              {remesero.nombre} - Precio {remesero.precioActual}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAssignDialogOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        onClick={handleAssign}
                        disabled={!selectedRemeseroId || isAssigning}
                      >
                        Confirmar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
