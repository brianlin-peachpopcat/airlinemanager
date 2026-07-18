const fs = require("fs"), path = require("path"), vm = require("vm");
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const root = path.join(__dirname, "..");
const test = `
newGame("WearAir", "JFK", "fast", "a320");
G.state.cash = 1e12;
G.state.hangarCap = 20;
const r = G.state.rivals[0];
acquireRival(r.id);
const acquired = G.state.planes.slice(1);
console.log("acquired", acquired.length, acquired.map(p => p.wear + "%/" + p.hours + "h").join(", "));
console.log("all worn:", acquired.every(p => p.wear >= 15 && p.wear <= 60) ? "(OK)" : "(FAIL)");
console.log("all have hours:", acquired.every(p => p.hours >= 800) ? "(OK)" : "(FAIL)");
`;
const src = "const DEG = Math.PI / 180;\n" +
  ["js/data.js", "js/game.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n" + test;
vm.runInThisContext(src);
