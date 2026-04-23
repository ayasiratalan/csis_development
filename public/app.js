(function () {
  var state = {
    companyKey: "adm",
    intervalDays: 14,
    loading: false,
    workflowMode: "unknown",
    isFilePreview: window.location.protocol === "file:"
  };

  var runtimeConfig = window.CSIS_DASHBOARD_CONFIG || {};

  var companyData = {
    adm: {
      name: "ADM",
      domain: "adm.com",
      secCik: "7084"
    },
    bhp: {
      name: "BHP",
      domain: "bhp.com",
      secCik: "811809"
    },
    hyundai: {
      name: "Hyundai",
      domain: "hyundai.com",
      secCik: ""
    },
    samsung: {
      name: "Samsung",
      domain: "samsung.com",
      secCik: ""
    },
    chevron: {
      name: "Chevron",
      domain: "chevron.com",
      secCik: "93410"
    },
    cisco: {
      name: "Cisco",
      domain: "cisco.com",
      secCik: "858877"
    },
    merck: {
      name: "Merck",
      domain: "merck.com",
      secCik: "310158"
    },
    qualcomm: {
      name: "Qualcomm",
      domain: "qualcomm.com",
      secCik: "804328",
      aliases: [
        "Qualcomm Incorporated",
        "Qualcomm Technologies",
        "Snapdragon",
        "Qualcomm AI",
        "Qualcomm CDMA Technologies"
      ]
    },
    nvidia: {
      name: "NVIDIA",
      domain: "nvidia.com",
      secCik: "1045810"
    },
    microsoft: {
      name: "Microsoft",
      domain: "microsoft.com",
      secCik: "789019"
    },
    ibm: {
      name: "IBM",
      domain: "ibm.com",
      secCik: "51143"
    },
    exxon: {
      name: "Exxon",
      domain: "corporate.exxonmobil.com",
      secCik: "34088"
    },
    amazon: {
      name: "Amazon",
      domain: "amazon.com",
      secCik: "1018724"
    },
    bank_of_america: {
      name: "Bank of America",
      domain: "bankofamerica.com",
      secCik: "70858"
    },
    pepsico: {
      name: "PepsiCo",
      domain: "pepsico.com",
      secCik: "77476"
    },
    infineon: {
      name: "Infineon",
      domain: "infineon.com",
      secCik: ""
    },
    gilead: {
      name: "Gilead",
      domain: "gilead.com",
      secCik: "882095"
    },
    aramco: {
      name: "Aramco",
      domain: "aramco.com",
      secCik: ""
    },
    equinor: {
      name: "Equinor",
      domain: "equinor.com",
      secCik: "1140625"
    },
    sk_americas: {
      name: "SK Americas",
      domain: "sk.com",
      secCik: ""
    },
    jp_morgan: {
      name: "JP Morgan",
      domain: "jpmorganchase.com",
      secCik: "19617"
    },
    boeing: {
      name: "Boeing",
      domain: "boeing.com",
      secCik: "12927"
    },
    general_atomics: {
      name: "General Atomics",
      domain: "ga.com",
      secCik: ""
    },
    mitsubishi: {
      name: "Mitsubishi",
      domain: "mhi.com",
      secCik: "",
      aliases: ["Mitsubishi Heavy Industries", "MHI"]
    },
    sumitomo: {
      name: "Sumitomo",
      domain: "sumitomo.com",
      secCik: ""
    }
  };

  var companyOptions = document.getElementById("company-options");
  var daySlider = document.getElementById("day-slider");
  var dayValue = document.getElementById("day-value");
  var generateButton = document.getElementById("generate-button");
  var statusBox = document.getElementById("status-box");
  var loadingPanel = document.getElementById("loading-panel");
  var progressFill = document.getElementById("progress-fill");
  var progressPercent = document.getElementById("progress-percent");
  var progressStage = document.getElementById("progress-stage");
  var resultsPanel = document.getElementById("results-panel");
  var modeChip = document.getElementById("mode-chip");
  var memoTitle = document.getElementById("memo-title");
  var memoBody = document.getElementById("memo-body");
  var runMeta = document.getElementById("run-meta");
  var sourcesList = document.getElementById("sources-list");
  var fileChip = document.getElementById("file-chip");
  var progressTimer = null;
  var allowedIntervals = [14, 30, 60];

  function sliderPositionFromDays(days) {
    var index = allowedIntervals.indexOf(days);
    return index === -1 ? 0 : index;
  }

  function sliderPercent() {
    var min = Number(daySlider.min || 0);
    var max = Number(daySlider.max || (allowedIntervals.length - 1));
    return ((sliderPositionFromDays(state.intervalDays) - min) / (max - min)) * 100;
  }

  function renderDaySelector() {
    if (!daySlider || !dayValue) return;
    daySlider.value = String(sliderPositionFromDays(state.intervalDays));
    dayValue.textContent = state.intervalDays + " days";
    daySlider.style.background =
      "linear-gradient(90deg, rgba(215, 181, 109, 0.88) 0%, rgba(215, 181, 109, 0.88) " +
      sliderPercent() +
      "%, rgba(255, 255, 255, 0.15) " +
      sliderPercent() +
      "%, rgba(255, 255, 255, 0.15) 100%)";
  }

  function setStatus(message) {
    statusBox.textContent = message;
  }

  function progressStageLabel(percent) {
    if (percent < 18) return "Submitting request";
    if (percent < 44) return "Collecting source universe";
    if (percent < 68) return "Validating documents";
    if (percent < 88) return "Drafting memo";
    return "Finalizing memo and sources";
  }

  function setProgress(percent) {
    var bounded = Math.max(8, Math.min(100, Math.round(percent)));
    progressFill.style.width = bounded + "%";
    progressPercent.textContent = bounded + "%";
    progressStage.textContent = progressStageLabel(bounded);
  }

  function stopProgressSimulation() {
    if (progressTimer) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function startProgressSimulation() {
    var checkpoints = [
      { elapsed: 0, percent: 8 },
      { elapsed: 3500, percent: 18 },
      { elapsed: 15000, percent: 40 },
      { elapsed: 32000, percent: 64 },
      { elapsed: 54000, percent: 82 },
      { elapsed: 85000, percent: 93 }
    ];
    var startedAt = Date.now();

    stopProgressSimulation();
    setProgress(8);

    progressTimer = window.setInterval(function () {
      var elapsed = Date.now() - startedAt;
      var current = checkpoints[0];
      var next = checkpoints[checkpoints.length - 1];

      checkpoints.forEach(function (point, index) {
        if (elapsed >= point.elapsed) {
          current = point;
          next = checkpoints[Math.min(index + 1, checkpoints.length - 1)];
        }
      });

      if (current === next) {
        setProgress(current.percent);
        return;
      }

      var span = next.elapsed - current.elapsed;
      var ratio = span > 0 ? (elapsed - current.elapsed) / span : 1;
      setProgress(current.percent + (next.percent - current.percent) * ratio);
    }, 420);
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    generateButton.disabled = isLoading;
    generateButton.textContent = isLoading ? "Running..." : "Run Workflow";
    loadingPanel.hidden = !isLoading;
    if (isLoading) {
      resultsPanel.hidden = true;
      startProgressSimulation();
      return;
    }
    stopProgressSimulation();
    setProgress(8);
  }

  function setActiveButton(container, attributeName, value) {
    Array.prototype.forEach.call(container.querySelectorAll(".pill"), function (button) {
      var isActive = button.getAttribute(attributeName) === String(value);
      button.classList.toggle("active", isActive);
    });
  }

  function renderCompanyOptions() {
    companyOptions.innerHTML = "";
    Object.keys(companyData)
      .sort(function (left, right) {
        return companyData[left].name.localeCompare(companyData[right].name);
      })
      .forEach(function (companyKey) {
        var button = document.createElement("button");
        button.className = "pill";
        button.setAttribute("data-company", companyKey);
        button.textContent = companyData[companyKey].name;
        if (companyKey === state.companyKey) {
          button.classList.add("active");
        }
        companyOptions.appendChild(button);
      });
  }

  function formatDate(dateString) {
    if (!dateString) return "Unknown date";
    var date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleString();
  }

  function formatConfidence(value) {
    if (typeof value !== "number") return "";
    return "Confidence " + Math.round(value * 100) + "%";
  }

  function currentMainWebsite() {
    var company = companyData[state.companyKey] || {};
    return company.domain || "";
  }

  function isoDateOffset(daysAgo) {
    var date = new Date();
    date.setUTCDate(date.getUTCDate() - daysAgo);
    return date.toISOString().slice(0, 10);
  }

  function buildPreviewMemo(company, intervalDays) {
    if (company.name === "Chevron") {
      return [
        "Chevron has had a dense " +
          intervalDays +
          "-day signal environment shaped by investor messaging, portfolio updates, and policy-sensitive coverage around energy security, LNG, and emissions rules.",
        "The strongest CSIS outreach angle is the intersection of supply resilience, industrial competitiveness, and regulatory durability. That framing is more useful than generic energy transition language because it connects to current business and policy pressures.",
        "A one-page memo should organize the findings around recent developments, regulatory and geopolitical exposure, and the fit with CSIS expertise in energy security, global supply chains, and strategic competition.",
        "Recommended next step: position CSIS engagement as a targeted briefing or roundtable on energy market disruption, global policy risk, and investment planning."
      ].join("\n\n");
    }

    return [
      company.name +
        " shows a " +
        intervalDays +
        "-day pattern of investor communication, regulatory watchpoints, and public positioning around production, technology investment, and long-cycle returns.",
      "The strongest CSIS outreach angle is to connect " +
        company.name +
        "'s current positioning with industrial strategy, supply-chain resilience, technology competition, energy security, and the geopolitical consequences of market realignment.",
      "A one-page memo should surface the most material developments, explain which policy or market pressures are shaping them, and translate that into why CSIS expertise matters now.",
      "Recommended next step: frame outreach around a focused discussion with CSIS experts on strategic energy competition, federal policy pathways, and downstream implications for corporate planning."
    ].join("\n\n");
  }

  function buildPreviewSources(companyKey, intervalDays) {
    var sourceSets = {
      chevron: [
        ["Chevron investor relations update", "https://www.chevron.com/investors", "chevron.com", "official", 7],
        ["Recent SEC filing for Chevron Corporation", "https://www.sec.gov/", "sec.gov", "official", 10],
        ["Federal Register energy policy notice", "https://www.federalregister.gov/", "federalregister.gov", "government", 11],
        ["CSIS analysis on energy security and market resilience", "https://www.csis.org/", "csis.org", "thinktank", 12],
        ["Major press coverage of Chevron market positioning", "https://www.reuters.com/", "reuters.com", "news", 5]
      ],
      exxon: [
        ["ExxonMobil corporate update", "https://corporate.exxonmobil.com/news", "corporate.exxonmobil.com", "official", 6],
        ["Recent SEC filing for Exxon Mobil Corporation", "https://www.sec.gov/", "sec.gov", "official", 11],
        ["OpenSecrets profile related to lobbying activity", "https://www.opensecrets.org/", "opensecrets.org", "government", 13],
        ["Think tank commentary on energy industrial strategy", "https://www.brookings.edu/", "brookings.edu", "thinktank", 15],
        ["Major press coverage of ExxonMobil operations", "https://www.wsj.com/", "wsj.com", "news", 9]
      ]
    };

    if (!sourceSets[companyKey]) {
      var company = companyData[companyKey];
      sourceSets[companyKey] = [
        [company.name + " official update", "https://" + company.domain, company.domain, "official", 6],
        [company.name + " SEC company filings", "https://www.sec.gov/", "sec.gov", "official", 10],
        [company.name + " policy and government signal", "https://www.federalregister.gov/", "federalregister.gov", "government", 13],
        [company.name + " strategic policy analysis", "https://www.csis.org/", "csis.org", "thinktank", 16],
        [company.name + " market and geopolitical coverage", "https://www.reuters.com/", "reuters.com", "news", 8]
      ];
    }

    return sourceSets[companyKey].map(function (source, index) {
      return {
        id: companyKey + "-preview-" + (index + 1),
        title: source[0],
        url: source[1],
        domain: source[2],
        sourceClass: source[3],
        publishedDate: isoDateOffset(Math.min(intervalDays - 1, source[4])),
        validationStatus: "accepted",
        entityConfidence: 0.84 + index * 0.03
      };
    });
  }

  function buildPreviewResult(companyKey, intervalDays) {
    var company = companyData[companyKey];
    var generatedAt = new Date().toISOString();

    return new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve({
          ok: true,
          mode: "file preview",
          runId:
            companyKey +
            "_" +
            generatedAt.slice(0, 10) +
            "_" +
            intervalDays +
            "d_preview",
          generatedAt: generatedAt,
          company: company.name,
          intervalDays: intervalDays,
          memo: buildPreviewMemo(company, intervalDays),
          sources: buildPreviewSources(companyKey, intervalDays),
          excelFileName:
            company.name +
            "_validated_documents_" +
            generatedAt.slice(0, 10) +
            ".xlsx"
        });
      }, 650);
    });
  }

  function hasDirectN8nWebhook() {
    return Boolean(runtimeConfig.n8nWebhookUrl && runtimeConfig.n8nWebhookUrl.trim());
  }

  function normalizeWebhookPayload(payload) {
    if (Array.isArray(payload)) {
      payload = payload[0] || {};
    }

    var sources = Array.isArray(payload.validated_sources)
      ? payload.validated_sources
      : Array.isArray(payload.sources)
        ? payload.sources
        : [];
    var memo =
      payload.memo ||
      payload.final_one_pager ||
      [
        payload.recent_developments_paragraph,
        payload.past_csis_engagement_paragraph,
        payload.csis_convergence_paragraph,
        payload.email_pitch_ideas
      ]
        .filter(Boolean)
        .join("\n\n");

    return {
      ok: true,
      mode: "direct n8n webhook",
      runId: payload.runId || payload.run_id || "",
      generatedAt:
        payload.generatedAt || payload.generated_at || new Date().toISOString(),
      company: companyData[state.companyKey].name,
      intervalDays: state.intervalDays,
      memo: memo || "n8n returned no memo text.",
      sources: sources.map(function (source, index) {
        return {
          id: source.id || "source-" + (index + 1),
          title: source.title || "Untitled source",
          url: source.url || "",
          domain: source.domain || source.source_domain || "",
          sourceClass: source.sourceClass || source.source_class || "source",
          publishedDate:
            source.publishedDate ||
            source.published_date ||
            source.actual_doc_date ||
            "",
          validationStatus:
            source.validationStatus || source.validation_status || "accepted",
          entityConfidence:
            typeof source.entityConfidence === "number"
              ? source.entityConfidence
              : typeof source.entity_confidence === "number"
                ? source.entity_confidence
        : null
        };
      }),
      excelFileName: payload.excelFileName || payload.excel_file_name || ""
    };
  }

  async function runDirectN8nWebhook() {
    var company = companyData[state.companyKey];
    var headers = {
      "Content-Type": "application/json"
    };

    if (runtimeConfig.n8nAuthHeader && runtimeConfig.n8nAuthValue) {
      headers[runtimeConfig.n8nAuthHeader] = runtimeConfig.n8nAuthValue;
    }

    var response;
    try {
      response = await fetch(runtimeConfig.n8nWebhookUrl.trim(), {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          company_name: company.name,
          company_domain: company.domain,
          sec_cik: company.secCik,
          company_aliases: company.aliases || [],
          time_period_days: state.intervalDays,
          time_period_label: state.intervalDays + " days"
        })
      });
    } catch (error) {
      throw new Error(
        "Browser could not reach the n8n webhook. This is usually a CORS restriction, browser privacy/ad-blocking setting, VPN/firewall issue, or a stale config.js on this computer."
      );
    }

    var payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(
        "The webhook responded, but not with valid JSON. Check the live webhook URL and confirm n8n returns JSON from `Respond to Dashboard`."
      );
    }
    if (!response.ok) {
      throw new Error(
        payload.error ||
          "n8n webhook returned HTTP " +
            response.status +
            ". Check that the workflow is active and CORS is allowed."
      );
    }

    var normalized = normalizeWebhookPayload(payload);
    if (
      (!normalized.memo || normalized.memo === "n8n returned no memo text.") &&
      normalized.sources.length === 0
    ) {
      throw new Error(
        "n8n returned an empty response. Fix the final `Prepare Webhook Response` / `Respond to Dashboard` nodes so they return `final_one_pager` and `validated_sources`."
      );
    }

    return normalized;
  }

  function appendLinkedText(parent, text) {
    var linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    var lastIndex = 0;
    var match;

    while ((match = linkPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      var link = document.createElement("a");
      link.href = match[2];
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = match[1];
      parent.appendChild(link);
      lastIndex = linkPattern.lastIndex;
    }

    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function hasInlineCitations(text) {
    return /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/.test(text || "");
  }

  function parseMemoSections(memo) {
    var lines = memo.split(/\r?\n/);
    var sections = [];
    var current = null;

    lines.forEach(function (line) {
      var trimmed = line.trim();
      var heading = trimmed.match(/^\d+\.\s+(.+)$/);

      if (heading) {
        if (current) sections.push(current);
        current = {
          title: heading[1].trim(),
          lines: []
        };
        return;
      }

      if (!current) {
        current = {
          title: "Memo",
          lines: []
        };
      }
      current.lines.push(line);
    });

    if (current) sections.push(current);
    return sections
      .map(function (section) {
        return {
          title: section.title,
          body: section.lines.join("\n").trim()
        };
      })
      .filter(function (section) {
        return section.body;
      });
  }

  function normalizePastEngagementParagraph(text) {
    var normalized = String(text || "").trim();
    if (!normalized) return "";

    normalized = normalized
      .replace(/^According to (the )?company note[:,]?\s*/i, "")
      .replace(/^Based on (the )?company note[:,]?\s*/i, "")
      .replace(/^Company note[:,]?\s*/i, "")
      .replace(/^In the past[:,]?\s*/i, "");

    if (!normalized) {
      return "In the past, no prior CSIS engagement details were available in the company note.";
    }

    return "In the past, " + normalized;
  }

  function normalizeMemoParagraph(title, text) {
    if (String(title || "").toLowerCase().indexOf("past csis engagement") !== -1) {
      return normalizePastEngagementParagraph(text);
    }
    return text;
  }

  function sectionSources(title, sources) {
    var lowerTitle = title.toLowerCase();
    var filtered = sources || [];

    if (lowerTitle.indexOf("past") !== -1) {
      return [];
    }

    if (lowerTitle.indexOf("why") !== -1 || lowerTitle.indexOf("csis") !== -1) {
      filtered = filtered.filter(function (source) {
        return (
          source.sourceClass === "thinktank" ||
          source.domain === "csis.org" ||
          String(source.domain || "").indexOf("csis.org") !== -1
        );
      });
    } else if (lowerTitle.indexOf("recent") !== -1) {
      filtered = filtered.filter(function (source) {
        return source.sourceClass !== "thinktank";
      });
    }

    if (!filtered.length) {
      filtered = sources || [];
    }

    return filtered
      .filter(function (source) {
        return source.url;
      })
      .slice(0, 4);
  }

  function appendCitations(parent, citations) {
    if (!citations.length) return;

    var citationWrap = document.createElement("span");
    citationWrap.className = "memo-citations";
    citationWrap.appendChild(document.createTextNode(" "));

    citations.forEach(function (source, index) {
      var link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "[" + (index + 1) + "]";
      link.title = source.title || source.domain || "Source";
      citationWrap.appendChild(link);
    });

    parent.appendChild(citationWrap);
  }

  function renderMemo(memo, sources) {
    memoBody.innerHTML = "";

    parseMemoSections(memo).forEach(function (section) {
      var sectionEl = document.createElement("section");
      sectionEl.className = "memo-section";

      var title = document.createElement("h3");
      title.textContent = section.title;
      sectionEl.appendChild(title);

      section.body
        .split(/\n{2,}/)
        .filter(Boolean)
        .forEach(function (paragraph, paragraphIndex) {
          var trimmed = normalizeMemoParagraph(section.title, paragraph.trim());

          if (trimmed.indexOf("- ") === 0) {
            var list = document.createElement("ul");
            trimmed.split(/\n+/).forEach(function (line) {
              var itemText = line.replace(/^-\s*/, "").trim();
              if (!itemText) return;
              var item = document.createElement("li");
              appendLinkedText(item, itemText);
              if (paragraphIndex === 0 && !hasInlineCitations(itemText)) {
                appendCitations(item, sectionSources(section.title, sources));
              }
              list.appendChild(item);
            });
            sectionEl.appendChild(list);
            return;
          }

          var p = document.createElement("p");
          appendLinkedText(p, trimmed);
          if (paragraphIndex === 0 && !hasInlineCitations(trimmed)) {
            appendCitations(p, sectionSources(section.title, sources));
          }
          sectionEl.appendChild(p);
        });

      memoBody.appendChild(sectionEl);
    });
  }

  function readableSourceClass(sourceClass) {
    return String(sourceClass || "source").replace(/_/g, " ");
  }

  function renderSources(sources) {
    sourcesList.innerHTML = "";

    if (!sources.length) {
      var empty = document.createElement("div");
      empty.className = "source-item";
      empty.textContent = "No validated sources were returned by the workflow.";
      sourcesList.appendChild(empty);
      return;
    }

    sources.forEach(function (source) {
      var item = document.createElement("article");
      item.className = "source-item";

      var top = document.createElement("div");
      top.className = "source-topline";

      var title = document.createElement("h4");
      title.className = "source-title";

      var link = document.createElement("a");
      link.href = source.url || "#";
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = source.title || "Untitled source";
      title.appendChild(link);

      var tagRow = document.createElement("div");
      tagRow.className = "tag-row";

      var sourceTag = document.createElement("span");
      sourceTag.className = "tag source";
      sourceTag.textContent = readableSourceClass(source.sourceClass);
      tagRow.appendChild(sourceTag);

      top.appendChild(title);
      top.appendChild(tagRow);

      var meta = document.createElement("div");
      meta.className = "source-meta";
      var mainWebsite = source.domain || currentMainWebsite();
      meta.textContent = [
        "Main website: " + mainWebsite,
        source.publishedDate ? "Published: " + source.publishedDate : ""
      ]
        .filter(Boolean)
        .join(" | ");

      item.appendChild(top);
      item.appendChild(meta);
      sourcesList.appendChild(item);
    });
  }

  function renderResult(result) {
    resultsPanel.hidden = false;
    memoTitle.textContent = result.company + " | " + result.intervalDays + "-day memo";
    runMeta.innerHTML =
      "Run ID: " +
      (result.runId || "n/a") +
      "<br />Generated: " +
      formatDate(result.generatedAt);
    fileChip.textContent = result.excelFileName
      ? "Validated file: " + result.excelFileName
      : "Validated sources displayed below";
    renderMemo(result.memo, result.sources || []);
    renderSources(result.sources || []);
  }

  async function loadHealth() {
    modeChip.hidden = true;

    if (hasDirectN8nWebhook()) {
      state.workflowMode = "direct n8n webhook";
      setStatus("Ready to generate a memo.");
      return;
    }

    if (state.isFilePreview) {
      state.workflowMode = "file preview";
      setStatus("Preview is available. Add a webhook URL in public/config.js for live runs.");
      return;
    }

    try {
      var response = await fetch("/api/health");
      var payload = await response.json();
      state.workflowMode = payload.workflowMode || "unknown";
      if (state.workflowMode === "webhook" && !payload.n8nConfigured) {
        setStatus(
          "Backend is in webhook mode, but N8N_WEBHOOK_URL is missing. Add it to .env and restart the server."
        );
      } else {
        setStatus("Ready to generate a memo.");
      }
    } catch (error) {
      setStatus(
        "Backend unavailable. Run `node server.js` and open http://127.0.0.1:3000, or open this file directly for preview mode."
      );
    }
  }

  async function runReport() {
    if (hasDirectN8nWebhook()) {
      return runDirectN8nWebhook();
    }

    if (state.isFilePreview) {
      return buildPreviewResult(state.companyKey, state.intervalDays);
    }

    var response = await fetch("/api/run-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        companyKey: state.companyKey,
        intervalDays: state.intervalDays
      })
    });

    var payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to complete workflow run.");
    }

    return payload;
  }

  companyOptions.addEventListener("click", function (event) {
    var button = event.target.closest("[data-company]");
    if (!button || state.loading) return;
    state.companyKey = button.getAttribute("data-company");
    setActiveButton(companyOptions, "data-company", state.companyKey);
  });

  daySlider.addEventListener("input", function (event) {
    if (state.loading) return;
    state.intervalDays = allowedIntervals[Number(event.target.value)] || allowedIntervals[0];
    renderDaySelector();
  });

  generateButton.addEventListener("click", async function () {
    var company = companyData[state.companyKey];
    setLoading(true);
    setStatus(
      "Submitting " +
        company.name +
        " for a " +
        state.intervalDays +
        "-day run. Waiting for the workflow to return the memo and validated sources."
    );

    try {
      var payload = await runReport();
      renderResult(payload);
      setStatus(
        "Completed " +
          payload.company +
          " for the last " +
          payload.intervalDays +
          " days. Review the memo and validated sources on the right."
      );
    } catch (error) {
      setStatus(error.message || "Workflow failed.");
    } finally {
      setLoading(false);
    }
  });

  renderCompanyOptions();
  renderDaySelector();

  loadHealth().then(function () {
    var search = new URLSearchParams(window.location.search);
    if (search.get("autorun") === "1") {
      generateButton.click();
    }
  });
})();
