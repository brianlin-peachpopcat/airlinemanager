// Headless smoke test for the used-market update. Run: node tools/test-usedmarket.js
const fs = require("fs"), path = require("path"), vm = require("vm");
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const root = path.join(__dirname, "..");
const test = `
newGame("TestAir", "JFK", "fast", "a320");
const s = G.state;

// 1. market size
const sz = s.usedMarket.length;
console.log("used market size:", sz, (sz >= 10 && sz <= 25) ? "(OK 10-25)" : "(FAIL)");

// 2. exclusives appear at their chance over many refreshes
const seen = {};
for (let i = 0; i < 400; i++) {
  refreshUsedMarket(true);
  for (const l of s.usedMarket) {
    const t = aircraftById[l.typeId];
    if (t.usedOnly) seen[t.id] = (seen[t.id] || 0) + 1;
  }
}
console.log("exclusive appearances /400 refreshes:",
  ["a300","b707","b731","b741","conc"].map(id => id + ":" + (seen[id] || 0)).join(" "));

// 3. usedOnly types never sold new
console.log("buy new Concorde blocked:", buyPlane("conc") === false ? "(OK)" : "(FAIL)", "|", G.err);

// 4. limited production seeded 10-20 and purchases decrement
const seeded = Object.entries(s.prodLeft).map(([k,v]) => k + ":" + v).join(" ");
console.log("prodLeft seeded:", seeded);
const okRange = Object.values(s.prodLeft).every(v => v >= 10 && v <= 20);
console.log("all within 10-20:", okRange ? "(OK)" : "(FAIL)");
s.cash = 100e9;
G.state.train = { pilot: 3, crew: 0, chef: 0, mgmt: 0 };   // widebody cert
const before = s.prodLeft.a388;
buyPlane("a388", { qty: 2 });
console.log("a388 stock after buying 2:", before, "->", s.prodLeft.a388,
  s.prodLeft.a388 === before - 2 ? "(OK)" : "(FAIL)");

// 5. sold out => cannot order new
s.prodLeft.b744 = 0;
console.log("sold-out 747-400 blocked:", buyPlane("b744") === false ? "(OK)" : "(FAIL)", "|", G.err);

// 6. rivals nibble stock via tickLimitedProd
let total0 = Object.values(s.prodLeft).reduce((a,b)=>a+b,0);
for (let i = 0; i < 200; i++) tickLimitedProd(true);
let total1 = Object.values(s.prodLeft).reduce((a,b)=>a+b,0);
console.log("rival buying drains stock:", total0, "->", total1, total1 < total0 ? "(OK)" : "(FAIL)");
console.log("never negative:", Object.values(s.prodLeft).every(v => v >= 0) ? "(OK)" : "(FAIL)");

// 7. Concorde maintenance & specs
const conc = aircraftById.conc;
console.log("concorde check cost:", fmtMoney(maintCheckCost(conc)),
  "(vs a320:", fmtMoney(maintCheckCost(aircraftById.a320)) + ")");
console.log("concorde speed:", conc.speed, "km/h", conc.speed > 2100 ? "(Mach 2+ OK)" : "(FAIL)");

// 8. buying a used exclusive works
s.usedMarket = [];
addUsedListing(conc);
const listing = s.usedMarket[0];
const got = buyUsed(listing.id, false);
console.log("buy used Concorde:", got ? "(OK)" : "(FAIL " + G.err + ")");

// 9. 777X and A350F never appear second-hand
let sawNoUsed = false;
for (let i = 0; i < 300; i++) {
  refreshUsedMarket(true);
  if (s.usedMarket.some(l => l.typeId === "b779" || l.typeId === "a35f")) sawNoUsed = true;
}
console.log("777X/A350F excluded from used market:", sawNoUsed ? "(FAIL)" : "(OK)");

// 10. hub cap at 30 total (hub prices scale with cash, so refill each time)
while (s.hubs.length < 30) {
  s.cash = 1e12;
  const next = AIRPORTS.find(a => !s.hubs.includes(a.code) && a.country === "USA");
  if (!next || !buyHub(next.code)) break;
}
console.log("hubs owned:", s.hubs.length, s.hubs.length === 30 ? "(OK)" : "(FAIL)");
s.cash = 1e12;
const extra = AIRPORTS.find(a => !s.hubs.includes(a.code) && a.country === "USA");
console.log("31st hub blocked:", buyHub(extra.code) === false ? "(OK)" : "(FAIL)", "|", G.err);
`;
const src = ["js/data.js", "js/game.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n" + test;
vm.runInThisContext(src);
