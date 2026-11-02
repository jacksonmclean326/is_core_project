import { renderIcons } from "./icons.js";

export const $ = <T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required page element not found: ${selector}`);
  return element;
};

export const $$ = <T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] => [...root.querySelectorAll<T>(selector)];

export const eventElement = (event: Event): Element | null =>
  event.target instanceof Element ? event.target : null;

export const escapeHTML = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string): void {
  const toast = document.querySelector<HTMLElement>("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3400);
}

export function openDialog(markup: string): void {
  const dialog = $<HTMLDialogElement>("#detail-dialog");
  const content = $("#dialog-content");
  content.innerHTML = markup;
  const title = content.querySelector<HTMLElement>(".dialog-title");
  if (title) {
    title.id = "dialog-title";
    dialog.setAttribute("aria-labelledby", title.id);
  } else {
    dialog.removeAttribute("aria-labelledby");
  }
  if (!dialog.open) dialog.showModal();
  renderIcons(content);
}

export function closeDialog(): void {
  document.querySelector<HTMLDialogElement>("#detail-dialog")?.close();
}

export function refreshIcons(): void {
  renderIcons();
}
