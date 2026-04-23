# Deployment Guide

## Recommended production architecture

1. Host this Node app on a VPS or cloud VM.
2. Put `nginx` in front of it.
3. Expose an n8n webhook for the actual workflow execution.
4. Return the memo and validated sources directly from n8n as JSON.

Do not treat GitHub Pages direct webhook mode as the production architecture if you want to eliminate browser-side `fetch failed`, CORS, privacy-shield, or cross-network errors. Use the Node backend as a proxy to n8n.

The current n8n export is not ready for real-time dashboard execution because it starts with a manual trigger and writes final results to Google Sheets and Google Drive. The clean production fix is to add a webhook trigger and a webhook response path.

## Ubuntu server example

### 1. Install Node and nginx

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
```

### 2. Copy the project to the server

```bash
scp -r CSIS_Development_Agent user@your-server:/srv/csis-dashboard
```

### 3. Start the app with environment variables

```bash
cd /srv/csis-dashboard
PORT=3000 \
WORKFLOW_MODE=webhook \
N8N_WEBHOOK_URL=https://n8n.yourdomain.com/webhook/company-memo \
N8N_AUTH_HEADER=X-API-Key \
N8N_AUTH_VALUE=replace-me \
node server.js
```

### 4. Run it as a systemd service

Create `/etc/systemd/system/csis-dashboard.service`:

```ini
[Unit]
Description=CSIS Corporate Memo Dashboard
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/csis-dashboard
Environment=PORT=3000
Environment=WORKFLOW_MODE=webhook
Environment=N8N_WEBHOOK_URL=https://n8n.yourdomain.com/webhook/company-memo
Environment=N8N_AUTH_HEADER=X-API-Key
Environment=N8N_AUTH_VALUE=replace-me
ExecStart=/usr/bin/node /srv/csis-dashboard/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable csis-dashboard
sudo systemctl start csis-dashboard
sudo systemctl status csis-dashboard
```

### 5. Configure nginx

Create `/etc/nginx/sites-available/csis-dashboard`:

```nginx
server {
    listen 80;
    server_name dashboard.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then:

```bash
sudo ln -s /etc/nginx/sites-available/csis-dashboard /etc/nginx/sites-enabled/csis-dashboard
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Add HTTPS

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d dashboard.yourdomain.com
```

## Production checklist

- Keep the dashboard backend private from direct spreadsheet credentials.
- Put authentication in front of the dashboard if this is not public-facing.
- Use HTTPS for both the dashboard and n8n.
- Make the n8n webhook return the validated sources array, not just the final memo.
- Move Google Sheets and Google Drive credentials into n8n or a backend secret store, not the browser.
