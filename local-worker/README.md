# Local FTC video queue worker

This lightweight Python worker checks Supabase for pending FTC event-video jobs. It uses only the Python standard library.

## Polling behavior

- Checks immediately when started.
- Checks again every 10,800 seconds (3 hours).
- If the computer is offline, jobs remain in Supabase and are visible when the worker starts again.
- This first phase only reports pending jobs. It does not claim or process them yet; the FFmpeg/OpenCV/OCR processor will be connected in the next phase.

## Setup

1. Install Python 3.10 or newer.
2. Copy the environment template:

   ```bash
   cp .env.example .env
   nano .env
   ```

3. Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Keep `.env` private. Do not commit it or share the service-role key.
5. Run:

   ```bash
   set -a
   source .env
   set +a
   python3 worker.py
   ```

To change the interval, set `POLL_INTERVAL_SECONDS`. For example, 3600 means one hour. The default is 10800 (three hours).

## Run automatically with systemd

After confirming the worker runs manually, create `~/.config/systemd/user/ftc-video-worker.service`:

```ini
[Unit]
Description=FTC video queue polling worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/FTCVideoDirectory/local-worker
EnvironmentFile=%h/FTCVideoDirectory/local-worker/.env
ExecStart=/usr/bin/python3 %h/FTCVideoDirectory/local-worker/worker.py
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
```

Then enable it:

```bash
systemctl --user daemon-reload
systemctl --user enable --now ftc-video-worker.service
systemctl --user status ftc-video-worker.service
journalctl --user -u ftc-video-worker.service -f
```

If it should run when you are logged out, enable lingering for your Linux user with `loginctl enable-linger "$USER"`.

## Queue security

The queue table has RLS enabled and is not accessible to anon/authenticated users. The worker uses the service-role key only from its local environment. Never place this key in the React frontend or source control.
