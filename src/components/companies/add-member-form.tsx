"use client";

import { useState } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc";

type LinkedMember = RouterOutputs["adminCompanies"]["getById"]["members"][number];

export function AddMemberForm({
  companyId,
  existingMembers,
  onDone,
}: {
  companyId: number;
  existingMembers: LinkedMember[];
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const utils = trpc.useUtils();

  const { data: results } = trpc.members.search.useQuery(
    { q: query },
    { enabled: query.length > 2 },
  );

  const linkMember = trpc.adminCompanies.linkMember.useMutation({
    onSuccess: async () => {
      setQuery("");
      await utils.adminCompanies.getById.invalidate({ id: companyId });
      onDone();
    },
  });

  const alreadyLinked = new Set(existingMembers.map((m) => m.id));
  const candidates = results?.filter((user) => !alreadyLinked.has(user.id)) ?? [];

  return (
    <div className="panel p-4 space-y-3">
      <div>
        <label className="block text-sm font-medium mb-2">Search Members</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 border rounded"
          style={{ borderColor: "var(--border)" }}
          placeholder="Search by name or email (3+ chars)"
          disabled={linkMember.isPending}
        />
      </div>

      {candidates.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {candidates.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-2 border rounded"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex-1">
                <div className="font-medium text-sm">{user.name}</div>
                <div className="text-xs muted">{user.email}</div>
              </div>
              <button
                onClick={() => linkMember.mutate({ companyId, userId: user.id })}
                className="btn btn-sm"
                disabled={linkMember.isPending}
              >
                Add
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn-outline"
        onClick={() => {
          setQuery("");
          onDone();
        }}
        disabled={linkMember.isPending}
      >
        Done
      </button>
    </div>
  );
}
