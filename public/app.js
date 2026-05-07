const fields = {
  serpApiKey: document.querySelector("#serpApiKey"),
  origin: document.querySelector("#origin"),
  destination: document.querySelector("#destination"),
  airlineId: document.querySelector("#airlineId"),
  outboundStart: document.querySelector("#outboundStart"),
  outboundEnd: document.querySelector("#outboundEnd"),
  nights: document.querySelector("#nights"),
  serpApiMaxQueries: document.querySelector("#serpApiMaxQueries"),
  serpApiConcurrency: document.querySelector("#serpApiConcurrency")
};

const statusEl = document.querySelector("#status");
const resultsEl = document.querySelector("#results");
const resultCountEl = document.querySelector("#resultCount");
const queryEstimateEl = document.querySelector("#queryEstimate");
document.querySelector("#run").addEventListener("click", run);

const savedSerpApiKey = sessionStorage.getItem("serpApiKey") || "";
fields.serpApiKey.value = savedSerpApiKey;

fields.serpApiKey.addEventListener("input", () => {
  const key = fields.serpApiKey.value.trim();
  if (key) {
    sessionStorage.setItem("serpApiKey", key);
    statusEl.textContent = "SerpApi Key 已输入，点击「查询航班」开始搜索。";
  } else {
    sessionStorage.removeItem("serpApiKey");
    statusEl.textContent = "请先输入 SerpApi Key，再点击「查询航班」。";
  }
  resultsEl.innerHTML = "";
  resultCountEl.textContent = "";
});

function dateCount(start, end) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const days = Math.floor((endDate - startDate) / 86400000) + 1;
  return Number.isFinite(days) && days > 0 ? days : 0;
}

function estimatedSerpApiQueries() {
  const days = dateCount(fields.outboundStart.value, fields.outboundEnd.value);
  const destination = fields.destination.value.trim().toUpperCase();
  const airportCount = destination === "LON" ? 2 : 1;
  return { days, airportCount, total: Math.max(1, days * airportCount) };
}

function updateQueryEstimate({ syncLimit = false } = {}) {
  const estimate = estimatedSerpApiQueries();
  if (syncLimit) {
    fields.serpApiMaxQueries.value = String(estimate.total);
  }
  const concurrency = Math.max(1, Number(fields.serpApiConcurrency.value || 1));
  const batches = Math.ceil(Math.min(Number(fields.serpApiMaxQueries.value || estimate.total), estimate.total) / concurrency);
  queryEstimateEl.textContent = `预计 SerpApi 查询 ${estimate.total} 次（${estimate.days || 0} 天 × ${estimate.airportCount} 个机场）。当前并发 ${concurrency}，约 ${batches} 批完成。上限低于预计值时，只会查询前面一部分日期/机场。`;
}

for (const field of [fields.destination, fields.outboundStart, fields.outboundEnd]) {
  field.addEventListener("change", () => updateQueryEstimate({ syncLimit: true }));
  field.addEventListener("input", () => updateQueryEstimate());
}

for (const field of [fields.serpApiMaxQueries, fields.serpApiConcurrency]) {
  field.addEventListener("change", () => updateQueryEstimate());
  field.addEventListener("input", () => updateQueryEstimate());
}

function params() {
  return {
    serpApiKey: fields.serpApiKey.value.trim(),
    origin: fields.origin.value.trim(),
    destination: fields.destination.value.trim(),
    airlineId: fields.airlineId.value,
    outboundStart: fields.outboundStart.value,
    outboundEnd: fields.outboundEnd.value,
    nights: fields.nights.value,
    serpApiMaxQueries: fields.serpApiMaxQueries.value,
    serpApiConcurrency: fields.serpApiConcurrency.value
  };
}

function formatLeg(leg) {
  if (!leg || !leg.flightNo) return "";
  return `${leg.flightNo} ${leg.from} ${leg.depLocal} → ${leg.to} ${leg.arrLocal}`;
}

function renderFlightCards(options) {
  if (!options || options.length === 0) {
    resultsEl.innerHTML = '<div class="empty-state">未查询到航班，请调整搜索条件后重试</div>';
    resultCountEl.textContent = "";
    return;
  }

  const pricedCount = options.filter(o => o.priceUsd != null || o.priceCny != null).length;
  resultCountEl.textContent = `(共${options.length}条，${pricedCount}条有价格)`;

  const rows = options.map((option, index) => {
    const nights = option.returnDate && option.outboundDate
      ? Math.round((new Date(option.returnDate) - new Date(option.outboundDate)) / (1000 * 60 * 60 * 24))
      : "?";

    const sourceIsSerpApi = option.source === "serpapi";

    let outboundDetail = "";
    let returnDetail = "";

    if (option.outboundLegs && option.outboundLegs.length > 0) {
      const legs = option.outboundLegs.map((leg, i) => {
        if (i > 0) {
          const layoverText = option.layoverOutbound || "中转";
          return `<div class="leg layover">${layoverText}</div><div class="leg">${formatLeg(leg)}</div>`;
        }
        return `<div class="leg">${formatLeg(leg)}</div>`;
      }).join("");
      outboundDetail = legs;
    } else if (option.outboundLeg1 && option.outboundLeg2) {
      outboundDetail = `<div class="leg">${formatLeg(option.outboundLeg1)}</div><div class="leg layover">中转 ${option.layoverOutbound || "?"}</div><div class="leg">${formatLeg(option.outboundLeg2)}</div>`;
    } else {
      outboundDetail = `<div class="leg">${option.routeZh || option.route}</div>`;
    }

    if (option.returnLegs && option.returnLegs.length > 0) {
      const legs = option.returnLegs.map((leg, i) => {
        if (i > 0) {
          const layoverText = option.layoverReturn || "中转";
          return `<div class="leg layover">${layoverText}</div><div class="leg">${formatLeg(leg)}</div>`;
        }
        return `<div class="leg">${formatLeg(leg)}</div>`;
      }).join("");
      returnDetail = legs;
    } else if (option.returnLeg1 && option.returnLeg2) {
      returnDetail = `<div class="leg">${formatLeg(option.returnLeg1)}</div><div class="leg layover">中转 ${option.layoverReturn || "?"}</div><div class="leg">${formatLeg(option.returnLeg2)}</div>`;
    }

    const hasPrice = option.priceUsd != null || option.priceCny != null;
    const isCtripPrice = option.source === "ctrip-lowest";
    const priceCnyDisplay = option.priceCny
      ? `<span class="price-cny">${isCtripPrice ? "" : "≈ "}¥${option.priceCny.toLocaleString("zh-CN")}</span>`
      : "";
    const priceUsdDisplay = option.priceUsd
      ? `<span class="price-usd">US$${Math.round(option.priceUsd).toLocaleString()}</span>`
      : "";
    const priceUsdApproxDisplay = option.priceUsd
      ? `<span class="price-cny">≈ US$${Math.round(option.priceUsd).toLocaleString()}</span>`
      : "";

    const priceNote = hasPrice
      ? `<div class="price-main">${isCtripPrice ? `${priceCnyDisplay}${priceUsdApproxDisplay}` : `${priceUsdDisplay}${priceCnyDisplay}`}</div>`
      : `<span class="price-unknown">待查价</span>`;

    const cardClass = sourceIsSerpApi || isCtripPrice ? "flight-card serpapi-card" : "flight-card";
    const rankBadge = index < 3 && hasPrice
      ? `<span class="rank-badge">${index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</span>`
      : "";

    const noteTag = option.note ? `<div class="flight-note">${option.note}</div>` : "";

    return `
      <div class="${cardClass}">
        <div class="card-header">
          <div class="card-header-left">
            ${rankBadge}
            <span class="card-rank">#${index + 1}</span>
            <span class="card-airline">${option.airlines.join(" + ")}</span>
          </div>
          <div class="card-header-center">
            <span class="card-date">${option.outboundDate} → ${option.returnDate}</span>
            <span class="card-nights">${nights}晚</span>
          </div>
          <div class="card-header-right">
            ${option.totalDuration ? `<span class="card-duration">${option.totalDuration}</span>` : ""}
            ${priceNote}
          </div>
        </div>
        <div class="card-body">
          <div class="card-route">
            <div class="route-section">
              <div class="route-label">去程</div>
              ${outboundDetail}
            </div>
            <div class="route-section">
              <div class="route-label">回程</div>
              ${returnDetail || '<div class="leg">数据收集中...</div>'}
            </div>
          </div>
          ${noteTag}
          ${option.priceSource ? `
          <div class="card-price-source ${hasPrice ? 'has-price' : 'no-price'}">
            <span class="price-source-text">${option.priceSource}</span>
          </div>` : ""}
          <div class="card-links">
            <a href="${option.sourceLinks?.googleFlights || '#'}" target="_blank" rel="noreferrer" class="link-btn link-gf">Google Flights</a>
            <a href="${option.sourceLinks?.trip || '#'}" target="_blank" rel="noreferrer" class="link-btn link-trip">Trip.com</a>
            <a href="${option.sourceLinks?.ctrip || '#'}" target="_blank" rel="noreferrer" class="link-btn link-ctrip">携程</a>
            ${option.airlineBaseUrl ? `<a href="${option.airlineBaseUrl}" target="_blank" rel="noreferrer" class="link-btn link-airline">航司官网</a>` : ""}
          </div>
          ${option.risks?.length ? `
          <div class="card-risks">
            ${option.risks.map(r => `<span class="risk-tag">${r}</span>`).join("")}
          </div>` : ""}
        </div>
      </div>
    `;
  }).join("");

  resultsEl.innerHTML = rows;
}

async function run() {
  if (!fields.serpApiKey.value.trim()) {
    statusEl.textContent = "请先输入 SerpApi Key，再查询 Google Flights 实时价格。";
    resultsEl.innerHTML = "";
    resultCountEl.textContent = "";
    fields.serpApiKey.focus();
    return;
  }

  statusEl.textContent = "正在查询航班价格...";
  updateQueryEstimate();
  resultsEl.innerHTML = "";
  resultCountEl.textContent = "";

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params())
    });
    const result = await response.json();

    const count = result.options ? result.options.length : 0;
    const pricedCount = result.pricedCount || 0;
    const airlineLabel = result.request.airlineId && result.request.airlineId !== "all"
      ? result.airlines?.find(a => a.id === result.request.airlineId)?.name || "指定航司"
      : "全部航司";

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const priceInfo = pricedCount > 0
      ? `${pricedCount}条有价格`
      : "无实时价格数据";

    statusEl.textContent = `${airlineLabel} · ${result.request.outboundStart} → ${result.request.outboundEnd} (${result.request.nights}天) · 共${count}条 · ${priceInfo} · ${result.providerStatus} · 汇率 USD/CNY ${result.exchangeRate.rate} · ${new Date(result.generatedAt).toLocaleString()}`;

    renderFlightCards(result.options);
  } catch (error) {
    statusEl.textContent = `查询失败：${error.message}`;
    resultsEl.innerHTML = '<div class="empty-state">查询出错，请检查网络连接后重试</div>';
  }
}

fields.serpApiKey.focus();
updateQueryEstimate({ syncLimit: true });
