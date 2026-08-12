import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RemeserosView } from "@/components/dashboard/remeseros-view";
import type { Remesero } from "@/lib/types";

const remesero: Remesero = {
  id: "r-1",
  nombre: "Miguel",
  precioActual: 510,
  deudaActual: 2500,
  createdAt: "2026-08-05T12:00:00.000Z",
  updatedAt: "2026-08-05T12:00:00.000Z",
};

function renderView(
  selectedRemesero: Remesero,
  onUpdateRemesero = vi.fn().mockResolvedValue(true),
  openDebtEditor = true,
) {
  render(
    <RemeserosView
      remeseros={[selectedRemesero]}
      paymentsByRemesero={{}}
      loadingRemeseros={false}
      loadingPaymentsByRemesero={{}}
      onRefreshRemeseros={vi.fn().mockResolvedValue(undefined)}
      onCreateRemesero={vi.fn().mockResolvedValue(undefined)}
      onUpdateRemesero={onUpdateRemesero}
      onDeleteRemesero={vi.fn().mockResolvedValue(undefined)}
      onLoadPayments={vi.fn().mockResolvedValue(undefined)}
      onCreatePayment={vi.fn().mockResolvedValue(undefined)}
      onRevertPayment={vi.fn().mockResolvedValue(undefined)}
      onGetShareSummary={vi.fn().mockResolvedValue(null)}
    />,
  );

  if (openDebtEditor) {
    fireEvent.click(screen.getByRole("button", { name: "Editar deuda" }));
  }

  return onUpdateRemesero;
}

describe("RemeserosView debt editor", () => {
  it("saves a fund as a negative balance", async () => {
    const onUpdateRemesero = vi.fn().mockResolvedValue(true);
    renderView(remesero, onUpdateRemesero);

    const debtInput = screen.getByLabelText("Monto");
    expect((debtInput as HTMLInputElement).value).toBe("2500");
    expect(
      screen.getByRole("radio", { name: "Deuda" }).getAttribute("aria-checked"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("radio", { name: "Fondo" }));
    fireEvent.change(debtInput, { target: { value: "750.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar deuda" }));

    await waitFor(() => {
      expect(onUpdateRemesero).toHaveBeenCalledWith("r-1", {
        deudaActual: -750.25,
        deudaActualNote: "Ajuste manual desde la interfaz",
      });
    });
  });

  it("opens the remesero detail by clicking the card", () => {
    renderView(remesero, undefined, false);

    expect(
      screen
        .getByRole("link", { name: "Ver detalle de Miguel" })
        .getAttribute("href"),
    ).toBe("/remeseros/r-1");
  });

  it("edits the price without opening the remesero detail", async () => {
    const onUpdateRemesero = vi.fn().mockResolvedValue(true);
    renderView(remesero, onUpdateRemesero, false);

    fireEvent.click(screen.getByRole("button", { name: "Precio" }));
    const priceInput = await screen.findByLabelText("Precio");
    expect((priceInput as HTMLInputElement).value).toBe("510");
    fireEvent.change(priceInput, { target: { value: "680.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar precio" }));

    await waitFor(() => {
      expect(onUpdateRemesero).toHaveBeenCalledWith("r-1", {
        precioActual: 680.5,
      });
    });
  });

  it("opens an existing fund with its absolute amount", () => {
    renderView({ ...remesero, deudaActual: -825.5 });

    expect(
      screen.getByRole("radio", { name: "Fondo" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe(
      "825.5",
    );
  });

  it("automatically treats a zero balance as debt", async () => {
    const onUpdateRemesero = vi.fn().mockResolvedValue(true);
    renderView(remesero, onUpdateRemesero);

    const debtInput = screen.getByLabelText("Monto");
    const debtOption = screen.getByRole("radio", { name: "Deuda" });
    const fundOption = screen.getByRole("radio", { name: "Fondo" });

    fireEvent.click(fundOption);
    expect(fundOption.getAttribute("aria-checked")).toBe("true");

    fireEvent.change(debtInput, { target: { value: "0" } });

    expect(debtOption.getAttribute("aria-checked")).toBe("true");
    expect((fundOption as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText("Un saldo de 0 se registra automáticamente como deuda."),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Guardar deuda" }));

    await waitFor(() => {
      expect(onUpdateRemesero).toHaveBeenCalledWith("r-1", {
        deudaActual: 0,
        deudaActualNote: "Ajuste manual desde la interfaz",
      });
    });
  });
});
