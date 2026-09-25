import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAdminOrAssessor } from "@/lib/auth-helpers";
import {
  addMonths,
  computeEntitlement,
  formatLongDate,
  getEntitlement,
  hasPriorLicense,
  loadLicenseContext,
  planAssignment,
  type LicenseType,
} from "@/lib/licensing";
import { startReassessmentCycle } from "@/lib/reassessment";
import { sendPackageAssignedEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

const LEDGER_COLUMNS = "id, package_id, type, price_paid_usd, starts_at, expires_at, granted_by, notes, assessment_id, voided_at, void_reason, created_at, packages(name)";

type LedgerRow = {
  id: string;
  package_id: string;
  type: LicenseType;
  price_paid_usd: number | string;
  starts_at: string;
  expires_at: string;
  granted_by: string | null;
  notes: string | null;
  assessment_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  packages: { name: string } | { name: string }[] | null;
};

function packageName(row: LedgerRow): string {
  const pkg = Array.isArray(row.packages) ? row.packages[0] : row.packages;
  return pkg?.name ?? "";
}

// GET /api/admin/clients/[id]/licenses
// Ledger rows with package name and granter email, the computed entitlement,
// the latest cycle, and every active package with its assignment plan.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminOrAssessor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { svc } = auth;

  const { data: client } = await svc.from("clients").select("id").eq("id", params.id).single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { data: rows, error } = await svc
    .from("client_licenses")
    .select(LEDGER_COLUMNS)
    .eq("client_id", params.id)
    .order("starts_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ledger = (rows ?? []) as unknown as LedgerRow[];

  const granterEmails = new Map<string, string>();
  for (const r of ledger) {
    if (!r.granted_by || granterEmails.has(r.granted_by)) continue;
    const { data: authUser } = await svc.auth.admin.getUserById(r.granted_by);
    granterEmails.set(r.granted_by, authUser?.user?.email ?? "");
  }

  const { licenses, latestAssessment } = await loadLicenseContext(svc, params.id);
  const entitlement = computeEntitlement(licenses, latestAssessment, new Date());
  const prior = hasPriorLicense(licenses);

  const { data: packages } = await svc
    .from("packages")
    .select("id, name, type, price_usd, duration_months, description")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const assignablePackages = (packages ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    type: p.type as LicenseType,
    price_usd: Number(p.price_usd),
    duration_months: p.duration_months as number,
    description: (p.description as string | null) ?? null,
    plan: planAssignment({ packageType: p.type as LicenseType, hasPriorLicense: prior, latestAssessment }),
  }));

  return NextResponse.json({
    licenses: ledger.map((r) => ({
      id: r.id,
      packageId: r.package_id,
      packageName: packageName(r),
      type: r.type,
      pricePaidUsd: Number(r.price_paid_usd),
      startsAt: r.starts_at,
      expiresAt: r.expires_at,
      grantedBy: r.granted_by,
      grantedByEmail: r.granted_by ? granterEmails.get(r.granted_by) ?? null : null,
      notes: r.notes,
      assessmentId: r.assessment_id,
      voidedAt: r.voided_at,
      voidReason: r.void_reason,
    })),
    entitlement,
    latestAssessment,
    assignablePackages,
  });
}

// POST /api/admin/clients/[id]/licenses { packageId, pricePaidUsd, notes }
// Records an offline purchase, which activates the license.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user, svc } = auth;

  const body = await req.json();
  const { packageId, pricePaidUsd, notes } = body;
  if (!packageId) return NextResponse.json({ error: "packageId required" }, { status: 400 });
  const price = Number(pricePaidUsd ?? 0);
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "pricePaidUsd must be 0 or more" }, { status: 400 });
  }

  const { data: client } = await svc
    .from("clients")
    .select("id, company_name, contact_name, user_id")
    .eq("id", params.id)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // 1. Load the package. It must be active.
  const { data: pkg } = await svc
    .from("packages")
    .select("id, name, type, duration_months, is_active")
    .eq("id", packageId)
    .single();
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  if (!pkg.is_active) return NextResponse.json({ error: "Package is not active" }, { status: 400 });

  // 2. Load the ledger and latest cycle. 3. Plan.
  const { licenses, latestAssessment } = await loadLicenseContext(svc, params.id);
  const plan = planAssignment({
    packageType: pkg.type as LicenseType,
    hasPriorLicense: hasPriorLicense(licenses),
    latestAssessment,
  });
  if (!plan.allowed) return NextResponse.json({ error: plan.reason }, { status: 400 });

  // 4. Open or reuse a cycle.
  let assessmentId: string | null = null;
  if (plan.cycleAction === "open") {
    const result = await startReassessmentCycle({
      svc,
      clientId: params.id,
      previousAssessmentId: plan.previousAssessmentId,
      actorUserId: user.id,
      actorRole: "admin",
      notifyClient: false,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    assessmentId = result.assessmentId;
  } else if (plan.cycleAction === "reuse") {
    assessmentId = plan.assessmentId;
  }

  // 5. Insert the ledger row. The clock starts now; nothing stacks.
  const now = new Date();
  const startsAt = now.toISOString();
  const expiresAt = addMonths(now, pkg.duration_months as number).toISOString();
  const cleanNotes = typeof notes === "string" && notes.trim() ? notes.trim() : null;

  const { data: license, error: insertError } = await svc
    .from("client_licenses")
    .insert({
      client_id: params.id,
      package_id: pkg.id,
      type: pkg.type,
      price_paid_usd: Math.round(price * 100) / 100,
      starts_at: startsAt,
      expires_at: expiresAt,
      granted_by: user.id,
      notes: cleanNotes,
      assessment_id: assessmentId,
    })
    .select("id, package_id, type, price_paid_usd, starts_at, expires_at, granted_by, notes, assessment_id, voided_at, void_reason, created_at")
    .single();

  if (insertError || !license) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to record license" }, { status: 500 });
  }

  // 6. Audit.
  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: "license.assigned",
    entityType: "license",
    entityId: license.id,
    metadata: {
      clientId: params.id,
      packageId: pkg.id,
      packageName: pkg.name,
      type: pkg.type,
      pricePaidUsd: Math.round(price * 100) / 100,
      expiresAt,
      cycleAction: plan.cycleAction,
      assessmentId,
    },
  });

  // 7. Notify the client — fire and forget.
  const { data: authUser } = await svc.auth.admin.getUserById(client.user_id);
  if (authUser?.user?.email) {
    sendPackageAssignedEmail({
      clientEmail: authUser.user.email,
      clientName: client.contact_name,
      companyName: client.company_name,
      packageName: pkg.name,
      packageType: pkg.type as LicenseType,
      expiresOn: formatLongDate(expiresAt),
      cycleOpened: plan.cycleAction === "open",
    }).catch(() => {});
  }

  // 8. Return the new row and the new entitlement.
  const entitlement = await getEntitlement(svc, params.id);
  return NextResponse.json({ license: { ...license, packageName: pkg.name }, entitlement });
}
