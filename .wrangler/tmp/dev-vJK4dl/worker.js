var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var ReraStore = class {
  static {
    __name(this, "ReraStore");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    await this.state.blockConcurrencyWhile(async () => {
      this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        country TEXT NOT NULL,
        curriculum TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        verification_token TEXT,
        created_at TEXT NOT NULL
      )`);
      const columns = this.state.storage.sql.exec("PRAGMA table_info(users)").toArray();
      if (!columns.some((column) => column.name === "verification_expires_at")) {
        this.state.storage.sql.exec("ALTER TABLE users ADD COLUMN verification_expires_at TEXT");
      }
      const userColumns = this.state.storage.sql.exec("PRAGMA table_info(users)").toArray();
      const userColumnNames = new Set(userColumns.map((column) => column.name));
      for (const [name, definition] of [
        ["subjects", "TEXT NOT NULL DEFAULT '[]'"],
        ["levels", "TEXT NOT NULL DEFAULT '[]'"],
        ["latitude", "REAL"],
        ["longitude", "REAL"],
        ["radius_km", "INTEGER NOT NULL DEFAULT 10"],
        ["available", "INTEGER NOT NULL DEFAULT 1"],
        ["verified", "INTEGER NOT NULL DEFAULT 0"]
      ]) {
        if (!userColumnNames.has(name)) this.state.storage.sql.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
      }
      this.state.storage.sql.exec(
        `UPDATE users
        SET verification_expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+48 hours')
        WHERE email_verified = 0 AND verification_token IS NOT NULL AND verification_expires_at IS NULL`
      );
      this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL
      )`);
      this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        country TEXT NOT NULL,
        curriculum TEXT NOT NULL,
        level TEXT NOT NULL,
        grade TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`);
      this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS learning_requests (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        country TEXT NOT NULL,
        curriculum TEXT NOT NULL,
        level TEXT NOT NULL,
        grade TEXT NOT NULL,
        subject TEXT NOT NULL,
        location_label TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        radius_km INTEGER NOT NULL,
        mode TEXT NOT NULL,
        availability TEXT NOT NULL,
        goal TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Matching',
        created_at TEXT NOT NULL
      )`);
      this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS pitches (
        request_id INTEGER NOT NULL,
        teacher_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Offered',
        created_at TEXT NOT NULL,
        PRIMARY KEY (request_id, teacher_id)
      )`);
      this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        kind TEXT NOT NULL,
        country TEXT NOT NULL,
        curriculum TEXT NOT NULL,
        level TEXT NOT NULL,
        subject TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        url TEXT,
        owner_id INTEGER,
        created_at TEXT NOT NULL
      )`);
      this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY,
        request_id INTEGER NOT NULL,
        parent_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE(request_id, parent_id)
      )`);
    });
    await deleteExpiredUnverifiedAccounts(this.state);
    await scheduleVerificationCleanup(this.state);
    try {
      return await handleStoreRequest(request, this.state, this.env);
    } catch (error) {
      if (error instanceof ApiError) return response({ error: error.message }, error.status);
      console.error("ReRa request failed", error);
      return response({ error: "The request could not be completed" }, 500);
    }
  }
  async alarm() {
    await deleteExpiredUnverifiedAccounts(this.state);
    await scheduleVerificationCleanup(this.state);
  }
};
var VERIFICATION_TTL_MS = 48 * 60 * 60 * 1e3;
var COUNTRIES = /* @__PURE__ */ new Set(["Rwanda", "Kenya", "Uganda", "Tanzania"]);
var CURRICULA = {
  Rwanda: /* @__PURE__ */ new Set(["REB", "Cambridge / IB"]),
  Kenya: /* @__PURE__ */ new Set(["CBC", "8-4-4"]),
  Uganda: /* @__PURE__ */ new Set(["UNEB"]),
  Tanzania: /* @__PURE__ */ new Set(["NECTA"])
};
var LEVELS = /* @__PURE__ */ new Set(["Primary", "Secondary", "University"]);
var ApiError = class extends Error {
  static {
    __name(this, "ApiError");
  }
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
};
function rows(state, query, ...values) {
  return state.storage.sql.exec(query, ...values).toArray();
}
__name(rows, "rows");
function requireUser(request, state, roles = []) {
  const user = currentUser(request, state);
  if (!user) return { error: response({ error: "Please sign in to continue" }, 401) };
  if (roles.length && !roles.includes(user.role)) return { error: response({ error: "This action is not available for your account" }, 403) };
  return { user };
}
__name(requireUser, "requireUser");
function validCoordinates(latitude, longitude) {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && Number(latitude) >= -90 && Number(latitude) <= 90 && Number(longitude) >= -180 && Number(longitude) <= 180;
}
__name(validCoordinates, "validCoordinates");
function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = /* @__PURE__ */ __name((degrees) => degrees * Math.PI / 180, "radians");
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
__name(distanceKm, "distanceKm");
function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
__name(parseArray, "parseArray");
async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new ApiError("Request body must be a valid JSON object");
  }
}
__name(readJson, "readJson");
function listFamilies(state) {
  const result = rows(state, `SELECT u.id AS parent_id, u.name AS parent_name, u.email AS parent_email,
    u.country AS parent_country, u.curriculum AS parent_curriculum, u.created_at AS parent_created_at,
    s.id AS student_id, s.name AS student_name, s.country AS student_country,
    s.curriculum AS student_curriculum, s.level AS student_level, s.grade AS student_grade
    FROM users u LEFT JOIN students s ON s.parent_id = u.id
    WHERE u.role = 'parent' ORDER BY u.created_at DESC, u.id, s.id`);
  const families = /* @__PURE__ */ new Map();
  for (const row of result) {
    if (!families.has(row.parent_id)) {
      families.set(row.parent_id, {
        id: row.parent_id,
        name: row.parent_name,
        email: row.parent_email,
        country: row.parent_country,
        curriculum: row.parent_curriculum,
        created_at: row.parent_created_at,
        learners: []
      });
    }
    if (row.student_id != null) {
      families.get(row.parent_id).learners.push({
        id: row.student_id,
        name: row.student_name,
        country: row.student_country,
        curriculum: row.student_curriculum,
        level: row.student_level,
        grade: row.student_grade
      });
    }
  }
  return [...families.values()];
}
__name(listFamilies, "listFamilies");
function matchingTeachers(state, request) {
  const candidates = rows(state, `SELECT id, name, country, curriculum, subjects, levels, latitude, longitude,
    radius_km, available, verified FROM users WHERE role = 'teacher' AND verified = 1 AND available = 1
    AND country = ? AND curriculum = ?`, request.country, request.curriculum);
  return candidates.filter((teacher) => {
    if (!parseArray(teacher.levels).includes(request.level) || !parseArray(teacher.subjects).includes(request.subject)) return false;
    if (request.latitude != null && teacher.latitude != null) {
      const distance = distanceKm(request.latitude, request.longitude, teacher.latitude, teacher.longitude);
      return distance <= request.radius_km && distance <= teacher.radius_km;
    }
    return request.mode !== "In person";
  });
}
__name(matchingTeachers, "matchingTeachers");
function getStoreData(request, state, url) {
  const access = requireUser(request, state);
  if (access.error) return access.error;
  const user = access.user;
  if (url.pathname === "/api/families") {
    if (user.role !== "manager") return response({ error: "Manager access required" }, 403);
    return response(listFamilies(state));
  }
  if (url.pathname === "/api/students") {
    if (user.role !== "parent") return response([]);
    return response(rows(state, "SELECT id, name, country, curriculum, level, grade FROM students WHERE parent_id = ? ORDER BY id", user.id));
  }
  if (url.pathname === "/api/teachers") {
    if (user.role !== "manager") return response({ error: "Manager access required" }, 403);
    return response(rows(state, `SELECT id, name, country, curriculum, subjects, levels, latitude, longitude, radius_km,
      available, verified FROM users WHERE role = 'teacher' ORDER BY verified DESC, name`).map((teacher) => ({
      ...teacher,
      subjects: parseArray(teacher.subjects),
      levels: parseArray(teacher.levels),
      available: Boolean(teacher.available),
      verified: Boolean(teacher.verified)
    })));
  }
  if (url.pathname === "/api/requests") {
    if (user.role === "manager") {
      return response(rows(state, `SELECT r.*, s.name AS learner_name FROM learning_requests r
        JOIN students s ON s.id = r.student_id ORDER BY r.created_at DESC`));
    }
    if (user.role === "parent") {
      return response(rows(state, `SELECT r.*, s.name AS learner_name FROM learning_requests r
        JOIN students s ON s.id = r.student_id WHERE r.parent_id = ? ORDER BY r.created_at DESC`, user.id));
    }
    return response(rows(state, `SELECT r.id, r.country, r.curriculum, r.level, r.grade, r.subject, r.location_label,
      r.radius_km, r.mode, r.availability, r.goal, r.status, r.created_at, p.status AS pitch_status
      FROM pitches p JOIN learning_requests r ON r.id = p.request_id
      WHERE p.teacher_id = ? AND p.status IN ('Offered', 'Accepted') ORDER BY p.created_at DESC`, user.id));
  }
  if (url.pathname === "/api/resources") return response([]);
  if (url.pathname === "/api/pitches") {
    if (user.role === "teacher") {
      return response(rows(state, `SELECT p.request_id, p.status AS pitch_status, r.country, r.curriculum, r.level,
        r.grade, r.subject, r.location_label, r.radius_km, r.mode, r.availability, r.goal
        FROM pitches p JOIN learning_requests r ON r.id = p.request_id
        WHERE p.teacher_id = ? ORDER BY p.created_at DESC`, user.id));
    }
    if (user.role === "parent") {
      return response(rows(state, `SELECT p.request_id, p.status AS pitch_status, u.name AS teacher_name,
        u.country, u.curriculum, u.subjects, u.verified FROM pitches p
        JOIN learning_requests r ON r.id = p.request_id JOIN users u ON u.id = p.teacher_id
        WHERE r.parent_id = ? ORDER BY p.created_at DESC`, user.id).map((pitch) => ({
        ...pitch,
        subjects: parseArray(pitch.subjects),
        verified: Boolean(pitch.verified)
      })));
    }
    return response([]);
  }
  if (url.pathname === "/api/feedback") {
    if (user.role === "manager") return response(rows(state, "SELECT request_id, rating, comment, created_at FROM feedback ORDER BY created_at DESC"));
    if (user.role === "parent") return response(rows(state, "SELECT request_id, rating, comment, created_at FROM feedback WHERE parent_id = ? ORDER BY created_at DESC", user.id));
    return response([]);
  }
  if (url.pathname === "/api/coordinates") {
    if (user.role !== "manager") return response({ error: "Manager access required" }, 403);
    const requestId = Number(url.searchParams.get("request_id"));
    if (!Number.isInteger(requestId)) return response({ error: "Select a valid learning request" }, 400);
    const learningRequest = rows(state, "SELECT * FROM learning_requests WHERE id = ?", requestId)[0];
    if (!learningRequest) return response({ error: "Learning request not found" }, 404);
    const points = [];
    if (learningRequest.latitude != null) points.push({
      type: "request",
      latitude: learningRequest.latitude,
      longitude: learningRequest.longitude,
      label: "Lesson area"
    });
    for (const teacher of matchingTeachers(state, learningRequest)) {
      if (teacher.latitude != null) points.push({
        type: "teacher",
        id: teacher.id,
        latitude: teacher.latitude,
        longitude: teacher.longitude,
        label: teacher.name
      });
    }
    return response({
      points,
      request: {
        id: learningRequest.id,
        country: learningRequest.country,
        location_label: learningRequest.location_label,
        radius_km: learningRequest.radius_km
      }
    });
  }
  return response({ error: "API route not found" }, 404);
}
__name(getStoreData, "getStoreData");
async function postStoreData(request, state, url) {
  const access = requireUser(request, state, url.pathname === "/api/students" || url.pathname === "/api/requests" || url.pathname === "/api/feedback" ? ["parent"] : []);
  if (access.error) return access.error;
  const user = access.user;
  const body = await readJson(request);
  if (url.pathname === "/api/students") {
    const name = String(body.name || "").trim();
    const country = String(body.country || user.country);
    const curriculum = String(body.curriculum || user.curriculum);
    const level = String(body.level || "");
    const grade = String(body.grade || "").trim();
    if (!name || name.length > 80 || !COUNTRIES.has(country) || !CURRICULA[country].has(curriculum) || !LEVELS.has(level) || !grade || grade.length > 50) {
      return response({ error: "Complete the learner name, country, curriculum, level, and grade" }, 400);
    }
    state.storage.sql.exec(
      "INSERT INTO students(parent_id, name, country, curriculum, level, grade, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      user.id,
      name,
      country,
      curriculum,
      level,
      grade,
      (/* @__PURE__ */ new Date()).toISOString()
    );
    const id = state.storage.sql.exec("SELECT last_insert_rowid() AS id").one()?.id;
    if (id == null) throw new Error("Could not retrieve the new learner ID");
    return response({ id, name }, 201);
  }
  if (url.pathname === "/api/requests") {
    const studentId = Number(body.student_id);
    const radius = Number(body.radius_km || 10);
    if (!Number.isInteger(studentId) || ![5, 10, 20, 50].includes(radius)) return response({ error: "Choose a learner and a valid search radius" }, 400);
    const student = rows(state, "SELECT * FROM students WHERE id = ? AND parent_id = ?", studentId, user.id)[0];
    if (!student) return response({ error: "Choose a learner in your family account" }, 400);
    const subject = String(body.subject || "").trim();
    const location = String(body.location || "").trim();
    const mode = String(body.mode || "In person");
    if (!subject || subject.length > 80 || !location || location.length > 120) return response({ error: "Add a subject and neighborhood or town" }, 400);
    if (!["In person", "Online", "Either"].includes(mode)) return response({ error: "Choose a valid lesson format and radius" }, 400);
    let latitude = body.latitude;
    let longitude = body.longitude;
    if (mode === "In person" && !validCoordinates(latitude, longitude)) return response({ error: "Allow location access or choose online lessons" }, 400);
    if (mode === "Online" || !validCoordinates(latitude, longitude)) latitude = longitude = null;
    state.storage.sql.exec(
      `INSERT INTO learning_requests
      (parent_id, student_id, country, curriculum, level, grade, subject, location_label, latitude, longitude,
       radius_km, mode, availability, goal, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      studentId,
      student.country,
      student.curriculum,
      student.level,
      student.grade,
      subject,
      location,
      latitude,
      longitude,
      radius,
      mode,
      String(body.availability || "Flexible").slice(0, 80),
      String(body.goal || "").trim().slice(0, 1e3),
      (/* @__PURE__ */ new Date()).toISOString()
    );
    const id = state.storage.sql.exec("SELECT last_insert_rowid() AS id").one()?.id;
    if (id == null) throw new Error("Could not retrieve the new learning request ID");
    return response({ id, status: "Matching" }, 201);
  }
  if (url.pathname === "/api/teacher/profile") {
    if (user.role !== "teacher") return response({ error: "This action is not available for your account" }, 403);
    const radius = Number(body.radius_km || 10);
    if (![5, 10, 20, 50].includes(radius)) return response({ error: "Choose a 5, 10, 20 or 50 km radius" }, 400);
    const { latitude, longitude } = body;
    if (latitude == null !== (longitude == null) || latitude != null && !validCoordinates(latitude, longitude)) {
      return response({ error: "Location coordinates are invalid" }, 400);
    }
    state.storage.sql.exec(
      "UPDATE users SET latitude = ?, longitude = ?, radius_km = ?, available = ? WHERE id = ?",
      latitude == null ? null : Number(latitude),
      longitude == null ? null : Number(longitude),
      radius,
      body.available === false ? 0 : 1,
      user.id
    );
    return response({ ok: true });
  }
  if (url.pathname === "/api/feedback") {
    const rating = Number(body.rating);
    const requestId = Number(body.request_id);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return response({ error: "Choose a rating from 1 to 5" }, 400);
    if (!rows(state, "SELECT id FROM learning_requests WHERE id = ? AND parent_id = ?", requestId, user.id).length) {
      return response({ error: "That learning request is not in your family account" }, 400);
    }
    state.storage.sql.exec(
      `INSERT INTO feedback(request_id, parent_id, rating, comment, created_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(request_id, parent_id) DO UPDATE SET rating = excluded.rating,
      comment = excluded.comment, created_at = excluded.created_at`,
      requestId,
      user.id,
      rating,
      String(body.comment || "").trim().slice(0, 1e3),
      (/* @__PURE__ */ new Date()).toISOString()
    );
    return response({ ok: true }, 201);
  }
  return response({ error: "API route not found" }, 404);
}
__name(postStoreData, "postStoreData");
function verifyTeacher(request, state, teacherId) {
  const access = requireUser(request, state, ["manager"]);
  if (access.error) return access.error;
  const cursor = state.storage.sql.exec("UPDATE users SET verified = 1 WHERE id = ? AND role = 'teacher'", teacherId);
  if (!cursor.rowsWritten) return response({ error: "Educator not found" }, 404);
  return response({ ok: true });
}
__name(verifyTeacher, "verifyTeacher");
function createPitch(request, state, requestId) {
  const access = requireUser(request, state, ["manager"]);
  if (access.error) return access.error;
  const bodyPromise = readJson(request);
  return bodyPromise.then((body) => {
    const teacherId = Number(body.teacher_id);
    const learningRequest = rows(state, "SELECT * FROM learning_requests WHERE id = ?", requestId)[0];
    if (!learningRequest || !Number.isInteger(teacherId)) return response({ error: "Request or educator not found" }, 400);
    const candidates = matchingTeachers(state, learningRequest);
    if (!candidates.some((teacher) => teacher.id === teacherId)) {
      return response({ error: "This educator does not currently meet all request criteria" }, 400);
    }
    state.storage.sql.exec(
      "INSERT OR IGNORE INTO pitches(request_id, teacher_id, created_at) VALUES (?, ?, ?)",
      requestId,
      teacherId,
      (/* @__PURE__ */ new Date()).toISOString()
    );
    state.storage.sql.exec("UPDATE learning_requests SET status = 'Pitched' WHERE id = ?", requestId);
    return response({ ok: true }, 201);
  });
}
__name(createPitch, "createPitch");
function updatePitch(request, state, requestId, action) {
  const access = requireUser(request, state, ["teacher"]);
  if (access.error) return access.error;
  const status = action === "accept" ? "Accepted" : "Declined";
  const cursor = state.storage.sql.exec(
    "UPDATE pitches SET status = ? WHERE request_id = ? AND teacher_id = ? AND status = 'Offered'",
    status,
    requestId,
    access.user.id
  );
  if (!cursor.rowsWritten) return response({ error: "Offer not found or already answered" }, 404);
  if (action === "accept") state.storage.sql.exec("UPDATE learning_requests SET status = 'Matched' WHERE id = ?", requestId);
  return response({ ok: true, status });
}
__name(updatePitch, "updatePitch");
async function deleteExpiredUnverifiedAccounts(state) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const expired = state.storage.sql.exec(
    "SELECT id FROM users WHERE email_verified = 0 AND verification_token IS NOT NULL AND verification_expires_at <= ?",
    now
  ).toArray();
  for (const user of expired) {
    state.storage.sql.exec("DELETE FROM sessions WHERE user_id = ?", user.id);
    state.storage.sql.exec("DELETE FROM users WHERE id = ?", user.id);
  }
}
__name(deleteExpiredUnverifiedAccounts, "deleteExpiredUnverifiedAccounts");
async function scheduleVerificationCleanup(state) {
  const next = state.storage.sql.exec(
    "SELECT MIN(verification_expires_at) AS expires_at FROM users WHERE email_verified = 0 AND verification_token IS NOT NULL"
  ).toArray()[0]?.expires_at;
  if (next) {
    await state.storage.setAlarm(Date.parse(next));
  } else {
    await state.storage.deleteAlarm();
  }
}
__name(scheduleVerificationCleanup, "scheduleVerificationCleanup");
function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex, "bytesToHex");
function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
}
__name(hexToBytes, "hexToBytes");
async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" }, key, 256);
  return { salt: bytesToHex(salt), hash: bytesToHex(bits) };
}
__name(hashPassword, "hashPassword");
async function json(request) {
  return request.json();
}
__name(json, "json");
function response(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers }
  });
}
__name(response, "response");
async function sendVerificationEmail(env, email, verificationUrl) {
  const missingSettings = [];
  if (!env.RESEND_API_KEY) missingSettings.push("RESEND_API_KEY");
  if (!env.MAIL_FROM) missingSettings.push("MAIL_FROM");
  if (missingSettings.length) {
    return {
      sent: false,
      error: `Email service is not configured (missing ${missingSettings.join(" and ")}). Contact the ReRa administrator.`
    };
  }
  let mail;
  try {
    mail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [email],
        subject: "Confirm your ReRa account",
        html: `<p>Confirm your ReRa account by opening this link:</p><p><a href="${verificationUrl}">Confirm my account</a></p>`
      })
    });
  } catch {
    return { sent: false, error: "Could not reach Resend. Please try again." };
  }
  if (!mail.ok) {
    console.error(`Resend rejected a confirmation email with HTTP ${mail.status}`);
    return { sent: false, error: `Resend rejected the confirmation email (HTTP ${mail.status}).` };
  }
  return { sent: true };
}
__name(sendVerificationEmail, "sendVerificationEmail");
async function handleStoreRequest(request, state, env) {
  const url = new URL(request.url);
  if (!["POST", "GET"].includes(request.method)) return response({ error: "Method not allowed" }, 405);
  if (url.pathname === "/api/signup" && request.method === "POST") {
    const body = await json(request);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = String(body.role || "parent");
    const country = String(body.country || "");
    const curriculum = String(body.curriculum || "");
    const subjects = body.subjects || [];
    const levels = body.levels || [];
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ error: "Enter a valid name and email address" }, 400);
    if (password.length < 12 || password !== String(body.password_confirm || "")) return response({ error: "Use a matching password with at least 12 characters" }, 400);
    if (!["parent", "teacher"].includes(role)) return response({ error: "Choose a parent or teacher account" }, 400);
    if (!COUNTRIES.has(country) || !CURRICULA[country].has(curriculum)) return response({ error: "Choose a curriculum offered in your country" }, 400);
    if (!Array.isArray(subjects) || !Array.isArray(levels) || levels.some((level) => !LEVELS.has(level))) return response({ error: "Choose valid teaching subjects and academic levels" }, 400);
    if (role === "teacher" && (!subjects.length || !levels.length)) return response({ error: "Select at least one subject and academic level you teach" }, 400);
    await deleteExpiredUnverifiedAccounts(state);
    if (state.storage.sql.exec("SELECT 1 FROM users WHERE email = ?", email).toArray().length) return response({ error: "An account already exists for this email" }, 409);
    const derived = await hashPassword(password);
    const verificationToken = crypto.randomUUID();
    const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
    state.storage.sql.exec(
      "INSERT INTO users (name, email, password_salt, password_hash, role, country, curriculum, subjects, levels, verification_token, verification_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      name,
      email,
      derived.salt,
      derived.hash,
      role,
      country,
      curriculum,
      JSON.stringify(role === "teacher" ? subjects : []),
      JSON.stringify(role === "teacher" ? levels : []),
      verificationToken,
      verificationExpiresAt,
      (/* @__PURE__ */ new Date()).toISOString()
    );
    await scheduleVerificationCleanup(state);
    const verificationUrl = `${env.PUBLIC_APP_URL || url.origin}/?verify-email=${encodeURIComponent(verificationToken)}`;
    const delivery = await sendVerificationEmail(env, email, verificationUrl);
    if (!delivery.sent) {
      state.storage.sql.exec("DELETE FROM users WHERE email = ? AND email_verified = 0 AND verification_token = ?", email, verificationToken);
      await scheduleVerificationCleanup(state);
      return response({ error: `${delivery.error} The unconfirmed account was removed; you can sign up again with this email once email delivery is available.` }, delivery.error.startsWith("Email service is not configured") ? 503 : 502);
    }
    return response({ ok: true, verification_required: true, email_sent: true, mail_error: null }, 201);
  }
  if (url.pathname === "/api/resend-verification" && request.method === "POST") {
    const body = await json(request);
    const email = String(body.email || "").trim().toLowerCase();
    await deleteExpiredUnverifiedAccounts(state);
    const rows2 = state.storage.sql.exec("SELECT id, verification_token FROM users WHERE email = ?", email).toArray();
    if (!rows2.length) return response({ error: "No account was found for this email" }, 404);
    if (!rows2[0].verification_token) return response({ error: "This account is already confirmed" }, 400);
    const verificationUrl = `${env.PUBLIC_APP_URL || url.origin}/?verify-email=${encodeURIComponent(rows2[0].verification_token)}`;
    const delivery = await sendVerificationEmail(env, email, verificationUrl);
    if (delivery.sent) return response({ ok: true });
    state.storage.sql.exec("DELETE FROM users WHERE id = ? AND email_verified = 0 AND verification_token = ?", rows2[0].id, rows2[0].verification_token);
    await scheduleVerificationCleanup(state);
    return response(
      { error: `${delivery.error} The unconfirmed account was removed; you can sign up again with this email once email delivery is available.` },
      delivery.error.startsWith("Email service is not configured") ? 503 : 502
    );
  }
  if (url.pathname === "/api/verify-email" && request.method === "POST") {
    const body = await json(request);
    await deleteExpiredUnverifiedAccounts(state);
    const rows2 = state.storage.sql.exec("SELECT id FROM users WHERE verification_token = ? AND verification_expires_at > ?", String(body.token || ""), (/* @__PURE__ */ new Date()).toISOString()).toArray();
    if (!rows2.length) return response({ error: "This confirmation link is invalid or has expired" }, 400);
    state.storage.sql.exec("UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires_at = NULL WHERE id = ?", rows2[0].id);
    await scheduleVerificationCleanup(state);
    return response({ ok: true });
  }
  if (url.pathname === "/api/login" && request.method === "POST") {
    const body = await json(request);
    const email = String(body.email || "").trim().toLowerCase();
    await deleteExpiredUnverifiedAccounts(state);
    const rows2 = state.storage.sql.exec("SELECT * FROM users WHERE email = ?", email).toArray();
    if (!rows2.length) return response({ error: "Email or password was not recognized" }, 401);
    const user = rows2[0];
    const derived = await hashPassword(String(body.password || ""), user.password_salt);
    if (derived.hash !== user.password_hash) return response({ error: "Email or password was not recognized" }, 401);
    if (!user.email_verified) return response({ error: "Confirm your email before signing in" }, 403);
    const token = crypto.randomUUID() + crypto.randomUUID();
    state.storage.sql.exec("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", token, user.id, new Date(Date.now() + 14 * 864e5).toISOString());
    return response({ ok: true, role: user.role }, 200, { "Set-Cookie": `rera_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 86400}` });
  }
  if (url.pathname === "/api/me") {
    const user = await currentUser(request, state);
    if (!user) return response({ error: "Please sign in to continue" }, 401);
    return response({ user });
  }
  if (url.pathname === "/api/logout" && request.method === "POST") {
    const token = getSessionToken(request);
    if (token) state.storage.sql.exec("DELETE FROM sessions WHERE token = ?", token);
    return response({ ok: true }, 200, { "Set-Cookie": "rera_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" });
  }
  if (url.pathname === "/api/families" || url.pathname === "/api/students" || url.pathname === "/api/requests" || url.pathname === "/api/resources" || url.pathname === "/api/pitches" || url.pathname === "/api/feedback" || url.pathname === "/api/teachers" || url.pathname === "/api/coordinates" || url.pathname === "/api/teacher/profile") {
    if (request.method === "GET") return getStoreData(request, state, url);
    if (request.method === "POST") return postStoreData(request, state, url);
  }
  const verifyMatch = url.pathname.match(/^\/api\/teachers\/(\d+)\/verify$/);
  if (verifyMatch && request.method === "POST") return verifyTeacher(request, state, Number(verifyMatch[1]));
  const pitchMatch = url.pathname.match(/^\/api\/requests\/(\d+)\/pitch$/);
  if (pitchMatch && request.method === "POST") return createPitch(request, state, Number(pitchMatch[1]));
  const offerMatch = url.pathname.match(/^\/api\/pitches\/(\d+)\/(accept|decline)$/);
  if (offerMatch && request.method === "POST") return updatePitch(request, state, Number(offerMatch[1]), offerMatch[2]);
  return response({ error: "API route not found" }, 404);
}
__name(handleStoreRequest, "handleStoreRequest");
function getSessionToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)rera_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
__name(getSessionToken, "getSessionToken");
function currentUser(request, state) {
  const token = getSessionToken(request);
  if (!token) return null;
  const result = rows(state, "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?", token, (/* @__PURE__ */ new Date()).toISOString());
  if (!result.length) return null;
  const row = result[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    country: row.country,
    curriculum: row.curriculum,
    subjects: parseArray(row.subjects),
    levels: parseArray(row.levels),
    radius_km: row.radius_km,
    available: Boolean(row.available),
    verified: Boolean(row.verified)
  };
}
__name(currentUser, "currentUser");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.RERA_STORE.idFromName("global");
      return env.RERA_STORE.get(id).fetch(request);
    }
    if (url.pathname === "/verify-email") {
      return env.ASSETS.fetch(new Request(`${url.origin}/index.html`, request));
    }
    return env.ASSETS.fetch(request);
  }
};

// ../../home/codespace/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../home/codespace/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-6nNXxe/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../home/codespace/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-6nNXxe/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  ReraStore,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
