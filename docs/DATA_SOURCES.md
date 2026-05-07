# Data Sources

This project is built around conservative data access. It does not bypass captchas, login walls, or anti-bot systems.

## Supported Sources

| Source | Mode | Notes |
| --- | --- | --- |
| Google Flights | Link generation, optional SerpApi | Google Flights has no official public flight-pricing API. |
| Trip.com | Link generation, static traversal diagnostics | Many pages are dynamic and may not expose verifiable prices in HTML. |
| Ctrip/携程 | Lowest-price calendar API, link generation, static traversal diagnostics | `lowestPrice` returns date-level lowest fares for supported routes; not a specific flight quote. |
| China Southern Airlines | Link generation, static traversal diagnostics | Airline websites usually do not expose stable public fare APIs. |
| Exchange rate | Live fetch with fallback | Attempts public USD/CNY endpoints and falls back to `7.2`. |

## Recommended Production Upgrade

For reliable pricing, add a commercial flight API or GDS provider:

- Amadeus for Developers
- Duffel
- Sabre
- Travelport
- SerpApi for Google Flights style result parsing

The Ctrip `lowestPrice` integration is treated as structured pricing when the API returns a date-level fare, but it is still a calendar fare rather than a guaranteed bookable itinerary. The current crawler is useful as a first-pass helper and audit trail, but static price-looking text is not treated as a fare because it may not be bound to a specific itinerary, cabin, tax state, or live inventory. Final ticketing should always be verified in Google Flights, the airline website, or the OTA checkout page.
