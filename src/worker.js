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
      this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL
      )`);
    });
    return handleStoreRequest(request, this.state, this.env);
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
      error: `Email service to be configured (missing ${missingSettings.join(" and ")}). Wait for ReRa administrators to configure that!.`,
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

  if (url.pathname === "/api/signup" && request.method === "POST") {
    const body = await json(request);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ error: "Enter a valid name and email address" }, 400);
    if (password.length < 12 || password !== String(body.password_confirm || "")) return response({ error: "Use a matching password with at least 12 characters" }, 400);

    if (state.storage.sql.exec("SELECT 1 FROM users WHERE email = ?", email).toArray().length) return response({ error: "An account already exists for this email" }, 409);

    const derived = await hashPassword(password);
    const verificationToken = crypto.randomUUID();
    state.storage.sql.exec(
      "INSERT INTO users (name, email, password_salt, password_hash, role, country, curriculum, verification_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      name, email, derived.salt, derived.hash, String(body.role || "parent"), String(body.country || ""), String(body.curriculum || ""), verificationToken, new Date().toISOString(),
    );

    const verificationUrl = `${env.PUBLIC_APP_URL || url.origin}/?verify-email=${encodeURIComponent(verificationToken)}`;
    const delivery = await sendVerificationEmail(env, email, verificationUrl);
    return response({
      ok: true,
      verification_required: true,
      email_sent: delivery.sent,
      mail_error: delivery.sent ? null : delivery.error,
    }, 201);
  }

  if (url.pathname === "/api/resend-verification" && request.method === "POST") {
    const body = await json(request);
    const email = String(body.email || "").trim().toLowerCase();
    const rows = state.storage.sql.exec("SELECT id, verification_token FROM users WHERE email = ?", email).toArray();
    if (!rows.length) return response({ error: "No account was found for this email" }, 404);
    if (!rows[0].verification_token) return response({ error: "This account is already confirmed" }, 400);
    const verificationUrl = `${env.PUBLIC_APP_URL || url.origin}/?verify-email=${encodeURIComponent(rows[0].verification_token)}`;
    const delivery = await sendVerificationEmail(env, email, verificationUrl);
    if (delivery.sent) return response({ ok: true });
    return response(
      { error: delivery.error },
      delivery.error.startsWith("Email service is not configured") ? 503 : 502,
    );
  }

  if (url.pathname === "/api/verify-email" && request.method === "POST") {
    const body = await json(request);
    const rows = state.storage.sql.exec("SELECT id FROM users WHERE verification_token = ?", String(body.token || "")).toArray();
    if (!rows.length) return response({ error: "This confirmation link is invalid or has expired" }, 400);
    state.storage.sql.exec("UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?", rows[0].id);
    return response({ ok: true });
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    const body = await json(request);
    const email = String(body.email || "").trim().toLowerCase();
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

  if (["/api/requests", "/api/resources", "/api/students", "/api/pitches", "/api/feedback", "/api/teachers"].includes(url.pathname)) {
    return response([]);
  }
  return response({ error: "API route not found" }, 404);
}

async function currentUser(request, state) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)rera_session=([^;]+)/);
  if (!match) return null;
  const rows = state.storage.sql.exec("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?", decodeURIComponent(match[1]), new Date().toISOString()).toArray();
  if (!rows.length) return null;
  const row = rows[0];
  return { id: row.id, name: row.name, email: row.email, role: row.role, country: row.country, curriculum: row.curriculum, subjects: [], levels: [], verified: Boolean(row.email_verified) };
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
