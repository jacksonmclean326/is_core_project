import { supabase } from "../../supabase.js";
import { $ } from "../../core.js";

const form = $<HTMLFormElement>("#auth-form");
const nameInput = $<HTMLInputElement>("#auth-name");
const emailInput = $<HTMLInputElement>("#auth-email");
const nameLabel = $("#name-label");
const passwordInput = $<HTMLInputElement>("#auth-password");
const submitButton = $<HTMLButtonElement>("#auth-submit");
const feedback = $("#auth-feedback");
const title = $("#auth-title");
const switchPrompt = $("#auth-switch-prompt");
const switchButton = $<HTMLButtonElement>("#auth-switch");
let isSignUp = false;

function setMode(signUp: boolean) {
  isSignUp = signUp;
  title.textContent = isSignUp ? "Create your account." : "Welcome back.";
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
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              full_name: fullName
            }
          }
        })
      : await supabase.auth.signInWithPassword({ email, password });
  } catch (error) {
    submitButton.disabled = false;
    submitButton.textContent = isSignUp ? "Create account" : "Sign in";
    feedback.textContent = error instanceof Error ? error.message : "Unable to complete sign-in. Please try again.";
    feedback.classList.add("is-error");
    return;
  }

  submitButton.disabled = false;
  submitButton.textContent = isSignUp ? "Create account" : "Sign in";

  if (result.error) {
    feedback.textContent = result.error.message;
    feedback.classList.add("is-error");
    return;
  }

  if (isSignUp && !result.data.session) {
    feedback.textContent = "Account created. Check your email for a confirmation link, then sign in.";
    return;
  }

  window.location.hash = "#/home";
});

setMode(false);
