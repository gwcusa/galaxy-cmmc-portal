import { createServerSupabaseClient } from "@/lib/supabase-server";
import ProfileView from "@/components/ProfileView";

export default async function AssessorProfilePage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <ProfileView
      email={user?.email}
      fullName={user?.user_metadata?.full_name ?? null}
      role="assessor"
    />
  );
}
