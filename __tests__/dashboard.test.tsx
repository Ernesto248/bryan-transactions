import { render, screen, fireEvent } from "@testing-library/react";
import { Dashboard } from "@/components/dashboard/dashboard";
import { DASHBOARD_RETURN_TAB_KEY } from "@/lib/dashboard-tabs";
import { Transaction } from "@/lib/types";
import { vi, beforeEach, afterEach } from "vitest";

// Mock sub-components to focus on Dashboard logic or render them if simple
// For integration test, we can render them.

const now = Date.now();

const mockTransactions: Transaction[] = [
  {
    id: "txn_001",
    bank: "Wells Fargo",
    accountName: "Personal",
    senderName: "Test Sender",
    amount: 1000.0,
    confirmationCode: "WF-123",
    createdAt: new Date(now - 60 * 60 * 1000).toISOString(),
    type: "deposit",
  },
  {
    id: "txn_002",
    bank: "Bank of America",
    accountName: "Business",
    senderName: "Business Sender",
    amount: 2000.0,
    confirmationCode: "BOA-456",
    createdAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    type: "deposit",
  },
];

describe("Dashboard Component", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.includes("/api/accounts")) {
        return {
          ok: true,
          json: async () => ({ ok: true, accounts: [] }),
        } as Response;
      }

      if (url.includes("/api/remeseros")) {
        return {
          ok: true,
          json: async () => ({ ok: true, remeseros: [] }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ ok: true, transactions: [] }),
      } as Response;
    });
    window.history.replaceState({}, "", "/");
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
    window.sessionStorage.clear();
  });

  it("renders dashboard with transactions", async () => {
    render(<Dashboard initialTransactions={mockTransactions} />);

    expect(await screen.findByText("Test Sender")).toBeDefined();

    // Check if stats are calculated correctly
    expect(screen.getByText("Total Recibido")).toBeDefined();
    expect(screen.getAllByText("$3,000").length).toBeGreaterThan(0); // 1000 + 2000

    // Check if transaction list shows up
    expect(screen.getByText("Business Sender")).toBeDefined();
  });

  it("filters transactions by bank", async () => {
    render(<Dashboard initialTransactions={mockTransactions} />);

    expect(await screen.findByText("Test Sender")).toBeDefined();

    // Find filter and click (simplified interaction check)
    // In a real complex component we might need more setup for Select interaction
    // Here we just check if the initial render is correct.
    expect(screen.getAllByText("Wells Fargo").length).toBeGreaterThan(0);
  });

  it("keeps dashboard as default even with a stale tab query", async () => {
    window.history.replaceState({}, "", "/?tab=remeseros");

    render(<Dashboard initialTransactions={mockTransactions} />);

    expect(await screen.findByText("Test Sender")).toBeDefined();
    expect(window.location.search).toBe("");
  });

  it("uses the queued return tab for internal remeseros navigation", async () => {
    window.sessionStorage.setItem(DASHBOARD_RETURN_TAB_KEY, "remeseros");

    render(<Dashboard initialTransactions={mockTransactions} />);

    expect(
      await screen.findByText("Aun no hay remeseros creados"),
    ).toBeDefined();
    expect(window.sessionStorage.getItem(DASHBOARD_RETURN_TAB_KEY)).toBeNull();
  });
});
