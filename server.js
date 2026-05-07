import http from "node:http";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fsSync.existsSync(envPath)) return;
  const lines = fsSync.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt <= 0) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    const value = trimmed.slice(equalsAt + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadLocalEnv();

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
  currency: "USD",
  sortBy: "price"
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

const AIRLINES = [
  { id: "all", name: "全部航司", code: "" },
  { id: "cz", name: "中国南方航空", code: "CZ" },
  { id: "ca", name: "中国国航", code: "CA" },
  { id: "mu", name: "中国东方航空", code: "MU" },
  { id: "hu", name: "海南航空", code: "HU" },
  { id: "3u", name: "四川航空", code: "3U" },
  { id: "mf", name: "厦门航空", code: "MF" },
  { id: "zh", name: "深圳航空", code: "ZH" }
];

const FLIGHT_SCHEDULES = [
  {
    airlineId: "cz", airlineName: "中国南方航空", airlineCode: "CZ",
    baseUrl: "https://www.csair.com/cn/",
    outboundLeg1: { flightNo: "CZ3306", from: "XMN", to: "CAN", depLocal: "08:00", arrLocal: "09:40", nextDay: false },
    outboundLeg2: { flightNo: "CZ303", from: "CAN", to: "LHR", depLocal: "13:30", arrLocal: "18:50", nextDay: false },
    returnLeg1: { flightNo: "CZ304", from: "LHR", to: "CAN", depLocal: "21:30", arrLocal: "17:30+1", nextDay: true },
    returnLeg2: { flightNo: "CZ3305", from: "CAN", to: "XMN", depLocal: "20:30", arrLocal: "22:15", nextDay: false },
    layoverOutbound: "3h50m", layoverReturn: "3h00m",
    totalDuration: "17h50m", hub: "CAN", londonAirport: "LHR",
    operates: "daily"
  },
  {
    airlineId: "cz", airlineName: "中国南方航空", airlineCode: "CZ",
    baseUrl: "https://www.csair.com/cn/",
    outboundLeg1: { flightNo: "CZ6962", from: "XMN", to: "PKX", depLocal: "14:30", arrLocal: "17:30", nextDay: false },
    outboundLeg2: { flightNo: "CZ673", from: "PKX", to: "LHR", depLocal: "01:30+1", arrLocal: "05:30+1", nextDay: true },
    returnLeg1: { flightNo: "CZ674", from: "LHR", to: "PKX", depLocal: "13:30", arrLocal: "07:30+1", nextDay: true },
    returnLeg2: { flightNo: "CZ6961", from: "PKX", to: "XMN", depLocal: "10:30", arrLocal: "13:40", nextDay: false },
    layoverOutbound: "8h00m", layoverReturn: "3h00m",
    totalDuration: "22h00m", hub: "PKX", londonAirport: "LHR",
    operates: "daily"
  },
  {
    airlineId: "cz", airlineName: "中国南方航空", airlineCode: "CZ",
    baseUrl: "https://www.csair.com/cn/",
    outboundLeg1: { flightNo: "CZ3306", from: "XMN", to: "CAN", depLocal: "08:00", arrLocal: "09:40", nextDay: false },
    outboundLeg2: { flightNo: "CZ327", from: "CAN", to: "LGW", depLocal: "23:30", arrLocal: "05:30+1", nextDay: true },
    returnLeg1: { flightNo: "CZ328", from: "LGW", to: "CAN", depLocal: "11:30", arrLocal: "07:30+1", nextDay: true },
    returnLeg2: { flightNo: "CZ3305", from: "CAN", to: "XMN", depLocal: "10:30", arrLocal: "12:15", nextDay: false },
    layoverOutbound: "13h50m", layoverReturn: "3h00m",
    totalDuration: "28h30m", hub: "CAN", londonAirport: "LGW",
    operates: "daily"
  },
  {
    airlineId: "ca", airlineName: "中国国航", airlineCode: "CA",
    baseUrl: "https://www.airchina.com.cn/",
    outboundLeg1: { flightNo: "CA1802", from: "XMN", to: "PEK", depLocal: "07:45", arrLocal: "10:25", nextDay: false },
    outboundLeg2: { flightNo: "CA855", from: "PEK", to: "LHR", depLocal: "13:25", arrLocal: "17:15", nextDay: false },
    returnLeg1: { flightNo: "CA856", from: "LHR", to: "PEK", depLocal: "20:25", arrLocal: "14:30+1", nextDay: true },
    returnLeg2: { flightNo: "CA1801", from: "PEK", to: "XMN", depLocal: "17:30", arrLocal: "20:20", nextDay: false },
    layoverOutbound: "3h00m", layoverReturn: "3h00m",
    totalDuration: "16h30m", hub: "PEK", londonAirport: "LHR",
    operates: "daily"
  },
  {
    airlineId: "ca", airlineName: "中国国航", airlineCode: "CA",
    baseUrl: "https://www.airchina.com.cn/",
    outboundLeg1: { flightNo: "CA1834", from: "XMN", to: "PEK", depLocal: "19:10", arrLocal: "22:00", nextDay: false },
    outboundLeg2: { flightNo: "CA937", from: "PEK", to: "LHR", depLocal: "01:30+1", arrLocal: "05:40+1", nextDay: true },
    returnLeg1: { flightNo: "CA938", from: "LHR", to: "PEK", depLocal: "12:30", arrLocal: "06:40+1", nextDay: true },
    returnLeg2: { flightNo: "CA1833", from: "PEK", to: "XMN", depLocal: "09:30", arrLocal: "12:30", nextDay: false },
    layoverOutbound: "3h30m", layoverReturn: "2h50m",
    totalDuration: "17h30m", hub: "PEK", londonAirport: "LHR",
    operates: "daily"
  },
  {
    airlineId: "mu", airlineName: "中国东方航空", airlineCode: "MU",
    baseUrl: "https://www.ceair.com/",
    outboundLeg1: { flightNo: "MU5132", from: "XMN", to: "PVG", depLocal: "07:30", arrLocal: "09:10", nextDay: false },
    outboundLeg2: { flightNo: "MU551", from: "PVG", to: "LHR", depLocal: "13:20", arrLocal: "18:30", nextDay: false },
    returnLeg1: { flightNo: "MU552", from: "LHR", to: "PVG", depLocal: "21:00", arrLocal: "16:30+1", nextDay: true },
    returnLeg2: { flightNo: "MU5131", from: "PVG", to: "XMN", depLocal: "19:00", arrLocal: "20:50", nextDay: false },
    layoverOutbound: "4h10m", layoverReturn: "2h30m",
    totalDuration: "18h00m", hub: "PVG", londonAirport: "LHR",
    operates: "daily"
  },
  {
    airlineId: "mu", airlineName: "中国东方航空", airlineCode: "MU",
    baseUrl: "https://www.ceair.com/",
    outboundLeg1: { flightNo: "MU5668", from: "XMN", to: "PVG", depLocal: "18:00", arrLocal: "19:40", nextDay: false },
    outboundLeg2: { flightNo: "MU201", from: "PVG", to: "LHR", depLocal: "00:20+1", arrLocal: "05:40+1", nextDay: true },
    returnLeg1: { flightNo: "MU202", from: "LHR", to: "PVG", depLocal: "10:20", arrLocal: "05:50+1", nextDay: true },
    returnLeg2: { flightNo: "MU5667", from: "PVG", to: "XMN", depLocal: "08:00", arrLocal: "09:50", nextDay: false },
    layoverOutbound: "4h40m", layoverReturn: "2h10m",
    totalDuration: "20h40m", hub: "PVG", londonAirport: "LHR",
    operates: "daily"
  },
  {
    airlineId: "hu", airlineName: "海南航空", airlineCode: "HU",
    baseUrl: "https://www.hnair.com/",
    outboundLeg1: { flightNo: "HU7192", from: "XMN", to: "PEK", depLocal: "08:10", arrLocal: "10:50", nextDay: false },
    outboundLeg2: { flightNo: "HU497", from: "PEK", to: "LHR", depLocal: "14:50", arrLocal: "18:40", nextDay: false },
    returnLeg1: { flightNo: "HU498", from: "LHR", to: "PEK", depLocal: "21:30", arrLocal: "15:30+1", nextDay: true },
    returnLeg2: { flightNo: "HU7191", from: "PEK", to: "XMN", depLocal: "18:00", arrLocal: "20:50", nextDay: false },
    layoverOutbound: "4h00m", layoverReturn: "2h30m",
    totalDuration: "17h30m", hub: "PEK", londonAirport: "LHR",
    operates: "daily"
  },
  {
    airlineId: "3u", airlineName: "四川航空", airlineCode: "3U",
    baseUrl: "https://www.sichuanair.com/",
    outboundLeg1: { flightNo: "3U8858", from: "XMN", to: "TFU", depLocal: "11:30", arrLocal: "14:30", nextDay: false },
    outboundLeg2: { flightNo: "3U3837", from: "TFU", to: "LHR", depLocal: "01:30+1", arrLocal: "06:00+1", nextDay: true },
    returnLeg1: { flightNo: "3U3838", from: "LHR", to: "TFU", depLocal: "10:30", arrLocal: "05:30+1", nextDay: true },
    returnLeg2: { flightNo: "3U8857", from: "TFU", to: "XMN", depLocal: "08:00", arrLocal: "10:50", nextDay: false },
    layoverOutbound: "11h00m", layoverReturn: "2h30m",
    totalDuration: "24h30m", hub: "TFU", londonAirport: "LHR",
    operates: "daily"
  },
  {
    airlineId: "mf", airlineName: "厦门航空", airlineCode: "MF",
    baseUrl: "https://www.xiamenair.com/",
    outboundLeg1: { flightNo: "MF847", from: "XMN", to: "AMS", depLocal: "00:10", arrLocal: "06:40", nextDay: false },
    outboundLeg2: { flightNo: "MF9780", from: "AMS", to: "LHR", depLocal: "09:00", arrLocal: "09:30", nextDay: false },
    returnLeg1: { flightNo: "MF9781", from: "LHR", to: "AMS", depLocal: "16:30", arrLocal: "19:00", nextDay: false },
    returnLeg2: { flightNo: "MF848", from: "AMS", to: "XMN", depLocal: "21:00", arrLocal: "15:30+1", nextDay: true },
    layoverOutbound: "2h20m", layoverReturn: "2h00m",
    totalDuration: "16h20m", hub: "AMS", londonAirport: "LHR",
    operates: "daily",
    note: "厦航经阿姆斯特丹中转，非国内中转"
  },
  {
    airlineId: "zh", airlineName: "深圳航空", airlineCode: "ZH",
    baseUrl: "https://www.shenzhenair.com/",
    outboundLeg1: { flightNo: "ZH9506", from: "XMN", to: "SZX", depLocal: "08:30", arrLocal: "09:50", nextDay: false },
    outboundLeg2: { flightNo: "ZH9067", from: "SZX", to: "LHR", depLocal: "13:30", arrLocal: "18:30", nextDay: false },
    returnLeg1: { flightNo: "ZH9068", from: "LHR", to: "SZX", depLocal: "21:00", arrLocal: "17:00+1", nextDay: true },
    returnLeg2: { flightNo: "ZH9505", from: "SZX", to: "XMN", depLocal: "19:30", arrLocal: "20:50", nextDay: false },
    layoverOutbound: "3h40m", layoverReturn: "2h30m",
    totalDuration: "17h00m", hub: "SZX", londonAirport: "LHR",
    operates: "daily"
  }
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

function cnyToUsd(cny, rate) {
  if (!cny || !rate) return null;
  return Math.round(Number(cny) / rate);
}

function ctripDateKey(dateString) {
  return String(dateString || "").replaceAll("-", "");
}

function readCtripOneWayPrice(json, date) {
  const prices = json?.data?.oneWayPrice;
  if (!Array.isArray(prices)) return null;
  const amount = prices.find(item => item && typeof item === "object")?.[ctripDateKey(date)];
  return amount ? Number(amount) : null;
}

function readCtripRoundTripPrice(json, outboundDate, returnDate) {
  const outbound = json?.data?.roundTripPrice?.[ctripDateKey(outboundDate)];
  const amount = outbound?.[ctripDateKey(returnDate)];
  return amount ? Number(amount) : null;
}

async function fetchCtripLowestPrice({ flightWay, origin, destination, direct = false }) {
  const url = new URL("https://flights.ctrip.com/itinerary/api/12808/lowestPrice");
  url.searchParams.set("flightWay", flightWay);
  url.searchParams.set("dcity", origin);
  url.searchParams.set("acity", destination);
  url.searchParams.set("direct", direct ? "true" : "false");
  url.searchParams.set("army", "false");

  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 FlightValueAdvisor/0.1",
      "accept": "application/json,text/plain,*/*",
      "referer": "https://flights.ctrip.com/"
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Ctrip lowestPrice ${response.status}`);
  const json = await response.json();
  return { url: url.toString(), json };
}

async function ctripLowestPriceExplore(request, exchangeRate) {
  const dates = enumerateDates(request.outboundStart, request.outboundEnd);
  const direct = request.direct === true || request.direct === "true";
  const options = [];
  const diagnostics = [];

  let roundTrip = null;
  let outboundOneWay = null;
  let returnOneWay = null;

  try {
    roundTrip = await fetchCtripLowestPrice({
      flightWay: "Roundtrip",
      origin: request.origin,
      destination: request.destination,
      direct
    });
    diagnostics.push({ mode: "Roundtrip", url: roundTrip.url, status: roundTrip.json?.status, msg: roundTrip.json?.msg });
  } catch (error) {
    diagnostics.push({ mode: "Roundtrip", status: "request-failed", msg: error.message });
  }

  for (const outboundDate of dates) {
    const returnDate = addDays(outboundDate, request.nights);
    const roundTripPrice = roundTrip ? readCtripRoundTripPrice(roundTrip.json, outboundDate, returnDate) : null;
    let priceCny = roundTripPrice;
    let priceMode = "往返最低价";

    if (!priceCny) {
      if (!outboundOneWay) {
        try {
          outboundOneWay = await fetchCtripLowestPrice({
            flightWay: "Oneway",
            origin: request.origin,
            destination: request.destination,
            direct
          });
          diagnostics.push({ mode: "Oneway outbound", url: outboundOneWay.url, status: outboundOneWay.json?.status, msg: outboundOneWay.json?.msg });
        } catch (error) {
          outboundOneWay = { error };
          diagnostics.push({ mode: "Oneway outbound", status: "request-failed", msg: error.message });
        }
      }
      if (!returnOneWay) {
        try {
          returnOneWay = await fetchCtripLowestPrice({
            flightWay: "Oneway",
            origin: request.destination,
            destination: request.origin,
            direct
          });
          diagnostics.push({ mode: "Oneway return", url: returnOneWay.url, status: returnOneWay.json?.status, msg: returnOneWay.json?.msg });
        } catch (error) {
          returnOneWay = { error };
          diagnostics.push({ mode: "Oneway return", status: "request-failed", msg: error.message });
        }
      }

      const outboundPrice = outboundOneWay?.json ? readCtripOneWayPrice(outboundOneWay.json, outboundDate) : null;
      const returnPrice = returnOneWay?.json ? readCtripOneWayPrice(returnOneWay.json, returnDate) : null;
      if (outboundPrice && returnPrice) {
        priceCny = outboundPrice + returnPrice;
        priceMode = "去回程单程最低价合计";
      }
    }

    if (!priceCny) continue;

    const sourceLinks = buildSourceLinks({
      origin: request.origin,
      destination: request.destination,
      outboundDate,
      returnDate
    });

    options.push({
      id: `ctrip-lowest-${request.origin}-${request.destination}-${outboundDate}-${returnDate}`,
      source: "ctrip-lowest",
      sourceName: "携程低价日历",
      priceSource: `${new Date().toISOString().slice(0, 10)} 携程 lowestPrice API：${priceMode}`,
      title: `携程低价日历 ${request.origin} → ${request.destination}`,
      outboundDate,
      returnDate,
      route: `${request.origin} → ${request.destination}`,
      hubs: [],
      londonAirport: request.destination,
      airlines: ["携程低价日历"],
      airlineCode: "",
      airlineBaseUrl: null,
      totalDuration: null,
      totalDurationMinutes: null,
      layoverOutbound: null,
      layoverReturn: null,
      outboundLeg1: null,
      outboundLeg2: null,
      returnLeg1: null,
      returnLeg2: null,
      note: "携程最低价日历价格，未绑定具体航班、舱位、行李和退改规则，下单前需打开携程复核",
      priceUsd: cnyToUsd(priceCny, exchangeRate.rate),
      priceCny,
      ticketing: "unknown",
      channel: "携程",
      sourceLinks,
      googleFlightsUrl: sourceLinks.googleFlights,
      chinaSouthernUrl: sourceLinks.chinaSouthern,
      routeZh: `${describeCode(request.origin)} → ${describeCode(request.destination)}`,
      hubsZh: [],
      londonAirportZh: describeCode(request.destination),
      risks: [
        "携程低价日历为日期维度最低价，不代表指定航班仍有库存",
        "请在携程详情页核对税费、行李、退改和出票规则"
      ]
    });
  }

  return {
    provider: "ctrip-lowest",
    enabled: true,
    options,
    diagnostics,
    message: options.length > 0
      ? `携程 lowestPrice API 返回 ${options.length} 个日期价格`
      : "携程 lowestPrice API 未返回当前航线/日期的可用价格"
  };
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
  if (lower.includes("southern") || lower.includes("china southern") || lower.includes("南方航空") || lower === "cz") return "中国南方航空";
  if (lower.includes("air china") || lower.includes("国航") || lower === "ca") return "中国国航";
  if (lower.includes("eastern") || lower.includes("东方航空") || lower === "mu") return "中国东方航空";
  if (lower.includes("tianjin") || lower.includes("天津航空")) return "天津航空";
  if (lower.includes("hainan") || lower.includes("海南航空") || lower === "hu") return "海南航空";
  if (lower.includes("malaysia") || lower.includes("马航")) return "马来西亚航空";
  if (lower.includes("sichuan") || lower.includes("四川航空") || lower === "3u") return "四川航空";
  if (lower.includes("xiamen") || lower.includes("厦门航空") || lower === "mf") return "厦门航空";
  if (lower.includes("shenzhen") || lower.includes("深圳航空") || lower === "zh") return "深圳航空";
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
  const allPreferred = option.airlines.every((a) => normalizeAirlineName(a) === normalizeAirlineName(request.preferredAirline) || a === request.preferredAirlineCode);
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
    airlineBaseUrl: option.airlineBaseUrl,
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
    { currency: "USD", pattern: /(?:US\$|\$)\s?([0-9][0-9,]{2,5})/gi },
    { currency: "CNY", pattern: /(?:CNY|RMB|¥|￥)\s?([0-9][0-9,]{2,6})/gi },
    { currency: "HKD", pattern: /HK\$\s?([0-9][0-9,]{2,6})/gi }
  ];
  for (const { currency, pattern } of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[0];
      const amount = Number(match[1].replace(/,/g, ""));
      if (amount > 100 && amount < 100000) matches.push({ raw, amount, currency });
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
      status: prices.length ? "candidate-price-found" : dynamic ? "dynamic-or-blocked" : "no-price-found",
      extractedPrices: prices,
      note: prices.length
        ? "静态 HTML 中发现疑似价格文本；未与具体航班/舱位绑定，仅作诊断，不用于结果报价"
        : "未在静态 HTML 中发现可用价格，建议打开链接浏览器复核"
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
  const options = [];
  const dates = enumerateDates(request.outboundStart, request.outboundEnd);
  const airlineFilter = request.airlineId && request.airlineId !== "all"
    ? AIRLINES.find(a => a.id === request.airlineId)
    : null;

  const filteredSchedules = airlineFilter
    ? FLIGHT_SCHEDULES.filter(s => s.airlineId === airlineFilter.id)
    : FLIGHT_SCHEDULES;

  const baseNights = Number(request.nights) || 7;

  for (const schedule of filteredSchedules) {
    for (const outboundDate of dates) {
      const returnDate = addDays(outboundDate, baseNights);
      const destination = schedule.londonAirport;
      const sourceLinks = buildSourceLinks({
        origin: request.origin,
        destination,
        outboundDate,
        returnDate
      });

      options.push({
        id: `${schedule.airlineId}-${schedule.outboundLeg1.flightNo}-${outboundDate}`,
        source: "schedule",
        sourceName: `参考班次（需查实时价格）`,
        priceSource: null,
        title: `${schedule.airlineName} ${schedule.outboundLeg1.flightNo} + ${schedule.outboundLeg2.flightNo}`,
        outboundDate,
        returnDate,
        route: `${schedule.outboundLeg1.from} → ${schedule.outboundLeg1.to} → ${schedule.outboundLeg2.to}`,
        hubs: [schedule.hub],
        londonAirport: destination,
        airlines: [schedule.airlineName],
        airlineCode: schedule.airlineCode,
        airlineBaseUrl: schedule.baseUrl,
        totalDuration: schedule.totalDuration,
        layoverOutbound: schedule.layoverOutbound,
        layoverReturn: schedule.layoverReturn,
        outboundLeg1: schedule.outboundLeg1,
        outboundLeg2: schedule.outboundLeg2,
        returnLeg1: schedule.returnLeg1,
        returnLeg2: schedule.returnLeg2,
        note: schedule.note || "",
        priceUsd: null,
        priceCny: null,
        ticketing: "through",
        channel: `${schedule.airlineName}官网/OTA比价`,
        sourceLinks,
        googleFlightsUrl: sourceLinks.googleFlights,
        chinaSouthernUrl: sourceLinks.chinaSouthern,
        routeZh: `${describeCode(schedule.outboundLeg1.from)} → ${describeCode(schedule.outboundLeg1.to)} → ${describeCode(schedule.outboundLeg2.to)}`,
        hubsZh: [describeCode(schedule.hub)],
        londonAirportZh: describeCode(destination),
        risks: [
          "班次信息为参考时刻，实际执行可能调整，请以航司官网为准",
          "中转时间过短可能存在误机风险，建议预留充足转机时间"
        ]
      });
    }
  }

  return options;
}

function parseTime(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(/\s+/);
  return parts[0] || timeStr;
}

function parseLayoverMinutes(arrivalTime, nextDepartureTime) {
  if (!arrivalTime || !nextDepartureTime) return null;
  try {
    const parse = (t) => {
      const [datePart, timePart] = t.split(/\s+/);
      return new Date(`${datePart}T${timePart}`);
    };
    const diff = (parse(nextDepartureTime) - parse(arrivalTime)) / 60000;
    return diff > 0 ? diff : null;
  } catch {
    return null;
  }
}

async function serpApiExplore(request) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return { provider: "serpapi", enabled: false, options: [], message: "未设置 SERPAPI_KEY，使用参考班次+查价链接模式。获取免费 API Key：https://serpapi.com/" };

  const options = [];
  let queryCount = 0;
  const maxQueries = Math.max(1, Number(request.serpApiMaxQueries || process.env.SERPAPI_MAX_QUERIES || 2));
  const dates = enumerateDates(request.outboundStart, request.outboundEnd);
  const airline = AIRLINES.find(a => a.id === request.airlineId);
  const airlineCode = (airline && airline.id !== "all") ? airline.code : "";

  for (const outboundDate of dates) {
    const returnDate = addDays(outboundDate, request.nights);
    for (const arrival of request.allowLondonAirports || LONDON_AIRPORTS) {
      if (queryCount >= maxQueries) {
        return {
          provider: "serpapi",
          enabled: true,
          options,
          message: options.length > 0
            ? `Google Flights 实时价格：${options.length} 个航班（已按上限执行 ${queryCount}/${maxQueries} 次 SerpApi 查询）`
            : `已按上限执行 ${queryCount}/${maxQueries} 次 SerpApi 查询，但未返回航班`
        };
      }

      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_flights");
      url.searchParams.set("departure_id", request.origin);
      url.searchParams.set("arrival_id", arrival);
      url.searchParams.set("outbound_date", outboundDate);
      url.searchParams.set("return_date", returnDate);
      url.searchParams.set("type", "1");
      url.searchParams.set("travel_class", "1");
      url.searchParams.set("currency", request.currency || "USD");
      url.searchParams.set("hl", "zh-cn");
      url.searchParams.set("gl", "cn");
      if (airlineCode) {
        url.searchParams.set("include_airlines", airlineCode);
      }
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("stops", "2");
      url.searchParams.set("max_price", "3000");

      try {
        queryCount += 1;
        const response = await fetch(url);
        if (!response.ok) continue;
        const json = await response.json();

        const allFlights = [
          ...(json.best_flights || []),
          ...(json.other_flights || [])
        ];

        for (const flight of allFlights) {
          const legs = flight.flights || [];
          if (legs.length < 2) continue;

          const lastOutboundLegIdx = legs.findIndex(leg => {
            const depId = leg.departure_airport?.id;
            return depId === arrival || LONDON_AIRPORTS.includes(depId);
          });

          const outboundLegs = lastOutboundLegIdx >= 0
            ? legs.slice(0, lastOutboundLegIdx + 1)
            : legs;
          const returnLegs = lastOutboundLegIdx >= 0
            ? legs.slice(lastOutboundLegIdx + 1)
            : [];

          const outboundLeg1 = outboundLegs[0];
          const outboundLeg2 = outboundLegs.length > 1 ? outboundLegs[outboundLegs.length - 1] : null;

          const returnLeg1 = returnLegs[0];
          const returnLeg2 = returnLegs.length > 1 ? returnLegs[returnLegs.length - 1] : null;

          const outboundLayover = outboundLeg2 && outboundLeg1
            ? parseLayoverMinutes(outboundLeg1.arrival_airport?.time, outboundLeg2.departure_airport?.time)
            : null;

          const returnLayover = returnLeg2 && returnLeg1
            ? parseLayoverMinutes(returnLeg1.arrival_airport?.time, returnLeg2.departure_airport?.time)
            : null;

          const legsForDisplay = outboundLegs.map(leg => ({
            flightNo: leg.flight_number || "",
            from: leg.departure_airport?.id || "",
            to: leg.arrival_airport?.id || "",
            depLocal: parseTime(leg.departure_airport?.time) || "",
            arrLocal: parseTime(leg.arrival_airport?.time) || "",
            airline: leg.airline || "",
            duration: leg.duration || 0
          }));

          const returnLegsForDisplay = returnLegs.map(leg => ({
            flightNo: leg.flight_number || "",
            from: leg.departure_airport?.id || "",
            to: leg.arrival_airport?.id || "",
            depLocal: parseTime(leg.departure_airport?.time) || "",
            arrLocal: parseTime(leg.arrival_airport?.time) || "",
            airline: leg.airline || "",
            duration: leg.duration || 0
          }));

          const airlineNames = [...new Set(legs.map(l => l.airline).filter(Boolean))];

          const sourceLinks = buildSourceLinks({
            origin: request.origin,
            destination: arrival,
            outboundDate,
            returnDate
          });

          options.push({
            id: `serpapi-${outboundDate}-${arrival}-${options.length}`,
            source: "serpapi",
            sourceName: "Google Flights 实时价格 (via SerpApi)",
            priceSource: `${new Date().toISOString().slice(0, 10)} Google Flights 实时查询`,
            title: `${airlineNames.join(" + ")} ${outboundDate} → ${returnDate}`,
            outboundDate,
            returnDate,
            route: `${request.origin} → ${arrival}`,
            hubs: [outboundLeg2?.departure_airport?.id || legs[0]?.departure_airport?.id].filter(Boolean),
            londonAirport: arrival,
            airlines: airlineNames.map(normalizeAirlineName),
            airlineCode: airlineCode || legs[0]?.airline || "",
            airlineBaseUrl: null,
            totalDuration: flight.total_duration ? formatDuration(flight.total_duration) : null,
            totalDurationMinutes: flight.total_duration || null,
            layoverOutbound: outboundLayover ? formatDuration(outboundLayover) : null,
            layoverReturn: returnLayover ? formatDuration(returnLayover) : null,
            outboundLegs: legsForDisplay,
            returnLegs: returnLegsForDisplay,
            outboundLeg1: legsForDisplay[0] || null,
            outboundLeg2: legsForDisplay.length > 1 ? legsForDisplay[legsForDisplay.length - 1] : null,
            returnLeg1: returnLegsForDisplay[0] || null,
            returnLeg2: returnLegsForDisplay.length > 1 ? returnLegsForDisplay[returnLegsForDisplay.length - 1] : null,
            note: "",
            priceUsd: flight.price || null,
            priceCny: null,
            ticketing: "through",
            channel: "Google Flights → 航司/OTA",
            sourceLinks,
            googleFlightsUrl: sourceLinks.googleFlights,
            chinaSouthernUrl: sourceLinks.chinaSouthern,
            routeZh: legsForDisplay.map(l => `${describeCode(l.from)} → ${describeCode(l.to)}`).join(" / "),
            hubsZh: options.length ? [] : [],
            londonAirportZh: describeCode(arrival),
            risks: []
          });
        }
      } catch {
        // skip failed date/airport combos
      }
    }
  }

  return {
    provider: "serpapi",
    enabled: true,
    options,
    message: options.length > 0
      ? `Google Flights 实时价格：${options.length} 个航班（执行 ${queryCount}/${maxQueries} 次 SerpApi 查询）`
      : `SerpApi 查询完成但未返回航班，可能该日期无此航线（执行 ${queryCount}/${maxQueries} 次查询）`
  };
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

function sortOptions(options, sortBy, preferredAirline, preferredAirlineCode) {
  if (sortBy === "airline") {
    return [...options].sort((a, b) => {
      const airlineTextA = a.airlines.join(" ").toLowerCase();
      const airlineTextB = b.airlines.join(" ").toLowerCase();
      const hasPreferredA = airlineTextA.includes(preferredAirline.toLowerCase()) || airlineTextA.includes(preferredAirlineCode.toLowerCase());
      const hasPreferredB = airlineTextB.includes(preferredAirline.toLowerCase()) || airlineTextB.includes(preferredAirlineCode.toLowerCase());
      const allPreferredA = a.airlines.every((airline) => {
        const normalized = normalizeAirlineName(airline);
        return normalized === preferredAirline || airline === preferredAirlineCode;
      });
      const allPreferredB = b.airlines.every((airline) => {
        const normalized = normalizeAirlineName(airline);
        return normalized === preferredAirline || airline === preferredAirlineCode;
      });
      if (allPreferredA && !allPreferredB) return -1;
      if (!allPreferredA && allPreferredB) return 1;
      if (hasPreferredA && !hasPreferredB) return -1;
      if (!hasPreferredA && hasPreferredB) return 1;
      return a.priceUsd - b.priceUsd;
    });
  } else {
    return [...options].sort((a, b) => a.priceUsd - b.priceUsd);
  }
}

async function analyze(request = DEFAULT_REQUEST) {
  const mergedRequest = { ...DEFAULT_REQUEST, ...request };
  const exchangeRate = await getUsdCnyRate();

  let serpApiResult = { provider: "serpapi", enabled: false, options: [], message: "" };
  try {
    serpApiResult = await serpApiExplore(mergedRequest);
  } catch (error) {
    serpApiResult = { provider: "serpapi", enabled: false, options: [], message: `SerpApi 请求失败：${error.message}` };
  }

  let ctripResult = { provider: "ctrip-lowest", enabled: false, options: [], diagnostics: [], message: "" };
  try {
    ctripResult = await ctripLowestPriceExplore(mergedRequest, exchangeRate);
  } catch (error) {
    ctripResult = { provider: "ctrip-lowest", enabled: false, options: [], diagnostics: [], message: `携程 lowestPrice 请求失败：${error.message}` };
  }

  const dates = enumerateDates(mergedRequest.outboundStart, mergedRequest.outboundEnd);
  let crawlFindings = [];
  if (!serpApiResult.options.length && !ctripResult.options.length && mergedRequest.crawl) {
    try {
      const crawlLimit = Math.min(dates.length, 5);
      crawlFindings = await crawlSources(mergedRequest, crawlLimit);
    } catch {
      // crawl is best-effort
    }
  }

  const scheduleOptions = sampleOptions(mergedRequest);

  let allOptions;
  if (serpApiResult.options.length > 0) {
    allOptions = [...serpApiResult.options, ...ctripResult.options];
  } else if (ctripResult.options.length > 0) {
    allOptions = ctripResult.options;
  } else {
    allOptions = scheduleOptions.map(opt => {
      const relevantFindings = crawlFindings.filter(f =>
        f.url.includes(opt.outboundDate) && f.url.includes(opt.londonAirport)
      );

      return {
        ...opt,
        priceUsd: null,
        priceCny: null,
        priceSource: mergedRequest.crawl
          ? "无 API 模式下未取得可验证实时票价；静态页面候选数字只在抓取诊断中展示"
          : "无 API 模式不会生成估算价；请打开下方链接查询真实票价",
        crawlFindings: relevantFindings
      };
    });
  }

  allOptions.sort((a, b) => {
    const pa = a.priceCny != null ? a.priceCny : a.priceUsd != null ? usdToCny(a.priceUsd, exchangeRate.rate) : 999999;
    const pb = b.priceCny != null ? b.priceCny : b.priceUsd != null ? usdToCny(b.priceUsd, exchangeRate.rate) : 999999;
    return pa - pb;
  });

  allOptions = allOptions.map(opt => ({
    ...opt,
    priceCny: opt.priceCny ?? usdToCny(opt.priceUsd, exchangeRate.rate),
    risks: opt.risks && opt.risks.length > 0 ? opt.risks : [
      opt.priceUsd || opt.priceCny ? "价格为实时查询结果，但票价随时变动，下单前请复核" : "未获取到价格，请通过下方链接查询"
    ]
  }));

  const pricedCount = allOptions.filter(o => o.priceUsd != null || o.priceCny != null).length;

  return {
    generatedAt: new Date().toISOString(),
    request: mergedRequest,
    exchangeRate,
    providerStatus: [serpApiResult.message, ctripResult.message].filter(Boolean).join("；"),
    pricedCount,
    totalCount: allOptions.length,
    crawlFindings,
    ctripDiagnostics: ctripResult.diagnostics,
    top: allOptions.slice(0, 5),
    options: allOptions.slice(0, 200),
    dateQueries: makeDateQueries(mergedRequest),
    airlines: AIRLINES,
    notes: [
      pricedCount > 0
        ? `已获取 ${pricedCount} 个价格结果，按人民币价格从低到高排列`
        : "未获取到结构化价格，结果只展示参考班次和复核入口，不再把静态页面数字当作真实报价。",
      ctripResult.options.length > 0
        ? "携程 lowestPrice 为日期维度最低价，未绑定具体航班、舱位和票规，下单前请打开携程复核"
        : "携程 lowestPrice API 可能只覆盖部分航线；无返回时不会生成估算价。",
      "班次信息基于公开时刻表，实际执行可能调整",
      "中转时间过短存在误机风险，建议预留充足时间"
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
        crawlDays: request.crawlDays ? Number(request.crawlDays) : 4,
        sortBy: request.sortBy || DEFAULT_REQUEST.sortBy,
        airlineId: request.airlineId || "all",
        serpApiMaxQueries: request.serpApiMaxQueries ? Number(request.serpApiMaxQueries) : undefined
      };
      sendJson(res, await analyze(parsed));
      return;
    }
    if (url.pathname === "/api/airlines") {
      sendJson(res, { airlines: AIRLINES });
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
