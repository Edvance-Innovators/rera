const curriculaByCountry = {
  Rwanda: ["REB", "Cambridge / IB"],
  Kenya: ["CBC", "8-4-4"],
  Uganda: ["UNEB"],
  Tanzania: ["NECTA"]
};
const authDialog = document.getElementById("authDialog");
const authForm = document.getElementById("authForm");
let authMode = "signup";
let toastTimer;

function welcomeIcon(name) {
  const paths = {
    account: `<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>`,
    book: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 16a2.5 2.5 0 0 1 2.5-2.5H20M8 7h7"/>`,
    refresh: `<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3"/>`,
    check: `<path d="m5 12 4 4L19 6"/>`,
    arrow: `<path d="M5 12h14M13 6l6 6-6 6"/>`
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("button-icon");
  svg.innerHTML = paths[name] || paths.arrow;
  return svg;
}

function decorateWelcomeButtons(root = document) {
  root.querySelectorAll("button:not(.close-icon):not([data-icon-decorated]):not(.space-list button)").forEach(button => {
    if (button.querySelector("svg")) {
      button.dataset.iconDecorated = "true";
      return;
    }
    const text = button.textContent.trim().toLowerCase();
    const name = button.dataset.auth === "teacher" || text.includes("teach")
      ? "book"
      : text.includes("resend")
        ? "refresh"
        : text.includes("create") || text.includes("join") || text.includes("match")
          ? "check"
          : text.includes("sign in")
            ? "account"
            : "arrow";
    button.prepend(welcomeIcon(name));
    button.dataset.iconDecorated = "true";
  });
}

function setButtonLabel(button, label) {
  const icon = button.querySelector(".button-icon");
  button.replaceChildren(...(icon ? [icon, document.createTextNode(label)] : [document.createTextNode(label)]));
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function syncCurricula() {
  const country = document.getElementById("country").value;
  document.getElementById("curriculum").innerHTML = curriculaByCountry[country]
    .map(curriculum => `<option>${curriculum}</option>`).join("");
}

function setAuthMode(mode) {
  authMode = mode === "login" ? "login" : "signup";
  const signup = authMode === "signup";
  document.getElementById("authTitle").textContent = signup ? "Create your account" : "Welcome back";
  document.getElementById("authEyebrow").textContent = signup ? "Welcome to ReRa" : "Your learning community";
  setButtonLabel(document.getElementById("authSubmit"), signup ? "Create account" : "Sign in");
  document.getElementById("authSwitch").innerHTML = signup
    ? 'Already have an account? <button type="button" data-auth-mode="login">Sign in</button>'
    : 'New to ReRa? <button type="button" data-auth-mode="signup">Create an account</button>';
  document.getElementById("password").autocomplete = signup ? "new-password" : "current-password";
  document.getElementById("password").minLength = signup ? 12 : 1;
  document.getElementById("passwordHint").hidden = !signup;
  document.getElementById("passwordConfirmField").hidden = !signup;
  document.getElementById("passwordConfirm").disabled = !signup;
  document.getElementById("passwordConfirm").required = signup;
  document.getElementById("passwordMatch").textContent = "";
  document.getElementById("nameField").hidden = !signup;
  document.getElementById("name").required = signup;
  document.getElementById("signupFields").hidden = !signup;
  document.querySelectorAll("#signupFields input, #signupFields select").forEach(input => input.disabled = !signup);
  document.getElementById("authTabs").hidden = !signup;
  document.querySelectorAll("[data-auth-mode]").forEach(button => button.classList.toggle("selected", button.dataset.authMode === authMode));
  document.getElementById("subjectField").hidden = signup && document.querySelector("input[name=role]:checked").value !== "teacher";
  document.getElementById("levelField").hidden = signup && document.querySelector("input[name=role]:checked").value !== "teacher";
  ["subjects", "levels"].forEach(id => {
    const field = document.getElementById(id);
    field.disabled = !signup || document.querySelector("input[name=role]:checked").value !== "teacher";
  });
  document.getElementById("authError").hidden = true;
  decorateWelcomeButtons(authDialog);
}

function openAuth(mode) {
  authForm.querySelectorAll(".form-field, .password-visibility, #signupFields, #authSubmit, #authSwitch").forEach(element => element.hidden = false);
  document.getElementById("confirmationPanel").hidden = true;
  document.getElementById("authSubmit").hidden = false;
  setAuthMode(mode === "teacher" ? "signup" : mode);
  if (mode === "teacher") {
    const teacherOption = document.querySelector('input[name="role"][value="teacher"]');
    teacherOption.checked = true;
    teacherOption.dispatchEvent(new Event("change", { bubbles: true }));
  }
  document.getElementById("subjectField").hidden = document.querySelector("input[name=role]:checked").value !== "teacher";
  authDialog.showModal();
}

document.addEventListener("click", event => {
  const authButton = event.target.closest("[data-auth]");
  if (authButton) openAuth(authButton.dataset.auth);
  const modeButton = event.target.closest("[data-auth-mode]");
  if (modeButton) setAuthMode(modeButton.dataset.authMode);
  if (event.target.closest("[data-close]")) authDialog.close();
});

document.querySelectorAll("input[name=role]").forEach(input => input.addEventListener("change", () => {
  const isTeacher = input.value === "teacher";
  document.getElementById("subjectField").hidden = !isTeacher;
  document.getElementById("levelField").hidden = !isTeacher;
  ["subjects", "levels"].forEach(id => document.getElementById(id).disabled = !isTeacher);
}));
document.getElementById("country").addEventListener("change", syncCurricula);

const passwordInput = document.getElementById("password");
const passwordConfirmInput = document.getElementById("passwordConfirm");
const passwordMatch = document.getElementById("passwordMatch");

function updatePasswordConfirmation() {
  if (authMode !== "signup" || !passwordConfirmInput.value) {
    passwordMatch.textContent = "";
    passwordConfirmInput.setCustomValidity("");
    return;
  }
  const matches = passwordInput.value === passwordConfirmInput.value;
  passwordMatch.textContent = matches ? "Passwords match." : "Passwords do not match.";
  passwordConfirmInput.setCustomValidity(matches ? "" : "Passwords do not match");
}

passwordInput.addEventListener("input", updatePasswordConfirmation);
passwordConfirmInput.addEventListener("input", updatePasswordConfirmation);
document.getElementById("showPasswords").addEventListener("change", event => {
  const type = event.target.checked ? "text" : "password";
  passwordInput.type = type;
  passwordConfirmInput.type = type;
});

syncCurricula();
setAuthMode("signup");
decorateWelcomeButtons(document);

document.getElementById("resendVerification").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  document.getElementById("confirmationMessage").textContent = "Sending another confirmation email…";
  setButtonLabel(button, "Sending…");
  try {
    const response = await fetch("/api/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: button.closest("#confirmationPanel").dataset.email }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not resend the email.");
    document.getElementById("confirmationMessage").textContent = "Confirmation email sent. Check your inbox and spam folder.";
  } catch (reason) {
    document.getElementById("confirmationMessage").textContent = reason.message;
  } finally {
    button.disabled = false;
    setButtonLabel(button, "Resend confirmation email");
  }
});

if (new URLSearchParams(window.location.search).has("verify-email")) {
  const token = new URLSearchParams(window.location.search).get("verify-email");
  fetch("/api/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
    .then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not confirm your email.");
      document.getElementById("authError").textContent = "Email confirmed. You can now sign in.";
      document.getElementById("authError").hidden = false;
      openAuth("login");
    })
    .catch(reason => {
      document.getElementById("authError").textContent = reason.message;
      document.getElementById("authError").hidden = false;
    });
}

authForm.addEventListener("submit", async event => {
  event.preventDefault();
  const error = document.getElementById("authError");
  const submit = document.getElementById("authSubmit");
  error.hidden = true;
  updatePasswordConfirmation();
  if (authMode === "signup" && passwordInput.value !== passwordConfirmInput.value) {
    error.textContent = "Passwords do not match.";
    error.hidden = false;
    passwordConfirmInput.focus();
    return;
  }
  submit.disabled = true;
  setButtonLabel(submit, authMode === "signup" ? "Creating account…" : "Signing in…");
  const form = new FormData(authForm);
  const payload = authMode === "signup"
    ? { name: form.get("name"), email: form.get("email"), password: form.get("password"), password_confirm: form.get("passwordConfirm"), role: form.get("role"), country: form.get("country"), curriculum: form.get("curriculum"), subjects: [...document.getElementById("subjects").selectedOptions].map(option => option.value), levels: [...document.getElementById("levels").selectedOptions].map(option => option.value) }
    : { email: form.get("email"), password: form.get("password") };
  try {
    const response = await fetch(`/api/${authMode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });
    const responseText = await response.text();
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : null;
    } catch {
      throw new Error("The server returned an invalid response. Please try again.");
    }
    if (!result) throw new Error("The server returned an empty response. Please try again.");
    if (!response.ok) throw new Error(result.error || "Could not complete your request.");
    if (authMode === "signup" && result.verification_required) {
      authForm.querySelectorAll(".form-field, .password-visibility, #signupFields, #authSubmit, #authSwitch").forEach(element => element.hidden = true);
      submit.hidden = true;
      const panel = document.getElementById("confirmationPanel");
      const message = document.getElementById("confirmationMessage");
      panel.hidden = false;
      if (result.email_sent) {
        message.textContent = `We sent a confirmation link to ${payload.email}. Check your inbox and spam folder, then use Sign in.`;
      } else {
        message.textContent = `${result.mail_error || "The confirmation email could not be sent."} Account: ${payload.email}`;
      }
      panel.dataset.email = payload.email;
      return;
    }
    window.location.assign("/app.html");
  } catch (reason) {
    error.textContent = reason.message;
    error.hidden = false;
    submit.disabled = false;
    setButtonLabel(submit, authMode === "signup" ? "Create account" : "Sign in");
  }
});
