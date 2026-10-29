const curriculaByCountry = {
  Rwanda: ["REB", "Cambridge / IB"],
  Kenya: ["CBC", "8-4-4"],
  Uganda: ["UNEB"],
  Tanzania: ["NECTA"]
};
const officialCurriculumSources = [
  { title: "REB curriculum and learning resources", country: "Rwanda", curriculum: "REB", description: "Curriculum, teaching and learning resources from the Rwanda Education Board.", url: "https://www.reb.gov.rw/curriculum-teaching-learning-resources-department" },
  { title: "Cambridge International programmes", country: "Rwanda", curriculum: "Cambridge / IB", description: "Cambridge Pathway programmes and qualifications.", url: "https://www.cambridgeinternational.org/programmes-and-qualifications/" },
  { title: "International Baccalaureate programmes", country: "Rwanda", curriculum: "Cambridge / IB", description: "Official programme information from the International Baccalaureate.", url: "https://www.ibo.org/programmes/" },
  { title: "Kenya CBC curriculum", country: "Kenya", curriculum: "CBC", description: "Curriculum information from the Kenya Institute of Curriculum Development.", url: "https://kicd.ac.ke/" },
  { title: "Kenya 8-4-4 curriculum", country: "Kenya", curriculum: "8-4-4", description: "Curriculum and education resources from the Kenya Institute of Curriculum Development.", url: "https://kicd.ac.ke/" },
  { title: "UNEB examinations and assessment", country: "Uganda", curriculum: "UNEB", description: "Official information from the Uganda National Examinations Board.", url: "https://uneb.ac.ug/" },
  { title: "Uganda curriculum resources", country: "Uganda", curriculum: "UNEB", description: "Curriculum development and learning resources from the National Curriculum Development Centre.", url: "https://www.ncdc.go.ug/" },
  { title: "NECTA examinations and assessment", country: "Tanzania", curriculum: "NECTA", description: "Official information from the National Examinations Council of Tanzania.", url: "https://www.necta.go.tz/" },
  { title: "Tanzania curriculum resources", country: "Tanzania", curriculum: "NECTA", description: "Curriculum resources from the Tanzania Institute of Education.", url: "https://www.tie.go.tz/" }
].map(source => ({ ...source, kind: "curriculum", level: "All levels", subject: "All subjects" }));
const levels = ["Primary", "Secondary", "University"];
const $ = id => document.getElementById(id);
const app = $("app");
let currentUser;
let activeSection = "";
let students = [];
let families = [];
let requests = [];
let teachers = [];
let managers = [];
let pitches = [];
let resources = [];
let feedback = [];
let selectedRequestId = null;
let requestSubjectsSequence = 0;
let mapInstance = null;
let toastTimeout;
let learnerView = false;
let dashboardSlideIndex = 0;
let dashboardSlideTimer;
let dashboardSlidePaused = false;

const learningEnvironments = window.reraLearningEnvironments;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

function iconSvg(name) {
  const paths = {
    learner: `<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>`,
    search: `<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>`,
    book: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 16a2.5 2.5 0 0 1 2.5-2.5H20M8 7h7"/>`,
    location: `<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>`,
    refresh: `<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3"/>`,
    check: `<path d="m5 12 4 4L19 6"/>`,
    close: `<path d="m6 6 12 12M18 6 6 18"/>`,
    remove: `<path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/>`,
    save: `<path d="M5 3h12l4 4v14H3V3z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>`,
    arrow: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
    external: `<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>`,
    family: `<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M15 15a5 5 0 0 1 6 5"/>`,
    material: `<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>`,
    rating: `<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>`
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

function buttonIconName(button) {
  const action = button.dataset.action;
  if (action === "student-new" || action === "learner-view") return "learner";
  if (action === "request-new" || action === "view-request") return "search";
  if (action === "resource-new") return "material";
  if (action === "refresh-map") return "refresh";
  if (action === "verify" || action === "offer-accept") return "check";
  if (action === "offer-decline" || action === "resource-delete") return "remove";
  if (action === "teacher-location") return "location";
  if (action === "pitch") return "arrow";
  if (action === "feedback") return "rating";
  if (action === "parent-view") return "family";
  const text = button.textContent.trim().toLowerCase();
  if (text === "cancel" || text.includes("decline")) return "close";
  if (text.includes("save")) return "save";
  if (text.includes("search") || text.includes("tutor") || text.includes("recommend")) return "search";
  if (text.includes("location") || text.includes("pin")) return "location";
  if (text.includes("curriculum") || text.includes("material") || text.includes("pdf")) return "book";
  if (text.includes("accept") || text.includes("verify") || text.includes("submit")) return "check";
  if (text.includes("remove") || text.includes("delete")) return "remove";
  if (text.includes("refresh")) return "refresh";
  if (text.includes("learner")) return "learner";
  return "arrow";
}

function decorateButtons(root) {
  root.querySelectorAll("button:not(.close-icon):not(.icon-btn):not([data-icon-decorated]):not([data-dashboard-step]):not([data-dashboard-select]):not([data-dashboard-toggle])").forEach(button => {
    if (button.querySelector("svg")) {
      button.dataset.iconDecorated = "true";
      return;
    }
    button.prepend(iconSvg(buttonIconName(button)));
    button.dataset.iconDecorated = "true";
  });
}

function setButtonLabel(button, label) {
  const icon = button.querySelector(".button-icon");
  button.replaceChildren(...(icon ? [icon, document.createTextNode(label)] : [document.createTextNode(label)]));
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) {
    console.error("ReRa status notification is unavailable:", message);
    return;
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2700);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    if (response.status === 401) window.location.assign("/");
    throw new Error(data?.error || "The request could not be completed");
  }
  return data;
}

async function refreshData() {
  const me = await api("/api/me");
  if (!me?.user?.role) throw new Error("Your account could not be loaded.");
  currentUser = me.user;

  const tasks = ["/api/requests", "/api/resources"];
  if (currentUser.role === "parent") tasks.push("/api/students", "/api/pitches", "/api/feedback");
  if (currentUser.role === "teacher") tasks.push("/api/pitches", "/api/feedback");
  if (currentUser.role === "manager") tasks.push("/api/teachers", "/api/feedback", "/api/families", "/api/managers");
  const results = await Promise.all(tasks.map(path => api(path)));
  requests = results[0];
  resources = results[1];
  let cursor = 2;
  if (currentUser.role === "parent") {
    students = results[cursor++];
    pitches = results[cursor++];
    feedback = results[cursor];
  } else if (currentUser.role === "teacher") {
    pitches = results[cursor++];
    feedback = [];
  } else {
    teachers = results[cursor++];
    feedback = results[cursor];
    families = results[cursor + 1];
    managers = results[cursor + 2];
  }
}

function sectionsForUser() {
  if (currentUser.role === "manager") return ["Overview", "Families & learners", "Learning requests", "Educator network", "Material repository", "Curriculum repository"];
  if (currentUser.role === "teacher") return ["Teaching home", "Job offers", "My materials", "Teaching profile", "Curriculum repository"];
  return learnerView
    ? ["My learning", "My schedule", "Study materials", "Curriculum repository", "Feedback"]
    : ["Family overview", "Learners", "Learning requests", "Materials", "Curriculum repository", "Payments"];
}

function personaName() {
  if (currentUser.role === "manager") return "Manager";
  if (currentUser.role === "teacher") return "Educator";
  return learnerView ? "Learner" : "Parent";
}

function renderShell() {
  if (!activeSection || !sectionsForUser().includes(activeSection)) activeSection = sectionsForUser()[0];
  const initials = currentUser.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const persona = personaName();
  const sectionList = sectionsForUser();
  app.innerHTML = `<aside class="sidebar"><a class="logo" href="/"><span class="logo-symbol">R</span><span>ReRa<span class="logo-dot">.</span></span></a><div class="sidebar-identity"><div class="avatar">${escapeHtml(initials)}</div><div><strong>${escapeHtml(currentUser.name)}</strong><span>${escapeHtml(persona)}</span></div></div><p class="side-label">${escapeHtml(persona)} menu</p><nav class="side-nav" aria-label="${escapeHtml(persona)} menu">${sectionList.map(section => `<button class="${section === activeSection ? "active" : ""}" data-section="${escapeHtml(section)}" aria-label="${escapeHtml(section)}" title="${escapeHtml(section)}" aria-current="${section === activeSection ? "page" : "false"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${navIcon(section)}</svg>${escapeHtml(section)}</button>`).join("")}</nav><div class="sidebar-foot"><div class="region-card"><span>REGIONAL NETWORK</span><strong>${escapeHtml(currentUser.country)} · ${escapeHtml(currentUser.curriculum)}</strong><div class="region-flags"><span>RW</span><span>KE</span><span>UG</span><span>TZ</span></div></div></div></aside>
    <main class="app-main"><header class="topbar"><div class="account-identity"><div class="avatar">${escapeHtml(initials)}</div><div class="account-copy"><strong>${escapeHtml(currentUser.name)}</strong><span>${escapeHtml(persona)} · ${escapeHtml(activeSection)}</span></div></div><div class="top-actions">${currentUser.role === "parent" ? `<nav class="portal-switch" aria-label="Family or learner view"><button class="${learnerView ? "" : "active"}" data-action="parent-view">Family</button><button class="${learnerView ? "active" : ""}" data-action="learner-view">Learner</button></nav>` : `<span class="tag">${escapeHtml(persona)} portal</span>`}<button class="icon-btn" data-action="logout" aria-label="Sign out" title="Sign out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg></button></div></header><div class="app-content" id="pageContent">${renderRegionalCarousel()}${renderSection()}</div></main>`;
  decorateDashboardCards(app);
  decorateButtons(app);
  bindDynamicForms();
  bindResourceFilters();
  startDashboardCarousel();
  if (currentUser.role === "manager" && ["Overview", "Learning requests"].includes(activeSection)) setTimeout(initManagerMap, 40);
}

function decorateDashboardCards(root) {
  const iconForHeading = text => {
    const heading = text.toLowerCase();
    if (/map|location|area/.test(heading)) return `<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>`;
    if (/request|proposal|offer|job|match/.test(heading)) return `<path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><rect x="8" y="2" width="8" height="4" rx="1.5"/><path d="M8 12h8m-8 4h5"/>`;
    if (/educator|teacher|family|learner|profile|parent/.test(heading)) return `<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>`;
    if (/lesson|schedule|calendar/.test(heading)) return `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>`;
    if (/payment|secure|method/.test(heading)) return `<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20m-15 5h4"/>`;
    if (/material|curriculum|study|resource|library/.test(heading)) return `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 16a2.5 2.5 0 0 1 2.5-2.5H20M8 7h7"/>`;
    return `<path d="m12 3 2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z"/>`;
  };
  root.querySelectorAll(".panel-head h2, .info-card h3").forEach(title => {
    if (title.querySelector(".box-heading-icon")) return;
    const icon = document.createElement("span");
    icon.className = "box-heading-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${iconForHeading(title.textContent || "")}</svg>`;
    title.prepend(icon);
  });
}

function renderRegionalCarousel() {
  if (!Array.isArray(learningEnvironments) || !learningEnvironments.length) {
    throw new Error("Regional learning photos could not be loaded.");
  }
  dashboardSlideIndex = 0;
  const preferredIndex = learningEnvironments.findIndex(environment =>
    environment.country === currentUser.country &&
    environment.curriculum === currentUser.curriculum &&
    /home|online|computer|digital/i.test(environment.setting)
  );
  const firstLearningSetting = learningEnvironments.findIndex(environment =>
    /home|online|computer|digital/i.test(environment.setting)
  );
  const startIndex = preferredIndex >= 0 ? preferredIndex : firstLearningSetting;
  const environments = startIndex > 0
    ? [...learningEnvironments.slice(startIndex), ...learningEnvironments.slice(0, startIndex)]
    : learningEnvironments;
  const copy = learnerView
    ? "Learning plans shaped around your curriculum."
    : currentUser.role === "teacher"
      ? "Teaching opportunities rooted in local classrooms."
      : currentUser.role === "manager"
        ? "Connecting families and educators across the region."
        : "Learning plans shaped around your family's curriculum.";
  return `<section class="portal-hero" aria-label="Learning environments across East Africa">
    <div class="portal-hero-copy"><span class="portal-hero-kicker">Closer to home · ${escapeHtml(currentUser.country)}</span><h1>Learning, closer to home.</h1><p>${copy}</p><div class="educator-preview" data-educator-preview><button class="button portal-nearby-button" data-action="nearby-map" aria-expanded="false" aria-controls="portalEducatorPreview" aria-describedby="portalEducatorPreview">Find educators nearby ${iconSvg("arrow").outerHTML}</button><div class="educator-preview-card portal-educator-preview-card" id="portalEducatorPreview" role="tooltip" hidden><span class="educator-preview-kicker">HOW IT WORKS · SAMPLE MATCHES</span><strong class="educator-preview-title">Find a nearby educator</strong><div class="educator-preview-map" aria-hidden="true"><span class="preview-radius">10 km radius</span><span class="preview-map-pin pin-one">AM</span><span class="preview-map-pin pin-two">WN</span><span class="preview-map-pin pin-three">JM</span></div><div class="educator-preview-list"><div class="educator-preview-person selected"><span class="preview-avatar avatar-one">AM</span><span class="preview-person-copy"><strong>Amina Mukamana</strong><small>Kigali · Mathematics · 2.4 km</small></span><span class="preview-view">View</span></div><div class="educator-preview-person"><span class="preview-avatar avatar-two">WN</span><span class="preview-person-copy"><strong>Wanjiku Njeri</strong><small>Nairobi · English · 4.1 km</small></span><span class="preview-view">View</span></div><span class="preview-cursor"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M3 2v19l5-5 4 9 4-2-4-8h8L3 2z" fill="#30234d" stroke="#fff" stroke-width="1.5"/></svg></span></div><span class="educator-preview-caption">Choose a search radius (10 km by default), then select an educator to view their profile.</span></div></div></div>
    <div class="portal-carousel" role="region" aria-label="Regional learning environments" aria-roledescription="carousel">
      ${environments.map((environment, index) => `<article class="portal-slide ${index === 0 ? "active" : ""}" data-dashboard-slide aria-label="${index + 1} of ${environments.length}" aria-roledescription="slide" ${index === 0 ? "" : "aria-hidden=\"true\""}><img src="${escapeHtml(environment.image)}" alt="${escapeHtml(environment.alt)}" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}><span class="portal-curriculum-tag"><strong>${escapeHtml(environment.curriculum)}</strong><small>${escapeHtml(environment.country)} · ${escapeHtml(environment.setting)}</small></span><span class="portal-setting-label">${escapeHtml(environment.setting)}</span><span class="portal-photo-credit">Photo: ${environment.sourceUrl ? `<a href="${escapeHtml(environment.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(environment.attribution)}</a>` : escapeHtml(environment.attribution)} · ${environment.licenseUrl ? `<a href="${escapeHtml(environment.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(environment.license)}</a>` : escapeHtml(environment.license)}</span></article>`).join("")}
      <button class="portal-carousel-arrow previous" type="button" data-dashboard-step="-1" aria-label="Previous learning environment">‹</button>
      <button class="portal-carousel-arrow next" type="button" data-dashboard-step="1" aria-label="Next learning environment">›</button>
      <button class="portal-carousel-toggle" type="button" data-dashboard-toggle aria-label="${dashboardSlidePaused ? "Resume" : "Pause"} slideshow" aria-pressed="${dashboardSlidePaused}">${dashboardSlidePaused ? "▶" : "Ⅱ"}</button>
      <div class="portal-carousel-dots" role="group" aria-label="Choose a learning environment">${environments.map((environment, index) => `<button class="${index === 0 ? "selected" : ""}" type="button" data-dashboard-select="${index}" aria-label="Show ${escapeHtml(environment.setting)}: ${escapeHtml(environment.curriculum)} in ${escapeHtml(environment.country)}" title="${escapeHtml(environment.setting)}" aria-pressed="${index === 0}"></button>`).join("")}</div>
    </div>
  </section>`;
}

function showDashboardSlide(index) {
  const slides = [...document.querySelectorAll("[data-dashboard-slide]")];
  if (!slides.length) return;
  dashboardSlideIndex = (index + slides.length) % slides.length;
  slides.forEach((slide, slideIndex) => {
    const active = slideIndex === dashboardSlideIndex;
    slide.classList.toggle("active", active);
    slide.setAttribute("aria-hidden", String(!active));
  });
  document.querySelectorAll("[data-dashboard-select]").forEach((button, slideIndex) => {
    const active = slideIndex === dashboardSlideIndex;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function startDashboardCarousel() {
  clearInterval(dashboardSlideTimer);
  if (!dashboardSlidePaused && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    dashboardSlideTimer = setInterval(() => showDashboardSlide(dashboardSlideIndex + 1), 4200);
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

function navIcon(section) {
  if (["Overview", "Teaching home", "Family overview", "My learning"].includes(section)) {
    return `<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>`;
  }
  if (["Families & learners", "Educator network", "Learners"].includes(section)) {
    return `<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0m1-5a5 5 0 0 1 5 5"/>`;
  }
  if (["Learning requests", "Job offers"].includes(section)) {
    return `<path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><rect x="8" y="2" width="8" height="4" rx="1.5"/><path d="M8 12h8m-8 4h5"/>`;
  }
  if (["Material repository", "My materials", "Materials", "Study materials", "Curriculum repository"].includes(section)) {
    return `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 16a2.5 2.5 0 0 1 2.5-2.5H20M8 7h7"/>`;
  }
  if (["Teaching profile"].includes(section)) {
    return `<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>`;
  }
  if (["My schedule"].includes(section)) {
    return `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>`;
  }
  if (["Feedback"].includes(section)) {
    return `<path d="m12 3 2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z"/>`;
  }
  if (["Payments"].includes(section)) {
    return `<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20m-15 5h4"/>`;
  }
  return `<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>`;
}

function heading(title, subtitle, action = "") {
  return `<section class="page-heading"><div><div class="page-eyebrow">${escapeHtml(activeSection)} · ${escapeHtml(currentUser.country)}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</section>`;
}

function metric(label, value, note, icon) {
  return `<article class="metric"><div class="metric-label"><span>${label}</span><span class="metric-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${icon}</svg></span></div><div class="metric-value">${value}</div><div class="metric-sub">${note}</div></article>`;
}

function formatTeacherSubjects(subjects) {
  return subjects.map(value => {
    const [level, ...parts] = String(value).split("::");
    return parts.length ? `${parts.join("::")} (${level})` : value;
  }).join(", ");
}

function managerTeamPanel() {
  const canAddManager = managers.length < 3;
  return `<section class="panel"><div class="panel-head"><div><h2>Manager team</h2><p>${managers.length} of 3 manager accounts. Managers can add another manager until the limit is reached.</p></div>${canAddManager ? `<button class="button button-compact" data-action="manager-new">Add manager</button>` : `<span class="tag">Maximum reached</span>`}</div><div class="tutor-list">${managers.map(manager => `<div class="tutor-row"><span class="tutor-avatar">${initials(manager.name)}</span><div class="tutor-info"><strong>${escapeHtml(manager.name)}</strong><span>${escapeHtml(manager.email)}</span></div><span class="status verified">Manager</span></div>`).join("")}</div></section>`;
}

function managerView() {
  const matching = requests.filter(request => request.status === "Matching").length;
  const unverified = teachers.filter(teacher => !teacher.verified).length;
  const openCount = requests.length;
  const learnerCount = families.reduce((count, family) => count + family.learners.length, 0);
  const metrics = `<section class="metric-grid">${metric("Requests to match", matching, `${openCount} total family requests`, `<path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><rect x="8" y="2" width="8" height="4" rx="1.5"/><path d="M8 12h8"/>`)}${metric("Registered families", families.length, "Parent accounts", `<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>`)}${metric("Educators", teachers.length, `${unverified} awaiting review`, `<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>`)}${metric("Learners", learnerCount, "Mapped to parent accounts", `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>`)}</section>`;
  const requestOptions = requests.map(request => `<option value="${request.id}" ${String(request.id) === String(selectedRequestId || requests[0]?.id) ? "selected" : ""}>${escapeHtml(request.id)} · ${escapeHtml(request.location_label)} · ${escapeHtml(request.subject)}</option>`).join("");
  const requestRows = requests.map(request => `<tr><td class="tag">LR-${request.id}</td><td><strong>${escapeHtml(request.learner_name)}</strong><br><span>${escapeHtml(request.location_label)} · ${escapeHtml(request.country)}</span></td><td>${escapeHtml(request.curriculum)}</td><td>${escapeHtml(request.level)} · ${escapeHtml(request.grade)}</td><td><span class="tag">${escapeHtml(request.subject)}</span></td><td>${request.radius_km} km</td><td><span class="status ${escapeHtml(request.status.toLowerCase())}">${escapeHtml(request.status)}</span></td><td><button class="match-button" data-action="view-request" data-request="${request.id}">Qualified tutors</button></td></tr>`).join("");
  const matchingSteps = `<section class="manager-match-flow" aria-label="Manager-led matching workflow"><div><span>01</span><strong>Review the request</strong><small>Check subject, curriculum, level and lesson area.</small></div><div><span>02</span><strong>Shortlist &amp; pitch</strong><small>Choose a verified educator and send a private offer.</small></div><div><span>03</span><strong>Confirm the match</strong><small>After acceptance, ReRa coordinates the family introduction.</small></div></section>`;
  return `${heading("Coordinate the right match.", "ReRa managers are the trusted middle link: they verify educators, shortlist by learner needs and coordinate introductions.", `<button class="button button-compact" data-action="resource-new">Share material</button>`)}${managerTeamPanel()}${matchingSteps}${metrics}<section class="app-grid"><article class="panel"><div class="panel-head"><div><h2>Real educator locations</h2><p>Only verified, available educators who meet selected request criteria are shown.</p></div><span class="tag">OpenStreetMap</span></div><div class="map-actions"><select id="mapRequestSelect" class="form-control" aria-label="Choose map request">${requestOptions || "<option>No learning requests</option>"}</select><button class="button-light" data-action="refresh-map">Refresh pins</button></div><div class="map-container"><div id="managerMap" class="map" aria-label="Map of lesson request area and matching educators"></div></div><div class="map-key"><span><i class="map-dot request"></i>Lesson area, exact pin</span><span><i class="map-dot"></i>Verified tutor</span></div><div class="map-notice">Exact learner pins are visible only to authorized managers. Parents must grant location permission for in-person matching.</div></article><article class="panel"><div class="panel-head"><div><h2>Educator review</h2><p>New tutor accounts require manager verification.</p></div><span class="tag">${unverified} to review</span></div>${teachers.length ? teachers.map(teacher => `<div class="tutor-row"><span class="tutor-avatar">${initials(teacher.name)}</span><div class="tutor-info"><strong>${escapeHtml(teacher.name)}</strong><span>${escapeHtml(teacher.country)} · ${escapeHtml(teacher.curriculum)} · ${escapeHtml(formatTeacherSubjects(teacher.subjects))} · ${escapeHtml(teacher.levels.join(", "))}</span></div>${teacher.verified ? `<span class="status verified">Verified</span>` : `<button class="match-button" data-action="verify" data-teacher="${teacher.id}">Review & verify</button>`}</div>`).join("") : `<div class="empty">Tutor applications will appear here.</div>`}</article></section><section class="panel"><div class="panel-head"><div><h2>Learning requests</h2><p>Private learner records. Only managers can see precise lesson coordinates.</p></div><span class="tag">${requests.length} requests</span></div><div class="filter-row"><input class="form-control" id="managerSearch" type="search" placeholder="Search learner, neighborhood, subject"><select class="form-control" id="managerCountry"><option value="">All countries</option>${Object.keys(curriculaByCountry).map(country => `<option>${country}</option>`).join("")}</select><select class="form-control" id="managerLevel"><option value="">All levels</option>${levels.map(level => `<option>${level}</option>`).join("")}</select></div><div class="table-wrap"><table class="table"><thead><tr><th>Ref</th><th>Learner / neighborhood</th><th>Curriculum</th><th>Academic level</th><th>Subject</th><th>Radius</th><th>Status</th><th>Matching</th></tr></thead><tbody id="managerRows">${requestRows}</tbody></table>${requests.length ? "" : `<div class="empty">Family requests appear here after a parent creates an account and adds a learner.</div>`}</div></section>`;
}

function familyDirectoryView() {
  const cards = families.map(family => {
    const learnerCards = family.learners.map(learner => {
      const learnerRequests = requests.filter(request => String(request.parent_id) === String(family.id) && String(request.student_id) === String(learner.id));
      return `<div class="family-learner"><div><strong>${escapeHtml(learner.name)}</strong><span>${escapeHtml(learner.level)} · ${escapeHtml(learner.grade)} · ${escapeHtml(learner.country)} · ${escapeHtml(learner.curriculum)}</span></div>${learnerRequests.length ? learnerRequests.map(request => `<div class="family-request"><span>${escapeHtml(request.subject)} · ${escapeHtml(request.location_label)} · ${escapeHtml(request.status)}</span><button class="match-button" data-action="view-request" data-request="${request.id}">Recommend teachers</button></div>`).join("") : `<span class="family-no-request">No tutoring request yet</span>`}</div>`;
    }).join("");
    return `<article class="panel family-card" data-family-card data-search="${escapeHtml(`${family.name} ${family.email} ${family.learners.map(learner => learner.name).join(" ")}`.toLowerCase())}" data-country="${escapeHtml(family.country)}"><div class="panel-head"><div><h2>${escapeHtml(family.name)}</h2><p><a href="mailto:${escapeHtml(family.email)}">${escapeHtml(family.email)}</a></p></div><span class="tag">${escapeHtml(family.country)} · ${escapeHtml(family.curriculum)}</span></div><div class="family-learners">${learnerCards || `<div class="empty">No learner profiles have been added.</div>`}</div></article>`;
  }).join("");
  return `${heading("Families and learners.", "See each registered parent alongside their learners and open requests. Recommend qualified teachers from a learner's request.")}<section class="panel"><div class="filter-row"><input class="form-control" id="familySearch" type="search" placeholder="Search parent or learner"><select class="form-control" id="familyCountry"><option value="">All countries</option>${Object.keys(curriculaByCountry).map(country => `<option>${escapeHtml(country)}</option>`).join("")}</select><span class="tag">${families.length} families · ${families.reduce((count, family) => count + family.learners.length, 0)} learners</span></div><div class="family-directory">${cards || `<div class="empty">Registered parent accounts will appear here.</div>`}</div></section>`;
}

function initials(name) {
  return escapeHtml(String(name).split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase());
}

function parentView() {
  const action = `<button class="button button-compact" data-action="student-new">Add learner</button>`;
  const studentCards = students.length ? students.map(student => `<article class="info-card"><h3>${escapeHtml(student.name)}</h3><div class="big">${escapeHtml(student.level)} · ${escapeHtml(student.grade)}</div><p>${escapeHtml(student.country)} · ${escapeHtml(student.curriculum)}</p><button class="button-light request-add" data-action="request-new" data-student="${student.id}">Find a tutor</button></article>`).join("") : `<article class="info-card"><h3>Start with a learner profile</h3><p>Add a learner's country, curriculum and exact academic level. These criteria make tutor matches relevant.</p><button class="button-light request-add" data-action="student-new">Add learner</button></article>`;
  const requestRows = requests.map(request => `<div class="request-card"><div class="request-card-head"><strong>${escapeHtml(request.subject)} · ${escapeHtml(request.level)} ${escapeHtml(request.grade)}</strong><span class="status ${escapeHtml(request.status.toLowerCase())}">${escapeHtml(request.status)}</span></div><p>${escapeHtml(request.curriculum)} · ${escapeHtml(request.location_label)} · ${escapeHtml(request.mode)}</p><p>Preferred: ${escapeHtml(request.availability)}</p><div class="progress-track request-progress ${escapeHtml(request.status.toLowerCase())}"><span></span></div></div>`).join("");
  return `${heading("A little closer to their goals.", "Manage learners and tutoring requests for your family.", action)}<section class="info-grid">${studentCards}</section><section class="app-grid"><article class="panel"><div class="panel-head"><div><h2>Your learning requests</h2><p>Review matching progress and educator proposals.</p></div><span class="tag">${requests.length}</span></div>${requestRows || `<div class="empty">No learning requests yet. Add a learner profile to begin.</div>`}</article><article class="panel"><div class="panel-head"><div><h2>Educator proposals</h2><p>ReRa managers coordinate introductions.</p></div></div>${pitches.length ? pitches.map(pitch => `<div class="tutor-row"><span class="tutor-avatar">${initials(pitch.teacher_name)}</span><div class="tutor-info"><strong>${escapeHtml(pitch.teacher_name)} ${pitch.verified ? "· Verified" : "· Review pending"}</strong><span>${escapeHtml(pitch.country)} · ${escapeHtml(pitch.curriculum)} · ${escapeHtml(pitch.subjects.join(", "))}</span></div><span class="status ${escapeHtml(pitch.pitch_status.toLowerCase())}">${escapeHtml(pitch.pitch_status)}</span></div>`).join("") : `<div class="empty">When a manager proposes an educator, their profile appears here. Your address stays private until a match is confirmed.</div>`}</article></section><section class="app-grid"><article class="panel"><div class="panel-head"><div><h2>Upcoming lessons</h2><p>Confirmed sessions from your learning plans.</p></div></div><div class="empty">No confirmed sessions yet. A ReRa manager will coordinate the first session after you accept an educator match.</div></article><article class="panel"><div class="panel-head"><div><h2>Payment methods</h2><p>Mobile Money and card support</p></div></div><div class="privacy-note">Payment collection is not enabled in this local build. No payment details are requested or stored.</div></article></section>`;
}

function learnerViewPage() {
  const mainStudent = students[0];
  return `${heading(mainStudent ? `Learning space for ${escapeHtml(mainStudent.name)}.` : "Your learner space.", "A family-managed view of upcoming learning, resources and goals.")}<div class="privacy-note">This learner view uses your parent's family account. A separate child login is not enabled in this prototype.</div>${mainStudent ? `<section class="info-grid"><article class="info-card"><h3>Academic level</h3><div class="big">${escapeHtml(mainStudent.level)} · ${escapeHtml(mainStudent.grade)}</div><p>${escapeHtml(mainStudent.curriculum)} · ${escapeHtml(mainStudent.country)}</p></article><article class="info-card"><h3>Learning requests</h3><div class="big">${requests.length}</div><p>Requests managed by your family</p></article><article class="info-card"><h3>Study materials</h3><div class="big">${resources.length}</div><p>Resources for your curriculum</p></article></section>` : `<section class="panel"><div class="empty">Ask your parent or guardian to add a learner profile to this family account.</div></section>`}<section class="app-grid"><article class="panel"><div class="panel-head"><div><h2>My learning plan</h2><p>Requests and progress managed with your family.</p></div></div>${requests.length ? requests.map(request => `<div class="request-card"><div class="request-card-head"><strong>${escapeHtml(request.subject)} · ${escapeHtml(request.level)} ${escapeHtml(request.grade)}</strong><span class="status ${escapeHtml(request.status.toLowerCase())}">${escapeHtml(request.status)}</span></div><p>${escapeHtml(request.curriculum)} · ${escapeHtml(request.mode)} · ${escapeHtml(request.availability)}</p></div>`).join("") : `<div class="empty">Your learning plan will show here.</div>`}</article>${resourceRepository(resources, "curriculum", true)}</section>`;
}

function teacherView() {
  const offers = pitches.filter(pitch => pitch.pitch_status === "Offered");
  return `${heading(`Welcome, ${escapeHtml(currentUser.name)}.`, "Manage your teaching profile, nearby private offers and shared materials.", `<button class="button button-compact" data-action="teacher-location">Update my location</button>`)}<section class="info-grid"><article class="info-card"><h3>Application status</h3><div class="big">${currentUser.verified ? "Verified" : "In review"}</div><p>${currentUser.verified ? "Eligible for manager matching" : "A ReRa manager must verify your account before private offers can be matched."}</p></article><article class="info-card"><h3>Subjects</h3><div class="big">${escapeHtml(currentUser.subjects.join(", ") || "Not set")}</div><p>${escapeHtml(currentUser.levels.join(" · "))}</p></article><article class="info-card"><h3>Offers</h3><div class="big">${offers.length}</div><p>Private matching offers</p></article></section><section class="app-grid"><article class="panel"><div class="panel-head"><div><h2>Private job pipeline</h2><p>Family names and exact addresses stay hidden before acceptance.</p></div></div>${offers.length ? offers.map(offer => `<div class="offer-card"><div><strong>${escapeHtml(offer.subject)} · ${escapeHtml(offer.level)} ${escapeHtml(offer.grade)}</strong><p>${escapeHtml(offer.curriculum)} · ${escapeHtml(offer.country)} · ${escapeHtml(offer.location_label)}</p><p>${escapeHtml(offer.mode)} · ${escapeHtml(offer.availability)} · within ${offer.radius_km} km</p></div><div class="offer-actions"><button data-action="offer-accept" data-request="${offer.request_id}">Accept</button><button data-action="offer-decline" data-request="${offer.request_id}">Decline</button></div></div>`).join("") : `<div class="empty">No offers yet. Keep your profile accurate; a manager will contact you when your verified subjects and level fit a request.</div>`}</article><article class="panel"><div class="panel-head"><div><h2>Teaching area and availability</h2><p>Location is used for private matching only.</p></div></div><form id="teacherProfileForm" class="dialog-body"><div class="form-grid"><label class="field"><span>Maximum travel radius</span><select class="form-control" name="radius_km"><option value="5" ${currentUser.radius_km === 5 ? "selected" : ""}>5 km</option><option value="10" ${currentUser.radius_km === 10 ? "selected" : ""}>10 km</option><option value="20" ${currentUser.radius_km === 20 ? "selected" : ""}>20 km</option><option value="50" ${currentUser.radius_km === 50 ? "selected" : ""}>50 km</option></select></label><label class="field"><span>Availability</span><select class="form-control" name="available"><option value="true" ${currentUser.available ? "selected" : ""}>Available</option><option value="false" ${!currentUser.available ? "selected" : ""}>Pause new offers</option></select></label><div class="field full"><span>${currentUser.latitude == null ? "No precise location saved" : "Teaching location saved"}</span><span class="material-upload-note">Your precise coordinates are never shown to families.</span><input type="hidden" name="latitude" value="${currentUser.latitude ?? ""}"><input type="hidden" name="longitude" value="${currentUser.longitude ?? ""}"></div></div><div class="dialog-actions"><button class="button button-compact">Save teaching profile</button></div></form></article></section><section class="app-grid"><article class="panel"><div class="panel-head"><div><h2>My materials</h2><p>Share your own curriculum-aligned PDFs.</p></div><button class="text-button" data-action="resource-new">Add PDF</button></div>${resourceRepository(resources.filter(item => item.kind === "material"), "material", false)}</article>${resourceRepository(resources, "curriculum", true)}</section>`;
}

function resourceRepository(items, kind, officialOnly) {
  const title = kind === "curriculum" ? "Curriculum repository" : "Learning materials";
  const list = kind === "curriculum" ? officialCurriculumSources : items.filter(item => item.kind === kind);
  return `<article class="panel repository-panel ${kind === "curriculum" ? "curriculum-panel" : ""}"><div class="panel-head"><div><h2>${title}</h2><p>${kind === "curriculum" ? "Official curriculum and assessment sources. Search by country, curriculum or website address." : "PDF resources shared by ReRa educators."}</p></div>${!officialOnly && ["teacher", "manager"].includes(currentUser.role) ? `<button class="text-button" data-action="resource-new">Add PDF</button>` : ""}</div><div class="filter-row"><label class="repository-search"><span class="sr-only">Search ${kind === "curriculum" ? "curriculum sources" : "learning materials"}</span>${iconSvg("search").outerHTML}<input class="form-control" data-resource-search="${kind}" type="search" placeholder="${kind === "curriculum" ? "Search by country, curriculum or website…" : "Search learning materials…"}" autocomplete="off"></label><select class="form-control" data-resource-country="${kind}" aria-label="Filter by country"><option value="">All countries</option>${Object.keys(curriculaByCountry).map(country => `<option>${country}</option>`).join("")}</select><select class="form-control" data-resource-curriculum="${kind}" aria-label="Filter by curriculum"><option value="">All curricula</option>${Object.values(curriculaByCountry).flat().map(curriculum => `<option>${escapeHtml(curriculum)}</option>`).join("")}</select><span class="repository-count" data-resource-count="${kind}" aria-live="polite">${list.length} ${kind === "curriculum" ? "sources" : "materials"}</span></div><div class="resource-list ${kind === "curriculum" ? "curriculum-grid" : ""}" data-resource-list="${kind}">${list.length ? (kind === "curriculum" ? list.map(curriculumSourceCard).join("") : list.map(resourceCard).join("")) : `<div class="empty">No ${kind === "curriculum" ? "curriculum references" : "materials"} found.</div>`}</div><div class="empty repository-empty" data-resource-empty="${kind}" hidden>No matching ${kind === "curriculum" ? "curriculum sources" : "materials"} found. Try another search or filter.</div></article>`;
}

function resourceCard(resource) {
  return `<div class="resource-card" data-resource-card data-title="${escapeHtml(`${resource.title} ${resource.description} ${resource.country} ${resource.curriculum} ${resource.level} ${resource.subject}`.toLowerCase())}" data-country="${escapeHtml(resource.country)}" data-curriculum="${escapeHtml(resource.curriculum)}"><div><strong>${escapeHtml(resource.title)}</strong><span>${escapeHtml(resource.country)} · ${escapeHtml(resource.curriculum)} · ${escapeHtml(resource.level)} · ${escapeHtml(resource.subject)}</span><span>${escapeHtml(resource.description)}${resource.author ? ` · ${escapeHtml(resource.author)}` : ""}</span></div>${resource.download_url ? `<a href="${escapeHtml(resource.download_url)}">Download</a>` : `<a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">Official site ↗</a>`}${resource.can_delete ? `<button data-action="resource-delete" data-resource="${resource.id}" aria-label="Remove ${escapeHtml(resource.title)}">Remove</button>` : ""}</div>`;
}

function curriculumSourceCard(source) {
  const searchable = `${source.title} ${source.description} ${source.country} ${source.curriculum} ${source.url}`.toLowerCase();
  return `<article class="resource-card curriculum-card" data-resource-card data-title="${escapeHtml(searchable)}" data-country="${escapeHtml(source.country)}" data-curriculum="${escapeHtml(source.curriculum)}"><div class="resource-card-copy"><strong>${escapeHtml(source.title)}</strong><span class="resource-meta">${escapeHtml(source.country)} · ${escapeHtml(source.curriculum)}</span><span class="resource-description">${escapeHtml(source.description)}</span><a class="source-address" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${iconSvg("external").outerHTML}<span>${escapeHtml(source.url)}</span></a></div></article>`;
}

function otherSectionView() {
  if (currentUser.role === "manager") {
    if (activeSection === "Families & learners") return familyDirectoryView();
    if (activeSection === "Learning requests") return `${managerView()}`;
    if (activeSection === "Educator network") return `${heading("Educator network.", "Review educator profiles and verification before matching.")}<section class="panel"><div class="tutor-list">${teachers.length ? teachers.map(teacher => `<div class="tutor-row"><span class="tutor-avatar">${initials(teacher.name)}</span><div class="tutor-info"><strong>${escapeHtml(teacher.name)}</strong><span>${escapeHtml(teacher.country)} · ${escapeHtml(teacher.curriculum)} · ${escapeHtml(teacher.levels.join(", "))} · ${escapeHtml(formatTeacherSubjects(teacher.subjects))}</span></div>${teacher.verified ? `<span class="status verified">Verified</span>` : `<button class="match-button" data-action="verify" data-teacher="${teacher.id}">Review & verify</button>`}</div>`).join("") : `<div class="empty">No educator accounts yet.</div>`}</div></section>`;
    if (activeSection === "Material repository") return `${heading("A shared library for learning.", "PDF materials published by verified educators.", `<button class="button button-compact" data-action="resource-new">Share material</button>`)}${resourceRepository(resources, "material", false)}`;
    if (activeSection === "Curriculum repository") return `${heading("Curricula, by country.", "Official sources for the learning systems ReRa supports.")}${resourceRepository(resources, "curriculum", true)}`;
  }
  if (currentUser.role === "teacher") {
    if (activeSection === "Job offers") return teacherView();
    if (activeSection === "Teaching profile") return teacherView();
    if (activeSection === "My materials") return `${heading("Materials you share.", "Upload PDF resources aligned to the curricula you teach.", `<button class="button button-compact" data-action="resource-new">Add PDF</button>`)}${resourceRepository(resources, "material", false)}`;
    if (activeSection === "Curriculum repository") return `${heading("Teach to the local syllabus.", "Browse official country and curriculum references.")}${resourceRepository(resources, "curriculum", true)}`;
  }
  if (learnerView) {
    if (activeSection === "Curriculum repository") return `${heading("Your curriculum.", "Official sources and study guidance for your school system.")}${resourceRepository(resources, "curriculum", true)}`;
    if (activeSection === "Study materials") return `${heading("Your resource locker.", "Materials shared by your matched educators.")}${resourceRepository(resources, "material", true)}`;
    if (activeSection === "Feedback") return feedbackSection();
    if (activeSection === "My schedule") return `${heading("Your learning schedule.", "Upcoming lessons will appear here after a match is confirmed.")}<section class="panel"><div class="empty">There are no confirmed lessons to show yet.</div></section>`;
    return learnerViewPage();
  }
  if (activeSection === "Learners") return `${heading("Learner profiles.", "Manage academic context for your family.", `<button class="button button-compact" data-action="student-new">Add learner</button>`)}<section class="info-grid">${students.map(student => `<article class="info-card"><h3>${escapeHtml(student.name)}</h3><div class="big">${escapeHtml(student.level)} · ${escapeHtml(student.grade)}</div><p>${escapeHtml(student.country)} · ${escapeHtml(student.curriculum)}</p><button class="button-light request-add" data-action="request-new" data-student="${student.id}">Find a tutor</button></article>`).join("") || `<article class="info-card"><h3>No learner profiles yet</h3><p>Add a learner to begin finding local academic support.</p><button class="button-light request-add" data-action="student-new">Add learner</button></article>`}</section>`;
  if (activeSection === "Learning requests") return `${heading("Learning requests.", "Track your family's educator matches.", `<button class="button button-compact" data-action="request-new">Find a tutor</button>`)}${parentView()}`;
  if (activeSection === "Materials") return `${heading("Learning materials.", "Browse resources shared by your matched educators.")}${resourceRepository(resources, "material", true)}`;
  if (activeSection === "Curriculum repository") return `${heading("Curriculum repository.", "Official sources for local curricula.")}${resourceRepository(resources, "curriculum", true)}`;
  if (activeSection === "Payments") return `${heading("Secure payments.", "Mobile Money and card collection will be added with a payment provider.")}<section class="panel"><div class="privacy-note">Payment collection is not enabled in this local build. No payment details are requested or stored.</div></section>`;
  if (activeSection === "My schedule") return `${heading("Your learning schedule.", "A family-managed view of upcoming sessions.")}<section class="panel"><div class="empty">No confirmed sessions are scheduled yet.</div></section>`;
  return parentView();
}

function feedbackSection() {
  return `${heading("How was your last lesson?", "Share a family-managed rating after a completed session.")}<section class="panel"><div class="empty">Feedback will be available after a completed tutoring session. (A completed-session record is not yet part of this local prototype.)</div></section>`;
}

function renderSection() {
  if (currentUser.role === "manager") return activeSection === "Overview" ? managerView() : otherSectionView();
  if (currentUser.role === "teacher") return activeSection === "Teaching home" ? teacherView() : otherSectionView();
  if (learnerView) return activeSection === "My learning" ? learnerViewPage() : otherSectionView();
  return activeSection === "Family overview" ? parentView() : otherSectionView();
}

async function updateResourceSubjects(form) {
  const requestId = Number(form.dataset.subjectsRequest || 0) + 1;
  form.dataset.subjectsRequest = String(requestId);
  const country = form.elements.country.value;
  const curriculum = form.elements.curriculum.value;
  const level = form.elements.level.value;
  const select = form.elements.subject;
  const allSubjects = level === "All levels";
  const result = await api(`/api/subjects?country=${encodeURIComponent(country)}&curriculum=${encodeURIComponent(curriculum)}`);
  if (Number(form.dataset.subjectsRequest) !== requestId) return;
  const options = allSubjects ? [...new Set(Object.values(result).flat())] : result[level] || [];
  select.replaceChildren(new Option("All subjects", "All subjects"));
  options.forEach(subject => select.add(new Option(subject, subject)));
}

function bindDynamicForms() {
  document.querySelectorAll(".country-select").forEach(countrySelect => {
    if (countrySelect.dataset.curriculumBound === "true") return;
    countrySelect.dataset.curriculumBound = "true";
    const form = countrySelect.closest("form");
    const curriculumSelect = form.querySelector(".curriculum-select");
    const resourceForm = form.id === "materialForm";
    const update = () => {
      curriculumSelect.innerHTML = curriculaByCountry[countrySelect.value].map(item => `<option>${escapeHtml(item)}</option>`).join("");
      if (resourceForm) updateResourceSubjects(form).catch(error => showToast(error.message));
    };
    countrySelect.addEventListener("change", update);
    if (resourceForm) {
      curriculumSelect.addEventListener("change", () => updateResourceSubjects(form).catch(error => showToast(error.message)));
      form.elements.level.addEventListener("change", () => updateResourceSubjects(form).catch(error => showToast(error.message)));
      form.addEventListener("reset", () => setTimeout(update, 0));
    }
    update();
  });
}

function render() {
  renderShell();
}

function startLocationRequest(onSuccess, onFailure) {
  if (!navigator.geolocation) return onFailure("This browser does not support location sharing.");
  navigator.geolocation.getCurrentPosition(position => onSuccess(position.coords.latitude, position.coords.longitude), error => {
    onFailure(error.code === error.PERMISSION_DENIED ? "Location permission was denied. You can choose online lessons instead." : "Could not get your location. Check location services and try again.");
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

function initManagerMap() {
  const mapNode = $("managerMap");
  const requestSelect = $("mapRequestSelect");
  if (!mapNode || !window.L) return;
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  mapInstance = L.map(mapNode, { scrollWheelZoom: false }).setView([-1.95, 30.06], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(mapInstance);
  if (requestSelect && requestSelect.value) selectedRequestId = Number(requestSelect.value);
  drawManagerPins();
  requestSelect?.addEventListener("change", () => {
    selectedRequestId = Number(requestSelect.value);
    drawManagerPins();
  });
}

async function drawManagerPins() {
  if (!mapInstance || !selectedRequestId) return;
  try {
    const response = await api(`/api/coordinates?request_id=${selectedRequestId}`);
    const points = response.points;
    const group = L.featureGroup();
    points.forEach(point => {
      const color = point.type === "request" ? "#df775f" : "#176b52";
      const marker = L.circleMarker([point.latitude, point.longitude], { radius: point.type === "request" ? 9 : 7, color, fillColor: color, fillOpacity: .88, weight: 2 }).bindPopup(escapeHtml(point.label));
      group.addLayer(marker);
    });
    if (points.some(point => point.type === "request")) {
      const request = points.find(point => point.type === "request");
      group.addLayer(L.circle([request.latitude, request.longitude], { radius: response.request.radius_km * 1000, color: "#9dbb9f", weight: 1, fillOpacity: .07 }));
    }
    group.addTo(mapInstance);
    if (points.length) mapInstance.fitBounds(group.getBounds().pad(.18), { maxZoom: 14 });
    else mapInstance.setView([-1.95, 30.06], 10);
  } catch (error) { showToast(error.message); }
}

function requestMatches(request) {
  return teachers.filter(teacher => {
    if (!teacher.verified || !teacher.available) return false;
    if (teacher.country !== request.country || teacher.curriculum !== request.curriculum) return false;
    const subjects = teacher.subject_keys || teacher.subjects;
    if (!teacher.levels.includes(request.level)
      || (!subjects.includes(`${request.level}::${request.subject}`) && !subjects.includes(request.subject))) return false;
    if (request.latitude != null && teacher.latitude != null) {
      const km = distanceKm(request.latitude, request.longitude, teacher.latitude, teacher.longitude);
      if (km > request.radius_km || km > teacher.radius_km) return false;
    } else if (request.mode === "In person") return false;
    return true;
  });
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = degrees => degrees * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function viewMatches(requestId) {
  const request = requests.find(item => String(item.id) === String(requestId));
  if (!request) return;
  const matched = requestMatches(request);
  const detail = $("detailDialog");
  $("detailTitle").textContent = `Educators for ${request.subject}`;
  $("detailBody").innerHTML = `<p class="privacy-note">Tutor offers include curriculum, level, subject and a general area only. The learner's name and exact location are never shared before confirmation.</p>${matched.length ? `<div class="tutor-list">${matched.map(teacher => `<div class="tutor-row"><span class="tutor-avatar">${initials(teacher.name)}</span><div class="tutor-info"><strong>${escapeHtml(teacher.name)} · Verified</strong><span>${escapeHtml(teacher.curriculum)} · ${escapeHtml(teacher.levels.join(", "))} · ${escapeHtml(teacher.subjects.join(", "))}</span><span>${teacher.latitude == null ? "Online / location not shared" : "Within requested travel radius"}</span></div><button class="match-button" data-action="pitch" data-request="${request.id}" data-teacher="${teacher.id}">Pitch privately</button></div>`).join("")}</div>` : `<div class="empty">No verified and available educator currently meets every criterion for this request. Verify a qualified educator, widen the radius, or suggest online lessons.</div>`}`;
  decorateButtons($("detailBody"));
  detail.showModal();
}

function openDialog(id) {
  const dialog = $(id);
  if (dialog) dialog.showModal();
}

function fillStudentOptions(selectedId) {
  const select = $("requestStudent");
  select.innerHTML = students.map(student => `<option value="${student.id}" ${String(student.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(student.name)} · ${escapeHtml(student.level)} ${escapeHtml(student.grade)} · ${escapeHtml(student.curriculum)}</option>`).join("");
}

async function updateRequestSubjects() {
  const student = students.find(item => String(item.id) === $("requestStudent").value);
  const select = $("requestSubject");
  const sequence = ++requestSubjectsSequence;
  select.replaceChildren();
  if (!student) return;
  const result = await api(`/api/subjects?country=${encodeURIComponent(student.country)}&curriculum=${encodeURIComponent(student.curriculum)}`);
  if (sequence !== requestSubjectsSequence) return;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a subject";
  placeholder.disabled = true;
  placeholder.selected = true;
  select.append(placeholder);
  (result[student.level] || []).forEach(subject => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    select.append(option);
  });
}

function getCoordinates(form, success, failure) {
  const latitude = form.elements.latitude?.value;
  const longitude = form.elements.longitude?.value;
  if (latitude && longitude) return success(Number(latitude), Number(longitude));
  startLocationRequest(success, failure);
}

async function submitRequest(form) {
  const data = new FormData(form);
  const mode = data.get("mode");
  const create = async (latitude, longitude) => {
    const body = Object.fromEntries(data.entries());
    body.latitude = latitude;
    body.longitude = longitude;
    try {
      await api("/api/requests", { method: "POST", body: JSON.stringify(body) });
      $("requestDialog").close();
      form.reset();
      await refreshData();
      activeSection = "Learning requests";
      render();
      showToast("Learning request saved. ReRa managers can now find a match.");
    } catch (error) { showToast(error.message); }
  };
  if (mode === "Online") return create(null, null);
  if (mode === "Either") {
    const lat = data.get("latitude");
    const lon = data.get("longitude");
    if (lat && lon) return create(Number(lat), Number(lon));
    return create(null, null);
  }
  const button = $("pinRequestLocation");
  button.disabled = true;
  setButtonLabel(button, "Requesting location permission…");
  getCoordinates(form, (latitude, longitude) => {
    button.disabled = false;
    setButtonLabel(button, "Pin lesson area with my location");
    create(latitude, longitude);
  }, message => {
    button.disabled = false;
    setButtonLabel(button, "Pin lesson area with my location");
    $("requestPinStatus").textContent = message;
    showToast(message);
  });
}

async function updateTeacherLocation() {
  showToast("Allow location access to place your private tutor pin.");
  startLocationRequest(async (latitude, longitude) => {
    try {
      await api("/api/teacher/profile", { method: "POST", body: JSON.stringify({ latitude, longitude, radius_km: currentUser.radius_km, available: currentUser.available }) });
      await refreshData();
      render();
      showToast("Your teaching location is saved privately.");
    } catch (error) { showToast(error.message); }
  }, showToast);
}

function bindResourceFilters() {
  document.querySelectorAll("[data-resource-search]").forEach(input => input.addEventListener("input", () => {
    const kind = input.dataset.resourceSearch;
    const country = document.querySelector(`[data-resource-country="${kind}"]`)?.value || "";
    const curriculum = document.querySelector(`[data-resource-curriculum="${kind}"]`)?.value || "";
    let visibleCount = 0;
    document.querySelectorAll(`[data-resource-list="${kind}"] [data-resource-card]`).forEach(card => {
      const matches = card.dataset.title.includes(input.value.toLowerCase()) && (!country || card.dataset.country === country) && (!curriculum || card.dataset.curriculum === curriculum);
      card.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    const count = document.querySelector(`[data-resource-count="${kind}"]`);
    if (count) count.textContent = `${visibleCount} ${kind === "curriculum" ? "sources" : "materials"}`;
    const empty = document.querySelector(`[data-resource-empty="${kind}"]`);
    if (empty) empty.hidden = visibleCount > 0;
  }));
  document.querySelectorAll("[data-resource-country], [data-resource-curriculum]").forEach(select => select.addEventListener("change", () => {
    const search = document.querySelector(`[data-resource-search="${select.dataset.resourceCountry || select.dataset.resourceCurriculum}"]`);
    search?.dispatchEvent(new Event("input"));
  }));
}

async function handleAction(action) {
  const name = action.dataset.action;
  try {
    if (name === "logout") {
      await api("/api/logout", { method: "POST", body: "{}" });
      window.location.assign("/");
    } else if (name === "parent-view" || name === "learner-view") {
      learnerView = name === "learner-view";
      activeSection = sectionsForUser()[0];
      render();
    } else if (name === "student-new") {
      openDialog("studentDialog");
    } else if (name === "request-new") {
      if (!students.length) return showToast("Add a learner profile before making a tutoring request.");
      fillStudentOptions(action.dataset.student || students[0].id);
      await updateRequestSubjects();
      openDialog("requestDialog");
    } else if (name === "manager-new") {
      if (managers.length >= 3) return showToast("ReRa supports a maximum of three manager accounts.");
      openDialog("managerDialog");
    } else if (name === "resource-new") {
      openDialog("materialDialog");
    } else if (name === "view-request") {
      await viewMatches(action.dataset.request);
    } else if (name === "refresh-map") {
      await drawManagerPins();
      showToast("Map pins refreshed from current verified matches.");
    } else if (name === "verify") {
      if (!window.confirm("Confirm that this educator has completed ReRa's identity and qualification review?")) return;
      await api(`/api/teachers/${action.dataset.teacher}/verify`, { method: "POST", body: "{}" });
      await refreshData();
      render();
      showToast("Educator verified and eligible for matching.");
    } else if (name === "pitch") {
      await api(`/api/requests/${action.dataset.request}/pitch`, { method: "POST", body: JSON.stringify({ teacher_id: Number(action.dataset.teacher) }) });
      $("detailDialog").close();
      await refreshData();
      render();
      showToast("Private tutor offer sent. Family details remain hidden.");
    } else if (name === "offer-accept" || name === "offer-decline") {
      const actionName = name === "offer-accept" ? "accept" : "decline";
      await api(`/api/pitches/${action.dataset.request}/${actionName}`, { method: "POST", body: "{}" });
      await refreshData();
      render();
      showToast(actionName === "accept" ? "Offer accepted. ReRa will coordinate the introduction." : "Offer declined. The family remains private.");
    } else if (name === "teacher-location") {
      await updateTeacherLocation();
    } else if (name === "resource-delete") {
      if (!window.confirm("Remove this material from the repository?")) return;
      await api(`/api/resources/${action.dataset.resource}`, { method: "DELETE" });
      await refreshData();
      render();
      showToast("Material removed.");
    } else if (name === "feedback") {
      await api("/api/feedback", { method: "POST", body: JSON.stringify({ request_id: Number(action.dataset.request), rating: Number(action.dataset.rating) }) });
      await refreshData();
      render();
      showToast("Thank you for sharing feedback.");
    } else if (name === "nearby-map") {
      window.location.assign("/?nearby=1");
    }
  } catch (error) { showToast(error.message); }
}

function locateRequestArea() {
  const form = $("requestForm");
  const button = $("pinRequestLocation");
  button.disabled = true;
  setButtonLabel(button, "Waiting for location permission…");
  startLocationRequest((latitude, longitude) => {
    form.elements.latitude.value = latitude;
    form.elements.longitude.value = longitude;
    button.disabled = false;
    setButtonLabel(button, "Lesson area pinned");
    $("requestPinStatus").textContent = "Pinned. Only ReRa managers can see this precise point until your match is confirmed.";
  }, message => {
    button.disabled = false;
    setButtonLabel(button, "Pin lesson area with my location");
    $("requestPinStatus").textContent = message;
  });
}

function bindForms() {
  $("studentForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) {
      showToast("The learner form is unavailable. Reload the page and try again.");
      return;
    }
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      await api("/api/students", { method: "POST", body: JSON.stringify(body) });
      const dialog = $("studentDialog");
      if (dialog?.open) dialog.close();
      const learnerForm = $("studentForm");
      if (learnerForm instanceof HTMLFormElement) HTMLFormElement.prototype.reset.call(learnerForm);
      await refreshData();
      render();
      showToast("Learner profile saved to your family account.");
    } catch (error) {
      console.error("Could not save learner profile:", error);
      showToast(error.message || "Could not save the learner profile. Please try again.");
    }
  });
  $("requestForm")?.addEventListener("submit", event => { event.preventDefault(); submitRequest(event.currentTarget); });
  $("requestStudent")?.addEventListener("change", () => updateRequestSubjects().catch(error => showToast(error.message)));
  $("managerForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    if (password !== data.get("password_confirm")) return showToast("Manager passwords do not match.");
    const button = form.querySelector("button.button");
    button.disabled = true;
    try {
      await api("/api/managers", {
        method: "POST",
        body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password }),
      });
      $("managerDialog").close();
      form.reset();
      await refreshData();
      render();
      showToast("Manager account created. They can now sign in.");
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });
  $("pinRequestLocation")?.addEventListener("click", locateRequestArea);
  $("materialForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.file.files[0];
    if (!file || file.type !== "application/pdf" || file.size > 5 * 1024 * 1024) return showToast("Choose a PDF file no larger than 5 MB.");
    const button = form.querySelector("button.button");
    button.disabled = true;
    setButtonLabel(button, "Publishing…");
    try {
      const base64 = await fileToBase64(file);
      const data = new FormData(form);
      const body = Object.fromEntries(data.entries());
      delete body.file;
      body.file_base64 = base64;
      await api("/api/resources", { method: "POST", body: JSON.stringify(body) });
      $("materialDialog").close();
      form.reset();
      await refreshData();
      render();
      showToast("PDF added to the learning materials repository.");
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; setButtonLabel(button, "Publish material"); }
  });
  $("teacherProfileForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const latitude = data.get("latitude");
    const longitude = data.get("longitude");
    try {
      await api("/api/teacher/profile", { method: "POST", body: JSON.stringify({ radius_km: Number(data.get("radius_km")), available: data.get("available") === "true", latitude: latitude ? Number(latitude) : null, longitude: longitude ? Number(longitude) : null }) });
      await refreshData();
      render();
      showToast("Teaching profile updated.");
    } catch (error) { showToast(error.message); }
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

function bindGlobalEvents() {
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
  document.addEventListener("click", event => {
    const dashboardToggle = event.target.closest("[data-dashboard-toggle]");
    if (dashboardToggle) {
      dashboardSlidePaused = !dashboardSlidePaused;
      dashboardToggle.textContent = dashboardSlidePaused ? "▶" : "Ⅱ";
      dashboardToggle.setAttribute("aria-label", dashboardSlidePaused ? "Resume slideshow" : "Pause slideshow");
      dashboardToggle.setAttribute("aria-pressed", String(dashboardSlidePaused));
      startDashboardCarousel();
    }
    const dashboardStep = event.target.closest("[data-dashboard-step]");
    if (dashboardStep) {
      showDashboardSlide(dashboardSlideIndex + Number(dashboardStep.dataset.dashboardStep));
      startDashboardCarousel();
    }
    const dashboardSelect = event.target.closest("[data-dashboard-select]");
    if (dashboardSelect) {
      showDashboardSlide(Number(dashboardSelect.dataset.dashboardSelect));
      startDashboardCarousel();
    }
    const close = event.target.closest("[data-close]");
    if (close) $(close.dataset.close).close();
    const nav = event.target.closest(".side-nav [data-section]");
    if (nav) {
      activeSection = nav.dataset.section;
      render();
    }
    const action = event.target.closest("[data-action]");
    if (action) handleAction(action);
  });
  document.addEventListener("input", event => {
    if (event.target.id === "managerSearch" || event.target.id === "managerCountry" || event.target.id === "managerLevel") {
      const search = $("managerSearch")?.value.toLowerCase() || "";
      const country = $("managerCountry")?.value || "";
      const level = $("managerLevel")?.value || "";
      document.querySelectorAll("#managerRows tr").forEach(row => {
        const text = row.textContent.toLowerCase();
        const matchesCountry = !country || text.includes(country.toLowerCase());
        const matchesLevel = !level || text.includes(level.toLowerCase());
        row.hidden = !text.includes(search) || !matchesCountry || !matchesLevel;
      });
    }
    if (event.target.id === "familySearch" || event.target.id === "familyCountry") {
      const search = $("familySearch")?.value.toLowerCase() || "";
      const country = $("familyCountry")?.value || "";
      document.querySelectorAll("[data-family-card]").forEach(card => {
        card.hidden = !card.dataset.search.includes(search) || Boolean(country && card.dataset.country !== country);
      });
    }
  });
  document.addEventListener("change", event => {
    if (["managerCountry", "managerLevel", "familyCountry"].includes(event.target.id)) event.target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function start() {
  bindForms();
  bindGlobalEvents();
  decorateButtons(document);
  try {
    await refreshData();
    render();
  } catch (error) {
    app.innerHTML = `<main class="app-main"><div class="app-content"><h1>ReRa is having trouble loading.</h1><p>${escapeHtml(error.message)}</p><a class="button" href="/">Return to welcome page</a></div></main>`;
  }
}

start();
