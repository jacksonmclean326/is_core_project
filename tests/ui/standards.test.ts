// Keeps the interface within responsive-design, mobile and accessibility standards (WCAG 2.2 AA),
// by reading the CSS and HTML directly. jsdom cannot lay pages out, so these checks work on the source.
// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import postcss from "postcss";

const appDirectory = new URL("../../src/app/", import.meta.url);
const read = (path) => readFileSync(new URL(path, appDirectory), "utf8");
const pages = readdirSync(new URL("pages/", appDirectory));
const cssFiles = ["global.css", ...pages.map((page) => `pages/${page}/${page}.css`)];

const declarations = [];
for (const file of cssFiles) {
  postcss.parse(read(file)).walkRules((rule) => {
    let media = "";
    for (let parent = rule.parent; parent && parent.type !== "root"; parent = parent.parent) {
      if (parent.type === "atrule") media = `@${parent.name} ${parent.params}${media ? " | " + media : ""}`;
    }
    rule.walkDecls((decl) => declarations.push({ file, selector: rule.selector.replace(/\s+/g, " "), media, prop: decl.prop, value: decl.value }));
  });
}
const root = Object.fromEntries(declarations.filter((d) => d.selector === ":root" && d.prop.startsWith("--")).map((d) => [d.prop, d.value]));

// ---- WCAG contrast ----
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const linear = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => { const [r, g, b] = channels(hex).map(linear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test("text colours meet 4.5:1 on every background they are used on", () => {
  for (const background of ["--paper", "--white", "--green-soft"]) {
    assert.ok(contrast(root["--ink"], root[background]) >= 4.5, `ink on ${background}`);
    assert.ok(contrast(root["--muted"], root[background]) >= 4.5, `muted (${root["--muted"]}) on ${background} is ${contrast(root["--muted"], root[background]).toFixed(2)}:1`);
  }
  assert.ok(contrast(root["--green-dark"], root["--white"]) >= 4.5, "green-dark on white");
  assert.ok(contrast("#ffffff", root["--green"]) >= 4.5, "white on green (primary buttons)");
  assert.ok(contrast("#b3451f", root["--white"]) >= 4.5, "error text on white");
});

test("form-field edges and the focus ring meet 3:1 (WCAG 1.4.11, 2.4.11)", () => {
  for (const background of ["--white", "--paper"]) {
    assert.ok(contrast(root["--field-border"], root[background]) >= 3, `field border on ${background}: ${contrast(root["--field-border"], root[background]).toFixed(2)}:1`);
  }
  assert.ok(contrast(root["--green"], root["--white"]) >= 3 && contrast(root["--green"], root["--paper"]) >= 3, "focus ring colour");
  const ring = declarations.find((d) => d.selector.includes("button:focus-visible") && d.prop === "outline");
  assert.match(ring.value, /var\(--green\)/, "the focus ring is the solid green, not a pale tint");
  assert.match(ring.value, /^[23]px/, "and at least 2px thick");
});

test("fields that hide their own outline show focus on the box around them", () => {
  for (const wrapper of [".chat-compose", ".input-with-prefix"]) {
    assert.ok(
      declarations.some((d) => d.selector.includes(`${wrapper}:focus-within`) && d.prop === "outline" && d.value.includes("var(--green)")),
      `${wrapper} shows a focus ring`,
    );
  }
});

test("the menu's inactive labels use the readable muted colour", () => {
  const nav = declarations.filter((d) => d.selector === ".nav-item" && d.prop === "color").at(-1);
  assert.equal(nav.value, "var(--muted)");
});

// ---- text size ----
// Short labels and captions may be 11px; everything else is at least 12px. Nothing is below 11px anywhere.
const smallLabels = new Set([
  ".eyebrow", ".nav-item", ".tx-day", ".category-detail-stats span", ".chat-date", ".message-bubble time", ".donut-center span", ".donut-center small",
  ".goal-card .goal-kind", ".legend-row", ".legend-row strong", ".streak-indicator span", ".dashboard-sync", ".trend-change", ".score-note span",
  ".friend-avatar", ".friend-streak", ".invite-code-row span", ".account-count", ".bank-balance small", ".profile-row > div > span",
]);

/** Size in px of the first length in a font-size / font declaration, whether written in px or rem. */
function sizeInPx(value) {
  const match = value.match(/(\d+(?:\.\d+)?)(px|rem)/);
  if (!match) return null;
  return parseFloat(match[1]) * (match[2] === "rem" ? 16 : 1);
}

/** The text size each individual selector ends up with (later rules override earlier ones, per media query). */
function effectiveFontSizes() {
  const sizes = new Map();
  for (const d of declarations) {
    if (d.prop !== "font-size" && d.prop !== "font") continue;
    const px = sizeInPx(d.value);
    if (px === null || d.media.includes("pointer: coarse")) continue;
    for (const selector of d.selector.split(",").map((part) => part.trim())) sizes.set(`${selector}|${d.media}`, { selector, media: d.media, px, file: d.file });
  }
  return [...sizes.values()];
}

test("all text sizes are in rem, so the browser's text-size setting works (WCAG 1.4.4)", () => {
  // the one deliberate exception: phones keep fields at 16px or larger, whatever the text-size setting
  const inPixels = declarations.filter((d) => (d.prop === "font-size" || d.prop === "font") && /\d(\.\d+)?px/.test(d.value) && !/max\(1rem,\s*16px\)/.test(d.value));
  assert.deepEqual(inPixels.map((d) => `${d.selector}: ${d.prop} ${d.value} (${d.file})`), []);
});

test("no text anywhere is below 11px, and only short labels are below 12px", () => {
  const small = effectiveFontSizes().filter((entry) => entry.px < 12);
  const tooSmall = small.filter((entry) => entry.px < 11).map((entry) => `${entry.selector} ${entry.px}px (${entry.file})`);
  assert.deepEqual(tooSmall, [], "below 11px");
  const notLabels = small.filter((entry) => !smallLabels.has(entry.selector)).map((entry) => `${entry.selector} ${entry.px}px${entry.media ? " [" + entry.media + "]" : ""} (${entry.file})`);
  assert.deepEqual(notLabels, [], "content text between 11px and 12px: raise it to 12px, or list it as a label here");
});

// ---- phones ----
const has = (predicate) => declarations.some(predicate);

test("touch screens get 16px fields (no iOS zoom) and 44px targets", () => {
  assert.ok(has((d) => d.media.includes("pointer: coarse") && /input:not/.test(d.selector) && d.prop === "font-size" && d.value.includes("16px") && d.value.includes("1rem")), "16px fields on touch");
  for (const selector of [".small-action", ".dialog-close", ".remove-goal", ".edit-summary-button", ".row-action"]) {
    assert.ok(
      has((d) => d.media.includes("pointer: coarse") && d.selector.includes(selector) && /^min-(width|height)$/.test(d.prop) && d.value === "44px"),
      `${selector} is at least 44px on touch screens`,
    );
  }
});

test("small controls are still at least 24px with a mouse (WCAG 2.5.8)", () => {
  const rowAction = declarations.filter((d) => d.selector === ".row-action" && d.prop === "min-height").at(-1);
  assert.ok(parseInt(rowAction.value, 10) >= 24, "Edit/Delete buttons");
  const checkbox = declarations.filter((d) => d.selector === ".category-edit-row input[type=\"checkbox\"]" && d.prop === "width").at(-1);
  assert.ok(parseInt(checkbox.value, 10) >= 24, "checkboxes in Edit summary");
  const monthArrows = declarations.find((d) => d.selector === ".small-action" && d.prop === "width");
  assert.ok(parseInt(monthArrows.value, 10) >= 24);
});

test("layout adapts to small screens, short screens and reduced motion", () => {
  assert.ok(has((d) => d.media.includes("max-width: 720px")), "phone breakpoint");
  assert.ok(has((d) => d.media.includes("max-width: 560px") && d.selector.includes("category-edit-row")), "Edit summary rows restack on narrow phones");
  assert.ok(has((d) => d.media.includes("prefers-reduced-motion: reduce")), "reduced motion is respected");
  assert.ok(has((d) => d.selector === "html" && d.prop === "scroll-padding-bottom"), "keyboard focus is kept clear of the fixed menu");
  assert.ok(has((d) => d.selector === ".detail-dialog" && d.value.includes("dvh")), "popups follow the visible screen height");
  assert.ok(has((d) => d.selector === ".edit-form" && d.value.includes("dvh")), "the Edit form follows the visible screen height");
  assert.ok(has((d) => d.selector === ".summary-heading" && d.prop === "flex-wrap" && d.value === "wrap"), "the page header wraps");
});

test("nothing is given a fixed width wider than the smallest phone (320px)", () => {
  const wide = declarations.filter((d) => /^(min-)?width$/.test(d.prop) && /^\d+px$/.test(d.value) && parseInt(d.value, 10) > 320);
  assert.deepEqual(wide.map((d) => `${d.selector} ${d.prop}: ${d.value}`), []);
});

test("the popup never exceeds the screen width", () => {
  const width = declarations.find((d) => d.selector === ".detail-dialog" && d.prop === "width");
  assert.match(width.value, /100vw/);
});

test("the menu bar is pinned on every screen size", () => {
  const unpinned = declarations.filter((d) => d.selector === ".bottom-nav" && d.prop === "position" && d.value !== "fixed");
  assert.deepEqual(unpinned, [], "no breakpoint puts the menu back at the end of the page");
});

// ---- every page ----
test("every page has the basics: language, title, zoom allowed, one main area, one heading, named navigation, image text", () => {
  for (const page of pages) {
    const html = read(`pages/${page}/${page}.html`);
    assert.match(html, /<html[^>]*\blang="en"/, `${page}: language`);
    assert.match(html, /<title>[^<]+<\/title>/, `${page}: title`);
    const viewport = html.match(/<meta[^>]*name="viewport"[^>]*>/)?.[0] ?? "";
    assert.match(viewport, /width=device-width/, `${page}: viewport`);
    assert.doesNotMatch(viewport, /user-scalable=(no|0)|maximum-scale=1\b/, `${page}: pinch-zoom must stay allowed`);
    assert.equal((html.match(/<main\b/g) ?? []).length, 1, `${page}: exactly one main area`);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${page}: exactly one h1`);
    for (const nav of html.match(/<nav\b[^>]*>/g) ?? []) assert.match(nav, /aria-label=/, `${page}: <nav> needs a name`);
    for (const img of html.match(/<img\b[^>]*>/g) ?? []) assert.match(img, /\balt=/, `${page}: image without alt text`);
  }
});

test("the logo image is small enough for mobile data (shown at 43px)", () => {
  const bytes = readFileSync(new URL("assets/money-man-mascot.png", appDirectory)).length;
  assert.ok(bytes < 150 * 1024, `${Math.round(bytes / 1024)} KB`);
});
