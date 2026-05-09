/**
 * One-shot migration runner: loads a SQL file from migrations/, executes it
 * against the linked Supabase project using the service-role key + a Postgres
 * RPC (exec_pipeline_sql, available on this project via the outbound repo).
 *
 * Usage:
 *   npx tsx scripts/run-migration.ts migrations/005-drop-dormant-highlight-text.sql
 */

import * as dotenv from "dotenv";
dotenv.config();
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npx tsx scripts/run-migration.ts <path-to-sql>");
  process.exit(1);
}

const sql = readFileSync(path, "utf8");
console.log(`Running migration: ${path}`);
console.log(`SQL: ${sql.length} bytes`);

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: ws as unknown as any },
  },
);

(async () => {
  // Strip BEGIN/COMMIT — the RPC wraps in its own transaction.
  const stripped = sql
    .replace(/^\s*BEGIN\s*;\s*$/im, "")
    .replace(/^\s*COMMIT\s*;\s*$/im, "");

  const { data, error } = await sb.rpc("exec_pipeline_sql", { query: stripped });
  if (error) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }
  console.log("Migration applied OK.");
  console.log("Result:", JSON.stringify(data, null, 2));
})();
