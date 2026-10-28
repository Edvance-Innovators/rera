#!/usr/bin/env python3
"""Create the first manager account in a deployed ReRa Cloudflare Worker."""

import argparse
import getpass
import json
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
    setup_token = getpass.getpass("One-time setup token: ").strip()
    password = getpass.getpass("Manager password (12–256 characters): ")
    if password != getpass.getpass("Confirm manager password: "):
        parser.error("Passwords do not match.")
    if len(password) < 12 or len(password) > 256:
        parser.error("Password must be between 12 and 256 characters.")
    if len(setup_token) < 64:
        parser.error("Setup token must contain at least 64 characters.")

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
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as result:
            response_body = json.loads(result.read())
    except HTTPError as error:
        try:
            message = json.loads(error.read()).get("error", "The Worker rejected the request.")
        except (json.JSONDecodeError, AttributeError):
            message = f"The Worker returned HTTP {error.code}."
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
