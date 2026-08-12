"use client";

import { useState, type ReactNode } from "react";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { DesktopNav } from "@/components/dashboard/desktop-nav";
import { Header } from "@/components/dashboard/header";
import { MobileNav } from "@/components/dashboard/mobile-nav";

type RemeseroDetailShellProps = {
  children: ReactNode;
  onNavigate: (tab: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

export function RemeseroDetailShell({
  children,
  onNavigate,
  onRefresh,
  isRefreshing = false,
}: RemeseroDetailShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header
        onMenuToggle={() => setIsMenuOpen((current) => !current)}
        isMenuOpen={isMenuOpen}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
      />
      <MobileNav
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeTab="remeseros"
        setActiveTab={onNavigate}
      />

      <main className="pb-24 md:pb-8">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-6">
          <DesktopNav activeTab="remeseros" setActiveTab={onNavigate} />
          <div className="mt-4 md:mt-6">{children}</div>
        </div>
      </main>

      <BottomNav activeTab="remeseros" setActiveTab={onNavigate} />
    </div>
  );
}
