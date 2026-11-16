import { maxCategoryNameLength } from "../../shared/category-colors.js";

export interface CategoryPreference {
  name?: string;
  visible?: boolean;
}

export type CategoryPreferences = Record<string, CategoryPreference>;

const builtInCategoryKeys = new Set([
  "housing",
  "food",
  "transport",
  "utilities",
  "education",
  "personal",
  "other",
]);

/** Reads per-user category labels and chart visibility from untrusted JSON. */
export function parseCategoryPreferences(value: unknown): CategoryPreferences | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 40) return null;
  const preferences: CategoryPreferences = {};
  for (const [key, raw] of entries) {
    if (!builtInCategoryKeys.has(key) && !/^c-[0-9a-f]{8}$/.test(key)) return null;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some((property) => property !== "name" && property !== "visible")) return null;
    const preference: CategoryPreference = {};
    if ("name" in item) {
      if (typeof item.name !== "string" || !item.name.trim() || item.name.trim().length > maxCategoryNameLength || /[<>]/.test(item.name)) {
        return null;
      }
      preference.name = item.name.trim();
    }
    if ("visible" in item) {
      if (typeof item.visible !== "boolean") return null;
      preference.visible = item.visible;
    }
    if (Object.keys(preference).length === 0) return null;
    preferences[key] = preference;
  }
  return preferences;
}
