"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Button, Input } from "@heroui/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { paceStatus } from "@/lib/pace";

export function PacePanel({ projectId }: { projectId: Id<"projects"> }) {
  const pace = useQuery(api.projects.pace, { projectId });
  const setPlan = useMutation(api.projects.setPlan);
  const [draft, setDraft] = useState("");

  if (pace === undefined) return null;

  const result = paceStatus({
    planHours: pace.planHours,
    actualMinutes: pace.actualMinutes,
    lastBoundMs: pace.lastBoundMs,
    nowMs: pace.nowMs,
  });

  return (
    <section aria-label="Pace" className="rounded-xl bg-surface-container-low p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-on-surface">Pace</div>
        <div className="font-mono text-xs text-on-surface-variant">
          {result.actualMinutes} / {result.planMinutes} min · {result.status}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input
          aria-label="Weekly focus hours"
          placeholder="Weekly focus hours"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          onPress={() => {
            const n = Number(draft);
            if (!Number.isFinite(n) || n < 0) return;
            void setPlan({ projectId, hours: n }).catch(() => {});
            setDraft("");
          }}
        >
          Set plan
        </Button>
        {pace.planHours !== null ? (
          <Button
            type="button"
            variant="ghost"
            onPress={() => void setPlan({ projectId, hours: null }).catch(() => {})}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </section>
  );
}
