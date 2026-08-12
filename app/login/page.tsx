import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Acceso | Bryan Transactions",
};

function getSafeNextPath(value: string | string[] | undefined) {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/login")) return "/";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  return <LoginForm nextPath={getSafeNextPath(params.next)} />;
}
