# Scoring Model

The recommendation score is intentionally simple and explainable.

Positive signals:

- Lower estimated fare.
- Shorter total travel time.
- China Southern participation, with a larger bonus for all-China-Southern itineraries.
- Evening outbound departure.
- London Heathrow over Gatwick when all else is similar.
- Efficient China domestic hubs such as Guangzhou or Beijing Daxing.

Penalties:

- Split ticketing.
- Mixed airlines.
- Very long travel time.
- Crawler/source uncertainty.

The score is not a booking guarantee. It is a prioritization aid that helps decide which itinerary/date pair deserves manual verification first.
