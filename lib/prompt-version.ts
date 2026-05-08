/**
 * Classifier prompt version — the canonical declaration.
 *
 * Bump when the prompt content changes (system prompt, user-message
 * scaffold, or any rule that changes the model's output distribution).
 * Bumping triggers re-classification on the next batch run because
 * `prw_classifications` has a UNIQUE(thread_id, prompt_version) index.
 *
 * SINGLE SOURCE OF TRUTH. Both the Next.js read path
 * (lib/supabase-public.ts) and the Trigger.dev write path
 * (trigger/lib/classify.ts) import from here. To bump, edit only this
 * file. The two-file split exists because Next.js's bundler can't
 * resolve Trigger.dev's `.js`-extension imports — pulling in
 * trigger/lib/classify.ts from a Next.js server module breaks the
 * production build.
 *
 * Naming convention (semver-like): "vMAJOR.MINOR[-suffix]".
 *   - MAJOR bumps for schema changes (new field, removed field).
 *   - MINOR bumps for prompt-content changes that re-score replies.
 *   - -suffix tags experimental or branch-specific iterations.
 */
export const PROMPT_VERSION = "v2.0";
