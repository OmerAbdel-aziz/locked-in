"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@heroui/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function TemplatePanel({ projectId }: { projectId: Id<"projects"> }) {
  const publish = useMutation(api.templates.publish);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <section aria-label="Templates" className="space-y-2 rounded-xl bg-surface-container-low p-4">
      <div className="text-sm font-semibold text-on-surface">Templates</div>
      <Button
        type="button"
        variant="ghost"
        onPress={() =>
          void publish({ projectId })
            .then((id) => setStatus(`Published ${id}`))
            .catch((e) => setStatus(`Failed: ${String(e)}`))
        }
      >
        Publish this roadmap as a template
      </Button>
      {status ? <p className="text-xs text-on-surface-variant">{status}</p> : null}
    </section>
  );
}
