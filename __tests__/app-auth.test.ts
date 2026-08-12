// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  APP_AUTH_COOKIE_NAME,
  APP_AUTH_SESSION_DURATION_SECONDS,
  createAppSessionToken,
  passwordsMatch,
  verifyAppSessionToken,
} from "@/lib/app-auth";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { proxy } from "@/proxy";

const password = "test-access-password";
const sessionSecret = "test-session-secret-that-is-at-least-32-characters";

describe("app access authentication", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ACCESS_PASSWORD", password);
    vi.stubEnv("APP_SESSION_SECRET", sessionSecret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("compares passwords without exposing the raw value", async () => {
    await expect(passwordsMatch(password, password)).resolves.toBe(true);
    await expect(passwordsMatch("wrong-password", password)).resolves.toBe(
      false,
    );
  });

  it("creates signed sessions that expire after seven days", async () => {
    const now = Date.UTC(2026, 7, 6, 12, 0, 0);
    const token = await createAppSessionToken(sessionSecret, now);

    await expect(
      verifyAppSessionToken(token, sessionSecret, now + 1_000),
    ).resolves.toBe(true);
    await expect(
      verifyAppSessionToken(
        token,
        sessionSecret,
        now + APP_AUTH_SESSION_DURATION_SECONDS * 1_000 + 1,
      ),
    ).resolves.toBe(false);
    await expect(
      verifyAppSessionToken(`${token}tampered`, sessionSecret, now + 1_000),
    ).resolves.toBe(false);
  });

  it("sets an HttpOnly cookie after a valid login", async () => {
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      }),
    );

    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${APP_AUTH_COOKIE_NAME}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });

  it("rejects an invalid password", async () => {
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "incorrect" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("clears the session cookie on logout", async () => {
    const response = await logout();
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain(`${APP_AUTH_COOKIE_NAME}=`);
    expect(cookie.toLowerCase()).toContain("max-age=0");
  });

  it("redirects anonymous page requests to login", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/remeseros/r-1?range=current"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fremeseros%2Fr-1%3Frange%3Dcurrent",
    );
  });

  it("returns JSON 401 for anonymous internal API requests", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/api/accounts"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "unauthorized",
    });
  });

  it("allows n8n ingestion to reach its existing Bearer validation", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/api/transactions", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows a request with a valid session cookie", async () => {
    const token = await createAppSessionToken(sessionSecret);
    const response = await proxy(
      new NextRequest("http://localhost/", {
        headers: { cookie: `${APP_AUTH_COOKIE_NAME}=${token}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
