"use client";

import { useMutation, useQuery } from "convex/react";
import { Button } from "@heroui/react";

import { api } from "@/convex/_generated/api";
import { NavPill } from "@/components/chrome/nav-pill";
import { AccountButton } from "@/components/auth/account-button";
import { StreakBadge } from "@/components/chrome/streak-badge";

export default function TemplatesPage() {
  const templates = useQuery(api.templates.browse);
  const fork = useMutation(api.templates.fork);
  const report = useMutation(api.templates.report);

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
          Templates
        </h1>
        {templates === undefined ? null : templates.length === 0 ? (
          <p className="rounded-xl bg-surface-container-low/50 px-4 py-6 text-center text-sm text-on-surface-variant/70">
            No templates yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {templates.map((t) => (
              <li key={t._id} className="rounded-xl bg-surface-container-low p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-on-surface">
                    {t.name}
                  </div>
                  <div className="text-xs text-on-surface-variant">
                    {new Date(t.publishedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onPress={() =>
                      void fork({ templateId: t._id }).catch((e) =>
                        console.error(e),
                      )
                    }
                  >
                    Fork
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onPress={() =>
                      void report({ templateId: t._id }).catch((e) =>
                        console.error(e),
                      )
                    }
                  >
                    Report
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
