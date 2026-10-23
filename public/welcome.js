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
  document.getElementById("authSubmit").textContent = signup ? "Create account" : "Sign in";
  document.getElementById("authSwitch").innerHTML = signup
    ? 'Already have an account? <button type="button" data-auth-mode="login">Sign in</button>'
    : 'New to ReRa? <button type="button" data-auth-mode="signup">Create an account</button>';
  document.getElementById("password").autocomplete = signup ? "new-password" : "current-password";
  document.getElementById("password").minLength = signup ? 12 : 1;
  document.getElementById("passwordHint").hidden = !signup;
  document.getElementById("passwordConfirmField").hidden = !signup;
  document.getElementById("passwordConfirm").disabled = !signup;
  document.getElementById("passwordConfirm").required = signup;
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
}

function openAuth(mode) {
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
syncCurricula();
setAuthMode("signup");

authForm.addEventListener("submit", async event => {
  event.preventDefault();
  const error = document.getElementById("authError");
  const submit = document.getElementById("authSubmit");
  error.hidden = true;
  if (authMode === "signup" && document.getElementById("password").value !== document.getElementById("passwordConfirm").value) {
    error.textContent = "Passwords do not match.";
    error.hidden = false;
    document.getElementById("passwordConfirm").focus();
    return;
  }
  submit.disabled = true;
  submit.textContent = authMode === "signup" ? "Creating account…" : "Signing in…";
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
    window.location.assign("/app.html");
  } catch (reason) {
    error.textContent = reason.message;
    error.hidden = false;
    submit.disabled = false;
    submit.textContent = authMode === "signup" ? "Create account" : "Sign in";
  }
});
