// Headless smoke test for storm-path diversions. Run: node tools/test-wx-divert.js
const fs = require("fs"), path = require("path"), vm = require("vm");
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const root = path.join(__dirname, "..");
const test = `
newGame("WxAir", "JFK", "fast", "a320");
const s = G.state;
s.autoDepart = true;
s.cash = 1e9; s.fuel = 1e9; s.co2 = 1e9;

// Force a Nor'easter (zone 0) — covers JFK and the Northeast
s.weather = [{ zone: 0, until: s.gameMin + 600 }];
const z = WEATHER_ZONES[0];
console.log("storm:", z.name, "covers JFK:", !!weatherAt("JFK"));

// Path through the storm: JFK → BOS should divert
const jfk = airportByCode.JFK, bos = airportByCode.BOS, lax = airportByCode.LAX;
const onStorm = weatherOnPath(jfk, bos);
console.log("JFK→BOS on storm:", onStorm || "(none)", onStorm === z.name ? "(OK)" : "(FAIL)");

// Far from the storm: a Southern Ocean path shouldn't trip the Nor'easter
// (use two airports well outside zone 0 if available — SYD-AKL is southern but Roaring Forties is different)
const syd = airportByCode.SYD, akl = airportByCode.AKL;
const clear = weatherOnPath(syd, akl);
console.log("SYD→AKL clear of Nor'easter:", !clear ? "(OK)" : "(FAIL got " + clear + ")");

// Near-miss: path close to storm centre should still divert
const near = weatherOnPath(jfk, { lat: z.lat, lon: z.lon });
console.log("path to storm centre diverts:", !!near ? "(OK)" : "(FAIL)");

// Live departure: time must grow by ~20+ minutes vs a clear-sky run
assignRoute(s.planes[0].id, "JFK", "BOS");
const p = s.planes[0];
p.status = "ready"; p.loc = "JFK"; p.leg = 0; p.segIdx = 0;
const fuel0 = s.fuel;
attemptDepart(p, true);
const diverted = p.divertWx === z.name;
const baseMin = Math.max(20, Math.round(distKm(jfk, bos) / planeSpeed(p) * 60) + 25);
const extra = p.legTime - baseMin;
console.log("depart diverted:", diverted ? "(OK)" : "(FAIL)", "| +min:", extra,
  extra >= WX_DIVERT_MIN && extra <= WX_DIVERT_MIN + 8 ? "(OK)" : "(FAIL)");
console.log("extra fuel burned:", s.fuel < fuel0 ? "(OK)" : "(FAIL)");

// Clear weather → no diversion
s.weather = [];
p.status = "ready"; p.timer = 0; p.divertWx = null;
attemptDepart(p, true);
console.log("clear skies no divert:", !p.divertWx ? "(OK)" : "(FAIL " + p.divertWx + ")");
console.log("clear legTime matches base:", Math.abs(p.legTime - baseMin) <= 1 ? "(OK)" : "(FAIL " + p.legTime + " vs " + baseMin + ")");
`;
const src = "const DEG = Math.PI / 180;\n" +
  ["js/data.js", "js/game.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n" + test;
vm.runInThisContext(src);
