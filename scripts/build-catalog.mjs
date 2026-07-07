// Builds the CMMC 2.0 / NIST SP 800-171 Rev 2 control catalog from the official
// NIST source spreadsheets, plus the DoD Assessment Methodology weights.
//
// Inputs (download from NIST CSRC):
//   sp800-171r2-reqs.xlsx        — requirement text + discussion
//   sp800-171a-procedures.xlsx   — 800-171A assessment objectives
//
// Outputs:
//   data/nist-800-171-controls.json     — client-safe catalog (id, family, level, weight, text, guidance)
//   data/assessment-objectives.json     — server-side: discussion + per-requirement assessment objectives
//   supabase/migrations/009_cmmc2_control_ids.sql — remaps legacy CMMC 1.0-style IDs in the live DB
//
// Usage: node scripts/build-catalog.mjs <dir-containing-xlsx>

import XLSX from "xlsx";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const srcDir = process.argv[2];
if (!srcDir) {
  console.error("Usage: node scripts/build-catalog.mjs <dir-containing-xlsx>");
  process.exit(1);
}

// DoD Assessment Methodology v1.2.1, Annex A point values.
// 3.12.4 (SSP) has no point value: without an SSP the assessment cannot be scored.
const WEIGHTS = {
  "3.1.1": 5, "3.1.2": 5, "3.1.3": 1, "3.1.4": 1, "3.1.5": 3, "3.1.6": 1, "3.1.7": 1,
  "3.1.8": 1, "3.1.9": 1, "3.1.10": 1, "3.1.11": 1, "3.1.12": 5, "3.1.13": 5, "3.1.14": 1,
  "3.1.15": 1, "3.1.16": 5, "3.1.17": 5, "3.1.18": 5, "3.1.19": 3, "3.1.20": 1, "3.1.21": 1,
  "3.1.22": 1,
  "3.2.1": 5, "3.2.2": 5, "3.2.3": 1,
  "3.3.1": 5, "3.3.2": 3, "3.3.3": 1, "3.3.4": 1, "3.3.5": 5, "3.3.6": 1, "3.3.7": 1,
  "3.3.8": 1, "3.3.9": 1,
  "3.4.1": 5, "3.4.2": 5, "3.4.3": 1, "3.4.4": 1, "3.4.5": 5, "3.4.6": 5, "3.4.7": 5,
  "3.4.8": 5, "3.4.9": 1,
  "3.5.1": 5, "3.5.2": 5, "3.5.3": 5, "3.5.4": 1, "3.5.5": 1, "3.5.6": 1, "3.5.7": 1,
  "3.5.8": 1, "3.5.9": 1, "3.5.10": 5, "3.5.11": 1,
  "3.6.1": 5, "3.6.2": 5, "3.6.3": 1,
  "3.7.1": 3, "3.7.2": 5, "3.7.3": 1, "3.7.4": 3, "3.7.5": 5, "3.7.6": 1,
  "3.8.1": 3, "3.8.2": 3, "3.8.3": 5, "3.8.4": 1, "3.8.5": 1, "3.8.6": 1, "3.8.7": 5,
  "3.8.8": 3, "3.8.9": 1,
  "3.9.1": 3, "3.9.2": 5,
  "3.10.1": 5, "3.10.2": 5, "3.10.3": 1, "3.10.4": 1, "3.10.5": 1, "3.10.6": 1,
  "3.11.1": 3, "3.11.2": 5, "3.11.3": 1,
  "3.12.1": 5, "3.12.2": 3, "3.12.3": 5, "3.12.4": 0,
  "3.13.1": 5, "3.13.2": 5, "3.13.3": 1, "3.13.4": 1, "3.13.5": 5, "3.13.6": 5, "3.13.7": 1,
  "3.13.8": 3, "3.13.9": 1, "3.13.10": 1, "3.13.11": 5, "3.13.12": 1, "3.13.13": 1,
  "3.13.14": 1, "3.13.15": 5, "3.13.16": 1,
  "3.14.1": 5, "3.14.2": 5, "3.14.3": 5, "3.14.4": 5, "3.14.5": 3, "3.14.6": 5, "3.14.7": 3,
};

// Requirements with conditional/partial scoring per the DoD methodology
const SPECIAL_SCORING = {
  "3.5.3": "partial_3", // MFA for remote/privileged only → deduct 3 instead of 5
  "3.13.11": "partial_3", // encryption employed but not FIPS-validated → deduct 3 instead of 5
  "3.12.4": "ssp_required", // no SSP → assessment cannot be scored at all
};

// CMMC Level 1 = the 17 practices from FAR 52.204-21 (basic safeguarding of FCI)
const LEVEL1 = new Set([
  "3.1.1", "3.1.2", "3.1.20", "3.1.22",
  "3.5.1", "3.5.2",
  "3.8.3",
  "3.10.1", "3.10.3", "3.10.4", "3.10.5",
  "3.13.1", "3.13.5",
  "3.14.1", "3.14.2", "3.14.4", "3.14.5",
]);

const FAMILY_CODES = {
  "3.1": "AC", "3.2": "AT", "3.3": "AU", "3.4": "CM", "3.5": "IA", "3.6": "IR",
  "3.7": "MA", "3.8": "MP", "3.9": "PS", "3.10": "PE", "3.11": "RA", "3.12": "CA",
  "3.13": "SC", "3.14": "SI",
};

// --- Parse 800-171r2 requirements ---
const reqWb = XLSX.readFile(join(srcDir, "sp800-171r2-reqs.xlsx"));
const reqRows = XLSX.utils.sheet_to_json(reqWb.Sheets["SP 800-171"], { header: 1 }).slice(1);

const requirements = [];
for (const row of reqRows) {
  const [family, basicDerived, id, , text, discussion] = row;
  if (!id || !/^3\.\d+\.\d+$/.test(String(id).trim())) continue;
  requirements.push({
    id: String(id).trim(),
    family: String(family).trim(),
    basic: String(basicDerived).trim() === "Basic",
    description: String(text).replace(/\s*\[\d+\]/g, "").trim(),
    discussion: String(discussion ?? "").replace(/\s*\[\d+\]/g, "").trim(),
  });
}
if (requirements.length !== 110) {
  console.error(`Expected 110 requirements, got ${requirements.length}`);
  process.exit(1);
}

// --- Parse 800-171A assessment objectives ---
const aWb = XLSX.readFile(join(srcDir, "sp800-171a-procedures.xlsx"));
const aRows = XLSX.utils.sheet_to_json(aWb.Sheets["SP800-171A"], { header: 1 }).slice(1);

const objectives = {}; // "3.1.1" -> [{ id: "3.1.1[a]", text }]
const examineMethods = {}; // "3.1.1" -> "SELECT FROM: ..."
for (const row of aRows) {
  const rawId = String(row[1] ?? "").trim();
  const objText = String(row[4] ?? "").trim();
  const parentMatch = rawId.match(/^(3\.\d+\.\d+)$/);
  const objMatch = rawId.match(/^(3\.\d+\.\d+)\[([a-z]+)\]$/);
  if (parentMatch) {
    const id = parentMatch[1];
    const examine = String(row[5] ?? "").trim();
    if (examine) examineMethods[id] = examine.replace(/^\[SELECT FROM:\s*/i, "").replace(/\]$/, "");
    // 24 requirements have a single objective embedded in the parent row
    // ("Determine if <objective text>") instead of [a]/[b] sub-rows.
    const embedded = objText.replace(/^Determine if:?\s*/i, "").trim();
    if (embedded.length > 5) (objectives[id] ??= []).push({ id, text: embedded });
  } else if (objMatch && objText) {
    const parent = objMatch[1];
    (objectives[parent] ??= []).push({ id: `${parent}[${objMatch[2]}]`, text: objText });
  }
}
const objCount = Object.values(objectives).reduce((n, a) => n + a.length, 0);
console.log(`Parsed ${requirements.length} requirements, ${objCount} assessment objectives`);

// --- Map legacy controls (old JSON) to new IDs by description similarity ---
// Preserved copy of the original hand-written catalog (CMMC 1.0-style IDs)
const legacy = JSON.parse(readFileSync("data/legacy-controls-cmmc1.json", "utf8"));

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/\binformation systems?\b/g, "system")
    .replace(/\bsystems?\b/g, "system")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function similarity(a, b) {
  const setA = new Set(normalize(a));
  const setB = new Set(normalize(b));
  let common = 0;
  for (const w of setA) if (setB.has(w)) common++;
  return common / Math.max(setA.size, setB.size);
}

// The legacy catalog was hand-written with invented CMMC 1.0-style IDs; 13 of its
// entries have no exact Rev 2 counterpart. Global best-score matching handles the 97
// clean matches; MANUAL_MAP places the rest with the nearest-topic requirement so
// existing client responses stay in the right control family. These 13 should be
// re-verified by clients (the requirement text changed materially).
const MANUAL_MAP = {
  // legacy id -> new id (nearest topic, same family)
  "AU.3.045": "3.3.9",   // review audit logs → limit audit-log management to privileged subset
  "CM.3.071": "3.4.6",   // system inventory → least functionality
  "CM.3.072": "3.4.9",   // penetration testing (not in 800-171 r2) → control user-installed software
  "IA.3.085": "3.5.5",   // crypto system authentication → prevent identifier reuse
  "MP.3.126": "3.8.2",   // sanitization strength → limit access to CUI on media
  "PE.1.132": "3.10.2",  // escort visitors/physical logs → protect and monitor facility
  "RA.3.144": "3.11.3",  // periodic risk assessments → remediate vulnerabilities
  "SC.3.179": "3.13.15", // encrypted network-device mgmt sessions → authenticity of comm sessions
  "SC.3.188": "3.13.16", // government-approved crypto → protect CUI at rest
  "SI.2.214": "3.14.3",  // monitor for attacks → monitor security alerts and advisories
  "SI.3.218": "3.14.7",  // spam protection (not in 800-171 r2) → identify unauthorized use
};

const legacyMap = {}; // new id -> legacy entry
const usedLegacy = new Set();

for (const [oldId, newId] of Object.entries(MANUAL_MAP)) {
  const old = legacy.find((o) => o.id === oldId);
  if (!old) throw new Error(`MANUAL_MAP legacy id not found: ${oldId}`);
  if (!requirements.find((r) => r.id === newId)) throw new Error(`MANUAL_MAP new id not found: ${newId}`);
  legacyMap[newId] = old;
  usedLegacy.add(oldId);
}

// Global matching: score all remaining pairs, assign best-first so a strong match
// is never stolen by an earlier weaker one.
const pairs = [];
for (const req of requirements) {
  if (legacyMap[req.id]) continue;
  for (const old of legacy) {
    if (usedLegacy.has(old.id)) continue;
    pairs.push({ req, old, s: similarity(req.description, old.description) });
  }
}
pairs.sort((a, b) => b.s - a.s);
for (const { req, old, s } of pairs) {
  if (s < 0.4) break;
  if (legacyMap[req.id] || usedLegacy.has(old.id)) continue;
  legacyMap[req.id] = old;
  usedLegacy.add(old.id);
}
const unmatchedNew = requirements.filter((r) => !legacyMap[r.id]).map((r) => r.id);
const unmatchedOld = legacy.filter((o) => !usedLegacy.has(o.id)).map((o) => o.id);
console.log(`Legacy mapping: ${Object.keys(legacyMap).length}/110 matched`);
if (unmatchedNew.length) console.log("Unmatched new IDs:", unmatchedNew.join(", "));
if (unmatchedOld.length) console.log("Unmatched legacy IDs:", unmatchedOld.join(", "));

// --- Build outputs ---
const catalog = requirements.map((req) => {
  const familyNum = req.id.split(".").slice(0, 2).join(".");
  const old = legacyMap[req.id];
  return {
    id: req.id,
    domain: req.family,
    domain_code: FAMILY_CODES[familyNum],
    level: LEVEL1.has(req.id) ? 1 : 2,
    weight: WEIGHTS[req.id],
    ...(SPECIAL_SCORING[req.id] ? { special_scoring: SPECIAL_SCORING[req.id] } : {}),
    basic: req.basic,
    description: req.description,
    guidance: old?.guidance ?? "",
    ...(old ? { legacy_id: old.id } : {}),
  };
});

// Sanity checks
const totalWeight = catalog.reduce((n, c) => n + c.weight, 0);
if (totalWeight !== 313) throw new Error(`Weight sum ${totalWeight} !== 313`);
if (catalog.filter((c) => c.level === 1).length !== 17) throw new Error("Level 1 must have 17 practices");
for (const c of catalog) {
  if (!c.domain_code) throw new Error(`Missing domain code for ${c.id}`);
  if (!objectives[c.id]?.length) throw new Error(`Missing objectives for ${c.id}`);
}

writeFileSync("data/nist-800-171-controls.json", JSON.stringify(catalog, null, 2));

const serverData = {};
for (const req of requirements) {
  serverData[req.id] = {
    discussion: req.discussion,
    examine: examineMethods[req.id] ?? "",
    objectives: objectives[req.id],
  };
}
writeFileSync("data/assessment-objectives.json", JSON.stringify(serverData, null, 2));

// --- Migration SQL: insert new controls, remap child rows, delete legacy rows ---
const esc = (s) => s.replace(/'/g, "''");
const inserts = catalog
  .map(
    (c) =>
      `  ('${c.id}', '${esc(c.domain)}', '${c.domain_code}', ${c.level}, '${esc(c.description)}', ${c.weight}, '${esc(c.guidance ?? "")}')`
  )
  .join(",\n");

const mappedPairs = catalog.filter((c) => c.legacy_id).map((c) => [c.legacy_id, c.id]);
const caseLines = mappedPairs.map(([oldId, newId]) => `    when '${oldId}' then '${newId}'`).join("\n");
const oldIdList = mappedPairs.map(([oldId]) => `'${oldId}'`).join(", ");

const childTables = [
  "assessment_responses",
  "remediation_notes",
  "artifacts",
  "control_ai_feedback",
  "assessor_determinations",
];

const remaps = childTables
  .map(
    (t) => `update ${t} set control_id = case control_id\n${caseLines}\n    else control_id end\n  where control_id in (${oldIdList});`
  )
  .join("\n\n");

const sql = `-- Migrate control catalog from legacy CMMC 1.0-style IDs to NIST SP 800-171 Rev 2 IDs
-- Generated by scripts/build-catalog.mjs — do not edit by hand.
--
-- 1. Insert the 110 NIST SP 800-171 Rev 2 requirements with DoD Assessment
--    Methodology weights (1/3/5; 3.12.4 has weight 0 = special SSP rule).
-- 2. Remap control_id in all child tables from legacy IDs.
-- 3. Remove the legacy control rows.

insert into controls (id, domain, domain_code, level, description, weight, guidance) values
${inserts}
on conflict (id) do update set
  domain = excluded.domain,
  domain_code = excluded.domain_code,
  level = excluded.level,
  description = excluded.description,
  weight = excluded.weight,
  guidance = excluded.guidance;

${remaps}

delete from controls where id in (${oldIdList});
`;

writeFileSync("supabase/migrations/009_cmmc2_control_ids.sql", sql);
console.log(`Wrote catalog (${catalog.length} controls, weight sum ${totalWeight}), objectives (${objCount}), migration 009.`);
