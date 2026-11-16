export type AppTheme = "light" | "dark";

export const themeStorageKey = "money-man-theme";

export function getTheme(): AppTheme {
  try {
    return localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
  } catch (error) {
    console.error("Unable to read the saved theme preference.", error);
    return "light";
  }
}

function updateThemeColor(theme: AppTheme): void {
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dark" ? "#141a17" : "#f5f5ef",
  );
}

export function setTheme(theme: AppTheme): void {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  updateThemeColor(theme);
  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch (error) {
    console.error("Unable to cache the account's theme preference in this browser.", error);
  }
}

export function initializeTheme(): void {
  const theme = getTheme();
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  updateThemeColor(theme);
}
