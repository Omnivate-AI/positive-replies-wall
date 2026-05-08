/**
 * SDR first names — the people whose mailboxes we send from on behalf of
 * client SDRs. Their names appear in salutations of every prospect reply
 * ("Hi Christie", "Hi Andrew").
 *
 * As of 2026-05-06: redacted on the public wall. Omar's call — uniform
 * redaction reads cleaner than mixed visible/hidden names, and the wall
 * is a public surface where exposing per-campaign SDR identity isn't
 * necessary.
 *
 * Render-time only: the wall augments each thread's redactions with this
 * list at render time. The DB doesn't store these as auto_lead redactions
 * because they're global, not per-thread.
 *
 * SINGLE SOURCE OF TRUTH. Other modules (trigger/lib/classify.ts,
 * trigger/lib/mappers.ts) import from here. To add or remove an SDR,
 * edit only this file.
 */
export const SDR_FIRST_NAMES = ["Christie", "Andrew", "James", "Josh", "Omar"];
