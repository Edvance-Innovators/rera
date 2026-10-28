const curriculaByCountry = {
  Rwanda: ["REB", "Cambridge / IB"],
  Kenya: ["CBC", "8-4-4"],
  Uganda: ["UNEB"],
  Tanzania: ["NECTA"]
};
const learningTemplates = {
  Rwanda: [
    { title: "A steady study rhythm", curriculum: "REB", level: "Primary", focus: "Weekly learning plan", detail: "Short practice sessions, reading time and a simple family check-in." },
    { title: "Exam-ready sprint", curriculum: "REB", level: "Secondary", focus: "Revision planner", detail: "Break subjects into focused review blocks, practice and recap." },
    { title: "Cambridge subject planner", curriculum: "Cambridge / IB", level: "Secondary", focus: "Coursework planner", detail: "Track syllabus goals, assignments and exam preparation by subject." },
    { title: "University study map", curriculum: "REB", level: "University", focus: "Term study plan", detail: "Organize lectures, independent study, deadlines and review sessions." }
  ],
  Kenya: [
    { title: "CBC competency week", curriculum: "CBC", level: "Primary", focus: "Weekly learning plan", detail: "Balance classroom themes, practical activities and foundational skills." },
    { title: "Junior school project brief", curriculum: "CBC", level: "Secondary", focus: "Project planner", detail: "Turn a competency into manageable research, practice and reflection." },
    { title: "KCSE revision runway", curriculum: "8-4-4", level: "Secondary", focus: "Exam revision", detail: "Set subject targets, past-paper practice and weekly progress checks." },
    { title: "Campus term planner", curriculum: "8-4-4", level: "University", focus: "Term study plan", detail: "Keep coursework, independent reading and assessment dates together." }
  ],
  Uganda: [
    { title: "PLE confidence builder", curriculum: "UNEB", level: "Primary", focus: "Primary revision", detail: "Build a balanced routine for core subjects, practice and rest." },
    { title: "UCE subject tracker", curriculum: "UNEB", level: "Secondary", focus: "Lower secondary", detail: "Track topic coverage, class exercises and focused revision by subject." },
    { title: "UACE exam pathway", curriculum: "UNEB", level: "Secondary", focus: "Advanced level plan", detail: "Plan subject combinations, deeper study and timed exam practice." },
    { title: "University semester map", curriculum: "UNEB", level: "University", focus: "Semester study plan", detail: "Map lectures, reading, coursework and exam preparation across a term." }
  ],
  Tanzania: [
    { title: "Standard 7 foundations", curriculum: "NECTA", level: "Primary", focus: "Primary revision", detail: "Create a gentle weekly routine for core skills and exam practice." },
    { title: "Form II progress plan", curriculum: "NECTA", level: "Secondary", focus: "Topic tracker", detail: "Set topic goals, practice checkpoints and a clear weekly review." },
    { title: "CSEE revision schedule", curriculum: "NECTA", level: "Secondary", focus: "Exam revision", detail: "Share revision time across subjects, past papers and rest days." },
    { title: "University coursework map", curriculum: "NECTA", level: "University", focus: "Term study plan", detail: "Bring lectures, research, coursework and assessment dates into one plan." }
  ]
};
const learningTemplateIcons = [
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 4h3m-3 3h7"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14m0-14C10.5 5.7 8.5 5 6 5H3v14h4c2.1 0 3.8.6 5 2m0-14c1.5-1.3 3.5-2 6-2h3v14h-4c-2.1 0-3.8.6-5 2"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m16.2 7.8 4-4"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m2 10 10-5 10 5-10 5z"/><path d="M6 12v5c3.5 3 8.5 3 12 0v-5m4-2v6"/></svg>`
];
const authDialog = document.getElementById("authDialog");
const authForm = document.getElementById("authForm");
const nearbyDialog = document.getElementById("nearbyDialog");
let authMode = "signup";
let toastTimer;
let heroSlideIndex = 0;
let heroSlideTimer;
let heroSlidePaused = false;
let nearbyMap;
let nearbyLayers;
let nearbyLocation;
let nearbySearchId = 0;
let nearbySelectedRadius;

function showHeroSlide(index) {
  const slides = [...document.querySelectorAll(".hero-slide")];
  if (!slides.length) return;
  heroSlideIndex = (index + slides.length) % slides.length;
  slides.forEach((slide, slideIndex) => {
    const active = slideIndex === heroSlideIndex;
    slide.classList.toggle("active", active);
    slide.setAttribute("aria-hidden", String(!active));
  });
  document.querySelectorAll("[data-carousel-slide]").forEach((button, slideIndex) => {
    const active = slideIndex === heroSlideIndex;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderHeroSlides() {
  const environments = window.reraLearningEnvironments;
  if (!Array.isArray(environments) || !environments.length) {
    throw new Error("Regional learning photos could not be loaded.");
  }
  document.getElementById("heroSlides").innerHTML = environments.map((environment, index) => `
    <article class="hero-slide ${index === 0 ? "active" : ""}" aria-label="${index + 1} of ${environments.length}" aria-roledescription="slide" ${index === 0 ? "" : 'aria-hidden="true"'}>
      <img src="${escapeHtml(environment.image)}" alt="${escapeHtml(environment.alt)}" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>
      <span class="art-curriculum-tag"><strong>${escapeHtml(environment.curriculum)}</strong><small>${escapeHtml(environment.country)} · ${escapeHtml(environment.setting)}</small></span>
      <span class="art-setting-label">${escapeHtml(environment.setting)}</span>
      <span class="art-photo-credit">Photo: ${environment.sourceUrl ? `<a href="${escapeHtml(environment.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(environment.attribution)}</a>` : escapeHtml(environment.attribution)} · ${environment.licenseUrl ? `<a href="${escapeHtml(environment.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(environment.license)}</a>` : escapeHtml(environment.license)}</span>
    </article>`).join("");
  document.getElementById("heroCarouselDots").innerHTML = environments.map((environment, index) =>
    `<button class="${index === 0 ? "selected" : ""}" type="button" data-carousel-slide="${index}" aria-label="Show ${escapeHtml(environment.setting)}: ${escapeHtml(environment.curriculum)} in ${escapeHtml(environment.country)}" title="${escapeHtml(environment.setting)}" aria-pressed="${index === 0}"></button>`
  ).join("");
}

function setWelcomeAccount(user) {
  const actions = document.getElementById("welcomeAuthActions");
  if (!actions) return;
  if (!user) {
    actions.innerHTML = `<button class="text-action" data-auth="login">Sign in</button><button class="button button-small" data-auth="signup">Join ReRa</button>`;
    decorateWelcomeButtons(actions);
    return;
  }
  const role = user.role === "teacher" ? "Educator" : user.role === "manager" ? "Manager" : user.role === "learner" ? "Learner" : "Parent";
  actions.innerHTML = `<span class="welcome-user-greeting"><span>Signed in as</span><strong>${escapeHtml(user.name)}</strong><small>${role}</small></span><a class="button button-small welcome-dashboard-link" href="/app.html" aria-label="Open my dashboard" title="Open my dashboard">My dashboard ${welcomeIcon("arrow").outerHTML}</a><button class="text-action welcome-signout" type="button" data-action="logout">Log out</button>`;
}

async function refreshWelcomeAccount() {
  const response = await fetch("/api/me", { credentials: "same-origin" });
  if (response.status === 401) {
    setWelcomeAccount(null);
    return;
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not check your sign-in status.");
  setWelcomeAccount(result.user);
}

async function logoutWelcomeAccount(button) {
  button.disabled = true;
  try {
    const response = await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not sign out.");
    setWelcomeAccount(null);
    showToast("You have signed out.");
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

function setEducatorPreview(wrapper, open) {
  const trigger = wrapper.querySelector("[aria-controls]");
  const panel = wrapper.querySelector(".educator-preview-card");
  if (!trigger || !panel) return;
  wrapper.dataset.previewOpen = String(open);
  trigger.setAttribute("aria-expanded", String(open));
  panel.hidden = !open;
}

function startHeroSlideTimer() {
  clearInterval(heroSlideTimer);
  if (!heroSlidePaused && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    heroSlideTimer = setInterval(() => showHeroSlide(heroSlideIndex + 1), 4200);
  }
}

function renderLearningTemplates(country) {
  const grid = document.getElementById("templateGrid");
  grid.innerHTML = learningTemplates[country].map((template, index) => `<article class="template-card template-tone-${index + 1}"><div class="template-card-top"><span class="template-index">0${index + 1}</span><span class="template-level">${template.level}</span></div><div class="template-mark" aria-hidden="true">${learningTemplateIcons[index]}</div><div class="template-card-copy"><span class="template-focus">${template.focus}</span><h3>${template.title}</h3><p>${template.detail}</p></div><div class="template-card-foot"><span>${country} · ${template.curriculum}</span><button type="button" class="template-start" data-auth="signup" data-template-country="${country}" data-template-curriculum="${template.curriculum}">Start this plan <span aria-hidden="true">↗</span></button></div></article>`).join("");
  document.querySelectorAll(".region-tab").forEach(button => {
    const selected = button.dataset.region === country;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

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
  root.querySelectorAll('button:not(.close-icon):not([data-icon-decorated]):not(.space-list button):not(.rail-link):not(.template-start):not([data-action="closer-to-home"])').forEach(button => {
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

async function loadNearbyEducators(latitude, longitude, radius) {
  const searchId = ++nearbySearchId;
  const status = document.getElementById("nearbyStatus");
  status.textContent = "Finding verified educators nearby…";
  try {
    const response = await fetch("/api/nearby-teachers", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude, radius_km: radius })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load nearby educators.");
    if (searchId !== nearbySearchId) return;
    if (!window.L) throw new Error("The map could not be loaded. Check your connection and try again.");
    if (!nearbyMap) {
      nearbyMap = L.map("nearbyMap").setView([latitude, longitude], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(nearbyMap);
      nearbyLayers = L.layerGroup().addTo(nearbyMap);
    } else {
      nearbyMap.invalidateSize();
      nearbyLayers.clearLayers();
    }
    L.circle([latitude, longitude], {
      radius: radius * 1000,
      color: "#7947c7",
      weight: 1,
      fillColor: "#7947c7",
      fillOpacity: .07
    }).addTo(nearbyLayers);
    result.points.forEach(point => {
      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: 7,
        color: "#176b52",
        fillColor: "#43b89d",
        fillOpacity: .9,
        weight: 2
      });
      marker.bindPopup(`Approximate educator area<br>${escapeHtml(point.curriculum)} · ${escapeHtml(point.country)}`);
      marker.addTo(nearbyLayers);
    });
    const bounds = nearbyLayers.getBounds();
    if (bounds.isValid()) nearbyMap.fitBounds(bounds.pad(.15), { maxZoom: 13 });
    status.textContent = result.points.length
      ? `${result.points.length} verified educator${result.points.length === 1 ? "" : "s"} within ${radius} km.`
      : `No verified, available educators with a mapped location were found within ${radius} km.`;
  } catch (error) {
    if (searchId === nearbySearchId) status.textContent = error.message;
  }
}

function showNearbyDialog(user) {
  const radiusSelect = document.getElementById("nearbyRadius");
  const savedRadius = Number(nearbySelectedRadius ?? user.radius_km);
  radiusSelect.value = [5, 10, 20, 50].includes(savedRadius) ? String(savedRadius) : "10";
  nearbyLocation = null;
  nearbySearchId += 1;
  nearbyLayers?.clearLayers();
  nearbyDialog.showModal();
  document.getElementById("nearbyStatus").textContent = "Requesting your location…";
  if (!navigator.geolocation) {
    document.getElementById("nearbyStatus").textContent = "Location access is unavailable in this browser.";
    return;
  }
  navigator.geolocation.getCurrentPosition(position => {
    nearbyLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    loadNearbyEducators(nearbyLocation.latitude, nearbyLocation.longitude, Number(radiusSelect.value));
  }, error => {
    const message = error.code === error.PERMISSION_DENIED
      ? "Location access was declined. Allow location access in your browser settings to view nearby educators."
      : "Your location could not be determined. Check your connection and try again.";
    document.getElementById("nearbyStatus").textContent = message;
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
}

async function handleCloserToHome() {
  try {
    const response = await fetch("/api/me", { credentials: "same-origin" });
    if (response.status === 401) {
      sessionStorage.setItem("reraOpenNearbyMap", "1");
      openAuth("login");
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not check your sign-in status.");
    setWelcomeAccount(result.user);
    showNearbyDialog(result.user);
  } catch (error) {
    showToast(error.message);
  }
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
  const logoutButton = event.target.closest('[data-action="logout"]');
  if (logoutButton) {
    logoutWelcomeAccount(logoutButton);
    return;
  }
  const carouselToggle = event.target.closest("[data-carousel-toggle]");
  if (carouselToggle) {
    heroSlidePaused = !heroSlidePaused;
    carouselToggle.textContent = heroSlidePaused ? "▶" : "Ⅱ";
    carouselToggle.setAttribute("aria-label", heroSlidePaused ? "Resume slideshow" : "Pause slideshow");
    carouselToggle.setAttribute("aria-pressed", String(heroSlidePaused));
    startHeroSlideTimer();
  }
  const carouselStep = event.target.closest("[data-carousel-step]");
  if (carouselStep) {
    showHeroSlide(heroSlideIndex + Number(carouselStep.dataset.carouselStep));
    startHeroSlideTimer();
  }
  const carouselSlide = event.target.closest("[data-carousel-slide]");
  if (carouselSlide) {
    showHeroSlide(Number(carouselSlide.dataset.carouselSlide));
    startHeroSlideTimer();
  }
  if (event.target.closest('[data-action="closer-to-home"]')) handleCloserToHome();
  const authButton = event.target.closest("[data-auth]");
  if (authButton) {
    openAuth(authButton.dataset.auth);
    if (authButton.dataset.templateCountry) {
      document.getElementById("country").value = authButton.dataset.templateCountry;
      syncCurricula();
      document.getElementById("curriculum").value = authButton.dataset.templateCurriculum;
    }
  }
  const regionButton = event.target.closest("[data-region]");
  if (regionButton) renderLearningTemplates(regionButton.dataset.region);
  const modeButton = event.target.closest("[data-auth-mode]");
  if (modeButton) setAuthMode(modeButton.dataset.authMode);
  const closeButton = event.target.closest("[data-close]");
  if (closeButton) closeButton.closest("dialog")?.close();
});

document.addEventListener("pointerover", event => {
  if (event.pointerType === "touch") return;
  const wrapper = event.target.closest("[data-educator-preview]");
  if (wrapper && !wrapper.contains(event.relatedTarget)) setEducatorPreview(wrapper, true);
});
document.addEventListener("pointerout", event => {
  const wrapper = event.target.closest("[data-educator-preview]");
  if (wrapper && !wrapper.contains(event.relatedTarget)) setEducatorPreview(wrapper, false);
});
document.addEventListener("focusin", event => {
  const wrapper = event.target.closest("[data-educator-preview]");
  if (wrapper) setEducatorPreview(wrapper, true);
});
document.addEventListener("focusout", event => {
  const wrapper = event.target.closest("[data-educator-preview]");
  if (wrapper && !wrapper.contains(event.relatedTarget)) setEducatorPreview(wrapper, false);
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const wrapper = document.querySelector('[data-educator-preview][data-preview-open="true"]');
  if (wrapper) setEducatorPreview(wrapper, false);
});

document.querySelectorAll("input[name=role]").forEach(input => input.addEventListener("change", () => {
  const isTeacher = input.value === "teacher";
  document.getElementById("subjectField").hidden = !isTeacher;
  document.getElementById("levelField").hidden = !isTeacher;
  ["subjects", "levels"].forEach(id => document.getElementById(id).disabled = !isTeacher);
}));
document.getElementById("country").addEventListener("change", syncCurricula);
document.getElementById("nearbyRadius").addEventListener("change", event => {
  nearbySelectedRadius = Number(event.target.value);
  if (nearbyLocation) loadNearbyEducators(nearbyLocation.latitude, nearbyLocation.longitude, nearbySelectedRadius);
});
nearbyDialog.addEventListener("close", () => {
  nearbyLocation = null;
  nearbySearchId += 1;
  nearbyLayers?.clearLayers();
});

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
renderLearningTemplates("Rwanda");
setAuthMode("signup");
decorateWelcomeButtons(document);
renderHeroSlides();
showHeroSlide(0);
startHeroSlideTimer();
refreshWelcomeAccount().catch(error => showToast(error.message));

if (new URLSearchParams(window.location.search).get("nearby") === "1") {
  window.history.replaceState(null, "", window.location.pathname);
  fetch("/api/me", { credentials: "same-origin" })
    .then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not check your sign-in status.");
      showNearbyDialog(result.user);
    })
    .catch(error => showToast(error.message));
}

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
    const openNearby = sessionStorage.getItem("reraOpenNearbyMap") === "1";
    sessionStorage.removeItem("reraOpenNearbyMap");
    window.location.assign(openNearby ? "/?nearby=1" : "/app.html");
  } catch (reason) {
    error.textContent = reason.message;
    error.hidden = false;
    submit.disabled = false;
    setButtonLabel(submit, authMode === "signup" ? "Create account" : "Sign in");
  }
});
