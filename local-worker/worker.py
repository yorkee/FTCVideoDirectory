#!/usr/bin/env python3
"""Poll the Supabase FTC video-processing queue.

The initial worker intentionally reports pending jobs without claiming them.
The OCR/video processor will be plugged into this worker in the next phase.
"""
from __future__ import annotations

import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

DEFAULT_INTERVAL_SECONDS = 3 * 60 * 60


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def supabase_get_pending_jobs() -> list[dict]:
    base_url = required_env("SUPABASE_URL").rstrip("/")
    service_key = required_env("SUPABASE_SERVICE_ROLE_KEY")
    query = urllib.parse.urlencode({
        "select": "id,season_year,event_code,event_name,video_url,status,created_at",
        "status": "eq.pending",
        "order": "created_at.asc",
        "limit": "50",
    })
    request = urllib.request.Request(
        f"{base_url}/rest/v1/ftc_video_processing_jobs?{query}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        raise RuntimeError("Supabase returned an unexpected queue response.")
    return payload


def poll_once() -> None:
    checked_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    jobs = supabase_get_pending_jobs()
    print(f"[{checked_at}] Found {len(jobs)} pending FTC video job(s).", flush=True)
    for job in jobs:
        print(
            "  "
            f"#{job.get('id')} | {job.get('event_name')} "
            f"({job.get('event_code')}, {job.get('season_year')}) | "
            f"{job.get('video_url')}",
            flush=True,
        )
    if jobs:
        print(
            "  Queue check only: jobs remain pending until the OCR processor is installed.",
            flush=True,
        )


def main() -> int:
    interval = int(os.getenv("POLL_INTERVAL_SECONDS", str(DEFAULT_INTERVAL_SECONDS)))
    if interval < 60:
        raise RuntimeError("POLL_INTERVAL_SECONDS must be at least 60 seconds.")
    print(
        f"FTC local queue worker started on {socket.gethostname()}; "
        f"poll interval = {interval} seconds ({interval / 3600:g} hours).",
        flush=True,
    )
    while True:
        try:
            poll_once()
        except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError) as error:
            print(f"Queue poll failed: {error}", file=sys.stderr, flush=True)
        except KeyboardInterrupt:
            print("Stopping FTC local queue worker.", flush=True)
            return 0
        time.sleep(interval)


if __name__ == "__main__":
    raise SystemExit(main())
