const routes = {
  auth: "app/pages/auth/auth.html",
  home: "app/pages/home/home.html",
  details: "app/pages/details/details.html",
  chat: "app/pages/chat/chat.html",
  leaderboard: "app/pages/leaderboard/leaderboard.html",
  settings: "app/pages/settings/settings.html"
};

const app = document.querySelector("#app-root");
const pageStylesheet = document.querySelector("#page-stylesheet");
let navigationId = 0;
let authReady = false;
let session = null;
const routeByPath = new Map(
  Object.entries(routes).map(([name, path]) => [
    new URL(path, document.baseURI).pathname,
    name
  ])
);

function routeFromHash() {
  const route = window.location.hash.slice(2).toLowerCase();
  return Object.hasOwn(routes, route) ? route : (authReady && !session ? "auth" : "home");
}

function navigateTo(route, replace = false) {
  const nextHash = `#/${route}`;
  if (window.location.hash === nextHash) {
    renderRoute();
  } else if (replace) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${nextHash}`
    );
    renderRoute();
  } else {
    window.location.hash = nextHash;
  }
}

function setPageUrlAttributes(pageDocument, pageUrl) {
  const attributes = ["href", "src", "action", "formaction", "poster", "cite", "data"];
  for (const element of pageDocument.querySelectorAll(
    attributes.map((attribute) => `[${attribute}]`).join(", ")
  )) {
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute);
      if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) continue;
      element.setAttribute(attribute, new URL(value, pageUrl).href);
    }
  }
}

function showLoadError(route, error) {
  console.error(`Unable to load the ${route} page.`, error);
  app.replaceChildren();
  const message = document.createElement("main");
  message.setAttribute("role", "alert");
  const heading = document.createElement("h1");
  heading.textContent = "Page unavailable";
  const description = document.createElement("p");
  description.textContent = `Unable to load the ${route} page. Check your connection and try again.`;
  message.append(heading, description);
  app.append(message);
  app.setAttribute("aria-busy", "false");
  document.title = "Page unavailable";
}

async function renderRoute() {
  if (!authReady) return;

  const route = routeFromHash();
  if (!session && route !== "auth") {
    navigateTo("auth", true);
    return;
  }
  if (session && route === "auth") {
    navigateTo("home", true);
    return;
  }

  const canonicalHash = `#/${route}`;
  if (window.location.hash !== canonicalHash) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${canonicalHash}`
    );
  }

  app.setAttribute("aria-busy", "true");
  const requestId = ++navigationId;
  const pageUrl = new URL(routes[route], document.baseURI);
  try {
    const response = await fetch(pageUrl);
    if (!response.ok) throw new Error(`Page request failed with status ${response.status}`);

    const pageDocument = new DOMParser().parseFromString(await response.text(), "text/html");
    if (requestId !== navigationId) return;
    setPageUrlAttributes(pageDocument, pageUrl);

    const stylesheet = [...pageDocument.querySelectorAll('link[rel="stylesheet"]')]
      .map((link) => new URL(link.href, pageUrl))
      .filter((url) => url.origin === pageUrl.origin)
      .at(-1);
    if (!stylesheet) throw new Error(`No page stylesheet found for ${route}`);

    const moduleScript = [...pageDocument.querySelectorAll('script[type="module"][src]')]
      .find((script) =>
        new URL(script.getAttribute("src"), pageUrl).pathname !== "/@vite/client"
      );
    if (!moduleScript) throw new Error(`No page module found for ${route}`);
    const moduleUrl = new URL(moduleScript.getAttribute("src"), pageUrl);

    if (pageStylesheet.href !== stylesheet.href) {
      await new Promise((resolve, reject) => {
        pageStylesheet.onload = resolve;
        pageStylesheet.onerror = () => reject(new Error(`Unable to load stylesheet ${stylesheet.href}`));
        pageStylesheet.href = stylesheet.href;
      });
    }
    if (requestId !== navigationId) return;

    const content = [...pageDocument.body.childNodes]
      .filter((node) => !(node instanceof HTMLScriptElement))
      .map((node) => document.importNode(node, true));
    app.replaceChildren(...content);
    app.setAttribute("aria-busy", "true");
    document.title = pageDocument.title;

    const routedModule = new URL(moduleUrl);
    routedModule.searchParams.set("navigation", String(requestId));
    await import(routedModule.href);
    if (requestId !== navigationId) return;
    if (session && route !== "auth") addSignOutControl();
    window.lucide?.createIcons();
    app.setAttribute("aria-busy", "false");
  } catch (error) {
    if (requestId === navigationId) showLoadError(route, error);
  }
}

function addSignOutControl() {
  const actions = app.querySelector(".topbar-actions");
  if (!actions || actions.querySelector("[data-sign-out]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button auth-sign-out";
  button.dataset.signOut = "";
  button.textContent = "Sign out";
  actions.append(button);
}

app.addEventListener("click", (event) => {
  const signOut = event.target.closest?.("[data-sign-out]");
  if (signOut) {
    signOut.disabled = true;
    supabase.auth.signOut().then(({ error }) => {
      if (error) throw error;
    }).catch((error) => {
      console.error("Unable to sign out.", error);
      signOut.disabled = false;
      signOut.textContent = "Sign out failed";
    });
    return;
  }

  const link = event.target.closest?.("a[href]");
  if (
    !link ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (link.target && link.target !== "_self")
  ) return;

  const target = new URL(link.href);
  if (target.origin !== window.location.origin) return;
  const route = routeByPath.get(target.pathname);
  if (!route) return;

  event.preventDefault();
  navigateTo(route);
});

import { supabase } from "./supabase.js";

supabase.auth.onAuthStateChange((_event, nextSession) => {
  session = nextSession;
  if (!authReady) return;
  const route = routeFromHash();
  if (!session && route !== "auth") {
    navigateTo("auth", true);
  } else if (session && route === "auth") {
    navigateTo("home", true);
  }
});

window.addEventListener("hashchange", renderRoute);
const { data, error } = await supabase.auth.getSession();
if (error) {
  showLoadError("authentication", error);
} else {
  session = data.session;
  authReady = true;
  renderRoute();
}
