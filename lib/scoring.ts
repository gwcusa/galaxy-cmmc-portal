import { getControlsForLevel, getDomainsForLevel } from "./controls";

export type ResponseValue = "yes" | "partial" | "no" | "na";
export type ResponseMap = Record<string, ResponseValue>;

export type DomainScore = {
  code: string;
  name: string;
  color: string;
  score: number;
  rawScore: number;
  maxScore: number;
  gapCount: number;
};

export type SprsDeduction = {
  controlId: string;
  points: number;
  reason: string;
};

/**
 * NIST SP 800-171 DoD Assessment Methodology (v1.2.1) score.
 * Starts at 110; each unimplemented requirement deducts its weighted value
 * (1, 3, or 5). Floor is -203. This is the score OSCs report to SPRS.
 */
export type SprsResult = {
  score: number;
  maxScore: 110;
  minScore: -203;
  deductions: SprsDeduction[];
  /** False when 3.12.4 (system security plan) is answered "no" — per the DoD
   * methodology an assessment cannot be scored without an SSP. */
  scoreable: boolean;
  /** CMMC Level 2 conditional certification: score >= 88 (80%) and every open
   * gap is POA&M-eligible (1-point items, or 3.13.11 at a 3-point deduction). */
  poamEligible: boolean;
  /** Open gaps that disqualify a POA&M (3- or 5-point items). */
  poamBlockers: string[];
  unansweredCount: number;
};

export type AssessmentScore = {
  /** Implementation-progress percentage (yes=1, partial=0.5) — display only. */
  overallScore: number;
  rawScore: number;
  maxScore: number;
  passed: number;
  partial: number;
  gaps: number;
  domainScores: DomainScore[];
  /** Unmet 5-point-weighted requirements — the highest-impact gaps. */
  criticalGaps: { id: string; description: string; weight: number }[];
  /** DoD Assessment Methodology score. Only computed for Level 2 targets
   * (Level 1 is a FAR 52.204-21 self-assessment with no SPRS score). */
  sprs: SprsResult | null;
};

const PROGRESS_POINTS: Record<string, number> = {
  yes: 1,
  partial: 0.5,
  no: 0,
  na: 0,
};

const SPRS_MIN = -203;
const POAM_MIN_SCORE = 88; // 80% of 110

function computeSprs(
  controls: ReturnType<typeof getControlsForLevel>,
  responses: ResponseMap
): SprsResult {
  const deductions: SprsDeduction[] = [];
  let scoreable = true;
  let unansweredCount = 0;
  const poamBlockers: string[] = [];

  for (const control of controls) {
    const response = responses[control.id];

    if (response === "yes") continue;
    if (response === "na") continue; // documented non-applicability — assessor validates

    if (!response) unansweredCount++;

    // 3.12.4: no point value — but without an SSP the assessment cannot be scored
    if (control.special_scoring === "ssp_required") {
      if (response === "no" || !response) scoreable = false;
      continue;
    }

    // Partial credit rules: 3.5.3 (MFA) and 3.13.11 (FIPS crypto) deduct 3
    // instead of 5 when partially implemented. All other partials deduct full
    // weight — the methodology has no partial credit elsewhere.
    let points = control.weight;
    let reason = response === "partial" ? "Partially implemented" : response === "no" ? "Not implemented" : "Not answered";
    if (response === "partial" && control.special_scoring === "partial_3") {
      points = 3;
      reason = "Partially implemented (reduced deduction per DoD methodology)";
    }

    deductions.push({ controlId: control.id, points, reason });

    // POA&M eligibility: only 1-point deductions may ride on a POA&M,
    // except 3.13.11 when deducted at 3 points.
    const poamAllowed = points === 1 || (control.id === "3.13.11" && points === 3);
    if (!poamAllowed) poamBlockers.push(control.id);
  }

  const totalDeduction = deductions.reduce((n, d) => n + d.points, 0);
  const score = Math.max(SPRS_MIN, 110 - totalDeduction);

  return {
    score,
    maxScore: 110,
    minScore: SPRS_MIN,
    deductions,
    scoreable,
    poamEligible: scoreable && score >= POAM_MIN_SCORE && poamBlockers.length === 0,
    poamBlockers,
    unansweredCount,
  };
}

export function calculateScore(responses: ResponseMap, targetLevel: 1 | 2 = 2): AssessmentScore {
  const controls = getControlsForLevel(targetLevel);
  const levelDomains = getDomainsForLevel(targetLevel);

  let rawScore = 0;
  let maxScore = 0;
  let passed = 0;
  let partial = 0;
  let gaps = 0;

  const domainScores: DomainScore[] = levelDomains.map((domain) => {
    const domainControls = controls.filter((c) => c.domain_code === domain.code);
    let domainRaw = 0;
    let domainMax = 0;
    let domainGaps = 0;

    for (const control of domainControls) {
      const response = responses[control.id];
      if (!response || response === "na") continue;
      domainRaw += PROGRESS_POINTS[response];
      domainMax += 1;
      if (response === "no") domainGaps++;
    }

    return {
      code: domain.code,
      name: domain.name,
      color: domain.color,
      score: domainMax > 0 ? Math.round((domainRaw / domainMax) * 100) : 0,
      rawScore: domainRaw,
      maxScore: domainMax,
      gapCount: domainGaps,
    };
  });

  for (const control of controls) {
    const response = responses[control.id];
    if (!response || response === "na") continue;
    rawScore += PROGRESS_POINTS[response];
    maxScore += 1;
    if (response === "yes") passed++;
    else if (response === "partial") partial++;
    else if (response === "no") gaps++;
  }

  const criticalGaps = controls
    .filter((c) => c.weight === 5 && (responses[c.id] === "no" || responses[c.id] === "partial"))
    .map((c) => ({ id: c.id, description: c.description, weight: c.weight }));

  return {
    overallScore: maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0,
    rawScore,
    maxScore,
    passed,
    partial,
    gaps,
    domainScores,
    criticalGaps,
    sprs: targetLevel === 2 ? computeSprs(controls, responses) : null,
  };
}
