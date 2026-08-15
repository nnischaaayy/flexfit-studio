"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { TopUpForm } from "@/components/companies/top-up-form";
import { AddMemberForm } from "@/components/companies/add-member-form";
import { LinkedMembersList } from "@/components/companies/linked-members-list";
import { RecentBookingsList } from "@/components/companies/recent-bookings-list";

export default function CompanyDetailsPage() {
  const params = useParams();
  const id = parseInt(params.id as string);
  const utils = trpc.useUtils();
  const { data: company, isLoading } = trpc.adminCompanies.getById.useQuery({ id });
  const [showTopUpForm, setShowTopUpForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);

  const activeMutation = trpc.adminCompanies.updateActive.useMutation({
    onSuccess: () => utils.adminCompanies.getById.invalidate({ id }),
  });

  if (isLoading) return <p className="muted">Loading...</p>;
  if (!company) return <p className="muted">Company not found</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
          <p className="muted text-sm">{company.contactEmail}</p>
        </div>
        <button
          onClick={() => activeMutation.mutate({ id, active: !company.active })}
          className={company.active ? "btn btn-danger btn-sm" : "btn btn-sm"}
          disabled={activeMutation.isPending}
        >
          {company.active ? "Deactivate" : "Activate"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel p-4">
          <div className="muted text-xs uppercase tracking-wide mb-2">Credit Pool Balance</div>
          <div className="text-2xl font-semibold">{company.creditPoolBalance}</div>
          <button onClick={() => setShowTopUpForm(!showTopUpForm)} className="btn btn-sm mt-3">
            Top Up
          </button>
        </div>

        <div className="panel p-4">
          <div className="muted text-xs uppercase tracking-wide mb-2">Linked Members</div>
          <div className="text-2xl font-semibold">{company.members.length}</div>
          <button onClick={() => setShowMemberForm(!showMemberForm)} className="btn btn-sm mt-3">
            Add Member
          </button>
        </div>
      </div>

      {showTopUpForm && <TopUpForm companyId={id} onDone={() => setShowTopUpForm(false)} />}

      {showMemberForm && (
        <AddMemberForm
          companyId={id}
          existingMembers={company.members}
          onDone={() => setShowMemberForm(false)}
        />
      )}

      <LinkedMembersList companyId={id} members={company.members} />
      <RecentBookingsList bookings={company.recentBookings} />
    </div>
  );
}
