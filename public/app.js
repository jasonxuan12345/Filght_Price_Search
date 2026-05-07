const fields = {
  origin: document.querySelector("#origin"),
  destination: document.querySelector("#destination"),
  outboundStart: document.querySelector("#outboundStart"),
  outboundEnd: document.querySelector("#outboundEnd"),
  nights: document.querySelector("#nights"),
  airports: document.querySelector("#airports"),
  crawl: document.querySelector("#crawl"),
  crawlDays: document.querySelector("#crawlDays"),
  sortBy: document.querySelector("#sortBy")
};

const statusEl = document.querySelector("#status");
const topEl = document.querySelector("#top");
const queriesEl = document.querySelector("#queries");
const crawlResultsEl = document.querySelector("#crawlResults");
document.querySelector("#run").addEventListener("click", run);

function params() {
  const p = new URLSearchParams();
  p.set("origin", fields.origin.value.trim());
  p.set("destination", fields.destination.value.trim());
  p.set("outboundStart", fields.outboundStart.value);
  p.set("outboundEnd", fields.outboundEnd.value);
  p.set("nights", fields.nights.value);
  p.set("allowLondonAirports", fields.airports.value.trim());
  p.set("crawl", fields.crawl.value);
  p.set("crawlDays", fields.crawlDays.value);
  p.set("sortBy", fields.sortBy.value);
  return p;
}

function money(value) {
  return value ? `US$${Math.round(value)}` : "待查价";
}

function renderCard(option, index) {
  const risks = option.risks.map((risk) => `<li>${risk}</li>`).join("");
  const cny = option.priceCny ? `约 ¥${option.priceCny.toLocaleString("zh-CN")}` : "人民币待换算";
  return `
    <article class="card">
      <span class="badge">Top ${index + 1} · score ${option.score}</span>
      <h3>${option.title}</h3>
      <div class="price">${cny}</div>
      <div class="subprice">${money(option.priceUsd)} · 实时汇率换算</div>
      <div class="meta">
        <div><strong>日期：</strong>${option.outboundDate} → ${option.returnDate}</div>
        <div><strong>路径：</strong>${option.routeZh || option.route}</div>
        <div><strong>中转：</strong>${option.hubsZh?.join(", ") || option.hubs.join(", ") || "待确认"}</div>
        <div><strong>伦敦机场：</strong>${option.londonAirportZh || option.londonAirport}</div>
        <div><strong>航司：</strong>${option.airlines.join(" + ")}</div>
        <div><strong>总时长：</strong>${option.totalDurationMinutes ? Math.floor(option.totalDurationMinutes / 60) + "h" + String(option.totalDurationMinutes % 60).padStart(2, "0") + "m" : "未知"}</div>
        <div><strong>渠道：</strong>${option.channel}</div>
      </div>
      <ul>${risks}</ul>
      <div class="links">
        <a href="${option.sourceLinks.googleFlights}" target="_blank" rel="noreferrer">Google Flights</a>
        <a href="${option.sourceLinks.trip}" target="_blank" rel="noreferrer">Trip.com</a>
        <a href="${option.sourceLinks.ctrip}" target="_blank" rel="noreferrer">携程</a>
        <a href="${option.sourceLinks.chinaSouthern}" target="_blank" rel="noreferrer">南航官网</a>
      </div>
    </article>
  `;
}

function renderQueries(queries) {
  queriesEl.innerHTML = queries.map((q) => `
    <div class="query">
      <strong>${q.outboundDate} (${q.weekday}) → ${q.returnDate}</strong>
      <span>
        <a href="${q.googleFlightsUrl}" target="_blank" rel="noreferrer">Google Flights</a> ·
        <a href="${q.tripUrl}" target="_blank" rel="noreferrer">Trip.com</a> ·
        <a href="${q.ctripUrl}" target="_blank" rel="noreferrer">携程</a> ·
        <a href="${q.chinaSouthernUrl}" target="_blank" rel="noreferrer">南航官网</a>
      </span>
      <span>多城市：<code>${q.multiCityHint}</code></span>
    </div>
  `).join("");
}

function renderCrawlResults(findings) {
  if (!findings?.length) {
    crawlResultsEl.innerHTML = "未开启自动遍历。开启后会逐个访问 Google Flights、Trip.com、携程、南航官网，能抓到价格就展示，动态/验证码页面会标记为需复核。";
    return;
  }
  crawlResultsEl.innerHTML = findings.map((finding) => {
    const prices = finding.extractedPrices?.length
      ? finding.extractedPrices.map((p) => p.raw).join(", ")
      : finding.note;
    return `
      <div class="crawl-row">
        <strong>${finding.sourceName}</strong>
        <span class="crawl-status ${finding.status}">${finding.status}</span>
        <span><a href="${finding.url}" target="_blank" rel="noreferrer">${prices}</a></span>
      </div>
    `;
  }).join("");
}

async function run() {
  statusEl.textContent = "扫描中...";
  topEl.innerHTML = "";
  const response = await fetch(`/api/analyze?${params().toString()}`);
  const result = await response.json();
  const sortLabel = result.request.sortBy === "airline" ? "航司优先" : "价格优先";
  statusEl.textContent = `${result.providerStatus} · 排序方式：${sortLabel} · USD/CNY=${result.exchangeRate.rate}（${result.exchangeRate.source}） · 生成时间：${new Date(result.generatedAt).toLocaleString()}`;
  topEl.innerHTML = result.options.map((option, index) => renderCard(option, index)).join("");
  renderQueries(result.dateQueries);
  renderCrawlResults(result.crawlFindings);
}

run().catch((error) => {
  statusEl.textContent = `运行失败：${error.message}`;
});
