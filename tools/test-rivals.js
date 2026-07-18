// Headless smoke test for the competitor database. Run: node tools/test-rivals.js
const fs = require("fs"), path = require("path"), vm = require("vm");
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const root = path.join(__dirname, "..");
const test = `
// --- database sanity ---
const codes = new Set(AIRPORTS.map(a => a.code));
const badHubs = AIRLINE_DB.flatMap(a => a.hubs.filter(h => !codes.has(h)).map(h => a.name + ":" + h));
console.log("db size:", AIRLINE_DB.length,
  "| majors:", AIRLINE_DB.filter(a => a.tier === "major").length,
  "| mid:", AIRLINE_DB.filter(a => a.tier === "mid").length,
  "| regional:", AIRLINE_DB.filter(a => a.tier === "regional").length,
  "| worldwide:", AIRLINE_DB.filter(a => a.anywhere).length);
console.log("invalid hub codes:", badHubs.length ? badHubs.join(", ") : "none");
const names = AIRLINE_DB.map(a => a.name);
const dupes = names.filter((n, i) => names.indexOf(n) !== i);
console.log("duplicate names:", dupes.length ? dupes.join(", ") : "none");
const countries = new Set(AIRPORTS.map(a => a.country));
const badCountry = AIRLINE_DB.filter(a => !a.anywhere && !countries.has(a.country)).map(a => a.name + ":" + a.country);
console.log("unknown countries:", badCountry.length ? badCountry.join(", ") : "none");
console.log("worldwide carriers:", AIRLINE_DB.filter(a => a.anywhere).map(a => a.name).join(", "));

// --- seeding mix ---
newGame("TestAir", "JFK", "fast", "a320");
const s = G.state;
const mix = { global: 0, major: 0, mid: 0, regional: 0 };
for (const r of s.rivals) mix[r.tier] = (mix[r.tier] || 0) + 1;
console.log("seeded:", s.rivals.length, "rivals | mix:", JSON.stringify(mix));
console.log("all 5 globals present:", mix.global === 5 ? "(OK)" : "(FAIL)");
console.log("sample:", s.rivals.slice(0, 6).map(r => r.name).join(", "));
// two fresh worlds should (almost always) differ on the real-airline set
const first = s.rivals.filter(r => !r.anywhere).map(r => r.name).join("|");
newGame("TestAir2", "JFK", "fast", "a320");
console.log("worlds differ:", G.state.rivals.filter(r => !r.anywhere).map(r => r.name).join("|") !== first);

// --- route geography ---
newGame("GeoAir", "JFK", "fast", "a320");
// Force Air Canada into the roster so we can probe it
const ac = dbToRival(AIRLINE_DB.find(a => a.name === "Air Canada"));
G.state.rivals = [ac, ...G.state.rivals.filter(r => r.anywhere)];
const acHome = rivalsOnRoute("YYZ", "YVR", false).some(r => r.name === "Air Canada");
const acIntl = rivalsOnRoute("YYZ", "LHR", false).some(r => r.name === "Air Canada");
const acForeign = rivalsOnRoute("LHR", "CDG", false).some(r => r.name === "Air Canada");
console.log("Air Canada on YYZ-YVR (home):", acHome ? "(OK)" : "(FAIL)");
console.log("Air Canada on YYZ-LHR (from home):", acIntl ? "(OK)" : "(FAIL)");
console.log("Air Canada off LHR-CDG (no Canada):", !acForeign ? "(OK)" : "(FAIL)");
// plenty of city-pairs should stay open (no rivals)
{
  newGame("OpenAir", "JFK", "fast", "a320");
  const codes = AIRPORTS.filter(a => a.size >= 5).map(a => a.code);
  let empty = 0, total = 0;
  for (let i = 0; i < 80; i++) {
    const x = codes[Math.floor(Math.random() * codes.length)];
    const y = codes[Math.floor(Math.random() * codes.length)];
    if (x === y) continue;
    total++;
    if (!rivalsOnRoute(x, y, false).length) empty++;
  }
  const pct = Math.round(empty / total * 100);
  console.log("open routes in random sample:", empty + "/" + total, "(" + pct + "%)",
    pct >= 25 ? "(OK)" : "(FAIL — too crowded)");
}

// --- bankruptcy & replacement over simulated years ---
const logs = [];
const _log = log; log = (m, k) => { logs.push(m); };
let bankruptcies = 0, replacements = 0, mergers = 0;
for (let day = 0; day < 3000; day++) {
  tickRivals(true);
  for (const m of logs.splice(0)) {
    if (m.includes("bankruptcy")) bankruptcies++;
    if (m.includes("moving into the void")) replacements++;
    if (m.includes("surprise merger")) mergers++;
  }
}
log = _log;
console.log("over 3000 days — bankruptcies:", bankruptcies, "| replacements:", replacements, "| mergers:", mergers);
console.log("globals survived:", G.state.rivals.filter(r => r.anywhere).length === 5 ? "(OK)" : "(FAIL " + G.state.rivals.filter(r => r.anywhere).length + ")");
console.log("roster size stayed healthy:", G.state.rivals.length >= 12 && G.state.rivals.length <= 32, "(" + G.state.rivals.length + ")");
console.log("all rivals have tiers:", G.state.rivals.every(r => r.tier));

// --- real-life fleet mixes ---
const badTypes = [];
for (const [name, mix] of Object.entries(FLEET_MIX)) {
  for (const [tid] of mix) if (!aircraftById[tid]) badTypes.push(name + ":" + tid);
}
console.log("FLEET_MIX airlines:", Object.keys(FLEET_MIX).length, "/ db", AIRLINE_DB.length,
  "| unknown type ids:", badTypes.length ? badTypes.join(", ") : "none");
const noMix = AIRLINE_DB.filter(a => !FLEET_MIX[a.name]).map(a => a.name);
console.log("db airlines without a mix:", noMix.length ? noMix.join(", ") : "none");
let fleetOk = true;
for (const a of AIRLINE_DB) {
  const r = { id: "t" + a.name, name: a.name, reach: a.reach, fleet: a.fleet };
  const total = rivalFleet(r).reduce((x, f) => x + f.count, 0);
  if (total !== a.fleet) { fleetOk = false; console.log("  fleet count mismatch:", a.name, total, "!=", a.fleet); }
}
console.log("fleet counts always match:", fleetOk);
console.log("sample Emirats fleet (55):", JSON.stringify(rivalFleet({ id: "t", name: "Emirats", reach: "global", fleet: 55 })));
console.log("sample Global Air fleet (48):", JSON.stringify(rivalFleet({ id: "t", name: "Global Air", reach: "global", fleet: 48 })));
`;
const src = ["js/data.js", "js/game.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n" + test;
vm.runInThisContext(src);
