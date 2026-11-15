// The two-month savings check-in (OKR 4) and the team-only OKR page, run in a simulated browser.
// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "node:test";
import { describeViolations, openPage } from "./harness.ts";

const checkIn = (status) => () => [200, { available: true, answered: false, saved: null, amount: null, daysSinceSignUp: 61, isAdmin: false, ...status }];
/** A check-in that is due, and accepts answers. */
const answerOk = (path, init) => (init.method === "POST" || init.method === "DELETE" ? [200, { ok: true }] : checkIn({ due: true })());
const posts = (page) => page.calls.filter((call) => call.path === "/api/checkin" && call.method === "POST");
const pick = async (page, value) => {
  const radio = page.$(`#checkin-dialog input[name="saved"][value="${value}"]`);
  radio.checked = true;
  radio.dispatchEvent(new page.window.Event("change", { bubbles: true }));
  await page.flush();
};

test("the check-in opens on its own when it is due, and a Yes with an amount is sent", async () => {
  const page = await openPage("home", { routes: { "/api/checkin": answerOk } });
  const dialog = page.$("#checkin-dialog");
  assert.ok(dialog?.hasAttribute("open"), "the check-in should be open");
  assert.match(dialog.textContent, /Have you saved money since you started using Money Man\?/);
  assert.equal(page.$(".checkin-amount").hidden, true, "the amount box waits for a Yes");

  await pick(page, "yes");
  assert.equal(page.$(".checkin-amount").hidden, false);
  page.$("#checkin-amount").value = "250";
  await page.submit("#checkin-form");

  assert.deepEqual(posts(page).at(-1).body, { saved: true, amount: 250 });
  assert.match(dialog.textContent, /Nice work!/);
  await page.click("#checkin-dialog .fb-thanks [data-checkin-close]");
  assert.equal(dialog.hasAttribute("open"), false);
  assert.equal(posts(page).length, 1, "closing after answering does not also snooze");
});

test("Not yet is sent without an amount, and an empty answer is caught", async () => {
  const page = await openPage("details", { routes: { "/api/checkin": answerOk } });
  await page.submit("#checkin-form");
  assert.match(page.$("#checkin-error").textContent, /Choose Yes or Not yet/);
  assert.equal(posts(page).length, 0);

  await pick(page, "no");
  await page.submit("#checkin-form");
  assert.deepEqual(posts(page).at(-1).body, { saved: false, amount: null });
  assert.match(page.$("#checkin-dialog").textContent, /Thanks for telling us/);
});

test("Not now or closing the check-in snoozes it", async () => {
  const page = await openPage("home", { routes: { "/api/checkin": answerOk } });
  await page.click("#checkin-dialog .fb-actions [data-checkin-close]");
  assert.equal(page.$("#checkin-dialog").hasAttribute("open"), false);
  assert.deepEqual(posts(page).at(-1).body, { later: true });
});

test("the check-in stays away when it is not due", async () => {
  const page = await openPage("home", { routes: { "/api/checkin": checkIn({ due: false }) } });
  assert.equal(page.$("#checkin-dialog"), null);
  assert.equal(posts(page).length, 0);
});

test("the check-in has no accessibility problems", async () => {
  const page = await openPage("home", { routes: { "/api/checkin": answerOk } });
  await pick(page, "yes");
  assert.deepEqual(describeViolations(await page.axe(page.$("#checkin-dialog"))), []);
});

const session = (isAdmin) => () => [200, { user: { id: "u1", email: "demo@example.com", user_metadata: null, isAdmin } }];

test("Settings shows Team OKRs only to the team", async () => {
  const admin = await openPage("settings", { routes: { "/api/auth/session": session(true), "/api/checkin": checkIn({ due: false }) } });
  assert.ok(admin.$('.settings-link-list a[href="/admin"]'));
  const member = await openPage("settings", { routes: { "/api/auth/session": session(false), "/api/checkin": checkIn({ due: false }) } });
  assert.equal(member.$('.settings-link-list a[href="/admin"]'), null);
});

const report = {
  generatedAt: "2026-11-14T12:00:00Z",
  totalUsers: 3,
  failedUsers: 0,
  monthsWritten: 0,
  months: ["2026-10", "2026-09", "2026-08", "2026-07"],
  okr3: { consistentUsers: 1, goalUsers: 2, percent: 50, rule: "Met every Savings and Spending goal in at least 3 of the last 4 finished months." },
  okr4: { reportedSavings: 1, answered: 2, percent: 50, eligible: 3, eligibleAnswered: 2, responseRate: 67, rule: "Answered Yes." },
  people: [
    {
      name: "Ana Saver", email: "ana@example.com", signedUpAt: "2026-07-01T00:00:00Z", daysSinceSignUp: 136,
      months: [
        { month: "2026-10", met: true, goalsMet: 2, goalsCounted: 2 },
        { month: "2026-09", met: false, goalsMet: 1, goalsCounted: 2 },
        { month: "2026-08", met: true, goalsMet: 2, goalsCounted: 2 },
        { month: "2026-07", met: true, goalsMet: 2, goalsCounted: 2 },
      ],
      monthsTracked: 4, monthsMet: 3, consistent: true, checkIn: "yes", savedAmount: 300,
    },
    {
      name: "<b>Ben</b>", email: "ben@example.com", signedUpAt: "2026-11-01T00:00:00Z", daysSinceSignUp: 13,
      months: ["2026-10", "2026-09", "2026-08", "2026-07"].map((month) => ({ month, met: null, goalsMet: 0, goalsCounted: 0 })),
      monthsTracked: 0, monthsMet: 0, consistent: null, checkIn: "waiting", savedAmount: null,
    },
  ],
};

test("the team OKR page shows both percentages and the per-user table", async () => {
  const page = await openPage("admin", { routes: { "/api/admin/okrs": () => [200, report], "/api/checkin": checkIn({ due: false }) } });
  assert.equal(page.$("#okr3-percent").textContent, "50%");
  assert.match(page.$("#okr3-detail").textContent, /1 of 2 users/);
  assert.equal(page.$("#okr4-percent").textContent, "50%");
  assert.equal(page.$("#okr4-detail").textContent, "1 of 2 users who answered said yes. 2 of 3 users asked so far have answered.");

  const rows = page.$$("#people-body tr");
  assert.equal(rows.length, 2);
  assert.deepEqual([...rows[0].querySelectorAll("td")].map((cell) => cell.textContent), ["Met", "Met", "Missed", "Met", "Yes (3 of 4 met)", "Yes, saved · $300"]);
  assert.match(rows[0].querySelector("th small").textContent, /joined 136 days ago/);
  assert.match(rows[1].querySelector("th small").textContent, /joined 13 days ago/);
  assert.match(rows[1].textContent, /Not asked yet/);
  assert.equal(rows[1].querySelector("th strong").textContent, "<b>Ben</b>", "names are shown as text, not HTML");
  assert.equal(page.calls.some((call) => call.path === "/api/checkin"), false, "the check-in does not pop up by itself on /admin");
  assert.deepEqual(describeViolations(await page.axe()), []);
});

test("the demo check-in does not snooze, and Refresh reloads fresh numbers", async () => {
  let okr3 = 50;
  const page = await openPage("admin", {
    routes: {
      "/api/admin/okrs": () => [200, { ...report, okr3: { ...report.okr3, percent: okr3 } }],
      "/api/checkin": answerOk,
    },
  });
  await page.click("#tool-checkin");
  assert.ok(page.$("#checkin-dialog").hasAttribute("open"));
  await page.click("#checkin-dialog .fb-actions [data-checkin-close]");
  assert.equal(posts(page).length, 0, "closing the demo check-in must not snooze the admin");

  okr3 = 25; // someone's spending changed
  await page.click("#admin-refresh");
  await page.flush(120);
  assert.equal(page.$("#okr3-percent").textContent, "25%");
});

test("before anyone has been asked, the OKR cards show plain sentences, not internal status", async () => {
  const empty = {
    ...report,
    totalUsers: 1,
    okr3: { ...report.okr3, consistentUsers: 0, goalUsers: 0, percent: null },
    okr4: { ...report.okr4, reportedSavings: 0, answered: 0, percent: null, eligible: 0, eligibleAnswered: 0, responseRate: null },
    people: [report.people[1]],
  };
  const page = await openPage("admin", { routes: { "/api/admin/okrs": () => [200, empty], "/api/checkin": checkIn({ due: false }) } });
  assert.equal(page.$("#okr3-percent").textContent, "No data yet");
  assert.equal(page.$("#okr3-detail").textContent, "No one has savings or spending goals with a finished month yet.");
  assert.equal(page.$("#okr4-detail").textContent, "No one has answered the check-in yet.");
  assert.doesNotMatch(page.$("main").textContent, /60 days|past 60|response rate|0 of 0/);
  assert.match(page.$("#admin-status").textContent, /^1 user in total\. Updated at \d{1,2}:\d{2}/);
});

test("the team OKR page explains when you are not on the team", async () => {
  const page = await openPage("admin", { routes: { "/api/admin/okrs": () => [403, { error: "This page is only for the Money Man team." }] } });
  assert.match(page.$("#admin-status").textContent, /only for the Money Man team/);
  assert.equal(page.$("#admin-okrs").hidden, true);
});
