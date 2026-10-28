from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from email.utils import formatdate
from getpass import getpass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
DATA_DIR = Path(os.environ.get("RERA_DATA_DIR", ROOT / "data"))
DB_PATH = DATA_DIR / "rera.sqlite3"
UPLOAD_DIR = DATA_DIR / "materials"
MAX_BODY = 7 * 1024 * 1024
MAX_PDF_BYTES = 5 * 1024 * 1024
SESSION_DAYS = 14
COUNTRIES = {"Rwanda", "Kenya", "Uganda", "Tanzania"}
CURRICULA = {
    "Rwanda": {"REB", "Cambridge / IB"},
    "Kenya": {"CBC", "8-4-4"},
    "Uganda": {"UNEB"},
    "Tanzania": {"NECTA"},
}
LEVELS = {"Primary", "Secondary", "University"}
ROLES = {"parent", "teacher"}
OFFICIAL_RESOURCES = [
    ("REB curriculum and learning resources", "curriculum", "Rwanda", "REB", "All levels", "All subjects", "Rwanda Education Board official website", "https://www.reb.gov.rw/"),
    ("Cambridge International programmes", "curriculum", "Rwanda", "Cambridge / IB", "All levels", "All subjects", "Official Cambridge International programme information", "https://www.cambridgeinternational.org/programmes-and-qualifications/"),
    ("Kenya Institute of Curriculum Development", "curriculum", "Kenya", "CBC", "All levels", "All subjects", "Official KICD curriculum information", "https://kicd.ac.ke/"),
    ("Kenya National Examinations Council", "curriculum", "Kenya", "8-4-4", "All levels", "All subjects", "Official examination and curriculum information", "https://www.knec.ac.ke/"),
    ("Uganda National Examinations Board", "curriculum", "Uganda", "UNEB", "All levels", "All subjects", "Official UNEB examination and curriculum information", "https://uneb.ac.ug/"),
    ("Tanzania NECTA", "curriculum", "Tanzania", "NECTA", "All levels", "All subjects", "Official National Examinations Council of Tanzania", "https://www.necta.go.tz/"),
]
FAILED_LOGINS: dict[str, list[float]] = {}


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with connect_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('manager', 'parent', 'teacher')),
                country TEXT NOT NULL,
                curriculum TEXT NOT NULL,
                subjects TEXT NOT NULL DEFAULT '[]',
                levels TEXT NOT NULL DEFAULT '[]',
                latitude REAL,
                longitude REAL,
                radius_km INTEGER NOT NULL DEFAULT 10,
                available INTEGER NOT NULL DEFAULT 1,
                verified INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY,
                parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                country TEXT NOT NULL,
                curriculum TEXT NOT NULL,
                level TEXT NOT NULL,
                grade TEXT NOT NULL,
                subjects TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS learning_requests (
                id INTEGER PRIMARY KEY,
                parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
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
            );
            CREATE TABLE IF NOT EXISTS pitches (
                request_id INTEGER NOT NULL REFERENCES learning_requests(id) ON DELETE CASCADE,
                teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'Offered',
                created_at TEXT NOT NULL,
                PRIMARY KEY (request_id, teacher_id)
            );
            CREATE TABLE IF NOT EXISTS resources (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('material', 'curriculum')),
                country TEXT NOT NULL,
                curriculum TEXT NOT NULL,
                level TEXT NOT NULL,
                subject TEXT NOT NULL,
                description TEXT NOT NULL,
                url TEXT,
                owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                file_name TEXT,
                published INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS request_parent_idx ON learning_requests(parent_id);
            CREATE INDEX IF NOT EXISTS pitch_teacher_idx ON pitches(teacher_id);
            CREATE INDEX IF NOT EXISTS resource_filter_idx ON resources(kind, country, curriculum, level, subject);
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY,
                request_id INTEGER NOT NULL REFERENCES learning_requests(id) ON DELETE CASCADE,
                parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                comment TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                UNIQUE(request_id, parent_id)
            );
        """)
        for title, kind, country, curriculum, level, subject, description, url in OFFICIAL_RESOURCES:
            db.execute("""INSERT INTO resources
                (title, kind, country, curriculum, level, subject, description, url, created_at)
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM resources WHERE title = ?)""",
                (title, kind, country, curriculum, level, subject, description, url, now_iso(), title))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, salt_hex, expected = stored.split("$", 2)
        if algorithm != "scrypt":
            return False
        actual = password_hash(password, bytes.fromhex(salt_hex)).split("$", 2)[2]
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def safe_user(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "name": row["name"], "email": row["email"], "role": row["role"],
            "country": row["country"], "curriculum": row["curriculum"],
            "subjects": json.loads(row["subjects"]), "levels": json.loads(row["levels"]), "radius_km": row["radius_km"],
            "available": bool(row["available"]), "verified": bool(row["verified"])}


def valid_coordinates(latitude, longitude) -> bool:
    try:
        return -90 <= float(latitude) <= 90 and -180 <= float(longitude) <= 180
    except (TypeError, ValueError):
        return False


def distance_km(first_lat, first_lon, second_lat, second_lon) -> float:
    radius = 6371.0
    lat1, lat2 = math.radians(first_lat), math.radians(second_lat)
    delta_lat = math.radians(second_lat - first_lat)
    delta_lon = math.radians(second_lon - first_lon)
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


class ReRaHandler(BaseHTTPRequestHandler):
    server_version = "ReRa/0.1"

    def log_message(self, format_string, *args):
        if os.environ.get("RERA_ACCESS_LOG", "1") == "1":
            super().log_message(format_string, *args)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' https://unpkg.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com https://images.unsplash.com https://upload.wikimedia.org https://thumb.wikimedia.org; connect-src 'self' https://unpkg.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        super().end_headers()

    def respond(self, status: int, data, headers: dict[str, str] | None = None) -> None:
        body = json.dumps(data, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def error(self, status: int, message: str) -> None:
        self.respond(status, {"error": message})

    def body_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("Invalid request size")
        if length < 1 or length > MAX_BODY:
            raise ValueError("Request must be under 7 MB")
        try:
            value = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError("Request body must be valid JSON")
        if not isinstance(value, dict):
            raise ValueError("Request body must be an object")
        return value

    def require_same_origin(self) -> bool:
        origin = self.headers.get("Origin")
        host = self.headers.get("Host")
        if not origin or not host:
            self.error(403, "Same-origin request required")
            return False
        parsed = urlparse(origin)
        if parsed.netloc != host or parsed.scheme not in {"http", "https"}:
            self.error(403, "Cross-origin request rejected")
            return False
        return True

    def current_user(self) -> sqlite3.Row | None:
        cookies = self.headers.get("Cookie", "")
        token = None
        for item in cookies.split(";"):
            key, separator, value = item.strip().partition("=")
            if separator and key == "rera_session":
                token = value
                break
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("ascii", "ignore")).hexdigest()
        with connect_db() as db:
            return db.execute("""SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = ? AND sessions.expires_at > ?""", (token_hash, now_iso())).fetchone()

    def require_user(self, roles: set[str] | None = None) -> sqlite3.Row | None:
        user = self.current_user()
        if not user:
            self.error(401, "Please sign in to continue")
            return None
        if roles and user["role"] not in roles:
            self.error(403, "This action is not available for your account")
            return None
        return user

    def rate_limited(self, key: str) -> bool:
        current = time.time()
        attempts = [stamp for stamp in FAILED_LOGINS.get(key, []) if current - stamp < 900]
        if len(attempts) >= 8:
            FAILED_LOGINS[key] = attempts
            self.error(429, "Too many attempts. Try again in 15 minutes.")
            return True
        attempts.append(current)
        FAILED_LOGINS[key] = attempts
        return False

    def issue_session(self, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds")
        with connect_db() as db:
            db.execute("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)", (token_hash, user_id, expires))
        secure = "; Secure" if os.environ.get("RERA_COOKIE_SECURE") == "1" else ""
        self.send_header("Set-Cookie", f"rera_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_DAYS * 86400}{secure}")
        return token

    def do_GET(self):
        parsed = urlparse(self.path)
        file_match = re.fullmatch(r"/api/resources/(\d+)/file", parsed.path)
        if file_match:
            return self.do_GET_resource_file(int(file_match.group(1)))
        if parsed.path.startswith("/api/"):
            return self.api_get(parsed.path, parse_qs(parsed.query))
        static = {"/": ("index.html", "text/html; charset=utf-8"), "/index.html": ("index.html", "text/html; charset=utf-8"),
              "/welcome": ("index.html", "text/html; charset=utf-8"),
                  "/app": ("app.html", "text/html; charset=utf-8"), "/app.html": ("app.html", "text/html; charset=utf-8"),
                  "/app.js": ("app.js", "text/javascript; charset=utf-8"), "/welcome.js": ("welcome.js", "text/javascript; charset=utf-8"),
                  "/regional-images.js": ("regional-images.js", "text/javascript; charset=utf-8"),
                  "/home-tutor-women.webp": ("home-tutor-women.webp", "image/webp"),
                  "/home-online-tutoring.jpg": ("home-online-tutoring.jpg", "image/jpeg"),
                  "/home-family-study.jpg": ("home-family-study.jpg", "image/jpeg"),
                  "/home-mentor-support.jpeg": ("home-mentor-support.jpeg", "image/jpeg"),
                  "/home-learning-partners.webp": ("home-learning-partners.webp", "image/webp"),
                  "/welcome-dashboard.css": ("welcome-dashboard.css", "text/css; charset=utf-8"),
                  "/styles.css": ("styles.css", "text/css; charset=utf-8"),
              "/app-overrides.css": ("app-overrides.css", "text/css; charset=utf-8"), "/favicon.ico": (None, "image/x-icon")}
        entry = static.get(parsed.path)
        if not entry:
            self.send_error(404)
            return
        filename, content_type = entry
        if not filename:
            self.send_response(204)
            self.end_headers()
            return
        file_path = PUBLIC_DIR / filename
        if not file_path.is_file():
            self.send_error(404)
            return
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not self.require_same_origin():
            return
        parsed = urlparse(self.path)
        try:
            payload = self.body_json()
            if parsed.path == "/api/signup":
                return self.signup(payload)
            if parsed.path == "/api/login":
                return self.login(payload)
            if parsed.path == "/api/logout":
                return self.logout()
            if parsed.path == "/api/students":
                return self.create_student(payload)
            if parsed.path == "/api/requests":
                return self.create_request(payload)
            if parsed.path == "/api/teacher/profile":
                return self.update_teacher_profile(payload)
            if parsed.path == "/api/nearby-teachers":
                return self.list_nearby_teachers(payload)
            if parsed.path == "/api/resources":
                return self.create_resource(payload)
            verify_match = re.fullmatch(r"/api/teachers/(\d+)/verify", parsed.path)
            if verify_match:
                return self.verify_teacher(int(verify_match.group(1)))
            pitch_match = re.fullmatch(r"/api/requests/(\d+)/pitch", parsed.path)
            if pitch_match:
                return self.pitch(int(pitch_match.group(1)), payload)
            offer_match = re.fullmatch(r"/api/pitches/(\d+)/(accept|decline)", parsed.path)
            if offer_match:
                return self.update_pitch(int(offer_match.group(1)), offer_match.group(2))
            if parsed.path == "/api/feedback":
                return self.save_feedback(payload)
            self.error(404, "API route not found")
        except ValueError as exception:
            self.error(400, str(exception))
        except sqlite3.IntegrityError:
            self.error(409, "That record already exists or is no longer available")
        except Exception:
            self.log_error("Unhandled application error")
            self.error(500, "The request could not be completed")

    def do_DELETE(self):
        if not self.require_same_origin():
            return
        parsed = urlparse(self.path)
        match = re.fullmatch(r"/api/resources/(\d+)", parsed.path)
        if match:
            user = self.require_user({"teacher", "manager"})
            if not user:
                return
            with connect_db() as db:
                resource = db.execute("SELECT * FROM resources WHERE id = ?", (match.group(1),)).fetchone()
                if not resource:
                    return self.error(404, "Resource not found")
                if user["role"] != "manager" and resource["owner_id"] != user["id"]:
                    return self.error(403, "You can only remove your own materials")
                db.execute("DELETE FROM resources WHERE id = ?", (resource["id"],))
            if resource["file_name"]:
                (UPLOAD_DIR / resource["file_name"]).unlink(missing_ok=True)
            return self.respond(200, {"ok": True})
        self.error(404, "API route not found")

    def signup(self, payload: dict) -> None:
        ip = self.client_address[0]
        if self.rate_limited(f"signup:{ip}"):
            return
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))
        password_confirm = str(payload.get("password_confirm", ""))
        role = str(payload.get("role", ""))
        country = str(payload.get("country", ""))
        curriculum = str(payload.get("curriculum", ""))
        subjects = payload.get("subjects", [])
        levels = payload.get("levels", [])
        if len(name) < 2 or len(name) > 80:
            raise ValueError("Enter a name between 2 and 80 characters")
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or len(email) > 254:
            raise ValueError("Enter a valid email address")
        if len(password) < 12 or len(password) > 256:
            raise ValueError("Use a password between 12 and 256 characters")
        if password != password_confirm:
            raise ValueError("Passwords do not match")
        if role not in ROLES:
            raise ValueError("Choose a parent or teacher account")
        if country not in COUNTRIES or curriculum not in CURRICULA[country]:
            raise ValueError("Choose a curriculum offered in your country")
        if not isinstance(subjects, list) or len(subjects) > 20 or any(not isinstance(item, str) or len(item) > 60 for item in subjects):
            raise ValueError("Choose valid teaching subjects")
        if not isinstance(levels, list) or any(item not in LEVELS for item in levels):
            raise ValueError("Choose valid academic levels")
        if role == "teacher" and not subjects:
            raise ValueError("Select at least one subject you teach")
        if role == "teacher" and not levels:
            raise ValueError("Select at least one academic level you teach")
        if role == "parent":
            subjects = []
            levels = []
        with connect_db() as db:
            cursor = db.execute("""INSERT INTO users(name, email, password_hash, role, country, curriculum, subjects, levels, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""", (name, email, password_hash(password), role, country, curriculum, json.dumps(subjects), json.dumps(levels), now_iso()))
            user_id = cursor.lastrowid
        self.send_response(201)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.issue_session(user_id)
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "role": role}).encode())

    def login(self, payload: dict) -> None:
        ip = self.client_address[0]
        email = str(payload.get("email", "")).strip().lower()
        if self.rate_limited(f"login:{ip}:{email[:100]}"):
            return
        with connect_db() as db:
            row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not row or not verify_password(str(payload.get("password", "")), row["password_hash"]):
            self.error(401, "Email or password was not recognized")
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.issue_session(row["id"])
        self.end_headers()
        self.wfile.write(json.dumps({"user": safe_user(row)}).encode())

    def logout(self) -> None:
        cookies = self.headers.get("Cookie", "")
        token = next((item.strip().partition("=")[2] for item in cookies.split(";") if item.strip().startswith("rera_session=")), "")
        if token:
            token_hash = hashlib.sha256(token.encode("ascii", "ignore")).hexdigest()
            with connect_db() as db:
                db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        self.respond(200, {"ok": True}, {"Set-Cookie": "rera_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"})

    def api_get(self, path: str, query: dict) -> None:
        if path == "/api/me":
            user = self.current_user()
            if not user:
                return self.error(401, "Not signed in")
            return self.respond(200, {"user": safe_user(user)})
        if path == "/api/resources":
            user = self.require_user()
            if not user:
                return
            return self.list_resources(user, query)
        user = self.require_user()
        if not user:
            return
        if path == "/api/students":
            return self.list_students(user)
        if path == "/api/families":
            if user["role"] != "manager":
                return self.error(403, "Manager access required")
            return self.list_families()
        if path == "/api/requests":
            return self.list_requests(user)
        if path == "/api/teachers":
            if user["role"] != "manager":
                return self.error(403, "Manager access required")
            return self.list_teachers(query)
        if path == "/api/pitches":
            return self.list_pitches(user)
        if path == "/api/feedback":
            return self.list_feedback(user)
        if path == "/api/coordinates":
            if user["role"] != "manager":
                return self.error(403, "Manager access required")
            return self.list_coordinates(query)
        self.error(404, "API route not found")

    def create_student(self, payload: dict) -> None:
        user = self.require_user({"parent"})
        if not user:
            return
        name = str(payload.get("name", "")).strip()
        country = str(payload.get("country", user["country"]))
        curriculum = str(payload.get("curriculum", user["curriculum"]))
        level = str(payload.get("level", ""))
        grade = str(payload.get("grade", "")).strip()
        if not name or len(name) > 80 or country not in COUNTRIES or curriculum not in CURRICULA[country] or level not in LEVELS or not grade or len(grade) > 50:
            raise ValueError("Complete the learner name, country, curriculum, level, and grade")
        with connect_db() as db:
            cursor = db.execute("""INSERT INTO students(parent_id, name, country, curriculum, level, grade, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""", (user["id"], name, country, curriculum, level, grade, now_iso()))
        return self.respond(201, {"id": cursor.lastrowid, "name": name})

    def list_students(self, user: sqlite3.Row) -> None:
        if user["role"] != "parent":
            return self.respond(200, [])
        with connect_db() as db:
            rows = db.execute("SELECT id, name, country, curriculum, level, grade FROM students WHERE parent_id = ? ORDER BY id", (user["id"],)).fetchall()
        return self.respond(200, [dict(row) for row in rows])

    def list_families(self) -> None:
        with connect_db() as db:
            rows = db.execute("""SELECT u.id AS parent_id, u.name AS parent_name, u.email AS parent_email,
                u.country AS parent_country, u.curriculum AS parent_curriculum, u.created_at AS parent_created_at,
                s.id AS student_id, s.name AS student_name, s.country AS student_country,
                s.curriculum AS student_curriculum, s.level AS student_level, s.grade AS student_grade
                FROM users u LEFT JOIN students s ON s.parent_id = u.id
                WHERE u.role = 'parent' ORDER BY u.created_at DESC, u.id, s.id""").fetchall()
        families = {}
        for row in rows:
            family = families.setdefault(row["parent_id"], {
                "id": row["parent_id"],
                "name": row["parent_name"],
                "email": row["parent_email"],
                "country": row["parent_country"],
                "curriculum": row["parent_curriculum"],
                "created_at": row["parent_created_at"],
                "learners": [],
            })
            if row["student_id"] is not None:
                family["learners"].append({
                    "id": row["student_id"],
                    "name": row["student_name"],
                    "country": row["student_country"],
                    "curriculum": row["student_curriculum"],
                    "level": row["student_level"],
                    "grade": row["student_grade"],
                })
        return self.respond(200, list(families.values()))

    def create_request(self, payload: dict) -> None:
        user = self.require_user({"parent"})
        if not user:
            return
        try:
            student_id = int(payload.get("student_id"))
            radius = int(payload.get("radius_km", 10))
        except (TypeError, ValueError):
            raise ValueError("Choose a learner and a valid search radius")
        with connect_db() as db:
            student = db.execute("SELECT * FROM students WHERE id = ? AND parent_id = ?", (student_id, user["id"])).fetchone()
            if not student:
                raise ValueError("Choose a learner in your family account")
            country = student["country"]
            curriculum = student["curriculum"]
            level = student["level"]
            grade = student["grade"]
            subject = str(payload.get("subject", "")).strip()
            location = str(payload.get("location", "")).strip()
            mode = str(payload.get("mode", "In person"))
            if not subject or len(subject) > 80 or not location or len(location) > 120:
                raise ValueError("Add a subject and neighborhood or town")
            if mode not in {"In person", "Online", "Either"} or radius not in {5, 10, 20, 50}:
                raise ValueError("Choose a valid lesson format and radius")
            lat, lon = payload.get("latitude"), payload.get("longitude")
            if mode == "In person" and not valid_coordinates(lat, lon):
                raise ValueError("Allow location access or choose online lessons")
            if mode == "Online":
                lat = lon = None
            elif valid_coordinates(lat, lon):
                lat, lon = float(lat), float(lon)
            else:
                lat = lon = None
            cursor = db.execute("""INSERT INTO learning_requests
                (parent_id, student_id, country, curriculum, level, grade, subject, location_label, latitude, longitude,
                 radius_km, mode, availability, goal, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (user["id"], student_id, country, curriculum, level, grade, subject, location, lat, lon, radius, mode,
                 str(payload.get("availability", "Flexible"))[:80], str(payload.get("goal", "")).strip()[:1000], now_iso()))
        return self.respond(201, {"id": cursor.lastrowid, "status": "Matching"})

    def list_requests(self, user: sqlite3.Row) -> None:
        with connect_db() as db:
            if user["role"] == "manager":
                rows = db.execute("""SELECT r.*, s.name AS learner_name FROM learning_requests r
                    JOIN students s ON s.id = r.student_id ORDER BY r.created_at DESC""").fetchall()
                result = [dict(row) for row in rows]
            elif user["role"] == "parent":
                rows = db.execute("""SELECT r.*, s.name AS learner_name FROM learning_requests r
                    JOIN students s ON s.id = r.student_id WHERE r.parent_id = ? ORDER BY r.created_at DESC""", (user["id"],)).fetchall()
                result = [dict(row) for row in rows]
            else:
                rows = db.execute("""SELECT r.id, r.country, r.curriculum, r.level, r.grade, r.subject, r.location_label,
                    r.radius_km, r.mode, r.availability, r.goal, r.status, r.created_at, p.status AS pitch_status
                    FROM pitches p JOIN learning_requests r ON r.id = p.request_id
                    WHERE p.teacher_id = ? AND p.status IN ('Offered', 'Accepted') ORDER BY p.created_at DESC""", (user["id"],)).fetchall()
                result = [dict(row) for row in rows]
                for item in result:
                    item.pop("latitude", None)
                    item.pop("longitude", None)
            return self.respond(200, result)

    def list_teachers(self, query: dict) -> None:
        with connect_db() as db:
            rows = db.execute("""SELECT id, name, country, curriculum, subjects, levels, latitude, longitude, radius_km,
                available, verified FROM users WHERE role = 'teacher' ORDER BY verified DESC, name""").fetchall()
        result = []
        for row in rows:
            teacher = dict(row)
            teacher["subjects"] = json.loads(teacher["subjects"])
            teacher["levels"] = json.loads(teacher["levels"])
            teacher["available"] = bool(teacher["available"])
            teacher["verified"] = bool(teacher["verified"])
            result.append(teacher)
        return self.respond(200, result)

    def list_coordinates(self, query: dict) -> None:
        try:
            request_id = int(query.get("request_id", [""])[0])
        except ValueError:
            raise ValueError("Select a valid learning request")
        with connect_db() as db:
            request = db.execute("SELECT * FROM learning_requests WHERE id = ?", (request_id,)).fetchone()
            if not request:
                return self.error(404, "Learning request not found")
            teachers = self.matching_teachers(request, db)
        points = []
        if request["latitude"] is not None:
            points.append({"type": "request", "latitude": request["latitude"], "longitude": request["longitude"], "label": "Lesson area"})
        for teacher in teachers:
            if teacher["latitude"] is not None:
                points.append({"type": "teacher", "id": teacher["id"], "latitude": teacher["latitude"],
                               "longitude": teacher["longitude"], "label": teacher["name"]})
        return self.respond(200, {"points": points, "request": {"id": request["id"], "country": request["country"], "location_label": request["location_label"], "radius_km": request["radius_km"]}})

    def list_nearby_teachers(self, payload: dict) -> None:
        if not self.require_user():
            return
        latitude, longitude = payload.get("latitude"), payload.get("longitude")
        if not valid_coordinates(latitude, longitude):
            raise ValueError("Location coordinates are invalid")
        try:
            radius_value = float(payload.get("radius_km", 10))
        except (ValueError, TypeError):
            raise ValueError("Choose a valid search radius")
        if not radius_value.is_integer() or int(radius_value) not in {5, 10, 20, 50}:
            raise ValueError("Choose a 5, 10, 20 or 50 km search radius")
        radius = int(radius_value)
        with connect_db() as db:
            candidates = db.execute("""SELECT country, curriculum, latitude, longitude, radius_km
                FROM users WHERE role = 'teacher' AND verified = 1 AND available = 1
                AND latitude IS NOT NULL AND longitude IS NOT NULL""").fetchall()
        points = []
        for teacher in candidates:
            distance = distance_km(latitude, longitude, teacher["latitude"], teacher["longitude"])
            if distance <= radius and distance <= teacher["radius_km"]:
                points.append({
                    "latitude": round(float(teacher["latitude"]), 2),
                    "longitude": round(float(teacher["longitude"]), 2),
                    "country": teacher["country"],
                    "curriculum": teacher["curriculum"],
                })
        return self.respond(200, {"radius_km": radius, "points": points})

    def verify_teacher(self, teacher_id: int) -> None:
        manager = self.require_user({"manager"})
        if not manager:
            return
        with connect_db() as db:
            cursor = db.execute("UPDATE users SET verified = 1 WHERE id = ? AND role = 'teacher'", (teacher_id,))
            if not cursor.rowcount:
                return self.error(404, "Educator not found")
        return self.respond(200, {"ok": True})

    def update_teacher_profile(self, payload: dict) -> None:
        user = self.require_user({"teacher"})
        if not user:
            return
        radius = payload.get("radius_km", 10)
        try:
            radius = int(radius)
        except (ValueError, TypeError):
            raise ValueError("Choose a valid travel radius")
        if radius not in {5, 10, 20, 50}:
            raise ValueError("Choose a 5, 10, 20 or 50 km radius")
        lat, lon = payload.get("latitude"), payload.get("longitude")
        if lat is not None and lon is not None and not valid_coordinates(lat, lon):
            raise ValueError("Location coordinates are invalid")
        if (lat is None) != (lon is None):
            raise ValueError("Both location coordinates are required")
        available = bool(payload.get("available", True))
        with connect_db() as db:
            db.execute("UPDATE users SET latitude = ?, longitude = ?, radius_km = ?, available = ? WHERE id = ?",
                       (float(lat) if lat is not None else None, float(lon) if lon is not None else None, radius, int(available), user["id"]))
        return self.respond(200, {"ok": True})

    def matching_teachers(self, request: sqlite3.Row, db: sqlite3.Connection) -> list[sqlite3.Row]:
        teachers = db.execute("""SELECT * FROM users WHERE role = 'teacher' AND verified = 1 AND available = 1
            AND country = ? AND curriculum = ?""", (request["country"], request["curriculum"])).fetchall()
        matched = []
        for teacher in teachers:
            subjects = json.loads(teacher["subjects"])
            levels = json.loads(teacher["levels"])
            if request["subject"] not in subjects or request["level"] not in levels:
                continue
            if request["latitude"] is not None and teacher["latitude"] is not None:
                distance = distance_km(request["latitude"], request["longitude"], teacher["latitude"], teacher["longitude"])
                if distance > request["radius_km"] or distance > teacher["radius_km"]:
                    continue
            elif request["mode"] == "In person":
                continue
            matched.append(teacher)
        return matched

    def pitch(self, request_id: int, payload: dict) -> None:
        user = self.require_user({"manager"})
        if not user:
            return
        try:
            teacher_id = int(payload.get("teacher_id"))
        except (TypeError, ValueError):
            raise ValueError("Choose an educator")
        with connect_db() as db:
            request = db.execute("SELECT * FROM learning_requests WHERE id = ?", (request_id,)).fetchone()
            teacher = db.execute("SELECT * FROM users WHERE id = ? AND role = 'teacher'", (teacher_id,)).fetchone()
            if not request or not teacher:
                raise ValueError("Request or educator not found")
            candidates = self.matching_teachers(request, db)
            if teacher_id not in {item["id"] for item in candidates}:
                raise ValueError("This educator does not currently meet all request criteria")
            db.execute("INSERT OR IGNORE INTO pitches(request_id, teacher_id, created_at) VALUES (?, ?, ?)", (request_id, teacher_id, now_iso()))
            db.execute("UPDATE learning_requests SET status = 'Pitched' WHERE id = ?", (request_id,))
        return self.respond(201, {"ok": True})

    def list_pitches(self, user: sqlite3.Row) -> None:
        if user["role"] == "teacher":
            with connect_db() as db:
                rows = db.execute("""SELECT p.request_id, p.status AS pitch_status, r.country, r.curriculum, r.level,
                    r.grade, r.subject, r.location_label, r.radius_km, r.mode, r.availability, r.goal
                    FROM pitches p JOIN learning_requests r ON r.id = p.request_id
                    WHERE p.teacher_id = ? ORDER BY p.created_at DESC""", (user["id"],)).fetchall()
            return self.respond(200, [dict(row) for row in rows])
        if user["role"] == "parent":
            with connect_db() as db:
                rows = db.execute("""SELECT p.request_id, p.status AS pitch_status, u.name AS teacher_name,
                    u.country, u.curriculum, u.subjects, u.verified FROM pitches p
                    JOIN learning_requests r ON r.id = p.request_id JOIN users u ON u.id = p.teacher_id
                    WHERE r.parent_id = ? ORDER BY p.created_at DESC""", (user["id"],)).fetchall()
            result = [dict(row) for row in rows]
            for item in result:
                item["subjects"] = json.loads(item["subjects"])
                item["verified"] = bool(item["verified"])
            return self.respond(200, result)
        return self.respond(200, [])

    def update_pitch(self, request_id: int, action: str) -> None:
        user = self.require_user({"teacher"})
        if not user:
            return
        status = "Accepted" if action == "accept" else "Declined"
        with connect_db() as db:
            cursor = db.execute("UPDATE pitches SET status = ? WHERE request_id = ? AND teacher_id = ? AND status = 'Offered'", (status, request_id, user["id"]))
            if cursor.rowcount != 1:
                return self.error(404, "Offer not found or already answered")
            if action == "accept":
                db.execute("UPDATE learning_requests SET status = 'Matched' WHERE id = ?", (request_id,))
        return self.respond(200, {"ok": True, "status": status})

    def list_resources(self, user: sqlite3.Row, query: dict) -> None:
        filters = []
        parameters: list[str] = []
        if user["role"] == "teacher":
            filters.append("(r.owner_id IS NULL OR r.owner_id = ?)")
            parameters.append(user["id"])
        elif user["role"] == "parent":
            filters.append("(r.owner_id IS NULL OR EXISTS (SELECT 1 FROM pitches p JOIN learning_requests lr ON lr.id = p.request_id WHERE p.teacher_id = r.owner_id AND lr.parent_id = ? AND p.status = 'Accepted'))")
            parameters.append(user["id"])
        for key in ("kind", "country", "curriculum", "level", "subject"):
            value = query.get(key, [""])[0].strip()
            if value:
                filters.append(f"{key} = ?")
                parameters.append(value)
        where = " AND ".join(filters) if filters else "1=1"
        with connect_db() as db:
            rows = db.execute(f"""SELECT r.id, r.title, r.kind, r.country, r.curriculum, r.level, r.subject,
                r.description, r.url, r.owner_id, r.file_name, r.created_at, u.name AS author
                FROM resources r LEFT JOIN users u ON u.id = r.owner_id
                WHERE r.published = 1 AND {where} ORDER BY r.kind, r.country, r.curriculum, r.title""", parameters).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["can_delete"] = user["role"] == "manager" or item["owner_id"] == user["id"]
            item["download_url"] = f"/api/resources/{item['id']}/file" if item["file_name"] else None
            item.pop("file_name", None)
            item.pop("owner_id", None)
            result.append(item)
        return self.respond(200, result)

    def create_resource(self, payload: dict) -> None:
        user = self.require_user({"teacher", "manager"})
        if not user:
            return
        title = str(payload.get("title", "")).strip()
        description = str(payload.get("description", "")).strip()
        country = str(payload.get("country", user["country"]))
        curriculum = str(payload.get("curriculum", user["curriculum"]))
        level = str(payload.get("level", "All levels"))
        subject = str(payload.get("subject", "All subjects"))
        encoded = str(payload.get("file_base64", ""))
        if not title or len(title) > 140 or len(description) > 1000:
            raise ValueError("Enter a title and a description under 1,000 characters")
        if country not in COUNTRIES or curriculum not in CURRICULA[country] or (level not in LEVELS | {"All levels"}):
            raise ValueError("Choose a valid country, curriculum and academic level")
        if not encoded or len(encoded) > MAX_PDF_BYTES * 4 // 3 + 16:
            raise ValueError("Choose a PDF under 5 MB")
        try:
            file_content = base64.b64decode(encoded, validate=True)
        except ValueError:
            raise ValueError("That file is not a valid PDF upload")
        if len(file_content) > MAX_PDF_BYTES or not file_content.startswith(b"%PDF-"):
            raise ValueError("Only valid PDF files under 5 MB are accepted")
        file_name = f"{uuid.uuid4().hex}.pdf"
        destination = UPLOAD_DIR / file_name
        destination.write_bytes(file_content)
        try:
            with connect_db() as db:
                cursor = db.execute("""INSERT INTO resources
                    (title, kind, country, curriculum, level, subject, description, owner_id, file_name, created_at)
                    VALUES (?, 'material', ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (title, country, curriculum, level, subject, description, user["id"], file_name, now_iso()))
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        return self.respond(201, {"id": cursor.lastrowid, "ok": True})

    def do_GET_resource_file(self, resource_id: int) -> None:
        user = self.require_user()
        if not user:
            return
        with connect_db() as db:
            resource = db.execute("""SELECT r.file_name FROM resources r WHERE r.id = ? AND r.published = 1 AND (
                ? = 'manager' OR r.owner_id IS NULL OR (? = 'teacher' AND r.owner_id = ?) OR
                (? = 'parent' AND EXISTS (SELECT 1 FROM pitches p JOIN learning_requests lr ON lr.id = p.request_id
                    WHERE p.teacher_id = r.owner_id AND lr.parent_id = ? AND p.status = 'Accepted'))
            )""", (resource_id, user["role"], user["role"], user["id"], user["role"], user["id"])).fetchone()
        if not resource or not resource["file_name"]:
            return self.error(404, "Material not found")
        content = (UPLOAD_DIR / resource["file_name"]).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Disposition", f"attachment; filename=ReRa-material-{resource_id}.pdf")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def save_feedback(self, payload: dict) -> None:
        user = self.require_user({"parent"})
        if not user:
            return
        try:
            rating = int(payload.get("rating"))
        except (TypeError, ValueError):
            raise ValueError("Choose a rating from 1 to 5")
        if rating not in range(1, 6):
            raise ValueError("Choose a rating from 1 to 5")
        request_id = payload.get("request_id")
        comment = str(payload.get("comment", "")).strip()[:1000]
        with connect_db() as db:
            owned = db.execute("SELECT id FROM learning_requests WHERE id = ? AND parent_id = ?", (request_id, user["id"])).fetchone()
            if not owned:
                raise ValueError("That learning request is not in your family account")
            db.execute("INSERT OR REPLACE INTO feedback(request_id, parent_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)",
                       (request_id, user["id"], rating, comment, now_iso()))
        return self.respond(201, {"ok": True})

    def list_feedback(self, user: sqlite3.Row) -> None:
        if user["role"] not in {"manager", "parent"}:
            return self.respond(200, [])
        with connect_db() as db:
            if user["role"] == "manager":
                rows = db.execute("SELECT request_id, rating, comment, created_at FROM feedback ORDER BY created_at DESC").fetchall()
            else:
                rows = db.execute("SELECT request_id, rating, comment, created_at FROM feedback WHERE parent_id = ? ORDER BY created_at DESC", (user["id"],)).fetchall()
        return self.respond(200, [dict(row) for row in rows])

def create_manager(name: str, email: str) -> None:
    initialize_database()
    email = email.strip().lower()
    with connect_db() as db:
        existing_user = db.execute("SELECT role FROM users WHERE email = ?", (email,)).fetchone()
    if existing_user and existing_user["role"] == "manager":
        print(f"A manager account already exists for {email}.")
        return
    if existing_user and existing_user["role"] != "parent":
        print(f"The email {email} belongs to a {existing_user['role']} account and cannot be promoted.", file=sys.stderr)
        raise SystemExit(2)

    password = getpass("Manager password (12+ characters): ")
    if len(password) < 12:
        print("Password must be at least 12 characters.", file=sys.stderr)
        raise SystemExit(2)
    country = input("Country (Rwanda, Kenya, Uganda, Tanzania): ").strip()
    if country not in COUNTRIES:
        print("Choose a supported country.", file=sys.stderr)
        raise SystemExit(2)
    curriculum = sorted(CURRICULA[country])[0]
    hashed_password = password_hash(password)
    promoted = False
    with connect_db() as db:
        existing_user = db.execute("SELECT id, role FROM users WHERE email = ?", (email,)).fetchone()
        if existing_user:
            if existing_user["role"] != "parent":
                print(f"The email {email} belongs to a {existing_user['role']} account and cannot be promoted.", file=sys.stderr)
                raise SystemExit(2)
            db.execute("DELETE FROM sessions WHERE user_id = ?", (existing_user["id"],))
            db.execute("""UPDATE users
                SET name = ?, password_hash = ?, role = 'manager', country = ?, curriculum = ?
                WHERE id = ?""", (name, hashed_password, country, curriculum, existing_user["id"]))
            promoted = True
        else:
            db.execute("""INSERT INTO users(name, email, password_hash, role, country, curriculum, created_at)
                VALUES (?, ?, ?, 'manager', ?, ?, ?)""", (name, email, hashed_password, country, curriculum, now_iso()))
    if promoted:
        print(f"Parent account promoted to manager for {email}. Sign in again with the manager password.")
    else:
        print(f"Manager account created for {email}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="ReRa local development server")
    parser.add_argument("--host", default=os.environ.get("RERA_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("RERA_PORT", "8000")))
    parser.add_argument("command", nargs="?", choices={"create-manager"}, help=argparse.SUPPRESS)
    parser.add_argument("--name", default="ReRa Manager")
    parser.add_argument("--email", default="")
    arguments = parser.parse_args()
    initialize_database()
    if arguments.command == "create-manager":
        if not arguments.email:
            parser.error("create-manager requires --email")
        create_manager(arguments.name, arguments.email)
        return
    server = ThreadingHTTPServer((arguments.host, arguments.port), ReRaHandler)
    print(f"ReRa is running at http://{arguments.host}:{arguments.port}/")
    print("For public deployment, put this behind HTTPS and set RERA_COOKIE_SECURE=1.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\\nStopping ReRa.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
