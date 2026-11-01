import { icons } from "lucide";

type IconNode = [string, Record<string, string | number>, IconNode[]?];

/** "circle-dollar-sign" -> "CircleDollarSign" (the name lucide exports the icon under) */
export function iconExportName(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

const attributes = (values: Record<string, string | number>) =>
  Object.entries(values)
    .map(([key, value]) => ` ${key}="${String(value).replace(/"/g, "&quot;")}"`)
    .join("");

const nodeToMarkup = ([tag, values, children]: IconNode): string =>
  children?.length ? `<${tag}${attributes(values)}>${children.map(nodeToMarkup).join("")}</${tag}>` : `<${tag}${attributes(values)}/>`;

/** The names of every `<i data-lucide="...">` placeholder in a piece of HTML. */
export function iconNames(html: string): string[] {
  return [...html.matchAll(/<i\b[^>]*\bdata-lucide="([a-z0-9-]+)"[^>]*>/g)].map((match) => match[1] as string);
}

/**
 * Replaces every `<i data-lucide="house" class="x"></i>` placeholder with the finished inline SVG, exactly what
 * the lucide script used to draw in the browser. The icon is then in the page from the first paint, with no
 * script, no third-party download, and no flash of an empty menu.
 */
export function inlineIcons(html: string): string {
  return html
    .replace(/<script\b[^>]*unpkg\.com\/lucide[^>]*>\s*<\/script>\s*/g, "")
    .replace(/<i\b([^>]*)>\s*<\/i\s*>/g, (whole, attrs: string) => {
      const name = attrs.match(/\bdata-lucide="([a-z0-9-]+)"/)?.[1];
      if (!name) return whole;
      const node = (icons as unknown as Record<string, IconNode | undefined>)[iconExportName(name)];
      if (!node) throw new Error(`Unknown icon "${name}" in the page HTML`);
      const [, svgAttributes, children] = node;
      const kept = attrs.replace(/\s*\bdata-lucide="[a-z0-9-]+"/, "");
      const ownClass = kept.match(/\bclass="([^"]*)"/)?.[1];
      const rest = kept.replace(/\s*\bclass="[^"]*"/, "").trim();
      const classes = ["lucide", `lucide-${name}`, ownClass].filter(Boolean).join(" ");
      return `<svg${attributes({ ...svgAttributes, class: classes })}${rest ? " " + rest : ""}>${(children ?? []).map(nodeToMarkup).join("")}</svg>`;
    });
}
