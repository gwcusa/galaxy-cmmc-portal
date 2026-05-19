import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM ?? "Galaxy CMMC <notifications@galaxyconsultingllc.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? "";

// ---------------------------------------------------------------------------
// Base template
// ---------------------------------------------------------------------------
function baseTemplate(body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#050B18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050B18;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Logo / Header -->
        <tr>
          <td style="padding:0 0 28px 0;">
            <div style="font-size:20px;font-weight:700;color:#00C9FF;letter-spacing:-0.5px;">Galaxy Consulting, LLC</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px;">CMMC Compliance Portal</div>
          </td>
        </tr>
        <!-- Body card -->
        <tr>
          <td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:32px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 0 0 0;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;">
            Galaxy Consulting, LLC · CMMC Compliance Portal<br/>
            This is an automated notification. Do not reply to this email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function heading(text: string): string {
  return `<div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:16px;letter-spacing:-0.3px;">${text}</div>`;
}

function para(text: string, muted = false): string {
  return `<p style="font-size:14px;color:${muted ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.8)"};line-height:1.7;margin:0 0 14px 0;">${text}</p>`;
}

function badge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;color:${color};background:${color}18;border:1px solid ${color}33;">${text}</span>`;
}

function ctaButton(label: string, url: string): string {
  return `<div style="margin-top:24px;"><a href="${url}" style="display:inline-block;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;background:linear-gradient(135deg,#00C9FF,#4DFFA0);color:#050B18;text-decoration:none;">${label}</a></div>`;
}

function divider(): string {
  return `<div style="border-top:1px solid rgba(255,255,255,0.06);margin:20px 0;"></div>`;
}

// ---------------------------------------------------------------------------
// Safe send — logs errors but never throws so a missing key doesn't break the app
// ---------------------------------------------------------------------------
async function send(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping email to", to);
    return;
  }
  if (!to) {
    console.warn("[email] No recipient address — skipping:", subject);
    return;
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) console.error("[email] Failed to send:", subject, error);
}

// ---------------------------------------------------------------------------
// 1. Assessor notification: client submitted or resubmitted
// ---------------------------------------------------------------------------
export async function sendAssessmentSubmittedEmail(params: {
  companyName: string;
  contactName: string;
  clientId: string;
  isResubmission: boolean;
}) {
  if (!ADMIN_EMAIL) return;
  const { companyName, contactName, clientId, isResubmission } = params;
  const label = isResubmission ? "Resubmitted" : "Submitted";
  const color = isResubmission ? "#FFB347" : "#A78BFA";
  const url = `${APP_URL}/admin/clients/${clientId}`;

  const html = baseTemplate(`
    ${heading(isResubmission ? "Assessment Resubmitted" : "New Assessment Submitted")}
    ${para(`<strong style="color:#fff;">${contactName}</strong> from <strong style="color:#fff;">${companyName}</strong> has ${isResubmission ? "resubmitted their assessment following your remediation request" : "submitted their CMMC gap assessment for review"}.`)}
    ${divider()}
    <div style="margin-bottom:16px;">
      ${badge(label, color)}
    </div>
    ${para("Review the submission, run or check AI analysis, then begin your assessor review.", true)}
    ${ctaButton("Open in Admin Portal →", url)}
  `);

  await send(ADMIN_EMAIL, `[Galaxy] ${companyName} — Assessment ${label}`, html);
}

// ---------------------------------------------------------------------------
// 2. Client notification: status changed by assessor
// ---------------------------------------------------------------------------
const STATUS_EMAIL_CONFIG: Record<string, { label: string; color: string; message: string } | undefined> = {
  under_review: {
    label: "Under Review",
    color: "#A78BFA",
    message: "The Galaxy team has begun reviewing your assessment and supporting evidence. We will be in touch if anything is needed.",
  },
  remediation_required: {
    label: "Action Required",
    color: "#F87171",
    message: "Your assessor has identified items that require your attention. Please log in to your portal, review the Galaxy Recommendations on each affected control, update your responses, and resubmit your assessment.",
  },
  approved: {
    label: "Assessment Approved",
    color: "#4DFFA0",
    message: "Congratulations — your assessment has been approved by Galaxy Consulting. Your final report will be available for download shortly.",
  },
  finalized: {
    label: "Assessment Finalized",
    color: "#4DFFA0",
    message: "Your assessment is complete and your report is now available for download from your portal.",
  },
};

export async function sendStatusChangeEmail(params: {
  clientEmail: string;
  clientName: string;
  companyName: string;
  newStatus: string;
}) {
  const { clientEmail, clientName, companyName, newStatus } = params;
  const cfg = STATUS_EMAIL_CONFIG[newStatus];
  if (!cfg) return; // Don't email for every status (e.g. archived)

  const html = baseTemplate(`
    ${heading(`Assessment Update: ${cfg.label}`)}
    ${para(`Hi ${clientName},`)}
    ${para(`Your CMMC assessment for <strong style="color:#fff;">${companyName}</strong> has been updated.`)}
    ${divider()}
    <div style="margin-bottom:16px;">${badge(cfg.label, cfg.color)}</div>
    ${para(cfg.message)}
    ${ctaButton("Go to Your Dashboard →", `${APP_URL}/portal/dashboard`)}
  `);

  await send(clientEmail, `[Galaxy] Your Assessment Status: ${cfg.label}`, html);
}

// ---------------------------------------------------------------------------
// 3. Client notification: assessor sent an information request
// ---------------------------------------------------------------------------
export async function sendInfoRequestEmail(params: {
  clientEmail: string;
  clientName: string;
  companyName: string;
  subject: string;
  body: string;
}) {
  const { clientEmail, clientName, companyName, subject, body } = params;

  const html = baseTemplate(`
    ${heading("Information Requested")}
    ${para(`Hi ${clientName},`)}
    ${para(`Your assessor at Galaxy Consulting has sent you an information request regarding your CMMC assessment for <strong style="color:#fff;">${companyName}</strong>.`)}
    ${divider()}
    <div style="margin-bottom:8px;font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">Subject</div>
    <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:16px;">${subject}</div>
    <div style="margin-bottom:8px;font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">Details</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.75);line-height:1.7;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:14px;">${body.replace(/\n/g, "<br/>")}</div>
    ${para("Please log in to your portal to submit your response.", true)}
    ${ctaButton("Respond in Portal →", `${APP_URL}/portal/dashboard`)}
  `);

  await send(clientEmail, `[Galaxy] Information Request: ${subject}`, html);
}

// ---------------------------------------------------------------------------
// 4. Assessor notification: client responded to an information request
// ---------------------------------------------------------------------------
export async function sendInfoRequestResponseEmail(params: {
  companyName: string;
  contactName: string;
  clientId: string;
  subject: string;
  response: string;
}) {
  if (!ADMIN_EMAIL) return;
  const { companyName, contactName, clientId, subject, response } = params;
  const url = `${APP_URL}/admin/clients/${clientId}`;

  const html = baseTemplate(`
    ${heading("Information Request — Response Received")}
    ${para(`<strong style="color:#fff;">${contactName}</strong> from <strong style="color:#fff;">${companyName}</strong> has responded to your information request.`)}
    ${divider()}
    <div style="margin-bottom:8px;font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">Request Subject</div>
    <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:16px;">${subject}</div>
    <div style="margin-bottom:8px;font-size:11px;color:#4DFFA0;text-transform:uppercase;letter-spacing:1px;">Client Response</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.8);line-height:1.7;background:rgba(77,255,160,0.04);border:1px solid rgba(77,255,160,0.12);border-radius:8px;padding:14px;">${response.replace(/\n/g, "<br/>")}</div>
    ${ctaButton("View in Admin Portal →", url)}
  `);

  await send(ADMIN_EMAIL, `[Galaxy] ${companyName} — Info Request Response: ${subject}`, html);
}
