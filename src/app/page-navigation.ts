import { getSession, signOut } from "./api.js";
import { setProfileInitials } from "./ui/ui.js";

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
    if (user) {
      const metadata = user.user_metadata || {};
      const metadataName = [metadata.first_name, metadata.last_name]
        .filter((part) => typeof part === "string" && part.trim())
        .join(" ");
      const name =
        metadataName ||
        (typeof metadata.full_name === "string" ? metadata.full_name.trim() : "") ||
        (typeof metadata.name === "string" ? metadata.name.trim() : "");
      setProfileInitials(name, user.email || "");
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
