import { ApiError, clearChatHistory, getChatHistory, sendChat } from "../../api.js";
import { $, escapeHTML, eventElement } from "../../core.js";
import "../../page-navigation.js";

type MessageRole = "user" | "assistant";
let sending = false;
let historyLoaded = false;

const mascotUrl = new URL("../../assets/money-man-mascot.png", import.meta.url).href;
const input = $<HTMLInputElement>("#chat-input");
const submitButton = $<HTMLButtonElement>('#chat-form button[type="submit"]');
const clearButton = $<HTMLButtonElement>("#clear-chat");
const status = $<HTMLParagraphElement>("#chat-status");

function formatTime(value: string): { label: string; datetime: string } {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { label: "", datetime: "" };
  return {
    label: date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    datetime: date.toISOString(),
  };
}

function appendMessage(role: MessageRole, content: string, createdAt: string) {
  const list = $("#message-list");
  const time = formatTime(createdAt);
  const timeElement = time.label
    ? `<time datetime="${time.datetime}">${time.label}</time>`
    : "";
  const row = role === "user"
    ? `<div class="message-row user-row"><div class="message-bubble"><p>${escapeHTML(content)}</p>${timeElement}</div></div>`
    : `<div class="message-row assistant-row"><img class="money-avatar brand-avatar" src="${mascotUrl}" alt=""><div class="message-bubble assistant-bubble"><strong>Mr. Moneyman</strong><p>${escapeHTML(content)}</p>${timeElement}</div></div>`;
  list.insertAdjacentHTML("beforeend", row);
  list.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function setBusy(value: boolean) {
  sending = value;
  input.disabled = value || !historyLoaded;
  submitButton.disabled = value || !historyLoaded;
  clearButton.disabled = value || !historyLoaded;
  submitButton.setAttribute("aria-label", value ? "Sending message" : "Send message");
}

async function loadHistory() {
  try {
    const { messages } = await getChatHistory();
    for (const message of messages) appendMessage(message.role, message.content, message.createdAt);
    status.textContent = "";
  } catch (error) {
    status.textContent = error instanceof ApiError
      ? `Saved history could not be loaded: ${error.message}`
      : "Saved history could not be loaded. New messages can still be sent.";
  } finally {
    historyLoaded = true;
    setBusy(false);
  }
}

async function sendMessage(message: string) {
  const content = message.trim();
  if (!content || sending || !historyLoaded) return;
  input.value = "";
  const now = new Date().toISOString();
  appendMessage("user", content, now);
  setBusy(true);
  status.textContent = "Mr. Moneyman is thinking…";
  try {
    const result = await sendChat(content);
    appendMessage("assistant", result.reply, result.createdAt);
    status.textContent = "";
  } catch (error) {
    const explanation = error instanceof ApiError
      ? error.message
      : "I couldn't get a reply right now. Please try again.";
    appendMessage("assistant", explanation, new Date().toISOString());
    status.textContent = "That message may not have been saved. Reload to check your history.";
  } finally {
    setBusy(false);
    input.focus();
  }
}

clearButton.addEventListener("click", async () => {
  if (sending || !historyLoaded) return;
  if (!window.confirm("Clear all saved chat history? This can't be undone.")) return;
  setBusy(true);
  status.textContent = "Clearing saved history…";
  try {
    await clearChatHistory();
    $("#message-list").replaceChildren();
    status.textContent = "Saved chat history cleared.";
  } catch (error) {
    status.textContent = error instanceof ApiError
      ? `History could not be cleared: ${error.message}`
      : "History could not be cleared. Please try again.";
  } finally {
    setBusy(false);
  }
});

$("#suggestion-toggle").addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  $("#suggestions").hidden = expanded;
});
$("#suggestions").addEventListener("click", (event) => {
  const suggestion = eventElement(event)?.closest("button");
  if (!suggestion || sending || !historyLoaded) return;
  input.value = suggestion.textContent ?? "";
  $<HTMLFormElement>("#chat-form").requestSubmit();
});
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void sendMessage(input.value);
});

status.textContent = "Loading saved history…";
setBusy(false);
void loadHistory();
