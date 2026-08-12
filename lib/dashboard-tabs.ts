export const DASHBOARD_RETURN_TAB_KEY = "dashboard:return-tab";

export const DASHBOARD_TABS = [
  "dashboard",
  "transactions",
  "accounts",
  "remeseros",
  "finances",
] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export function isDashboardTab(value: string | null): value is DashboardTab {
  return value !== null && DASHBOARD_TABS.includes(value as DashboardTab);
}

export function queueDashboardReturnTab(tab: DashboardTab) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DASHBOARD_RETURN_TAB_KEY, tab);
}

export function consumeDashboardReturnTab(): DashboardTab | null {
  if (typeof window === "undefined") return null;

  const value = window.sessionStorage.getItem(DASHBOARD_RETURN_TAB_KEY);
  window.sessionStorage.removeItem(DASHBOARD_RETURN_TAB_KEY);

  return isDashboardTab(value) ? value : null;
}
