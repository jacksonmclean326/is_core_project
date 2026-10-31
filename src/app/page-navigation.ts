import { getSession, signOut } from "./api.js";

const publicRoute = "/auth";

async function initializeNavigation() {
  const isPublicPage = window.location.pathname === publicRoute;

  try {
    const { user } = await getSession();
    if (isPublicPage && user) {
      window.location.replace("/home");
      return;
    }
    if (!isPublicPage && !user) {
      window.location.replace(publicRoute);
      return;
    }
  } catch (error) {
    console.error("Unable to verify the current session.", error);
    return;
  }

  if (isPublicPage) return;

  const actions = document.querySelector<HTMLElement>(".topbar-actions");
  if (!actions || actions.querySelector("[data-sign-out]")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button auth-sign-out";
  button.dataset.signOut = "";
  button.textContent = "Sign out";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await signOut();
      window.location.assign(publicRoute);
    } catch (error) {
      console.error("Unable to sign out.", error);
      button.disabled = false;
      button.textContent = "Sign out failed";
    }
  });
  actions.append(button);
}

void initializeNavigation();
