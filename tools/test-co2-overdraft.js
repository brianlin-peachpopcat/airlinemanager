// Headless smoke test for CO₂ overdraft departures. Run: node tools/test-co2-overdraft.js
const fs = require("fs"), path = require("path"), vm = require("vm");
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const root = path.join(__dirname, "..");
const test = `
newGame("Co2Air", "JFK", "fast", "a320");
const s = G.state;
s.autoDepart = true;
s.cash = 1e9; s.fuel = 1e9; s.co2 = 1000; // almost empty
assignRoute(s.planes[0].id, "JFK", "BOS");
const p = s.planes[0];
p.status = "ready";
const rep0 = s.reputation;
attemptDepart(p, true);
console.log("departed despite low co2:", p.status === "fly" ? "(OK)" : "(FAIL " + p.status + ")");
console.log("co2 negative:", s.co2 < 0 ? "(OK " + Math.round(s.co2) + ")" : "(FAIL " + s.co2 + ")");
console.log("rep hit:", (rep0 - s.reputation), "want", CO2_OVERDRAFT_REP,
  (rep0 - s.reputation) === CO2_OVERDRAFT_REP ? "(OK)" : "(FAIL)");
const rep1 = s.reputation;
p.status = "ready"; p.timer = 0; p.prog = 0; p.loc = "BOS"; p.leg = 1; p.segIdx = 0;
attemptDepart(p, true);
console.log("second overdraft also hits:",
  (rep1 - s.reputation) === CO2_OVERDRAFT_REP ? "(OK)" : "(FAIL)");
s.fuel = 0; p.status = "ready";
attemptDepart(p, true);
console.log("fuel still blocks:",
  p.status === "hold" && p.holdReason === "fuel" ? "(OK)" : "(FAIL " + p.status + "/" + p.holdReason + ")");
// enough quota → no hit
s.fuel = 1e9; s.co2 = 1e9; s.reputation = 50;
p.status = "ready"; p.holdReason = null;
const rep2 = s.reputation;
attemptDepart(p, true);
console.log("full quota no hit:", s.reputation === rep2 && s.co2 > 0 ? "(OK)" : "(FAIL)");
`;
const src = "const DEG = Math.PI / 180;\n" +
  ["js/data.js", "js/game.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n" + test;
vm.runInThisContext(src);
