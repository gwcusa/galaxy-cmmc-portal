/**
 * Route smoke test — renders every authenticated page as every role.
 *
 * This exists because of a real outage: the assessor dashboard passed
 * onMouseEnter to a DOM node from a server component. `next build` compiles
 * that fine; it only throws when the branch actually renders, and the branch
 * only rendered once assessors could see clients. A signed-in request to each
 * route is the cheapest thing that would have caught it.
 *
 *   node scripts/smoke-test.mjs [baseUrl]     (default http://localhost:3000)
 *   node scripts/smoke-test.mjs --cleanup     (remove leftover smoke accounts)
 *
 * NOTE: there is only one Supabase project, so this writes to the real database
 * no matter which baseUrl you point it at. It creates one throwaway user per
 * role plus a temporary client record, and deletes them in a finally block and
 * on SIGINT. Run with --cleanup if a run is ever killed hard.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMAIL_PREFIX = "smoke-test-";
const EMAIL_DOMAIN = "@smoke.example.com";
const SMOKE_COMPANY = "ZZ Smoke Test (delete me)";
const PASSWORD = "smoke-test-password-8891";

// ---------------------------------------------------------------- environment

function loadEnv() {
  const merged = { ...process.env };
  const file = path.join(ROOT, ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const i = trimmed.indexOf("=");
      const key = trimmed.slice(0, i).trim();
      if (!merged[key]) merged[key] = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]
    .filter((k) => !merged[k]);
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(", ")}`);
    process.exit(2);
  }
  return merged;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const svc = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonClient = () =>
  createClient(SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

// ------------------------------------------------------------ route discovery

/** Every app-router page, so a new page is covered without touching this file. */
function discoverRoutes() {
  const routes = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx") {
        const rel = path.relative(path.join(ROOT, "app"), path.dirname(full)).split(path.sep).join("/");
        routes.push("/" + (rel === "." ? "" : rel));
      }
    }
  })(path.join(ROOT, "app"));
  return routes.sort();
}

function roleForRoute(route) {
  if (route.startsWith("/admin")) return "admin";
  if (route.startsWith("/assessor")) return "assessor";
  if (route.startsWith("/portal")) return "client";
  return "public";
}

/** Routes that legitimately redirect instead of rendering. */
const REDIRECT_ONLY = new Set(["/", "/assessor"]);

// --------------------------------------------------------------- test fixture

const created = { users: [], clientId: null, assessmentId: null };

async function mintUser(role) {
  const email = `${EMAIL_PREFIX}${role}-${crypto.randomUUID()}${EMAIL_DOMAIN}`;
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `Smoke ${role}`, role },
  });
  if (error) throw new Error(`could not create ${role}: ${error.message}`);
  created.users.push(data.user.id);
  const { error: roleError } = await svc.from("user_roles").insert({ user_id: data.user.id, role });
  if (roleError) throw new Error(`could not set role for ${role}: ${roleError.message}`);

  const { data: session, error: signInError } = await anonClient().auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`could not sign in as ${role}: ${signInError.message}`);

  // Same cookie @supabase/ssr writes: base64url of the session, chunked at 3180.
  const value = "base64-" + Buffer.from(JSON.stringify(session.session), "utf8").toString("base64url");
  const name = `sb-${PROJECT_REF}-auth-token`;
  const MAX = 3180;
  const cookie =
    value.length <= MAX
      ? `${name}=${value}`
      : Array.from(
          { length: Math.ceil(value.length / MAX) },
          (_, i) => `${name}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`
        ).join("; ");

  return { id: data.user.id, email, cookie };
}

async function seedClientRecord(userId) {
  const { data, error } = await svc
    .from("clients")
    .insert({
      user_id: userId,
      company_name: SMOKE_COMPANY,
      contact_name: "Smoke Test",
      cmmc_target_level: 2,
      engagement_stage: "lead",
      engagement_type: "assessment",
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not seed client: ${error.message}`);
  created.clientId = data.id;

  const { data: assessment } = await svc
    .from("assessments")
    .insert({ client_id: data.id, status: "in_progress" })
    .select("id")
    .single();
  created.assessmentId = assessment?.id ?? null;
  return data.id;
}

async function cleanup() {
  if (created.assessmentId) {
    await svc.from("assessment_responses").delete().eq("assessment_id", created.assessmentId);
    await svc.from("assessments").delete().eq("id", created.assessmentId);
    created.assessmentId = null;
  }
  if (created.clientId) {
    await svc.from("clients").delete().eq("id", created.clientId);
    created.clientId = null;
  }
  for (const id of created.users.splice(0)) {
    await svc.from("audit_log").delete().eq("actor_id", id);
    await svc.from("user_roles").delete().eq("user_id", id);
    await svc.auth.admin.deleteUser(id);
  }
}

/** Delete anything a previous killed run left behind. */
async function cleanupOnly() {
  let removed = 0;
  const { data: clients } = await svc.from("clients").select("id").eq("company_name", SMOKE_COMPANY);
  for (const c of clients ?? []) {
    const { data: assessments } = await svc.from("assessments").select("id").eq("client_id", c.id);
    for (const a of assessments ?? []) {
      await svc.from("assessment_responses").delete().eq("assessment_id", a.id);
      await svc.from("assessments").delete().eq("id", a.id);
    }
    await svc.from("clients").delete().eq("id", c.id);
    removed++;
  }
  for (let page = 1; ; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (!u.email?.startsWith(EMAIL_PREFIX)) continue;
      await svc.from("audit_log").delete().eq("actor_id", u.id);
      await svc.from("user_roles").delete().eq("user_id", u.id);
      await svc.auth.admin.deleteUser(u.id);
      removed++;
    }
    if (data.users.length < 200) break;
  }
  console.log(removed ? `Removed ${removed} leftover smoke record(s).` : "Nothing to clean up.");
}

// ------------------------------------------------------------------ the check

const results = [];

async function check({ label, url, cookie, expect: expectation }) {
  let res;
  let body = "";
  try {
    res = await fetch(url, { headers: cookie ? { cookie } : {}, redirect: "manual" });
    body = await res.text();
  } catch (err) {
    results.push({ label, ok: false, detail: `request failed: ${err.message}` });
    return;
  }

  const location = res.headers.get("location") ?? "";
  const errorPage = /server-side exception|Application error/i.test(body);
  let ok = false;
  let detail = "";

  if (errorPage) {
    ok = false;
    detail = `HTTP ${res.status} but rendered Next.js error page (server exception)`;
  } else if (expectation === "renders") {
    ok = res.status === 200;
    detail = ok ? `HTTP 200 (${body.length} bytes)` : `HTTP ${res.status}${location ? ` -> ${location}` : ""}`;
  } else if (expectation === "redirects") {
    ok = res.status >= 300 && res.status < 400;
    detail = `HTTP ${res.status}${location ? ` -> ${location}` : ""}`;
  } else if (expectation === "denied") {
    // Must not render. A redirect away, or a 401/403/404, all count as denied.
    ok = res.status !== 200;
    detail = ok ? `HTTP ${res.status}${location ? ` -> ${location}` : ""}` : "HTTP 200 — route was NOT protected";
  }

  results.push({ label, ok, detail });
}

// ----------------------------------------------------------------------- main

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--cleanup")) return cleanupOnly();

  const baseUrl = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000").replace(/\/$/, "");
  const routes = discoverRoutes();
  console.log(`Smoke testing ${routes.length} routes against ${baseUrl}\n`);

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(130);
  });

  try {
    const users = {
      admin: await mintUser("admin"),
      assessor: await mintUser("assessor"),
      client: await mintUser("client"),
    };
    const smokeClientId = await seedClientRecord(users.client.id);

    // A real client id for [id] routes — prefer an existing one, fall back to ours.
    const { data: anyClient } = await svc.from("clients").select("id").neq("id", smokeClientId).limit(1);
    const clientIdForRoutes = anyClient?.[0]?.id ?? smokeClientId;
    const resolve = (route) => route.replace("[id]", clientIdForRoutes);

    // 1. Every route, as the role that owns it.
    for (const route of routes) {
      const role = roleForRoute(route);
      await check({
        label: `${role.padEnd(8)} ${route}`,
        url: baseUrl + resolve(route),
        cookie: role === "public" ? null : users[role].cookie,
        expect: REDIRECT_ONLY.has(route) ? "redirects" : "renders",
      });
    }

    // 2. Admin and assessor must see the same client pages — the parity that
    //    matters most, since assessors are meant to work clients like admins.
    for (const route of routes.filter((r) => r.startsWith("/assessor/clients"))) {
      await check({
        label: `admin    ${route} (assessor parity)`,
        url: baseUrl + resolve(route),
        cookie: users.admin.cookie,
        expect: "renders",
      });
    }
    // Assessors work clients through /assessor/*, not the admin area — account
    // administration (create/delete/disable clients, invite assessors) stays
    // admin-only, so /admin/* must still turn an assessor away.
    for (const route of ["/admin/dashboard", "/admin/team", `/admin/clients/${clientIdForRoutes}`]) {
      await check({
        label: `assessor ${route} (admin-only)`,
        url: baseUrl + route,
        cookie: users.assessor.cookie,
        expect: "denied",
      });
    }

    // 3. Portal routes again with no client record — the empty-state paths.
    await svc.from("assessments").delete().eq("client_id", smokeClientId);
    await svc.from("clients").delete().eq("id", smokeClientId);
    created.clientId = null;
    created.assessmentId = null;
    for (const route of routes.filter((r) => roleForRoute(r) === "client")) {
      await check({
        label: `client   ${route} (no client record)`,
        url: baseUrl + resolve(route),
        cookie: users.client.cookie,
        expect: "renders",
      });
    }

    // 4. Clients must not reach staff areas.
    for (const route of ["/admin/dashboard", "/assessor/dashboard"]) {
      await check({
        label: `client   ${route} (must be denied)`,
        url: baseUrl + route,
        cookie: users.client.cookie,
        expect: "denied",
      });
    }

    // 5. Signed-out users must not reach protected routes.
    for (const route of ["/admin/dashboard", "/assessor/dashboard", "/portal/dashboard"]) {
      await check({
        label: `anon     ${route} (must be denied)`,
        url: baseUrl + route,
        cookie: null,
        expect: "denied",
      });
    }
  } finally {
    await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.label}  —  ${r.detail}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.error(`\n${failed.length} FAILED:`);
    for (const r of failed) console.error(`  ${r.label} — ${r.detail}`);
    process.exit(1);
  }
  console.log("All routes rendered.");
}

main().catch(async (err) => {
  await cleanup();
  console.error("Smoke test aborted:", err.message);
  process.exit(2);
});
