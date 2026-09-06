export type SendableChannel = "SMS" | "EMAIL";

export type ProviderSendResult = { ok: true } | { ok: false; error: string };

// The one seam a real SMS/email vendor plugs into later. Nothing in the
// order-status or notification business logic needs to change to add one —
// only getNotificationProvider() (see config.ts) needs to start returning a
// different implementation of this interface.
export interface NotificationProvider {
  readonly name: string;
  send(input: {
    channel: SendableChannel;
    recipient: string;
    message: string;
  }): Promise<ProviderSendResult>;
}
