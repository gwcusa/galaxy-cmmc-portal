import { describe, it, expect, vi } from "vitest";
import { createFakeClient, type FakeState } from "./helpers/fake-supabase";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/email", () => ({ sendReassessmentStartedEmail: vi.fn(async () => {}) }));

import { startReassessmentCycle } from "@/lib/reassessment";

const CLIENT_ID = "client-1";
const PREVIOUS_ID = "assess-1";

function seed(): FakeState {
  return {
    user: null,
    users: [],
    tables: {
      clients: [{ id: CLIENT_ID, user_id: "user-owner", company_name: "Acme", contact_name: "Pat" }],
      assessments: [{ id: PREVIOUS_ID, client_id: CLIENT_ID, status: "finalized", started_at: "2026-01-01T00:00:00.000Z" }],
      assessment_responses: [],
    },
  };
}

function start(state: FakeState) {
  return startReassessmentCycle({
    svc: createFakeClient(state) as never,
    clientId: CLIENT_ID,
    previousAssessmentId: PREVIOUS_ID,
    actorUserId: "user-admin",
    actorRole: "admin",
    notifyClient: false,
  });
}

describe("startReassessmentCycle", () => {
  it("opens a new cycle from the latest finalized assessment", async () => {
    const state = seed();
    const result = await start(state);
    expect(result.ok).toBe(true);
    expect(state.tables.assessments).toHaveLength(2);
  });

  it("maps a unique violation (23505) on the new cycle to the 'newer cycle exists' 400", async () => {
    const state = seed();
    state.insertErrors = {
      assessments: { message: 'duplicate key value violates unique constraint "assessments_one_successor"', code: "23505" },
    };
    const result = await start(state);
    expect(result).toEqual({ ok: false, status: 400, error: "A newer assessment cycle already exists for this client" });
    expect(state.tables.assessments).toHaveLength(1);
  });

  it("still reports other insert failures as 500", async () => {
    const state = seed();
    state.insertErrors = { assessments: { message: "connection reset", code: "08006" } };
    const result = await start(state);
    expect(result).toEqual({ ok: false, status: 500, error: "connection reset" });
  });
});
