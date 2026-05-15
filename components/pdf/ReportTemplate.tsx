import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Styles,
} from "@react-pdf/renderer";
import { AssessmentScore, ResponseMap } from "@/lib/scoring";
import { CONTROLS } from "@/lib/controls";
import React from "react";

export type ReportTemplateProps = {
  companyName: string;
  contactName: string;
  cmmcLevel: number;
  generatedAt: string;
  score: AssessmentScore;
  responses: ResponseMap;
};

const styles = StyleSheet.create({
  // Cover page
  coverPage: {
    backgroundColor: "#0A1628",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  coverHeader: {
    backgroundColor: "#00C9FF",
    height: 6,
  },
  coverBody: {
    flex: 1,
    padding: 60,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  logoBox: {
    backgroundColor: "#0D2040",
    borderRadius: 8,
    padding: 20,
    marginBottom: 48,
    alignSelf: "flex-start",
    borderLeftWidth: 4,
    borderLeftColor: "#00C9FF",
    borderStyle: "solid",
  },
  logoGalaxy: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: "#00C9FF",
    letterSpacing: 6,
  },
  logoConsulting: {
    fontSize: 12,
    fontFamily: "Helvetica",
    color: "#FFFFFF",
    letterSpacing: 4,
    marginTop: 2,
  },
  logoLLC: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#8BA5C7",
    letterSpacing: 3,
    marginTop: 1,
  },
  coverTitle: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
    marginBottom: 16,
    lineHeight: 1.2,
  },
  coverSubtitle: {
    fontSize: 14,
    fontFamily: "Helvetica",
    color: "#8BA5C7",
    marginBottom: 8,
  },
  coverCompany: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#00C9FF",
    marginBottom: 6,
  },
  coverContact: {
    fontSize: 13,
    fontFamily: "Helvetica",
    color: "#AABBD0",
    marginBottom: 32,
  },
  coverDate: {
    fontSize: 12,
    fontFamily: "Helvetica",
    color: "#8BA5C7",
  },
  coverFooter: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: "#1A2E4A",
    borderStyle: "solid",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  coverFooterText: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#8BA5C7",
  },
  coverFooterLevel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#00C9FF",
  },

  // Content pages
  contentPage: {
    backgroundColor: "#0A1628",
    padding: 48,
    display: "flex",
    flexDirection: "column",
  },
  pageHeader: {
    marginBottom: 32,
    borderBottomWidth: 2,
    borderBottomColor: "#00C9FF",
    borderStyle: "solid",
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
  },
  pageCompanyLabel: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#8BA5C7",
  },

  // Stats row
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 32,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#0D2040",
    borderRadius: 6,
    padding: 16,
    borderTopWidth: 3,
    borderStyle: "solid",
  },
  statLabel: {
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#8BA5C7",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statValue: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
  },
  statUnit: {
    fontSize: 14,
    fontFamily: "Helvetica",
    color: "#8BA5C7",
  },

  // Interpretation box
  interpretationBox: {
    backgroundColor: "#0D2040",
    borderRadius: 6,
    padding: 20,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderStyle: "solid",
  },
  interpretationTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  interpretationText: {
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#AABBD0",
    lineHeight: 1.6,
  },

  // Table
  table: {
    display: "flex",
    flexDirection: "column",
    marginBottom: 24,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0D2040",
    borderRadius: 4,
    padding: 10,
    marginBottom: 2,
  },
  tableHeaderText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#8BA5C7",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: "row",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1A2E4A",
    borderStyle: "solid",
    alignItems: "center",
  },
  tableRowAlt: {
    backgroundColor: "#0B1A30",
  },
  tableCell: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#D0DEF0",
  },
  tableCellBold: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
  },
  colDomain: { flex: 3 },
  colScore: { flex: 1.2 },
  colGaps: { flex: 0.8 },
  colStatus: { flex: 1.2 },

  // Status badge
  badgeCompliant: {
    backgroundColor: "#0F3B25",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgePartial: {
    backgroundColor: "#3B2A0F",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeGap: {
    backgroundColor: "#3B0F0F",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeTextCompliant: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#4DFFA0",
  },
  badgeTextPartial: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#FFB347",
  },
  badgeTextGap: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#F87171",
  },

  // Gap items
  gapItem: {
    backgroundColor: "#0D2040",
    borderRadius: 6,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#F87171",
    borderStyle: "solid",
  },
  gapItemHeader: {
    flexDirection: "row",
    marginBottom: 6,
    alignItems: "center",
    gap: 8,
  },
  gapControlId: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#F87171",
  },
  gapDomain: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#8BA5C7",
  },
  gapDescription: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#AABBD0",
    lineHeight: 1.5,
  },
  noGapsBox: {
    backgroundColor: "#0F3B25",
    borderRadius: 6,
    padding: 20,
    alignItems: "center",
  },
  noGapsText: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#4DFFA0",
  },

  // Page footer
  pageFooter: {
    marginTop: "auto",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#1A2E4A",
    borderStyle: "solid",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pageFooterText: {
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#4A6080",
  },
  sectionNote: {
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#8BA5C7",
    lineHeight: 1.6,
    marginBottom: 20,
  },
});

function getScoreInterpretation(score: number): { title: string; text: string; color: string } {
  if (score >= 70) {
    return {
      title: "On Track for CMMC Certification",
      color: "#4DFFA0",
      text:
        "Your organization demonstrates strong compliance posture across most CMMC domains. " +
        "The identified gaps should be addressed through targeted remediation to achieve full certification readiness. " +
        "Galaxy Consulting recommends a focused action plan to close remaining gaps before your formal assessment.",
    };
  } else if (score >= 40) {
    return {
      title: "Remediation Required",
      color: "#FFB347",
      text:
        "Your organization has foundational controls in place but has significant gaps that must be addressed " +
        "before pursuing CMMC certification. Galaxy Consulting recommends a structured remediation program " +
        "prioritizing high-weight controls and critical domains such as Incident Response and Risk Assessment.",
    };
  } else {
    return {
      title: "Significant Work Needed",
      color: "#F87171",
      text:
        "Your organization's current compliance posture requires substantial investment in cybersecurity controls " +
        "before CMMC certification is achievable. Galaxy Consulting recommends engaging in a comprehensive " +
        "cybersecurity program that addresses foundational controls across all 14 NIST SP 800-171 domains.",
    };
  }
}

function getDomainStatus(score: number): { label: string; style: Styles[string]; textStyle: Styles[string] } {
  if (score >= 70) {
    return { label: "Compliant", style: styles.badgeCompliant, textStyle: styles.badgeTextCompliant };
  } else if (score >= 40) {
    return { label: "Partial", style: styles.badgePartial, textStyle: styles.badgeTextPartial };
  } else {
    return { label: "Gap", style: styles.badgeGap, textStyle: styles.badgeTextGap };
  }
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return isoString;
  }
}

// Cover Page
function CoverPage({
  companyName,
  contactName,
  cmmcLevel,
  generatedAt,
}: Pick<ReportTemplateProps, "companyName" | "contactName" | "cmmcLevel" | "generatedAt">) {
  return (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.coverHeader} />
      <View style={styles.coverBody}>
        <View style={styles.logoBox}>
          <Text style={styles.logoGalaxy}>GALAXY</Text>
          <Text style={styles.logoConsulting}>CONSULTING</Text>
          <Text style={styles.logoLLC}>LLC</Text>
        </View>
        <Text style={styles.coverTitle}>
          {`CMMC Level ${cmmcLevel} Gap Assessment Report`}
        </Text>
        <Text style={styles.coverSubtitle}>Prepared for:</Text>
        <Text style={styles.coverCompany}>{companyName}</Text>
        <Text style={styles.coverContact}>{contactName}</Text>
        <Text style={styles.coverDate}>{`Generated: ${formatDate(generatedAt)}`}</Text>
      </View>
      <View style={styles.coverFooter}>
        <Text style={styles.coverFooterText}>
          Confidential — Prepared by Galaxy Consulting LLC
        </Text>
        <Text style={styles.coverFooterLevel}>{`CMMC Level ${cmmcLevel}`}</Text>
      </View>
    </Page>
  );
}

// Executive Summary Page
function ExecutiveSummaryPage({
  companyName,
  score,
}: Pick<ReportTemplateProps, "companyName" | "score">) {
  const interp = getScoreInterpretation(score.overallScore);
  return (
    <Page size="A4" style={styles.contentPage}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Executive Summary</Text>
        <Text style={styles.pageCompanyLabel}>{companyName}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statBox, { borderTopColor: interp.color }]}>
          <Text style={styles.statLabel}>Overall Score</Text>
          <Text style={styles.statValue}>
            {score.overallScore}
            <Text style={styles.statUnit}>%</Text>
          </Text>
        </View>
        <View style={[styles.statBox, { borderTopColor: "#F87171" }]}>
          <Text style={styles.statLabel}>Gaps</Text>
          <Text style={[styles.statValue, { color: "#F87171" }]}>{score.gaps}</Text>
        </View>
        <View style={[styles.statBox, { borderTopColor: "#4DFFA0" }]}>
          <Text style={styles.statLabel}>Passed</Text>
          <Text style={[styles.statValue, { color: "#4DFFA0" }]}>{score.passed}</Text>
        </View>
        <View style={[styles.statBox, { borderTopColor: "#FFB347" }]}>
          <Text style={styles.statLabel}>Partial</Text>
          <Text style={[styles.statValue, { color: "#FFB347" }]}>{score.partial}</Text>
        </View>
      </View>

      <View style={[styles.interpretationBox, { borderLeftColor: interp.color }]}>
        <Text style={[styles.interpretationTitle, { color: interp.color }]}>
          {interp.title}
        </Text>
        <Text style={styles.interpretationText}>{interp.text}</Text>
      </View>

      <Text style={styles.sectionNote}>
        {`This assessment evaluated ${score.passed + score.partial + score.gaps} NIST SP 800-171 controls across 14 security domains. ` +
          `Scores are calculated based on control weight and response status. ` +
          `A score of 70% or above in each domain is recommended for CMMC Level 2 certification readiness. ` +
          `Controls marked as N/A are excluded from scoring calculations.`}
      </Text>

      <View style={styles.pageFooter}>
        <Text style={styles.pageFooterText}>Galaxy Consulting LLC — Confidential</Text>
        <Text style={styles.pageFooterText}>Page 2</Text>
      </View>
    </Page>
  );
}

// Domain Breakdown Page
function DomainBreakdownPage({
  companyName,
  score,
}: Pick<ReportTemplateProps, "companyName" | "score">) {
  return (
    <Page size="A4" style={styles.contentPage}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Domain Compliance Breakdown</Text>
        <Text style={styles.pageCompanyLabel}>{companyName}</Text>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <View style={styles.colDomain}>
            <Text style={styles.tableHeaderText}>Domain</Text>
          </View>
          <View style={styles.colScore}>
            <Text style={styles.tableHeaderText}>Score</Text>
          </View>
          <View style={styles.colGaps}>
            <Text style={styles.tableHeaderText}>Gaps</Text>
          </View>
          <View style={styles.colStatus}>
            <Text style={styles.tableHeaderText}>Status</Text>
          </View>
        </View>

        {score.domainScores.map((domain, i) => {
          const status = getDomainStatus(domain.score);
          return (
            <View
              key={domain.code}
              style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
            >
              <View style={styles.colDomain}>
                <Text style={styles.tableCellBold}>{`${domain.code} — ${domain.name}`}</Text>
              </View>
              <View style={styles.colScore}>
                <Text style={[styles.tableCell, { color: domain.color }]}>
                  {`${domain.score}%`}
                </Text>
              </View>
              <View style={styles.colGaps}>
                <Text style={[styles.tableCell, domain.gapCount > 0 ? { color: "#F87171" } : { color: "#4DFFA0" }]}>
                  {domain.gapCount}
                </Text>
              </View>
              <View style={styles.colStatus}>
                <View style={status.style}>
                  <Text style={status.textStyle}>{status.label}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.pageFooter}>
        <Text style={styles.pageFooterText}>Galaxy Consulting LLC — Confidential</Text>
        <Text style={styles.pageFooterText}>Page 3</Text>
      </View>
    </Page>
  );
}

// Priority Gaps Page
function PriorityGapsPage({
  companyName,
  responses,
}: Pick<ReportTemplateProps, "companyName" | "responses">) {
  const gaps = CONTROLS.filter((c) => responses[c.id] === "no");

  return (
    <Page size="A4" style={styles.contentPage}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Priority Gaps & Recommendations</Text>
        <Text style={styles.pageCompanyLabel}>{companyName}</Text>
      </View>

      {gaps.length === 0 ? (
        <View style={styles.noGapsBox}>
          <Text style={styles.noGapsText}>
            No gaps identified — all controls addressed
          </Text>
        </View>
      ) : (
        gaps.map((control) => (
          <View key={control.id} style={styles.gapItem}>
            <View style={styles.gapItemHeader}>
              <Text style={styles.gapControlId}>{control.id}</Text>
              <Text style={styles.gapDomain}>{`[${control.domain_code}] ${control.domain}`}</Text>
            </View>
            <Text style={styles.gapDescription}>{control.description}</Text>
          </View>
        ))
      )}

      <View style={styles.pageFooter}>
        <Text style={styles.pageFooterText}>
          This report was prepared by Galaxy Consulting LLC for internal use only.
          {" "}Unauthorized distribution is prohibited.
        </Text>
        <Text style={styles.pageFooterText}>Page 4</Text>
      </View>
    </Page>
  );
}

// Main Document Component
function ReportTemplate(props: ReportTemplateProps) {
  const { companyName, contactName, cmmcLevel, generatedAt, score, responses } = props;
  return (
    <Document
      title={`CMMC Level ${cmmcLevel} Gap Assessment — ${companyName}`}
      author="Galaxy Consulting LLC"
      subject="CMMC Gap Assessment Report"
      creator="Galaxy CMMC Portal"
    >
      <CoverPage
        companyName={companyName}
        contactName={contactName}
        cmmcLevel={cmmcLevel}
        generatedAt={generatedAt}
      />
      <ExecutiveSummaryPage companyName={companyName} score={score} />
      <DomainBreakdownPage companyName={companyName} score={score} />
      <PriorityGapsPage companyName={companyName} responses={responses} />
    </Document>
  );
}

export default ReportTemplate;

export async function generatePdf(props: ReportTemplateProps): Promise<Buffer> {
  const doc = <ReportTemplate {...props} />;
  return await renderToBuffer(doc);
}
