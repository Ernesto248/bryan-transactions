const encoder = new TextEncoder();

const SESSION_VERSION = "v1";
const SESSION_SIGNATURE_SEPARATOR = ".";

export const APP_AUTH_COOKIE_NAME = "bryan_access_session";
export const APP_AUTH_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |=
      (leftBytes[index] ?? 0) ^
      (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function signSessionPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function passwordsMatch(provided: string, expected: string) {
  const [providedHash, expectedHash] = await Promise.all([
    sha256(provided),
    sha256(expected),
  ]);
  return constantTimeEqual(providedHash, expectedHash);
}

export async function createAppSessionToken(
  secret: string,
  now = Date.now(),
) {
  const expiresAt = now + APP_AUTH_SESSION_DURATION_SECONDS * 1000;
  const payload = `${SESSION_VERSION}:${expiresAt}`;
  const signature = await signSessionPayload(payload, secret);
  return `${SESSION_VERSION}${SESSION_SIGNATURE_SEPARATOR}${expiresAt}${SESSION_SIGNATURE_SEPARATOR}${signature}`;
}

export async function verifyAppSessionToken(
  token: string,
  secret: string,
  now = Date.now(),
) {
  const [version, rawExpiresAt, providedSignature, ...extraParts] = token.split(
    SESSION_SIGNATURE_SEPARATOR,
  );

  if (
    extraParts.length > 0 ||
    version !== SESSION_VERSION ||
    !rawExpiresAt ||
    !providedSignature
  ) {
    return false;
  }

  const expiresAt = Number(rawExpiresAt);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;

  const payload = `${version}:${expiresAt}`;
  const expectedSignature = await signSessionPayload(payload, secret);
  return constantTimeEqual(providedSignature, expectedSignature);
}
