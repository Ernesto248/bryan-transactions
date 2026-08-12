import { NextResponse } from "next/server";
import { APP_AUTH_COOKIE_NAME } from "@/lib/app-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set({
    name: APP_AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
