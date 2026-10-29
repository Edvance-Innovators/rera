#!/usr/bin/env python3
"""Create the first manager account in a deployed ReRa Cloudflare Worker."""

import argparse
import getpass
import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


CURRICULA = {
    "Rwanda": ["REB", "Cambridge / IB"],
    "Kenya": ["CBC", "8-4-4"],
    "Uganda": ["UNEB"],
    "Tanzania": ["NECTA"],
}


def masked_getpass(prompt: str) -> str:
    if not sys.stdin.isatty():
        return getpass.getpass(prompt)

    sys.stderr.write(prompt)
    sys.stderr.flush()
    value = bytearray()

    if os.name == "nt":
        import msvcrt

        while True:
            char = msvcrt.getwch()
            if char in {"\r", "\n"}:
                break
            if char in {"\b", "\x7f"}:
                if value:
                    value.pop()
                    sys.stderr.write("\b \b")
                    sys.stderr.flush()
            elif char == "\x03":
                raise KeyboardInterrupt
            elif char == "\x1a":
                raise EOFError
            elif char.isprintable():
                value.extend(char.encode("utf-8"))
                sys.stderr.write("*")
                sys.stderr.flush()
    else:
        import termios

        descriptor = sys.stdin.fileno()
        original = termios.tcgetattr(descriptor)
        masked = original.copy()
        masked[3] &= ~(termios.ECHO | termios.ICANON)
        masked[6][termios.VMIN] = 1
        masked[6][termios.VTIME] = 0
        termios.tcsetattr(descriptor, termios.TCSADRAIN, masked)
        try:
            while True:
                char = os.read(descriptor, 1)
                if char in {b"\r", b"\n"}:
                    break
                if char in {b"\x7f", b"\x08"}:
                    if value:
                        value.pop()
                        sys.stderr.write("\b \b")
                        sys.stderr.flush()
                elif char == b"\x04":
                    raise EOFError
                elif char == b"\x15":
                    if value:
                        length = len(value)
                        value.clear()
                        sys.stderr.write("\b \b" * length)
                        sys.stderr.flush()
                elif char >= b" ":
                    value.extend(char)
                    sys.stderr.write("*")
                    sys.stderr.flush()
        finally:
            termios.tcsetattr(descriptor, termios.TCSADRAIN, original)

    sys.stderr.write("\n")
    sys.stderr.flush()
    return value.decode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("worker_url", help="Worker origin, for example https://rera.example.workers.dev")
    args = parser.parse_args()

    parsed = urlsplit(args.worker_url)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
        parser.error("Provide a valid HTTPS Worker URL.")
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        parser.error("Use HTTPS except when testing against localhost.")

    name = input("Manager name: ").strip()
    email = input("Manager email: ").strip()
    setup_token = masked_getpass("One-time setup token: ").strip()
    password = getpass.getpass("Manager password (12–256 characters): ")
    if password != getpass.getpass("Confirm manager password: "):
        parser.error("Passwords do not match.")
    if len(password) < 12 or len(password) > 256:
        parser.error("Password must be between 12 and 256 characters.")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", setup_token):
        parser.error("Setup token must be exactly 64 hexadecimal characters. Paste only the token value.")

    country = input(f"Country ({', '.join(CURRICULA)}) [Rwanda]: ").strip() or "Rwanda"
    if country not in CURRICULA:
        parser.error("Choose Rwanda, Kenya, Uganda, or Tanzania.")
    curriculum_options = CURRICULA[country]
    curriculum = input(f"Curriculum ({', '.join(curriculum_options)}) [{curriculum_options[0]}]: ").strip() or curriculum_options[0]
    if curriculum not in curriculum_options:
        parser.error(f"Choose one of: {', '.join(curriculum_options)}.")

    payload = json.dumps({
        "name": name,
        "email": email,
        "password": password,
        "country": country,
        "curriculum": curriculum,
    }).encode()
    request = Request(
        f"{parsed.scheme}://{parsed.netloc}/api/manager/bootstrap",
        data=payload,
        headers={
            "Authorization": f"Bearer {setup_token}",
            "Content-Type": "application/json",
            "User-Agent": "curl/8.0",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as result:
            response_body = json.loads(result.read())
    except HTTPError as error:
        body = error.read()
        try:
            response_body = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            response_body = None
        if isinstance(response_body, dict) and isinstance(response_body.get("error"), str):
            message = response_body["error"]
        else:
            message = f"The Worker returned HTTP {error.code}."
            ray_id = error.headers.get("cf-ray")
            content_type = error.headers.get("content-type")
            if ray_id:
                message += f" Cloudflare Ray ID: {ray_id}."
            if content_type:
                message += f" Content-Type: {content_type}."
            if body:
                detail = body.decode("utf-8", errors="replace").strip()
                if detail:
                    message += f"\nResponse: {detail[:1000]}"
        print(message, file=sys.stderr)
        return 1
    except (URLError, TimeoutError) as error:
        print(f"Could not reach the ReRa Worker: {error}", file=sys.stderr)
        return 1

    print(response_body["message"])
    print(f"Sign in at {parsed.scheme}://{parsed.netloc}/ using {email}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
