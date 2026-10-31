import { resolve } from "node:path";

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env.`);
  return value;
}

const supabaseUrl = requiredEnvironmentValue("SUPABASE_URL");
const supabasePublishableKey = requiredEnvironmentValue("SUPABASE_PUBLISHABLE_KEY");

function validateSupabaseUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return;
  } catch {
    // Use a consistent configuration error for invalid URLs and protocols.
  }
  throw new Error("SUPABASE_URL must be a valid HTTP or HTTPS URL.");
}

function readPort(): number {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }
  return port;
}

validateSupabaseUrl(supabaseUrl);

export const config = {
  supabaseUrl,
  supabasePublishableKey,
  port: readPort(),
  distributionDirectory: resolve(process.cwd(), "dist"),
};
