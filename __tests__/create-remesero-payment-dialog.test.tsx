import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateRemeseroPaymentDialog } from "@/components/dashboard/create-remesero-payment-dialog";
import type { Remesero } from "@/lib/types";

const baseRemesero: Remesero = {
  id: "r-1",
  nombre: "Osmel",
  precioActual: 615,
  deudaActual: 1360422,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-04-13T00:00:00.000Z",
};

describe("CreateRemeseroPaymentDialog", () => {
  beforeEach(() => {
    vi.spyOn(window, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, payment: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the remesero name and current debt in the header", () => {
    render(
      <CreateRemeseroPaymentDialog
        open={true}
        onOpenChange={() => {}}
        remesero={baseRemesero}
        onCreated={() => {}}
      />,
    );
    expect(screen.getByText("Osmel")).toBeDefined();
    expect(screen.getByText(/1,360,422/)).toBeDefined();
  });

  it("renders the amount and note inputs", () => {
    render(
      <CreateRemeseroPaymentDialog
        open={true}
        onOpenChange={() => {}}
        remesero={baseRemesero}
        onCreated={() => {}}
      />,
    );
    expect(screen.getByLabelText(/monto a pagar/i)).toBeDefined();
    expect(screen.getByLabelText(/nota/i)).toBeDefined();
  });

  it("formats the amount input with thousand separators while typing", () => {
    render(
      <CreateRemeseroPaymentDialog
        open={true}
        onOpenChange={() => {}}
        remesero={baseRemesero}
        onCreated={() => {}}
      />,
    );

    const amountInput = screen.getByLabelText(/monto a pagar/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "1360422" } });

    expect(amountInput.value).toBe("1,360,422");
  });

  it("shows the 'Dejar en 0' toggle when deudaActual > 0", () => {
    render(
      <CreateRemeseroPaymentDialog
        open={true}
        onOpenChange={() => {}}
        remesero={baseRemesero}
        onCreated={() => {}}
      />,
    );
    expect(screen.getByRole("switch", { name: /dejar en 0/i })).toBeDefined();
  });

  it("hides the 'Dejar en 0' toggle when deudaActual <= 0", () => {
    const remeseroFondo: Remesero = { ...baseRemesero, deudaActual: -100 };
    render(
      <CreateRemeseroPaymentDialog
        open={true}
        onOpenChange={() => {}}
        remesero={remeseroFondo}
        onCreated={() => {}}
      />,
    );
    expect(screen.queryByRole("switch", { name: /dejar en 0/i })).toBeNull();
  });

  it("fills amount and locks the input when 'Dejar en 0' is toggled on", () => {
    render(
      <CreateRemeseroPaymentDialog
        open={true}
        onOpenChange={() => {}}
        remesero={baseRemesero}
        onCreated={() => {}}
      />,
    );
    const toggle = screen.getByRole("switch", { name: /dejar en 0/i });
    fireEvent.click(toggle);
    const amountInput = screen.getByLabelText(/monto a pagar/i) as HTMLInputElement;
    expect(amountInput.value).toBe("1,360,422");
    expect(amountInput.readOnly).toBe(true);
  });

  it("clears amount and unlocks the input when 'Dejar en 0' is toggled off", () => {
    render(
      <CreateRemeseroPaymentDialog
        open={true}
        onOpenChange={() => {}}
        remesero={baseRemesero}
        onCreated={() => {}}
      />,
    );
    const toggle = screen.getByRole("switch", { name: /dejar en 0/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    const amountInput = screen.getByLabelText(/monto a pagar/i) as HTMLInputElement;
    expect(amountInput.value).toBe("");
    expect(amountInput.readOnly).toBe(false);
  });

  it("submits the payment with the entered amount and calls onCreated on success", async () => {
    const onCreated = vi.fn();
    const fetchMock = vi.spyOn(window, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, payment: { id: "p-1" } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const onOpenChange = vi.fn();
    render(
      <CreateRemeseroPaymentDialog
        open={true}
        onOpenChange={onOpenChange}
        remesero={baseRemesero}
        onCreated={onCreated}
      />,
    );

    const amountInput = screen.getByLabelText(/monto a pagar/i);
    const noteInput = screen.getByLabelText(/nota/i);
    fireEvent.change(amountInput, { target: { value: "500" } });
    fireEvent.change(noteInput, { target: { value: "transfer" } });

    const submitButton = screen.getByRole("button", { name: /registrar pago/i });
    fireEvent.click(submitButton);

    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/remeseros/r-1/payments",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountPaid: 500, note: "transfer" }),
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("submits with deudaActual when 'Dejar en 0' is on", async () => {
    const fetchMock = vi.spyOn(window, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, payment: { id: "p-1" } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <CreateRemeseroPaymentDialog
        open={true}
        onOpenChange={() => {}}
        remesero={baseRemesero}
        onCreated={() => {}}
      />,
    );

    const toggle = screen.getByRole("switch", { name: /dejar en 0/i });
    fireEvent.click(toggle);

    const submitButton = screen.getByRole("button", { name: /registrar pago/i });
    fireEvent.click(submitButton);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/remeseros/r-1/payments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ amountPaid: 1360422 }),
      }),
    );
  });

  it("resets the form when the modal is closed", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CreateRemeseroPaymentDialog
        open={true}
        onOpenChange={onOpenChange}
        remesero={baseRemesero}
        onCreated={() => {}}
      />,
    );

    const amountInput = screen.getByLabelText(/monto a pagar/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "999" } });
    const toggle = screen.getByRole("switch", { name: /dejar en 0/i });
    fireEvent.click(toggle);

    rerender(
      <CreateRemeseroPaymentDialog
        open={false}
        onOpenChange={onOpenChange}
        remesero={baseRemesero}
        onCreated={() => {}}
      />,
    );
    rerender(
      <CreateRemeseroPaymentDialog
        open={true}
        onOpenChange={onOpenChange}
        remesero={baseRemesero}
        onCreated={() => {}}
      />,
    );

    const amountAfter = screen.getByLabelText(/monto a pagar/i) as HTMLInputElement;
    const toggleAfter = screen.getByRole("switch", {
      name: /dejar en 0/i,
    }) as HTMLButtonElement;
    expect(amountAfter.value).toBe("");
    expect(toggleAfter.getAttribute("data-state")).toBe("unchecked");
  });
});
