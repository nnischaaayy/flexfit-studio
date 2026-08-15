import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { callerAs, db } from "./helpers";
import { createUser, createClass, createMembership } from "./fixtures";
import { memberships, checkins } from "@/db/schema";

async function membershipFor(userId: number) {
  return db.select().from(memberships).where(eq(memberships.userId, userId)).get();
}

async function checkinFor(userId: number) {
  return db.select().from(checkins).where(eq(checkins.userId, userId)).get();
}

/**
 * Characterization tests: pin down the CURRENT behavior of bookings.ts
 * before any refactor, including two documented asymmetries versus
 * corporate-bookings.ts (see ARCHITECTURE.md §2.1). These tests must stay
 * green through the booking-engine extraction.
 */
describe("bookings.book", () => {
  it("books and deducts one credit when the class has room", async () => {
    const member = await createUser("member");
    const cls = await createClass({ capacity: 2, creditCost: 1 });
    await createMembership(member.id, { creditsRemaining: 5 });

    const result = await callerAs(member).bookings.book({ classId: cls.id });

    expect(result.status).toBe("booked");
    expect(result.creditsUsed).toBe(1);

    const ms = await membershipFor(member.id);
    expect(ms?.creditsRemaining).toBe(4);
  });

  it("waitlists without deducting credit when the class is full", async () => {
    const member1 = await createUser("member");
    const member2 = await createUser("member");
    const cls = await createClass({ capacity: 1, creditCost: 1 });
    await createMembership(member1.id, { creditsRemaining: 5 });
    await createMembership(member2.id, { creditsRemaining: 5 });

    await callerAs(member1).bookings.book({ classId: cls.id });
    const result = await callerAs(member2).bookings.book({ classId: cls.id });

    expect(result.status).toBe("waitlisted");
    expect(result.creditsUsed).toBe(0);

    const ms = await membershipFor(member2.id);
    expect(ms?.creditsRemaining).toBe(5);
  });

  it("does not decrement credits for unlimited (999) plans", async () => {
    const member = await createUser("member");
    const cls = await createClass({ capacity: 2, creditCost: 1 });
    await createMembership(member.id, { creditsRemaining: 999 });

    await callerAs(member).bookings.book({ classId: cls.id });

    const ms = await membershipFor(member.id);
    expect(ms?.creditsRemaining).toBe(999);
  });

  it("rejects booking without an active membership", async () => {
    const member = await createUser("member");
    const cls = await createClass();

    await expect(callerAs(member).bookings.book({ classId: cls.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
  });

  it("rejects booking with insufficient credits", async () => {
    const member = await createUser("member");
    const cls = await createClass({ creditCost: 3 });
    await createMembership(member.id, { creditsRemaining: 2 });

    await expect(callerAs(member).bookings.book({ classId: cls.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects a duplicate booking for the same class", async () => {
    const member = await createUser("member");
    const cls = await createClass({ capacity: 2 });
    await createMembership(member.id, { creditsRemaining: 5 });

    await callerAs(member).bookings.book({ classId: cls.id });

    await expect(callerAs(member).bookings.book({ classId: cls.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rejects booking a cancelled class", async () => {
    const member = await createUser("member");
    const cls = await createClass({ cancelled: true });
    await createMembership(member.id, { creditsRemaining: 5 });

    await expect(callerAs(member).bookings.book({ classId: cls.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects booking a class that has already started", async () => {
    const member = await createUser("member");
    const cls = await createClass({ startsInHours: -1 });
    await createMembership(member.id, { creditsRemaining: 5 });

    await expect(callerAs(member).bookings.book({ classId: cls.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("bookings.cancel — free-cancellation window (12h)", () => {
  it("refunds credit when cancelling >= 12h before class start", async () => {
    const member = await createUser("member");
    const cls = await createClass({ startsInHours: 48, creditCost: 2 });
    await createMembership(member.id, { creditsRemaining: 5 });

    const booking = await callerAs(member).bookings.book({ classId: cls.id });
    const result = await callerAs(member).bookings.cancel({ bookingId: booking.id });

    expect(result.refunded).toBe(true);
    const ms = await membershipFor(member.id);
    expect(ms?.creditsRemaining).toBe(5); // back to original
  });

  it("does NOT refund credit when cancelling < 12h before class start", async () => {
    const member = await createUser("member");
    const cls = await createClass({ startsInHours: 6, creditCost: 2 });
    await createMembership(member.id, { creditsRemaining: 5 });

    const booking = await callerAs(member).bookings.book({ classId: cls.id });
    const result = await callerAs(member).bookings.cancel({ bookingId: booking.id });

    expect(result.refunded).toBe(false);
    const ms = await membershipFor(member.id);
    expect(ms?.creditsRemaining).toBe(3); // credit forfeited
  });
});

describe("bookings — waitlist promotion (documented asymmetry, §2.1)", () => {
  it("promotes the longest-waiting member and deducts credit even below zero (unguarded, floored at 0)", async () => {
    const member1 = await createUser("member");
    const member2 = await createUser("member");
    const cls = await createClass({ capacity: 1, creditCost: 3, startsInHours: 48 });
    await createMembership(member1.id, { creditsRemaining: 5 });
    // book() checks credit sufficiency before capacity, so member2 needs
    // enough credit just to join the waitlist in the first place.
    const ms2Row = await createMembership(member2.id, { creditsRemaining: 3 });

    const b1 = await callerAs(member1).bookings.book({ classId: cls.id });
    await callerAs(member2).bookings.book({ classId: cls.id }); // capacity 1 already full -> waitlisted

    // Simulate member2's balance dropping below the class cost before their
    // turn comes up (e.g. spent on another class in the meantime).
    await db.update(memberships).set({ creditsRemaining: 1 }).where(eq(memberships.id, ms2Row.id));

    await callerAs(member1).bookings.cancel({ bookingId: b1.id });

    const ms2 = await membershipFor(member2.id);
    // Current behavior: promotion always deducts (3) and floors at 0 —
    // never blocked by insufficient credit, unlike the corporate path.
    expect(ms2?.creditsRemaining).toBe(0);
  });
});

describe("bookings.markAttended — checkin linkage (documented asymmetry, §2.1)", () => {
  it("links the checkin to the booking id", async () => {
    const member = await createUser("member");
    const staff = await createUser("admin");
    const cls = await createClass({ capacity: 2 });
    await createMembership(member.id, { creditsRemaining: 5 });

    const booking = await callerAs(member).bookings.book({ classId: cls.id });
    await callerAs(staff).bookings.markAttended({ bookingId: booking.id });

    const checkin = await checkinFor(member.id);
    expect(checkin?.bookingId).toBe(booking.id);
  });
});
