import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { iconMarkup, iconNames, inlineIcons, renderIcons } from "../src/app/ui/icons.ts";

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

test("every icon used anywhere in the app has a local SVG definition", () => {
  const used = new Set<string>(chosenByCode);
  for (const file of sourceFiles(appDirectory)) {
    for (const match of readFileSync(file, "utf8").matchAll(/data-icon="([a-z0-9-]+)"/g)) used.add(match[1] as string);
  }
  assert.ok(used.size >= 20, `found ${used.size} icons`);
  for (const name of used) assert.match(iconMarkup(name), /<svg\b/, `missing SVG for ${name}`);
});

test("an unknown icon fails loudly", () => {
  assert.throws(() => iconMarkup("not-an-icon"), /Unknown icon/);
});

test("pages do not load scripts or styles from a third-party server", () => {
  for (const page of pages) {
    const html = pageHtml(page);
    assert.doesNotMatch(html, /<(?:script|link)\b[^>]*(?:src|href)="https?:/i, `${page}: external asset`);
    assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdn\.jsdelivr|cdnjs/, `${page}: CDN reference`);
  }
});

test("icon placeholders become inline drawings that keep their class and accessibility attributes", () => {
  const html = inlineIcons(`<a class="nav-item"><i data-icon="house" aria-hidden="true"></i><span>Home</span></a>`);
  assert.doesNotMatch(html, /data-icon/);
  assert.match(html, /^<a class="nav-item"><svg [^>]*class="icon icon-house"[^>]*aria-hidden="true"><path /);
  assert.match(html, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(html, /viewBox="0 0 24 24"/);
  assert.match(html, /stroke="currentColor"/, "icons take the text colour");
  assert.match(html, /<\/svg><span>Home<\/span>/);
});

test("an icon that already has a class keeps it", () => {
  const html = inlineIcons(`<i class="spin" data-icon="refresh-cw"></i>`);
  assert.match(html, /class="icon icon-refresh-cw spin"/);
  assert.doesNotMatch(html, /data-icon/);
});

test("every icon in every page is drawn before the page is served", () => {
  for (const page of pages) {
    const before = pageHtml(page);
    const after = inlineIcons(before);
    assert.equal(iconNames(after).length, 0, `${page}: placeholders left`);
    // count only icon drawings (the chart on Details is also an <svg>)
    assert.equal((after.match(/<svg\b[^>]*\bicon\b/g) ?? []).length, iconNames(before).length, `${page}: one drawing per placeholder`);
  }
});

test("the navigation icons are in the page itself, before any script runs", () => {
  for (const page of pages.filter((name) => name !== "auth")) {
    const nav = inlineIcons(pageHtml(page)).match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.equal((nav.match(/<svg\b[^>]*\bicon\b/g) ?? []).length, 4, `${page}: four menu icons`);
    assert.doesNotMatch(nav, /data-icon/);
  }
});

test("a mistyped icon name fails the build instead of silently showing nothing", () => {
  assert.throws(() => inlineIcons(`<i data-icon="hous"></i>`), /Unknown icon "hous"/);
});

test("a closing tag split across lines is still recognised", () => {
  const html = inlineIcons(`<a><i data-icon="trophy" aria-hidden="true"></i\n  ><span>Friends</span></a>`);
  assert.doesNotMatch(html, /data-icon/);
  assert.match(html, /icon-trophy/);
  assert.match(html, /<span>Friends<\/span>/);
});

test("dynamic icon placeholders are drawn after insertion", () => {
  const dom = new JSDOM(`<div id="icons"><i data-icon="plus" aria-hidden="true"></i></div>`);
  renderIcons(dom.window.document);
  assert.equal(dom.window.document.querySelector("#icons i"), null);
  assert.equal(dom.window.document.querySelector("#icons svg.icon-plus")?.getAttribute("aria-hidden"), "true");
  dom.window.close();
});

test("other markup is left alone", () => {
  const html = `<p>Hello <i>italic</i> <em>text</em></p><script src="/app.js"></script>`;
  assert.equal(inlineIcons(html), html);
  assert.equal(inlineIcons(""), "");
});
