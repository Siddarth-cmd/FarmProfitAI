"""Safely diagnose connectivity and response shape for the Data.gov.in resource."""

from __future__ import annotations

import json
import os
import socket
import ssl
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv

RESOURCE_URL = (
    "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
)
HOST = "api.data.gov.in"
PORT = 443
TIMEOUT_SECONDS = 8
_BACKEND_DIR = Path(__file__).resolve().parents[1]
_PROJECT_ROOT = _BACKEND_DIR.parent


def _load_api_key() -> str:
    load_dotenv(_PROJECT_ROOT / ".env")
    load_dotenv(_BACKEND_DIR / ".env")
    return (os.getenv("DATA_GOV_API_KEY") or "").strip()


def _check_dns() -> list[str]:
    addresses = socket.getaddrinfo(HOST, PORT, type=socket.SOCK_STREAM)
    return sorted({address[4][0] for address in addresses})


def _check_tcp() -> None:
    with socket.create_connection((HOST, PORT), timeout=TIMEOUT_SECONDS):
        return


def _request_records(api_key: str) -> tuple[int, str, object]:
    query = urlencode({"api-key": api_key, "format": "json", "limit": "1"})
    request = Request(
        f"{RESOURCE_URL}?{query}",
        headers={"Accept": "application/json", "User-Agent": "FarmProfitAI/0.1"},
    )
    with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        status = getattr(response, "status", None) or response.getcode()
        content_type = response.headers.get("Content-Type", "")
        payload = json.loads(response.read().decode("utf-8"))
    return status, content_type, payload


def main() -> int:
    print(f"host={HOST}")
    print(f"resource={RESOURCE_URL}")

    api_key = _load_api_key()
    if not api_key:
        print("api_key=missing")
        return 1
    print(f"api_key=present length={len(api_key)}")

    try:
        addresses = _check_dns()
        print(f"dns=ok addresses={','.join(addresses)}")
    except socket.gaierror as exc:
        print(f"dns=failed type={type(exc).__name__} message={exc}")
        return 1

    try:
        _check_tcp()
        print(f"tcp=ok host={HOST} port={PORT}")
    except (OSError, TimeoutError) as exc:
        print(f"tcp=failed type={type(exc).__name__} message={exc}")
        return 1

    try:
        status, content_type, payload = _request_records(api_key)
    except HTTPError as exc:
        print(f"http=failed status={exc.code}")
        return 1
    except (URLError, TimeoutError, ssl.SSLError, OSError) as exc:
        print(f"http=failed type={type(exc).__name__} message={exc}")
        return 1
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        print(f"response=invalid-json type={type(exc).__name__}")
        return 1

    print(f"http=ok status={status} content_type={content_type or 'unknown'}")
    if not isinstance(payload, dict):
        print("response_shape=invalid expected=object")
        return 1

    records = payload.get("records")
    if not isinstance(records, list):
        print("response_shape=invalid records=missing-or-not-list")
        return 1

    print(f"response_shape=object records=list record_count={len(records)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
