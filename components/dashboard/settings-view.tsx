"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { CheckCircle, Database, Mail, RefreshCw, Zap } from "lucide-react"

interface SettingsViewProps {
  accountOptions: string[]
}

export function SettingsView({ accountOptions }: SettingsViewProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">Configuración</h2>
        <p className="text-sm text-muted-foreground">Gestiona las conexiones y preferencias</p>
      </div>

      <div className="grid gap-4">
        {/* n8n Connection */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium text-foreground flex items-center gap-2">
                <Zap className="h-5 w-5 text-[hsl(var(--warning))]" />
                Conexión n8n
              </CardTitle>
              <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20">
                Conectado
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">Automatización activa</p>
                <p className="text-xs text-muted-foreground">Lectura de emails cada 5 min</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Button variant="outline" size="sm" className="w-full bg-transparent">
              <RefreshCw className="h-4 w-4 mr-2" />
              Sincronizar ahora
            </Button>
          </CardContent>
        </Card>

        {/* Database Connection */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium text-foreground flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Base de Datos Neon
              </CardTitle>
              <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20">
                Conectado
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Host</span>
                <span className="text-foreground font-mono text-xs">ep-xxx.neon.tech</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Database</span>
                <span className="text-foreground font-mono text-xs">transactions_db</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Registros</span>
                <span className="text-foreground">12 transacciones</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Email Accounts */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-foreground flex items-center gap-2">
              <Mail className="h-5 w-5 text-destructive" />
              Cuentas Monitoreadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {accountOptions.map((accountName) => (
              <div key={accountName} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                <span className="text-sm text-foreground">{accountName}</span>
                <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full mt-2 bg-transparent">
              Agregar cuenta
            </Button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-foreground">
              Notificaciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">Nueva transacción</p>
                <p className="text-xs text-muted-foreground">Notificar al recibir</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">Transacciones grandes</p>
                <p className="text-xs text-muted-foreground">Mayor a $1,000</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">Resumen diario</p>
                <p className="text-xs text-muted-foreground">Email a las 9:00 AM</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
