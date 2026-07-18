// Smoke test: ticket sales on depart, meals/extras on land. Run: node tools/test-split-revenue.js
const fs = require("fs"), path = require("path"), vm = require("vm");
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const root = path.join(__dirname, "..");
const test = `
newGame("SplitAir", "JFK", "fast", "a320");
const s = G.state;
s.autoDepart = true;
s.cash = 1e9; s.fuel = 1e9; s.co2 = 1e9;
s.catering = { tier: "hot", qty: 5000, until: s.gameMin + 10000 };
assignRoute(s.planes[0].id, "JFK", "BOS");
const p = s.planes[0];
p.status = "ready";
const cash0 = s.cash;
const rev0 = s.totRevenue;
attemptDepart(p, true);
console.log("status fly:", p.status === "fly" ? "(OK)" : "(FAIL)");
console.log("boarding set:", p.boarding && p.boarding.revenue > 0 ? "(OK)" : "(FAIL)");
console.log("tickets credited on depart:", s.cash > cash0 && s.totRevenue > rev0 ? "(OK)" : "(FAIL)",
  "tickets", Math.round(p.boarding.revenue));
console.log("depart report kind:", s.lastReport && s.lastReport.kind === "depart" ? "(OK)" : "(FAIL)");
const tickets = p.boarding.revenue;
const cash1 = s.cash;
const cat0 = s.catering.qty;
// fly to landing
p.timer = 0;
landPlane(p, true);
console.log("boarding cleared:", !p.boarding ? "(OK)" : "(FAIL)");
console.log("meals consumed:", s.catering.qty < cat0 ? "(OK)" : "(FAIL)", cat0, "->", s.catering.qty);
console.log("land report kind:", s.lastReport && s.lastReport.kind === "land" ? "(OK)" : "(FAIL)");
console.log("land has meal sales field:", s.lastReport.meals != null ? "(OK)" : "(FAIL)", "meals", s.lastReport.meals);
console.log("cash moved on land (fees/meals/lounge):", s.cash !== cash1 ? "(OK)" : "(FAIL note: may net ~0)");
console.log("hist net includes tickets:", p.hist[0] && p.hist[0].net >= tickets * 0.2 ? "(OK)" : "(FAIL)", p.hist[0] && p.hist[0].net);
`;
const src = "const DEG = Math.PI / 180;\n" +
  ["js/data.js", "js/game.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n" + test;
vm.runInThisContext(src);
