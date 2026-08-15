"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function TopUpForm({ companyId, onDone }: { companyId: number; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const utils = trpc.useUtils();

  const topUp = trpc.adminCompanies.topUp.useMutation({
    onSuccess: async () => {
      setAmount("");
      await utils.adminCompanies.getById.invalidate({ id: companyId });
      onDone();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(amount, 10);
    if (parsed > 0) {
      topUp.mutate({ id: companyId, amount: parsed });
    }
  };

  return (
    <div className="panel p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-2">Top Up Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            style={{ borderColor: "var(--border)" }}
            placeholder="Number of credits"
            disabled={topUp.isPending}
            min="1"
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn" disabled={topUp.isPending || !amount}>
            {topUp.isPending ? "Processing..." : "Top Up"}
          </button>
          <button type="button" className="btn-outline" onClick={onDone} disabled={topUp.isPending}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
