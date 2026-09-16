import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from "@simplewebauthn/server";
import { describe, expect, it, vi } from "vitest";

const verifierMocks = vi.hoisted(() => ({
  registration: vi.fn(),
  authentication: vi.fn(),
}));

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return {
    ...actual,
    verifyRegistrationResponse: verifierMocks.registration,
    verifyAuthenticationResponse: verifierMocks.authentication,
  };
});

import {
  accountIdToUserHandle,
  createAuthenticationOptions,
  createRegistrationOptions,
  userHandleToAccountId,
  verifyAuthentication,
  verifyRegistration,
} from "./webauthn";

const accountId = "018f47f0-4f7b-7d1f-8f5a-6b312f81bbad";

describe("WebAuthn ceremony configuration", () => {
  it("encodes AccountId as the exact 16-byte userHandle round trip", () => {
    const handle = accountIdToUserHandle(accountId);
    expect(handle.byteLength).toBe(16);
    expect(userHandleToAccountId(handle)).toBe(accountId);
  });

  it("generates discoverable UV-required registration with credProps and no attestation", async () => {
    const options = await createRegistrationOptions({
      rpId: "example.com",
      rpName: "PokeNexus",
      accountId,
      excludeCredentialIds: [],
    });
    expect(options.rp.id).toBe("example.com");
    expect(options.attestation).toBe("none");
    expect(options.authenticatorSelection).toMatchObject({
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    });
    expect(options.extensions).toMatchObject({ credProps: true });
  });

  it("generates identifier-less sign-in options without allowCredentials", async () => {
    const options = await createAuthenticationOptions({ rpId: "example.com" });
    expect(options.userVerification).toBe("required");
    expect(options.allowCredentials ?? []).toEqual([]);
  });

  it("passes exact RP/origin/type/UP/UV requirements to registration verification", async () => {
    verifierMocks.registration.mockResolvedValue({ verified: false });
    const response = {} as RegistrationResponseJSON;
    await verifyRegistration({
      response,
      expectedChallenge: "challenge",
      config: {
        rpId: "example.com",
        rpName: "PokeNexus",
        allowedOrigins: ["https://example.com", "https://app.example.com"],
      },
    });
    expect(verifierMocks.registration).toHaveBeenCalledWith({
      response,
      expectedChallenge: "challenge",
      expectedOrigin: ["https://example.com", "https://app.example.com"],
      expectedRPID: "example.com",
      expectedType: "webauthn.create",
      requireUserPresence: true,
      requireUserVerification: true,
    });
  });

  it("passes exact RP/origin/type/UV requirements and credential to authentication verification", async () => {
    verifierMocks.authentication.mockResolvedValue({
      verified: false,
      authenticationInfo: {
        credentialID: "credential",
        newCounter: 0,
        userVerified: false,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        origin: "https://example.com",
        rpID: "example.com",
      },
    });
    const response = {} as AuthenticationResponseJSON;
    const credential: WebAuthnCredential = {
      id: "credential",
      publicKey: new Uint8Array([1]),
      counter: 0,
    };
    await verifyAuthentication({
      response,
      expectedChallenge: "challenge",
      config: {
        rpId: "example.com",
        rpName: "PokeNexus",
        allowedOrigins: ["https://example.com", "https://app.example.com"],
      },
      credential,
    });
    expect(verifierMocks.authentication).toHaveBeenCalledWith({
      response,
      expectedChallenge: "challenge",
      expectedOrigin: ["https://example.com", "https://app.example.com"],
      expectedRPID: "example.com",
      expectedType: "webauthn.get",
      requireUserVerification: true,
      credential,
    });
  });
});
