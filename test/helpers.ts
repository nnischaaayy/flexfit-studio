import { db } from "@/db";
import { appRouter } from "@/server/routers/_app";
import type { User } from "@/db/schema";

export { db };

export function callerAs(user: User | null) {
  return appRouter.createCaller({ db, user, token: undefined });
}

let seq = 0;
export function unique(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

export function isoInHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
