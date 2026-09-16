import type { Client, QueryResultRow } from "pg";
import { generateUuidV7 } from "./uuid-v7.js";
import { withTransaction } from "./transaction.js";

export type AuthDbClient = Pick<Client, "query">;

export type AccountAuthState =
  | "pending_activation"
  | "active"
  | "disabled"
  | "recovery_pending"
  | "deleted";

export type EmailActionPurpose = "enrollment" | "recovery" | "email_change";
export type IssuanceActionFamily =
  | EmailActionPurpose
  | "sign_in_options_network"
  | "sign_in_verify_network"
  | "sign_in_verify_credential";
export type RestrictedFlowPurpose = "activation" | "recovery";
export type WebAuthnChallengePurpose =
  | "sign_in"
  | "reauth"
  | "restricted_registration"
  | "add_passkey";

export interface AccountAuthRecord {
  readonly accountId: string;
  readonly state: AccountAuthState;
  readonly securityEpoch: bigint;
  readonly recoveryEmailCanonical: string | null;
  readonly recoveryEmailDelivery: string | null;
  readonly recoveryEmailVerifiedAt: Date | null;
  readonly postRecoveryHoldUntil: Date | null;
}

export interface CredentialRecord {
  readonly credentialId: Uint8Array;
  readonly accountId: string;
  readonly userHandle: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly signCount: bigint;
  readonly backupEligible: boolean;
  readonly backedUp: boolean;
  readonly status: "active" | "quarantined" | "revoked";
}

export interface SessionRecord {
  readonly sessionId: string;
  readonly accountId: string;
  readonly bearerDigest: Uint8Array;
  readonly issuedSecurityEpoch: bigint;
  readonly authenticatedAt: Date;
  readonly recentAuthAt: Date | null;
  readonly lastActivityAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly revokedAt: Date | null;
  readonly deviceLabel: string | null;
  readonly accountState: AccountAuthState;
  readonly accountSecurityEpoch: bigint;
  readonly postRecoveryHoldUntil: Date | null;
}

export interface EmailActionRecord {
  readonly emailActionId: string;
  readonly accountId: string | null;
  readonly purpose: EmailActionPurpose;
  readonly targetKey: Uint8Array;
  readonly candidateEmailCanonical: string | null;
  readonly candidateEmailDelivery: string | null;
  readonly issuedSecurityEpoch: bigint | null;
  readonly expectedAccountState: AccountAuthState | null;
  readonly expiresAt: Date;
}

export type NewEmailActionInput =
  | {
      readonly emailActionId: string;
      readonly purpose: "enrollment";
      readonly bearerDigest: Uint8Array;
      readonly targetKey: Uint8Array;
      readonly candidateEmailCanonical: string;
      readonly candidateEmailDelivery: string;
      readonly expiresAt: Date;
      readonly now: Date;
    }
  | {
      readonly emailActionId: string;
      readonly purpose: "recovery";
      readonly accountId: string;
      readonly bearerDigest: Uint8Array;
      readonly targetKey: Uint8Array;
      readonly issuedSecurityEpoch: bigint;
      readonly expectedAccountState: "active" | "recovery_pending";
      readonly expiresAt: Date;
      readonly now: Date;
    }
  | {
      readonly emailActionId: string;
      readonly purpose: "email_change";
      readonly accountId: string;
      readonly bearerDigest: Uint8Array;
      readonly targetKey: Uint8Array;
      readonly candidateEmailCanonical: string;
      readonly candidateEmailDelivery: string;
      readonly issuedSecurityEpoch: bigint;
      readonly expectedAccountState: "active";
      readonly expiresAt: Date;
      readonly now: Date;
    };

export interface RestrictedFlowRecord {
  readonly flowId: string;
  readonly accountId: string;
  readonly purpose: RestrictedFlowPurpose;
  readonly securityEpoch: bigint;
  readonly expectedAccountState: "pending_activation" | "recovery_pending";
  readonly expiresAt: Date;
}

export interface WebAuthnChallengeRecord {
  readonly challengeId: string;
  readonly purpose: WebAuthnChallengePurpose;
  readonly challengeDigest: Uint8Array;
  readonly accountId: string | null;
  readonly flowId: string | null;
  readonly securityEpoch: bigint | null;
  readonly expectedAccountState: AccountAuthState | null;
  readonly expiresAt: Date;
}

export interface NewSessionRecord {
  readonly sessionId: string;
  readonly bearerDigest: Uint8Array;
  readonly authenticatedAt: Date;
  readonly lastActivityAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly deviceLabel?: string | null;
}

export interface NewCredentialRecord {
  readonly credentialId: Uint8Array;
  readonly userHandle: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly signCount: number;
  readonly backupEligible: boolean;
  readonly backedUp: boolean;
}

export interface SecurityEventInput {
  readonly accountId?: string | null;
  readonly sessionId?: string | null;
  readonly eventType: string;
  readonly result: string;
  readonly reasonCode?: string | null;
  readonly correlationId?: string | null;
  readonly targetKey?: Uint8Array | null;
  readonly now: Date;
}

interface AccountRow extends QueryResultRow {
  account_id: string;
  auth_state: AccountAuthState;
  security_epoch: string;
  recovery_email_canonical: string | null;
  recovery_email_delivery: string | null;
  recovery_email_verified_at: Date | null;
  post_recovery_hold_until: Date | null;
}

interface CredentialRow extends QueryResultRow {
  credential_id: Buffer;
  account_id: string;
  user_handle: Buffer;
  public_key: Buffer;
  sign_count: string;
  backup_eligible: boolean;
  backed_up: boolean;
  credential_status: "active" | "quarantined" | "revoked";
}

function mapAccount(row: AccountRow): AccountAuthRecord {
  return {
    accountId: row.account_id,
    state: row.auth_state,
    securityEpoch: BigInt(row.security_epoch),
    recoveryEmailCanonical: row.recovery_email_canonical,
    recoveryEmailDelivery: row.recovery_email_delivery,
    recoveryEmailVerifiedAt: row.recovery_email_verified_at,
    postRecoveryHoldUntil: row.post_recovery_hold_until,
  };
}

function mapCredential(row: CredentialRow): CredentialRecord {
  return {
    credentialId: new Uint8Array(row.credential_id),
    accountId: row.account_id,
    userHandle: new Uint8Array(row.user_handle),
    publicKey: new Uint8Array(row.public_key),
    signCount: BigInt(row.sign_count),
    backupEligible: row.backup_eligible,
    backedUp: row.backed_up,
    status: row.credential_status,
  };
}

async function insertSecurityEvent(client: AuthDbClient, input: SecurityEventInput): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.auth_security_events (
      event_id, account_id, session_id, event_type, result, reason_code,
      correlation_id, target_key, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      generateUuidV7(),
      input.accountId ?? null,
      input.sessionId ?? null,
      input.eventType,
      input.result,
      input.reasonCode ?? null,
      input.correlationId ?? null,
      input.targetKey ? Buffer.from(input.targetKey) : null,
      input.now,
    ],
  );
}

export async function recordSecurityEvent(
  client: AuthDbClient,
  input: SecurityEventInput,
): Promise<void> {
  await insertSecurityEvent(client, input);
}

export async function findAccountByRecoveryEmail(
  client: AuthDbClient,
  canonicalEmail: string,
): Promise<AccountAuthRecord | null> {
  const result = await client.query<AccountRow>(
    `SELECT account_id, auth_state, security_epoch, recovery_email_canonical,
            recovery_email_delivery, recovery_email_verified_at, post_recovery_hold_until
     FROM pokenexus.accounts
     WHERE recovery_email_canonical = $1 AND auth_state <> 'deleted'`,
    [canonicalEmail],
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

export async function findAccountById(
  client: AuthDbClient,
  accountId: string,
): Promise<AccountAuthRecord | null> {
  const result = await client.query<AccountRow>(
    `SELECT account_id, auth_state, security_epoch, recovery_email_canonical,
            recovery_email_delivery, recovery_email_verified_at, post_recovery_hold_until
     FROM pokenexus.accounts
     WHERE account_id = $1`,
    [accountId],
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

export async function reserveIssuance(
  client: AuthDbClient,
  input: {
    readonly targetKey: Uint8Array;
    readonly actionFamily: IssuanceActionFamily;
    readonly now: Date;
    readonly baseCooldownMs: number;
    readonly maxCooldownMs: number;
    readonly maxBackoffLevel: number;
  },
): Promise<{ readonly allowed: boolean; readonly nextAllowedAt: Date | null }> {
  assertPositivePolicyDuration(input.baseCooldownMs, "baseCooldownMs");
  assertPositivePolicyDuration(input.maxCooldownMs, "maxCooldownMs");
  if (input.maxCooldownMs < input.baseCooldownMs) {
    throw new Error("maxCooldownMs must be greater than or equal to baseCooldownMs");
  }
  if (
    !Number.isSafeInteger(input.maxBackoffLevel) ||
    input.maxBackoffLevel < 1 ||
    input.maxBackoffLevel > 6
  ) {
    throw new Error("maxBackoffLevel must be a safe integer between 1 and 6");
  }
  const result = await client.query<{ next_allowed_at: Date }>(
    `INSERT INTO pokenexus.auth_issuance_limits (
       target_key, action_family, backoff_level, next_allowed_at, updated_at
     ) VALUES (
       $1,
       $2,
       0,
       $3::timestamptz + ($4::bigint * interval '1 millisecond'),
       $3::timestamptz
     )
     ON CONFLICT (target_key, action_family) DO UPDATE SET
       backoff_level = LEAST(
         pokenexus.auth_issuance_limits.backoff_level + 1,
         $6::smallint
       ),
       next_allowed_at = $3::timestamptz + (
         LEAST(
           $5::bigint,
           $4::bigint * power(
             2::numeric,
             LEAST(pokenexus.auth_issuance_limits.backoff_level + 1, $6::smallint)
           )::bigint
         ) * interval '1 millisecond'
       ),
       updated_at = $3::timestamptz
     WHERE pokenexus.auth_issuance_limits.next_allowed_at <= $3::timestamptz
     RETURNING next_allowed_at`,
    [
      Buffer.from(input.targetKey),
      input.actionFamily,
      input.now,
      input.baseCooldownMs,
      input.maxCooldownMs,
      input.maxBackoffLevel,
    ],
  );
  if (result.rows[0]) {
    return { allowed: true, nextAllowedAt: result.rows[0].next_allowed_at };
  }
  const current = await client.query<{ next_allowed_at: Date }>(
    `SELECT next_allowed_at
     FROM pokenexus.auth_issuance_limits
     WHERE target_key = $1 AND action_family = $2`,
    [Buffer.from(input.targetKey), input.actionFamily],
  );
  return { allowed: false, nextAllowedAt: current.rows[0]?.next_allowed_at ?? null };
}

export async function issueEmailAction(
  client: AuthDbClient,
  input: NewEmailActionInput,
): Promise<void> {
  await withTransaction(client, async (transaction) => {
    if (input.purpose === "enrollment") {
      await transaction.query(
        `UPDATE pokenexus.auth_email_actions
         SET superseded_at = $3
         WHERE target_key = $1 AND purpose = $2
           AND consumed_at IS NULL AND superseded_at IS NULL`,
        [Buffer.from(input.targetKey), input.purpose, input.now],
      );
    } else {
      await transaction.query(
        `UPDATE pokenexus.auth_email_actions
         SET superseded_at = $3
         WHERE account_id = $1 AND purpose = $2
           AND consumed_at IS NULL AND superseded_at IS NULL`,
        [input.accountId, input.purpose, input.now],
      );
    }
    await transaction.query(
      `INSERT INTO pokenexus.auth_email_actions (
        email_action_id, account_id, purpose, bearer_digest, target_key,
        candidate_email_canonical, candidate_email_delivery,
        issued_security_epoch, expected_account_state, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.emailActionId,
        input.purpose === "enrollment" ? null : input.accountId,
        input.purpose,
        Buffer.from(input.bearerDigest),
        Buffer.from(input.targetKey),
        input.purpose === "recovery" ? null : input.candidateEmailCanonical,
        input.purpose === "recovery" ? null : input.candidateEmailDelivery,
        input.purpose === "enrollment" ? null : input.issuedSecurityEpoch.toString(),
        input.purpose === "enrollment" ? null : input.expectedAccountState,
        input.expiresAt,
        input.now,
      ],
    );
  });
}

async function lockEmailActionByDigest(
  client: AuthDbClient,
  bearerDigest: Uint8Array,
): Promise<EmailActionRecord | null> {
  const result = await client.query<{
    email_action_id: string;
    account_id: string | null;
    purpose: EmailActionPurpose;
    target_key: Buffer;
    candidate_email_canonical: string | null;
    candidate_email_delivery: string | null;
    issued_security_epoch: string | null;
    expected_account_state: AccountAuthState | null;
    expires_at: Date;
  }>(
    `SELECT email_action_id, account_id, purpose, target_key,
            candidate_email_canonical, candidate_email_delivery,
            issued_security_epoch, expected_account_state, expires_at
     FROM pokenexus.auth_email_actions
     WHERE bearer_digest = $1
       AND consumed_at IS NULL
       AND superseded_at IS NULL
     FOR UPDATE`,
    [Buffer.from(bearerDigest)],
  );
  const row = result.rows[0];
  return row
    ? {
        emailActionId: row.email_action_id,
        accountId: row.account_id,
        purpose: row.purpose,
        targetKey: new Uint8Array(row.target_key),
        candidateEmailCanonical: row.candidate_email_canonical,
        candidateEmailDelivery: row.candidate_email_delivery,
        issuedSecurityEpoch:
          row.issued_security_epoch === null ? null : BigInt(row.issued_security_epoch),
        expectedAccountState: row.expected_account_state,
        expiresAt: row.expires_at,
      }
    : null;
}

async function lockAccount(client: AuthDbClient, accountId: string): Promise<AccountAuthRecord | null> {
  const result = await client.query<AccountRow>(
    `SELECT account_id, auth_state, security_epoch, recovery_email_canonical,
            recovery_email_delivery, recovery_email_verified_at, post_recovery_hold_until
     FROM pokenexus.accounts
     WHERE account_id = $1
     FOR UPDATE`,
    [accountId],
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

export interface SensitiveSessionAuthorizationInput {
  readonly accountId: string;
  readonly sessionId: string;
  readonly expectedBearerDigest: Uint8Array;
  readonly now: Date;
  readonly inactivityLifetimeMs: number;
  readonly recentAuthLifetimeMs: number;
}

function assertPositivePolicyDuration(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe-integer duration`);
  }
}

export async function authorizeSensitiveSession(
  client: AuthDbClient,
  input: SensitiveSessionAuthorizationInput,
): Promise<AccountAuthRecord | null> {
  assertPositivePolicyDuration(input.inactivityLifetimeMs, "inactivityLifetimeMs");
  assertPositivePolicyDuration(input.recentAuthLifetimeMs, "recentAuthLifetimeMs");
  const result = await client.query<AccountRow>(
    `SELECT a.account_id, a.auth_state, a.security_epoch,
            a.recovery_email_canonical, a.recovery_email_delivery,
            a.recovery_email_verified_at, a.post_recovery_hold_until
     FROM pokenexus.auth_sessions s
     JOIN pokenexus.accounts a ON a.account_id = s.account_id
     WHERE s.session_id = $1 AND s.account_id = $2
       AND s.bearer_digest = $3
       AND s.revoked_at IS NULL
       AND a.auth_state = 'active'
       AND s.issued_security_epoch = a.security_epoch
       AND s.absolute_expires_at > $4
       AND s.last_activity_at + ($5::bigint * interval '1 millisecond') > $4
       AND s.recent_auth_at IS NOT NULL
       AND s.recent_auth_at + ($6::bigint * interval '1 millisecond') >= $4
       AND (a.post_recovery_hold_until IS NULL OR a.post_recovery_hold_until <= $4)
     FOR UPDATE OF s, a`,
    [
      input.sessionId,
      input.accountId,
      Buffer.from(input.expectedBearerDigest),
      input.now,
      input.inactivityLifetimeMs,
      input.recentAuthLifetimeMs,
    ],
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

async function authorizeCurrentSession(
  client: AuthDbClient,
  input: {
    readonly accountId: string;
    readonly sessionId: string;
    readonly expectedBearerDigest: Uint8Array;
    readonly now: Date;
    readonly inactivityLifetimeMs: number;
  },
): Promise<AccountAuthRecord | null> {
  assertPositivePolicyDuration(input.inactivityLifetimeMs, "inactivityLifetimeMs");
  const result = await client.query<AccountRow>(
    `SELECT a.account_id, a.auth_state, a.security_epoch,
            a.recovery_email_canonical, a.recovery_email_delivery,
            a.recovery_email_verified_at, a.post_recovery_hold_until
     FROM pokenexus.auth_sessions s
     JOIN pokenexus.accounts a ON a.account_id = s.account_id
     WHERE s.session_id = $1 AND s.account_id = $2
       AND s.bearer_digest = $3
       AND s.revoked_at IS NULL
       AND a.auth_state = 'active'
       AND s.issued_security_epoch = a.security_epoch
       AND s.absolute_expires_at > $4
       AND s.last_activity_at + ($5::bigint * interval '1 millisecond') > $4
     FOR UPDATE OF s, a`,
    [
      input.sessionId,
      input.accountId,
      Buffer.from(input.expectedBearerDigest),
      input.now,
      input.inactivityLifetimeMs,
    ],
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

async function supersedeRestrictedFlows(
  client: AuthDbClient,
  accountId: string,
  purpose: RestrictedFlowPurpose,
  now: Date,
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.auth_restricted_flows
     SET superseded_at = $3
     WHERE account_id = $1 AND purpose = $2
       AND revoked_at IS NULL AND completed_at IS NULL AND superseded_at IS NULL`,
    [accountId, purpose, now],
  );
}

async function invalidateAccountChallengesAndFlows(
  client: AuthDbClient,
  accountId: string,
  now: Date,
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.auth_webauthn_challenges
     SET revoked_at = $2
     WHERE account_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL`,
    [accountId, now],
  );
  await client.query(
    `UPDATE pokenexus.auth_restricted_flows
     SET revoked_at = $2
     WHERE account_id = $1
       AND completed_at IS NULL AND revoked_at IS NULL AND superseded_at IS NULL`,
    [accountId, now],
  );
}

async function revokeAllSessionsInternal(
  client: AuthDbClient,
  accountId: string,
  now: Date,
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.auth_sessions
     SET revoked_at = COALESCE(revoked_at, $2), updated_at = $2
     WHERE account_id = $1 AND revoked_at IS NULL`,
    [accountId, now],
  );
}

export async function redeemEmailActionToRestrictedFlow(
  client: AuthDbClient,
  input: {
    readonly bearerDigest: Uint8Array;
    readonly enrollmentAccountId: string;
    readonly flowId: string;
    readonly flowBearerDigest: Uint8Array;
    readonly flowExpiresAt: Date;
    readonly now: Date;
    readonly correlationId?: string | null;
  },
): Promise<RestrictedFlowRecord | null> {
  return withTransaction(client, async (transaction) => {
    const action = await lockEmailActionByDigest(transaction, input.bearerDigest);
    if (!action || action.expiresAt.getTime() <= input.now.getTime()) {
      return null;
    }
    if (action.purpose === "email_change") {
      return null;
    }
    let purpose: RestrictedFlowPurpose;
    let resultingState: "pending_activation" | "recovery_pending";
    let resultingEpoch: bigint;
    let account: AccountAuthRecord;
    if (action.purpose === "enrollment") {
      if (
        action.accountId !== null ||
        action.candidateEmailCanonical === null ||
        action.candidateEmailDelivery === null ||
        action.issuedSecurityEpoch !== null ||
        action.expectedAccountState !== null
      ) {
        return null;
      }
      const inserted = await transaction.query<AccountRow>(
        `INSERT INTO pokenexus.accounts (
          account_id, auth_state, security_epoch,
          recovery_email_canonical, recovery_email_delivery, recovery_email_verified_at,
          created_at, updated_at
        ) VALUES ($1, 'pending_activation', 0, $2, $3, $4, $4, $4)
        ON CONFLICT DO NOTHING
        RETURNING account_id, auth_state, security_epoch, recovery_email_canonical,
                  recovery_email_delivery, recovery_email_verified_at, post_recovery_hold_until`,
        [
          input.enrollmentAccountId,
          action.candidateEmailCanonical,
          action.candidateEmailDelivery,
          input.now,
        ],
      );
      let resolvedRow = inserted.rows[0];
      if (!resolvedRow) {
        const existing = await transaction.query<AccountRow>(
          `SELECT account_id, auth_state, security_epoch, recovery_email_canonical,
                  recovery_email_delivery, recovery_email_verified_at, post_recovery_hold_until
           FROM pokenexus.accounts
           WHERE recovery_email_canonical = $1 AND auth_state <> 'deleted'
           FOR UPDATE`,
          [action.candidateEmailCanonical],
        );
        resolvedRow = existing.rows[0];
      }
      if (!resolvedRow || resolvedRow.auth_state !== "pending_activation") {
        return null;
      }
      account = mapAccount(resolvedRow);
      if (account.recoveryEmailVerifiedAt === null) {
        await transaction.query(
          `UPDATE pokenexus.accounts
           SET recovery_email_verified_at = $2, updated_at = $2, row_version = row_version + 1
           WHERE account_id = $1 AND auth_state = 'pending_activation'`,
          [account.accountId, input.now],
        );
      }
      purpose = "activation";
      resultingState = "pending_activation";
      resultingEpoch = 0n;
    } else {
      if (
        action.accountId === null ||
        action.issuedSecurityEpoch === null ||
        action.expectedAccountState === null
      ) {
        return null;
      }
      const lockedAccount = await lockAccount(transaction, action.accountId);
      if (
        !lockedAccount ||
        lockedAccount.state !== action.expectedAccountState ||
        lockedAccount.securityEpoch !== action.issuedSecurityEpoch
      ) {
        return null;
      }
      account = lockedAccount;
      purpose = "recovery";
      resultingState = "recovery_pending";
      resultingEpoch = account.securityEpoch;
      if (account.state === "active") {
        resultingEpoch = account.securityEpoch + 1n;
        await transaction.query(
          `UPDATE pokenexus.accounts
           SET auth_state = 'recovery_pending', security_epoch = security_epoch + 1,
               recovery_started_at = $2, post_recovery_hold_until = NULL,
               updated_at = $2, row_version = row_version + 1
           WHERE account_id = $1`,
          [account.accountId, input.now],
        );
        await revokeAllSessionsInternal(transaction, account.accountId, input.now);
        await transaction.query(
          `UPDATE pokenexus.webauthn_credentials
           SET credential_status = 'quarantined', quarantined_at = $2
           WHERE account_id = $1 AND credential_status = 'active'`,
          [account.accountId, input.now],
        );
        await invalidateAccountChallengesAndFlows(transaction, account.accountId, input.now);
      } else if (account.state !== "recovery_pending") {
        return null;
      }
    }

    await transaction.query(
      "UPDATE pokenexus.auth_email_actions SET consumed_at = $2 WHERE email_action_id = $1 AND consumed_at IS NULL",
      [action.emailActionId, input.now],
    );
    await supersedeRestrictedFlows(transaction, account.accountId, purpose, input.now);
    await transaction.query(
      `INSERT INTO pokenexus.auth_restricted_flows (
        flow_id, account_id, purpose, bearer_digest, security_epoch,
        expected_account_state, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.flowId,
        account.accountId,
        purpose,
        Buffer.from(input.flowBearerDigest),
        resultingEpoch.toString(),
        resultingState,
        input.flowExpiresAt,
        input.now,
      ],
    );
    await insertSecurityEvent(transaction, {
      accountId: account.accountId,
      eventType: purpose === "recovery" ? "recovery_started" : "enrollment_verified",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return {
      flowId: input.flowId,
      accountId: account.accountId,
      purpose,
      securityEpoch: resultingEpoch,
      expectedAccountState: resultingState,
      expiresAt: input.flowExpiresAt,
    };
  });
}

export async function getRestrictedFlowByDigest(
  client: AuthDbClient,
  bearerDigest: Uint8Array,
  now: Date,
): Promise<RestrictedFlowRecord | null> {
  const result = await client.query<{
    flow_id: string;
    account_id: string;
    purpose: RestrictedFlowPurpose;
    security_epoch: string;
    expected_account_state: "pending_activation" | "recovery_pending";
    expires_at: Date;
  }>(
    `SELECT f.flow_id, f.account_id, f.purpose, f.security_epoch,
            f.expected_account_state, f.expires_at
     FROM pokenexus.auth_restricted_flows f
     JOIN pokenexus.accounts a ON a.account_id = f.account_id
     WHERE f.bearer_digest = $1
       AND f.revoked_at IS NULL AND f.completed_at IS NULL AND f.superseded_at IS NULL
       AND f.expires_at > $2
       AND a.auth_state = f.expected_account_state
       AND a.security_epoch = f.security_epoch`,
    [Buffer.from(bearerDigest), now],
  );
  const row = result.rows[0];
  return row
    ? {
        flowId: row.flow_id,
        accountId: row.account_id,
        purpose: row.purpose,
        securityEpoch: BigInt(row.security_epoch),
        expectedAccountState: row.expected_account_state,
        expiresAt: row.expires_at,
      }
    : null;
}

export async function issueWebAuthnChallenge(
  client: AuthDbClient,
  input: {
    readonly challengeId: string;
    readonly purpose: WebAuthnChallengePurpose;
    readonly challengeDigest: Uint8Array;
    readonly accountId?: string | null;
    readonly flowId?: string | null;
    readonly securityEpoch?: bigint | null;
    readonly expectedAccountState?: AccountAuthState | null;
    readonly expiresAt: Date;
    readonly now: Date;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.auth_webauthn_challenges (
      challenge_id, purpose, challenge_digest, account_id, flow_id,
      security_epoch, expected_account_state, expires_at, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.challengeId,
      input.purpose,
      Buffer.from(input.challengeDigest),
      input.accountId ?? null,
      input.flowId ?? null,
      input.securityEpoch?.toString() ?? null,
      input.expectedAccountState ?? null,
      input.expiresAt,
      input.now,
    ],
  );
}

export async function getWebAuthnChallenge(
  client: AuthDbClient,
  challengeId: string,
  now: Date,
): Promise<WebAuthnChallengeRecord | null> {
  const result = await client.query<{
    challenge_id: string;
    purpose: WebAuthnChallengePurpose;
    challenge_digest: Buffer;
    account_id: string | null;
    flow_id: string | null;
    security_epoch: string | null;
    expected_account_state: AccountAuthState | null;
    expires_at: Date;
  }>(
    `SELECT challenge_id, purpose, challenge_digest, account_id, flow_id,
            security_epoch, expected_account_state, expires_at
     FROM pokenexus.auth_webauthn_challenges
     WHERE challenge_id = $1
       AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $2`,
    [challengeId, now],
  );
  const row = result.rows[0];
  return row
    ? {
        challengeId: row.challenge_id,
        purpose: row.purpose,
        challengeDigest: new Uint8Array(row.challenge_digest),
        accountId: row.account_id,
        flowId: row.flow_id,
        securityEpoch: row.security_epoch === null ? null : BigInt(row.security_epoch),
        expectedAccountState: row.expected_account_state,
        expiresAt: row.expires_at,
      }
    : null;
}

async function consumeChallenge(
  client: AuthDbClient,
  input: {
    readonly challengeId: string;
    readonly purpose: WebAuthnChallengePurpose;
    readonly now: Date;
    readonly accountId?: string | null;
    readonly flowId?: string | null;
    readonly securityEpoch?: bigint | null;
  },
): Promise<boolean> {
  const result = await client.query(
    `UPDATE pokenexus.auth_webauthn_challenges
     SET consumed_at = $2
     WHERE challenge_id = $1 AND purpose = $3
       AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $2
       AND ($4::uuid IS NULL OR account_id = $4)
       AND ($5::uuid IS NULL OR flow_id = $5)
       AND ($6::bigint IS NULL OR security_epoch = $6)`,
    [
      input.challengeId,
      input.now,
      input.purpose,
      input.accountId ?? null,
      input.flowId ?? null,
      input.securityEpoch?.toString() ?? null,
    ],
  );
  return result.rowCount === 1;
}

export async function listCredentialIdsForAccount(
  client: AuthDbClient,
  accountId: string,
): Promise<readonly Uint8Array[]> {
  const result = await client.query<{ credential_id: Buffer }>(
    `SELECT credential_id FROM pokenexus.webauthn_credentials
     WHERE account_id = $1 AND credential_status <> 'revoked'
     ORDER BY created_at, encode(credential_id, 'hex')`,
    [accountId],
  );
  return result.rows.map((row) => new Uint8Array(row.credential_id));
}

export async function findCredentialById(
  client: AuthDbClient,
  credentialId: Uint8Array,
): Promise<CredentialRecord | null> {
  const result = await client.query<CredentialRow>(
    `SELECT credential_id, account_id, user_handle, public_key, sign_count,
            backup_eligible, backed_up, credential_status
     FROM pokenexus.webauthn_credentials
     WHERE credential_id = $1`,
    [Buffer.from(credentialId)],
  );
  return result.rows[0] ? mapCredential(result.rows[0]) : null;
}

async function insertCredential(
  client: AuthDbClient,
  accountId: string,
  credential: NewCredentialRecord,
  now: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.webauthn_credentials (
       credential_id, account_id, user_handle, public_key, sign_count,
       backup_eligible, backed_up, credential_status, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)`,
    [
      Buffer.from(credential.credentialId),
      accountId,
      Buffer.from(credential.userHandle),
      Buffer.from(credential.publicKey),
      credential.signCount,
      credential.backupEligible,
      credential.backedUp,
      now,
    ],
  );
}

async function insertSession(
  client: AuthDbClient,
  accountId: string,
  securityEpoch: bigint,
  session: NewSessionRecord,
  recentAuthAt: Date | null,
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.auth_sessions (
       session_id, account_id, bearer_digest, issued_security_epoch,
       authenticated_at, recent_auth_at, last_activity_at,
       absolute_expires_at, device_label, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $5, $5)`,
    [
      session.sessionId,
      accountId,
      Buffer.from(session.bearerDigest),
      securityEpoch.toString(),
      session.authenticatedAt,
      recentAuthAt,
      session.lastActivityAt,
      session.absoluteExpiresAt,
      session.deviceLabel ?? null,
    ],
  );
}

export async function completeRestrictedRegistration(
  client: AuthDbClient,
  input: {
    readonly flow: RestrictedFlowRecord;
    readonly challengeId: string;
    readonly credential: NewCredentialRecord;
    readonly session: NewSessionRecord;
    readonly now: Date;
    readonly recoveryHoldUntil: Date;
    readonly correlationId?: string | null;
  },
): Promise<boolean> {
  return withTransaction(client, async (transaction) => {
    const account = await lockAccount(transaction, input.flow.accountId);
    if (
      !account ||
      account.state !== input.flow.expectedAccountState ||
      account.securityEpoch !== input.flow.securityEpoch
    ) {
      return false;
    }
    const flowResult = await transaction.query(
      `SELECT 1 FROM pokenexus.auth_restricted_flows
       WHERE flow_id = $1 AND account_id = $2 AND purpose = $3
         AND security_epoch = $4 AND expected_account_state = $5
         AND expires_at > $6 AND revoked_at IS NULL AND completed_at IS NULL AND superseded_at IS NULL
       FOR UPDATE`,
      [
        input.flow.flowId,
        input.flow.accountId,
        input.flow.purpose,
        input.flow.securityEpoch.toString(),
        input.flow.expectedAccountState,
        input.now,
      ],
    );
    if (flowResult.rowCount !== 1) {
      return false;
    }
    const challengeConsumed = await consumeChallenge(transaction, {
      challengeId: input.challengeId,
      purpose: "restricted_registration",
      now: input.now,
      accountId: input.flow.accountId,
      flowId: input.flow.flowId,
      securityEpoch: input.flow.securityEpoch,
    });
    if (!challengeConsumed) {
      return false;
    }

    await insertCredential(transaction, input.flow.accountId, input.credential, input.now);
    if (input.flow.purpose === "activation") {
      await transaction.query(
        `UPDATE pokenexus.accounts
         SET auth_state = 'active', activated_at = COALESCE(activated_at, $2),
             updated_at = $2, row_version = row_version + 1
         WHERE account_id = $1 AND auth_state = 'pending_activation' AND security_epoch = $3`,
        [input.flow.accountId, input.now, input.flow.securityEpoch.toString()],
      );
    } else {
      await transaction.query(
        `UPDATE pokenexus.webauthn_credentials
         SET credential_status = 'revoked', revoked_at = $2
         WHERE account_id = $1 AND credential_status = 'quarantined'`,
        [input.flow.accountId, input.now],
      );
      await transaction.query(
        `UPDATE pokenexus.accounts
         SET auth_state = 'active', recovery_completed_at = $2,
             post_recovery_hold_until = $3, updated_at = $2,
             row_version = row_version + 1
         WHERE account_id = $1 AND auth_state = 'recovery_pending' AND security_epoch = $4`,
        [
          input.flow.accountId,
          input.now,
          input.recoveryHoldUntil,
          input.flow.securityEpoch.toString(),
        ],
      );
    }
    await transaction.query(
      "UPDATE pokenexus.auth_restricted_flows SET completed_at = $2 WHERE flow_id = $1",
      [input.flow.flowId, input.now],
    );
    await transaction.query(
      `UPDATE pokenexus.auth_webauthn_challenges
       SET revoked_at = $2
       WHERE account_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL`,
      [input.flow.accountId, input.now],
    );
    await insertSession(
      transaction,
      input.flow.accountId,
      input.flow.securityEpoch,
      input.session,
      null,
    );
    await insertSecurityEvent(transaction, {
      accountId: input.flow.accountId,
      sessionId: input.session.sessionId,
      eventType: "session_created",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    await insertSecurityEvent(transaction, {
      accountId: input.flow.accountId,
      sessionId: input.session.sessionId,
      eventType: input.flow.purpose === "activation" ? "account_activated" : "recovery_completed",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return true;
  });
}

async function lockActiveCredentialForAccount(
  client: AuthDbClient,
  credentialId: Uint8Array,
  accountId: string,
): Promise<CredentialRecord | null> {
  const result = await client.query<CredentialRow>(
    `SELECT credential_id, account_id, user_handle, public_key, sign_count,
            backup_eligible, backed_up, credential_status
     FROM pokenexus.webauthn_credentials
     WHERE credential_id = $1 AND account_id = $2
     FOR UPDATE`,
    [Buffer.from(credentialId), accountId],
  );
  return result.rows[0] ? mapCredential(result.rows[0]) : null;
}

async function updateCredentialCounter(
  client: AuthDbClient,
  credentialId: Uint8Array,
  observedSignCount: number,
  backedUp: boolean,
  now: Date,
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.webauthn_credentials
     SET sign_count = GREATEST(sign_count, $2), backed_up = $3, last_used_at = $4
     WHERE credential_id = $1`,
    [Buffer.from(credentialId), observedSignCount, backedUp, now],
  );
}

export async function completeSignIn(
  client: AuthDbClient,
  input: {
    readonly challengeId: string;
    readonly credentialId: Uint8Array;
    readonly observedSignCount: number;
    readonly backedUp: boolean;
    readonly session: NewSessionRecord;
    readonly now: Date;
    readonly correlationId?: string | null;
  },
): Promise<{ readonly account: AccountAuthRecord; readonly previousSignCount: bigint } | null> {
  return withTransaction(client, async (transaction) => {
    const selector = await findCredentialById(transaction, input.credentialId);
    if (!selector) {
      return null;
    }
    const account = await lockAccount(transaction, selector.accountId);
    if (!account || account.state !== "active") {
      return null;
    }
    const credential = await lockActiveCredentialForAccount(
      transaction,
      input.credentialId,
      account.accountId,
    );
    if (!credential || credential.status !== "active") {
      return null;
    }
    const consumed = await consumeChallenge(transaction, {
      challengeId: input.challengeId,
      purpose: "sign_in",
      now: input.now,
    });
    if (!consumed) {
      return null;
    }
    await updateCredentialCounter(
      transaction,
      input.credentialId,
      input.observedSignCount,
      input.backedUp,
      input.now,
    );
    await insertSession(transaction, account.accountId, account.securityEpoch, input.session, null);
    await insertSecurityEvent(transaction, {
      accountId: account.accountId,
      sessionId: input.session.sessionId,
      eventType: "session_created",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    await insertSecurityEvent(transaction, {
      accountId: account.accountId,
      sessionId: input.session.sessionId,
      eventType: "authentication_success",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return { account, previousSignCount: credential.signCount };
  });
}

export async function completeReauthentication(
  client: AuthDbClient,
  input: {
    readonly challengeId: string;
    readonly sessionId: string;
    readonly accountId: string;
    readonly expectedBearerDigest: Uint8Array;
    readonly credentialId: Uint8Array;
    readonly observedSignCount: number;
    readonly backedUp: boolean;
    readonly rotatedBearerDigest: Uint8Array;
    readonly absoluteExpiresAt: Date;
    readonly now: Date;
    readonly inactivityLifetimeMs: number;
    readonly correlationId?: string | null;
  },
): Promise<{ readonly previousSignCount: bigint } | null> {
  return withTransaction(client, async (transaction) => {
    const account = await authorizeCurrentSession(transaction, {
      accountId: input.accountId,
      sessionId: input.sessionId,
      expectedBearerDigest: input.expectedBearerDigest,
      now: input.now,
      inactivityLifetimeMs: input.inactivityLifetimeMs,
    });
    if (!account) {
      return null;
    }
    const credential = await lockActiveCredentialForAccount(
      transaction,
      input.credentialId,
      input.accountId,
    );
    if (!credential || credential.status !== "active") {
      return null;
    }
    const consumed = await consumeChallenge(transaction, {
      challengeId: input.challengeId,
      purpose: "reauth",
      now: input.now,
      accountId: input.accountId,
      securityEpoch: account.securityEpoch,
    });
    if (!consumed) {
      return null;
    }
    const sessionResult = await transaction.query(
      `UPDATE pokenexus.auth_sessions
       SET bearer_digest = $3, issued_security_epoch = $4,
           authenticated_at = $5, recent_auth_at = $5, last_activity_at = $5,
           absolute_expires_at = $6, updated_at = $5
       WHERE session_id = $1 AND account_id = $2 AND bearer_digest = $7 AND revoked_at IS NULL
         AND issued_security_epoch = $4
       RETURNING session_id`,
      [
        input.sessionId,
        input.accountId,
        Buffer.from(input.rotatedBearerDigest),
        account.securityEpoch.toString(),
        input.now,
        input.absoluteExpiresAt,
        Buffer.from(input.expectedBearerDigest),
      ],
    );
    if (sessionResult.rowCount !== 1) {
      return null;
    }
    await updateCredentialCounter(
      transaction,
      input.credentialId,
      input.observedSignCount,
      input.backedUp,
      input.now,
    );
    await insertSecurityEvent(transaction, {
      accountId: input.accountId,
      sessionId: input.sessionId,
      eventType: "reauthentication_success",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return { previousSignCount: credential.signCount };
  });
}

export async function addPasskey(
  client: AuthDbClient,
  input: {
    readonly accountId: string;
    readonly authorizingSessionId: string;
    readonly authorizingBearerDigest: Uint8Array;
    readonly challengeId: string;
    readonly credential: NewCredentialRecord;
    readonly now: Date;
    readonly inactivityLifetimeMs: number;
    readonly recentAuthLifetimeMs: number;
    readonly correlationId?: string | null;
  },
): Promise<boolean> {
  return withTransaction(client, async (transaction) => {
    const account = await authorizeSensitiveSession(transaction, {
      accountId: input.accountId,
      sessionId: input.authorizingSessionId,
      expectedBearerDigest: input.authorizingBearerDigest,
      now: input.now,
      inactivityLifetimeMs: input.inactivityLifetimeMs,
      recentAuthLifetimeMs: input.recentAuthLifetimeMs,
    });
    if (!account) {
      return false;
    }
    const consumed = await consumeChallenge(transaction, {
      challengeId: input.challengeId,
      purpose: "add_passkey",
      now: input.now,
      accountId: input.accountId,
      securityEpoch: account.securityEpoch,
    });
    if (!consumed) {
      return false;
    }
    await insertCredential(transaction, input.accountId, input.credential, input.now);
    await insertSecurityEvent(transaction, {
      accountId: input.accountId,
      eventType: "passkey_added",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return true;
  });
}

export async function loadSessionByDigest(
  client: AuthDbClient,
  bearerDigest: Uint8Array,
): Promise<SessionRecord | null> {
  const result = await client.query<{
    session_id: string;
    account_id: string;
    bearer_digest: Buffer;
    issued_security_epoch: string;
    authenticated_at: Date;
    recent_auth_at: Date | null;
    last_activity_at: Date;
    absolute_expires_at: Date;
    revoked_at: Date | null;
    device_label: string | null;
    auth_state: AccountAuthState;
    security_epoch: string;
    post_recovery_hold_until: Date | null;
  }>(
    `SELECT s.session_id, s.account_id, s.bearer_digest, s.issued_security_epoch,
            s.authenticated_at, s.recent_auth_at, s.last_activity_at,
            s.absolute_expires_at, s.revoked_at, s.device_label,
            a.auth_state, a.security_epoch, a.post_recovery_hold_until
     FROM pokenexus.auth_sessions s
     JOIN pokenexus.accounts a ON a.account_id = s.account_id
     WHERE s.bearer_digest = $1`,
    [Buffer.from(bearerDigest)],
  );
  const row = result.rows[0];
  return row
    ? {
        sessionId: row.session_id,
        accountId: row.account_id,
        bearerDigest: new Uint8Array(row.bearer_digest),
        issuedSecurityEpoch: BigInt(row.issued_security_epoch),
        authenticatedAt: row.authenticated_at,
        recentAuthAt: row.recent_auth_at,
        lastActivityAt: row.last_activity_at,
        absoluteExpiresAt: row.absolute_expires_at,
        revokedAt: row.revoked_at,
        deviceLabel: row.device_label,
        accountState: row.auth_state,
        accountSecurityEpoch: BigInt(row.security_epoch),
        postRecoveryHoldUntil: row.post_recovery_hold_until,
      }
    : null;
}

export async function touchSessionActivity(
  client: AuthDbClient,
  sessionId: string,
  accountId: string,
  securityEpoch: bigint,
  expectedBearerDigest: Uint8Array,
  now: Date,
  inactivityLifetimeMs: number,
): Promise<boolean> {
  assertPositivePolicyDuration(inactivityLifetimeMs, "inactivityLifetimeMs");
  const result = await client.query(
    `UPDATE pokenexus.auth_sessions s
     SET last_activity_at = $5, updated_at = $5
     FROM pokenexus.accounts a
     WHERE s.session_id = $1 AND s.account_id = $2
       AND a.account_id = s.account_id
       AND s.revoked_at IS NULL
       AND s.issued_security_epoch = $3 AND a.security_epoch = $3
       AND s.bearer_digest = $4
       AND a.auth_state = 'active'
       AND s.absolute_expires_at > $5
       AND s.last_activity_at + ($6::bigint * interval '1 millisecond') > $5`,
    [
      sessionId,
      accountId,
      securityEpoch.toString(),
      Buffer.from(expectedBearerDigest),
      now,
      inactivityLifetimeMs,
    ],
  );
  return result.rowCount === 1;
}

export async function listSessionsForAccount(
  client: AuthDbClient,
  input: SensitiveSessionAuthorizationInput,
): Promise<readonly Omit<SessionRecord, "bearerDigest" | "accountState" | "accountSecurityEpoch" | "postRecoveryHoldUntil">[]> {
  return withTransaction(client, async (transaction) => {
    const authorized = await authorizeSensitiveSession(transaction, input);
    if (!authorized) {
      return [];
    }
    const result = await transaction.query<{
      session_id: string;
      account_id: string;
      issued_security_epoch: string;
      authenticated_at: Date;
      recent_auth_at: Date | null;
      last_activity_at: Date;
      absolute_expires_at: Date;
      revoked_at: Date | null;
      device_label: string | null;
    }>(
      `SELECT session_id, account_id, issued_security_epoch, authenticated_at,
              recent_auth_at, last_activity_at, absolute_expires_at, revoked_at, device_label
       FROM pokenexus.auth_sessions
       WHERE account_id = $1
       ORDER BY created_at DESC, session_id DESC`,
      [input.accountId],
    );
    return result.rows.map((row) => ({
      sessionId: row.session_id,
      accountId: row.account_id,
      issuedSecurityEpoch: BigInt(row.issued_security_epoch),
      authenticatedAt: row.authenticated_at,
      recentAuthAt: row.recent_auth_at,
      lastActivityAt: row.last_activity_at,
      absoluteExpiresAt: row.absolute_expires_at,
      revokedAt: row.revoked_at,
      deviceLabel: row.device_label,
    }));
  });
}

export async function revokeOneSession(
  client: AuthDbClient,
  input: SensitiveSessionAuthorizationInput & {
    readonly targetSessionId: string;
    readonly correlationId?: string | null;
  },
): Promise<boolean> {
  return withTransaction(client, async (transaction) => {
    const authorized = await authorizeSensitiveSession(transaction, input);
    if (!authorized) {
      return false;
    }
    const result = await transaction.query(
      `UPDATE pokenexus.auth_sessions
       SET revoked_at = COALESCE(revoked_at, $3), updated_at = $3
       WHERE session_id = $1 AND account_id = $2`,
      [input.targetSessionId, input.accountId, input.now],
    );
    if (result.rowCount !== 1) {
      return false;
    }
    await insertSecurityEvent(transaction, {
      accountId: input.accountId,
      sessionId: input.targetSessionId,
      eventType: "session_revoked",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return true;
  });
}

export async function revokeCurrentSession(
  client: AuthDbClient,
  input: {
    readonly accountId: string;
    readonly sessionId: string;
    readonly expectedBearerDigest: Uint8Array;
    readonly now: Date;
    readonly correlationId?: string | null;
  },
): Promise<boolean> {
  return withTransaction(client, async (transaction) => {
    const result = await transaction.query(
      `UPDATE pokenexus.auth_sessions s
       SET revoked_at = COALESCE(s.revoked_at, $3), updated_at = $3
       FROM pokenexus.accounts a
       WHERE s.session_id = $1 AND s.account_id = $2
         AND s.bearer_digest = $4
         AND a.account_id = s.account_id
         AND s.revoked_at IS NULL
         AND a.auth_state = 'active'
         AND s.issued_security_epoch = a.security_epoch
       RETURNING s.session_id`,
      [input.sessionId, input.accountId, input.now, Buffer.from(input.expectedBearerDigest)],
    );
    if (result.rowCount !== 1) {
      return false;
    }
    await insertSecurityEvent(transaction, {
      accountId: input.accountId,
      sessionId: input.sessionId,
      eventType: "session_revoked",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return true;
  });
}

export async function revokeAllSessions(
  client: AuthDbClient,
  input: SensitiveSessionAuthorizationInput & { readonly correlationId?: string | null },
): Promise<bigint | null> {
  return withTransaction(client, async (transaction) => {
    const account = await authorizeSensitiveSession(transaction, input);
    if (!account) {
      return null;
    }
    const nextEpoch = account.securityEpoch + 1n;
    await transaction.query(
      `UPDATE pokenexus.accounts
       SET security_epoch = security_epoch + 1, updated_at = $2, row_version = row_version + 1
       WHERE account_id = $1`,
      [input.accountId, input.now],
    );
    await revokeAllSessionsInternal(transaction, input.accountId, input.now);
    await invalidateAccountChallengesAndFlows(transaction, input.accountId, input.now);
    await insertSecurityEvent(transaction, {
      accountId: input.accountId,
      eventType: "sessions_revoked_all",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return nextEpoch;
  });
}

export async function removePasskey(
  client: AuthDbClient,
  input: {
    readonly accountId: string;
    readonly authorizingSessionId: string;
    readonly authorizingBearerDigest: Uint8Array;
    readonly credentialId: Uint8Array;
    readonly now: Date;
    readonly inactivityLifetimeMs: number;
    readonly recentAuthLifetimeMs: number;
    readonly correlationId?: string | null;
  },
): Promise<boolean> {
  return withTransaction(client, async (transaction) => {
    const account = await authorizeSensitiveSession(transaction, {
      accountId: input.accountId,
      sessionId: input.authorizingSessionId,
      expectedBearerDigest: input.authorizingBearerDigest,
      now: input.now,
      inactivityLifetimeMs: input.inactivityLifetimeMs,
      recentAuthLifetimeMs: input.recentAuthLifetimeMs,
    });
    if (!account) {
      return false;
    }
    const credentials = await transaction.query<{ credential_id: Buffer }>(
      `SELECT credential_id
       FROM pokenexus.webauthn_credentials
       WHERE account_id = $1 AND credential_status = 'active'
       FOR UPDATE`,
      [input.accountId],
    );
    if (credentials.rows.length <= 1) {
      return false;
    }
    const target = credentials.rows.find((row) => row.credential_id.equals(Buffer.from(input.credentialId)));
    if (!target) {
      return false;
    }
    await transaction.query(
      `UPDATE pokenexus.webauthn_credentials
       SET credential_status = 'revoked', revoked_at = $3
       WHERE account_id = $1 AND credential_id = $2 AND credential_status = 'active'`,
      [input.accountId, Buffer.from(input.credentialId), input.now],
    );
    await transaction.query(
      `UPDATE pokenexus.accounts
       SET security_epoch = security_epoch + 1, updated_at = $2, row_version = row_version + 1
       WHERE account_id = $1`,
      [input.accountId, input.now],
    );
    await revokeAllSessionsInternal(transaction, input.accountId, input.now);
    await invalidateAccountChallengesAndFlows(transaction, input.accountId, input.now);
    await insertSecurityEvent(transaction, {
      accountId: input.accountId,
      eventType: "passkey_removed",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return true;
  });
}

export async function replaceRecoveryEmail(
  client: AuthDbClient,
  input: {
    readonly accountId: string;
    readonly authorizingSessionId: string;
    readonly authorizingBearerDigest: Uint8Array;
    readonly bearerDigest: Uint8Array;
    readonly now: Date;
    readonly inactivityLifetimeMs: number;
    readonly recentAuthLifetimeMs: number;
    readonly correlationId?: string | null;
  },
): Promise<{ readonly previousDeliveryEmail: string | null; readonly nextSecurityEpoch: bigint } | null> {
  return withTransaction(client, async (transaction) => {
    const action = await lockEmailActionByDigest(transaction, input.bearerDigest);
    if (
      !action ||
      action.purpose !== "email_change" ||
      action.accountId !== input.accountId ||
      action.expiresAt.getTime() <= input.now.getTime() ||
      action.candidateEmailCanonical === null ||
      action.candidateEmailDelivery === null ||
      action.issuedSecurityEpoch === null
    ) {
      return null;
    }
    const account = await authorizeSensitiveSession(transaction, {
      accountId: input.accountId,
      sessionId: input.authorizingSessionId,
      expectedBearerDigest: input.authorizingBearerDigest,
      now: input.now,
      inactivityLifetimeMs: input.inactivityLifetimeMs,
      recentAuthLifetimeMs: input.recentAuthLifetimeMs,
    });
    if (
      !account ||
      account.state !== "active" ||
      account.securityEpoch !== action.issuedSecurityEpoch ||
      action.expectedAccountState !== "active"
    ) {
      return null;
    }
    const nextEpoch = account.securityEpoch + 1n;
    await transaction.query(
      `UPDATE pokenexus.accounts
       SET recovery_email_canonical = $2, recovery_email_delivery = $3,
           recovery_email_verified_at = $4, security_epoch = security_epoch + 1,
           updated_at = $4, row_version = row_version + 1
       WHERE account_id = $1`,
      [
        input.accountId,
        action.candidateEmailCanonical,
        action.candidateEmailDelivery,
        input.now,
      ],
    );
    await transaction.query(
      "UPDATE pokenexus.auth_email_actions SET consumed_at = $2 WHERE email_action_id = $1",
      [action.emailActionId, input.now],
    );
    await revokeAllSessionsInternal(transaction, input.accountId, input.now);
    await invalidateAccountChallengesAndFlows(transaction, input.accountId, input.now);
    await insertSecurityEvent(transaction, {
      accountId: input.accountId,
      eventType: "recovery_email_changed",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return { previousDeliveryEmail: account.recoveryEmailDelivery, nextSecurityEpoch: nextEpoch };
  });
}

export async function deleteAccountAuthentication(
  client: AuthDbClient,
  input: {
    readonly accountId: string;
    readonly authorizingSessionId: string;
    readonly authorizingBearerDigest: Uint8Array;
    readonly now: Date;
    readonly inactivityLifetimeMs: number;
    readonly recentAuthLifetimeMs: number;
    readonly correlationId?: string | null;
  },
): Promise<{ readonly previousDeliveryEmail: string | null } | null> {
  return withTransaction(client, async (transaction) => {
    const account = await authorizeSensitiveSession(transaction, {
      accountId: input.accountId,
      sessionId: input.authorizingSessionId,
      expectedBearerDigest: input.authorizingBearerDigest,
      now: input.now,
      inactivityLifetimeMs: input.inactivityLifetimeMs,
      recentAuthLifetimeMs: input.recentAuthLifetimeMs,
    });
    if (!account) {
      return null;
    }
    await transaction.query(
      `UPDATE pokenexus.accounts
       SET auth_state = 'deleted', security_epoch = security_epoch + 1,
           recovery_email_canonical = NULL, recovery_email_delivery = NULL,
           recovery_email_verified_at = NULL, deleted_at = $2,
           updated_at = $2, row_version = row_version + 1
       WHERE account_id = $1`,
      [input.accountId, input.now],
    );
    await revokeAllSessionsInternal(transaction, input.accountId, input.now);
    await invalidateAccountChallengesAndFlows(transaction, input.accountId, input.now);
    await transaction.query(
      `UPDATE pokenexus.webauthn_credentials
       SET credential_status = 'revoked', revoked_at = COALESCE(revoked_at, $2)
       WHERE account_id = $1 AND credential_status <> 'revoked'`,
      [input.accountId, input.now],
    );
    await insertSecurityEvent(transaction, {
      accountId: input.accountId,
      eventType: "account_deletion_completed",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return { previousDeliveryEmail: account.recoveryEmailDelivery };
  });
}

export async function requestAccountDeletion(
  client: AuthDbClient,
  input: SensitiveSessionAuthorizationInput & { readonly correlationId?: string | null },
): Promise<AccountAuthRecord | null> {
  return withTransaction(client, async (transaction) => {
    const account = await authorizeSensitiveSession(transaction, input);
    if (!account) {
      return null;
    }
    await insertSecurityEvent(transaction, {
      accountId: input.accountId,
      sessionId: input.sessionId,
      eventType: "account_deletion_requested",
      result: "success",
      correlationId: input.correlationId,
      now: input.now,
    });
    return account;
  });
}

export async function setAccountDisabled(
  client: AuthDbClient,
  accountId: string,
  disabled: boolean,
  now: Date,
): Promise<boolean> {
  return withTransaction(client, async (transaction) => {
    const account = await lockAccount(transaction, accountId);
    if (!account) {
      return false;
    }
    if (disabled) {
      if (account.state !== "active") {
        return false;
      }
      await transaction.query(
        `UPDATE pokenexus.accounts
         SET auth_state = 'disabled', security_epoch = security_epoch + 1,
             disabled_at = $2, updated_at = $2, row_version = row_version + 1
         WHERE account_id = $1`,
        [accountId, now],
      );
      await revokeAllSessionsInternal(transaction, accountId, now);
      await invalidateAccountChallengesAndFlows(transaction, accountId, now);
    } else {
      if (account.state !== "disabled") {
        return false;
      }
      await transaction.query(
        `UPDATE pokenexus.accounts
         SET auth_state = 'active', disabled_at = NULL,
             updated_at = $2, row_version = row_version + 1
         WHERE account_id = $1`,
        [accountId, now],
      );
    }
    await insertSecurityEvent(transaction, {
      accountId,
      eventType: disabled ? "account_disabled" : "account_reenabled",
      result: "success",
      now,
    });
    return true;
  });
}
