import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import type { FakeState, Row } from "./helpers/fake-supabase";

// Hoisted so the vi.mock factories below can reach it when the mocked modules
// are first imported.
const state = vi.hoisted(() => ({
  current: { user: null, tables: {}, users: [] } as {
    user: { id: string } | null;
    tables: Record<string, Record<string, unknown>[]>;
    users: { id: string; email: string }[];
  },
}));

vi.mock("@/lib/supabase-server", async () => {
  const { createFakeClient } = await import("./helpers/fake-supabase");
  return {
    createServerSupabaseClient: () => ({
      auth: { getUser: async () => ({ data: { user: state.current.user } }) },
    }),
    createServiceSupabaseClient: () => createFakeClient(state.current as FakeState),
  };
});
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/email", () => ({
  sendAssessmentSubmittedEmail: vi.fn(async () => {}),
  sendReassessmentStartedEmail: vi.fn(async () => {}),
}));
vi.mock("@/lib/run-assessment-review", () => ({
  runAssessmentReview: vi.fn(async () => ({ runId: "run-1", total: 0 })),
  executeReviewRun: vi.fn(async () => {}),
}));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      createBucket: async () => ({ data: null, error: null }),
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ data: null, error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/signed" } }),
      }),
    },
  }),
}));

import { POST as saveAnswer } from "@/app/api/assessment/route";
import { POST as submitAssessment } from "@/app/api/assessment/submit/route";
import { POST as uploadArtifact } from "@/app/api/artifacts/route";
import { POST as saveScoping } from "@/app/api/scoping/route";

// ---------------------------------------------------------------- fixture

const OWNER = "user-owner";
const OTHER = "user-other";
const ADMIN = "user-admin";
const CLIENT_ID = "client-1";
const OTHER_CLIENT_ID = "client-2";
const ASSESSMENT_ID = "assess-1";

function seed(opts: {
  license: "active" | "expired" | "none";
  licenseType?: "single" | "unlimited";
  assessmentStatus?: string;
}) {
  const now = Date.now();
  const day = 86400000;
  const type = opts.licenseType ?? "single";
  const licenses: Row[] = opts.license === "none" ? [] : [{
    id: "lic-1",
    client_id: CLIENT_ID,
    package_id: type === "unlimited" ? "pkg-unlimited" : "pkg-single",
    type,
    price_paid_usd: 0,
    starts_at: new Date(now - 30 * day).toISOString(),
    expires_at: opts.license === "active"
      ? new Date(now + 60 * day).toISOString()
      : new Date(now - day).toISOString(),
    voided_at: null,
  }];
  state.current.tables = {
    user_roles: [
      { user_id: OWNER, role: "client" },
      { user_id: OTHER, role: "client" },
      { user_id: ADMIN, role: "admin" },
    ],
    clients: [
      { id: CLIENT_ID, user_id: OWNER, company_name: "Owner Co", contact_name: "Olive Owner", cmmc_target_level: 2 },
      { id: OTHER_CLIENT_ID, user_id: OTHER, company_name: "Other Co", contact_name: "Otto Other", cmmc_target_level: 2 },
    ],
    assessments: [{
      id: ASSESSMENT_ID,
      client_id: CLIENT_ID,
      status: opts.assessmentStatus ?? "in_progress",
      started_at: new Date(now - day).toISOString(),
      previous_assessment_id: null,
    }],
    assessment_responses: [],
    artifacts: [],
    assessment_scoping: [],
    packages: [
      { id: "pkg-single", name: "Single Assessment", type: "single", price_usd: 0, duration_months: 3, is_active: true, sort_order: 1 },
      { id: "pkg-unlimited", name: "Unlimited", type: "unlimited", price_usd: 0, duration_months: 12, is_active: true, sort_order: 3 },
    ],
    client_licenses: licenses,
  };
  state.current.users = [
    { id: OWNER, email: "owner@example.test" },
    { id: OTHER, email: "other@example.test" },
    { id: ADMIN, email: "admin@example.test" },
  ];
}

function signIn(userId: string | null) {
  state.current.user = userId ? { id: userId } : null;
}

function tables() {
  return state.current.tables;
}

function jsonRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function uploadRequest() {
  const form = new FormData();
  form.append("assessmentId", ASSESSMENT_ID);
  form.append("controlId", "3.1.1");
  form.append("artifactType", "policy");
  form.append("file", new File(["hello"], "policy.pdf", { type: "application/pdf" }));
  return new NextRequest("http://localhost/api/artifacts", { method: "POST", body: form });
}

// ------------------------------------------------------------------ tests

describe("POST /api/assessment (answer save)", () => {
  const body = { assessmentId: ASSESSMENT_ID, controlId: "3.1.1", response: "yes" };

  it("allows the owning client with an active license", async () => {
    seed({ license: "active" });
    signIn(OWNER);
    const res = await saveAnswer(jsonRequest("/api/assessment", body));
    expect(res.status).toBe(200);
    expect(tables().assessment_responses).toHaveLength(1);
  });

  it("returns 403 license_inactive for the owning client with an expired license", async () => {
    seed({ license: "expired" });
    signIn(OWNER);
    const res = await saveAnswer(jsonRequest("/api/assessment", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "license_inactive" });
    expect(tables().assessment_responses).toHaveLength(0);
  });

  it("returns 403 Forbidden for another client", async () => {
    seed({ license: "active" });
    signIn(OTHER);
    const res = await saveAnswer(jsonRequest("/api/assessment", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 403 Forbidden for an admin (client-only route)", async () => {
    seed({ license: "active" });
    signIn(ADMIN);
    const res = await saveAnswer(jsonRequest("/api/assessment", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});

describe("POST /api/assessment/submit", () => {
  const body = { assessmentId: ASSESSMENT_ID };

  it("allows the owning client with an active license", async () => {
    seed({ license: "active" });
    signIn(OWNER);
    const res = await submitAssessment(jsonRequest("/api/assessment/submit", body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, newStatus: "submitted", reviewsQueued: 0 });
    expect(tables().assessments[0].status).toBe("submitted");
  });

  it("returns 403 license_inactive for the owning client with an expired license", async () => {
    seed({ license: "expired" });
    signIn(OWNER);
    const res = await submitAssessment(jsonRequest("/api/assessment/submit", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "license_inactive" });
    expect(tables().assessments[0].status).toBe("in_progress");
  });

  it("returns 403 Forbidden for another client", async () => {
    seed({ license: "active" });
    signIn(OTHER);
    const res = await submitAssessment(jsonRequest("/api/assessment/submit", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 403 Forbidden for an admin (client-only route)", async () => {
    seed({ license: "active" });
    signIn(ADMIN);
    const res = await submitAssessment(jsonRequest("/api/assessment/submit", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});

describe("POST /api/artifacts (evidence upload)", () => {
  it("allows the owning client with an active license", async () => {
    seed({ license: "active" });
    signIn(OWNER);
    const res = await uploadArtifact(uploadRequest());
    expect(res.status).toBe(200);
    expect(tables().artifacts).toHaveLength(1);
  });

  it("returns 403 license_inactive for the owning client with an expired license", async () => {
    seed({ license: "expired" });
    signIn(OWNER);
    const res = await uploadArtifact(uploadRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "license_inactive" });
    expect(tables().artifacts).toHaveLength(0);
  });

  it("returns 403 Forbidden for another client", async () => {
    seed({ license: "active" });
    signIn(OTHER);
    const res = await uploadArtifact(uploadRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 403 Forbidden for an admin (client-only route)", async () => {
    seed({ license: "active" });
    signIn(ADMIN);
    const res = await uploadArtifact(uploadRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});

describe("POST /api/scoping", () => {
  const body = { assessmentId: ASSESSMENT_ID, answers: { has_wireless: false } };

  it("allows the owning client with an active license", async () => {
    seed({ license: "active" });
    signIn(OWNER);
    const res = await saveScoping(jsonRequest("/api/scoping", body));
    expect(res.status).toBe(200);
    expect(tables().assessment_scoping).toHaveLength(1);
  });

  it("returns 403 license_inactive for the owning client with an expired license", async () => {
    seed({ license: "expired" });
    signIn(OWNER);
    const res = await saveScoping(jsonRequest("/api/scoping", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "license_inactive" });
  });

  it("returns 403 Forbidden for another client", async () => {
    seed({ license: "active" });
    signIn(OTHER);
    const res = await saveScoping(jsonRequest("/api/scoping", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("allows an admin without any license (staff are never license-gated)", async () => {
    seed({ license: "none" });
    signIn(ADMIN);
    const res = await saveScoping(jsonRequest("/api/scoping", body));
    expect(res.status).toBe(200);
    expect(tables().assessment_scoping).toHaveLength(1);
  });
});
