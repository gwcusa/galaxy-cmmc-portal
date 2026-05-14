import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const controls = JSON.parse(readFileSync("./data/nist-800-171-controls.json", "utf8"));

const sb = createClient(
  "https://hymlqyticvewapddzlwn.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5bWxxeXRpY3Zld2FwZGR6bHduIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcyMDQ0MSwiZXhwIjoyMDk0Mjk2NDQxfQ.IzvjC0Zx5cq-3E-mESiJ-UMCs4sR8FfEOIyCrygEg1Q"
);

const { error } = await sb.from("controls").upsert(controls, { onConflict: "id" });

if (error) {
  console.error("Error:", error.message);
} else {
  console.log("Seeded", controls.length, "controls successfully.");
}
