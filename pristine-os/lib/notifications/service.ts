import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getNotificationProvider } from "./config";

export const READY_NOTIFICATION_TYPE = "ORDER_READY";

export type NotificationChannel = "SMS" | "EMAIL" | "NONE";

type CustomerContact = {
  id: string;
  firstName: string;
  phone: string;
  email: string | null;
};

// Channel preference: SMS if a usable phone exists, else EMAIL if a usable
// email exists, else NONE. Re-run at every actual attempt (not just once at
// creation) so a customer's current contact info is always what's used —
// never a stale snapshot from whenever the notification intent was created.
export function resolveChannel(
  customer: Pick<CustomerContact, "phone" | "email">
): { channel: NotificationChannel; recipient: string } {
  const phone = customer.phone?.trim();
  if (phone) return { channel: "SMS", recipient: phone };

  const email = customer.email?.trim();
  if (email) return { channel: "EMAIL", recipient: email };

  return { channel: "NONE", recipient: "" };
}

function buildReadyMessage(orderNumber: string, firstName: string): string {
  return `Hi ${firstName}, your order ${orderNumber} is ready for pickup at Pristine Cleaners.`;
}

// Called from inside the SAME Prisma transaction that just wrote an order's
// status to READY (either the atomic transition endpoint or the free-form
// order PATCH). This makes the notification intent durable together with
// the status change — there is no window where an order is READY without a
// corresponding Notification row.
//
// Uses upsert rather than create+catch(P2002): a thrown error here would
// abort the whole enclosing transaction, including the order status write
// we must never roll back. upsert is a single atomic statement that either
// inserts (first time this order ever entered READY) or performs a no-op
// update (repeat/duplicate/racing entry) — it never throws for the
// "already exists" case, so it's safe to call unconditionally.
export async function ensureReadyNotificationIntent(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    orderId: string;
    customer: CustomerContact;
  }
) {
  const { organizationId, orderId, customer } = params;
  const { channel, recipient } = resolveChannel(customer);

  await tx.notification.upsert({
    where: { orderId_type: { orderId, type: READY_NOTIFICATION_TYPE } },
    create: {
      organizationId,
      orderId,
      customerId: customer.id,
      type: READY_NOTIFICATION_TYPE,
      channel,
      recipient,
      status: channel === "NONE" ? "NO_CONTACT_METHOD" : "PENDING",
    },
    // Already exists — an automatic entry into READY never touches an
    // existing notification row. Only explicit Retry/Resend (see
    // attemptNotificationSend below) is allowed to change one.
    update: {},
  });
}

// Performs (or re-performs) the actual provider attempt for one
// Notification row. This is the single function behind:
//   - the automatic post-commit send after an order enters READY
//   - the manual "Send Ready Notification" action
//   - "Retry" on a FAILED notification
//   - explicit "Resend" on an already SENT/SIMULATED notification
//
// `isExplicitResend` distinguishes the automatic caller (which must never
// resend something already handled) from a deliberate human action:
//   - automatic: only proceeds if status is currently PENDING.
//   - explicit:  proceeds regardless of current status.
//
// Concurrency: before touching the provider, this claims the attempt via a
// compare-and-swap on `attempts` (updateMany matching the exact attempts
// value just read). A second caller racing on the same row will find the
// value has already moved and its claim fails — it becomes a silent no-op
// rather than a duplicate provider call. This mirrors the same
// compare-and-swap pattern already used for order status transitions and
// rack assignment elsewhere in this codebase.
export async function attemptNotificationSend(params: {
  organizationId: string;
  notificationId: string;
  isExplicitResend?: boolean;
}) {
  const { organizationId, notificationId, isExplicitResend = false } = params;

  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, organizationId },
    include: {
      order: { select: { id: true, orderNumber: true } },
      customer: { select: { id: true, firstName: true, phone: true, email: true } },
    },
  });

  if (!notification) {
    return { error: "Notification not found" as const };
  }

  if (notification.status !== "PENDING" && !isExplicitResend) {
    // Already handled (SENT/SIMULATED/FAILED/NO_CONTACT_METHOD) and this is
    // an automatic call, not an explicit human retry/resend — no-op.
    return { skipped: true as const, notification };
  }

  // Recipient snapshot is re-resolved from the customer's CURRENT contact
  // info at the moment of this attempt, never assumed from creation time.
  const { channel, recipient } = resolveChannel(notification.customer);

  if (channel === "NONE") {
    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { channel: "NONE", recipient: "", status: "NO_CONTACT_METHOD" },
    });
    return { notification: updated };
  }

  const claim = await prisma.notification.updateMany({
    where: { id: notification.id, attempts: notification.attempts },
    data: { attempts: notification.attempts + 1, channel, recipient },
  });

  if (claim.count === 0) {
    // Lost the race to a concurrent attempt on the same row.
    return { skipped: true as const, notification };
  }

  const { provider, isSimulated } = getNotificationProvider();
  const message = buildReadyMessage(notification.order.orderNumber, notification.customer.firstName);

  let result: { ok: true } | { ok: false; error: string };
  try {
    result = await provider.send({ channel, recipient, message });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const finalStatus = !result.ok ? "FAILED" : isSimulated ? "SIMULATED" : "SENT";

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: finalStatus,
      error: result.ok ? null : result.error,
      sentAt: result.ok ? new Date() : null,
    },
  });

  return { notification: updated };
}
