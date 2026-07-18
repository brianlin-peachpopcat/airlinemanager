// ============================================================
// SkyTycoon — bootstrap & main loops
// ============================================================

const globe = new Globe(document.getElementById("globe"));
globe.onAirportClick = (ap) => { if (G.state) uiAirportClick(ap); };
globe.onPlaneClick = (id) => { if (G.state) showPlaneCard(id); };

function afterLoadUI() {
  renderTopbar();
  // don't replay old history as popups; only surface the offline-earnings note
  UI.lastSeq = G.state.logSeq || 0;
  // skip any flight reports that already happened before this session
  UI._repSeq = G.state.repSeq || 0;
  const latest = G.state.log[0];
  if (latest && latest.msg.startsWith("While you were away")) {
    notify(latest.msg, latest.kind, fmtClock(latest.t).split("· ")[1]);
  }
  if (typeof Persist !== "undefined" && Persist.cloudStatus === "ok") {
    // quiet — cloud restored
  }
}

(async function boot() {
  let ok = false;
  try {
    ok = typeof loadAsync === "function" ? await loadAsync() : load();
  } catch (e) {
    console.warn(e);
    ok = load();
  }
  if (ok && G.state) {
    afterLoadUI();
  } else {
    showOnboarding();
  }
})();

// render loop (globe) — cache globe state; rebuilding routes every frame was costly
let _globeCache = null, _globeCacheMs = 0;
function frame() {
  if (G.state) {
    const now = performance.now();
    if (!_globeCache || now - _globeCacheMs > 120) {
      _globeCache = globeState();
      _globeCacheMs = now;
    }
    globe.render(_globeCache);
  } else {
    _globeCache = null;
    globe.render(null);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// simulation: pace chosen at founding (s.timeScale = game-seconds per real
// second → one 1-minute tick every 60000/timeScale ms)
let _tickAccum = 0;
setInterval(() => {
  if (!G.state) return;
  const msPerTick = 60000 / (G.state.timeScale || 120);
  if (!G.state.paused) _tickAccum += 500;
  let guard = 0;
  while (_tickAccum >= msPerTick && guard++ < 4) {
    _tickAccum -= msPerTick;
    tick(false);
  }
  if (_tickAccum > msPerTick) _tickAccum = msPerTick;   // don't bank a backlog
  renderTopbar();
  pumpNotifs();
  refreshPanel(false);
  renderPlaneCard(); // also soft-updates an open passenger window
  renderReportCard();
}, 500);

// autosave — local often, cloud on flush
setInterval(() => save(), 10000);
window.addEventListener("beforeunload", () => {
  save();
  if (typeof flushCloudSave === "function") flushCloudSave();
});
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    save();
    if (typeof flushCloudSave === "function") flushCloudSave();
  }
});
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (tutActive()) { tutExit(); return; }
  if (UI.paxViewId) { closePaxView(); return; }
  if (UI.planeCardId) closePlaneCard();
});
