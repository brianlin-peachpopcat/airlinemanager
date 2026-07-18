// Multi-flight revenue split consistency. Run: node tools/test-split-loop.js
const fs = require("fs"), path = require("path"), vm = require("vm");
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const root = path.join(__dirname, "..");
const test = `
newGame("LoopAir", "JFK", "fast", "a320");
const s = G.state;
s.autoDepart = true;
s.cash = 1e9; s.fuel = 1e9; s.co2 = 1e9;
s.catering = { tier: "hot", qty: 50000, until: s.gameMin + 100000 };
assignRoute(s.planes[0].id, "JFK", "BOS");
const p = s.planes[0];
p.status = "ready";
let fails = 0;
for (let trip = 1; trip <= 6; trip++) {
  const cash0 = s.cash, rev0 = s.totRevenue;
  attemptDepart(p, true);
  if (p.status !== "fly") { console.log("trip", trip, "depart fail"); fails++; break; }
  if (!p.boarding || !(p.boarding.revenue > 0)) { console.log("trip", trip, "no boarding"); fails++; break; }
  if (!(s.cash > cash0) || !(s.totRevenue > rev0)) { console.log("trip", trip, "tickets not credited"); fails++; break; }
  if (!s.lastReport || s.lastReport.kind !== "depart") { console.log("trip", trip, "no depart report", s.lastReport && s.lastReport.kind); fails++; break; }
  const tickets = p.boarding.revenue;
  const cash1 = s.cash;
  p.timer = 0;
  landPlane(p, true);
  if (p.boarding) { console.log("trip", trip, "boarding not cleared"); fails++; break; }
  if (!s.lastReport || s.lastReport.kind !== "land") { console.log("trip", trip, "no land report"); fails++; break; }
  if (s.lastReport.tickets !== tickets) { console.log("trip", trip, "land tickets mismatch"); fails++; break; }
  // turnaround complete → ready/auto
  p.timer = 0;
  if (p.status === "turn") {
    if (s.autoDepart) attemptDepart(p, true); // will depart again next loop iter — undo
    // reset for next loop: we already departed above if auto; fix state
  }
  // After land we're in turn. Force ready then next iter departs.
  if (p.status === "fly") {
    // oops auto departed mid-loop — land it first next
    console.log("trip", trip, "unexpected fly after land+turn");
  }
  p.status = "ready";
  p.timer = 0;
  p.segIdx = 0;
  console.log("trip", trip, "OK tickets", Math.round(tickets), "landNet", Math.round(s.lastReport.net), "kind", s.lastReport.kind);
}
console.log(fails ? "FAILS " + fails : "ALL OK");
`;
const src = "const DEG = Math.PI / 180;\n" +
  ["js/data.js", "js/game.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n" + test;
vm.runInThisContext(src);
