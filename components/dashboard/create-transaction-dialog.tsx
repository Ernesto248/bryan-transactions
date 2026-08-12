"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Bank,
  GmailAccountOption,
  Remesero,
} from "@/lib/types";

type CreateTransactionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banks: Bank[];
  gmailAccounts: GmailAccountOption[];
  remeseros: Remesero[];
  onCreated: (payload: {
    remeseroAssigned: boolean;
  }) => Promise<void> | void;
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

const UNASSIGNED_VALUE = "__unassigned__";

export function CreateTransactionDialog({
  open,
  onOpenChange,
  banks,
  gmailAccounts,
  remeseros,
  onCreated,
}: CreateTransactionDialogProps) {
  const [bankId, setBankId] = useState("");
  const [gmailAccountId, setGmailAccountId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [amount, setAmount] = useState("");
  const [remeseroId, setRemeseroId] = useState(UNASSIGNED_VALUE);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  useEffect(() => {
    if (!open) {
      setBankId("");
      setGmailAccountId("");
      setSenderName("");
      setAmount("");
      setRemeseroId(UNASSIGNED_VALUE);
      setSubmitState({ kind: "idle" });
    }
  }, [open]);

  const isSubmitting = submitState.kind === "submitting";
  const errorMessage =
    submitState.kind === "error" ? submitState.message : null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedSender = senderName.trim();
    const parsedAmount = Number(amount);

    if (!bankId) {
      setSubmitState({ kind: "error", message: "Selecciona un banco" });
      return;
    }

    if (!gmailAccountId) {
      setSubmitState({ kind: "error", message: "Selecciona una cuenta" });
      return;
    }

    if (!trimmedSender) {
      setSubmitState({ kind: "error", message: "Ingresa el nombre del remitente" });
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setSubmitState({ kind: "error", message: "El monto debe ser mayor a 0" });
      return;
    }

    setSubmitState({ kind: "submitting" });

    const body: Record<string, unknown> = {
      senderName: trimmedSender,
      amount: parsedAmount,
      bankId,
      gmailAccountId,
    };

    if (remeseroId !== UNASSIGNED_VALUE) {
      body.remeseroId = remeseroId;
    }

    try {
      const res = await fetch("/api/transactions/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        assignment?: unknown;
      };

      if (!res.ok || !data.ok) {
        const message = mapErrorToMessage(data.error);
        setSubmitState({ kind: "error", message });
        return;
      }

      await onCreated({ remeseroAssigned: Boolean(data.assignment) });
      onOpenChange(false);
    } catch {
      setSubmitState({
        kind: "error",
        message: "No se pudo crear la transaccion",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva transaccion</DialogTitle>
          <DialogDescription>
            Crea una transaccion manual para casos en los que no ingreso por
            Gmail.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manual-bank">Banco</Label>
            <Select
              value={bankId}
              onValueChange={setBankId}
              disabled={isSubmitting}
            >
              <SelectTrigger id="manual-bank">
                <SelectValue placeholder="Selecciona un banco" />
              </SelectTrigger>
              <SelectContent>
                {banks.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-account">Cuenta</Label>
            <Select
              value={gmailAccountId}
              onValueChange={setGmailAccountId}
              disabled={isSubmitting}
            >
              <SelectTrigger id="manual-account">
                <SelectValue placeholder="Selecciona una cuenta" />
              </SelectTrigger>
              <SelectContent>
                {gmailAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.accountName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-sender">Remitente</Label>
            <Input
              id="manual-sender"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              placeholder="Nombre del remitente"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-amount">Monto USD</Label>
            <Input
              id="manual-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-remesero">Remesero (opcional)</Label>
            <Select
              value={remeseroId}
              onValueChange={setRemeseroId}
              disabled={isSubmitting}
            >
              <SelectTrigger id="manual-remesero">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>Sin asignar</SelectItem>
                {remeseros.map((remesero) => (
                  <SelectItem key={remesero.id} value={remesero.id}>
                    {remesero.nombre} - Precio {remesero.precioActual}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Crear transaccion"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function mapErrorToMessage(error: string | undefined): string {
  switch (error) {
    case "bank_not_found":
      return "El banco seleccionado ya no existe";
    case "gmail_account_not_found":
      return "La cuenta seleccionada ya no existe";
    case "remesero_not_found":
      return "El remesero seleccionado ya no existe";
    case "validation_error":
      return "Revisa los datos ingresados";
    case "invalid_json":
      return "La peticion enviada no es valida";
    default:
      return "No se pudo crear la transaccion";
  }
}
