import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);

const DEFAULT_REQUEST = {
  origin: "XMN",
  destination: "LON",
  outboundStart: "2026-05-20",
  outboundEnd: "2026-06-08",
  nights: 7,
  preferredAirline: "China Southern",
  preferredAirlineCode: "CZ",
  preferEveningDeparture: true,
  allowDomesticTransfer: true,
  allowLondonAirports: ["LHR", "LGW"],
  cabin: "economy",
  currency: "USD"
};

const LONDON_AIRPORTS = ["LHR", "LGW"];
const DOMESTIC_HUBS = ["CAN", "PKX", "PEK", "PVG", "XIY", "TFU", "CSX"];
const AIRPORTS = {
  XMN: { cityZh: "厦门", airportZh: "厦门高崎国际机场", label: "XMN 厦门" },
  LON: { cityZh: "伦敦", airportZh: "伦敦所有机场", label: "LON 伦敦" },
  LHR: { cityZh: "伦敦", airportZh: "希思罗机场", label: "LHR 伦敦希思罗" },
  LGW: { cityZh: "伦敦", airportZh: "盖特威克机场", label: "LGW 伦敦盖特威克" },
  CAN: { cityZh: "广州", airportZh: "广州白云国际机场", label: "CAN 广州" },
  PKX: { cityZh: "北京", airportZh: "北京大兴国际机场", label: "PKX 北京大兴" },
  PEK: { cityZh: "北京", airportZh: "北京首都国际机场", label: "PEK 北京首都" },
  PVG: { cityZh: "上海", airportZh: "上海浦东国际机场", label: "PVG 上海浦东" },
  XIY: { cityZh: "西安", airportZh: "西安咸阳国际机场", label: "XIY 西安" },
  CKG: { cityZh: "重庆", airportZh: "重庆江北国际机场", label: "CKG 重庆" },
  TFU: { cityZh: "成都", airportZh: "成都天府国际机场", label: "TFU 成都天府" },
  CSX: { cityZh: "长沙", airportZh: "长沙黄花国际机场", label: "CSX 长沙" },
  KUL: { cityZh: "吉隆坡", airportZh: "吉隆坡国际机场", label: "KUL 吉隆坡" }
};

const DATA_SOURCES = [
  { id: "google-flights", name: "Google Flights", kind: "metasearch" },
  { id: "trip", name: "Trip.com", kind: "ota" },
  { id: "ctrip", name: "携程", kind: "ota" },
  { id: "csair", name: "中国南方航空官网", kind: "airline" }
];

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(start, end) {
  const dates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

function weekday(dateString) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${dateString}T00:00:00Z`));
}

function buildGoogleFlightsUrl({ origin, destination, outboundDate, returnDate }) {
  const q = `${origin} to ${destination} ${outboundDate} return ${returnDate} economy`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

function buildTripUrl({ origin, destination, outboundDate, returnDate }) {
  return `https://www.trip.com/flights/${origin.toLowerCase()}-to-${destination.toLowerCase()}/airfares-${origin.toLowerCase()}-${destination.toLowerCase()}/?dcity=${origin.toLowerCase()}&acity=${destination.toLowerCase()}&ddate=${outboundDate}&rdate=${returnDate}&triptype=rt&class=y`;
}

function buildCtripUrl({ origin, destination, outboundDate, returnDate }) {
  return `https://flights.ctrip.com/online/list/round-${origin}-${destination}?depdate=${outboundDate}_${returnDate}&cabin=y_s`;
}

function buildChinaSouthernUrl({ origin, destination, outboundDate, returnDate }) {
  const q = `${origin} ${destination} ${outboundDate} ${returnDate}`;
  return `https://www.csair.com/en/?utm_source=flight-value-advisor#${encodeURIComponent(q)}`;
}

function buildSourceLinks({ origin, destination, outboundDate, returnDate }) {
  return {
    googleFlights: buildGoogleFlightsUrl({ origin, destination, outboundDate, returnDate }),
    trip: buildTripUrl({ origin, destination, outboundDate, returnDate }),
    ctrip: buildCtripUrl({ origin, destination, outboundDate, returnDate }),
    chinaSouthern: buildChinaSouthernUrl({ origin, destination, outboundDate, returnDate })
  };
}

function describeCode(code) {
  return AIRPORTS[code]?.label || code;
}

function describeCodes(codes = []) {
  return codes.map(describeCode);
}

async function getUsdCnyRate() {
  const fallback = { base: "USD", quote: "CNY", rate: 7.2, source: "fallback", fetchedAt: new Date().toISOString() };
  const endpoints = [
    "https://open.er-api.com/v6/latest/USD",
    "https://api.frankfurter.app/latest?from=USD&to=CNY"
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const json = await response.json();
      const rate = json?.rates?.CNY;
      if (rate) return { base: "USD", quote: "CNY", rate: Number(rate), source: endpoint, fetchedAt: new Date().toISOString() };
    } catch {
      // Try the next exchange-rate provider.
    }
  }
  return fallback;
}

function usdToCny(usd, rate) {
  if (!usd) return null;
  return Math.round(Number(usd) * rate);
}

function parseDurationMinutes(value) {
  if (typeof value === "number") return value;
  if (!value) return null;
  const hours = /(\d+)\s*h/i.exec(value)?.[1] || 0;
  const minutes = /(\d+)\s*m/i.exec(value)?.[1] || 0;
  return Number(hours) * 60 + Number(minutes);
}

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return "未知";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}m`;
}

function normalizeAirlineName(name = "") {
  const lower = name.toLowerCase();
  if (lower.includes("southern") || lower.includes("china southern")) return "China Southern";
  if (lower.includes("air china")) return "Air China";
  if (lower.includes("eastern")) return "China Eastern";
  if (lower.includes("tianjin")) return "Tianjin Airlines";
  if (lower.includes("hainan")) return "Hainan Airlines";
  if (lower.includes("malaysia")) return "Malaysia Airlines";
  return name || "Unknown";
}

function estimateRisks(option) {
  const risks = [];
  if (option.source === "manual" || option.source === "ota-manual") risks.push("需下单前复核实时余票和同票号保护");
  if (option.ticketing === "split") risks.push("分开出票时延误不保护，需预留过夜或至少 8 小时");
  if (option.airlines.length > 1) risks.push("航司混搭，行李直挂/改签规则可能不一致");
  if ((option.totalDurationMinutes || 0) > 26 * 60) risks.push("总旅行时间较长，通常靠长中转换低价");
  if (option.londonAirport === "LGW") risks.push("盖特威克进城成本和时间通常高于希思罗");
  if (option.crawlFindings?.some((f) => f.status !== "price-found")) risks.push("部分来源未能自动抓价，需打开来源链接复核");
  if (!risks.length) risks.push("风险较低，重点核对托运行李额和退改费");
  return risks;
}

function scoreOption(option, request) {
  const price = Number(option.priceUsd || 9999);
  const duration = Number(option.totalDurationMinutes || 2400);
  const airlineText = option.airlines.join(" ").toLowerCase();
  const hasPreferred = airlineText.includes(request.preferredAirline.toLowerCase()) || airlineText.includes(request.preferredAirlineCode.toLowerCase());
  const allPreferred = option.airlines.every((a) => normalizeAirlineName(a) === "China Southern" || a === "CZ");
  const eveningBonus = option.outboundDepartureLocalHour >= 18 ? 12 : 0;
  const airportBonus = option.londonAirport === "LHR" ? 5 : 2;
  const hubBonus = option.hubs.some((h) => ["CAN", "PKX"].includes(h)) ? 8 : 0;
  const splitPenalty = option.ticketing === "split" ? 15 : 0;
  const mixedPenalty = option.airlines.length > 1 ? 8 : 0;
  const priceScore = Math.max(0, 75 - (price - 650) / 8);
  const durationScore = Math.max(0, 25 - (duration - 960) / 55);
  const airlineScore = allPreferred ? 22 : hasPreferred ? 14 : 0;
  return Math.round(priceScore + durationScore + airlineScore + eveningBonus + airportBonus + hubBonus - splitPenalty - mixedPenalty);
}

function enrichOption(option, request) {
  const returnDate = option.returnDate || addDays(option.outboundDate, request.nights);
  const sourceLinks = buildSourceLinks({
    origin: request.origin,
    destination: option.londonAirport || request.destination,
    outboundDate: option.outboundDate,
    returnDate
  });
  const enriched = {
    ...option,
    airlines: option.airlines.map(normalizeAirlineName),
    totalDurationMinutes: option.totalDurationMinutes ?? parseDurationMinutes(option.duration),
    returnDate,
    sourceLinks,
    googleFlightsUrl: sourceLinks.googleFlights,
    chinaSouthernUrl: sourceLinks.chinaSouthern,
    routeZh: option.route.replace(/\b[A-Z]{3}\b/g, (code) => describeCode(code)),
    hubsZh: describeCodes(option.hubs),
    londonAirportZh: describeCode(option.londonAirport)
  };
  enriched.score = scoreOption(enriched, request);
  enriched.risks = estimateRisks(enriched);
  return enriched;
}

function extractPricesFromText(text) {
  const matches = [];
  const patterns = [
    /(?:US\$|\$)\s?([0-9][0-9,]{2,5})/gi,
    /(?:CNY|RMB|¥|￥)\s?([0-9][0-9,]{2,6})/gi,
    /HK\$\s?([0-9][0-9,]{2,6})/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[0];
      const amount = Number(match[1].replace(/,/g, ""));
      if (amount > 100 && amount < 100000) matches.push({ raw, amount });
    }
  }
  return matches.slice(0, 8);
}

async function crawlOneSource({ source, origin, destination, outboundDate, returnDate }) {
  const links = buildSourceLinks({ origin, destination, outboundDate, returnDate });
  const urlBySource = {
    "google-flights": links.googleFlights,
    trip: links.trip,
    ctrip: links.ctrip,
    csair: links.chinaSouthern
  };
  const url = urlBySource[source.id];
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 FlightValueAdvisor/0.1",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
      },
      signal: AbortSignal.timeout(10000)
    });
    const text = await response.text();
    const prices = extractPricesFromText(text);
    const dynamic = /captcha|enable javascript|google flights|__NEXT_DATA__|robot/i.test(text);
    return {
      source: source.id,
      sourceName: source.name,
      url,
      httpStatus: response.status,
      elapsedMs: Date.now() - startedAt,
      status: prices.length ? "price-found" : dynamic ? "dynamic-or-blocked" : "no-price-found",
      extractedPrices: prices,
      note: prices.length ? "页面文本中发现疑似价格" : "未在静态 HTML 中发现可用价格，建议打开链接浏览器复核"
    };
  } catch (error) {
    const detail = error.cause?.code ? `${error.message} (${error.cause.code})` : error.message;
    return {
      source: source.id,
      sourceName: source.name,
      url,
      elapsedMs: Date.now() - startedAt,
      status: "request-failed",
      extractedPrices: [],
      note: detail
    };
  }
}

async function crawlSources(request, limitDays = 4) {
  const dates = enumerateDates(request.outboundStart, request.outboundEnd).slice(0, limitDays);
  const findings = [];
  for (const outboundDate of dates) {
    const returnDate = addDays(outboundDate, request.nights);
    for (const destination of request.allowLondonAirports || LONDON_AIRPORTS) {
      for (const source of DATA_SOURCES) {
        findings.push(await crawlOneSource({ source, origin: request.origin, destination, outboundDate, returnDate }));
      }
    }
  }
  return findings;
}

function sampleOptions(request = DEFAULT_REQUEST) {
  return [
    {
      id: "xmn-lhr-2026-05-21-cz-gs",
      source: "ota-manual",
      sourceName: "Trip.com observed fare",
      title: "最低价混搭：南航去程 + 天津航回程",
      outboundDate: "2026-05-21",
      returnDate: "2026-05-27",
      route: "XMN -> PKX/CAN -> LHR; LHR -> XIY/CKG -> XMN",
      hubs: ["PKX", "CAN", "XIY"],
      londonAirport: "LHR",
      airlines: ["China Southern", "Tianjin Airlines"],
      totalDurationMinutes: 29 * 60 + 5,
      returnDurationMinutes: 31 * 60,
      outboundDepartureLocalHour: 20,
      priceUsd: 716,
      ticketing: "ota-protected",
      channel: "Trip.com/携程，确认同一订单保护和托运行李"
    },
    {
      id: "xmn-lhr-2026-05-21-cz-evening",
      source: "ota-manual",
      sourceName: "Trip.com observed fare",
      title: "晚间离境优先：厦门晚出发经北京大兴",
      outboundDate: "2026-05-21",
      returnDate: "2026-05-28",
      route: "XMN -> PKX -> LHR; LHR -> PKX/CAN -> XMN",
      hubs: ["PKX"],
      londonAirport: "LHR",
      airlines: ["China Southern"],
      totalDurationMinutes: 29 * 60 + 5,
      returnDurationMinutes: 22 * 60,
      outboundDepartureLocalHour: 20,
      priceUsd: 880,
      ticketing: "through",
      channel: "南航官网优先；OTA 价差超过 10% 再考虑"
    },
    {
      id: "xmn-lhr-2026-06-02-cz-canal",
      source: "strategy",
      sourceName: "Schedule-based strategy",
      title: "稳妥南航广州中转：希思罗/盖特威克灵活",
      outboundDate: "2026-06-02",
      returnDate: "2026-06-09",
      route: "XMN -> CAN -> LHR/LGW; LHR/LGW -> CAN -> XMN",
      hubs: ["CAN"],
      londonAirport: "LHR",
      airlines: ["China Southern"],
      totalDurationMinutes: 17 * 60,
      returnDurationMinutes: 18 * 60,
      outboundDepartureLocalHour: 9,
      priceUsd: 980,
      ticketing: "through",
      channel: "南航官网/APP，比较 LHR 与 LGW"
    },
    {
      id: "xmn-lhr-2026-05-20-mh-gs",
      source: "ota-manual",
      sourceName: "Trip.com observed fare",
      title: "绝对低价备选：马航去程 + 天津航回程",
      outboundDate: "2026-05-20",
      returnDate: "2026-05-27",
      route: "XMN -> KUL -> LHR; LHR -> China hub -> XMN",
      hubs: ["KUL", "XIY"],
      londonAirport: "LHR",
      airlines: ["Malaysia Airlines", "Tianjin Airlines"],
      totalDurationMinutes: 33 * 60 + 10,
      returnDurationMinutes: 31 * 60,
      outboundDepartureLocalHour: 14,
      priceUsd: 681,
      ticketing: "ota-protected",
      channel: "Trip.com/携程，只在行李额清楚时购买"
    }
  ].map((option) => enrichOption(option, request));
}

async function serpApiExplore(request) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return { provider: "serpapi", enabled: false, options: [], message: "未设置 SERPAPI_KEY，已使用离线样例和查询链接。" };

  const options = [];
  const dates = enumerateDates(request.outboundStart, request.outboundEnd);
  for (const outboundDate of dates) {
    const returnDate = addDays(outboundDate, request.nights);
    for (const arrival of request.allowLondonAirports || LONDON_AIRPORTS) {
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_travel_explore");
      url.searchParams.set("departure_id", request.origin);
      url.searchParams.set("arrival_id", arrival);
      url.searchParams.set("outbound_date", outboundDate);
      url.searchParams.set("return_date", returnDate);
      url.searchParams.set("currency", request.currency || "USD");
      url.searchParams.set("hl", "en");
      url.searchParams.set("gl", "us");
      url.searchParams.set("api_key", apiKey);

      const response = await fetch(url);
      if (!response.ok) throw new Error(`SerpApi ${response.status}: ${await response.text()}`);
      const json = await response.json();
      for (const flight of json.flights || []) {
        options.push(enrichOption({
          id: `serpapi-${outboundDate}-${arrival}-${options.length}`,
          source: "serpapi",
          sourceName: "Google Flights via SerpApi",
          title: `${flight.airline || "Flight"} ${outboundDate} ${arrival}`,
          outboundDate,
          returnDate,
          route: `${request.origin} -> ${arrival}`,
          hubs: [],
          londonAirport: arrival,
          airlines: [flight.airline || flight.airline_code || "Unknown"],
          totalDurationMinutes: flight.duration,
          outboundDepartureLocalHour: null,
          priceUsd: flight.price,
          ticketing: "unknown",
          channel: "Google Flights 复核后跳转航司/OTA"
        }, request));
      }
    }
  }
  return { provider: "serpapi", enabled: true, options, message: `SerpApi 返回 ${options.length} 个候选。` };
}

function makeDateQueries(request) {
  return enumerateDates(request.outboundStart, request.outboundEnd).map((outboundDate) => {
    const returnDate = addDays(outboundDate, request.nights);
    const links = buildSourceLinks({ origin: request.origin, destination: request.destination, outboundDate, returnDate });
    return {
      outboundDate,
      returnDate,
      weekday: weekday(outboundDate),
      googleFlightsUrl: links.googleFlights,
      tripUrl: links.trip,
      ctripUrl: links.ctrip,
      chinaSouthernUrl: links.chinaSouthern,
      multiCityHint: `${request.origin}-LHR ${outboundDate}; LGW-${request.origin} ${returnDate}`
    };
  });
}

async function analyze(request = DEFAULT_REQUEST) {
  const mergedRequest = { ...DEFAULT_REQUEST, ...request };
  const exchangeRate = await getUsdCnyRate();
  let live = { options: [], message: "" };
  try {
    live = await serpApiExplore(mergedRequest);
  } catch (error) {
    live = { provider: "serpapi", enabled: true, options: [], message: `SerpApi 请求失败：${error.message}` };
  }
  let crawlFindings = [];
  if (mergedRequest.crawl === true || mergedRequest.crawl === "true") {
    crawlFindings = await crawlSources(mergedRequest, Number(mergedRequest.crawlDays || 4));
  }
  const options = [...live.options, ...sampleOptions(mergedRequest)]
    .map((option) => ({
      ...option,
      priceCny: usdToCny(option.priceUsd, exchangeRate.rate),
      crawlFindings: crawlFindings.filter((finding) => finding.url.includes(option.outboundDate))
    }))
    .map((option) => ({ ...option, risks: estimateRisks(option) }))
    .sort((a, b) => b.score - a.score || a.priceUsd - b.priceUsd)
    .slice(0, 12);
  return {
    generatedAt: new Date().toISOString(),
    request: mergedRequest,
    exchangeRate,
    providerStatus: live.message,
    crawlFindings,
    top: options.slice(0, 3),
    options,
    dateQueries: makeDateQueries(mergedRequest),
    notes: [
      "Google Flights 没有官方公开 API；本工具通过 SerpApi 可选接入 Google Flights 结构化结果。",
      "没有 API key 时，工具会串行遍历 Google Flights、Trip.com、携程、南航官网的公开页面；动态渲染/验证码页面会标记为需浏览器复核。",
      "人民币价格按实时 USD/CNY 汇率换算，若汇率服务不可用则使用保守 fallback。",
      "低价 OTA 混搭必须确认同一订单保护、托运行李、退改签和是否需要重新托运。"
    ]
  };
}

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const filePath = url.pathname === "/" ? "public/index.html" : `public${url.pathname}`;
  const fullPath = path.join(__dirname, filePath);
  try {
    const data = await fs.readFile(fullPath);
    const ext = path.extname(fullPath);
    const type = ext === ".css" ? "text/css" : ext === ".js" ? "application/javascript" : "text/html";
    res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function startServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/api/analyze") {
      const request = Object.fromEntries(url.searchParams.entries());
      const parsed = {
        ...request,
        nights: request.nights ? Number(request.nights) : DEFAULT_REQUEST.nights,
        allowLondonAirports: request.allowLondonAirports ? request.allowLondonAirports.split(",") : DEFAULT_REQUEST.allowLondonAirports,
        preferEveningDeparture: request.preferEveningDeparture !== "false",
        crawl: request.crawl === "true",
        crawlDays: request.crawlDays ? Number(request.crawlDays) : 4
      };
      sendJson(res, await analyze(parsed));
      return;
    }
    await serveStatic(req, res);
  });
  server.listen(PORT, () => {
    console.log(`Flight Value Advisor running at http://localhost:${PORT}`);
  });
}

if (process.argv.includes("--scan")) {
  analyze().then((result) => console.log(JSON.stringify(result, null, 2)));
} else if (process.argv.includes("--sample")) {
  console.log(JSON.stringify(sampleOptions(DEFAULT_REQUEST), null, 2));
} else {
  startServer();
}
