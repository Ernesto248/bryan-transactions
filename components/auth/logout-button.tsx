"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [submitting, setSubmitting] = useState(false);

  const handleLogout = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleLogout}
      disabled={submitting}
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
    >
      {submitting ? (
        <LoaderCircle className="h-5 w-5 animate-spin" />
      ) : (
        <LogOut className="h-5 w-5" />
      )}
    </Button>
  );
}
