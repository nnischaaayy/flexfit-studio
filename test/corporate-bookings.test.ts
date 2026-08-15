import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { callerAs, db } from "./helpers";
import { createUser, createClass, createCompany, linkToCompany } from "./fixtures";
import { companies, checkins } from "@/db/schema";

async function companyBalance(companyId: number) {
  return db.select().from(companies).where(eq(companies.id, companyId)).get();
}

async function checkinFor(userId: number) {
  return db.select().from(checkins).where(eq(checkins.userId, userId)).get();
}

/**
 * Characterization tests for corporate-bookings.ts — the near-duplicate of
 * bookings.ts (see ARCHITECTURE.md §2.1). Same shape of tests as
 * bookings.test.ts, but against the company credit pool, plus the two
 * documented behavior asymmetries pinned explicitly at the bottom.
 */
describe("corporateBookings.book", () => {
  it("books and deducts the class cost from the company pool", async () => {
    const member = await createUser("member");
    const company = await createCompany({ creditPoolBalance: 10 });
    await linkToCompany(member.id, company.id);
    const cls = await createClass({ capacity: 2, creditCost: 2 });

    const result = await callerAs(member).corporateBookings.book({ classId: cls.id });

    expect(result.status).toBe("booked");
    const co = await companyBalance(company.id);
    expect(co?.creditPoolBalance).toBe(8);
  });

  it("waitlists without touching the pool when the class is full", async () => {
    const member1 = await createUser("member");
    const member2 = await createUser("member");
    const company = await createCompany({ creditPoolBalance: 10 });
    await linkToCompany(member1.id, company.id);
    await linkToCompany(member2.id, company.id);
    const cls = await createClass({ capacity: 1, creditCost: 2 });

    await callerAs(member1).corporateBookings.book({ classId: cls.id });
    const result = await callerAs(member2).corporateBookings.book({ classId: cls.id });

    expect(result.status).toBe("waitlisted");
    const co = await companyBalance(company.id);
    expect(co?.creditPoolBalance).toBe(8); // only member1's booking deducted
  });

  it("rejects booking when not linked to an active company", async () => {
    const member = await createUser("member");
    const cls = await createClass();

    await expect(
      callerAs(member).corporateBookings.book({ classId: cls.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects booking when the company pool can't cover the class cost", async () => {
    const member = await createUser("member");
    const company = await createCompany({ creditPoolBalance: 1 });
    await linkToCompany(member.id, company.id);
    const cls = await createClass({ creditCost: 3 });

    await expect(
      callerAs(member).corporateBookings.book({ classId: cls.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("corporateBookings.cancel — free-cancellation window (24h, not 12h)", () => {
  it("refunds to the pool when cancelling >= 24h before class start", async () => {
    const member = await createUser("member");
    const company = await createCompany({ creditPoolBalance: 10 });
    await linkToCompany(member.id, company.id);
    const cls = await createClass({ startsInHours: 48, creditCost: 2 });

    const booking = await callerAs(member).corporateBookings.book({ classId: cls.id });
    const result = await callerAs(member).corporateBookings.cancel({ bookingId: booking.id });

    expect(result.refunded).toBe(true);
    const co = await companyBalance(company.id);
    expect(co?.creditPoolBalance).toBe(10);
  });

  it("does NOT refund when cancelling between 12h and 24h before start (would refund for a personal booking)", async () => {
    const member = await createUser("member");
    const company = await createCompany({ creditPoolBalance: 10 });
    await linkToCompany(member.id, company.id);
    const cls = await createClass({ startsInHours: 18, creditCost: 2 });

    const booking = await callerAs(member).corporateBookings.book({ classId: cls.id });
    const result = await callerAs(member).corporateBookings.cancel({ bookingId: booking.id });

    expect(result.refunded).toBe(false);
    const co = await companyBalance(company.id);
    expect(co?.creditPoolBalance).toBe(8); // forfeited, unlike the personal-booking 12h window
  });
});

describe("corporateBookings — waitlist promotion (documented asymmetry, §2.1)", () => {
  it("skips the deduction entirely when the pool can't cover the promoted booking (guarded, unlike personal bookings)", async () => {
    const member1 = await createUser("member");
    const member2 = await createUser("member");
    // book() checks pool sufficiency before capacity, so the pool needs
    // enough for both member1's booking AND member2 to join the waitlist.
    const company = await createCompany({ creditPoolBalance: 4 });
    await linkToCompany(member1.id, company.id);
    await linkToCompany(member2.id, company.id);
    // Within the 24h window so the cancel below forfeits (non-refundable) —
    // isolates the promotion-guard behavior from the refund behavior.
    const cls = await createClass({ capacity: 1, creditCost: 2, startsInHours: 10 });

    const b1 = await callerAs(member1).corporateBookings.book({ classId: cls.id }); // pool 4 -> 2
    await callerAs(member2).corporateBookings.book({ classId: cls.id }); // waitlisted, pool stays 2

    // Simulate the pool being spent elsewhere before member2's turn comes up.
    await db.update(companies).set({ creditPoolBalance: 1 }).where(eq(companies.id, company.id));

    await callerAs(member1).corporateBookings.cancel({ bookingId: b1.id });

    const co = await companyBalance(company.id);
    // Current behavior: promotion happens (member2 is now "booked"), but the
    // pool is never debited because it can't cover the cost — unlike the
    // personal-booking path, which always deducts and floors at 0.
    expect(co?.creditPoolBalance).toBe(1);
  });
});

describe("corporateBookings.markAttended — checkin linkage (documented asymmetry, §2.1)", () => {
  it("inserts the checkin WITHOUT linking it to the booking (bookingId: null)", async () => {
    const member = await createUser("member");
    const staff = await createUser("admin");
    const company = await createCompany({ creditPoolBalance: 10 });
    await linkToCompany(member.id, company.id);
    const cls = await createClass({ capacity: 2 });

    const booking = await callerAs(member).corporateBookings.book({ classId: cls.id });
    await callerAs(staff).corporateBookings.markAttended({ bookingId: booking.id });

    const checkin = await checkinFor(member.id);
    // This is the bug-shaped asymmetry from ARCHITECTURE.md §2.1: personal
    // bookings link bookingId, corporate ones don't, so corporate checkins
    // are invisible to bookings.checkinCountFor's join.
    expect(checkin?.bookingId).toBeNull();
  });
});
