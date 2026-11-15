import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "@supabase/supabase-js";
import { requireSession } from "./auth/session.js";
import { createServiceSupabaseClient } from "./auth/supabase.js";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

/**
 * Who can open the team-only /admin page. Admins are listed in the "Team Admin" table (add a row in the Supabase
 * Table Editor) and, optionally, in ADMIN_EMAILS. Only the server's secret key can read that table, so users
 * cannot make themselves admins.
 */

const cacheMs = 30_000;
let cached: { emails: Set<string>; until: number } | null = null;
let warned = false;

/** Emails in the "Team Admin" table, re-read at most every 30 seconds. Empty if the table does not exist yet. */
async function tableAdmins(): Promise<Set<string>> {
  if (cached && cached.until > Date.now()) return cached.emails;
  if (!config.supabaseSecretKey) return new Set();
  const result = await createServiceSupabaseClient().from("Team Admin").select("email").returns<{ email: string }[]>();
  if (result.error) {
    if (!warned) {
      warned = true;
      console.error("Could not read the Team Admin table; only ADMIN_EMAILS is used. Run supabase/migrations/20261114_team_admins.sql.", result.error.message);
    }
    // Keep the last good list if there was one; otherwise only ADMIN_EMAILS counts. Retry soon either way.
    const emails = cached?.emails ?? new Set<string>();
    cached = { emails, until: Date.now() + 5_000 };
    return emails;
  }
  const emails = new Set((result.data ?? []).map((row) => row.email.trim().toLowerCase()));
  cached = { emails, until: Date.now() + cacheMs };
  return emails;
}

/** True when the user's email is in the Team Admin table or ADMIN_EMAILS. */
export async function isAdminUser(user: Pick<User, "email">): Promise<boolean> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;
  if (config.adminEmails.has(email)) return true;
  return (await tableAdmins()).has(email);
}

/** Like requireSession, but only for the team's admins. */
export async function requireAdmin(request: IncomingMessage, response: ServerResponse) {
  const session = await requireSession(request, response);
  if (!(await isAdminUser(session.user))) {
    throw new HttpError(403, "This page is only for the Money Man team.");
  }
  return session;
}
