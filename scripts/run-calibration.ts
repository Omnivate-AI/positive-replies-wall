/**
 * M6 calibration runner — validates the classifier prompt against the two
 * acceptance criteria from the brief:
 *
 *   1. 100% of M4 exemplars classified as is_high_quality = true
 *   2. >=3 obvious "junk" replies classified as is_high_quality = false
 *
 * Doesn't write to Supabase; runs the classifier in isolation. Use this for
 * prompt iteration before running the full backfill.
 *
 * Usage:
 *   npm run calibration:m4
 */

import * as dotenv from "dotenv";
dotenv.config();

import { classifyReply } from "../trigger/lib/classify.js";
import { M4_EXEMPLARS, JUNK_REPLIES } from "../tests/_helpers/m4-exemplars.js";

interface Row {
  label: string;
  expected_high_quality: boolean;
  total: number;
  is_high_quality: boolean;
  praise: number;
  spec: number;
  auth: number;
  stand: number;
  categories: string[];
  reasoning: string;
  ok: boolean;
  error?: string;
}

async function classifyOne(label: string, input: any, expected: boolean): Promise<Row> {
  try {
    const r = await classifyReply(input);
    const total = r.praise_score + r.specificity_score + r.authenticity_score + r.standalone_score;
    return {
      label,
      expected_high_quality: expected,
      total,
      is_high_quality: r.is_high_quality,
      praise: r.praise_score,
      spec: r.specificity_score,
      auth: r.authenticity_score,
      stand: r.standalone_score,
      categories: r.categories,
      reasoning: r.reasoning,
      ok: r.is_high_quality === expected,
    };
  } catch (e) {
    return {
      label,
      expected_high_quality: expected,
      total: 0,
      is_high_quality: false,
      praise: 0,
      spec: 0,
      auth: 0,
      stand: 0,
      categories: [],
      reasoning: "",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  console.log("M6 calibration: M4 exemplars + junk control");
  console.log(`Exemplars: ${M4_EXEMPLARS.length} (must all classify is_high_quality=true)`);
  console.log(`Junk: ${JUNK_REPLIES.length} (must all classify is_high_quality=false)\n`);

  const results: Row[] = [];

  // Concurrency 5 — same as the batch runner. Keeps the calibration fast (~2 min).
  const concurrency = 5;
  const all: Array<{ label: string; input: any; expected: boolean }> = [
    ...M4_EXEMPLARS.map((e) => ({ label: `M4 ${e.file}`, input: e, expected: true })),
    ...JUNK_REPLIES.map((j, i) => ({ label: `JUNK ${i + 1}`, input: j, expected: false })),
  ];

  let cursor = 0;
  const inflight = new Set<Promise<void>>();
  while (cursor < all.length || inflight.size > 0) {
    while (inflight.size < concurrency && cursor < all.length) {
      const item = all[cursor++];
      const p = classifyOne(item.label, item.input, item.expected).then((row) => {
        results.push(row);
        const mark = row.ok ? "✓" : "✗";
        const flag = row.is_high_quality ? "HQ" : "  ";
        const expected = row.expected_high_quality ? "expected HQ" : "expected reject";
        const summary = row.error
          ? `ERROR: ${row.error.slice(0, 80)}`
          : `total=${row.total} ${flag} (${expected}) [${row.categories.join(",") || "-"}]`;
        console.log(`${mark} ${row.label.padEnd(20)} ${summary}`);
      });
      inflight.add(p);
      p.finally(() => inflight.delete(p));
    }
    if (inflight.size > 0) await Promise.race(inflight);
  }

  console.log("\n--- Summary ---");
  const exemplarRows = results.filter((r) => r.label.startsWith("M4 "));
  const junkRows = results.filter((r) => r.label.startsWith("JUNK "));

  const exemplarPassing = exemplarRows.filter((r) => r.ok).length;
  const junkPassing = junkRows.filter((r) => r.ok).length;

  console.log(`M4 exemplars passing (high_quality=true): ${exemplarPassing}/${exemplarRows.length}`);
  console.log(`Junk replies passing (high_quality=false): ${junkPassing}/${junkRows.length}`);

  if (exemplarPassing < exemplarRows.length) {
    console.log("\n--- Exemplars that FAILED to clear the bar ---");
    for (const r of exemplarRows.filter((r) => !r.ok)) {
      console.log(
        `  ${r.label} — total=${r.total} (praise=${r.praise} spec=${r.spec} auth=${r.auth} stand=${r.stand})`,
      );
      console.log(`    reasoning: ${r.reasoning}`);
      if (r.error) console.log(`    error: ${r.error}`);
    }
  }

  if (junkPassing < junkRows.length) {
    console.log("\n--- Junk replies that PASSED the bar (false positives) ---");
    for (const r of junkRows.filter((r) => !r.ok)) {
      console.log(
        `  ${r.label} — total=${r.total} (praise=${r.praise} spec=${r.spec} auth=${r.auth} stand=${r.stand})`,
      );
      console.log(`    reasoning: ${r.reasoning}`);
    }
  }

  const acceptance1 = exemplarPassing === exemplarRows.length;
  const acceptance2 = junkPassing >= 3;
  console.log(`\nAcceptance #1 (100% of M4 exemplars high-quality): ${acceptance1 ? "PASS" : "FAIL"}`);
  console.log(`Acceptance #2 (>=3 junk replies rejected):           ${acceptance2 ? "PASS" : "FAIL"}`);

  process.exit(acceptance1 && acceptance2 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
