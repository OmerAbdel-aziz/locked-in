"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { NavPill } from "@/components/chrome/nav-pill";
import { AccountButton } from "@/components/auth/account-button";
import { StreakBadge } from "@/components/chrome/streak-badge";

export default function CareersPage() {
  const rungs = useQuery(api.rungs.listAll);
  const projects = useQuery(api.projects.list);

  const nameById = new Map<string, string>();
  if (projects) {
    for (const p of projects.active) nameById.set(p._id, p.name);
    for (const p of projects.archived) nameById.set(p._id, p.name);
  }

  const sorted = (rungs ?? []).slice().sort((a, b) => a.order - b.order);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 w-full items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="text-xl font-bold tracking-tighter text-on-surface">
            Locked In
          </div>
          <NavPill />
        </div>
        <div className="flex items-center gap-2">
          <StreakBadge />
          <AccountButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-8 pb-20 pt-24">
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-on-surface">
          Careers
        </h1>
        {sorted.length === 0 ? (
          <p className="rounded-xl bg-surface-container-low/50 px-4 py-6 text-center text-sm text-on-surface-variant/70">
            No rungs yet — author a Career Ladder on a Roadmap.
          </p>
        ) : (
          <ul className="space-y-4">
            {sorted.map((rung) => (
              <li
                key={rung._id}
                className="rounded-xl bg-surface-container-low p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-on-surface">
                      {rung.title}
                    </div>
                    {rung.company ? (
                      <div className="text-xs text-on-surface-variant">
                        {rung.company}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-xs text-on-surface-variant">
                    {nameById.get(rung.projectId) ?? "Roadmap"}
                  </div>
                </div>
                {rung.payMin !== undefined || rung.payMax !== undefined ? (
                  <div className="mt-1 font-mono text-xs text-on-surface-variant">
                    {rung.payMin !== undefined ? `$${rung.payMin}` : ""}
                    {rung.payMin !== undefined && rung.payMax !== undefined
                      ? " – "
                      : ""}
                    {rung.payMax !== undefined ? `$${rung.payMax}` : ""}
                  </div>
                ) : null}
                {rung.requirements && rung.requirements.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-on-surface">
                    {rung.requirements.map((req, i) => (
                      <li key={i}>{req}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-on-surface-variant">
                  {rung.degreeMention ? <span>degree mentioned</span> : null}
                  {rung.sideDoor ? <span>side door</span> : null}
                  {rung.milestoneIds && rung.milestoneIds.length > 0 ? (
                    <span>on the path: {rung.milestoneIds.length} milestones</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
