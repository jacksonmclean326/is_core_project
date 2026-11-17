import type { LeaderboardEntry, LeaderboardStatus } from "../../../shared/leaderboard.js";
import { leaderboardVisibilityEvent } from "../../../shared/leaderboard.js";
import { $, escapeHTML, eventElement, refreshIcons } from "../../core.js";
import { addFriend, deleteFriend, getFriendCode, getFriends, getLeaderboard, type FriendRecord } from "../../api.js";
import { shareFriendInvite } from "../../friend-invite.js";
import "../../page-navigation.js";

let friendCode = "";
let friends: FriendRecord[] = [];
let busy = false;
let loaded = false;

function setBusy(value: boolean) {
  busy = value;
  $<HTMLInputElement>("#friend-code-input").disabled = busy || !loaded;
  $<HTMLButtonElement>('#add-friend-form button[type="submit"]').disabled = busy || !loaded;
  $<HTMLButtonElement>("#copy-code").disabled = busy || !friendCode;
  $<HTMLButtonElement>("#share-invite").disabled = busy || !friendCode;
  document.querySelectorAll<HTMLButtonElement>("[data-remove-friend]").forEach((button) => {
    button.disabled = busy;
  });
}

function renderFriends() {
  $("#friend-list").innerHTML = friends.length
    ? friends.map((friend) => {
      const initials = friend.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
      return `<div class="friend-row"><span class="friend-avatar" aria-hidden="true">${escapeHTML(initials)}</span><span class="friend-name">${escapeHTML(friend.name)}</span><button type="button" class="remove-friend" data-remove-friend="${escapeHTML(friend.id)}" aria-label="Remove ${escapeHTML(friend.name)}" title="Remove friend"><i data-icon="x" aria-hidden="true"></i></button></div>`;
    }).join("")
    : '<p class="quiet-note">No friends yet. Add your first friend with a code, or invite someone to join Money Man.</p><button class="copy-code first-friend-button" type="button" data-focus-friend>Add your first friend</button>';
  $("#friend-count").textContent = `${friends.length} ${friends.length === 1 ? "person" : "people"}`;
  refreshIcons();
  setBusy(busy);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

async function loadFriends() {
  const result = await getFriends();
  friends = result.friends;
  loaded = true;
  renderFriends();
}

function renderPodium(entries: LeaderboardEntry[]) {
  const podium = $("#leaderboard-podium");
  const leaders = entries.slice(0, 3);
  const positions = ["first-place", "second-place", "third-place"];
  podium.hidden = leaders.length === 0;
  podium.innerHTML = leaders.map((entry, index) => {
    const initials = entry.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
    return `<div class="podium-person ${positions[index]}${entry.isYou ? " podium-you" : ""}">
      <span class="podium-avatar" aria-hidden="true">${escapeHTML(initials)}</span>
      <span class="podium-name">${escapeHTML(entry.name)}${entry.isYou ? " (you)" : ""}</span>
      <strong>${formatScore(entry.score)}</strong>
      <div class="podium-block"><span class="sr-only">Place </span>${index + 1}</div>
    </div>`;
  }).join("");
}

function formatScore(score: number): string {
  return `${Math.floor(Math.max(0, Math.min(100, score)))}%`;
}

function statusLabel(status: LeaderboardStatus): string {
  switch (status) {
    case "completed": return "Target reached";
    case "in-progress": return "In progress";
    case "on-track": return "On track";
    case "cap-reached": return "Allowance used";
  }
}

function formatMonth(month: string): { label: string; endDate: string } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const monthDate = new Date(Date.UTC(year, monthIndex, 1));
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  return {
    label: `${new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(monthDate)} ${year} challenge`,
    endDate: `Ends ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(lastDay)}`,
  };
}

let rankingRequest = 0;
async function refreshLeaderboard() {
  const request = ++rankingRequest;
  const status = $("#ranking-status");
  status.textContent = "Updating this month's challenge…";
  try {
    const result = await getLeaderboard();
    if (request !== rankingRequest) return;
    $("#challenge-title").textContent = result.challenge.title;
    $("#challenge-description").textContent = result.challenge.description;
    const month = formatMonth(result.challenge.month);
    $("#challenge-month").textContent = month.label;
    $("#challenge-days").textContent = String(result.challenge.daysRemaining);
    $("#challenge-end-date").textContent = month.endDate;
    $(".monthly-challenge-card").setAttribute("data-challenge", result.challenge.id);
    renderPodium(result.entries);
    $("#leaderboard-visibility-note").hidden = result.visible;
    $("#ranking-list").innerHTML = result.entries.map((entry) => {
      const score = Math.max(0, Math.min(100, entry.score));
      const label = formatScore(score);
      return `<li class="ranking-row">
        <div class="ranking-person"><strong>${escapeHTML(entry.name)}${entry.isYou ? " (you)" : ""}</strong><span class="challenge-status">${statusLabel(entry.status)}</span></div>
        <span class="ranking-score">${label}</span>
        <div class="challenge-progress${result.challenge.id === "eating-out" ? " health-progress" : ""}" role="progressbar" aria-label="${escapeHTML(entry.name)} challenge progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${score}">
          <span style="width:${score}%"></span>
        </div>
      </li>`;
    }).join("");
    status.textContent = result.entries.length
      ? `Updated ${new Date(result.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Refreshes every minute while this page is visible.`
      : "No visible leaderboard entries yet. Enable Leaderboard visibility in Settings to share your progress.";
  } catch (error) {
    if (request !== rankingRequest) return;
    $("#ranking-list").replaceChildren();
    renderPodium([]);
    status.textContent = message(error);
  }
}

$("#refresh-leaderboard").addEventListener("click", () => { void refreshLeaderboard(); });
window.addEventListener("storage", (event) => {
  if (event.key !== leaderboardVisibilityEvent) return;
  // Clear stale scores while the server rechecks visibility for this session.
  $("#ranking-list").replaceChildren();
  renderPodium([]);
  void refreshLeaderboard();
});
window.addEventListener("focus", () => { void refreshLeaderboard(); });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refreshLeaderboard();
});
window.setInterval(() => {
  if (!document.hidden) void refreshLeaderboard();
}, 60_000);

// Native disclosures support keyboard activation as well as touch/click.
document.addEventListener("click", (event) => {
  const target = eventElement(event);
  const current = target?.closest(".friend-actions");
  if (busy && target?.closest(".friend-settings")) event.preventDefault();
  document.querySelectorAll<HTMLDetailsElement>(".friend-actions[open]").forEach((menu) => {
    if (menu !== current) menu.open = false;
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelectorAll<HTMLDetailsElement>(".friend-actions[open]").forEach((menu) => {
    menu.open = false;
    menu.querySelector<HTMLElement>("summary")?.focus();
  });
});

$("#friend-list").addEventListener("click", async (event) => {
  const target = eventElement(event);
  if (target?.closest("[data-focus-friend]")) {
    $("#invite-section").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#friend-code-input").focus();
    return;
  }
  const button = target?.closest<HTMLButtonElement>("[data-remove-friend]");
  const id = button?.dataset.removeFriend;
  if (!id || busy) return;
  setBusy(true);
  const feedback = $("#friend-feedback");
  feedback.textContent = "Removing friend…";
  try {
    await deleteFriend(id);
    friends = friends.filter((friend) => friend.id !== id);
    renderFriends();
    feedback.textContent = "Friend removed.";
    void refreshLeaderboard();
  } catch (error) {
    feedback.textContent = message(error);
  } finally {
    setBusy(false);
  }
});

$("#focus-invite").addEventListener("click", () => {
  $("#invite-section").scrollIntoView({ behavior: "smooth", block: "center" });
  $("#friend-code-input").focus();
});

$("#add-friend-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !loaded) return;
  const input = $<HTMLInputElement>("#friend-code-input");
  const code = input.value.trim().toUpperCase();
  const feedback = $("#friend-feedback");
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    feedback.textContent = "Enter a valid six-character friend code.";
    return;
  }
  if (code === friendCode) {
    feedback.textContent = "You cannot add yourself.";
    return;
  }
  setBusy(true);
  feedback.textContent = "Adding friend…";
  try {
    await addFriend(code);
    input.value = "";
    feedback.textContent = "Friend added to both of your circles.";
    void refreshLeaderboard();
    try {
      await loadFriends();
    } catch {
      feedback.textContent = "Friend saved. Refresh the page to load your updated list.";
    }
  } catch (error) {
    feedback.textContent = message(error);
  } finally {
    setBusy(false);
  }
});

async function copyFriendCode(): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(friendCode);
      return true;
    } catch {
      // Try copying the selected text if the clipboard write was blocked.
    }
  }

  const selection = window.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.selectNodeContents($("#friend-code"));
  selection.removeAllRanges();
  selection.addRange(range);

  try {
    if (!document.execCommand?.("copy")) return false;
    selection.removeAllRanges();
    return true;
  } catch {
    return false;
  }
}

$("#copy-code").addEventListener("click", async () => {
  if (!friendCode) return;
  const copied = await copyFriendCode();
  const feedback = $("#friend-code-feedback");
  feedback.textContent = copied
    ? "Friend code copied."
    : "Couldn’t copy automatically. Select and copy your friend code above.";
  feedback.classList.toggle("is-error", !copied);
});

$<HTMLButtonElement>("#share-invite").addEventListener("click", async () => {
  if (!friendCode) return;
  const feedback = $("#friend-code-feedback");
  try {
    const result = await shareFriendInvite(friendCode);
    feedback.textContent = result === "shared"
      ? "Invite link shared."
      : result === "copied"
        ? "Invite link copied. Your friend can create an account and be added to your circle."
        : result === "cancelled"
          ? "Invite sharing cancelled."
          : `Copy this invite link: ${result}`;
    feedback.classList.remove("is-error");
  } catch (error) {
    feedback.textContent = message(error);
    feedback.classList.add("is-error");
  }
});

async function initialize() {
  $("#friend-list").textContent = "Loading friends…";
  $("#friend-count").textContent = "";
  await Promise.all([
    (async () => {
      try {
        friendCode = (await getFriendCode()).friendCode;
        $("#friend-code").textContent = friendCode;
        $<HTMLButtonElement>("#copy-code").disabled = false;
        $<HTMLButtonElement>("#share-invite").disabled = false;
      } catch (error) {
        $("#friend-code").textContent = "Unavailable";
        $("#friend-code-feedback").textContent = message(error);
      }
    })(),
    loadFriends().catch((error: unknown) => {
      $("#friend-list").textContent = "Could not load friends. Refresh to try again.";
      $("#friend-feedback").textContent = message(error);
    }),
  ]);
  setBusy(false);
}

refreshIcons();
void initialize();
void refreshLeaderboard();
