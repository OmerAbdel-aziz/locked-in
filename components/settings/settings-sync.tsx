"use client";

/**
 * The settings → timer bridge — Task 16.
 *
 * The timer store is a plain module: it cannot reach a Convex query, and it
 * must tick from `DEFAULT_SETTINGS` before any query settles. This component
 * is the one place server settings flow into it — a sibling of
 * `SessionLogger` at the root, so every route inherits level settings rather
 * than one page remembering to sync.
 *
 * The flow is one-directional (server → store) and idempotent: applying the
 * same values twice changes nothing observable, and the effect only fires
 * when the query result itself changes, so there is no update loop. The
 * dialog writes through the `settings.update` mutation; the reactive query
 * lands here; the next phase transition reads the new numbers from the
 * store — no reload, no second path.
 */

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useEffect } from "react";

import { api } from "@/convex/_generated/api";
import { useTimerStore } from "@/lib/store/timer";

export function SettingsSync() {
  const { isAuthenticated } = useConvexAuth();
  const server = useQuery(api.settings.get, isAuthenticated ? {} : "skip");

  useEffect(() => {
    if (server === undefined) {
      return;
    }
    const { setSettings, setNotificationsEnabled } = useTimerStore.getState();
    setSettings({
      focusMin: server.focusMin,
      shortMin: server.shortMin,
      longMin: server.longMin,
      sessionCount: server.sessionCount,
      autoStartBreak: server.autoStartBreak,
      autoStartFocus: server.autoStartFocus,
    });
    setNotificationsEnabled(server.notificationsEnabled);
  }, [server]);

  return null;
}
