import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { callerAs, db } from "./helpers";
import { createUser, createClass, createMembership } from "./fixtures";
import { bookings, reschedules, type User } from "@/db/schema";

/**
 * Characterization tests for reschedules.ts, written before extracting the
 * shared validation logic duplicated between `reschedule` (throws) and
 * `validateReschedule` (returns {valid, reason}) — see ARCHITECTURE.md
 * §2.6. Every rule here is asserted against BOTH endpoints since they're
 * supposed to agree; that agreement is exactly what a shared function
 * makes structurally guaranteed instead of accidental.
 */

async function bookedClassAndBooking(
  member: User,
  opts: { name?: string; startsInHours?: number; capacity?: number } = {},
) {
  const cls = await createClass({
    name: opts.name,
    capacity: opts.capacity ?? 2,
    startsInHours: opts.startsInHours ?? 48,
  });
  await createMembership(member.id, { creditsRemaining: 5 });
  const booking = await callerAs(member).bookings.book({ classId: cls.id });
  return { cls, booking };
}

describe("reschedules — fromBookingId not found", () => {
  it("mutation throws NOT_FOUND, query returns valid:false", async () => {
    const member = await createUser("member");
    const cls = await createClass();

    await expect(
      callerAs(member).reschedules.reschedule({ fromBookingId: 999999, toClassId: cls.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const result = await callerAs(member).reschedules.validateReschedule({
      fromBookingId: 999999,
      toClassId: cls.id,
    });
    expect(result).toEqual({ valid: false, reason: "Booking not found." });
  });
});

describe("reschedules — ownership", () => {
  it("rejects rescheduling someone else's booking on both endpoints", async () => {
    const owner = await createUser("member");
    const stranger = await createUser("member");
    const { cls: original, booking } = await bookedClassAndBooking(owner);
    const target = await createClass({ name: original.name });

    await expect(
      callerAs(stranger).reschedules.reschedule({ fromBookingId: booking.id, toClassId: target.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const result = await callerAs(stranger).reschedules.validateReschedule({
      fromBookingId: booking.id,
      toClassId: target.id,
    });
    expect(result).toEqual({ valid: false, reason: "You cannot reschedule this booking." });
  });
});

describe("reschedules — free-reschedule window (4h, more generous than cancellation)", () => {
  it("rejects rescheduling within 4h of the original class on both endpoints", async () => {
    const member = await createUser("member");
    const { booking } = await bookedClassAndBooking(member, { startsInHours: 2 });
    // The time-window check runs before the same-name check, so the target
    // doesn't need to match the original's name for this test.
    const target = await createClass({ startsInHours: 48 });

    await expect(
      callerAs(member).reschedules.reschedule({ fromBookingId: booking.id, toClassId: target.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const result = await callerAs(member).reschedules.validateReschedule({
      fromBookingId: booking.id,
      toClassId: target.id,
    });
    expect(result.valid).toBe(false);
  });
});

describe("reschedules — target class must share the original's name", () => {
  it("rejects a differently-named target class on both endpoints", async () => {
    const member = await createUser("member");
    const { booking } = await bookedClassAndBooking(member, { name: "Sunrise Yoga" });
    const target = await createClass({ name: "HIIT Circuit" });

    await expect(
      callerAs(member).reschedules.reschedule({ fromBookingId: booking.id, toClassId: target.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const result = await callerAs(member).reschedules.validateReschedule({
      fromBookingId: booking.id,
      toClassId: target.id,
    });
    expect(result).toEqual({
      valid: false,
      reason: "You can only reschedule to a class with the same name.",
    });
  });
});

describe("reschedules — successful reschedule", () => {
  it("creates a new booking, keeps the same credits used, and cancels the original", async () => {
    const member = await createUser("member");
    const { booking } = await bookedClassAndBooking(member, { name: "Spin 45" });
    const target = await createClass({ name: "Spin 45", capacity: 2, startsInHours: 72 });

    const result = await callerAs(member).reschedules.reschedule({
      fromBookingId: booking.id,
      toClassId: target.id,
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("booked");
    expect(result.newBooking.creditsUsed).toBe(booking.creditsUsed);
    expect(result.newBooking.classId).toBe(target.id);

    const originalRow = await db.select().from(bookings).where(eq(bookings.id, booking.id)).get();
    expect(originalRow?.status).toBe("cancelled");

    const historyRow = await db
      .select()
      .from(reschedules)
      .where(eq(reschedules.fromBookingId, booking.id))
      .get();
    expect(historyRow?.toBookingId).toBe(result.newBooking.id);
  });

  it("waitlists the new booking when the target class is full, matching validateReschedule's targetIsFull", async () => {
    const member = await createUser("member");
    const filler = await createUser("member");
    const { booking } = await bookedClassAndBooking(member, { name: "Boxing Fundamentals" });
    const target = await createClass({ name: "Boxing Fundamentals", capacity: 1, startsInHours: 72 });
    await createMembership(filler.id, { creditsRemaining: 5 });
    await callerAs(filler).bookings.book({ classId: target.id }); // fills capacity 1

    const preCheck = await callerAs(member).reschedules.validateReschedule({
      fromBookingId: booking.id,
      toClassId: target.id,
    });
    expect(preCheck).toMatchObject({ valid: true, targetIsFull: true });

    const result = await callerAs(member).reschedules.reschedule({
      fromBookingId: booking.id,
      toClassId: target.id,
    });
    expect(result.newStatus).toBe("waitlisted");
  });
});
