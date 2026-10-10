import { supabase } from "../../supabase.js";

const form = document.querySelector("#auth-form");
const nameInput = document.querySelector("#auth-name");
const nameLabel = document.querySelector("#name-label");
const passwordInput = document.querySelector("#auth-password");
const submitButton = document.querySelector("#auth-submit");
const feedback = document.querySelector("#auth-feedback");
const title = document.querySelector("#auth-title");
const switchPrompt = document.querySelector("#auth-switch-prompt");
const switchButton = document.querySelector("#auth-switch");
let isSignUp = false;

function setMode(signUp) {
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

  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
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
    result = { error };
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
