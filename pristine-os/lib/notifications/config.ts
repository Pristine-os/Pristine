import type { NotificationProvider } from "./provider";
import { devNotificationProvider } from "./devProvider";

// No real SMS/email vendor is configured for this project yet (no Twilio/
// SendGrid/etc. dependency, no provider credentials in .env). This factory
// is the single place a future real provider gets wired in — everything
// else in lib/notifications and every caller of it only depends on the
// NotificationProvider interface, never on a concrete vendor.
export function getNotificationProvider(): {
  provider: NotificationProvider;
  isSimulated: boolean;
} {
  return { provider: devNotificationProvider, isSimulated: true };
}
