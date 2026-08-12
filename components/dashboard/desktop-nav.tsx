"use client";

import { cn } from "@/lib/utils";
import { Landmark, LayoutDashboard, List, Wallet, Users } from "lucide-react";

interface DesktopNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transacciones", icon: List },
  { id: "accounts", label: "Cuentas", icon: Wallet },
  { id: "remeseros", label: "Remeseros", icon: Users },
  { id: "finances", label: "Finanzas", icon: Landmark },
];

export function DesktopNav({ activeTab, setActiveTab }: DesktopNavProps) {
  return (
    <nav className="hidden md:flex items-center gap-2 rounded-xl border border-border bg-card/95 backdrop-blur-lg p-2">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            type="button"
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
