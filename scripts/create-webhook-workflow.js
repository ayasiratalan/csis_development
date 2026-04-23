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

function tavilyBodyFromCurrentItem(queryField, domainsField, options) {
  return `={{ JSON.stringify({
  query: $json.${queryField},
  topic: '${options.topic}',
  search_depth: 'advanced',
  include_domains: $json.${domainsField},
  include_raw_content: true,
  max_results: $json.${options.maxResultsField} || ${options.defaultMaxResults},
  start_date: $json.start_date,
  end_date: $json.end_date,
  include_answer: false
}) }}`;
}

function makeFlattenCode(sourceClass, queryField) {
  const source =
    workflow.nodes.find((node) => node.name === "Flatten News Results") ||
    workflow.nodes.find((node) => node.name === "Flatten Broad News Results");
  if (!source) throw new Error("Missing news flatten source node");
  const code = source.parameters.functionCode
    .replace("const sourceClass = 'news';", `const sourceClass = '${sourceClass}';`)
    .replace("const queryField = 'news_query';", `const queryField = '${queryField}';`);
  if (code.includes("official_domains: item.official_domains")) return code;
  return code
    .split("company_domain: item.company_domain || '',")
    .join("company_domain: item.company_domain || '',\n      official_domains: item.official_domains || [],\n      corporate_news_domains: item.corporate_news_domains || [],");
}

updateNode("LLM 5 (Final Strategist)", (node) => {
  const systemMessage = (node.parameters.responses.values || []).find(
    (message) => message.role === "system"
  );
  if (!systemMessage) throw new Error("Missing system prompt for final strategist");

  if (!systemMessage.content.includes("inline markdown hyperlink citations")) {
    systemMessage.content +=
      "\n- Every factual sentence that relies on source material must end with one or more inline markdown hyperlink citations using URLs from `validated_sources`, for example `[Reuters](https://...)` or `[NVIDIA Newsroom](https://...)`." +
      "\n- Put citations immediately at the end of the sentence they support, not at the end of the paragraph." +
      "\n- Prefer the most specific source available for each sentence. Use official company newsroom, filing, or regulatory URLs when they support the claim." +
      "\n- If a sentence is based only on the company note and not on validated external sources, do not invent a citation for it." +
      "\n- Do not invent facts, meetings, experts, reports, or citation URLs.";
  }
});

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
	      "const dedup = (arr) => [...new Set(arr.filter(Boolean))];",
	      "const globalNewsDomains = [",
	      "  'reuters.com', 'apnews.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'cnbc.com',",
	      "  'marketwatch.com', 'barrons.com', 'forbes.com', 'fortune.com', 'axios.com',",
	      "  'politico.com', 'thehill.com', 'semafor.com', 'nikkei.com', 'asia.nikkei.com',",
	      "  'economist.com', 'finance.yahoo.com', 'prnewswire.com', 'businesswire.com', 'globenewswire.com'",
	      "];",
	      "const energyNewsDomains = [",
	      "  'oilprice.com', 'upstreamonline.com', 'rigzone.com', 'energyintel.com', 'hartenergy.com',",
	      "  'spglobal.com', 'argusmedia.com', 'energyvoice.com', 'ogj.com', 'worldoil.com',",
	      "  'lngprime.com', 'offshore-energy.biz', 'power-technology.com', 'renewablesnow.com',",
	      "  'hydrocarbons-technology.com', 'mees.com', 'arabnews.com'",
	      "];",
	      "const financeNewsDomains = [",
	      "  'americanbanker.com', 'bankingdive.com', 'finextra.com', 'pymnts.com', 'paymentsdive.com',",
	      "  'risk.net', 'pensionsandinvestments.com', 'institutionalinvestor.com', 'efinancialcareers.com'",
	      "];",
	      "const pharmaHealthNewsDomains = [",
	      "  'fiercepharma.com', 'fiercebiotech.com', 'biopharmadive.com', 'endpts.com',",
	      "  'statnews.com', 'pharmaphorum.com', 'genengnews.com', 'biospace.com',",
	      "  'pharmaceutical-technology.com', 'clinicaltrialsarena.com', 'pink.citeline.com'",
	      "];",
	      "const technologyNewsDomains = [",
	      "  'theverge.com', 'techcrunch.com', 'wired.com', 'arstechnica.com', 'theregister.com',",
	      "  'venturebeat.com', 'zdnet.com', 'crn.com', 'cio.com', 'computerworld.com',",
	      "  'protocol.com', 'informationweek.com', 'lightreading.com', 'fierce-network.com'",
	      "];",
	      "const semiconductorNewsDomains = [",
	      "  'semianalysis.com', 'semiconductor-digest.com', 'eetimes.com', 'electronicsweekly.com',",
	      "  'tomshardware.com', 'anandtech.com', 'electronics360.globalspec.com', 'design-reuse.com',",
	      "  'lightreading.com', 'fierce-network.com', 'rcrwireless.com', 'mobileworldlive.com',",
	      "  'androidauthority.com', 'gsmarena.com', '9to5google.com', 'digitimes.com',",
	      "  'scmp.com', 'semiengineering.com', 'electronicsweekly.com'",
	      "];",
	      "const aerospaceDefenseNewsDomains = [",
	      "  'defensenews.com', 'breakingdefense.com', 'defenseone.com', 'janes.com', 'aviationweek.com',",
	      "  'flightglobal.com', 'ainonline.com', 'airandspaceforces.com', 'nationaldefensemagazine.org',",
	      "  'c4isrnet.com', 'insideunmannedsystems.com', 'thewarzone.com', 'spacenews.com'",
	      "];",
	      "const automotiveIndustrialNewsDomains = [",
	      "  'automotivenews.com', 'autonews.com', 'carscoops.com', 'electrive.com', 'greencarreports.com',",
	      "  'wardsauto.com', 'autoblog.com', 'just-auto.com', 'industryweek.com', 'manufacturingdive.com',",
	      "  'engineeringnews.co.za', 'machinedesign.com'",
	      "];",
	      "const agricultureFoodNewsDomains = [",
	      "  'agweb.com', 'agrimarketing.com', 'feedstuffs.com', 'agriculture.com', 'world-grain.com',",
	      "  'foodbusinessnews.net', 'fooddive.com', 'beveragedaily.com', 'fooddive.com',",
	      "  'just-food.com', 'agri-pulse.com', 'successfulfarming.com'",
	      "];",
	      "const miningMetalsNewsDomains = [",
	      "  'mining.com', 'miningweekly.com', 'mining-technology.com', 'spglobal.com',",
	      "  'metalbulletin.com', 'fastmarkets.com', 'argusmedia.com', 'mining-journal.com',",
	      "  'australianmining.com.au', 'resourcesrisingstars.com.au'",
	      "];",
	      "const asiaBusinessNewsDomains = [",
	      "  'asia.nikkei.com', 'nikkei.com', 'japantimes.co.jp', 'japantoday.com', 'koreaherald.com',",
	      "  'koreatimes.co.kr', 'koreajoongangdaily.joins.com', 'scmp.com', 'straitstimes.com',",
	      "  'channelnewsasia.com', 'koreabizwire.com'",
	      "];",
	      "const domainPack = (...groups) => dedup([...globalNewsDomains, ...groups.flat()]);",
	      "const commonNewsTerms = ['earnings', 'acquisition', 'divestiture', 'lawsuit', 'regulation', 'contract', 'partnership', 'investment', 'launch', 'order', 'award', 'geopolitical', 'supply chain', 'policy', 'tariff', 'sanctions', 'export controls'];",
	      "const companyProfiles = {",
	      "  adm: { domain: 'adm.com', aliases: ['Archer Daniels Midland', 'ADM Company', 'Archer-Daniels-Midland'], official_domains: ['adm.com'], news_domains: domainPack(agricultureFoodNewsDomains), news_terms: ['grain', 'soybean', 'corn', 'biofuels', 'ethanol', 'agriculture', 'food ingredients'] },",
	      "  bhp: { domain: 'bhp.com', aliases: ['BHP Group', 'Broken Hill Proprietary'], official_domains: ['bhp.com'], news_domains: domainPack(miningMetalsNewsDomains, asiaBusinessNewsDomains), news_terms: ['mining', 'copper', 'iron ore', 'potash', 'coal', 'critical minerals', 'nickel'] },",
	      "  hyundai: { domain: 'hyundai.com', aliases: ['Hyundai Motor', 'Hyundai Motor Company', 'Hyundai Motor Group', 'Hyundai Mobis'], official_domains: ['hyundai.com', 'hyundai.news', 'hyundaimotorgroup.com'], news_domains: domainPack(automotiveIndustrialNewsDomains, asiaBusinessNewsDomains), news_terms: ['electric vehicle', 'EV', 'battery', 'automotive', 'mobility', 'hydrogen', 'manufacturing'] },",
	      "  samsung: { domain: 'samsung.com', aliases: ['Samsung Electronics', 'Samsung Group', 'Samsung Semiconductor'], official_domains: ['samsung.com', 'news.samsung.com', 'semiconductor.samsung.com'], news_domains: domainPack(technologyNewsDomains, semiconductorNewsDomains, asiaBusinessNewsDomains), news_terms: ['chip', 'chips', 'semiconductor', 'memory', 'foundry', 'AI', 'smartphone', 'display'] },",
	      "  chevron: { domain: 'chevron.com', aliases: ['Chevron Corporation', 'Chevron U.S.A.'], official_domains: ['chevron.com'], news_domains: domainPack(energyNewsDomains), news_terms: ['oil', 'gas', 'LNG', 'upstream', 'refining', 'hydrogen', 'carbon capture', 'Guyana', 'Permian'] },",
	      "  cisco: { domain: 'cisco.com', aliases: ['Cisco Systems', 'Cisco Systems Inc.'], official_domains: ['cisco.com', 'newsroom.cisco.com'], news_domains: domainPack(technologyNewsDomains), news_terms: ['networking', 'cybersecurity', 'AI', 'cloud', 'data center', 'telecom', 'Splunk'] },",
	      "  merck: { domain: 'merck.com', aliases: ['Merck & Co.', 'MSD', 'Merck Sharp & Dohme'], official_domains: ['merck.com'], news_domains: domainPack(pharmaHealthNewsDomains), news_terms: ['pharmaceutical', 'drug approval', 'clinical trial', 'oncology', 'vaccine', 'Keytruda', 'FDA'] },",
	      "  qualcomm: { domain: 'qualcomm.com', aliases: ['Qualcomm Incorporated', 'Qualcomm Technologies', 'Snapdragon', 'Qualcomm AI', 'Qualcomm CDMA Technologies'], official_domains: ['qualcomm.com', 'investor.qualcomm.com'], news_domains: domainPack(technologyNewsDomains, semiconductorNewsDomains), news_terms: ['chip', 'chips', 'semiconductor', 'AI', 'automotive', 'handset', 'modem', 'licensing', 'Snapdragon'] },",
	      "  nvidia: { domain: 'nvidia.com', aliases: ['NVIDIA Corporation', 'Nvidia Corp'], official_domains: ['nvidia.com', 'nvidianews.nvidia.com', 'investor.nvidia.com'], news_domains: domainPack(technologyNewsDomains, semiconductorNewsDomains), news_terms: ['AI', 'GPU', 'data center', 'chip', 'semiconductor', 'export controls', 'Blackwell', 'CUDA'] },",
	      "  microsoft: { domain: 'microsoft.com', aliases: ['Microsoft Corporation', 'MSFT', 'Azure'], official_domains: ['microsoft.com', 'news.microsoft.com'], news_domains: domainPack(technologyNewsDomains), news_terms: ['AI', 'cloud', 'Azure', 'cybersecurity', 'OpenAI', 'data center', 'software'] },",
	      "  ibm: { domain: 'ibm.com', aliases: ['International Business Machines', 'IBM Corporation', 'Red Hat'], official_domains: ['ibm.com', 'newsroom.ibm.com'], news_domains: domainPack(technologyNewsDomains), news_terms: ['AI', 'hybrid cloud', 'quantum', 'mainframe', 'consulting', 'Red Hat'] },",
	      "  exxon: { domain: 'corporate.exxonmobil.com', aliases: ['ExxonMobil', 'Exxon Mobil', 'Exxon Mobil Corporation'], official_domains: ['corporate.exxonmobil.com', 'exxonmobil.com'], news_domains: domainPack(energyNewsDomains), news_terms: ['oil', 'gas', 'LNG', 'upstream', 'refining', 'carbon capture', 'Permian', 'Guyana'] },",
	      "  amazon: { domain: 'amazon.com', aliases: ['Amazon.com', 'Amazon Web Services', 'AWS', 'Amazon Web Services Inc.'], official_domains: ['amazon.com', 'aboutamazon.com', 'aws.amazon.com'], news_domains: domainPack(technologyNewsDomains), news_terms: ['AWS', 'cloud', 'AI', 'data center', 'e-commerce', 'logistics', 'antitrust'] },",
	      "  'bank of america': { domain: 'bankofamerica.com', aliases: ['BofA', 'Bank of America Corporation', 'Merrill Lynch'], official_domains: ['bankofamerica.com', 'newsroom.bankofamerica.com'], news_domains: domainPack(financeNewsDomains), news_terms: ['banking', 'capital markets', 'wealth management', 'consumer banking', 'stress test', 'interest rates'] },",
	      "  pepsico: { domain: 'pepsico.com', aliases: ['PepsiCo Inc.', 'Pepsi', 'Frito-Lay', 'Quaker Foods'], official_domains: ['pepsico.com'], news_domains: domainPack(agricultureFoodNewsDomains), news_terms: ['food', 'beverages', 'snacks', 'consumer goods', 'supply chain', 'packaging', 'pricing'] },",
	      "  infineon: { domain: 'infineon.com', aliases: ['Infineon Technologies', 'Infineon Technologies AG'], official_domains: ['infineon.com'], news_domains: domainPack(technologyNewsDomains, semiconductorNewsDomains), news_terms: ['chip', 'chips', 'semiconductor', 'power semiconductor', 'automotive', 'microcontroller', 'SiC'] },",
	      "  gilead: { domain: 'gilead.com', aliases: ['Gilead Sciences', 'Gilead Sciences Inc.'], official_domains: ['gilead.com'], news_domains: domainPack(pharmaHealthNewsDomains), news_terms: ['pharmaceutical', 'clinical trial', 'oncology', 'HIV', 'liver disease', 'FDA', 'drug approval'] },",
	      "  aramco: { domain: 'aramco.com', aliases: ['Saudi Aramco', 'Saudi Arabian Oil Company'], official_domains: ['aramco.com'], news_domains: domainPack(energyNewsDomains, asiaBusinessNewsDomains), news_terms: ['oil', 'gas', 'LNG', 'upstream', 'refining', 'petrochemicals', 'OPEC', 'Saudi Arabia'] },",
	      "  equinor: { domain: 'equinor.com', aliases: ['Equinor ASA', 'Statoil'], official_domains: ['equinor.com'], news_domains: domainPack(energyNewsDomains), news_terms: ['oil', 'gas', 'offshore wind', 'LNG', 'North Sea', 'renewables', 'carbon capture'] },",
	      "  'sk americas': { domain: 'sk.com', aliases: ['SK Group', 'SK hynix', 'SK Innovation', 'SK On', 'SK Americas'], official_domains: ['sk.com', 'skhynix.com', 'skinnonews.com', 'sk-on.com'], news_domains: domainPack(technologyNewsDomains, semiconductorNewsDomains, energyNewsDomains, asiaBusinessNewsDomains), news_terms: ['semiconductor', 'memory', 'battery', 'EV battery', 'energy', 'chip', 'Korea'] },",
	      "  'jp morgan': { domain: 'jpmorganchase.com', aliases: ['JPMorgan Chase', 'J.P. Morgan', 'JPMorgan', 'JPMorgan Chase & Co.'], official_domains: ['jpmorganchase.com'], news_domains: domainPack(financeNewsDomains), news_terms: ['banking', 'investment banking', 'asset management', 'markets', 'stress test', 'interest rates'] },",
	      "  boeing: { domain: 'boeing.com', aliases: ['The Boeing Company', 'Boeing Defense', 'Boeing Commercial Airplanes'], official_domains: ['boeing.com'], news_domains: domainPack(aerospaceDefenseNewsDomains, automotiveIndustrialNewsDomains), news_terms: ['aircraft', 'defense', 'aerospace', '737', '787', 'space', 'FAA', 'supply chain'] },",
	      "  'general atomics': { domain: 'ga.com', aliases: ['General Atomics Aeronautical Systems', 'GA-ASI', 'General Atomics ASI', 'MQ-9', 'Reaper drone'], official_domains: ['ga.com', 'ga-asi.com'], news_domains: domainPack(aerospaceDefenseNewsDomains), news_terms: ['drone', 'UAV', 'unmanned', 'defense', 'aerospace', 'MQ-9', 'contract award'] },",
	      "  mitsubishi: { domain: 'mhi.com', aliases: ['Mitsubishi Heavy Industries', 'MHI', 'Mitsubishi Corporation', 'Mitsubishi Electric'], official_domains: ['mhi.com', 'mitsubishicorp.com', 'mitsubishielectric.com'], news_domains: domainPack(automotiveIndustrialNewsDomains, aerospaceDefenseNewsDomains, energyNewsDomains, asiaBusinessNewsDomains), news_terms: ['heavy industry', 'defense', 'shipbuilding', 'space', 'nuclear', 'energy', 'turbine', 'Japan'] },",
	      "  sumitomo: { domain: 'sumitomo.com', aliases: ['Sumitomo Corporation', 'Sumitomo Electric', 'Sumitomo Mitsui'], official_domains: ['sumitomocorp.com', 'sumitomo.com', 'sumitomoelectric.com'], news_domains: domainPack(miningMetalsNewsDomains, energyNewsDomains, asiaBusinessNewsDomains), news_terms: ['trading house', 'mining', 'energy', 'infrastructure', 'Japan', 'critical minerals'] }",
	      "};",
      "const profile = companyProfiles[profileKey] || {};",
      "const rawAliases = Array.isArray(item.company_aliases)",
      "  ? item.company_aliases",
      "  : (item.company_aliases || '').toString().split(/[;,]/);",
	      "const companyAliases = [...new Set([...(profile.aliases || []), ...rawAliases]",
	      "  .map(a => (a || '').toString().trim())",
	      "  .filter(Boolean))];",
	      "const companyNames = [company, ...companyAliases];",
	      "const queryCompanyNames = dedup(companyNames).slice(0, 3);",
	      "const quoteTerm = (value) => {",
	      "  const clean = (value || '').toString().replace(/\"/g, '').trim();",
	      "  return clean.includes(' ') || /[^A-Za-z0-9.-]/.test(clean) ? `\"${clean}\"` : clean;",
	      "};",
	      "const buildLimitedQuery = (names, terms, maxLength = 360) => {",
	      "  const cleanNames = dedup(names.map(name => (name || '').toString().trim()).filter(Boolean)).slice(0, 3);",
	      "  const cleanTerms = dedup(terms.map(term => (term || '').toString().trim()).filter(Boolean));",
	      "  for (let nameCount = cleanNames.length; nameCount >= 1; nameCount--) {",
	      "    const namePart = cleanNames.slice(0, nameCount).map(quoteTerm).join(' OR ');",
	      "    const selectedTerms = [];",
	      "    for (const term of cleanTerms) {",
	      "      const candidateTerms = [...selectedTerms, term];",
	      "      const candidate = `(${namePart}) (${candidateTerms.map(quoteTerm).join(' OR ')})`;",
	      "      if (candidate.length <= maxLength) selectedTerms.push(term);",
	      "    }",
	      "    if (selectedTerms.length) return `(${namePart}) (${selectedTerms.map(quoteTerm).join(' OR ')})`;",
	      "  }",
	      "  return `${quoteTerm(cleanNames[0] || company)} ${quoteTerm(cleanTerms[0] || 'news')}`;",
	      "};",
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
	      "const filingTerms = ['8-K', '10-Q', '10-K', 'earnings release', 'investor relations', 'press release', 'news release', 'contract', 'award'];",
	      "const officialQuery = buildLimitedQuery(queryCompanyNames, paddedCik ? [shortCik, ...filingTerms] : filingTerms);",
	      "const governmentQuery = buildLimitedQuery(queryCompanyNames, ['LD-2', 'lobbying', 'procurement', 'Senate lobbying', 'Federal Register']);",
	      "const thinktankQuery = buildLimitedQuery(queryCompanyNames, ['regulation', 'policy', 'analysis', 'briefing', 'strategic risk']);",
	      "const announcementTerms = ['announcement', 'press release', 'news release', 'contract', 'award', 'order', 'partnership', 'investment', 'launch', 'acquisition', 'divestiture', 'lawsuit', 'earnings'];",
	      "const queryTerms = dedup([...commonNewsTerms, ...(profile.news_terms || [])]);",
	      "const announcementQueryTerms = dedup([...announcementTerms, ...(profile.news_terms || [])]);",
	      "const announcementQuery = buildLimitedQuery(queryCompanyNames, announcementQueryTerms);",
	      "const targetedNewsQuery = buildLimitedQuery(queryCompanyNames, queryTerms);",
	      "const newsQuery = buildLimitedQuery(queryCompanyNames, queryTerms);",
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

updateNode("Deduplicate and Tidy Documents", (node) => {
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "company_domain: doc.company_domain || '',",
    "company_domain: doc.company_domain || '',\n      official_domains: doc.official_domains || [],\n      corporate_news_domains: doc.corporate_news_domains || [],"
  );
});

updateNode("Validate Dates and Company Match", (node) => {
  node.parameters.functionCode = node.parameters.functionCode.replace(
    "    if (companyDomain && domain && domain !== 'sec.gov' && domain !== 'businesswire.com' && domain !== 'prnewswire.com' && domain !== 'globenewswire.com') {\n      if (!(domain === companyDomain || domain.endsWith(`.${companyDomain}`))) reasons.push('non_company_official_domain');\n    }",
    [
      "    const docOfficialDomains = Array.isArray(doc.official_domains) ? doc.official_domains : [];",
      "    const docCorporateNewsDomains = Array.isArray(doc.corporate_news_domains) ? doc.corporate_news_domains : [];",
      "    const allowedOfficialDomains = [",
      "      companyDomain,",
      "      ...docOfficialDomains,",
      "      ...docCorporateNewsDomains,",
      "      'sec.gov',",
      "      'businesswire.com',",
      "      'prnewswire.com',",
      "      'globenewswire.com'",
      "    ]",
      "      .map(d => (d || '').toString().toLowerCase().replace(/^www\\./, ''))",
      "      .filter(Boolean);",
      "    const officialDomainAllowed = allowedOfficialDomains.some(d => domain === d || domain.endsWith(`.${d}`));",
      "    if (domain && !officialDomainAllowed) reasons.push('non_company_official_domain');"
    ].join("\n")
  );
});

updateNode("Append results to data_base_v1", (node) => {
  const value = node.parameters.columns.value;
  value.row_number = "={{ $('Normalize Inputs').first().json.row_number || '' }}";
  value.run_id = "={{ $('Normalize Inputs').first().json.run_id }}";
  value.company_name = "={{ $('Normalize Inputs').first().json.company_name }}";
  value.time_period_label = "={{ $('Normalize Inputs').first().json.time_period_label }}";
  value.time_period_days = "={{ $('Normalize Inputs').first().json.time_period_days }}";
  value.requested_at = "={{ $('Normalize Inputs').first().json.requested_at || '' }}";
  value.started_at = "={{ $('Normalize Inputs').first().json.scraped_at }}";
  value.notes = "={{ $('Normalize Inputs').first().json.notes || '' }}";
});

updateNode("Convert Documents to Excel", (node) => {
  if (!node.parameters.options) node.parameters.options = {};
  if (typeof node.parameters.options.fileName === "string") {
    node.parameters.options.fileName = node.parameters.options.fileName.replace(
      /\$\("Normalize Inputs"\)\.item\.json/g,
      "$(\"Normalize Inputs\").first().json"
    );
  } else {
    node.parameters.options.fileName =
      "={{ $(\"Normalize Inputs\").first().json.company_name }}_validated_documents_{{ $now.toFormat(\"yyyy-MM-dd\") }}.xlsx";
  }
  node.parameters.options.sheetName = "Validated Documents";
});

updateNode("Select Company Note", (node) => {
  node.parameters.functionCode = [
    "const normalized = $('Normalize Inputs').item.json || {};",
    "const target = ((normalized.company_name || '') + '').trim().toLowerCase();",
    "const rows = items.map(i => i.json || {});",
    "const match = rows.find(r => (((r.company_name || r.Company || '') + '').trim().toLowerCase() === target)) || {};",
    "const getField = (...names) => {",
    "  for (const name of names) {",
    "    const value = match[name];",
    "    if (value !== undefined && value !== null && value.toString().trim()) return value.toString().trim();",
    "  }",
    "  return '';",
    "};",
    "const dedup = (arr) => [...new Set(arr.filter(Boolean))];",
    "const normalizeUrl = (raw = '') => {",
    "  const value = raw.toString().trim().replace(/[),.;]+$/g, '');",
    "  if (!value) return '';",
    "  if (/^https?:\\/\\//i.test(value)) return value;",
    "  if (/^[a-z0-9.-]+\\.[a-z]{2,}(\\/.*)?$/i.test(value)) return `https://${value}`;",
    "  return '';",
    "};",
    "const hostname = (raw = '') => {",
    "  const url = normalizeUrl(raw);",
    "  if (!url) return '';",
    "  try { return new URL(url).hostname.toLowerCase().replace(/^www\\./, ''); } catch (e) { return ''; }",
    "};",
    "const corporateNewsRaw = getField('company_news', 'Corporate News', 'Company News', 'corporate_news', 'Corporate_News', 'company news');",
    "const explicitUrls = corporateNewsRaw.match(/https?:\\/\\/[^\\s,;]+/gi) || [];",
    "const urlTokens = corporateNewsRaw.split(/[\\s,;\\n]+/);",
    "const corporateNewsLinks = dedup([...explicitUrls, ...urlTokens].map(normalizeUrl));",
    "const corporateNewsDomains = dedup([",
    "  ...corporateNewsLinks.map(hostname),",
    "  ...((normalized.official_domains || []).filter(Boolean))",
    "]);",
    "const note = {",
    "  company_name: match.company_name || match.Company || normalized.company_name || '',",
    "  industries: getField('industries', 'What industries are they in'),",
    "  operating_regions: getField('operating_regions', 'Where do they operate'),",
    "  sensitivities: getField('other_sensitivities', 'Other sensitivities'),",
    "  requested_briefings: getField('requested_briefings', 'What have they requested briefings on'),",
    "  future_interests: getField('future_interests', 'Best Guess for Future Interests'),",
    "  corporate_news: corporateNewsRaw",
    "};",
    "const hasNote = Object.values(note).some(v => (v || '').toString().trim() !== '');",
    "const bundle = hasNote",
    "  ? [",
    "      `Company: ${note.company_name}`,",
    "      `Industries: ${note.industries}`,",
    "      `Where they operate: ${note.operating_regions}`,",
    "      `Other sensitivities: ${note.sensitivities}`,",
    "      `Requested briefings: ${note.requested_briefings}`,",
    "      `Best guess for future interests: ${note.future_interests}`,",
    "      `Corporate newsrooms: ${corporateNewsLinks.join(', ') || corporateNewsRaw || 'None provided'}`",
    "    ].join('\\n')",
    "  : 'No past CSIS engagement memo found for this company.';",
    "return [{",
    "  json: {",
    "    ...normalized,",
    "    company_note_found: hasNote,",
    "    company_note_struct: note,",
    "    company_note_bundle: bundle,",
    "    corporate_news_raw: corporateNewsRaw,",
    "    corporate_news_links: corporateNewsLinks,",
    "    corporate_news_domains: corporateNewsDomains,",
    "    corporate_news_query: normalized.announcement_query,",
    "    corporate_news_max_results: corporateNewsLinks.length ? 20 : 5",
    "  },",
    "  pairedItem: { item: 0 }",
    "}];"
  ].join("\n");
});

updateNode("Search News Sources", (node) => {
  node.name = "Search Broad News Sources";
  node.position = [-32, 1264];
  node.parameters.jsonBody = tavilyBody("news_query", {
    topic: "news",
    maxResults: 30
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
      maxResults: 20
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
  id: "search-corporate-newsroom-links",
  name: "Search Corporate Newsroom Links",
  position: [704, 888],
  parameters: {
    ...workflow.nodes.find((node) => node.name === "Search Broad News Sources").parameters,
    jsonBody: tavilyBodyFromCurrentItem("corporate_news_query", "corporate_news_domains", {
      topic: "general",
      maxResultsField: "corporate_news_max_results",
      defaultMaxResults: 10
    })
  }
});

copyNode("Merge Broad News Meta + Results", {
  id: "merge-corporate-newsroom-links",
  name: "Merge Corporate Newsroom Meta + Results",
  position: [944, 888]
});

copyNode("Flatten Broad News Results", {
  id: "flatten-corporate-newsroom-links",
  name: "Flatten Corporate Newsroom Results",
  position: [1184, 888],
  parameters: {
    functionCode: makeFlattenCode("official", "corporate_news_query")
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
      maxResults: 30
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

workflow.nodes.push({
  parameters: {},
  type: "n8n-nodes-base.merge",
  typeVersion: 3.2,
  position: [1072, 1032],
  id: "append-corporate-newsroom-results",
  name: "Append Corporate Newsroom Results"
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
  main: [[{ node: "Append Corporate Newsroom Results", type: "main", index: 0 }]]
};
oldConnections["Select Company Note"] = {
  main: [[
    { node: "Merge Final Packet", type: "main", index: 5 },
    { node: "Search Corporate Newsroom Links", type: "main", index: 0 },
    { node: "Merge Corporate Newsroom Meta + Results", type: "main", index: 0 }
  ]]
};
oldConnections["Search Corporate Newsroom Links"] = {
  main: [[{ node: "Merge Corporate Newsroom Meta + Results", type: "main", index: 1 }]]
};
oldConnections["Merge Corporate Newsroom Meta + Results"] = {
  main: [[{ node: "Flatten Corporate Newsroom Results", type: "main", index: 0 }]]
};
oldConnections["Flatten Corporate Newsroom Results"] = {
  main: [[{ node: "Append Corporate Newsroom Results", type: "main", index: 1 }]]
};
oldConnections["Append Corporate Newsroom Results"] = {
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
