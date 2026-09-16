import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from "@simplewebauthn/server";
import {
  addPasskey,
  authorizeSensitiveSession,
  completeReauthentication,
  completeRestrictedRegistration,
  completeSignIn,
  deleteAccountAuthentication,
  findAccountById,
  findAccountByRecoveryEmail,
  findCredentialById,
  generateUuidV7,
  getRestrictedFlowByDigest,
  getWebAuthnChallenge,
  issueEmailAction,
  issueWebAuthnChallenge,
  listCredentialIdsForAccount,
  listSessionsForAccount,
  loadSessionByDigest,
  recordSecurityEvent,
  redeemEmailActionToRestrictedFlow,
  removePasskey,
  replaceRecoveryEmail,
  requestAccountDeletion,
  reserveIssuance,
  revokeAllSessions,
  revokeCurrentSession,
  revokeOneSession,
  touchSessionActivity,
  withPgClient,
  type RestrictedFlowRecord,
  type SessionRecord,
} from "@pokenexus/database";
import { canonicalizeRecoveryEmail } from "./email";
import type { AuthConfig } from "./config";
import type { EmailActionSender, SecurityNotificationKind } from "./email-sender";
import {
  constantTimeEqual,
  deriveBoundCsrfToken,
  digestBearerSecret,
  generateBearerSecret,
  pseudonymousTargetKey,
  verifyBoundCsrfToken,
} from "./crypto";
import {
  accountIdToUserHandle,
  createAuthenticationOptions,
  createRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "./webauthn";

export interface AuthSessionPrincipal {
  readonly accountId: string;
  readonly sessionId: string;
  readonly bearerDigest: Uint8Array;
  readonly securityEpoch: bigint;
  readonly recentAuthAt: Date | null;
  readonly postRecoveryHoldUntil: Date | null;
}

export interface RestrictedPrincipal {
  readonly flow: RestrictedFlowRecord;
}

export interface SessionIssueResult {
  readonly bearer: string;
  readonly csrf: string;
  readonly absoluteExpiresAt: Date;
}

export interface RestrictedIssueResult {
  readonly bearer: string;
  readonly csrf: string;
  readonly expiresAt: Date;
  readonly purpose: "activation" | "recovery";
}

export interface AuthClock {
  now(): Date;
}

const systemClock: AuthClock = { now: () => new Date() };

function addMs(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function base64urlBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function credentialIdToBase64url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function isDatabaseUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class AuthenticationApplication {
  constructor(
    private readonly config: AuthConfig,
    private readonly emailSender: EmailActionSender,
    private readonly clock: AuthClock = systemClock,
  ) {}

  private async withDb<T>(operation: Parameters<typeof withPgClient<T>>[1]): Promise<T> {
    return withPgClient({ connectionString: this.config.connectionString }, operation);
  }

  private async challengeMatches(storedDigest: Uint8Array, challenge: string): Promise<boolean> {
    const supplied = await digestBearerSecret(challenge);
    return constantTimeEqual(storedDigest, supplied);
  }

  private async verifyRegistrationSafely(
    response: RegistrationResponseJSON,
    challengeDigest: Uint8Array,
  ): Promise<Awaited<ReturnType<typeof verifyRegistration>> | null> {
    try {
      return await verifyRegistration({
        response,
        expectedChallenge: (candidate) => this.challengeMatches(challengeDigest, candidate),
        config: this.config,
      });
    } catch {
      return null;
    }
  }

  private async audit(input: Parameters<typeof recordSecurityEvent>[1]): Promise<void> {
    await this.withDb((client) => recordSecurityEvent(client, input));
  }

  private async reserveSignInDimension(input: {
    readonly namespace: "options-network" | "verify-network" | "verify-credential";
    readonly value: string;
    readonly correlationId?: string | null;
    readonly now: Date;
  }): Promise<boolean> {
    const targetKey = await pseudonymousTargetKey(
      `sign-in:${input.namespace}:${input.value}`,
      this.config.targetHmacKey,
    );
    const actionFamily =
      input.namespace === "options-network"
        ? "sign_in_options_network"
        : input.namespace === "verify-network"
          ? "sign_in_verify_network"
          : "sign_in_verify_credential";
    const result = await this.withDb((client) =>
      reserveIssuance(client, {
        targetKey,
        actionFamily,
        now: input.now,
        ...this.config.signInAbuse,
      }),
    );
    if (!result.allowed) {
      await this.audit({
        eventType: "authentication_abuse",
        result: "throttled",
        reasonCode: actionFamily,
        correlationId: input.correlationId,
        targetKey,
        now: input.now,
      });
    }
    return result.allowed;
  }

  private async deliverAction(input: {
    readonly kind: "enrollment" | "recovery" | "email_change";
    readonly recipient: string;
    readonly secret: string;
    readonly accountId?: string | null;
    readonly targetKey: Uint8Array;
    readonly correlationId?: string | null;
    readonly now: Date;
  }): Promise<void> {
    try {
      await this.emailSender.sendAction({
        kind: input.kind,
        recipient: input.recipient,
        secret: input.secret,
      });
      await this.audit({
        accountId: input.accountId,
        eventType: `${input.kind}_requested`,
        result: "issued",
        correlationId: input.correlationId,
        targetKey: input.accountId ? null : input.targetKey,
        now: input.now,
      });
    } catch {
      await this.audit({
        accountId: input.accountId,
        eventType: `${input.kind}_requested`,
        result: "delivery_failed",
        correlationId: input.correlationId,
        targetKey: input.accountId ? null : input.targetKey,
        now: input.now,
      });
    }
  }

  private async notifySecurity(input: {
    readonly kind: SecurityNotificationKind;
    readonly recipient: string | null;
    readonly accountId: string;
    readonly correlationId?: string | null;
    readonly now: Date;
  }): Promise<void> {
    if (!input.recipient) {
      return;
    }
    try {
      await this.emailSender.sendSecurityNotification({
        kind: input.kind,
        recipient: input.recipient,
      });
    } catch {
      await this.audit({
        accountId: input.accountId,
        eventType: "notification_delivery",
        result: "failed",
        reasonCode: input.kind,
        correlationId: input.correlationId,
        now: input.now,
      });
    }
  }

  async requestEnrollment(rawEmail: string, correlationId?: string | null): Promise<void> {
    const now = this.clock.now();
    let email: ReturnType<typeof canonicalizeRecoveryEmail>;
    try {
      email = canonicalizeRecoveryEmail(rawEmail);
    } catch {
      return;
    }
    const targetKey = await pseudonymousTargetKey(email.canonical, this.config.targetHmacKey);
    const allowed = await this.withDb((client) =>
      reserveIssuance(client, {
        targetKey,
        actionFamily: "enrollment",
        now,
        ...this.config.issuance,
      }),
    );
    if (!allowed.allowed) {
      return;
    }
    const existing = await this.withDb((client) => findAccountByRecoveryEmail(client, email.canonical));
    if (existing && existing.state !== "pending_activation") {
      return;
    }

    const secret = generateBearerSecret();
    const bearerDigest = await digestBearerSecret(secret);
    await this.withDb((client) =>
      issueEmailAction(client, {
        emailActionId: generateUuidV7(),
        purpose: "enrollment",
        bearerDigest,
        targetKey,
        candidateEmailCanonical: email.canonical,
        candidateEmailDelivery: email.delivery,
        expiresAt: addMs(now, this.config.emailActionTtlMs),
        now,
      }),
    );
    await this.deliverAction({
      kind: "enrollment",
      recipient: email.delivery,
      secret,
      accountId: null,
      targetKey,
      correlationId,
      now,
    });
  }

  async requestRecovery(rawEmail: string, correlationId?: string | null): Promise<void> {
    const now = this.clock.now();
    let email: ReturnType<typeof canonicalizeRecoveryEmail>;
    try {
      email = canonicalizeRecoveryEmail(rawEmail);
    } catch {
      return;
    }
    const targetKey = await pseudonymousTargetKey(email.canonical, this.config.targetHmacKey);
    const allowed = await this.withDb((client) =>
      reserveIssuance(client, {
        targetKey,
        actionFamily: "recovery",
        now,
        ...this.config.issuance,
      }),
    );
    if (!allowed.allowed) {
      return;
    }
    const account = await this.withDb((client) => findAccountByRecoveryEmail(client, email.canonical));
    if (!account || (account.state !== "active" && account.state !== "recovery_pending")) {
      return;
    }

    const secret = generateBearerSecret();
    const bearerDigest = await digestBearerSecret(secret);
    const recoveryState: "active" | "recovery_pending" = account.state;
    await this.withDb((client) =>
      issueEmailAction(client, {
        emailActionId: generateUuidV7(),
        purpose: "recovery",
        accountId: account.accountId,
        bearerDigest,
        targetKey,
        issuedSecurityEpoch: account.securityEpoch,
        expectedAccountState: recoveryState,
        expiresAt: addMs(now, this.config.emailActionTtlMs),
        now,
      }),
    );
    await this.deliverAction({
      kind: "recovery",
      recipient: account.recoveryEmailDelivery ?? email.delivery,
      secret,
      accountId: account.accountId,
      targetKey,
      correlationId,
      now,
    });
  }

  async redeemEmailAction(
    rawSecret: string,
    correlationId?: string | null,
  ): Promise<RestrictedIssueResult | null> {
    const now = this.clock.now();
    const flowBearer = generateBearerSecret();
    const flowId = generateUuidV7();
    const bearerDigest = await digestBearerSecret(rawSecret);
    const flowBearerDigest = await digestBearerSecret(flowBearer);
    const flow = await this.withDb((client) =>
      redeemEmailActionToRestrictedFlow(client, {
        bearerDigest,
        enrollmentAccountId: generateUuidV7(),
        flowId,
        flowBearerDigest,
        flowExpiresAt: addMs(now, this.config.restrictedFlowTtlMs),
        now,
        correlationId,
      }),
    );
    if (!flow) {
      return null;
    }
    if (flow.purpose === "recovery") {
      const account = await this.withDb((client) =>
        findAccountById(client, flow.accountId),
      );
      await this.notifySecurity({
        kind: "recovery_started",
        recipient: account?.recoveryEmailDelivery ?? null,
        accountId: flow.accountId,
        correlationId,
        now,
      });
    }
    return {
      bearer: flowBearer,
      csrf: await deriveBoundCsrfToken(flow.flowId, this.config.csrfKey),
      expiresAt: flow.expiresAt,
      purpose: flow.purpose,
    };
  }

  async authenticateRestricted(rawBearer: string): Promise<RestrictedPrincipal | null> {
    const bearerDigest = await digestBearerSecret(rawBearer);
    const flow = await this.withDb((client) =>
      getRestrictedFlowByDigest(client, bearerDigest, this.clock.now()),
    );
    return flow ? { flow } : null;
  }

  async verifyRestrictedCsrf(flowId: string, token: string): Promise<boolean> {
    return verifyBoundCsrfToken(token, flowId, this.config.csrfKey);
  }

  async beginRestrictedRegistration(
    restricted: RestrictedPrincipal,
  ): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
    const now = this.clock.now();
    const credentialIds = await this.withDb((client) =>
      listCredentialIdsForAccount(client, restricted.flow.accountId),
    );
    const options = await createRegistrationOptions({
      rpId: this.config.rpId,
      rpName: this.config.rpName,
      accountId: restricted.flow.accountId,
      excludeCredentialIds: credentialIds.map(credentialIdToBase64url),
    });
    const challengeId = generateUuidV7();
    const challengeDigest = await digestBearerSecret(options.challenge);
    await this.withDb((client) =>
      issueWebAuthnChallenge(client, {
        challengeId,
        purpose: "restricted_registration",
        challengeDigest,
        accountId: restricted.flow.accountId,
        flowId: restricted.flow.flowId,
        securityEpoch: restricted.flow.securityEpoch,
        expectedAccountState: restricted.flow.expectedAccountState,
        expiresAt: addMs(now, this.config.webAuthnChallengeTtlMs),
        now,
      }),
    );
    return { challengeId, options };
  }

  async completeRestrictedRegistration(input: {
    readonly restricted: RestrictedPrincipal;
    readonly challengeId: string;
    readonly response: RegistrationResponseJSON;
    readonly correlationId?: string | null;
  }): Promise<SessionIssueResult | null> {
    const now = this.clock.now();
    const challenge = await this.withDb((client) =>
      getWebAuthnChallenge(client, input.challengeId, now),
    );
    if (
      !challenge ||
      challenge.purpose !== "restricted_registration" ||
      challenge.accountId !== input.restricted.flow.accountId ||
      challenge.flowId !== input.restricted.flow.flowId ||
      challenge.securityEpoch !== input.restricted.flow.securityEpoch ||
      challenge.expectedAccountState !== input.restricted.flow.expectedAccountState ||
      input.response.clientExtensionResults.credProps?.rk === false
    ) {
      return null;
    }
    const verification = await this.verifyRegistrationSafely(
      input.response,
      challenge.challengeDigest,
    );
    if (!verification?.verified) {
      return null;
    }

    const bearer = generateBearerSecret();
    const sessionId = generateUuidV7();
    const absoluteExpiresAt = addMs(now, this.config.session.absoluteLifetimeMs);
    const bearerDigest = await digestBearerSecret(bearer);
    const persisted = await this.withDb((client) =>
      completeRestrictedRegistration(client, {
        flow: input.restricted.flow,
        challengeId: input.challengeId,
        credential: {
          credentialId: base64urlBytes(verification.registrationInfo.credential.id),
          userHandle: accountIdToUserHandle(input.restricted.flow.accountId),
          publicKey: verification.registrationInfo.credential.publicKey,
          signCount: verification.registrationInfo.credential.counter,
          backupEligible: verification.registrationInfo.credentialDeviceType === "multiDevice",
          backedUp: verification.registrationInfo.credentialBackedUp,
        },
        session: {
          sessionId,
          bearerDigest,
          authenticatedAt: now,
          lastActivityAt: now,
          absoluteExpiresAt,
        },
        now,
        recoveryHoldUntil: addMs(now, this.config.postRecoveryHoldMs),
        correlationId: input.correlationId,
      }),
    );
    if (!persisted) {
      return null;
    }

    const account = await this.withDb((client) => findAccountById(client, input.restricted.flow.accountId));
    await this.notifySecurity({
      kind: input.restricted.flow.purpose === "recovery" ? "recovery_completed" : "passkey_added",
      recipient: account?.recoveryEmailDelivery ?? null,
      accountId: input.restricted.flow.accountId,
      correlationId: input.correlationId,
      now,
    });
    return {
      bearer,
      csrf: await deriveBoundCsrfToken(sessionId, this.config.csrfKey),
      absoluteExpiresAt,
    };
  }

  async beginSignIn(
    networkSignal: string,
    correlationId?: string | null,
  ): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON } | null> {
    const now = this.clock.now();
    if (
      !(await this.reserveSignInDimension({
        namespace: "options-network",
        value: networkSignal,
        correlationId,
        now,
      }))
    ) {
      return null;
    }
    const options = await createAuthenticationOptions({ rpId: this.config.rpId });
    const challengeId = generateUuidV7();
    const challengeDigest = await digestBearerSecret(options.challenge);
    await this.withDb((client) =>
      issueWebAuthnChallenge(client, {
        challengeId,
        purpose: "sign_in",
        challengeDigest,
        expiresAt: addMs(now, this.config.webAuthnChallengeTtlMs),
        now,
      }),
    );
    return { challengeId, options };
  }

  private async verifyAuthenticationForCredential(input: {
    readonly response: AuthenticationResponseJSON;
    readonly challengeDigest: Uint8Array;
    readonly credentialAccountId?: string;
  }): Promise<{
    readonly accountId: string;
    readonly credentialId: Uint8Array;
    readonly newCounter: number;
    readonly backedUp: boolean;
    readonly previousCounter: bigint;
  } | null> {
    const credentialId = base64urlBytes(input.response.id);
    const stored = await this.withDb((client) => findCredentialById(client, credentialId));
    if (!stored || stored.status !== "active") {
      return null;
    }
    if (input.credentialAccountId && stored.accountId !== input.credentialAccountId) {
      return null;
    }
    const presentedUserHandle = input.response.response.userHandle;
    if (!presentedUserHandle) {
      return null;
    }
    const canonicalUserHandle = accountIdToUserHandle(stored.accountId);
    if (!constantTimeEqual(stored.userHandle, canonicalUserHandle)) {
      return null;
    }
    const decodedHandle = base64urlBytes(presentedUserHandle);
    if (!constantTimeEqual(decodedHandle, stored.userHandle)) {
      return null;
    }

    const verifierCredential: WebAuthnCredential = {
      id: input.response.id,
      publicKey: Uint8Array.from(stored.publicKey),
      // ADR-006 treats lower/zero counters as an audit signal, not an automatic lockout.
      // PokeNexus therefore performs monotonic persistence itself after cryptographic verification.
      counter: 0,
    };
    let verification: Awaited<ReturnType<typeof verifyAuthentication>>;
    try {
      verification = await verifyAuthentication({
        response: input.response,
        expectedChallenge: (candidate) => this.challengeMatches(input.challengeDigest, candidate),
        config: this.config,
        credential: verifierCredential,
      });
    } catch {
      return null;
    }
    if (!verification.verified) {
      return null;
    }
    return {
      accountId: stored.accountId,
      credentialId,
      newCounter: verification.authenticationInfo.newCounter,
      backedUp: verification.authenticationInfo.credentialBackedUp,
      previousCounter: stored.signCount,
    };
  }

  private async auditCounterSignal(input: {
    readonly accountId: string;
    readonly previousCounter: bigint;
    readonly observedCounter: number;
    readonly correlationId?: string | null;
    readonly now: Date;
  }): Promise<void> {
    if (
      input.previousCounter > 0n &&
      BigInt(input.observedCounter) <= input.previousCounter
    ) {
      await this.audit({
        accountId: input.accountId,
        eventType: "authenticator_counter_signal",
        result: "observed",
        reasonCode: input.observedCounter === 0 ? "zero" : "non_increasing",
        correlationId: input.correlationId,
        now: input.now,
      });
    }
  }

  async completeSignIn(input: {
    readonly challengeId: string;
    readonly response: AuthenticationResponseJSON;
    readonly networkSignal: string;
    readonly correlationId?: string | null;
  }): Promise<SessionIssueResult | null> {
    const now = this.clock.now();
    if (
      !(await this.reserveSignInDimension({
        namespace: "verify-network",
        value: input.networkSignal,
        correlationId: input.correlationId,
        now,
      })) ||
      !(await this.reserveSignInDimension({
        namespace: "verify-credential",
        value: input.response.id,
        correlationId: input.correlationId,
        now,
      }))
    ) {
      return null;
    }
    const challenge = await this.withDb((client) => getWebAuthnChallenge(client, input.challengeId, now));
    if (!challenge || challenge.purpose !== "sign_in" || challenge.accountId !== null) {
      return null;
    }
    const verified = await this.verifyAuthenticationForCredential({
      response: input.response,
      challengeDigest: challenge.challengeDigest,
    });
    if (!verified) {
      return null;
    }
    const bearer = generateBearerSecret();
    const sessionId = generateUuidV7();
    const absoluteExpiresAt = addMs(now, this.config.session.absoluteLifetimeMs);
    const bearerDigest = await digestBearerSecret(bearer);
    const persisted = await this.withDb((client) =>
      completeSignIn(client, {
        challengeId: input.challengeId,
        credentialId: verified.credentialId,
        observedSignCount: verified.newCounter,
        backedUp: verified.backedUp,
        session: {
          sessionId,
          bearerDigest,
          authenticatedAt: now,
          lastActivityAt: now,
          absoluteExpiresAt,
        },
        now,
        correlationId: input.correlationId,
      }),
    );
    if (!persisted) {
      return null;
    }
    await this.auditCounterSignal({
      accountId: verified.accountId,
      previousCounter: persisted.previousSignCount,
      observedCounter: verified.newCounter,
      correlationId: input.correlationId,
      now,
    });
    return {
      bearer,
      csrf: await deriveBoundCsrfToken(sessionId, this.config.csrfKey),
      absoluteExpiresAt,
    };
  }

  async authenticateSession(rawBearer: string, touchActivity = false): Promise<AuthSessionPrincipal | null> {
    const now = this.clock.now();
    const digest = await digestBearerSecret(rawBearer);
    const session = await this.withDb((client) => loadSessionByDigest(client, digest));
    if (!this.isSessionValid(session, now)) {
      return null;
    }
    if (touchActivity) {
      const touched = await this.withDb((client) =>
        touchSessionActivity(
          client,
          session!.sessionId,
          session!.accountId,
          session!.accountSecurityEpoch,
          digest,
          now,
          this.config.session.inactivityLifetimeMs,
        ),
      );
      if (!touched) {
        return null;
      }
    }
    return {
      accountId: session!.accountId,
      sessionId: session!.sessionId,
      bearerDigest: digest,
      securityEpoch: session!.accountSecurityEpoch,
      recentAuthAt: session!.recentAuthAt,
      postRecoveryHoldUntil: session!.postRecoveryHoldUntil,
    };
  }

  private isSessionValid(session: SessionRecord | null, now: Date): session is SessionRecord {
    return Boolean(
      session &&
        session.revokedAt === null &&
        session.accountState === "active" &&
        session.issuedSecurityEpoch === session.accountSecurityEpoch &&
        session.absoluteExpiresAt.getTime() > now.getTime() &&
        session.lastActivityAt.getTime() + this.config.session.inactivityLifetimeMs > now.getTime(),
    );
  }

  async verifySessionCsrf(sessionId: string, token: string): Promise<boolean> {
    return verifyBoundCsrfToken(token, sessionId, this.config.csrfKey);
  }

  async sessionCsrf(sessionId: string): Promise<string> {
    return deriveBoundCsrfToken(sessionId, this.config.csrfKey);
  }

  async beginReauthentication(
    principal: AuthSessionPrincipal,
  ): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
    const now = this.clock.now();
    const options = await createAuthenticationOptions({ rpId: this.config.rpId });
    const challengeId = generateUuidV7();
    const challengeDigest = await digestBearerSecret(options.challenge);
    await this.withDb((client) =>
      issueWebAuthnChallenge(client, {
        challengeId,
        purpose: "reauth",
        challengeDigest,
        accountId: principal.accountId,
        securityEpoch: principal.securityEpoch,
        expectedAccountState: "active",
        expiresAt: addMs(now, this.config.webAuthnChallengeTtlMs),
        now,
      }),
    );
    return { challengeId, options };
  }

  async completeReauthentication(input: {
    readonly principal: AuthSessionPrincipal;
    readonly challengeId: string;
    readonly response: AuthenticationResponseJSON;
    readonly correlationId?: string | null;
  }): Promise<SessionIssueResult | null> {
    const now = this.clock.now();
    const challenge = await this.withDb((client) => getWebAuthnChallenge(client, input.challengeId, now));
    if (
      !challenge ||
      challenge.purpose !== "reauth" ||
      challenge.accountId !== input.principal.accountId ||
      challenge.securityEpoch !== input.principal.securityEpoch
    ) {
      return null;
    }
    const verified = await this.verifyAuthenticationForCredential({
      response: input.response,
      challengeDigest: challenge.challengeDigest,
      credentialAccountId: input.principal.accountId,
    });
    if (!verified) {
      return null;
    }
    const rotatedBearer = generateBearerSecret();
    const absoluteExpiresAt = addMs(now, this.config.session.absoluteLifetimeMs);
    const rotatedBearerDigest = await digestBearerSecret(rotatedBearer);
    const persisted = await this.withDb((client) =>
      completeReauthentication(client, {
        challengeId: input.challengeId,
        sessionId: input.principal.sessionId,
        accountId: input.principal.accountId,
        expectedBearerDigest: input.principal.bearerDigest,
        credentialId: verified.credentialId,
        observedSignCount: verified.newCounter,
        backedUp: verified.backedUp,
        rotatedBearerDigest,
        absoluteExpiresAt,
        now,
        inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
        correlationId: input.correlationId,
      }),
    );
    if (!persisted) {
      return null;
    }
    await this.auditCounterSignal({
      accountId: input.principal.accountId,
      previousCounter: persisted.previousSignCount,
      observedCounter: verified.newCounter,
      correlationId: input.correlationId,
      now,
    });
    return {
      bearer: rotatedBearer,
      csrf: await deriveBoundCsrfToken(input.principal.sessionId, this.config.csrfKey),
      absoluteExpiresAt,
    };
  }

  async beginPasskeyAddition(
    principal: AuthSessionPrincipal,
  ): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON } | null> {
    const now = this.clock.now();
    const account = await this.withDb((client) =>
      authorizeSensitiveSession(client, {
        accountId: principal.accountId,
        sessionId: principal.sessionId,
        expectedBearerDigest: principal.bearerDigest,
        now,
        inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
        recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
      }),
    );
    if (!account) {
      return null;
    }
    const credentialIds = await this.withDb((client) =>
      listCredentialIdsForAccount(client, principal.accountId),
    );
    const options = await createRegistrationOptions({
      rpId: this.config.rpId,
      rpName: this.config.rpName,
      accountId: principal.accountId,
      excludeCredentialIds: credentialIds.map(credentialIdToBase64url),
    });
    const challengeId = generateUuidV7();
    const challengeDigest = await digestBearerSecret(options.challenge);
    await this.withDb((client) =>
      issueWebAuthnChallenge(client, {
        challengeId,
        purpose: "add_passkey",
        challengeDigest,
        accountId: principal.accountId,
        securityEpoch: account.securityEpoch,
        expectedAccountState: "active",
        expiresAt: addMs(now, this.config.webAuthnChallengeTtlMs),
        now,
      }),
    );
    return { challengeId, options };
  }

  async completePasskeyAddition(input: {
    readonly principal: AuthSessionPrincipal;
    readonly challengeId: string;
    readonly response: RegistrationResponseJSON;
    readonly correlationId?: string | null;
  }): Promise<boolean> {
    const now = this.clock.now();
    const challenge = await this.withDb((client) => getWebAuthnChallenge(client, input.challengeId, now));
    if (
      !challenge ||
      challenge.purpose !== "add_passkey" ||
      challenge.accountId !== input.principal.accountId ||
      challenge.securityEpoch === null ||
      input.response.clientExtensionResults.credProps?.rk === false
    ) {
      return false;
    }
    const verification = await this.verifyRegistrationSafely(
      input.response,
      challenge.challengeDigest,
    );
    if (!verification?.verified) {
      return false;
    }
    const added = await this.withDb((client) =>
      addPasskey(client, {
        accountId: input.principal.accountId,
        authorizingSessionId: input.principal.sessionId,
        authorizingBearerDigest: input.principal.bearerDigest,
        challengeId: input.challengeId,
        credential: {
          credentialId: base64urlBytes(verification.registrationInfo.credential.id),
          userHandle: accountIdToUserHandle(input.principal.accountId),
          publicKey: verification.registrationInfo.credential.publicKey,
          signCount: verification.registrationInfo.credential.counter,
          backupEligible: verification.registrationInfo.credentialDeviceType === "multiDevice",
          backedUp: verification.registrationInfo.credentialBackedUp,
        },
        now,
        inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
        recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
        correlationId: input.correlationId,
      }),
    );
    if (added) {
      const account = await this.withDb((client) => findAccountById(client, input.principal.accountId));
      await this.notifySecurity({
        kind: "passkey_added",
        recipient: account?.recoveryEmailDelivery ?? null,
        accountId: input.principal.accountId,
        correlationId: input.correlationId,
        now,
      });
    }
    return added;
  }

  async removePasskey(input: {
    readonly principal: AuthSessionPrincipal;
    readonly credentialIdBase64url: string;
    readonly correlationId?: string | null;
  }): Promise<boolean> {
    const now = this.clock.now();
    const account = await this.withDb((client) => findAccountById(client, input.principal.accountId));
    const removed = await this.withDb((client) =>
      removePasskey(client, {
        accountId: input.principal.accountId,
        authorizingSessionId: input.principal.sessionId,
        authorizingBearerDigest: input.principal.bearerDigest,
        credentialId: base64urlBytes(input.credentialIdBase64url),
        now,
        inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
        recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
        correlationId: input.correlationId,
      }),
    );
    if (removed) {
      await this.notifySecurity({
        kind: "passkey_removed",
        recipient: account?.recoveryEmailDelivery ?? null,
        accountId: input.principal.accountId,
        correlationId: input.correlationId,
        now,
      });
    }
    return removed;
  }

  async requestRecoveryEmailChange(input: {
    readonly principal: AuthSessionPrincipal;
    readonly rawEmail: string;
    readonly correlationId?: string | null;
  }): Promise<boolean> {
    const now = this.clock.now();
    const authorized = await this.withDb((client) =>
      authorizeSensitiveSession(client, {
        accountId: input.principal.accountId,
        sessionId: input.principal.sessionId,
        expectedBearerDigest: input.principal.bearerDigest,
        now,
        inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
        recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
      }),
    );
    if (!authorized) {
      return false;
    }
    let email: ReturnType<typeof canonicalizeRecoveryEmail>;
    try {
      email = canonicalizeRecoveryEmail(input.rawEmail);
    } catch {
      return false;
    }
    const targetKey = await pseudonymousTargetKey(email.canonical, this.config.targetHmacKey);
    const allowed = await this.withDb((client) =>
      reserveIssuance(client, {
        targetKey,
        actionFamily: "email_change",
        now,
        ...this.config.issuance,
      }),
    );
    if (!allowed.allowed) {
      return true;
    }
    const secret = generateBearerSecret();
    const bearerDigest = await digestBearerSecret(secret);
    await this.withDb((client) =>
      issueEmailAction(client, {
        emailActionId: generateUuidV7(),
        purpose: "email_change",
        accountId: input.principal.accountId,
        bearerDigest,
        targetKey,
        candidateEmailCanonical: email.canonical,
        candidateEmailDelivery: email.delivery,
        issuedSecurityEpoch: authorized.securityEpoch,
        expectedAccountState: "active",
        expiresAt: addMs(now, this.config.emailActionTtlMs),
        now,
      }),
    );
    await this.deliverAction({
      kind: "email_change",
      recipient: email.delivery,
      secret,
      accountId: input.principal.accountId,
      targetKey,
      correlationId: input.correlationId,
      now,
    });
    return true;
  }

  async completeRecoveryEmailChange(input: {
    readonly principal: AuthSessionPrincipal;
    readonly emailActionSecret: string;
    readonly correlationId?: string | null;
  }): Promise<boolean> {
    const now = this.clock.now();
    const previous = await this.withDb((client) => findAccountById(client, input.principal.accountId));
    const bearerDigest = await digestBearerSecret(input.emailActionSecret);
    try {
      const result = await this.withDb((client) =>
        replaceRecoveryEmail(client, {
          accountId: input.principal.accountId,
          authorizingSessionId: input.principal.sessionId,
          authorizingBearerDigest: input.principal.bearerDigest,
          bearerDigest,
          now,
          inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
          recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
          correlationId: input.correlationId,
        }),
      );
      if (!result) {
        return false;
      }
      const updated = await this.withDb((client) => findAccountById(client, input.principal.accountId));
      await Promise.all([
        this.notifySecurity({
          kind: "recovery_email_changed",
          recipient: updated?.recoveryEmailDelivery ?? null,
          accountId: input.principal.accountId,
          correlationId: input.correlationId,
          now,
        }),
        this.notifySecurity({
          kind: "recovery_email_changed",
          recipient: previous?.recoveryEmailDelivery ?? null,
          accountId: input.principal.accountId,
          correlationId: input.correlationId,
          now,
        }),
      ]);
      return true;
    } catch (error) {
      if (isDatabaseUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  async listSessions(principal: AuthSessionPrincipal): Promise<readonly {
    sessionId: string;
    authenticatedAt: Date;
    lastActivityAt: Date;
    absoluteExpiresAt: Date;
    revokedAt: Date | null;
    deviceLabel: string | null;
  }[] | null> {
    const now = this.clock.now();
    const authorized = await this.withDb((client) =>
      authorizeSensitiveSession(client, {
        accountId: principal.accountId,
        sessionId: principal.sessionId,
        expectedBearerDigest: principal.bearerDigest,
        now,
        inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
        recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
      }),
    );
    if (!authorized) {
      return null;
    }
    const sessions = await this.withDb((client) =>
      listSessionsForAccount(client, {
        accountId: principal.accountId,
        sessionId: principal.sessionId,
        expectedBearerDigest: principal.bearerDigest,
        now,
        inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
        recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
      }),
    );
    return sessions.map((session) => ({
      sessionId: session.sessionId,
      authenticatedAt: session.authenticatedAt,
      lastActivityAt: session.lastActivityAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      revokedAt: session.revokedAt,
      deviceLabel: session.deviceLabel,
    }));
  }

  async revokeSession(input: {
    readonly principal: AuthSessionPrincipal;
    readonly targetSessionId: string;
    readonly correlationId?: string | null;
  }): Promise<boolean> {
    const now = this.clock.now();
    return this.withDb((client) =>
      revokeOneSession(client, {
        accountId: input.principal.accountId,
        sessionId: input.principal.sessionId,
        expectedBearerDigest: input.principal.bearerDigest,
        targetSessionId: input.targetSessionId,
        now,
        inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
        recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
        correlationId: input.correlationId,
      }),
    );
  }

  async revokeEverySession(
    principal: AuthSessionPrincipal,
    correlationId?: string | null,
  ): Promise<boolean> {
    const now = this.clock.now();
    return (
      (await this.withDb((client) =>
        revokeAllSessions(client, {
          accountId: principal.accountId,
          sessionId: principal.sessionId,
          expectedBearerDigest: principal.bearerDigest,
          now,
          inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
          recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
          correlationId,
        }),
      )) !== null
    );
  }

  async logout(principal: AuthSessionPrincipal, correlationId?: string | null): Promise<boolean> {
    const now = this.clock.now();
    return this.withDb((client) =>
      revokeCurrentSession(client, {
        accountId: principal.accountId,
        sessionId: principal.sessionId,
        expectedBearerDigest: principal.bearerDigest,
        now,
        correlationId,
      }),
    );
  }

  async authorizeSecurityOperation(principal: AuthSessionPrincipal): Promise<boolean> {
    const now = this.clock.now();
    return Boolean(
      await this.withDb((client) =>
        authorizeSensitiveSession(client, {
          accountId: principal.accountId,
          sessionId: principal.sessionId,
          expectedBearerDigest: principal.bearerDigest,
          now,
          inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
          recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
        }),
      ),
    );
  }

  async deleteAccount(input: {
    readonly principal: AuthSessionPrincipal;
    readonly correlationId?: string | null;
  }): Promise<boolean> {
    const now = this.clock.now();
    const requested = await this.withDb((client) =>
      requestAccountDeletion(client, {
        accountId: input.principal.accountId,
        sessionId: input.principal.sessionId,
        expectedBearerDigest: input.principal.bearerDigest,
        now,
        inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
        recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
        correlationId: input.correlationId,
      }),
    );
    if (!requested) {
      return false;
    }
    await this.notifySecurity({
      kind: "account_deletion_requested",
      recipient: requested.recoveryEmailDelivery,
      accountId: input.principal.accountId,
      correlationId: input.correlationId,
      now,
    });
    const result = await this.withDb((client) =>
      deleteAccountAuthentication(client, {
        accountId: input.principal.accountId,
        authorizingSessionId: input.principal.sessionId,
        authorizingBearerDigest: input.principal.bearerDigest,
        now,
        inactivityLifetimeMs: this.config.session.inactivityLifetimeMs,
        recentAuthLifetimeMs: this.config.session.recentAuthLifetimeMs,
        correlationId: input.correlationId,
      }),
    );
    if (!result) {
      return false;
    }
    await this.notifySecurity({
      kind: "account_deletion_completed",
      recipient: result.previousDeliveryEmail,
      accountId: input.principal.accountId,
      correlationId: input.correlationId,
      now,
    });
    return true;
  }
}
