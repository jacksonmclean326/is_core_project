import { resolve } from "node:path";

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env.`);
  return value;
}

const supabaseUrl = requiredEnvironmentValue("SUPABASE_URL");
const supabasePublishableKey = requiredEnvironmentValue("SUPABASE_PUBLISHABLE_KEY");
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim() || "";
const plaidMode = process.env.PLAID_MODE?.trim() || "sandbox";

if (plaidMode !== "sandbox" && plaidMode !== "production") {
  throw new Error("PLAID_MODE must be sandbox or production.");
}

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
  supabaseSecretKey,
  plaidClientId: process.env.CLIENT_ID?.trim() || "",
  plaidSecret: process.env.PLAID_SECRET?.trim() || "",
  plaidMode,
  plaidTokenEncryptionKey: process.env.PLAID_TOKEN_ENCRYPTION_KEY?.trim() || "",
  port: readPort(),
  distributionDirectory: resolve(process.cwd(), "dist"),
};
