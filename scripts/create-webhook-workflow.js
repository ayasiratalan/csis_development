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

function copyNode(sourceName, overrides) {
  const source = workflow.nodes.find((candidate) => candidate.name === sourceName);
  if (!source) throw new Error("Missing source node: " + sourceName);
  workflow.nodes.push({
    ...JSON.parse(JSON.stringify(source)),
    ...overrides,
    parameters: overrides.parameters || JSON.parse(JSON.stringify(source.parameters))
  });
}

function tavilyBody(queryField, options) {
  const lines = [
    `  query: $('Normalize Inputs').item.json.${queryField},`,
    `  topic: '${options.topic}',`,
    "  search_depth: 'advanced',"
  ];
  if (options.includeDomainsField) {
    lines.push(`  include_domains: $('Normalize Inputs').item.json.${options.includeDomainsField},`);
  }
  lines.push(
    "  include_raw_content: true,",
    `  max_results: ${options.maxResults},`,
    "  start_date: $('Normalize Inputs').item.json.start_date,",
    "  end_date: $('Normalize Inputs').item.json.end_date,",
    "  include_answer: false"
  );
  return `={{ JSON.stringify({\n${lines.join("\n")}\n}) }}`;
}

function makeFlattenCode(sourceClass, queryField) {
  const source =
    workflow.nodes.find((node) => node.name === "Flatten News Results") ||
    workflow.nodes.find((node) => node.name === "Flatten Broad News Results");
  if (!source) throw new Error("Missing news flatten source node");
  return source.parameters.functionCode
    .replace("const sourceClass = 'news';", `const sourceClass = '${sourceClass}';`)
    .replace("const queryField = 'news_query';", `const queryField = '${queryField}';`);
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
      "const globalNewsDomains = [",
      "  'reuters.com', 'apnews.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'cnbc.com',",
      "  'marketwatch.com', 'barrons.com', 'forbes.com', 'fortune.com', 'axios.com',",
      "  'politico.com', 'thehill.com', 'semafor.com', 'nikkei.com', 'asia.nikkei.com',",
      "  'economist.com', 'finance.yahoo.com', 'prnewswire.com', 'businesswire.com', 'globenewswire.com'",
      "];",
      "const companyProfiles = {",
      "  adm: { domain: 'adm.com', aliases: ['Archer Daniels Midland'], official_domains: ['adm.com'], news_domains: globalNewsDomains },",
      "  bhp: { domain: 'bhp.com', aliases: ['BHP Group'], official_domains: ['bhp.com'], news_domains: globalNewsDomains },",
      "  hyundai: { domain: 'hyundai.com', aliases: ['Hyundai Motor', 'Hyundai Motor Company', 'Hyundai Motor Group'], official_domains: ['hyundai.com', 'hyundai.news', 'hyundaimotorgroup.com'], news_domains: globalNewsDomains },",
      "  samsung: { domain: 'samsung.com', aliases: ['Samsung Electronics', 'Samsung Group'], official_domains: ['samsung.com', 'news.samsung.com'], news_domains: globalNewsDomains },",
      "  chevron: { domain: 'chevron.com', aliases: ['Chevron Corporation'], official_domains: ['chevron.com'], news_domains: globalNewsDomains },",
      "  cisco: { domain: 'cisco.com', aliases: ['Cisco Systems'], official_domains: ['cisco.com', 'newsroom.cisco.com'], news_domains: globalNewsDomains },",
      "  merck: { domain: 'merck.com', aliases: ['Merck & Co.', 'MSD'], official_domains: ['merck.com'], news_domains: globalNewsDomains },",
      "  qualcomm: { domain: 'qualcomm.com', aliases: ['Qualcomm Incorporated'], official_domains: ['qualcomm.com'], news_domains: globalNewsDomains },",
      "  nvidia: { domain: 'nvidia.com', aliases: ['NVIDIA Corporation'], official_domains: ['nvidia.com', 'nvidianews.nvidia.com'], news_domains: globalNewsDomains },",
      "  microsoft: { domain: 'microsoft.com', aliases: ['Microsoft Corporation'], official_domains: ['microsoft.com', 'news.microsoft.com'], news_domains: globalNewsDomains },",
      "  ibm: { domain: 'ibm.com', aliases: ['International Business Machines'], official_domains: ['ibm.com', 'newsroom.ibm.com'], news_domains: globalNewsDomains },",
      "  exxon: { domain: 'corporate.exxonmobil.com', aliases: ['ExxonMobil', 'Exxon Mobil', 'Exxon Mobil Corporation'], official_domains: ['corporate.exxonmobil.com', 'exxonmobil.com'], news_domains: globalNewsDomains },",
      "  amazon: { domain: 'amazon.com', aliases: ['Amazon.com', 'Amazon Web Services', 'AWS'], official_domains: ['amazon.com', 'aboutamazon.com', 'aws.amazon.com'], news_domains: globalNewsDomains },",
      "  'bank of america': { domain: 'bankofamerica.com', aliases: ['BofA', 'Bank of America Corporation'], official_domains: ['bankofamerica.com', 'newsroom.bankofamerica.com'], news_domains: globalNewsDomains },",
      "  pepsico: { domain: 'pepsico.com', aliases: ['PepsiCo Inc.', 'Pepsi'], official_domains: ['pepsico.com'], news_domains: globalNewsDomains },",
      "  infineon: { domain: 'infineon.com', aliases: ['Infineon Technologies'], official_domains: ['infineon.com'], news_domains: globalNewsDomains },",
      "  gilead: { domain: 'gilead.com', aliases: ['Gilead Sciences'], official_domains: ['gilead.com'], news_domains: globalNewsDomains },",
      "  aramco: { domain: 'aramco.com', aliases: ['Saudi Aramco'], official_domains: ['aramco.com'], news_domains: globalNewsDomains },",
      "  equinor: { domain: 'equinor.com', aliases: ['Equinor ASA'], official_domains: ['equinor.com'], news_domains: globalNewsDomains },",
      "  'sk americas': { domain: 'sk.com', aliases: ['SK Group', 'SK hynix', 'SK Innovation'], official_domains: ['sk.com', 'skhynix.com', 'skinnonews.com'], news_domains: globalNewsDomains },",
      "  'jp morgan': { domain: 'jpmorganchase.com', aliases: ['JPMorgan Chase', 'J.P. Morgan', 'JPMorgan'], official_domains: ['jpmorganchase.com'], news_domains: globalNewsDomains },",
      "  boeing: { domain: 'boeing.com', aliases: ['The Boeing Company'], official_domains: ['boeing.com'], news_domains: globalNewsDomains },",
      "  'general atomics': { domain: 'ga.com', aliases: ['General Atomics Aeronautical Systems', 'GA-ASI'], official_domains: ['ga.com', 'ga-asi.com'], news_domains: globalNewsDomains },",
      "  mitsubishi: { domain: 'mhi.com', aliases: ['Mitsubishi Heavy Industries', 'MHI', 'Mitsubishi Corporation'], official_domains: ['mhi.com', 'mitsubishicorp.com'], news_domains: globalNewsDomains },",
      "  sumitomo: { domain: 'sumitomo.com', aliases: ['Sumitomo Corporation'], official_domains: ['sumitomocorp.com', 'sumitomo.com'], news_domains: globalNewsDomains }",
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
      "const dedup = (arr) => [...new Set(arr.filter(Boolean))];",
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
    "const dedup = (arr) => [...new Set(arr.filter(Boolean))];\nconst officialDomainsFinal = dedup(officialDomains);",
    "const officialDomainsFinal = dedup(officialDomains);"
  );
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "const officialQuery = paddedCik\n  ? `\"${company}\" ${shortCik} (\"8-K\" OR \"10-Q\" OR \"10-K\" OR \"earnings release\" OR \"investor relations\" OR \"press release\")`\n  : `\"${company}\" (\"8-K\" OR \"10-Q\" OR \"10-K\" OR \"earnings release\" OR \"investor relations\" OR \"press release\")`;\nconst governmentQuery = `\"${company}\" (\"LD-2\" OR lobbying OR procurement OR \"Senate lobbying\" OR \"Federal Register\")`;\nconst thinktankQuery = `\"${company}\" (regulation OR policy OR analysis OR briefing OR strategic risk)`;\nconst newsQuery = `\"${company}\" (earnings OR acquisition OR divestiture OR lawsuit OR regulation OR contract)`;",
    [
      "const officialQuery = paddedCik",
      "  ? `(${quotedCompanyNames}) ${shortCik} (\"8-K\" OR \"10-Q\" OR \"10-K\" OR \"earnings release\" OR \"investor relations\" OR \"press release\" OR \"news release\" OR contract OR award)`",
      "  : `(${quotedCompanyNames}) (\"8-K\" OR \"10-Q\" OR \"10-K\" OR \"earnings release\" OR \"investor relations\" OR \"press release\" OR \"news release\" OR contract OR award)`;",
      "const governmentQuery = `(${quotedCompanyNames}) (\"LD-2\" OR lobbying OR procurement OR \"Senate lobbying\" OR \"Federal Register\")`;",
      "const thinktankQuery = `(${quotedCompanyNames}) (regulation OR policy OR analysis OR briefing OR strategic risk)`;",
      "const announcementQuery = `(${quotedCompanyNames}) (announcement OR \"press release\" OR \"news release\" OR contract OR award OR order OR partnership OR investment OR launch OR acquisition OR divestiture OR lawsuit OR earnings)`;",
      "const targetedNewsQuery = `(${quotedCompanyNames}) (earnings OR acquisition OR divestiture OR lawsuit OR regulation OR contract OR partnership OR investment OR launch OR order OR award OR \"press release\" OR \"news release\" OR geopolitical OR supply chain OR policy)`;",
      "const newsQuery = `(${quotedCompanyNames}) (earnings OR acquisition OR divestiture OR lawsuit OR regulation OR contract OR partnership OR investment OR launch OR order OR award OR geopolitical OR supply chain OR policy)`;",
      "const newsDomains = dedup([...(profile.news_domains || globalNewsDomains)]);"
    ].join("\n")
  );
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "    company_domain: companyDomain,",
    "    company_domain: companyDomain,\n    company_aliases: companyAliases,\n    company_names: companyNames,"
  );
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "    thinktank_domains: thinktankDomains,",
    "    thinktank_domains: thinktankDomains,\n    news_domains: newsDomains,"
  );
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "    news_query: newsQuery,",
    "    announcement_query: announcementQuery,\n    targeted_news_query: targetedNewsQuery,\n    news_query: newsQuery,"
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

updateNode("Search News Sources", (node) => {
  node.name = "Search Broad News Sources";
  node.position = [-32, 1264];
  node.parameters.jsonBody = tavilyBody("news_query", {
    topic: "news",
    maxResults: 18
  });
});

updateNode("Merge News Meta + Results", (node) => {
  node.name = "Merge Broad News Meta + Results";
  node.position = [208, 1264];
});

updateNode("Flatten News Results", (node) => {
  node.name = "Flatten Broad News Results";
  node.position = [448, 1264];
  node.parameters.functionCode = makeFlattenCode("news", "news_query");
});

copyNode("Search Broad News Sources", {
  id: "search-company-announcements",
  name: "Search Company Website Announcements",
  position: [-32, 1024],
  parameters: {
    ...workflow.nodes.find((node) => node.name === "Search Broad News Sources").parameters,
    jsonBody: tavilyBody("announcement_query", {
      topic: "general",
      includeDomainsField: "official_domains",
      maxResults: 14
    })
  }
});

copyNode("Merge Broad News Meta + Results", {
  id: "merge-company-announcements",
  name: "Merge Company Announcement Meta + Results",
  position: [208, 1024]
});

copyNode("Flatten Broad News Results", {
  id: "flatten-company-announcements",
  name: "Flatten Company Announcement Results",
  position: [448, 1024],
  parameters: {
    functionCode: makeFlattenCode("official", "announcement_query")
  }
});

copyNode("Search Broad News Sources", {
  id: "search-targeted-news-sites",
  name: "Search Curated News Sites",
  position: [-32, 1144],
  parameters: {
    ...workflow.nodes.find((node) => node.name === "Search Broad News Sources").parameters,
    jsonBody: tavilyBody("targeted_news_query", {
      topic: "news",
      includeDomainsField: "news_domains",
      maxResults: 16
    })
  }
});

copyNode("Merge Broad News Meta + Results", {
  id: "merge-targeted-news-sites",
  name: "Merge Curated News Meta + Results",
  position: [208, 1144]
});

copyNode("Flatten Broad News Results", {
  id: "flatten-targeted-news-sites",
  name: "Flatten Curated News Results",
  position: [448, 1144],
  parameters: {
    functionCode: makeFlattenCode("news", "targeted_news_query")
  }
});

workflow.nodes.push({
  parameters: {},
  type: "n8n-nodes-base.merge",
  typeVersion: 3.2,
  position: [704, 1192],
  id: "append-broad-and-curated-news",
  name: "Append Broad + Curated News"
});

workflow.nodes.push({
  parameters: {},
  type: "n8n-nodes-base.merge",
  typeVersion: 3.2,
  position: [832, 1112],
  id: "append-news-and-announcements",
  name: "Append News + Announcements"
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
delete oldConnections["Search News Sources"];
delete oldConnections["Merge News Meta + Results"];
delete oldConnections["Flatten News Results"];

oldConnections["Dashboard Webhook"] = {
  main: [[{ node: "Normalize Inputs", type: "main", index: 0 }]]
};

oldConnections["Normalize Inputs"] = {
  main: [[
    { node: "Search Official / Regulatory Sources", type: "main", index: 0 },
    { node: "Merge Official Meta + Results", type: "main", index: 0 },
    { node: "Search Government / Lobbying Sources", type: "main", index: 0 },
    { node: "Merge Government Meta + Results", type: "main", index: 0 },
    { node: "Search Think Tank / Policy Sources", type: "main", index: 0 },
    { node: "Merge Think Tank Meta + Results", type: "main", index: 0 },
    { node: "Search Company Website Announcements", type: "main", index: 0 },
    { node: "Merge Company Announcement Meta + Results", type: "main", index: 0 },
    { node: "Search Curated News Sites", type: "main", index: 0 },
    { node: "Merge Curated News Meta + Results", type: "main", index: 0 },
    { node: "Search Broad News Sources", type: "main", index: 0 },
    { node: "Merge Broad News Meta + Results", type: "main", index: 0 },
    { node: "Read Company Notes", type: "main", index: 0 },
    { node: "Read CSIS Experts", type: "main", index: 0 }
  ]]
};

oldConnections["Search Company Website Announcements"] = {
  main: [[{ node: "Merge Company Announcement Meta + Results", type: "main", index: 1 }]]
};
oldConnections["Merge Company Announcement Meta + Results"] = {
  main: [[{ node: "Flatten Company Announcement Results", type: "main", index: 0 }]]
};
oldConnections["Search Curated News Sites"] = {
  main: [[{ node: "Merge Curated News Meta + Results", type: "main", index: 1 }]]
};
oldConnections["Merge Curated News Meta + Results"] = {
  main: [[{ node: "Flatten Curated News Results", type: "main", index: 0 }]]
};
oldConnections["Search Broad News Sources"] = {
  main: [[{ node: "Merge Broad News Meta + Results", type: "main", index: 1 }]]
};
oldConnections["Merge Broad News Meta + Results"] = {
  main: [[{ node: "Flatten Broad News Results", type: "main", index: 0 }]]
};
oldConnections["Flatten Broad News Results"] = {
  main: [[{ node: "Append Broad + Curated News", type: "main", index: 0 }]]
};
oldConnections["Flatten Curated News Results"] = {
  main: [[{ node: "Append Broad + Curated News", type: "main", index: 1 }]]
};
oldConnections["Append Broad + Curated News"] = {
  main: [[{ node: "Append News + Announcements", type: "main", index: 0 }]]
};
oldConnections["Flatten Company Announcement Results"] = {
  main: [[{ node: "Append News + Announcements", type: "main", index: 1 }]]
};
oldConnections["Append News + Announcements"] = {
  main: [[{ node: "Append + News", type: "main", index: 1 }]]
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
