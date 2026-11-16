export function friendInviteUrl(code: string): string {
  const url = new URL("/auth", window.location.origin);
  url.searchParams.set("ref", code.toUpperCase());
  return url.toString();
}

/** Uses the native share sheet where available, then clipboard, and returns a URL for manual copying otherwise. */
export async function shareFriendInvite(code: string): Promise<"shared" | "copied" | "cancelled" | string> {
  const url = friendInviteUrl(code);
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Join me on Money Man",
        text: "Create a Money Man account and add me as a friend.",
        url,
      });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return url;
    }
  }
  return url;
}
