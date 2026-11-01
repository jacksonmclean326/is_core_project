import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { icons } from "lucide";
import { appIcons } from "../src/app/icons.ts";
import { iconExportName, iconNames, inlineIcons } from "../src/build/inline-icons.ts";

const appDirectory = new URL("../src/app/", import.meta.url);
const pages = readdirSync(new URL("pages/", appDirectory));
const pageHtml = (page: string) => readFileSync(new URL(`pages/${page}/${page}.html`, appDirectory), "utf8");

// icons chosen by code at run time (a name picked by a condition, so a plain search cannot see them)
const chosenByCode = ["triangle-alert", "circle-check", "arrow-up-right", "arrow-down-right"];

function sourceFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(new URL(`${entry.name}/`, directory)) : /\.(html|ts)$/.test(entry.name) ? [new URL(entry.name, directory)] : [],
  );
}

test("the name conversion matches the names lucide exports", () => {
  assert.equal(iconExportName("house"), "House");
  assert.equal(iconExportName("circle-dollar-sign"), "CircleDollarSign");
  assert.equal(iconExportName("settings-2"), "Settings2");
  assert.equal(iconExportName("arrow-up-right"), "ArrowUpRight");
});

test("every icon used anywhere in the app is shipped in the bundled icon set", () => {
  const used = new Set<string>(chosenByCode);
  for (const file of sourceFiles(appDirectory)) {
    for (const match of readFileSync(file, "utf8").matchAll(/data-lucide="([a-z0-9-]+)"/g)) used.add(match[1] as string);
  }
  assert.ok(used.size >= 20, `found ${used.size} icons`);
  const missing = [...used].filter((name) => !(iconExportName(name) in appIcons));
  assert.deepEqual(missing, [], "add these to src/app/icons.ts");
  const unknown = [...used].filter((name) => !(iconExportName(name) in icons));
  assert.deepEqual(unknown, [], "these are not real lucide icon names");
});

test("nothing in the icon set is unused clutter", () => {
  const source = sourceFiles(appDirectory).map((file) => readFileSync(file, "utf8")).join("\n");
  const unused = Object.keys(appIcons).filter((key) => {
    const kebab = key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([a-zA-Z])([0-9])/g, "$1-$2").toLowerCase();
    return !source.includes(`"${kebab}"`) && !chosenByCode.includes(kebab);
  });
  assert.deepEqual(unused, []);
});

test("no page loads anything from a third-party server", () => {
  for (const page of pages) {
    const html = pageHtml(page);
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc="https?:/, `${page}: external script`);
    assert.doesNotMatch(html, /unpkg\.com|cdn\.jsdelivr|cdnjs/, `${page}: CDN reference`);
  }
});

test("icon placeholders become inline drawings that keep their class and accessibility attributes", () => {
  const html = inlineIcons(`<a class="nav-item"><i data-lucide="house" aria-hidden="true"></i><span>Home</span></a>`);
  assert.doesNotMatch(html, /data-lucide/);
  assert.match(html, /^<a class="nav-item"><svg [^>]*class="lucide lucide-house"[^>]*aria-hidden="true"><path /);
  assert.match(html, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(html, /viewBox="0 0 24 24"/);
  assert.match(html, /stroke="currentColor"/, "icons take the text colour");
  assert.match(html, /<\/svg><span>Home<\/span>/);
});

test("an icon that already has a class keeps it, next to lucide's own", () => {
  const html = inlineIcons(`<i class="spin" data-lucide="refresh-cw"></i>`);
  assert.match(html, /class="lucide lucide-refresh-cw spin"/);
  assert.doesNotMatch(html, /data-lucide/);
});

test("every icon in every page is drawn, and the CDN script tag is removed", () => {
  for (const page of pages) {
    const before = pageHtml(page);
    const after = inlineIcons(before);
    assert.equal(iconNames(after).length, 0, `${page}: placeholders left`);
    // count only icon drawings (the chart on Details is also an <svg>)
    assert.equal((after.match(/<svg\b[^>]*\blucide\b/g) ?? []).length, iconNames(before).length, `${page}: one drawing per placeholder`);
    assert.doesNotMatch(after, /unpkg/);
  }
});

test("the navigation icons are in the page itself, before any script runs", () => {
  for (const page of pages.filter((name) => name !== "auth")) {
    const nav = inlineIcons(pageHtml(page)).match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.equal((nav.match(/<svg\b[^>]*\blucide\b/g) ?? []).length, 4, `${page}: four menu icons`);
    assert.doesNotMatch(nav, /data-lucide/);
  }
});

test("a mistyped icon name fails the build instead of silently showing nothing", () => {
  assert.throws(() => inlineIcons(`<i data-lucide="hous"></i>`), /Unknown icon "hous"/);
});

test("a closing tag split across lines is still recognised", () => {
  const html = inlineIcons(`<a><i data-lucide="trophy" aria-hidden="true"></i\n  ><span>Friends</span></a>`);
  assert.doesNotMatch(html, /data-lucide/);
  assert.match(html, /lucide-trophy/);
  assert.match(html, /<span>Friends<\/span>/);
});

test("other markup is left alone", () => {
  const html = `<p>Hello <i>italic</i> <em>text</em></p><script src="/app.js"></script>`;
  assert.equal(inlineIcons(html), html);
  assert.equal(inlineIcons(""), "");
});
