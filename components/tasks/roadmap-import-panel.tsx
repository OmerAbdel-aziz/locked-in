"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Button, Input } from "@heroui/react";

import { api } from "@/convex/_generated/api";
import { parseRoadmapSh } from "@/lib/roadmapsh";

export function RoadmapImportPanel() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const commit = useMutation(api.roadmapImport.commit);

  async function run() {
    setStatus("Fetching…");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch failed (${res.status})`);
      const payload = await res.json();
      const parsed = parseRoadmapSh(payload);
      const projectId = await commit({
        name: parsed.name,
        milestones: parsed.milestones,
      });
      setStatus(`Imported roadmap ${projectId}`);
      setUrl("");
    } catch (error) {
      setStatus(`Failed: ${String(error)}`);
    }
  }

  return (
    <section aria-label="Import roadmap" className="space-y-2">
      <Input
        aria-label="Roadmap.sh URL"
        placeholder="https://roadmap.sh/…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Button
        type="button"
        variant="ghost"
        isDisabled={!url.trim()}
        onPress={() => void run()}
      >
        Import from roadmap.sh
      </Button>
      {status ? (
        <p className="text-xs text-on-surface-variant">{status}</p>
      ) : null}
    </section>
  );
}
