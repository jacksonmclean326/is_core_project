import "../../page-navigation.js";
import {
  addTeamAdmin,
  clearCheckIn,
  getOkrReport,
  getTeamAdmins,
  removeTeamAdmin,
  type OkrPerson,
  type OkrReport,
  type TeamAdmin,
} from "../../api.js";
import { openCheckIn } from "../../checkin.js";
import { money } from "../../state/state.js";
import { escapeHTML } from "../../ui/ui.js";
import { shortMonthName } from "../../../shared/months.js";

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}.`);
  return element as T;
};

const status = byId("admin-status");
const toolsStatus = byId("tools-status");
const refreshButton = byId<HTMLButtonElement>("admin-refresh");

const checkInLabels: Record<OkrPerson["checkIn"], string> = {
  yes: "Yes, saved",
  no: "Not yet",
  snoozed: "Chose “Not now”",
  due: "Not answered",
  waiting: "Not asked yet",
};

const users = (count: number) => `${count} ${count === 1 ? "user" : "users"}`;
const joined = (days: number) => (days <= 0 ? "joined today" : days === 1 ? "joined yesterday" : `joined ${days} days ago`);

function render(report: OkrReport): void {
  const { okr3, okr4 } = report;
  byId("okr3-percent").textContent = okr3.percent === null ? "No data yet" : `${okr3.percent}%`;
  byId("okr3-detail").textContent = okr3.goalUsers
    ? `${okr3.consistentUsers} of ${users(okr3.goalUsers)} with savings or spending goals.`
    : "No one has savings or spending goals with a finished month yet.";
  byId("okr3-rule").textContent = okr3.rule;

  byId("okr4-percent").textContent = okr4.percent === null ? "No answers yet" : `${okr4.percent}%`;
  const answers = okr4.answered ? `${okr4.reportedSavings} of ${users(okr4.answered)} who answered said yes.` : "No one has answered the check-in yet.";
  // The response rate only means something once some users have been asked.
  const responses = okr4.eligible ? ` ${okr4.eligibleAnswered} of ${users(okr4.eligible)} asked so far have answered.` : "";
  byId("okr4-detail").textContent = answers + responses;
  byId("okr4-rule").textContent = okr4.rule;

  const months = [...report.months].reverse();
  byId("people-head").innerHTML = `<tr><th scope="col">User</th>${months
    .map((month) => `<th scope="col">${escapeHTML(shortMonthName(month))}</th>`)
    .join("")}<th scope="col">Consistent</th><th scope="col">Check-in</th></tr>`;
  byId("people-body").innerHTML = report.people
    .map((person) => {
      const cells = [...person.months]
        .reverse()
        .map((month) => {
          // data-label names the column when the table turns into cards on a phone.
          const label = `data-label="${escapeHTML(shortMonthName(month.month))}"`;
          return month.met === null
            ? `<td class="is-empty" ${label} title="Nothing to check this month">–</td>`
            : `<td class="${month.met ? "is-met" : "is-missed"}" ${label} title="${month.goalsMet} of ${month.goalsCounted} goals met">${month.met ? "Met" : "Missed"}</td>`;
        })
        .join("");
      const consistent =
        person.consistent === null ? "–" : `${person.consistent ? "Yes" : "No"} (${person.monthsMet} of ${person.monthsTracked} met)`;
      const checkIn = checkInLabels[person.checkIn] + (person.savedAmount !== null ? ` · ${money(person.savedAmount)}` : "");
      return `<tr><th scope="row"><strong>${escapeHTML(person.name)}</strong><small>${escapeHTML(person.email ?? "")} · ${joined(person.daysSinceSignUp)}</small></th>${cells}<td class="is-wide" data-label="Consistent">${escapeHTML(consistent)}</td><td class="is-wide checkin-${person.checkIn}" data-label="Check-in">${escapeHTML(checkIn)}</td></tr>`;
    })
    .join("");

  const time = new Date(report.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const notes = [`${users(report.totalUsers)} in total. Updated at ${time}.`];
  if (report.failedUsers) notes.push(`${users(report.failedUsers)} couldn't be included this time. Press Refresh to try again.`);
  status.textContent = notes.join(" ");
  for (const id of ["admin-okrs", "admin-people", "admin-tools"]) byId(id).hidden = false;
}

/** Loads and shows the report. Returns false (with the reason shown) if it failed. */
async function load(action: () => Promise<OkrReport>, message: string): Promise<boolean> {
  refreshButton.disabled = true;
  status.textContent = message;
  status.classList.remove("is-error");
  try {
    render(await action());
    return true;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not load the OKR numbers.";
    status.classList.add("is-error");
    return false;
  } finally {
    refreshButton.disabled = false;
  }
}

async function runTool(button: HTMLButtonElement, work: () => Promise<string>): Promise<void> {
  button.disabled = true;
  toolsStatus.classList.remove("is-error");
  try {
    toolsStatus.textContent = await work();
  } catch (error) {
    toolsStatus.textContent = error instanceof Error ? error.message : "That did not work.";
    toolsStatus.classList.add("is-error");
  } finally {
    button.disabled = false;
  }
}

refreshButton.addEventListener("click", () => void load(getOkrReport, "Refreshing…"));

byId("tool-checkin").addEventListener("click", () => {
  toolsStatus.textContent = "";
  openCheckIn({ demo: true, onClose: () => void load(getOkrReport, "Refreshing…") });
});

byId<HTMLButtonElement>("tool-clear").addEventListener("click", (event) =>
  void runTool(event.currentTarget as HTMLButtonElement, async () => {
    await clearCheckIn();
    await load(getOkrReport, "Refreshing…");
    return "Your check-in answer was cleared.";
  }),
);

// Team admins: list, add, remove.
const teamList = byId("team-list");
const teamForm = byId<HTMLFormElement>("team-form");
const teamEmail = byId<HTMLInputElement>("team-email");
const teamStatus = byId("team-status");

function setTeamStatus(message: string, isError = false): void {
  teamStatus.textContent = message;
  teamStatus.classList.toggle("is-error", isError);
}

function renderAdmins(admins: TeamAdmin[]): void {
  teamList.innerHTML = admins
    .map((entry) => {
      const title = entry.name ? `<strong>${escapeHTML(entry.name)}</strong><small>${escapeHTML(entry.email)}</small>` : `<strong>${escapeHTML(entry.email)}</strong>`;
      const details = [
        entry.isYou ? "You" : "",
        entry.source === "settings" ? "Set in server settings" : entry.note ?? "",
        entry.addedAt ? new Date(entry.addedAt).toLocaleDateString([], { month: "short", day: "numeric" }) : "",
        entry.hasAccount ? "" : "No account yet",
      ].filter(Boolean);
      const action =
        entry.isYou || entry.source === "settings"
          ? ""
          : `<button class="outline-button admin-remove" type="button" data-remove-admin="${escapeHTML(entry.email)}" aria-label="Remove ${escapeHTML(entry.email)} as an admin">Remove</button>`;
      return `<li><div class="admin-person">${title}<span class="admin-meta">${escapeHTML(details.join(" · "))}</span></div>${action}</li>`;
    })
    .join("");
  byId("admin-team").hidden = false;
}

async function loadAdmins(): Promise<void> {
  try {
    renderAdmins((await getTeamAdmins()).admins);
  } catch (error) {
    byId("admin-team").hidden = false;
    setTeamStatus(error instanceof Error ? error.message : "Could not load the admin list.", true);
  }
}

teamForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = teamEmail.value.trim();
  if (!email) {
    setTeamStatus("Enter the email they sign in with.", true);
    teamEmail.focus();
    return;
  }
  const button = teamForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  setTeamStatus("Adding…");
  try {
    renderAdmins((await addTeamAdmin(email)).admins);
    teamEmail.value = "";
    setTeamStatus(`${email.toLowerCase()} is now an admin. They'll see Team OKRs in Settings.`);
  } catch (error) {
    setTeamStatus(error instanceof Error ? error.message : "Could not add that admin.", true);
    teamEmail.focus();
  } finally {
    if (button) button.disabled = false;
  }
});

teamList.addEventListener("click", async (event) => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-remove-admin]") : null;
  const email = button?.dataset.removeAdmin;
  if (!button || !email) return;
  if (!window.confirm(`Remove ${email} as an admin? They will lose access to this page.`)) return;
  button.disabled = true;
  setTeamStatus("Removing…");
  try {
    renderAdmins((await removeTeamAdmin(email)).admins);
    setTeamStatus(`${email} is no longer an admin.`);
    teamEmail.focus();
  } catch (error) {
    button.disabled = false;
    setTeamStatus(error instanceof Error ? error.message : "Could not remove that admin.", true);
  }
});

void load(getOkrReport, "Loading the numbers…");
void loadAdmins();
