"use client";

/**
 * Project CRUD — Task 13, PRD §4.1 "Projects … CRUD: create, rename, archive".
 *
 * The surface the mutations needed: without it, `create`/`rename`/`archive`
 * would be tested functions with no way to reach them. It sits in the right
 * column beneath the task list — the projects are the list's filing system,
 * so they live beside it rather than on a route of their own.
 *
 * Split the usual way: `ProjectManagerView` is pure (rows in, gestures out,
 * testable in jsdom) and `ProjectManager` owns the Convex binding plus the
 * transient UI state (the new-project draft, which row is being renamed).
 * The auth gating mirrors `task-panel.tsx`: subscriptions stay off until
 * the anonymous session exists, because every query here resolves an owner.
 *
 * No hard delete exists anywhere in this file — PRD §4.1 forbids it, and an
 * archived project's tasks keep their tag (muted) and their history. Errors
 * render in `tertiary`, never alert-red (DESIGN.md §5).
 */

import { useState, type FormEvent } from "react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { Input, TextField, Button } from "@heroui/react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export interface ManagerProject {
  id: string;
  name: string;
  archived: boolean;
}

interface ProjectManagerViewProps {
  projects: readonly ManagerProject[];
  /** False while the anonymous identity is settling — same gate as the add pill. */
  ready: boolean;
  /** The cap refusal (or any failure) to show; `null` shows nothing. */
  error: string | null;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
}

export function ProjectManagerView({
  projects,
  ready,
  error,
  onCreate,
  onRename,
  onArchive,
  onUnarchive,
}: ProjectManagerViewProps) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) {
      return;
    }
    const name = draft.trim();
    if (name.length === 0) {
      return;
    }
    onCreate(name);
    setDraft("");
  }

  function commitRename(id: string) {
    const name = editingName.trim();
    // An empty rename is a cancelled rename, not a project called "": the
    // row keeps its old name and the editor closes.
    if (name.length > 0) {
      onRename(id, name);
    }
    setEditingId(null);
  }

  return (
    <section aria-label="Projects" className="mt-8">
      <h3 className="mb-4 text-lg font-bold tracking-tight text-on-surface">
        Projects
      </h3>

      <form className="group relative mb-4" onSubmit={submit}>
        <div className="flex items-center rounded-xl bg-surface-container-low transition-all focus-within:ring-1 focus-within:ring-primary/30">
          <TextField
            aria-label="New project name"
            value={draft}
            onChange={setDraft}
            isDisabled={!ready}
            className="min-w-0 flex-1"
          >
            <Input
              placeholder="New project..."
              className="min-w-0 flex-1 bg-transparent py-3 pl-4 pr-2 text-sm text-on-surface transition-all placeholder:text-on-surface-variant/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            />
          </TextField>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            isDisabled={!ready}
            onPress={() => {
              // `type="button"` deliberately: a submit button would fire
              // both this press *and* the form's submit, creating the
              // project twice (duplicates are legal, so nothing would stop
              // it). Enter still reaches `submit` through the input.
              const name = draft.trim();
              if (ready && name.length > 0) {
                onCreate(name);
                setDraft("");
              }
            }}
          >
            Add
          </Button>
        </div>
      </form>

      {error === null ? null : (
        <p role="alert" className="mb-4 text-xs text-tertiary">
          {error}
        </p>
      )}

      {projects.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          No projects yet — tasks work fine without one.
        </p>
      ) : (
        <ul className="space-y-2">
          {projects.map((project) => (
            <li
              key={project.id}
              data-project-id={project.id}
              className={`flex items-center justify-between gap-3 rounded-xl bg-surface-container-low/50 px-4 py-2.5${
                project.archived ? " opacity-50" : ""
              }`}
            >
              {editingId === project.id ? (
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <TextField
                    aria-label={`Rename ${project.name}`}
                    value={editingName}
                    onChange={setEditingName}
                    className="min-w-0 flex-1"
                  >
                    <Input
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename(project.id);
                        } else if (event.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent text-sm text-on-surface focus:outline-none"
                    />
                  </TextField>
                  <Button
                    size="sm"
                    variant="primary"
                    onPress={() => commitRename(project.id)}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                </span>
              ) : (
                <>
                  <span className="min-w-0 truncate text-sm font-medium text-on-surface">
                    {project.name}
                    {project.archived ? (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                        Archived
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Rename ${project.name}`}
                      onPress={() => {
                        setEditingId(project.id);
                        setEditingName(project.name);
                      }}
                    >
                      Rename
                    </Button>
                    {project.archived ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Restore ${project.name}`}
                        onPress={() => onUnarchive(project.id)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Archive ${project.name}`}
                        onPress={() => onArchive(project.id)}
                      >
                        Archive
                      </Button>
                    )}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProjectManager() {
  const { isAuthenticated } = useConvexAuth();
  const listing = useQuery(api.projects.list, isAuthenticated ? {} : "skip");

  const create = useMutation(api.projects.create);
  const rename = useMutation(api.projects.rename);
  const archive = useMutation(api.projects.archive);
  const unarchive = useMutation(api.projects.unarchive);

  // The last failure, verbatim enough to act on. Cleared by the next
  // attempt's success path only insofar as a success replaces it with
  // nothing — each setter below resets it first, so a stale cap warning
  // cannot outlive the retry that cleared room for it.
  const [error, setError] = useState<string | null>(null);

  function failed(what: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    // The server's cap message is already written for a human; anything
    // else is a write the user believes happened but didn't, which deserves
    // to be loud rather than silent.
    setError(
      message.includes("100 active projects")
        ? message.replace(/^projects:\s*/, "")
        : `Could not ${what}. ${message}`,
    );
  }

  const projects: ManagerProject[] =
    listing === undefined
      ? []
      : [
          ...listing.active.map((p) => ({
            id: p._id,
            name: p.name,
            archived: false,
          })),
          ...listing.archived.map((p) => ({
            id: p._id,
            name: p.name,
            archived: true,
          })),
        ];

  return (
    <ProjectManagerView
      projects={projects}
      ready={isAuthenticated}
      error={error}
      onCreate={(name) => {
        setError(null);
        void create({ name }).catch((cause) => failed("create the project", cause));
      }}
      onRename={(id, name) => {
        setError(null);
        void rename({ projectId: id as Id<"projects">, name }).catch((cause) =>
          failed("rename the project", cause),
        );
      }}
      onArchive={(id) => {
        setError(null);
        void archive({ projectId: id as Id<"projects"> }).catch((cause) =>
          failed("archive the project", cause),
        );
      }}
      onUnarchive={(id) => {
        setError(null);
        void unarchive({ projectId: id as Id<"projects"> }).catch((cause) =>
          failed("restore the project", cause),
        );
      }}
    />
  );
}
