import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RemeseroDetailShell } from "@/components/remeseros/remesero-detail-shell";

describe("RemeseroDetailShell", () => {
  it("renders dashboard navigation and forwards the selected tab", () => {
    const onNavigate = vi.fn();

    render(
      <RemeseroDetailShell onNavigate={onNavigate}>
        <p>Detalle del remesero</p>
      </RemeseroDetailShell>,
    );

    expect(screen.getAllByRole("navigation")).toHaveLength(3);
    expect(screen.getByText("Detalle del remesero")).not.toBeNull();

    const accountsButtons = screen.getAllByRole("button", {
      name: "Cuentas",
    });
    expect(accountsButtons).toHaveLength(3);

    fireEvent.click(accountsButtons[0]);
    expect(onNavigate).toHaveBeenCalledWith("accounts");
  });
});
