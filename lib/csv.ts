/**
 * CSV session import/export — Phase 8, Task 25 (pure logic).
 *
 * Locked format (Q7 ruling b): 6 columns, header included:
 *   startedAt,completedAt,phase,task,project,tzOffsetAtCompletion
 * - startedAt/completedAt: ISO-8601 instants (export writes
 *   `new Date(ms).toISOString()`; import accepts ISO strings or epoch-ms
 *   numbers for foreign-tool tolerance).
 * - phase: focus | short | long.
 * - task/project: display names (may be empty = unbound). Q8: unknown names
 *   are rejected at the mutation layer, not here — the parser accepts any
 *   string and never creates tasks/projects.
 * - tzOffsetAtCompletion: integer minutes, -720..840 (same bounds as
 *   `convex/sessions.ts`). Required: without it a round-trip would shift
 *   sessions across local days and corrupt streak/"Today's Output".
 *
 * Malformed rows never abort the import: `parseSessionsCsv` returns
 * `{ rows, errors }` with 1-based data-row numbers (header = row 1, so first
 * data row = row 2). Valid rows are importable even when others fail.
 */

export const CSV_HEADER =
  "startedAt,completedAt,phase,unit,roadmap,tzOffsetAtCompletion";

export type CsvPhase = "focus" | "short" | "long";

export interface CsvSession {
  startedAt: number;
  completedAt: number;
  phase: CsvPhase;
  /** Task display name; "" = unbound. */
  task: string;
  /** Project display name; "" = unbound. */
  project: string;
  tzOffsetAtCompletion: number;
}

export interface CsvRowError {
  /** 1-based line number in the source text (header = 1). */
  row: number;
  error: string;
}

const MIN_TIMESTAMP_MS = Date.UTC(2020, 0, 1);
const MIN_TZ = -720;
const MAX_TZ = 840;
const PHASES: ReadonlySet<string> = new Set(["focus", "short", "long"]);

function escapeField(field: string): string {
  if (
    field.includes(",") ||
    field.includes('"') ||
    field.includes("\n") ||
    field.includes("\r")
  ) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/** Split one CSV line respecting RFC-4180 quotes. */
function splitLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function parseInstant(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  if (/^-?\d+$/.test(t)) {
    const ms = Number(t);
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : ms;
}

export function serializeSessionsCsv(sessions: CsvSession[]): string {
  const lines = [CSV_HEADER];
  for (const s of sessions) {
    lines.push(
      [
        new Date(s.startedAt).toISOString(),
        new Date(s.completedAt).toISOString(),
        s.phase,
        escapeField(s.task),
        escapeField(s.project),
        String(s.tzOffsetAtCompletion),
      ].join(","),
    );
  }
  return lines.length > 1 ? lines.join("\n") + "\n" : lines.join("\n") + "\n";
}

export function parseSessionsCsv(text: string): {
  rows: CsvSession[];
  errors: CsvRowError[];
} {
  const rows: CsvSession[] = [];
  const errors: CsvRowError[] = [];
  const lines = text.split(/\r?\n/);
  // Drop trailing empty line(s) from the final newline, but keep interior blanks as errors.
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === "")) {
    return { rows, errors: [{ row: 1, error: "empty CSV: missing header" }] };
  }
  const header = splitLine(lines[0]).map((h) => h.trim());
  const expected = CSV_HEADER.split(",");
  // Accept both the new vocabulary and the legacy "task"/"project" headers.
  const legacy = [
    "startedAt",
    "completedAt",
    "phase",
    "task",
    "project",
    "tzOffsetAtCompletion",
  ];
  const headerOk =
    header.length === expected.length &&
    (header.every((h, i) => h === expected[i]) ||
      header.every((h, i) => h === legacy[i]));
  if (!headerOk) {
    return {
      rows,
      errors: [
        {
          row: 1,
          error: `bad header: expected "${CSV_HEADER}"`,
        },
      ],
    };
  }
  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1; // 1-based line number
    const line = lines[i];
    if (line.trim() === "") {
      errors.push({ row: rowNum, error: "empty row" });
      continue;
    }
    const fields = splitLine(line);
    if (fields.length !== 6) {
      errors.push({
        row: rowNum,
        error: `expected 6 columns, got ${fields.length}`,
      });
      continue;
    }
    const [startRaw, endRaw, phaseRaw, taskRaw, projectRaw, tzRaw] = fields;
    const phase = phaseRaw.trim();
    if (!PHASES.has(phase)) {
      errors.push({
        row: rowNum,
        error: `bad phase "${phaseRaw.trim()}": expected focus|short|long`,
      });
      continue;
    }
    const startedAt = parseInstant(startRaw);
    const completedAt = parseInstant(endRaw);
    if (startedAt === null || !Number.isFinite(startedAt)) {
      errors.push({ row: rowNum, error: `bad startedAt "${startRaw.trim()}"` });
      continue;
    }
    if (completedAt === null || !Number.isFinite(completedAt)) {
      errors.push({
        row: rowNum,
        error: `bad completedAt "${endRaw.trim()}"`,
      });
      continue;
    }
    if (startedAt < MIN_TIMESTAMP_MS) {
      errors.push({ row: rowNum, error: "startedAt is implausibly early" });
      continue;
    }
    if (completedAt < startedAt) {
      errors.push({
        row: rowNum,
        error: "completedAt must not precede startedAt",
      });
      continue;
    }
    const tzText = tzRaw.trim();
    if (!/^-?\d+$/.test(tzText)) {
      errors.push({
        row: rowNum,
        error: `bad tzOffsetAtCompletion "${tzText}": expected integer minutes`,
      });
      continue;
    }
    const tz = Number(tzText);
    if (tz < MIN_TZ || tz > MAX_TZ) {
      errors.push({
        row: rowNum,
        error: `tzOffsetAtCompletion ${tz} out of range -720..840`,
      });
      continue;
    }
    rows.push({
      startedAt,
      completedAt,
      phase: phase as CsvPhase,
      task: taskRaw,
      project: projectRaw,
      tzOffsetAtCompletion: tz,
    });
  }
  return { rows, errors };
}
