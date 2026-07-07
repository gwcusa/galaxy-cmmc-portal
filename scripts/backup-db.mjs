// Read-only snapshot of all app tables to a local JSON file (pre-migration safety net).
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env vars");
  process.exit(1);
}

const sb = createClient(url, key);

const TABLES = [
  "clients",
  "controls",
  "assessments",
  "assessment_responses",
  "remediation_notes",
  "artifacts",
  "control_ai_feedback",
  "assessor_determinations",
  "information_requests",
  "generated_artifacts",
  "reports",
  "user_roles",
];

const snapshot = { taken_at: new Date().toISOString(), tables: {} };

for (const table of TABLES) {
  const { data, error } = await sb.from(table).select("*");
  if (error) {
    console.error(`${table}: ERROR ${error.message}`);
    snapshot.tables[table] = { error: error.message };
  } else {
    snapshot.tables[table] = data;
    console.log(`${table}: ${data.length} rows`);
  }
}

const out = "C:/projects/galaxy-db-backup-2026-07-07.json";
writeFileSync(out, JSON.stringify(snapshot, null, 2));
console.log("\nSaved to " + out);
