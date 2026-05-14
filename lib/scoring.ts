import { CONTROLS, DOMAINS, getDomain } from "./controls";

export type ResponseMap = Record<string, "yes" | "partial" | "no" | "na">;

export type DomainScore = {
  code: string;
  name: string;
  color: string;
  score: number;
  rawScore: number;
  maxScore: number;
  gapCount: number;
};

export type AssessmentScore = {
  overallScore: number;
  rawScore: number;
  maxScore: number;
  passed: number;
  partial: number;
  gaps: number;
  domainScores: DomainScore[];
  criticalGaps: typeof CONTROLS;
};

const RESPONSE_POINTS: Record<string, number> = {
  yes: 1,
  partial: 0.5,
  no: 0,
  na: 0,
};

export function calculateScore(responses: ResponseMap): AssessmentScore {
  let rawScore = 0;
  let maxScore = 0;
  let passed = 0;
  let partial = 0;
  let gaps = 0;

  const domainScores: DomainScore[] = DOMAINS.map((domain) => {
    const controls = CONTROLS.filter((c) => c.domain_code === domain.code);
    let domainRaw = 0;
    let domainMax = 0;
    let domainGaps = 0;

    for (const control of controls) {
      const response = responses[control.id];
      if (!response || response === "na") continue;
      const points = RESPONSE_POINTS[response] * control.weight;
      domainRaw += points;
      domainMax += control.weight;
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

  for (const control of CONTROLS) {
    const response = responses[control.id];
    if (!response || response === "na") continue;
    rawScore += RESPONSE_POINTS[response] * control.weight;
    maxScore += control.weight;
    if (response === "yes") passed++;
    else if (response === "partial") partial++;
    else if (response === "no") gaps++;
  }

  const criticalGaps = CONTROLS.filter(
    (c) => responses[c.id] === "no" &&
    ["IR", "CA", "RA", "AU"].includes(c.domain_code)
  );

  return {
    overallScore: maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0,
    rawScore,
    maxScore,
    passed,
    partial,
    gaps,
    domainScores,
    criticalGaps,
  };
}
