-- Phase 1 security fixes
--
-- 1. The original user_roles policy referenced user_roles inside its own USING
--    clause, which causes infinite recursion when queried with the anon/authenticated
--    role. Replace it with a simple "read your own role" policy. All writes to
--    user_roles go through the service role (API routes), which bypasses RLS.

drop policy if exists "user_roles_admin_only" on user_roles;

create policy "user_roles_read_own" on user_roles
  for select using (user_id = auth.uid());

-- Intentionally no insert/update/delete policies: role management is service-role only.
