"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Transaction } from "@/lib/types"
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"
import { Building2, Mail } from "lucide-react"

type ViewMode = "bank" | "account"

interface BankDistributionChartProps {
  transactions: Transaction[]
}

export function BankDistributionChart({ transactions }: BankDistributionChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("bank")

  const bankData = useMemo(() => {
    const totals = new Map<string, number>()
    transactions.forEach((t) => totals.set(t.bank, (totals.get(t.bank) ?? 0) + t.amount))
    const colors = ["hsl(38, 92%, 50%)", "hsl(199, 89%, 48%)", "hsl(142, 71%, 45%)", "hsl(270, 70%, 60%)"]

    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, value], index) => ({
        name,
        value,
        color: colors[index % colors.length],
      }))
  }, [transactions])

  const accountData = useMemo(() => {
    const totals = new Map<string, number>()
    transactions.forEach((t) => totals.set(t.accountName, (totals.get(t.accountName) ?? 0) + t.amount))
    const colors = ["hsl(142, 71%, 45%)", "hsl(270, 70%, 60%)", "hsl(340, 75%, 55%)", "hsl(38, 92%, 50%)"]

    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, value], index) => ({
        name,
        value,
        color: colors[index % colors.length],
      }))
  }, [transactions])

  const data = viewMode === "bank" ? bankData : accountData

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base md:text-lg font-medium text-foreground">
              {viewMode === "bank" ? "Distribución por Banco" : "Distribución por Cuenta"}
            </CardTitle>
            <p className="text-xs md:text-sm text-muted-foreground">Total acumulado</p>
          </div>
          <div className="flex gap-1 p-1 bg-secondary rounded-lg">
            <Button
              variant={viewMode === "bank" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("bank")}
              className="h-7 px-2 text-xs gap-1"
            >
              <Building2 className="h-3 w-3" />
              <span>Banco</span>
            </Button>
            <Button
              variant={viewMode === "account" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("account")}
              className="h-7 px-2 text-xs gap-1"
            >
              <Mail className="h-3 w-3" />
              <span>Cuenta</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] md:h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220, 15%, 8%)",
                  border: "1px solid hsl(220, 15%, 18%)",
                  borderRadius: "8px",
                  color: "hsl(0, 0%, 98%)",
                }}
                formatter={(value: number) => [formatAmount(value), "Total"]}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ color: "hsl(220, 10%, 55%)", fontSize: "11px" }}>
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className={`mt-4 grid gap-4 ${data.length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {data.map((item) => (
            <div key={item.name} className="text-center">
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{item.name}</p>
              <p className="text-xs sm:text-sm font-semibold text-foreground">{formatAmount(item.value)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
