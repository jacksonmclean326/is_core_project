import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
} from "plaid";
import { config } from "../config.js";
import { HttpError, isRecord } from "../errors.js";

export function createPlaidClient(): PlaidApi {
  if (!config.plaidClientId || !config.plaidSecret) {
    throw new HttpError(
      503,
      "Plaid is not configured. Set CLIENT_ID and PLAID_SECRET on the server.",
    );
  }
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[config.plaidMode],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": config.plaidClientId,
          "PLAID-SECRET": config.plaidSecret,
        },
      },
    }),
  );
}

function encryptionKey(): Buffer {
  const encoded = config.plaidTokenEncryptionKey;
  if (!encoded) {
    throw new HttpError(
      503,
      "Plaid token encryption is not configured on the server.",
    );
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new HttpError(
      503,
      "PLAID_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}

export function encryptPlaidAccessToken(accessToken: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptPlaidAccessToken(encryptedToken: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...rest] =
    encryptedToken.split(":");
  if (
    version !== "v1" ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    rest.length
  ) {
    throw new HttpError(
      500,
      "A saved bank connection cannot be read. Reconnect it from Settings.",
    );
  }

  const key = encryptionKey();
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(encodedIv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new HttpError(
      500,
      "A saved bank connection cannot be read. Reconnect it from Settings.",
    );
  }
}

export function logPlaidFailure(error: unknown, operation: string): void {
  const response =
    isRecord(error) && isRecord(error.response) ? error.response : null;
  const data = response && isRecord(response.data) ? response.data : null;
  const code =
    data && typeof data.error_code === "string" ? data.error_code : undefined;
  const requestId =
    data && typeof data.request_id === "string" ? data.request_id : undefined;
  console.error("Plaid request failed.", { operation, code, requestId });
}

export function plaidFailure(
  error: unknown,
  operation: string,
  message: string,
): HttpError {
  logPlaidFailure(error, operation);
  return new HttpError(502, message);
}
