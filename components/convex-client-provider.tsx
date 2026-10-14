"use client";

import { ConvexAuthProvider, useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { useEffect, type ReactNode } from "react";

/**
 * Client-side Convex wiring — Task 4.
 *
 * Everything downstream in `convex/` derives its owner from the session via
 * `resolveOwner`, so the session has to exist before any query or mutation
 * runs. This component is the only place that establishes it, and it does so
 * at the root so no page can forget to.
 *
 * No new dependency: `@convex-dev/auth` already ships these React bindings.
 *
 * Deliberately *not* `@convex-dev/auth/nextjs`: that export is just
 * `ConvexProviderWithAuth` and never renders `AuthProvider`, so it supplies
 * no auth context — `useConvexAuth()` returns undefined and any consumer
 * throws. It exists for the server-session (RSC cookie) flow, which this
 * app doesn't use. `ConvexAuthProvider` is the one that provides both the
 * auth contexts and the Convex hooks.
 */

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Signs the visitor in anonymously on first load — silently.
 *
 * ADR-002: the app is anonymous-first, so there is no login wall and no
 * prompt. Returning visitors are *not* re-signed-in: the provider restores
 * the stored tokens on mount and reports `isAuthenticated`, so this only
 * fires for a genuinely new identity.
 *
 * Re-runs when `isLoading` settles rather than on mount alone, because the
 * restored-session check is only meaningful once the provider has finished
 * reading storage.
 */
function AnonymousIdentity() {
  const { signIn } = useAuthActions();
  const { isLoading, isAuthenticated } = useConvexAuth();

  useEffect(() => {
    if (isLoading || isAuthenticated) {
      return;
    }
    void signIn("anonymous").catch(() => {
      // A failed first-load sign-in must not crash the shell. The visitor
      // simply has no owner yet; the next reload retries, and any Convex
      // call they make is rejected by `resolveOwner` in the meantime.
    });
  }, [isLoading, isAuthenticated, signIn]);

  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <AnonymousIdentity />
      {children}
    </ConvexAuthProvider>
  );
}
