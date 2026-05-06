/**
 * One-shot migration runner via the Supabase Management API. Used because the
 * MCP is read-only in this session and the project doesn't carry a `supabase/`
 * config dir for `supabase db push`.
 *
 * Usage:  npx tsx scripts/apply-migration.ts <migration-file>
 * Env:    SUPABASE_ACCESS_TOKEN (sbp_*), SUPABASE_URL
 */

import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

dotenv.config();

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx scripts/apply-migration.ts <migration-file>");
  process.exit(1);
}

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.SUPABASE_URL;
if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN is not set");
if (!url) throw new Error("SUPABASE_URL is not set");

// SUPABASE_URL = https://<ref>.supabase.co
const projectRef = new URL(url).hostname.split(".")[0];
const sqlPath = resolve(process.cwd(), file);
const sql = readFileSync(sqlPath, "utf8");

console.log(`Applying ${file} to project ${projectRef} (${sql.length} bytes of SQL)...`);

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  },
);

const body = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${body}`);
  process.exit(1);
}
console.log(`OK (${res.status})`);
console.log(body.slice(0, 500));
