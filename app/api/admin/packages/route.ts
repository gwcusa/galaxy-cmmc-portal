import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";

const PACKAGE_TYPES = ["single", "additional", "unlimited"];
const PACKAGE_COLUMNS = "id, name, type, price_usd, duration_months, description, is_active, sort_order, created_at, updated_at";
const UNIQUE_VIOLATION = "23505";

function parsePrice(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function parseDuration(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/admin/packages — the whole catalog, active or not, in display order
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.svc
    .from("packages")
    .select(PACKAGE_COLUMNS)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ packages: data ?? [] });
}

// POST /api/admin/packages { name, type, priceUsd, durationMonths, description?, isActive?, sortOrder? }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { svc } = auth;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type;
  const price = parsePrice(body.priceUsd ?? 0);
  const duration = parseDuration(body.durationMonths);
  const isActive = body.isActive !== false;

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!PACKAGE_TYPES.includes(type)) return NextResponse.json({ error: "type must be single, additional or unlimited" }, { status: 400 });
  if (price === null) return NextResponse.json({ error: "priceUsd must be 0 or more" }, { status: 400 });
  if (duration === null) return NextResponse.json({ error: "durationMonths must be a whole number greater than 0" }, { status: 400 });

  if (isActive) {
    const { data: existing } = await svc.from("packages").select("id").eq("type", type).eq("is_active", true).maybeSingle();
    if (existing) return NextResponse.json({ error: "An active package of this type already exists" }, { status: 409 });
  }

  const { data, error } = await svc
    .from("packages")
    .insert({
      name,
      type,
      price_usd: price,
      duration_months: duration,
      description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
      is_active: isActive,
      sort_order: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
    })
    .select(PACKAGE_COLUMNS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return NextResponse.json({ error: "An active package of this type already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ package: data });
}

// PUT /api/admin/packages { id, name?, priceUsd?, durationMonths?, description?, isActive?, sortOrder? }
// Package type is not editable.
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { svc } = auth;

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    updates.name = name;
  }
  if (body.priceUsd !== undefined) {
    const price = parsePrice(body.priceUsd);
    if (price === null) return NextResponse.json({ error: "priceUsd must be 0 or more" }, { status: 400 });
    updates.price_usd = price;
  }
  if (body.durationMonths !== undefined) {
    const duration = parseDuration(body.durationMonths);
    if (duration === null) return NextResponse.json({ error: "durationMonths must be a whole number greater than 0" }, { status: 400 });
    updates.duration_months = duration;
  }
  if (body.description !== undefined) {
    updates.description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  }
  if (body.isActive !== undefined) updates.is_active = !!body.isActive;
  if (body.sortOrder !== undefined) {
    if (!Number.isInteger(body.sortOrder)) return NextResponse.json({ error: "sortOrder must be a whole number" }, { status: 400 });
    updates.sort_order = body.sortOrder;
  }

  const { data, error } = await svc
    .from("packages")
    .update(updates)
    .eq("id", body.id)
    .select(PACKAGE_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return NextResponse.json({ error: "Another package of this type is already active" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  return NextResponse.json({ package: data });
}
