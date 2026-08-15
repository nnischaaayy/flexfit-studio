/**
 * Shared decision logic behind bookings.ts and corporate-bookings.ts.
 *
 * Before this file existed, both routers hand-rolled the same rules
 * (capacity -> waitlist, refund-window math, credit-floor math) against two
 * different credit sources (a personal membership vs a company credit
 * pool). That's how the two behavior asymmetries documented in
 * ARCHITECTURE.md §2.1 happened: the rules drifted apart because there was
 * nowhere neutral for them to live. This module is that place.
 *
 * Both intentional differences (the 12h vs 24h cancellation window, the
 * "unlimited" concept that only applies to personal memberships) and the
 * two asymmetries are preserved exactly, now as explicit parameters/named
 * functions instead of silent duplication. See ARCHITECTURE.md §2.1 and §4.
 */

export function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

export interface CreditCheck {
  ok: boolean;
  unlimited: boolean;
}

/**
 * Personal memberships treat balances >= unlimitedThreshold as
 * never-decrementing. Corporate pools have no such concept — callers on
 * that path omit unlimitedThreshold.
 */
export function checkCredit(
  available: number,
  cost: number,
  unlimitedThreshold?: number,
): CreditCheck {
  const unlimited = unlimitedThreshold !== undefined && available >= unlimitedThreshold;
  return { ok: unlimited || available >= cost, unlimited };
}

export function nextBookingStatus(
  currentBookedCount: number,
  capacity: number,
): "booked" | "waitlisted" {
  return currentBookedCount >= capacity ? "waitlisted" : "booked";
}

export function isRefundable(
  startsAt: string,
  freeCancellationHours: number,
  creditsUsed: number,
  now = new Date(),
): boolean {
  return hoursUntil(startsAt, now) >= freeCancellationHours && creditsUsed > 0;
}

/**
 * Personal-membership waitlist-promotion path: always deducts the class
 * cost, floored at 0, regardless of whether the member actually has enough
 * credit. This is the "unguarded" half of the §2.1 asymmetry — preserved
 * as-is, not fixed, since fixing it is a judgment call that needs its own
 * test coverage and sign-off first.
 */
export function deductFloored(balance: number, cost: number): number {
  return Math.max(0, balance - cost);
}

/**
 * Corporate-pool waitlist-promotion path: only deducts if the pool can
 * cover the cost; otherwise the balance is left untouched and the
 * promotion still goes through with no debit. This is the "guarded" half
 * of the §2.1 asymmetry — preserved as-is, not fixed, for the same reason.
 * Returns null to mean "do not write a new balance."
 */
export function deductGuarded(balance: number, cost: number): number | null {
  return balance >= cost ? balance - cost : null;
}
