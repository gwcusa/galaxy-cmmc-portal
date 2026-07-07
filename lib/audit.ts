import { createClient } from "@supabase/supabase-js";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type AuditEntry = {
  actorId?: string | null;
  actorRole?: "admin" | "client" | "system";
  action: string; // e.g. "assessment.status_changed", "artifact.published"
  entityType: string; // e.g. "assessment", "artifact", "document"
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Append-only audit trail. Never throws — an audit failure must not break the
 * action being audited (it is logged to the console instead).
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await serviceClient.from("audit_log").insert({
      actor_id: entry.actorId ?? null,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
    });
    if (error) console.error("audit_log insert failed:", error.message);
  } catch (err) {
    console.error("audit_log insert failed:", err);
  }
}
