"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Button, Input } from "@heroui/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Milestones grouped above a roadmap's units (issue 02).
 *
 * Reads `milestones.progress` — the server derives counts from the unit log,
 * never from stored aggregates — so the header's "n / total" can only ever
 * agree with the rows underneath it. Create/rename/archive all go through
 * the milestones module, which reuses the same ownership choke point and
 * fractional ordering as tasks.
 */
export function MilestonePanel({ projectId }: { projectId: Id<"projects"> }) {
  const progress = useQuery(api.milestones.progress, { projectId });
  const create = useMutation(api.milestones.create);
  const rename = useMutation(api.milestones.rename);
  const archive = useMutation(api.milestones.archive);

  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function add() {
    const title = name.trim();
    if (title.length === 0) return;
    setName("");
    void create({ projectId, name: title }).catch((error) => {
      console.error("locked-in: could not create milestone", error);
    });
  }

  function save() {
    if (editing === null) return;
    const title = draft.trim();
    setEditing(null);
    if (title.length === 0) return;
    void rename({
      milestoneId: editing as Id<"milestones">,
      name: title,
    }).catch((error) => {
      console.error("locked-in: could not rename milestone", error);
    });
  }

  return (
    <section aria-label="Roadmap milestones" className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label="New milestone"
          placeholder="New milestone…"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
          className="flex-1"
        />
        <Button type="button" variant="ghost" isDisabled={!name.trim()} onPress={add}>
          Add
        </Button>
      </div>

      {progress === undefined ? null : progress.length === 0 ? (
        <p className="rounded-xl bg-surface-container-low/50 px-4 py-4 text-center text-sm text-on-surface-variant/70">
          No milestones yet — add one to group units into phases.
        </p>
      ) : (
        <ul className="space-y-4">
          {progress.map(({ milestone, units, total, completed, known }) => {
            const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
            return (
              <li key={milestone._id} className="rounded-xl bg-surface-container-low p-4">
                <div className="flex items-baseline justify-between gap-2">
                  {editing === milestone._id ? (
                    <Input
                      aria-label="Rename milestone"
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") save();
                        if (event.key === "Escape") setEditing(null);
                      }}
                      onBlur={save}
                      className="flex-1"
                    />
                  ) : (
                    <button
                      type="button"
                      className="text-left text-sm font-semibold text-on-surface"
                      onClick={() => {
                        setEditing(milestone._id);
                        setDraft(milestone.name);
                      }}
                    >
                      {milestone.name}
                    </button>
                  )}
                  <span className="font-mono text-xs text-on-surface-variant">
                    {completed}/{total} · {percent}%{known > 0 ? ` · ${known} known` : ""}
                  </span>
                </div>
                {units.length === 0 ? (
                  <p className="mt-2 text-xs text-on-surface-variant/70">
                    No units yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {units.map((unit) => (
                      <li
                        key={unit._id}
                        className={
                          unit.activeFlag
                            ? "text-sm text-on-surface"
                            : "text-sm text-on-surface-variant line-through opacity-60"
                        }
                      >
                        {unit.title}
                        {unit.known === true ? " · known" : ""}
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2"
                  onPress={() => {
                    void archive({ milestoneId: milestone._id }).catch((error) => {
                      console.error("locked-in: could not archive milestone", error);
                    });
                  }}
                >
                  Archive
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
