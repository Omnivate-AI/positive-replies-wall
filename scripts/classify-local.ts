/**
 * Local CLI runner for the classification batch — same code path as the
 * Trigger.dev task, minus the Trigger runtime.
 *
 * Usage:
 *   npm run classify:local                          # classify all unclassified at current prompt version
 *   npm run classify:local -- --reply-id 123,456    # only specific replies
 *   npm run classify:local -- --limit 10            # cap how many to classify (useful for prompt iteration)
 *   npm run classify:local -- --concurrency 3       # tune parallel OpenRouter calls
 */

import * as dotenv from "dotenv";
dotenv.config();

import { runClassifyBatch, type ClassifyBatchOptions } from "../trigger/lib/classify-batch.js";

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const replyIdArg = parseArg("reply-id");
const limitArg = parseArg("limit");
const concurrencyArg = parseArg("concurrency");

const opts: ClassifyBatchOptions = {
  replyIds: replyIdArg ? replyIdArg.split(",").map(Number) : undefined,
  limit: limitArg ? Number(limitArg) : undefined,
  concurrency: concurrencyArg ? Number(concurrencyArg) : undefined,
  onProgress: (msg) => console.log(msg),
};

console.log("Starting local classify batch:", {
  replyIds: opts.replyIds,
  limit: opts.limit,
  concurrency: opts.concurrency,
});

runClassifyBatch(opts)
  .then((stats) => {
    console.log("\n--- Final stats ---");
    console.log(JSON.stringify({ ...stats, errors: stats.errors }, null, 2));
    process.exit(stats.errors.length ? 1 : 0);
  })
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  });
