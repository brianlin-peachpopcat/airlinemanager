// Headless smoke test for the globe renderer. Run: node tools/test-globe.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");

// stub the browser APIs the globe touches
const ctxStub = new Proxy(function () {}, {
  get: (t, k) => (k === "canvas" ? canvasStub : ctxStub),
  set: () => true,
  apply: () => ctxStub,
});
const canvasStub = {
  getContext: () => ctxStub, addEventListener: () => {}, setPointerCapture: () => {},
  clientWidth: 800, clientHeight: 600, width: 0, height: 0, style: {},
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
};
global.document = { createElement: () => ({ getContext: () => ctxStub, width: 0, height: 0 }) };
global.window = { devicePixelRatio: 1 };
global.performance = { now: () => 123 };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.canvasStub = canvasStub;

const src = ["js/data.js", "js/game.js", "js/globe.js"]
  .map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
const test = `
const g = new Globe(canvasStub);
g.render(null);                        // pre-game render
newGame("T", "JFK", "fast", "a320");
const p = G.state.planes[0];
assignRoute(p.id, "JFK", "LHR", []);   // route so arcs draw
g.render(globeState());
g.zoom = 3; g.rotLon = 1.2; g.render(globeState());
g.zoom = 8; g.render(globeState());
g.zoom = 0.7; g.render(globeState());
// projectVec must agree with the trig-based project()
g._sr = Math.sin(g.rotLon); g._cr = Math.cos(g.rotLon);
g._stl = Math.sin(g.tilt); g._ctl = Math.cos(g.tilt);
let worst = 0;
for (const ap of AIRPORTS) {
  const a = g.project(ap.lat, ap.lon), b = g.projectAp(ap);
  worst = Math.max(worst, Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}
console.log("projectVec max deviation:", worst, worst < 1e-12 ? "(OK)" : "(MISMATCH!)");
console.log("render smoke test passed");
`;
vm.runInThisContext(src + "\n" + test);
