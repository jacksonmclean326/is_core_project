/** The model sometimes adds Markdown despite being asked not to; the chat shows plain text, so remove it. */
export function plainText(reply: string): string {
  return reply
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|[.,!?;:]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/(\d) %/g, "$1%")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
