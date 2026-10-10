import {
  $,
  escapeHTML,
  refreshIcons,
  saveState,
  showToast,
  state,
} from "../../core.js";
import { supabase } from "../../supabase.js";

let friendCode = "";

function renderLeaderboard() {
  const friends = [
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
  [
    [".first-place", friends[0]],
    [".second-place", friends[1]],
    [".third-place", friends[2]],
  ].forEach(([selector, friend]) => {
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
    $("strong", place).textContent = friend.points;
  });
  $("#friend-count").textContent =
    `${friends.length} ${friends.length === 1 ? "person" : "people"}`;
  refreshIcons();
}

$("#friend-list").addEventListener("click", (event) => {
  const removeFriend = event.target.closest("[data-remove-friend]");
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
  const input = $("#friend-code-input");
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
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData.user) throw new Error("No authenticated user was returned.");

    const { data, error } = await supabase
      .from("User")
      .select("friend_code")
      .eq("user_id", authData.user.id)
      .single();
    if (error) throw error;

    const code = typeof data.friend_code === "string"
      ? data.friend_code.trim().toUpperCase()
      : "";
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      throw new Error("The signed-in profile does not have a valid six-character friend code.");
    }

    friendCode = code;
    codeElement.textContent = friendCode;
    $("#copy-code").disabled = false;
    $("#friend-code-input").disabled = false;
    $("#add-friend-form button[type='submit']").disabled = false;
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
