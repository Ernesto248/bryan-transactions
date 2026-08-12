"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginFormProps = {
  nextPath: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error === "auth_not_configured"
            ? "El acceso todavía no está configurado en el servidor."
            : "La contraseña no es correcta.",
        );
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("No se pudo iniciar sesión. Inténtalo nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_42%)]" />
      <Card className="relative w-full max-w-md border-border/80 bg-card/95 shadow-2xl shadow-black/20">
        <CardHeader className="space-y-5 px-6 pb-4 pt-7 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary p-2.5 text-primary-foreground">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Bryan Transactions
              </p>
              <CardTitle className="mt-1 text-2xl">Acceso privado</CardTitle>
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Introduce la contraseña para acceder al panel de transacciones.
          </p>
        </CardHeader>

        <CardContent className="px-6 pb-7 sm:px-8">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="access-password">Contraseña</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="access-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError(null);
                  }}
                  autoComplete="current-password"
                  autoFocus
                  className="pl-10 pr-11"
                  aria-invalid={error !== null}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-10 w-10 text-muted-foreground"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={!password || submitting}
            >
              {submitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
