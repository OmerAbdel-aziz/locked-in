export interface RoadmapShNode {
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  estimate?: number;
  hours?: number;
  optional?: boolean;
  skipped?: boolean;
  time?: number;
}

export interface RoadmapShGroup {
  id?: string;
  title?: string;
  name?: string;
  nodes?: RoadmapShNode[];
  children?: RoadmapShNode[];
}

export interface RoadmapShPayload {
  title?: string;
  name?: string;
  groups?: RoadmapShGroup[];
  nodes?: RoadmapShNode[];
  children?: RoadmapShGroup[];
}

export interface ParsedUnit {
  title: string;
  estimate: number;
  known?: boolean;
  optional?: boolean;
}

export interface ParsedMilestone {
  name: string;
  units: ParsedUnit[];
}

export interface ParsedRoadmap {
  name: string;
  milestones: ParsedMilestone[];
}

function unitTitle(n: any): string {
  return String(n.title ?? n.name ?? n.data?.label ?? "").trim();
}

function unitEstimate(n: RoadmapShNode): number {
  const raw = n.estimate ?? n.hours ?? n.time ?? 0;
  const n2 = Number(raw);
  if (!Number.isFinite(n2) || n2 < 0) return 0;
  // clamp to 0..8 leaves
  return Math.min(8, Math.max(0, Math.round(n2)));
}

function parseNode(n: RoadmapShNode): ParsedUnit | null {
  const title = unitTitle(n);
  if (title.length === 0) return null;
  return {
    title,
    estimate: unitEstimate(n),
    optional: n.optional === true || n.skipped === true,
  };
}

export function parseRoadmapSh(payload: RoadmapShPayload): ParsedRoadmap {
  const rawTitle: any = payload.title ?? payload.name;
  const name = (typeof rawTitle === "object" && rawTitle !== null
    ? (rawTitle.page ?? rawTitle.card ?? rawTitle.label ?? "Imported roadmap")
    : rawTitle ?? "Imported roadmap").toString().trim() || "Imported roadmap";

  const groups: RoadmapShGroup[] =
    payload.groups ?? payload.children ?? [];

  const milestones: ParsedMilestone[] = [];

  if (groups.length > 0) {
    for (const g of groups) {
      const gname = (String(g.title ?? g.name ?? "Milestone")).trim() || "Milestone";
      const nodes = g.nodes ?? g.children ?? [];
      const units = nodes
        .map(parseNode)
        .filter((u): u is ParsedUnit => u !== null);
      milestones.push({ name: gname, units });
    }
  }

  // Top-level nodes (not in any group) become their own milestone.
  const topNodes = (payload.nodes ?? []).filter((n: any) =>
    n.type === "topic" || n.type === "subtopic",
  );
  const topUnits = topNodes.map(parseNode).filter((u): u is ParsedUnit => u !== null);
  if (topUnits.length > 0) {
    milestones.push({ name: "General", units: topUnits });
  }

  if (milestones.length === 0) {
    milestones.push({ name: "Imported", units: [] });
  }

  return { name, milestones };
}