"use client";

import { cn } from "@/lib/utils";
import { Landmark, LayoutDashboard, List, Wallet, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
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

export function MobileNav({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
}: MobileNavProps) {
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-full w-64 bg-card border-r border-border transform transition-transform duration-300 ease-in-out md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="font-semibold text-foreground">Menú</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  onClose();
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
