import { describe, it, expect } from "vitest";
import {
  checkCredit,
  nextBookingStatus,
  isRefundable,
  deductFloored,
  deductGuarded,
  hoursUntil,
} from "@/server/services/booking-engine";

describe("hoursUntil", () => {
  it("is positive for a future time and negative for a past time", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(hoursUntil("2026-01-01T12:00:00Z", now)).toBeCloseTo(12);
    expect(hoursUntil("2025-12-31T12:00:00Z", now)).toBeCloseTo(-12);
  });
});

describe("checkCredit", () => {
  it("is insufficient below cost with no unlimited threshold", () => {
    expect(checkCredit(2, 3)).toEqual({ ok: false, unlimited: false });
  });

  it("is sufficient at or above cost", () => {
    expect(checkCredit(3, 3)).toEqual({ ok: true, unlimited: false });
  });

  it("treats balances at/above the unlimited threshold as always ok", () => {
    expect(checkCredit(999, 50, 999)).toEqual({ ok: true, unlimited: true });
  });

  it("does not treat a balance below the unlimited threshold as unlimited", () => {
    expect(checkCredit(998, 50, 999)).toEqual({ ok: true, unlimited: false });
  });
});

describe("nextBookingStatus", () => {
  it("books when under capacity", () => {
    expect(nextBookingStatus(0, 1)).toBe("booked");
  });

  it("waitlists at or over capacity", () => {
    expect(nextBookingStatus(1, 1)).toBe("waitlisted");
    expect(nextBookingStatus(2, 1)).toBe("waitlisted");
  });
});

describe("isRefundable", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("refunds when outside the free-cancellation window and credit was spent", () => {
    expect(isRefundable("2026-01-02T00:00:00Z", 12, 1, now)).toBe(true);
  });

  it("does not refund inside the window", () => {
    expect(isRefundable("2026-01-01T06:00:00Z", 12, 1, now)).toBe(false);
  });

  it("does not refund when no credit was spent, even outside the window", () => {
    expect(isRefundable("2026-01-02T00:00:00Z", 12, 0, now)).toBe(false);
  });
});

describe("deductFloored (personal — unguarded, §2.1)", () => {
  it("deducts normally when there's enough balance", () => {
    expect(deductFloored(5, 3)).toBe(2);
  });

  it("floors at 0 instead of going negative when balance is insufficient", () => {
    expect(deductFloored(1, 3)).toBe(0);
  });
});

describe("deductGuarded (corporate — guarded, §2.1)", () => {
  it("deducts normally when the pool can cover the cost", () => {
    expect(deductGuarded(5, 3)).toBe(2);
  });

  it("returns null (skip the write) instead of flooring when the pool can't cover it", () => {
    expect(deductGuarded(1, 3)).toBeNull();
  });
});
