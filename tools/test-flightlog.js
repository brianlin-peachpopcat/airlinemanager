// Headless smoke test for the per-plane flight logbook. Run: node tools/test-flightlog.js
const fs = require("fs"), path = require("path"), vm = require("vm");
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const root = path.join(__dirname, "..");
const test = `
newGame("TestAir", "JFK", "fast", "a320");
const s = G.state;
s.autoDepart = true;
s.cash = 1e9; s.fuel = 1e9; s.co2 = 1e9;
const p = s.planes[0];
assignRoute(p.id, "JFK", "BOS");
p.status = "ready";
attemptDepart(p, true);

// fly 30 game-days; every landing should append a log entry, capped at 10
for (let i = 0; i < 1440 * 30; i++) tick(true);

const hist = p.hist || [];
console.log("flights flown:", p.flights, "| log entries:", hist.length);
console.log("capped at 10:", hist.length === 10 && p.flights > 10 ? "(OK)" : "(FAIL)");
const shapeOk = hist.every(h =>
  typeof h.t === "number" && typeof h.min === "number" && h.min > 0 &&
  typeof h.pax === "number" && h.pax >= 0 && typeof h.net === "number" &&
  h.from && h.to);
console.log("entries well-formed:", shapeOk ? "(OK)" : "(FAIL)", JSON.stringify(hist[0]));
const newestFirst = hist.every((h, i) => i === 0 || hist[i - 1].t >= h.t);
console.log("newest first:", newestFirst ? "(OK)" : "(FAIL)");
const dirsOk = hist.every(h =>
  (h.from === "JFK" && h.to === "BOS") || (h.from === "BOS" && h.to === "JFK"));
console.log("route endpoints correct:", dirsOk ? "(OK)" : "(FAIL)");

// logged block times must be a plausible JFK-BOS hop (~300 km)
const timesOk = hist.every(h => h.min >= 20 && h.min <= 240);
console.log("flight times plausible:", timesOk ? "(OK)" : "(FAIL)", hist.map(h => h.min).join(","));
`;
const src = "const DEG = Math.PI / 180;\n" +
  ["js/data.js", "js/game.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n" + test;
vm.runInThisContext(src);
