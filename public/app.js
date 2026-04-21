(function () {
  var state = {
    companyKey: "chevron",
    intervalDays: 14,
    loading: false,
    workflowMode: "unknown",
    isFilePreview: window.location.protocol === "file:"
  };

  var runtimeConfig = window.CSIS_DASHBOARD_CONFIG || {};

  var companyData = {
    chevron: {
      name: "Chevron",
      domain: "chevron.com",
      secCik: "93410"
    },
    exxon: {
      name: "Exxon",
      domain: "corporate.exxonmobil.com",
      secCik: "34088"
    }
  };

  var companyOptions = document.getElementById("company-options");
  var intervalOptions = document.getElementById("interval-options");
  var generateButton = document.getElementById("generate-button");
  var statusBox = document.getElementById("status-box");
  var resultsPanel = document.getElementById("results-panel");
  var modeChip = document.getElementById("mode-chip");
  var memoTitle = document.getElementById("memo-title");
  var memoBody = document.getElementById("memo-body");
  var runMeta = document.getElementById("run-meta");
  var sourcesList = document.getElementById("sources-list");
  var fileChip = document.getElementById("file-chip");

  function setStatus(message) {
    statusBox.textContent = message;
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    generateButton.disabled = isLoading;
    generateButton.textContent = isLoading ? "Running..." : "Run Workflow";
  }

  function setActiveButton(container, attributeName, value) {
    Array.prototype.forEach.call(container.querySelectorAll(".pill"), function (button) {
      var isActive = button.getAttribute(attributeName) === String(value);
      button.classList.toggle("active", isActive);
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
      "Exxon shows a " +
        intervalDays +
        "-day pattern of investor communication, regulatory watchpoints, and public positioning around production, technology investment, and long-cycle returns.",
      "The strongest CSIS outreach angle is to connect ExxonMobil's current positioning with industrial strategy, energy security, and the geopolitical consequences of supply realignment.",
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

    var response = await fetch(runtimeConfig.n8nWebhookUrl.trim(), {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        company_name: company.name,
        company_domain: company.domain,
        sec_cik: company.secCik,
        time_period_days: state.intervalDays,
        time_period_label: state.intervalDays + " days"
      })
    });

    var payload = await response.json();
    if (!response.ok) {
      throw new Error(
        payload.error ||
          "n8n webhook returned HTTP " +
            response.status +
            ". Check that the workflow is active and CORS is allowed."
      );
    }

    return normalizeWebhookPayload(payload);
  }

  function renderMemo(memo) {
    memoBody.innerHTML = "";
    memo
      .split(/\n{2,}/)
      .filter(Boolean)
      .forEach(function (paragraph) {
        var p = document.createElement("p");
        p.textContent = paragraph.trim();
        memoBody.appendChild(p);
      });
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
      sourceTag.textContent = source.sourceClass || "source";
      tagRow.appendChild(sourceTag);

      var acceptedTag = document.createElement("span");
      acceptedTag.className = "tag accepted";
      acceptedTag.textContent = source.validationStatus || "accepted";
      tagRow.appendChild(acceptedTag);

      top.appendChild(title);
      top.appendChild(tagRow);

      var meta = document.createElement("div");
      meta.className = "source-meta";
      meta.textContent = [
        source.domain || "Unknown domain",
        source.publishedDate || "Unknown publication date",
        formatConfidence(source.entityConfidence)
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
      formatDate(result.generatedAt) +
      "<br />Mode: " +
      result.mode;
    fileChip.textContent = result.excelFileName
      ? "Validated file: " + result.excelFileName
      : "Validated sources displayed below";
    renderMemo(result.memo);
    renderSources(result.sources || []);
  }

  async function loadHealth() {
    if (hasDirectN8nWebhook()) {
      state.workflowMode = "direct n8n webhook";
      modeChip.textContent = "Workflow Mode: Direct n8n webhook";
      setStatus(
        "Direct n8n mode is active. Clicking Run Workflow will POST to the webhook in config.js."
      );
      return;
    }

    if (state.isFilePreview) {
      state.workflowMode = "file preview";
      modeChip.textContent = "Workflow Mode: File preview";
      setStatus(
        "File preview is active. It does not run n8n. Add a webhook URL in public/config.js or run `node server.js` for live mode."
      );
      return;
    }

    try {
      var response = await fetch("/api/health");
      var payload = await response.json();
      state.workflowMode = payload.workflowMode || "unknown";
      if (state.workflowMode === "webhook" && !payload.n8nConfigured) {
        modeChip.textContent = "Workflow Mode: Webhook not configured";
        setStatus(
          "Backend is in webhook mode, but N8N_WEBHOOK_URL is missing. Add it to .env and restart the server."
        );
      } else {
        modeChip.textContent =
          state.workflowMode === "mock"
            ? "Workflow Mode: Mock preview"
            : "Workflow Mode: Live webhook";
      }
    } catch (error) {
      modeChip.textContent = "Workflow mode unavailable";
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

  intervalOptions.addEventListener("click", function (event) {
    var button = event.target.closest("[data-interval]");
    if (!button || state.loading) return;
    state.intervalDays = Number(button.getAttribute("data-interval"));
    setActiveButton(intervalOptions, "data-interval", state.intervalDays);
  });

  generateButton.addEventListener("click", async function () {
    setLoading(true);
    setStatus(
      "Submitting " +
        state.companyKey +
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

  loadHealth().then(function () {
    var search = new URLSearchParams(window.location.search);
    if (search.get("autorun") === "1") {
      generateButton.click();
    }
  });
})();
