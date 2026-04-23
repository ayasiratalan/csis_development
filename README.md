# CSIS Corporate Memo Dashboard

This workspace now includes a small web app that wraps the existing n8n workflow concept in a CSIS-styled dashboard.

## What it does

- Lets you choose `Chevron` or `Exxon`
- Lets you choose `14`, `30`, or `60` days
- Runs a backend workflow request
- Displays a one-page memo
- Lists validated sources below the memo

## Current integration mode

The existing n8n export in this folder is still manual-triggered and sheet-driven. That means the HTML cannot trigger it until you add an n8n `Webhook` trigger and a `Respond to Webhook` node.

The dashboard now supports three modes:

- `File preview`: open `public/index.html` directly. This does not run n8n unless `public/config.js` has a webhook URL.
- `Backend mock`: run `node server.js` without webhook settings. This tests the UI and API shape.
- `Live n8n`: run `node server.js` with `WORKFLOW_MODE=webhook` and `N8N_WEBHOOK_URL` set.

For live n8n use, the webhook must accept:

```json
{
  "company_name": "Chevron",
  "company_domain": "chevron.com",
  "sec_cik": "93410",
  "time_period_days": 14,
  "time_period_label": "14 days"
}
```

The backend expects the webhook to return:

```json
{
  "run_id": "chevron_2026-04-20_14d_101",
  "generated_at": "2026-04-20T18:30:00.000Z",
  "final_one_pager": "One page memo text here",
  "validated_sources": [
    {
      "title": "Source title",
      "url": "https://example.com/article",
      "source_class": "official",
      "source_domain": "example.com",
      "actual_doc_date": "2026-04-18",
      "validation_status": "accepted",
      "entity_confidence": 0.91
    }
  ],
  "excel_file_name": "Chevron_validated_documents_2026-04-20.xlsx"
}
```

## Run locally

Node 14+ is enough for the current app.

For a quick visual preview, open:

```text
public/index.html
```

When opened directly as a file, the dashboard runs in `File preview` mode and generates sample memo/source output in the browser.

If you want the HTML file itself to call n8n directly, edit [public/config.js](/Users/ayasiratalan/Desktop/Desktop%20-%20Abdullah%E2%80%99s%20MacBook%20Pro/ACADEMIA/CSIS_Development_Agent/public/config.js) and set:

```js
window.CSIS_DASHBOARD_CONFIG = {
  n8nWebhookUrl: "https://your-n8n-domain.com/webhook/csis-company-memo",
  n8nAuthHeader: "",
  n8nAuthValue: ""
};
```

This only works if the n8n webhook is active and allows browser CORS requests. Do not put private secrets in `public/config.js` on a public site.

For backend/API mode, run:

```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000).

## GitHub Pages

This repository includes a GitHub Actions workflow at `.github/workflows/pages.yml`.

When pushed to GitHub, the workflow deploys the `public/` folder as a static GitHub Pages site. That static deployment can call the production n8n webhook configured in `public/config.js`, but this is still direct browser-to-n8n mode and can fail on some computers or networks because of browser/CORS/privacy restrictions.

Expected GitHub Pages URL:

```text
https://ayasiratalan.github.io/csis_development/
```

In the GitHub repository, set Pages source to `GitHub Actions` under:

```text
Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
```

## Live n8n backend mode

Copy `.env.example` to `.env`, then edit `.env`:

```bash
cp .env.example .env
```

Set your real n8n webhook URL:

```env
WORKFLOW_MODE=webhook
N8N_WEBHOOK_URL=https://your-n8n-domain.com/webhook/csis-company-memo
```

Then run:

```bash
node server.js
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The chip should say `Workflow Mode: Live webhook`. If it says `Mock preview` or `Webhook not configured`, it is not connected to n8n.

This is the recommended production setup if you want to avoid intermittent browser-side webhook errors. The browser talks only to your own backend, and the backend calls n8n server-to-server.

## Environment variables

Optional variables:

- `PORT=3000`
- `WORKFLOW_MODE=mock`
- `MOCK_DELAY_MS=900`
- `N8N_WEBHOOK_URL=https://your-n8n-host/webhook/company-memo`
- `N8N_AUTH_HEADER=X-API-Key`
- `N8N_AUTH_VALUE=your-secret`

Example live mode:

```bash
WORKFLOW_MODE=webhook \
N8N_WEBHOOK_URL=https://your-n8n-host/webhook/company-memo \
N8N_AUTH_HEADER=X-API-Key \
N8N_AUTH_VALUE=replace-me \
node server.js
```

## Files

- [server.js](/Users/ayasiratalan/Desktop/Desktop%20-%20Abdullah%E2%80%99s%20MacBook%20Pro/ACADEMIA/CSIS_Development_Agent/server.js)
- [public/index.html](/Users/ayasiratalan/Desktop/Desktop%20-%20Abdullah%E2%80%99s%20MacBook%20Pro/ACADEMIA/CSIS_Development_Agent/public/index.html)
- [public/styles.css](/Users/ayasiratalan/Desktop/Desktop%20-%20Abdullah%E2%80%99s%20MacBook%20Pro/ACADEMIA/CSIS_Development_Agent/public/styles.css)
- [public/app.js](/Users/ayasiratalan/Desktop/Desktop%20-%20Abdullah%E2%80%99s%20MacBook%20Pro/ACADEMIA/CSIS_Development_Agent/public/app.js)
- [DEPLOY.md](/Users/ayasiratalan/Desktop/Desktop%20-%20Abdullah%E2%80%99s%20MacBook%20Pro/ACADEMIA/CSIS_Development_Agent/DEPLOY.md)
- [N8N_INTEGRATION.md](/Users/ayasiratalan/Desktop/Desktop%20-%20Abdullah%E2%80%99s%20MacBook%20Pro/ACADEMIA/CSIS_Development_Agent/N8N_INTEGRATION.md)
