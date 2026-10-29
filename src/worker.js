export class ReraStore {
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
      if (!columns.some(column => column.name === "verification_expires_at")) {
        this.state.storage.sql.exec("ALTER TABLE users ADD COLUMN verification_expires_at TEXT");
      }
      const userColumns = this.state.storage.sql.exec("PRAGMA table_info(users)").toArray();
      const userColumnNames = new Set(userColumns.map(column => column.name));
      for (const [name, definition] of [
        ["subjects", "TEXT NOT NULL DEFAULT '[]'"],
        ["levels", "TEXT NOT NULL DEFAULT '[]'"],
        ["address_city", "TEXT NOT NULL DEFAULT ''"],
        ["address_district", "TEXT NOT NULL DEFAULT ''"],
        ["address_sector", "TEXT NOT NULL DEFAULT ''"],
        ["address_cell", "TEXT NOT NULL DEFAULT ''"],
        ["address_street", "TEXT NOT NULL DEFAULT ''"],
        ["address_house_number", "TEXT NOT NULL DEFAULT ''"],
        ["latitude", "REAL"],
        ["longitude", "REAL"],
        ["radius_km", "INTEGER NOT NULL DEFAULT 10"],
        ["available", "INTEGER NOT NULL DEFAULT 1"],
        ["verified", "INTEGER NOT NULL DEFAULT 0"],
      ]) {
        if (!userColumnNames.has(name)) this.state.storage.sql.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
      }
      this.state.storage.sql.exec(
        `UPDATE users
        SET verification_expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+48 hours')
        WHERE email_verified = 0 AND verification_token IS NOT NULL AND verification_expires_at IS NULL`,
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
      this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS teacher_availability (
        id INTEGER PRIMARY KEY,
        teacher_id INTEGER NOT NULL,
        weekday TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(teacher_id, weekday, start_time, end_time)
      )`);
      this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS teacher_request_interests (
        id INTEGER PRIMARY KEY,
        request_id INTEGER NOT NULL,
        teacher_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(request_id, teacher_id)
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
}

const VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;
const COUNTRIES = new Set(["Rwanda", "Kenya", "Uganda", "Tanzania"]);
const CURRICULA = {
  Rwanda: new Set(["REB", "Cambridge / IB"]),
  Kenya: new Set(["CBC", "8-4-4"]),
  Uganda: new Set(["UNEB"]),
  Tanzania: new Set(["NECTA"]),
};
const LEVELS = new Set(["Primary", "Secondary", "University"]);
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SUBJECT_CATALOG = {
  Rwanda: {
    Primary: ["Mathematics", "English", "Kinyarwanda", "French", "Social and Religious Studies", "Science and Elementary Technology", "Creative Arts and Physical Education"],
    Secondary: ["Mathematics", "English", "Kinyarwanda", "French", "Physics", "Chemistry", "Biology", "Geography", "History", "Computer Science", "Economics", "Literature", "Entrepreneurship", "General Studies"],
    University: ["Engineering", "Medicine and Health Sciences", "Computer Science and IT", "Law", "Business and Economics", "Education", "Agriculture", "Social Sciences", "Environmental Sciences", "Languages and Literature", "Statistics and Data Science"],
  },
  Kenya: {
    Primary: ["Mathematics", "English", "Kiswahili", "Indigenous Languages", "Environmental Activities", "Integrated Science", "Social Studies", "Religious Education", "Creative Arts", "Agriculture and Nutrition"],
    Secondary: ["Mathematics", "English", "Kiswahili", "Physics", "Chemistry", "Biology", "Geography", "History", "Computer Studies", "Business Studies", "Agriculture", "Integrated Science", "Social Studies", "Pre-Technical Studies", "Religious Education"],
    University: ["Engineering", "Medicine and Health Sciences", "Computer Science and IT", "Law", "Business and Economics", "Education", "Agriculture", "Social Sciences", "Environmental Sciences", "Languages and Literature", "Statistics and Data Science"],
  },
  Uganda: {
    Primary: ["Mathematics", "English", "Local Languages", "Integrated Science", "Social Studies", "Religious Education", "Creative Arts", "Physical Education", "Agriculture"],
    Secondary: ["Mathematics", "English", "Physics", "Chemistry", "Biology", "Geography", "History", "Computer Studies", "Economics", "Entrepreneurship", "Agriculture", "Literature", "Fine Art", "Religious Education"],
    University: ["Engineering", "Medicine and Health Sciences", "Computer Science and IT", "Law", "Business and Economics", "Education", "Agriculture", "Social Sciences", "Environmental Sciences", "Languages and Literature", "Statistics and Data Science"],
  },
  Tanzania: {
    Primary: ["Mathematics", "Kiswahili", "English", "Science and Technology", "Social Studies", "Civic and Moral Education", "Vocational Skills", "Creative Arts", "Physical Education"],
    Secondary: ["Mathematics", "Kiswahili", "English", "Physics", "Chemistry", "Biology", "Geography", "History", "Civics", "Computer Studies", "Commerce", "Bookkeeping", "Agriculture", "Literature"],
    University: ["Engineering", "Medicine and Health Sciences", "Computer Science and IT", "Law", "Business and Economics", "Education", "Agriculture", "Social Sciences", "Environmental Sciences", "Languages and Literature", "Statistics and Data Science"],
  },
};
const CURRICULUM_SUBJECTS = {
  "Cambridge / IB": {
    Secondary: ["Global Perspectives", "Business Studies", "Art and Design", "Design and Technology"],
    University: ["International Relations", "Architecture"],
  },
  CBC: {
    Secondary: ["Sports and Physical Education", "Performing Arts", "Home Science"],
  },
  "8-4-4": {
    Secondary: ["Homescience", "Art and Design"],
  },
};

function subjectsFor(country, curriculum) {
  const countrySubjects = SUBJECT_CATALOG[country];
  if (!countrySubjects || !CURRICULA[country]?.has(curriculum)) return null;
  return Object.fromEntries([...LEVELS].map(level => [
    level,
    [...new Set([...countrySubjects[level], ...(CURRICULUM_SUBJECTS[curriculum]?.[level] || [])])],
  ]));
}

function teacherSubjectKey(level, subject) {
  return `${level}::${subject}`;
}

function teacherSubjectLabel(value) {
  const match = String(value).match(/^(Primary|Secondary|University)::(.+)$/);
  return match ? `${match[2]} (${match[1]})` : value;
}

function formatTeacherSubjects(value) {
  return parseArray(value).map(teacherSubjectLabel);
}

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function rows(state, query, ...values) {
  return state.storage.sql.exec(query, ...values).toArray();
}

function requireUser(request, state, roles = []) {
  const user = currentUser(request, state);
  if (!user) return { error: response({ error: "Please sign in to continue" }, 401) };
  if (roles.length && !roles.includes(user.role)) return { error: response({ error: "This action is not available for your account" }, 403) };
  return { user };
}

function validCoordinates(latitude, longitude) {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
    && Number(latitude) >= -90 && Number(latitude) <= 90
    && Number(longitude) >= -180 && Number(longitude) <= 180;
}

function validTime(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function availabilitySuggestions(existing, weekday, preferredStart, duration) {
  const days = [weekday, ...WEEKDAYS.filter(day => day !== weekday)];
  const suggestions = [];
  for (const day of days) {
    const candidates = [];
    for (let start = 8 * 60; start + duration <= 20 * 60; start += 30) {
      const end = start + duration;
      const overlaps = existing.some(slot => slot.weekday === day
        && start < timeToMinutes(slot.end_time) && end > timeToMinutes(slot.start_time));
      if (!overlaps) candidates.push({
        start,
        weekday: day,
        start_time: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
        end_time: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
      });
    }
    candidates.sort((left, right) => Math.abs(left.start - preferredStart) - Math.abs(right.start - preferredStart));
    suggestions.push(...candidates.slice(0, 3 - suggestions.length).map(({ start, ...slot }) => slot));
    if (suggestions.length >= 3) return suggestions;
  }
  return suggestions;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = degrees => degrees * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new ApiError("Request body must be a valid JSON object");
  }
}

function listFamilies(state) {
  const result = rows(state, `SELECT u.id AS parent_id, u.name AS parent_name, u.email AS parent_email,
    u.country AS parent_country, u.curriculum AS parent_curriculum, u.created_at AS parent_created_at,
    s.id AS student_id, s.name AS student_name, s.country AS student_country,
    s.curriculum AS student_curriculum, s.level AS student_level, s.grade AS student_grade
    FROM users u LEFT JOIN students s ON s.parent_id = u.id
    WHERE u.role = 'parent' ORDER BY u.created_at DESC, u.id, s.id`);
  const families = new Map();
  for (const row of result) {
    if (!families.has(row.parent_id)) {
      families.set(row.parent_id, {
        id: row.parent_id, name: row.parent_name, email: row.parent_email,
        country: row.parent_country, curriculum: row.parent_curriculum,
        created_at: row.parent_created_at, learners: [],
      });
    }
    if (row.student_id != null) {
      families.get(row.parent_id).learners.push({
        id: row.student_id, name: row.student_name, country: row.student_country,
        curriculum: row.student_curriculum, level: row.student_level, grade: row.student_grade,
      });
    }
  }
  return [...families.values()];
}

function matchingTeachers(state, request) {
  const candidates = rows(state, `SELECT id, name, country, curriculum, subjects, levels, latitude, longitude,
    radius_km, available, verified FROM users WHERE role = 'teacher' AND verified = 1 AND available = 1
    AND country = ? AND curriculum = ?`, request.country, request.curriculum);
  return candidates.filter(teacher => {
    const subjects = parseArray(teacher.subjects);
    if (!parseArray(teacher.levels).includes(request.level)
      || (!subjects.includes(teacherSubjectKey(request.level, request.subject)) && !subjects.includes(request.subject))) return false;
    if (request.latitude != null && teacher.latitude != null) {
      const distance = distanceKm(request.latitude, request.longitude, teacher.latitude, teacher.longitude);
      return distance <= request.radius_km && distance <= teacher.radius_km;
    }
    return request.mode !== "In person";
  });
}

function getStoreData(request, state, url) {
  if (url.pathname === "/api/subjects") {
    const country = url.searchParams.get("country");
    const curriculum = url.searchParams.get("curriculum");
    const subjects = subjectsFor(country, curriculum);
    if (!subjects) return response({ error: "Choose a curriculum offered in your country" }, 400);
    return response(subjects);
  }
  const access = requireUser(request, state);
  if (access.error) return access.error;
  const user = access.user;
  if (url.pathname === "/api/families") {
    if (user.role !== "manager") return response({ error: "Manager access required" }, 403);
    return response(listFamilies(state));
  }
  if (url.pathname === "/api/managers") {
    if (user.role !== "manager") return response({ error: "Manager access required" }, 403);
    return response(rows(state, "SELECT id, name, email, created_at FROM users WHERE role = 'manager' ORDER BY id"));
  }
  if (url.pathname === "/api/teacher/availability") {
    if (user.role !== "teacher") return response({ error: "This action is not available for your account" }, 403);
    return response(rows(state, `SELECT id, weekday, start_time, end_time FROM teacher_availability
      WHERE teacher_id = ? ORDER BY CASE weekday
      WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
      WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END, start_time`, user.id));
  }
  if (url.pathname === "/api/teacher/nearby-requests") {
    if (user.role !== "teacher" || !user.verified || !user.available) {
      return response({ error: "A verified, available educator profile is required to view nearby learner requests" }, 403);
    }
    if (user.latitude == null || user.longitude == null) {
      return response({ error: "Add your teaching-area pin to find nearby learners" }, 400);
    }
    const candidates = rows(state, `SELECT r.id, r.country, r.curriculum, r.level, r.subject,
      r.latitude, r.longitude, r.radius_km, r.mode, r.availability, r.created_at
      FROM learning_requests r WHERE r.status = 'Matching' AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
      AND r.country = ? AND r.curriculum = ? ORDER BY r.created_at DESC`, user.country, user.curriculum);
    const subjects = user.subject_keys;
    const results = candidates.filter(request => {
      const teacherHasSubject = subjects.includes(teacherSubjectKey(request.level, request.subject))
        || subjects.includes(request.subject);
      if (!teacherHasSubject || !user.levels.includes(request.level)) return false;
      const distance = distanceKm(user.latitude, user.longitude, request.latitude, request.longitude);
      return distance <= user.radius_km && distance <= request.radius_km;
    }).map(request => ({
      id: request.id,
      country: request.country,
      curriculum: request.curriculum,
      level: request.level,
      subject: request.subject,
      latitude: Math.round(request.latitude * 10) / 10,
      longitude: Math.round(request.longitude * 10) / 10,
      radius_km: request.radius_km,
      mode: request.mode,
      availability: request.availability,
      interest_status: rows(state, "SELECT status FROM teacher_request_interests WHERE request_id = ? AND teacher_id = ?", request.id, user.id)[0]?.status || null,
    }));
    return response({ requests: results });
  }
  if (url.pathname === "/api/manager/interests") {
    if (user.role !== "manager") return response({ error: "Manager access required" }, 403);
    return response(rows(state, `SELECT i.id, i.status, i.created_at, r.id AS request_id, r.country,
      r.curriculum, r.level, r.grade, r.subject, r.location_label, r.radius_km,
      s.name AS learner_name, u.id AS teacher_id, u.name AS teacher_name, u.email AS teacher_email
      FROM teacher_request_interests i
      JOIN learning_requests r ON r.id = i.request_id
      JOIN users u ON u.id = i.teacher_id
      JOIN students s ON s.id = r.student_id
      WHERE i.status = 'Pending' ORDER BY i.created_at`));
  }
  if (url.pathname === "/api/students") {
    if (user.role !== "parent") return response([]);
    return response(rows(state, "SELECT id, name, country, curriculum, level, grade FROM students WHERE parent_id = ? ORDER BY id", user.id));
  }
  if (url.pathname === "/api/teachers") {
    if (user.role !== "manager") return response({ error: "Manager access required" }, 403);
    return response(rows(state, `SELECT id, name, country, curriculum, subjects, levels, latitude, longitude, radius_km,
      available, verified FROM users WHERE role = 'teacher' ORDER BY verified DESC, name`).map(teacher => ({
      ...teacher, subject_keys: parseArray(teacher.subjects), subjects: formatTeacherSubjects(teacher.subjects), levels: parseArray(teacher.levels),
      available: Boolean(teacher.available), verified: Boolean(teacher.verified),
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
        WHERE r.parent_id = ? ORDER BY p.created_at DESC`, user.id).map(pitch => ({
        ...pitch, subjects: formatTeacherSubjects(pitch.subjects), verified: Boolean(pitch.verified),
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
      type: "request", latitude: learningRequest.latitude, longitude: learningRequest.longitude, label: "Lesson area",
    });
    for (const teacher of matchingTeachers(state, learningRequest)) {
      if (teacher.latitude != null) points.push({
        type: "teacher", id: teacher.id, latitude: teacher.latitude, longitude: teacher.longitude, label: teacher.name,
      });
    }
    return response({
      points,
      request: {
        id: learningRequest.id, country: learningRequest.country,
        location_label: learningRequest.location_label, radius_km: learningRequest.radius_km,
      },
    });
  }
  return response({ error: "API route not found" }, 404);
}

async function postStoreData(request, state, url) {
  const access = requireUser(request, state, url.pathname === "/api/students" || url.pathname === "/api/requests" || url.pathname === "/api/feedback" ? ["parent"] : []);
  if (access.error) return access.error;
  const user = access.user;
  const body = await readJson(request);
  if (url.pathname === "/api/managers") {
    if (user.role !== "manager") return response({ error: "Manager access required" }, 403);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return response({ error: "Enter a valid manager name and email address" }, 400);
    }
    if (password.length < 12 || password.length > 256) {
      return response({ error: "Use a password between 12 and 256 characters" }, 400);
    }
    if (rows(state, "SELECT 1 FROM users WHERE email = ? LIMIT 1", email).length) {
      return response({ error: "An account already exists for this email" }, 409);
    }
    const derived = await hashPassword(password);
    const managerCount = rows(state, "SELECT COUNT(*) AS count FROM users WHERE role = 'manager'")[0]?.count || 0;
    if (managerCount >= 3) return response({ error: "ReRa supports a maximum of three manager accounts" }, 409);
    if (rows(state, "SELECT 1 FROM users WHERE email = ? LIMIT 1", email).length) {
      return response({ error: "An account already exists for this email" }, 409);
    }
    state.storage.sql.exec(
      `INSERT INTO users (name, email, password_salt, password_hash, role, country, curriculum, email_verified, created_at)
       VALUES (?, ?, ?, ?, 'manager', ?, ?, 1, ?)`,
      name, email, derived.salt, derived.hash, user.country, user.curriculum, new Date().toISOString(),
    );
    return response({ ok: true }, 201);
  }
  if (url.pathname === "/api/students") {
    const name = String(body.name || "").trim();
    const country = String(body.country || user.country);
    const curriculum = String(body.curriculum || user.curriculum);
    const level = String(body.level || "");
    const grade = String(body.grade || "").trim();
    if (!name || name.length > 80 || !COUNTRIES.has(country) || !CURRICULA[country].has(curriculum)
      || !LEVELS.has(level) || !grade || grade.length > 50) {
      return response({ error: "Complete the learner name, country, curriculum, level, and grade" }, 400);
    }
    state.storage.sql.exec(
      "INSERT INTO students(parent_id, name, country, curriculum, level, grade, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      user.id, name, country, curriculum, level, grade, new Date().toISOString(),
    );
    const id = state.storage.sql.exec("SELECT last_insert_rowid() AS id").one()?.id;
    if (id == null) throw new Error("Could not retrieve the new learner ID");
    return response({ id, name }, 201);
  }
  if (url.pathname === "/api/nearby-teachers") {
    const latitude = body.latitude;
    const longitude = body.longitude;
    const radius = Number(body.radius_km ?? 10);
    if (typeof latitude !== "number" || typeof longitude !== "number" || !validCoordinates(latitude, longitude)) {
      return response({ error: "Location coordinates are invalid" }, 400);
    }
    if (!Number.isInteger(radius) || ![5, 10, 20, 50].includes(radius)) {
      return response({ error: "Choose a 5, 10, 20 or 50 km search radius" }, 400);
    }
    const candidates = rows(state, `SELECT country, curriculum, latitude, longitude, radius_km
      FROM users WHERE role = 'teacher' AND verified = 1 AND available = 1
      AND latitude IS NOT NULL AND longitude IS NOT NULL`);
    const points = candidates
      .filter(teacher => {
        const distance = distanceKm(latitude, longitude, teacher.latitude, teacher.longitude);
        return distance <= radius && distance <= teacher.radius_km;
      })
      .map(teacher => ({
        latitude: Number(teacher.latitude.toFixed(2)),
        longitude: Number(teacher.longitude.toFixed(2)),
        country: teacher.country,
        curriculum: teacher.curriculum,
      }));
    return response({ radius_km: radius, points }, 200);
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
    const subjects = subjectsFor(student.country, student.curriculum);
    if (!subjects?.[student.level]?.includes(subject)) {
      return response({ error: "Choose a subject offered for this learner's country, curriculum, and level" }, 400);
    }
    if (!subject || subject.length > 80 || !location || location.length > 120) return response({ error: "Add a subject and neighborhood or town" }, 400);
    if (!["In person", "Online", "Either"].includes(mode)) return response({ error: "Choose a valid lesson format and radius" }, 400);
    let latitude = body.latitude;
    let longitude = body.longitude;
    if (mode === "In person" && !validCoordinates(latitude, longitude)) return response({ error: "Allow location access or choose online lessons" }, 400);
    if (mode === "Online" || !validCoordinates(latitude, longitude)) latitude = longitude = null;
    state.storage.sql.exec(`INSERT INTO learning_requests
      (parent_id, student_id, country, curriculum, level, grade, subject, location_label, latitude, longitude,
       radius_km, mode, availability, goal, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id, studentId, student.country, student.curriculum, student.level, student.grade,
    subject, location, latitude, longitude, radius, mode, String(body.availability || "Flexible").slice(0, 80),
    String(body.goal || "").trim().slice(0, 1000), new Date().toISOString());
    const id = state.storage.sql.exec("SELECT last_insert_rowid() AS id").one()?.id;
    if (id == null) throw new Error("Could not retrieve the new learning request ID");
    return response({ id, status: "Matching" }, 201);
  }
  if (url.pathname === "/api/teacher/profile") {
    if (user.role !== "teacher") return response({ error: "This action is not available for your account" }, 403);
    const radius = Number(body.radius_km || 10);
    if (![5, 10, 20, 50].includes(radius)) return response({ error: "Choose a 5, 10, 20 or 50 km radius" }, 400);
    const { latitude, longitude } = body;
    if ((latitude == null) !== (longitude == null) || (latitude != null && !validCoordinates(latitude, longitude))) {
      return response({ error: "Location coordinates are invalid" }, 400);
    }
    const address = {};
    for (const [field, column, maxLength] of [
      ["city", "address_city", 100], ["district", "address_district", 100],
      ["sector", "address_sector", 100], ["cell", "address_cell", 100],
      ["street", "address_street", 160], ["house_number", "address_house_number", 40],
    ]) {
      const value = body[field] == null ? (user[field] || "") : String(body[field]).trim();
      if (value.length > maxLength) return response({ error: `${field.replace("_", " ")} is too long` }, 400);
      address[column] = value;
    }
    state.storage.sql.exec(`UPDATE users SET latitude = ?, longitude = ?, radius_km = ?, available = ?,
      address_city = ?, address_district = ?, address_sector = ?, address_cell = ?, address_street = ?,
      address_house_number = ? WHERE id = ?`,
    latitude == null ? null : Number(latitude), longitude == null ? null : Number(longitude),
    radius, body.available === false ? 0 : 1, address.address_city, address.address_district,
    address.address_sector, address.address_cell, address.address_street, address.address_house_number, user.id);
    return response({ ok: true });
  }
  if (url.pathname === "/api/teacher/availability") {
    if (user.role !== "teacher") return response({ error: "This action is not available for your account" }, 403);
    if (body.action === "remove") {
      const id = Number(body.id);
      const result = state.storage.sql.exec("DELETE FROM teacher_availability WHERE id = ? AND teacher_id = ?", id, user.id);
      if (!result.rowsWritten) return response({ error: "Availability slot not found" }, 404);
      return response({ ok: true });
    }
    const { weekday, start_time: startTime, end_time: endTime } = body;
    if (!WEEKDAYS.includes(weekday) || !validTime(startTime) || !validTime(endTime)
      || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      return response({ error: "Choose a valid weekday and start/end time" }, 400);
    }
    const existing = rows(state, "SELECT id, weekday, start_time, end_time FROM teacher_availability WHERE teacher_id = ?", user.id);
    const overlaps = existing.some(slot => slot.weekday === weekday
      && timeToMinutes(startTime) < timeToMinutes(slot.end_time)
      && timeToMinutes(endTime) > timeToMinutes(slot.start_time));
    if (overlaps) {
      return response({
        error: "This time overlaps an existing weekly availability slot",
        suggestions: availabilitySuggestions(existing, weekday, timeToMinutes(startTime), timeToMinutes(endTime) - timeToMinutes(startTime)),
      }, 409);
    }
    state.storage.sql.exec(`INSERT INTO teacher_availability(teacher_id, weekday, start_time, end_time, created_at)
      VALUES (?, ?, ?, ?, ?)`, user.id, weekday, startTime, endTime, new Date().toISOString());
    return response({ ok: true }, 201);
  }
  if (url.pathname === "/api/feedback") {
    const rating = Number(body.rating);
    const requestId = Number(body.request_id);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return response({ error: "Choose a rating from 1 to 5" }, 400);
    if (!rows(state, "SELECT id FROM learning_requests WHERE id = ? AND parent_id = ?", requestId, user.id).length) {
      return response({ error: "That learning request is not in your family account" }, 400);
    }
    state.storage.sql.exec(`INSERT INTO feedback(request_id, parent_id, rating, comment, created_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(request_id, parent_id) DO UPDATE SET rating = excluded.rating,
      comment = excluded.comment, created_at = excluded.created_at`,
    requestId, user.id, rating, String(body.comment || "").trim().slice(0, 1000), new Date().toISOString());
    return response({ ok: true }, 201);
  }
  return response({ error: "API route not found" }, 404);
}

function verifyTeacher(request, state, teacherId) {
  const access = requireUser(request, state, ["manager"]);
  if (access.error) return access.error;
  const cursor = state.storage.sql.exec("UPDATE users SET verified = 1 WHERE id = ? AND role = 'teacher'", teacherId);
  if (!cursor.rowsWritten) return response({ error: "Educator not found" }, 404);
  return response({ ok: true });
}

function createPitch(request, state, requestId) {
  const access = requireUser(request, state, ["manager"]);
  if (access.error) return access.error;
  const bodyPromise = readJson(request);
  return bodyPromise.then(body => {
    const teacherId = Number(body.teacher_id);
    const learningRequest = rows(state, "SELECT * FROM learning_requests WHERE id = ?", requestId)[0];
    if (!learningRequest || !Number.isInteger(teacherId)) return response({ error: "Request or educator not found" }, 400);
    const candidates = matchingTeachers(state, learningRequest);
    if (!candidates.some(teacher => teacher.id === teacherId)) {
      return response({ error: "This educator does not currently meet all request criteria" }, 400);
    }
    state.storage.sql.exec("INSERT OR IGNORE INTO pitches(request_id, teacher_id, created_at) VALUES (?, ?, ?)",
      requestId, teacherId, new Date().toISOString());
    state.storage.sql.exec("UPDATE learning_requests SET status = 'Pitched' WHERE id = ?", requestId);
    return response({ ok: true }, 201);
  });
}

function createTeacherInterest(request, state, requestId) {
  const access = requireUser(request, state, ["teacher"]);
  if (access.error) return access.error;
  const teacher = access.user;
  if (!teacher.verified || !teacher.available) return response({ error: "Only verified, available educators can express interest" }, 403);
  if (teacher.latitude == null || teacher.longitude == null) return response({ error: "Add your teaching-area pin before expressing interest" }, 400);
  const learningRequest = rows(state, "SELECT * FROM learning_requests WHERE id = ? AND status = 'Matching'", requestId)[0];
  if (!learningRequest || learningRequest.latitude == null || learningRequest.longitude == null) {
    return response({ error: "This nearby learner request is no longer available" }, 404);
  }
  const hasSubject = teacher.subject_keys.includes(teacherSubjectKey(learningRequest.level, learningRequest.subject))
    || teacher.subject_keys.includes(learningRequest.subject);
  const distance = distanceKm(teacher.latitude, teacher.longitude, learningRequest.latitude, learningRequest.longitude);
  if (teacher.country !== learningRequest.country || teacher.curriculum !== learningRequest.curriculum
    || !teacher.levels.includes(learningRequest.level) || !hasSubject
    || distance > teacher.radius_km || distance > learningRequest.radius_km) {
    return response({ error: "This request no longer matches your teaching profile" }, 403);
  }
  const existing = rows(state, "SELECT status FROM teacher_request_interests WHERE request_id = ? AND teacher_id = ?", requestId, teacher.id)[0];
  if (existing && existing.status !== "Declined") {
    return response({ error: `Your interest is already ${existing.status.toLowerCase()}` }, 409);
  }
  state.storage.sql.exec(`INSERT INTO teacher_request_interests(request_id, teacher_id, status, created_at, updated_at)
    VALUES (?, ?, 'Pending', ?, ?) ON CONFLICT(request_id, teacher_id) DO UPDATE SET
    status = 'Pending', updated_at = excluded.updated_at`,
  requestId, teacher.id, new Date().toISOString(), new Date().toISOString());
  return response({ ok: true, status: "Pending" }, 201);
}

function updateTeacherInterest(request, state, interestId, action) {
  const access = requireUser(request, state, ["manager"]);
  if (access.error) return access.error;
  const interest = rows(state, `SELECT i.id, i.request_id, i.teacher_id, i.status
    FROM teacher_request_interests i WHERE i.id = ?`, interestId)[0];
  if (!interest || interest.status !== "Pending") return response({ error: "Pending educator interest not found" }, 404);
  if (action === "approve") {
    const learningRequest = rows(state, "SELECT * FROM learning_requests WHERE id = ? AND status = 'Matching'", interest.request_id)[0];
    if (!learningRequest || !matchingTeachers(state, learningRequest).some(teacher => teacher.id === interest.teacher_id)) {
      return response({ error: "This educator no longer meets the request criteria" }, 409);
    }
    state.storage.sql.exec("INSERT OR IGNORE INTO pitches(request_id, teacher_id, created_at) VALUES (?, ?, ?)",
      interest.request_id, interest.teacher_id, new Date().toISOString());
    state.storage.sql.exec("UPDATE learning_requests SET status = 'Pitched' WHERE id = ?", interest.request_id);
  }
  state.storage.sql.exec("UPDATE teacher_request_interests SET status = ?, updated_at = ? WHERE id = ? AND status = 'Pending'",
    action === "approve" ? "Approved" : "Declined", new Date().toISOString(), interestId);
  if (action === "approve") {
    state.storage.sql.exec(`UPDATE teacher_request_interests SET status = 'Declined', updated_at = ?
      WHERE request_id = ? AND id != ? AND status = 'Pending'`,
    new Date().toISOString(), interest.request_id, interestId);
  }
  return response({ ok: true, status: action === "approve" ? "Approved" : "Declined" });
}

function updatePitch(request, state, requestId, action) {
  const access = requireUser(request, state, ["teacher"]);
  if (access.error) return access.error;
  const status = action === "accept" ? "Accepted" : "Declined";
  const cursor = state.storage.sql.exec("UPDATE pitches SET status = ? WHERE request_id = ? AND teacher_id = ? AND status = 'Offered'",
    status, requestId, access.user.id);
  if (!cursor.rowsWritten) return response({ error: "Offer not found or already answered" }, 404);
  if (action === "accept") state.storage.sql.exec("UPDATE learning_requests SET status = 'Matched' WHERE id = ?", requestId);
  return response({ ok: true, status });
}

async function deleteExpiredUnverifiedAccounts(state) {
  const now = new Date().toISOString();
  const expired = state.storage.sql.exec(
    "SELECT id FROM users WHERE email_verified = 0 AND verification_token IS NOT NULL AND verification_expires_at <= ?",
    now,
  ).toArray();
  for (const user of expired) {
    state.storage.sql.exec("DELETE FROM sessions WHERE user_id = ?", user.id);
    state.storage.sql.exec("DELETE FROM users WHERE id = ?", user.id);
  }
}

async function scheduleVerificationCleanup(state) {
  const next = state.storage.sql.exec(
    "SELECT MIN(verification_expires_at) AS expires_at FROM users WHERE email_verified = 0 AND verification_token IS NOT NULL",
  ).toArray()[0]?.expires_at;
  if (next) {
    await state.storage.setAlarm(Date.parse(next));
  } else {
    await state.storage.deleteAlarm();
  }
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return { salt: bytesToHex(salt), hash: bytesToHex(bits) };
}

function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

async function json(request) {
  return request.json();
}

function response(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

async function sendVerificationEmail(env, email, verificationUrl) {
  const missingSettings = [];
  if (!env.RESEND_API_KEY) missingSettings.push("RESEND_API_KEY");
  if (!env.MAIL_FROM) missingSettings.push("MAIL_FROM");
  if (missingSettings.length) {
    return {
      sent: false,
      error: `Email service is not configured (missing ${missingSettings.join(" and ")}). Contact the ReRa administrator.`,
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
        html: `<p>Confirm your ReRa account by opening this link:</p><p><a href="${verificationUrl}">Confirm my account</a></p>`,
      }),
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

async function handleStoreRequest(request, state, env) {
  const url = new URL(request.url);
  if (!["POST", "GET"].includes(request.method)) return response({ error: "Method not allowed" }, 405);

  if (url.pathname === "/api/manager/bootstrap" && request.method === "POST") {
    if (!env.MANAGER_SETUP_TOKEN || env.MANAGER_SETUP_TOKEN.length < 64) {
      return response({ error: "Manager bootstrap is not configured" }, 404);
    }
    const authorization = request.headers.get("Authorization") || "";
    const providedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!constantTimeEqual(providedToken, env.MANAGER_SETUP_TOKEN)) {
      return response({ error: "Manager bootstrap is not available" }, 404);
    }
    if (rows(state, "SELECT 1 FROM users WHERE role = 'manager' LIMIT 1").length) {
      return response({ error: "A manager account has already been created" }, 409);
    }

    const body = await json(request);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const country = String(body.country || "");
    const curriculum = String(body.curriculum || "");
    if (!name || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return response({ error: "Enter a valid manager name and email address" }, 400);
    }
    if (password.length < 12 || password.length > 256) {
      return response({ error: "Use a password between 12 and 256 characters" }, 400);
    }
    if (!COUNTRIES.has(country) || !CURRICULA[country].has(curriculum)) {
      return response({ error: "Choose a curriculum offered in your country" }, 400);
    }
    if (rows(state, "SELECT 1 FROM users WHERE email = ? LIMIT 1", email).length) {
      return response({ error: "An account already exists for this email" }, 409);
    }

    const derived = await hashPassword(password);
    if (rows(state, "SELECT 1 FROM users WHERE role = 'manager' LIMIT 1").length) {
      return response({ error: "A manager account has already been created" }, 409);
    }
    if (rows(state, "SELECT 1 FROM users WHERE email = ? LIMIT 1", email).length) {
      return response({ error: "An account already exists for this email" }, 409);
    }
    state.storage.sql.exec(
      `INSERT INTO users (name, email, password_salt, password_hash, role, country, curriculum, email_verified, created_at)
       VALUES (?, ?, ?, ?, 'manager', ?, ?, 1, ?)`,
      name, email, derived.salt, derived.hash, country, curriculum, new Date().toISOString(),
    );
    return response({ ok: true, message: "Manager account created. Sign in through the ReRa homepage." }, 201);
  }

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
    if (!Array.isArray(subjects) || !Array.isArray(levels) || levels.some(level => !LEVELS.has(level)) || new Set(levels).size !== levels.length) return response({ error: "Choose valid teaching subjects and academic levels" }, 400);
    if (role === "teacher" && (!subjects.length || !levels.length)) return response({ error: "Select at least one subject and academic level you teach" }, 400);
    if (role === "teacher") {
      const catalog = subjectsFor(country, curriculum);
      const validSelections = subjects.every(selection => {
        if (typeof selection !== "string") return false;
        const [level, ...parts] = selection.split("::");
        const subject = parts.join("::");
        return levels.includes(level) && catalog[level]?.includes(subject);
      });
      if (!validSelections || levels.some(level => !subjects.some(selection =>
        typeof selection === "string" && selection.startsWith(`${level}::`)))) {
        return response({ error: "Select at least one valid subject for each academic level you teach" }, 400);
      }
    }

    await deleteExpiredUnverifiedAccounts(state);
    if (state.storage.sql.exec("SELECT 1 FROM users WHERE email = ?", email).toArray().length) return response({ error: "An account already exists for this email" }, 409);

    const derived = await hashPassword(password);
    const verificationToken = crypto.randomUUID();
    const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
    state.storage.sql.exec(
      "INSERT INTO users (name, email, password_salt, password_hash, role, country, curriculum, subjects, levels, verification_token, verification_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      name, email, derived.salt, derived.hash, role, country, curriculum,
      JSON.stringify(role === "teacher" ? subjects : []), JSON.stringify(role === "teacher" ? levels : []),
      verificationToken, verificationExpiresAt, new Date().toISOString(),
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
    const rows = state.storage.sql.exec("SELECT id, verification_token FROM users WHERE email = ?", email).toArray();
    if (!rows.length) return response({ error: "No account was found for this email" }, 404);
    if (!rows[0].verification_token) return response({ error: "This account is already confirmed" }, 400);
    const verificationUrl = `${env.PUBLIC_APP_URL || url.origin}/?verify-email=${encodeURIComponent(rows[0].verification_token)}`;
    const delivery = await sendVerificationEmail(env, email, verificationUrl);
    if (delivery.sent) return response({ ok: true });
    state.storage.sql.exec("DELETE FROM users WHERE id = ? AND email_verified = 0 AND verification_token = ?", rows[0].id, rows[0].verification_token);
    await scheduleVerificationCleanup(state);
    return response(
      { error: `${delivery.error} The unconfirmed account was removed; you can sign up again with this email once email delivery is available.` },
      delivery.error.startsWith("Email service is not configured") ? 503 : 502,
    );
  }

  if (url.pathname === "/api/verify-email" && request.method === "POST") {
    const body = await json(request);
    await deleteExpiredUnverifiedAccounts(state);
    const rows = state.storage.sql.exec("SELECT id FROM users WHERE verification_token = ? AND verification_expires_at > ?", String(body.token || ""), new Date().toISOString()).toArray();
    if (!rows.length) return response({ error: "This confirmation link is invalid or has expired" }, 400);
    state.storage.sql.exec("UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires_at = NULL WHERE id = ?", rows[0].id);
    await scheduleVerificationCleanup(state);
    return response({ ok: true });
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    const body = await json(request);
    const email = String(body.email || "").trim().toLowerCase();
    await deleteExpiredUnverifiedAccounts(state);
    const rows = state.storage.sql.exec("SELECT * FROM users WHERE email = ?", email).toArray();
    if (!rows.length) return response({ error: "Email or password was not recognized" }, 401);
    const user = rows[0];
    const derived = await hashPassword(String(body.password || ""), user.password_salt);
    if (derived.hash !== user.password_hash) return response({ error: "Email or password was not recognized" }, 401);
    if (!user.email_verified) return response({ error: "Confirm your email before signing in" }, 403);

    const token = crypto.randomUUID() + crypto.randomUUID();
    state.storage.sql.exec("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", token, user.id, new Date(Date.now() + 14 * 86400000).toISOString());
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

  const interestMatch = url.pathname.match(/^\/api\/requests\/(\d+)\/interest$/);
  if (interestMatch && request.method === "POST") return createTeacherInterest(request, state, Number(interestMatch[1]));
  const managerInterestMatch = url.pathname.match(/^\/api\/manager\/interests\/(\d+)\/(approve|decline)$/);
  if (managerInterestMatch && request.method === "POST") {
    return updateTeacherInterest(request, state, Number(managerInterestMatch[1]), managerInterestMatch[2]);
  }

  if (url.pathname === "/api/families" || url.pathname === "/api/managers" || url.pathname === "/api/subjects"
    || url.pathname === "/api/students" || url.pathname === "/api/requests"
    || url.pathname === "/api/resources" || url.pathname === "/api/pitches" || url.pathname === "/api/feedback"
    || url.pathname === "/api/teachers" || url.pathname === "/api/coordinates" || url.pathname === "/api/teacher/profile"
    || url.pathname === "/api/teacher/availability" || url.pathname === "/api/teacher/nearby-requests"
    || url.pathname === "/api/manager/interests" || url.pathname === "/api/nearby-teachers") {
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

function getSessionToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)rera_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function currentUser(request, state) {
  const token = getSessionToken(request);
  if (!token) return null;
  const result = rows(state, "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?", token, new Date().toISOString());
  if (!result.length) return null;
  const row = result[0];
  return {
    id: row.id, name: row.name, email: row.email, role: row.role, country: row.country, curriculum: row.curriculum,
    subject_keys: parseArray(row.subjects), subjects: formatTeacherSubjects(row.subjects), levels: parseArray(row.levels), radius_km: row.radius_km,
    available: Boolean(row.available), verified: Boolean(row.verified),
    latitude: row.latitude, longitude: row.longitude,
    city: row.address_city, district: row.address_district, sector: row.address_sector,
    cell: row.address_cell, street: row.address_street, house_number: row.address_house_number,
  };
}

export default {
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
  },
};
