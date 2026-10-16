"use client";

/**
 * The settings dialog — Task 16 (PRD §4.1).
 *
 * Durations (focus/short/long), session count N, auto-start toggles for
 * both directions, and the notifications toggle — persisted through the
 * `settings.update` mutation, applied to the timer without a reload (the
 * `SettingsSync` bridge carries the reactive query into the store, and the
 * engine reads the store's settings on every transition).
 *
 * No HeroUI/shadcn Dialog is used: neither is installed, and installing one
 * is an ask-first dependency (§9). This is hand-rolled at the same tokens —
 * glass panel, sanctuary easing, ghost controls — with the dialog semantics
 * a library would supply: `role="dialog"` + `aria-modal`, Escape and
 * overlay-click to close, and focus moved into the panel on open.
 */

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";

/** Draft of the numeric fields while the dialog is open. */
interface SettingsDraft {
  focusMin: string;
  shortMin: string;
  longMin: string;
  sessionCount: string;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
}

function toDraft(server: {
  focusMin: number;
  shortMin: number;
  longMin: number;
  sessionCount: number;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
}): SettingsDraft {
  return {
    focusMin: String(server.focusMin),
    shortMin: String(server.shortMin),
    longMin: String(server.longMin),
    sessionCount: String(server.sessionCount),
    autoStartBreak: server.autoStartBreak,
    autoStartFocus: server.autoStartFocus,
  };
}

const DURATION_BOUNDS: Record<string, { min: number; max: number; label: string }> = {
  focusMin: { min: 1, max: 180, label: "Focus length" },
  shortMin: { min: 1, max: 60, label: "Short break" },
  longMin: { min: 1, max: 60, label: "Long break" },
  sessionCount: { min: 1, max: 12, label: "Sessions per cycle" },
};

/** Parses the draft; returns the error to show, or `null` when it is saveable. */
function validateDraft(draft: SettingsDraft): string | null {
  for (const key of ["focusMin", "shortMin", "longMin", "sessionCount"] as const) {
    const { min, max, label } = DURATION_BOUNDS[key];
    const value = Number(draft[key]);
    if (!Number.isInteger(value) || value < min || value > max) {
      return `${label} must be a whole number from ${min} to ${max}.`;
    }
  }
  return null;
}

/** Inline SVG gear — the header has no icon font (Tasks 2/7 decision). */
function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl bg-surface-container-low px-4 py-3 text-left transition-colors duration-150 ease-sanctuary hover:bg-surface-container"
    >
      <span>
        <span className="block text-sm font-bold text-on-surface">{label}</span>
        <span className="mt-0.5 block text-xs text-on-surface-variant">
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ease-sanctuary ${
          checked ? "bg-primary" : "bg-surface-container-highest"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-on-surface transition-all duration-150 ease-sanctuary ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  min: number;
  max: number;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block rounded-xl bg-surface-container-low px-4 py-3">
      <span className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
        {label}
      </span>
      <span className="mt-1 flex items-baseline gap-2">
        <input
          type="number"
          aria-label={`${label} in ${unit}`}
          value={value}
          min={min}
          max={max}
          step={1}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent font-mono text-2xl font-bold text-on-surface outline-none"
        />
        <span className="shrink-0 text-xs text-on-surface-variant">{unit}</span>
      </span>
    </label>
  );
}

interface ServerSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  sessionCount: number;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  notificationsEnabled: boolean;
}

function SettingsForm({ onClose }: { onClose: () => void }) {
  const server = useQuery(api.settings.get, {});
  const panelRef = useRef<HTMLDivElement>(null);

  // Into the panel on open; Escape out of it.
  useEffect(() => {
    panelRef.current?.querySelector("input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (server === undefined) {
    return (
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="glass-panel w-full max-w-md rounded-xl bg-surface-container px-6 py-8 font-mono"
      >
        <p className="text-sm text-on-surface-variant">Loading settings…</p>
      </div>
    );
  }

  // Mounted only once the server row has landed, so the draft is seeded
  // from it by construction — no effect needed, and a reactive update from
  // another tab never rewrites a half-typed number under the user's
  // fingers. (Remounting on `server` identity would re-seed mid-edit, so
  // the key is deliberately absent.)
  return (
    <div ref={panelRef}>
      <SettingsFields initial={server} onClose={onClose} />
    </div>
  );
}

function SettingsFields({
  initial,
  onClose,
}: {
  initial: ServerSettings;
  onClose: () => void;
}) {
  const update = useMutation(api.settings.update);

  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(initial));
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    initial.notificationsEnabled,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function failed(what: string, err: unknown) {
    console.error(`locked-in: could not ${what}`, err);
    setError("Could not save — check your connection and try again.");
  }

  function save() {
    const problem = validateDraft(draft);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setError(null);
    void update({
      focusMin: Number(draft.focusMin),
      shortMin: Number(draft.shortMin),
      longMin: Number(draft.longMin),
      sessionCount: Number(draft.sessionCount),
    }).then(
      () => {
        setSaved(true);
        window.setTimeout(onClose, 600);
      },
      (err: unknown) => failed("save the settings", err),
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="glass-panel w-full max-w-md rounded-xl bg-surface-container px-6 py-6 font-mono"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface">
          Settings
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="rounded-lg px-2 py-1 text-xs font-bold text-on-surface-variant transition-colors duration-150 ease-sanctuary hover:bg-surface-container-high hover:text-on-surface"
        >
          Close
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <NumberField
          label="Focus"
          unit="min"
          value={draft.focusMin}
          min={1}
          max={180}
          onChange={(focusMin) => {
            setDraft({ ...draft, focusMin });
            setSaved(false);
          }}
        />
        <NumberField
          label="Short break"
          unit="min"
          value={draft.shortMin}
          min={1}
          max={60}
          onChange={(shortMin) => {
            setDraft({ ...draft, shortMin });
            setSaved(false);
          }}
        />
        <NumberField
          label="Long break"
          unit="min"
          value={draft.longMin}
          min={1}
          max={60}
          onChange={(longMin) => {
            setDraft({ ...draft, longMin });
            setSaved(false);
          }}
        />
        <NumberField
          label="Sessions"
          unit="per cycle"
          value={draft.sessionCount}
          min={1}
          max={12}
          onChange={(sessionCount) => {
            setDraft({ ...draft, sessionCount });
            setSaved(false);
          }}
        />
      </div>

      <div className="mt-3 space-y-3">
        <Toggle
          label="Auto-start breaks"
          description="A finished focus session flows straight into its break."
          checked={draft.autoStartBreak}
          onChange={(autoStartBreak) => {
            setDraft({ ...draft, autoStartBreak });
            void update({ autoStartBreak }).catch((err: unknown) =>
              failed("save the settings", err),
            );
          }}
        />
        <Toggle
          label="Auto-start focus"
          description="A finished break flows straight into the next session."
          checked={draft.autoStartFocus}
          onChange={(autoStartFocus) => {
            setDraft({ ...draft, autoStartFocus });
            void update({ autoStartFocus }).catch((err: unknown) =>
              failed("save the settings", err),
            );
          }}
        />
        <Toggle
          label="Browser notifications"
          description="Show a notification when a phase ends."
          checked={notificationsEnabled}
          onChange={(next) => {
            setNotificationsEnabled(next);
            void update({ notificationsEnabled: next }).catch((err: unknown) =>
              failed("save the settings", err),
            );
          }}
        />
      </div>

      {error !== null && (
        <p role="alert" className="mt-4 text-xs font-bold text-tertiary">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        className="cta-gradient mt-5 w-full rounded-xl py-3 text-sm font-bold tracking-tight text-on-primary transition-all duration-150 ease-sanctuary active:scale-95"
      >
        {saved ? "Saved" : "Save changes"}
      </button>
      <p className="mt-3 text-center text-xs text-on-surface-variant">
        Durations apply to the next phase — the running one is never resized.
      </p>
    </div>
  );
}

export function SettingsDialog() {
  const { isAuthenticated } = useConvexAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open settings"
        className="flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1 font-mono text-xs font-bold text-on-surface-variant transition-colors duration-150 ease-sanctuary hover:bg-surface-container-highest hover:text-on-surface"
      >
        <GearIcon />
        Settings
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex w-full max-w-md justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            {isAuthenticated ? (
              <SettingsForm onClose={() => setOpen(false)} />
            ) : (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Settings"
                className="glass-panel w-full max-w-md rounded-xl bg-surface-container px-6 py-8 font-mono"
              >
                <p className="text-sm text-on-surface-variant">
                  Signing you in… settings appear in a moment.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
