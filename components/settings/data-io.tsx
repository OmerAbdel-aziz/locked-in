"use client";

/**
 * CSV session export + import — Task 25.
 *
 * Export: `sessions.exportLog` → `serializeSessionsCsv` (6 cols, Q7b) →
 * file download. Import: file → `parseSessionsCsv` (row-level errors, valid
 * rows survive) → `sessions.importRows` (unknown names reject per Q8, dupes
 * flagged). No full-log client scans beyond the user's own bounded export.
 *
 * Lives in `components/settings/` per the task's file ownership; rendered on
 * /login until the Task 16 settings dialog exists to host it.
 */

import { useRef, useState } from "react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { Button } from "@heroui/react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { parseSessionsCsv, serializeSessionsCsv } from "@/lib/csv";

export function DataIo() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const authed = !isLoading && isAuthenticated;
  const sessions = useQuery(api.sessions.exportLog, authed ? {} : "skip");
  const importRows = useMutation(api.sessions.importRows);
  const [report, setReport] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!authed) return null;

  const onExport = () => {
    if (!sessions) return;
    const text = serializeSessionsCsv(sessions);
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "locked-in-sessions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File) => {
    setReport(null);
    const text = await file.text();
    const { rows, errors } = parseSessionsCsv(text);
    if (rows.length === 0) {
      setReport(
        `No valid rows. ${errors.length} error(s): ` +
          errors
            .slice(0, 5)
            .map((e) => `row ${e.row}: ${e.error}`)
            .join("; "),
      );
      return;
    }
    const results = await importRows({ rows });
    const ok = results.filter((r) => r.ok).length;
    const dupes = results.filter((r) => r.ok && r.duplicate).length;
    const rejected = results.filter((r) => !r.ok).length;
    const firstErrors = results
      .filter((r) => !r.ok)
      .slice(0, 5)
      .map((r) => (!r.ok ? r.error : ""))
      .join("; ");
    setReport(
      `Imported ${ok - dupes} new, ${dupes} already present, ${rejected} rejected` +
        (errors.length > 0 ? `, ${errors.length} malformed CSV row(s) skipped` : "") +
        (firstErrors ? `. First errors: ${firstErrors}` : ""),
    );
  };

  return (
    <div className="rounded-2xl bg-surface-container-low px-5 py-4">
      <p className="text-sm font-bold text-on-surface">Session data (CSV)</p>
      <p className="mt-1 text-sm text-on-surface-variant">
        Export your session log, or import one back. Unknown task or project
        names are rejected — create them first.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <Button
          type="button"
          variant="primary"
          isDisabled={!sessions}
          onPress={onExport}
        >
          Export CSV
        </Button>
        <Button
          type="button"
          variant="secondary"
          onPress={() => fileInputRef.current?.click()}
        >
          Import CSV
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {report !== null && (
        <p className="mt-3 text-sm text-on-surface-variant">{report}</p>
      )}
    </div>
  );
}
