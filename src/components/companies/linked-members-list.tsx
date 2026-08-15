"use client";

import { trpc, type RouterOutputs } from "@/lib/trpc";

type LinkedMember = RouterOutputs["adminCompanies"]["getById"]["members"][number];

export function LinkedMembersList({ companyId, members }: { companyId: number; members: LinkedMember[] }) {
  const utils = trpc.useUtils();

  const unlinkMember = trpc.adminCompanies.unlinkMember.useMutation({
    onSuccess: () => utils.adminCompanies.getById.invalidate({ id: companyId }),
  });

  return (
    <div className="space-y-3">
      <h2 className="font-medium">Linked Members ({members.length})</h2>
      {members.length > 0 ? (
        <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-4 p-3">
              <div className="flex-1">
                <div className="font-medium text-sm">{member.name}</div>
                <div className="text-xs muted">{member.email}</div>
              </div>
              <button
                onClick={() => unlinkMember.mutate({ companyMemberId: member.companyMemberId })}
                className="btn-outline btn-sm text-red-600"
                disabled={unlinkMember.isPending}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel p-4 text-center muted">No members linked yet</div>
      )}
    </div>
  );
}
