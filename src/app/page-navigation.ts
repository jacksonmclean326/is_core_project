import { getSession, signOut } from "./api.js";
import { refreshIcons, setProfileInitials } from "./ui/ui.js";
import { ensureRates, setCurrency } from "./state/state.js";
import { currencyOrDefault } from "../shared/currencies.js";
import "./feedback.js";
import { maybeShowCheckIn } from "./checkin.js";

const publicRoute = "/auth";

async function initializeNavigation() {
  const isPublicPage = window.location.pathname === publicRoute;
  let isAdmin = false;

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
      isAdmin = user.isAdmin === true;
      const metadata = user.user_metadata || {};
      // The saved currency lives on the account. This browser caches it so pages paint in the right
      // currency straight away; if the account has a different one (new device, changed elsewhere), reload once.
      if (setCurrency(currencyOrDefault(metadata.currency))) {
        window.location.reload();
        return;
      }
      // A currency other than dollars needs a rate. If this browser had none, reload once so amounts convert.
      if (await ensureRates()) {
        window.location.reload();
        return;
      }
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

  if (isAdmin) addAdminLink();
  // OKR 4: the two-month savings check-in (the team opens it from /admin instead).
  if (window.location.pathname !== "/admin") void maybeShowCheckIn();

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

/** Settings > More gets a link to the team-only OKR page for the team's admins. */
function addAdminLink() {
  const list = document.querySelector<HTMLElement>(".settings-link-list");
  if (!list || list.querySelector("[data-admin-link]")) return;
  const item = document.createElement("li");
  item.innerHTML = `<a href="/admin" data-admin-link><span><strong>Team OKRs</strong><small>Savings goal and check-in numbers (team only)</small></span><i data-icon="chevron-right" aria-hidden="true"></i></a>`;
  list.append(item);
  refreshIcons();
}

void initializeNavigation();
