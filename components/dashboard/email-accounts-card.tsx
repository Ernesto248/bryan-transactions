"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail } from "lucide-react"

type EmailAccountStat = {
  accountName: string
  transactionCount: number
  totalAmount: number
}

interface EmailAccountsCardProps {
  stats: EmailAccountStat[]
}

export function EmailAccountsCard({ stats }: EmailAccountsCardProps) {
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg font-medium text-foreground flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Cuentas
        </CardTitle>
        <p className="text-xs md:text-sm text-muted-foreground">Actividad por cuenta</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.map((account) => (
          <div
            key={account.accountName}
            className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{account.accountName}</p>
              <p className="text-xs text-muted-foreground">{account.transactionCount} transacciones</p>
            </div>
            <p className="text-sm font-semibold text-[hsl(var(--success))] shrink-0">
              {formatAmount(account.totalAmount)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
