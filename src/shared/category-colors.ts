/** Limits and colors for a person's own categories. Used by the server (to validate) and the browser (to offer). */

export const maxCustomCategories = 12;
export const maxCategoryNameLength = 24;

/** The colors a custom category can have, in the order they are handed out when none is chosen. */
export const customCategoryColors: readonly { value: string; name: string }[] = [
  { value: "#c0504d", name: "Brick red" },
  { value: "#4f81bd", name: "Blue" },
  { value: "#8064a2", name: "Purple" },
  { value: "#4bacc6", name: "Sky" },
  { value: "#f79646", name: "Orange" },
  { value: "#9bbb59", name: "Green" },
  { value: "#7f7f7f", name: "Gray" },
  { value: "#2c4d75", name: "Navy" },
  { value: "#b65708", name: "Rust" },
  { value: "#6b8e23", name: "Olive" },
  { value: "#8b4789", name: "Plum" },
  { value: "#2e8b8b", name: "Teal" },
];

export function isCustomCategoryColor(value: unknown): value is string {
  return typeof value === "string" && customCategoryColors.some((color) => color.value === value.toLowerCase());
}
