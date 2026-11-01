// A browserless rig for the pages: it runs a page's real code in a simulated DOM (jsdom) against a fake API,
// so interface behaviour and accessibility can be tested without opening a browser.
// jsdom has no layout engine: widths, wrapping and colours are checked by tests/ui/standards.test.ts instead.
// @ts-nocheck
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const pagesDirectory = new URL("../../src/app/pages/", import.meta.url);

export const month = "2026-10";

export const sampleTransactions = [
  { id: "p1", name: "Starbucks", amount: 6.5, date: "2026-10-28", category: "food", account: "Checking", institution: "First Platypus Bank" },
  { id: "p2", name: "Uber", amount: 14, date: "2026-10-28", category: "transport", account: "Credit card", institution: "First Platypus Bank" },
  { id: "p3", name: "A very long merchant name that keeps going and going so that it must wrap or be cut off somewhere", amount: 12.25, date: "2026-10-26", category: "food", account: "Checking", institution: "First Platypus Bank" },
  { id: "p4", name: "Interest charged", amount: 20, date: "2026-10-01", category: "other", account: "Credit card", institution: "First Platypus Bank" },
  { id: "m1", name: "Corner Bakery", amount: 1200, date: "2026-10-15", category: "c-1a2b3c4d", account: "Manual entry", institution: "Manual", manual: true },
  { id: "p5", name: "<img src=x onerror=alert(1)>", amount: 3, date: "2026-10-14", category: "personal", account: "Checking", institution: "First Platypus Bank" },
];

export function monthResponse(transactions = sampleTransactions, history = 0) {
  return {
    month,
    customCategories: [{ key: "c-1a2b3c4d", name: "Fun Money", color: "#4bacc6" }],
    connected: true,
    syncing: false,
    transactions,
    ...(history
      ? { history: Array.from({ length: history + 1 }, (_, i) => ({ month: `2026-${String(5 + i).padStart(2, "0")}`, total: 1000 + i * 100, byCategory: { food: 300, transport: 100, other: 20, personal: 3, "c-1a2b3c4d": 1200 } })) }
      : {}),
  };
}

export async function openPage(name, { search = "", routes = {}, transactions = sampleTransactions, runScript = true, confirm = () => true } = {}) {
  const html = readFileSync(new URL(`${name}/${name}.html`, pagesDirectory), "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
  const dom = new JSDOM(html, { url: `http://localhost:3000/${name}${search}`, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const calls = [];

  window.fetch = async (url, init = {}) => {
    const path = String(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, method: init.method ?? "GET", body });
    const send = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    for (const [prefix, handler] of Object.entries(routes)) {
      if (path.startsWith(prefix)) return send(...handler(path, init, body));
    }
    if (path.startsWith("/api/auth/session")) return send(200, { user: { id: "u1", email: "demo@example.com" } });
    if (path.startsWith("/api/transactions?")) {
      const history = Number(new URLSearchParams(path.split("?")[1]).get("history") ?? 0);
      return send(200, monthResponse(transactions, history));
    }
    if (path.startsWith("/api/plaid/accounts")) return send(200, { connections: [] });
    return send(404, { error: "not in the fake API" });
  };

  // things a real browser has and jsdom lacks
  const dialog = window.HTMLDialogElement?.prototype;
  if (dialog) {
    dialog.showModal = function () { this.setAttribute("open", ""); };
    dialog.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
  }
  window.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  window.confirm = confirm;
  window.HTMLCanvasElement.prototype.getContext = () => null; // axe probes for canvas support
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.matchMedia = window.matchMedia ?? (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

  if (runScript) {
    const entry = new URL(`${name}/${name}.ts`, pagesDirectory).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    const bundle = buildSync({ entryPoints: [decodeURIComponent(entry)], bundle: true, format: "iife", write: false, platform: "browser", target: "es2022", logLevel: "silent" }).outputFiles[0].text;
    window.eval(bundle);
  }

  const flush = async (ms = 60) => { for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, ms / 6)); };
  await flush(120);

  const $ = (selector) => window.document.querySelector(selector);
  const $$ = (selector) => [...window.document.querySelectorAll(selector)];
  const fire = async (element, event) => { element.dispatchEvent(event); await flush(); };
  const page = {
    window, dom, calls, flush, $, $$,
    click: (selector) => { const el = typeof selector === "string" ? $(selector) : selector; if (!el) throw new Error(`no element: ${selector}`); return fire(el, new window.MouseEvent("click", { bubbles: true, cancelable: true })); },
    type: async (selector, value) => { const el = $(selector); if (!el) throw new Error(`no element: ${selector}`); el.value = value; el.dispatchEvent(new window.Event("input", { bubbles: true })); await flush(30); },
    choose: (selector, value) => { const el = $(selector); if (!el) throw new Error(`no element: ${selector}`); el.value = value; return fire(el, new window.Event("change", { bubbles: true })); },
    submit: (selector) => fire($(selector), new window.Event("submit", { bubbles: true, cancelable: true })),
    closeDialog: () => $("#detail-dialog").close(),
    /** Calls to the fake API since the last time this was called. */
    newCalls: () => calls.splice(0, calls.length),
    axe: async (scope = window.document) => {
      window.eval(axeSource);
      // colour contrast needs real layout, so it is covered by tests/ui/standards.test.ts
      return window.axe.run(scope, { rules: { "color-contrast": { enabled: false }, "scrollable-region-focusable": { enabled: false } } });
    },
  };
  return page;
}

/** One line per violation, for readable test failures. */
export function describeViolations(results) {
  return Array.from(results.violations, (v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.slice(0, 2).map((n) => n.html.replace(/\s+/g, " ").slice(0, 90)).join(" | ")}`);
}
