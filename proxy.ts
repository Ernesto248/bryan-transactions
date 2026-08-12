import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  APP_AUTH_COOKIE_NAME,
  verifyAppSessionToken,
} from "@/lib/app-auth";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
]);

function isPublicFile(pathname: string) {
  return /\.[^/]+$/.test(pathname);
}

function isN8nIngestRequest(request: NextRequest) {
  return (
    request.method === "POST" && request.nextUrl.pathname === "/api/transactions"
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicFile(pathname) || isN8nIngestRequest(request)) {
    return NextResponse.next();
  }

  const sessionSecret = process.env.APP_SESSION_SECRET;
  const sessionToken = request.cookies.get(APP_AUTH_COOKIE_NAME)?.value;
  const hasValidSession = Boolean(
    sessionSecret &&
      sessionToken &&
      (await verifyAppSessionToken(sessionToken, sessionSecret)),
  );

  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === "/login" && hasValidSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (hasValidSession) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
