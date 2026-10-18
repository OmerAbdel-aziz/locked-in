"use client";

/**
 * Sign-in route — Task 23 (magic link, ADR-002 optional upgrade).
 *
 * Anonymous users arrive here via "Sync your data" and enter an email; the
 * magic link returns them here (or anywhere — `MergePrompt` also renders on
 * this page for the post-link state). Signed-in account users see their
 * status plus the merge prompt and CSV data tools. No sign-in wall anywhere
 * else: the rest of the app works anonymously (PRD §10.1).
 */

import { useState } from "react";
import Link from "next/link";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { Button } from "@heroui/react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { MergePrompt } from "@/components/auth/merge-prompt";
import { DataIo } from "@/components/settings/data-io";

export default function LoginPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.viewer, isLoading ? "skip" : {});
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    void signIn("email", { email }).then(
      () => setSent(true),
      (err: unknown) =>
        setError(err instanceof Error ? err.message : "Sign-in failed"),
    );
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-8 py-16">
      <Link
        href="/"
        className="text-xs font-bold uppercase tracking-widest text-on-surface-variant"
      >
        ← Back
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-on-surface">
        Sync your data
      </h1>

      {isLoading || viewer === undefined ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : isAuthenticated && viewer !== null && !viewer.isAnonymous ? (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-on-surface-variant">
            Signed in as {viewer.email}.
          </p>
          <MergePrompt />
          <DataIo />
        </div>
      ) : sent ? (
        <p className="text-sm text-on-surface">
          Check your inbox — a sign-in link is on its way to {email}. It
          expires in 60 minutes.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm text-on-surface-variant">
            Enter your email and we&apos;ll send a sign-in link. Your data on
            this device stays put until you choose to merge it.
          </p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-2xl bg-surface-container-low px-5 py-3 text-sm text-on-surface outline-none"
          />
          {error !== null && <p className="text-sm text-error">{error}</p>}
          <Button type="submit" variant="primary">
            Send sign-in link
          </Button>
        </form>
      )}
    </div>
  );
}
