const fs = require("fs");
const path = require("path");

const inputPath = path.join(
  __dirname,
  "..",
  "Summary_Agent_v11_OnePager_CSIS_Outreach (1).json"
);
const outputPath = path.join(
  __dirname,
  "..",
  "Summary_Agent_v11_OnePager_CSIS_Outreach_WEBHOOK.json"
);

const workflow = JSON.parse(fs.readFileSync(inputPath, "utf8"));

workflow.name = "Summary_Agent_v11_OnePager_CSIS_Outreach_WEBHOOK";
workflow.active = false;

const removeNames = new Set([
  "When clicking ‘Execute workflow’",
  "Get pending requests",
  "Loop Over Requests"
]);

workflow.nodes = workflow.nodes.filter((node) => !removeNames.has(node.name));

workflow.nodes.unshift({
  parameters: {
    httpMethod: "POST",
    path: "csis-company-memo",
    responseMode: "responseNode",
    options: {
      responseHeaders: {
        entries: [
          {
            name: "Access-Control-Allow-Origin",
            value: "*"
          },
          {
            name: "Access-Control-Allow-Methods",
            value: "POST, OPTIONS"
          },
          {
            name: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-API-Key"
          }
        ]
      }
    }
  },
  type: "n8n-nodes-base.webhook",
  typeVersion: 2.1,
  position: [-720, 768],
  id: "webhook-csis-company-memo",
  name: "Dashboard Webhook"
});

workflow.nodes.push({
  parameters: {
    jsCode: [
      "const final = $input.first().json || {};",
      "const normalized = $('Normalize Inputs').first().json || {};",
      "const aggregate = $('Aggregate Documents for LLM').first().json || {};",
      "const sources = Array.isArray(aggregate.validated_sources) ? aggregate.validated_sources : [];",
      "",
      "return [{",
      "  json: {",
      "    ok: true,",
      "    run_id: normalized.run_id || '',",
      "    generated_at: new Date().toISOString(),",
      "    company_name: normalized.company_name || '',",
      "    time_period_days: normalized.time_period_days || '',",
      "    time_period_label: normalized.time_period_label || '',",
      "    final_one_pager: final.final_one_pager || '',",
      "    recent_developments_paragraph: final.recent_developments_paragraph || '',",
      "    past_csis_engagement_paragraph: final.past_csis_engagement_paragraph || '',",
      "    csis_convergence_paragraph: final.csis_convergence_paragraph || '',",
      "    email_pitch_ideas: final.email_pitch_ideas || '',",
      "    excel_file_name: `${normalized.company_name || 'Company'}_validated_documents_${new Date().toISOString().slice(0, 10)}.xlsx`,",
      "    validated_sources: sources",
      "  }",
      "}];"
    ].join("\n")
  },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [3136, 960],
  id: "prepare-webhook-response",
  name: "Prepare Webhook Response"
});

workflow.nodes.push({
  parameters: {
    respondWith: "json",
    responseBody: "={{ $json }}",
    options: {
      responseCode: 200
    }
  },
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1.4,
  position: [3360, 960],
  id: "respond-dashboard",
  name: "Respond to Dashboard"
});

function updateNode(name, updater) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error("Missing node: " + name);
  updater(node);
}

updateNode("Normalize Inputs", (node) => {
  node.position = [-480, 768];
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "const item = items[0].json;",
    [
      "const incoming = items[0].json || {};",
      "const source = incoming.body && typeof incoming.body === 'object' ? incoming.body : incoming;",
      "const item = {",
      "  ...source,",
      "  requested_at: source.requested_at || incoming.headers?.['x-requested-at'] || new Date().toISOString(),",
      "  status: source.status || 'pending'",
      "};"
    ].join("\n")
  );
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "const days = Number(item.time_period_days || item.time_period || item.days || 14);",
    [
      "const profileKey = company.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();",
      "const companyProfiles = {",
      "  mitsubishi: { domain: 'mhi.com', aliases: ['Mitsubishi Heavy Industries', 'MHI'], official_domains: ['mhi.com'] },",
      "  'sk americas': { domain: 'sk.com', aliases: ['SK Group', 'SK hynix', 'SK Innovation'], official_domains: ['sk.com'] },",
      "  hyundai: { domain: 'hyundai.com', aliases: ['Hyundai Motor', 'Hyundai Motor Company'], official_domains: ['hyundai.com', 'hyundai.news'] },",
      "  samsung: { domain: 'samsung.com', aliases: ['Samsung Electronics'], official_domains: ['samsung.com', 'news.samsung.com'] },",
      "  aramco: { domain: 'aramco.com', aliases: ['Saudi Aramco'], official_domains: ['aramco.com'] },",
      "  'jp morgan': { domain: 'jpmorganchase.com', aliases: ['JPMorgan Chase', 'J.P. Morgan'], official_domains: ['jpmorganchase.com'] }",
      "};",
      "const profile = companyProfiles[profileKey] || {};",
      "const rawAliases = Array.isArray(item.company_aliases)",
      "  ? item.company_aliases",
      "  : (item.company_aliases || '').toString().split(/[;,]/);",
      "const companyAliases = [...new Set([...(profile.aliases || []), ...rawAliases]",
      "  .map(a => (a || '').toString().trim())",
      "  .filter(Boolean))];",
      "const companyNames = [company, ...companyAliases];",
      "const quotedCompanyNames = companyNames.map(name => `\"${name}\"`).join(' OR ');",
      "const days = Number(item.time_period_days || item.time_period || item.days || 14);"
    ].join("\n")
  );
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "const rawDomain = (item.company_domain || item.official_domain || '').toString().trim().toLowerCase();",
    "const rawDomain = (item.company_domain || item.official_domain || profile.domain || '').toString().trim().toLowerCase();"
  );
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "const officialDomains = ['sec.gov', 'businesswire.com', 'prnewswire.com', 'globenewswire.com'];",
    "const officialDomains = [...(profile.official_domains || []), 'sec.gov', 'businesswire.com', 'prnewswire.com', 'globenewswire.com'];"
  );
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "const officialQuery = paddedCik\n  ? `\"${company}\" ${shortCik} (\"8-K\" OR \"10-Q\" OR \"10-K\" OR \"earnings release\" OR \"investor relations\" OR \"press release\")`\n  : `\"${company}\" (\"8-K\" OR \"10-Q\" OR \"10-K\" OR \"earnings release\" OR \"investor relations\" OR \"press release\")`;\nconst governmentQuery = `\"${company}\" (\"LD-2\" OR lobbying OR procurement OR \"Senate lobbying\" OR \"Federal Register\")`;\nconst thinktankQuery = `\"${company}\" (regulation OR policy OR analysis OR briefing OR strategic risk)`;\nconst newsQuery = `\"${company}\" (earnings OR acquisition OR divestiture OR lawsuit OR regulation OR contract)`;",
    [
      "const officialQuery = paddedCik",
      "  ? `(${quotedCompanyNames}) ${shortCik} (\"8-K\" OR \"10-Q\" OR \"10-K\" OR \"earnings release\" OR \"investor relations\" OR \"press release\" OR \"news release\" OR contract OR award)`",
      "  : `(${quotedCompanyNames}) (\"8-K\" OR \"10-Q\" OR \"10-K\" OR \"earnings release\" OR \"investor relations\" OR \"press release\" OR \"news release\" OR contract OR award)`;",
      "const governmentQuery = `(${quotedCompanyNames}) (\"LD-2\" OR lobbying OR procurement OR \"Senate lobbying\" OR \"Federal Register\")`;",
      "const thinktankQuery = `(${quotedCompanyNames}) (regulation OR policy OR analysis OR briefing OR strategic risk)`;",
      "const newsQuery = `(${quotedCompanyNames}) (earnings OR acquisition OR divestiture OR lawsuit OR regulation OR contract OR partnership OR investment OR launch OR order OR award OR \"press release\" OR \"news release\")`;"
    ].join("\n")
  );
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "    company_domain: companyDomain,",
    "    company_domain: companyDomain,\n    company_aliases: companyAliases,\n    company_names: companyNames,"
  );
});

updateNode("Aggregate Documents for LLM", (node) => {
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "const counts = {",
    [
      "const validatedSources = docs",
      "  .filter(d => d.source_class && d.source_class !== 'none')",
      "  .map((doc, idx) => ({",
      "    id: doc.run_id ? `${doc.run_id}_${idx + 1}` : `source_${idx + 1}`,",
      "    title: doc.title || '',",
      "    url: doc.url || '',",
      "    source_class: doc.source_class || '',",
      "    source_domain: doc.source_domain || '',",
      "    published_date: doc.published_date || '',",
      "    actual_doc_date: doc.actual_doc_date || doc.published_date || '',",
      "    validation_status: doc.validation_status || 'accepted',",
      "    entity_confidence: doc.entity_confidence || 0",
      "  }));",
      "const counts = {"
    ].join("\n")
  );
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "doc_stats: counts,",
    "doc_stats: counts,\n    validated_sources: validatedSources,"
  );
});

updateNode("Append results to data_base_v1", (node) => {
  const value = node.parameters.columns.value;
  value.row_number = "={{ $('Normalize Inputs').item.json.row_number || '' }}";
  value.requested_at = "={{ $('Normalize Inputs').item.json.requested_at || '' }}";
  value.notes = "={{ $('Normalize Inputs').item.json.notes || '' }}";
});

const oldConnections = workflow.connections || {};
for (const name of removeNames) {
  delete oldConnections[name];
}
for (const [sourceName, sourceConnections] of Object.entries(oldConnections)) {
  const main = sourceConnections.main || [];
  for (const output of main) {
    for (let index = output.length - 1; index >= 0; index--) {
      if (removeNames.has(output[index].node)) {
        output.splice(index, 1);
      }
    }
  }
}

oldConnections["Dashboard Webhook"] = {
  main: [[{ node: "Normalize Inputs", type: "main", index: 0 }]]
};

oldConnections["Parse Final Strategist Output"] = {
  main: [
    [
      { node: "Append results to data_base_v1", type: "main", index: 0 },
      { node: "Prepare Webhook Response", type: "main", index: 0 }
    ]
  ]
};

oldConnections["Append results to data_base_v1"] = {
  main: [[]]
};

oldConnections["Prepare Webhook Response"] = {
  main: [[{ node: "Respond to Dashboard", type: "main", index: 0 }]]
};

workflow.connections = oldConnections;

fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2) + "\n");
console.log("Wrote " + outputPath);
