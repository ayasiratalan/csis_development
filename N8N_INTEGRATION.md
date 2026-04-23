# n8n Integration Notes

## What exists now

The exported workflow in this folder:

- reads pending rows from Google Sheets
- normalizes `company_name` and `time_period_days`
- searches via Tavily
- validates documents
- saves validated documents to Google Drive as an Excel file
- writes the final memo back into the spreadsheet

## Why the dashboard cannot call it directly yet

The first node is still `manualTrigger`, so there is no HTTP endpoint for the dashboard to hit.

## Required production change

Replace the manual start with a `Webhook` trigger and return JSON at the end.

Until this is done, the dashboard can only run in mock/preview mode.

## Recommended webhook input contract

```json
{
  "company_name": "Chevron",
  "company_domain": "chevron.com",
  "sec_cik": "93410",
  "time_period_days": 14,
  "time_period_label": "14 days"
}
```

## Recommended webhook response contract

```json
{
  "run_id": "chevron_2026-04-20_14d_101",
  "generated_at": "2026-04-20T18:30:00.000Z",
  "final_one_pager": "One page memo text here",
  "excel_file_name": "Chevron_validated_documents_2026-04-20.xlsx",
  "validated_sources": [
    {
      "title": "Recent SEC filing for Chevron Corporation",
      "url": "https://www.sec.gov/...",
      "source_class": "official",
      "source_domain": "sec.gov",
      "actual_doc_date": "2026-04-18",
      "validation_status": "accepted",
      "entity_confidence": 0.94
    }
  ]
}
```

## Minimum n8n changes

1. Add a `Webhook` node at the start.
2. Set the webhook method to `POST`.
3. Set the webhook path to something stable, for example `csis-company-memo`.
4. Set the response mode to use a `Respond to Webhook` node.
5. Map webhook JSON fields into the same shape used by `Normalize Inputs`.
6. Connect the `Webhook` node directly into `Normalize Inputs`.
7. Remove or bypass the old `manualTrigger`, `Get pending requests`, and `Loop Over Requests` path for dashboard runs.
8. Keep the existing search, validation, Excel, and memo logic.
9. After `Validate Dates and Company Match`, aggregate the accepted docs into a `validated_sources` array.
10. After `Parse Final Strategist Output`, merge the memo output with `validated_sources`.
11. End with `Respond to Webhook`.

The final `Respond to Webhook` body should be JSON matching this shape:

```json
{
  "run_id": "={{ $('Normalize Inputs').item.json.run_id }}",
  "generated_at": "={{ $now }}",
  "final_one_pager": "={{ $json.final_one_pager }}",
  "excel_file_name": "={{ $('Normalize Inputs').item.json.company_name }}_validated_documents_{{ $now.toFormat('yyyy-MM-dd') }}.xlsx",
  "validated_sources": "={{ $json.validated_sources }}"
}
```

## Dashboard connection options

### Recommended: backend mode

Use this when the webhook requires auth or when the dashboard will be deployed publicly.

1. Copy `.env.example` to `.env`.
2. Set `WORKFLOW_MODE=webhook`.
3. Set `N8N_WEBHOOK_URL` to the production n8n webhook URL.
4. Run `node server.js`.
5. Open `http://127.0.0.1:3000`.

### Quick local file mode

Use this only for private/local testing.

1. Open `public/config.js`.
2. Set `n8nWebhookUrl` to the production n8n webhook URL.
3. Open `public/index.html`.
4. The status chip should say `Workflow Mode: Direct n8n webhook`.

If it still says `File preview`, no n8n webhook URL is configured.

## Recommended response fields for the dashboard

- `run_id`
- `generated_at`
- `final_one_pager`
- `validated_sources`
- `excel_file_name`

If you keep the current Google Sheets append step, that is fine, but the dashboard still needs the JSON response above so it can render results immediately.

## News Discovery Architecture

The latest webhook workflow no longer relies on one broad news query. `Normalize Inputs` now creates:

- `company_names`: the submitted company plus aliases such as `Mitsubishi Heavy Industries` and `MHI`
- `official_domains`: company websites, press rooms, investor sites, wire services, and SEC where relevant
- `news_domains`: curated media, wire-service, regional, and sector-specific domains
- `announcement_query`: for company website announcements and press releases
- `targeted_news_query`: for curated news-domain searches
- `news_query`: for broad news search

The discovery branches are:

- `Search Company Website Announcements`: searches official company domains and announcement sites.
- `Search Corporate Newsroom Links`: reads the `Corporate News` column from `Company_Notes`, extracts newsroom URLs/domains, and searches those official newsroom sources directly.
- `Search Curated News Sites`: searches company-specific domain packs covering major news, wires, regional sources, and sector outlets.
- `Search Broad News Sources`: searches broader Tavily news results without domain restriction.

Every company in the dashboard has a profile in `Normalize Inputs` with aliases, official domains, curated sector sources, and sector-specific search terms. For example, energy companies use oil, LNG, upstream, and refining sources; banks use finance and banking sources; pharmaceutical companies use biotech and FDA-oriented sources; aerospace and defense companies use defense and aviation sources; and Japanese/Korean conglomerates include regional business outlets plus relevant sector sources. This is meant to catch company announcements, industry coverage, and broader news instead of relying on one generic company-name search.

The Tavily query field has a 400-character limit, so `Normalize Inputs` uses a `buildLimitedQuery` helper to cap each search query at 360 characters. Exhaustiveness comes from multiple search branches and curated domain packs, not from putting every alias and term into one oversized query.

Those branches flow through:

```text
Flatten Broad News Results
Flatten Curated News Results
Flatten Company Announcement Results
Flatten Corporate Newsroom Results
-> Append Broad + Curated News
-> Append News + Announcements
-> Append Corporate Newsroom Results
-> Append + News
-> Validate Dates and Company Match
```

This means company website announcements, manually supplied corporate newsroom links, wire-service items, and broader news are all deduplicated and validated together before the LLM memo stage. The validator now treats domains from `Corporate News` and `official_domains` as accepted official company domains.
