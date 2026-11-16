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
  okr1: { streakUsers: 1, totalUsers: 3, percent: 33, rule: "Current streak of at least 7 days, using UTC days." },
  okr2: { friendUsers: 2, totalUsers: 3, percent: 67, rule: "Percentage of all registered users with at least one friend." },
  okr3: { consistentUsers: 1, goalUsers: 2, percent: 50, rule: "Met every Savings and Spending goal in at least 3 of the last 4 finished months." },
  okr4: { reportedSavings: 1, answered: 2, percent: 50, eligible: 3, eligibleAnswered: 2, responseRate: 67, rule: "Answered Yes." },
  people: [
    {
      streak: 7, name: "Ana Saver", email: "ana@example.com", signedUpAt: "2026-07-01T00:00:00Z", daysSinceSignUp: 136,
      months: [
        { month: "2026-10", met: true, goalsMet: 2, goalsCounted: 2 },
        { month: "2026-09", met: false, goalsMet: 1, goalsCounted: 2 },
        { month: "2026-08", met: true, goalsMet: 2, goalsCounted: 2 },
        { month: "2026-07", met: true, goalsMet: 2, goalsCounted: 2 },
      ],
      monthsTracked: 4, monthsMet: 3, consistent: true, checkIn: "yes", savedAmount: 300,
    },
    {
      streak: 0, name: "<b>Ben</b>", email: "ben@example.com", signedUpAt: "2026-11-01T00:00:00Z", daysSinceSignUp: 13,
      months: ["2026-10", "2026-09", "2026-08", "2026-07"].map((month) => ({ month, met: null, goalsMet: 0, goalsCounted: 0 })),
      monthsTracked: 0, monthsMet: 0, consistent: null, checkIn: "waiting", savedAmount: null,
    },
  ],
};

test("the team OKR page shows all four percentages and the per-user table", async () => {
  const page = await openPage("admin", { routes: { "/api/admin/okrs": () => [200, report], "/api/checkin": checkIn({ due: false }) } });
  assert.equal(page.$("#okr2-percent").textContent, "67%");
  assert.match(page.$("#okr2-detail").textContent, /2 of 3 users have at least one friend/);
  assert.equal(page.$("#okr1-percent").textContent, "33%");
  assert.match(page.$("#okr1-detail").textContent, /1 of 3 users/);
  assert.equal(page.$("#okr3-percent").textContent, "50%");
  assert.match(page.$("#okr3-detail").textContent, /1 of 2 users/);
  assert.equal(page.$("#okr4-percent").textContent, "50%");
  assert.equal(page.$("#okr4-detail").textContent, "1 of 2 users who answered said yes. 2 of 3 users asked so far have answered.");

  const rows = page.$$("#people-body tr");
  assert.equal(rows.length, 2);
  assert.deepEqual([...rows[0].querySelectorAll("td")].map((cell) => cell.textContent), ["Met", "Met", "Missed", "Met", "7 days", "Yes (3 of 4 met)", "Yes, saved · $300"]);
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

const teamAdmins = [
  { email: "demo@example.com", name: "Demo User", note: null, addedAt: "2026-11-14T10:00:00Z", source: "table", hasAccount: true, isYou: true },
  { email: "ops@example.com", name: null, note: null, addedAt: null, source: "settings", hasAccount: true, isYou: false },
  { email: "ana@example.com", name: "Ana Saver", note: "Added by demo@example.com", addedAt: "2026-11-14T11:00:00Z", source: "table", hasAccount: true, isYou: false },
];

function adminPage(handler, options = {}) {
  return openPage("admin", {
    ...options,
    routes: { "/api/admin/admins": handler, "/api/admin/okrs": () => [200, report], "/api/checkin": checkIn({ due: false }) },
  });
}

test("Team admins lists everyone, and only other table admins can be removed", async () => {
  const page = await adminPage(() => [200, { admins: teamAdmins }]);
  const items = page.$$("#team-list li");
  assert.equal(items.length, 3);
  assert.match(items[0].textContent, /Demo User.*You/s);
  assert.equal(items[0].querySelector("[data-remove-admin]"), null, "you can't remove yourself");
  assert.match(items[1].textContent, /Set in server settings/);
  assert.equal(items[1].querySelector("[data-remove-admin]"), null, "ADMIN_EMAILS entries can't be removed here");
  assert.ok(items[2].querySelector('[data-remove-admin="ana@example.com"]'));
  assert.match(items[2].textContent, /Added by demo@example.com/);
  assert.deepEqual(describeViolations(await page.axe(page.$("#admin-team"))), []);
});

test("adding an admin sends the email and shows the new list", async () => {
  const page = await adminPage((path, init, body) =>
    init.method === "POST"
      ? [200, { admins: [...teamAdmins, { email: body.email, name: "New Person", note: "Added by demo@example.com", addedAt: null, source: "table", hasAccount: true, isYou: false }] }]
      : [200, { admins: teamAdmins }],
  );
  page.$("#team-email").value = "New@Example.com ";
  await page.submit("#team-form");
  const post = page.calls.find((call) => call.path === "/api/admin/admins" && call.method === "POST");
  assert.deepEqual(post.body, { email: "New@Example.com" });
  assert.equal(page.$$("#team-list li").length, 4);
  assert.equal(page.$("#team-email").value, "");
  assert.match(page.$("#team-status").textContent, /new@example.com is now an admin/);
});

test("adding an email without an account shows the server's reason", async () => {
  const page = await adminPage((path, init) =>
    init.method === "POST" ? [404, { error: "No Money Man account uses nobody@example.com. They need to sign up first." }] : [200, { admins: teamAdmins }],
  );
  await page.submit("#team-form");
  assert.match(page.$("#team-status").textContent, /Enter the email/);
  page.$("#team-email").value = "nobody@example.com";
  await page.submit("#team-form");
  assert.match(page.$("#team-status").textContent, /need to sign up first/);
  assert.ok(page.$("#team-status").classList.contains("is-error"));
});

test("removing an admin asks first, then sends the email", async () => {
  let answer = false;
  const page = await adminPage(
    (path, init) => (init.method === "DELETE" ? [200, { admins: teamAdmins.slice(0, 2) }] : [200, { admins: teamAdmins }]),
    { confirm: () => answer },
  );
  await page.click('[data-remove-admin="ana@example.com"]');
  assert.equal(page.calls.some((call) => call.method === "DELETE"), false, "cancelling does nothing");
  answer = true;
  await page.click('[data-remove-admin="ana@example.com"]');
  const removal = page.calls.find((call) => call.path === "/api/admin/admins" && call.method === "DELETE");
  assert.deepEqual(removal.body, { email: "ana@example.com" });
  assert.equal(page.$$("#team-list li").length, 2);
  assert.match(page.$("#team-status").textContent, /ana@example.com is no longer an admin/);
});


test("OKR 1 shows zero for existing users without qualifying streaks and handles no users", async () => {
  for (const totalUsers of [3, 0]) {
    const page = await openPage("admin", { routes: {
      "/api/admin/okrs": () => [200, { ...report, totalUsers, people: [], okr1: { ...report.okr1, streakUsers: 0, totalUsers, percent: totalUsers ? 0 : null } }],
    } });
    assert.equal(page.$("#okr1-percent").textContent, totalUsers ? "0%" : "No users yet");
    assert.match(page.$("#okr1-detail").textContent, totalUsers ? /0 of 3 users/ : /No one has signed up/);
  }
});


test("OKR 2 handles users without friends and no registered users", async () => {
  for (const totalUsers of [3, 0]) {
    const page = await openPage("admin", { routes: {
      "/api/admin/okrs": () => [200, { ...report, totalUsers, people: [], okr2: { ...report.okr2, friendUsers: 0, totalUsers, percent: totalUsers ? 0 : null } }],
    } });
    assert.equal(page.$("#okr2-percent").textContent, totalUsers ? "0%" : "No users yet");
    assert.match(page.$("#okr2-detail").textContent, totalUsers ? /0 of 3 users/ : /No one has signed up/);
  }
});


test("an older server response keeps existing OKRs visible and explains unavailable metrics", async () => {
  for (const missing of [["okr2"], ["okr1", "okr2"]]) {
    const legacy = { ...report };
    for (const key of missing) delete legacy[key];
    const page = await openPage("admin", { routes: { "/api/admin/okrs": () => [200, legacy] } });
    assert.equal(page.$("#admin-okrs").hidden, false);
    assert.equal(page.$("#okr3-percent").textContent, "50%");
    assert.equal(page.$("#okr4-percent").textContent, "50%");
    for (const key of missing) {
      assert.equal(page.$(`#${key}-percent`).textContent, "Unavailable");
      assert.match(page.$(`#${key}-detail`).textContent, /Restart the app server/);
    }
    assert.doesNotMatch(page.$("#admin-status").textContent, /Cannot read/);
  }
});
