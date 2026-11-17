import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "@supabase/supabase-js";
import { requireSession } from "./session.js";
import { createServiceSupabaseClient } from "./supabase.js";
import { config } from "../config.js";
import { HttpError } from "../errors.js";

/**
 * Who can open the team-only /admin page. Admins are listed in the "Team Admin" table (managed from the Team admins
 * section of /admin, or the Supabase Table Editor) and, optionally, in ADMIN_EMAILS. Only the server's secret key
 * can read or change that table, and only existing admins can use the endpoints that do, so users cannot make
 * themselves admins.
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

export interface AdminEntry {
  email: string;
  note: string | null;
  addedAt: string | null;
  /** "table" admins can be removed on the page; "settings" ones come from ADMIN_EMAILS and cannot. */
  source: "table" | "settings";
}

interface TeamAdminRow {
  email: string;
  note: string | null;
  added_at: string | null;
}

const normalize = (email: string) => email.trim().toLowerCase();

async function teamAdminRows(): Promise<TeamAdminRow[]> {
  const result = await createServiceSupabaseClient()
    .from("Team Admin")
    .select("email,note,added_at")
    .order("added_at", { ascending: true })
    .returns<TeamAdminRow[]>();
  if (result.error) throw new HttpError(503, "Run supabase/migrations/20261114_team_admins.sql in the Supabase SQL Editor to manage admins here.");
  return result.data ?? [];
}

/** Everyone who can open /admin: rows in the Team Admin table, then any extra emails from ADMIN_EMAILS. */
export async function listAdmins(): Promise<AdminEntry[]> {
  const rows = await teamAdminRows();
  const entries: AdminEntry[] = rows.map((row) => ({ email: normalize(row.email), note: row.note, addedAt: row.added_at, source: "table" }));
  for (const email of config.adminEmails) {
    if (!entries.some((entry) => entry.email === email)) entries.push({ email, note: null, addedAt: null, source: "settings" });
  }
  return entries;
}

/** Adds an admin. The caller checks that the email belongs to an existing account. */
export async function addAdmin(email: string, addedBy: string): Promise<void> {
  const clean = normalize(email);
  const existing = await listAdmins();
  if (existing.some((entry) => entry.email === clean)) throw new HttpError(409, `${clean} is already an admin.`);
  const inserted = await createServiceSupabaseClient().from("Team Admin").insert({ email: clean, note: `Added by ${addedBy}` });
  if (inserted.error) throw new HttpError(500, "Could not add that admin. Please try again.");
  cached = null; // take effect right away on this server
}

/** Removes an admin. You cannot remove yourself (so there is always at least one admin), or an ADMIN_EMAILS entry. */
export async function removeAdmin(email: string, removedBy: string): Promise<void> {
  const clean = normalize(email);
  if (clean === normalize(removedBy)) throw new HttpError(400, "You can't remove yourself. Ask another admin to do it.");
  const row = (await teamAdminRows()).find((entry) => normalize(entry.email) === clean);
  if (!row) {
    if (config.adminEmails.has(clean)) throw new HttpError(400, `${clean} is set in the server settings (ADMIN_EMAILS), so it can't be removed here.`);
    throw new HttpError(404, `${clean} is not an admin.`);
  }
  const removed = await createServiceSupabaseClient().from("Team Admin").delete().eq("email", row.email);
  if (removed.error) throw new HttpError(500, "Could not remove that admin. Please try again.");
  cached = null;
}

/** Like requireSession, but only for the team's admins. */
export async function requireAdmin(request: IncomingMessage, response: ServerResponse) {
  const session = await requireSession(request, response);
  if (!(await isAdminUser(session.user))) {
    throw new HttpError(403, "This page is only for the Money Man team.");
  }
  return session;
}
