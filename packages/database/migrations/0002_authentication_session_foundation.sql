ALTER TABLE pokenexus.accounts
  ADD COLUMN auth_state text NOT NULL DEFAULT 'pending_activation',
  ADD COLUMN security_epoch bigint NOT NULL DEFAULT 0,
  ADD COLUMN recovery_email_canonical text,
  ADD COLUMN recovery_email_delivery text,
  ADD COLUMN recovery_email_verified_at timestamptz,
  ADD COLUMN post_recovery_hold_until timestamptz,
  ADD COLUMN activated_at timestamptz,
  ADD COLUMN disabled_at timestamptz,
  ADD COLUMN recovery_started_at timestamptz,
  ADD COLUMN recovery_completed_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD CONSTRAINT accounts_auth_state_check
    CHECK (auth_state IN ('pending_activation', 'active', 'disabled', 'recovery_pending', 'deleted')),
  ADD CONSTRAINT accounts_security_epoch_check CHECK (security_epoch >= 0),
  ADD CONSTRAINT accounts_recovery_email_pair_check
    CHECK ((recovery_email_canonical IS NULL) = (recovery_email_delivery IS NULL)),
  ADD CONSTRAINT accounts_recovery_email_verified_check
    CHECK ((recovery_email_canonical IS NULL) = (recovery_email_verified_at IS NULL)),
  ADD CONSTRAINT accounts_usable_state_verified_email_check
    CHECK (
      auth_state NOT IN ('active', 'disabled', 'recovery_pending')
      OR (recovery_email_canonical IS NOT NULL AND recovery_email_verified_at IS NOT NULL)
    ),
  ADD CONSTRAINT accounts_recovery_email_length_check
    CHECK (
      (recovery_email_canonical IS NULL OR char_length(recovery_email_canonical) BETWEEN 3 AND 320)
      AND (recovery_email_delivery IS NULL OR char_length(recovery_email_delivery) BETWEEN 3 AND 320)
    ),
  ADD CONSTRAINT accounts_deleted_recovery_email_release_check
    CHECK (
      auth_state <> 'deleted'
      OR (
        recovery_email_canonical IS NULL
        AND recovery_email_delivery IS NULL
        AND recovery_email_verified_at IS NULL
      )
    );

CREATE UNIQUE INDEX accounts_recovery_email_canonical_active_uidx
  ON pokenexus.accounts (recovery_email_canonical)
  WHERE recovery_email_canonical IS NOT NULL AND auth_state <> 'deleted';

CREATE TABLE pokenexus.webauthn_credentials (
  credential_id bytea PRIMARY KEY
    CHECK (octet_length(credential_id) BETWEEN 1 AND 1024),
  account_id uuid NOT NULL REFERENCES pokenexus.accounts(account_id),
  user_handle bytea NOT NULL CHECK (octet_length(user_handle) = 16),
  public_key bytea NOT NULL CHECK (octet_length(public_key) BETWEEN 1 AND 8192),
  sign_count bigint NOT NULL DEFAULT 0 CHECK (sign_count BETWEEN 0 AND 4294967295),
  backup_eligible boolean NOT NULL,
  backed_up boolean NOT NULL,
  credential_status text NOT NULL DEFAULT 'active'
    CHECK (credential_status IN ('active', 'quarantined', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at timestamptz,
  quarantined_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT webauthn_credentials_status_timestamps_check CHECK (
    (credential_status <> 'quarantined' OR quarantined_at IS NOT NULL)
    AND (credential_status <> 'revoked' OR revoked_at IS NOT NULL)
  ),
  CONSTRAINT webauthn_credentials_user_handle_binding_check
    CHECK (user_handle = uuid_send(account_id))
);

CREATE INDEX webauthn_credentials_account_idx
  ON pokenexus.webauthn_credentials (account_id, credential_status);

CREATE TABLE pokenexus.auth_sessions (
  session_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES pokenexus.accounts(account_id),
  bearer_digest bytea NOT NULL UNIQUE CHECK (octet_length(bearer_digest) = 32),
  issued_security_epoch bigint NOT NULL CHECK (issued_security_epoch >= 0),
  authenticated_at timestamptz NOT NULL,
  recent_auth_at timestamptz,
  last_activity_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  device_label text CHECK (device_label IS NULL OR char_length(device_label) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auth_sessions_expiry_check CHECK (
    absolute_expires_at > authenticated_at
    AND absolute_expires_at <= authenticated_at + interval '30 days'
  ),
  CONSTRAINT auth_sessions_activity_check CHECK (last_activity_at >= created_at),
  CONSTRAINT auth_sessions_recent_auth_check CHECK (
    recent_auth_at IS NULL OR recent_auth_at >= authenticated_at
  )
);

CREATE INDEX auth_sessions_account_idx
  ON pokenexus.auth_sessions (account_id, revoked_at, absolute_expires_at);

CREATE TABLE pokenexus.auth_email_actions (
  email_action_id uuid PRIMARY KEY,
  account_id uuid REFERENCES pokenexus.accounts(account_id),
  purpose text NOT NULL CHECK (purpose IN ('enrollment', 'recovery', 'email_change')),
  bearer_digest bytea NOT NULL UNIQUE CHECK (octet_length(bearer_digest) = 32),
  target_key bytea NOT NULL CHECK (octet_length(target_key) = 32),
  candidate_email_canonical text,
  candidate_email_delivery text,
  issued_security_epoch bigint CHECK (issued_security_epoch IS NULL OR issued_security_epoch >= 0),
  expected_account_state text
    CHECK (expected_account_state IS NULL OR expected_account_state IN ('active', 'recovery_pending')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auth_email_actions_expiry_check CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '15 minutes'
  ),
  CONSTRAINT auth_email_actions_candidate_pair_check CHECK (
    (candidate_email_canonical IS NULL) = (candidate_email_delivery IS NULL)
  ),
  CONSTRAINT auth_email_actions_candidate_length_check CHECK (
    (candidate_email_canonical IS NULL OR char_length(candidate_email_canonical) BETWEEN 3 AND 320)
    AND (candidate_email_delivery IS NULL OR char_length(candidate_email_delivery) BETWEEN 3 AND 320)
  ),
  CONSTRAINT auth_email_actions_purpose_binding_check CHECK (
    (
      purpose = 'enrollment'
      AND account_id IS NULL
      AND candidate_email_canonical IS NOT NULL
      AND candidate_email_delivery IS NOT NULL
      AND issued_security_epoch IS NULL
      AND expected_account_state IS NULL
    )
    OR (
      purpose = 'recovery'
      AND account_id IS NOT NULL
      AND candidate_email_canonical IS NULL
      AND candidate_email_delivery IS NULL
      AND issued_security_epoch IS NOT NULL
      AND expected_account_state IN ('active', 'recovery_pending')
    )
    OR (
      purpose = 'email_change'
      AND account_id IS NOT NULL
      AND candidate_email_canonical IS NOT NULL
      AND candidate_email_delivery IS NOT NULL
      AND issued_security_epoch IS NOT NULL
      AND expected_account_state = 'active'
    )
  )
);

CREATE INDEX auth_email_actions_account_purpose_idx
  ON pokenexus.auth_email_actions (account_id, purpose, created_at DESC);

CREATE UNIQUE INDEX auth_email_actions_current_enrollment_idx
  ON pokenexus.auth_email_actions (target_key, purpose)
  WHERE purpose = 'enrollment' AND consumed_at IS NULL AND superseded_at IS NULL;

CREATE UNIQUE INDEX auth_email_actions_current_account_purpose_idx
  ON pokenexus.auth_email_actions (account_id, purpose)
  WHERE account_id IS NOT NULL AND consumed_at IS NULL AND superseded_at IS NULL;

CREATE TABLE pokenexus.auth_restricted_flows (
  flow_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES pokenexus.accounts(account_id),
  purpose text NOT NULL CHECK (purpose IN ('activation', 'recovery')),
  bearer_digest bytea NOT NULL UNIQUE CHECK (octet_length(bearer_digest) = 32),
  security_epoch bigint NOT NULL CHECK (security_epoch >= 0),
  expected_account_state text NOT NULL
    CHECK (expected_account_state IN ('pending_activation', 'recovery_pending')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  completed_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auth_restricted_flows_expiry_check CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '15 minutes'
  )
);

CREATE UNIQUE INDEX auth_restricted_flows_one_current_idx
  ON pokenexus.auth_restricted_flows (account_id, purpose)
  WHERE revoked_at IS NULL AND completed_at IS NULL AND superseded_at IS NULL;

CREATE TABLE pokenexus.auth_webauthn_challenges (
  challenge_id uuid PRIMARY KEY,
  purpose text NOT NULL CHECK (purpose IN ('sign_in', 'reauth', 'restricted_registration', 'add_passkey')),
  challenge_digest bytea NOT NULL UNIQUE CHECK (octet_length(challenge_digest) = 32),
  account_id uuid REFERENCES pokenexus.accounts(account_id),
  flow_id uuid REFERENCES pokenexus.auth_restricted_flows(flow_id),
  security_epoch bigint CHECK (security_epoch IS NULL OR security_epoch >= 0),
  expected_account_state text
    CHECK (expected_account_state IS NULL OR expected_account_state IN ('pending_activation', 'active', 'recovery_pending')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auth_webauthn_challenges_expiry_check CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '5 minutes'
  ),
  CONSTRAINT auth_webauthn_challenges_binding_check CHECK (
    (purpose = 'sign_in' AND account_id IS NULL AND flow_id IS NULL AND security_epoch IS NULL AND expected_account_state IS NULL)
    OR (purpose IN ('reauth', 'add_passkey') AND account_id IS NOT NULL AND flow_id IS NULL AND security_epoch IS NOT NULL AND expected_account_state = 'active')
    OR (purpose = 'restricted_registration' AND account_id IS NOT NULL AND flow_id IS NOT NULL AND security_epoch IS NOT NULL AND expected_account_state IN ('pending_activation', 'recovery_pending'))
  )
);

CREATE INDEX auth_webauthn_challenges_account_idx
  ON pokenexus.auth_webauthn_challenges (account_id, purpose, created_at DESC);

CREATE TABLE pokenexus.auth_issuance_limits (
  target_key bytea NOT NULL CHECK (octet_length(target_key) = 32),
  action_family text NOT NULL CHECK (
    action_family IN (
      'enrollment',
      'recovery',
      'email_change',
      'sign_in_options_network',
      'sign_in_verify_network',
      'sign_in_verify_credential'
    )
  ),
  backoff_level smallint NOT NULL DEFAULT 0 CHECK (backoff_level BETWEEN 0 AND 6),
  next_allowed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (target_key, action_family)
);

CREATE TABLE pokenexus.auth_security_events (
  event_id uuid PRIMARY KEY,
  account_id uuid REFERENCES pokenexus.accounts(account_id),
  session_id uuid,
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 64),
  result text NOT NULL CHECK (char_length(result) BETWEEN 1 AND 32),
  reason_code text CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 1 AND 64),
  correlation_id text CHECK (correlation_id IS NULL OR char_length(correlation_id) BETWEEN 1 AND 128),
  target_key bytea CHECK (target_key IS NULL OR octet_length(target_key) = 32),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX auth_security_events_account_time_idx
  ON pokenexus.auth_security_events (account_id, created_at DESC)
  WHERE account_id IS NOT NULL;
