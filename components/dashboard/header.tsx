"use client"

import { Activity, Menu, X, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LogoutButton } from "@/components/auth/logout-button"

interface HeaderProps {
  onMenuToggle: () => void
  isMenuOpen: boolean
  onRefresh?: () => void
  isRefreshing?: boolean
}

export function Header({ onMenuToggle, isMenuOpen, onRefresh, isRefreshing }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMenuToggle}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-foreground">Bryan Transactions</h1>
              <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">
                Panel de Transacciones
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden sm:flex items-center gap-1.5 border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))] animate-pulse" />
            Sincronizado
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={onRefresh}
            disabled={!onRefresh || isRefreshing}
            aria-label="Refrescar"
          >
            <RefreshCw className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
