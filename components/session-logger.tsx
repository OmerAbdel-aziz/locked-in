"use client";

import { useMutation } from "convex/react";
import { useEffect } from "react";

import { api } from "@/convex/_generated/api";
import { useTimerStore } from "@/lib/store/timer";

/**
 * Connects the timer's completion to the session log — Task 8.
 *
 * The store decides *that* a phase ended and works out *what* to record;
 * this component only supplies the one thing a plain module cannot reach —
 * a Convex mutation. Injecting it through `setSessionLogger` rather than
 * importing a client into `lib/store/timer.ts` is what keeps the store
 * unit-testable without an `NEXT_PUBLIC_CONVEX_URL`, and keeps this file
 * the single place where timer state crosses into the network.
 *
 * Mounted at the root next to `AnonymousIdentity`, because both are
 * prerequisites every page inherits rather than one a page can remember:
 * a session completed on any route has to find an owner and a writer.
 *
 * **The write is fire-and-forget**, deliberately. PRD §9 says the timer
 * never waits on a round-trip, so a completion transitions the cycle
 * first and this call follows — success, failure, or a network that is
 * down for the length of the request. A failed write is reported rather
 * than retried, because retrying means queueing and §9 rules that out
 * too; the honest failure mode here is a visible one, not a hidden backlog.
 */
export function SessionLogger() {
  const logCompleted = useMutation(api.sessions.logCompleted);
  const setSessionLogger = useTimerStore((s) => s.setSessionLogger);

  useEffect(() => {
    setSessionLogger((entry) => {
      void logCompleted(entry).catch((error) => {
        console.error("locked-in: session row was not written", error);
      });
    });

    return () => {
      // Unmounting must not leave a writer pointing at a mutation whose
      // provider is gone.
      setSessionLogger(null);
    };
  }, [logCompleted, setSessionLogger]);

  return null;
}
