export const PAYMENT_METHODS = ["CASH", "CARD", "OTHER"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export type PaymentSummary = {
  amountDue: number;
  amountPaid: number;
  balanceRemaining: number;
  paymentStatus: PaymentStatus;
};

// Floating-point amounts (dollars) can drift by fractions of a cent
// through repeated arithmetic — round before comparing or displaying.
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/*
 * Payments are an immutable ledger — the summary is always
 * recomputed from the order's current total and its payment
 * rows, never stored. If order.total changes later, existing
 * Payment records are untouched; only this derived summary
 * shifts.
 */
export function summarizePayments(
  orderTotal: number,
  payments: { amount: number }[]
): PaymentSummary {
  const amountDue = round2(orderTotal);

  const amountPaid = round2(
    payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  );

  const balanceRemaining = Math.max(0, round2(amountDue - amountPaid));

  const paymentStatus: PaymentStatus =
    balanceRemaining <= 0
      ? "PAID"
      : amountPaid > 0
        ? "PARTIAL"
        : "UNPAID";

  return {
    amountDue,
    amountPaid,
    balanceRemaining,
    paymentStatus,
  };
}
