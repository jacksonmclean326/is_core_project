import { signIn, signUp } from "../../api.js";
import "../../page-navigation.js";
import { $ } from "../../core.js";

const form = $<HTMLFormElement>("#auth-form");
const nameInput = $<HTMLInputElement>("#auth-name");
const emailInput = $<HTMLInputElement>("#auth-email");
const nameLabel = $("#name-label");
const passwordInput = $<HTMLInputElement>("#auth-password");
const submitButton = $<HTMLButtonElement>("#auth-submit");
const feedback = $("#auth-feedback");
const title = $("#auth-title");
const description = $("#auth-description");
const switchPrompt = $("#auth-switch-prompt");
const switchButton = $<HTMLButtonElement>("#auth-switch");
let isSignUp = false;
const referralCode = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase();
const validReferralCode = referralCode && /^[A-HJ-NP-Z2-9]{6}$/.test(referralCode)
  ? referralCode
  : undefined;

function setMode(signUp: boolean) {
  isSignUp = signUp;
  title.textContent = isSignUp ? "Create your account." : "Welcome back.";
  description.textContent = isSignUp
    ? "Create your account, then take a few quick steps to make Money Man yours."
    : "Sign in to pick up where you left off, or create an account to get started.";
  nameInput.hidden = !isSignUp;
  nameLabel.hidden = !isSignUp;
  nameInput.required = isSignUp;
  passwordInput.autocomplete = isSignUp ? "new-password" : "current-password";
  submitButton.textContent = isSignUp ? "Create account" : "Sign in";
  switchPrompt.textContent = isSignUp ? "Already have an account?" : "New to Money Man?";
  switchButton.textContent = isSignUp ? "Sign in" : "Create an account";
  feedback.textContent = "";
  feedback.classList.remove("is-error");
}

switchButton.addEventListener("click", () => setMode(!isSignUp));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  feedback.textContent = "";
  feedback.classList.remove("is-error");
  submitButton.disabled = true;
  submitButton.textContent = isSignUp ? "Creating account..." : "Signing in...";

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const fullName = nameInput.value.trim().replace(/\s+/g, " ");
  const [firstName, ...lastNameParts] = fullName.split(" ");
  const lastName = lastNameParts.join(" ");
  if (isSignUp && (!firstName || !lastName)) {
    submitButton.disabled = false;
    submitButton.textContent = "Create account";
    feedback.textContent = "Enter both your first and last name.";
    feedback.classList.add("is-error");
    return;
  }

  let result;
  try {
    result = isSignUp
      ? await signUp(email, password, firstName, lastName, fullName, validReferralCode)
      : await signIn(email, password);
  } catch (error) {
    submitButton.disabled = false;
    submitButton.textContent = isSignUp ? "Create account" : "Sign in";
    feedback.textContent = error instanceof Error ? error.message : "Unable to complete sign-in. Please try again.";
    feedback.classList.add("is-error");
    return;
  }

  submitButton.disabled = false;
  submitButton.textContent = isSignUp ? "Create account" : "Sign in";

  if (isSignUp && !result.authenticated) {
    feedback.textContent = "Account created. Check your email for a confirmation link, then sign in to finish setting up.";
    return;
  }

  window.location.assign(result.user?.user_metadata?.onboarding_complete === false ? "/onboarding" : "/home");
});

setMode(Boolean(validReferralCode));
