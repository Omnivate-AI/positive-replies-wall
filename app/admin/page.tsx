/**
 * /admin — single-page dashboard.
 *
 * Auth was removed 2026-05-07 per Omar's call: the dashboard is open
 * access during the build-out phase. The /auth page is preserved as a
 * visual placeholder but isn't on the path. Re-introducing auth means
 * restoring the middleware + getAdminSession() check.
 *
 * Server-rendered initial fetch (all threads + redactions). The client
 * component handles filter / select / publish toggle / redaction edits
 * via the /api/admin/* routes.
 */

import { getAdminThreads } from "@/lib/supabase-public";
import { AdminDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const threads = await getAdminThreads();
  return <AdminDashboard initialThreads={threads} adminEmail="open-access" />;
}
