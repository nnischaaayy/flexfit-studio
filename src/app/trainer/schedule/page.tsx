"use client";

import { trpc } from "@/lib/trpc";
import { ClassRosterList } from "@/components/trainer/class-roster-list";
import { AvailabilityEditor } from "@/components/trainer/availability-editor";

export default function TrainerSchedulePage() {
  const { data: user } = trpc.auth.me.useQuery();
  const { data: classes, isLoading: classesLoading } = trpc.trainers.upcomingClasses.useQuery(undefined, {
    enabled: user?.role === "trainer",
  });
  const { data: availability, isLoading: availLoading } = trpc.trainers.availability.useQuery(undefined, {
    enabled: user?.role === "trainer",
  });

  if (user?.role !== "trainer") {
    return <p className="muted">Access denied. Trainers only.</p>;
  }

  if (classesLoading || availLoading) return <p className="muted">Loading...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trainer Schedule</h1>
        <p className="muted mt-1 text-sm">Manage your availability and upcoming classes</p>
      </div>

      <ClassRosterList classes={classes ?? []} />
      <AvailabilityEditor availability={availability ?? []} />
    </div>
  );
}
