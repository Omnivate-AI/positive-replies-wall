/**
 * Smoke tests — fast health checks that should pass on every push.
 * Verifies: required env vars are present, Supabase reachable, all v2.0
 * prw_* tables exist, Smartlead API reachable.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { supabase } from "../../trigger/lib/supabase.js";
import { listClients } from "../../trigger/lib/smartlead.js";

const REQUIRED_ENV_VARS = [
  "SMARTLEAD_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENROUTER_API_KEY",
];

describe("Required env vars", () => {
  it.each(REQUIRED_ENV_VARS)("%s is set", (name) => {
    const value = process.env[name];
    expect(value, `Missing required env var: ${name}`).toBeTruthy();
    expect(value!.length).toBeGreaterThan(0);
  });
});

describe("Supabase health", () => {
  it("can reach the project and read prw_threads", async () => {
    const { error } = await supabase()
      .from("prw_threads")
      .select("id", { count: "exact", head: true });
    expect(error).toBeNull();
  });

  // v2.0 tables only — prw_replies and prw_ingest_runs are gone after migration 003.
  const TABLES = [
    "prw_threads",
    "prw_messages",
    "prw_classifications",
    "prw_redactions",
    "prw_publish_state",
  ];

  it.each(TABLES)("table %s is reachable", async (table) => {
    const { error: tableErr } = await supabase().from(table).select("*").limit(0);
    expect(tableErr, `${table} not reachable: ${tableErr?.message}`).toBeNull();
  });
});

describe("Smartlead health", () => {
  it("returns at least one client (Omnivate workspace has 9)", async () => {
    const clients = await listClients();
    expect(Array.isArray(clients)).toBe(true);
    expect(clients.length).toBeGreaterThan(0);
    // Each client must have an id (number) — the rest of the schema is downstream-safe nulls.
    expect(typeof clients[0].id).toBe("number");
  }, 30_000);
});

describe("M6 classifier prerequisites", () => {
  it("classifier prompt file exists at trigger/prompts/classify-reply.md", () => {
    const path = resolve(process.cwd(), "trigger", "prompts", "classify-reply.md");
    expect(existsSync(path), `Prompt missing: ${path}`).toBe(true);
    const content = readFileSync(path, "utf8");
    // Sanity: the goal-driven sections are present.
    expect(content).toMatch(/THE OBJECTIVE/);
    expect(content).toMatch(/OUTPUT/);
    expect(content).toMatch(/CATEGORY ENUM/);
    expect(content).toMatch(/GOOD EXAMPLES/);
    expect(content).toMatch(/REJECTION EXAMPLES/);
    expect(content).toMatch(/BAD EXAMPLES/);
  });
});
