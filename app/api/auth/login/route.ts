import { NextResponse } from "next/server";
import { z } from "zod";
import {
  APP_AUTH_COOKIE_NAME,
  APP_AUTH_SESSION_DURATION_SECONDS,
  createAppSessionToken,
  passwordsMatch,
} from "@/lib/app-auth";

export const runtime = "nodejs";

const LoginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const expectedPassword = process.env.APP_ACCESS_PASSWORD;
  const sessionSecret = process.env.APP_SESSION_SECRET;

  if (!expectedPassword || !sessionSecret || sessionSecret.length < 32) {
    return NextResponse.json(
      { ok: false, error: "auth_not_configured" },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = LoginSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "password_required" },
      { status: 400 },
    );
  }

  const isValidPassword = await passwordsMatch(
    parsed.data.password,
    expectedPassword,
  );
  if (!isValidPassword) {
    return NextResponse.json(
      { ok: false, error: "invalid_password" },
      { status: 401 },
    );
  }

  const sessionToken = await createAppSessionToken(sessionSecret);
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set({
    name: APP_AUTH_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: APP_AUTH_SESSION_DURATION_SECONDS,
  });
  return response;
}
