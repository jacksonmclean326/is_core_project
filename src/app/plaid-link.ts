import { createPlaidLinkToken, exchangePlaidPublicToken } from "./api.js";

declare global {
  interface Window {
    Plaid?: {
      create(configuration: {
        token: string;
        onSuccess(
          publicToken: string,
          metadata: {
            institution?: {
              institution_id: string | null;
              name: string;
            } | null;
          },
        ): void;
        onExit(error: { error_message?: string } | null, metadata: unknown): void;
      }): { open(): void };
    };
  }
}

let plaidLinkScript: Promise<void> | null = null;

async function loadPlaidLinkSdk(): Promise<void> {
  if (window.Plaid) return;
  if (!plaidLinkScript) {
    plaidLinkScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
      script.async = true;
      script.onload = () => {
        if (window.Plaid) resolve();
        else reject(new Error("Plaid Link did not initialize."));
      };
      script.onerror = () => reject(new Error("Plaid Link could not be loaded."));
      document.head.append(script);
    });
  }
  await plaidLinkScript;
}

/** Opens Plaid Link, exchanges its public token, and resolves false if the person exits without connecting. */
export async function openPlaidLink(onStatus: (message: string) => void): Promise<boolean> {
  await loadPlaidLinkSdk();
  const { linkToken } = await createPlaidLinkToken();
  if (!window.Plaid) throw new Error("Plaid Link did not initialize.");

  return new Promise((resolve, reject) => {
    let settled = false;
    let successReceived = false;
    const handler = window.Plaid!.create({
      token: linkToken,
      onSuccess: async (publicToken, metadata) => {
        successReceived = true;
        onStatus("Saving your bank connection…");
        try {
          await exchangePlaidPublicToken({
            publicToken,
            institutionId: metadata.institution?.institution_id ?? null,
            institutionName: metadata.institution?.name ?? null,
          });
          if (settled) return;
          settled = true;
          onStatus("Your bank account is connected.");
          resolve(true);
        } catch (error) {
          if (settled) return;
          settled = true;
          reject(error);
        }
      },
      onExit: (error) => {
        if (settled || successReceived) return;
        settled = true;
        if (error) reject(new Error("Plaid could not complete the connection. Please try again."));
        else resolve(false);
      },
    });
    handler.open();
  });
}
