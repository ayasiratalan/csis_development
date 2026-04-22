const http = require("http");
const https = require("https");

const workflowMode = (process.env.WORKFLOW_MODE || "mock").trim().toLowerCase();

function requestJson(method, rawUrl, payload, extraHeaders) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (error) {
      reject(new Error("Invalid N8N_WEBHOOK_URL."));
      return;
    }

    const isHttps = parsed.protocol === "https:";
    const transport = isHttps ? https : http;
    const body = JSON.stringify(payload);
    const headers = Object.assign(
      {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
      extraHeaders || {}
    );

    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk.toString("utf8");
        });

        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(
              new Error(
                "n8n webhook returned HTTP " +
                  res.statusCode +
                  (responseBody ? ": " + responseBody.slice(0, 300) : "")
              )
            );
            return;
          }

          try {
            resolve(JSON.parse(responseBody || "{}"));
          } catch (error) {
            reject(new Error("n8n webhook returned invalid JSON."));
          }
        });
      }
    );

    req.on("error", (error) => {
      reject(error);
    });

    req.write(body);
    req.end();
  });
}

function normalizeMemo(responseBody) {
  if (responseBody.memo) {
    return String(responseBody.memo).trim();
  }

  if (responseBody.final_one_pager) {
    return String(responseBody.final_one_pager).trim();
  }

  const sections = [
    responseBody.recent_developments_paragraph,
    responseBody.past_csis_engagement_paragraph,
    responseBody.csis_convergence_paragraph,
    responseBody.email_pitch_ideas
  ]
    .map((value) => (value ? String(value).trim() : ""))
    .filter(Boolean);

  return sections.join("\n\n").trim();
}

function normalizeSources(responseBody) {
  const rawSources = Array.isArray(responseBody.validated_sources)
    ? responseBody.validated_sources
    : Array.isArray(responseBody.sources)
      ? responseBody.sources
      : [];

  return rawSources.map((source, index) => ({
    id: source.id || "source-" + (index + 1),
    title: source.title || "Untitled source",
    url: source.url || "",
    domain: source.domain || source.source_domain || "",
    sourceClass: source.sourceClass || source.source_class || "unknown",
    publishedDate:
      source.publishedDate || source.published_date || source.actual_doc_date || "",
    validationStatus:
      source.validationStatus || source.validation_status || "accepted",
    entityConfidence:
      typeof source.entityConfidence === "number"
        ? source.entityConfidence
        : typeof source.entity_confidence === "number"
          ? source.entity_confidence
          : null
  }));
}

async function runWebhookWorkflow(options) {
  if (!process.env.N8N_WEBHOOK_URL) {
    throw new Error(
      "WORKFLOW_MODE=webhook requires N8N_WEBHOOK_URL to be set."
    );
  }

  const payload = {
    company_name: options.company.name,
    company_domain: options.company.domain,
    sec_cik: options.company.secCik,
    company_aliases: options.company.aliases || [],
    time_period_days: options.intervalDays,
    time_period_label: options.intervalDays + " days"
  };

  const headers = {};
  if (process.env.N8N_AUTH_HEADER && process.env.N8N_AUTH_VALUE) {
    headers[process.env.N8N_AUTH_HEADER] = process.env.N8N_AUTH_VALUE;
  }

  const responseBody = await requestJson(
    "POST",
    process.env.N8N_WEBHOOK_URL,
    payload,
    headers
  );

  const memo = normalizeMemo(responseBody);
  const sources = normalizeSources(responseBody);

  if (!memo) {
    throw new Error(
      "n8n response did not include a memo. Expected `memo` or `final_one_pager`."
    );
  }

  return {
    ok: true,
    mode: "webhook",
    runId: responseBody.runId || responseBody.run_id || "",
    generatedAt: responseBody.generatedAt || responseBody.generated_at || new Date().toISOString(),
    company: options.company.name,
    intervalDays: options.intervalDays,
    memo,
    sources,
    excelFileName:
      responseBody.excelFileName || responseBody.excel_file_name || ""
  };
}

module.exports = {
  runWebhookWorkflow,
  workflowMode
};
