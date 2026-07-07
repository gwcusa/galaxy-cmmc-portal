import { describe, it, expect } from "vitest";
import { CONTROLS, DOMAINS } from "@/lib/controls";
import objectives from "@/data/assessment-objectives.json";

describe("NIST SP 800-171 Rev 2 catalog integrity", () => {
  it("has exactly 110 requirements with unique IDs", () => {
    expect(CONTROLS).toHaveLength(110);
    expect(new Set(CONTROLS.map((c) => c.id)).size).toBe(110);
  });

  it("uses only valid DoD point values summing to 313 (floor -203)", () => {
    for (const c of CONTROLS) expect([0, 1, 3, 5]).toContain(c.weight);
    expect(CONTROLS.reduce((n, c) => n + c.weight, 0)).toBe(313);
    // 3.12.4 is the only zero-weight (SSP special rule)
    expect(CONTROLS.filter((c) => c.weight === 0).map((c) => c.id)).toEqual(["3.12.4"]);
  });

  it("marks exactly the 17 FAR 52.204-21 practices as Level 1", () => {
    const level1 = CONTROLS.filter((c) => c.level === 1).map((c) => c.id).sort();
    expect(level1).toEqual(
      [
        "3.1.1", "3.1.2", "3.1.20", "3.1.22",
        "3.5.1", "3.5.2",
        "3.8.3",
        "3.10.1", "3.10.3", "3.10.4", "3.10.5",
        "3.13.1", "3.13.5",
        "3.14.1", "3.14.2", "3.14.4", "3.14.5",
      ].sort()
    );
  });

  it("has the special scoring flags on the right controls", () => {
    const special = Object.fromEntries(
      CONTROLS.filter((c) => c.special_scoring).map((c) => [c.id, c.special_scoring])
    );
    expect(special).toEqual({
      "3.5.3": "partial_3",
      "3.13.11": "partial_3",
      "3.12.4": "ssp_required",
    });
  });

  it("maps every control to a known family", () => {
    const codes = new Set(DOMAINS.map((d) => d.code));
    for (const c of CONTROLS) expect(codes.has(c.domain_code as "AC")).toBe(true);
  });

  it("has all 320 assessment objectives from NIST SP 800-171A", () => {
    const data = objectives as Record<string, { objectives: { id: string; text: string }[] }>;
    let total = 0;
    for (const c of CONTROLS) {
      expect(data[c.id], `objectives missing for ${c.id}`).toBeDefined();
      expect(data[c.id].objectives.length).toBeGreaterThan(0);
      total += data[c.id].objectives.length;
    }
    expect(total).toBe(320);
  });
});
