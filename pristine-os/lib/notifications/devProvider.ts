import type { NotificationProvider } from "./provider";

// Development/mock provider. It never contacts a real SMS or email vendor —
// it only logs what would have been sent, and always reports success so the
// rest of the notification flow (status tracking, retry/resend, UI) can be
// exercised without a paid provider configured. Callers must record its
// result as SIMULATED, never SENT — this provider has no way to confirm an
// external message was actually delivered, because none was sent.
export const devNotificationProvider: NotificationProvider = {
  name: "dev",

  async send({ channel, recipient, message }) {
    console.log(`[DEV NOTIFICATION — NOT DELIVERED] ${channel} -> ${recipient}: ${message}`);
    return { ok: true };
  },
};
