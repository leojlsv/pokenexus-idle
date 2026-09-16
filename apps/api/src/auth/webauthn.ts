import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  Base64URLString,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from "@simplewebauthn/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WebAuthnConfig {
  readonly rpId: string;
  readonly rpName: string;
  readonly allowedOrigins: readonly string[];
}

export function accountIdToUserHandle(accountId: string): Uint8Array<ArrayBuffer> {
  if (!UUID_PATTERN.test(accountId)) {
    throw new Error("AccountId must be a canonical UUID string");
  }
  const handle = new Uint8Array(16);
  handle.set(Buffer.from(accountId.replaceAll("-", ""), "hex"));
  return handle;
}

export function userHandleToAccountId(userHandle: Uint8Array): string {
  if (userHandle.byteLength !== 16) {
    throw new Error("WebAuthn userHandle must contain exactly 16 bytes");
  }
  const hex = Buffer.from(userHandle).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function createRegistrationOptions(input: {
  readonly rpId: string;
  readonly rpName: string;
  readonly accountId: string;
  readonly excludeCredentialIds: readonly string[];
  readonly challenge?: string;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpID: input.rpId,
    rpName: input.rpName,
    userID: accountIdToUserHandle(input.accountId),
    userName: input.accountId,
    userDisplayName: "PokeNexus account",
    challenge: input.challenge,
    timeout: 5 * 60 * 1000,
    attestationType: "none",
    excludeCredentials: input.excludeCredentialIds.map((id) => ({ id: id as Base64URLString })),
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
    extensions: { credProps: true },
  });
}

export async function createAuthenticationOptions(input: {
  readonly rpId: string;
  readonly challenge?: string;
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: input.rpId,
    challenge: input.challenge,
    timeout: 5 * 60 * 1000,
    userVerification: "required",
  });
}

export async function verifyRegistration(input: {
  readonly response: RegistrationResponseJSON;
  readonly expectedChallenge: string | ((challenge: string) => boolean | Promise<boolean>);
  readonly config: WebAuthnConfig;
}): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: [...input.config.allowedOrigins],
    expectedRPID: input.config.rpId,
    expectedType: "webauthn.create",
    requireUserPresence: true,
    requireUserVerification: true,
  });
}

export async function verifyAuthentication(input: {
  readonly response: AuthenticationResponseJSON;
  readonly expectedChallenge: string | ((challenge: string) => boolean | Promise<boolean>);
  readonly config: WebAuthnConfig;
  readonly credential: WebAuthnCredential;
}): Promise<VerifiedAuthenticationResponse> {
  return verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: [...input.config.allowedOrigins],
    expectedRPID: input.config.rpId,
    expectedType: "webauthn.get",
    requireUserVerification: true,
    credential: input.credential,
  });
}
