// Seeds the controls table from data/nist-800-171-controls.json.
// Usage: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed.mjs
// (or run with .env.local loaded: node --env-file=.env.local scripts/seed.mjs)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (try: node --env-file=.env.local scripts/seed.mjs)");
  process.exit(1);
}

const controls = JSON.parse(readFileSync("./data/nist-800-171-controls.json", "utf8"));

// Only the columns that exist on the controls table
const rows = controls.map((c) => ({
  id: c.id,
  domain: c.domain,
  domain_code: c.domain_code,
  level: c.level,
  description: c.description,
  weight: c.weight,
  guidance: c.guidance ?? null,
}));

const sb = createClient(url, key);
const { error } = await sb.from("controls").upsert(rows, { onConflict: "id" });

if (error) {
  console.error("Error:", error.message);
  process.exit(1);
} else {
  console.log("Seeded", rows.length, "controls successfully.");
}
