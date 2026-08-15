/**
 * Shared validation behind reschedules.ts's `reschedule` (mutation, throws)
 * and `validateReschedule` (query, returns {valid, reason} for live UI
 * feedback before submit). Both endpoints ran the identical 9-step check
 * twice — same order, same messages, by construction rather than by
 * discipline. This is that single check, used by both. See
 * ARCHITECTURE.md §2.6.
 */

import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { bookings, classes, type Booking, type GymClass } from "@/db/schema";
import { hoursUntil } from "./booking-engine";

export const FREE_RESCHEDULE_HOURS = 4;

export type RescheduleCheck =
  | {
      valid: true;
      originalBooking: Booking;
      originalClass: GymClass;
      targetClass: GymClass;
      targetIsFull: boolean;
    }
  | { valid: false; reason: string; code: TRPCError["code"] };

export async function checkReschedule(
  db: typeof import("@/db").db,
  userId: number,
  fromBookingId: number,
  toClassId: number,
): Promise<RescheduleCheck> {
  const originalRow = await db
    .select({ booking: bookings, cls: classes })
    .from(bookings)
    .innerJoin(classes, eq(bookings.classId, classes.id))
    .where(eq(bookings.id, fromBookingId))
    .get();

  if (!originalRow) {
    return { valid: false, reason: "Booking not found.", code: "NOT_FOUND" };
  }
  const { booking: originalBooking, cls: originalClass } = originalRow;

  if (originalBooking.userId !== userId) {
    return { valid: false, reason: "You cannot reschedule this booking.", code: "FORBIDDEN" };
  }

  if (originalBooking.status !== "booked" && originalBooking.status !== "waitlisted") {
    return { valid: false, reason: "This booking is no longer active.", code: "BAD_REQUEST" };
  }

  if (hoursUntil(originalClass.startsAt) < FREE_RESCHEDULE_HOURS) {
    return {
      valid: false,
      reason: `You can only reschedule up to ${FREE_RESCHEDULE_HOURS} hours before the class starts.`,
      code: "BAD_REQUEST",
    };
  }

  const targetClass = await db.select().from(classes).where(eq(classes.id, toClassId)).get();
  if (!targetClass) {
    return { valid: false, reason: "Target class not found.", code: "NOT_FOUND" };
  }

  if (targetClass.name !== originalClass.name) {
    return {
      valid: false,
      reason: "You can only reschedule to a class with the same name.",
      code: "BAD_REQUEST",
    };
  }

  if (targetClass.id === originalClass.id) {
    return { valid: false, reason: "You are already booked for this class.", code: "BAD_REQUEST" };
  }

  if (hoursUntil(targetClass.startsAt) <= 0) {
    return { valid: false, reason: "This class has already started.", code: "BAD_REQUEST" };
  }

  if (targetClass.cancelled) {
    return { valid: false, reason: "This class has been cancelled.", code: "BAD_REQUEST" };
  }

  const existingBooking = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.classId, targetClass.id),
        eq(bookings.userId, userId),
        sql`${bookings.status} in ('booked', 'waitlisted')`,
      ),
    )
    .get();

  if (existingBooking) {
    return {
      valid: false,
      reason: "You already have an active booking for this class.",
      code: "CONFLICT",
    };
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(and(eq(bookings.classId, targetClass.id), eq(bookings.status, "booked")));

  return {
    valid: true,
    originalBooking,
    originalClass,
    targetClass,
    targetIsFull: Number(count) >= targetClass.capacity,
  };
}
