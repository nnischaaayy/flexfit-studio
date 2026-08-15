"use client";

import { trpc, type RouterOutputs } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";

type UpcomingClass = RouterOutputs["trainers"]["upcomingClasses"][number];

function ClassCard({ classId, className, startsAt, room, durationMin, cancelled }: {
  classId: number;
  className: string;
  startsAt: string;
  room: string;
  durationMin: number;
  cancelled: boolean;
}) {
  const { data: roster, isLoading: rosterLoading } = trpc.bookings.rosterFor.useQuery({ classId });
  const { data: checkinData, isLoading: checkinLoading } = trpc.bookings.checkinCountFor.useQuery({ classId });

  const bookedCount = roster?.filter((r) => r.status === "booked" || r.status === "attended").length || 0;
  const checkins = checkinData?.count || 0;

  return (
    <div className="p-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{className}</div>
          <div className="muted mt-1 text-xs">
            {formatDateTime(startsAt)} · {room} · {durationMin} min
          </div>
          {!rosterLoading && !checkinLoading && (
            <div className="muted mt-2 text-xs">
              📊 {bookedCount} booked · ✓ {checkins} checked in
            </div>
          )}
          {cancelled && (
            <div className="mt-1 rounded px-2 py-1 text-xs" style={{ background: "#7f1d1d", color: "#fca5a5" }}>
              Cancelled
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ClassRosterList({ classes }: { classes: UpcomingClass[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-medium">Upcoming Classes</h2>
      {classes.length > 0 ? (
        <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
          {classes.map((cls) => (
            <ClassCard
              key={cls.id}
              classId={cls.id}
              className={cls.name}
              startsAt={cls.startsAt}
              room={cls.room}
              durationMin={cls.durationMin}
              cancelled={cls.cancelled}
            />
          ))}
        </div>
      ) : (
        <p className="muted text-sm">No upcoming classes.</p>
      )}
    </section>
  );
}
