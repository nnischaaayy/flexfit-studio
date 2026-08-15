import { db, unique } from "./helpers";
import {
  users,
  classes,
  memberships,
  membershipPlans,
  companies,
  companyMembers,
  type User,
} from "@/db/schema";

export async function createUser(role: "member" | "trainer" | "admin" = "member"): Promise<User> {
  return db
    .insert(users)
    .values({
      email: unique("user") + "@test.local",
      passwordHash: "x",
      name: unique("Name"),
      role,
    })
    .returning()
    .get();
}

export async function createClass(opts: {
  name?: string;
  capacity?: number;
  creditCost?: number;
  startsInHours?: number;
  cancelled?: boolean;
} = {}) {
  return db
    .insert(classes)
    .values({
      name: opts.name ?? unique("Class"),
      room: "Studio A",
      capacity: opts.capacity ?? 1,
      creditCost: opts.creditCost ?? 1,
      startsAt: new Date(Date.now() + (opts.startsInHours ?? 48) * 60 * 60 * 1000).toISOString(),
      cancelled: opts.cancelled ?? false,
    })
    .returning()
    .get();
}

export async function createMembership(
  userId: number,
  opts: { creditsRemaining?: number } = {},
) {
  const plan = await db
    .insert(membershipPlans)
    .values({
      name: unique("Plan"),
      priceCents: 1000,
      durationDays: 30,
      classCredits: opts.creditsRemaining ?? 10,
    })
    .returning()
    .get();

  return db
    .insert(memberships)
    .values({
      userId,
      planId: plan.id,
      startDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      creditsRemaining: opts.creditsRemaining ?? 10,
      status: "active",
    })
    .returning()
    .get();
}

export async function createCompany(opts: { creditPoolBalance?: number } = {}) {
  return db
    .insert(companies)
    .values({
      name: unique("Company"),
      contactEmail: "hr@test.local",
      creditPoolBalance: opts.creditPoolBalance ?? 10,
      active: true,
    })
    .returning()
    .get();
}

export async function linkToCompany(userId: number, companyId: number) {
  await db.insert(companyMembers).values({ userId, companyId });
}
