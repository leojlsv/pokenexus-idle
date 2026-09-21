import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BEARER_BYTES = 32;

export function generateBearerSecret(): string {
  return Buffer.from(randomBytes(BEARER_BYTES)).toString("base64url");
}

export async function digestBearerSecret(secret: string): Promise<Uint8Array> {
  return new Uint8Array(createHash("sha256").update(secret, "utf8").digest());
}

export async function pseudonymousTargetKey(
  canonicalEmail: string,
  hmacKey: string,
): Promise<Uint8Array> {
  if (hmacKey.length === 0) {
    throw new Error("Target-key HMAC secret is required");
  }
  return new Uint8Array(createHmac("sha256", hmacKey).update(canonicalEmail, "utf8").digest());
}

export async function deriveBoundCsrfToken(bindingId: string, csrfKey: string): Promise<string> {
  if (bindingId.length === 0 || csrfKey.length === 0) {
    throw new Error("CSRF binding and server secret are required");
  }
  return createHmac("sha256", csrfKey).update(`pokenexus-csrf-v1\0${bindingId}`, "utf8").digest("base64url");
}

export async function verifyBoundCsrfToken(
  provided: string,
  bindingId: string,
  csrfKey: string,
): Promise<boolean> {
  const expected = await deriveBoundCsrfToken(bindingId, csrfKey);
  return constantTimeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
