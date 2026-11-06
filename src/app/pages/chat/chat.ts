import { ApiError, sendChat } from "../../api.js";
import { $, escapeHTML, eventElement } from "../../core.js";
import "../../page-navigation.js";

type ChatMessage = { role: "user" | "assistant"; content: string };
const conversation: ChatMessage[] = [];
let sending = false;

const mascotUrl = new URL("../../assets/money-man-mascot.png", import.meta.url).href;

function appendMessage(role: ChatMessage["role"], content: string, timestamp: string) {
  const list = $("#message-list");
  const isUser = role === "user";
  const row = isUser
    ? `<div class="message-row user-row"><div class="message-bubble"><p>${escapeHTML(content)}</p><time>${timestamp}</time></div></div>`
    : `<div class="message-row assistant-row"><img class="money-avatar brand-avatar" src="${mascotUrl}" alt=""><div class="message-bubble assistant-bubble"><strong>Mr. Moneyman</strong><p>${escapeHTML(content)}</p><time>${timestamp}</time></div></div>`;
  list.insertAdjacentHTML("beforeend", row);
  list.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function setSending(value: boolean) {
  sending = value;
  $<HTMLInputElement>("#chat-input").disabled = value;
  $<HTMLButtonElement>('#chat-form button[type="submit"]').disabled = value;
  $<HTMLButtonElement>('#chat-form button[type="submit"]').setAttribute("aria-label", value ? "Sending message" : "Send message");
}

async function sendMessage(message: string) {
  const content = message.trim();
  if (!content || sending) return;
  const input = $<HTMLInputElement>("#chat-input");
  input.value = "";
  const timestamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const messages = [...conversation, { role: "user" as const, content }].slice(-10);
  appendMessage("user", content, timestamp);
  setSending(true);
  try {
    const { reply } = await sendChat(messages);
    conversation.splice(0, conversation.length, ...messages, { role: "assistant", content: reply });
    if (conversation.length > 10) conversation.splice(0, conversation.length - 10);
    appendMessage("assistant", reply, new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  } catch (error) {
    const explanation = error instanceof ApiError ? error.message : "I couldn't get a reply right now. Please try again.";
    appendMessage("assistant", explanation, new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  } finally {
    setSending(false);
    input.focus();
  }
}

$("#suggestion-toggle").addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  $("#suggestions").hidden = expanded;
});
$("#suggestions").addEventListener("click", (event) => {
  const suggestion = eventElement(event)?.closest("button");
  if (!suggestion || sending) return;
  $<HTMLInputElement>("#chat-input").value = suggestion.textContent ?? "";
  $<HTMLFormElement>("#chat-form").requestSubmit();
});
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void sendMessage($<HTMLInputElement>("#chat-input").value);
});
