import { describe, expect, it } from "vitest";

import {
  CSV_HEADER,
  parseSessionsCsv,
  serializeSessionsCsv,
  type CsvSession,
} from "../lib/csv";

const ROW: CsvSession = {
  startedAt: Date.UTC(2026, 9, 14, 10, 0, 0),
  completedAt: Date.UTC(2026, 9, 14, 10, 25, 0),
  phase: "focus",
  task: "Write",
  project: "Deep Work",
  tzOffsetAtCompletion: -300,
};

describe("CSV 6-col format (Q7b)", () => {
  it("serializes the canonical header", () => {
    const text = serializeSessionsCsv([ROW]);
    expect(text.split("\n")[0]).toBe(CSV_HEADER);
    expect(CSV_HEADER.split(",")).toEqual([
      "startedAt",
      "completedAt",
      "phase",
      "task",
      "project",
      "tzOffsetAtCompletion",
    ]);
  });

  it("export -> import round-trip is lossless (PRD §10.5)", () => {
    const rows: CsvSession[] = [
      ROW,
      {
        startedAt: Date.UTC(2026, 9, 14, 11, 0, 0),
        completedAt: Date.UTC(2026, 9, 14, 11, 5, 0),
        phase: "short",
        task: "",
        project: "",
        tzOffsetAtCompletion: 0,
      },
      {
        startedAt: Date.UTC(2026, 9, 15, 1, 0, 0),
        completedAt: Date.UTC(2026, 9, 15, 1, 25, 0),
        phase: "long",
        task: 'Read, "deep" thoughts',
        project: "P, Q",
        tzOffsetAtCompletion: 330,
      },
    ];
    const text = serializeSessionsCsv(rows);
    const { rows: back, errors } = parseSessionsCsv(text);
    expect(errors).toEqual([]);
    expect(back).toEqual(rows);
  });

  it("accepts epoch-ms timestamps (foreign tools)", () => {
    const text = [
      CSV_HEADER,
      `${ROW.startedAt},${ROW.completedAt},focus,Write,,0`,
    ].join("\n");
    const { rows, errors } = parseSessionsCsv(text);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ startedAt: ROW.startedAt, phase: "focus" });
  });

  it("malformed rows are reported with row numbers, valid rows survive", () => {
    const good = `${new Date(ROW.startedAt).toISOString()},${new Date(ROW.completedAt).toISOString()},focus,Write,,0`;
    const text = [
      CSV_HEADER,
      good,
      `bad-time,${new Date(ROW.completedAt).toISOString()},focus,Write,,0`,
      `${new Date(ROW.startedAt).toISOString()},${new Date(ROW.completedAt).toISOString()},nap,Write,,0`,
      "only,three,cols",
      `${new Date(ROW.startedAt).toISOString()},${new Date(ROW.completedAt).toISOString()},focus,Write,,9999`,
    ].join("\n");
    const { rows, errors } = parseSessionsCsv(text);
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.row)).toEqual([3, 4, 5, 6]);
  });

  it("completedAt before startedAt is rejected", () => {
    const text = [
      CSV_HEADER,
      `${new Date(ROW.completedAt).toISOString()},${new Date(ROW.startedAt).toISOString()},focus,Write,,0`,
    ].join("\n");
    const { rows, errors } = parseSessionsCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it("bad header fails fast on row 1", () => {
    const { rows, errors } = parseSessionsCsv("a,b,c\n1,2,3");
    expect(rows).toHaveLength(0);
    expect(errors[0].row).toBe(1);
  });
});
