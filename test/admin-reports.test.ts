import { describe, it, expect } from "vitest";
import { inArray } from "drizzle-orm";
import { callerAs, db } from "./helpers";
import { createUser, createClass } from "./fixtures";
import { bookings, checkins, classes } from "@/db/schema";

/**
 * Covers the three admin.ts report queries touched while extracting
 * `daysAgoDateString` (ARCHITECTURE.md §2.4) — confirms the 14-day window
 * still includes/excludes the same rows after the refactor.
 */
describe("admin reports — 14-day window", () => {
  it("checkinsPerDay counts a check-in from 5 days ago, excludes one from 20 days ago", async () => {
    // checkinsPerDay aggregates across ALL check-ins (no per-user scope), and
    // the shared test DB accumulates rows from earlier tests in this run, so
    // this asserts a delta for one specific date bucket rather than a total.
    const admin = await createUser("admin");
    const member = await createUser("member");
    const cls = await createClass();
    const booking = await db
      .insert(bookings)
      .values({ classId: cls.id, userId: member.id, status: "attended", creditsUsed: 1 })
      .returning()
      .get();

    const recent = new Date(Date.now() - 5 * 86400000);
    const recentDateStr = recent.toISOString().slice(0, 10);
    const old = new Date(Date.now() - 20 * 86400000).toISOString();

    const before = await callerAs(admin).admin.checkinsPerDay();
    const beforeCount = before.find((r) => r.date === recentDateStr)?.count ?? 0;

    await db.insert(checkins).values([
      { userId: member.id, bookingId: booking.id, checkedInAt: recent.toISOString() },
      { userId: member.id, bookingId: booking.id, checkedInAt: old },
    ]);

    const after = await callerAs(admin).admin.checkinsPerDay();
    const afterCount = after.find((r) => r.date === recentDateStr)?.count ?? 0;
    const oldDateStr = new Date(old).toISOString().slice(0, 10);

    expect(afterCount - beforeCount).toBe(1);
    expect(after.some((r) => r.date === oldDateStr)).toBe(false);
  });

  it("topTrainers counts an attended booking from 5 days ago, excludes one from 20 days ago", async () => {
    const admin = await createUser("admin");
    const trainer = await createUser("trainer");
    const member = await createUser("member");
    const recentClass = await createClass({ startsInHours: -5 * 24 });
    const oldClass = await createClass({ startsInHours: -20 * 24 });
    await db
      .update(classes)
      .set({ trainerId: trainer.id })
      .where(inArray(classes.id, [recentClass.id, oldClass.id]));

    await db.insert(bookings).values([
      { classId: recentClass.id, userId: member.id, status: "attended", creditsUsed: 1 },
      { classId: oldClass.id, userId: member.id, status: "attended", creditsUsed: 1 },
    ]);

    const rows = await callerAs(admin).admin.topTrainers();
    const trainerRow = rows.find((r) => r.trainerId === trainer.id);
    expect(trainerRow?.attendedCount).toBe(1);
  });

  it("noShowList includes a no-show from 5 days ago, excludes one from 20 days ago", async () => {
    const admin = await createUser("admin");
    const member = await createUser("member");
    const recentClass = await createClass({ startsInHours: -5 * 24, name: "Recent No-show Class" });
    const oldClass = await createClass({ startsInHours: -20 * 24, name: "Old No-show Class" });

    await db.insert(bookings).values([
      { classId: recentClass.id, userId: member.id, status: "no_show", creditsUsed: 1 },
      { classId: oldClass.id, userId: member.id, status: "no_show", creditsUsed: 1 },
    ]);

    const rows = await callerAs(admin).admin.noShowList();
    const names = rows.map((r) => r.className);
    expect(names).toContain("Recent No-show Class");
    expect(names).not.toContain("Old No-show Class");
  });
});
