
"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { TransactionFeedChartPoint } from "@/lib/types"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { Building2, Mail } from "lucide-react"
import { format, parseISO, startOfDay, eachDayOfInterval, subDays } from "date-fns"
import { es } from "date-fns/locale"

type ViewMode = "bank" | "account"

interface TransactionsChartProps {
  points: TransactionFeedChartPoint[]
}
const SERIES_COLORS = [
  "hsl(38, 92%, 50%)",
  "hsl(199, 89%, 48%)",
  "hsl(142, 71%, 45%)",
  "hsl(270, 70%, 60%)",
  "hsl(340, 75%, 55%)",
]

export function TransactionsChart({ points }: TransactionsChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("bank")

  const endDate = useMemo(() => new Date(), [])
  const startDate = useMemo(() => subDays(endDate, 6), [endDate])
  const days = useMemo(() => eachDayOfInterval({ start: startDate, end: endDate }), [startDate, endDate])

  const bankSeries = useMemo(() => {
    const totals = new Map<string, number>()
    points.forEach((point) => totals.set(point.bank, (totals.get(point.bank) ?? 0) + point.amount))
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([bank]) => bank)
  }, [points])

  const accountSeries = useMemo(() => {
    const totals = new Map<string, number>()
    points.forEach((point) => totals.set(point.accountName, (totals.get(point.accountName) ?? 0) + point.amount))
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([accountName]) => accountName)
  }, [points])

  const chartDataByBank = useMemo(() => {
    return days.map((day) => {
      const dayStart = startOfDay(day)
      const dayTransactions = points.filter((point) => {
        const txDate = startOfDay(parseISO(point.date))
        return txDate.getTime() === dayStart.getTime()
      })

      const base: Record<string, number | string> = {
        date: format(day, "dd MMM", { locale: es }),
      }

      bankSeries.forEach((bank) => {
        base[bank] = dayTransactions.filter((point) => point.bank === bank).reduce((sum, point) => sum + point.amount, 0)
      })

      return base
    })
  }, [points, days, bankSeries])

  const chartDataByAccount = useMemo(() => {
    return days.map((day) => {
      const dayStart = startOfDay(day)
      const dayTransactions = points.filter((point) => {
        const txDate = startOfDay(parseISO(point.date))
        return txDate.getTime() === dayStart.getTime()
      })

      const base: Record<string, number | string> = {
        date: format(day, "dd MMM", { locale: es }),
      }

      accountSeries.forEach((account) => {
        base[account] = dayTransactions.filter((point) => point.accountName === account).reduce((sum, point) => sum + point.amount, 0)
      })

      return base
    })
  }, [points, days, accountSeries])

  const chartData = viewMode === "bank" ? chartDataByBank : chartDataByAccount
  const series = viewMode === "bank" ? bankSeries : accountSeries

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base md:text-lg font-medium text-foreground">
              {viewMode === "bank" ? "Transacciones por Banco" : "Transacciones por Cuenta"}
            </CardTitle>
            <p className="text-xs md:text-sm text-muted-foreground">Últimos 7 días</p>
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
      <CardContent className="pt-0">
        <div className="h-[250px] md:h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                {series.map((key, index) => (
                  <linearGradient key={key} id={`seriesGradient-${viewMode}-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES_COLORS[index % SERIES_COLORS.length]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={SERIES_COLORS[index % SERIES_COLORS.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 18%)" vertical={false} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "hsl(220, 10%, 55%)", fontSize: 11 }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(220, 10%, 55%)", fontSize: 11 }}
                tickFormatter={(value) => `$${value / 1000}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220, 15%, 8%)",
                  border: "1px solid hsl(220, 15%, 18%)",
                  borderRadius: "8px",
                  color: "hsl(0, 0%, 98%)",
                }}
                labelStyle={{ color: "hsl(0, 0%, 98%)" }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
              />
              <Legend
                wrapperStyle={{ paddingTop: "20px" }}
                formatter={(value) => (
                  <span style={{ color: "hsl(220, 10%, 55%)", fontSize: "12px" }}>
                    {value}
                  </span>
                )}
              />
              {series.map((key, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                  strokeWidth={2}
                  fill={`url(#seriesGradient-${viewMode}-${index})`}
                  name={key}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
