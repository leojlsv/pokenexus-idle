export type EmailActionKind = "enrollment" | "recovery" | "email_change";
export type SecurityNotificationKind =
  | "passkey_added"
  | "passkey_removed"
  | "recovery_started"
  | "recovery_completed"
  | "recovery_email_changed"
  | "account_deletion_requested"
  | "account_deletion_completed";

export interface EmailActionSender {
  sendAction(input: {
    readonly kind: EmailActionKind;
    readonly recipient: string;
    readonly secret: string;
  }): Promise<void>;
  sendSecurityNotification(input: {
    readonly kind: SecurityNotificationKind;
    readonly recipient: string;
  }): Promise<void>;
}

export function createUnavailableEmailActionSender(): EmailActionSender {
  const unavailable = async (): Promise<void> => {
    throw new Error("EmailActionSender is not configured for this deployment");
  };
  return {
    sendAction: unavailable,
    sendSecurityNotification: unavailable,
  };
}
