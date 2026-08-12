"use client";

import { cn } from "@/lib/utils";
import { Landmark, LayoutDashboard, List, Wallet, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const navItems = [
  { id: "dashboard", label: "Inicio", icon: LayoutDashboard },
  { id: "transactions", label: "Transacc.", icon: List },
  { id: "accounts", label: "Cuentas", icon: Wallet },
  { id: "remeseros", label: "Remeseros", icon: Users },
  { id: "finances", label: "Finanzas", icon: Landmark },
];

export function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  const [bottomOffsetPx, setBottomOffsetPx] = useState(0);

  useEffect(() => {
    const update = () => {
      const layoutHeight = document.documentElement.clientHeight;
      const visualHeight = window.innerHeight;
      setBottomOffsetPx(Math.max(0, layoutHeight - visualHeight));
    };

    update();

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", update);
      window.visualViewport.addEventListener("scroll", update);
    }

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", update);
        window.visualViewport.removeEventListener("scroll", update);
      }
    };
  }, []);

  const navStyle = useMemo(
    () => ({ bottom: `${bottomOffsetPx}px` }),
    [bottomOffsetPx],
  );

  return (
    <nav
      className="fixed inset-x-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border md:hidden pb-[env(safe-area-inset-bottom)]"
      style={navStyle}
    >
      <div className="flex items-center justify-around px-1 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  isActive && "scale-110 transition-transform",
                )}
              />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
