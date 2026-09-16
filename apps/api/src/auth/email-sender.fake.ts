import type {
  EmailActionKind,
  EmailActionSender,
  SecurityNotificationKind,
} from "./email-sender";

export class FakeEmailActionSender implements EmailActionSender {
  readonly actions: Array<{ kind: EmailActionKind; recipient: string; secret: string }> = [];
  readonly notifications: Array<{ kind: SecurityNotificationKind; recipient: string }> = [];
  failActions = false;
  failNotifications = false;

  async sendAction(input: {
    readonly kind: EmailActionKind;
    readonly recipient: string;
    readonly secret: string;
  }): Promise<void> {
    if (this.failActions) {
      throw new Error("fake action delivery failure");
    }
    this.actions.push({ ...input });
  }

  async sendSecurityNotification(input: {
    readonly kind: SecurityNotificationKind;
    readonly recipient: string;
  }): Promise<void> {
    if (this.failNotifications) {
      throw new Error("fake notification delivery failure");
    }
    this.notifications.push({ ...input });
  }
}
