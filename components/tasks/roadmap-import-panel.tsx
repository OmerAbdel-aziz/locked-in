"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { Button, Input } from "@heroui/react";

import { api } from "@/convex/_generated/api";

export function RoadmapImportPanel() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const importFromUrl = useAction(api.roadmapImport.importFromUrl);

  async function run() {
    setStatus("Importing…");
    try {
      const projectId = await importFromUrl({ url });
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
