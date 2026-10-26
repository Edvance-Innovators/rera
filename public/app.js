const curriculaByCountry = {
  Rwanda: ["REB", "Cambridge / IB"],
  Kenya: ["CBC", "8-4-4"],
  Uganda: ["UNEB"],
  Tanzania: ["NECTA"]
};
const levels = ["Primary", "Secondary", "University"];
const $ = id => document.getElementById(id);
const app = $("app");
let currentUser;
let activeSection = "";
let students = [];
let families = [];
let requests = [];
let teachers = [];
let pitches = [];
let resources = [];
let feedback = [];
let selectedRequestId = null;
let mapInstance = null;
let toastTimeout;
let learnerView = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
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
  if (currentUser.role === "manager") tasks.push("/api/teachers", "/api/feedback", "/api/families");
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
  }
}

function sectionsForUser() {
  if (currentUser.role === "manager") return ["Overview", "Families & learners", "Learning requests", "Educator network", "Material repository", "Curriculum repository"];
  if (currentUser.role === "teacher") return ["Teaching home", "Job offers", "My materials", "Teaching profile", "Curriculum repository"];
  return learnerView
    ? ["My learning", "My schedule", "Study materials", "Curriculum repository", "Feedback"]
    : ["Family overview", "Learners", "Learning requests", "Materials", "Curriculum repository", "Payments"];
}

function renderShell() {
  if (!activeSection || !sectionsForUser().includes(activeSection)) activeSection = sectionsForUser()[0];
  const initials = currentUser.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  app.innerHTML = `<aside class="sidebar"><a class="logo" href="/"><span class="logo-symbol">R</span><span>ReRa<span class="logo-dot">.</span></span></a><p class="side-label">${escapeHtml(currentUser.role)} space</p><nav class="side-nav" aria-label="Main navigation">${sectionsForUser().map((section, index) => `<button class="${section === activeSection ? "active" : ""}" data-section="${escapeHtml(section)}" aria-current="${section === activeSection ? "page" : "false"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${navIcon(index)}</svg>${escapeHtml(section)}</button>`).join("")}</nav><div class="sidebar-foot"><div class="region-card"><span>REGIONAL NETWORK</span><strong>${escapeHtml(currentUser.country)} · ${escapeHtml(currentUser.curriculum)}</strong><div class="region-flags"><span>RW</span><span>KE</span><span>UG</span><span>TZ</span></div></div><div class="profile"><div class="avatar">${escapeHtml(initials)}</div><div><strong>${escapeHtml(currentUser.name)}</strong><span>${escapeHtml(currentUser.role)} account</span></div></div></div></aside>
    <main class="app-main"><header class="topbar"><div class="crumb">ReRa <span aria-hidden="true">/</span> <strong>${escapeHtml(activeSection)}</strong></div><div class="top-actions">${currentUser.role === "parent" ? `<nav class="portal-switch" aria-label="Family or learner view"><button class="${learnerView ? "" : "active"}" data-action="parent-view">Family</button><button class="${learnerView ? "active" : ""}" data-action="learner-view">Learner</button></nav>` : `<span class="tag">${escapeHtml(currentUser.role)} portal</span>`}<button class="icon-btn" data-action="logout" aria-label="Sign out" title="Sign out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg></button></div></header><div class="app-content" id="pageContent">${renderSection()}</div></main>`;
  bindDynamicForms();
  bindResourceFilters();
  if (currentUser.role === "manager" && ["Overview", "Learning requests"].includes(activeSection)) setTimeout(initManagerMap, 40);
}

function navIcon(index) {
  const icons = [
    `<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>`,
    `<path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><rect x="8" y="2" width="8" height="4" rx="1.5"/><path d="M8 12h8"/>`,
    `<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>`,
    `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>`,
    `<path d="M3 3v18h18"/><path d="m7 14 4-4 4 3 6-7"/>`
  ];
  return icons[index % icons.length];
}

function heading(title, subtitle, action = "") {
  return `<section class="page-heading"><div><div class="page-eyebrow">${escapeHtml(activeSection)} · ${escapeHtml(currentUser.country)}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</section>`;
}

function metric(label, value, note, icon) {
  return `<article class="metric"><div class="metric-label"><span>${label}</span><span class="metric-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${icon}</svg></span></div><div class="metric-value">${value}</div><div class="metric-sub">${note}</div></article>`;
}

function managerView() {
  const matching = requests.filter(request => request.status === "Matching").length;
  const unverified = teachers.filter(teacher => !teacher.verified).length;
  const openCount = requests.length;
  const learnerCount = families.reduce((count, family) => count + family.learners.length, 0);
  const metrics = `<section class="metric-grid">${metric("Requests to match", matching, `${openCount} total family requests`, `<path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><rect x="8" y="2" width="8" height="4" rx="1.5"/><path d="M8 12h8"/>`)}${metric("Registered families", families.length, "Parent accounts", `<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>`)}${metric("Educators", teachers.length, `${unverified} awaiting review`, `<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>`)}${metric("Learners", learnerCount, "Mapped to parent accounts", `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>`)}</section>`;
  const requestOptions = requests.map(request => `<option value="${request.id}" ${String(request.id) === String(selectedRequestId || requests[0]?.id) ? "selected" : ""}>${escapeHtml(request.id)} · ${escapeHtml(request.location_label)} · ${escapeHtml(request.subject)}</option>`).join("");
  const requestRows = requests.map(request => `<tr><td class="tag">LR-${request.id}</td><td><strong>${escapeHtml(request.learner_name)}</strong><br><span>${escapeHtml(request.location_label)} · ${escapeHtml(request.country)}</span></td><td>${escapeHtml(request.curriculum)}</td><td>${escapeHtml(request.level)} · ${escapeHtml(request.grade)}</td><td><span class="tag">${escapeHtml(request.subject)}</span></td><td>${request.radius_km} km</td><td><span class="status ${escapeHtml(request.status.toLowerCase())}">${escapeHtml(request.status)}</span></td><td><button class="match-button" data-action="view-request" data-request="${request.id}">Qualified tutors</button></td></tr>`).join("");
  return `${heading("Coordinate the right match.", "Requests, verified educators and learner context in one private workspace.", `<button class="button button-compact" data-action="resource-new">Share material</button>`)}${metrics}<section class="app-grid"><article class="panel"><div class="panel-head"><div><h2>Real educator locations</h2><p>Only verified, available educators who meet selected request criteria are shown.</p></div><span class="tag">OpenStreetMap</span></div><div class="map-actions"><select id="mapRequestSelect" class="form-control" aria-label="Choose map request">${requestOptions || "<option>No learning requests</option>"}</select><button class="button-light" data-action="refresh-map">Refresh pins</button></div><div class="map-container"><div id="managerMap" class="map" aria-label="Map of lesson request area and matching educators"></div></div><div class="map-key"><span><i class="map-dot request"></i>Lesson area, exact pin</span><span><i class="map-dot"></i>Verified tutor</span></div><div class="map-notice">Exact learner pins are visible only to authorized managers. Parents must grant location permission for in-person matching.</div></article><article class="panel"><div class="panel-head"><div><h2>Educator review</h2><p>New tutor accounts require manager verification.</p></div><span class="tag">${unverified} to review</span></div>${teachers.length ? teachers.map(teacher => `<div class="tutor-row"><span class="tutor-avatar">${initials(teacher.name)}</span><div class="tutor-info"><strong>${escapeHtml(teacher.name)}</strong><span>${escapeHtml(teacher.country)} · ${escapeHtml(teacher.curriculum)} · ${escapeHtml(teacher.subjects.join(", "))} · ${escapeHtml(teacher.levels.join(", "))}</span></div>${teacher.verified ? `<span class="status verified">Verified</span>` : `<button class="match-button" data-action="verify" data-teacher="${teacher.id}">Review & verify</button>`}</div>`).join("") : `<div class="empty">Tutor applications will appear here.</div>`}</article></section><section class="panel"><div class="panel-head"><div><h2>Learning requests</h2><p>Private learner records. Only managers can see precise lesson coordinates.</p></div><span class="tag">${requests.length} requests</span></div><div class="filter-row"><input class="form-control" id="managerSearch" type="search" placeholder="Search learner, neighborhood, subject"><select class="form-control" id="managerCountry"><option value="">All countries</option>${Object.keys(curriculaByCountry).map(country => `<option>${country}</option>`).join("")}</select><select class="form-control" id="managerLevel"><option value="">All levels</option>${levels.map(level => `<option>${level}</option>`).join("")}</select></div><div class="table-wrap"><table class="table"><thead><tr><th>Ref</th><th>Learner / neighborhood</th><th>Curriculum</th><th>Academic level</th><th>Subject</th><th>Radius</th><th>Status</th><th>Matching</th></tr></thead><tbody id="managerRows">${requestRows}</tbody></table>${requests.length ? "" : `<div class="empty">Family requests appear here after a parent creates an account and adds a learner.</div>`}</div></section>`;
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
  return String(name).split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
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
  const list = items.filter(item => item.kind === kind);
  return `<article class="panel"><div class="panel-head"><div><h2>${title}</h2><p>${kind === "curriculum" ? "Official national curriculum references and study guides." : "PDF resources shared by ReRa educators."}</p></div>${!officialOnly && ["teacher", "manager"].includes(currentUser.role) ? `<button class="text-button" data-action="resource-new">Add PDF</button>` : ""}</div><div class="filter-row"><input class="form-control" data-resource-search="${kind}" type="search" placeholder="Search ${kind === "curriculum" ? "curricula" : "materials"}"><select class="form-control" data-resource-country="${kind}"><option value="">All countries</option>${Object.keys(curriculaByCountry).map(country => `<option>${country}</option>`).join("")}</select><select class="form-control" data-resource-curriculum="${kind}"><option value="">All curricula</option>${Object.values(curriculaByCountry).flat().map(curriculum => `<option>${escapeHtml(curriculum)}</option>`).join("")}</select></div><div class="resource-list" data-resource-list="${kind}">${list.length ? list.map(resourceCard).join("") : `<div class="empty">No ${kind === "curriculum" ? "curriculum references" : "materials"} found.</div>`}</div></article>`;
}

function resourceCard(resource) {
  return `<div class="resource-card" data-resource-card data-title="${escapeHtml(`${resource.title} ${resource.description} ${resource.country} ${resource.curriculum} ${resource.level} ${resource.subject}`.toLowerCase())}" data-country="${escapeHtml(resource.country)}" data-curriculum="${escapeHtml(resource.curriculum)}"><div><strong>${escapeHtml(resource.title)}</strong><span>${escapeHtml(resource.country)} · ${escapeHtml(resource.curriculum)} · ${escapeHtml(resource.level)} · ${escapeHtml(resource.subject)}</span><span>${escapeHtml(resource.description)}${resource.author ? ` · ${escapeHtml(resource.author)}` : ""}</span></div>${resource.download_url ? `<a href="${escapeHtml(resource.download_url)}">Download</a>` : `<a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">Official site ↗</a>`}${resource.can_delete ? `<button data-action="resource-delete" data-resource="${resource.id}" aria-label="Remove ${escapeHtml(resource.title)}">Remove</button>` : ""}</div>`;
}

function otherSectionView() {
  if (currentUser.role === "manager") {
    if (activeSection === "Families & learners") return familyDirectoryView();
    if (activeSection === "Learning requests") return `${managerView()}`;
    if (activeSection === "Educator network") return `${heading("Educator network.", "Review educator profiles and verification before matching.")}<section class="panel"><div class="tutor-list">${teachers.length ? teachers.map(teacher => `<div class="tutor-row"><span class="tutor-avatar">${initials(teacher.name)}</span><div class="tutor-info"><strong>${escapeHtml(teacher.name)}</strong><span>${escapeHtml(teacher.country)} · ${escapeHtml(teacher.curriculum)} · ${escapeHtml(teacher.levels.join(", "))} · ${escapeHtml(teacher.subjects.join(", "))}</span></div>${teacher.verified ? `<span class="status verified">Verified</span>` : `<button class="match-button" data-action="verify" data-teacher="${teacher.id}">Review & verify</button>`}</div>`).join("") : `<div class="empty">No educator accounts yet.</div>`}</div></section>`;
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

function bindDynamicForms() {
  document.querySelectorAll(".country-select").forEach(countrySelect => {
    const form = countrySelect.closest("form");
    const curriculumSelect = form.querySelector(".curriculum-select");
    const update = () => {
      curriculumSelect.innerHTML = curriculaByCountry[countrySelect.value].map(item => `<option>${escapeHtml(item)}</option>`).join("");
    };
    countrySelect.addEventListener("change", update);
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
    if (!teacher.levels.includes(request.level) || !teacher.subjects.includes(request.subject)) return false;
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
  button.textContent = "Requesting location permission…";
  getCoordinates(form, (latitude, longitude) => {
    button.disabled = false;
    button.textContent = "Pin lesson area with my location";
    create(latitude, longitude);
  }, message => {
    button.disabled = false;
    button.textContent = "Pin lesson area with my location";
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
    document.querySelectorAll(`[data-resource-list="${kind}"] [data-resource-card]`).forEach(card => {
      const matches = card.dataset.title.includes(input.value.toLowerCase()) && (!country || card.dataset.country === country) && (!curriculum || card.dataset.curriculum === curriculum);
      card.hidden = !matches;
    });
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
      openDialog("requestDialog");
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
    }
  } catch (error) { showToast(error.message); }
}

function locateRequestArea() {
  const form = $("requestForm");
  const button = $("pinRequestLocation");
  button.disabled = true;
  button.textContent = "Waiting for location permission…";
  startLocationRequest((latitude, longitude) => {
    form.elements.latitude.value = latitude;
    form.elements.longitude.value = longitude;
    button.disabled = false;
    button.textContent = "Lesson area pinned";
    $("requestPinStatus").textContent = "Pinned. Only ReRa managers can see this precise point until your match is confirmed.";
  }, message => {
    button.disabled = false;
    button.textContent = "Pin lesson area with my location";
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
  $("pinRequestLocation")?.addEventListener("click", locateRequestArea);
  $("materialForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.file.files[0];
    if (!file || file.type !== "application/pdf" || file.size > 5 * 1024 * 1024) return showToast("Choose a PDF file no larger than 5 MB.");
    const button = form.querySelector("button.button");
    button.disabled = true;
    button.textContent = "Publishing…";
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
    finally { button.disabled = false; button.textContent = "Publish material"; }
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
  document.addEventListener("click", event => {
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
  try {
    await refreshData();
    render();
  } catch (error) {
    app.innerHTML = `<main class="app-main"><div class="app-content"><h1>ReRa is having trouble loading.</h1><p>${escapeHtml(error.message)}</p><a class="button" href="/">Return to welcome page</a></div></main>`;
  }
}

start();
