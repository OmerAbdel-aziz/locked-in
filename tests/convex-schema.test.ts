import { describe, expect, it } from "vitest";

import schema from "@/convex/schema";

/**
 * Task 3 gate: PRD §6 field-for-field, plus the index coverage this task
 * requires. Catches a drifted field, a dropped table, or an index that
 * silently disappears from convex/schema.ts.
 *
 * Reads the schema object Convex itself builds, so this is the same
 * definition the deployment accepted — not a hand-maintained mirror.
 */

type Validator = {
  isOptional: "optional" | "required";
  kind: string;
  /** union members (Convex's name for the parts of a union validator) */
  members?: Validator[];
  /** value of a `literal` validator */
  value?: unknown;
  fields?: Record<string, Validator>;
};
type Table = {
  validator: Validator;
  indexes: { indexDescriptor: string; fields: string[] }[];
};
type ConvexSchema = { tables: Record<string, Table> };

const s = schema as unknown as ConvexSchema;

/** PRD §6 as literal data: table -> field -> required? */
const PRD_6: Record<string, Record<string, boolean>> = {
  users: { email: true, createdAt: true },
  identities: {
    anonymousId: false,
    deviceId: false,
    userId: false,
    mergedAt: false,
  },
  projects: { ownerId: true, name: true, archivedAt: false },
  tasks: {
    ownerId: true,
    title: true,
    projectId: false,
    estimate: true,
    order: true,
    completedAt: false,
    activeFlag: true,
  },
  sessions: {
    ownerId: true,
    startedAt: true,
    completedAt: true,
    phase: true,
    taskId: false,
    projectId: false,
    tzOffsetAtCompletion: true,
  },
  settings: {
    ownerId: true,
    focusMin: true,
    shortMin: true,
    longMin: true,
    sessionCount: true,
    autoStartBreak: true,
    autoStartFocus: true,
    notificationsEnabled: true,
  },
};

const tables = Object.keys(PRD_6);

function fieldsOf(table: string): Record<string, Validator> {
  const f = s.tables[table]?.validator.fields;
  if (!f) throw new Error(`table ${table} missing from schema`);
  // Convex injects _id/_creationTime; PRD §6 lists authored fields only.
  return Object.fromEntries(
    Object.entries(f).filter(([k]) => k !== "_id" && k !== "_creationTime"),
  );
}

function indexOf(table: string, name: string): string[] | undefined {
  return s.tables[table]?.indexes.find((i) => i.indexDescriptor === name)
    ?.fields;
}

describe("convex/schema vs PRD 6", () => {
  it("defines exactly the six PRD tables, no more and no fewer", () => {
    expect(Object.keys(s.tables).sort()).toEqual([...tables].sort());
  });

  it("matches every table field-for-field, including optionality", () => {
    const drift: string[] = [];

    for (const [table, spec] of Object.entries(PRD_6)) {
      const actual = fieldsOf(table);

      for (const field of Object.keys(spec)) {
        if (!(field in actual)) drift.push(`${table}.${field}: missing`);
      }
      for (const field of Object.keys(actual)) {
        if (!(field in spec)) drift.push(`${table}.${field}: not in PRD 6`);
      }
      for (const [field, required] of Object.entries(spec)) {
        const v = actual[field];
        if (!v) continue;
        const want = required ? "required" : "optional";
        if (v.isOptional !== want) {
          drift.push(
            `${table}.${field}: ${v.isOptional}, PRD 6 says ${want}`,
          );
        }
      }
    }

    expect(drift).toEqual([]);
  });

  it("types the two fields PRD 6 calls out explicitly", () => {
    // tzOffsetAtCompletion drives day grouping: a number, not a date string.
    expect(fieldsOf("sessions").tzOffsetAtCompletion.kind).toBe("float64");
    // projectId on sessions is a *snapshot*, not a live relation — same
    // scalar type as tasks.projectId, captured at session start.
    expect(fieldsOf("sessions").projectId.kind).toBe(
      fieldsOf("tasks").projectId.kind,
    );
    // estimate is 0-8 leaves. Convex has no range validator, so the bound is
    // enforced in the mutation (Task 9) — here we only pin that it's numeric.
    expect(fieldsOf("tasks").estimate.kind).toBe("float64");
    // Fractional ordering requires a float, never an integer rank.
    expect(fieldsOf("tasks").order.kind).toBe("float64");
  });

  it("restricts phase to focus | short | long", () => {
    const phase = fieldsOf("sessions").phase;
    expect(phase.kind).toBe("union");

    // Convex spells a union's parts `members`; literals carry `.value`.
    const literals = (phase.members ?? [])
      .filter((m) => m.kind === "literal")
      .map((m) => m.value)
      .filter((v): v is string => typeof v === "string")
      .sort();
    expect(literals).toEqual(["focus", "long", "short"]);
  });

  it("persists nothing ADR 3 says must be derived", () => {
    // Streaks, leaf counts and daily totals are computed from the session
    // log at read time — none may appear as stored columns.
    const forbidden = /streak|count|total|score|aggregate|daily/i;
    const stored = Object.keys(fieldsOf("sessions"));
    expect(stored.filter((f) => forbidden.test(f))).toEqual([]);
  });
});

describe("index coverage (Task 3 acceptance)", () => {
  it("covers owner + completedAt range for stats", () => {
    expect(indexOf("sessions", "by_owner_completed")).toEqual([
      "ownerId",
      "completedAt",
    ]);
  });

  it("covers owner + taskId", () => {
    expect(indexOf("sessions", "by_owner_task")).toEqual([
      "ownerId",
      "taskId",
    ]);
  });

  it("covers owner + active tasks in fractional order", () => {
    // One index serves both "open tasks for this owner" and their ordering.
    expect(indexOf("tasks", "by_owner_active")).toEqual([
      "ownerId",
      "activeFlag",
      "order",
    ]);
  });

  it("covers owner + day derivations via a bounded completedAt range", () => {
    // A calendar day at tzOffsetAtCompletion is a [start, end) range on
    // completedAt, so this index — not a denormalized dayKey — is what day
    // grouping scans.
    const idx = indexOf("sessions", "by_owner_completed") ?? [];
    expect(idx[0]).toBe("ownerId");
    expect(idx[1]).toBe("completedAt");
    // The field the range-to-local-day conversion depends on must exist.
    expect(fieldsOf("sessions").tzOffsetAtCompletion).toBeDefined();
  });

  it("gives every remaining table an owner-scoped index", () => {
    for (const table of ["projects", "tasks", "settings"]) {
      expect(indexOf(table, "by_owner")).toEqual(["ownerId"]);
    }
    // identities resolves the owner through the link table (ADR-002).
    expect(indexOf("identities", "by_anonymousId")).toEqual(["anonymousId"]);
    expect(indexOf("identities", "by_userId")).toEqual(["userId"]);
  });

  it("supports merge-on-sign-in project dedupe by name", () => {
    // ADR-002: projects union deduped by name, case-insensitive.
    expect(indexOf("projects", "by_owner_name")).toEqual(["ownerId", "name"]);
  });
});
