import {
  $,
  escapeHTML,
  eventElement,
  type Friend,
  refreshIcons,
  saveState,
  showToast,
  state,
} from "../../core.js";
import { getFriendCode } from "../../api.js";
import "../../page-navigation.js";

let friendCode = "";

function renderLeaderboard() {
  const friends: Friend[] = [
    ...state.friends.map((friend) => ({ ...friend })),
    {
      id: "you",
      name: state.profile.name || "You",
      initials: (state.profile.name || "You")
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
      points: 940,
      streak: 16,
      color: "coral",
      isYou: true,
    },
  ].sort((first, second) => second.points - first.points);
  $("#friend-list").innerHTML = friends
    .map(
      (friend) =>
        `<div class="friend-row"><span class="friend-avatar avatar-${friend.color}">${escapeHTML(friend.initials)}</span><span class="friend-name">${escapeHTML(friend.name)}${friend.isYou ? " (you)" : ""}</span><span class="friend-streak">${friend.streak}-day streak</span><span class="friend-score">${friend.points}</span>${friend.isYou ? "" : `<button type="button" class="remove-friend" data-remove-friend="${escapeHTML(friend.id)}" aria-label="Remove ${escapeHTML(friend.name)}" title="Remove friend"><i data-lucide="x" aria-hidden="true"></i></button>`}</div>`,
    )
    .join("");
  const podium: [string, Friend | undefined][] = [
    [".first-place", friends[0]],
    [".second-place", friends[1]],
    [".third-place", friends[2]],
  ];
  podium.forEach(([selector, friend]) => {
    const place = $(selector);
    if (!friend) {
      place.hidden = true;
      return;
    }
    place.hidden = false;
    const avatar = $(".podium-avatar", place);
    avatar.className = `podium-avatar avatar-${friend.color}`;
    avatar.textContent = friend.initials;
    $(".podium-name", place).textContent = friend.isYou
      ? "You"
      : friend.name.split(" ")[0];
    $("strong", place).textContent = String(friend.points);
  });
  $("#friend-count").textContent =
    `${friends.length} ${friends.length === 1 ? "person" : "people"}`;
  refreshIcons();
}

$("#friend-list").addEventListener("click", (event) => {
  const removeFriend = eventElement(event)?.closest<HTMLButtonElement>("[data-remove-friend]");
  if (!removeFriend) return;
  state.friends = state.friends.filter(
    (friend) => friend.id !== removeFriend.dataset.removeFriend,
  );
  saveState();
  renderLeaderboard();
});
$("#focus-invite").addEventListener("click", () =>
  $("#invite-section").scrollIntoView({ behavior: "smooth", block: "center" }),
);
$("#add-friend-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $<HTMLInputElement>("#friend-code-input");
  const code = input.value.trim().toUpperCase();
  const feedback = $("#friend-feedback");
  if (
    !code ||
    code === friendCode ||
    state.friends.some((friend) => friend.code === code)
  ) {
    feedback.textContent = "Enter a different, unused friend code.";
    return;
  }
  state.friends.push({
    id: `friend-${Date.now()}`,
    code,
    name: "New friend",
    initials: "NF",
    points: 600,
    streak: 1,
    color: "sage",
  });
  saveState();
  renderLeaderboard();
  input.value = "";
  feedback.textContent = "Friend added to your circle.";
});
$("#copy-code").addEventListener("click", async () => {
  if (!friendCode) return;
  try {
    await navigator.clipboard.writeText(friendCode);
    showToast("Your friend code is copied.");
  } catch {
    showToast(`Your friend code is ${friendCode}.`);
  }
});

async function loadFriendCode() {
  const codeElement = $("#friend-code");
  const feedback = $("#friend-code-feedback");
  try {
    const result = await getFriendCode();
    friendCode = result.friendCode;
    codeElement.textContent = friendCode;
    $<HTMLButtonElement>("#copy-code").disabled = false;
    $<HTMLInputElement>("#friend-code-input").disabled = false;
    $<HTMLButtonElement>("#add-friend-form button[type='submit']").disabled = false;
  } catch (error) {
    console.error("Unable to load the signed-in user's friend code.", error);
    codeElement.textContent = "Unavailable";
    feedback.textContent = "Could not load your friend code. Check your profile setup and try refreshing.";
    feedback.classList.add("is-error");
  }
}

renderLeaderboard();
refreshIcons();
loadFriendCode();
