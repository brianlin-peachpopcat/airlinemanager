# ✈ SkyTycoon — Airline Manager

A browser airline-management game inspired by airlinemanager.com. No build step,
no dependencies — open `index.html` in any browser to play.

## How to play
1. Open `index.html`, name your airline and pick a home hub.
2. **Purchase Aircraft** — 27 real aircraft from the ATR 72 and MD-88 to the
   A380, including 737NG / A330ceo variants and six freighters.
3. **Fleet Management** — assign each plane a route; demand, distance and range
   checks are shown live. Hangar starts at 10 bays; expand (+10 a time, cash
   or ⭐ points, takes build time) as costs escalate.
   Routes must depart from one of your **hubs** — click any airport on the
   globe to open one. Hubs in your home country are cheap with unlimited
   departures; international hubs cost ~3× and support only 6 based aircraft.
4. **Fuel & CO₂** — planes can't depart without fuel and carbon quota on hand.
   Prices fluctuate; buy the dips. Storage tanks are limited — expand them
   with points.
5. **Maintenance** — airframes wear ~0.8%/flight-hour. Past 80% passengers stay
   away; at 100% the plane is grounded.
6. **Marketing & Partnerships** — ad campaigns boost pax demand; hub lounges
   boost demand on hub routes; alliance codeshares (points-gated, up to the
   1000-pt Paragon Circle) boost pax and cargo demand network-wide — and
   competitor airlines belong to alliances too, so routes also served by an
   alliance partner sell extra codeshare tickets. Reputation scales everything.
7. **Cargo** — spend 150 ⭐ points to found a cargo division, then buy
   freighters. Freight is a separate demand market with its own rates.
7b. **Finding things** — the shop has a search box, manufacturer dropdown and
   type chips (incl. retro metal: DC-9, MD-88, L-1011, DC-10, A340, 747-400,
   777X…). Airport fields use a searchable picker with a country filter.
7c. **Used market** — 15 second-hand listings, fully re-rolled at random every
   2 days. Five out-of-production classics appear only here by chance (A300,
   707, 737-100, 747-100 and — 5% of the time — the Mach-2 Concorde, thirsty
   and ruinous to maintain). Ageing types (747s, A340s, A380, L-1011, 767F)
   have a final production allotment of 10–20 airframes; rival airlines buy
   them up (watch the news), and once they're gone they're used-market-only.
8. **Stopovers** — add stops to a route to fly beyond an aircraft's range
   (range is checked per leg). Passengers dislike connections (−5% demand for
   one stop, much worse after); freight doesn't care but freighters may only
   make one stop. Stopover landings are 30-minute tech stops with no revenue.
9. **Charters** — spend 300 ⭐ to open a charter desk. Customers call with
   one-off flights (route + fee, expires in 8h); accept or decline them from
   the card at the top of Fleet Management. If the aircraft isn't at the
   pickup airport it ferries there first (extra time and fuel).
10. **Engineering team (Maintenance panel)** — hire engineers (1 per 4
   aircraft, $1.5K/day each) and set a wear slider; planes landing at a hub
   you own are then serviced automatically at the normal check cost.
11. **Onboard experience (Marketing panel)** — pick a catering tier (none →
   gourmet), hand out amenity kits and kids' model planes. Costs are charged
   per passenger per flight and sway demand; name your signature dish too.
   Aircraft prices are derived from one balance formula (capacity × class ×
   range × efficiency × era) — see `tools/` — so retro jets are cheap to buy
   but thirsty, and every type is competitive somewhere.
8. **Staff (Company panel)** — crews are hired automatically with each
   aircraft (bigger planes need more; freighters need pilots only) and
   payroll drains daily. Raises and pay cuts move morale, and morale slowly
   lifts or sinks your reputation.
12. **Competitors** — each new game draws 18 rivals from a database of
   ~134 fictional airlines (parody majors, mid-size, and regionals), so every
   world plays differently. Most carriers only compete on routes that
   touch their home country. Five worldwide airlines — Global Air, Apex
   World Airways, Horizon International, Atlas Skylines, and Meridian
   Airways — always appear and fly everywhere. Carriers order jets, merge,
   and occasionally go bankrupt — a headline announces the collapse and a
   fresh airline from the database moves into the void.

⭐ Points: every departure earns 2–3. Spend them on tank upgrades, hangar
bays, and the cargo unlock; lifetime points earned set your level and
alliance eligibility.

Time runs at 1 real second = 2 game minutes. Progress autosaves to
localStorage and the game simulates up to 12 game-hours while you're away.
Events pop up center-screen and are dismissable.

## Controls
- Drag the globe to rotate, scroll to zoom, click an airport for route info.
- 🛠 button (bottom-right) opens developer tools (infinite money, etc.).

## Files
- `index.html` — game page; `test-run.html` — dev smoke-test page (seeded demo
  game, never saves).
- `js/data.js` — aircraft specs, 74 airports, world map outlines.
- `js/globe.js` — dependency-free orthographic globe renderer (canvas 2D).
- `js/game.js` — economy simulation, save/load.
- `js/ui.js` — panels and HUD; `js/planeart.js` — SVG fallback aircraft art.
- `img/` — aircraft photos (Wikipedia/Wikimedia Commons; see `img/CREDITS.txt`).
  New-market listings use `img/<id>.jpg`; the used market uses a distinct
  alternate `img/<id>-used.jpg`. Regenerate with `python tools/fetch_aircraft_images.py`.
