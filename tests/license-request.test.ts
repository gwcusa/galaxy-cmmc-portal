import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { FakeState } from "./helpers/fake-supabase";

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
const sendPackageRequestEmail = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/email", () => ({ sendPackageRequestEmail }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { POST as requestPackage } from "@/app/api/licenses/request/route";

const OWNER = "user-owner";
const CLIENT_ID = "client-1";

function seed(auditRows: Record<string, unknown>[] = []) {
  state.current = {
    user: { id: OWNER },
    users: [],
    tables: {
      clients: [{ id: CLIENT_ID, user_id: OWNER, company_name: "Acme", contact_name: "Pat" }],
      packages: [{ id: "pkg-single", name: "Single Assessment", price_usd: 500, is_active: true }],
      audit_log: auditRows,
    },
  };
}

function post() {
  return requestPackage(new NextRequest("http://test/api/licenses/request", {
    method: "POST",
    body: JSON.stringify({ packageId: "pkg-single" }),
  }));
}

function auditRow(minutesAgo: number, entityId = CLIENT_ID) {
  return {
    id: `audit-${minutesAgo}-${entityId}`,
    action: "license.requested",
    entity_type: "client",
    entity_id: entityId,
    created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
  };
}

describe("POST /api/licenses/request cooldown", () => {
  beforeEach(() => sendPackageRequestEmail.mockClear());

  it("sends when there is no recent request", async () => {
    seed([auditRow(61)]);
    const res = await post();
    expect(res.status).toBe(200);
    expect(sendPackageRequestEmail).toHaveBeenCalledTimes(1);
  });

  it("returns 429 when the client requested less than an hour ago", async () => {
    seed([auditRow(10)]);
    const res = await post();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "too_many_requests",
      message: "You already sent a request recently. Galaxy will be in touch.",
    });
    expect(sendPackageRequestEmail).not.toHaveBeenCalled();
  });

  it("ignores another client's recent request", async () => {
    seed([auditRow(10, "client-2")]);
    const res = await post();
    expect(res.status).toBe(200);
  });
});
