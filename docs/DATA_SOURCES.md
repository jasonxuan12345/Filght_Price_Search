# Data Sources

This project is built around conservative data access. It does not bypass captchas, login walls, or anti-bot systems.

## Supported Sources

| Source | Mode | Notes |
| --- | --- | --- |
| Google Flights | Link generation, optional SerpApi | Google Flights has no official public flight-pricing API. |
| Trip.com | Link generation, static traversal attempt | Many pages are dynamic and may not expose prices in HTML. |
| Ctrip/携程 | Link generation, static traversal attempt | Domestic site behavior may vary by region, cookies, and bot checks. |
| China Southern Airlines | Link generation, static traversal attempt | Airline websites usually do not expose stable public fare APIs. |
| Exchange rate | Live fetch with fallback | Attempts public USD/CNY endpoints and falls back to `7.2`. |

## Recommended Production Upgrade

For reliable pricing, add a commercial flight API or GDS provider:

- Amadeus for Developers
- Duffel
- Sabre
- Travelport
- SerpApi for Google Flights style result parsing

The current crawler is useful as a first-pass helper and audit trail, but final ticketing should always be verified in Google Flights, the airline website, or the OTA checkout page.
