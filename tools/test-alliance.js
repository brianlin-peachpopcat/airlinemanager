// Headless smoke test for the alliance/codeshare system. Run: node tools/test-alliance.js
const fs = require("fs"), path = require("path"), vm = require("vm");
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const root = path.join(__dirname, "..");
const test = `
newGame("TestAir", "JFK", "fast", "a320");
const s = G.state;
console.log("alliances:", ALLIANCES.map(a => a.id + ":" + a.minPts + "pts +" + a.boost + "/+" + a.csBoost).join("  "));
console.log("rivals in an alliance:", s.rivals.filter(r => r.alliance).length, "/", s.rivals.length,
  "| independent:", s.rivals.filter(r => !r.alliance).map(r => r.name).join(", "));

s.pointsEarned = 5000; s.cash = 1e9;
const base = demandMultiplier({ from: "LHR", to: "JFK" });
console.log("join paragon (needs 1000 pts):", joinAlliance("paragon"));
const partners = codesharePartnersOnRoute("LHR", "JFK", false);
console.log("paragon partners on LHR-JFK:", partners.map(p => p.name).join(", ") || "none");
const allianceOnly = demandMultiplier({});
const withRoute = demandMultiplier({ from: "LHR", to: "JFK" });
console.log("mult: no alliance", base.toFixed(3), "| alliance only", allianceOnly.toFixed(3),
  "| alliance + partner route", withRoute.toFixed(3));
const expected = allianceOnly * (1 + 0.15 * Math.min(partners.length, CODESHARE_PARTNER_CAP));
console.log("route boost matches csBoost formula:", Math.abs(withRoute - expected) < 1e-9);

newGame("Poor Air", "JFK", "fast", "a320");
console.log("join paragon at 20 pts (want false):", joinAlliance("paragon"));
console.log("join star at 20 pts (want false, needs 50):", joinAlliance("star"));
G.state.pointsEarned = 60;
console.log("join star at 60 pts (want true):", joinAlliance("star"));

// old-save migration: strip alliance fields and reload
G.state.rivals.forEach(r => delete r.alliance);
localStorage.getItem = () => JSON.stringify(G.state);
load();
console.log("migration backfilled alliances:", G.state.rivals.filter(r => r.alliance !== undefined).length,
  "/", G.state.rivals.length, "| in alliance:", G.state.rivals.filter(r => r.alliance).length);
`;
const src = ["js/data.js", "js/game.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n" + test;
vm.runInThisContext(src);
