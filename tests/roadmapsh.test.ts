import { describe, expect, it } from "vitest";

import { parseRoadmapSh } from "@/lib/roadmapsh";

describe("roadmap.sh parser", () => {
  it("maps groups to milestones and nodes to units", () => {
    const payload = {
      title: "Frontend",
      groups: [
        {
          title: "Basics",
          nodes: [
            { title: "HTML", estimate: 2 },
            { title: "CSS", hours: 3, optional: true },
          ],
        },
      ],
      nodes: [{ title: "Capstone", time: 5 }],
    };
    const result = parseRoadmapSh(payload);
    expect(result.name).toBe("Frontend");
    expect(result.milestones).toHaveLength(2);
    expect(result.milestones[0].name).toBe("Basics");
    expect(result.milestones[0].units).toHaveLength(2);
    expect(result.milestones[0].units[1].estimate).toBe(3);
    expect(result.milestones[0].units[1].optional).toBe(true);
    expect(result.milestones[1].units[0].title).toBe("Capstone");
  });

  it("returns an empty milestone when there is nothing", () => {
    const result = parseRoadmapSh({});
    expect(result.milestones).toHaveLength(1);
    expect(result.milestones[0].units).toHaveLength(0);
  });
});
