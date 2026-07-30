import { AssessmentScore } from "@/lib/scoring";
import { CONTROLS } from "@/lib/controls";

const descOf = (id: string) => CONTROLS.find((c) => c.id === id)?.description ?? "";

/**
 * Build an SPRS-submission-ready worksheet (markdown): the DoD Assessment
 * Methodology score, the itemized deductions, POA&M eligibility per
 * 32 CFR 170.21, and a senior-official affirmation block. Level 1 engagements
 * get a FAR 52.204-21 pass/fail summary instead (no SPRS score).
 */
export function buildSprsWorksheet(args: {
  companyName: string;
  level: 1 | 2;
  score: AssessmentScore;
  generatedAt: string;
}): string {
  const { companyName, level, score, generatedAt } = args;
  const date = new Date(generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const header = `# CMMC Self-Assessment Worksheet — ${companyName}

*NIST SP 800-171 Rev 2 · CMMC Level ${level} · Generated ${date}*
*Prepared by Galaxy Consulting, LLC — verify before submitting to SPRS.*
`;

  if (level === 1 || !score.sprs) {
    const met = score.passed;
    const total = score.passed + score.partial + score.gaps;
    const compliant = score.gaps === 0 && score.partial === 0;
    return `${header}
## CMMC Level 1 (FAR 52.204-21)

Level 1 is a pass/fail self-assessment of 17 basic safeguarding requirements. **No POA&M is permitted** — every practice must be MET.

- **Practices MET:** ${met} of ${total}
- **Result:** ${compliant ? "MET — all applicable practices implemented" : "NOT MET — one or more practices are not fully implemented"}

${affirmationBlock(companyName)}`;
  }

  const s = score.sprs;
  const deductionRows =
    s.deductions.length === 0
      ? "| — | — | — | (perfect score — no deductions) |"
      : s.deductions
          .slice()
          .sort((a, b) => b.points - a.points)
          .map((d) => `| ${d.controlId} | ${trunc(descOf(d.controlId), 70)} | −${d.points} | ${d.reason} |`)
          .join("\n");

  const eligibility = !s.scoreable
    ? "**NOT SCOREABLE** — a System Security Plan (3.12.4) must be in place before an SPRS score can be reported."
    : s.poamEligible
      ? "**Eligible for Conditional Level 2** — score ≥ 88 (80%) and every open gap is POA&M-eligible."
      : `**Not eligible for Conditional Level 2.** ${
          s.score < 88 ? `Score ${s.score} is below the 88/110 minimum. ` : ""
        }${s.poamBlockers.length ? `Must-fix gaps that cannot ride on a POA&M: ${s.poamBlockers.join(", ")}.` : ""}`;

  return `${header}
## SPRS Score (DoD Assessment Methodology)

| Metric | Value |
|---|---|
| **Score** | **${s.scoreable ? s.score : "N/A (no SSP)"} of 110** |
| Total deductions | −${s.deductions.reduce((n, d) => n + d.points, 0)} |
| Open gaps | ${score.gaps + score.partial} |
| Unanswered requirements | ${s.unansweredCount} |

${eligibility}

## Itemized Deductions

| Requirement | Description | Points | Reason |
|---|---|---|---|
${deductionRows}

## POA&M Notes (32 CFR 170.21)

- Conditional Level 2 requires a score ≥ 88 (80% of 110) with every open gap POA&M-eligible, closed within **180 days**.
- Only 1-point requirements may be placed on a POA&M (plus 3.13.11 at a 3-point deduction).
- These six requirements can **never** be on a POA&M and must be MET before assessment: **3.1.20, 3.1.22, 3.10.3, 3.10.4, 3.10.5, 3.12.4**.
${s.poamBlockers.length ? `- **Current blockers:** ${s.poamBlockers.join(", ")}` : "- No POA&M blockers among the current gaps."}

${affirmationBlock(companyName)}`;
}

function affirmationBlock(companyName: string): string {
  return `## Affirmation of Compliance

Per 32 CFR 170.22, a senior official must affirm continuing compliance in SPRS.

> I, the undersigned, am a senior official of **${companyName}** and affirm that the information in this self-assessment is accurate and that ${companyName} has implemented and will maintain the security requirements reflected above.

| Field | |
|---|---|
| Senior Official Name | ________________________ |
| Title | ________________________ |
| Date | ________________________ |
| Signature | ________________________ |
`;
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
