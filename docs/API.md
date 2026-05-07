# API

The app exposes one JSON endpoint:

```text
GET /api/analyze
```

## Query Parameters

| Name | Default | Description |
| --- | --- | --- |
| `origin` | `XMN` | IATA origin code. |
| `destination` | `LON` | IATA destination code or city code. |
| `outboundStart` | `2026-05-20` | First outbound date to consider. |
| `outboundEnd` | `2026-06-08` | Last outbound date to consider. |
| `nights` | `7` | Trip length in nights/days offset for return date. |
| `allowLondonAirports` | `LHR,LGW` | Comma-separated London airports to search. |
| `direct` | `false` | Passed to Ctrip lowest-price lookup; `true` requests direct-flight calendar prices. |
| `serpApiMaxQueries` | `SERPAPI_MAX_QUERIES` or `2` | Safety cap for Google Flights SerpApi calls per analysis request. |
| `crawl` | `false` | When `true`, attempts static-page traversal across configured sources. |
| `crawlDays` | `4` | Number of outbound dates to crawl from the start of the range. |

## Example

```powershell
Invoke-RestMethod "http://localhost:8787/api/analyze?origin=XMN&destination=LON&outboundStart=2026-05-20&outboundEnd=2026-06-08&nights=7&crawl=true&crawlDays=1"
```

## Response Shape

Important fields:

- `exchangeRate`: USD/CNY rate used for RMB conversion.
- `top`: Top 3 recommended itineraries.
- `options`: Ranked candidate itineraries.
- `dateQueries`: Search links for every date pair.
- `crawlFindings`: Per-source traversal status.
- `ctripDiagnostics`: Ctrip lowest-price API request status for round-trip and one-way fallback lookups.
- `notes`: Operational caveats about APIs, dynamic pages, and OTA risk.

Crawler statuses:

- `candidate-price-found`: A likely price string was found in static HTML. It is diagnostic only and is not used as an itinerary fare.
- `dynamic-or-blocked`: The page appears dynamic, blocked, or JavaScript dependent.
- `no-price-found`: Static HTML was reachable but no clear price was found.
- `request-failed`: Network, timeout, TLS, or access failure.
