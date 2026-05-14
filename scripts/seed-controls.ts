import { createClient } from "@supabase/supabase-js";
import controls from "../data/nist-800-171-controls.json";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  const { error } = await supabase.from("controls").upsert(controls, { onConflict: "id" });
  if (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
  console.log(`Seeded ${controls.length} controls successfully.`);
}

seed();
