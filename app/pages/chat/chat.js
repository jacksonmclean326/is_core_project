import { $, escapeHTML, money, state, totalSpent } from "../../core.js";

const mascotUrl = new URL("../../assets/money-man-mascot.png", import.meta.url).href;

function sendMessage(message) {
  const cleanMessage = message.trim();
  if (!cleanMessage) return;
  const list = $("#message-list");
  const timestamp = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  list.insertAdjacentHTML(
    "beforeend",
    `<div class="message-row user-row"><div class="message-bubble"><p>${escapeHTML(cleanMessage)}</p><time>${timestamp}</time></div></div><div class="message-row assistant-row"><img class="money-avatar brand-avatar" src="${mascotUrl}" alt=""><div class="message-bubble assistant-bubble"><strong>Mr. Moneyman</strong><p>${escapeHTML(makeChatReply(cleanMessage))}</p><time>${timestamp}</time></div></div>`,
  );
  $("#message-list").lastElementChild?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
  $("#chat-input").value = "";
}

function makeChatReply(message) {
  const question = message.toLowerCase();
  if (question.includes("food") || question.includes("eating out")) {
    const food = state.categories.find((category) => category.id === "food");
    if (!food)
      return "Your categories are editable, so check Details for the latest breakdown and set a food category there.";
    const difference = (Number(food.limit) || 0) - Number(food.amount || 0);
    if (!food.limit)
      return `You've spent ${money(food.amount)} on food so far. Set a food category limit in your budget to make a plan for the rest of the month.`;
    return difference >= 0
      ? `Food is at ${money(food.amount)} of its ${money(food.limit)} category limit. That leaves ${money(difference)}. Planning a few meals before your next grocery trip could help.`
      : `Food is at ${money(food.amount)} against a ${money(food.limit)} category limit, so it is ${money(difference)} over. You could pause extra food purchases or adjust your plan for the rest of the month.`;
  }
  if (question.includes("savings goal") || question.includes("on track")) {
    const goal = state.goals.find((item) => item.kind === "Savings");
    if (!goal)
      return "You don't have a savings goal set yet. Add one from Details, then you can track your progress here.";
    const remaining = Math.max(0, goal.target - goal.progress);
    const percent = goal.target
      ? Math.min(100, Math.round((goal.progress / goal.target) * 100))
      : 0;
    return `You're ${percent}% of the way to ${goal.name}: ${money(goal.progress)} of ${money(goal.target)}. ${remaining ? `${money(remaining)} to go this month.` : "You've reached your goal this month. Nice work."}`;
  }
  if (question.includes("90%") || question.includes("budget")) {
    const budget = Number(state.budget) || 0;
    if (!budget)
      return "Set a monthly budget in Settings and I can calculate the 90% reminder point for you.";
    const reminderPoint = Math.round(budget * 0.9);
    const spent = totalSpent();
    const distance = Math.abs(reminderPoint - spent);
    return `90% of your ${money(budget)} monthly budget is ${money(reminderPoint)}. You've spent ${money(spent)} so far, ${money(distance)} ${spent >= reminderPoint ? "past" : "before"} that point.`;
  }
  return "I can help you check your food spending, savings goal, or monthly budget. Try one of the suggested questions to see those details.";
}

$("#suggestion-toggle").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  $("#suggestions").hidden = expanded;
});
$("#suggestions").addEventListener("click", (event) => {
  const suggestion = event.target.closest("button");
  if (!suggestion) return;
  $("#chat-input").value = suggestion.textContent;
  $("#chat-form").requestSubmit();
});
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage($("#chat-input").value);
});
