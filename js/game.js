// ============================================================
// SkyTycoon — game state & economy
// Time scale: 1 real second = 1 game minute
// ============================================================

const CO2_PER_KG_FUEL = 3.16;      // kg CO2 per kg jet fuel
const TURNAROUND_MIN = 45;
const TECH_STOP_MIN = 30;          // stopover ground time (no revenue)

// charter operations
const CHARTER_UNLOCK_PTS = 300;
const CHARTER_LIFE_MIN = 8 * 60;   // offers expire after 8 game hours
const CHARTER_MAX_OFFERS = 3;
const CHARTER_SPEC_PAY = 1.35;     // +35% when a charterSpec jet flies the job
const CHARTER_VIP_MAX = 8;         // remembered repeat clients
const CHARTER_VIP_NAMES = [
  "Sterling Private", "Aurora Exec", "Summit Group", "Helix Capital",
  "Northwind VIP", "Lumen Tours", "Atlas Charter", "Meridian Club",
  "Cobalt Parties", "Vesper Holdings", "Pinnacle Sports", "Cedar Media",
];

// Flavor lines for charter offers — country tags pick regional copy when
// either endpoint matches; otherwise (or sometimes on purpose) use generic.
const CHARTER_BRIEF_GENERIC = [
  "Business corporation requests a ferry to a meeting",
  "Executive board needs a same-day shuttle",
  "Private client booking a quiet hop between cities",
  "Consulting team needs wheels-up for a pitch",
  "Wedding party chartering a one-way transfer",
  "Film crew relocating between shoots",
  "Medical specialist needs a timed arrival",
  "Investor roadshow — boardroom in the sky",
];
const CHARTER_BRIEF_BY_COUNTRY = {
  Canada: [
    "Hockey team requests a ferry to the tournament",
    "Junior squad needs a road-trip hop for playoffs",
    "Curling club booking travel to nationals",
    "Mining execs need a northern site visit",
  ],
  USA: [
    "NCAA team chartering to the championship",
    "Silicon Valley founders need a coast-to-coast hop",
    "Campaign staff booking a rally transfer",
    "Pro sports franchise relocating for an away game",
  ],
  "United Kingdom": [
    "Premier League side needs an away-day ferry",
    "City bankers booking a discreet continental hop",
    "Royal-adjacent event needs a timed arrival",
  ],
  UK: [
    "Premier League side needs an away-day ferry",
    "City bankers booking a discreet continental hop",
  ],
  Japan: [
    "Keiretsu executives need a same-day shuttle",
    "Baseball club chartering for interleague travel",
    "Anime production team relocating for a premiere",
  ],
  Australia: [
    "AFL club booking an interstate ferry",
    "Mining board needs a fly-in to the outback site",
    "Surf contest organizers relocating the crew",
  ],
  Brazil: [
    "Football club needs a derby-day ferry",
    "Carnival organizers booking VIP transfers",
  ],
  France: [
    "Fashion house needs a runway-week shuttle",
    "Wine estate hosting a buyer tasting hop",
  ],
  Germany: [
    "Auto-group engineers need a factory tour hop",
    "Bundesliga side booking an away transfer",
  ],
  Italy: [
    "Serie A club needs an away-day ferry",
    "Design house booking Milan Fashion Week hops",
  ],
  Spain: [
    "La Liga side chartering for an away fixture",
    "Film festival VIP shuttle between venues",
  ],
  China: [
    "Tech conglomerate needs a same-day board hop",
    "Factory audit team booking a coastal transfer",
  ],
  India: [
    "Cricket franchise needs a match-day ferry",
    "Bollywood production relocating the cast",
  ],
  "United Arab Emirates": [
    "Sovereign fund principals need a discreet hop",
    "Luxury retail launch — VIP guest ferry",
  ],
  UAE: [
    "Sovereign fund principals need a discreet hop",
    "Luxury retail launch — VIP guest ferry",
  ],
  Mexico: [
    "Football club booking a league away day",
    "Resort group ferrying executives for an opening",
  ],
  "South Korea": [
    "K-pop tour needs a city-to-city hop",
    "Chaebol board booking a same-day shuttle",
  ],
  "New Zealand": [
    "Rugby squad needs a ferry to the fixture",
    "Film unit relocating between locations",
  ],
  "South Africa": [
    "Safari lodge guests need a timed charter hop",
    "Rugby franchise booking an away transfer",
  ],
  Switzerland: [
    "Private bank principals need a discreet hop",
    "Ski resort hosting a VIP transfer",
  ],
  Norway: [
    "Offshore energy team needs a North Sea hop",
    "Winter sports squad booking tournament travel",
  ],
  Sweden: [
    "Hockey league side needs a road-trip ferry",
    "Design studio relocating for a product launch",
  ],
};
const MAINT_DURATION_MIN = 90;
const WEAR_PER_HOUR = 0.06;        // % airframe wear per flight hour (long-hauls approach the cap)
const WEAR_PER_LANDING_MAX = 1;    // one landing never adds more than 1%
const WEAR_MAX = 120;              // hard cap
const WEAR_SAFETY = 110;           // auto-ground + regulator fine

// Difficulty — chosen at founding and locked for the save.
// Easy: milder aircraft discounts & marketing, Eco Friendly campaign unlocked.
// Normal: the baseline balance.
// Realism: faster airframe wear, game speed locked to 4×.
// Easy new-plane multipliers stay ABOVE the used-market band (~45–70% of
// factory list). Older 0.26–0.54 values made brand-new jets cheaper than
// second-hand (e.g. 757 ~$16M new vs ~$25M used).
// VIP jets stay near list (charter pay is already rich).
const EASY_CAT_PLANE = {
  Light: 0.88,
  Regional: 0.82,
  Narrowbody: 0.84,
  Widebody: 0.86,
  Freighter: 0.85,
  Charter: 1.0,
};

const DIFFICULTY = {
  easy:    { id: "easy",    label: "Easy",    planeMult: 0.40, campaignMult: 0.5, wearMult: 1,   lockSpeed: null, revMult: 2.0, fuelMult: 1,
    demandHours: 12,
    blurb: "Cheaper aircraft (by class), boosted ticket & cargo pay, cheaper marketing, fewer rivals, route demand resets every 12h, and an Eco Friendly campaign." },
  normal:  { id: "normal",  label: "Normal",  planeMult: 1,    campaignMult: 1,   wearMult: 1,   lockSpeed: null, revMult: 1, fuelMult: 1.2,
    demandHours: 24,
    blurb: "The standard SkyTycoon challenge — pick your own pace. Route demand resets every 24 hours." },
  realism: { id: "realism", label: "Realism", planeMult: 1,    campaignMult: 1,   wearMult: 2,   lockSpeed: "fast", revMult: 1, fuelMult: 1.44,
    demandHours: 24,
    blurb: "Airframes wear twice as fast, jet fuel runs dearest, and you're locked to 4× speed. Route demand resets every 24 hours." },
};

function difficultyOf() {
  return DIFFICULTY[(G.state && G.state.difficulty) || "normal"] || DIFFICULTY.normal;
}
function isEasy() { return difficultyOf().id === "easy"; }
function planePriceMult(t) {
  const d = difficultyOf();
  if (d.id === "easy" && t && t.cat && EASY_CAT_PLANE[t.cat] != null) return EASY_CAT_PLANE[t.cat];
  return d.planeMult;
}
function revDiffMult() { return difficultyOf().revMult || 1; }
function wearDiffMult() { return difficultyOf().wearMult; }
function fuelDiffMult() { return difficultyOf().fuelMult || 1; }

// Jet fuel spot market ($/t before difficulty scaling). Wide band + big steps:
// at the floor an average airframe spends ~8% of trip profit on fuel (easy),
// at the ceiling ~40% — thirsty types more, high-bypass types less.
const FUEL_MEAN = 1300, FUEL_STEP = 160, FUEL_LO = 880, FUEL_HI = 4400;
const OFFLINE_CAP_MIN = 720;       // max offline game-minutes simulated
const LEASE_MONTHLY_RATE = 0.018;  // lease = 1.8% of list price / month
const LEASE_DEPOSIT_RATE = 0.05;   // 5% upfront to take delivery
const LEASE_MAX_DAYS = 20;         // leases end automatically after 20 days
const LEASE_COOLDOWN_DAYS = 20;    // then that manufacturer charges +40% for a while
const LEASE_SURCHARGE = 1.4;

function leaseSurchargeActive(maker) {
  const cd = G.state.leaseCooldown || {};
  return (cd[maker] || 0) > G.state.gameMin;
}

// Cabin layout: F/J use more fuselage space than Y (economy-equivalent units)
const CABIN_SPACE = { F: 3, J: 2, Y: 1 };
// Baseline class mix — overridden per route by routeClassMix().
const CABIN_DEMAND = { F: 0.05, J: 0.15, Y: 0.80 };
const CABIN_FILL = { F: 0.78, J: 0.88, Y: 1.0 };    // how readily each class fills when demand matches

// Engine packages — trade fuel burn, speed, and acquisition cost
const ENGINES = {
  std:  { id: "std",  name: "Standard",    burnMult: 1,    speedMult: 1,    costMult: 1 },
  eco:  { id: "eco",  name: "High-bypass", burnMult: 0.88, speedMult: 0.98, costMult: 1.06 },
  perf: { id: "perf", name: "Performance", burnMult: 1.12, speedMult: 1.06, costMult: 1.04 },
};

// Small ferry/delivery delay by category (game minutes)
const DELIVERY_MIN = {
  Light: 3 * 60,
  Regional: 6 * 60,
  Charter: 5 * 60,
  Narrowbody: 10 * 60,
  Widebody: 18 * 60,
  Freighter: 14 * 60,
};

const BRAND_FOCUS = {
  express: { label: "Express / feeder", cats: ["Light", "Regional"] },
  regional: { label: "Regional airline", cats: ["Light", "Regional", "Narrowbody"] },
  mainline: { label: "Full fleet", cats: null },
  charter: { label: "VIP charter", cats: ["Charter"] },
  cargo: { label: "Cargo division", cats: ["Freighter"] },
};
const BRAND_FOUND_COST = 8e6;      // $ to found a subsidiary
const BRAND_FOUND_PTS = 20;        // points to found a subsidiary
const MAX_CHILD_BRANDS = 4;

// ---------------- training academy ----------------
// Training points drop rarely from departures (~1 in 25) and are spent on
// four tracks in Company → Training.
const TRAIN_DROP_CHANCE = 0.04;
const TRAINING = {
  pilot: { name: "Pilot training",  icon: "👨‍✈️", max: 5, costs: [2, 3, 4, 6, 8],
    desc: "Smoother flying: −4% airframe wear per level. Level 3 certifies your pilots for widebody / heavy aircraft." },
  crew:  { name: "Cabin crew training", icon: "🧑‍✈️", max: 5, costs: [2, 3, 4, 6, 8],
    desc: "Warmer service: +1% passenger demand per level and a better rating." },
  chef:  { name: "Chef academy", icon: "👨‍🍳", max: 2, costs: [3, 5],
    desc: "Level 1 unlocks Hot meals, level 2 unlocks the Gourmet menu." },
  mgmt:  { name: "Management school", icon: "💼", max: 5, costs: [2, 3, 4, 6, 8],
    desc: "Negotiators: −2% payroll and −1.5% on aircraft deals per level — though some manufacturers won't budge." },
};

function trainLevel(track) { return (G.state.train && G.state.train[track]) || 0; }

function trainUp(track) {
  G.err = null;
  const s = G.state, t = TRAINING[track];
  if (!t) return false;
  const lvl = trainLevel(track);
  if (lvl >= t.max) { G.err = "That track is fully trained."; return false; }
  const cost = t.costs[lvl];
  if (s.trainPts < cost) { G.err = `Needs ${cost} training points (you have ${s.trainPts}).`; return false; }
  s.trainPts -= cost;
  s.train[track] = lvl + 1;
  s.reputation = Math.min(100, s.reputation + 1.5);   // a visible bump per graduation
  log(`🎓 ${t.name} reached level ${lvl + 1}.`, "good");
  save();
  return true;
}

function pilotWearMult() { return 1 - 0.04 * trainLevel("pilot"); }
function crewDemandMult() { return 1 + 0.01 * trainLevel("crew"); }
function mgmtPayrollMult() { return 1 - 0.02 * trainLevel("mgmt"); }
function mgmtPlaneDiscount() { return 0.015 * trainLevel("mgmt"); }
function mealUnlocked(id) {
  if (id === "hot") return trainLevel("chef") >= 1;
  if (id === "gourmet") return trainLevel("chef") >= 2;
  return true;
}

// ---------------- ticket pricing ----------------
// Each route has a fare multiplier. Demand is price-elastic: pax carried
// scale by fare^-ELASTICITY, so overpricing empties seats and underpricing
// gives cheap seats away.
const FARE_ELASTICITY = 1.6;
const FARE_MIN = 0.6, FARE_MAX = 2.0;

// Revenue-optimal fare: raise prices until demand just fills the plane.
// capRef: expected daily capacity of the aircraft being assigned — without
// it, an unserved route divides by ~nothing and every suggestion hits 200%.
function suggestedFare(fromCode, toCode, stops, cargo, capRef) {
  const a = airportByCode[fromCode], b = airportByCode[toCode];
  if (!a || !b) return 1;
  const live = demandMultiplier({ cargo, touchesHub: fromCode === G.state.hub || toCode === G.state.hub, from: fromCode, to: toCode }) *
    stopoverPenalty((stops || []).length, cargo) *
    eventDemandMult(a, b, cargo);
  const demand = routePoolRemaining(fromCode, toCode, !!cargo) * live;
  let cap = routeDailyCapacity(fromCode, toCode, cargo) * (demandPeriodHours() / 24) + (capRef || 0);
  if (cap < 1) cap = cargo ? 60 : 350;   // nominal single-widebody reference
  const rawLoad = demand / cap;
  return Math.max(1, Math.min(FARE_MAX, Math.pow(rawLoad, 1 / FARE_ELASTICITY)));
}

// ---------------- world events ----------------
// Templates pick a target from a pool. The same event never runs twice at
// once, and each has a cooldown so the Olympics can't happen back-to-back.
const EVENT_MAX = 3;
const LEISURE = ["HNL", "OGG", "BOB", "CUN", "DPS", "NAN", "PPT", "MIA", "BCN", "PMI", "AKL", "MLE", "SEZ", "RUN"];
const EVENT_TPL = [
  // demand booms
  { kind: "pax",  airport: "leisure", mult: 1.6, days: [4, 7], cd: 12,
    name: "Holiday season", desc: "School's out — everyone wants to fly to {X}!" },
  { kind: "pax",  airport: "big", mult: 1.7, days: [7, 9], cd: 90,
    name: "Olympic Games", desc: "The Games open in {X} — the world is coming to watch." },
  { kind: "pax",  airport: "big", mult: 1.5, days: [4, 6], cd: 45,
    name: "World Cup final round", desc: "Football fever — fans from everywhere are flying to {X}." },
  { kind: "both", airport: "big", mult: 1.4, days: [3, 4], cd: 15,
    name: "World trade fair", desc: "{X} hosts a giant trade expo — seats and freight both booked out." },
  { kind: "pax",  airport: "any", mult: 1.5, days: [3, 5], cd: 10,
    name: "Music festival", desc: "A legendary festival takes over {X} for the week." },
  { kind: "pax",  airport: "any", mult: 1.35, days: [2, 3], cd: 10,
    name: "Airshow week", desc: "The airshow at {X} draws every aviation nerd on the planet. Relatable." },
  { kind: "pax",  airport: "big", mult: 1.3, days: [2, 3], cd: 12,
    name: "Tech mega-conference", desc: "Keynotes and lanyards descend on {X}." },
  { kind: "pax",  airport: ["JED"], mult: 1.8, days: [5, 8], cd: 60,
    name: "Pilgrimage season", desc: "Millions journey to Jeddah — every seat matters." },
  { kind: "pax",  country: ["Japan"], mult: 1.5, days: [5, 7], cd: 60,
    name: "Cherry blossom season", desc: "Sakura in bloom — the world books flights to Japan." },
  { kind: "pax",  country: ["Kenya", "Tanzania", "South Africa"], mult: 1.4, days: [5, 8], cd: 30,
    name: "Safari season", desc: "The great migration is on — {X} lodges are full." },
  { kind: "pax",  country: "any", mult: 1.35, days: [8, 12], cd: 20,
    name: "Visa-free agreement", desc: "{X} drops visa requirements — tourism jumps." },
  // cargo booms
  { kind: "cargo", country: ["China"], mult: 1.8, days: [5, 8], cd: 30,
    name: "Collectible toy craze", desc: "A plush-toy craze sweeps the world — freight out of China surges." },
  { kind: "cargo", country: ["China", "USA"], mult: 1.4, days: [3, 5], cd: 25,
    name: "E-commerce mega-sale", desc: "Flash-sale parcels flood out of {X} warehouses." },
  { kind: "cargo", country: "any", mult: 1.5, days: [4, 6], cd: 15,
    name: "Harvest season", desc: "Perishable exports from {X} need to fly, fast." },
  { kind: "cargo", country: ["Australia", "Chile", "DR Congo", "Zambia"], mult: 1.6, days: [5, 8], cd: 30,
    name: "Mining boom", desc: "Ore samples, parts and crews — {X} mining freight takes off." },
  // busts
  { kind: "both", airport: "any", mult: 0.45, days: [2, 4], cd: 25,
    name: "Volcanic ash cloud", desc: "An ash cloud drifts over {X} — travellers stay away." },
  // Hurricane / blizzard demand hits live under Weather Warnings (regional storms), not news.
  { kind: "both", airport: "any", mult: 0.35, days: [1, 2], cd: 15,
    name: "Ground crew strike", desc: "Baggage handlers walk out at {X}." },
  { kind: "pax",  country: "any", mult: 0.6, days: [4, 6], cd: 20,
    name: "Currency crisis", desc: "A currency slump in {X} keeps travellers home." },
  // market-wide
  { kind: "pax",  global: true, mult: 1.25, days: [3, 5], cd: 40, rival: true,
    name: "Rival airline grounded",
    desc: "{R} has grounded its fleet for inspections — their passengers need seats." },
  { kind: "fuel", mult: 1.35, days: [3, 5], cd: 20,
    name: "Oil supply shock", desc: "Refinery outages push jet fuel prices up worldwide." },
  { kind: "fuel", mult: 0.7, days: [3, 5], cd: 20,
    name: "Fuel glut", desc: "Overproduction floods the market — jet fuel is cheap. Fill your tanks." },
  { kind: "co2",  mult: 1.3, days: [3, 5], cd: 20,
    name: "Carbon quota squeeze", desc: "Regulators tighten CO₂ quotas — permits get pricey." },
  { kind: "co2",  mult: 0.75, days: [3, 5], cd: 20,
    name: "Carbon credit surplus", desc: "A quota auction floods the market — CO₂ permits are a bargain." },
  // more cargo action
  { kind: "cargo", country: ["China", "South Korea", "USA"], mult: 1.7, days: [3, 5], cd: 40,
    name: "Smartphone launch", desc: "A new flagship phone ships from {X} — air freight only, overnight everywhere." },
  { kind: "cargo", global: true, mult: 1.35, days: [4, 7], cd: 35,
    name: "Auto parts shortage", desc: "Assembly lines are starving worldwide — parts fly instead of float." },
  { kind: "cargo", global: true, mult: 1.4, days: [2, 3], cd: 45,
    name: "Mega sale weekend", desc: "A global shopping holiday buries every parcel hub on Earth." },
  { kind: "cargo", country: ["Switzerland", "Belgium", "Netherlands"], mult: 1.5, days: [3, 5], cd: 40,
    name: "Pharma cold-chain rush", desc: "Temperature-controlled medical freight out of {X} pays premium rates." },
  // rare & ridiculous
  { kind: "both", airport: "any", mult: 0.5, days: [1, 1], cd: 90, rare: true,
    name: "Hippos on the runway", desc: "Escaped zoo hippos are sunbathing on {X}'s main runway. Ground crews negotiate." },
  { kind: "pax", airport: "north", mult: 1.6, days: [1, 2], cd: 120, rare: true,
    name: "Santa's layover", desc: "A certain red sleigh is refueling at {X} — spotters arrive by the planeload." },
  { kind: "pax", airport: "any", mult: 1.45, days: [1, 2], cd: 90, rare: true,
    name: "Giant rubber duck", desc: "A 15-metre inflatable duck has drifted into the bay by {X}. Tourism erupts." },
  { kind: "both", airport: "any", mult: 0.6, days: [1, 1], cd: 90, rare: true,
    name: "Cat in the tower", desc: "A cat is asleep on the radar console at {X}. Nobody has the heart to move it." },
  // fleet retirements → used-market floods (no demand mult; listings tagged fromEvent)
  { kind: "used", typeId: "md11f", count: [5, 10], days: [5, 8], cd: 70,
    name: "SpedEx retires MD-11s",
    desc: "SpedEx Cargo is retiring its MD-11 fleet — expect many examples to come to the used market." },
  { kind: "used", typeId: "b748f", count: [3, 7], days: [4, 7], cd: 80,
    name: "Kargolux trims 747Fs",
    desc: "Kargolux is parking older 747 freighters as 777Fs take over — bargain noses on the used ramp." },
  { kind: "used", typeId: "b763f", count: [4, 9], days: [5, 8], cd: 65,
    name: "UPZ sheds 767Fs",
    desc: "UPZ is retiring a tranche of 767 freighters — freight operators are circling the used listings." },
  { kind: "used", typeId: "a310f", count: [3, 6], days: [4, 6], cd: 75,
    name: "European freighter clear-out",
    desc: "A European cargo group is dumping its remaining A310 freighters — several are heading to brokers." },
  { kind: "used", typeId: "b744", count: [4, 8], days: [5, 8], cd: 70,
    name: "Queens leave the fleet",
    desc: "A major carrier is retiring passenger 747-400s — classic jumbos are flooding the used market." },
  { kind: "used", typeId: "md11", count: [3, 7], days: [4, 7], cd: 75,
    name: "MD-11 passenger sunset",
    desc: "The last passenger MD-11s are being withdrawn — trijets are turning up second-hand in bunches." },
  { kind: "used", typeId: "a343", count: [3, 7], days: [4, 7], cd: 70,
    name: "A340 phase-out wave",
    desc: "Another airline is parking its A340-300s for twins — look for a wave of used quads." },
  { kind: "used", typeId: "crj7", count: [5, 11], days: [4, 7], cd: 55,
    name: "Regional jet retirement",
    desc: "A US regional is retiring CRJ700s en masse — hop-sized jets are stacking up on the used market." },
  { kind: "used", typeId: "b738", count: [4, 9], days: [4, 6], cd: 50,
    name: "MAX cascade sales",
    desc: "Airlines taking 737 MAX deliveries are dumping early 737-800s — plenty of used NGs for sale." },
  { kind: "used", typeId: "a320", count: [4, 8], days: [4, 6], cd: 50,
    name: "Neo cascade sales",
    desc: "Carriers taking A320neos are releasing classic A320-200s — the used market is suddenly deep." },
  // Rare news that nudges a marketing campaign's cost or punch (campCost / campEffect).
  { kind: "campaign", campId: "social", campEffect: 1.6, days: [2, 4], cd: 100, rare: true,
    name: "Viral moment", desc: "Your brand is suddenly everywhere in the feed — social campaigns hit harder." },
  { kind: "campaign", campId: "social", campEffect: 0.55, days: [2, 3], cd: 90, rare: true,
    name: "Algorithm chill", desc: "Platforms bury airline ads — social campaigns underperform." },
  { kind: "campaign", campId: "press", campEffect: 1.5, days: [2, 3], cd: 100, rare: true,
    name: "Soft news week", desc: "Editors are hungry for travel features — PR tours punch above their weight." },
  { kind: "campaign", campId: "press", campEffect: 0.5, days: [2, 3], cd: 90, rare: true,
    name: "News cycle saturation", desc: "Bigger stories crowd the front page — press tours get drowned out." },
  { kind: "campaign", campId: "credit", campEffect: 1.4, days: [3, 5], cd: 110, rare: true,
    name: "Rewards race", desc: "Travel cards are hot — a credit-card partnership lands especially well." },
  { kind: "campaign", campId: "celeb", campEffect: 1.45, campCost: 1.25, days: [2, 4], cd: 120, rare: true,
    name: "A-list frenzy", desc: "Celebrity culture is peaking — endorsements cost more, but they move the needle." },
  { kind: "campaign", campId: "celeb", campEffect: 0.6, days: [2, 3], cd: 100, rare: true,
    name: "Star scandal", desc: "Talent drama dominates the gossip pages — celebrity tie-ins look risky." },
  { kind: "campaign", campId: "eco", campEffect: 1.5, days: [3, 5], cd: 110, rare: true,
    name: "Climate summit week", desc: "Green travel is headline news — eco branding resonates." },
  { kind: "campaign", campId: "tv", campEffect: 1.35, days: [2, 4], cd: 100, rare: true,
    name: "Ratings spike", desc: "Prime-time audiences are huge this week — TV spots work overtime." },
  { kind: "campaign", campId: "global", campCost: 0.75, days: [3, 5], cd: 120, rare: true,
    name: "Sponsorship fire sale", desc: "Venues are desperate for partners — global sponsorships go cheaper." },

  // --- extra demand / disruption flavour ---
  { kind: "pax",  airport: "leisure", mult: 1.55, days: [3, 5], cd: 18,
    name: "Cruise-ship turnaround", desc: "Three mega-ships dock at {X} the same morning — every seat out of town is gold." },
  { kind: "pax",  airport: "big", mult: 1.45, days: [2, 4], cd: 22,
    name: "Marathon weekend", desc: "Elite runners and their fans pour into {X} for race day." },
  { kind: "pax",  airport: "any", mult: 1.4, days: [2, 3], cd: 16,
    name: "Film festival", desc: "Red carpets and press junkets — {X} is suddenly full of sunglasses and carry-ons." },
  { kind: "pax",  airport: "big", mult: 1.35, days: [3, 5], cd: 28,
    name: "University exam season ends", desc: "Students flee {X} the moment finals end — every red-eye is packed." },
  { kind: "pax",  country: ["India", "Pakistan", "Bangladesh"], mult: 1.5, days: [5, 8], cd: 40,
    name: "Wedding season rush", desc: "Multi-city wedding circuits fill every cabin through {X}." },
  { kind: "pax",  country: ["USA", "Canada"], mult: 1.35, days: [3, 5], cd: 35,
    name: "Thanksgiving travel crush", desc: "Everyone in {X} is going home — or claiming they are." },
  { kind: "pax",  country: ["China"], mult: 1.55, days: [6, 10], cd: 55,
    name: "Spring Festival travel", desc: "The world's largest human migration brushes {X} — book early or cry." },
  { kind: "both", airport: "big", mult: 1.3, days: [2, 4], cd: 20,
    name: "Diplomatic summit", desc: "Motorcades and press pools squeeze {X} — pax and secure freight both spike." },
  { kind: "both", airport: "any", mult: 0.55, days: [1, 3], cd: 22,
    name: "ATC system outage", desc: "Radar screens go dark at {X} — flights cancel and tempers rise." },
  { kind: "both", airport: "any", mult: 0.5, days: [1, 2], cd: 18,
    name: "Runway resurfacing", desc: "{X} closes a main runway for emergency repairs — slots vanish overnight." },
  { kind: "pax",  airport: "any", mult: 0.55, days: [2, 4], cd: 25,
    name: "Hotel workers strike", desc: "No rooms in {X} means no tourists — inbound bookings collapse." },
  { kind: "pax",  country: "any", mult: 0.65, days: [3, 5], cd: 30,
    name: "Travel advisory", desc: "Foreign offices urge caution for {X} — leisure traffic dries up." },
  { kind: "cargo", country: ["Netherlands", "Kenya", "Colombia", "Ecuador"], mult: 1.55, days: [3, 6], cd: 28,
    name: "Flower auction surge", desc: "Cut flowers from {X} must fly tonight or wilt — freighters rejoice." },
  { kind: "cargo", country: ["Japan", "Germany", "South Korea"], mult: 1.45, days: [3, 5], cd: 32,
    name: "Chip fab emergency", desc: "A fab in {X} needs spare parts yesterday — belly holds fill with silicon." },
  { kind: "cargo", airport: "big", mult: 1.4, days: [2, 4], cd: 24,
    name: "Live-animal charter wave", desc: "Zoo transfers and breeding loans keep {X} freighters busy." },
  { kind: "cargo", global: true, mult: 1.3, days: [3, 5], cd: 40,
    name: "Just-in-time panic", desc: "Factories worldwide discover empty shelves — air freight rates smile." },
  { kind: "fuel", mult: 1.2, days: [2, 4], cd: 25,
    name: "Pipeline maintenance", desc: "A key jet-fuel pipeline is offline — prices creep up everywhere." },
  { kind: "fuel", mult: 0.82, days: [2, 4], cd: 25,
    name: "Refinery restart", desc: "A major refinery comes back online — jet fuel eases a little." },
  { kind: "co2",  mult: 1.2, days: [3, 5], cd: 28,
    name: "ETS auction spike", desc: "Carbon permit auctions clear high — quota gets dearer." },
  { kind: "co2",  mult: 0.85, days: [3, 5], cd: 28,
    name: "Green corridor credits", desc: "New corridor credits hit the market — CO₂ permits soften." },
  // rare & ridiculous (more)
  { kind: "pax", airport: "any", mult: 1.5, days: [1, 2], cd: 100, rare: true,
    name: "Influencer layover", desc: "A mega-influencer livestreams from {X} arrivals — fans book the next flight in." },
  { kind: "both", airport: "any", mult: 0.4, days: [1, 1], cd: 110, rare: true,
    name: "Escape-room on taxiway", desc: "A pop-up escape room blocked a taxiway at {X}. Nobody has the code." },
  { kind: "pax", airport: "leisure", mult: 1.7, days: [1, 2], cd: 100, rare: true,
    name: "Free ice-cream day", desc: "{X} tourism board is giving away ice cream at the terminal. Chaos. Delightful chaos." },
  { kind: "both", airport: "any", mult: 0.55, days: [1, 1], cd: 95, rare: true,
    name: "Drone wedding", desc: "Someone proposed with 200 drones over {X}. Tower is… negotiating." },
  { kind: "pax", airport: "any", mult: 1.4, days: [1, 2], cd: 90, rare: true,
    name: "Mascot convention", desc: "Hundreds of costumed mascots converge on {X}. The group photos are magnificent." },
  { kind: "used", typeId: "a3", count: [2, 5], days: [3, 5], cd: 120, rare: true,
    name: "A3 fleet clear-out",
    desc: "A boutique carrier is dumping its Aerobus A3 stubs — short, stubby, and somehow still airborne." },
];

function genWorldEvent(silent) {
  const s = G.state;
  if (s.events.length >= EVENT_MAX) return;
  if (!s.eventCooldowns) s.eventCooldowns = {};
  for (let tries = 0; tries < 12; tries++) {
    const tpl = EVENT_TPL[Math.floor(Math.random() * EVENT_TPL.length)];
    const tplKey = tpl.name;                                          // stable id for cooldown / uniqueness
    if (tpl.rare && Math.random() > 0.2) continue;                     // the weird stuff stays rare
    if (s.events.some(e => (e.tplKey || e.name) === tplKey)) continue; // never twice at once
    if ((s.eventCooldowns[tplKey] || 0) > s.gameMin) continue;        // recently happened
    // Fleet-retirement floods — freighters may list before cargo unlock
    // (buying still needs the cargo desk); VIP jets stay charter-gated.
    let floodType = null;
    if (tpl.kind === "used") {
      floodType = aircraftById[tpl.typeId];
      if (!floodType || floodType.noUsed) continue;
      if (floodType.charterSpec && !s.charterUnlocked) continue;
    }
    // Name a real competitor when a rival is grounded
    let rivalName = null, rivalId = null;
    if (tpl.rival) {
      const rivals = s.rivals || [];
      if (!rivals.length) continue;
      const pick = rivals[Math.floor(Math.random() * rivals.length)];
      rivalName = pick.name;
      rivalId = pick.id;
    }
    const ev = {
      id: (s.eventId = (s.eventId || 0) + 1),
      kind: tpl.kind,
      mult: tpl.mult != null ? tpl.mult : 1,
      name: rivalName ? `${rivalName} grounded` : tpl.name,
      tplKey,
    };
    if (tpl.global) ev.global = true;
    if (rivalName) { ev.rival = rivalName; ev.rivalId = rivalId; }
    if (tpl.kind === "campaign") {
      ev.campId = tpl.campId;
      if (tpl.campEffect) ev.campEffect = tpl.campEffect;
      if (tpl.campCost) ev.campCost = tpl.campCost;
    }
    let where = "";
    if (tpl.airport) {
      const pool = Array.isArray(tpl.airport) ? AIRPORTS.filter(a => tpl.airport.includes(a.code))
        : tpl.airport === "leisure" ? AIRPORTS.filter(a => LEISURE.includes(a.code))
        : tpl.airport === "big" ? AIRPORTS.filter(a => a.size >= 8)
        : tpl.airport === "north" ? AIRPORTS.filter(a => a.lat > 45)
        : AIRPORTS;
      if (!pool.length) continue;
      const ap = pool[Math.floor(Math.random() * pool.length)];
      ev.airport = ap.code;
      where = `${ap.city} (${ap.code})`;
    } else if (tpl.country) {
      const c = tpl.country === "any"
        ? AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)].country
        : tpl.country[Math.floor(Math.random() * tpl.country.length)];
      ev.country = c;
      where = c;
    }
    ev.desc = tpl.desc.replace("{X}", where).replace("{R}", rivalName || "A competitor");
    const days = tpl.days[0] + Math.random() * (tpl.days[1] - tpl.days[0]);
    ev.until = s.gameMin + Math.round(days * 1440);
    s.eventCooldowns[tplKey] = ev.until + (tpl.cd || 15) * 1440;
    if (tpl.kind === "used" && floodType) {
      const lo = tpl.count[0], hi = tpl.count[1];
      const n = lo + Math.floor(Math.random() * (hi - lo + 1));
      ev.typeId = floodType.id;
      ev.usedCount = n;
      ev.global = true;
      for (let i = 0; i < n; i++) addUsedListing(floodType, { fromEvent: ev.id, retired: true });
    }
    s.events.push(ev);
    s.eventsSpawned = (s.eventsSpawned || 0) + 1;
    if (!silent) {
      let tone = "info";
      if (tpl.kind === "used") tone = "good";
      else if (tpl.kind === "campaign") {
        const up = (ev.campEffect || 1) >= 1 && (ev.campCost || 1) <= 1;
        const down = (ev.campEffect || 1) < 1 || (ev.campCost || 1) > 1;
        tone = up && !down ? "good" : down && !up ? "bad" : "info";
      } else {
        tone = ev.mult >= 1 ? "good" : "bad";
      }
      log(`📰 ${ev.name}: ${ev.desc}`, tone);
    }
    noteWeek("news", ev.name, ev.desc);
    return;
  }
}

// Demand multiplier from active events for a specific city pair
function eventDemandMult(a, b, cargo) {
  let m = 1;
  for (const ev of (G.state.events || [])) {
    if (ev.kind === "fuel" || ev.kind === "co2" || ev.kind === "used" || ev.kind === "campaign") continue;
    if (ev.kind === "pax" && cargo) continue;
    if (ev.kind === "cargo" && !cargo) continue;
    const hit = ev.global ? true
      : ev.airport
        ? (a.code === ev.airport || b.code === ev.airport)
        : ev.country
          ? (a.country === ev.country || b.country === ev.country)
          : false;
    if (hit) m *= ev.mult;
  }
  return m;
}

function eventPriceMult(kind) {
  let m = 1;
  for (const ev of (G.state.events || [])) if (ev.kind === kind) m *= ev.mult;
  return m;
}

// Onboard experience: buy meal stock at `cost`, sell onboard at `sell`.
// Unsold leftovers that expire are a sunk loss (already paid at purchase).
// Active catering also nudges route demand (and a little reputation when served).
const MEALS = [
  { id: "none",    name: "No service",      cost: 0,  sell: 0,  boost: -0.05, rep: 0,
    desc: "No catering at all. Passengers notice." },
  { id: "snack",   name: "Snack & drink",   cost: 3,  sell: 9,  boost: 0.03, rep: 0.01,
    desc: "A pretzel, a soft drink, a smile." },
  { id: "hot",     name: "Hot meal",        cost: 8,  sell: 22, boost: 0.06, rep: 0.025,
    desc: "A proper tray with a choice of mains." },
  { id: "gourmet", name: "Gourmet menu",    cost: 18, sell: 48, boost: 0.10, rep: 0.04,
    desc: "Chef-designed courses on real crockery." },
];

const AMENITY_COST = 4;    // $/pax — kits: eye mask, socks, toothbrush (+3% demand)
const AMENITY_BOOST = 0.03;
const MODELS_COST = 1.5;   // $/pax — die-cast model planes for kids (+2% demand)
const MODELS_BOOST = 0.02;

function mealOf(id) {
  return MEALS.find(m => m.id === id) || MEALS[1];
}

// Catering is bought as stock for a limited window; sold meals earn `sell`,
// unsold stock is wasted when the window ends (purchase cost already spent).
const CATERING_HOURS = [4, 8, 12, 24, 48, 168, 720];   // up to 1 week / 1 month

function cateringActive() {
  const c = G.state.catering;
  return c && c.until > G.state.gameMin && c.qty > 0 ? c : null;
}

function discardCatering(qty, tier, reason, silent) {
  if (qty <= 0) return 0;
  const meal = mealOf(tier);
  const sunk = Math.round(qty * meal.cost);
  if (!silent) {
    log(`🗑 ${fmtNum(qty)} ${meal.name.toLowerCase()}s ${reason} — ${fmtMoney(sunk)} of stock wasted.`, "bad");
  }
  return sunk;
}

function buyCatering(tier, qty, hours) {
  G.err = null;
  const s = G.state;
  const meal = MEALS.find(m => m.id === tier);
  if (!meal || !meal.sell) { G.err = "Pick a meal tier."; return false; }
  if (!mealUnlocked(tier)) { G.err = "Your chefs aren't trained for that menu yet."; return false; }
  if (!CATERING_HOURS.includes(+hours)) { G.err = "Pick a duration."; return false; }
  qty = Math.floor(+qty || 0);
  if (qty < 1) { G.err = "How many meals?"; return false; }
  const cost = meal.cost * qty;
  if (s.cash < cost) { G.err = `${fmtNum(qty)} ${meal.name.toLowerCase()}s cost ${fmtMoney(cost)}.`; return false; }
  s.cash -= cost;
  s.totCost += cost;
  finTrack("exp", "Catering", cost);
  if (s.catering && s.catering.tier === tier && s.catering.until > s.gameMin) {
    s.catering.qty += qty;
    s.catering.until = s.gameMin + hours * 60;
  } else {
    if (s.catering && s.catering.qty > 0 && s.catering.until > s.gameMin) {
      discardCatering(s.catering.qty, s.catering.tier, "scrapped when you switched menus", false);
    }
    s.catering = { tier, qty, until: s.gameMin + hours * 60 };
  }
  log(`🍽 Bought ${fmtNum(qty)} ${meal.name.toLowerCase()}s for ${fmtMoney(cost)} (sell ${fmtMoney(meal.sell)} each) — fresh for ${fmtDur(hours * 60)}.`, "good");
  save();
  return true;
}

// rough daily pax across the routed passenger fleet, for sizing purchases
function fleetDailyPaxEstimate() {
  let pax = 0;
  for (const p of G.state.planes) {
    if (!p.route) continue;
    const t = aircraftById[p.typeId];
    if (t.tons) continue;
    const d = routeTotalDist(p.route);
    const legMin = d / planeSpeed(p) * 60 + 25;
    const rtMin = 2 * (legMin + TURNAROUND_MIN);
    pax += (p.cabin ? cabinPax(p.cabin) : t.seats) * 2 * (1440 / rtMin) * 0.8;
  }
  return Math.round(pax);
}

function serviceCostPerPax() {
  const sv = G.state.service || {};
  return (sv.amenities ? AMENITY_COST : 0) + (sv.models ? MODELS_COST : 0);
}

function serviceBoost() {
  const sv = G.state.service || {};
  const cat = cateringActive();
  return 1 + (cat ? mealOf(cat.tier).boost : MEALS[0].boost) +
    (sv.amenities ? AMENITY_BOOST : 0) +
    (sv.models ? MODELS_BOOST : 0);
}

function setMeal(id) {
  if (!MEALS.some(m => m.id === id)) return false;
  if (!mealUnlocked(id)) { G.err = "Your chefs aren't trained for that menu yet."; return false; }
  G.state.service.meal = id;
  log(`Inflight catering set to "${mealOf(id).name}".`, "info");
  save();
  return true;
}

function toggleAmenity() {
  const sv = G.state.service;
  sv.amenities = !sv.amenities;
  log(sv.amenities ? "Amenity kits now handed out on every flight." : "Amenity kits discontinued.", "info");
  save();
}

function toggleModels() {
  const sv = G.state.service;
  sv.models = !sv.models;
  log(sv.models ? "Die-cast models of your fleet are now sold onboard." : "Onboard model plane sales ended.", "info");
  save();
}

function setSignatureDish(text) {
  G.state.service.dish = String(text || "").slice(0, 40);
  save();
}

// All campaign prices are a fraction of current cash. Rep tiers climb with cost:
// social → press → credit → eco → celebrity. Demand ads (TV / global) sit beside them.
const CAMPAIGNS = [
  { id: "tv", name: "TV & Radio Campaign", costFrac: 1 / 350, boost: 0.30, hours: 36,
    desc: "Prime-time spots in your key markets." },
  { id: "global", name: "Global Sponsorship", costFrac: 1 / 100, boost: 0.50, hours: 72,
    desc: "Stadium naming rights and worldwide brand deals." },
  // Reputation campaigns: temporary lift on top of the slow base stat.
  { id: "social", name: "Social Media Campaign", costFrac: 1 / 800, repBoost: 5, hours: 24,
    desc: "A sharp push across social platforms — cheap buzz, modest lift." },
  { id: "press", name: "Press & PR Tour", costFrac: 1 / 600, repBoost: 8, hours: 12,
    desc: "A flurry of favourable press briefly lifts your public image." },
  { id: "credit", name: "Credit Card Partner", costFrac: 1 / 400, repBoost: 12, hours: 24,
    desc: "Partner with a major credit card so passengers earn rewards on every trip." },
  { id: "eco", name: "Eco Friendly Push", costFrac: 1 / 200, repBoost: 25, hours: 48, easyOnly: true,
    desc: "Green branding and carbon pledges — a big temporary reputation bump." },
  { id: "celeb", name: "Celebrity Endorsement", costFrac: 1 / 150, repBoost: 30, hours: 48,
    desc: "A famous face fronts your airline — expensive, loud, and hard to ignore." },
];

const CAMPAIGN_ID_ALIAS = { awards: "credit", loyalty: "celeb" };

function campaignDef(id) {
  const key = CAMPAIGN_ID_ALIAS[id] || id;
  return CAMPAIGNS.find(x => x.id === key) || null;
}

// Marketing and lounge costs scale with fleet size so they stay a meaningful
// expense as the airline grows. `per` tunes how quickly (bigger = gentler):
// fleet 60 → ×5 at per=15, ×2.5 at per=40.
function fleetCostMult(per) {
  return 1 + (G.state.planes || []).length / per;
}

// Rare world events can nudge a campaign's launch price or its live effect.
function campaignEventMult(campId, field) {
  let m = 1;
  const key = CAMPAIGN_ID_ALIAS[campId] || campId;
  for (const ev of (G.state.events || [])) {
    if (ev.kind !== "campaign") continue;
    if ((CAMPAIGN_ID_ALIAS[ev.campId] || ev.campId) !== key) continue;
    if (field === "cost" && ev.campCost) m *= ev.campCost;
    if (field === "effect" && ev.campEffect) m *= ev.campEffect;
  }
  return m;
}

// Fraction of cash, Easy marketing discount, optional event cost nudge.
function campaignCost(c) {
  const frac = c.costFrac || 0;
  const raw = Math.max(5e3, (G.state.cash || 0) * frac * difficultyOf().campaignMult * campaignEventMult(c.id, "cost"));
  const step = raw >= 1e6 ? 1e4 : 1e3;
  return Math.max(5e3, Math.round(raw / step) * step);
}

function campaignAvailable(c) {
  return !c.easyOnly || isEasy();
}

function campaignEffectRep(def) {
  if (!def || !def.repBoost) return 0;
  return Math.round(def.repBoost * campaignEventMult(def.id, "effect"));
}

function campaignEffectBoost(def) {
  if (!def || !def.boost) return 0;
  return def.boost * campaignEventMult(def.id, "effect");
}

// Scaled lounge room price.
function loungeRoomCost(sz) {
  return Math.round(sz.cost * fleetCostMult(40) / 1e5) * 1e5;
}

// Active campaigns can temporarily lift reputation on top of the slow-moving
// base stat (morale, maintenance and training all still drive s.reputation).
function repCampaignBoost() {
  const s = G.state;
  let b = 0;
  for (const c of s.campaigns) {
    if (c.until <= s.gameMin) continue;
    b += campaignEffectRep(campaignDef(c.id));
  }
  return b;
}
function effReputation() {
  return Math.max(0, Math.min(100, G.state.reputation + repCampaignBoost()));
}

// point sinks
const TANK_UPGRADE_PTS = [25, 60, 150, 400, 1000];  // cost per tank tier
const FUEL_CAP_BASE = 5000e3;                        // kg (5,000 t)
const CO2_CAP_BASE = 5000e3;                         // kg (5,000 t)
const CARGO_UNLOCK_PTS = 150;

// staff: auto-hired with each aircraft. Pay is one company-wide lever
// (payMult); morale chases a target set by pay generosity and slowly
// drags reputation up or down.
const PILOT_BASE_PAY = 2500;   // $/day per pilot at market rate
const CREW_BASE_PAY = 600;     // $/day per cabin crew member
const MECH_BASE_PAY = 1500;    // $/day per maintenance engineer
const MECH_COVERAGE = 4;       // aircraft one engineer can look after

function staffNeeds(t, cabin) {
  if (t.tons) return { pilots: t.tons > 60 ? 6 : 4, crew: 0 };
  const seats = cabin ? cabinPax(cabin) : t.seats;
  if (t.cat === "Light" || t.cat === "Charter" || seats < 30) {
    return { pilots: 2, crew: Math.max(1, Math.ceil(seats / 20)) };
  }
  return { pilots: t.cat === "Widebody" ? 8 : 4, crew: Math.ceil(seats / 20) };
}

// Volume pricing tiers for bulk aircraft orders
function bulkDiscount(qty) {
  if (qty >= 20) return 0.10;
  if (qty >= 10) return 0.07;
  if (qty >= 5) return 0.045;
  if (qty >= 3) return 0.02;
  return 0;
}

function leaseDailyCost(t, engineId) {
  return planeListPrice(t, engineId) * LEASE_MONTHLY_RATE / 30;
}

function leaseDeposit(t, engineId) {
  return Math.round(planeListPrice(t, engineId) * LEASE_DEPOSIT_RATE);
}

function safetyFine(t) {
  return Math.round(t.price * 0.08 + 2e6);
}

function engineOf(id) {
  return ENGINES[id] || ENGINES.std;
}

function planeListPrice(t, engineId) {
  let price = Math.round(t.price * engineOf(engineId).costMult * planePriceMult(t));
  // Hard floor: factory-new must never undercut a mint used listing
  // (usedPriceOf at 0h / 0% wear ≈ 70% of factory list).
  const floor = usedPriceOf(t, 0, 0) + 1e5;
  if (price < floor) price = floor;
  return price;
}

// older engines emit more CO2 per kg of fuel burned
function typeCO2(t) { return CO2_PER_KG_FUEL * (t.co2Mult || 1); }

// Departures are never held for CO₂ — overdraft is allowed, but regulators
// hammer reputation every time you fly deeper into the red.
const CO2_OVERDRAFT_REP = 5;

function burnCO2Quota(needKg, silent, who) {
  const s = G.state;
  const overdraft = s.co2 < needKg;
  s.co2 -= needKg;
  if (overdraft) {
    s.reputation = Math.max(0, s.reputation - CO2_OVERDRAFT_REP);
    if (!silent) {
      log(`🌍 ${who || "A flight"} flew without enough CO₂ quota (${fmtNum(s.co2 / 1000)} t) — regulators furious, reputation −${CO2_OVERDRAFT_REP}.`, "bad");
    }
  }
  return overdraft;
}

/** CO₂ (kg) the next ready/hold leg would burn — used for overrun warnings. */
function nextLegCO2(p) {
  if (!p || !p.route) return 0;
  const t = aircraftById[p.typeId];
  const path = routePath(p);
  const i = p.segIdx || 0;
  const a = airportByCode[path[i]], b = airportByCode[path[i + 1]];
  if (!a || !b) return 0;
  return planeBurn(p) * distKm(a, b) * typeCO2(t);
}

function wouldOverdraftCO2(p) {
  return G.state.co2 < nextLegCO2(p);
}

function planeBurn(p) {
  return aircraftById[p.typeId].burn * engineOf(p.engine).burnMult;
}

function planeSpeed(p) {
  return aircraftById[p.typeId].speed * engineOf(p.engine).speedMult;
}

function cabinUnits(c) {
  if (!c) return 0;
  return (c.F || 0) * CABIN_SPACE.F + (c.J || 0) * CABIN_SPACE.J + (c.Y || 0) * CABIN_SPACE.Y;
}

function cabinPax(c) {
  if (!c) return 0;
  return (c.F || 0) + (c.J || 0) + (c.Y || 0);
}

function clampCabin(t, cabin) {
  let F = Math.max(0, Math.floor(+cabin.F || 0));
  let J = Math.max(0, Math.floor(+cabin.J || 0));
  let Y = Math.max(0, Math.floor(+cabin.Y || 0));
  // Fit into economy-equivalent capacity by trimming Y, then J, then F
  while (cabinUnits({ F, J, Y }) > t.seats && Y > 0) Y--;
  while (cabinUnits({ F, J, Y }) > t.seats && J > 0) J--;
  while (cabinUnits({ F, J, Y }) > t.seats && F > 0) F--;
  return { F, J, Y };
}

function defaultCabin(t) {
  if (!t || t.tons) return null;
  const max = t.seats;
  if (t.cat === "Light") return { F: 0, J: 0, Y: max };
  // VIP cabins lean club / business rather than dense economy
  if (t.cat === "Charter") {
    const j = Math.max(1, Math.floor(max / CABIN_SPACE.J));
    return { F: 0, J: j, Y: Math.max(0, max - j * CABIN_SPACE.J) };
  }
  if (t.cat === "Regional") {
    const j = Math.min(12, Math.floor(max / 14));
    const used = j * CABIN_SPACE.J;
    return { F: 0, J: j, Y: Math.max(0, max - used) };
  }
  const f = Math.max(0, Math.floor(max / 45));
  const j = Math.max(0, Math.floor(max / 10));
  const used = f * CABIN_SPACE.F + j * CABIN_SPACE.J;
  return { F: f, J: j, Y: Math.max(0, max - used) };
}

function cabinValid(t, cabin) {
  if (t.tons) return !cabin;
  return cabin && cabinUnits(cabin) <= t.seats && cabinPax(cabin) > 0;
}

// ---------------- VIP charter cabin furniture (cosmetic) ----------------
// Club layout pieces for charterSpec jets. Space budget = type.seats;
// beds/couches are gated by airframe size so a Citation can't grow a bedroom.
const CHARTER_FURN = {
  seats:   { id: "seats",   name: "Club seats", space: 1 },
  tables:  { id: "tables",  name: "Tables",     space: 2 },
  couches: { id: "couches", name: "Couches",    space: 3 },
  beds:    { id: "beds",    name: "Beds",       space: 5 },
};

function charterLayoutCaps(t) {
  const s = t && t.seats || 0;
  // Phenom / Citation — day cabin only
  if (s <= 10) return { seats: s, tables: 2, couches: 1, beds: 0 };
  // G650 class — one berth if you make room
  if (s <= 16) return { seats: s, tables: 3, couches: 2, beds: 1 };
  // Lineage / A220 charter
  if (s <= 24) return { seats: s, tables: 4, couches: 3, beds: 2 };
  // BBJ narrowbodies
  if (s <= 40) return { seats: s, tables: 5, couches: 4, beds: 3 };
  // Widebody VIP — full suite
  return { seats: s, tables: 6, couches: 6, beds: 4 };
}

function vipLayoutSpace(t) { return (t && t.seats) || 0; }

function vipLayoutUnits(layout) {
  if (!layout) return 0;
  let u = 0;
  for (const k of Object.keys(CHARTER_FURN)) u += (layout[k] || 0) * CHARTER_FURN[k].space;
  return u;
}

function clampVipLayout(t, layout) {
  const caps = charterLayoutCaps(t);
  const out = { seats: 0, tables: 0, couches: 0, beds: 0 };
  for (const k of Object.keys(CHARTER_FURN)) {
    out[k] = Math.max(0, Math.min(caps[k], Math.floor(+(layout && layout[k]) || 0)));
  }
  const order = ["beds", "couches", "tables", "seats"];
  while (vipLayoutUnits(out) > vipLayoutSpace(t)) {
    let trimmed = false;
    for (const k of order) {
      if (out[k] > 0) { out[k]--; trimmed = true; break; }
    }
    if (!trimmed) break;
  }
  return out;
}

function defaultVipLayout(t) {
  if (!t || !t.charterSpec) return null;
  const caps = charterLayoutCaps(t);
  const space = vipLayoutSpace(t);
  const layout = { seats: 0, tables: caps.tables ? 1 : 0, couches: 0, beds: 0 };
  if (caps.couches > 0 && space >= 10) layout.couches = 1;
  const left = space - vipLayoutUnits(layout);
  layout.seats = Math.min(caps.seats, Math.max(2, Math.floor(left / CHARTER_FURN.seats.space)));
  return clampVipLayout(t, layout);
}

function vipLayoutSummary(layout) {
  if (!layout) return "VIP cabin";
  const parts = [];
  if (layout.seats) parts.push(`${layout.seats} seat${layout.seats === 1 ? "" : "s"}`);
  if (layout.tables) parts.push(`${layout.tables} table${layout.tables === 1 ? "" : "s"}`);
  if (layout.couches) parts.push(`${layout.couches} couch${layout.couches === 1 ? "" : "es"}`);
  if (layout.beds) parts.push(`${layout.beds} bed${layout.beds === 1 ? "" : "s"}`);
  return parts.join(" · ") || "open cabin";
}

function cabinFare(cls, d) {
  if (cls === "F") return 840 + 1.65 * d;
  if (cls === "J") return 390 + 0.84 * d;
  return 120 + 0.345 * d;
}

function hangarUsed() {
  const s = G.state;
  return s.planes.length + (s.orders ? s.orders.length : 0);
}

function deliveryMinutes(t) {
  return DELIVERY_MIN[t.cat] || 8 * 60;
}

function setPlaneCabin(id, cabin) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p || p.status === "fly" || p.status === "maint") return false;
  const t = aircraftById[p.typeId];
  if (t.tons) return false;
  const next = clampCabin(t, cabin);
  if (!cabinValid(t, next)) return false;
  const oldNeed = staffNeeds(t, p.cabin);
  const newNeed = staffNeeds(t, next);
  p.cabin = next;
  G.state.staff.pilots = Math.max(0, G.state.staff.pilots - oldNeed.pilots + newNeed.pilots);
  G.state.staff.crew = Math.max(0, G.state.staff.crew - oldNeed.crew + newNeed.crew);
  save();
  return true;
}

function setPlaneHub(id, hubCode) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p || p.status === "fly" || p.status === "maint") return false;
  if (!G.state.hubs.includes(hubCode)) return false;
  if (!isDomestic(hubCode) && hubSlotsUsed(hubCode, p) >= INTL_HUB_SLOTS) {
    G.err = `${hubCode} has no free international hub slots.`;
    return false;
  }
  p.homeHub = hubCode;
  save();
  return true;
}

function setPlaneEngine(id, engineId) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p || p.status === "fly" || p.status === "maint") return false;
  if (!ENGINES[engineId]) return false;
  if (p.engine === engineId) return true;
  const t = aircraftById[p.typeId];
  const oldP = planeListPrice(t, p.engine);
  const newP = planeListPrice(t, engineId);
  const delta = Math.max(0, Math.round((newP - oldP) * (p.leased ? 0.15 : 0.35)));
  if (delta > 0) {
    if (G.state.cash < delta) return false;
    G.state.cash -= delta;
    G.state.totCost += delta;
  }
  p.engine = engineId;
  save();
  return true;
}

// ---------------- brands / subsidiaries ----------------

function makeParentBrand(name) {
  return { id: "main", name: name || "Airline", parent: true, allowedCats: null, nextNum: 1 };
}

function ensureBrands() {
  const s = G.state;
  if (!Array.isArray(s.brands) || !s.brands.length) {
    s.brands = [makeParentBrand(s.airline)];
    s.nextBrandNum = 2;
  }
  // NOTE: inline lookup — brandById() calls ensureBrands(), so calling it
  // from here would recurse forever
  if (!s.activeBrandId || !s.brands.some(b => b.id === s.activeBrandId)) {
    s.activeBrandId = "main";
  }
  const parent = s.brands.find(b => b.parent || b.id === "main");
  if (parent && s.airline) parent.name = s.airline;
  return s.brands;
}

function brandById(id) {
  ensureBrands();
  return G.state.brands.find(b => b.id === id) || G.state.brands[0];
}

function parentBrand() {
  ensureBrands();
  return G.state.brands.find(b => b.parent || b.id === "main") || G.state.brands[0];
}

function brandAllowsType(brand, typeId) {
  const t = aircraftById[typeId];
  if (!t || !brand) return false;
  if (!brand.allowedCats) return true;
  return brand.allowedCats.includes(t.cat);
}

function brandFleetCount(brandId) {
  return G.state.planes.filter(p => (p.brandId || "main") === brandId).length;
}

function brandPrefix(brand) {
  const raw = (brand?.name || "ST").replace(/[^A-Z]/gi, "");
  return (raw.slice(0, 2) || "ST").toUpperCase();
}

function createBrand(name, focusId) {
  G.err = null;
  const s = G.state;
  ensureBrands();
  const children = s.brands.filter(b => !b.parent).length;
  if (children >= MAX_CHILD_BRANDS) {
    G.err = `You can run at most ${MAX_CHILD_BRANDS} subsidiaries.`;
    return false;
  }
  const n = (name || "").trim().slice(0, 28);
  if (n.length < 2) { G.err = "Give the subsidiary a name."; return false; }
  if (s.brands.some(b => b.name.toLowerCase() === n.toLowerCase())) {
    G.err = "That brand name is already used.";
    return false;
  }
  const focus = BRAND_FOCUS[focusId] || BRAND_FOCUS.express;
  if (focus.cats?.includes("Freighter") && !s.cargoUnlocked) {
    G.err = "Unlock cargo operations before founding a cargo subsidiary.";
    return false;
  }
  if (focus.cats?.includes("Charter") && !s.charterUnlocked) {
    G.err = "Open the charter desk (Fleet Management) before founding a VIP charter subsidiary.";
    return false;
  }
  if (s.cash < BRAND_FOUND_COST || s.points < BRAND_FOUND_PTS) {
    G.err = `Founding a subsidiary costs ${fmtMoney(BRAND_FOUND_COST)} and ${BRAND_FOUND_PTS} ⭐.`;
    return false;
  }
  s.cash -= BRAND_FOUND_COST;
  s.totCost += BRAND_FOUND_COST;
  s.points -= BRAND_FOUND_PTS;
  const id = `b${s.nextBrandNum++}`;
  s.brands.push({
    id,
    name: n,
    parent: false,
    allowedCats: focus.cats ? [...focus.cats] : null,
    nextNum: 1,
  });
  log(`Subsidiary founded: ${n} (${focus.label}). Shares your hubs, cash, and staff.`, "good");
  save();
  return id;
}

function renameBrand(brandId, name) {
  const b = brandById(brandId);
  if (!b) return false;
  const n = (name || "").trim().slice(0, 28);
  if (n.length < 2) return false;
  b.name = n;
  if (b.parent || b.id === "main") G.state.airline = n;
  save();
  return true;
}

function dissolveBrand(brandId) {
  G.err = null;
  const s = G.state;
  ensureBrands();
  const b = brandById(brandId);
  if (!b || b.parent || b.id === "main") {
    G.err = "You cannot dissolve the main airline.";
    return false;
  }
  const parent = parentBrand();
  for (const p of s.planes) {
    if ((p.brandId || "main") === brandId) p.brandId = parent.id;
  }
  for (const o of s.orders || []) {
    if ((o.brandId || "main") === brandId) o.brandId = parent.id;
  }
  s.brands = s.brands.filter(x => x.id !== brandId);
  if (s.activeBrandId === brandId) s.activeBrandId = parent.id;
  log(`${b.name} dissolved — fleet transferred to ${parent.name}.`, "info");
  save();
  return true;
}

function setPlaneBrand(id, brandId) {
  G.err = null;
  const p = G.state.planes.find(x => x.id === id);
  if (!p || p.status === "fly" || p.status === "maint") return false;
  const b = brandById(brandId);
  if (!b) return false;
  if (!brandAllowsType(b, p.typeId)) {
    G.err = `${b.name} cannot operate that aircraft type.`;
    return false;
  }
  p.brandId = b.id;
  save();
  return true;
}

function dailyPayroll() {
  const st = G.state.staff;
  // flight-school graduates fly at academy pay (CADET_PAY_MULT of market rate)
  const cadets = Math.min(st.cadets || 0, st.pilots);
  const pilotPay = (st.pilots - cadets) * PILOT_BASE_PAY +
    cadets * PILOT_BASE_PAY * CADET_PAY_MULT;
  return (pilotPay + st.crew * CREW_BASE_PAY +
    (st.mech || 0) * MECH_BASE_PAY) * st.payMult * mgmtPayrollMult();
}

function hireMech() {
  G.state.staff.mech = (G.state.staff.mech || 0) + 1;
  log(`Maintenance engineer hired (${G.state.staff.mech} on staff).`, "info");
  save();
  return true;
}

function fireMech() {
  const st = G.state.staff;
  if (!st.mech) return false;
  st.mech--;
  st.morale = Math.max(0, st.morale - 2);   // layoffs sting a little
  log(`Maintenance engineer released (${st.mech} remain).`, "info");
  save();
  return true;
}

// Auto-repair: engineers service a plane that lands at an owned hub once
// wear crosses the player-set threshold — if the team covers the fleet.
function maybeAutoMaint(p, code, silent) {
  const s = G.state;
  const mech = s.staff.mech || 0;
  if (!mech || s.planes.length > mech * MECH_COVERAGE) return false;
  if (!s.hubs.includes(code)) return false;
  if (p.wear < (s.autoMxPct != null ? s.autoMxPct : 60)) return false;
  const cost = maintCheckCost(aircraftById[p.typeId]);
  if (s.cash < cost) return false;
  s.cash -= cost;
  s.totCost += cost;
  finTrack("exp", "Maintenance", cost);
  p.status = "maint";
  p.timer = MAINT_DURATION_MIN;
  p.groundAfterLand = false;
  if (!silent) log(`🔧 ${p.id} auto-serviced at ${code} by the engineering team (${fmtMoney(cost)}).`, "info");
  return true;
}

function moraleTarget() {
  return Math.max(5, Math.min(100, 50 + (G.state.staff.payMult - 1) * 250));
}

function staffRaise() {
  const st = G.state.staff;
  if (st.payMult >= 1.795) return false;
  st.payMult = Math.round((st.payMult + 0.05) * 100) / 100;
  st.morale = Math.min(100, st.morale + 6);
  log(`Company-wide 5% raise — staff pay now ${Math.round(st.payMult * 100)}% of market rate. Morale up!`, "good");
  save();
  return true;
}

function staffCut() {
  const st = G.state.staff;
  if (st.payMult <= 0.605) return false;
  st.payMult = Math.round((st.payMult - 0.05) * 100) / 100;
  st.morale = Math.max(0, st.morale - 10);
  log(`5% pay cut across the board — staff pay now ${Math.round(st.payMult * 100)}% of market rate. Morale suffers.`, "bad");
  save();
  return true;
}

// hub network: routes must depart from an owned hub. Domestic hubs (same
// country as the home hub) are cheap; international hubs cost ~3x and only
// support a limited number of based aircraft.
const INTL_HUB_SLOTS = 6;
const INTL_HUB_MAX = 10;          // at most 10 international hubs
const HUB_MAX = 30;               // total hub cap, domestic + international

function isDomestic(code) {
  return airportByCode[code].country === airportByCode[G.state.hub].country;
}

// Hub prices track your wealth so an empire can't just buy the map — but
// they fluctuate like a property market (new quote every 12 game hours):
// sometimes ~2/3 of your balance, sometimes more than you have. Patience
// (or poverty) finds the deals. Fixed floors apply when you're broke.
function hubPriceWave(code) {
  // deterministic per airport per 12h window
  const win = Math.floor(G.state.gameMin / 720);
  let h = win * 2654435761 >>> 0;
  for (const ch of code) h = ((h * 31 + ch.charCodeAt(0)) ^ (h >>> 7)) >>> 0;
  return ((h * 9301 + 49297) % 233280) / 233280;      // 0..1
}

function hubCost(code) {
  const ap = airportByCode[code];
  const dom = isDomestic(code);
  const floor = dom ? 12e6 + ap.size * 1.5e6 : 30e6 + ap.size * 4e6;
  const wave = hubPriceWave(code);
  // hubs cost roughly 25–75% of your balance, scaled by airport size and a
  // fluctuating market wave (new quote every 12 game hours).
  const frac = Math.min(0.78, (dom ? 0.25 : 0.38) + wave * 0.22 + ap.size * 0.018);
  return Math.max(floor, Math.round(Math.max(0, G.state.cash) * frac));
}

function intlHubCount() {
  return G.state.hubs.filter(h => h !== G.state.hub && !isDomestic(h)).length;
}

function hubSlotsUsed(code, exceptPlane) {
  const based = G.state.planes.filter(p =>
    p !== exceptPlane && (p.homeHub || G.state.hub) === code).length;
  const onOrder = (G.state.orders || []).filter(o => o.homeHub === code).length;
  return based + onOrder;
}

function buyHub(code) {
  G.err = null;
  const s = G.state;
  if (s.hubs.includes(code)) return false;
  if (s.hubs.length >= HUB_MAX) {
    G.err = `You already operate the maximum of ${HUB_MAX} hubs.`;
    return false;
  }
  if (!isDomestic(code) && intlHubCount() >= INTL_HUB_MAX) {
    G.err = `You already operate the maximum of ${INTL_HUB_MAX} international hubs.`;
    return false;
  }
  const cost = hubCost(code);
  if (s.cash < cost) { G.err = "Not enough cash to open that hub."; return false; }
  s.cash -= cost; s.totCost += cost;
  finTrack("exp", "Hubs & infrastructure", cost);
  s.hubs.push(code);
  // a new base broadens your brand — a small permanent reputation lift
  s.reputation = Math.min(100, s.reputation + 1);
  const kind = isDomestic(code) ? "Domestic" : "International";
  log(`${kind} hub opened at ${code} (${airportByCode[code].city}) for ${fmtMoney(cost)} — reputation +1.`, "good");
  save();
  return true;
}

// hangar expansion: +10 slots per tier, cash or points, built over time
const HANGAR_START = 10;
const HANGAR_STEP = 10;
const hangarTier = () => (G.state.hangarCap - HANGAR_START) / HANGAR_STEP;
const hangarCashCost = () => Math.min(500e6, Math.round(2e6 * Math.pow(1.35, hangarTier()) / 1e5) * 1e5);
const hangarPtsCost = () => Math.min(600, Math.round(40 * Math.pow(1.25, hangarTier())));
const hangarBuildMin = () => 12 * 60 * (hangarTier() + 1);   // game minutes

const LOUNGES = [
  { name: "Standard Lounge",    cost: 4e6, boost: 0.04,
    desc: "Comfortable seating and free coffee at your hub." },
  { name: "Business Lounge",    cost: 14e6,  boost: 0.08,
    desc: "Showers, workspaces and a proper bar." },
  { name: "First Class Terrace", cost: 40e6, boost: 0.12,
    desc: "Fine dining and limousine transfer to the aircraft." },
];

// boost = network-wide demand lift; csBoost = extra demand per alliance
// partner airline flying the same route (codeshare ticket feed, max 2 counted)
const ALLIANCES = [
  { id: "star",   name: "Star Concord",   cost: 10e6, boost: 0.10, csBoost: 0.06, minPts: 50,
    desc: "A friendly regional codeshare pact." },
  { id: "onesky", name: "OneSky Alliance", cost: 25e6, boost: 0.15, csBoost: 0.08, minPts: 150,
    desc: "A global network of mid-size carriers." },
  { id: "aero",   name: "AeroLink Global", cost: 60e6, boost: 0.20, csBoost: 0.10, minPts: 400,
    desc: "The premier alliance of world-class airlines." },
  { id: "paragon", name: "Paragon Circle", cost: 150e6, boost: 0.25, csBoost: 0.15, minPts: 1000,
    desc: "An invitation-only club of the world's most prestigious carriers — the strongest codeshare network in the sky." },
];
const CODESHARE_PARTNER_CAP = 2;   // partners per route that count toward the boost

const LEVELS = [
  { pts: 0,    name: "Startup" },
  { pts: 50,   name: "Regional Carrier" },
  { pts: 150,  name: "National Airline" },
  { pts: 400,  name: "International Airline" },
  { pts: 1000, name: "Global Powerhouse" },
  { pts: 2500, name: "Aviation Legend" },
];

const G = { state: null };

// Finance ledger: cumulative income/expense by category
function finTrack(side, cat, amt) {
  const s = G.state;
  if (!s || !amt) return;
  if (!s.fin) s.fin = { rev: {}, exp: {} };
  const book = side === "rev" ? s.fin.rev : s.fin.exp;
  book[cat] = (book[cat] || 0) + amt;
}

const airportByCode = Object.fromEntries(AIRPORTS.map(a => [a.code, a]));
const aircraftById = Object.fromEntries(AIRCRAFT.map(a => [a.id, a]));

// ---------------- geometry & demand ----------------

function distKm(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * DEG, dLon = (b.lon - a.lon) * DEG;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Mid-ocean / island gateways (HNL, PPT, MLE, …) vanish into open water at
// default zoom. Flag only true island airports — not remote mainland cities.
(function markOceanAirports() {
  const OCEAN_COUNTRIES = new Set([
    "French Polynesia", "Maldives", "Fiji", "Guam", "Samoa", "Tonga",
    "Cook Islands", "Marshall Islands", "Tuvalu", "Vanuatu", "Solomon Islands",
    "Northern Mariana Islands", "New Caledonia", "Seychelles", "Mauritius",
    "Reunion", "Cape Verde", "Bermuda", "American Samoa", "Palau",
    "Micronesia", "Kiribati", "Wallis and Futuna", "Niue", "Nauru",
  ]);
  // Hawaii + Easter Island etc. (country label is mainland)
  const OCEAN_CODES = new Set([
    "HNL", "OGG", "LIH", "KOA", "ITO", "MDY", "PPG", "CXI", "AWK", "IPC",
  ]);
  for (const ap of AIRPORTS) {
    ap.ocean = OCEAN_CODES.has(ap.code) || OCEAN_COUNTRIES.has(ap.country);
  }
})();

// ---------------- route slot fees ----------------
// Slot + parking rights for a new route: busier pairs cost more.
function routeSlotFee(fromCode, toCode) {
  const a = airportByCode[fromCode], b = airportByCode[toCode];
  const dem = routeDemand(a, b) + cargoDemand(a, b) * 3;
  return Math.round((25000 + dem * 220) / 1000) * 1000;
}

// ---------------- rival airlines ----------------
// A big database of carriers — real-world names plus the classic fictional
// roster. Each has a home country and fortress hub(s); reach controls how far
// it flies. dominance (0–1) is how tightly it locks down its home market.
// alliance: which codeshare alliance the carrier belongs to (null = independent)
// tier: "major" (flag carriers), "mid" (national airlines), "regional" (LCCs & locals)
const AIRLINE_DB = [
  // ---- fictional worldwide carriers (always seeded) ----
  { name: "Global Air",            country: "International", hubs: ["JFK", "LHR", "DXB", "SIN"], reach: "global", fleet: 48, rep: 72, dominance: 0.55, alliance: null,      tier: "global", anywhere: true },
  { name: "Apex World Airways",    country: "International", hubs: ["LAX", "FRA", "NRT", "GRU"], reach: "global", fleet: 44, rep: 70, dominance: 0.52, alliance: "aero",    tier: "global", anywhere: true },
  { name: "Horizon International", country: "International", hubs: ["CDG", "HKG", "SYD", "ORD"], reach: "global", fleet: 42, rep: 68, dominance: 0.50, alliance: "star",    tier: "global", anywhere: true },
  { name: "Atlas Skylines",        country: "International", hubs: ["AMS", "ICN", "MIA", "DEL"], reach: "global", fleet: 40, rep: 66, dominance: 0.48, alliance: "onesky",  tier: "global", anywhere: true },
  { name: "Meridian Airways",      country: "International", hubs: ["DOH", "SFO", "BKK", "MAD"], reach: "global", fleet: 38, rep: 65, dominance: 0.46, alliance: "paragon", tier: "global", anywhere: true },

  // ---- majors: the global flag carriers ----
  { name: "Betla Air Lines",      country: "USA",          hubs: ["ATL", "DTW", "MSP"], reach: "global",   fleet: 58, rep: 78, dominance: 0.78, alliance: "aero",    tier: "major" },
  { name: "Untied Airlines",      country: "USA",          hubs: ["ORD", "DEN", "SFO"], reach: "global",   fleet: 56, rep: 74, dominance: 0.74, alliance: "star",    tier: "major" },
  { name: "Americano Airlines",    country: "USA",          hubs: ["DFW", "CLT", "MIA"], reach: "global",   fleet: 57, rep: 71, dominance: 0.74, alliance: "onesky",  tier: "major" },
  { name: "Air Canadian",           country: "Canada",       hubs: ["YYZ", "YVR", "YUL"], reach: "global",   fleet: 46, rep: 75, dominance: 0.82, alliance: "star",    tier: "major" },
  { name: "Brutish Airways",      country: "UK",           hubs: ["LHR", "LGW"],        reach: "global",   fleet: 50, rep: 76, dominance: 0.72, alliance: "onesky",  tier: "major" },
  { name: "Lufthansen",            country: "Germany",      hubs: ["FRA", "MUC"],        reach: "global",   fleet: 52, rep: 77, dominance: 0.72, alliance: "star",    tier: "major" },
  { name: "Air Franse",           country: "France",       hubs: ["CDG", "ORY"],        reach: "global",   fleet: 48, rep: 74, dominance: 0.70, alliance: "aero",    tier: "major" },
  { name: "KLN",                  country: "Netherlands",  hubs: ["AMS"],               reach: "global",   fleet: 44, rep: 75, dominance: 0.76, alliance: "aero",    tier: "major" },
  { name: "Emirats",             country: "UAE",          hubs: ["DXB"],               reach: "global",   fleet: 55, rep: 90, dominance: 0.90, alliance: "paragon", tier: "major" },
  { name: "Quatar Airways",        country: "Qatar",        hubs: ["DOH"],               reach: "global",   fleet: 50, rep: 89, dominance: 0.88, alliance: "paragon", tier: "major" },
  { name: "Singaporean Airlines",   country: "Singapore",    hubs: ["SIN"],               reach: "global",   fleet: 44, rep: 88, dominance: 0.86, alliance: "paragon", tier: "major" },
  { name: "Cathbay Pacific",       country: "Hong Kong",    hubs: ["HKG"],               reach: "global",   fleet: 42, rep: 80, dominance: 0.84, alliance: "onesky",  tier: "major" },
  { name: "ANNA All Nippon",       country: "Japan",        hubs: ["HND", "NRT"],        reach: "global",   fleet: 48, rep: 82, dominance: 0.74, alliance: "star",    tier: "major" },
  { name: "Japon Airlines",       country: "Japan",        hubs: ["HND", "NRT"],        reach: "global",   fleet: 44, rep: 80, dominance: 0.70, alliance: "onesky",  tier: "major" },
  { name: "Quantas",               country: "Australia",    hubs: ["SYD", "MEL"],        reach: "global",   fleet: 42, rep: 79, dominance: 0.82, alliance: "onesky",  tier: "major" },
  { name: "Turkic Airlines",     country: "Türkiye",      hubs: ["IST"],               reach: "global",   fleet: 52, rep: 78, dominance: 0.84, alliance: "star",    tier: "major" },
  { name: "Koreana Air",           country: "South Korea",  hubs: ["ICN"],               reach: "global",   fleet: 42, rep: 76, dominance: 0.80, alliance: "aero",    tier: "major" },
  { name: "Air Chana",            country: "China",        hubs: ["PEK", "CTU"],        reach: "global",   fleet: 50, rep: 66, dominance: 0.80, alliance: "star",    tier: "major" },
  { name: "Sino Southern",       country: "China",        hubs: ["CAN", "SZX"],        reach: "global",   fleet: 52, rep: 64, dominance: 0.80, alliance: "aero",    tier: "major" },
  { name: "Sino Eastern",        country: "China",        hubs: ["PVG", "KMG"],        reach: "global",   fleet: 50, rep: 63, dominance: 0.78, alliance: "aero",    tier: "major" },
  { name: "Ethiopean Airlines",   country: "Ethiopia",     hubs: ["ADD"],               reach: "global",   fleet: 40, rep: 72, dominance: 0.84, alliance: "star",    tier: "major" },
  { name: "IndiGlo",               country: "India",        hubs: ["DEL", "BLR", "HYD"], reach: "regional", fleet: 52, rep: 62, dominance: 0.78, alliance: null,      tier: "major" },
  { name: "Hainam Airlines",      country: "China",        hubs: ["PEK", "XIY"],        reach: "global",   fleet: 42, rep: 68, dominance: 0.66, alliance: null,      tier: "major" },

  // ---- mid-size: national airlines & strong internationals ----
  { name: "Swizz Intl Air Lines", country: "Switzerland",  hubs: ["ZRH", "GVA"],        reach: "global",   fleet: 32, rep: 78, dominance: 0.74, alliance: "star",    tier: "mid" },
  { name: "Ibera",               country: "Spain",        hubs: ["MAD"],               reach: "global",   fleet: 34, rep: 68, dominance: 0.68, alliance: "onesky",  tier: "mid" },
  { name: "TOP Air Portugal",     country: "Portugal",     hubs: ["LIS", "OPO"],        reach: "regional", fleet: 28, rep: 64, dominance: 0.72, alliance: "star",    tier: "mid" },
  { name: "Finnaire",              country: "Finland",      hubs: ["HEL"],               reach: "regional", fleet: 26, rep: 70, dominance: 0.76, alliance: "onesky",  tier: "mid" },
  { name: "SAZ Scandinavian",     country: "Denmark",      hubs: ["CPH", "ARN", "OSL"], reach: "regional", fleet: 30, rep: 67, dominance: 0.70, alliance: "star",    tier: "mid" },
  { name: "ITL Airways",          country: "Italy",        hubs: ["FCO", "MXP"],        reach: "regional", fleet: 28, rep: 62, dominance: 0.64, alliance: "aero",    tier: "mid" },
  { name: "Austrean Airlines",    country: "Austria",      hubs: ["VIE"],               reach: "regional", fleet: 24, rep: 69, dominance: 0.74, alliance: "star",    tier: "mid" },
  { name: "LOTT Polish Airlines",  country: "Poland",       hubs: ["WAW", "KRK"],        reach: "regional", fleet: 24, rep: 63, dominance: 0.72, alliance: "star",    tier: "mid" },
  { name: "Aeroflotte",             country: "Russia",       hubs: ["SVO", "LED"],        reach: "regional", fleet: 34, rep: 55, dominance: 0.80, alliance: null,      tier: "mid" },
  { name: "Saudera",               country: "Saudi Arabia", hubs: ["JED", "RUH"],        reach: "global",   fleet: 34, rep: 66, dominance: 0.80, alliance: "aero",    tier: "mid" },
  { name: "Etihard Airways",       country: "UAE",          hubs: ["AUH"],               reach: "global",   fleet: 34, rep: 84, dominance: 0.78, alliance: "paragon", tier: "mid" },
  { name: "El Alto",                country: "Israel",       hubs: ["TLV"],               reach: "regional", fleet: 22, rep: 68, dominance: 0.82, alliance: null,      tier: "mid" },
  { name: "EgyptAero",             country: "Egypt",        hubs: ["CAI"],               reach: "regional", fleet: 28, rep: 58, dominance: 0.78, alliance: "star",    tier: "mid" },
  { name: "Royal Air Marok",      country: "Morocco",      hubs: ["CMN", "RAK"],        reach: "regional", fleet: 24, rep: 60, dominance: 0.76, alliance: "onesky",  tier: "mid" },
  { name: "Kenyon Airways",        country: "Kenya",        hubs: ["NBO"],               reach: "regional", fleet: 22, rep: 57, dominance: 0.74, alliance: "aero",    tier: "mid" },
  { name: "South Afrikan Airways", country: "South Africa", hubs: ["JNB", "CPT"],       reach: "regional", fleet: 24, rep: 56, dominance: 0.72, alliance: "star",    tier: "mid" },
  { name: "Air Indya",            country: "India",        hubs: ["DEL", "BOM"],        reach: "global",   fleet: 36, rep: 60, dominance: 0.74, alliance: "star",    tier: "mid" },
  { name: "Tai Airways",         country: "Thailand",     hubs: ["BKK", "HKT"],        reach: "regional", fleet: 30, rep: 68, dominance: 0.78, alliance: "star",    tier: "mid" },
  { name: "Vietnem Airlines",     country: "Vietnam",      hubs: ["SGN", "HAN"],        reach: "regional", fleet: 28, rep: 64, dominance: 0.80, alliance: "aero",    tier: "mid" },
  { name: "Garuba Indonesia",     country: "Indonesia",    hubs: ["CGK", "DPS"],        reach: "regional", fleet: 26, rep: 63, dominance: 0.78, alliance: "aero",    tier: "mid" },
  { name: "Malaysean Airlines",    country: "Malaysia",     hubs: ["KUL"],               reach: "regional", fleet: 26, rep: 65, dominance: 0.76, alliance: "onesky",  tier: "mid" },
  { name: "Philippene Airlines",  country: "Philippines",  hubs: ["MNL", "CEB"],        reach: "regional", fleet: 24, rep: 60, dominance: 0.76, alliance: null,      tier: "mid" },
  { name: "EVE Air",              country: "Taiwan",       hubs: ["TPE"],               reach: "global",   fleet: 30, rep: 78, dominance: 0.72, alliance: "star",    tier: "mid" },
  { name: "Chuna Airlines",       country: "Taiwan",       hubs: ["TPE"],               reach: "global",   fleet: 28, rep: 70, dominance: 0.70, alliance: "aero",    tier: "mid" },
  { name: "Asianna Airlines",      country: "South Korea",  hubs: ["ICN", "PUS"],        reach: "regional", fleet: 26, rep: 70, dominance: 0.68, alliance: "star",    tier: "mid" },
  { name: "Air New Zeeland",      country: "New Zealand",  hubs: ["AKL", "CHC"],        reach: "global",   fleet: 26, rep: 79, dominance: 0.86, alliance: "star",    tier: "mid" },
  { name: "LATEM Airlines",       country: "Chile",        hubs: ["SCL", "GRU", "LIM"], reach: "regional", fleet: 34, rep: 66, dominance: 0.76, alliance: null,      tier: "mid" },
  { name: "Avianka",              country: "Colombia",     hubs: ["BOG"],               reach: "regional", fleet: 26, rep: 60, dominance: 0.76, alliance: "star",    tier: "mid" },
  { name: "Aeroméxica",           country: "Mexico",       hubs: ["MEX"],               reach: "regional", fleet: 26, rep: 63, dominance: 0.74, alliance: "aero",    tier: "mid" },
  { name: "Copra Airlines",        country: "Panama",       hubs: ["PTY"],               reach: "regional", fleet: 26, rep: 68, dominance: 0.84, alliance: "star",    tier: "mid" },
  { name: "Icelandaire",           country: "Iceland",      hubs: ["KEF"],               reach: "regional", fleet: 22, rep: 66, dominance: 0.86, alliance: null,      tier: "mid" },
  { name: "Hawaiiana Airlines",    country: "USA",          hubs: ["HNL", "OGG"],        reach: "regional", fleet: 24, rep: 70, dominance: 0.80, alliance: null,      tier: "mid" },
  { name: "Southbest Airlines",   country: "USA",          hubs: ["PHX", "LAS", "MCO"], reach: "regional", fleet: 38, rep: 70, dominance: 0.66, alliance: null,      tier: "mid" },
  { name: "Ryunair",              country: "Ireland",      hubs: ["DUB", "STN"],        reach: "regional", fleet: 38, rep: 55, dominance: 0.62, alliance: null,      tier: "mid" },
  { name: "Virgen Australia",     country: "Australia",    hubs: ["BNE", "SYD"],        reach: "regional", fleet: 24, rep: 64, dominance: 0.62, alliance: null,      tier: "mid" },
  { name: "Virgen Atlantic",      country: "UK",           hubs: ["LHR", "MAN"],        reach: "global",   fleet: 26, rep: 75, dominance: 0.56, alliance: "aero",    tier: "mid" },
  { name: "Aer Lingo",           country: "Ireland",      hubs: ["DUB"],               reach: "regional", fleet: 24, rep: 68, dominance: 0.72, alliance: null,      tier: "mid" },
  { name: "Brussel Airlines",    country: "Belgium",      hubs: ["BRU"],               reach: "regional", fleet: 22, rep: 66, dominance: 0.74, alliance: "star",    tier: "mid" },
  { name: "Aegeon Airlines",      country: "Greece",       hubs: ["ATH"],               reach: "regional", fleet: 24, rep: 70, dominance: 0.80, alliance: "star",    tier: "mid" },
  { name: "Aerolíneas Argentas", country: "Argentina",   hubs: ["EZE"],               reach: "regional", fleet: 24, rep: 58, dominance: 0.80, alliance: "aero",    tier: "mid" },
  { name: "Lyon Air",             country: "Indonesia",    hubs: ["CGK"],               reach: "regional", fleet: 32, rep: 48, dominance: 0.72, alliance: null,      tier: "mid" },
  { name: "Sichwan Airlines",     country: "China",        hubs: ["CTU"],               reach: "regional", fleet: 28, rep: 60, dominance: 0.72, alliance: null,      tier: "mid" },
  { name: "Shenzen Airlines",    country: "China",        hubs: ["SZX"],               reach: "regional", fleet: 28, rep: 61, dominance: 0.72, alliance: "star",    tier: "mid" },
  { name: "Pakistani Intl Airlines", country: "Pakistan",   hubs: ["ISB", "KHI"],        reach: "regional", fleet: 22, rep: 50, dominance: 0.80, alliance: null,      tier: "mid" },
  { name: "Kuwaiti Airways",       country: "Kuwait",       hubs: ["KWI"],               reach: "regional", fleet: 22, rep: 62, dominance: 0.84, alliance: null,      tier: "mid" },
  { name: "Middle Eastern Airlines", country: "Lebanon",      hubs: ["BEY"],               reach: "regional", fleet: 20, rep: 64, dominance: 0.86, alliance: "aero",    tier: "mid" },
  { name: "Air Mauritia",        country: "Mauritius",    hubs: ["MRU"],               reach: "regional", fleet: 18, rep: 65, dominance: 0.88, alliance: null,      tier: "mid" },
  { name: "Omen Air",             country: "Oman",         hubs: ["MCT"],               reach: "regional", fleet: 24, rep: 66, dominance: 0.85, alliance: "one",     tier: "mid" },
  { name: "Gulph Air",             country: "Bahrain",      hubs: ["BAH"],               reach: "regional", fleet: 22, rep: 63, dominance: 0.86, alliance: null,      tier: "mid" },
  { name: "Royal Jordanean",      country: "Jordan",       hubs: ["AMM"],               reach: "regional", fleet: 18, rep: 62, dominance: 0.84, alliance: "one",     tier: "mid" },
  { name: "SriLankun Airlines",   country: "Sri Lanka",    hubs: ["CMB"],               reach: "regional", fleet: 20, rep: 60, dominance: 0.83, alliance: "one",     tier: "mid" },

  // ---- regionals & low-cost carriers ----
  { name: "JetBlu Airways",      country: "USA",          hubs: ["JFK", "BOS", "FLL"], reach: "regional", fleet: 20, rep: 63, dominance: 0.56, alliance: null,      tier: "regional" },
  { name: "Alasska Airlines",      country: "USA",          hubs: ["SEA", "PDX"],        reach: "regional", fleet: 20, rep: 72, dominance: 0.72, alliance: "onesky",  tier: "regional" },
  { name: "WestJett",              country: "Canada",       hubs: ["YYC", "YVR"],        reach: "regional", fleet: 18, rep: 62, dominance: 0.64, alliance: null,      tier: "regional" },
  { name: "eazyJet",              country: "UK",           hubs: ["LGW", "BER"],        reach: "regional", fleet: 20, rep: 58, dominance: 0.58, alliance: null,      tier: "regional" },
  { name: "Whizz Air",             country: "Hungary",      hubs: ["BUD", "OTP"],        reach: "regional", fleet: 18, rep: 52, dominance: 0.66, alliance: null,      tier: "regional" },
  { name: "Vuelingo",              country: "Spain",        hubs: ["BCN", "VLC"],        reach: "regional", fleet: 16, rep: 54, dominance: 0.60, alliance: null,      tier: "regional" },
  { name: "Norwegean",            country: "Norway",       hubs: ["OSL", "CPH"],        reach: "regional", fleet: 16, rep: 56, dominance: 0.62, alliance: null,      tier: "regional" },
  { name: "Pegasos Airlines",     country: "Türkiye",      hubs: ["IST", "AYT"],        reach: "regional", fleet: 16, rep: 53, dominance: 0.58, alliance: null,      tier: "regional" },
  { name: "flydubay",             country: "UAE",          hubs: ["DXB"],               reach: "regional", fleet: 16, rep: 60, dominance: 0.58, alliance: null,      tier: "regional" },
  { name: "SpicyJet",             country: "India",        hubs: ["DEL", "HYD"],        reach: "domestic", fleet: 14, rep: 48, dominance: 0.56, alliance: null,      tier: "regional" },
  { name: "AirAsea",              country: "Malaysia",     hubs: ["KUL"],               reach: "regional", fleet: 20, rep: 57, dominance: 0.64, alliance: null,      tier: "regional" },
  { name: "Skoot",                country: "Singapore",    hubs: ["SIN"],               reach: "regional", fleet: 14, rep: 58, dominance: 0.52, alliance: null,      tier: "regional" },
  { name: "Cebo Pacific",         country: "Philippines",  hubs: ["MNL", "CEB"],        reach: "domestic", fleet: 16, rep: 52, dominance: 0.66, alliance: null,      tier: "regional" },
  { name: "Jetstarr",              country: "Australia",    hubs: ["MEL", "SYD"],        reach: "regional", fleet: 16, rep: 55, dominance: 0.56, alliance: null,      tier: "regional" },
  { name: "GEL Linhas Aéreas",    country: "Brazil",       hubs: ["GRU", "GIG"],        reach: "domestic", fleet: 18, rep: 54, dominance: 0.68, alliance: null,      tier: "regional" },
  { name: "Azule Brazilian",       country: "Brazil",       hubs: ["BSB", "REC"],        reach: "domestic", fleet: 18, rep: 58, dominance: 0.66, alliance: null,      tier: "regional" },
  { name: "Volarus",              country: "Mexico",       hubs: ["MEX", "GDL"],        reach: "domestic", fleet: 16, rep: 50, dominance: 0.62, alliance: null,      tier: "regional" },
  { name: "Skye Airline",          country: "Chile",        hubs: ["SCL"],               reach: "domestic", fleet: 10, rep: 52, dominance: 0.54, alliance: null,      tier: "regional" },
  { name: "Porther Airlines",      country: "Canada",       hubs: ["YYZ", "YOW"],        reach: "domestic", fleet: 12, rep: 64, dominance: 0.52, alliance: null,      tier: "regional" },
  { name: "Air Transet",          country: "Canada",       hubs: ["YUL", "YYZ"],        reach: "regional", fleet: 12, rep: 60, dominance: 0.50, alliance: null,      tier: "regional" },
  { name: "Fijian Airways",         country: "Fiji",         hubs: ["NAN"],               reach: "regional", fleet: 10, rep: 68, dominance: 0.88, alliance: "onesky",  tier: "regional" },
  { name: "Air Tahiti Nue",       country: "French Polynesia", hubs: ["PPT"],           reach: "regional", fleet: 8,  rep: 66, dominance: 0.88, alliance: null,      tier: "regional" },
  { name: "RwandAero",             country: "Rwanda",       hubs: ["KGL"],               reach: "regional", fleet: 10, rep: 55, dominance: 0.82, alliance: null,      tier: "regional" },
  { name: "Air Astanya",           country: "Kazakhstan",   hubs: ["ALA"],               reach: "regional", fleet: 12, rep: 63, dominance: 0.84, alliance: null,      tier: "regional" },
  { name: "Air Piece",            country: "Nigeria",      hubs: ["LOS", "ABV"],        reach: "domestic", fleet: 12, rep: 47, dominance: 0.70, alliance: null,      tier: "regional" },
  { name: "Bambu Airways",       country: "Vietnam",      hubs: ["HAN"],               reach: "domestic", fleet: 10, rep: 50, dominance: 0.52, alliance: null,      tier: "regional" },
  { name: "Fronteer Airlines",    country: "USA",          hubs: ["DEN", "MCO"],        reach: "domestic", fleet: 18, rep: 50, dominance: 0.54, alliance: null,      tier: "regional" },
  { name: "Spirited Airlines",      country: "USA",          hubs: ["FLL", "LAS"],        reach: "domestic", fleet: 18, rep: 46, dominance: 0.54, alliance: null,      tier: "regional" },
  { name: "Allegiance Air",        country: "USA",          hubs: ["LAS"],               reach: "domestic", fleet: 14, rep: 52, dominance: 0.50, alliance: null,      tier: "regional" },
  { name: "Sun Countree Airlines", country: "USA",          hubs: ["MSP"],               reach: "domestic", fleet: 10, rep: 56, dominance: 0.52, alliance: null,      tier: "regional" },
  { name: "Flare Airlines",       country: "Canada",       hubs: ["YEG", "YYC"],        reach: "domestic", fleet: 10, rep: 48, dominance: 0.48, alliance: null,      tier: "regional" },
  { name: "Air Nord",            country: "Canada",       hubs: ["YXY"],               reach: "domestic", fleet: 8,  rep: 62, dominance: 0.82, alliance: null,      tier: "regional" },
  { name: "Canadien North",       country: "Canada",       hubs: ["YZF", "YFB"],        reach: "domestic", fleet: 8,  rep: 58, dominance: 0.86, alliance: null,      tier: "regional" },
  { name: "Transavio",            country: "Netherlands",  hubs: ["AMS"],               reach: "regional", fleet: 14, rep: 56, dominance: 0.52, alliance: null,      tier: "regional" },
  { name: "Jet II",                 country: "UK",           hubs: ["MAN", "BHX"],        reach: "regional", fleet: 16, rep: 62, dominance: 0.56, alliance: null,      tier: "regional" },
  { name: "SunExpresso",           country: "Türkiye",      hubs: ["AYT"],               reach: "regional", fleet: 12, rep: 54, dominance: 0.60, alliance: null,      tier: "regional" },
  { name: "flynaz",               country: "Saudi Arabia", hubs: ["RUH", "JED"],        reach: "regional", fleet: 14, rep: 55, dominance: 0.58, alliance: null,      tier: "regional" },
  { name: "Bankok Airways",      country: "Thailand",     hubs: ["BKK", "HKT"],        reach: "domestic", fleet: 12, rep: 60, dominance: 0.58, alliance: null,      tier: "regional" },
  { name: "VietJett Air",          country: "Vietnam",      hubs: ["SGN", "HAN"],        reach: "regional", fleet: 18, rep: 50, dominance: 0.62, alliance: null,      tier: "regional" },
  { name: "Jejoo Air",             country: "South Korea",  hubs: ["ICN", "PUS"],        reach: "regional", fleet: 12, rep: 55, dominance: 0.54, alliance: null,      tier: "regional" },
  { name: "Peachy Aviation",       country: "Japan",        hubs: ["KIX"],               reach: "domestic", fleet: 10, rep: 57, dominance: 0.56, alliance: null,      tier: "regional" },
  { name: "Starluxe Airlines",     country: "Taiwan",       hubs: ["TPE"],               reach: "regional", fleet: 10, rep: 68, dominance: 0.48, alliance: null,      tier: "regional" },
  { name: "Sprung Airlines",      country: "China",        hubs: ["PVG"],               reach: "domestic", fleet: 16, rep: 52, dominance: 0.58, alliance: null,      tier: "regional" },
  { name: "Rax Regional Express", country: "Australia",    hubs: ["SYD", "ADL"],        reach: "domestic", fleet: 10, rep: 58, dominance: 0.56, alliance: null,      tier: "regional" },
  { name: "Bahamasaire",           country: "Bahamas",      hubs: ["NAS"],               reach: "domestic", fleet: 6,  rep: 54, dominance: 0.84, alliance: null,      tier: "regional" },
  { name: "Cubanna",               country: "Cuba",         hubs: ["HAV"],               reach: "domestic", fleet: 8,  rep: 44, dominance: 0.82, alliance: null,      tier: "regional" },
  { name: "JetSHARP",             country: "Chile",        hubs: ["SCL"],               reach: "domestic", fleet: 12, rep: 52, dominance: 0.54, alliance: null,      tier: "regional" },
  { name: "Boliviano de Aviación", country: "Bolivia",     hubs: ["VVI"],               reach: "domestic", fleet: 8,  rep: 50, dominance: 0.84, alliance: null,      tier: "regional" },
  { name: "Surinami Airways",      country: "Suriname",     hubs: ["PBM"],               reach: "domestic", fleet: 5,  rep: 52, dominance: 0.86, alliance: null,      tier: "regional" },
  { name: "Aircalina",             country: "New Caledonia", hubs: ["NOU"],              reach: "regional", fleet: 5,  rep: 62, dominance: 0.88, alliance: null,      tier: "regional" },
  { name: "Air Australe",          country: "Réunion",      hubs: ["RUN"],               reach: "regional", fleet: 6,  rep: 60, dominance: 0.88, alliance: null,      tier: "regional" },
  { name: "MIAT Mongolean",       country: "Mongolia",     hubs: ["ULN"],               reach: "regional", fleet: 6,  rep: 55, dominance: 0.90, alliance: null,      tier: "regional" },
  { name: "FlyAristan",           country: "Kazakhstan",   hubs: ["ALA"],               reach: "domestic", fleet: 8,  rep: 52, dominance: 0.60, alliance: null,      tier: "regional" },
  { name: "Ukrainia Intl Airlines", country: "Ukraine",     hubs: ["KBP"],               reach: "regional", fleet: 10, rep: 54, dominance: 0.80, alliance: null,      tier: "regional" },
  { name: "Ugandan Airlines",      country: "Uganda",       hubs: ["EBB"],               reach: "regional", fleet: 6,  rep: 55, dominance: 0.86, alliance: null,      tier: "regional" },
  { name: "Jambujet",             country: "Kenya",        hubs: ["NBO"],               reach: "domestic", fleet: 6,  rep: 54, dominance: 0.56, alliance: null,      tier: "regional" },
  { name: "Ibome Air",             country: "Nigeria",      hubs: ["LOS", "ABV"],        reach: "domestic", fleet: 8,  rep: 56, dominance: 0.62, alliance: null,      tier: "regional" },
  { name: "Air Côte d'Ivoirie",    country: "Côte d'Ivoire", hubs: ["ABJ"],              reach: "regional", fleet: 8,  rep: 56, dominance: 0.86, alliance: null,      tier: "regional" },
  { name: "Air Tanzanya",         country: "Tanzania",     hubs: ["DAR"],               reach: "domestic", fleet: 8,  rep: 52, dominance: 0.82, alliance: null,      tier: "regional" },
  { name: "Maldivean",            country: "Maldives",     hubs: ["MLE"],               reach: "domestic", fleet: 5,  rep: 55, dominance: 0.88, alliance: null,      tier: "regional" },
];

// Real-life fleet composition per airline: [typeId, weight] pairs, heaviest
// first. A rival's fleet count is split across these types proportionally.
const FLEET_MIX = {
  // ---- majors ----
  "Betla Air Lines":       [["b738", 4], ["a320", 3], ["b752", 3], ["a321n", 2], ["a339", 1], ["a359", 1], ["b763", 1]],
  "Untied Airlines":       [["b738", 4], ["b38m", 3], ["b752", 1], ["b789", 2], ["b77w", 1], ["b788", 1]],
  "Americano Airlines":     [["b738", 5], ["a321n", 3], ["a320", 2], ["b788", 1], ["b789", 1], ["b77w", 1]],
  "Air Canadian":            [["a320", 3], ["b38m", 2], ["a220", 2], ["b789", 2], ["b77w", 1], ["a333", 1]],
  "Brutish Airways":       [["a320", 4], ["a321n", 2], ["b77w", 2], ["a35k", 1], ["b789", 1], ["a388", 1]],
  "Lufthansen":             [["a320n", 4], ["a321n", 2], ["a359", 2], ["b748", 1], ["a388", 1], ["a346", 1]],
  "Air Franse":            [["a320", 3], ["a220", 2], ["b77w", 2], ["a359", 2], ["a318", 1]],
  "KLN":                   [["b738", 4], ["b737", 2], ["b789", 2], ["b77w", 2], ["a332", 1]],
  "Emirats":              [["b77w", 3], ["a388", 2]],
  "Quatar Airways":         [["b77w", 3], ["a35k", 2], ["b788", 2], ["a359", 1], ["a388", 1]],
  "Singaporean Airlines":    [["a359", 3], ["b77w", 2], ["b7810", 2], ["a388", 1]],
  "Cathbay Pacific":        [["a359", 3], ["b77w", 3], ["a333", 2], ["a35k", 1]],
  "ANNA All Nippon":        [["b738", 3], ["b789", 3], ["b77w", 2], ["b788", 1], ["a388", 1]],
  "Japon Airlines":        [["b738", 3], ["b789", 2], ["b788", 2], ["a359", 2], ["b763", 1]],
  "Quantas":                [["b738", 4], ["a333", 2], ["b789", 2], ["a388", 1], ["a220", 1]],
  "Turkic Airlines":      [["b738", 3], ["a321n", 3], ["b77w", 2], ["a359", 1], ["b789", 1], ["a333", 1]],
  "Koreana Air":            [["b738", 2], ["a321n", 2], ["b77w", 2], ["a333", 2], ["b789", 1], ["b748", 1]],
  "Air Chana":             [["b738", 4], ["a320n", 3], ["b77w", 1], ["a359", 1], ["b748", 1]],
  "Sino Southern":        [["b738", 4], ["a320n", 3], ["a359", 1], ["b789", 1], ["a388", 1]],
  "Sino Eastern":         [["a320n", 5], ["b738", 2], ["a359", 1], ["b789", 1], ["b77w", 1]],
  "Ethiopean Airlines":    [["b738", 3], ["b38m", 2], ["b788", 2], ["b789", 1], ["a359", 1], ["q400", 1]],
  "IndiGlo":                [["a320n", 5], ["a321n", 3], ["atr72", 1]],
  "Hainam Airlines":       [["b738", 4], ["b789", 2], ["a333", 1]],

  // ---- mid-size ----
  "Swizz Intl Air Lines":  [["a220", 3], ["a320", 3], ["a333", 2], ["b77w", 2]],
  "Ibera":                [["a320", 4], ["a321n", 2], ["a332", 1], ["a359", 1]],
  "TOP Air Portugal":      [["a320", 3], ["a321n", 2], ["a21x", 1], ["a339", 2]],
  "Finnaire":               [["a320", 3], ["a359", 2], ["a333", 1], ["e190e2", 1]],
  "SAZ Scandinavian":      [["a320n", 4], ["a339", 1], ["a359", 1], ["e195e2", 1]],
  "ITL Airways":           [["a320", 3], ["a321n", 2], ["a339", 1], ["a359", 1]],
  "Austrean Airlines":     [["a320", 3], ["a321n", 1], ["b763", 1], ["b77w", 1], ["e195e2", 1]],
  "LOTT Polish Airlines":   [["b738", 3], ["e195e2", 2], ["e175", 2], ["b788", 1], ["b789", 1]],
  "Aeroflotte":              [["a320", 4], ["b738", 2], ["a333", 1], ["b77w", 1], ["a359", 1]],
  "Saudera":                [["a320", 3], ["a321n", 2], ["b789", 2], ["b77w", 2]],
  "Etihard Airways":        [["b789", 3], ["a321n", 2], ["a35k", 1], ["b77w", 1], ["a388", 1]],
  "El Alto":                 [["b738", 3], ["b789", 2], ["b788", 1]],
  "EgyptAero":              [["b738", 3], ["a320n", 2], ["a333", 1], ["b789", 1], ["a220", 1]],
  "Royal Air Marok":       [["b738", 4], ["b788", 1], ["b789", 1], ["e190e2", 1], ["atr72", 1]],
  "Kenyon Airways":         [["b738", 2], ["b788", 2], ["e190e2", 2], ["b763", 1]],
  "South Afrikan Airways": [["a320", 3], ["a333", 1], ["a343", 1], ["a346", 1]],
  "Air Indya":             [["a320n", 4], ["a321n", 1], ["b788", 1], ["b77w", 1], ["b744", 1]],
  "Tai Airways":          [["a320", 2], ["b77w", 3], ["a359", 2], ["b788", 1], ["a333", 1]],
  "Vietnem Airlines":      [["a321n", 4], ["b789", 2], ["a359", 2], ["atr72", 1]],
  "Garuba Indonesia":      [["b738", 3], ["a333", 2], ["b77w", 1], ["atr72", 1], ["crj9", 1]],
  "Malaysean Airlines":     [["b738", 4], ["a333", 2], ["a359", 1], ["b38m", 1]],
  "Philippene Airlines":   [["a321n", 3], ["a320", 2], ["a333", 1], ["b77w", 1], ["q400", 1]],
  "EVE Air":               [["a321n", 2], ["b77w", 3], ["b7810", 2], ["a333", 1]],
  "Chuna Airlines":        [["a321n", 2], ["b77w", 2], ["a359", 2], ["a333", 1], ["b738", 1]],
  "Asianna Airlines":       [["a321n", 3], ["a333", 2], ["a359", 2], ["b77w", 1], ["b763", 1]],
  "Air New Zeeland":       [["a320", 3], ["a321n", 1], ["b789", 2], ["b77w", 1], ["atr72", 1], ["q400", 1]],
  "LATEM Airlines":        [["a320", 4], ["a321n", 2], ["b789", 2], ["b77w", 1], ["b763", 1]],
  "Avianka":               [["a320", 4], ["a320n", 2], ["b788", 1]],
  "Aeroméxica":            [["b738", 3], ["b38m", 2], ["b788", 1], ["b789", 1], ["e190e2", 1]],
  "Copra Airlines":         [["b738", 4], ["b38m", 2]],
  "Icelandaire":            [["b38m", 2], ["b752", 2], ["b763", 1], ["b737", 1]],
  "Hawaiiana Airlines":     [["a321n", 2], ["a332", 2], ["dc9", 1], ["b789", 1]],
  "Southbest Airlines":    [["b738", 4], ["b737", 3], ["b38m", 2]],
  "Ryunair":               [["b738", 5], ["b38m", 2]],
  "Virgen Australia":      [["b738", 4], ["b38m", 1]],
  "Virgen Atlantic":       [["a35k", 2], ["b789", 2], ["a333", 1], ["a339", 1]],
  "Aer Lingo":            [["a320", 3], ["a321n", 1], ["a21x", 1], ["a333", 1]],
  "Brussel Airlines":     [["a320", 3], ["a333", 1]],
  "Aegeon Airlines":       [["a320", 3], ["a320n", 2], ["a321n", 1], ["atr72", 1]],
  "Aerolíneas Argentas": [["b738", 4], ["b38m", 1], ["a332", 1]],
  "Lyon Air":              [["b738", 4], ["b38m", 1], ["a320", 1]],
  "Sichwan Airlines":      [["a320", 3], ["a321n", 2], ["a333", 1], ["a359", 1]],
  "Shenzen Airlines":     [["b738", 4], ["a320", 2], ["a333", 1]],
  "Pakistani Intl Airlines": [["a320", 3], ["b77w", 2], ["atr72", 1]],
  "Kuwaiti Airways":        [["a320n", 2], ["a321n", 1], ["b77w", 1], ["a339", 1], ["a332", 1]],
  "Middle Eastern Airlines":  [["a320", 2], ["a321n", 2], ["a332", 1]],
  "Air Mauritia":         [["a339", 2], ["a359", 1], ["atr72", 1]],
  "Omen Air":              [["b738", 3], ["b789", 2], ["a333", 1]],
  "Gulph Air":              [["a321n", 3], ["b789", 2], ["a320", 1]],
  "Royal Jordanean":       [["a320", 2], ["e195e2", 1], ["b788", 1], ["a321n", 1]],
  "SriLankun Airlines":    [["a320", 2], ["a333", 2], ["a332", 1]],

  // ---- regionals & LCCs ----
  "JetBlu Airways":       [["a320", 4], ["a321n", 2], ["a220", 1], ["e190e2", 1]],
  "Alasska Airlines":       [["b738", 4], ["b38m", 2], ["e175", 1]],
  "WestJett":               [["b738", 4], ["b38m", 1], ["b789", 1], ["q400", 1]],
  "eazyJet":               [["a320", 4], ["a320n", 2], ["a321n", 1]],
  "Whizz Air":              [["a321n", 3], ["a320", 2]],
  "Vuelingo":               [["a320", 4], ["a321n", 1]],
  "Norwegean":             [["b738", 4], ["b38m", 1]],
  "Pegasos Airlines":      [["a320n", 3], ["a321n", 1], ["b738", 1]],
  "flydubay":              [["b738", 3], ["b38m", 2]],
  "SpicyJet":              [["b738", 3], ["q400", 2]],
  "AirAsea":               [["a320", 4], ["a320n", 2], ["a321n", 1]],
  "Skoot":                 [["a320", 2], ["b788", 1], ["b789", 1], ["a21x", 1]],
  "Cebo Pacific":          [["a320", 3], ["a321n", 2], ["atr72", 1], ["a339", 1]],
  "Jetstarr":               [["a320", 4], ["a321n", 1], ["b788", 1]],
  "GEL Linhas Aéreas":     [["b738", 4], ["b38m", 2]],
  "Azule Brazilian":        [["e195e2", 3], ["a320n", 2], ["atr72", 2], ["a339", 1]],
  "Volarus":               [["a320", 3], ["a320n", 2], ["a321n", 1]],
  "Skye Airline":           [["a320n", 3], ["a321n", 1]],
  "Porther Airlines":       [["e195e2", 2], ["q400", 3]],
  "Air Transet":           [["a321n", 2], ["a21x", 1], ["a332", 1]],
  "Fijian Airways":          [["b38m", 2], ["a332", 1], ["a359", 1], ["atr72", 1]],
  "Air Tahiti Nue":        [["b789", 1]],
  "RwandAero":              [["b738", 2], ["crj9", 2], ["a332", 1], ["q400", 1]],
  "Air Astanya":            [["a320n", 2], ["a321n", 2], ["b763", 1], ["e190e2", 1]],
  "Air Piece":             [["b738", 2], ["e195e2", 2], ["e175", 1], ["b77w", 1]],
  "Bambu Airways":        [["a321n", 2], ["b789", 1], ["e190e2", 1]],
  "Fronteer Airlines":     [["a320n", 3], ["a321n", 2], ["a320", 1]],
  "Spirited Airlines":       [["a320", 3], ["a320n", 2], ["a321n", 1]],
  "Allegiance Air":         [["a320", 3], ["a318", 1]],
  "Sun Countree Airlines":  [["b738", 3], ["b737", 1]],
  "Flare Airlines":        [["b38m", 2], ["b738", 1]],
  "Air Nord":             [["b737", 2], ["atr42", 1], ["ka350", 1]],
  "Canadien North":        [["b737", 2], ["atr42", 2], ["dhc6", 1]],
  "Transavio":             [["b738", 4], ["b737", 1]],
  "Jet II":                  [["b738", 3], ["a321n", 1], ["b737", 1]],
  "SunExpresso":            [["b738", 3], ["b38m", 1]],
  "flynaz":                [["a320n", 3], ["a320", 1], ["a333", 1]],
  "Bankok Airways":       [["a320", 2], ["atr72", 2], ["a318", 1]],
  "VietJett Air":           [["a321n", 3], ["a320", 2]],
  "Jejoo Air":              [["b738", 4]],
  "Peachy Aviation":        [["a320", 3], ["a320n", 1]],
  "Starluxe Airlines":      [["a321n", 2], ["a359", 1], ["a333", 1]],
  "Sprung Airlines":       [["a320", 3], ["a320n", 2], ["a321n", 1]],
  "Rax Regional Express":  [["b738", 1], ["atr42", 2], ["b1900", 1]],
  "Bahamasaire":            [["b737", 2], ["atr42", 1], ["atr72", 1]],
  "Cubanna":                [["atr72", 2], ["a320", 1]],
  "JetSHARP":              [["a320n", 3], ["a321n", 1]],
  "Boliviano de Aviación": [["b737", 3], ["b763", 1]],
  "Surinami Airways":       [["b737", 1], ["a343", 1]],
  "Aircalina":              [["a320n", 1], ["a339", 1], ["dhc6", 1]],
  "Air Australe":           [["b77w", 1], ["b788", 1], ["atr72", 1]],
  "MIAT Mongolean":        [["b738", 2], ["b789", 1], ["b763", 1]],
  "FlyAristan":            [["a320", 3]],
  "Ukrainia Intl Airlines": [["b738", 3], ["b763", 1], ["e190e2", 1]],
  "Ugandan Airlines":       [["crj9", 2], ["a339", 1]],
  "Jambujet":              [["q400", 3]],
  "Ibome Air":              [["crj9", 2], ["a320", 1]],
  "Air Côte d'Ivoirie":     [["a320", 2], ["q400", 1], ["a318", 1]],
  "Air Tanzanya":          [["b788", 1], ["a220", 2], ["q400", 1]],
  "Maldivean":             [["dhc6", 3], ["atr72", 1], ["a320", 1]],

  // fictional worldwide carriers
  "Global Air":            [["b789", 3], ["a359", 2], ["b738", 2], ["a321n", 1], ["b77w", 1]],
  "Apex World Airways":    [["b77w", 2], ["a333", 2], ["b738", 3], ["a320n", 2], ["b789", 1]],
  "Horizon International": [["a359", 2], ["b788", 2], ["a321n", 2], ["b738", 2], ["a339", 1]],
  "Atlas Skylines":        [["b789", 2], ["a320", 3], ["a333", 2], ["b38m", 1], ["a35k", 1]],
  "Meridian Airways":      [["a35k", 2], ["b77w", 2], ["a321n", 2], ["b738", 2]],
};

// how many of each real-airline tier take the stage in a fresh world
// (the five fictional "anywhere" carriers are always seeded on top)
const RIVAL_MIX = { major: 6, mid: 7, regional: 5 };
const RIVAL_MIX_EASY = { major: 4, mid: 5, regional: 3 };   // ~30% fewer real rivals
const RIVAL_SOFT_CAP = 28;
const RIVAL_SOFT_CAP_EASY = 20;

function rivalMix() { return isEasy() ? RIVAL_MIX_EASY : RIVAL_MIX; }
function rivalSoftCap() { return isEasy() ? RIVAL_SOFT_CAP_EASY : RIVAL_SOFT_CAP; }

function dbToRival(a) {
  const s = G.state;
  return {
    id: "rvx" + (s.rivalIdSeq = (s.rivalIdSeq || 100) + 1),
    name: a.name,
    country: a.country,
    hubs: a.hubs.slice(),
    reach: a.reach,
    tier: a.tier,
    anywhere: !!a.anywhere,
    dominance: a.dominance,
    alliance: a.alliance || null,
    rep: Math.max(30, Math.min(92, a.rep + Math.round((Math.random() - 0.5) * 8))),
    fleet: Math.max(6, a.fleet + Math.round((Math.random() - 0.5) * 10)),
  };
}

// If the player named their airline after a carrier already in AIRLINE_DB,
// that carrier never spawns as a rival — the player IS that airline here.
// Compares names with generic words like "airways"/"airlines" stripped so
// shorthand still matches.
function airlineNameCore(name) {
  return String(name || "").toLowerCase()
    .replace(/\b(airways|airlines|air lines|airline|aviation|air)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function isPlayerAirlineName(dbName) {
  const mine = airlineNameCore(G.state && G.state.airline);
  return !!mine && airlineNameCore(dbName) === mine;
}

function seedRivals() {
  G.state.rivals = [];
  // always put the fictional worldwide carriers on the board
  for (const a of AIRLINE_DB.filter(a => a.anywhere && !isPlayerAirlineName(a.name))) {
    G.state.rivals.push(dbToRival(a));
  }
  for (const [tier, count] of Object.entries(rivalMix())) {
    const pool = AIRLINE_DB.filter(a => a.tier === tier && !a.anywhere && !isPlayerAirlineName(a.name))
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
    for (const a of pool) G.state.rivals.push(dbToRival(a));
  }
  G.state.globalsSeeded = true;
}

// A carrier from the database that isn't currently flying in this world.
function unusedDbAirline(tier) {
  const taken = new Set((G.state.rivals || []).map(r => r.name));
  const ok = (a) => !a.anywhere && !taken.has(a.name) && !isPlayerAirlineName(a.name);
  // replacements prefer real carriers — the fictional globals are permanent fixtures
  let pool = AIRLINE_DB.filter(a => ok(a) && (!tier || a.tier === tier));
  if (!pool.length) pool = AIRLINE_DB.filter(ok);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

function rivalHash(rid, a, b) {
  const key = rid + [a, b].sort().join("");
  let h = 0;
  for (const ch of key) h = ((h * 31 + ch.charCodeAt(0)) ^ (h >>> 5)) >>> 0;
  return (h % 1000) / 1000;
}

/** True while a world-event fleet grounding is active for this rival. */
function isRivalGrounded(r) {
  if (!r) return false;
  return (G.state.events || []).some(ev =>
    ev.rival && (ev.rivalId === r.id || ev.rival === r.name));
}

function rivalsOnRoute(fromCode, toCode, cargo) {
  const a = airportByCode[fromCode], b = airportByCode[toCode];
  if (!a || !b) return [];
  const out = [];
  for (const r of (G.state.rivals || [])) {
    // Grounded by world event → no seats offered on any route until they're back.
    if (isRivalGrounded(r)) continue;
    const hubs = r.hubs || [];
    const aHome = !r.anywhere && a.country === r.country;
    const bHome = !r.anywhere && b.country === r.country;
    const bothHome = aHome && bHome;                          // route inside their turf
    const touchesHub = hubs.includes(fromCode) || hubs.includes(toCode);
    const touchesHome = aHome || bHome;
    // Real carriers only fly routes that touch their home country / hubs.
    // Fictional "anywhere" airlines can compete worldwide — but sparsely,
    // so plenty of city-pairs stay open for you.
    let serveP, capMul;
    if (r.anywhere) {
      if (touchesHub) { serveP = 0.40; capMul = 1.25; }
      else { serveP = 0.08; capMul = 0.85; }
    } else if (bothHome) {
      serveP = 0.6 + 0.35 * (r.dominance || 0.5);
      capMul = 1.4 + 0.8 * (r.dominance || 0.5);
    } else if (touchesHub) {
      serveP = 0.7; capMul = 1.35;
    } else if (touchesHome) {
      serveP = 0.35; capMul = 1.0;
    } else {
      continue;
    }
    if (serveP <= 0) continue;
    const roll = rivalHash(r.id, fromCode, toCode);
    if (roll < serveP) {
      const cap = Math.round((cargo ? 18 : 160) * (0.5 + roll) * (0.5 + r.fleet / 50) * capMul);
      out.push({ name: r.name, rep: r.rep, cap, alliance: r.alliance || null, anywhere: !!r.anywhere });
    }
  }
  return out;
}

// Alliance partners flying this route feed you codeshare traffic.
function codesharePartnersOnRoute(fromCode, toCode, cargo) {
  const s = G.state;
  if (!s.alliance) return [];
  return rivalsOnRoute(fromCode, toCode, cargo).filter(r => r.alliance === s.alliance);
}

function competitionShare(fromCode, toCode, cargo, playerCap) {
  const rivals = rivalsOnRoute(fromCode, toCode, cargo);
  if (!rivals.length) return 1;
  const w = (rep) => 1 + (rep - 50) / 150;
  const mine = Math.max(1, playerCap) * w(effReputation());
  let total = mine;
  for (const r of rivals) total += r.cap * w(r.rep);
  return mine / total;
}

// A fresh carrier enters the market: an airline from the database that isn't
// flying in this world yet launches with a modest starting fleet.
function spawnNewRival(silent) {
  const s = G.state;
  const a = unusedDbAirline("regional") || unusedDbAirline();
  if (!a) return;
  const r = dbToRival(a);
  r.fleet = Math.max(5, Math.round(r.fleet * 0.6));   // launches start small
  s.rivals.push(r);
  const hub = airportByCode[r.hubs[0]];
  if (!silent) log(`📰 A new carrier, ${r.name}, has launched — based at ${r.hubs[0]}${hub ? ` (${hub.city})` : ""}.`, "info");
  noteWeek("rival", `${r.name} launches`, `New carrier based at ${r.hubs[0]}${hub ? ` (${hub.city})` : ""}.`);
}

function tickRivals(silent) {
  const s = G.state;
  if (!s.rivals) return;
  for (const r of s.rivals) {
    r.rep = Math.max(20, Math.min(95, r.rep + (Math.random() - 0.5) * 2));
    if (Math.random() < 0.25) r.fleet = Math.max(3, r.fleet + (Math.random() < 0.6 ? 1 : -1));
  }
  // a bigger, newsworthy fleet move now and then
  if (s.rivals.length && Math.random() < 0.08) {
    const r = s.rivals[Math.floor(Math.random() * s.rivals.length)];
    if (Math.random() < 0.6) {
      const n = 2 + Math.floor(Math.random() * 5);
      r.fleet += n;
      if (!silent) log(`📰 ${r.name} orders ${n} new aircraft, expanding its ${r.hubs[0]} hub.`, "info");
      noteWeek("rival", `${r.name} expands`, `Orders ${n} new aircraft for the ${r.hubs[0]} hub.`);
    } else {
      const n = 1 + Math.floor(Math.random() * 3);
      r.fleet = Math.max(4, r.fleet - n);
      if (!silent) log(`📰 ${r.name} retires ${n} ageing jets to trim costs.`, "info");
      noteWeek("rival", `${r.name} retires jets`, `Parks ${n} ageing airframes to cut costs.`);
    }
  }
  // a startup enters the market from time to time (Easy keeps a thinner sky)
  if (s.rivals.length < rivalSoftCap() && Math.random() < (isEasy() ? 0.02 : 0.03)) spawnNewRival(silent);
  const mortal = s.rivals.map((r, i) => ({ r, i })).filter(x => !x.r.anywhere);
  if (mortal.length > 3 && Math.random() < 0.02) {
    const pick = mortal[Math.floor(Math.random() * mortal.length)];
    const dead = s.rivals.splice(pick.i, 1)[0];
    if (Math.random() < 0.5 || s.rivals.filter(r => !r.anywhere).length < 2) {
      log(`📰 BREAKING: ${dead.name} has declared bankruptcy — ${(dead.hubs || []).join("/")} slots freed, its routes are up for grabs!`, "good");
      noteWeek("rival", `${dead.name} bankrupt`, `${(dead.hubs || []).join("/")} slots freed — routes up for grabs.`);
      // the market abhors a vacuum: a fresh carrier steps into the gap
      const next = unusedDbAirline(dead.tier);
      if (next) {
        const r = dbToRival(next);
        // newcomers start leaner than the established version of themselves
        r.fleet = Math.max(6, Math.round(r.fleet * 0.7));
        r.rep = Math.max(30, r.rep - 5);
        s.rivals.push(r);
        log(`📰 ${r.name} enters the market from ${r.hubs[0]}, moving into the void left by ${dead.name}.`, "info");
        noteWeek("rival", `${r.name} launches`, `Enters from ${r.hubs[0]}, filling the gap left by ${dead.name}.`);
      } else {
        spawnNewRival(silent);
      }
    } else {
      const prey = s.rivals.filter(r => !r.anywhere);
      const acq = prey[Math.floor(Math.random() * prey.length)] || s.rivals[Math.floor(Math.random() * s.rivals.length)];
      acq.fleet += dead.fleet;
      acq.rep = Math.round((acq.rep + dead.rep) / 2);
      // the acquirer inherits the failed carrier's hubs, expanding its network
      acq.hubs = [...new Set([...(acq.hubs || []), ...(dead.hubs || [])])].slice(0, 4);
      if (acq.reach !== "global" && dead.reach === "global") acq.reach = "global";
      log(`📰 ${acq.name} has acquired ${dead.name} in a surprise merger.`, "info");
      noteWeek("deal", `${acq.name} buys ${dead.name}`, `Surprise merger expands the network to ${(acq.hubs || []).join(", ")}.`);
    }
  }
}

// A rival's fleet character follows its reach: global carriers run widebodies,
// domestic ones lean on regional types. Used to build a viewable fleet.
const REACH_PROFILE = {
  global:   { label: "Global network",   cats: ["Widebody", "Narrowbody"] },
  regional: { label: "Regional network", cats: ["Narrowbody", "Regional"] },
  domestic: { label: "Domestic carrier", cats: ["Regional", "Narrowbody", "Light"] },
  anywhere: { label: "Worldwide network", cats: ["Widebody", "Narrowbody"] },
};

function rivalSeed(r) {
  let h = 0;
  for (const ch of r.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h >>> 0;
}

function rivalProfile(r) {
  if (r.anywhere) return REACH_PROFILE.anywhere;
  return REACH_PROFILE[r.reach] || REACH_PROFILE.regional;
}

// Deterministic fleet breakdown: stable per rival, scaled to its fleet count.
// Airlines in FLEET_MIX get their real-world composition; others get a
// plausible mix generated from their reach profile.
function rivalFleet(r) {
  const mix = FLEET_MIX[r.name];
  if (mix && r.fleet > 0) {
    const wsum = mix.reduce((a, [, w]) => a + w, 0);
    let left = r.fleet;
    const out = [];
    for (let i = 0; i < mix.length && left > 0; i++) {
      const [typeId, w] = mix[i];
      const remaining = mix.length - i;
      const c = i === mix.length - 1
        ? left
        : Math.max(1, Math.min(Math.round(r.fleet * w / wsum), left - Math.min(remaining - 1, left - 1)));
      left -= c;
      out.push({ typeId, count: c });
    }
    return out.sort((a, b) => b.count - a.count);
  }
  const prof = rivalProfile(r);
  const pool = AIRCRAFT.filter(t => prof.cats.includes(t.cat) && !t.tons);
  if (!pool.length || r.fleet <= 0) return [];
  let h = rivalSeed(r);
  const rng = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  const nTypes = Math.max(1, Math.min(pool.length, r.fleet, 2 + Math.round(rng() * 2)));
  const avail = pool.slice();
  const picks = [];
  for (let i = 0; i < nTypes; i++) picks.push(avail.splice(Math.floor(rng() * avail.length), 1)[0]);
  const weights = picks.map(() => 0.5 + rng());
  const wsum = weights.reduce((a, b) => a + b, 0);
  let left = r.fleet;
  const out = [];
  for (let i = 0; i < picks.length; i++) {
    const remaining = picks.length - i;
    const c = i === picks.length - 1
      ? left
      : Math.max(1, Math.min(Math.round(r.fleet * weights[i] / wsum), left - (remaining - 1)));
    if (c <= 0) continue;
    left -= c;
    out.push({ typeId: picks[i].id, count: c });
  }
  return out.sort((a, b) => b.count - a.count);
}

function rivalStats(r) {
  const fleet = rivalFleet(r);
  let seats = 0, aircraft = 0;
  for (const f of fleet) {
    const t = aircraftById[f.typeId];
    seats += (t.seats || 0) * f.count;
    aircraft += f.count;
  }
  return { fleet, seats, aircraft: aircraft || r.fleet, profile: rivalProfile(r) };
}

// Book value: the aircraft on the balance sheet plus brand goodwill.
function rivalNetWorth(r) {
  let v = 0;
  for (const f of rivalFleet(r)) v += (aircraftById[f.typeId].price || 0) * f.count;
  return Math.round(v + r.rep * 0.6e6);
}

// A takeover trades at a hefty premium over book value.
function rivalAcquireCost(r) {
  return Math.round(rivalNetWorth(r) * 1.8 / 1e6) * 1e6;
}

// Buy out a competitor: pay the premium, remove them from the market, absorb
// their goodwill (reputation) and slot a few of their jets into free hangar bays.
function acquireRival(rid) {
  G.err = null;
  const s = G.state;
  const idx = (s.rivals || []).findIndex(r => r.id === rid);
  if (idx < 0) { G.err = "That airline is no longer available."; return false; }
  const r = s.rivals[idx];
  const cost = rivalAcquireCost(r);
  if (s.cash < cost) { G.err = `Acquiring ${r.name} costs ${fmtMoney(cost)}.`; return false; }
  s.cash -= cost; s.totCost += cost;
  finTrack("exp", "Acquisitions", cost);
  s.rivals.splice(idx, 1);
  s.reputation = Math.min(100, s.reputation + Math.min(6, r.rep / 12));
  // inherit up to a few of their aircraft, as hangar space allows
  const free = s.hangarCap - hangarUsed();
  const room = Math.min(free, 4);
  let gained = 0;
  for (const f of rivalFleet(r)) {
    for (let i = 0; i < f.count && gained < room; i++) {
      const p = deliverPlane(f.typeId, {});
      if (!p) continue;
      // rival fleets are lived-in — not hangar queens
      p.wear = 15 + Math.round(Math.random() * 45);   // 15–60%
      p.hours = 800 + Math.round(Math.random() * 5200);
      gained++;
    }
    if (gained >= room) break;
  }
  log(`🏢 Acquired ${r.name} for ${fmtMoney(cost)}${gained ? ` — ${gained} of their aircraft join your fleet` : ""}. One less rival on your routes.`, "good");
  noteWeek("deal", `${G.state.airline} acquires ${r.name}`,
    `Bought out for ${fmtMoney(cost)}${gained ? `; ${gained} aircraft absorbed` : ""}.`);
  save();
  return true;
}

// ---------------- passenger-to-freighter conversion ----------------
// Rip out the seats, plug the windows, cut a cargo door. Payload derives
// from the airframe class; conversion grounds the plane for a day.
const P2F_TON_FACTOR = { Light: 0.09, Charter: 0.08, Regional: 0.11, Narrowbody: 0.125, Widebody: 0.19 };
const P2F_DOWNTIME_MIN = 1440;

function convTonsOf(t) {
  if (t.tons) return t.tons;
  return Math.max(2, Math.round(t.seats * (P2F_TON_FACTOR[t.cat] || 0.11)));
}

function p2fCost(t) {
  return Math.round((t.price * 0.12 + 2e6) / 1e5) * 1e5;
}

function isFreighter(p) {
  const t = aircraftById[p.typeId];
  return !!(t.tons || p.freighter);
}

function planeTons(p) {
  const t = aircraftById[p.typeId];
  return t.tons || (p.freighter ? convTonsOf(t) : 0);
}

function convertToFreighter(id) {
  G.err = null;
  const s = G.state;
  const p = s.planes.find(x => x.id === id);
  if (!p) return false;
  const t = aircraftById[p.typeId];
  if (t.tons || p.freighter) { G.err = "It already hauls freight."; return false; }
  if (!s.cargoUnlocked) { G.err = "Found a cargo division first (shop)."; return false; }
  if (p.status === "fly" || p.status === "maint") { G.err = "Aircraft is busy."; return false; }
  const cost = p2fCost(t);
  if (s.cash < cost) { G.err = `Conversion costs ${fmtMoney(cost)}.`; return false; }
  s.cash -= cost;
  s.totCost += cost;
  finTrack("exp", "Maintenance", cost);
  // cabin crew off, freight dogs on
  const need = staffNeeds(t, p.cabin);
  s.staff.crew = Math.max(0, s.staff.crew - need.crew);
  p.freighter = true;
  p.cabin = null;
  p.amen = null;
  p.route = null;
  p.status = "maint";
  p.timer = P2F_DOWNTIME_MIN;
  log(`🔧 ${p.id} entering freighter conversion — seats out, window plugs in, flying again in ${fmtDur(P2F_DOWNTIME_MIN)} (${convTonsOf(t)} t payload).`, "info");
  save();
  return true;
}

// ---------------- cabin amenities ----------------
// Wi-Fi, entertainment and cabin finish are fitted per airframe. Factory
// deliveries arrive with a modern loadout; second-hand airframes come with
// whatever the last owner fitted — often dated kit, sometimes none at all.
// Better cabins nudge passenger demand and can earn a little onboard income.
const AMEN_DEFS = {
  wifi: { name: "Wi-Fi", icon: "📶", levels: [
    { n: "No Wi-Fi",                  d: 0 },
    { n: "Basic air-to-ground Wi-Fi", d: 0.015, cps: 900 },
    { n: "High-speed satellite Wi-Fi", d: 0.03, inc: 1.0, cps: 2400 },
  ] },
  ife: { name: "Entertainment", icon: "📺", levels: [
    { n: "No entertainment",       d: -0.02 },
    { n: "Overhead cabin screens", d: 0, cps: 500 },
    { n: "Seatback screens",       d: 0.02, cps: 1600, minSeats: 60 },
    { n: "4K streaming suite",     d: 0.04, cps: 3200, minSeats: 100 },
  ] },
  seats: { name: "Cabin & seats", icon: "💺", levels: [
    { n: "Worn, dated cabin",   d: -0.03 },
    { n: "Standard cabin",      d: 0, cps: 1200 },
    { n: "Refreshed interior",  d: 0.02, cps: 2600 },
    { n: "Premium finish",      d: 0.04, inc: 0.5, cps: 5200 },
  ] },
};
const AMEN_DOWNTIME_MIN = 720;   // 12h cabin refit

// what a factory-fresh airframe ships with
function defaultAmen(t) {
  if (t.tons) return null;
  return { wifi: 1, ife: t.seats >= 100 ? 2 : 1, seats: 1 };
}

function planeAmen(p) {
  if (isFreighter(p)) return null;
  if (!p.amen) p.amen = defaultAmen(aircraftById[p.typeId]);
  return p.amen;
}

function amenDemandMult(p) {
  const a = planeAmen(p);
  if (!a) return 1;
  let d = 0;
  for (const k in AMEN_DEFS) {
    const lv = AMEN_DEFS[k].levels[a[k] || 0] || AMEN_DEFS[k].levels[0];
    d += lv.d || 0;
  }
  return Math.max(0.88, 1 + d);
}

// onboard sales (Wi-Fi passes, premium cabin extras) per carried passenger
function amenIncomePerPax(p) {
  const a = planeAmen(p);
  if (!a) return 0;
  let inc = 0;
  for (const k in AMEN_DEFS) {
    const lv = AMEN_DEFS[k].levels[a[k] || 0];
    inc += (lv && lv.inc) || 0;
  }
  return inc;
}

function amenCost(t, key, lvl) {
  const lv = AMEN_DEFS[key].levels[lvl];
  return Math.max(1e3, Math.round((lv.cps || 0) * t.seats / 1e3) * 1e3);
}

function amenAllowed(t, key, lvl) {
  const lv = AMEN_DEFS[key].levels[lvl];
  return !!lv && (!lv.minSeats || t.seats >= lv.minSeats);
}

// Used airframes: the older / more classic the jet, the more likely its
// cabin systems are dated or missing entirely.
function rollUsedAmen(t, hours, wear) {
  if (t.tons) return null;
  const age = Math.min(1, hours / 9000);
  const missChance = t.usedOnly ? 0.9 : 0.35 + 0.45 * age;
  const wifi = Math.random() < missChance ? 0 : 1;
  let ife = Math.random() < missChance ? 0
    : (Math.random() < 0.5 + age * 0.4 || t.seats < 60) ? 1 : 2;
  if (!amenAllowed(t, "ife", ife)) ife = 1;
  const seats = (wear > 55 || Math.random() < 0.3 + age * 0.5) ? 0 : 1;
  return { wifi, ife, seats };
}

// Apply a target amenity loadout to a plane: upgrades cost money and a 12h
// cabin refit; ripping kit out is free. Can stack onto a just-started paint
// job so "Save configuration" only grounds the plane once.
function applyAmenities(id, sel) {
  G.err = null;
  const s = G.state;
  const p = s.planes.find(x => x.id === id);
  if (!p) return false;
  if (isFreighter(p)) { G.err = "Freighters have no cabin to refit."; return false; }
  const stackOnPaint = p.status === "maint" && p.paintJob;
  if (p.status === "fly" || (p.status === "maint" && !stackOnPaint)) {
    G.err = "Aircraft is busy — bring it to the gate first.";
    return false;
  }
  const t = aircraftById[p.typeId];
  const cur = planeAmen(p);
  const changes = [];
  for (const k of Object.keys(AMEN_DEFS)) {
    const maxLvl = AMEN_DEFS[k].levels.length - 1;
    const want = Math.max(0, Math.min(maxLvl, sel && sel[k] != null ? +sel[k] : (cur[k] || 0)));
    if (want === (cur[k] || 0)) continue;
    if (want < (cur[k] || 0)) { changes.push([k, want, 0]); continue; }
    if (!amenAllowed(t, k, want)) {
      G.err = `${AMEN_DEFS[k].levels[want].n} needs a larger aircraft.`;
      return false;
    }
    changes.push([k, want, amenCost(t, k, want)]);
  }
  if (!changes.length) return true;
  const cost = changes.reduce((sum, c) => sum + c[2], 0);
  if (s.cash < cost) { G.err = `Cabin refit costs ${fmtMoney(cost)}.`; return false; }
  if (cost > 0) {
    s.cash -= cost;
    s.totCost += cost;
    finTrack("exp", "Cabin refits", cost);
  }
  for (const [k, want] of changes) cur[k] = want;
  if (cost > 0) {
    p.status = "maint";
    p.timer = stackOnPaint ? Math.max(p.timer, AMEN_DOWNTIME_MIN) : AMEN_DOWNTIME_MIN;
    p.refitJob = true;
    p.groundAfterLand = false;
    log(`🛠 ${p.id} is in the cabin shop — refit done in ${fmtDur(p.timer)} (${fmtMoney(cost)}).`, "info");
  }
  save();
  return true;
}

// ---------------- used aircraft market ----------------
const USED_STOCK_MIN = 10;
const USED_STOCK_MAX = 25;

function usedPriceOf(t, hours, wear) {
  const wearF = 1 - 0.3 * wear / 100;             // wear 20–80% → 0.94–0.76
  const ageF = Math.max(0.42, 1 - hours / 8000);  // hours → down to 0.42
  // ~45%–70% of factory list. Never apply Easy new-plane discounts here —
  // stacking those into used listings made second-hand jets absurdly cheap
  // on Easy / cloud saves while Normal localhost looked fine.
  const frac = 0.42 + 0.28 * wearF * ageF;
  return Math.round(t.price * frac / 1e5) * 1e5;
}

/** Refurb target: ~85% of factory list (same base as usedPriceOf — no Easy mult). */
function usedRefurbTarget(t) {
  return Math.round(t.price * 0.85 / 1e5) * 1e5;
}

function repriceUsedMarket() {
  for (const l of (G.state && G.state.usedMarket) || []) {
    const t = aircraftById[l.typeId];
    if (!t) continue;
    l.price = usedPriceOf(t, l.hours || 0, l.wear || 0);
  }
}

function addUsedListing(t, opts = {}) {
  const s = G.state;
  // Retired fleet dumps and out-of-production classics come with more hours
  const hours = opts.retired || t.usedOnly
    ? 2000 + Math.round(Math.random() * 8000)
    : 500 + Math.round(Math.random() * 6000);
  const wear = 20 + Math.round(Math.random() * 60);
  const row = {
    id: (s.usedId = (s.usedId || 0) + 1),
    typeId: t.id, hours, wear,
    engine: !t.usedOnly && Math.random() < 0.25 ? "eco" : "std",
    amen: rollUsedAmen(t, hours, wear),
    price: usedPriceOf(t, hours, wear),
  };
  if (opts.fromEvent != null) row.fromEvent = opts.fromEvent;
  s.usedMarket.push(row);
}

// Full random re-roll every refresh — stock size rolls 10–25. Active
// fleet-retirement flood listings stick around until their headline ends.
// Freighters can appear on the ramp anytime (SpedEx dumps, etc.); purchasing
// one still requires unlocking the cargo division.
function refreshUsedMarket(silent) {
  const s = G.state;
  const keep = (s.usedMarket || []).filter(l =>
    l.fromEvent != null && (s.events || []).some(e => e.id === l.fromEvent && e.until > s.gameMin));
  s.usedMarket = keep;
  for (const t of AIRCRAFT) {
    if (!t.usedOnly) continue;
    if (t.charterSpec && !s.charterUnlocked) continue;
    if (Math.random() >= (t.usedChance || 0.2)) continue;
    addUsedListing(t);
    if (t.id === "conc" && !silent)
      log(`📰 Rare find: a Concorde has appeared on the used market — Mach 2 for those who dare.`, "good");
    if (t.id === "a3" && !silent)
      log(`📰 Rare find: an Aerobus A3 is on the used ramp — stubby, thirsty, and oddly popular with novelty seekers.`, "good");
  }
  // noUsed: factory-fresh types (777X, A350F) never show up second-hand
  const paxPool = AIRCRAFT.filter(t => !t.usedOnly && !t.noUsed && !t.tons
    && (!t.charterSpec || s.charterUnlocked));
  const cargoPool = AIRCRAFT.filter(t => !t.usedOnly && !t.noUsed && t.tons);
  const target = USED_STOCK_MIN + Math.floor(Math.random() * (USED_STOCK_MAX - USED_STOCK_MIN + 1));

  // ~45% of restocks reserve a few freighter slots so cargo shows up "sometimes"
  // without flooding the pax-heavy used ramp.
  if (cargoPool.length && Math.random() < 0.45) {
    const nCargo = 1 + Math.floor(Math.random() * 3); // 1–3
    for (let i = 0; i < nCargo && s.usedMarket.length < target; i++) {
      addUsedListing(cargoPool[Math.floor(Math.random() * cargoPool.length)]);
    }
  }

  while (s.usedMarket.length < target && paxPool.length) {
    addUsedListing(paxPool[Math.floor(Math.random() * paxPool.length)]);
  }
  // If pax pool was empty/short, top up with freighters
  while (s.usedMarket.length < target && cargoPool.length) {
    addUsedListing(cargoPool[Math.floor(Math.random() * cargoPool.length)]);
  }
}

// ---------------- limited production runs ----------------
// Ageing types have a final production allotment (10–20 airframes). Rival
// airlines snap them up over time; at zero they're used-market-only forever.
const LIMITED_PROD = ["b74sp", "b744", "b74d", "b748", "b748f", "l1011", "a343", "a346", "a388", "b763f", "b146"];

function seedProdLeft() {
  G.state.prodLeft = {};
  for (const id of LIMITED_PROD) G.state.prodLeft[id] = 10 + Math.round(Math.random() * 10);
}

function prodLeftOf(id) {
  const pl = G.state.prodLeft || {};
  return pl[id] != null ? pl[id] : Infinity;
}

// Rivals buy from the final allotments now and then (called every 12 game hours).
function tickLimitedProd(silent) {
  const s = G.state;
  if (!s.prodLeft) return;
  for (const id of Object.keys(s.prodLeft)) {
    if (s.prodLeft[id] <= 0) continue;
    if (Math.random() >= 0.2) continue;
    const take = Math.min(Math.random() < 0.25 ? 2 : 1, s.prodLeft[id]);
    s.prodLeft[id] -= take;
    const left = s.prodLeft[id];
    const t = aircraftById[id];
    const r = (s.rivals && s.rivals.length)
      ? s.rivals[Math.floor(Math.random() * s.rivals.length)].name
      : "A rival airline";
    if (silent) continue;
    if (left <= 0) {
      log(`📰 ${r} takes delivery of the very last ${t.name} — production has ended. Second-hand only from now on.`, "info");
    } else if (left <= 5) {
      log(`📰 ${r} buys ${take}× ${t.name} — only ${left} left in production!`, "info");
    } else if (Math.random() < 0.35) {
      log(`📰 ${r} orders ${take}× ${t.name} (${left} still available new).`, "info");
    }
  }
}

function buyUsed(listingId, refurb) {
  G.err = null;
  const s = G.state;
  const l = (s.usedMarket || []).find(x => x.id === listingId);
  if (!l) { G.err = "That listing is gone."; return false; }
  const t = aircraftById[l.typeId];
  if (t.cat === "Widebody" && !wideAllowed()) { G.err = `Heavy aircraft need Pilot training level ${WIDE_PILOT_LVL}.`; return false; }
  if (t.tons && !s.cargoUnlocked) { G.err = "Unlock cargo operations first."; return false; }
  if (t.charterSpec && !s.charterUnlocked) {
    G.err = `Unlock the charter desk first (Fleet Management · ${CHARTER_UNLOCK_PTS} ⭐).`;
    return false;
  }
  if (s.planes.length >= s.hangarCap) { G.err = "Hangar is full."; return false; }
  // Refurbishing resets the plane to showroom shape; the surcharge brings the
  // all-in cost up to ~85% of factory list (worse listings cost more).
  const refurbCost = refurb ? Math.max(0, usedRefurbTarget(t) - l.price) : 0;
  const total = l.price + refurbCost;
  if (s.cash < total) { G.err = `Needs ${fmtMoney(total)}${refurb ? " incl. refurbishment" : ""}.`; return false; }
  s.cash -= total;
  s.totCost += total;
  finTrack("exp", "Aircraft purchases", total);
  s.usedMarket = s.usedMarket.filter(x => x.id !== listingId);
  const p = deliverPlane(l.typeId, { engine: l.engine });
  if (!p) { s.cash += total; return false; }
  p.hours = l.hours;
  p.wear = refurb ? 0 : l.wear;
  // refurbishment includes a full modern cabin; as-is keeps the old kit
  if (!t.tons) p.amen = refurb ? defaultAmen(t) : (l.amen || rollUsedAmen(t, l.hours, l.wear));
  // Bringing a tired second-hand jet into the fleet dents the brand a little;
  // refurbishing it to showroom shape avoids the hit.
  if (!refurb) s.reputation = Math.max(0, s.reputation - 0.5);
  log(`${t.name} bought second-hand (${fmtNum(l.hours)}h) as ${p.id}${refurb ? " — refurbished to showroom shape" : ""}.`, "good");
  save();
  return true;
}

// ---------------- manufacturer launches ----------------
const LAUNCH_MAX = 5;
const LAUNCH_TPL = [
  { maker: "Aerobus",     names: ["A290", "A322neo", "A365", "A330-1000"], cats: ["Narrowbody", "Widebody"] },
  { maker: "Boing",     names: ["797-7", "737 MAX 12", "787-11", "757-X"], cats: ["Narrowbody", "Widebody"] },
  { maker: "Embraero",    names: ["E200-E3", "E175-E2+", "E220"], cats: ["Regional"] },
  { maker: "Bombardeer", names: ["CRJ1000neo", "CS500", "Q500"], cats: ["Regional"] },
];

function registerCustomType(t) {
  if (aircraftById[t.id]) return;
  AIRCRAFT.push(t);
  aircraftById[t.id] = t;
}

function genLaunch(silent) {
  const s = G.state;
  if ((s.customTypes || []).length >= LAUNCH_MAX) return;
  const mk = LAUNCH_TPL[Math.floor(Math.random() * LAUNCH_TPL.length)];
  const name = mk.names[Math.floor(Math.random() * mk.names.length)];
  const cat = mk.cats[Math.floor(Math.random() * mk.cats.length)];
  const id = "x" + ((s.customTypes || []).length + 1) + mk.maker.slice(0, 2).toLowerCase();
  if (s.customTypes.some(t => t.name === name)) return;
  const seats = cat === "Regional" ? 90 + Math.round(Math.random() * 60)
    : cat === "Narrowbody" ? 160 + Math.round(Math.random() * 80)
    : 280 + Math.round(Math.random() * 140);
  const range = cat === "Regional" ? 3200 + Math.round(Math.random() * 2500)
    : cat === "Narrowbody" ? 5800 + Math.round(Math.random() * 3200)
    : 12000 + Math.round(Math.random() * 4500);
  const speed = 820 + Math.round(Math.random() * 90);
  const burnPerSeat = (cat === "Regional" ? 0.030 : 0.023) * (0.92 + Math.random() * 0.1);
  const burn = Math.round(burnPerSeat * seats * 10) / 10;
  const baseRate = cat === "Regional" ? 360e3 : cat === "Narrowbody" ? 480e3 : 620e3;
  const baseline = cat === "Regional" ? 0.033 : cat === "Narrowbody" ? 0.027 : 0.026;
  const eff = Math.max(0.6, Math.min(1.3, Math.pow(baseline / (burn / seats), 0.9)));
  const price = Math.round(seats * baseRate * (0.72 + range / 25000) * eff / 1e5) * 1e5;
  const t = { id, maker: mk.maker, name, cat, price, seats, range, speed, burn };
  s.customTypes.push(t);
  registerCustomType(t);
  if (!silent) log(`🛠 ${mk.maker} announces the ${name}! ${seats} seats, ${fmtNum(range)} km range, ${fmtMoney(price)} — available now in the shop.`, "good");
  s.nextLaunch = s.gameMin + (180 + Math.round(Math.random() * 180)) * 1440;
}

// ---------------- lounge designer ----------------
const LOUNGE_SIZES = {
  small:  { label: "Small studio",   w: 10, h: 6,  cost: 2.5e6 },
  medium: { label: "Concourse wing", w: 14, h: 8,  cost: 7e6 },
  large:  { label: "Grand terrace",  w: 18, h: 10, cost: 16e6 },
};
const SIZE_RANK = { small: 0, medium: 1, large: 2 };
const LOUNGE_ITEMS = {
  chair:    { icon: "🪑", name: "Chair",           cost: 8e3,   comfort: 1, min: "small" },
  table:    { icon: "🟤", name: "Table",           cost: 10e3,  comfort: 1, min: "small" },
  plant:    { icon: "🪴", name: "Planter",         cost: 5e3,   comfort: 1, min: "small" },
  vending:  { icon: "🥤", name: "Vending machine", cost: 25e3,  comfort: 0, income: 0.15, min: "small" },
  couch:    { icon: "🛋️", name: "Couch",     cost: 20e3,  comfort: 2, min: "medium" },
  washroom: { icon: "🚻", name: "Washroom",        cost: 60e3,  comfort: 3, min: "medium" },
  checkin:  { icon: "🛎️", name: "Check-in desk", cost: 45e3, comfort: 2, min: "medium" },
  buffet:   { icon: "🍱", name: "Buffet",          cost: 90e3,  comfort: 1, income: 0.5, min: "large" },
  bar:      { icon: "🍸", name: "Cocktail bar",    cost: 120e3, comfort: 1, income: 0.7, min: "large" },
};

function loungeAt(hub) { return (G.state.lounges2 || {})[hub] || null; }

function loungeStats(hub) {
  const L = loungeAt(hub);
  if (!L) return null;
  let comfort = 0, income = 0;
  for (const it of L.items) {
    const def = LOUNGE_ITEMS[it.t];
    comfort += def.comfort || 0;
    income += def.income || 0;
  }
  return {
    comfort,
    incomePerPax: Math.min(1.5, income),
    upkeepDay: Math.round((L.items.length * 600 + L.items.filter(i => LOUNGE_ITEMS[i.t].income).length * 1400) * fleetCostMult(40)),
    boost: Math.min(0.15, comfort * 0.005),
    earned: L.earned || 0,
    upkeepPaid: L.upkeepPaid || 0,
  };
}

function buyLoungeRoom(hub, sizeKey) {
  G.err = null;
  const s = G.state;
  const sz = LOUNGE_SIZES[sizeKey];
  if (!s.hubs.includes(hub) || !sz) return false;
  if (!s.lounges2) s.lounges2 = {};
  if (s.lounges2[hub]) { G.err = "That hub already has a lounge."; return false; }
  const cost = loungeRoomCost(sz);
  if (s.cash < cost) { G.err = `The ${sz.label} costs ${fmtMoney(cost)}.`; return false; }
  s.cash -= cost; s.totCost += cost;
  finTrack("exp", "Lounges & partnerships", cost);
  s.lounges2[hub] = { size: sizeKey, items: [], earned: 0, upkeepPaid: 0 };
  log(`🛋 ${sz.label} lounge opened at ${hub} — time to furnish it.`, "good");
  save();
  return true;
}

function placeLoungeItem(hub, itemKey, x, y) {
  G.err = null;
  const s = G.state;
  const L = loungeAt(hub);
  const def = LOUNGE_ITEMS[itemKey];
  if (!L || !def) return false;
  if (SIZE_RANK[L.size] < SIZE_RANK[def.min]) { G.err = `${def.name}s need a ${LOUNGE_SIZES[def.min].label} or bigger.`; return false; }
  const sz = LOUNGE_SIZES[L.size];
  if (x < 0 || y < 0 || x >= sz.w || y >= sz.h) return false;
  if (L.items.some(i => i.x === x && i.y === y)) { G.err = "That spot is taken."; return false; }
  if (s.cash < def.cost) { G.err = `${def.name} costs ${fmtMoney(def.cost)}.`; return false; }
  s.cash -= def.cost; s.totCost += def.cost;
  finTrack("exp", "Lounges & partnerships", def.cost);
  L.items.push({ t: itemKey, x, y });
  save();
  return true;
}

function removeLoungeItem(hub, x, y) {
  const L = loungeAt(hub);
  if (!L) return false;
  const i = L.items.findIndex(it => it.x === x && it.y === y);
  if (i < 0) return false;
  const def = LOUNGE_ITEMS[L.items[i].t];
  G.state.cash += def.cost * 0.5;
  L.items.splice(i, 1);
  save();
  return true;
}

// ---------------- flight school ----------------
// Build a campus at any hub and furnish it like a lounge. Full-motion
// simulators run continuous cadet classes: graduates join your pilot pool at
// academy pay, widebody-sim graduates certify the whole airline for heavy
// aircraft, and every class that earns its wings banks training points.
const SCHOOL_SIZES = {
  small:  { label: "Ground campus",    w: 10, h: 6,  cost: 4e6 },
  medium: { label: "Training centre",  w: 14, h: 8,  cost: 10e6 },
  large:  { label: "Aviation academy", w: 18, h: 10, cost: 22e6 },
};
const SCHOOL_ITEMS = {
  desk:     { icon: "🪑", name: "Classroom desk",       cost: 15e3,  cap: 1, min: "small" },
  library:  { icon: "📚", name: "Study library",        cost: 60e3,  cap: 2, min: "small" },
  coffee:   { icon: "☕", name: "Coffee corner",         cost: 25e3,  cap: 1, min: "small" },
  briefing: { icon: "🗺️", name: "Briefing room",        cost: 90e3,  cap: 2, min: "medium" },
  office:   { icon: "👨‍🏫", name: "Instructor office",   cost: 150e3, speed: 0.05, min: "medium" },
  simN:     { icon: "🛩️", name: "Narrowbody simulator", cost: 2.5e6, sim: "narrow", min: "medium" },
  simW:     { icon: "✈️", name: "Widebody simulator",   cost: 6e6,   sim: "wide",   min: "large" },
};
const CLASS_DAYS = { narrow: 10, wide: 14 };   // course length in game days
const CLASS_BASE_CADETS = 2;                   // cadets per simulator per class
const CLASS_TP = { narrow: 1, wide: 2 };       // training points per graduation
const CADET_PAY_MULT = 0.85;                   // academy grads fly at 85% of market pay

function schoolAt(hub) { return (G.state.schools || {})[hub] || null; }

function schoolRoomCost(sz) {
  return Math.round(sz.cost * fleetCostMult(40) / 1e5) * 1e5;
}

function schoolStats(hub) {
  const S = schoolAt(hub);
  if (!S) return null;
  let cap = 0, speed = 0, simN = 0, simW = 0;
  for (const it of S.items) {
    const def = SCHOOL_ITEMS[it.t];
    cap += def.cap || 0;
    speed += def.speed || 0;
    if (def.sim === "narrow") simN++;
    if (def.sim === "wide") simW++;
  }
  const sims = simN + simW;
  return {
    simN, simW,
    // classrooms are shared: extra cadets per class, split across the sims
    bonus: sims ? Math.min(4, Math.floor(cap / sims)) : 0,
    speedMult: Math.max(0.75, 1 - speed),   // instructor offices shave course time
    upkeepDay: Math.round((S.items.length * 400 + sims * 2500) * fleetCostMult(40)),
    grads: S.grads || 0,
    upkeepPaid: S.upkeepPaid || 0,
  };
}

function buySchoolRoom(hub, sizeKey) {
  G.err = null;
  const s = G.state;
  const sz = SCHOOL_SIZES[sizeKey];
  if (!s.hubs.includes(hub) || !sz) return false;
  if (!s.schools) s.schools = {};
  if (s.schools[hub]) { G.err = "That hub already has a flight school."; return false; }
  const cost = schoolRoomCost(sz);
  if (s.cash < cost) { G.err = `The ${sz.label} costs ${fmtMoney(cost)}.`; return false; }
  s.cash -= cost; s.totCost += cost;
  finTrack("exp", "Flight school", cost);
  s.schools[hub] = { size: sizeKey, items: [], classes: [], grads: 0, upkeepPaid: 0 };
  log(`🏫 ${sz.label} opened at ${hub} — install simulators to start training cadets.`, "good");
  save();
  return true;
}

function placeSchoolItem(hub, itemKey, x, y) {
  G.err = null;
  const s = G.state;
  const S = schoolAt(hub);
  const def = SCHOOL_ITEMS[itemKey];
  if (!S || !def) return false;
  if (SIZE_RANK[S.size] < SIZE_RANK[def.min]) { G.err = `${def.name}s need a ${SCHOOL_SIZES[def.min].label} or bigger.`; return false; }
  const sz = SCHOOL_SIZES[S.size];
  if (x < 0 || y < 0 || x >= sz.w || y >= sz.h) return false;
  if (S.items.some(i => i.x === x && i.y === y)) { G.err = "That spot is taken."; return false; }
  if (s.cash < def.cost) { G.err = `${def.name} costs ${fmtMoney(def.cost)}.`; return false; }
  s.cash -= def.cost; s.totCost += def.cost;
  finTrack("exp", "Flight school", def.cost);
  S.items.push({ t: itemKey, x, y });
  save();
  return true;
}

function removeSchoolItem(hub, x, y) {
  const S = schoolAt(hub);
  if (!S) return false;
  const i = S.items.findIndex(it => it.x === x && it.y === y);
  if (i < 0) return false;
  const def = SCHOOL_ITEMS[S.items[i].t];
  G.state.cash += def.cost * 0.5;
  S.items.splice(i, 1);
  // fewer simulators than running classes? the newest class is sent home
  if (def.sim) {
    const st = schoolStats(hub);
    const sims = def.sim === "narrow" ? st.simN : st.simW;
    const running = (S.classes || []).filter(c => c.kind === def.sim);
    for (let k = running.length - 1; k >= sims; k--) {
      S.classes.splice(S.classes.indexOf(running[k]), 1);
    }
  }
  save();
  return true;
}

// Classes enrol automatically whenever a simulator is free, and graduate on
// schedule — called every game minute from tick().
function tickSchools(silent) {
  const s = G.state;
  if (!s.schools) return;
  for (const hub in s.schools) {
    const S = s.schools[hub];
    S.classes = S.classes || [];
    const st = schoolStats(hub);
    // graduation day
    for (const c of [...S.classes]) {
      if (c.end > s.gameMin) continue;
      S.classes.splice(S.classes.indexOf(c), 1);
      S.grads = (S.grads || 0) + c.n;
      const pool = (s.pilotPool = s.pilotPool || { narrow: 0, wide: 0 });
      pool[c.kind] = (pool[c.kind] || 0) + c.n;
      const tp = CLASS_TP[c.kind] || 1;
      s.trainPts += tp;
      const prog = c.kind === "wide" ? "widebody" : "narrowbody";
      if (c.kind === "wide" && !wideAllowed()) {
        s.wideUnlocked = true;
        if (!silent) log(`🎓 Widebody class of ${c.n} earns its wings at ${hub} (+${tp} TP) — your airline is now certified for heavy aircraft!`, "good");
      } else if (!silent) {
        log(`🎓 ${c.n} young pilots graduate from the ${prog} programme at ${hub} (+${tp} TP). They'll crew your next deliveries at academy pay.`, "good");
      }
      noteWeek("news", `${s.airline} graduates ${c.n} new pilots`,
        `The ${hub} flight school's ${prog} class earned their wings this week.`);
    }
    // every free simulator enrols the next batch of hopefuls
    for (const kind of ["narrow", "wide"]) {
      const sims = kind === "narrow" ? st.simN : st.simW;
      let running = S.classes.filter(c => c.kind === kind).length;
      while (running < sims) {
        const n = CLASS_BASE_CADETS + st.bonus;
        const dur = Math.round(CLASS_DAYS[kind] * 1440 * st.speedMult);
        S.classes.push({ kind, n, start: s.gameMin, end: s.gameMin + dur });
        running++;
        if (!silent) log(`🏫 ${n} cadets enrol in the ${kind === "wide" ? "widebody" : "narrowbody"} programme at ${hub} — wings in ${fmtDur(dur)}.`, "info");
      }
    }
  }
}

// ---------------- regional weather ----------------
// lat/lon give the centre of each zone so it can be drawn on the globe.
const WEATHER_ZONES = [
  { name: "Nor'easter",            region: "the U.S. Northeast",         lat: 44,  lon: -68,  test: (a) => a.lat > 38 && a.lat < 55 && a.lon > -85 && a.lon < -55 },
  { name: "Midwest squall line",   region: "the U.S. Midwest",           lat: 41,  lon: -90,  test: (a) => a.lat > 35 && a.lat < 50 && a.lon > -105 && a.lon < -80 },
  { name: "Pacific Northwest rain", region: "the U.S. Northwest",        lat: 47,  lon: -122, test: (a) => a.lat > 42 && a.lat < 55 && a.lon > -130 && a.lon < -114 },
  { name: "Gulf thunderstorms",    region: "the U.S. Gulf Coast",        lat: 27,  lon: -88,  test: (a) => a.lat > 18 && a.lat < 35 && a.lon > -100 && a.lon < -72 },
  { name: "Caribbean hurricane",   region: "the Caribbean",              lat: 18,  lon: -70,  typhoon: true, test: (a) => a.lat > 10 && a.lat < 28 && a.lon > -90 && a.lon < -55 },
  { name: "North Sea gales",       region: "northern Europe",            lat: 57,  lon: 3,    test: (a) => a.lat > 50 && a.lon > -10 && a.lon < 20 },
  { name: "Alpine blizzard",       region: "central Europe",             lat: 47,  lon: 10,   test: (a) => a.lat > 42 && a.lat < 52 && a.lon > 2 && a.lon < 20 },
  { name: "Mediterranean storm",   region: "the Mediterranean",          lat: 38,  lon: 18,   test: (a) => a.lat > 30 && a.lat < 46 && a.lon > -10 && a.lon < 38 },
  { name: "West African squalls",  region: "West Africa",                lat: 8,   lon: 0,    test: (a) => a.lat > -5 && a.lat < 18 && a.lon > -20 && a.lon < 15 },
  { name: "Cape storm",            region: "southern Africa",            lat: -30, lon: 25,   test: (a) => a.lat > -36 && a.lat < -20 && a.lon > 10 && a.lon < 40 },
  { name: "Shamal sandstorm",      region: "the Middle East",            lat: 28,  lon: 48,   test: (a) => a.lat > 18 && a.lat < 38 && a.lon > 32 && a.lon < 62 },
  { name: "Monsoon deluge",        region: "South & Southeast Asia",     lat: 18,  lon: 88,   test: (a) => a.lat > 5 && a.lat < 28 && a.lon > 65 && a.lon < 105 },
  { name: "Bay of Bengal cyclone", region: "the Bay of Bengal",          lat: 16,  lon: 90,   typhoon: true, test: (a) => a.lat > 5 && a.lat < 26 && a.lon > 78 && a.lon < 100 },
  { name: "Typhoon",               region: "the western Pacific",        lat: 20,  lon: 128,  typhoon: true, test: (a) => a.lat > 5 && a.lat < 35 && a.lon > 108 && a.lon < 148 },
  { name: "East Asian blizzard",   region: "Northeast Asia",             lat: 42,  lon: 130,  test: (a) => a.lat > 32 && a.lat < 55 && a.lon > 115 && a.lon < 150 },
  { name: "Siberian whiteout",     region: "northern Asia",              lat: 62,  lon: 100,  test: (a) => a.lat > 52 && a.lon > 30 && a.lon < 180 },
  { name: "Andean storm",          region: "western South America",      lat: -15, lon: -72,  test: (a) => a.lat > -40 && a.lat < 5 && a.lon > -82 && a.lon < -60 },
  { name: "Pampas derecho",        region: "southern South America",     lat: -32, lon: -58,  test: (a) => a.lat > -45 && a.lat < -20 && a.lon > -72 && a.lon < -40 },
  { name: "Australian cyclone",    region: "northern Australia",         lat: -16, lon: 135,  typhoon: true, test: (a) => a.lat > -28 && a.lat < -8 && a.lon > 112 && a.lon < 155 },
  { name: "Tasman gales",          region: "southeast Australia & NZ",   lat: -40, lon: 160,  test: (a) => a.lat > -48 && a.lat < -30 && a.lon > 140 && a.lon < 180 },
  { name: "Roaring Forties",       region: "the Southern Ocean",         lat: -48, lon: 20,   test: (a) => a.lat < -38 },
];

const WX_MAX_ACTIVE = 2;

function tickWeather(silent) {
  const s = G.state;
  if (!s.weather) s.weather = [];
  for (const w of s.weather) {
    if (w.until <= s.gameMin) {
      const z = WEATHER_ZONES[w.zone];
      if (!silent) log(`🌤 ${z.name} has cleared.`, "info");
      noteWeek("weather", `${z.name} clears`, `Skies open again over ${z.region}.`);
    }
  }
  s.weather = s.weather.filter(w => w.until > s.gameMin);
  if (s.gameMin % 360 === 0 && s.weather.length < WX_MAX_ACTIVE && Math.random() < 0.22) {
    const free = WEATHER_ZONES.map((_, i) => i).filter(i => !s.weather.some(w => w.zone === i));
    if (!free.length) return;
    const zi = free[Math.floor(Math.random() * free.length)];
    const hours = 4 + Math.round(Math.random() * 10);
    s.weather.push({ zone: zi, until: s.gameMin + hours * 60 });
    const z = WEATHER_ZONES[zi];
    const hubsHit = (s.hubs || []).filter(h => { const ap = airportByCode[h]; return ap && z.test(ap); });
    const where = hubsHit.length
      ? ` affecting your hub${hubsHit.length > 1 ? "s" : ""} at ${hubsHit.join(", ")}`
      : ` over ${z.region}`;
    if (!silent) log(`⛈ ${z.name}${where} — expect departure delays and en-route diversions for ~${hours}h.`, "bad");
    noteWeek("weather", z.typhoon ? `🌀 ${z.name} strikes` : `⛈ ${z.name}`,
      `${z.name}${where} — delays and diversions for about ${hours} hours.`);
  }
}

function weatherAt(code) {
  const ap = airportByCode[code];
  if (!ap) return null;
  for (const w of (G.state.weather || [])) {
    if (WEATHER_ZONES[w.zone].test(ap)) return WEATHER_ZONES[w.zone].name;
  }
  return null;
}

// Flights that cut through (or skim close to) an active storm must divert.
const WX_DIVERT_MIN = 20;   // base minutes added for the go-around
const WX_NEAR_KM = 900;     // path comes "close" to the storm centre within this

function weatherOnPath(a, b) {
  const list = G.state && G.state.weather;
  if (!list || !list.length || !a || !b) return null;
  const d = distKm(a, b);
  const steps = Math.max(6, Math.min(28, Math.round(d / 350) || 6));
  let best = null;
  for (const w of list) {
    const z = WEATHER_ZONES[w.zone];
    if (!z) continue;
    const center = { lat: z.lat, lon: z.lon };
    let hit = false;
    let nearest = Infinity;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // unwrap longitude so Atlantic/Pacific crossings don't jump the long way
      let lonA = a.lon, lonB = b.lon;
      if (lonB - lonA > 180) lonB -= 360;
      if (lonA - lonB > 180) lonA -= 360;
      let lon = lonA + (lonB - lonA) * t;
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
      const pt = { lat: a.lat + (b.lat - a.lat) * t, lon };
      if (z.test(pt)) { hit = true; nearest = 0; break; }
      nearest = Math.min(nearest, distKm(pt, center));
    }
    if (hit || nearest <= WX_NEAR_KM) {
      if (!best || nearest < best.near) best = { name: z.name, near: nearest };
    }
  }
  return best ? best.name : null;
}

// Returns { name, extraMin, extraKm } when the leg must divert, else null.
function pathDiversion(a, b, speed) {
  const name = weatherOnPath(a, b);
  if (!name) return null;
  const extraMin = WX_DIVERT_MIN + Math.round(Math.random() * 8); // ~20–28 min
  const extraKm = (speed || 800) * extraMin / 60;
  return { name, extraMin, extraKm };
}

// ---------------- weekly gazette ----------------
// Notable stories (storms, rival M&A, world headlines) accumulate all week,
// then drop as a Sunday paper the player can re-read in World Events.
const WEEK_MIN = 10080;          // 7 × 1440
const PAPER_ARCHIVE = 8;         // keep the last N issues
const WEEK_NOTE_CAP = 40;

function noteWeek(kind, headline, detail) {
  const s = G.state;
  if (!s) return;
  const notes = (s.weekNotes = s.weekNotes || []);
  notes.push({
    kind: kind || "news",
    headline: String(headline || "").slice(0, 120),
    detail: detail ? String(detail).slice(0, 240) : "",
    at: s.gameMin,
  });
  if (notes.length > WEEK_NOTE_CAP) notes.splice(0, notes.length - WEEK_NOTE_CAP);
}

function weekNumber(gameMin) {
  return Math.max(1, Math.floor(gameMin / WEEK_MIN));
}

function publishWeeklyPaper(silent) {
  const s = G.state;
  const notes = s.weekNotes || [];
  const week = weekNumber(s.gameMin);
  // Deduplicate near-identical headlines from the same week
  const seen = new Set();
  const stories = [];
  for (const n of notes) {
    const key = n.kind + "|" + n.headline;
    if (seen.has(key)) continue;
    seen.add(key);
    stories.push(n);
  }
  // Quiet weeks still get a paper — fill from whatever is still active
  if (!stories.length) {
    for (const w of (s.weather || [])) {
      const z = WEATHER_ZONES[w.zone];
      if (z) stories.push({ kind: "weather", headline: `${z.name} still swirling`, detail: `Lingering over ${z.region}.`, at: s.gameMin });
    }
    for (const ev of (s.events || []).slice(0, 2)) {
      stories.push({ kind: "news", headline: ev.name, detail: ev.desc, at: s.gameMin });
    }
    if (!stories.length) {
      stories.push({
        kind: "news",
        headline: "A quiet week in aviation",
        detail: "No storms of note, no surprise mergers, and the headlines stayed mild. Operators caught their breath.",
        at: s.gameMin,
      });
    }
  }
  // Lead with the flashiest kinds
  const rank = { weather: 0, deal: 1, rival: 2, news: 3 };
  stories.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || (b.at || 0) - (a.at || 0));

  const paper = {
    week,
    day: Math.floor(s.gameMin / 1440) + 1,
    published: s.gameMin,
    airline: s.airline,
    lead: stories[0].headline,
    stories: stories.slice(0, 12),
  };
  s.papers = s.papers || [];
  s.papers.unshift(paper);
  if (s.papers.length > PAPER_ARCHIVE) s.papers.length = PAPER_ARCHIVE;
  s.weekNotes = [];
  if (!silent) {
    log(`🗞 Weekly Gazette — Week ${week}: ${paper.lead}${stories.length > 1 ? ` · +${stories.length - 1} more` : ""}`, "info");
  }
}

// Daily one-way passenger demand between two airports (before modifiers)
// Gentle distance decay: two mega-cities an ocean apart still fill an A380.
function routeDemand(a, b) {
  const d = distKm(a, b);
  return Math.round((a.size * b.size * 11) / (0.45 + d / 9000));
}

// How the pax market on a route splits across First / Business / Economy.
// Leisure hops skew economy; long-haul mega-hub pairs want more premium seats.
function routeClassMix(a, b) {
  const d = distKm(a, b);
  const avg = ((a.size || 1) + (b.size || 1)) / 2;
  const leisure = LEISURE.includes(a.code) || LEISURE.includes(b.code);
  const domestic = a.country === b.country;
  let F = CABIN_DEMAND.F, J = CABIN_DEMAND.J, Y = CABIN_DEMAND.Y;

  if (d > 5500) { F += 0.07; J += 0.12; Y -= 0.19; }
  else if (d > 3000) { F += 0.03; J += 0.07; Y -= 0.10; }
  else if (d > 1500) { J += 0.03; Y -= 0.03; }
  else if (d < 800) { Y += 0.06; F -= 0.02; J -= 0.04; }

  if (avg >= 8.5) { F += 0.04; J += 0.09; Y -= 0.13; }
  else if (avg >= 7) { J += 0.05; Y -= 0.05; }
  else if (avg <= 4) { Y += 0.06; F -= 0.02; J -= 0.04; }

  // Leisure destinations swamp the cabin with holidaymakers even on long hops
  if (leisure) { Y += 0.22; F -= 0.08; J -= 0.14; }
  if (domestic && d < 1800) { Y += 0.07; F -= 0.02; J -= 0.05; }
  if (!domestic && avg >= 7 && !leisure) { J += 0.04; Y -= 0.04; }

  F = Math.max(0.005, F);
  J = Math.max(0.03, J);
  Y = Math.max(0.50, Y);
  const sum = F + J + Y;
  return { F: F / sum, J: J / sum, Y: Y / sum };
}

// Per-class daily demand in actual passengers: the classic routeDemand()
// figure IS the economy market; business and first ride on top of it,
// sized by the same route character that shapes the mix.
function routeClassDemand(a, b) {
  const Y = routeDemand(a, b);
  const mix = routeClassMix(a, b);
  return {
    Y,
    J: Math.round(Y * mix.J / mix.Y),
    F: Math.round(Y * mix.F / mix.Y),
  };
}

// Total pax/day across all three cabins (Y + J + F).
function paxDemandTotal(a, b) {
  const c = routeClassDemand(a, b);
  return c.Y + c.J + c.F;
}

// Route demand is a finite pool that refills on a difficulty schedule.
// Easy: every 12h · Normal / Realism: every 24h. World events multiply
// whatever is left when you board (they do not wait for the next reset).
function demandPeriodHours() {
  const h = difficultyOf().demandHours;
  return h > 0 ? h : 24;
}
function demandPeriodMins() { return demandPeriodHours() * 60; }
function demandPeriodId(atMin) {
  return Math.floor((atMin != null ? atMin : G.state.gameMin) / demandPeriodMins());
}
function demandPeriodEndsAt(atMin) {
  return (demandPeriodId(atMin) + 1) * demandPeriodMins();
}
function demandPoolKey(from, to, cargo) {
  return `${from}>${to}|${cargo ? "c" : "p"}`;
}
function ensureDemandPool(from, to, cargo) {
  const s = G.state;
  if (!s.demandPools) s.demandPools = {};
  const key = demandPoolKey(from, to, cargo);
  const period = demandPeriodId();
  let pool = s.demandPools[key];
  if (!pool || pool.period !== period) {
    const a = airportByCode[from], b = airportByCode[to];
    const base = (cargo ? cargoDemand(a, b) : paxDemandTotal(a, b)) * (demandPeriodHours() / 24);
    pool = { period, rem: Math.max(0, base) };
    s.demandPools[key] = pool;
  }
  return pool;
}
function routePoolRemaining(from, to, cargo) {
  return ensureDemandPool(from, to, cargo).rem;
}
function consumeDemandPool(from, to, cargo, carried, liveMult) {
  if (!(carried > 0)) return;
  const pool = ensureDemandPool(from, to, cargo);
  pool.rem = Math.max(0, pool.rem - carried / Math.max(0.05, liveMult || 1));
}

// Short label for UI: "Y-heavy · leisure" / "premium long-haul" etc.
function routeMixLabel(mix, a, b) {
  const leisure = LEISURE.includes(a.code) || LEISURE.includes(b.code);
  if (mix.F + mix.J >= 0.35) return "premium-leaning";
  if (leisure || mix.Y >= 0.88) return "economy / leisure";
  if (mix.J >= 0.22) return "business-heavy";
  return "mixed";
}

// Passengers avoid connections: −5% for one stop, much worse after.
// Freight doesn't care (but freighters are limited to one stop).
function stopoverPenalty(nStops, cargo) {
  if (!nStops || cargo) return 1;
  return 0.95 * Math.pow(0.75, nStops - 1);
}

// The airport codes a plane visits in its current direction of travel
function routePath(p) {
  const r = p.route;
  const path = [r.from, ...(r.stops || []), r.to];
  // copy before reverse — never mutate the forward path in place
  return p.leg === 0 ? path : path.slice().reverse();
}

// One-way flown distance including stopovers
function routeTotalDist(route) {
  const path = [route.from, ...(route.stops || []), route.to];
  let sum = 0;
  for (let i = 0; i < path.length - 1; i++) {
    sum += distKm(airportByCode[path[i]], airportByCode[path[i + 1]]);
  }
  return sum;
}

function longestSegmentKm(fromCode, stops, toCode) {
  const path = [fromCode, ...(stops || []), toCode];
  let max = 0;
  for (let i = 0; i < path.length - 1; i++) {
    max = Math.max(max, distKm(airportByCode[path[i]], airportByCode[path[i + 1]]));
  }
  return max;
}

// Daily one-way freight demand in tons (before modifiers).
// Mega-hub pairs and long lanes ship more; leisure resorts ship less.
function cargoDemand(a, b) {
  const d = distKm(a, b);
  let base = (a.size * b.size * 2.3) / (0.45 + d / 9000);
  const leisure = LEISURE.includes(a.code) || LEISURE.includes(b.code);
  if (leisure) base *= 0.55;
  if (a.size >= 8 && b.size >= 8) base *= 1.25;
  if (d > 5000) base *= 1.15;
  if (a.country === b.country && d < 1200) base *= 0.85;
  return Math.round(base);
}

function loungeBoost() {
  const st = loungeStats(G.state.hub);
  return st ? st.boost : 0;
}

// opts: { cargo: bool, touchesHub: bool, from: code, to: code }
// from/to are optional — when given, alliance partners flying that route add
// their codeshare feed on top of the network-wide alliance boost.
function demandMultiplier(opts = {}) {
  const s = G.state;
  let m = opts.cargo
    ? 0.8 + effReputation() / 250                       // freight cares less about brand
    : 0.7 + effReputation() / 166;                      // reputation: 0.7x – 1.3x
  if (!opts.cargo) {
    for (const c of s.campaigns) {
      if (c.until > s.gameMin) m *= 1 + campaignEffectBoost(campaignDef(c.id));
    }
    if (opts.touchesHub) m *= 1 + loungeBoost();       // lounges only help hub routes
    m *= serviceBoost();                               // meals & amenities
  }
  if (s.alliance) {
    const al = ALLIANCES.find(a => a.id === s.alliance);
    if (al) {
      m *= 1 + al.boost;                               // codeshare feeds pax & freight
      if (opts.from && opts.to) {
        const partners = codesharePartnersOnRoute(opts.from, opts.to, !!opts.cargo).length;
        if (partners) m *= 1 + al.csBoost * Math.min(partners, CODESHARE_PARTNER_CAP);
      }
    }
  }
  return m;
}

// ---------------- new game / save / load ----------------

// Game speed: game-seconds per real second (chosen at founding)
const SPEEDS = { real: 1, fast: 4, classic: 120 };

function newGame(airlineName, hubCode, timeScale, starter, difficulty) {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  // Realism locks the clock to 4×; other modes honour the player's pick.
  const speedKey = diff.lockSpeed || timeScale;
  G.state = {
    v: 1,
    difficulty: diff.id,
    timeScale: SPEEDS[speedKey] ? SPEEDS[speedKey] : (+speedKey || SPEEDS.fast),
    airline: airlineName || "New Horizon Air",
    hub: hubCode || "JFK",
    hubs: [hubCode || "JFK"],
    cash: 100e6,
    points: 20,            // spendable balance
    pointsEarned: 20,       // lifetime total (levels & alliances use this)
    fuelCapLvl: 0,
    co2CapLvl: 0,
    cargoUnlocked: false,
    wideUnlocked: false,
    charterUnlocked: false,
    charterPaused: false,
    autoDepart: false,          // buy the dispatch office (10 TP) for auto departures
    autoDepartOwned: false,
    autoDepartGuardCO2: false,  // auto-pause dispatch if the next leg would overdraw CO₂
    charterOffers: [],
    charterClients: [],        // VIP repeat charter customers
    charterId: 0,
    reputation: 50,
    fuel: 120e3,               // kg on hand (120 t starter stock)
    co2: 400e3,                // kg quota on hand (400 t)
    fuelPrice: Math.round(FUEL_MEAN * (diff.fuelMult || 1)),   // $/ton
    co2Price: 243,             // $/ton
    fuelHist: [Math.round(FUEL_MEAN * (diff.fuelMult || 1))],
    co2Hist: [243],
    gameMin: 8 * 60,           // start Day 1, 08:00
    founded: Date.now(),
    lastSeen: Date.now(),
    lastSimAt: Date.now(),      // wall clock of last simulated tick (not bumped by autosave)
    planes: [],
    nextPlaneNum: 1,
    campaigns: [],              // { id, until (gameMin) }
    lounges: 0,                 // hub lounge tiers built (0-3)
    alliance: null,             // alliance id or null
    hangarCap: HANGAR_START,
    hangarUpg: null,            // gameMin when current expansion completes
    staff: { pilots: 0, crew: 0, mech: 0, cadets: 0, payMult: 1, morale: 70 },
    autoMxPct: 60,              // auto-repair wear threshold (%)
    service: { meal: "snack", amenities: false, models: false, dish: "" },
    trainPts: 0,
    train: { pilot: 0, crew: 0, chef: 0, mgmt: 0 },
    events: [],
    eventId: 0,
    weather: [],
    weekNotes: [],              // notable stories accumulating toward the weekly paper
    papers: [],                 // published weekly gazettes (newest first)
    lounges2: {},
    schools: {},                // flight-school campuses keyed by hub
    demandPools: {},            // per-route remaining pax/freight until period reset
    pilotPool: { narrow: 0, wide: 0 },   // academy graduates awaiting a cockpit
    orders: [],                 // pending aircraft deliveries
    brands: [makeParentBrand(airlineName || "New Horizon Air")],
    nextBrandNum: 2,
    activeBrandId: "main",
    paused: false,
    totRevenue: 0,
    totCost: 0,
    totFlights: 0,
    totPax: 0,                  // lifetime passengers boarded
    totCargo: 0,                // lifetime freight tonnes boarded
    log: [],
    helpChat: [],               // short-term help desk memory (also in UI)
  };
  G.state.customTypes = [];
  G.state.nextLaunch = G.state.gameMin + (180 + Math.round(Math.random() * 180)) * 1440;
  seedProdLeft();
  refreshUsedMarket(true);
  seedRivals();
  log(`Welcome aboard! ${G.state.airline} is founded at ${hubCode} on ${diff.label} difficulty.`, "good");
  if (diff.id === "easy") {
    log(`Easy mode: aircraft prices are discounted by class, ticket & cargo pay is boosted, marketing is cheaper, fewer rivals, route demand resets every 12 hours, and the Eco Friendly campaign is unlocked.`, "info");
  } else if (diff.id === "realism") {
    log(`Realism mode: airframes wear twice as fast, the clock is locked to 4× speed, and route demand resets every 24 hours.`, "info");
  } else {
    log(`Route demand resets every 24 hours — fly a market out and wait for the next period (world events still boost or cut what's left).`, "info");
  }
  if (starter && aircraftById[starter]) {
    const p = deliverPlane(starter, {});
    if (p) log(`Your first aircraft, a ${aircraftById[starter].name}, is waiting at ${G.state.hub} as ${p.id}. Give it a route!`, "good");
  }
  save();
}

const LOG_MAX = 2000;           // airline history kept in the save
const LOG_SOFT_TRIM = 1200;     // trim target when storage is tight

function save() {
  if (!G.state) return;
  G.state.lastSeen = Date.now();
  // Prefer the durable Persist helper (localStorage + IndexedDB + cloud).
  if (typeof Persist !== "undefined" && Persist.writeLocal) {
    if (!Persist.writeLocal(G.state)) {
      for (const p of (G.state.planes || [])) {
        if (p.hist && p.hist.length > 40) p.hist.length = 40;
      }
      if (Array.isArray(G.state.log) && G.state.log.length > LOG_SOFT_TRIM) {
        G.state.log.length = LOG_SOFT_TRIM;
      }
      if (Array.isArray(G.state.reportQ) && G.state.reportQ.length > 8) {
        G.state.reportQ = G.state.reportQ.slice(-8);
      }
      Persist.writeLocal(G.state);
    }
    Persist.idbSet(G.state).catch(() => {});
    // Throttle cloud uploads (every ~45s or on unload via flushCloud)
    const now = Date.now();
    if (!G._lastCloudSave || now - G._lastCloudSave > 45000) {
      G._lastCloudSave = now;
      Persist.cloudSave(G.state).catch(() => {});
    }
    return;
  }
  try {
    localStorage.setItem("skytycoon", JSON.stringify(G.state));
  } catch (e) {
    for (const p of (G.state.planes || [])) {
      if (p.hist && p.hist.length > 60) p.hist.length = 60;
    }
    if (Array.isArray(G.state.log) && G.state.log.length > 100) G.state.log.length = 100;
    try { localStorage.setItem("skytycoon", JSON.stringify(G.state)); } catch (_) {}
  }
}

function flushCloudSave() {
  if (!G.state || typeof Persist === "undefined") return;
  G._lastCloudSave = Date.now();
  Persist.cloudSave(G.state).catch(() => {});
}

/** Apply a raw save object into G.state (migrations run in migrateState). */
function applySave(raw) {
  if (!raw || typeof raw !== "object") return false;
  G.state = raw;
  migrateState();
  return true;
}

// Legacy save remaps (keys encoded so old trademarks are not plaintext).
const RENAMED_CARRIERS = (() => {
  const m = {};
  const d = (b) => { try { return atob(b); } catch (_) { return ""; } };
  const pairs = [
    ["RGVsdGEgQWlyIExpbmVz", "Betla Air Lines"],
    ["VW5pdGVkIEFpcmxpbmVz", "Untied Airlines"],
    ["QW1lcmljYW4gQWlybGluZXM=", "Americano Airlines"],
    ["QWlyIENhbmFkYQ==", "Air Canadian"],
    ["QnJpdGlzaCBBaXJ3YXlz", "Brutish Airways"],
    ["THVmdGhhbnNh", "Lufthansen"],
    ["QWlyIEZyYW5jZQ==", "Air Franse"],
    ["S0xN", "KLN"],
    ["RW1pcmF0ZXM=", "Emirats"],
    ["UWF0YXIgQWlyd2F5cw==", "Quatar Airways"],
    ["U2luZ2Fwb3JlIEFpcmxpbmVz", "Singaporean Airlines"],
    ["Q2F0aGF5IFBhY2lmaWM=", "Cathbay Pacific"],
    ["QU5BIEFsbCBOaXBwb24=", "ANNA All Nippon"],
    ["SmFwYW4gQWlybGluZXM=", "Japon Airlines"],
    ["UWFudGFz", "Quantas"],
    ["VHVya2lzaCBBaXJsaW5lcw==", "Turkic Airlines"],
    ["S29yZWFuIEFpcg==", "Koreana Air"],
    ["QWlyIENoaW5h", "Air Chana"],
    ["Q2hpbmEgU291dGhlcm4=", "Sino Southern"],
    ["Q2hpbmEgRWFzdGVybg==", "Sino Eastern"],
    ["RXRoaW9waWFuIEFpcmxpbmVz", "Ethiopean Airlines"],
    ["SW5kaUdv", "IndiGlo"],
    ["SGFpbmFuIEFpcmxpbmVz", "Hainam Airlines"],
    ["U3dpc3MgSW50bCBBaXIgTGluZXM=", "Swizz Intl Air Lines"],
    ["SWJlcmlh", "Ibera"],
    ["VEFQIEFpciBQb3J0dWdhbA==", "TOP Air Portugal"],
    ["RmlubmFpcg==", "Finnaire"],
    ["U0FTIFNjYW5kaW5hdmlhbg==", "SAZ Scandinavian"],
    ["SVRBIEFpcndheXM=", "ITL Airways"],
    ["QXVzdHJpYW4gQWlybGluZXM=", "Austrean Airlines"],
    ["TE9UIFBvbGlzaCBBaXJsaW5lcw==", "LOTT Polish Airlines"],
    ["QWVyb2Zsb3Q=", "Aeroflotte"],
    ["U2F1ZGlh", "Saudera"],
    ["RXRpaGFkIEFpcndheXM=", "Etihard Airways"],
    ["RWwgQWw=", "El Alto"],
    ["RWd5cHRBaXI=", "EgyptAero"],
    ["Um95YWwgQWlyIE1hcm9j", "Royal Air Marok"],
    ["S2VueWEgQWlyd2F5cw==", "Kenyon Airways"],
    ["U291dGggQWZyaWNhbiBBaXJ3YXlz", "South Afrikan Airways"],
    ["QWlyIEluZGlh", "Air Indya"],
    ["VGhhaSBBaXJ3YXlz", "Tai Airways"],
    ["VmlldG5hbSBBaXJsaW5lcw==", "Vietnem Airlines"],
    ["R2FydWRhIEluZG9uZXNpYQ==", "Garuba Indonesia"],
    ["TWFsYXlzaWEgQWlybGluZXM=", "Malaysean Airlines"],
    ["UGhpbGlwcGluZSBBaXJsaW5lcw==", "Philippene Airlines"],
    ["RVZBIEFpcg==", "EVE Air"],
    ["Q2hpbmEgQWlybGluZXM=", "Chuna Airlines"],
    ["QXNpYW5hIEFpcmxpbmVz", "Asianna Airlines"],
    ["QWlyIE5ldyBaZWFsYW5k", "Air New Zeeland"],
    ["TEFUQU0gQWlybGluZXM=", "LATEM Airlines"],
    ["QXZpYW5jYQ==", "Avianka"],
    ["QWVyb23DqXhpY28=", "Aerom\u00e9xica"],
    ["Q29wYSBBaXJsaW5lcw==", "Copra Airlines"],
    ["SWNlbGFuZGFpcg==", "Icelandaire"],
    ["SGF3YWlpYW4gQWlybGluZXM=", "Hawaiiana Airlines"],
    ["U291dGh3ZXN0IEFpcmxpbmVz", "Southbest Airlines"],
    ["UnlhbmFpcg==", "Ryunair"],
    ["VmlyZ2luIEF1c3RyYWxpYQ==", "Virgen Australia"],
    ["VmlyZ2luIEF0bGFudGlj", "Virgen Atlantic"],
    ["QWVyIExpbmd1cw==", "Aer Lingo"],
    ["QnJ1c3NlbHMgQWlybGluZXM=", "Brussel Airlines"],
    ["QWVnZWFuIEFpcmxpbmVz", "Aegeon Airlines"],
    ["QWVyb2zDrW5lYXMgQXJnZW50aW5hcw==", "Aerol\u00edneas Argentas"],
    ["TGlvbiBBaXI=", "Lyon Air"],
    ["U2ljaHVhbiBBaXJsaW5lcw==", "Sichwan Airlines"],
    ["U2hlbnpoZW4gQWlybGluZXM=", "Shenzen Airlines"],
    ["UGFraXN0YW4gSW50bCBBaXJsaW5lcw==", "Pakistani Intl Airlines"],
    ["S3V3YWl0IEFpcndheXM=", "Kuwaiti Airways"],
    ["TWlkZGxlIEVhc3QgQWlybGluZXM=", "Middle Eastern Airlines"],
    ["QWlyIE1hdXJpdGl1cw==", "Air Mauritia"],
    ["T21hbiBBaXI=", "Omen Air"],
    ["R3VsZiBBaXI=", "Gulph Air"],
    ["Um95YWwgSm9yZGFuaWFu", "Royal Jordanean"],
    ["U3JpTGFua2FuIEFpcmxpbmVz", "SriLankun Airlines"],
    ["SmV0Qmx1ZSBBaXJ3YXlz", "JetBlu Airways"],
    ["QWxhc2thIEFpcmxpbmVz", "Alasska Airlines"],
    ["V2VzdEpldA==", "WestJett"],
    ["ZWFzeUpldA==", "eazyJet"],
    ["V2l6eiBBaXI=", "Whizz Air"],
    ["VnVlbGluZw==", "Vuelingo"],
    ["Tm9yd2VnaWFu", "Norwegean"],
    ["UGVnYXN1cyBBaXJsaW5lcw==", "Pegasos Airlines"],
    ["Zmx5ZHViYWk=", "flydubay"],
    ["U3BpY2VKZXQ=", "SpicyJet"],
    ["QWlyQXNpYQ==", "AirAsea"],
    ["U2Nvb3Q=", "Skoot"],
    ["Q2VidSBQYWNpZmlj", "Cebo Pacific"],
    ["SmV0c3Rhcg==", "Jetstarr"],
    ["R09MIExpbmhhcyBBw6lyZWFz", "GEL Linhas A\u00e9reas"],
    ["QXp1bCBCcmF6aWxpYW4=", "Azule Brazilian"],
    ["Vm9sYXJpcw==", "Volarus"],
    ["U2t5IEFpcmxpbmU=", "Skye Airline"],
    ["UG9ydGVyIEFpcmxpbmVz", "Porther Airlines"],
    ["QWlyIFRyYW5zYXQ=", "Air Transet"],
    ["RmlqaSBBaXJ3YXlz", "Fijian Airways"],
    ["QWlyIFRhaGl0aSBOdWk=", "Air Tahiti Nue"],
    ["UndhbmRBaXI=", "RwandAero"],
    ["QWlyIEFzdGFuYQ==", "Air Astanya"],
    ["QWlyIFBlYWNl", "Air Piece"],
    ["QmFtYm9vIEFpcndheXM=", "Bambu Airways"],
    ["RnJvbnRpZXIgQWlybGluZXM=", "Fronteer Airlines"],
    ["U3Bpcml0IEFpcmxpbmVz", "Spirited Airlines"],
    ["QWxsZWdpYW50IEFpcg==", "Allegiance Air"],
    ["U3VuIENvdW50cnkgQWlybGluZXM=", "Sun Countree Airlines"],
    ["RmxhaXIgQWlybGluZXM=", "Flare Airlines"],
    ["QWlyIE5vcnRo", "Air Nord"],
    ["Q2FuYWRpYW4gTm9ydGg=", "Canadien North"],
    ["VHJhbnNhdmlh", "Transavio"],
    ["SmV0Mg==", "Jet II"],
    ["U3VuRXhwcmVzcw==", "SunExpresso"],
    ["Zmx5bmFz", "flynaz"],
    ["QmFuZ2tvayBBaXJ3YXlz", "Bankok Airways"],
    ["VmlldEpldCBBaXI=", "VietJett Air"],
    ["SmVqdSBBaXI=", "Jejoo Air"],
    ["UGVhY2ggQXZpYXRpb24=", "Peachy Aviation"],
    ["U3Rhcmx1eCBBaXJsaW5lcw==", "Starluxe Airlines"],
    ["U3ByaW5nIEFpcmxpbmVz", "Sprung Airlines"],
    ["UmV4IFJlZ2lvbmFsIEV4cHJlc3M=", "Rax Regional Express"],
    ["QmFoYW1hc2Fpcg==", "Bahamasaire"],
    ["Q3ViYW5h", "Cubanna"],
    ["SmV0U01BUlQ=", "JetSHARP"],
    ["Qm9saXZpYW5hIGRlIEF2aWFjacOzbg==", "Boliviano de Aviaci\u00f3n"],
    ["U3VyaW5hbSBBaXJ3YXlz", "Surinami Airways"],
    ["QWlyY2FsaW4=", "Aircalina"],
    ["QWlyIEF1c3RyYWw=", "Air Australe"],
    ["TUlBVCBNb25nb2xpYW4=", "MIAT Mongolean"],
    ["Rmx5QXJ5c3Rhbg==", "FlyAristan"],
    ["VWtyYWluZSBJbnRsIEFpcmxpbmVz", "Ukrainia Intl Airlines"],
    ["VWdhbmRhIEFpcmxpbmVz", "Ugandan Airlines"],
    ["SmFtYm9qZXQ=", "Jambujet"],
    ["SWJvbSBBaXI=", "Ibome Air"],
    ["QWlyIEPDtHRlIGQnSXZvaXJl", "Air C\u00f4te d'Ivoirie"],
    ["QWlyIFRhbnphbmlh", "Air Tanzanya"],
    ["TWFsZGl2aWFu", "Maldivean"],
  ];
  for (const [k, v] of pairs) { const old = d(k); if (old) m[old] = v; }
  return m;
})();


function migrateState() {
  if (!G.state) return;
    // migrate older saves
    if (G.state.lounges == null) G.state.lounges = 0;
    if (G.state.alliance === undefined) G.state.alliance = null;
    // rivals saved under legacy carrier labels get the current names
    for (const r of (G.state.rivals || [])) {
      if (RENAMED_CARRIERS[r.name]) r.name = RENAMED_CARRIERS[r.name];
    }
    // older saves: rivals predate alliance membership / tiers — backfill from the db
    for (const r of (G.state.rivals || [])) {
      const rr = AIRLINE_DB.find(x => x.name === r.name);
      if (r.alliance === undefined) r.alliance = rr ? (rr.alliance || null) : null;
      if (r.tier === undefined) r.tier = rr ? rr.tier : (r.fleet >= 40 ? "major" : r.fleet >= 22 ? "mid" : "regional");
      if (r.anywhere === undefined) r.anywhere = !!(rr && rr.anywhere);
    }
    // one-shot: older saves get the fictional worldwide carriers once
    if (!G.state.globalsSeeded) {
      const have = new Set((G.state.rivals || []).map(r => r.name));
      for (const a of AIRLINE_DB.filter(x => x.anywhere && !have.has(x.name))) {
        G.state.rivals.push(dbToRival(a));
      }
      G.state.globalsSeeded = true;
    }
    if (G.state.pointsEarned == null) G.state.pointsEarned = G.state.points || 0;
    if (G.state.fuelCapLvl == null) G.state.fuelCapLvl = 0;
    if (G.state.co2CapLvl == null) G.state.co2CapLvl = 0;
    if (G.state.cargoUnlocked == null) G.state.cargoUnlocked = false;
    if (!Array.isArray(G.state.hubs)) G.state.hubs = [G.state.hub];
    if (!G.state.staff) {
      const st = { pilots: 0, crew: 0, payMult: 1, morale: 70 };
      for (const p of G.state.planes) {
        const need = staffNeeds(aircraftById[p.typeId]);
        st.pilots += need.pilots; st.crew += need.crew;
      }
      G.state.staff = st;
    }
    if (G.state.hangarCap == null) {
      G.state.hangarCap = Math.max(HANGAR_START,
        Math.ceil(G.state.planes.length / HANGAR_STEP) * HANGAR_STEP);
      G.state.hangarUpg = null;
    }
    if (!Array.isArray(G.state.orders)) G.state.orders = [];
    ensureBrands();
    if (G.state.charterUnlocked == null) G.state.charterUnlocked = false;
    if (G.state.charterPaused == null) G.state.charterPaused = false;
    if (!Array.isArray(G.state.charterOffers)) G.state.charterOffers = [];
    if (!Array.isArray(G.state.charterClients)) G.state.charterClients = [];
    if (G.state.staff && G.state.staff.mech == null) G.state.staff.mech = 0;
    if (G.state.staff && G.state.staff.cadets == null) G.state.staff.cadets = 0;
    if (!G.state.schools) G.state.schools = {};
    if (!G.state.pilotPool) G.state.pilotPool = { narrow: 0, wide: 0 };
    if (G.state.autoMxPct == null) G.state.autoMxPct = 60;
    if (!G.state.service) G.state.service = { meal: "snack", amenities: false, models: false, dish: "" };
    if (G.state.trainPts == null) G.state.trainPts = 0;
    if (G.state.autoDepart == null) G.state.autoDepart = true;   // grandfather old saves
    if (G.state.autoDepartOwned == null) G.state.autoDepartOwned = !!G.state.autoDepart;
    if (G.state.autoDepartGuardCO2 == null) G.state.autoDepartGuardCO2 = false;
    if (!G.state.difficulty || !DIFFICULTY[G.state.difficulty]) G.state.difficulty = "normal";
    if (!G.state.demandPools) G.state.demandPools = {};
    if (!G.state.timeScale) G.state.timeScale = SPEEDS.classic;  // old saves keep the classic pace
    // Wall-clock of last tick — must not piggyback on lastSeen (autosave refreshes that)
    if (G.state.lastSimAt == null) G.state.lastSimAt = G.state.lastSeen || Date.now();
    // Realism always runs at 4× — re-assert in case an older save drifted
    if (G.state.difficulty === "realism") G.state.timeScale = SPEEDS.fast;
    if (G.state.wideUnlocked == null) {
      // grandfather saves that already fly heavies
      G.state.wideUnlocked = G.state.planes.some(p => aircraftById[p.typeId].cat === "Widebody");
    }
    if (!G.state.train) G.state.train = { pilot: 0, crew: 0, chef: 0, mgmt: 0 };
    if (!Array.isArray(G.state.events)) G.state.events = [];
    // weather demand headlines moved to the Weather Warnings system
    G.state.events = G.state.events.filter(ev => ev.name !== "Hurricane warning" && ev.name !== "Blizzard");
    if (!G.state.fin) G.state.fin = { rev: {}, exp: {} };
    if (G.state.catering === undefined) G.state.catering = null;
    if (!G.state.leaseCooldown) G.state.leaseCooldown = {};
    // re-seed if missing, empty, or from before rivals had home countries/hubs
    if (!Array.isArray(G.state.rivals) || !G.state.rivals.length || !G.state.rivals[0].hubs) seedRivals();
    // if the player is named after a real carrier, it can't also fly as a rival
    G.state.rivals = G.state.rivals.filter(r => !isPlayerAirlineName(r.name));
    if (!Array.isArray(G.state.customTypes)) G.state.customTypes = [];
    for (const t of G.state.customTypes) registerCustomType(t);
    if (!G.state.nextLaunch) G.state.nextLaunch = G.state.gameMin + (180 + Math.round(Math.random() * 180)) * 1440;
    if (!Array.isArray(G.state.usedMarket)) { G.state.usedMarket = []; refreshUsedMarket(true); }
    if (!G.state.prodLeft) {   // pre-update save: seed allotments, re-roll the bigger market
      seedProdLeft();
      refreshUsedMarket(true);
    }
    // types added to LIMITED_PROD later get their allotment on load
    for (const id of LIMITED_PROD) {
      if (G.state.prodLeft[id] == null) G.state.prodLeft[id] = 10 + Math.round(Math.random() * 10);
    }
    // purge listings of types that can no longer appear second-hand
    G.state.usedMarket = (G.state.usedMarket || []).filter(l => {
      const t = aircraftById[l.typeId];
      return t && !t.noUsed;
    });
    // Reprice every listing so Easy-discounted / old-formula cloud saves
    // don't keep fire-sale tags after the used-market formula update.
    repriceUsedMarket();
    if (!Array.isArray(G.state.weather)) G.state.weather = [];
    if (!Array.isArray(G.state.weekNotes)) G.state.weekNotes = [];
    if (!Array.isArray(G.state.papers)) G.state.papers = [];
    if (!Array.isArray(G.state.reportQ)) G.state.reportQ = [];
    if (!G.state.lounges2) {
      G.state.lounges2 = {};
      const tier = G.state.lounges || 0;
      if (tier > 0) {
        const size = tier >= 3 ? "large" : tier === 2 ? "medium" : "small";
        const items = [];
        for (let i = 0; i < tier * 5; i++) items.push({ t: i % 3 === 2 ? "plant" : "chair", x: i % 8, y: Math.floor(i / 8) });
        items.push({ t: "vending", x: 9, y: 0 });
        if (tier >= 2) items.push({ t: "couch", x: 9, y: 1 }, { t: "washroom", x: 9, y: 2 });
        if (tier >= 3) items.push({ t: "buffet", x: 9, y: 3 }, { t: "bar", x: 9, y: 4 });
        G.state.lounges2[G.state.hub] = { size, items, earned: 0, upkeepPaid: 0 };
      }
    }
    for (const p of G.state.planes) {
      if (p.leased && p.leaseUntil == null) p.leaseUntil = G.state.gameMin + LEASE_MAX_DAYS * 1440;
    }
    if (G.state.paused == null) G.state.paused = false;
    if (G.state.totPax == null) G.state.totPax = 0;
    if (G.state.totCargo == null) G.state.totCargo = 0;
    if (G.state.totFlights == null) G.state.totFlights = 0;
    for (const p of G.state.planes) {
      if (!p.homeHub) p.homeHub = G.state.hub;
      if (!p.loc) p.loc = p.homeHub || G.state.hub;
      if (!p.engine) p.engine = "std";
      if (!p.brandId) p.brandId = "main";
      if (p.route && !Array.isArray(p.route.stops)) p.route.stops = [];
      if (p.route && !p.route.fareMult) p.route.fareMult = 1;
      if (p.segIdx == null) p.segIdx = 0;
      if (p.hours == null) p.hours = 0;
      const t = aircraftById[p.typeId];
      if (t && !t.tons && !p.cabin) p.cabin = defaultCabin(t);
      // pre-amenity saves: existing fleets are grandfathered with modern cabins
      if (t && !t.tons && !p.freighter && !p.amen) p.amen = defaultAmen(t);
    }
    // pre-amenity used listings get their cabin kit rolled now
    for (const l of (G.state.usedMarket || [])) {
      if (l.amen !== undefined) continue;
      const t = aircraftById[l.typeId];
      l.amen = t ? rollUsedAmen(t, l.hours, l.wear) : null;
    }
    for (const o of G.state.orders) {
      if (!o.brandId) o.brandId = "main";
      if (!o.id) o.id = (G.state.orderId = (G.state.orderId || 0) + 1);
    }
    // repair duplicate registrations from the old per-brand numbering
    {
      const seen = new Set();
      for (const p of G.state.planes) {
        if (seen.has(p.id)) {
          const brand = brandById(p.brandId || "main");
          let reg;
          do {
            reg = `${brandPrefix(brand)}-${String(brand.nextNum++).padStart(3, "0")}`;
          } while (seen.has(reg) || G.state.planes.some(x => x !== p && x.id === reg));
          log(`Registration conflict fixed: duplicate ${p.id} re-registered as ${reg}.`, "info");
          p.id = reg;
        }
        seen.add(p.id);
      }
    }
    if (!Array.isArray(G.state.log)) G.state.log = [];
    if (!Array.isArray(G.state.helpChat)) G.state.helpChat = [];
}

/**
 * Run offline catch-up after a save is applied or the tab becomes visible again.
 * Uses lastSimAt (last actual tick), not lastSeen — autosave used to refresh
 * lastSeen while a background tab was frozen, so catch-up never fired.
 * Returns the summary message, or null if nothing was simulated.
 */
function runOfflineCatchup() {
  if (!G.state) return null;
  if (G.state.paused) {
    G.state.lastSimAt = Date.now();
    return null;
  }
  const anchor = G.state.lastSimAt || G.state.lastSeen || Date.now();
  const away = Math.floor((Date.now() - anchor) / 1000
    * (G.state.timeScale || SPEEDS.classic) / 60);
  const mins = Math.min(OFFLINE_CAP_MIN, Math.max(0, away));
  if (mins <= 5) {
    G.state.lastSimAt = Date.now();
    return null;
  }
  const cashBefore = G.state.cash;
  for (let i = 0; i < mins; i++) tick(true);
  G.state.lastSimAt = Date.now();
  const earned = G.state.cash - cashBefore;
  const hours = Math.max(1, Math.round(mins / 60));
  let msg;
  if (earned > 0) {
    msg = `While you were away: ${fmtMoney(earned)} earned over ~${hours}h of operations.`;
  } else if (earned < 0) {
    msg = `While you were away: ~${hours}h of operations caught up (net ${fmtMoney(earned)}).`;
  } else {
    msg = `While you were away: ~${hours}h of operations caught up.`;
  }
  log(msg, earned >= 0 ? "good" : "info");
  return msg;
}

/** Sync load from localStorage (fast path). */
function load() {
  try {
    const raw = (typeof Persist !== "undefined" && Persist.readLocal)
      ? Persist.readLocal()
      : JSON.parse(localStorage.getItem("skytycoon") || "null");
    if (!raw) return false;
    if (!applySave(raw)) return false;
    runOfflineCatchup();
    return true;
  } catch (e) { return false; }
}

/**
 * Resolve the newest save among localStorage, IndexedDB, and IP cloud.
 * Returns true if a game is now loaded.
 */
async function loadAsync() {
  try {
    if (typeof Persist === "undefined") return load();
    const best = await Persist.resolveBest();
    if (!best) return false;
    if (!applySave(best)) return false;
    runOfflineCatchup();
    // Mirror the winner into every durable store
    await Persist.persistAll(G.state);
    return true;
  } catch (e) {
    console.warn("loadAsync failed", e);
    return load();
  }
}

function togglePause() {
  const s = G.state;
  s.paused = !s.paused;
  // Don't accrue offline time while paused
  s.lastSimAt = Date.now();
  log(s.paused ? "⏸ Game paused." : "▶ Game resumed.", "info");
  save();
  return s.paused;
}

function resetGame() {
  // Clear state first so the beforeunload autosave cannot write it back.
  G.state = null;
  try { localStorage.removeItem("skytycoon"); } catch (_) {}
  if (typeof Persist !== "undefined") {
    Persist.idbSet(null).catch(() => {});
    Persist.openDB().then(db => {
      if (!db) return;
      try {
        const tx = db.transaction(Persist.IDB_STORE, "readwrite");
        tx.objectStore(Persist.IDB_STORE).delete(Persist.IDB_KEY);
      } catch (_) {}
    });
  }
  location.reload();
}

// ---------------- economy actions ----------------

function deliverPlane(typeId, opts = {}) {
  const t = aircraftById[typeId], s = G.state;
  if (!t) return null;
  if (t.tons && !s.cargoUnlocked) return null;
  if (t.charterSpec && !s.charterUnlocked) return null;
  if (s.planes.length >= s.hangarCap) return null;
  ensureBrands();
  const brand = brandById(opts.brandId || s.activeBrandId || "main");
  if (!brandAllowsType(brand, typeId)) return null;
  const engine = opts.engine || "std";
  const homeHub = opts.homeHub && s.hubs.includes(opts.homeHub) ? opts.homeHub : s.hub;
  const cabin = t.tons ? null : clampCabin(t, opts.cabin || defaultCabin(t));
  const vipLayout = t.charterSpec
    ? clampVipLayout(t, opts.vipLayout || defaultVipLayout(t))
    : null;
  if (brand.nextNum == null) brand.nextNum = 1;
  // registrations must be unique across ALL brands — two brands can share a
  // prefix (e.g. "Horizon Air" / "Horizon Express" are both HO), and duplicate
  // ids break every planes.find(...) lookup
  let reg;
  do {
    reg = `${brandPrefix(brand)}-${String(brand.nextNum++).padStart(3, "0")}`;
  } while (s.planes.some(x => x.id === reg));
  s.nextPlaneNum = Math.max(s.nextPlaneNum || 1, brand.nextNum);
  const plane = {
    id: reg, typeId, wear: 0, status: "idle",
    route: null, leg: 0, timer: 0, legTime: 0, prog: 0,
    flights: 0, profit: 0,
    leased: !!opts.leased,
    leaseUntil: opts.leased ? s.gameMin + LEASE_MAX_DAYS * 1440 : null,
    leaseRateMult: opts.leased && leaseSurchargeActive(t.maker) ? LEASE_SURCHARGE : 1,
    brandId: brand.id,
    homeHub,
    loc: homeHub,
    engine,
    cabin,
    vipLayout,
    amen: t.tons ? null : defaultAmen(t),
    groundAfterLand: false,
    safetyFined: false,
  };
  // inherit the saved house livery for this type, if one was designed before
  if (s.typeLiveries && s.typeLiveries[typeId]) plane.livery = { ...s.typeLiveries[typeId] };
  else if (typeof HOUSE_LIVERIES !== "undefined" && HOUSE_LIVERIES[typeId]) plane.livery = { ...HOUSE_LIVERIES[typeId] };
  s.planes.push(plane);
  const need = staffNeeds(t, cabin);
  // academy graduates take new cockpit seats first (at academy pay);
  // widebody-rated grads can also crew smaller types
  const pool = (s.pilotPool = s.pilotPool || { narrow: 0, wide: 0 });
  const poolKey = t.cat === "Widebody" ? "wide" : "narrow";
  let want = need.pilots;
  const takeMain = Math.min(want, pool[poolKey] || 0);
  pool[poolKey] = (pool[poolKey] || 0) - takeMain;
  want -= takeMain;
  if (poolKey === "narrow" && want > 0) {
    const takeWide = Math.min(want, pool.wide || 0);
    pool.wide = (pool.wide || 0) - takeWide;
    want -= takeWide;
  }
  const fromPool = need.pilots - want;
  if (fromPool > 0) s.staff.cadets = (s.staff.cadets || 0) + fromPool;
  s.staff.pilots += need.pilots;
  s.staff.crew += need.crew;
  return plane;
}

function orderPlane(typeId, opts = {}) {
  const t = aircraftById[typeId], s = G.state;
  G.err = null;
  if (!t) return false;
  if (t.usedOnly) { G.err = `The ${t.name} is out of production — watch the used market.`; return false; }
  if (t.tons && !s.cargoUnlocked) return false;
  if (t.charterSpec && !s.charterUnlocked) {
    G.err = `Unlock the charter desk first (Fleet Management · ${CHARTER_UNLOCK_PTS} ⭐).`;
    return false;
  }
  if (t.cat === "Widebody" && !wideAllowed()) {
    G.err = `Heavy aircraft need Pilot training level ${WIDE_PILOT_LVL} (Company → Training).`;
    return false;
  }
  const prodLeft = prodLeftOf(typeId);
  if (prodLeft <= 0) { G.err = `${t.name} production has ended — check the used market.`; return false; }
  ensureBrands();
  const brand = brandById(opts.brandId || s.activeBrandId || "main");
  if (!brandAllowsType(brand, typeId)) {
    G.err = `${brand.name} cannot order ${t.cat.toLowerCase()} aircraft.`;
    return false;
  }

  const qty = Math.max(1, Math.min(50, Math.floor(+opts.qty || 1)));
  if (qty > prodLeft) {
    G.err = `Only ${prodLeft} ${t.name}${prodLeft === 1 ? "" : "s"} left in production.`;
    return false;
  }
  const freeBays = s.hangarCap - hangarUsed();
  if (freeBays < qty) {
    G.err = freeBays <= 0
      ? "Hangar is full."
      : `Only ${freeBays} hangar bay${freeBays === 1 ? "" : "s"} free — reduce quantity.`;
    return false;
  }

  const engine = opts.engine || "std";
  const homeHub = opts.homeHub && s.hubs.includes(opts.homeHub) ? opts.homeHub : s.hub;
  if (!isDomestic(homeHub)) {
    const freeSlots = INTL_HUB_SLOTS - hubSlotsUsed(homeHub);
    if (freeSlots < qty) {
      G.err = freeSlots <= 0
        ? `${homeHub} has no free international hub slots.`
        : `${homeHub} only has ${freeSlots} free base slot${freeSlots === 1 ? "" : "s"}.`;
      return false;
    }
  }

  const cabin = t.tons ? null : clampCabin(t, opts.cabin || defaultCabin(t));
  if (!t.tons && !cabinValid(t, cabin)) return false;
  const vipLayout = t.charterSpec
    ? clampVipLayout(t, opts.vipLayout || defaultVipLayout(t))
    : null;

  const leased = !!opts.leased;
  let unit = leased ? leaseDeposit(t, engine) : planeListPrice(t, engine);
  if (leased && leaseSurchargeActive(t.maker)) unit = Math.round(unit * LEASE_SURCHARGE);
  // volume pricing: manufacturers always discount real bulk orders
  const bulk = leased ? 0 : bulkDiscount(qty);
  if (bulk > 0) unit = Math.round(unit * (1 - bulk));
  // management school negotiates further — and big orders give the
  // negotiators leverage, though some manufacturers still won't budge
  let negotiated = false;
  if (!leased && mgmtPlaneDiscount() > 0) {
    const chance = Math.min(0.95, 0.7 + qty * 0.02);
    if (Math.random() < chance) {
      unit = Math.round(unit * (1 - mgmtPlaneDiscount()));
      negotiated = true;
    }
  }
  const cost = unit * qty;
  if (s.cash < cost) {
    G.err = `Need ${fmtMoney(cost)} for ${qty}× ${t.name}.`;
    return false;
  }

  s.cash -= cost;
  s.totCost += cost;
  finTrack("exp", leased ? "Lease deposits" : "Aircraft purchases", cost);
  const eta = s.gameMin + deliveryMinutes(t);
  for (let i = 0; i < qty; i++) {
    s.orders.push({
      id: (s.orderId = (s.orderId || 0) + 1),
      typeId, leased, engine, homeHub, cabin, vipLayout,
      brandId: brand.id,
      eta, cost: unit,
    });
  }
  // purchases eat into a limited production run (leases come from lessor stock)
  if (!leased && s.prodLeft && s.prodLeft[typeId] != null) {
    s.prodLeft[typeId] -= qty;
    const left = s.prodLeft[typeId];
    if (left <= 0) log(`📰 You bought the last ${t.name}${qty > 1 ? "s" : ""} ever built — production has ended!`, "good");
    else if (left <= 5) log(`📰 Only ${left} ${t.name}${left === 1 ? "" : "s"} left in production.`, "info");
  }
  const when = fmtDur(deliveryMinutes(t));
  const bulkNote = bulk > 0 ? ` Volume deal: ${Math.round(bulk * 100)}% off list.` : "";
  const dealNote = bulkNote + (!leased && mgmtPlaneDiscount() > 0
    ? (negotiated ? ` Management talked a further ${Math.round(mgmtPlaneDiscount() * 100 * 10) / 10}% off!`
                  : " The manufacturer wouldn't budge beyond that.")
    : "");
  log(`${qty > 1 ? qty + "× " : ""}${t.name} for ${brand.name} ${leased ? "lease" : "purchase"} ordered — arrive${qty > 1 ? "" : "s"} at ${homeHub} in ${when}.${dealNote}`, "info");
  save();
  return true;
}

function buyPlane(typeId, opts = {}) {
  return orderPlane(typeId, { ...opts, leased: false });
}

function leasePlane(typeId, opts = {}) {
  return orderPlane(typeId, { ...opts, leased: true });
}

// Impatience is a virtue: skip waits for ⭐ points (1 per 2h remaining)
function rushCost(remainMin) {
  return Math.max(1, Math.ceil(remainMin / 120));
}

function rushOrder(orderId) {
  G.err = null;
  const s = G.state;
  const o = s.orders.find(x => x.id === orderId);
  if (!o) return false;
  const cost = rushCost(o.eta - s.gameMin);
  if (s.points < cost) { G.err = `Rushing this delivery costs ${cost} ⭐ (you have ${fmtNum(s.points)}).`; return false; }
  s.points -= cost;
  o.eta = s.gameMin;
  log(`⚡ Delivery expedited for ${cost} ⭐ — the ferry crew skips the layover.`, "good");
  save();
  return true;
}

function rushHangar() {
  G.err = null;
  const s = G.state;
  if (s.hangarUpg == null) return false;
  const cost = rushCost(s.hangarUpg - s.gameMin);
  if (s.points < cost) { G.err = `Rushing construction costs ${cost} ⭐ (you have ${fmtNum(s.points)}).`; return false; }
  s.points -= cost;
  s.hangarUpg = s.gameMin;
  log(`⚡ Construction crews pull an all-nighter for ${cost} ⭐.`, "good");
  save();
  return true;
}

function processOrders(silent) {
  const s = G.state;
  if (!s.orders || !s.orders.length) return;
  const ready = [];
  const keep = [];
  for (const o of s.orders) {
    if (s.gameMin >= o.eta) ready.push(o);
    else keep.push(o);
  }
  s.orders = keep;
  for (const o of ready) {
    if (s.planes.length >= s.hangarCap) {
      // hangar full somehow — refund and drop
      s.cash += o.cost;
      s.totCost -= o.cost;
      if (!silent) log(`Order cancelled — hangar full. ${fmtMoney(o.cost)} refunded.`, "bad");
      continue;
    }
    const plane = deliverPlane(o.typeId, o);
    if (!plane) continue;
    const t = aircraftById[o.typeId];
    const need = staffNeeds(t, plane.cabin);
    if (!silent) {
      log(`${t.name} arrived at ${plane.homeHub} as ${plane.id}${o.leased ? " (leased)" : ""}. Hired ${need.pilots} pilots${need.crew ? ` + ${need.crew} cabin` : ""}.`, "good");
    }
  }
}

// Resale value: half of list, minus wear (recoverable via maintenance)
// and minus flight hours (permanent airframe ageing).
function planeValue(p) {
  const t = aircraftById[p.typeId];
  const base = planeListPrice(t, p.engine) * 0.5;
  const wearF = 1 - 0.3 * Math.min(100, p.wear) / 100;          // up to −30%
  const ageF = Math.max(0.35, 1 - (p.hours || 0) / 8000);        // −65% floor at 8000h
  return Math.round(base * wearF * ageF);
}

function sellPlane(id) {
  const s = G.state;
  const i = s.planes.findIndex(p => p.id === id);
  if (i < 0) return false;
  const p = s.planes[i];
  if (p.leased) return false;
  if (p.status === "fly" || p.status === "maint") return false;
  const refund = planeValue(p);
  s.cash += refund;
  finTrack("rev", "Aircraft sales", refund);
  s.planes.splice(i, 1);
  const need = staffNeeds(aircraftById[p.typeId], p.cabin);
  s.staff.pilots = Math.max(0, s.staff.pilots - need.pilots);
  s.staff.crew = Math.max(0, s.staff.crew - need.crew);
  s.staff.cadets = Math.min(s.staff.cadets || 0, s.staff.pilots);
  log(`${p.id} sold for ${fmtMoney(refund)}. Released ${need.pilots + need.crew} staff.`, "info");
  save();
  return true;
}

function endLeaseCooldown(t) {
  const s = G.state;
  if (!s.leaseCooldown) s.leaseCooldown = {};
  s.leaseCooldown[t.maker] = s.gameMin + LEASE_COOLDOWN_DAYS * 1440;
}

function returnLease(id) {
  const s = G.state;
  const i = s.planes.findIndex(p => p.id === id);
  if (i < 0) return false;
  const p = s.planes[i];
  if (!p.leased) return false;
  if (p.status === "fly" || p.status === "maint") return false;
  const t = aircraftById[p.typeId];
  s.planes.splice(i, 1);
  const need = staffNeeds(t, p.cabin);
  s.staff.pilots = Math.max(0, s.staff.pilots - need.pilots);
  s.staff.crew = Math.max(0, s.staff.crew - need.crew);
  s.staff.cadets = Math.min(s.staff.cadets || 0, s.staff.pilots);
  endLeaseCooldown(t);
  log(`${p.id} returned to lessor (${t.name}). Lease ended — ${t.maker} won't lease cheap again for ${LEASE_COOLDOWN_DAYS} days.`, "info");
  save();
  return true;
}

function groundPlane(id) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p || p.status === "maint" || p.status === "ground") return false;
  if (p.status === "fly") {
    p.groundAfterLand = true;
    log(`${p.id} recalled — will be grounded on arrival for sell/reroute.`, "info");
    save();
    return true;
  }
  p.status = "ground";
  p.timer = 0;
  p.prog = 0;
  p.holdReason = null;
  p.groundAfterLand = false;
  log(`${p.id} grounded at gate.`, "info");
  save();
  return true;
}

function ungroundPlane(id) {
  G.err = null;
  const p = G.state.planes.find(x => x.id === id);
  if (!p || p.status !== "ground") return false;
  if (p.wear >= WEAR_SAFETY) {
    G.err = "Airframe exceeds safety limits — maintenance required before return to service.";
    return false;
  }
  p.status = p.route ? "turn" : "idle";
  p.timer = p.route ? 10 : 0;
  log(`${p.id} returned to service.`, "good");
  save();
  return true;
}

function applySafetyGround(p, silent) {
  const s = G.state;
  const t = aircraftById[p.typeId];
  const wasFlying = p.status === "fly";
  p.status = "ground";
  p.timer = 0;
  p.prog = 0;
  p.holdReason = null;
  p.groundAfterLand = false;
  if (!p.safetyFined) {
    const fine = safetyFine(t);
    s.cash -= fine;
    s.totCost += fine;
    finTrack("exp", "Fines & other", fine);
    s.reputation = Math.max(0, s.reputation - 10);
    p.safetyFined = true;
    if (!silent) {
      log(`${p.id} forcibly grounded — wear hit ${Math.round(p.wear)}%. Aviation authority fine ${fmtMoney(fine)}!`, "bad");
    }
  } else if (!silent && wasFlying) {
    log(`${p.id} remains grounded — airframe still beyond safety limits.`, "bad");
  }
}

function assignRoute(id, fromCode, toCode, stops, fareMult, fareJ, fareF) {
  G.err = null;
  stops = (stops || []).filter(Boolean);
  fareMult = Math.max(FARE_MIN, Math.min(FARE_MAX, +fareMult || 1));
  fareJ = Math.max(FARE_MIN, Math.min(FARE_MAX, +fareJ || fareMult));
  fareF = Math.max(FARE_MIN, Math.min(FARE_MAX, +fareF || fareMult));
  const p = G.state.planes.find(x => x.id === id);
  if (!p || p.status === "fly" || p.status === "maint") { G.err = "Aircraft is busy."; return false; }
  if (p.wear >= WEAR_SAFETY) { G.err = "Airframe exceeds safety limits — maintain before assigning a route."; return false; }
  if (!fromCode || !toCode || fromCode === toCode) { G.err = "Pick two different airports."; return false; }
  if (!G.state.hubs.includes(fromCode)) { G.err = `Routes must depart from one of your hubs.`; return false; }
  if (stops.some(c => !airportByCode[c])) { G.err = "Unknown stopover airport."; return false; }
  if (stops.includes(fromCode) || stops.includes(toCode)) { G.err = "A stopover can't repeat the origin or destination."; return false; }
  if (new Set(stops).size !== stops.length) { G.err = "Duplicate stopover."; return false; }
  const t = aircraftById[p.typeId];
  if (t.tons && stops.length > 1) { G.err = "Freighters may only make one stopover."; return false; }
  if (fromCode !== (p.homeHub || G.state.hub)) {
    if (!isDomestic(fromCode) && hubSlotsUsed(fromCode, p) >= INTL_HUB_SLOTS) {
      G.err = `${fromCode} is an international hub — all ${INTL_HUB_SLOTS} base slots are in use.`;
      return false;
    }
    p.homeHub = fromCode;
  }
  const maxSeg = longestSegmentKm(fromCode, stops, toCode);
  if (maxSeg > t.range) {
    G.err = `Longest leg is ${fmtNum(maxSeg)} km — beyond the ${t.name}'s ${fmtNum(t.range)} km range.${stops.length ? "" : " Try adding a stopover."}`;
    return false;
  }
  const prev = p.route;
  const samePair = prev && ((prev.from === fromCode && prev.to === toCode) ||
    (prev.from === toCode && prev.to === fromCode));
  if (!samePair) {
    const fee = routeSlotFee(fromCode, toCode);
    if (G.state.cash < fee) { G.err = `Opening this route needs a ${fmtMoney(fee)} slot fee.`; return false; }
    G.state.cash -= fee;
    G.state.totCost += fee;
    finTrack("exp", "Route slot fees", fee);
  }
  p.route = { from: fromCode, to: toCode, stops, fareMult, fareJ, fareF };
  p.loc = fromCode;
  p.leg = 0;
  p.segIdx = 0;
  p.status = "turn";
  p.timer = 10;
  p.groundAfterLand = false;
  const via = stops.length ? ` via ${stops.join(", ")}` : "";
  log(`${p.id} based at ${fromCode}, assigned ${fromCode} ⇄ ${toCode}${via} (${Math.round(distKm(airportByCode[fromCode], airportByCode[toCode]))} km direct).`, "info");
  save();
  return true;
}

function clearRoute(id) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p || p.status === "fly") return false;
  p.route = null;
  p.status = p.status === "ground" ? "ground" : "idle";
  p.timer = 0;
  save();
  return true;
}

// Concorde and friends: mxMult scales the cost of a maintenance check
function maintCheckCost(t) {
  return t.price * 0.006 * (t.mxMult || 1);
}

function maintainPlane(id) {
  const s = G.state;
  const p = s.planes.find(x => x.id === id);
  if (!p || p.status === "fly" || p.status === "maint") return false;
  const cost = maintCheckCost(aircraftById[p.typeId]);
  if (s.cash < cost) return false;
  s.cash -= cost; s.totCost += cost;
  finTrack("exp", "Maintenance", cost);
  p.status = "maint"; p.timer = MAINT_DURATION_MIN;
  p.groundAfterLand = false;
  log(`${p.id} entered maintenance check (${fmtMoney(cost)}).`, "info");
  save();
  return true;
}

// A repaint runs $5k for a puddle-jumper up to $40k for an A380 and
// keeps the plane in the paint shop for 4 hours.
const PAINT_DOWNTIME_MIN = 240;

function paintCost(t) {
  const f = Math.pow(Math.min(1, t.price / 440e6), 0.6);
  return Math.round((5000 + 35000 * f) / 500) * 500;
}

function repaintPlane(id, livery) {
  const s = G.state;
  const p = s.planes.find(x => x.id === id);
  if (!p) return false;
  if (p.status === "fly" || p.status === "maint") { G.err = "Aircraft is busy — bring it to the gate first."; return false; }
  const t = aircraftById[p.typeId];
  const cost = paintCost(t);
  if (s.cash < cost) { G.err = `The paint shop wants ${fmtMoney(cost)}.`; return false; }
  s.cash -= cost; s.totCost += cost;
  finTrack("exp", "Paint shop", cost);
  p.livery = { ...(p.livery || {}), ...livery };
  // remember this as the house livery so future aircraft of this type match
  (s.typeLiveries = s.typeLiveries || {})[p.typeId] = { ...p.livery };
  p.status = "maint";
  p.timer = PAINT_DOWNTIME_MIN;
  p.paintJob = true;
  p.groundAfterLand = false;
  log(`🎨 ${p.id} rolled into the paint shop — fresh livery in ${fmtDur(PAINT_DOWNTIME_MIN)} (${fmtMoney(cost)}).`, "info");
  save();
  return true;
}

function buyFuel(tons) {
  const s = G.state;
  tons = Math.min(tons, Math.floor((fuelCap() - s.fuel) / 1000));   // clamp to tank space
  const cost = tons * s.fuelPrice;
  if (tons <= 0 || s.cash < cost) return false;
  s.cash -= cost; s.totCost += cost;
  finTrack("exp", "Fuel", cost);
  s.fuel += tons * 1000;
  save();
  return true;
}

function buyCO2(tons) {
  const s = G.state;
  tons = Math.min(tons, Math.floor((co2Cap() - s.co2) / 1000));     // clamp to account cap
  const cost = tons * s.co2Price;
  if (tons <= 0 || s.cash < cost) return false;
  s.cash -= cost; s.totCost += cost;
  finTrack("exp", "CO₂ quotas", cost);
  s.co2 += tons * 1000;
  save();
  return true;
}

function startCampaign(cid) {
  const s = G.state;
  const c = CAMPAIGNS.find(x => x.id === cid);
  if (!c || !campaignAvailable(c)) return false;
  const cost = campaignCost(c);
  if (s.cash < cost) return false;
  if (s.campaigns.some(x => x.id === cid && x.until > s.gameMin)) return false;
  s.cash -= cost; s.totCost += cost;
  finTrack("exp", "Marketing", cost);
  s.campaigns = s.campaigns.filter(x => x.until > s.gameMin);
  s.campaigns.push({ id: cid, until: s.gameMin + c.hours * 60 });
  const effect = c.repBoost
    ? `+${campaignEffectRep(c)} reputation`
    : `+${Math.round(campaignEffectBoost(c) * 100)}% demand`;
  log(`Marketing: "${c.name}" launched (${effect} for ${c.hours}h).`, "good");
  save();
  return true;
}

function buyLounge() {
  const s = G.state;
  if (s.lounges >= LOUNGES.length) return false;
  const tier = LOUNGES[s.lounges];
  if (s.cash < tier.cost) return false;
  s.cash -= tier.cost; s.totCost += tier.cost;
  finTrack("exp", "Lounges & partnerships", tier.cost);
  s.lounges++;
  log(`${tier.name} opened at ${s.hub} — +${Math.round(tier.boost * 100)}% demand on hub routes.`, "good");
  save();
  return true;
}

function joinAlliance(id) {
  const s = G.state;
  const al = ALLIANCES.find(a => a.id === id);
  if (!al || s.alliance === id) return false;
  if (s.pointsEarned < al.minPts || s.cash < al.cost) return false;
  s.cash -= al.cost; s.totCost += al.cost;
  finTrack("exp", "Lounges & partnerships", al.cost);
  s.alliance = id;
  log(`${s.airline} joined ${al.name}! Codeshare adds +${Math.round(al.boost * 100)}% demand network-wide, plus +${Math.round(al.csBoost * 100)}% per partner airline sharing a route.`, "good");
  save();
  return true;
}

function leaveAlliance() {
  const s = G.state;
  if (!s.alliance) return false;
  const al = ALLIANCES.find(a => a.id === s.alliance);
  s.alliance = null;
  log(`${s.airline} left ${al ? al.name : "its alliance"}.`, "info");
  save();
  return true;
}

// ---------------- simulation tick (1 game minute) ----------------

function tick(silent) {
  const s = G.state;
  if (!s) return;
  s.gameMin++;
  s.lastSimAt = Date.now();

  // commodity price random walk w/ mean reversion, every 15 game min
  if (s.gameMin % 15 === 0) {
    const fm = fuelDiffMult();
    s.fuelPrice = walk(s.fuelPrice, FUEL_MEAN * fm * eventPriceMult("fuel"), FUEL_STEP * fm, FUEL_LO * fm, FUEL_HI * fm);
    s.co2Price = walk(s.co2Price, 180 * eventPriceMult("co2"), 12, 108, 360);
    s.fuelHist.push(Math.round(s.fuelPrice));
    s.co2Hist.push(Math.round(s.co2Price));
    if (s.fuelHist.length > 96) s.fuelHist.shift();
    if (s.co2Hist.length > 96) s.co2Hist.shift();
  }

  // catering expires — purchase cost is already spent; leftovers are just waste
  if (s.catering && s.gameMin >= s.catering.until) {
    if (s.catering.qty > 0) discardCatering(s.catering.qty, s.catering.tier, "expired unsold", silent);
    s.catering = null;
  }

  // expire campaigns
  s.campaigns = s.campaigns.filter(c => c.until > s.gameMin);

  tickWeather(silent);

  // flight-school classes enrol and graduate on their own schedule
  tickSchools(silent);

  // rivals evolve once a day; lounge cleaners and flight instructors get paid too
  if (s.gameMin % 1440 === 0) {
    tickRivals(silent);
    for (const hub in (s.lounges2 || {})) {
      const lst = loungeStats(hub);
      if (!lst) continue;
      s.cash -= lst.upkeepDay;
      s.totCost += lst.upkeepDay;
      s.lounges2[hub].upkeepPaid = (s.lounges2[hub].upkeepPaid || 0) + lst.upkeepDay;
      finTrack("exp", "Lounges & partnerships", lst.upkeepDay);
    }
    for (const hub in (s.schools || {})) {
      const sst = schoolStats(hub);
      if (!sst) continue;
      s.cash -= sst.upkeepDay;
      s.totCost += sst.upkeepDay;
      s.schools[hub].upkeepPaid = (s.schools[hub].upkeepPaid || 0) + sst.upkeepDay;
      finTrack("exp", "Flight school", sst.upkeepDay);
    }
  }

  // used market rotates every 2 days; manufacturers launch on schedule
  if (s.gameMin % 2880 === 0) refreshUsedMarket(silent);
  // rivals nibble at the last airframes of limited production runs
  if (s.gameMin % 720 === 0) tickLimitedProd(silent);
  if (s.nextLaunch && s.gameMin >= s.nextLaunch && (s.customTypes || []).length < LAUNCH_MAX) genLaunch(silent);

  // world events: expire noisily, spawn occasionally
  for (const ev of s.events) {
    if (ev.until <= s.gameMin) {
      if (ev.kind === "used") {
        s.usedMarket = (s.usedMarket || []).filter(l => l.fromEvent !== ev.id);
      }
      if (!silent) log(`📰 Over: ${ev.name}.`, "info");
      noteWeek("news", `${ev.name} ends`, ev.desc);
    }
  }
  s.events = s.events.filter(ev => ev.until > s.gameMin);
  // News every ~6h; but guarantee at least 2 stories in the first two days so
  // the world never feels dead at the start.
  if (s.gameMin > 0 && s.gameMin % 360 === 0) {
    const needEarly = s.gameMin <= 2880 && (s.eventsSpawned || 0) < 2;
    if (needEarly || Math.random() < 0.3) genWorldEvent(silent);
  }

  // weekly gazette — Sunday edition summarizing the week's notable news
  if (s.gameMin > 0 && s.gameMin % WEEK_MIN === 0) publishWeeklyPaper(silent);

  // developer mode: bottomless wallet
  if (s.devInfinite && s.cash < 500e9) s.cash = 999e9;

  // hangar construction finishing?
  if (s.hangarUpg != null && s.gameMin >= s.hangarUpg) {
    s.hangarCap += HANGAR_STEP;
    s.hangarUpg = null;
    if (!silent) log(`Hangar expansion complete — capacity is now ${s.hangarCap} aircraft.`, "good");
  }

  // aircraft on order arrive
  processOrders(silent);

  // charter customers call now and then (unless the desk is closed)
  if (s.charterUnlocked) {
    s.charterOffers = s.charterOffers.filter(o => o.expires > s.gameMin);
    const hasSpec = s.planes.some(p => aircraftById[p.typeId] && aircraftById[p.typeId].charterSpec);
    const callChance = hasSpec ? 0.28 : 0.18;   // VIP jets keep the phone ringing
    if (!s.charterPaused && s.gameMin % 60 === 0 && Math.random() < callChance) genCharterOffer(silent);
  }

  // staff: payroll drains continuously; morale chases the pay-set target
  // and drags reputation with it
  const st = s.staff;
  if (st.pilots + st.crew > 0) {
    const payrollMin = dailyPayroll() / 1440;
    s.cash -= payrollMin;
    s.totCost += payrollMin;
    finTrack("exp", "Payroll", payrollMin);
    st.morale += (moraleTarget() - st.morale) * 0.002;
    s.reputation = Math.max(0, Math.min(100,
      s.reputation + (st.morale - 55) * 0.002 / 60));
  }

  // lease payments (daily rate charged per game-minute)
  for (const p of s.planes) {
    if (!p.leased) continue;
    const leaseMin = leaseDailyCost(aircraftById[p.typeId], p.engine) * (p.leaseRateMult || 1) / 1440;
    s.cash -= leaseMin;
    s.totCost += leaseMin;
    finTrack("exp", "Lease payments", leaseMin);
  }

  // leases run out after their 20-day term
  for (const p of [...s.planes]) {
    if (p.leased && p.leaseUntil != null && s.gameMin >= p.leaseUntil) {
      if (p.status === "fly" || p.status === "maint") {
        p.leaseExpired = true;               // hand it back on arrival
      } else {
        const t = aircraftById[p.typeId];
        s.planes.splice(s.planes.indexOf(p), 1);
        const need = staffNeeds(t, p.cabin);
        s.staff.pilots = Math.max(0, s.staff.pilots - need.pilots);
        s.staff.crew = Math.max(0, s.staff.crew - need.crew);
        s.staff.cadets = Math.min(s.staff.cadets || 0, s.staff.pilots);
        endLeaseCooldown(t);
        if (!silent) log(`📆 ${p.id}'s ${LEASE_MAX_DAYS}-day lease expired — returned to ${t.maker}.`, "info");
      }
    }
  }

  for (const p of s.planes) {
    // safety limit: force-ground anything that somehow exceeds 110% wear
    if (p.wear >= WEAR_SAFETY && p.status !== "maint" && p.status !== "ground") {
      if (p.status === "fly") {
        // finish the leg normally; applySafetyGround runs on landing
      } else {
        applySafetyGround(p, silent);
      }
    }

    if (p.status === "maint") {
      if (--p.timer <= 0) {
        if (p.paintJob || p.refitJob) {
          // paint shop / cabin refit only — wear untouched
          if (!silent) log(p.refitJob
            ? `🛠 ${p.id} rolls out of the cabin shop — refit complete.`
            : `🎨 ${p.id} fresh out of the paint shop — new livery gleaming.`, "good");
          p.paintJob = false;
          p.refitJob = false;
        } else {
          p.wear = 0;
          p.safetyFined = false;
          if (!silent) log(`${p.id} maintenance complete — airframe like new.`, "good");
        }
        p.status = p.route ? "turn" : "idle";
        p.timer = TURNAROUND_MIN;
      }
    } else if (p.status === "ground") {
      // parked — no departures until ungrounded / maintained
    } else if (p.status === "turn") {
      if (--p.timer <= 0) {
        // without the dispatch office, revenue departures need a manual send-off
        // (mid-journey tech stops and charters always continue on their own)
        const midLeg = (p.segIdx || 0) > 0 || !!p.charter;
        if (s.autoDepart || midLeg) {
          // CO₂ guard: hold at the gate and stand down auto-dispatch instead of overdrawing
          if (s.autoDepart && s.autoDepartGuardCO2 && !midLeg && wouldOverdraftCO2(p)) {
            p.status = "ready";
            s.autoDepart = false;
            if (!silent) {
              log(`🌍 Dispatch stood down — ${p.id} held at the gate to avoid a CO₂ overrun (−${CO2_OVERDRAFT_REP} rep if flown). Buy quota or depart manually.`, "bad");
            }
          } else {
            attemptDepart(p, silent);
          }
        } else {
          p.status = "ready";
        }
      }
    } else if (p.status === "ready") {
      // parked at the gate, waiting for dispatch
    } else if (p.status === "hold") {
      if (s.gameMin % 10 === 0) {
        if (p.charter) attemptCharterLeg(p, true);
        else attemptDepart(p, true);
      }
    } else if (p.status === "fly") {
      p.timer--;
      p.prog = 1 - p.timer / p.legTime;
      if (p.timer <= 0) landPlane(p, silent);
    }
  }
}

function walk(v, mean, step, lo, hi) {
  v += (Math.random() - 0.5) * 2 * step + (mean - v) * 0.05;
  return Math.max(lo, Math.min(hi, v));
}

function attemptDepart(p, silent) {
  const s = G.state;
  if (!p.route) { p.status = "idle"; return; }
  if (p.status === "ground") return;
  // storms over the departure airport can hold the flight at the gate
  {
    const origin = routePath(p)[p.segIdx];
    const wx = weatherAt(origin);
    if (wx && (p.wxCount || 0) < 2 && Math.random() < 0.3) {
      p.wxCount = (p.wxCount || 0) + 1;
      const wait = 20 + Math.round(Math.random() * 40);
      p.status = "turn";
      p.timer = wait;
      if (!silent) log(`⛈ ${p.id} held at ${origin} — ${wx} (${fmtDur(wait)} delay).`, "bad");
      return;
    }
  }
  if (p.wear >= WEAR_SAFETY) {
    applySafetyGround(p, silent);
    return;
  }
  const t = aircraftById[p.typeId];
  if (p.segIdx == null) p.segIdx = 0;
  const path = routePath(p);
  const a = airportByCode[path[p.segIdx]];
  const b = airportByCode[path[p.segIdx + 1]];
  const d = distKm(a, b);
  const burn = planeBurn(p);
  const speed = planeSpeed(p);
  // storms along the track force a diversion (~20 min longer, extra fuel)
  const divert = pathDiversion(a, b, speed);
  const fuelNeed = burn * (d + (divert ? divert.extraKm : 0));
  const co2Need = fuelNeed * typeCO2(t);          // kg
  if (s.fuel < fuelNeed) {
    if (p.status !== "hold" && !silent) log(`${p.id} held at ${a.code} — not enough fuel on hand.`, "bad");
    p.status = "hold"; p.holdReason = "fuel";
    return;
  }
  s.fuel -= fuelNeed;
  burnCO2Quota(co2Need, silent, `${p.id} ${a.code}→${b.code}`);
  if (p.segIdx === 0) {
    p._tripFuel = 0;
    p._tripCo2 = 0;
    maybeTrainDrop(`${p.id} departing ${a.code}`);
    if (Math.random() < DEPART_PTS_CHANCE) earnPoints(deptPoints(t));   // not every departure pays
  }
  p._tripFuel = (p._tripFuel || 0) + fuelNeed;
  p._tripCo2 = (p._tripCo2 || 0) + co2Need;
  p.status = "fly";
  p._paxThoughts = null;   // fresh cabin chatter for this departure
  p._paxThoughtPhase = null;
  p._paxPeople = null;
  p._paxThoughtSeed = null;
  p.holdReason = null;
  p.wxCount = 0;
  p.divertWx = divert ? divert.name : null;
  if (!silent && typeof sfx === "function") sfx("depart");
  p.legTime = Math.max(20, Math.round(d / speed * 60) + 25 + (divert ? divert.extraMin : 0));
  p.timer = p.legTime;
  p.prog = 0;
  if (divert && !silent) {
    log(`✈ ${p.id} diverted around ${divert.name} on ${a.code}→${b.code} — +${fmtDur(divert.extraMin)}.`, "bad");
  }
  // Start of a one-way trip: sell the tickets now; meals & extras settle on arrival.
  if (p.segIdx === 0 && !p.charter) boardAndCollectTickets(p, silent);
}

// Per-plane logbook, newest first — kept for the life of the airframe.
function pushFlightHist(p, e) {
  (p.hist = p.hist || []).unshift(e);
}

// Flight profit cards (depart tickets / land extras) — queued so every flight
// gets a turn on screen even when the fleet is busy.
const FLIGHT_REPORT_Q_MAX = 16;
function pushFlightReport(rep) {
  const s = G.state;
  rep.seq = (s.repSeq = (s.repSeq || 0) + 1);
  s.lastReport = rep;
  const q = (s.reportQ = s.reportQ || []);
  q.push(rep);
  if (q.length > FLIGHT_REPORT_Q_MAX) q.splice(0, q.length - FLIGHT_REPORT_Q_MAX);
}

// Estimate who boards and what the tickets are worth for the current one-way.
// Pax routes use a per-class demand mix (F/J/Y) so a leisure hop won't fill a
// First-heavy cabin, while a long-haul hub pair rewards premium seats.
function calcBoarding(p) {
  const t = aircraftById[p.typeId];
  const from = airportByCode[p.route.from];
  const to = airportByCode[p.route.to];
  const d = distKm(from, to);
  const nStops = (p.route.stops || []).length;
  const isCargo = isFreighter(p);
  const touchesHub = p.route.from === G.state.hub || p.route.to === G.state.hub;
  const fare = p.route.fareMult || 1;
  const liveMult = demandMultiplier({ cargo: isCargo, touchesHub, from: p.route.from, to: p.route.to }) *
    stopoverPenalty(nStops, isCargo) *
    eventDemandMult(from, to, isCargo) *
    (isCargo ? 1 : crewDemandMult());
  const poolRem = routePoolRemaining(p.route.from, p.route.to, isCargo);
  const demandBase = poolRem * liveMult;
  const dailyCap = routeDailyCapacity(p.route.from, p.route.to, isCargo);
  const periodCap = Math.max(1, dailyCap * (demandPeriodHours() / 24));
  const myShare = competitionShare(p.route.from, p.route.to, isCargo, dailyCap);
  let load = Math.min(1, demandBase * Math.pow(fare, -FARE_ELASTICITY) * myShare / periodCap);
  if (p.wear > 80) load *= 0.8;
  if (p.wear >= 100) load *= 0.6;
  // Reputation caps fill (cargo softer), then every flight jitters ±10 percentage
  // points so identical demand still books differently — matching the help text.
  const rep01 = effReputation() / 100;
  const repBase = isCargo ? 0.5 + 0.5 * rep01 : rep01;
  load = Math.min(load, repBase);
  const repDev = Math.random() * 0.2 - 0.1;   // ±10 pp every flight
  load = Math.max(0.05, Math.min(1, load + repDev));

  let revenue, fees, ops, carried, unitLabel, f = 0, j = 0, y = 0;
  let costLines = [];
  let mix = null;
  if (isCargo) {
    carried = Math.round(planeTons(p) * load * 10) / 10;
    unitLabel = `${carried} t freight`;
    revenue = carried * (650 + 1.35 * d) * fare * revDiffMult();
    const tons = planeTons(p) || t.tons || 20;
    const airportFee = (from.size + to.size) * 30 * (0.7 + 0.3 * Math.min(2.5, tons / 25));
    const freightH = carried * 8 + tons * 1.5;          // handling + bay for the freighter
    const cargoOps = carried * 22 + tons * 4;            // bigger holds cost more to run
    fees = freightH + airportFee;
    ops = cargoOps;
    costLines = [
      { n: "Airport landing fees", a: airportFee },
      { n: "Freight handling & bay", a: freightH },
      { n: "Cargo ops", a: cargoOps },
    ];
  } else {
    // cabin kit sways bookings a little across every class
    load = Math.max(0.05, Math.min(1, load * amenDemandMult(p)));
    const cabin = p.cabin || defaultCabin(t);
    const fJ = p.route.fareJ || fare, fF = p.route.fareF || fare;
    mix = routeClassMix(from, to);
    const offered = Math.max(1, cabinPax(cabin));
    const share = {
      F: (cabin.F || 0) / offered,
      J: (cabin.J || 0) / offered,
      Y: (cabin.Y || 0) / offered,
    };
    // Over-offer a class vs route mix → empty seats; under-offer → that class packs out
    const fillCls = (cls, seats, fareMult, jitter) => {
      if (!seats) return 0;
      const demandRatio = mix[cls] / Math.max(0.02, share[cls]);
      const fareEl = Math.pow(fareMult / fare, -FARE_ELASTICITY);
      let L = load * Math.min(2.2, Math.max(0.15, demandRatio)) * CABIN_FILL[cls] * fareEl;
      L *= jitter;
      return Math.round(seats * Math.max(0, Math.min(1, L)));
    };
    f = fillCls("F", cabin.F, fF, 0.88 + Math.random() * 0.24);
    j = fillCls("J", cabin.J, fJ, 0.9 + Math.random() * 0.2);
    y = fillCls("Y", cabin.Y, fare, 0.92 + Math.random() * 0.16);
    carried = f + j + y;
    unitLabel = `${carried} pax` + (f || j ? ` (F${f}/J${j}/Y${y})` : "");
    revenue = (f * cabinFare("F", d) * fF + j * cabinFare("J", d) * fJ + y * cabinFare("Y", d) * fare) * revDiffMult();
    revenue += carried * amenIncomePerPax(p) * revDiffMult();
    // A3 novelty surcharge — people pay silly money to ride the stub
    if (t.id === "a3") revenue *= 4.8;

    // Costs scale with the airframe you brought and the cabin you fitted —
    // a First-heavy 777 pays more gate/galley than an all-Y regional, even empty.
    const units = cabinUnits(cabin);
    const sizeFactor = Math.min(3, Math.max(0.55, units / 120));
    const airportFee = (from.size + to.size) * 30 * (0.65 + 0.35 * sizeFactor);
    const gatePark = units * 1.35 + offered * 0.9;                 // space reserved at the gate
    const paxHandle = f * 9 + j * 5 + y * 3;                       // boarded handling by class
    const cabinSvc = f * 24 + j * 13 + y * 6;                      // meal/service cost by class
    const premiumReady = (cabin.F || 0) * 6 + (cabin.J || 0) * 2.5; // galleys kept ready
    const amenSvc = carried * serviceCostPerPax();
    fees = airportFee + gatePark + paxHandle;
    ops = cabinSvc + premiumReady + amenSvc;
    costLines = [
      { n: "Airport landing fees", a: airportFee },
      { n: "Gate & parking", a: gatePark },
      { n: "Passenger handling", a: paxHandle },
      { n: "Cabin service", a: cabinSvc },
    ];
    if (premiumReady > 0) costLines.push({ n: "Premium cabin readiness", a: premiumReady });
    if (amenSvc > 0) costLines.push({ n: "Amenity kits & gifts", a: amenSvc });
  }
  costLines = costLines.filter(l => l.a > 0).map(l => ({ n: l.n, a: Math.round(l.a) }));
  // display origin/destination follow the current direction of travel, so a
  // return leg reads BOS→JFK, not the fixed route pair JFK→JFK
  const dir = routePath(p);
  return {
    isCargo, carried, revenue, fees, ops, costLines, unitLabel, f, j, y, mix,
    from: dir[0], to: dir[dir.length - 1],
    cap: isCargo ? (planeTons(p) || t.tons) : (p.cabin ? cabinPax(p.cabin) : t.seats),
    fare: Math.round(fare * 100),
    liveMult,
  };
}

// Ticket / freight sales bank at pushback; extras settle when the wheels stop.
function boardAndCollectTickets(p, silent) {
  const s = G.state;
  const t = aircraftById[p.typeId];
  const b = calcBoarding(p);
  p.boarding = b;
  consumeDemandPool(b.from, b.to, b.isCargo, b.carried, b.liveMult);
  s.cash += b.revenue;
  s.totRevenue += b.revenue;
  finTrack("rev", b.isCargo ? "Cargo revenue" : "Ticket sales", b.revenue);
  p.profit += b.revenue;
  s.totFlights = (s.totFlights || 0) + 1;
  if (b.isCargo) s.totCargo = Math.round(((s.totCargo || 0) + (b.carried || 0)) * 10) / 10;
  else s.totPax = (s.totPax || 0) + Math.round(b.carried || 0);
  b._lifeCounted = true;
  const fuelT = planeBurn(p) * distKm(airportByCode[routePath(p)[0]], airportByCode[routePath(p)[1]]) / 1000;
  pushFlightReport({
    kind: "depart",
    plane: p.id, type: t.name,
    from: b.from, to: b.to,
    cargo: b.isCargo, carried: b.carried, cap: b.cap,
    revenue: b.revenue, costs: 0, net: b.revenue,
    meals: 0, lounge: 0,
    fuelT, co2T: fuelT * typeCO2(t),
    fare: b.fare, t: s.gameMin,
  });
  if (!silent) {
    log(`${p.id} departed ${b.from}→${b.to}: ${b.unitLabel}, ticket sales ${fmtMoney(b.revenue)}`, "money");
  }
}

function settleLandingExtras(p, arrived, silent) {
  const s = G.state;
  const t = aircraftById[p.typeId];
  let b = p.boarding;
  // older in-flight saves: fall back to computing everything now
  if (!b) {
    b = calcBoarding(p);
    s.cash += b.revenue;
    s.totRevenue += b.revenue;
    finTrack("rev", b.isCargo ? "Cargo revenue" : "Ticket sales", b.revenue);
    p.profit += b.revenue;
    s.totFlights = (s.totFlights || 0) + 1;
    if (b.isCargo) s.totCargo = Math.round(((s.totCargo || 0) + (b.carried || 0)) * 10) / 10;
    else s.totPax = (s.totPax || 0) + Math.round(b.carried || 0);
    b._lifeCounted = true;
  } else if (!b._lifeCounted) {
    // Departed before lifetime counters existed — credit once on landing.
    s.totFlights = (s.totFlights || 0) + 1;
    if (b.isCargo) s.totCargo = Math.round(((s.totCargo || 0) + (b.carried || 0)) * 10) / 10;
    else s.totPax = (s.totPax || 0) + Math.round(b.carried || 0);
    b._lifeCounted = true;
  }

  let mealSales = 0, mealServed = 0, mealName = null;
  if (!b.isCargo && b.carried > 0) {
    const cat = cateringActive();
    if (cat) {
      mealServed = Math.min(cat.qty, Math.round(b.carried));
      cat.qty = Math.max(0, cat.qty - mealServed);
      const meal = mealOf(cat.tier);
      mealName = meal.name;
      // sold onboard at retail — profit is sell − cost (cost was paid when loaded)
      mealSales = Math.round(mealServed * (meal.sell || meal.cost * 2.5));
      if (meal.rep > 0 && mealServed > 0) {
        s.reputation = Math.min(100, s.reputation + meal.rep);
      }
    }
  }

  let loungeTake = 0;
  if (!b.isCargo && b.carried > 0) {
    const lg = loungeAt(arrived.code);
    if (lg) {
      const lst = loungeStats(arrived.code);
      loungeTake = Math.round(b.carried * lst.incomePerPax);
      if (loungeTake > 0) {
        lg.earned = (lg.earned || 0) + loungeTake;
        finTrack("rev", "Lounges", loungeTake);
      }
    }
  }

  const landRev = mealSales + loungeTake;
  const landCost = b.fees + b.ops;
  const landNet = landRev - landCost;
  const costLines = (b.costLines && b.costLines.length)
    ? b.costLines
    : [
        b.fees ? { n: "Airport fees", a: Math.round(b.fees) } : null,
        b.ops ? { n: "Cabin / cargo ops", a: Math.round(b.ops) } : null,
      ].filter(Boolean);

  s.cash += landNet;
  if (landRev > 0) s.totRevenue += landRev;
  s.totCost += landCost;
  if (mealSales > 0) finTrack("rev", "Onboard meals", mealSales);
  if (b.fees > 0) finTrack("exp", "Airport fees", b.fees);
  if (b.ops > 0) finTrack("exp", "Cabin & ground ops", b.ops);

  p.flights++;
  p.profit += landNet;

  const tripMin = Math.round((p._tripMin || 0) + p.legTime);
  const totalNet = b.revenue + landNet;
  pushFlightHist(p, {
    t: s.gameMin, from: b.from, to: arrived.code,
    min: tripMin,
    pax: b.isCargo ? b.carried : Math.round(b.carried), cargo: b.isCargo, net: Math.round(totalNet),
    fuel: Math.round(p._tripFuel || 0),
    co2: Math.round(p._tripCo2 || 0),
  });
  p._tripMin = 0;
  p._tripFuel = 0;
  p._tripCo2 = 0;
  p.boarding = null;

  const repFuel = planeBurn(p) * routeTotalDist(p.route);
  pushFlightReport({
    kind: "land",
    plane: p.id, type: t.name,
    from: b.from, to: arrived.code,
    cargo: b.isCargo, carried: b.carried, cap: b.cap,
    revenue: landRev, costs: landCost, fees: b.fees, ops: b.ops, costLines,
    net: landNet,
    tickets: b.revenue, meals: mealSales, mealServed, mealName, lounge: loungeTake,
    fuelT: repFuel / 1000, co2T: repFuel * typeCO2(t) / 1000,
    fare: b.fare, t: s.gameMin,
  });

  if (p.wear >= 100)      s.reputation = Math.max(0, s.reputation - 2);
  else if (p.wear >= 70)  s.reputation = Math.max(0, s.reputation - 0.04);
  else if (p.wear >= 45)  s.reputation = Math.max(0, s.reputation - 0.01);
  else                    s.reputation = Math.min(100, s.reputation + 0.02);

  if (!silent) {
    const bits = [];
    if (mealSales > 0) bits.push(`${fmtNum(mealServed)} meals ${fmtMoney(mealSales)}`);
    if (loungeTake > 0) bits.push(`lounge ${fmtMoney(loungeTake)}`);
    for (const line of costLines) bits.push(`${line.n} −${fmtMoney(line.a)}`);
    log(`${p.id} landed at ${arrived.code}: ${b.unitLabel} · ${bits.join(" · ")} · ${fmtMoney(landNet)} extra`, "money");
  }

  // Happy crews leave a soft reputation bump; passengers say so in cabin thoughts.
  if (!silent && !b.isCargo && s.staff.morale >= 75 && Math.random() < 0.04) {
    s.reputation = Math.min(100, s.reputation + 0.3);
    p._crewKind = true;   // surface once in the plane-card thought feed
  }
}

function landPlane(p, silent) {
  const s = G.state;
  const t = aircraftById[p.typeId];

  // airframe wear accrues on every landing (trained pilots are gentler);
  // flight hours accrue forever and depress resale value
  p.wear = Math.min(WEAR_MAX, p.wear + Math.min(WEAR_PER_LANDING_MAX * wearDiffMult(),
    (p.legTime / 60) * WEAR_PER_HOUR * pilotWearMult() * wearDiffMult()));
  p.hours = (p.hours || 0) + p.legTime / 60;
  p.divertWx = null;
  p.prog = 0;   // leave the en-route icon immediately — parked uses planeLoc

  // --- charter: ferry leg arrived at the pickup airport ---
  if (p.charter && p.charter.phase === "ferry") {
    p.loc = p.charter.from;
    if (p.wear >= WEAR_SAFETY) { applySafetyGround(p, silent); return; }
    if (!silent) log(`${p.id} ferried to ${p.charter.from} — boarding charter passengers.`, "info");
    attemptCharterLeg(p, silent);
    return;
  }

  // --- charter completion ---
  if (p.charter) {
    const c = p.charter;
    p.loc = c.to;
    s.cash += c.pay;
    s.totRevenue += c.pay;
    finTrack("rev", "Charter flights", c.pay);
    s.totFlights++;
    p.flights++;
    p.profit += c.pay;
    s.reputation = Math.min(100, s.reputation + (c.spec ? 0.12 : 0.05));
    pushFlightHist(p, {
      t: s.gameMin, from: c.from, to: c.to, min: Math.round(p.legTime),
      pax: -1, cargo: false, net: Math.round(c.pay), charter: true,
      fuel: Math.round(p._tripFuel || 0),
      co2: Math.round(p._tripCo2 || 0),
    });
    p._tripMin = 0;
    p._tripFuel = 0;
    p._tripCo2 = 0;
    if (c.spec) rememberCharterClient(c);
    if (!silent) {
      const vipNote = c.client ? ` (${c.client})` : "";
      log(`${p.id} completed the charter to ${c.to}${vipNote} — ${fmtMoney(c.pay)} collected.`, "money");
    }
    p.charter = null;
    if (p.wear >= WEAR_SAFETY) { applySafetyGround(p, silent); return; }
    if (p.groundAfterLand) {
      p.groundAfterLand = false; p.status = "ground"; p.timer = 0; p.prog = 0;
      return;
    }
    if (p.route) { p.leg = 0; p.segIdx = 0; p.status = "turn"; p.timer = TURNAROUND_MIN; }
    else { p.status = "idle"; p.timer = 0; }
    maybeAutoMaint(p, c.to, silent);
    return;
  }

  const path = routePath(p);
  const arrived = airportByCode[path[p.segIdx + 1]];

  // --- intermediate tech stop: no revenue, quick turnaround ---
  if (p.segIdx + 1 < path.length - 1) {
    p._tripMin = (p._tripMin || 0) + p.legTime;   // air time so far this trip
    p.segIdx++;
    p.loc = arrived.code;
    if (p.wear >= WEAR_SAFETY) { applySafetyGround(p, silent); return; }
    if (p.groundAfterLand) {
      p.groundAfterLand = false; p.status = "ground"; p.timer = 0; p.prog = 0;
      if (!silent) log(`${p.id} grounded at stopover ${arrived.code} as requested.`, "info");
      return;
    }
    p.status = "turn";
    p.timer = TECH_STOP_MIN;
    return;
  }

  // --- revenue arrival: meals, lounges, fees & ops (tickets already banked) ---
  settleLandingExtras(p, arrived, silent);

  p.leg = 1 - p.leg;
  p.segIdx = 0;
  p.loc = arrived.code;

  if (p.wear >= WEAR_SAFETY) {
    applySafetyGround(p, silent);
    return;
  }
  if (p.groundAfterLand) {
    p.groundAfterLand = false;
    p.status = "ground";
    p.timer = 0;
    p.prog = 0;
    if (!silent) log(`${p.id} grounded on arrival as requested.`, "info");
    return;
  }

  p.status = "turn";
  p.timer = TURNAROUND_MIN;
  maybeAutoMaint(p, arrived.code, silent);
}

// Total one-way seats/day (or cargo tons/day) offered on a city pair by
// the whole fleet — pax and freighters serve separate markets.
function routeDailyCapacity(fromCode, toCode, cargo) {
  let cap = 0;
  for (const p of G.state.planes) {
    if (!p.route) continue;
    const t = aircraftById[p.typeId];
    if (isFreighter(p) !== !!cargo) continue;
    const same = (p.route.from === fromCode && p.route.to === toCode) ||
                 (p.route.from === toCode && p.route.to === fromCode);
    if (!same) continue;
    const nStops = (p.route.stops || []).length;
    const d = routeTotalDist(p.route);
    const speed = planeSpeed(p);
    const flightMin = d / speed * 60 + 25 * (nStops + 1);
    const rtMin = 2 * (flightMin + nStops * TECH_STOP_MIN + TURNAROUND_MIN);
    const seats = planeTons(p) || (p.cabin ? cabinPax(p.cabin) : t.seats);
    cap += seats * (1440 / rtMin);
  }
  return cap;
}

// ---------------- derived views ----------------

function fleetFuelPerDayTons() {
  let kg = 0;
  for (const p of G.state.planes) {
    if (!p.route) continue;
    const nStops = (p.route.stops || []).length;
    const d = routeTotalDist(p.route);
    const speed = planeSpeed(p);
    const burn = planeBurn(p);
    const flightMin = d / speed * 60 + 25 * (nStops + 1);
    const rtMin = 2 * (flightMin + nStops * TECH_STOP_MIN + TURNAROUND_MIN);
    kg += burn * d * 2 * (1440 / rtMin);
  }
  return kg / 1000;
}

function levelInfo() {
  const s = G.state;
  let cur = LEVELS[0], next = null;
  for (const l of LEVELS) {
    if (s.pointsEarned >= l.pts) cur = l; else { next = l; break; }
  }
  return { cur, next };
}

function earnPoints(n) {
  G.state.points += n;
  G.state.pointsEarned += n;
}

// rare training-point drops, rolled on every departure (~1 in 25)
function maybeTrainDrop(who) {
  if (Math.random() < TRAIN_DROP_CHANCE) {
    G.state.trainPts++;
    log(`🎓 ${who || "A crew"} handled a tricky departure beautifully — +1 training point (${G.state.trainPts} banked).`, "good");
  }
}

// ⭐ points land on roughly 1 in 5 departures; bigger metal pays more
const DEPART_PTS_CHANCE = 0.2;
function deptPoints(t) {
  const cap = t.tons ? t.tons * 3 : t.seats;   // rough pax-equivalence for freighters
  return 1 + (cap >= 150 ? 1 : 0) + (cap >= 300 ? 1 : 0);
}

function fuelCap() { return FUEL_CAP_BASE * 2 ** G.state.fuelCapLvl; }   // kg
function co2Cap() { return CO2_CAP_BASE * 2 ** G.state.co2CapLvl; }      // kg

function upgradeFuelCap() {
  const s = G.state;
  const cost = TANK_UPGRADE_PTS[s.fuelCapLvl];
  if (cost == null || s.points < cost) return false;
  s.points -= cost;
  s.fuelCapLvl++;
  log(`Fuel farm expanded to ${fmtNum(fuelCap() / 1000)} t storage (−${cost} pts).`, "good");
  save();
  return true;
}

function upgradeCo2Cap() {
  const s = G.state;
  const cost = TANK_UPGRADE_PTS[s.co2CapLvl];
  if (cost == null || s.points < cost) return false;
  s.points -= cost;
  s.co2CapLvl++;
  log(`CO₂ quota account raised to ${fmtNum(co2Cap() / 1000)} t (−${cost} pts).`, "good");
  save();
  return true;
}

// pay = "cash" | "points"
function startHangarUpgrade(pay) {
  const s = G.state;
  if (s.hangarUpg != null) return false;            // already building
  if (pay === "cash") {
    const cost = hangarCashCost();
    if (s.cash < cost) return false;
    s.cash -= cost; s.totCost += cost;
    finTrack("exp", "Hubs & infrastructure", cost);
  } else {
    const cost = hangarPtsCost();
    if (s.points < cost) return false;
    s.points -= cost;
  }
  s.hangarUpg = s.gameMin + hangarBuildMin();
  log(`Hangar expansion started — +${HANGAR_STEP} bays in ${fmtDur(hangarBuildMin())}.`, "info");
  save();
  return true;
}

// ---------------- charter operations ----------------

function unlockCharter() {
  const s = G.state;
  if (s.charterUnlocked || s.points < CHARTER_UNLOCK_PTS) return false;
  s.points -= CHARTER_UNLOCK_PTS;
  s.charterUnlocked = true;
  s.charterPaused = false;
  log(`Charter desk opened! Customers will call with one-off flights (−${CHARTER_UNLOCK_PTS} pts). VIP bizjets are now available in the shop and earn a bonus with repeat clients.`, "good");
  genCharterOffer(false);           // first customer calls right away
  // VIP jets may now roll onto the used ramp
  if ((s.usedMarket || []).length) refreshUsedMarket(true);
  save();
  return true;
}

function toggleCharterDesk() {
  const s = G.state;
  if (!s.charterUnlocked) return false;
  s.charterPaused = !s.charterPaused;
  if (s.charterPaused) {
    s.charterOffers = [];           // hang up on pending callers
    log("📞 Charter desk closed for now — no new requests until you reopen it.", "info");
  } else {
    log("📞 Charter desk back on duty — customers may call again.", "good");
    genCharterOffer(false);
  }
  save();
  return true;
}

function charterBasePay(d, vip) {
  const rate = 210 + Math.random() * 150;
  let pay = 120000 + d * rate;
  if (vip) pay *= 1.12;             // loyal clients tip a little more
  return Math.round(pay / 1000) * 1000;
}

function charterBrief(a, b, opts = {}) {
  if (opts.client) {
    const vipLines = [
      `${opts.client} requests a private ferry`,
      `${opts.client} needs their usual shuttle`,
      `Repeat booking — ${opts.client} on the move again`,
    ];
    return vipLines[Math.floor(Math.random() * vipLines.length)];
  }
  const regional = [];
  for (const c of [a && a.country, b && b.country]) {
    if (!c) continue;
    const pool = CHARTER_BRIEF_BY_COUNTRY[c];
    if (pool) regional.push(...pool);
  }
  // Prefer local color when either end has it; still mix in plain business often.
  const pool = regional.length && Math.random() < 0.72
    ? regional
    : CHARTER_BRIEF_GENERIC;
  return pool[Math.floor(Math.random() * pool.length)];
}

function rememberCharterClient(c) {
  const s = G.state;
  if (!Array.isArray(s.charterClients)) s.charterClients = [];
  let client = c.client;
  if (!client) {
    const used = new Set(s.charterClients.map(x => x.name));
    const pool = CHARTER_VIP_NAMES.filter(n => !used.has(n));
    client = pool.length ? pool[Math.floor(Math.random() * pool.length)]
      : CHARTER_VIP_NAMES[Math.floor(Math.random() * CHARTER_VIP_NAMES.length)];
  }
  let row = s.charterClients.find(x => x.name === client);
  if (!row) {
    // Chance to convert a one-off into a repeat VIP after a specialist flight
    if (c.client || Math.random() < 0.65) {
      row = { name: client, trips: 0, lastFrom: c.from, lastTo: c.to };
      s.charterClients.push(row);
      while (s.charterClients.length > CHARTER_VIP_MAX) s.charterClients.shift();
      if (!c.client) log(`⭐ ${client} loved the VIP cabin — they'll call again.`, "good");
    }
  }
  if (row) {
    row.trips = (row.trips || 0) + 1;
    row.lastFrom = c.from;
    row.lastTo = c.to;
  }
}

function genCharterOffer(silent) {
  const s = G.state;
  if (s.charterPaused) return;
  const paxPlanes = s.planes.filter(p => !aircraftById[p.typeId].tons);
  if (!paxPlanes.length || s.charterOffers.length >= CHARTER_MAX_OFFERS) return;
  const maxRange = Math.max(...paxPlanes.map(p => aircraftById[p.typeId].range));
  const hasSpec = paxPlanes.some(p => aircraftById[p.typeId].charterSpec);
  const clients = s.charterClients || [];
  // Specialists + a VIP book → often a repeat booking instead of a cold call
  const wantVip = hasSpec && clients.length && Math.random() < (0.35 + Math.min(0.35, clients.length * 0.06));

  for (let tries = 0; tries < 30; tries++) {
    let a, b, client = null, vip = false;
    if (wantVip) {
      const vipRow = clients[Math.floor(Math.random() * clients.length)];
      client = vipRow.name;
      vip = true;
      // Prefer a hub touch + their last airports so the booking feels familiar
      const prefer = [vipRow.lastFrom, vipRow.lastTo].filter(Boolean);
      const fromCode = prefer[Math.floor(Math.random() * prefer.length)] || s.hubs[Math.floor(Math.random() * s.hubs.length)];
      a = airportByCode[fromCode] || AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)];
      b = Math.random() < 0.55
        ? airportByCode[s.hubs[Math.floor(Math.random() * s.hubs.length)]]
        : AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)];
      if (a.code === b.code) b = AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)];
    } else {
      a = AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)];
      b = Math.random() < 0.5 ? airportByCode[s.hubs[Math.floor(Math.random() * s.hubs.length)]]
                              : AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)];
    }
    if (a.code === b.code) continue;
    const d = distKm(a, b);
    if (d < 400 || d > maxRange) continue;
    if (s.charterOffers.some(o => o.from === a.code && o.to === b.code)) continue;
    const pay = charterBasePay(d, vip);
    const life = vip ? CHARTER_LIFE_MIN + 2 * 60 : CHARTER_LIFE_MIN;
    const brief = charterBrief(a, b, { client });
    s.charterId = (s.charterId || 0) + 1;
    s.charterOffers.push({
      id: s.charterId, from: a.code, to: b.code, pay, expires: s.gameMin + life,
      client: client || null, vip, brief,
    });
    if (!silent) {
      const who = client ? `${client} · ` : "";
      const tag = vip ? " (repeat client)" : "";
      log(`📞 Charter request: ${who}${a.code} → ${b.code} — ${brief} (${Math.round(d)} km) pays ${fmtMoney(pay)}${tag} — accept it in Fleet Management.`, "good");
    }
    return;
  }
}

function planeLoc(p) {
  return p.loc || p.homeHub || G.state.hub;
}

function acceptCharter(offerId, planeId) {
  G.err = null;
  const s = G.state;
  const o = s.charterOffers.find(x => x.id === offerId);
  if (!o) { G.err = "That offer has expired."; return false; }
  const p = s.planes.find(x => x.id === planeId);
  if (!p) { G.err = "Pick an aircraft for the charter."; return false; }
  const t = aircraftById[p.typeId];
  if (isFreighter(p)) { G.err = "Charter customers want a passenger aircraft."; return false; }
  if (p.status === "fly" || p.status === "maint" || p.status === "ground") { G.err = `${p.id} is not available right now.`; return false; }
  if (p.wear >= WEAR_SAFETY) { G.err = `${p.id} needs maintenance first.`; return false; }
  const a = airportByCode[o.from], b = airportByCode[o.to];
  const d = distKm(a, b);
  if (d > t.range) { G.err = `${fmtNum(d)} km is beyond the ${t.name}'s range.`; return false; }
  const loc = planeLoc(p);
  const ferryD = loc === o.from ? 0 : distKm(airportByCode[loc], a);
  if (ferryD > t.range) { G.err = `${p.id} can't reach ${o.from} from ${loc} in one hop.`; return false; }
  // pay for the first leg now (ferry if needed, otherwise the revenue leg)
  const firstFrom = ferryD > 0 ? airportByCode[loc] : a;
  const firstTo = ferryD > 0 ? a : b;
  const firstD = ferryD > 0 ? ferryD : d;
  const spd = planeSpeed(p);
  const divert = pathDiversion(firstFrom, firstTo, spd);
  const fuelNeed = planeBurn(p) * (firstD + (divert ? divert.extraKm : 0));
  const co2Need = fuelNeed * typeCO2(t);
  if (s.fuel < fuelNeed) { G.err = `Not enough fuel on hand (needs ${fmtNum(fuelNeed / 1000)} t).`; return false; }
  s.fuel -= fuelNeed;
  burnCO2Quota(co2Need, false, `${p.id} charter`);
  p._tripFuel = fuelNeed;
  p._tripCo2 = co2Need;
  maybeTrainDrop(`${p.id} departing ${loc} on charter duty`);
  if (Math.random() < DEPART_PTS_CHANCE) earnPoints(deptPoints(t));
  s.charterOffers = s.charterOffers.filter(x => x.id !== offerId);
  if (typeof sfx === "function") sfx("depart");
  const spec = !!t.charterSpec;
  let pay = o.pay;
  if (spec) pay = Math.round(pay * CHARTER_SPEC_PAY / 1000) * 1000;
  p.charter = {
    from: o.from, to: o.to, pay,
    phase: ferryD > 0 ? "ferry" : "revenue",
    ferryFrom: ferryD > 0 ? loc : null,
    client: o.client || null,
    vip: !!o.vip,
    brief: o.brief || null,
    spec,
  };
  p.status = "fly";
  p._paxThoughts = null;
  p._paxThoughtPhase = null;
  p._paxPeople = null;
  p._paxThoughtSeed = null;
  p.holdReason = null;
  p.divertWx = divert ? divert.name : null;
  p.legTime = Math.max(20, Math.round(firstD / spd * 60) + 25 + (divert ? divert.extraMin : 0));
  p.timer = p.legTime;
  p.prog = 0;
  if (divert) log(`✈ ${p.id} diverted around ${divert.name} — +${fmtDur(divert.extraMin)}.`, "bad");
  const bonusNote = spec ? ` (+${Math.round((CHARTER_SPEC_PAY - 1) * 100)}% VIP jet bonus)` : "";
  const who = o.client ? ` for ${o.client}` : "";
  log(ferryD > 0
    ? `${p.id} accepted the charter ${o.from} → ${o.to}${who} for ${fmtMoney(pay)}${bonusNote} — ferrying from ${loc} first (~${fmtDur(p.legTime)}).`
    : `${p.id} accepted the charter ${o.from} → ${o.to}${who} for ${fmtMoney(pay)}${bonusNote}.`, "info");
  save();
  return true;
}

// Depart the paying leg of a charter (used after a ferry, and for
// fuel-hold retries mid-charter).
function attemptCharterLeg(p, silent) {
  const s = G.state;
  const c = p.charter;
  if (!c) return;
  const a = airportByCode[c.from], b = airportByCode[c.to];
  const d = distKm(a, b);
  const spd = planeSpeed(p);
  const divert = pathDiversion(a, b, spd);
  const fuelNeed = planeBurn(p) * (d + (divert ? divert.extraKm : 0));
  const co2Need = fuelNeed * typeCO2(aircraftById[p.typeId]);
  if (s.fuel < fuelNeed) {
    if (p.status !== "hold" && !silent) log(`${p.id} held at ${c.from} — charter waiting on fuel.`, "bad");
    p.status = "hold";
    p.holdReason = "fuel";
    return;
  }
  s.fuel -= fuelNeed;
  burnCO2Quota(co2Need, silent, `${p.id} charter ${c.from}→${c.to}`);
  p._tripFuel = (p._tripFuel || 0) + fuelNeed;
  p._tripCo2 = (p._tripCo2 || 0) + co2Need;
  c.phase = "revenue";
  p.status = "fly";
  p._paxThoughts = null;
  p._paxThoughtPhase = null;
  p._paxPeople = null;
  p._paxThoughtSeed = null;
  p.holdReason = null;
  p.divertWx = divert ? divert.name : null;
  p.legTime = Math.max(20, Math.round(d / spd * 60) + 25 + (divert ? divert.extraMin : 0));
  p.timer = p.legTime;
  p.prog = 0;
  if (divert && !silent) log(`✈ ${p.id} diverted around ${divert.name} — +${fmtDur(divert.extraMin)}.`, "bad");
}

function declineCharter(offerId) {
  const s = G.state;
  const o = s.charterOffers.find(x => x.id === offerId);
  if (!o) return false;
  s.charterOffers = s.charterOffers.filter(x => x.id !== offerId);
  log(`Charter request ${o.from} → ${o.to} declined.`, "info");
  save();
  return true;
}

// Dispatch office: 10 training points buys automatic departures.
// Without it, planes wait at the gate after turnaround for a manual send-off.
const AUTODEPART_TP = 10;

function unlockAutoDepart() {
  G.err = null;
  const s = G.state;
  if (s.autoDepart) return false;
  if (s.trainPts < AUTODEPART_TP) {
    G.err = `The dispatch office costs ${AUTODEPART_TP} training points (you have ${s.trainPts}).`;
    return false;
  }
  s.trainPts -= AUTODEPART_TP;
  s.autoDepart = true;
  s.autoDepartOwned = true;
  log(`🛫 Dispatch office staffed — departures are now handled automatically (−${AUTODEPART_TP} TP).`, "good");
  save();
  return true;
}

function toggleAutoDepart() {
  const s = G.state;
  if (!s.autoDepartOwned) return false;
  s.autoDepart = !s.autoDepart;
  log(s.autoDepart ? "🛫 Dispatch office back on duty — automatic departures resumed."
                   : "🛫 Dispatch office stood down — departures are manual until you say otherwise.", "info");
  save();
  return true;
}

function toggleAutoDepartGuardCO2() {
  const s = G.state;
  if (!s.autoDepartOwned) return false;
  s.autoDepartGuardCO2 = !s.autoDepartGuardCO2;
  log(s.autoDepartGuardCO2
    ? "🌍 Dispatch will stand down automatically if a departure would overdraw CO₂."
    : "🌍 CO₂ dispatch guard off — auto-departures will fly into overdraft.", "info");
  save();
  return true;
}

function departPlane(id) {
  G.err = null;
  const p = G.state.planes.find(x => x.id === id);
  if (!p || (p.status !== "ready" && p.status !== "hold")) {
    G.err = "That aircraft isn't waiting for dispatch.";
    return false;
  }
  attemptDepart(p, false);
  // Still waiting (fuel/weather/etc.) — surface the hold reason
  if (p.status !== "fly") {
    G.err = p.holdReason === "fuel" ? "Not enough fuel on hand."
      : (G.err || "Could not depart — check fuel, weather, and wear.");
    save();
    return false;
  }
  save();
  return true;
}

/** Dispatch every Ready aircraft. Returns a summary for one fleet card (or null). */
function departAllReady() {
  const s = G.state;
  const beforeSeq = s.repSeq || 0;
  const launched = [];
  for (const p of s.planes) {
    if (p.status !== "ready") continue;
    attemptDepart(p, true);
    if (p.status === "fly") launched.push(p.id);
  }
  if (!launched.length) return null;

  // Fold the per-plane depart reports into one fleet summary so the UI
  // doesn't flash a card for every takeoff.
  const q = (s.reportQ = s.reportQ || []);
  const mine = [];
  const keep = [];
  const launchedSet = new Set(launched);
  for (const r of q) {
    if (r.kind === "depart" && r.seq > beforeSeq && launchedSet.has(r.plane)) mine.push(r);
    else keep.push(r);
  }
  s.reportQ = keep;

  let revenue = 0, pax = 0, cargoT = 0, fuelT = 0, co2T = 0, capPax = 0, capCargo = 0;
  const routeKeys = new Set();
  for (const r of mine) {
    revenue += r.revenue || 0;
    fuelT += r.fuelT || 0;
    co2T += r.co2T || 0;
    if (r.cargo) {
      cargoT += r.carried || 0;
      capCargo += r.cap || 0;
    } else {
      pax += r.carried || 0;
      capPax += r.cap || 0;
    }
    if (r.from && r.to) routeKeys.add([r.from, r.to].sort().join("-"));
  }
  const summary = {
    kind: "departAll",
    n: launched.length,
    routes: routeKeys.size,
    revenue: Math.round(revenue),
    pax: Math.round(pax),
    cargoT: Math.round(cargoT * 10) / 10,
    capPax: Math.round(capPax),
    capCargo: Math.round(capCargo * 10) / 10,
    fuelT: Math.round(fuelT * 10) / 10,
    co2T: Math.round(co2T * 10) / 10,
    planeIds: launched,
    t: s.gameMin,
  };
  pushFlightReport(summary);
  log(`🛫 Dispatched ${launched.length} waiting aircraft — tickets ${fmtMoney(summary.revenue)}.`, "money");
  save();
  return summary;
}

// Past 30 bays, single hangar spaces can be bought with training points
const HANGAR_TP_MIN_CAP = 30;
const HANGAR_TP_COST = 3;

function buyHangarBayTP() {
  G.err = null;
  const s = G.state;
  if (s.hangarCap < HANGAR_TP_MIN_CAP) {
    G.err = `Training-point bays unlock at ${HANGAR_TP_MIN_CAP} hangar spaces.`;
    return false;
  }
  if (s.trainPts < HANGAR_TP_COST) {
    G.err = `Needs ${HANGAR_TP_COST} training points.`;
    return false;
  }
  s.trainPts -= HANGAR_TP_COST;
  s.hangarCap += 1;
  log(`Ground crew improvised an extra hangar bay — capacity ${s.hangarCap} (−${HANGAR_TP_COST} TP).`, "good");
  save();
  return true;
}

// Widebody operations require experienced pilots: Pilot training level 3
// certifies heavy aircraft — no leasing an A380 on day one.
// (s.wideUnlocked grandfathers old saves, and is also earned when a
// widebody-simulator class graduates from your flight school.)
const WIDE_PILOT_LVL = 3;

function wideAllowed() {
  return trainLevel("pilot") >= WIDE_PILOT_LVL || !!G.state.wideUnlocked;
}

function unlockCargo() {
  const s = G.state;
  if (s.cargoUnlocked || s.points < CARGO_UNLOCK_PTS) return false;
  s.points -= CARGO_UNLOCK_PTS;
  s.cargoUnlocked = true;
  log(`Cargo division founded! New freighters and any used freighters on the ramp are now buyable (−${CARGO_UNLOCK_PTS} pts).`, "good");
  save();
  return true;
}

function globeFlightEntry(p) {
  if (!p || p.status !== "fly") return null;
  if (p.charter) {
    const c = p.charter;
    const segA = c.phase === "ferry" ? (c.ferryFrom || c.from) : c.from;
    const segB = c.phase === "ferry" ? c.from : c.to;
    const a = airportByCode[segA], b = airportByCode[segB];
    if (!a || !b) return null;
    return { id: p.id, from: a, to: b, prog: Math.max(0, Math.min(1, p.prog || 0)), segA, segB };
  }
  if (!p.route) return null;
  const dir = routePath(p);
  const i = Math.min(Math.max(0, p.segIdx || 0), Math.max(0, dir.length - 2));
  const a = airportByCode[dir[i]], b = airportByCode[dir[i + 1]];
  if (!a || !b) return null;
  return { id: p.id, from: a, to: b, prog: Math.max(0, Math.min(1, p.prog || 0)), segA: dir[i], segB: dir[i + 1] };
}

/** Cheap per-frame refresh so landings leave the en-route icon immediately. */
function syncGlobeFlights(state) {
  if (!state || !G.state) return;
  const planesInFlight = [];
  const parked = {};
  for (const p of G.state.planes) {
    const flight = globeFlightEntry(p);
    if (flight) {
      planesInFlight.push(flight);
      continue;
    }
    const at = planeLoc(p);
    if (!at) continue;
    if (!parked[at]) parked[at] = [];
    parked[at].push(p.id);
  }
  state.planesInFlight = planesInFlight;
  state.parked = parked;
}

function globeState() {
  const s = G.state;
  const routeCodes = new Set();
  const pairs = new Map();
  const addPair = (c1, c2, highlight) => {
    if (!c1 || !c2 || !airportByCode[c1] || !airportByCode[c2]) return;
    const key = [c1, c2].sort().join("-");
    if (!pairs.has(key)) {
      pairs.set(key, { from: airportByCode[c1], to: airportByCode[c2], highlight: false });
    }
    if (highlight) pairs.get(key).highlight = true;
  };
  for (const p of s.planes) {
    const flight = globeFlightEntry(p);
    if (flight) addPair(flight.segA, flight.segB, true);
    if (!p.route) continue;
    const path = [p.route.from, ...(p.route.stops || []), p.route.to];
    for (const c of path) routeCodes.add(c);
    for (let i = 0; i < path.length - 1; i++) addPair(path[i], path[i + 1], false);
  }
  const weather = (s.weather || []).map(w => {
    const z = WEATHER_ZONES[w.zone];
    return { lat: z.lat, lon: z.lon, name: z.name, typhoon: !!z.typhoon };
  });
  const state = {
    hub: s.hub, hubs: new Set(s.hubs), routeCodes,
    routeList: [...pairs.values()],
    planesInFlight: [], parked: {}, weather,
  };
  syncGlobeFlights(state);
  return state;
}

// ---------------- helpers ----------------

function log(msg, kind) {
  const s = G.state;
  if (!s) return;
  if (!Array.isArray(s.log)) s.log = [];
  s.logSeq = (s.logSeq || 0) + 1;
  s.log.unshift({ t: s.gameMin, msg, kind: kind || "info", seq: s.logSeq });
  if (s.log.length > LOG_MAX) s.log.length = LOG_MAX;
}

function fmtMoney(v) {
  const sign = v < 0 ? "-" : "";
  v = Math.abs(v);
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(v)}`;
}

function fmtNum(v) { return Math.round(v).toLocaleString("en-US"); }

// Unit preference: "metric" (km, km/h) or "imperial" (mi, kts)
function unitsPref() {
  try { return localStorage.getItem("sky_units") === "imperial" ? "imperial" : "metric"; }
  catch (_) { return "metric"; }
}

// Globe appearance: detailed satellite-style texture or the lightweight vector map.
function mapStylePref() {
  try { return localStorage.getItem("sky_map_style") === "simple" ? "simple" : "texture"; }
  catch (_) { return "texture"; }
}

// When true, airport dots draw above parked aircraft (harder to click planes).
// Default false: parked planes sit on top of the dots so they stay clickable.
function airportsOnTopPref() {
  try { return localStorage.getItem("sky_airports_on_top") === "1"; }
  catch (_) { return false; }
}

function fmtDist(km) {
  return unitsPref() === "imperial" ? `${fmtNum(km * 0.621371)} mi` : `${fmtNum(km)} km`;
}

function fmtSpeed(kmh) {
  return unitsPref() === "imperial" ? `${fmtNum(kmh * 0.539957)} kts` : `${fmtNum(kmh)} km/h`;
}

function fmtClock(gameMin) {
  const day = Math.floor(gameMin / 1440) + 1;
  const m = gameMin % 1440;
  return `Day ${day} · ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function fmtDur(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
