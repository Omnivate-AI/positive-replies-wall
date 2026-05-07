/**
 * POST /api/admin/revalidate
 *
 * Trigger ISR revalidation of the public wall (/) so admin changes appear
 * within seconds rather than waiting for the 60s ISR window.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST() {
  revalidatePath("/");
  return NextResponse.json({ ok: true, revalidated: "/" });
}
