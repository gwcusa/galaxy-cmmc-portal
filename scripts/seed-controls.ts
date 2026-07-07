import { createClient } from "@supabase/supabase-js";
import controls from "../data/nist-800-171-controls.json";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
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
  const { error } = await supabase.from("controls").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
  console.log(`Seeded ${controls.length} controls successfully.`);
}

seed();
