#!/usr/bin/env python3
"""Official Miteiru analyzer CLI.

This CLI is a thin client for the analyzer server exposed by the running
Miteiru desktop app. It never performs standalone analysis.

Examples:
  python scripts/miteiru_cli.py health
  python scripts/miteiru_cli.py analyze "見たよ"
  python scripts/miteiru_cli.py analyze --stdin < lines.txt
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


REGISTRATION_FILENAME = "analyzer-server.json"
TOKEN_HEADER = "X-Miteiru-Analyzer-Token"
DEFAULT_TIMEOUT_SECONDS = 5.0


class MiteiruCliError(Exception):
    """A user-facing CLI error."""


def default_user_data_dirs() -> list[Path]:
    override = os.environ.get("MITEIRU_USER_DATA_DIR")
    if override:
        return [Path(override).expanduser()]

    system = platform.system()
    if system == "Windows":
        base = os.environ.get("APPDATA")
        if not base:
            raise MiteiruCliError("APPDATA is not set; cannot locate Miteiru user data.")
        root = Path(base)
        return [root / "miteiru", root / "miteiru (development)"]

    if system == "Darwin":
        root = Path.home() / "Library" / "Application Support"
        return [root / "miteiru", root / "miteiru (development)"]

    config_home = os.environ.get("XDG_CONFIG_HOME")
    root = Path(config_home) if config_home else Path.home() / ".config"
    return [root / "miteiru", root / "miteiru (development)"]


def registration_paths(args: argparse.Namespace) -> list[Path]:
    if args.registration:
        return [Path(args.registration).expanduser()]
    return [directory / REGISTRATION_FILENAME for directory in default_user_data_dirs()]


def registration_path_hint(paths: list[Path]) -> str:
    if len(paths) == 1:
        return str(paths[0])
    return ", ".join(str(path) for path in paths)


def load_registration(args: argparse.Namespace) -> dict[str, Any]:
    paths = registration_paths(args)
    first_invalid_json: tuple[Path, json.JSONDecodeError] | None = None
    for path in paths:
        try:
            with path.open("r", encoding="utf-8") as file:
                registration = json.load(file)
        except FileNotFoundError:
            continue
        except json.JSONDecodeError as exc:
            first_invalid_json = first_invalid_json or (path, exc)
            continue

        for key in ("host", "port", "token"):
            if key not in registration:
                raise MiteiruCliError(f"Miteiru analyzer registration is missing `{key}`: {path}")
        return registration

    if first_invalid_json:
        path, exc = first_invalid_json
        raise MiteiruCliError(f"Miteiru analyzer registration is invalid JSON: {path}") from exc

    raise MiteiruCliError(
        "Miteiru analyzer server not found. Open Miteiru and select a language first. "
        f"Checked: {registration_path_hint(paths)}"
    )


def request_json(
    registration: dict[str, Any],
    method: str,
    endpoint: str,
    body: dict[str, Any] | None,
    timeout: float,
) -> dict[str, Any]:
    host = registration["host"]
    port = registration["port"]
    url = f"http://{host}:{port}{endpoint}"
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Accept", "application/json")

    if body is not None:
        request.add_header("Content-Type", "application/json; charset=utf-8")
        request.add_header(TOKEN_HEADER, str(registration["token"]))

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload)
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload)
            message = parsed.get("error") or payload
        except json.JSONDecodeError:
            message = payload or exc.reason
        raise MiteiruCliError(f"Miteiru analyzer request failed ({exc.code}): {message}") from exc
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
        raise MiteiruCliError(
            "Miteiru analyzer server not found. Open Miteiru and select a language first."
        ) from exc
    except json.JSONDecodeError as exc:
        raise MiteiruCliError("Miteiru analyzer returned invalid JSON.") from exc


def print_json(value: Any, compact: bool) -> None:
    if compact:
        print(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    else:
        print(json.dumps(value, ensure_ascii=False, indent=2))


def command_health(args: argparse.Namespace) -> int:
    registration = load_registration(args)
    response = request_json(registration, "GET", "/health", None, args.timeout)
    print_json(response, args.compact)
    return 0


def command_analyze(args: argparse.Namespace) -> int:
    registration = load_registration(args)

    if args.stdin:
        texts = [line.rstrip("\n") for line in sys.stdin if line.rstrip("\n")]
        body: dict[str, Any] = {"texts": texts}
        response = request_json(registration, "POST", "/analyze-batch", body, args.timeout)
        print_json(response, args.compact)
        return 0

    if not args.text:
        raise MiteiruCliError("No text provided. Pass TEXT or use --stdin.")

    body = {"text": args.text}
    response = request_json(registration, "POST", "/analyze", body, args.timeout)
    print_json(response, args.compact)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="miteiru_cli.py",
        description="Official Miteiru analyzer CLI. Requires the Miteiru desktop app to be running.",
    )
    parser.add_argument(
        "--registration",
        help="Path to analyzer-server.json. Defaults to the OS-specific Miteiru user data directory.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=f"Request timeout in seconds. Default: {DEFAULT_TIMEOUT_SECONDS}.",
    )
    parser.add_argument("--compact", action="store_true", help="Print compact JSON.")

    subparsers = parser.add_subparsers(dest="command", required=True)

    health = subparsers.add_parser("health", help="Show analyzer server health and active language.")
    health.set_defaults(func=command_health)

    analyze = subparsers.add_parser("analyze", help="Analyze text using Miteiru's selected language.")
    analyze.add_argument("text", nargs="?", help="Text to analyze.")
    analyze.add_argument("--stdin", action="store_true", help="Read one text item per stdin line.")
    analyze.set_defaults(func=command_analyze)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130
    except MiteiruCliError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
