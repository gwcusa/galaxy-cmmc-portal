import { describe, it, expect } from "vitest";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import { getControlsForLevel } from "@/lib/controls";

function allYes(level: 1 | 2 = 2): ResponseMap {
  const responses: ResponseMap = {};
  for (const c of getControlsForLevel(level)) responses[c.id] = "yes";
  return responses;
}

describe("SPRS scoring (DoD Assessment Methodology)", () => {
  it("scores a perfect Level 2 assessment at 110", () => {
    const score = calculateScore(allYes(), 2);
    expect(score.sprs).not.toBeNull();
    expect(score.sprs!.score).toBe(110);
    expect(score.sprs!.scoreable).toBe(true);
    expect(score.sprs!.poamEligible).toBe(true);
    expect(score.sprs!.deductions).toHaveLength(0);
    expect(score.overallScore).toBe(100);
  });

  it("deducts 5 points for an unimplemented 5-point requirement and blocks POA&M", () => {
    const responses = allYes();
    responses["3.1.1"] = "no";
    const score = calculateScore(responses, 2);
    expect(score.sprs!.score).toBe(105);
    expect(score.sprs!.poamBlockers).toContain("3.1.1");
    expect(score.sprs!.poamEligible).toBe(false);
  });

  it("deducts 1 point for a 1-point requirement and stays POA&M eligible", () => {
    const responses = allYes();
    responses["3.1.3"] = "no"; // 1-point item
    const score = calculateScore(responses, 2);
    expect(score.sprs!.score).toBe(109);
    expect(score.sprs!.poamBlockers).toHaveLength(0);
    expect(score.sprs!.poamEligible).toBe(true);
  });

  it("gives partial credit for 3.5.3 MFA (deduct 3, not 5) but still blocks POA&M", () => {
    const responses = allYes();
    responses["3.5.3"] = "partial";
    const score = calculateScore(responses, 2);
    expect(score.sprs!.score).toBe(107);
    expect(score.sprs!.poamBlockers).toContain("3.5.3");
  });

  it("gives partial credit for 3.13.11 FIPS (deduct 3) and allows POA&M", () => {
    const responses = allYes();
    responses["3.13.11"] = "partial";
    const score = calculateScore(responses, 2);
    expect(score.sprs!.score).toBe(107);
    expect(score.sprs!.poamBlockers).toHaveLength(0);
    expect(score.sprs!.poamEligible).toBe(true);
  });

  it("deducts full weight for partial implementation of ordinary requirements", () => {
    const responses = allYes();
    responses["3.1.1"] = "partial"; // 5-point, no partial-credit rule
    const score = calculateScore(responses, 2);
    expect(score.sprs!.score).toBe(105);
  });

  it("cannot be scored without an SSP (3.12.4)", () => {
    const responses = allYes();
    responses["3.12.4"] = "no";
    const score = calculateScore(responses, 2);
    expect(score.sprs!.scoreable).toBe(false);
    expect(score.sprs!.poamEligible).toBe(false);
  });

  it("does not deduct for N/A responses", () => {
    const responses = allYes();
    responses["3.1.16"] = "na"; // no wireless
    responses["3.1.17"] = "na";
    const score = calculateScore(responses, 2);
    expect(score.sprs!.score).toBe(110);
  });

  it("floors at -203 when nothing is implemented", () => {
    const responses: ResponseMap = {};
    for (const c of getControlsForLevel(2)) responses[c.id] = "no";
    const score = calculateScore(responses, 2);
    expect(score.sprs!.score).toBe(-203);
    expect(score.sprs!.scoreable).toBe(false); // includes 3.12.4
  });

  it("blocks POA&M below the 88-point minimum even with only 1-point gaps", () => {
    const responses = allYes();
    // 23 one-point gaps → 110-23 = 87 < 88
    const onePointers = getControlsForLevel(2).filter((c) => c.weight === 1).slice(0, 23);
    for (const c of onePointers) responses[c.id] = "no";
    const score = calculateScore(responses, 2);
    expect(score.sprs!.score).toBe(87);
    expect(score.sprs!.poamBlockers).toHaveLength(0);
    expect(score.sprs!.poamEligible).toBe(false);
  });
});

describe("Level 1 (FAR 52.204-21)", () => {
  it("has exactly 17 practices and no SPRS score", () => {
    expect(getControlsForLevel(1)).toHaveLength(17);
    const score = calculateScore(allYes(1), 1);
    expect(score.sprs).toBeNull();
    expect(score.overallScore).toBe(100);
  });
});
