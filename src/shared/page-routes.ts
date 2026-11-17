/** Pages that have a matching `src/app/pages/<route>/<route>.html` entry point. */
export const pageRoutes = [
  "auth",
  "onboarding",
  "home",
  "details",
  "accounts",
  "chat",
  "leaderboard",
  "settings",
  "privacy",
  "help",
  "admin",
] as const;

export type PageRoute = (typeof pageRoutes)[number];
