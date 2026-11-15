import "../../page-navigation.js";
import { clearCheckIn, getOkrReport, type OkrPerson, type OkrReport } from "../../api.js";
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
  yes: "Saved",
  no: "Not yet",
  snoozed: "Snoozed",
  due: "Due",
  waiting: "Under 60 days",
};

function render(report: OkrReport): void {
  const { okr3, okr4 } = report;
  byId("okr3-percent").textContent = okr3.percent === null ? "No data yet" : `${okr3.percent}%`;
  byId("okr3-detail").textContent = `${okr3.consistentUsers} of ${okr3.goalUsers} users with goal history.`;
  byId("okr3-rule").textContent = okr3.rule;

  byId("okr4-percent").textContent = okr4.percent === null ? "No answers yet" : `${okr4.percent}%`;
  byId("okr4-detail").textContent =
    `${okr4.reportedSavings} of ${okr4.answered} answers said yes. ` +
    (okr4.responseRate === null
      ? "No one is past 60 days yet."
      : `${okr4.eligibleAnswered} of ${okr4.eligible} users past 60 days answered (${okr4.responseRate}% response rate).`);
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
            ? `<td class="is-empty" ${label} title="No goals or no transactions">–</td>`
            : `<td class="${month.met ? "is-met" : "is-missed"}" ${label} title="${month.goalsMet} of ${month.goalsCounted} goals met">${month.met ? "Met" : "Missed"}</td>`;
        })
        .join("");
      const consistent = person.consistent === null ? "–" : person.consistent ? `Yes (${person.monthsMet}/${person.monthsTracked})` : `No (${person.monthsMet}/${person.monthsTracked})`;
      const checkIn = checkInLabels[person.checkIn] + (person.savedAmount !== null ? ` · ${money(person.savedAmount)}` : "");
      return `<tr><th scope="row"><strong>${escapeHTML(person.name)}</strong><small>${escapeHTML(person.email ?? "")} · ${person.daysSinceSignUp} days</small></th>${cells}<td class="is-wide" data-label="Consistent">${escapeHTML(consistent)}</td><td class="is-wide checkin-${person.checkIn}" data-label="Check-in">${escapeHTML(checkIn)}</td></tr>`;
    })
    .join("");

  const notes = [`${report.totalUsers} users. Updated ${new Date(report.generatedAt).toLocaleTimeString()}.`];
  if (report.failedUsers) notes.push(`${report.failedUsers} users could not be checked; see the server log.`);
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

void load(getOkrReport, "Loading the numbers…");
