"use client";

/**
 * Header entry for sync — Task 23.
 *
 * Anonymous users see "Sync your data" (a link, never a prompt — PRD §10.1).
 * Signed-in users see their email + a sign-out action.
 * Renders nothing while identity settles (same "skip"-window as Task 10).
 *
 * The sign-out control lives in `SignedInBadge` (own component) so this
 * module's top-level hooks are only the two every existing page test already
 * stubs (`useConvexAuth`, `useQuery`): account chrome must never break the
 * Task 7/10 gates that render the page without an auth provider.
 */

import Link from "next/link";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { Button } from "@heroui/react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

function SignedInBadge({ email }: { email: string | null }) {
  const { signOut } = useAuthActions();
  return (
    <div className="flex items-center gap-3">
      {email !== null && (
        <span className="text-xs font-bold text-on-surface-variant">
          {email}
        </span>
      )}
      <Button
        size="sm"
        variant="secondary"
        onPress={() => void signOut()}
      >
        Sign out
      </Button>
    </div>
  );
}

export function AccountButton() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.viewer, isLoading ? "skip" : {});

  if (isLoading || !isAuthenticated || viewer === undefined) {
    return null;
  }
  if (viewer === null || viewer.isAnonymous) {
    return (
      <Link
        href="/login"
        className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"
      >
        Sync your data
      </Link>
    );
  }
  return <SignedInBadge email={viewer.email} />;
}
