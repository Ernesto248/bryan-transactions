"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Building2 } from "lucide-react"

type BankTotal = {
  bank: string
  totalAmount: number
}
interface BankTotalsCardProps {
  totals: BankTotal[]
  formatCurrency: (amount: number) => string
}
export function BankTotalsCard({ totals, formatCurrency }: BankTotalsCardProps) {
  const grandTotal = totals.reduce((sum, t) => sum + t.totalAmount, 0)

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="space-y-1">
              <p className="text-xs md:text-sm text-muted-foreground">Bancos</p>
              <p className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
                {formatCurrency(grandTotal)}
              </p>
              <p className="text-xs text-muted-foreground">total</p>
            </div>
            <div className="space-y-1.5">
              {totals.map((t) => (
                <div key={t.bank} className="flex items-center justify-between gap-2">
                  <p className="text-xs md:text-sm text-foreground truncate">{t.bank}</p>
                  <p className="text-xs md:text-sm font-medium text-foreground shrink-0">
                    {formatCurrency(t.totalAmount)}
                  </p>
                </div>
              ))}
              {totals.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin datos</p>
              )}
            </div>
          </div>
          <div className="p-2 md:p-3 rounded-lg bg-secondary">
            <Building2 className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
