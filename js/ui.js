// ============================================================
// SkyTycoon — UI: panels, top bar, onboarding, feed
// ============================================================

const UI = {
  panel: null,             // open panel id or null
  routeFormPlane: null,    // plane id with route form expanded
  cfgPlane: null,          // plane id with config form expanded
  buyCfg: null,            // { typeId, hub, engine, cabin, brandId, qty }
  fleetBrand: "all",       // fleet filter: all | brandId
  fuelQty: 100,
  co2Qty: 200,
  hoverSpark: {},          // canvasId -> hover index
};

const $ = (sel) => document.querySelector(sel);

/** Collapsed tip blurb — keeps long how-to text out of the way. */
function tip(body, label = "How this works") {
  return `<details class="panel-tip"><summary>${label}</summary><div class="tip-body">${body}</div></details>`;
}

// ---------------- sound effects ----------------

const SFX_SRC = {
  click: "assets/buttonpress.mp3",
  deny:  "assets/notallowed.mp3",
  buy:   "assets/purchase.mp3",
  depart: "assets/planedeparture.mp3",
};
const _sfxAudio = {};
let _sfxSkipClick = false;

// sound can be muted (persisted outside the save so it survives resets)
UI.muted = (typeof localStorage !== "undefined" && localStorage.getItem("sky_mute") === "1");

function toggleMute() {
  UI.muted = !UI.muted;
  try { localStorage.setItem("sky_mute", UI.muted ? "1" : "0"); } catch (_) {}
  const b = document.getElementById("sndbtn");
  if (b) b.textContent = UI.muted ? "🔇" : "🔊";
  toast(UI.muted ? "Sound effects off." : "Sound effects on.");
}

function sfx(kind) {
  if (UI.muted) return;
  const src = SFX_SRC[kind];
  if (!src) return;
  // these replace the generic button click that the document listener would fire
  if (kind === "buy" || kind === "deny" || kind === "depart") _sfxSkipClick = true;
  try {
    let a = _sfxAudio[kind];
    if (!a) {
      a = new Audio(src);
      a.volume = kind === "click" ? 0.45 : kind === "depart" ? 0.7 : 0.6;
      _sfxAudio[kind] = a;
    }
    a.pause();
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch (_) {}
}

// Generic UI clicks (sidebar, qty chips, company, etc.). Purchase handlers
// call sfx("buy"|"deny") first, which suppresses this click sound.
document.addEventListener("click", (e) => {
  if (_sfxSkipClick) { _sfxSkipClick = false; return; }
  const btn = e.target.closest("button");
  if (!btn || btn.disabled) return;
  sfx("click");
});

const PANELS = {
  fleet:     { title: "Fleet Management",  icon: "🛫" },
  buy:       { title: "Purchase Aircraft", icon: "🛒" },
  maint:     { title: "Maintenance",       icon: "🔧" },
  fuel:      { title: "Fuel & CO₂ Quotas", icon: "⛽" },
  marketing: { title: "Finance & Marketing", icon: "📣" },
  events:    { title: "World Events",      icon: "📰" },
  company:   { title: "Company",           icon: "🏢" },
  help:      { title: "Help",              icon: "❓" },
};

// ---------------- top bar & feed ----------------

function renderTopbar() {
  const s = G.state;
  ensureBrands();
  const kids = s.brands.filter(b => !b.parent).length;
  $("#tb-airline").textContent = kids
    ? `${s.airline} · ${kids} subsidiar${kids === 1 ? "y" : "ies"}`
    : s.airline;
  $("#tb-cash").textContent = fmtMoney(s.cash);
  $("#tb-points").textContent = fmtNum(s.points);
  $("#tb-fuel").textContent = `${fmtNum(s.fuel / 1000)} t`;
  const co2El = $("#tb-co2");
  co2El.textContent = `${fmtNum(s.co2 / 1000)} t`;
  co2El.classList.toggle("bad-text", s.co2 < 0);
  co2El.parentElement && co2El.parentElement.classList.toggle("pill-warn", s.co2 < 0);
  $("#tb-clock").textContent = fmtClock(s.gameMin) + (s.paused ? " · ⏸ PAUSED" : "");
  const pb = document.getElementById("tb-pause");
  if (pb) pb.textContent = s.paused ? "▶" : "⏸";
  const lv = levelInfo();
  $("#tb-level").textContent = lv.cur.name;
}

// Center-screen dismissable popups for new game events.
UI.lastSeq = 0;

function pumpNotifs() {
  const s = G.state;
  const fresh = s.log.filter(e => (e.seq || 0) > UI.lastSeq).reverse();
  if (!fresh.length) return;
  UI.lastSeq = Math.max(UI.lastSeq, ...fresh.map(e => e.seq || 0));
  for (const e of fresh) notify(e.msg, e.kind, fmtClock(e.t).split("· ")[1]);
}

function notify(msg, kind, time) {
  const box = $("#notifs");
  while (box.children.length >= 4) box.firstChild.remove();   // keep the stack short
  const el = document.createElement("div");
  el.className = `notif notif-${kind || "info"}`;
  el.innerHTML = `<span class="notif-time">${time || ""}</span>
    <span class="notif-msg">${esc(msg)}</span>
    <button class="notif-x" title="Dismiss">×</button>`;
  el.querySelector(".notif-x").onclick = () => el.remove();
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    if (el.isConnected) { el.classList.remove("show"); setTimeout(() => el.remove(), 350); }
  }, 6000);
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 2600);
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------- searchable airport picker ----------------
// Search by code / city / country, or narrow with the country dropdown.
// Keystrokes re-render only the result list (#apl-*), never the whole
// panel, so the search input keeps focus.
UI.apk = {};

function airportPicker(key, selCode, onPickTpl) {
  const st = UI.apk[key] || (UI.apk[key] = { q: "", country: "all" });
  st.sel = selCode;
  st.onPickTpl = onPickTpl;
  const countries = [...new Set(AIRPORTS.map(a => a.country))].sort();
  return `<div class="ap-picker">
    <div class="ap-controls">
      <input type="text" placeholder="Search code / city / country…" value="${esc(st.q)}"
        oninput="apkSet('${key}','q',this.value)">
      <select onchange="apkSet('${key}','country',this.value)">
        <option value="all">🌐 All countries</option>
        ${countries.map(c => `<option value="${esc(c)}" ${c === st.country ? "selected" : ""}>${esc(c)}</option>`).join("")}
      </select>
    </div>
    <div class="ap-list" id="apl-${key}">${apkListHTML(key)}</div>
  </div>`;
}

function apkListHTML(key) {
  const st = UI.apk[key];
  const q = (st.q || "").trim().toLowerCase();
  const list = AIRPORTS
    .filter(a =>
      (st.country === "all" || a.country === st.country) &&
      (!q || a.code.toLowerCase().includes(q) || a.city.toLowerCase().includes(q) || a.country.toLowerCase().includes(q)))
    .sort((a, b) => b.size - a.size || a.city.localeCompare(b.city))
    .slice(0, 60);
  if (!list.length) return `<div class="ap-empty muted mini">No airports match.</div>`;
  return list.map(a => `<button class="ap-item ${a.code === st.sel ? "active" : ""}"
      onclick="${st.onPickTpl.replace("%C", `'${a.code}'`)}">
      <b>${a.code}</b> <span class="ap-city">${esc(a.city)}</span>
      <span class="muted mini">${esc(a.country)}</span>
      <span class="ap-size" title="market size">${"●".repeat(Math.max(1, Math.round(a.size / 3)))}</span>
    </button>`).join("");
}

function apkSet(key, which, val) {
  const st = UI.apk[key] || (UI.apk[key] = { q: "", country: "all" });
  st[which] = val;
  const el = document.getElementById("apl-" + key);
  if (el) el.innerHTML = apkListHTML(key);
}

// ---------------- topbar airport search ----------------
UI.tbAp = { q: "", idx: 0, list: [] };

function tbApMatches(q) {
  q = (q || "").trim().toLowerCase();
  if (!q) return [];
  return AIRPORTS
    .filter(a =>
      a.code.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.country.toLowerCase().includes(q))
    .sort((a, b) => {
      const ac = a.code.toLowerCase() === q ? 0 : a.code.toLowerCase().startsWith(q) ? 1 : 2;
      const bc = b.code.toLowerCase() === q ? 0 : b.code.toLowerCase().startsWith(q) ? 1 : 2;
      return ac - bc || b.size - a.size || a.city.localeCompare(b.city);
    })
    .slice(0, 12);
}

function tbApSearch(q) {
  UI.tbAp.q = q;
  UI.tbAp.list = tbApMatches(q);
  UI.tbAp.idx = 0;
  const drop = document.getElementById("tb-ap-drop");
  if (!drop) return;
  if (!UI.tbAp.q.trim()) {
    drop.classList.add("hidden");
    drop.innerHTML = "";
    return;
  }
  if (!UI.tbAp.list.length) {
    drop.classList.remove("hidden");
    drop.innerHTML = `<div class="tb-ap-empty muted mini">No airports match.</div>`;
    return;
  }
  drop.classList.remove("hidden");
  drop.innerHTML = UI.tbAp.list.map((a, i) =>
    `<button type="button" class="tb-ap-item${i === 0 ? " active" : ""}" data-i="${i}"
      onmousedown="event.preventDefault(); tbApPick('${a.code}')">
      <b>${a.code}</b><span class="tb-ap-city">${esc(a.city)}</span>
      <span class="muted mini">${esc(a.country)}</span>
    </button>`).join("");
}

function tbApKey(e) {
  const drop = document.getElementById("tb-ap-drop");
  if (e.key === "Escape") {
    e.preventDefault();
    const inp = document.getElementById("tb-ap-q");
    if (inp) inp.value = "";
    tbApSearch("");
    inp && inp.blur();
    return;
  }
  if (!UI.tbAp.list.length) {
    if (e.key === "Enter") e.preventDefault();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    UI.tbAp.idx = Math.min(UI.tbAp.list.length - 1, UI.tbAp.idx + 1);
    tbApHighlight();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    UI.tbAp.idx = Math.max(0, UI.tbAp.idx - 1);
    tbApHighlight();
  } else if (e.key === "Enter") {
    e.preventDefault();
    const ap = UI.tbAp.list[UI.tbAp.idx];
    if (ap) tbApPick(ap.code);
  }
}

function tbApHighlight() {
  const drop = document.getElementById("tb-ap-drop");
  if (!drop) return;
  drop.querySelectorAll(".tb-ap-item").forEach((el, i) => {
    el.classList.toggle("active", i === UI.tbAp.idx);
    if (i === UI.tbAp.idx) el.scrollIntoView({ block: "nearest" });
  });
}

function tbApPick(code) {
  const ap = airportByCode[code];
  if (!ap) return;
  const inp = document.getElementById("tb-ap-q");
  if (inp) inp.value = `${ap.code} · ${ap.city}`;
  tbApSearch("");
  if (typeof globe !== "undefined" && globe) {
    globe.focusAirport(ap, ap.ocean || ap.size <= 4 ? 3.6 : 2.8);
  }
  if (G.state) showAirportCard(ap);
  else toast(`${ap.code} — ${ap.city}, ${ap.country}`);
}

document.addEventListener("pointerdown", (e) => {
  const wrap = document.getElementById("tb-ap-search");
  if (!wrap || wrap.contains(e.target)) return;
  const drop = document.getElementById("tb-ap-drop");
  if (drop) drop.classList.add("hidden");
});

// ---------------- panel shell ----------------

function openPanel(id, opts) {
  // Sidebar clicks toggle closed; tutorial / deep-links can force stay open.
  if (UI.panel === id && !(opts && opts.force)) { closePanel(); return; }
  UI.panel = id;
  UI.routeFormPlane = null;
  UI.cfgPlane = null;
  if (id !== "buy") UI.buyCfg = null;
  UI._buyOrderCount = (G.state?.orders || []).length;
  // On phones the panel is nearly full-screen — tuck away floating cards underneath.
  if (typeof matchMedia === "function" && matchMedia("(max-width: 900px)").matches) {
    if (UI.planeCardId) closePlaneCard();
    const ac = $("#airport-card");
    if (ac) ac.classList.add("hidden");
    const rc = $("#route-card");
    if (rc) rc.classList.add("hidden");
  }
  const panel = $("#panel");
  panel.classList.remove("hidden");
  panel.classList.toggle("panel-wide", id === "company");
  $("#panel-title").textContent = `${PANELS[id].icon} ${PANELS[id].title}`;
  document.querySelectorAll("#sidebar button").forEach(b =>
    b.classList.toggle("active", b.dataset.panel === id));
  refreshPanel(true);
}

function closePanel() {
  UI.panel = null;
  UI.buyCfg = null;
  const panel = $("#panel");
  panel.classList.add("hidden");
  panel.classList.remove("panel-wide");
  document.querySelectorAll("#sidebar button").forEach(b => b.classList.remove("active"));
}

function refreshPanel(force) {
  if (!UI.panel) return;
  const body = $("#panel-body");
  // don't clobber the DOM while the user is typing / choosing
  if (!force && body.contains(document.activeElement) &&
      /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;

  // The buy shop has many <img> cards — rebuilding it every tick reloads images
  // and makes the panel jiggle. Only refresh it on user actions, or when an
  // order arrives/leaves.
  if (!force && UI.panel === "buy") {
    const n = (G.state.orders || []).length;
    if (UI._buyOrderCount === n) return;
    UI._buyOrderCount = n;
  }
  // Marketing / company / help are mostly static; skip tick rebuilds.
  if (!force && (UI.panel === "marketing" || UI.panel === "company" || UI.panel === "help")) return;

  const scroll = body.scrollTop;
  const renderers = { fleet: renderFleet, buy: renderBuy, maint: renderMaint, fuel: renderFuel, marketing: renderMarketing, events: renderEvents, company: renderCompany, help: renderHelp };
  body.innerHTML = renderers[UI.panel]();
  body.scrollTop = scroll;
  if (UI.panel === "buy") UI._buyOrderCount = (G.state.orders || []).length;
  if (UI.panel === "fuel") drawSparklines();
}

// ---------------- fleet ----------------

function statusText(p) {
  const t = aircraftById[p.typeId];
  if (p.status === "idle") return `<span class="st st-idle">Parked — no route</span>`;
  if (p.status === "ground") {
    const why = p.wear >= WEAR_SAFETY ? " — safety grounding (maintain required)" : "";
    return `<span class="st st-ground">Grounded${why}</span>`;
  }
  if (p.status === "maint") return `<span class="st st-maint">In maintenance · ${fmtDur(p.timer)} left</span>`;
  if (p.status === "turn") {
    const here = p.route ? routePath(p)[p.segIdx] : (p.homeHub || G.state.hub);
    const kind = p.segIdx > 0 ? "Tech stop" : "Turnaround";
    return `<span class="st st-turn">${kind} at ${here} · departs in ${fmtDur(p.timer)}</span>`;
  }
  if (p.status === "ready") {
    const here = p.route ? routePath(p)[p.segIdx] : (p.homeHub || G.state.hub);
    return `<span class="st st-maint">🛫 Ready at ${here} — awaiting dispatch</span>`;
  }
  if (p.status === "hold") {
    const why = { fuel: "awaiting fuel", co2: "awaiting CO₂ quota", maintenance: "needs maintenance" }[p.holdReason] || "held";
    return `<span class="st st-hold">Held at gate — ${why}</span>`;
  }
  if (p.status === "fly") {
    const recall = p.groundAfterLand ? ` · <b>recalling</b>` : "";
    const divert = p.divertWx ? ` · <span class="bad-text">diverting around ${esc(p.divertWx)}</span>` : "";
    if (p.charter) {
      const label = p.charter.phase === "ferry"
        ? `Ferrying to ${p.charter.from} for charter`
        : `✨ Charter → ${p.charter.to}`;
      return `<span class="st st-fly">${label} · ${Math.round(p.prog * 100)}% · lands in ${fmtDur(p.timer)}${divert}${recall}</span>`;
    }
    const dir = routePath(p);
    const dest = dir[p.segIdx + 1];
    const final = dir[dir.length - 1];
    const via = dest !== final ? ` (via ${dest})` : "";
    return `<span class="st st-fly">En route → ${final}${via} · ${Math.round(p.prog * 100)}% · lands in ${fmtDur(p.timer)}${divert}${recall}</span>`;
  }
  return "";
}

function wearBar(p) {
  const cls = p.wear >= WEAR_SAFETY ? "bad" : p.wear > 80 ? "bad" : p.wear > 50 ? "warn" : "ok";
  const pct = Math.min(100, p.wear);
  return `<div class="bar"><div class="bar-fill bar-${cls}" style="width:${pct}%"></div></div>
          <span class="bar-label">${Math.round(p.wear)}% wear${p.wear >= WEAR_SAFETY ? " ⚠" : ""}</span>`;
}

function hangarCard() {
  const s = G.state;
  const used = hangarUsed();
  const pct = Math.min(100, used / s.hangarCap * 100);
  const building = s.hangarUpg != null;
  const orders = s.orders || [];
  return `<div class="card">
    <div class="card-head"><div><b>🏗 Hangar</b></div>
      <div class="muted mini">${used} / ${s.hangarCap} bays used${orders.length ? ` · ${orders.length} on order` : ""}</div></div>
    <div class="bar"><div class="bar-fill ${pct >= 100 ? "bar-bad" : pct > 80 ? "bar-warn" : "bar-ok"}" style="width:${pct}%"></div></div>
    ${building
      ? `<div class="card-row st-maint">🔨 Expansion under construction — ${fmtDur(s.hangarUpg - s.gameMin)} remaining (+${HANGAR_STEP} bays)
          <button class="btn mini-btn" onclick="uiRushHangar()">⚡ Finish now — ${rushCost(s.hangarUpg - s.gameMin)} ⭐</button></div>`
      : `<div class="card-actions">
          <button class="btn" onclick="uiHangar('cash')">+${HANGAR_STEP} bays — ${fmtMoney(hangarCashCost())}</button>
          <button class="btn" onclick="uiHangar('points')">+${HANGAR_STEP} bays — ${fmtNum(hangarPtsCost())} ⭐</button>
          <span class="muted mini">takes ${fmtDur(hangarBuildMin())}</span>
        </div>`}
    ${orders.length ? orders.map(o => {
      const t = aircraftById[o.typeId];
      return `<div class="card-row muted mini">${t.name} → ${o.homeHub} in ${fmtDur(Math.max(0, o.eta - s.gameMin))}
        <button class="btn mini-btn" onclick="uiRushOrder(${o.id})">⚡ ${rushCost(o.eta - s.gameMin)} ⭐</button></div>`;
    }).join("") : ""}
  </div>`;
}

function charterCard() {
  const s = G.state;
  if (!s.charterUnlocked) {
    const afford = s.points >= CHARTER_UNLOCK_PTS;
    return `<div class="card">
      <div class="card-head"><div><b>📞 Charter Operations</b></div><div class="price">${CHARTER_UNLOCK_PTS} ⭐</div></div>
      <div class="card-row muted mini">Unlock one-off charter flights and the VIP jet shop. See Help for details.</div>
      <div class="card-actions">
        <button class="btn ${afford ? "btn-gold" : ""}" onclick="uiUnlockCharter()">${afford ? "Open charter desk" : `Needs ${CHARTER_UNLOCK_PTS} ⭐ (you have ${fmtNum(s.points)})`}</button>
      </div>
    </div>`;
  }
  const offers = s.charterOffers || [];
  const paused = !!s.charterPaused;
  const body = paused
    ? `<div class="card-row muted mini">Desk closed — no customers are calling. Reopen it when you want charter work again.</div>`
    : offers.length ? offers.map(o => {
    const a = airportByCode[o.from], b = airportByCode[o.to];
    const d = Math.round(distKm(a, b));
    const eligible = s.planes.filter(p => {
      const t = aircraftById[p.typeId];
      if (t.tons || p.status === "fly" || p.status === "maint" || p.status === "ground" ||
          p.wear >= WEAR_SAFETY || t.range < d) return false;
      const loc = planeLoc(p);
      return loc === o.from || distKm(airportByCode[loc], a) <= t.range;
    });
    const planeOpts = eligible.map(p => {
      const t = aircraftById[p.typeId];
      const loc = planeLoc(p);
      const ferry = loc === o.from ? "" :
        ` · ferry from ${loc} ~${fmtDur(distKm(airportByCode[loc], a) / planeSpeed(p) * 60 + 25)}`;
      const vipJet = t.charterSpec ? " ★ VIP +" + Math.round((CHARTER_SPEC_PAY - 1) * 100) + "%" : "";
      return `<option value="${p.id}">${p.id} — ${t.name}${vipJet}${ferry}</option>`;
    }).join("");
    const vipBadge = o.vip || o.client
      ? ` <span class="boost-badge">repeat · ${esc(o.client || "VIP")}</span>`
      : "";
    const brief = o.brief || "Charter party requests a one-off ferry";
    return `<div class="charter-offer">
      <div class="card-row">
        <b>${o.from} → ${o.to}</b>${vipBadge}
        <span class="muted mini">${esc(a.city)} → ${esc(b.city)} · ${fmtNum(d)} km</span>
        <span class="price">${fmtMoney(o.pay)}</span>
      </div>
      <div class="card-row muted mini charter-brief">“${esc(brief)}”</div>
      <div class="card-row muted mini">Expires in ${fmtDur(Math.max(0, o.expires - s.gameMin))}</div>
      <div class="card-actions">
        ${eligible.length
          ? `<select id="ch-plane-${o.id}">${planeOpts}</select>
             <button class="btn btn-gold" onclick="uiAcceptCharter(${o.id})">Accept</button>`
          : `<span class="muted mini">No available aircraft with the range.</span>`}
        <button class="btn btn-danger" onclick="uiDeclineCharter(${o.id})">Decline</button>
      </div>
    </div>`;
  }).join("") : `<div class="card-row muted mini">No charter requests right now — customers call every few hours.</div>`;
  return `<div class="card">
    <div class="card-head"><div><b>📞 Charter requests</b>${paused ? ` <span class="muted mini">(desk closed)</span>` : ""}</div>
      <div class="muted mini">one-way, pays on arrival</div></div>
    ${body}
    <div class="card-actions">
      <button class="btn ${paused ? "btn-gold" : ""}" onclick="uiToggleCharter()">${paused ? "Reopen charter desk" : "Close desk temporarily"}</button>
    </div>
  </div>`;
}

function uiUnlockCharter() {
  if (unlockCharter()) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(`Opening the charter desk needs ${CHARTER_UNLOCK_PTS} points.`); }
}

function uiToggleCharter() {
  if (toggleCharterDesk()) { sfx("click"); refreshPanel(true); }
}

function uiAcceptCharter(offerId) {
  const sel = document.getElementById("ch-plane-" + offerId);
  G.err = null;
  if (acceptCharter(offerId, sel ? sel.value : null)) {
    sfx("buy"); refreshPanel(true); renderTopbar();
  } else {
    sfx("deny"); toast(G.err || "Cannot accept that charter.");
  }
}

function uiDeclineCharter(offerId) {
  declineCharter(offerId);
  refreshPanel(true);
}

function uiRushOrder(id) {
  if (rushOrder(id)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(G.err || "Cannot rush that delivery."); }
}

function uiRushHangar() {
  if (rushHangar()) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(G.err || "Nothing under construction."); }
}

function uiHangarTP() {
  if (buyHangarBayTP()) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(G.err || "Cannot buy that bay."); }
}

function uiHangar(pay) {
  if (startHangarUpgrade(pay)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else {
    sfx("deny");
    toast(G.state.hangarUpg != null ? "An expansion is already under construction." : "Not enough to pay for that expansion.");
  }
}

function cabinSummary(cabin, plane) {
  if (plane && plane.vipLayout) return vipLayoutSummary(plane.vipLayout);
  if (!cabin) return "cargo";
  const parts = [];
  if (cabin.F) parts.push(`F${cabin.F}`);
  if (cabin.J) parts.push(`J${cabin.J}`);
  parts.push(`Y${cabin.Y || 0}`);
  return parts.join(" / ") + ` · ${cabinPax(cabin)} pax`;
}

function renderFleet() {
  const s = G.state;
  ensureBrands();
  if (!s.planes.length && !(s.orders && s.orders.length)) {
    return hangarCard() + `<div class="empty">No aircraft yet.<br><br>
      <button class="btn btn-gold" onclick="openPanel('buy')">Buy your first aircraft →</button></div>`;
  }
  const readyNow = s.planes.filter(p => p.status === "ready");
  let co2Run = s.co2, co2OverN = 0;
  for (const p of readyNow) {
    const need = nextLegCO2(p);
    if (co2Run < need) co2OverN++;
    co2Run -= need;
  }
  const departAllBtn = readyNow.length
    ? `<button class="btn btn-gold depart-all-btn" onclick="uiDepartAll()">🛫 DEPART ALL READY — ${readyNow.length} aircraft waiting${co2OverN ? ` <span class="bad-text">⚠ ${co2OverN} CO₂ overrun</span>` : ""}</button>`
    : "";
  const charterHtml = charterCard();
  const filter = UI.fleetBrand || "all";
  const brands = s.brands;
  const noRouteN = s.planes.filter(p => !p.route).length;
  const readyN = s.planes.filter(p => p.status === "ready").length;
  const filterBar = `<div class="brand-filter">
    <button class="chip ${filter === "all" ? "active" : ""}" onclick="uiFleetBrand('all')">All (${s.planes.length})</button>
    <button class="chip ${filter === "noroute" ? "active" : ""}" onclick="uiFleetBrand('noroute')">⚠ No route (${noRouteN})</button>
    <button class="chip ${UI.fleetSort === "landing" ? "active" : ""}" onclick="uiFleetSort()">⏱ Landing soonest</button>
    ${brands.length > 1 ? brands.map(b => `<button class="chip ${filter === b.id ? "active" : ""}" onclick="uiFleetBrand('${b.id}')">${esc(b.name)} (${brandFleetCount(b.id)})</button>`).join("") : ""}
    ${!s.autoDepart ? `<span class="muted mini">manual dispatch${s.autoDepartOwned ? "" : " — get the Dispatch office (Training)"}</span>` : s.autoDepartGuardCO2 ? `<span class="muted mini">auto · 🌍 CO₂ guard</span>` : ""}
  </div>`;

  const ordersHtml = (s.orders && s.orders.length) ? `<div class="card">
    <div class="card-head"><div><b>📦 On order</b></div></div>
    ${s.orders.map(o => {
      const t = aircraftById[o.typeId];
      const br = brandById(o.brandId || "main");
      return `<div class="card-row">${t.maker} ${t.name} → <b>${o.homeHub}</b>
        <span class="muted mini">${esc(br.name)} · ${o.leased ? "lease" : "purchase"} · ${engineOf(o.engine).name}
        ${o.vipLayout ? ` · ${cabinSummary(null, o)}` : o.cabin ? ` · ${cabinSummary(o.cabin)}` : ""} · arrives in ${fmtDur(Math.max(0, o.eta - s.gameMin))}</span>
        <button class="btn mini-btn" onclick="uiRushOrder(${o.id})">⚡ Rush — ${rushCost(o.eta - s.gameMin)} ⭐</button></div>`;
    }).join("")}
  </div>` : "";

  let planes = s.planes.filter(p =>
    filter === "all" ? true
    : filter === "noroute" ? !p.route
    : (p.brandId || "main") === filter);
  if (UI.fleetSort === "landing") {
    planes = [...planes].sort((a, b) => {
      const ka = a.status === "fly" ? a.timer : 1e9 + (a.status === "turn" ? a.timer : 2e9);
      const kb = b.status === "fly" ? b.timer : 1e9 + (b.status === "turn" ? b.timer : 2e9);
      return ka - kb;
    });
  }
  if (!planes.length && filter !== "all") {
    return departAllBtn + hangarCard() + charterHtml + filterBar + ordersHtml + `<div class="empty">No aircraft under this brand.</div>`;
  }

  return departAllBtn + hangarCard() + charterHtml + filterBar + ordersHtml + planes.map(p => {
    const t = aircraftById[p.typeId];
    const br = brandById(p.brandId || "main");
    const routeStr = p.route
      ? `<span class="route-badge">${p.route.from} ⇄ ${p.route.to}${(p.route.stops || []).length ? ` <span class="via-note">via ${p.route.stops.join("·")}</span>` : ""}</span>`
      : `<span class="route-badge none">unassigned</span>`;
    const leaseTag = p.leased ? `<span class="owned-badge">leased · ${fmtMoney(leaseDailyCost(t, p.engine) * (p.leaseRateMult || 1))}/day · ${fmtDur(Math.max(0, (p.leaseUntil || 0) - s.gameMin))} left</span>` : "";
    const brandTag = brands.length > 1 ? `<span class="brand-badge">${esc(br.name)}</span>` : "";
    const busy = p.status === "fly" || p.status === "maint";
    const grounded = p.status === "ground";
    const canOps = !busy;
    const form = UI.routeFormPlane === p.id ? routeForm(p) : "";
    const cfg = UI.cfgPlane === p.id ? planeConfigForm(p) : "";
    const hist = UI.histPlane === p.id ? flightHistHtml(p) : "";
    const disposeBtn = p.leased
      ? `<button class="btn btn-danger" ${canOps ? "" : "disabled"} onclick="uiReturnLease('${p.id}')">Return lease</button>`
      : `<button class="btn btn-danger" ${canOps ? "" : "disabled"} onclick="uiSell('${p.id}')">Sell (${fmtMoney(planeValue(p))})</button>`;
    const groundBtn = grounded
      ? `<button class="btn btn-gold" onclick="uiUnground('${p.id}')">Return to service</button>`
      : `<button class="btn" ${p.status === "maint" ? "disabled" : ""} onclick="uiGround('${p.id}')">${p.status === "fly" || p.groundAfterLand ? "Recall & ground" : "Ground"}</button>`;
    return `<div class="card">
      <div class="card-head">
        <div><b>${p.id}</b> <span class="muted">${t.maker} ${t.name}</span> ${brandTag} ${leaseTag}</div>
        ${routeStr}
      </div>
      <div class="card-row muted mini">${statusText(p)} · ${p.homeHub || s.hub}
        · ${p.freighter ? `📦 ${planeTons(p)} t` : p.vipLayout ? cabinSummary(null, p) : p.cabin ? cabinSummary(p.cabin) : "freighter"}
        · ${wearBar(p)}</div>
      <div class="card-actions">
        ${p.status === "ready" ? `<button class="btn btn-gold" onclick="uiDepart('${p.id}')">🛫 Depart${wouldOverdraftCO2(p) ? ` <span class="bad-text">⚠ CO₂</span>` : ""}</button>` : ""}
        <button class="btn" ${canOps ? "" : "disabled"} onclick="toggleRouteForm('${p.id}')">${p.route ? "Route" : "Assign route"}</button>
        ${p.route ? `<button class="btn" ${canOps ? "" : "disabled"} onclick="clearRoute('${p.id}');refreshRouteUI()">Unassign</button>` : ""}
        <button class="btn" ${canOps ? "" : "disabled"} onclick="toggleCfgForm('${p.id}')">Configure</button>
        <button class="btn" ${canOps && p.wear > 5 ? "" : "disabled"} onclick="uiMaintain('${p.id}')">Maintain (${fmtMoney(maintCheckCost(t))})</button>
        <button class="btn mini-btn" onclick="toggleFleetMore('${p.id}')">${UI.fleetMore === p.id ? "Less ▴" : "More ▾"}</button>
      </div>
      ${UI.fleetMore === p.id ? `<div class="card-actions-more">
        <button class="btn ${UI.histPlane === p.id ? "btn-gold" : ""}" onclick="toggleHistForm('${p.id}')">📜 Flight log · ${p.flights} fl · ${fmtMoney(p.profit)}</button>
        ${groundBtn}
        ${disposeBtn}
      </div>` : ""}
      ${form}${cfg}${hist}
    </div>`;
  }).join("");
}

function toggleFleetMore(id) {
  UI.fleetMore = UI.fleetMore === id ? null : id;
  refreshPanel(true);
}

function uiFleetSort() {
  UI.fleetSort = UI.fleetSort === "landing" ? null : "landing";
  refreshPanel(true);
}

function uiFleetBrand(id) {
  UI.fleetBrand = id;
  refreshPanel(true);
}

function refreshRouteUI() {
  if (UI.panel === "fleet") refreshPanel(true);
  if (UI.planeCardId) renderPlaneCard();
}

function toggleRouteForm(id) {
  UI.cfgPlane = null;
  UI.routeFormPlane = UI.routeFormPlane === id ? null : id;
  if (UI.routeFormPlane) UI.planeCardHist = false;
  refreshRouteUI();
}

function toggleCfgForm(id) {
  UI.routeFormPlane = null;
  UI.cfgPlane = UI.cfgPlane === id ? null : id;
  refreshPanel(true);
}

function toggleHistForm(id) {
  UI.histPlane = UI.histPlane === id ? null : id;
  if (UI.histPlane) UI.fleetMore = id;
  refreshPanel(true);
}

// Full per-airframe logbook (newest first).
function flightHistHtml(p) {
  const hist = p.hist || [];
  if (!hist.length) {
    return `<div class="route-form hist-form"><span class="muted mini">No completed flights in the logbook yet.</span></div>`;
  }
  const now = G.state.gameMin;
  const rows = hist.map(h => {
    const burn = (h.fuel != null || h.co2 != null)
      ? `<span class="muted mini">⛽ ${(h.fuel || 0) / 1000 < 10 ? ((h.fuel || 0) / 1000).toFixed(1) : fmtNum(Math.round((h.fuel || 0) / 1000))} t · 🌍 ${((h.co2 || 0) / 1000).toFixed(1)} t CO₂</span>`
      : "";
    return `<div class="hist-row">
      <span class="hist-route"><b>${h.from} → ${h.to}</b>${h.charter ? ` <span class="boost-badge">charter</span>` : ""}</span>
      <span class="muted mini">🕐 ${fmtDur(h.min)}</span>
      <span class="muted mini">${h.charter ? "👥 charter party" : h.cargo ? `📦 ${fmtNum(h.pax)} t` : `👥 ${fmtNum(h.pax)} pax`}</span>
      ${burn}
      <span class="${h.net >= 0 ? "ok-text" : "bad-text"}">${fmtMoney(h.net)}</span>
      <span class="muted mini hist-when">${fmtDur(Math.max(0, now - h.t))} ago</span>
    </div>`;
  }).join("");
  return `<div class="route-form hist-form">
    <div class="muted mini">📜 Logbook — ${hist.length} flight${hist.length === 1 ? "" : "s"}</div>
    ${rows}
  </div>`;
}

function planeConfigForm(p) {
  const s = G.state;
  ensureBrands();
  const t = aircraftById[p.typeId];
  const cabin = p.cabin || { F: 0, J: 0, Y: 0 };
  const hub = p._cfgHub || p.homeHub || s.hub;
  const eng = p._cfgEngine || p.engine || "std";
  const brandId = p._cfgBrand || p.brandId || "main";
  const hubOpts = s.hubs.map(code => {
    const a = airportByCode[code];
    const slots = isDomestic(code) ? "" : ` (${hubSlotsUsed(code, p)}/${INTL_HUB_SLOTS})`;
    return `<option value="${code}" ${code === hub ? "selected" : ""}>${code} — ${a.city}${slots}</option>`;
  }).join("");
  const engOpts = Object.values(ENGINES).map(e =>
    `<option value="${e.id}" ${e.id === eng ? "selected" : ""}>${e.name} (burn ×${e.burnMult}, spd ×${e.speedMult})</option>`
  ).join("");
  const brandOpts = s.brands.map(b => {
    const ok = brandAllowsType(b, p.typeId);
    return `<option value="${b.id}" ${b.id === brandId ? "selected" : ""} ${ok ? "" : "disabled"}>${esc(b.name)}${ok ? "" : " (wrong fleet)"}</option>`;
  }).join("");
  const units = t.tons ? 0 : cabinUnits({
    F: p._cfgF != null ? p._cfgF : cabin.F,
    J: p._cfgJ != null ? p._cfgJ : cabin.J,
    Y: p._cfgY != null ? p._cfgY : cabin.Y,
  });
  const f = p._cfgF != null ? p._cfgF : cabin.F;
  const j = p._cfgJ != null ? p._cfgJ : cabin.J;
  const y = p._cfgY != null ? p._cfgY : cabin.Y;

  // --- amenities bay (pax aircraft only) ---
  let amenHtml = "";
  if (!t.tons && !p.freighter) {
    const cur = planeAmen(p);
    const sel = p._cfgAmen || {};
    let refitCost = 0;
    const rows = Object.entries(AMEN_DEFS).map(([k, def]) => {
      const have = cur[k] || 0;
      const pick = sel[k] != null ? +sel[k] : have;
      if (pick > have) refitCost += amenCost(t, k, pick);
      const opts = def.levels.map((lv, i) => {
        const fits = amenAllowed(t, k, i);
        const price = i > have && fits ? ` — ${fmtMoney(amenCost(t, k, i))}` : "";
        const tag = i === have ? " (installed)" : !fits ? " (aircraft too small)" : i < have ? " (remove)" : price;
        return `<option value="${i}" ${i === pick ? "selected" : ""} ${fits ? "" : "disabled"}>${lv.n}${tag}</option>`;
      }).join("");
      const eff = def.levels[pick] || def.levels[0];
      const effTxt = (eff.d ? `${eff.d > 0 ? "+" : ""}${(eff.d * 100).toFixed(1)}% demand` : "no demand effect") +
        (eff.inc ? ` · earns ${fmtMoney(eff.inc)}/pax` : "");
      return `<label>${def.icon} ${def.name}
        <select onchange="cfgAmenSel('${p.id}','${k}',this.value)">${opts}</select>
        <span class="muted mini">${effTxt}</span>
      </label>`;
    }).join("");
    amenHtml = `<div class="cfg-sec">✨ Onboard amenities</div>
      <div class="rf-row amen-row">${rows}</div>
      ${refitCost > 0
        ? `<div class="rf-info">Selected upgrades: <b>${fmtMoney(refitCost)}</b> · ${fmtDur(AMEN_DOWNTIME_MIN)}</div>`
        : ""}`;
  }

  return `<div class="route-form cfg-form cfg-big">
    <div class="cfg-title"><b>⚙ Configure ${p.id}</b> <span class="muted mini">${esc(t.maker)} ${esc(t.name)}</span></div>
    <div class="cfg-sec">🏷 Assignment</div>
    <div class="rf-row">
      <label>Airline brand
        <select onchange="cfgPlaneSel('${p.id}','brand',this.value)">${brandOpts}</select>
      </label>
      <label>Home hub
        <select onchange="cfgPlaneSel('${p.id}','hub',this.value)">${hubOpts}</select>
      </label>
      <label>Engines
        <select onchange="cfgPlaneSel('${p.id}','engine',this.value)">${engOpts}</select>
      </label>
    </div>
    <div class="cfg-sec">💺 Cabin layout</div>
    ${t.tons || p.freighter ? `<div class="muted mini">${t.tons ? "No passenger cabin." : `Freighter conversion · ${planeTons(p)} t.`}</div>`
      : t.charterSpec ? (function () {
        const vip = p._cfgVip || p.vipLayout || defaultVipLayout(t);
        const caps = charterLayoutCaps(t);
        const used = vipLayoutUnits(vip);
        const space = vipLayoutSpace(t);
        const fields = Object.keys(CHARTER_FURN).filter(k => caps[k] > 0).map(k => {
          const def = CHARTER_FURN[k];
          return `<label>${def.name} <input type="number" min="0" max="${caps[k]}" value="${vip[k] || 0}"
            onchange="cfgPlaneSel('${p.id}','${k}',this.value)"></label>`;
        }).join("");
        return `<div class="rf-row cabin-row">${fields}</div>
        <div class="rf-info ${used > space ? "bad-text" : "muted mini"}">Space left ${Math.max(0, space - used)}</div>`;
      })() : `
    <div class="rf-row cabin-row">
      <label>First <input type="number" min="0" value="${f}" onchange="cfgPlaneSel('${p.id}','F',this.value)"></label>
      <label>Business <input type="number" min="0" value="${j}" onchange="cfgPlaneSel('${p.id}','J',this.value)"></label>
      <label>Economy <input type="number" min="0" value="${y}" onchange="cfgPlaneSel('${p.id}','Y',this.value)"></label>
    </div>
    <div class="rf-info ${units > t.seats ? "bad-text" : "muted mini"}">
      Space left ${Math.max(0, t.seats - units)} · ${f + j + y} seats
    </div>`}
    ${amenHtml}
    <div class="cfg-sec">🎨 Livery</div>
    ${NO_PAINT_TYPES[t.id] ? `<div class="muted mini">The ${esc(t.name)} wears its factory paint — no custom liveries.</div>
    <div class="plane-art livery-preview">${planeArtSVG(t)}</div>` : `
    <div class="rf-row livery-row">
      ${["body", "belly", "tail", "eng"].map(part => `<label class="mini">${part === "eng" ? "engines" : part}
        <input type="color" value="${(p._cfgLiv && p._cfgLiv[part]) || (p.livery && p.livery[part]) || ({ body: "#f7fafc", belly: "#dbe4ec", tail: "#e8a833", eng: "#e2e9f0" })[part]}"
          onchange="cfgLivery('${p.id}','${part}',this.value)"></label>`).join("")}
      <button class="btn mini-btn" onclick="cfgLivery('${p.id}','reset','')">Reset livery</button>
    </div>
    <div class="logo-pick muted mini">Tail logo</div>
    <div class="logo-grid">
      ${TAIL_LOGOS.map(L => {
        const cur = (p._cfgLiv && p._cfgLiv.logo !== undefined) ? (p._cfgLiv.logo || "") : ((p.livery && p.livery.logo) || "");
        const on = cur === (L.id || "");
        return `<button type="button" class="logo-chip ${on ? "on" : ""}" title="${esc(L.name)}"
          onclick="cfgLivery('${p.id}','logo','${L.id}')">${
            L.src ? `<img src="${L.src}" alt="${esc(L.name)}">` : `<span>None</span>`
          }</button>`;
      }).join("")}
    </div>
    <div class="muted mini">Repaint: ${fmtMoney(paintCost(t))} · ${fmtDur(PAINT_DOWNTIME_MIN)} in the paint shop</div>
    <div class="plane-art livery-preview">${
      liveryArtHTML(t, { ...(p.livery || {}), ...(p._cfgLiv || {}) }, !!(t.tons || p.freighter))
      || planeArtSVG(t, { ...(p.livery || {}), ...(p._cfgLiv || {}) })
    }</div>`}
    ${!t.tons && !p.freighter && !t.charterSpec ? `<div class="cfg-sec">🔧 Conversions</div>
    <div class="card-actions"><button class="btn" onclick="uiConvertP2F('${p.id}')">Convert to freighter — ${fmtMoney(p2fCost(t))} · ${convTonsOf(t)} t</button></div>` : ""}
    <button class="btn btn-gold" onclick="uiSavePlaneCfg('${p.id}')">Save configuration</button>
  </div>`;
}

function cfgLivery(id, part, val) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  if (NO_PAINT_TYPES[p.typeId]) { toast("This aircraft keeps its factory paint."); return; }
  if (part === "reset") p._cfgLiv = null;   // discard pending colors, keep current paint
  else {
    p._cfgLiv = p._cfgLiv || { ...(p.livery || {}) };
    if (part === "logo") p._cfgLiv.logo = val || "";
    else p._cfgLiv[part] = val;
  }
  refreshPanel(true);
}

function cfgPlaneSel(id, which, val) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  const t = aircraftById[p.typeId];
  if (which === "hub") p._cfgHub = val;
  else if (which === "engine") p._cfgEngine = val;
  else if (which === "brand") p._cfgBrand = val;
  else if (which === "F" || which === "J" || which === "Y") p["_cfg" + which] = Math.max(0, +val || 0);
  else if (CHARTER_FURN[which]) {
    p._cfgVip = { ...(p._cfgVip || p.vipLayout || defaultVipLayout(t) || { seats: 0, tables: 0, couches: 0, beds: 0 }) };
    p._cfgVip[which] = Math.max(0, +val || 0);
    p._cfgVip = clampVipLayout(t, p._cfgVip);
  }
  refreshPanel(true);
}

function cfgAmenSel(id, key, val) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p || !AMEN_DEFS[key]) return;
  p._cfgAmen = p._cfgAmen || {};
  p._cfgAmen[key] = Math.max(0, Math.min(AMEN_DEFS[key].levels.length - 1, +val || 0));
  refreshPanel(true);
}

function uiConvertP2F(id) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  const t = aircraftById[p.typeId];
  if (!confirm(`Convert ${p.id} to a freighter? Seats and cabin are removed forever (${convTonsOf(t)} t payload, ${fmtMoney(p2fCost(t))}).`)) return;
  if (convertToFreighter(id)) { sfx("buy"); UI.cfgPlane = null; refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(G.err || "Cannot convert."); }
}

function uiSavePlaneCfg(id) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  const t = aircraftById[p.typeId];
  const hub = p._cfgHub || p.homeHub || G.state.hub;
  const eng = p._cfgEngine || p.engine || "std";
  const brandId = p._cfgBrand || p.brandId || "main";
  if (!t.tons && !t.charterSpec) {
    const cabin = {
      F: p._cfgF != null ? p._cfgF : (p.cabin?.F || 0),
      J: p._cfgJ != null ? p._cfgJ : (p.cabin?.J || 0),
      Y: p._cfgY != null ? p._cfgY : (p.cabin?.Y || 0),
    };
    if (!setPlaneCabin(id, cabin)) { sfx("deny"); toast("Cabin layout exceeds aircraft capacity."); return; }
  }
  if (t.charterSpec && p._cfgVip) {
    p.vipLayout = clampVipLayout(t, p._cfgVip);
  }
  G.err = null;
  if (brandId !== (p.brandId || "main") && !setPlaneBrand(id, brandId)) {
    sfx("deny"); toast(G.err || "Cannot assign that brand."); return;
  }
  if (hub !== p.homeHub && !setPlaneHub(id, hub)) {
    sfx("deny"); toast(G.err || "Cannot base aircraft at that hub."); return;
  }
  if (eng !== p.engine && !setPlaneEngine(id, eng)) {
    sfx("deny"); toast("Not enough cash to change engines."); return;
  }
  let painted = false;
  if (p._cfgLiv) {
    const liv = p._cfgLiv;
    if (!repaintPlane(id, liv)) { sfx("deny"); toast(G.err || "Cannot repaint right now."); return; }
    delete p._cfgLiv;
    painted = true;
  }
  let refitted = false;
  if (p._cfgAmen) {
    const before = p.status;
    if (!applyAmenities(id, p._cfgAmen)) { sfx("deny"); toast(G.err || "Cannot refit the cabin."); return; }
    refitted = !!p.refitJob && (before !== "maint" || painted);
    delete p._cfgAmen;
  }
  delete p._cfgHub; delete p._cfgEngine; delete p._cfgBrand; delete p._cfgF; delete p._cfgJ; delete p._cfgY; delete p._cfgVip;
  UI.cfgPlane = null;
  sfx(painted || refitted ? "buy" : "click");
  refreshPanel(true); renderTopbar();
  toast(painted && refitted ? `Configuration saved — ${p.id} is in for paint and a cabin refit (${fmtDur(p.timer)}).`
    : painted ? `Configuration saved — ${p.id} is in the paint shop (${fmtDur(PAINT_DOWNTIME_MIN)}).`
    : refitted ? `Configuration saved — ${p.id} is in the cabin shop (${fmtDur(AMEN_DOWNTIME_MIN)}).`
    : "Configuration saved.");
}

function routeForm(p) {
  const s = G.state;
  const t = aircraftById[p.typeId];
  let from = p._selFrom || (p.route ? p.route.from : (p.homeHub || s.hub));
  if (!s.hubs.includes(from)) from = p.homeHub || s.hub;
  const to = p._selTo || (p.route ? p.route.to : "");
  const hubOpts = (sel) => s.hubs.map(code => {
    const a = airportByCode[code];
    const slots = isDomestic(code) ? "" : ` (${hubSlotsUsed(code, p)}/${INTL_HUB_SLOTS} slots)`;
    const base = code === (p.homeHub || s.hub) ? " ★" : "";
    return `<option value="${code}" ${code === sel ? "selected" : ""}>${code} — ${a.city}${base}${slots}</option>`;
  }).join("");
  const isCargo = isFreighter(p);
  const stops = p._selStops || (p.route && p.route.stops ? [...p.route.stops] : []);
  const fare = p._selFare != null ? p._selFare : (p.route && p.route.fareMult) || 1;
  let fareUI = "";
  let info = `<span class="muted">Select a destination…</span>`;
  if (from && to && from !== to) {
    const a = airportByCode[from], b = airportByCode[to];
    const d = Math.round(distKm(a, b));
    const touchesHub = from === s.hub || to === s.hub;
    const penalty = stopoverPenalty(stops.length, isCargo);
    const mult = demandMultiplier({ cargo: isCargo, touchesHub, from, to }) * penalty *
      eventDemandMult(a, b, isCargo) * (isCargo ? 1 : crewDemandMult()) *
      Math.pow(fare, -FARE_ELASTICITY);
    const dem = Math.round((isCargo ? cargoDemand(a, b) : paxDemandTotal(a, b)) * mult);
    const mix = isCargo ? null : routeClassMix(a, b);
    const clsDem = isCargo ? null : routeClassDemand(a, b);
    const mixNote = clsDem
      ? ` · ${fmtNum(clsDem.Y * mult)} Y + ${fmtNum(clsDem.J * mult)} J + ${fmtNum(clsDem.F * mult)} F (${routeMixLabel(mix, a, b)})`
      : "";
    // reference capacity = this aircraft flying the route full-time
    const _rtMin = 2 * (routeTotalDist({ from, to, stops }) / planeSpeed(p) * 60 +
      25 * (stops.length + 1) + stops.length * TECH_STOP_MIN + TURNAROUND_MIN);
    const _capRef = (planeTons(p) || (p.cabin ? cabinPax(p.cabin) : t.seats)) * (1440 / _rtMin);
    const sugg = suggestedFare(from, to, stops, isCargo, _capRef);
    const example = isCargo
      ? `${fmtMoney((650 + 1.35 * d) * fare)}/t`
      : `${fmtMoney(cabinFare("Y", d) * fare)} economy`;
    fareUI = `<div class="rf-row fare-row">
      <label>${isCargo ? "Freight rate" : "Ticket price"}
        <span class="fare-inline"><input type="number" min="${FARE_MIN * 100}" max="${FARE_MAX * 100}" step="5" value="${Math.round(fare * 100)}"
          onchange="rfSetFare('${p.id}',this.value)"> <span class="muted mini">% of standard (${example})</span></span>
      </label>
      <button class="btn mini-btn" onclick="rfSetFare('${p.id}',${Math.round(sugg * 100)})">💡 Suggested: ${Math.round(sugg * 100)}%</button>
    </div>
    ${!isCargo && p.cabin && (p.cabin.J || p.cabin.F) ? `<div class="rf-row fare-row">
      ${p.cabin.J ? `<label class="mini">Business fare <span class="fare-inline"><input type="number" min="${FARE_MIN * 100}" max="${FARE_MAX * 100}" step="5"
        value="${Math.round((p._selFareJ != null ? p._selFareJ : (p.route && p.route.fareJ) || fare) * 100)}"
        onchange="rfSetFareCls('${p.id}','J',this.value)"> <span class="muted mini">%</span></span></label>` : ""}
      ${p.cabin.F ? `<label class="mini">First fare <span class="fare-inline"><input type="number" min="${FARE_MIN * 100}" max="${FARE_MAX * 100}" step="5"
        value="${Math.round((p._selFareF != null ? p._selFareF : (p.route && p.route.fareF) || fare) * 100)}"
        onchange="rfSetFareCls('${p.id}','F',this.value)"> <span class="muted mini">%</span></span></label>` : ""}
    </div>` : ""}`;
    const unit = isCargo ? "t freight/day" : "pax/day";
    const maxSeg = Math.round(longestSegmentKm(from, stops, to));
    const total = Math.round(routeTotalDist({ from, to, stops }));
    const inRange = maxSeg <= t.range;
    const flightMin = total / planeSpeed(p) * 60 + 25 * (stops.length + 1) + stops.length * TECH_STOP_MIN;
    const penNote = penalty < 1 ? ` <span class="bad-text">(−${Math.round((1 - penalty) * 100)}% stopovers)</span>` : "";
    info = inRange
      ? `<span class="ok-text">✓ ${fmtNum(d)} km direct${stops.length ? ` · ${fmtNum(total)} km flown · longest leg ${fmtNum(maxSeg)} km` : ""} · ~${fmtDur(flightMin)} · demand ≈ ${fmtNum(dem)} ${unit}${mixNote}</span>${penNote}`
      : `<span class="bad-text">✗ Longest leg ${fmtNum(maxSeg)} km exceeds ${t.name} range (${fmtNum(t.range)} km)${stops.length ? "" : " — try a stopover"}</span>`;
  }
  const canAddStop = !(isCargo && stops.length >= 1);
  const stopChips = stops.map((c, i) =>
    `<span class="stop-chip">${c}<button class="stop-x" title="Remove stopover" onclick="rfRemoveStop('${p.id}',${i})">×</button></span>`
  ).join("");
  const stopsUI = `<div class="rf-stops">
    <span class="muted mini">Stopovers${isCargo ? " (freight: max 1)" : ""} — extend range, ${isCargo ? "no demand cost" : "cost demand"}:</span>
    ${stopChips || `<span class="muted mini">none</span>`}
    ${canAddStop ? `<button class="btn mini-btn" onclick="rfToggleStopPicker('${p.id}')">${UI.rfStopPicker === p.id ? "Cancel" : "+ Add stop"}</button>` : ""}
    ${UI.rfStopPicker === p.id ? airportPicker("via-" + p.id, null, `rfAddStop('${p.id}',%C)`) : ""}
  </div>`;
  return `<div class="route-form">
    <div class="rf-row">
      <label>From / base hub <select onchange="rfSel('${p.id}','from',this.value)">${hubOpts(from)}</select></label>
    </div>
    <label class="rf-label">Destination${to ? ` — <b class="ok-text">${to} · ${esc(airportByCode[to].city)}</b>` : ""}</label>
    ${airportPicker("to-" + p.id, to, `rfPickTo('${p.id}',%C)`)}
    ${stopsUI}
    ${fareUI}
    <div class="rf-info">${info}</div>
    <button class="btn btn-gold" onclick="uiAssign('${p.id}')">Confirm route${(function(){
      const prev = p.route;
      const same = prev && from && to && ((prev.from === from && prev.to === to) || (prev.from === to && prev.to === from));
      return (from && to && from !== to && !same) ? ` — slot fee ${fmtMoney(routeSlotFee(from, to))}` : "";
    })()}</button>
    <span class="muted mini">Choosing a different origin also re-bases the aircraft there.</span>
  </div>`;
}

function rfSel(id, which, val) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  if (which === "from") p._selFrom = val; else p._selTo = val;
  refreshRouteUI();
}

function rfPickTo(id, code) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  p._selTo = code;
  refreshRouteUI();
}

function rfSetFare(id, pct) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  p._selFare = Math.max(FARE_MIN, Math.min(FARE_MAX, (+pct || 100) / 100));
  refreshRouteUI();
}

function rfSetFareCls(id, cls, pct) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  p["_selFare" + cls] = Math.max(FARE_MIN, Math.min(FARE_MAX, (+pct || 100) / 100));
  refreshRouteUI();
}

function rfToggleStopPicker(id) {
  UI.rfStopPicker = UI.rfStopPicker === id ? null : id;
  refreshRouteUI();
}

function rfAddStop(id, code) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  const cur = p._selStops || (p.route && p.route.stops ? [...p.route.stops] : []);
  if (!cur.includes(code)) cur.push(code);
  p._selStops = cur;
  UI.rfStopPicker = null;
  refreshRouteUI();
}

function rfRemoveStop(id, idx) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  const cur = p._selStops || (p.route && p.route.stops ? [...p.route.stops] : []);
  cur.splice(idx, 1);
  p._selStops = cur;
  refreshRouteUI();
}

function uiAssign(id) {
  const p = G.state.planes.find(x => x.id === id);
  const from = p._selFrom || (p.route ? p.route.from : (p.homeHub || G.state.hub));
  const to = p._selTo || (p.route ? p.route.to : "");
  const stops = p._selStops || (p.route && p.route.stops ? [...p.route.stops] : []);
  const fare = p._selFare != null ? p._selFare : (p.route && p.route.fareMult) || 1;
  if (!to) { toast("Choose a destination first."); return; }
  const fareJ = p._selFareJ != null ? p._selFareJ : (p.route && p.route.fareJ) || fare;
  const fareF = p._selFareF != null ? p._selFareF : (p.route && p.route.fareF) || fare;
  if (assignRoute(id, from, to, stops, fare, fareJ, fareF)) {
    delete p._selStops;
    delete p._selFare;
    delete p._selFareJ;
    delete p._selFareF;
    UI.routeFormPlane = null;
    UI.rfStopPicker = null;
    refreshRouteUI();
    toast(`Route set: ${from} ⇄ ${to}`);
    tutNotify("route");
  } else {
    toast(G.err || "Route not valid for this aircraft.");
  }
}

function uiMaintain(id) {
  if (maintainPlane(id)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast("Cannot maintain right now (in flight, or not enough cash)."); }
}

function uiSell(id) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  if (p.leased) { toast("Leased aircraft must be returned, not sold."); return; }
  if (!confirm(`Sell ${p.id} for ${fmtMoney(planeValue(p))}? (Value falls with wear and flight hours.)`)) return;
  if (sellPlane(id)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast("Cannot sell while in flight or maintenance."); }
}

function uiReturnLease(id) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Return leased ${p.id} to the lessor? Deposit is non-refundable.`)) return;
  if (returnLease(id)) { sfx("click"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast("Cannot return while in flight or maintenance — ground it first."); }
}

function uiGround(id) {
  if (groundPlane(id)) refreshPanel(true);
  else toast("Cannot ground that aircraft right now.");
}

function uiUnground(id) {
  if (ungroundPlane(id)) refreshPanel(true);
  else toast(G.err || "Cannot return to service.");
}

// ---------------- buy ----------------

function ensureBuyCfg(typeId) {
  const t = aircraftById[typeId];
  ensureBrands();
  if (!UI.buyCfg || UI.buyCfg.typeId !== typeId) {
    const preferred = G.state.activeBrandId || "main";
    const brandId = brandAllowsType(brandById(preferred), typeId) ? preferred : "main";
    UI.buyCfg = {
      typeId,
      hub: G.state.hub,
      engine: "std",
      qty: 1,
      brandId,
      cabin: defaultCabin(t) || { F: 0, J: 0, Y: 0 },
      vipLayout: t.charterSpec ? defaultVipLayout(t) : null,
    };
  }
  return UI.buyCfg;
}

function buyCfgSel(typeId, which, val) {
  const cfg = ensureBuyCfg(typeId);
  const t = aircraftById[typeId];
  if (which === "hub") cfg.hub = val;
  else if (which === "engine") cfg.engine = val;
  else if (which === "brand") cfg.brandId = val;
  else if (which === "qty") cfg.qty = Math.max(1, Math.min(50, Math.floor(+val || 1)));
  else if (which === "F" || which === "J" || which === "Y") {
    cfg.cabin[which] = Math.max(0, +val || 0);
    cfg.cabin = clampCabin(t, cfg.cabin);
  } else if (CHARTER_FURN[which]) {
    cfg.vipLayout = cfg.vipLayout || defaultVipLayout(t) || { seats: 0, tables: 0, couches: 0, beds: 0 };
    cfg.vipLayout[which] = Math.max(0, +val || 0);
    cfg.vipLayout = clampVipLayout(t, cfg.vipLayout);
  }
  refreshPanel(true);
}

function buyConfigBlock(a) {
  const s = G.state;
  ensureBrands();
  const cfg = ensureBuyCfg(a.id);
  const qty = Math.max(1, cfg.qty || 1);
  const eng = engineOf(cfg.engine);
  const unitPrice = planeListPrice(a, cfg.engine);
  const unitDeposit = leaseDeposit(a, cfg.engine);
  const freeBays = Math.max(0, s.hangarCap - hangarUsed());
  const hubOpts = s.hubs.map(code => {
    const ap = airportByCode[code];
    const slots = isDomestic(code) ? "" : ` (${hubSlotsUsed(code)}/${INTL_HUB_SLOTS})`;
    return `<option value="${code}" ${code === cfg.hub ? "selected" : ""}>${code} — ${ap.city}${slots}</option>`;
  }).join("");
  const engOpts = Object.values(ENGINES).map(e =>
    `<option value="${e.id}" ${e.id === cfg.engine ? "selected" : ""}>${e.name}</option>`
  ).join("");
  const brandOpts = s.brands.map(b => {
    const ok = brandAllowsType(b, a.id);
    return `<option value="${b.id}" ${b.id === cfg.brandId ? "selected" : ""} ${ok ? "" : "disabled"}>${esc(b.name)}${ok ? "" : " (restricted)"}</option>`;
  }).join("");
  const cabin = cfg.cabin || { F: 0, J: 0, Y: 0 };
  const units = a.tons ? 0 : cabinUnits(cabin);
  let cabinBlock = "";
  if (a.tons) {
    cabinBlock = "";
  } else if (a.charterSpec) {
    const vip = cfg.vipLayout || defaultVipLayout(a);
    const caps = charterLayoutCaps(a);
    const used = vipLayoutUnits(vip);
    const space = vipLayoutSpace(a);
    const fields = Object.keys(CHARTER_FURN).filter(k => caps[k] > 0).map(k => {
      const def = CHARTER_FURN[k];
      return `<label>${def.name} <input type="number" min="0" max="${caps[k]}" value="${vip[k] || 0}"
        onchange="buyCfgSel('${a.id}','${k}',this.value)"></label>`;
    }).join("");
    cabinBlock = `
    <div class="rf-row cabin-row">${fields}</div>
    <div class="muted mini">Space left ${Math.max(0, space - used)}</div>`;
  } else {
    cabinBlock = `
    <div class="rf-row cabin-row">
      <label>First <input type="number" min="0" value="${cabin.F}" onchange="buyCfgSel('${a.id}','F',this.value)"></label>
      <label>Business <input type="number" min="0" value="${cabin.J}" onchange="buyCfgSel('${a.id}','J',this.value)"></label>
      <label>Economy <input type="number" min="0" value="${cabin.Y}" onchange="buyCfgSel('${a.id}','Y',this.value)"></label>
    </div>
    <div class="muted mini">Space left ${Math.max(0, a.seats - units)} · ${cabinPax(cabin)} seats</div>`;
  }
  return `<div class="buy-cfg">
    <div class="rf-row">
      <label>Order for brand
        <select onchange="buyCfgSel('${a.id}','brand',this.value)">${brandOpts}</select>
      </label>
      <label>Deliver to hub
        <select onchange="buyCfgSel('${a.id}','hub',this.value)">${hubOpts}</select>
      </label>
      <label>Engines
        <select onchange="buyCfgSel('${a.id}','engine',this.value)">${engOpts}</select>
      </label>
      <label>Quantity
        <input type="number" min="1" max="${Math.max(1, freeBays)}" value="${qty}"
          onchange="buyCfgSel('${a.id}','qty',this.value)">
      </label>
    </div>
    ${cabinBlock}
    <div class="muted mini">Delivery ${fmtDur(deliveryMinutes(a))} · ${qty}× list ${fmtMoney(unitPrice * qty)}${bulkDiscount(qty) > 0 ? ` <span class="ok-text">(volume −${Math.round(bulkDiscount(qty) * 100)}%${mgmtPlaneDiscount() > 0 ? `, mgmt −${(mgmtPlaneDiscount() * 100).toFixed(1)}% likely` : ""})</span>` : ""}
      · lease (max ${LEASE_MAX_DAYS}d) ${fmtMoney(unitDeposit * qty * (leaseSurchargeActive(a.maker) ? LEASE_SURCHARGE : 1))} down + ${fmtMoney(leaseDailyCost(a, cfg.engine) * qty * (leaseSurchargeActive(a.maker) ? LEASE_SURCHARGE : 1))}/day${leaseSurchargeActive(a.maker) ? ` <span class='bad-text'>(+40% — ${a.maker} cooldown)</span>` : ''}
      · ${freeBays} bay${freeBays === 1 ? "" : "s"} free</div>
  </div>`;
}

function renderBuy() {
  const s = G.state;
  const hangarFull = hangarUsed() >= s.hangarCap;
  const ordersNote = (s.orders && s.orders.length)
    ? ` · <b>${s.orders.length}</b> on order`
    : "";
  const shopTab = UI.shopTab || "new";
  if (shopTab === "used") {
    return `<div class="brand-filter">
      <button class="chip" onclick="uiShopTab('new')">🏭 New aircraft</button>
      <button class="chip active" onclick="uiShopTab('used')">♻️ Used market</button>
      ${shopArtChip()}
    </div>` + renderUsedMarket();
  }
  const makers = [...new Set(AIRCRAFT.map(a => a.maker))].sort();
  const catChips = ["all", "Light", "Regional", "Narrowbody", "Widebody", "Charter", "Freighter"];
  const cur = UI.buyCat || "all";
  return tip(`Balance <b>${fmtMoney(s.cash)}</b> · Hangar <b>${hangarUsed()}/${s.hangarCap}</b>${hangarFull ? ` <span class="bad-text">(full)</span>` : ""}${ordersNote}. Configure cabin, engines & hub before ordering — aircraft arrive after a short delivery.`) +
  `<div class="brand-filter">
    <button class="chip active" onclick="uiShopTab('new')">🏭 New aircraft</button>
    <button class="chip" onclick="uiShopTab('used')">♻️ Used market (${(s.usedMarket || []).length})</button>
    ${shopArtChip()}
  </div>
  <div class="buy-filter">
    <input type="text" placeholder="🔍 Search aircraft…" value="${esc(UI.buySearch || "")}" oninput="buyFilter('q',this.value)">
    <select onchange="buyFilter('maker',this.value)">
      <option value="all">All manufacturers</option>
      ${makers.map(m => `<option value="${esc(m)}" ${UI.buyMaker === m ? "selected" : ""}>${esc(m)}</option>`).join("")}
    </select>
  </div>
  <div class="brand-filter">
    ${catChips.map(c => `<button class="chip ${cur === c ? "active" : ""}" onclick="buyFilter('cat','${c}')">${c === "all" ? "All types" : c}</button>`).join("")}
  </div>
  <div id="buy-list">${buyListHTML()}</div>`;
}

function buyMatches(a) {
  if (a.usedOnly) return false;                 // classics live on the used ramp
  if (prodLeftOf(a.id) <= 0) return false;      // production run sold out
  const q = (UI.buySearch || "").trim().toLowerCase();
  if (UI.buyMaker && UI.buyMaker !== "all" && a.maker !== UI.buyMaker) return false;
  if (UI.buyCat && UI.buyCat !== "all" && a.cat !== UI.buyCat) return false;
  if (q && !`${a.maker} ${a.name}`.toLowerCase().includes(q)) return false;
  return true;
}

function buyFilter(which, val) {
  if (which === "q") {
    UI.buySearch = val;
    const el = document.getElementById("buy-list");
    if (el) el.innerHTML = buyListHTML();   // keep the search input focused
  } else {
    if (which === "maker") UI.buyMaker = val;
    else UI.buyCat = val;
    refreshPanel(true);
  }
}

function buyListHTML() {
  const s = G.state;
  const cats = ["Light", "Regional", "Narrowbody", "Widebody", "Charter", "Freighter"];
  const hangarFull = hangarUsed() >= s.hangarCap;
  const html = cats.map(cat => {
      if (UI.buyCat && UI.buyCat !== "all" && UI.buyCat !== cat) return "";
      // cheapest first within each category
      const list = AIRCRAFT.filter(a => a.cat === cat && buyMatches(a))
        .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
      if (!list.length) return "";
      return renderBuyCat(cat, list, hangarFull);
    }).join("");
  return html || `<div class="empty">No aircraft match your search.</div>`;
}

function renderBuyCat(cat, catAircraft, hangarFull) {
  const s = G.state;
  return [cat].map(cat => {
      const lockCargo = cat === "Freighter" && !s.cargoUnlocked;
      const lockCharter = cat === "Charter" && !s.charterUnlocked;
      const lockWide = cat === "Widebody" && !wideAllowed();
      const locked = lockCargo || lockCharter || lockWide;
      const wideCard = lockWide ? `
        <div class="card">
          <div class="card-head"><div><b>🔒 Heavy Aircraft Certification</b></div>
            <div class="muted mini">Pilot training Lv ${trainLevel("pilot")}/${WIDE_PILOT_LVL}</div></div>
          <div class="card-row muted">Widebodies demand experienced hands on the yoke — train your pilots to level ${WIDE_PILOT_LVL} in the academy, or graduate a widebody-simulator class at your Flight School.</div>
          <div class="card-actions">
            <button class="btn btn-gold" onclick="openPanel('company');uiCompanyTab('training')">Open Training academy →</button>
            <button class="btn" onclick="openPanel('company');uiCompanyTab('school')">Open Flight school →</button>
          </div>
        </div>` : "";
      const unlockCard = wideCard
        + (lockCharter ? `
        <div class="card">
          <div class="card-head"><div><b>🔒 Charter Operations</b></div><div class="price">${CHARTER_UNLOCK_PTS} ⭐</div></div>
          <div class="card-row muted">Open a charter desk in Fleet Management to unlock VIP bizjets. Any passenger aircraft can still fly charter jobs — these earn a pay bonus and draw repeat clients.</div>
          <div class="card-actions">
            <button class="btn" onclick="openPanel('fleet')">Open Fleet Management →</button>
          </div>
        </div>` : "")
        + (lockCargo ? `
        <div class="card">
          <div class="card-head"><div><b>🔒 Cargo Division</b></div><div class="price">${CARGO_UNLOCK_PTS} ⭐</div></div>
          <div class="card-row muted">Found a cargo division to unlock freighter aircraft and freight routes with their own demand market.</div>
          <div class="card-actions">
            <button class="btn ${s.points >= CARGO_UNLOCK_PTS ? "btn-gold" : ""}"
              onclick="uiUnlockCargo()">${s.points >= CARGO_UNLOCK_PTS ? "Unlock cargo operations" : `Needs ${CARGO_UNLOCK_PTS} ⭐ points (you have ${fmtNum(s.points)})`}</button>
          </div>
        </div>` : "");
      return `
    <h3 class="cat-head">${cat === "Charter" ? "Charter · VIP" : cat}</h3>${unlockCard}
    ${catAircraft.map(a => {
      const owned = s.planes.filter(p => p.typeId === a.id && !p.leased).length;
      const leased = s.planes.filter(p => p.typeId === a.id && p.leased).length;
      const cfg = (UI.buyCfg && UI.buyCfg.typeId === a.id) ? UI.buyCfg : null;
      const engId = cfg?.engine || "std";
      const qty = Math.max(1, cfg?.qty || 1);
      const price = planeListPrice(a, engId) * qty;
      const deposit = leaseDeposit(a, engId) * qty;
      const affordBuy = s.cash >= price;
      const affordLease = s.cash >= deposit;
      const open = UI.buyCfg && UI.buyCfg.typeId === a.id;
      const prodLeft = prodLeftOf(a.id);
      const badge = [
        owned ? `×${owned} owned` : "",
        leased ? `×${leased} leased` : "",
      ].filter(Boolean).join(" · ");
      const prodBadge = prodLeft !== Infinity
        ? ` <span class="${prodLeft <= 5 ? "bad-text" : "muted"} mini">⏳ only ${prodLeft} left in production</span>`
        : "";
      const charterBadge = a.charterSpec
        ? ` <span class="boost-badge">★ Charter VIP</span>`
        : "";
      const buyLabel = affordBuy ? (qty > 1 ? `Purchase ×${qty}` : "Purchase") : "Insufficient funds";
      const leaseLabel = affordLease ? (qty > 1 ? `Lease ×${qty}` : "Lease") : "Can't afford deposit";
      return `<div class="card plane-card">
        <div class="card-head">
          <div><b>${a.maker} ${a.name}</b>${charterBadge}${badge ? ` <span class="owned-badge">${badge}</span>` : ""}${prodBadge}</div>
          <div class="price">${fmtMoney(planeListPrice(a, engId))}${qty > 1 && open ? ` <span class="muted mini">×${qty}</span>` : ""}</div>
        </div>
        <div class="plane-art plane-art-shop ${shopArtClass(a.id, false)}">${aircraftImgTag(a, false)}</div>
        <div class="specs">
          <span>${a.tons ? `📦 ${a.tons} t cargo` : `👥 ${a.seats} Y-eq.`}</span>
          <span>📏 ${fmtDist(a.range)}</span>
          <span>💨 ${fmtSpeed(a.speed)}</span>
          <span>⛽ ${a.burn} kg/km</span>
          <span>🌍 ${(a.burn * 3.16 * (a.co2Mult || 1)).toFixed(1)} kg/km</span>
        </div>
        <div class="card-actions">
          <button class="btn ${open ? "btn-gold" : ""}" ${locked ? "disabled" : ""} onclick="uiOpenBuyCfg('${a.id}')">${locked && lockCharter ? "Locked — charter desk" : open ? "Configuring…" : "Configure & order"}</button>
        </div>
        ${open && !locked ? buyConfigBlock(a) + `
        <div class="card-actions">
          <button class="btn ${!hangarFull && affordBuy ? "btn-gold" : ""}" ${hangarFull ? "disabled" : ""} onclick="uiBuy('${a.id}')">${buyLabel}</button>
          <button class="btn" ${hangarFull ? "disabled" : ""} onclick="uiLease('${a.id}')">${leaseLabel}</button>
        </div>` : ""}
      </div>`;
    }).join("")}`;
    }).join("");
}

function uiShopTab(t) {
  UI.shopTab = t;
  refreshPanel(true);
}

// e.g. "📶 No Wi-Fi · 📺 Seatback screens · 💺 Worn, dated cabin"
function amenSummary(a) {
  if (!a) return "";
  return Object.entries(AMEN_DEFS)
    .map(([k, def]) => `${def.icon} ${def.levels[a[k] || 0].n}`)
    .join(" · ");
}

function usedMatches(l) {
  const t = aircraftById[l.typeId];
  if (!t) return false;
  const q = (UI.usedSearch || "").trim().toLowerCase();
  if (!q) return true;
  return `${t.maker} ${t.name} ${t.cat || ""}`.toLowerCase().includes(q);
}

function usedListFiltered() {
  const sort = UI.usedSort || "default";
  let list = (G.state.usedMarket || []).filter(usedMatches);
  if (sort === "price") list = list.slice().sort((a, b) => a.price - b.price || a.wear - b.wear);
  else if (sort === "priceDesc") list = list.slice().sort((a, b) => b.price - a.price || a.wear - b.wear);
  else if (sort === "wear") list = list.slice().sort((a, b) => a.wear - b.wear || a.price - b.price);
  else if (sort === "wearDesc") list = list.slice().sort((a, b) => b.wear - a.wear || a.price - b.price);
  return list;
}

function usedFilter(which, val) {
  if (which === "q") {
    UI.usedSearch = val;
    const el = document.getElementById("used-list");
    if (el) el.innerHTML = usedListHTML();
  } else {
    UI.usedSort = val;
    refreshPanel(true);
  }
}

function usedListHTML() {
  const s = G.state;
  const list = usedListFiltered();
  if (!list.length) {
    const q = (UI.usedSearch || "").trim();
    return `<div class="empty">${q ? "No used airframes match your search." : "Nothing on the used ramp right now — new listings appear every couple of days."}</div>`;
  }
  return list.map(l => {
    const t = aircraftById[l.typeId];
    if (!t) return "";
    const refurbCost = Math.max(0, Math.round(t.price * planePriceMult(t) * 0.85 / 1e5) * 1e5 - l.price);
    const classicBadge = t.usedOnly
      ? ` <span class="boost-badge">${t.id === "conc" ? "🛦 Mach 2 legend" : "♻️ classic — used only"}</span>`
      : "";
    const floodBadge = l.fromEvent != null ? ` <span class="boost-badge">fleet retirement</span>` : "";
    const cargoLock = t.tons && !s.cargoUnlocked;
    const cargoBadge = cargoLock ? ` <span class="boost-badge">📦 needs cargo unlock</span>` : "";
    const amenLine = l.amen ? `<div class="card-row muted mini">${amenSummary(l.amen)}</div>` : "";
    const canBuy = s.cash >= l.price && !cargoLock;
    return `<div class="card plane-card">
      <div class="card-head">
        <div><b>${t.maker} ${t.name}</b> <span class="owned-badge">${fmtNum(l.hours)}h · ${l.wear}% wear</span>${l.engine === "eco" ? ` <span class="boost-badge">eco engines</span>` : ""}${classicBadge}${floodBadge}${cargoBadge}</div>
        <div class="price">${fmtMoney(l.price)}</div>
      </div>
      <div class="plane-art plane-art-shop ${shopArtClass(t.id, true)}">${aircraftImgTag(t, true)}</div>
      ${amenLine}
      <div class="specs">
        <span>${t.tons ? `📦 ${t.tons} t` : `👥 ${t.seats} seats`}</span>
        <span>📏 ${fmtDist(t.range)}</span>
        <span>💨 ${fmtSpeed(t.speed)}</span>
        <span>💾 value ${fmtMoney(usedPriceOf(t, l.hours, 0))} refurbished</span>
      </div>
      <div class="card-actions">
        <button class="btn ${canBuy ? "btn-gold" : ""}" ${cargoLock ? "disabled" : ""} onclick="uiBuyUsed(${l.id}, false)">${cargoLock ? "Unlock cargo to buy" : `Buy as-is — ${fmtMoney(l.price)}`}</button>
        <button class="btn" ${cargoLock ? "disabled" : ""} onclick="uiBuyUsed(${l.id}, true)">${cargoLock ? "—" : `Buy + refurbish — ${fmtMoney(l.price + refurbCost)}`}</button>
      </div>
    </div>`;
  }).join("");
}

function renderUsedMarket() {
  const s = G.state;
  const list = s.usedMarket || [];
  const sort = UI.usedSort || "default";
  if (!list.length) {
    return tip(`Second-hand airframes with real hours. Refurbishing resets wear, fits a modern cabin (Wi-Fi, entertainment, fresh seats) and lets you repaint — flight hours are forever. Buying as-is keeps whatever dated kit the last owner left aboard. Stock size varies; listings rotate every 2 days. Freighters show up sometimes (and in retirement headlines); buying one still needs the cargo division unlocked.`) +
      `<div class="empty">Nothing on the used ramp right now — new listings appear every couple of days.</div>`;
  }
  return tip(`Second-hand airframes with real hours. Refurbishing resets wear, fits a modern cabin (Wi-Fi, entertainment, fresh seats) and lets you repaint — flight hours are forever. Buying as-is keeps whatever dated kit the last owner left aboard. Stock size varies; listings rotate every 2 days. Freighters show up sometimes (and in retirement headlines); buying one still needs the cargo division unlocked.`) +
    `<div class="buy-filter">
      <input type="text" placeholder="🔍 Search used aircraft…" value="${esc(UI.usedSearch || "")}" oninput="usedFilter('q',this.value)">
      <select onchange="usedFilter('sort',this.value)">
        <option value="default" ${sort === "default" ? "selected" : ""}>Sort: default</option>
        <option value="price" ${sort === "price" ? "selected" : ""}>Price ↑</option>
        <option value="priceDesc" ${sort === "priceDesc" ? "selected" : ""}>Price ↓</option>
        <option value="wear" ${sort === "wear" ? "selected" : ""}>Wear ↑</option>
        <option value="wearDesc" ${sort === "wearDesc" ? "selected" : ""}>Wear ↓</option>
      </select>
    </div>
    <div id="used-list">${usedListHTML()}</div>`;
}

function uiBuyUsed(id, refurb) {
  if (buyUsed(id, refurb)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(G.err || "Cannot buy that airframe."); }
}

function uiOpenBuyCfg(typeId) {
  if (UI.buyCfg && UI.buyCfg.typeId === typeId) UI.buyCfg = null;
  else ensureBuyCfg(typeId);
  refreshPanel(true);
}

function uiUnlockCargo() {
  if (unlockCargo()) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(`Unlocking cargo needs ${CARGO_UNLOCK_PTS} points.`); }
}

// Shop artwork: "livery" = painted templates on showroom/sky; "photos" = real photos.
function shopArtPref() {
  try { return localStorage.getItem("sky_shop_art") === "photos" ? "photos" : "livery"; }
  catch (_) { return "livery"; }
}
function toggleShopArt() {
  try { localStorage.setItem("sky_shop_art", shopArtPref() === "photos" ? "livery" : "photos"); }
  catch (_) {}
  refreshPanel(true);
}
function shopArtChip() {
  const photos = shopArtPref() === "photos";
  return `<button type="button" class="chip ${photos ? "active" : ""}" onclick="toggleShopArt()"
    title="Switch between painted liveries and real aircraft photos">${photos ? "📷 Photos" : "🎨 Liveries"}</button>`;
}
function shopArtClass(typeId, used) {
  if (shopArtPref() === "photos") return "photo";
  return shopDisplayFor(typeId, !!used).bg;
}
function shopPhotoFallback(img, typeId, used) {
  if (!img.dataset.fb) {
    img.dataset.fb = "1";
    img.src = used ? `img/${typeId}.jpg` : `img/${typeId}-used.jpg`;
    return;
  }
  const t = aircraftById[typeId];
  if (t) img.outerHTML = planeArtSVG(t);
  else img.remove();
}
// Shop / used ramp: painted livery templates, or Wikipedia/Commons photos.
// Types without art fall back to the SVG silhouette.
function aircraftImgTag(t, used) {
  if (shopArtPref() === "photos") {
    const src = used ? `img/${t.id}-used.jpg` : `img/${t.id}.jpg`;
    return `<img class="plane-photo" src="${src}" alt="${esc(t.maker)} ${esc(t.name)}" loading="lazy"
      onerror="shopPhotoFallback(this,'${t.id}',${used ? "true" : "false"})">`;
  }
  const disp = shopDisplayFor(t.id, !!used);
  const painted = liveryArtHTML(t, shopLiveryFor(t.id, !!used), !!t.tons, disp.pose);
  if (painted) return painted;
  return planeArtSVG(t);
}

function uiBuy(typeId) {
  const cfg = ensureBuyCfg(typeId);
  G.err = null;
  if (buyPlane(typeId, { homeHub: cfg.hub, engine: cfg.engine, cabin: cfg.cabin, vipLayout: cfg.vipLayout, qty: cfg.qty, brandId: cfg.brandId })) {
    sfx("buy"); UI.buyCfg = null; refreshPanel(true); renderTopbar();
    toast("Aircraft ordered — delivery underway.");
  } else {
    sfx("deny");
    toast(G.err || "Not enough cash (or hangar is full).");
  }
}

function uiLease(typeId) {
  const cfg = ensureBuyCfg(typeId);
  G.err = null;
  if (leasePlane(typeId, { homeHub: cfg.hub, engine: cfg.engine, cabin: cfg.cabin, vipLayout: cfg.vipLayout, qty: cfg.qty, brandId: cfg.brandId })) {
    sfx("buy"); UI.buyCfg = null; refreshPanel(true); renderTopbar();
    toast("Lease ordered — delivery underway.");
  } else {
    sfx("deny");
    toast(G.err || "Not enough cash for the lease deposit (or hangar is full).");
  }
}

// ---------------- maintenance ----------------

function engineeringCard() {
  const s = G.state;
  const mech = s.staff.mech || 0;
  const need = Math.ceil(Math.max(1, s.planes.length) / MECH_COVERAGE);
  const pct = s.autoMxPct != null ? s.autoMxPct : 60;
  let status;
  if (!mech) status = `<span class="muted mini">Hire engineers to enable automatic servicing.</span>`;
  else if (s.planes.length > mech * MECH_COVERAGE)
    status = `<span class="bad-text mini">⚠ Understaffed — ${mech} engineer${mech === 1 ? "" : "s"} can cover ${mech * MECH_COVERAGE} aircraft, you fly ${s.planes.length}. Auto-repair paused.</span>`;
  else status = `<span class="ok-text mini">✓ Auto-repair active at your hubs.</span>`;
  return `<div class="card">
    <div class="card-head"><div><b>🔧 Engineering Team</b></div>
      <div class="muted mini">${mech} engineer${mech === 1 ? "" : "s"} · ${fmtMoney(mech * MECH_BASE_PAY * s.staff.payMult)}/day</div></div>
    <div class="card-row muted mini">Engineers automatically service aircraft that land at a hub you own once wear crosses your threshold (1 engineer per ${MECH_COVERAGE} aircraft; normal check cost and downtime apply).</div>
    <div class="card-row">${status}</div>
    <div class="card-row">
      <span class="muted mini">Repair at ≥</span>
      <input type="range" min="30" max="100" step="5" value="${pct}"
        oninput="uiMxPct(this.value)" onchange="save()">
      <b id="mx-pct-label">${pct}%</b> <span class="muted mini">wear</span>
    </div>
    <div class="card-actions">
      <button class="btn" onclick="uiHireMech()">Hire engineer (${fmtMoney(MECH_BASE_PAY * s.staff.payMult)}/day)</button>
      <button class="btn" ${mech ? "" : "disabled"} onclick="uiFireMech()">Release engineer</button>
      <span class="muted mini">fleet of ${s.planes.length} needs ${need}</span>
    </div>
  </div>`;
}

function uiMxPct(v) {
  G.state.autoMxPct = +v;
  const el = document.getElementById("mx-pct-label");
  if (el) el.textContent = v + "%";
}

function uiHireMech() {
  hireMech();
  sfx("click");
  refreshPanel(true);
}

function uiFireMech() {
  if (fireMech()) refreshPanel(true);
  else toast("No engineers to release.");
}

function renderMaint() {
  const s = G.state;
  if (!s.planes.length) return engineeringCard() + `<div class="empty">No aircraft to maintain.</div>`;
  const serviceable = s.planes.filter(p => p.status !== "fly" && p.status !== "maint" && p.wear > 5);
  const totalCost = serviceable.reduce((sum, p) => sum + maintCheckCost(aircraftById[p.typeId]), 0);
  return `${engineeringCard()}
    ${tip(`Airframes gain ${WEAR_PER_HOUR}% wear per flight hour. Above 80% wear passengers stay away (−20% load); past 100% demand collapses further. At ${WEAR_SAFETY}% wear the aircraft is forcibly grounded and fined. A check takes ${fmtDur(MAINT_DURATION_MIN)}.`)}
    ${serviceable.length > 1 ? `<button class="btn btn-gold" onclick="uiMaintAll()">Service all (${fmtMoney(totalCost)})</button>` : ""}
    ${s.planes.map(p => {
      const t = aircraftById[p.typeId];
      const busy = p.status === "fly" || p.status === "maint";
      return `<div class="card">
        <div class="card-head"><div><b>${p.id}</b> <span class="muted">${t.name}</span></div>${statusText(p)}</div>
        <div class="card-row">${wearBar(p)}</div>
        <div class="card-actions">
          <button class="btn" ${busy || p.wear <= 5 ? "disabled" : ""} onclick="uiMaintain('${p.id}')">Service (${fmtMoney(maintCheckCost(t))})</button>
        </div>
      </div>`;
    }).join("")}`;
}

function uiMaintAll() {
  const s = G.state;
  let n = 0;
  for (const p of [...s.planes]) {
    if (p.status !== "fly" && p.status !== "maint" && p.wear > 5) {
      if (maintainPlane(p.id)) n++;
    }
  }
  if (n) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast("Nothing serviced (cash or availability)."); }
}

// ---------------- fuel & co2 ----------------

function renderFuel() {
  const s = G.state;
  const burnDay = fleetFuelPerDayTons();
  const mkSection = (key, label, price, hist, holding, capKg, capLvl, upFn, qty, buyFn, note) => {
    const prev = hist.length > 1 ? hist[hist.length - 2] : price;
    const delta = Math.round(price) - prev;
    const arrow = delta > 0 ? `<span class="bad-text">▲ +${delta}</span>` : delta < 0 ? `<span class="ok-text">▼ ${delta}</span>` : `<span class="muted">–</span>`;
    const upCost = TANK_UPGRADE_PTS[capLvl];
    const pct = Math.min(100, holding / capKg * 100);
    const upBtn = upCost == null
      ? `<span class="muted mini">Max size</span>`
      : `<button class="btn mini-btn" onclick="${upFn}()">⬆ Expand ×2 — ${upCost} ⭐</button>`;
    return `<div class="commodity">
      <h3>${label}</h3>
      <div class="comm-price"><b>$${Math.round(price)}</b><span class="muted">/ton</span> ${arrow}</div>
      <canvas class="spark" id="spark-${key}" width="380" height="70"></canvas>
      <div class="comm-holding">On hand: <b>${fmtNum(holding / 1000)} t</b>
        <span class="muted mini">/ ${fmtNum(capKg / 1000)} t capacity</span> ${upBtn}</div>
      <div class="card-row"><div class="bar"><div class="bar-fill ${pct > 90 ? "bar-warn" : "bar-ok"}" style="width:${pct}%"></div></div>
        ${note}</div>
      <div class="comm-buy">
        <input type="number" id="qty-${key}" min="1" value="${qty}" onchange="UI.${key}Qty=Math.max(1,+this.value)">
        <span class="muted mini">tons</span>
        ${[50, 200, 1000].map(v => `<button class="btn mini-btn" onclick="setQty('${key}',${v})">${v}t</button>`).join("")}
        <button class="btn btn-gold" onclick="${buyFn}()">Buy — <span id="cost-${key}">${fmtMoney(qty * price)}</span></button>
      </div>
    </div>`;
  };
  return mkSection("fuel", "⛽ Jet Fuel", s.fuelPrice, s.fuelHist, s.fuel, fuelCap(), s.fuelCapLvl, "uiUpFuelCap", UI.fuelQty, "uiBuyFuel",
      burnDay > 0 ? `<span class="muted mini">fleet burns ≈ ${fmtNum(burnDay)} t/day</span>` : "") +
    mkSection("co2", "🌍 CO₂ Quota", s.co2Price, s.co2Hist, s.co2, co2Cap(), s.co2CapLvl, "uiUpCo2Cap", UI.co2Qty, "uiBuyCO2",
      burnDay > 0 ? `<span class="muted mini">fleet emits ≈ ${fmtNum(burnDay * 3.16)} t/day</span>` : "") +
    tip(`Prices move every 15 minutes and fuel swings hard — cheap dips are worth stockpiling, spikes can eat most of a thirsty plane's profit${difficultyOf().id === "realism" ? " (on Realism, even fly it at a loss)" : ""}. Aircraft cannot depart without fuel. CO₂ can go negative — each overdraft departure costs <b>−${CO2_OVERDRAFT_REP} reputation</b>. Expand tanks with ⭐ from departures.`);
}

function uiUpFuelCap() {
  if (upgradeFuelCap()) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast("Not enough points for that upgrade."); }
}

function uiUpCo2Cap() {
  if (upgradeCo2Cap()) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast("Not enough points for that upgrade."); }
}

function setQty(key, v) {
  UI[key + "Qty"] = v;
  const inp = $("#qty-" + key);
  if (inp) inp.value = v;
  const s = G.state;
  const price = key === "fuel" ? s.fuelPrice : s.co2Price;
  const cost = $("#cost-" + key);
  if (cost) cost.textContent = fmtMoney(v * price);
}

function uiBuyFuel() {
  const qty = Math.max(1, +($("#qty-fuel")?.value || UI.fuelQty));
  UI.fuelQty = qty;
  if (buyFuel(qty)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast("Not enough cash for that much fuel."); }
}

function uiBuyCO2() {
  const qty = Math.max(1, +($("#qty-co2")?.value || UI.co2Qty));
  UI.co2Qty = qty;
  if (buyCO2(qty)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast("Not enough cash for that much quota."); }
}

// Single-series sparkline: 2px line, subtle fill, hover crosshair + value tooltip
function drawSparklines() {
  const s = G.state;
  mkSpark("spark-fuel", s.fuelHist, "#c97b06");
  mkSpark("spark-co2", s.co2Hist, "#0c9f90");
}

function mkSpark(id, data, color) {
  const cv = document.getElementById(id);
  if (!cv) return;
  cv._data = data; cv._color = color;
  if (!cv._wired) {
    cv._wired = true;
    cv.addEventListener("mousemove", e => {
      const rect = cv.getBoundingClientRect();
      cv._hover = Math.round((e.clientX - rect.left) / rect.width * (cv._data.length - 1));
      paintSpark(cv);
    });
    cv.addEventListener("mouseleave", () => { cv._hover = null; paintSpark(cv); });
  }
  paintSpark(cv);
}

function paintSpark(cv) {
  const data = cv._data, color = cv._color;
  const ctx = cv.getContext("2d");
  const w = cv.width, h = cv.height, pad = 6;
  ctx.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const min = Math.min(...data), max = Math.max(...data);
  const span = Math.max(1, max - min);
  const X = i => pad + i / (data.length - 1) * (w - 2 * pad);
  const Y = v => h - pad - (v - min) / span * (h - 2 * pad);

  // recessive min/max guides
  ctx.strokeStyle = "rgba(150,180,210,0.15)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(pad, Y(max)); ctx.lineTo(w - pad, Y(max)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad, Y(min)); ctx.lineTo(w - pad, Y(min)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "9px system-ui, sans-serif";
  ctx.fillStyle = "rgba(170,195,220,0.55)";
  ctx.fillText(`$${max}`, w - pad - 28, Y(max) + 9);
  ctx.fillText(`$${min}`, w - pad - 28, Y(min) - 3);

  // subtle area fill under the line
  ctx.beginPath();
  data.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)));
  ctx.lineTo(X(data.length - 1), h - pad); ctx.lineTo(X(0), h - pad); ctx.closePath();
  ctx.fillStyle = color + "18";
  ctx.fill();

  // the line
  ctx.beginPath();
  data.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // endpoint dot
  ctx.beginPath();
  ctx.arc(X(data.length - 1), Y(data[data.length - 1]), 3, 0, 7);
  ctx.fillStyle = color;
  ctx.fill();

  // hover crosshair + tooltip
  const hi = cv._hover;
  if (hi != null && hi >= 0 && hi < data.length) {
    const hx = X(hi), hy = Y(data[hi]);
    ctx.strokeStyle = "rgba(200,220,240,0.35)";
    ctx.beginPath(); ctx.moveTo(hx, pad); ctx.lineTo(hx, h - pad); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, 4, 0, 7);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = "#0d1b2e"; ctx.lineWidth = 2; ctx.stroke();
    const label = `$${data[hi]}/t`;
    ctx.font = "600 11px system-ui, sans-serif";
    const tw = ctx.measureText(label).width + 10;
    const tx = Math.max(2, Math.min(w - tw - 2, hx - tw / 2));
    const ty = hy > 26 ? hy - 24 : hy + 10;
    ctx.fillStyle = "rgba(8,20,36,0.95)";
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, 16, 4); ctx.fill();
    ctx.fillStyle = "#e6f0fa";
    ctx.fillText(label, tx + 5, ty + 12);
  }
}

// ---------------- marketing ----------------

function renderMarketing() {
  const s = G.state;
  const mtab = UI.mktTab || "marketing";
  const tabs = `<div class="brand-filter">
    <button class="chip ${mtab === "marketing" ? "active" : ""}" onclick="uiMktTab('marketing')">📣 Marketing</button>
    <button class="chip ${mtab === "finance" ? "active" : ""}" onclick="uiMktTab('finance')">📊 Finance</button>
    <button class="chip ${mtab === "lounges" ? "active" : ""}" onclick="uiMktTab('lounges')">🛋 Lounges</button>
  </div>`;
  if (mtab === "finance") return tabs + renderFinance();
  if (mtab === "lounges") return tabs + renderLoungeDesigner();
  const campaignCard = c => {
    const active = s.campaigns.find(x => x.id === c.id && x.until > s.gameMin);
    const cost = campaignCost(c);
    const afford = s.cash >= cost;
    const effM = campaignEventMult(c.id, "effect");
    const costM = campaignEventMult(c.id, "cost");
    const badge = c.repBoost
      ? `+${campaignEffectRep(c)} reputation`
      : `+${Math.round(campaignEffectBoost(c) * 100)}% pax demand`;
    const easyTag = c.easyOnly ? ` <span class="boost-badge">Easy</span>` : "";
    const newsNote = (effM !== 1 || costM !== 1)
      ? `<div class="card-row muted mini">News cycle: ${[
          effM > 1 ? "stronger effect" : effM < 1 ? "weaker effect" : null,
          costM < 1 ? "cheaper to launch" : costM > 1 ? "pricier to launch" : null,
        ].filter(Boolean).join(" · ")}</div>`
      : "";
    return `<div class="card">
      <div class="card-head"><div><b>${c.name}</b>${easyTag}</div><div class="price">${fmtMoney(cost)}</div></div>
      <div class="card-row muted">${c.desc}</div>
      <div class="card-row"><span class="boost-badge">${badge}</span> <span class="muted mini">for ${c.hours}h game time</span></div>
      ${newsNote}
      <div class="card-actions">
        ${active
          ? `<span class="ok-text">● Active — ${fmtDur(active.until - s.gameMin)} remaining</span>`
          : `<button class="btn ${afford ? "btn-gold" : ""}" onclick="uiCampaign('${c.id}')">Launch campaign</button>`}
      </div>
    </div>`;
  };
  const openCampaigns = CAMPAIGNS.filter(campaignAvailable);
  const adCampaigns = openCampaigns.filter(c => !c.repBoost).map(campaignCard).join("");
  const repCampaigns = openCampaigns.filter(c => c.repBoost).map(campaignCard).join("");

  const lounges = `<div class="card">
    <div class="card-row muted mini">Lounges are now built by hand, hub by hub — furniture, buffets, the lot.</div>
    <div class="card-actions"><button class="btn btn-gold" onclick="uiMktTab('lounges')">Open Lounge designer →</button></div>
  </div>`;

  const current = ALLIANCES.find(a => a.id === s.alliance);
  const alliances = ALLIANCES.map(a => {
    const member = s.alliance === a.id;
    const meetsPts = s.pointsEarned >= a.minPts;
    const afford = s.cash >= a.cost;
    const members = (s.rivals || []).filter(r => r.alliance === a.id).map(r => esc(r.name));
    return `<div class="card">
      <div class="card-head"><div><b>${a.name}</b></div><div class="price">${fmtMoney(a.cost)}</div></div>
      <div class="card-row muted">${a.desc}</div>
      <div class="card-row"><span class="boost-badge">+${Math.round(a.boost * 100)}% pax & cargo demand</span>
        <span class="boost-badge">+${Math.round(a.csBoost * 100)}% per partner on route</span>
        <span class="muted mini">· requires ${fmtNum(a.minPts)} pts earned</span></div>
      <div class="card-row muted mini">Member airlines: ${members.length ? members.join(", ") : "none right now"}.
        Routes also flown by a partner sell extra codeshare tickets (up to ${CODESHARE_PARTNER_CAP} partners count).</div>
      <div class="card-actions">
        ${member ? `<span class="ok-text">● Member</span> <button class="btn" onclick="uiLeaveAlliance()">Leave</button>`
          : meetsPts
            ? `<button class="btn ${afford ? "btn-gold" : ""}" onclick="uiJoinAlliance('${a.id}')">${current ? "Switch" : "Join"} alliance</button>`
            : `<span class="muted mini">🔒 ${fmtNum(a.minPts - s.pointsEarned)} more pts needed</span>`}
      </div>
    </div>`;
  }).join("");

  const sv = s.service;
  const cat = cateringActive();
  const tierSel = UI.catTier || "snack";
  const hoursSel = UI.catHours || 24;
  const estDaily = fleetDailyPaxEstimate();
  const qtyVal = UI.catQty != null ? UI.catQty : Math.max(100, Math.round(estDaily * hoursSel / 24));
  const tierChips = MEALS.filter(m => m.sell > 0).map(m => {
    const locked = !mealUnlocked(m.id);
    return `<button class="chip ${tierSel === m.id ? "active" : ""}" ${locked ? "" : ""}
      onclick="${locked ? `toast('Chef academy Lv ${m.id === "hot" ? 1 : 2} required (Company → Training)')` : `uiCatSel('tier','${m.id}')`}">
      ${locked ? "🔒 " : ""}${m.name} · buy ${fmtMoney(m.cost)} → sell ${fmtMoney(m.sell)} · +${Math.round(m.boost * 100)}%</button>`;
  }).join("");
  const hourChips = CATERING_HOURS.map(h => {
    const lbl = h === 720 ? "1 month" : h === 168 ? "1 week" : h + "h";
    return `<button class="chip ${+hoursSel === h ? "active" : ""}" onclick="uiCatSel('hours',${h})">${lbl}</button>`;
  }).join("");
  const status = cat
    ? `<span class="ok-text">🍽 ${fmtNum(cat.qty)} ${mealOf(cat.tier).name.toLowerCase()}s loaded · fresh for ${fmtDur(cat.until - G.state.gameMin)} · +${Math.round(mealOf(cat.tier).boost * 100)}% demand${mealOf(cat.tier).rep ? ` · +${mealOf(cat.tier).rep} rep/flight` : ""}</span>`
    : `<span class="bad-text">No catering loaded — passengers grumble (${Math.round(MEALS[0].boost * 100)}% demand)</span>`;
  const mealBuy = (MEALS.find(m => m.id === tierSel) || MEALS[1]).cost;
  const mealSell = (MEALS.find(m => m.id === tierSel) || MEALS[1]).sell;
  const onboard = `<div class="card">
    <div class="card-row">${status}</div>
    <div class="card-row muted mini">Buy meals as stock, sell them onboard for more — profit is ${fmtMoney(mealSell - mealBuy)} each at this tier. Unsold leftovers that expire are money down the drain. The menu also lifts demand while stock lasts. Your fleet boards ≈ ${fmtNum(estDaily)} pax/day.</div>
    <div class="brand-filter">${tierChips}</div>
    <div class="brand-filter">${hourChips}</div>
    <div class="card-row">
      <input type="number" min="1" value="${qtyVal}" onchange="uiCatSel('qty',this.value)">
      <span class="muted mini">meals</span>
      <button class="btn btn-gold" onclick="uiBuyCatering()">Buy catering — ${fmtMoney(mealBuy * qtyVal)}</button>
    </div>
    <div class="card-row">
      <label class="svc-toggle"><input type="checkbox" ${sv.amenities ? "checked" : ""} onchange="uiToggleAmenity()">
        🧴 Amenity kits <span class="muted mini">$${AMENITY_COST}/pax · +${Math.round(AMENITY_BOOST * 100)}% demand</span></label>
      <label class="svc-toggle"><input type="checkbox" ${sv.models ? "checked" : ""} onchange="uiToggleModels()">
        ✈️ Model planes for purchase <span class="muted mini">$${MODELS_COST}/pax · +${Math.round(MODELS_BOOST * 100)}% demand</span></label>
    </div>
    <div class="card-row">
      <label class="mini muted">Signature dish
        <input type="text" maxlength="40" value="${esc(sv.dish || "")}" placeholder="e.g. Short rib with truffle mash"
          onchange="setSignatureDish(this.value); toast('Menu updated. Bon appétit!')">
      </label>
    </div>
  </div>`;
  const repBoost = Math.round(repCampaignBoost());
  return tabs + tip(`Reputation (${Math.round(effReputation())}/100${repBoost ? ` — incl. <span class="ok-text">+${repBoost}</span> from campaigns` : ""}) caps how full your planes get — about ${Math.round(effReputation())}% of seats (±10%), regardless of route heat.`) +
    `<h3 class="cat-head">Onboard Experience</h3>${onboard}
    <h3 class="cat-head">Ad Campaigns</h3>${adCampaigns}
    <h3 class="cat-head">Reputation Campaigns</h3>${repCampaigns}
    <h3 class="cat-head">Hub Lounges — ${s.hub}</h3>${lounges}
    <h3 class="cat-head">Alliance Codeshare</h3>${alliances}`;
}

function uiCatSel(which, val) {
  if (which === "tier") UI.catTier = val;
  else if (which === "hours") { UI.catHours = +val; UI.catQty = null; }
  else UI.catQty = Math.max(1, Math.floor(+val || 1));
  refreshPanel(true);
}

function uiBuyCatering() {
  const tier = UI.catTier || "snack";
  const hours = UI.catHours || 24;
  const est = fleetDailyPaxEstimate();
  const qty = UI.catQty != null ? UI.catQty : Math.max(100, Math.round(est * hours / 24));
  if (buyCatering(tier, qty, hours)) { sfx("buy"); UI.catQty = null; refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(G.err || "Cannot load catering."); }
}

function uiSetMeal(id) {
  G.err = null;
  if (setMeal(id)) { sfx("click"); refreshPanel(true); }
  else { sfx("deny"); toast(G.err || "Cannot select that meal."); }
}

function uiToggleAmenity() {
  toggleAmenity();
  sfx("click");
  refreshPanel(true);
}

function uiToggleModels() {
  toggleModels();
  sfx("click");
  refreshPanel(true);
}

function uiMktTab(t) {
  UI.mktTab = t;
  refreshPanel(true);
}

function renderFinance() {
  const s = G.state;
  const fin = s.fin || { rev: {}, exp: {} };
  const rows = (book) => Object.entries(book).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<div class="card-row"><span class="muted">${esc(k)}</span>
      <b style="margin-left:auto">${fmtMoney(v)}</b></div>`).join("")
    || `<div class="card-row muted mini">Nothing yet.</div>`;
  const totR = Object.values(fin.rev).reduce((a, b) => a + b, 0);
  const totE = Object.values(fin.exp).reduce((a, b) => a + b, 0);
  const net = totR - totE;
  return `
    <div class="card">
      <div class="card-head"><div><b>Lifetime result</b></div>
        <b class="${net >= 0 ? "ok-text" : "bad-text"}">${fmtMoney(net)}</b></div>
      <div class="card-row muted mini">Income ${fmtMoney(totR)} · Expenses ${fmtMoney(totE)} · Cash on hand ${fmtMoney(s.cash)}</div>
    </div>
    <h3 class="cat-head">Income</h3>
    <div class="card">${rows(fin.rev)}</div>
    <h3 class="cat-head">Expenses</h3>
    <div class="card">${rows(fin.exp)}</div>
    <div class="card">
      <div class="card-head"><div><b>Running costs right now</b></div></div>
      <div class="card-row muted mini">Payroll ${fmtMoney(dailyPayroll())}/day · Leases ${fmtMoney(s.planes.filter(p => p.leased).reduce((a, p) => a + leaseDailyCost(aircraftById[p.typeId], p.engine), 0))}/day · Fleet burns ≈ ${fmtNum(fleetFuelPerDayTons())} t fuel/day</div>
    </div>`;
}

function renderLoungeDesigner() {
  const s = G.state;
  // No hub picked yet → show the lounges menu (overview of every hub).
  if (!UI.loungeHub || !s.hubs.includes(UI.loungeHub)) return renderLoungeMenu();
  const hub = UI.loungeHub;
  const back = `<div class="card-row" style="margin-bottom:8px"><button class="btn" onclick="UI.loungeHub=null;refreshPanel(true)">← Back to lounges</button></div>`;
  const L = loungeAt(hub);
  if (!L) {
    return back + `<h3 class="cat-head">Build a lounge — ${hub}</h3>
      <div class="muted mini panel-note">No lounge at ${hub} yet. Pick a room — bigger rooms unlock fancier furniture and fit more of it.</div>` +
      Object.entries(LOUNGE_SIZES).map(([k, sz]) => { const rc = loungeRoomCost(sz); return `<div class="card">
        <div class="card-head"><div><b>${sz.label}</b> <span class="muted mini">${sz.w}×${sz.h}</span></div>
          <div class="price">${fmtMoney(rc)}</div></div>
        <div class="card-row muted mini">${k === "small" ? "Chairs, tables, plants, vending." : k === "medium" ? "Adds couches, washrooms, check-in desks." : "Everything, plus buffets and a cocktail bar."}</div>
        <div class="card-actions">
          <button class="btn ${s.cash >= rc ? "btn-gold" : ""}" onclick="uiBuyLoungeRoom('${hub}','${k}')">Build at ${hub}</button>
        </div>
      </div>`; }).join("");
  }
  const sz = LOUNGE_SIZES[L.size];
  const st = loungeStats(hub);
  const tool = UI.loungeTool || "chair";
  const palette = Object.entries(LOUNGE_ITEMS).map(([k, it]) => {
    const locked = SIZE_RANK[L.size] < SIZE_RANK[it.min];
    return `<button class="chip ${tool === k && !locked ? "active" : ""}"
      onclick="${locked ? `toast('${it.name}s need a ${LOUNGE_SIZES[it.min].label} or bigger.')` : `UI.loungeTool='${k}';refreshPanel(true)`}">
      ${locked ? "🔒" : it.icon} ${it.name} · ${fmtMoney(it.cost)}</button>`;
  }).join("");
  const byPos = {};
  for (const it of L.items) byPos[it.x + "_" + it.y] = it;
  let grid = "";
  for (let y = 0; y < sz.h; y++) {
    for (let x = 0; x < sz.w; x++) {
      const it = byPos[x + "_" + y];
      grid += `<button class="lg-cell ${it ? "filled" : ""}" title="${it ? LOUNGE_ITEMS[it.t].name + " (click to remove, 50% refund)" : "Place " + (LOUNGE_ITEMS[tool] || {}).name}"
        onclick="uiLoungeCell('${hub}',${x},${y})">${it ? LOUNGE_ITEMS[it.t].icon : ""}</button>`;
    }
  }
  const net = (st.earned || 0) - (st.upkeepPaid || 0);
  return back + `
    <div class="card">
      <div class="card-head"><div><b>🛋 ${sz.label} — ${hub}</b></div>
        <div class="muted mini">${L.items.length} items</div></div>
      <div class="card-row mini">Comfort <b>${st.comfort}</b> ${hub === s.hub ? `· demand boost <b class="ok-text">+${(st.boost * 100).toFixed(1)}%</b> on hub routes` : `<span class="muted">(demand boost applies at your home hub only)</span>`}
        · earns <b>${fmtMoney(st.incomePerPax)}</b>/arriving pax · upkeep <b>${fmtMoney(st.upkeepDay)}</b>/day</div>
      <div class="card-row mini">Lifetime: earned <b>${fmtMoney(st.earned)}</b> − upkeep <b>${fmtMoney(st.upkeepPaid)}</b> =
        <b class="${net >= 0 ? "ok-text" : "bad-text"}">${fmtMoney(net)}</b></div>
    </div>
    <div class="brand-filter">${palette}</div>
    <div class="muted mini" style="margin-bottom:6px">Pick furniture, then click a tile to place it. Click a placed item to remove it (50% back).</div>
    <div class="lounge-grid" style="grid-template-columns: repeat(${sz.w}, 1fr)">${grid}</div>`;
}

// Overview: your existing lounges up top, hubs you could still build at below.
function renderLoungeMenu() {
  const s = G.state;
  const withLounge = s.hubs.filter(h => loungeAt(h));
  const without = s.hubs.filter(h => !loungeAt(h));
  const intro = tip(`Build and furnish a lounge at any of your hubs — one per hub. A lounge at your home hub (${s.hub}) also boosts passenger demand on its routes.`);

  const ownedCards = withLounge.map(h => {
    const sz = LOUNGE_SIZES[loungeAt(h).size];
    const st = loungeStats(h);
    const L = loungeAt(h);
    return `<div class="card">
      <div class="card-head"><div><b>🛋 ${h}</b> <span class="muted mini">${sz.label}</span>${h === s.hub ? ` <span class="owned-badge">home hub</span>` : ""}</div>
        <div class="muted mini">${L.items.length} items · comfort ${st.comfort}</div></div>
      <div class="card-row mini">${h === s.hub
        ? `demand boost <b class="ok-text">+${(st.boost * 100).toFixed(1)}%</b> on hub routes`
        : `earns <b>${fmtMoney(st.incomePerPax)}</b>/arriving pax`} · upkeep <b>${fmtMoney(st.upkeepDay)}</b>/day</div>
      <div class="card-actions"><button class="btn btn-gold" onclick="UI.loungeHub='${h}';refreshPanel(true)">Manage & design →</button></div>
    </div>`;
  }).join("");

  const buildCards = without.map(h => `<div class="card">
      <div class="card-head"><div><b>${h}</b> <span class="muted mini">${esc(airportByCode[h] ? airportByCode[h].city : "")}</span>${h === s.hub ? ` <span class="owned-badge">home hub</span>` : ""}</div>
        <div class="muted mini">No lounge yet</div></div>
      <div class="card-actions"><button class="btn btn-gold" onclick="UI.loungeHub='${h}';refreshPanel(true)">Build a lounge →</button></div>
    </div>`).join("");

  let html = intro;
  if (ownedCards) html += `<h3 class="cat-head">Your lounges</h3>${ownedCards}`;
  html += `<h3 class="cat-head">Build a new lounge</h3>`;
  html += without.length
    ? buildCards
    : `<div class="muted mini panel-note">Every one of your hubs has a lounge. Open more hubs from the map (click an airport) to build additional lounges.</div>`;
  return html;
}

function uiBuyLoungeRoom(hub, size) {
  if (buyLoungeRoom(hub, size)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(G.err || "Cannot build that."); }
}

function uiLoungeCell(hub, x, y) {
  const L = loungeAt(hub);
  if (!L) return;
  if (L.items.some(i => i.x === x && i.y === y)) {
    removeLoungeItem(hub, x, y);
    sfx("click");
  } else if (placeLoungeItem(hub, UI.loungeTool || "chair", x, y)) {
    sfx("click");
  } else {
    sfx("deny");
    toast(G.err || "Cannot place that here.");
  }
  refreshPanel(true);
  renderTopbar();
}

function uiLounge() {
  if (buyLounge()) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast("Cannot build that lounge right now."); }
}

function uiJoinAlliance(id) {
  if (joinAlliance(id)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast("Requirements not met for that alliance."); }
}

function uiLeaveAlliance() {
  if (confirm("Leave your alliance? You lose the demand boost and any joining fee.")) {
    leaveAlliance(); refreshPanel(true);
  }
}

function uiCampaign(id) {
  if (startCampaign(id)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast("Cannot launch that campaign right now."); }
}

// ---------------- company ----------------

function renderCompany() {
  const tab = UI.companyTab || "overview";
  const tabs = `<div class="brand-filter">
    <button class="chip ${tab === "overview" ? "active" : ""}" onclick="uiCompanyTab('overview')">Overview</button>
    <button class="chip ${tab === "competitors" ? "active" : ""}" onclick="uiCompanyTab('competitors')">🏢 Competitors</button>
    <button class="chip ${tab === "training" ? "active" : ""}" onclick="uiCompanyTab('training')">🎓 Training · ${G.state.trainPts} TP</button>
    <button class="chip ${tab === "school" ? "active" : ""}" onclick="uiCompanyTab('school')">🏫 Flight school</button>
  </div>`;
  return tabs + (tab === "training" ? renderTraining()
    : tab === "competitors" ? renderCompetitors()
    : tab === "school" ? renderFlightSchool()
    : renderCompanyOverview());
}

function uiCompanyTab(t) {
  UI.companyTab = t;
  refreshPanel(true);
}

function renderTraining() {
  const s = G.state;
  const header = `<div class="card">
    <div class="card-head"><div><b>🎓 Training points</b></div><div class="price">${s.trainPts} TP</div></div>
    <div class="card-row muted mini">Crews occasionally earn a training point on departures (about 1 in 25). Spend them on permanent upgrades — every graduation also gives your reputation a small lift.</div>
  </div>`;
  const dispatch = `<div class="card">
    <div class="card-head"><div><b>🛫 Dispatch Office</b>${s.autoDepartOwned ? ` <span class="owned-badge">${s.autoDepart ? "auto" : "manual"}</span>` : ""}</div>
      ${s.autoDepartOwned ? `<span class="${s.autoDepart ? "ok-text" : "muted"} mini">${s.autoDepart ? "✓ Automatic departures" : "Standing by (manual mode)"}</span>` : `<div class="price">${AUTODEPART_TP} TP</div>`}</div>
    <div class="card-row muted mini">Without dispatchers, aircraft wait at the gate after every turnaround until you send them off from Fleet Management. Staff the office once and departures run themselves, forever.</div>
    ${s.autoDepartOwned
      ? `<div class="card-actions">
          <button class="btn" onclick="toggleAutoDepart(); refreshPanel(true);">${s.autoDepart ? "Switch to manual" : "Resume automatic"}</button>
          <button class="btn ${s.autoDepartGuardCO2 ? "btn-gold" : ""}" onclick="toggleAutoDepartGuardCO2(); refreshPanel(true);"
            title="When on, auto-dispatch stands down and holds the plane if the next leg would overdraw CO₂">${s.autoDepartGuardCO2 ? "🌍 CO₂ guard ON" : "🌍 CO₂ guard off"}</button>
        </div>
        ${s.autoDepartGuardCO2 ? `<div class="card-row muted mini">If a departure would overdraw CO₂, dispatch switches to manual and the aircraft waits at Ready.</div>` : ""}`
      : `<div class="card-actions">
      <button class="btn ${s.trainPts >= AUTODEPART_TP ? "btn-gold" : ""}" onclick="uiUnlockAutoDepart()">Staff the office — ${AUTODEPART_TP} TP</button>
    </div>`}
  </div>`;
  const bays = `<div class="card">
    <div class="card-head"><div><b>🏗 Ground-crew ingenuity</b></div>
      ${s.hangarCap >= HANGAR_TP_MIN_CAP ? `<div class="price">${HANGAR_TP_COST} TP</div>` : `<span class="muted mini">unlocks at ${HANGAR_TP_MIN_CAP} hangar bays</span>`}</div>
    <div class="card-row muted mini">Once your hangar reaches ${HANGAR_TP_MIN_CAP} bays, trained ground crews can squeeze in one extra space at a time — instantly, no construction.</div>
    ${s.hangarCap >= HANGAR_TP_MIN_CAP ? `<div class="card-actions">
      <button class="btn ${s.trainPts >= HANGAR_TP_COST ? "btn-gold" : ""}" onclick="uiHangarTP()">+1 hangar bay — ${HANGAR_TP_COST} TP (now ${s.hangarCap})</button>
    </div>` : ""}
  </div>`;
  return header + dispatch + bays + Object.entries(TRAINING).map(([k, t]) => {
    const lvl = trainLevel(k);
    const maxed = lvl >= t.max;
    const cost = t.costs[lvl];
    const pips = Array.from({ length: t.max }, (_, i) => `<span class="pip ${i < lvl ? "on" : ""}"></span>`).join("");
    const effect = k === "pilot" ? `−${4 * lvl}% airframe wear${lvl >= WIDE_PILOT_LVL ? " · ✓ widebody certified" : ` · widebodies at Lv ${WIDE_PILOT_LVL}`}`
      : k === "crew" ? `+${lvl}% passenger demand`
      : k === "chef" ? (lvl === 0 ? "snack service only" : lvl === 1 ? "Hot meals unlocked" : "Gourmet menu unlocked")
      : `−${2 * lvl}% payroll · −${(1.5 * lvl).toFixed(1)}% on negotiated aircraft deals`;
    return `<div class="card">
      <div class="card-head"><div><b>${t.icon} ${t.name}</b> <span class="owned-badge">Lv ${lvl}/${t.max}</span></div>
        ${maxed ? `<span class="ok-text mini">★ Maxed</span>` : `<div class="price">${cost} TP</div>`}</div>
      <div class="card-row">${pips}</div>
      <div class="card-row muted mini">${t.desc}</div>
      <div class="card-row mini">Current effect: <b>${effect}</b></div>
      ${maxed ? "" : `<div class="card-actions">
        <button class="btn ${s.trainPts >= cost ? "btn-gold" : ""}" onclick="uiTrain('${k}')">Train — ${cost} TP</button>
      </div>`}
    </div>`;
  }).join("");
}

// ---------------- flight school (Company tab) ----------------

function renderFlightSchool() {
  const s = G.state;
  if (!UI.schoolHub || !s.hubs.includes(UI.schoolHub)) return renderFlightSchoolMenu();
  const hub = UI.schoolHub;
  const back = `<div class="card-row" style="margin-bottom:8px"><button class="btn" onclick="UI.schoolHub=null;refreshPanel(true)">← Back to flight schools</button></div>`;
  const S = schoolAt(hub);
  if (!S) {
    return back + `<h3 class="cat-head">Build a flight school — ${hub}</h3>
      <div class="muted mini panel-note">Pick a campus — bigger campuses unlock simulators and fit more of them.</div>` +
      Object.entries(SCHOOL_SIZES).map(([k, sz]) => { const rc = schoolRoomCost(sz); return `<div class="card">
        <div class="card-head"><div><b>${sz.label}</b> <span class="muted mini">${sz.w}×${sz.h}</span></div>
          <div class="price">${fmtMoney(rc)}</div></div>
        <div class="card-row muted mini">${k === "small" ? "Classrooms only — desks, library, coffee. No simulators yet." : k === "medium" ? "Adds briefing rooms, instructor offices and narrowbody simulators." : "Everything, plus full-motion widebody simulators."}</div>
        <div class="card-actions">
          <button class="btn ${s.cash >= rc ? "btn-gold" : ""}" onclick="uiBuySchoolRoom('${hub}','${k}')">Build at ${hub}</button>
        </div>
      </div>`; }).join("");
  }
  const sz = SCHOOL_SIZES[S.size];
  const st = schoolStats(hub);
  const tool = UI.schoolTool || "desk";
  const palette = Object.entries(SCHOOL_ITEMS).map(([k, it]) => {
    const locked = SIZE_RANK[S.size] < SIZE_RANK[it.min];
    return `<button class="chip ${tool === k && !locked ? "active" : ""}"
      onclick="${locked ? `toast('${it.name}s need a ${SCHOOL_SIZES[it.min].label} or bigger.')` : `UI.schoolTool='${k}';refreshPanel(true)`}">
      ${locked ? "🔒" : it.icon} ${it.name} · ${fmtMoney(it.cost)}</button>`;
  }).join("");
  const byPos = {};
  for (const it of S.items) byPos[it.x + "_" + it.y] = it;
  let grid = "";
  for (let y = 0; y < sz.h; y++) {
    for (let x = 0; x < sz.w; x++) {
      const it = byPos[x + "_" + y];
      grid += `<button class="lg-cell ${it ? "filled" : ""}" title="${it ? SCHOOL_ITEMS[it.t].name + " (click to remove, 50% refund)" : "Place " + (SCHOOL_ITEMS[tool] || {}).name}"
        onclick="uiSchoolCell('${hub}',${x},${y})">${it ? SCHOOL_ITEMS[it.t].icon : ""}</button>`;
    }
  }
  const classes = S.classes || [];
  const classRows = classes.length ? classes.map(c => {
    const total = c.end - c.start;
    const pct = Math.round(Math.min(100, Math.max(0, (s.gameMin - c.start) / Math.max(1, total) * 100)));
    return `<div class="card-row mini">
      <span>${c.kind === "wide" ? "✈️ Widebody" : "🛩️ Narrowbody"} class · <b>${c.n} cadets</b></span>
      <div class="bar"><div class="bar-fill bar-ok" style="width:${pct}%"></div></div>
      <span class="muted mini">wings in ${fmtDur(Math.max(0, c.end - s.gameMin))}</span>
    </div>`;
  }).join("") : `<div class="card-row muted mini">No classes running — place a simulator and cadets will enrol on their own.</div>`;
  const pool = s.pilotPool || { narrow: 0, wide: 0 };
  return back + `
    <div class="card">
      <div class="card-head"><div><b>🏫 ${sz.label} — ${hub}</b></div>
        <div class="muted mini">${S.items.length} items · ${st.grads} graduates so far</div></div>
      <div class="card-row mini">Simulators: <b>${st.simN}</b> narrowbody · <b>${st.simW}</b> widebody
        · class size <b>${CLASS_BASE_CADETS + st.bonus}</b> cadets${st.speedMult < 1 ? ` · courses <b class="ok-text">−${Math.round((1 - st.speedMult) * 100)}%</b> shorter` : ""}
        · upkeep <b>${fmtMoney(st.upkeepDay)}</b>/day</div>
      <div class="card-row mini muted">Narrowbody course ${CLASS_DAYS.narrow} days · widebody course ${CLASS_DAYS.wide} days. Graduates join your pilot pool at ${Math.round(CADET_PAY_MULT * 100)}% pay and each class banks training points${wideAllowed() ? "" : " — a widebody class also certifies your airline for heavy aircraft"}.</div>
    </div>
    <div class="card">
      <div class="card-head"><div><b>🎓 Cadet classes</b></div>
        <div class="muted mini">pilot pool: ${pool.narrow || 0} narrowbody · ${pool.wide || 0} widebody</div></div>
      ${classRows}
    </div>
    <div class="brand-filter">${palette}</div>
    <div class="muted mini" style="margin-bottom:6px">Pick equipment, then click a tile to place it. Click a placed item to remove it (50% back). Desks, libraries and briefing rooms grow class sizes; instructor offices shorten courses.</div>
    <div class="lounge-grid" style="grid-template-columns: repeat(${sz.w}, 1fr)">${grid}</div>`;
}

// Overview: campuses you run up top, hubs still without one below.
function renderFlightSchoolMenu() {
  const s = G.state;
  const withSchool = s.hubs.filter(h => schoolAt(h));
  const without = s.hubs.filter(h => !schoolAt(h));
  const pool = s.pilotPool || { narrow: 0, wide: 0 };
  const intro = tip(`Build a flight school at any hub — one per hub. Simulators run continuous cadet classes: narrowbody courses take ${CLASS_DAYS.narrow} days, widebody ${CLASS_DAYS.wide}. Graduates wait in your pilot pool and crew new deliveries at ${Math.round(CADET_PAY_MULT * 100)}% of market pay, every class earns training points, and your first widebody class certifies the airline for heavy aircraft (no Pilot Lv ${WIDE_PILOT_LVL} needed).`);
  const poolCard = (pool.narrow || pool.wide || (s.staff.cadets || 0)) ? `<div class="card">
    <div class="card-head"><div><b>🎓 Pilot pool</b></div>
      <div class="muted mini">${(pool.narrow || 0) + (pool.wide || 0)} awaiting a cockpit</div></div>
    <div class="card-row mini">🛩️ ${pool.narrow || 0} narrowbody-rated · ✈️ ${pool.wide || 0} widebody-rated
      ${s.staff.cadets ? ` · ${Math.min(s.staff.cadets, s.staff.pilots)} already flying for you at ${Math.round(CADET_PAY_MULT * 100)}% pay` : ""}</div>
    <div class="card-row muted mini">Pool pilots are unpaid until a new aircraft needs them — they take the jump seats before any market hires.</div>
  </div>` : "";

  const ownedCards = withSchool.map(h => {
    const S = schoolAt(h);
    const sz = SCHOOL_SIZES[S.size];
    const st = schoolStats(h);
    const running = (S.classes || []).length;
    return `<div class="card">
      <div class="card-head"><div><b>🏫 ${h}</b> <span class="muted mini">${sz.label}</span>${h === s.hub ? ` <span class="owned-badge">home hub</span>` : ""}</div>
        <div class="muted mini">${st.simN + st.simW} sims · ${running} class${running === 1 ? "" : "es"} running</div></div>
      <div class="card-row mini">${st.grads} graduates to date · upkeep <b>${fmtMoney(st.upkeepDay)}</b>/day</div>
      <div class="card-actions"><button class="btn btn-gold" onclick="UI.schoolHub='${h}';refreshPanel(true)">Manage & design →</button></div>
    </div>`;
  }).join("");

  const buildCards = without.map(h => `<div class="card">
      <div class="card-head"><div><b>${h}</b> <span class="muted mini">${esc(airportByCode[h] ? airportByCode[h].city : "")}</span>${h === s.hub ? ` <span class="owned-badge">home hub</span>` : ""}</div>
        <div class="muted mini">No flight school yet</div></div>
      <div class="card-actions"><button class="btn btn-gold" onclick="UI.schoolHub='${h}';refreshPanel(true)">Build a flight school →</button></div>
    </div>`).join("");

  let html = intro + poolCard;
  if (ownedCards) html += `<h3 class="cat-head">Your flight schools</h3>${ownedCards}`;
  html += `<h3 class="cat-head">Open a new campus</h3>`;
  html += without.length
    ? buildCards
    : `<div class="muted mini panel-note">Every one of your hubs has a flight school. Open more hubs from the map (click an airport) to build additional campuses.</div>`;
  return html;
}

function uiBuySchoolRoom(hub, size) {
  if (buySchoolRoom(hub, size)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(G.err || "Cannot build that."); }
}

function uiSchoolCell(hub, x, y) {
  const S = schoolAt(hub);
  if (!S) return;
  if (S.items.some(i => i.x === x && i.y === y)) {
    removeSchoolItem(hub, x, y);
    sfx("click");
  } else if (placeSchoolItem(hub, UI.schoolTool || "desk", x, y)) {
    sfx("click");
  } else {
    sfx("deny");
    toast(G.err || "Cannot place that here.");
  }
  refreshPanel(true);
  renderTopbar();
}

function renderCompetitors() {
  const s = G.state;
  const rivals = (s.rivals || []).slice().sort((a, b) => b.rep - a.rep);
  const myRep = Math.round(effReputation());
  const intro = tip(`Rival carriers compete for passengers on overlapping routes — bigger fleets and higher reputation win more of the market. Real airlines only fly routes that touch their home country; the five fictional worldwide carriers show up sparsely elsewhere. You can buy one out to remove it from your routes. Your reputation: <b>${myRep}</b>/100.`);
  if (!rivals.length) return intro + `<div class="empty">No competitors are active in your markets right now.</div>`;
  const cards = rivals.map(r => {
    const st = rivalStats(r);
    const better = r.rep > myRep;
    const cost = rivalAcquireCost(r);
    const afford = s.cash >= cost;
    const hubs = (r.hubs || []).map(h => {
      const ap = airportByCode[h];
      return ap ? `${h} (${ap.city})` : h;
    }).join(", ");
    const fleetRows = st.fleet.map(f => {
      const t = aircraftById[f.typeId];
      return `<div class="ac-row mini"><span>${esc(t.maker)} ${esc(t.name)} <span class="muted">· ${t.cat}</span></span> <b>×${f.count}</b></div>`;
    }).join("") || `<div class="ac-row mini muted">Fleet details unavailable.</div>`;
    const al = r.alliance ? ALLIANCES.find(a => a.id === r.alliance) : null;
    const allyBadge = al
      ? (r.alliance === s.alliance
        ? ` <span class="ok-text mini">🤝 ${esc(al.name)} — your alliance partner</span>`
        : ` <span class="muted mini">🌐 ${esc(al.name)}</span>`)
      : ` <span class="muted mini">Independent</span>`;
    const grounded = isRivalGrounded(r);
    const whereBadge = grounded
      ? ` <span class="bad-text mini">⛔ fleet grounded</span>`
      : r.anywhere
        ? ` <span class="boost-badge">✈ flies worldwide</span>`
        : ` <span class="muted mini">· home: ${esc(r.country || "?")}</span>`;
    return `<div class="card">
      <div class="card-head"><div><b>${esc(r.name)}</b> <span class="muted mini">${st.profile.label}</span>${whereBadge}${allyBadge}</div>
        <div class="muted mini">rep ${Math.round(r.rep)} ${better ? `<span class="bad-text">(beats you)</span>` : `<span class="ok-text">(below you)</span>`}</div></div>
      ${grounded ? `<div class="card-row bad-text mini">World event grounding — not competing on routes until inspections clear.</div>` : ""}
      <div class="bar"><div class="bar-fill bar-ok" style="width:${Math.round(r.rep)}%"></div></div>
      <div class="stat-grid" style="margin-top:8px">
        <div><span class="muted mini">Fleet size</span><b>${st.aircraft} aircraft</b></div>
        <div><span class="muted mini">Total seats</span><b>${fmtNum(st.seats)}</b></div>
        <div><span class="muted mini">Net worth</span><b>${fmtMoney(rivalNetWorth(r))}</b></div>
        <div><span class="muted mini">Takeover price</span><b>${fmtMoney(cost)}</b></div>
      </div>
      <div class="card-row mini" style="margin-top:6px"><span class="muted">Hubs:</span> ${hubs || "—"}</div>
      <div class="card-row muted mini" style="margin-top:6px">Fleet composition</div>
      ${fleetRows}
      <div class="card-actions"><button class="btn ${afford ? "btn-gold" : ""}" onclick="uiAcquireRival('${r.id}')">Acquire — ${fmtMoney(cost)}</button></div>
    </div>`;
  }).join("");
  return intro + cards;
}

function uiAcquireRival(rid) {
  const r = (G.state.rivals || []).find(x => x.id === rid);
  if (!r) { toast("That airline is no longer available."); return; }
  if (!confirm(`Acquire ${r.name} for ${fmtMoney(rivalAcquireCost(r))}? This removes them from the market and folds a few of their aircraft into your fleet.`)) return;
  if (acquireRival(rid)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(G.err || "Cannot acquire that airline."); }
}

function uiDepart(id) {
  const p = G.state.planes.find(x => x.id === id);
  if (p && wouldOverdraftCO2(p)) {
    const need = nextLegCO2(p);
    const have = G.state.co2;
    if (!confirm(`Departing this route may cause a CO₂ overrun.\n\nThis leg needs ${fmtNum(need / 1000)} t · you have ${fmtNum(Math.max(0, have) / 1000)} t.\nEach overdraft flight costs −${CO2_OVERDRAFT_REP} reputation.\n\nDepart anyway?`)) {
      return;
    }
  }
  if (departPlane(id)) {
    // attemptDepart already plays sfx("depart"); skip the generic button click
    _sfxSkipClick = true;
    refreshPanel(true);
    showDepartCard(id);
  } else { sfx("deny"); toast(G.err || "Cannot depart."); }
}

// Projection / ticket-sales panel shown right after a send-off
function showDepartCard(id) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p || p.status !== "fly" || !p.route) return;
  const r = G.state.lastReport;
  // Prefer the queued depart report for this plane so the card stays in sync
  if (r && r.kind === "depart" && r.plane === id) {
    UI._repSeq = r.seq;
    UI._repHoldUntil = performance.now() + 5000;
    paintFlightReport(r);
    return;
  }
  const t = aircraftById[p.typeId];
  const dir = routePath(p);
  const a = airportByCode[dir[p.segIdx]], b = airportByCode[dir[p.segIdx + 1]];
  const boarding = p.boarding;
  const isCargo = boarding ? boarding.isCargo : !!t.tons;
  const carried = boarding ? boarding.carried : 0;
  const cap = boarding ? boarding.cap : (isCargo ? t.tons : (p.cabin ? cabinPax(p.cabin) : t.seats));
  const tickets = boarding ? boarding.revenue : 0;
  const fuel = planeBurn(p) * distKm(a, b);
  const el = $("#report-card");
  if (G.state.lastReport) UI._repSeq = G.state.lastReport.seq;
  UI._repHoldUntil = performance.now() + 5000;
  el.classList.remove("hidden");
  el.innerHTML = `
    <button class="close-x" onclick="dismissFlightReport()" title="Dismiss">×</button>
    <h3>🛫 Departed — ${p.id}</h3>
    <div class="muted mini">${esc(t.name)} · ${a.code} → ${b.code} · lands in ${fmtDur(p.timer)}</div>
    <div class="rep-grid">
      <span>${isCargo ? "Freight aboard" : "Passengers"}</span><b>${fmtNum(carried)}${isCargo ? " t" : ""} / ${fmtNum(cap)}</b>
      <span>${isCargo ? "Freight revenue" : "Ticket sales"}</span><b class="ok-text">${fmtMoney(tickets)}</b>
      <span>Fuel burned</span><b>${(fuel / 1000).toFixed(1)} t</b>
      <span>CO₂</span><b>${(fuel * 3.16 * (t.co2Mult || 1) / 1000).toFixed(1)} t</b>
    </div>
    <div class="ac-row muted mini">Meals, lounges, fees &amp; ops settle on landing.</div>`;
}

function dismissFlightReport() {
  const el = $("#report-card");
  if (el) el.classList.add("hidden");
  // brief pause so the next queued report doesn't instantly pop back up
  UI._repHoldUntil = performance.now() + 600;
}

function paintFlightReport(r) {
  const el = $("#report-card");
  if (!el || !r) return;
  const loadPct = Math.round(r.carried / Math.max(1, r.cap) * 100);
  el.classList.remove("hidden");
  if (r.kind === "depart") {
    el.innerHTML = `
      <button class="close-x" onclick="dismissFlightReport()" title="Dismiss">×</button>
      <h3>🛫 Ticket sales — ${r.plane}</h3>
      <div class="muted mini">${esc(r.type)} · ${r.from} → ${r.to} · fares ${r.fare}%</div>
      <div class="rep-grid">
        <span>${r.cargo ? "Freight" : "Passengers"}</span><b>${r.cargo ? `${fmtNum(r.carried)} t` : fmtNum(r.carried)} / ${fmtNum(r.cap)} (${loadPct}%)</b>
        <span>${r.cargo ? "Freight revenue" : "Ticket sales"}</span><b class="ok-text">${fmtMoney(r.revenue)}</b>
        <span>Fuel used</span><b>${(r.fuelT || 0).toFixed(1)} t</b>
        <span>CO₂ emitted</span><b>${(r.co2T || 0).toFixed(1)} t</b>
      </div>
      <div class="ac-row muted mini">Meals &amp; extras will post on landing.</div>`;
    return;
  }
  const costRows = (r.costLines && r.costLines.length)
    ? r.costLines.map(l => `<span>${esc(l.n)}</span><b>−${fmtMoney(l.a)}</b>`).join("")
    : (r.fees != null || r.ops != null)
      ? `${r.fees ? `<span>Airport fees</span><b>−${fmtMoney(r.fees)}</b>` : ""}${r.ops ? `<span>Cabin &amp; ground ops</span><b>−${fmtMoney(r.ops)}</b>` : ""}`
      : `<span>Fees &amp; ops</span><b>−${fmtMoney(r.costs)}</b>`;
  el.innerHTML = `
    <button class="close-x" onclick="dismissFlightReport()" title="Dismiss">×</button>
    <h3>📋 Arrival — ${r.plane}</h3>
    <div class="muted mini">${esc(r.type)} · ${r.from} → ${r.to}${r.tickets ? ` · tickets already ${fmtMoney(r.tickets)}` : ""}</div>
    <div class="rep-grid">
      <span>${r.cargo ? "Freight" : "Passengers"}</span><b>${r.cargo ? `${fmtNum(r.carried)} t` : fmtNum(r.carried)} / ${fmtNum(r.cap)} (${loadPct}%)</b>
      ${r.meals > 0 ? `<span>Meals sold${r.mealServed ? ` (${fmtNum(r.mealServed)})` : ""}</span><b class="ok-text">${fmtMoney(r.meals)}</b>` : ""}
      ${r.lounge > 0 ? `<span>Lounge income</span><b class="ok-text">${fmtMoney(r.lounge)}</b>` : ""}
      ${costRows}
      <span>Extra on landing</span><b class="${r.net >= 0 ? "ok-text" : "bad-text"}">${fmtMoney(r.net)}</b>
      <span>Fuel used</span><b>${(r.fuelT || 0).toFixed(1)} t</b>
      <span>CO₂ emitted</span><b>${(r.co2T || 0).toFixed(1)} t</b>
    </div>`;
}

function renderReportCard() {
  const s = G.state;
  if (!s) return;
  const now = performance.now();
  // Hold the current card on screen so depart → land (and multi-plane) reports
  // don't flash past before you can read them.
  if (UI._repHoldUntil && now < UI._repHoldUntil) return;

  const q = s.reportQ || [];
  const next = q.find(r => r.seq > (UI._repSeq || 0));
  if (!next) return;

  UI._repSeq = next.seq;
  UI._repHoldUntil = now + 5000;
  paintFlightReport(next);
}

function uiDepartAll() {
  const ready = G.state.planes.filter(p => p.status === "ready");
  let running = G.state.co2;
  let over = 0;
  for (const p of ready) {
    const need = nextLegCO2(p);
    if (running < need) over++;
    running -= need;
  }
  if (over > 0) {
    if (!confirm(`Departing these routes may cause CO₂ overruns.\n\n${over} of ${ready.length} waiting aircraft would push you past your quota (−${CO2_OVERDRAFT_REP} reputation each).\n\nDispatch all anyway?`)) {
      return;
    }
  }
  const n = departAllReady();
  if (n) {
    _sfxSkipClick = true;
    sfx("depart");   // one takeoff cue for the whole wave (per-plane calls are silent)
    refreshPanel(true);
  } else toast("No aircraft waiting for dispatch.");
}

function uiUnlockAutoDepart() {
  if (unlockAutoDepart()) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(G.err || "Cannot buy the dispatch office."); }
}

function uiTrain(k) {
  if (trainUp(k)) { sfx("buy"); refreshPanel(true); renderTopbar(); }
  else { sfx("deny"); toast(G.err || "Cannot train that right now."); }
}

function renderCompanyOverview() {
  const s = G.state;
  ensureBrands();
  const lv = levelInfo();
  const fleetValue = s.planes.reduce((sum, p) =>
    p.leased ? sum : sum + aircraftById[p.typeId].price, 0);
  const profit = s.totRevenue - s.totCost;
  const prog = lv.next ? Math.min(100, (s.pointsEarned - lv.cur.pts) / (lv.next.pts - lv.cur.pts) * 100) : 100;
  const hub = airportByCode[s.hub];
  const focusOpts = Object.entries(BRAND_FOCUS).map(([id, f]) =>
    `<option value="${id}">${f.label}${f.cats ? ` (${f.cats.join(", ")})` : ""}</option>`
  ).join("");
  const canFound = s.brands.filter(b => !b.parent).length < MAX_CHILD_BRANDS;
  const brandsCard = `<div class="card">
    <div class="card-head"><div><b>✈ Subsidiaries</b></div>
      <div class="muted mini">${fmtMoney(BRAND_FOUND_COST)} + ${BRAND_FOUND_PTS} ⭐ to found</div></div>
    <div class="card-row muted mini">Child airlines share your cash, hubs, fuel, and staff. Restrict their fleets by focus.</div>
    ${s.brands.map(b => {
      const focus = b.allowedCats ? b.allowedCats.join(" · ") : "All aircraft";
      return `<div class="card-row brand-row">
        <div>
          <b>${esc(b.name)}</b>${b.parent ? ` <span class="owned-badge">main</span>` : ""}
          <div class="muted mini">${focus} · ${brandFleetCount(b.id)} aircraft</div>
        </div>
        ${b.parent ? "" : `<button class="btn btn-danger mini-btn" onclick="uiDissolveBrand('${b.id}')">Dissolve</button>`}
      </div>`;
    }).join("")}
    ${canFound ? `<div class="route-form" style="margin-top:10px">
      <div class="rf-row">
        <label>Subsidiary name <input id="brand-name" type="text" maxlength="28" placeholder="e.g. Horizon Express"></label>
        <label>Focus <select id="brand-focus">${focusOpts}</select></label>
      </div>
      <button class="btn btn-gold" onclick="uiCreateBrand()">Found subsidiary</button>
    </div>` : `<div class="muted mini">Maximum of ${MAX_CHILD_BRANDS} subsidiaries reached.</div>`}
  </div>`;
  return `
    <div class="company-name-row">
      <input id="airline-name" value="${esc(s.airline)}" maxlength="28">
      <button class="btn" onclick="uiRename()">Rename</button>
      <button class="btn" onclick="toggleUnits()" title="Switch distance/speed units">${unitsPref() === "imperial" ? "kts · mi" : "km · km/h"}</button>
      <button class="btn" onclick="toggleMapStyle()" title="Switch globe appearance">${mapStylePref() === "texture" ? "Texture map" : "Simple map"}</button>
      <button class="btn" onclick="toggleAirportsOnTop()" title="Draw airport dots above or below parked aircraft">${airportsOnTopPref() ? "Airports on top" : "Planes on top"}</button>
    </div>
    <div class="card">
      <div class="card-head"><div><b>Difficulty: ${difficultyOf().label}</b></div>
        <div class="muted mini">${s.difficulty === "realism" ? "4× speed locked · 2× wear" : s.difficulty === "easy" ? "Class-priced aircraft · boosted fares · fewer rivals" : "Standard rules"}</div></div>
      <div class="card-row muted mini">${difficultyOf().blurb}</div>
    </div>
    <div class="card">
      <div class="card-head"><div><b>Level: ${lv.cur.name}</b></div>
        <div class="muted mini">${lv.next ? `${fmtNum(s.pointsEarned)} / ${fmtNum(lv.next.pts)} pts earned to ${lv.next.name}` : "Max level"}</div></div>
      <div class="bar"><div class="bar-fill bar-gold" style="width:${prog}%"></div></div>
    </div>
    <div class="card">
      <div class="card-head"><div><b>Reputation</b></div><div class="muted mini">${Math.round(effReputation())} / 100${repCampaignBoost() ? ` <span class="ok-text">(+${Math.round(repCampaignBoost())})</span>` : ""}</div></div>
      <div class="bar"><div class="bar-fill bar-ok" style="width:${effReputation()}%"></div></div>
    </div>
    ${brandsCard}
    ${staffCard()}
    <div class="stat-grid">
      <div><span class="muted mini">Home hub</span><b>${s.hub} — ${hub.city}</b></div>
      <div><span class="muted mini">Hub network</span><b>${s.hubs.map(h =>
        h === s.hub ? h : `${h}${isDomestic(h) ? "" : `*`}`).join(", ")}</b>${
        s.hubs.some(h => h !== s.hub && !isDomestic(h)) ? `<span class="muted mini">* int'l, ${INTL_HUB_SLOTS} slots</span>` : ""}</div>
      <div><span class="muted mini">Fleet / hangar</span><b>${s.planes.length} / ${s.hangarCap} aircraft</b></div>
      <div><span class="muted mini">Points earned (lifetime)</span><b>${fmtNum(s.pointsEarned)}</b></div>
      <div><span class="muted mini">Alliance</span><b>${s.alliance ? ALLIANCES.find(a => a.id === s.alliance).name : "None"}</b></div>
      <div><span class="muted mini">Fleet value</span><b>${fmtMoney(fleetValue)}</b></div>
      <div><span class="muted mini">Flights departed</span><b>${fmtNum(s.totFlights || 0)}</b></div>
      <div><span class="muted mini">Passengers carried (lifetime)</span><b>${fmtNum(s.totPax || 0)}</b></div>
      <div><span class="muted mini">Cargo carried (lifetime)</span><b>${fmtNum(Math.round(s.totCargo || 0))} t</b></div>
      <div><span class="muted mini">Total revenue</span><b>${fmtMoney(s.totRevenue)}</b></div>
      <div><span class="muted mini">Total costs</span><b>${fmtMoney(s.totCost)}</b></div>
      <div><span class="muted mini">Net result</span><b class="${profit >= 0 ? "ok-text" : "bad-text"}">${fmtMoney(profit)}</b></div>
      <div><span class="muted mini">Company age</span><b>${Math.floor(s.gameMin / 1440)} game days</b></div>
    </div>
    <div class="danger-zone">
      <button class="btn btn-danger" onclick="uiReset()">Reset game</button>
    </div>`;
}

function uiCreateBrand() {
  const name = $("#brand-name")?.value || "";
  const focus = $("#brand-focus")?.value || "express";
  G.err = null;
  const id = createBrand(name, focus);
  if (id) {
    sfx("buy");
    UI.fleetBrand = id;
    refreshPanel(true);
    renderTopbar();
    toast("Subsidiary founded.");
  } else {
    sfx("deny");
    toast(G.err || "Cannot found subsidiary.");
  }
}

function uiDissolveBrand(id) {
  const b = brandById(id);
  if (!b || b.parent) return;
  if (!confirm(`Dissolve ${b.name}? Its aircraft move to your main airline.`)) return;
  G.err = null;
  if (dissolveBrand(id)) {
    if (UI.fleetBrand === id) UI.fleetBrand = "all";
    refreshPanel(true);
    renderTopbar();
    toast("Subsidiary dissolved.");
  } else {
    toast(G.err || "Cannot dissolve.");
  }
}

function uiTogglePause() {
  const paused = togglePause();
  sfx("click");
  renderTopbar();
  toast(paused ? "Paused — planes, departures and the clock are frozen." : "Resumed.");
}

function toggleUnits() {
  try { localStorage.setItem("sky_units", unitsPref() === "imperial" ? "metric" : "imperial"); } catch (_) {}
  toast(unitsPref() === "imperial" ? "Units: knots & miles." : "Units: kilometres.");
  refreshPanel(true);
}

function toggleMapStyle() {
  try { localStorage.setItem("sky_map_style", mapStylePref() === "texture" ? "simple" : "texture"); } catch (_) {}
  toast(mapStylePref() === "texture" ? "Texture globe enabled." : "Simple globe enabled.");
  refreshPanel(true);
}

function toggleAirportsOnTop() {
  const next = !airportsOnTopPref();
  try { localStorage.setItem("sky_airports_on_top", next ? "1" : "0"); } catch (_) {}
  toast(next
    ? "Airport dots draw above parked planes."
    : "Parked planes draw above airports (easier to click).");
  refreshPanel(true);
}

function uiRename() {
  const v = $("#airline-name").value.trim();
  if (v) {
    G.state.airline = v;
    ensureBrands();
    const parent = parentBrand();
    if (parent) parent.name = v;
    save();
    renderTopbar();
    toast("Airline renamed.");
  }
}

function staffCard() {
  const s = G.state, st = s.staff;
  const total = st.pilots + st.crew + (st.mech || 0);
  if (!total) {
    return `<div class="card">
      <div class="card-head"><div><b>👥 Staff</b></div></div>
      <div class="card-row muted mini">No staff yet — flight crews are hired automatically with each aircraft you buy.</div>
    </div>`;
  }
  const moraleCls = st.morale > 65 ? "ok" : st.morale > 35 ? "warn" : "bad";
  const trend = moraleTarget() > st.morale + 2 ? "↗" : moraleTarget() < st.morale - 2 ? "↘" : "→";
  return `<div class="card">
    <div class="card-head"><div><b>👥 Staff — ${fmtNum(total)} employees</b></div>
      <div class="price">${fmtMoney(dailyPayroll())}/day</div></div>
    <div class="card-row">
      <span>👨‍✈️ ${fmtNum(st.pilots)} pilots · ${fmtMoney(PILOT_BASE_PAY * st.payMult)}/day</span>
      <span>🧑‍✈️ ${fmtNum(st.crew)} cabin crew · ${fmtMoney(CREW_BASE_PAY * st.payMult)}/day</span>
      ${st.mech ? `<span>🔧 ${fmtNum(st.mech)} engineers · ${fmtMoney(MECH_BASE_PAY * st.payMult)}/day</span>` : ""}
    </div>
    ${Math.min(st.cadets || 0, st.pilots) ? `<div class="card-row muted mini">🎓 ${fmtNum(Math.min(st.cadets, st.pilots))} of your pilots are flight-school graduates flying at ${Math.round(CADET_PAY_MULT * 100)}% of market pay.</div>` : ""}
    <div class="card-row">
      <span class="muted mini">Morale ${trend}</span>
      <div class="bar"><div class="bar-fill bar-${moraleCls}" style="width:${st.morale}%"></div></div>
      <span class="bar-label">${Math.round(st.morale)}%</span>
    </div>
    <div class="card-row muted mini">Pay is ${Math.round(st.payMult * 100)}% of market rate. Happy staff slowly lift your reputation; unhappy staff drag it down. Freighter crews are pilots only.</div>
    <div class="card-actions">
      <button class="btn" onclick="uiStaffRaise()">Give 5% raise</button>
      <button class="btn btn-danger" onclick="uiStaffCut()">5% pay cut</button>
    </div>
  </div>`;
}

function uiStaffRaise() {
  if (staffRaise()) { refreshPanel(true); renderTopbar(); }
  else toast("Pay is already at the maximum (180% of market rate).");
}

function uiStaffCut() {
  if (staffCut()) refreshPanel(true);
  else toast("Pay is already at the minimum (60% of market rate).");
}

function uiReset() {
  const phrase = "yes, i want to reset";
  const typed = prompt(`This deletes ${G.state.airline} forever — every plane, hub and point.
Type "${phrase}" to confirm:`);
  if (typed === null) return;
  if (typed.trim().toLowerCase() !== phrase) {
    toast("Reset cancelled — phrase didn't match.");
    return;
  }
  resetGame();
}

// ---------------- airport info card (globe click) ----------------

function showAirportCard(ap) {
  const s = G.state;
  $("#plane-card").classList.add("hidden");
  $("#route-card").classList.add("hidden");
  const hub = airportByCode[s.hub];
  const isPrimary = ap.code === s.hub;
  const owned = s.hubs.includes(ap.code);
  const domestic = isDomestic(ap.code);
  const d = isPrimary ? 0 : Math.round(distKm(hub, ap));
  const dem = isPrimary ? 0 : Math.round(paxDemandTotal(hub, ap) * demandMultiplier({ touchesHub: true, from: hub.code, to: ap.code }));
  const cdem = isPrimary ? 0 : Math.round(cargoDemand(hub, ap) * demandMultiplier({ cargo: true, touchesHub: true, from: hub.code, to: ap.code }));

  let hubRow;
  if (isPrimary) {
    hubRow = `<div class="ac-row ok-text">⭐ This is your home hub.</div>`;
  } else if (owned) {
    hubRow = `<div class="ac-row ok-text">⭐ Your ${domestic ? "domestic" : "international"} hub${
      domestic ? "" : ` — ${hubSlotsUsed(ap.code)}/${INTL_HUB_SLOTS} departure slots used`}.</div>`;
  } else {
    const cost = hubCost(ap.code);
    hubRow = `<div class="ac-row">
      <button class="btn ${s.cash >= cost ? "btn-gold" : ""}"
        onclick="uiBuyHub('${ap.code}')">Open ${domestic ? "domestic" : "int'l"} hub — ${fmtMoney(cost)}</button></div>
      <div class="ac-row muted mini">${domestic
        ? "Domestic hubs have unlimited departures."
        : `International hubs support ${INTL_HUB_SLOTS} based aircraft.`}
        Hub prices follow the market — a new quote every 12h, so check back if it's steep.</div>`;
  }

  const el = $("#airport-card");
  el.classList.remove("hidden");
  el.innerHTML = `
    <button class="close-x" onclick="this.parentElement.classList.add('hidden')">×</button>
    <h3>${ap.code} ${owned ? "⭐" : ""}</h3>
    <div class="muted">${ap.city}, ${ap.country}</div>
    <div class="ap-photo"><img src="airportpictures/${ap.code}.jpg" alt=""
      onerror="if(!this.dataset.p){this.dataset.p=1;this.src='airportpictures/${ap.code}.png';}else{this.parentElement.remove();}"></div>
    <div class="ac-row">Market size <b>${"●".repeat(Math.round(ap.size / 2))}${"○".repeat(5 - Math.round(ap.size / 2))}</b></div>
    ${isPrimary ? "" :
      `<div class="ac-row">From ${s.hub}: <b>${fmtDist(d)}</b></div>
       <div class="ac-row">Demand: <b>≈ ${fmtNum(dem)} pax/day</b> each way</div>
       <div class="ac-row">Freight: <b>≈ ${fmtNum(cdem)} t/day</b> each way</div>`}
    ${hubRow}
  `;
}

function uiBuyHub(code) {
  if (buyHub(code)) {
    sfx("buy");
    showAirportCard(airportByCode[code]);
    renderTopbar();
  } else {
    sfx("deny");
    toast(G.err || "Not enough cash to open that hub.");
  }
}

// ---------------- developer tools ----------------

const DEV_PASSCODE = "mainhippo13";

function toggleDev() {
  if (!UI.devAuthed) {
    const code = prompt("Developer access — enter passcode:");
    if (code === null) return;                 // cancelled
    if (code !== DEV_PASSCODE) {
      sfx("deny");
      toast("Wrong passcode.");
      return;
    }
    UI.devAuthed = true;                       // this session only
    toast("Developer tools unlocked.");
  }
  $("#devpanel").classList.toggle("hidden");
  renderDevPanel();
}

function renderDevPanel() {
  const s = G.state;
  if (!s || $("#devpanel").classList.contains("hidden")) return;
  const tod = s.gameMin % 1440;
  const hh = String(Math.floor(tod / 60)).padStart(2, "0");
  const mm = String(tod % 60).padStart(2, "0");
  const chromeOff = !!UI.chromeHidden;
  $("#devpanel").innerHTML = `
    <div class="dev-title">🛠 Developer tools</div>
    <button class="btn ${chromeOff ? "btn-gold" : ""}" onclick="devToggleChrome()">${chromeOff ? "Show UI chrome" : "Hide UI chrome"}</button>
    <button class="btn" onclick="devGive(100e6)">+ $100M</button>
    <button class="btn" onclick="devGive(1e9)">+ $1B</button>
    <button class="btn ${s.devInfinite ? "btn-gold" : ""}" onclick="devInfinite()">∞ money: ${s.devInfinite ? "ON" : "off"}</button>
    <button class="btn" onclick="devPoints()">+ 1,000 pts</button>
    <button class="btn" onclick="devFill()">Fill fuel & CO₂</button>
    <button class="btn" onclick="devRepair()">Repair fleet</button>
    <button class="btn" onclick="devCharter()">Spawn charter offer</button>
    <button class="btn" onclick="devEvent()">Spawn world event</button>
    <button class="btn" onclick="devUsedMarket()">Refresh used market</button>
    <button class="btn" onclick="devPaper()">Print weekly gazette</button>
    <button class="btn" onclick="devTP()">+10 training pts</button>
    <button class="btn" onclick="devGraduate()">Graduate school classes</button>
    <div class="dev-time">
      <div class="dev-time-label">Time of day · Day ${Math.floor(s.gameMin / 1440) + 1} · <b id="dev-tod-label">${hh}:${mm}</b></div>
      <input id="dev-tod" type="range" min="0" max="1439" step="5" value="${tod}"
        oninput="devSetTimeOfDay(+this.value, false)" onchange="devSetTimeOfDay(+this.value, true)">
      <div class="dev-time-marks"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      <div class="dev-time-btns">
        <button class="btn mini-btn" onclick="devSkipHours(-6)">−6h</button>
        <button class="btn mini-btn" onclick="devSkipHours(-1)">−1h</button>
        <button class="btn mini-btn" onclick="devSkipHours(1)">+1h</button>
        <button class="btn mini-btn" onclick="devSkipHours(6)">+6h</button>
        <button class="btn mini-btn" onclick="devSkipHours(24)">+1 day</button>
      </div>
    </div>`;
}

function devSetTimeOfDay(minOfDay, saveNow) {
  const s = G.state;
  if (!s) return;
  minOfDay = Math.max(0, Math.min(1439, Math.round(minOfDay)));
  const day = Math.floor(s.gameMin / 1440);
  s.gameMin = day * 1440 + minOfDay;
  const hh = String(Math.floor(minOfDay / 60)).padStart(2, "0");
  const mm = String(minOfDay % 60).padStart(2, "0");
  const lab = document.getElementById("dev-tod-label");
  if (lab) lab.textContent = `${hh}:${mm}`;
  renderTopbar();
  if (typeof renderPaxView === "function") renderPaxView(true);
  if (saveNow) save();
}

function devSkipHours(h) {
  const s = G.state;
  if (!s) return;
  s.gameMin = Math.max(0, s.gameMin + Math.round(h * 60));
  renderTopbar();
  renderDevPanel();
  if (typeof renderPaxView === "function") renderPaxView(true);
  save();
}

function devToggleChrome() {
  UI.chromeHidden = !UI.chromeHidden;
  document.body.classList.toggle("ui-chrome-off", !!UI.chromeHidden);
  renderDevPanel();
  toast(UI.chromeHidden
    ? "UI chrome hidden — use 🛠 to show it again."
    : "UI chrome restored.");
}

function devGive(v) { G.state.cash += v; renderTopbar(); save(); }

function devInfinite() {
  G.state.devInfinite = !G.state.devInfinite;
  if (G.state.devInfinite) G.state.cash = 999e9;
  renderTopbar(); renderDevPanel(); save();
}

function devPoints() { earnPoints(1000); renderTopbar(); save(); }

function devFill() {
  G.state.fuel += 10e6; G.state.co2 += 30e6;   // +10,000 t fuel, +30,000 t quota
  renderTopbar(); refreshPanel(true); save();
}

function devRepair() {
  for (const p of G.state.planes) p.wear = 0;
  refreshPanel(true); save();
}

function devCharter() {
  G.state.charterUnlocked = true;
  genCharterOffer(false);
  refreshPanel(true); save();
}

function devEvent() { genWorldEvent(false); refreshPanel(true); save(); }

function devUsedMarket() {
  refreshUsedMarket(false);
  if (UI.panel === "buy" && UI.shopTab === "used") refreshPanel(true);
  save();
  toast("Used market refreshed.");
}

function devPaper() {
  publishWeeklyPaper(false);
  UI.paperIdx = 0;
  if (UI.panel === "events") refreshPanel(true);
  save();
  toast("Weekly Gazette printed.");
}

function devTP() { G.state.trainPts += 10; refreshPanel(true); save(); }

function devGraduate() {
  let n = 0;
  for (const hub in (G.state.schools || {})) {
    for (const c of (G.state.schools[hub].classes || [])) { c.end = G.state.gameMin; n++; }
  }
  if (!n) { toast("No cadet classes are running."); return; }
  tickSchools(false);
  refreshPanel(true); renderTopbar(); save();
  toast(`${n} class${n === 1 ? "" : "es"} graduated.`);
}

// ---------------- route researcher (click two airports in a row) ----------------

function uiAirportClick(ap) {
  if (UI.lastAirport && UI.lastAirport !== ap.code) {
    showRouteCard(UI.lastAirport, ap.code);
  } else {
    showAirportCard(ap);
  }
  UI.lastAirport = ap.code;
}

function showRouteCard(codeA, codeB) {
  const a = airportByCode[codeA], b = airportByCode[codeB];
  if (!a || !b) return;
  $("#airport-card").classList.add("hidden");
  $("#plane-card").classList.add("hidden");
  const el = $("#route-card");
  const d = Math.round(distKm(a, b));
  const touchesHub = codeA === G.state.hub || codeB === G.state.hub;
  const paxMult = demandMultiplier({ touchesHub, from: codeA, to: codeB }) * crewDemandMult() * eventDemandMult(a, b, false);
  const cargoMult = demandMultiplier({ cargo: true, touchesHub, from: codeA, to: codeB }) * eventDemandMult(a, b, true);
  const clsDem = routeClassDemand(a, b);
  const paxDay = Math.round(paxDemandTotal(a, b) * paxMult);
  const cargoDay = Math.round(cargoDemand(a, b) * cargoMult);
  const mix = routeClassMix(a, b);
  const paxCap = Math.round(routeDailyCapacity(codeA, codeB, false));
  const cargoCap = Math.round(routeDailyCapacity(codeA, codeB, true));
  const sugg = Math.round(suggestedFare(codeA, codeB, [], false) * 100);
  const inRange = G.state.planes.filter(p => aircraftById[p.typeId].range >= d).length;
  const evs = (G.state.events || []).filter(ev =>
    ev.airport ? (ev.airport === codeA || ev.airport === codeB)
      : ev.country ? (ev.country === a.country || ev.country === b.country)
      : ev.global);
  el.classList.remove("hidden");
  el.innerHTML = `
    <button class="close-x" onclick="closeRouteCard()">×</button>
    <h3>🔍 ${codeA} ⇄ ${codeB}</h3>
    <div class="muted">${esc(a.city)} — ${esc(b.city)}</div>
    <div class="ac-row">Distance: <b>${fmtDist(d)}</b></div>
    <div class="ac-row">Pax demand: <b>≈ ${fmtNum(paxDay)}/day</b> each way
      ${paxCap ? `<span class="muted mini">(you offer ${fmtNum(paxCap)} seats/day)</span>` : ""}</div>
    <div class="ac-row mini">By cabin: <b>${fmtNum(clsDem.Y * paxMult)} Economy</b> · <b>${fmtNum(clsDem.J * paxMult)} Business</b> · <b>${fmtNum(clsDem.F * paxMult)} First</b>
      <span class="muted">(${routeMixLabel(mix, a, b)})</span></div>
    <div class="ac-row">Freight: <b>≈ ${fmtNum(cargoDay)} t/day</b>
      ${cargoCap ? `<span class="muted mini">(you offer ${fmtNum(cargoCap)} t/day)</span>` : ""}</div>
    <div class="ac-row">Suggested fare: <b>${sugg}%</b> of standard</div>
    ${(function(){
      const rv = rivalsOnRoute(codeA, codeB, false);
      if (!rv.length) return `<div class="ac-row ok-text mini">No competitors fly this route — it's all yours.</div>`;
      const al = G.state.alliance ? ALLIANCES.find(a => a.id === G.state.alliance) : null;
      const partners = al ? rv.filter(r => r.alliance === al.id).length : 0;
      return `<div class="ac-row mini"><b>Competition:</b></div>` + rv.map(r => {
        const partner = al && r.alliance === al.id;
        return `<div class="ac-row mini muted">· ${esc(r.name)} — ~${fmtNum(r.cap)} seats/day, rep ${Math.round(r.rep)}${partner ? ` <span class="ok-text">🤝 codeshare partner</span>` : r.rep > effReputation() ? ` <span class="bad-text">(beats yours)</span>` : ` <span class="ok-text">(yours is higher)</span>`}</div>`;
      }).join("") +
        (partners ? `<div class="ac-row mini ok-text">🤝 ${al.name} codeshare: +${Math.round(al.csBoost * Math.min(partners, CODESHARE_PARTNER_CAP) * 100)}% demand on this route</div>` : "") +
        `<div class="ac-row mini">Your projected share: <b>${Math.round(competitionShare(codeA, codeB, false, Math.max(300, routeDailyCapacity(codeA, codeB, false))) * 100)}%</b></div>`;
    })()}
    <div class="ac-row muted mini">${inRange} of your ${G.state.planes.length} aircraft have the range${
      G.state.hubs.includes(codeA) || G.state.hubs.includes(codeB) ? "" : " · neither end is your hub"}</div>
    ${evs.length ? `<div class="ac-row mini">${evs.map(ev => `<span class="${ev.mult >= 1 ? "ok-text" : "bad-text"}">📰 ${esc(ev.name)} ×${ev.mult}</span>`).join(" ")}</div>` : ""}
    <div class="ac-row muted mini">Click another airport to research the next leg.</div>`;
}

function closeRouteCard() {
  UI.lastAirport = null;
  $("#route-card").classList.add("hidden");
}

// ---------------- flight info card (click a plane on the globe) ----------------

function showPlaneCard(id) {
  UI.planeCardId = id;
  // switching aircraft closes an open passenger view / route editor for another plane
  if (UI.paxViewId && UI.paxViewId !== id) UI.paxViewId = null;
  if (UI.routeFormPlane && UI.routeFormPlane !== id) {
    UI.routeFormPlane = null;
    UI.rfStopPicker = null;
  }
  $("#airport-card").classList.add("hidden");
  $("#route-card").classList.add("hidden");
  // hide the old standalone pax overlay if it was somehow left open
  const standalone = $("#pax-view");
  if (standalone) {
    standalone.classList.add("hidden");
    standalone.setAttribute("aria-hidden", "true");
    standalone.innerHTML = "";
  }
  renderPlaneCard();
  tutNotify("planeCard");
}

function closePlaneCard() {
  if (UI.routeFormPlane && UI.routeFormPlane === UI.planeCardId) {
    UI.routeFormPlane = null;
    UI.rfStopPicker = null;
  }
  UI.planeCardId = null;
  UI.paxViewId = null;
  UI.planeCardHist = false;
  resetPaxViewState();
  const el = $("#plane-card");
  if (el) {
    el.classList.add("hidden");
    el.classList.remove("has-pax", "has-route");
  }
}

function ensurePlaneCardShell(el) {
  // Stable shell: flight stats rebuild every tick, but the passenger window,
  // route form, and thoughts list must stay put — rewriting them resets focus.
  if (el.querySelector("#plane-card-body") && el.querySelector("#plane-card-route")
      && el.querySelector("#plane-card-thoughts")
      && el.querySelector("#plane-card-pax")) return;
  el.innerHTML = `
    <button class="close-x" onclick="closePlaneCard()">×</button>
    <div id="plane-card-body"></div>
    <div id="plane-card-route"></div>
    <div id="plane-card-thoughts"></div>
    <div id="plane-card-pax" class="plane-card-pax" hidden></div>`;
}

/* ---------- passenger thoughts (click a plane) ---------- */
const PAX_NAME_VER = 2; // bump to reshuffle cached cabins after pool changes
const PAX_NAME_POOLS = {
  europe: {
    m: ["Lucas", "Mateo", "Oliver", "Hugo", "Jonas", "Leo", "Felix", "Nikos", "Erik", "Pierre",
      "Theo", "Marco", "Andreas", "Lukas", "Nils", "Oskar", "Tomas", "Ivan", "Diego", "Alessandro",
      "Jan", "Pavel", "Soren", "Emile", "Rafael", "Viktor", "Anton", "Gabriel", "Henrik", "Adrian"],
    f: ["Sofia", "Emma", "Clara", "Amelie", "Ines", "Maja", "Giulia", "Nora", "Elena", "Freya",
      "Laura", "Anna", "Marie", "Julia", "Paula", "Iris", "Lea", "Nina", "Sara", "Helena",
      "Katja", "Eva", "Camille", "Lucia", "Marta", "Agnes", "Ida", "Vera", "Rosa", "Elise"],
  },
  usa: {
    m: ["James", "Liam", "Noah", "Ethan", "Mason", "Aiden", "Carter", "Logan", "Jack", "Owen",
      "Henry", "Wyatt", "Grayson", "Leo", "Jackson", "Sebastian", "Julian", "Levi", "Ezra", "Luke",
      "Benjamin", "Samuel", "Caleb", "Nathan", "Isaac", "Dylan", "Miles", "Asher", "Xavier", "Eli"],
    f: ["Olivia", "Emma", "Ava", "Mia", "Harper", "Sophia", "Chloe", "Zoe", "Lily", "Grace",
      "Ella", "Scarlett", "Aria", "Penelope", "Layla", "Riley", "Nora", "Hazel", "Aurora", "Violet",
      "Stella", "Maya", "Naomi", "Ellie", "Paisley", "Addison", "Lucy", "Claire", "Ivy", "Willow"],
  },
  latam: {
    m: ["Santiago", "Mateo", "Diego", "Gabriel", "João", "Carlos", "Miguel", "Pedro", "Rafael", "Luis",
      "Sebastián", "Nicolás", "Andrés", "Felipe", "Bruno", "Thiago", "Emiliano", "Tomás", "Javier", "Ricardo",
      "Manuel", "Fernando", "Alejandro", "Daniel", "Pablo", "Eduardo", "Hector", "Marco", "Ivan", "Oscar"],
    f: ["Valentina", "Camila", "Isabella", "Lucia", "Mariana", "Sofía", "Ana", "Julieta", "Fernanda", "Elena",
      "Martina", "Catalina", "Daniela", "Gabriela", "Paula", "Renata", "Victoria", "Carolina", "Jimena", "Antonella",
      "Beatriz", "Laura", "Clara", "Micaela", "Florencia", "Adriana", "Rosa", "Natalia", "Pilar", "Isabel"],
  },
  eastasia: {
    m: ["Wei", "Hiro", "Minjun", "Kenji", "Hao", "Yuki", "Jun", "Tao", "Sora", "Chen",
      "Haruto", "Riku", "Daiki", "Kaito", "Ren", "Jae", "Minho", "Satoshi", "Liang", "Bo",
      "Zhen", "Yuto", "Takumi", "Sho", "Daisuke", "Hyun", "Joon", "Feng", "Ming", "Kai"],
    f: ["Yui", "Mei", "Hana", "Sakura", "Jiwoo", "Lin", "Aya", "Xia", "Nari", "Keiko",
      "Yuna", "Mio", "Rina", "Eunji", "Soo", "Hina", "Akari", "Yuna", "Qi", "Lan",
      "Naoko", "Asuka", "Misaki", "Sora", "Jia", "Yue", "Haruka", "Minji", "Ae", "Chiyo"],
  },
  southasia: {
    m: ["Arjun", "Rohan", "Vikram", "Ayaan", "Kabir", "Dev", "Rahul", "Omar", "Samir", "Anil",
      "Aarav", "Vihaan", "Ishaan", "Aditya", "Karan", "Nikhil", "Ravi", "Sanjay", "Imran", "Farhan",
      "Reyansh", "Krish", "Aniket", "Harsh", "Yash", "Siddharth", "Aman", "Zain", "Bilal", "Naveen"],
    f: ["Aisha", "Priya", "Ananya", "Zara", "Isha", "Fatima", "Meera", "Sana", "Neha", "Riya",
      "Anika", "Diya", "Myra", "Kiara", "Aarohi", "Saanvi", "Pooja", "Nisha", "Amira", "Hira",
      "Aditi", "Kavya", "Shruti", "Tara", "Laila", "Noor", "Sneha", "Rani", "Alisha", "Ivana"],
  },
  mideast: {
    m: ["Omar", "Yusuf", "Hassan", "Karim", "Adam", "Tariq", "Samir", "Nabil", "Rami", "Faisal",
      "Ahmed", "Ali", "Khalid", "Zaid", "Bilal", "Hamza", "Ibrahim", "Malik", "Sami", "Walid",
      "Yasin", "Rayan", "Zayn", "Nasser", "Farid", "Jamal", "Tamer", "Hadi", "Idris", "Salim"],
    f: ["Layla", "Noor", "Sara", "Amira", "Hana", "Yasmin", "Leila", "Mariam", "Rania", "Dina",
      "Ayla", "Salma", "Nour", "Lina", "Farah", "Maya", "Jude", "Rana", "Amina", "Zainab",
      "Huda", "Reem", "Nada", "Sama", "Dana", "Layan", "Yara", "Mona", "Iman", "Shireen"],
  },
  africa: {
    m: ["Kwame", "Tendai", "Amadou", "Chidi", "Jabari", "Samir", "Kofi", "Idris", "Thabo", "Moussa",
      "Abebe", "Kelechi", "Tunde", "Sipho", "Jomo", "Sekou", "Bayo", "Emeka", "Farai", "Lemar",
      "Nabil", "Omar", "Tariq", "Yusuf", "Diallo", "Kojo", "Ayo", "Mandla", "Sibusiso", "Ibrahim"],
    f: ["Amina", "Zuri", "Nia", "Fatou", "Asha", "Imani", "Sanaa", "Adanna", "Lindiwe", "Aya",
      "Naledi", "Thandi", "Amara", "Chioma", "Folake", "Zahra", "Makena", "Abena", "Sade", "Nneka",
      "Ayana", "Hasina", "Khadija", "Mariam", "Zola", "Tema", "Binta", "Eshe", "Lila", "Safiya"],
  },
  oceania: {
    m: ["Jack", "Lachlan", "Mateo", "Noah", "Harry", "Cooper", "Liam", "Ari", "Tane", "Oliver",
      "Hunter", "Mason", "Xavier", "Finn", "Archer", "Leo", "Charlie", "George", "William", "Thomas",
      "Niko", "Manu", "Rawiri", "Blake", "Harvey", "Hudson", "Jasper", "Toby", "Beau", "Riley"],
    f: ["Charlotte", "Isla", "Mia", "Olivia", "Amelia", "Ruby", "Aria", "Maia", "Sophie", "Grace",
      "Chloe", "Emily", "Zoe", "Lucy", "Eva", "Matilda", "Harper", "Willow", "Sienna", "Ivy",
      "Aroha", "Moana", "Freya", "Poppy", "Ellie", "Hannah", "Paige", "Stella", "Aaliyah", "Piper"],
  },
};

function paxCountryRegion(country) {
  const c = String(country || "");
  if (/United States|USA|Canada/.test(c)) return "usa";
  if (/Mexico|Brazil|Argentina|Chile|Colombia|Peru|Uruguay|Paraguay|Bolivia|Ecuador|Venezuela|Costa Rica|Panama|Guatemala|Cuba|Dominican|Puerto Rico|Jamaica|Belize|Honduras|Nicaragua|El Salvador/.test(c)) return "latam";
  if (/China|Japan|Korea|Taiwan|Hong Kong|Mongolia|Vietnam|Thailand|Singapore|Malaysia|Indonesia|Philippines|Cambodia|Laos|Myanmar|Brunei/.test(c)) return "eastasia";
  if (/India|Pakistan|Bangladesh|Sri Lanka|Nepal|Maldives|Bhutan|Afghanistan/.test(c)) return "southasia";
  if (/Saudi|Qatar|UAE|United Arab|Kuwait|Bahrain|Oman|Jordan|Lebanon|Iraq|Iran|Israel|Turkey|Egypt|Morocco|Tunisia|Algeria/.test(c)) return "mideast";
  if (/Australia|New Zealand|Fiji|Papua|Samoa|Tonga/.test(c)) return "oceania";
  if (/Nigeria|Kenya|South Africa|Ghana|Ethiopia|Tanzania|Uganda|Senegal|Ivory|Côte|Cameroon|Rwanda|Zimbabwe|Botswana|Namibia|Mozambique|Angola|DR Congo|Congo|Sudan|Libya/.test(c)) return "africa";
  if (/UK|United Kingdom|France|Germany|Spain|Italy|Portugal|Netherlands|Belgium|Switzerland|Austria|Sweden|Norway|Denmark|Finland|Ireland|Poland|Czech|Slovakia|Hungary|Romania|Bulgaria|Greece|Croatia|Serbia|Ukraine|Russia|Iceland|Luxembourg|Malta|Cyprus|Slovenia|Estonia|Latvia|Lithuania|Bosnia|Albania|North Macedonia|Montenegro|Moldova|Belarus|Georgia/.test(c)) return "europe";
  return "usa";
}

function _paxRand(seed) {
  let x = (seed >>> 0) || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 4294967296;
  };
}

function _paxHash(str) {
  let h = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function paxThoughtsHtml(p) {
  const t = aircraftById[p.typeId];
  if (!t || t.tons) return "";

  const grounded = p.status !== "fly";
  const prog = p.prog || 0;
  const climbing = !grounded && prog < 0.14;
  const descending = !grounded && prog > 0.86;
  const cruise = !grounded && !climbing && !descending;
  const phase = grounded ? "gnd" : descending ? "des" : climbing ? "clb" : "cru";
  // Same passengers when reopening; refresh lines only if flight phase bucket changes
  // (or a fresh kind-crew shout-out arrived after landing).
  if (p._paxThoughts && p._paxThoughtPhase === phase && !p._crewKind
      && p._paxPeople && p._paxPeople.length === 20 && p._paxNameVer === PAX_NAME_VER) {
    return p._paxThoughts;
  }

  const { fromC, toC } = planeCardLeg(p);
  const a = airportByCode[fromC], b = airportByCode[toC];
  const regs = [];
  if (a) regs.push(paxCountryRegion(a.country));
  if (b && (!a || b.country !== a.country)) regs.push(paxCountryRegion(b.country));
  if (!regs.length) regs.push("usa");

  if (p._paxThoughtSeed == null) {
    p._paxThoughtSeed = _paxHash(`${p.id}|${fromC}|${toC}|${p.boarding ? p.boarding.carried : 0}|${(p.hist && p.hist[0] && p.hist[0].t) || G.state.gameMin}`);
  }

  if (!p._paxPeople || p._paxPeople.length !== 20 || p._paxNameVer !== PAX_NAME_VER) {
    const rndP = _paxRand(p._paxThoughtSeed);
    const used = new Set();
    const pickUnique = (gender, reg) => {
      const tryRegs = [reg, ...regs.filter(r => r !== reg), "usa", "europe"];
      for (const r of tryRegs) {
        const pool = (PAX_NAME_POOLS[r] || PAX_NAME_POOLS.usa)[gender] || [];
        const free = pool.filter(n => !used.has(n));
        if (free.length) {
          const name = free[Math.floor(rndP() * free.length) % free.length];
          used.add(name);
          return name;
        }
      }
      // Last resort: gendered fallback with a digit (should be rare)
      const fallback = `${gender === "f" ? "Alex" : "Sam"}${used.size + 1}`;
      used.add(fallback);
      return fallback;
    };
    p._paxPeople = [];
    p._paxNameVer = PAX_NAME_VER;
    for (let i = 0; i < 20; i++) {
      const gender = rndP() < 0.48 ? "f" : "m";
      const isKid = rndP() < 0.18;
      const age = isKid ? 5 + Math.floor(rndP() * 12) : 18 + Math.floor(rndP() * 55);
      const reg = regs[Math.floor(rndP() * regs.length)];
      p._paxPeople.push({
        name: pickUnique(gender, reg),
        age,
        gLabel: gender === "f" ? "F" : "M",
        isKid,
      });
    }
  }

  const rnd = _paxRand(_paxHash(String(p._paxThoughtSeed) + "|" + phase));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const airline = G.state.airline || "this airline";
  const cat = cateringActive();
  const meal = cat ? mealOf(cat.tier) : null;
  const sv = G.state.service || {};
  const amen = planeAmen(p) || {};
  const pilotLvl = trainLevel("pilot");
  const myRep = effReputation();
  const rivals = (fromC && toC && fromC !== toC) ? rivalsOnRoute(fromC, toC, false) : [];
  const topRival = rivals.length ? rivals.slice().sort((x, y) => y.rep - x.rep)[0] : null;

  const destLabel = (b && (b.city || toC)) || toC || "our destination";
  const destCode = toC || "";
  const pool = [];
  const push = (w, fn) => { for (let i = 0; i < w; i++) pool.push(fn); };

  if (meal && meal.id !== "none" && meal.boost > 0) {
    push(3, () => pick(grounded ? [
      `That ${meal.name.toLowerCase()} was actually nice.`,
      "I'm still thinking about the meal — solid catering.",
      "Glad they fed us on that flight.",
      "Catering surprised me in a good way.",
      "Still full from whatever they served up there.",
      "Meal was better than airport food, honestly.",
    ] : [
      `Wow, this ${meal.name.toLowerCase()} is actually nice.`,
      "The food is better than I expected.",
      "I'm glad they fed us on this flight.",
      meal.sell ? "Worth paying for the meal — delicious." : "Solid catering today.",
      "Hot meal tastes like a real win at altitude.",
      "Not bad for airplane food — I'll take it.",
    ]));
  } else {
    push(3, () => pick(grounded ? [
      "I was hungry the whole flight… still am.",
      "No meal? My stomach is filing a complaint.",
      "They could have at least offered a snack.",
      "I should've grabbed something before boarding.",
      "Next time I'm packing my own snacks.",
      "Landed starving. Not my favorite vibe.",
    ] : [
      "I'm hungry… I wish there was food.",
      "No meal? My stomach is not impressed.",
      "They could at least offer a snack.",
      "Starving over here. Feed your passengers!",
      "Is the cart ever coming?",
      "I'd kill for pretzels right now.",
    ]));
  }

  // Model planes are uncommon IRL — keep rare even when the perk is on.
  if (sv.models) {
    push(1, () => pick([
      "I like this little model plane!",
      "Cute die-cast jet — going on the shelf.",
      "The free model is a nice touch.",
    ]));
  } else if (rnd() < 0.22) {
    push(1, () => pick(grounded ? [
      "They should sell little model planes at the gate.",
      "Wish the gift shop had tiny jets.",
    ] : [
      "I wish they sold little model planes onboard.",
      "A tiny model jet would make this flight.",
    ]));
  }

  const wifiLvl = amen.wifi || 0;
  if (wifiLvl >= 2) {
    push(2, () => pick([
      "Wi-Fi is actually fast — catching up on emails.",
      "Streaming without buffering. Nice.",
      "Online at 35,000 feet — still weird.",
      "Texts are going through. Love that.",
      "Got a bunch of work done thanks to the Wi-Fi.",
      "Satellite Wi-Fi held up surprisingly well.",
    ]));
  } else if (wifiLvl === 1) {
    push(3, () => pick([
      "The Wi-Fi is okay, but I wish it was faster.",
      "I'm online… barely. Pages load like it's 2009.",
      "Wi-Fi works if you only need email.",
      "Connected, but don't try to stream anything.",
      "Internet's crawling — better than nothing though.",
      "Wish they'd upgrade this air-to-ground Wi-Fi.",
      grounded
        ? "Wi-Fi got me through emails, but it was slow."
        : "Laggy Wi-Fi. Fine for messages, not much else.",
    ]));
  } else {
    push(2, () => pick([
      "No Wi-Fi… guess I'll read a book.",
      "I miss having internet on this flight.",
      "Offline mode activated whether I like it or not.",
      "Can't check anything. Living dangerously.",
      grounded
        ? "No Wi-Fi on that flight. Rough."
        : "Airplane mode the whole way — forced detox.",
    ]));
  }

  if ((amen.ife || 0) >= 2) {
    push(2, () => pick(grounded ? [
      "The seatback screens made the trip go faster.",
      "Watched half a movie before we landed.",
      "In-flight movies saved me from boredom.",
    ] : [
      "The seatback screen is keeping me entertained.",
      "Finally something good on the IFE.",
      "Headphones in — don't bother me.",
    ]));
  } else if ((amen.ife || 0) === 0) {
    push(2, () => pick(grounded ? [
      "No entertainment on that flight. Long haul energy.",
      "Stared at the seatback the whole way.",
      "Should've downloaded something before boarding.",
    ] : [
      "No entertainment? Long flight energy.",
      "Just me and the safety card, I guess.",
      "Wish there was a movie to kill time.",
    ]));
  }

  const seatLvl = amen.seats || 0;
  if (seatLvl >= 2) {
    push(2, () => pick([
      "These seats are comfy enough.",
      "Legroom is better than I feared.",
      "I could almost nap in this seat.",
      "Seat's holding up — no complaints.",
      "Interior feels refreshed. Nice touch.",
    ]));
  } else if (seatLvl === 1) {
    push(2, () => pick([
      "These seats are a little bit dated.",
      "Cabin's fine — nothing fancy, nothing tragic.",
      "Standard seats. I've sat in worse.",
      "Could use a refresh, but I'll survive.",
      "Seat fabric has that mid-life airline look.",
    ]));
  } else {
    push(3, () => pick([
      "These seats are a little bit dated.",
      "These seats feel… vintage. And not in a good way.",
      "My knees are filing a formal protest.",
      "This seat pitch is aggressive.",
      "Cabin looks overdue for a refresh.",
      "I feel every inch of this worn cabin.",
    ]));
  }

  // Cabin age / wear — mid wear = dated vibes; high wear = rattles & tired look.
  if (p.wear > 80) {
    push(3, () => pick([
      "This cabin looks tired.",
      "Is that panel supposed to rattle?",
      "Someone should refresh this interior.",
      "The carpets have seen some things.",
      "Everything creaks — this airframe has miles on it.",
      "Feels like flying in a plane from another decade.",
    ]));
  } else if (p.wear > 45) {
    push(2, () => pick([
      "These seats are a little bit dated.",
      "Cabin shows its age a bit.",
      "Not brand-new in here, but it's clean enough.",
      "A refresh wouldn't hurt this interior.",
      "Tray table has a few battle scars.",
    ]));
  }

  if (p.divertWx) {
    push(5, () => pick([
      `Ugh — diverting around ${p.divertWx}. So annoying.`,
      `This storm diversion is wrecking my schedule.`,
      `Not thrilled about the ${p.divertWx} detour.`,
      `We're going around ${p.divertWx}? Of course we are.`,
      `Late because of weather. Classic.`,
      `I hate storm diversions — just get me there.`,
      `Hoping this ${p.divertWx} mess doesn't make me miss my connection.`,
      grounded
        ? `Still salty about that ${p.divertWx} diversion.`
        : `Bumpy ride diverting around ${p.divertWx}.`,
    ].filter(Boolean)));
  }

  // Destination buzz — keep light so it doesn't dominate the feed.
  if (destCode || destLabel) {
    push(1, () => pick([
      `I'm so excited for ${destLabel}!`,
      `Can't wait to get to ${destLabel}.`,
      `Almost at ${destCode || destLabel} — so ready.`,
      `${destLabel} here I come.`,
      `Been looking forward to ${destLabel} for weeks.`,
      `Hope ${destCode || destLabel} is as nice as people say.`,
      grounded
        ? `Made it to ${destLabel} — finally!`
        : `Counting down the minutes to ${destLabel}.`,
    ]));
  }

  if (grounded || descending) {
    if (pilotLvl >= 2) push(3, () => pick([
      "Very smooth landing.",
      "That was a soft touchdown — props to the pilots.",
      "Barely felt the wheels. Impressive.",
      "Textbook landing. Respect.",
      "Pilots earned their keep on that one.",
    ]));
    else if (pilotLvl === 0) push(2, () => pick([
      "That landing was a bit firm…",
      "Oof. My coffee almost launched.",
      "We arrived — loudly.",
      "Someone clap for surviving that touchdown.",
    ]));
    else push(2, () => pick([
      "Decent landing. I'll take it.",
      "Not the smoothest, not the worst.",
      "We're down. That's what counts.",
    ]));
  }

  if (topRival && topRival.rep > myRep + 4) {
    push(3, () => pick([
      `I'm taking ${topRival.name} next time.`,
      `${topRival.name} felt nicer last trip.`,
      `Maybe I should try ${topRival.name} instead.`,
      `${topRival.name} keeps looking better…`,
      `Not sure I'd book ${airline} again over ${topRival.name}.`,
    ]));
  } else if (myRep >= 70 || (topRival && myRep >= topRival.rep + 3)) {
    push(3, () => pick([
      "This is my new favourite airline.",
      `${airline} just gets it.`,
      "I'll book these guys again.",
      "Honestly? Best flight I've had in a while.",
      `${airline} is quietly excellent.`,
      "Solid airline. Putting them on my shortlist.",
    ]));
  } else {
    push(2, () => pick([
      "Fine flight. Nothing fancy.",
      "Gets me there — that's what matters.",
      "Average in a good way.",
      "No drama. I'll take it.",
    ]));
  }

  if (sv.amenities) {
    push(1, () => pick(grounded ? [
      "Cute amenity kit — I kept the eye mask.",
      "Socked up from the amenity kit. No regrets.",
      "That little kit was a nice touch.",
    ] : [
      "Cute amenity kit — the eye mask helps.",
      "Amenity kit socks are underrated.",
      "Toothbrush in the kit? Respect.",
    ]));
  }

  // Happy, well-paid crews show up in cabin chatter (not toast popups).
  const staffMorale = (G.state.staff && G.state.staff.morale) || 0;
  if (p._crewKind || staffMorale >= 75) {
    const w = p._crewKind ? 5 : staffMorale >= 88 ? 3 : 2;
    push(w, () => pick([
      "These staff are very kind.",
      "The crew made my week — what an airline.",
      "Smoothest cabin service I've ever had.",
      "The flight attendants genuinely seemed happy to be here.",
      "Cabin crew checked on me twice. Felt looked after.",
      "Everyone up front was so patient with questions.",
    ]));
  }

  if (grounded) {
    push(3, () => pick([
      "Glad to stretch my legs.",
      "Hope baggage shows up quickly.",
      "Gate's busy tonight.",
      "Anyone else need coffee before the connection?",
      "That turnaround felt short.",
      "Where's the exit again?",
      "Jet bridge air hits different.",
      "Already thinking about the taxi line.",
      "Need to find arrivals before I wander off.",
    ]));
  } else if (climbing) {
    push(3, () => pick([
      "Ears just popped — we're climbing.",
      "Seatbelt sign's still on.",
      "Hope we leave the bumps behind soon.",
      "Window seat wins again.",
      "City shrinking under the wing already.",
      "That takeoff roll never gets old.",
      "Phones away — we're rolling.",
    ]));
  } else if (descending) {
    push(3, () => pick([
      "Tray tables up — almost there.",
      "I can see the city lights already.",
      "Hope we get in on time.",
      "Ears popping on the way down.",
      `Landing into ${destCode || destLabel} soon.`,
      "Seatbacks upright. The ritual begins.",
      "Almost on the ground — pack up time.",
    ]));
  } else if (cruise) {
    push(3, () => pick([
      "Window seat wins again.",
      "The views from up here never get old.",
      "Anyone else need coffee?",
      "Clouds look soft enough to walk on.",
      "Cruise is the best part.",
      "Halfway there, mentally at least.",
      "Quiet cabin energy. I like it.",
      "Time for a proper nap if I can.",
    ]));
  }

  const dish = (sv.dish || "").trim();
  const people = p._paxPeople.map(pe => {
    let thoughtFn = pick(pool);
    if (pe.isKid && sv.models && rnd() < 0.22) {
      thoughtFn = () => pick([
        "I like this model plane!",
        "Mom said I can keep the toy plane!",
        "Vroom. This little jet is mine.",
      ]);
    } else if (pe.isKid && !sv.models && rnd() < 0.1) {
      thoughtFn = () => pick(["I want a toy plane…", "Boring. Where are the toys?"]);
    } else if (pe.isKid) {
      thoughtFn = () => pick(grounded
        ? [
          "Are we at grandma's yet?",
          "Can we get a snack at the airport?",
          "I see the big trucks outside!",
          `Is this ${destCode || destLabel}?`,
          "I want to ride the luggage cart!",
        ]
        : cruise || climbing
          ? [
            "Are we there yet?",
            "The clouds look like sheep!",
            "I can see tiny cars!",
            `When do we get to ${destLabel}?`,
            "This plane is so loud!",
          ]
          : [
            "Are we landing soon?",
            "My ears feel funny.",
            "Look at the lights!",
            `Is that ${destLabel} down there?`,
          ]);
    } else if (meal && meal.id !== "none" && dish && rnd() < 1 / 20) {
      thoughtFn = () => pick([
        `Wow! This ${dish} is amazing!`,
        `Whoa — the ${dish} is incredible.`,
        `That ${dish} just made the flight.`,
      ]);
    }
    return { ...pe, thought: thoughtFn() };
  });

  const html = `<div class="pax-thoughts">
    <div class="pax-thoughts-head">Passenger thoughts</div>
    <div class="pax-thoughts-list">
    ${people.map(pe => `<div class="pax-thought">
      <div class="pax-thought-meta"><b>${esc(pe.name)}</b> · ${pe.age} · ${pe.gLabel}</div>
      <div class="pax-thought-line">“${esc(pe.thought)}”</div>
    </div>`).join("")}
    </div>
  </div>`;
  p._paxThoughts = html;
  p._paxThoughtPhase = phase;
  if (p._crewKind) p._crewKind = false;   // one-shot shout-out after a kind landing
  return html;
}

function planeCardLeg(p) {
  let fromC, toC, label;
  if (p.charter) {
    const ferry = p.charter.phase === "ferry";
    fromC = ferry ? (p.charter.ferryFrom || p.charter.from) : p.charter.from;
    toC = ferry ? p.charter.from : p.charter.to;
    label = ferry ? "Ferry to charter pickup" : `Charter · pays ${fmtMoney(p.charter.pay)}`;
  } else if (p.route) {
    const dir = routePath(p);
    const i = Math.min(p.segIdx || 0, Math.max(0, dir.length - 2));
    fromC = dir[i];
    toC = dir[i + 1];
    label = "Scheduled service";
  } else {
    const at = planeLoc(p);
    fromC = at;
    toC = at;
    label = "At the gate";
  }
  return { fromC, toC, label };
}

function renderPlaneCard() {
  const id = UI.planeCardId;
  if (!id) return;
  const el = $("#plane-card");
  const p = G.state.planes.find(x => x.id === id);
  if (!p) { closePlaneCard(); return; }
  const t = aircraftById[p.typeId];
  const flying = p.status === "fly";
  const { fromC, toC, label } = planeCardLeg(p);
  const a = airportByCode[fromC], b = airportByCode[toC];
  const d = (a && b && fromC !== toC) ? distKm(a, b) : 0;
  const prog = flying ? Math.max(0, Math.min(1, p.prog)) : 1;
  const cruise = t.tons ? 34000 : t.cat === "Light" ? 12000
    : t.cat === "Charter" ? 41000
    : (t.cat === "Regional" && t.speed < 600) ? 24000
    : t.cat === "Widebody" ? 39000 : 37000;
  const phase = Math.min(prog, 1 - prog);
  const altFt = flying ? Math.round(cruise * Math.min(1, phase * 7) / 100) * 100 : 0;
  const spd = flying ? Math.round(planeSpeed(p) * (0.5 + 0.5 * Math.min(1, phase * 7))) : 0;
  const phaseName = !flying ? "On the ground"
    : prog < 0.14 ? "Climb" : prog > 0.86 ? "Descent" : "Cruise";
  let payload = p.charter ? "charter party" : (t.tons ? "freight" : "passengers");
  if (!p.charter) {
    if (p.boarding) {
      payload = p.boarding.isCargo
        ? `${fmtNum(p.boarding.carried)} t freight · tickets ${fmtMoney(p.boarding.revenue)}`
        : `${fmtNum(p.boarding.carried)} pax · tickets ${fmtMoney(p.boarding.revenue)}`;
    } else if (p.route) {
      const isCargo = !!t.tons;
      const f2 = airportByCode[p.route.from], t2 = airportByCode[p.route.to];
      const fare = p.route.fareMult || 1;
      const live = demandMultiplier({ cargo: isCargo, touchesHub: p.route.from === G.state.hub || p.route.to === G.state.hub, from: p.route.from, to: p.route.to }) *
        stopoverPenalty((p.route.stops || []).length, isCargo) *
        eventDemandMult(f2, t2, isCargo) * (isCargo ? 1 : crewDemandMult());
      const dem = routePoolRemaining(p.route.from, p.route.to, isCargo) * live *
        Math.pow(fare, -FARE_ELASTICITY);
      const periodCap = Math.max(1, routeDailyCapacity(p.route.from, p.route.to, isCargo) * (demandPeriodHours() / 24));
      let load = Math.min(1, dem / periodCap);
      if (p.wear > 80) load *= 0.8;
      load = Math.min(load, isCargo ? 0.5 + effReputation() / 200 : effReputation() / 100);
      payload = isCargo
        ? `≈ ${fmtNum(t.tons * load)} t freight`
        : `≈ ${fmtNum((p.cabin ? cabinPax(p.cabin) : t.seats) * load)} pax`;
    }
  }
  const statusNote = !flying
    ? (p.status === "maint" ? `In maintenance · ${fmtDur(p.timer || 0)} left`
      : p.status === "turn" ? `Turnaround · ready in ${fmtDur(p.timer || 0)}`
      : p.status === "hold" ? "Held at the gate"
      : p.status === "ready" ? "Ready for departure"
      : p.status === "ground" ? "Grounded"
      : `Parked at ${esc(planeLoc(p))}`)
    : null;
  const freight = isFreighter(p);
  if (freight && UI.paxViewId === p.id) {
    UI.paxViewId = null;
    resetPaxViewState();
  }
  const paxOpen = !freight && UI.paxViewId === p.id;
  const busy = p.status === "fly" || p.status === "maint";
  const canOps = !busy;
  const routeOpen = UI.routeFormPlane === p.id;
  ensurePlaneCardShell(el);
  const body = el.querySelector("#plane-card-body");
  const routeMount = el.querySelector("#plane-card-route");
  const thoughtsMount = el.querySelector("#plane-card-thoughts");
  const paxMount = el.querySelector("#plane-card-pax");
  el.classList.remove("hidden");
  el.classList.toggle("has-pax", paxOpen);
  el.classList.toggle("has-route", routeOpen);
  const routeLine = (a && b)
    ? (fromC === toC
      ? `<div class="ac-row">At <b>${a.code}</b> ${esc(a.city)}</div>`
      : `<div class="ac-row"><b>${a.code}</b> ${esc(a.city)} → <b>${b.code}</b> ${esc(b.city)}</div>`)
    : "";
  const assigned = p.route
    ? `<div class="ac-row">Route <b>${p.route.from} ⇄ ${p.route.to}</b>${(p.route.stops || []).length ? ` <span class="muted mini">via ${p.route.stops.join("·")}</span>` : ""}</div>`
    : `<div class="ac-row muted">No route assigned</div>`;
  const charterNote = p.charter && p.charter.brief
    ? `<div class="ac-row muted mini charter-brief">“${esc(p.charter.brief)}”</div>`
    : "";
  body.innerHTML = `
    <h3>✈ ${p.id}</h3>
    <div class="muted">${t.maker} ${t.name} · ${label}</div>
    ${charterNote}
    ${routeLine}
    ${assigned}
    ${flying ? `<div class="ac-row"><div class="bar"><div class="bar-fill bar-ok" style="width:${Math.round(prog * 100)}%"></div></div>
      <span class="bar-label">${Math.round(prog * 100)}%</span></div>
    <div class="ac-row">Phase <b>${phaseName}</b> · lands in <b>${fmtDur(p.timer)}</b></div>
    ${p.divertWx ? `<div class="ac-row bad-text">⛈ Diverting around ${esc(p.divertWx)}</div>` : ""}
    <div class="ac-row">Altitude <b>${fmtNum(altFt)} ft</b> · Speed <b>${fmtSpeed(spd)}</b></div>`
      : `<div class="ac-row">${statusNote}</div>`}
    <div class="ac-row">Aboard: <b>${payload}</b></div>
    <div class="ac-row muted mini">${d ? `Leg ${fmtNum(d)} km · ` : ""}${engineOf(p.engine).name} engines · ${planeBurn(p).toFixed(1)} kg/km · wear ${Math.round(p.wear)}%${p.route && p.route.fareMult !== 1 ? ` · fares ${Math.round((p.route.fareMult || 1) * 100)}%` : ""}</div>
    <div class="ac-row card-actions">
      <button class="btn mini-btn ${routeOpen ? "btn-gold" : ""}" ${canOps ? "" : "disabled"} onclick="toggleRouteForm('${p.id}')">${p.route ? "Edit route" : "Assign route"}</button>
      ${p.route ? `<button class="btn mini-btn" ${canOps ? "" : "disabled"} onclick="clearRoute('${p.id}');refreshRouteUI()">Unassign</button>` : ""}
      ${freight ? "" : `<button class="btn mini-btn ${paxOpen ? "btn-gold" : ""}" onclick="showPaxView('${p.id}')">${paxOpen ? "🪟 Hide window" : "🪟 Passenger view"}</button>`}
      <button class="btn mini-btn ${UI.planeCardHist ? "btn-gold" : ""}" onclick="uiPlaneCardHist()">📜 Flight log</button>
    </div>
    ${UI.planeCardHist ? flightHistHtml(p) : ""}`;
  // Route form lives in its own mount so tick refreshes don't steal focus.
  // Key on editor state only — not live demand figures that change every tick.
  const rfFrom = p._selFrom || (p.route ? p.route.from : (p.homeHub || G.state.hub));
  const rfTo = p._selTo || (p.route ? p.route.to : "");
  const rfStops = (p._selStops || (p.route && p.route.stops) || []).join(",");
  const rfFare = p._selFare != null ? p._selFare : (p.route && p.route.fareMult) || 1;
  const routeKey = routeOpen
    ? [p.id, rfFrom, rfTo, rfStops, rfFare, p._selFareJ || "", p._selFareF || "", UI.rfStopPicker || ""].join("|")
    : "";
  if (routeMount.dataset.key !== routeKey) {
    routeMount.dataset.key = routeKey;
    routeMount.innerHTML = routeOpen ? routeForm(p) : "";
  }
  // Thoughts live in their own mount so the tick refresh doesn't reset scroll.
  // Freighters have no cabin — clear any leftover thoughts panel.
  const thoughtsHtml = freight ? "" : paxThoughtsHtml(p);
  if (thoughtsMount.dataset.html !== thoughtsHtml) {
    thoughtsMount.dataset.html = thoughtsHtml;
    thoughtsMount.innerHTML = thoughtsHtml;
  }
  if (paxOpen) {
    paxMount.hidden = false;
    renderPaxView(false);
  } else if (paxMount && !paxMount.hidden) {
    paxMount.hidden = true;
    paxMount.innerHTML = "";
    resetPaxViewState();
  }
}

// ---------------- passenger window view ----------------
const PAX_ASSETS = {
  dayFlight:     "assets/paxview/day-flight-clouds.png?v=2",
  nightFlight:   "assets/paxview/night-flight-sky.png",
  dayGround:     "assets/paxview/airport-day-base.png",
  nightGround:   "assets/paxview/airport-night-base.png",
  sunsetBase:    "assets/paxview/sunset-base.png",
  sunsetClouds:  "assets/paxview/sunset-clouds.png",
  airportNightLights: "assets/paxview/airport-night-lights.png",
  windowFrame:   "assets/paxview/window-frame.png",
};

function paxSkyPeriod() {
  const hour = (G.state.gameMin % 1440) / 60;
  // golden-hour transitions bookend the day
  if (hour >= 5 && hour < 7) return "sunrise";
  if (hour >= 18 && hour < 20) return "sunset";
  if (hour >= 7 && hour < 18) return "day";
  return "night";
}

function isGameNight() {
  return paxSkyPeriod() === "night";
}

function resetPaxViewState() {
  UI._paxKey = null;
  UI._paxGround = null;
  UI._paxSky = null;
}

// Commit to a sky period with hysteresis so classic-speed clocks don't
// thrash day↔sunrise at the exact hour boundary.
function paxStickySky(period) {
  const hour = (G.state.gameMin % 1440) / 60;
  let sky = UI._paxSky;
  if (!sky) {
    UI._paxSky = period;
    return period;
  }
  if (sky === period) return sky;
  const deep =
    (period === "day" && hour >= 7.35 && hour < 17.65) ||
    (period === "night" && (hour >= 20.35 || hour < 4.65)) ||
    (period === "sunrise" && hour >= 5.2 && hour < 6.8) ||
    (period === "sunset" && hour >= 18.2 && hour < 19.8);
  if (deep) UI._paxSky = period;
  return UI._paxSky;
}

function paxStickyGround(p, prog) {
  let grounded = UI._paxGround;
  const wantGround = p.status !== "fly" || prog < 0.06 || prog > 0.94;
  if (grounded == null) grounded = wantGround;
  else if (grounded && p.status === "fly" && prog >= 0.12 && prog <= 0.88) grounded = false;
  else if (!grounded && (p.status !== "fly" || prog <= 0.04 || prog >= 0.96)) grounded = true;
  UI._paxGround = grounded;
  return grounded;
}

function paxViewScene(p) {
  const period = paxStickySky(paxSkyPeriod());
  const night = period === "night";
  const prog = Math.max(0, Math.min(1, p.prog || 0));
  const grounded = paxStickyGround(p, prog);
  if (grounded) {
    if (night) {
      return {
        mode: "airport-night",
        bg: PAX_ASSETS.nightGround,
        label: "On the ground · night",
      };
    }
    return {
      mode: "airport",
      bg: PAX_ASSETS.dayGround,
      label: "On the ground · day",
    };
  }
  if (period === "sunrise" || period === "sunset") {
    return {
      mode: "sunset",
      base: PAX_ASSETS.sunsetBase,
      bg: PAX_ASSETS.sunsetClouds,
      label: period === "sunrise" ? "In flight · sunrise" : "In flight · sunset",
    };
  }
  if (period === "night") {
    return { mode: "stars", bg: PAX_ASSETS.nightFlight, label: "In flight · night" };
  }
  return { mode: "clouds", bg: PAX_ASSETS.dayFlight, label: "In flight · day" };
}

function showPaxView(id) {
  const p = G.state.planes.find(x => x.id === id);
  if (!p || isFreighter(p)) return;
  // toggle under the aircraft info card (no separate overlay)
  if (UI.planeCardId !== id) showPlaneCard(id);
  const opening = UI.paxViewId !== id;
  UI.paxViewId = opening ? id : null;
  resetPaxViewState();
  const standalone = $("#pax-view");
  if (standalone) {
    standalone.classList.add("hidden");
    standalone.setAttribute("aria-hidden", "true");
    standalone.innerHTML = "";
  }
  renderPlaneCard();
}

function closePaxView() {
  UI.paxViewId = null;
  resetPaxViewState();
  const standalone = $("#pax-view");
  if (standalone) {
    standalone.classList.add("hidden");
    standalone.setAttribute("aria-hidden", "true");
    standalone.innerHTML = "";
  }
  const mount = $("#plane-card-pax");
  if (mount) {
    mount.hidden = true;
    mount.innerHTML = "";
  }
  if (UI.planeCardId) renderPlaneCard();
}

function paxAirportHtml() {
  return `<div class="pax-sky pax-sky-airport">
    <img class="pax-airport-base" src="${PAX_ASSETS.dayGround}" alt="">
  </div>`;
}

function paxAirportNightHtml() {
  // staggered runway / apron blink dots along the bottom edge only
  const blinks = [];
  for (let i = 0; i < 14; i++) {
    const left = 4 + i * 6.8;
    const delay = (i % 5) * 0.35;
    const dur = 1.1 + (i % 3) * 0.25;
    blinks.push(`<span class="pax-blink" style="left:${left}%;animation-duration:${dur}s;animation-delay:${delay}s"></span>`);
  }
  return `<div class="pax-sky pax-sky-airport-night">
    <img class="pax-airport-base" src="${PAX_ASSETS.nightGround}" alt="">
    <img class="pax-airport-lights" src="${PAX_ASSETS.airportNightLights}" alt="">
    <div class="pax-blink-layer">${blinks.join("")}</div>
  </div>`;
}

function paxDriftHtml(src, kind, baseSrc) {
  const strip = (cls) => `
    <div class="pax-cloud-band ${cls}">
      <div class="pax-cloud-track">
        <img src="${src}" alt=""><img src="${src}" alt="">
      </div>
    </div>`;
  const base = baseSrc ? `<img class="pax-sunset-base" src="${baseSrc}" alt="">` : "";
  return `<div class="pax-sky pax-sky-${kind}">${base}${strip("far")}${strip("near")}</div>`;
}

// Day cruise: full sky plate scrolling with a soft parallax double-layer
function paxDaySkyHtml(src) {
  const strip = (cls) => `
    <div class="pax-day-band ${cls}">
      <div class="pax-day-track">
        <img src="${src}" alt=""><img src="${src}" alt="">
      </div>
    </div>`;
  return `<div class="pax-sky pax-sky-clouds">${strip("far")}${strip("near")}</div>`;
}

function paxSceneryHtml(scene) {
  if (scene.mode === "airport") return paxAirportHtml();
  if (scene.mode === "airport-night") return paxAirportNightHtml();
  if (scene.mode === "clouds") return paxDaySkyHtml(scene.bg);
  if (scene.mode === "stars" || scene.mode === "sunset") {
    return paxDriftHtml(scene.bg, scene.mode, scene.base);
  }
  return `<img class="pax-layer bg" src="${scene.bg}" alt="">`;
}

function renderPaxView(force) {
  const id = UI.paxViewId;
  // mounts under the aircraft info card; the old left-side overlay stays unused
  const el = $("#plane-card-pax");
  if (!id) return;
  if (!el || el.hidden) return;
  const p = G.state.planes.find(x => x.id === id);
  if (!p) { closePaxView(); return; }

  // Dev time scrub / hard refresh: drop sticky latches so the sky snaps now
  if (force) {
    UI._paxSky = null;
    UI._paxGround = null;
  }

  const scene = paxViewScene(p);
  // Mode + art only — labels (sunrise vs sunset) share art and must not rebuild
  const key = `${scene.mode}|${scene.bg}|${scene.base || ""}`;
  if (!force && UI._paxKey === key && el.innerHTML) {
    const badge = el.querySelector(".pax-badge");
    if (badge) badge.textContent = scene.label;
    const hud = el.querySelector(".pax-hud");
    if (hud) hud.innerHTML = paxHudHtml(p, scene);
    return;
  }
  const hadScene = !!UI._paxKey && !!el.innerHTML;
  UI._paxKey = key;

  el.innerHTML = `
    <div class="pax-wrap pax-wrap-inline">
      <div class="pax-badge">${esc(scene.label)}</div>
      <div class="pax-stage">
        <div class="pax-glass${hadScene && !force ? " pax-scene-in" : ""}">${paxSceneryHtml(scene)}</div>
        <img class="pax-frame" src="${PAX_ASSETS.windowFrame}" alt="">
      </div>
      <div class="pax-hud">${paxHudHtml(p, scene)}</div>
    </div>`;
}

function paxHudHtml(p, scene) {
  const t = aircraftById[p.typeId];
  let route = "";
  if (p.charter) {
    const ferry = p.charter.phase === "ferry";
    route = ferry
      ? `${p.charter.ferryFrom || "?"} → ${p.charter.from}`
      : `${p.charter.from} → ${p.charter.to}`;
  } else if (p.route) {
    const dir = routePath(p);
    route = `${dir[p.segIdx]} → ${dir[p.segIdx + 1]}`;
  }
  const eta = p.status === "fly" ? `Lands in ${fmtDur(p.timer)}` : "At the gate";
  return `<div><b>${esc(p.id)}</b> · ${esc(t.name)}<br><span class="mini">${esc(route)} · ${eta}</span></div>
    <div class="mini" style="text-align:right">${fmtClock(G.state.gameMin)}<br>${esc(scene.label)}</div>`;
}

function uiPlaneCardHist() {
  UI.planeCardHist = !UI.planeCardHist;
  if (UI.planeCardHist) UI.routeFormPlane = null;
  renderPlaneCard();
}

// ---------------- help / FAQ (ask box + tip blurbs) ----------------

const HELP_FAQ = [
  {
    id: "airport",
    q: "Why don’t I see my favourite airport?",
    keys: ["airport", "airports", "zoom", "globe", "map", "dots", "jfk", "lga", "ewr", "parked", "visible"],
    phrases: ["favourite airport", "favorite airport", "can't see", "dont see"],
    a: `The globe hides smaller markets when you’re zoomed out so the map stays readable. Scroll or pinch to zoom in — tiny airports only appear up close, and you can zoom quite far to separate metro clusters (e.g. JFK, LGA and EWR). Your hubs, route endpoints, and parked aircraft always stay visible no matter the zoom. Parked planes draw on top of airport dots so you can tap them after landing — switch to <b>Airports on top</b> under Company if you’d rather tap the dots instead.`,
  },
  {
    id: "lease",
    q: "How does leasing work?",
    keys: ["lease", "leasing", "rent", "deposit", "return", "cooldown", "cool-down"],
    phrases: ["leasing work", "lease fee"],
    a: `Leasing lets you fly a jet without paying the full sticker price. You pay a small deposit up front (about 5% of list price), then a daily lease fee while you have it. Every lease lasts ${LEASE_MAX_DAYS} game days — when the clock runs out the airframe goes back to the manufacturer automatically (or you can return it early from Fleet Management).<br><br>After a lease ends (or you return it), that maker puts you on a ${LEASE_COOLDOWN_DAYS}-day cool-down and charges roughly ${Math.round((LEASE_SURCHARGE - 1) * 100)}% more if you lease from them again during that window. Leased planes can’t be sold — only returned.`,
  },
  {
    id: "depart",
    q: "Why won’t my plane depart?",
    keys: ["depart", "departure", "ready", "dispatch", "won't", "wont", "stuck", "gate", "held"],
    phrases: ["won't depart", "wont depart", "auto depart", "dispatch office"],
    a: `Check three things: <b>fuel</b> (no fuel = held at the gate), <b>maintenance</b> (worn-out airframes get safety-grounded), and <b>dispatch</b>. Without the Dispatch office (Company → Training), planes wait at “Ready” after every turnaround until you press Depart. Staff the office once for ${AUTODEPART_TP} training points and departures run themselves.`,
  },
  {
    id: "demand",
    q: "How does route demand work?",
    keys: ["demand", "passengers", "pax", "pool", "empty", "load", "fill", "bookings"],
    phrases: ["route demand", "passenger pool"],
    a: `Each city-pair has a finite passenger (and freight) pool that refills on a schedule — every <b>24 hours</b> on Normal and Realism, every <b>12 hours</b> on Easy. Flying a route uses up what's left; once it's empty, further flights leave nearly empty until the next reset. World events, reputation, catering, and codeshares still multiply whatever remains right now.`,
  },
  {
    id: "reputation",
    q: "How does reputation work?",
    keys: ["reputation", "rep", "morale", "brand", "overdraft"],
    phrases: ["reputation work"],
    a: `Reputation roughly caps how full your planes get — around 50% rep fills about half the seats (±10%). Keep airframes tidy, look after staff morale, and run marketing to climb. Flying without enough CO₂ quota costs −${CO2_OVERDRAFT_REP} reputation per overdraft departure, and neglected high-wear aircraft chip away at the brand too.`,
  },
  {
    id: "hubs",
    q: "How do hubs and routes work?",
    keys: ["hub", "hubs", "route", "routes", "international", "domestic", "slots"],
    phrases: ["buy a hub", "assign route", "set a route"],
    a: `Every route must depart from a hub you own. Click an airport on the globe to buy a hub there. You can hold up to ${HUB_MAX} hubs total; international hubs also share a tighter slot limit (${INTL_HUB_SLOTS} based aircraft each, max ${INTL_HUB_MAX} international hubs). Domestic hubs (same country as your home) don’t use those international slots.`,
  },
  {
    id: "fuelco2",
    q: "What’s the deal with fuel & CO₂?",
    keys: ["fuel", "co2", "carbon", "quota", "tanks", "burn"],
    phrases: ["fuel and", "co2 quota"],
    a: `Every departure burns fuel and CO₂ quota from your tanks. No fuel = held at the gate. CO₂ is different: you <i>can</i> depart into the negatives, but each overdraft flight costs −${CO2_OVERDRAFT_REP} reputation. Buy both when prices dip (Fuel & CO₂ panel) and expand storage with ⭐ points.`,
  },
  {
    id: "storms",
    q: "What do storms do?",
    keys: ["storm", "storms", "weather", "typhoon", "divert", "diversion", "hold"],
    phrases: ["weather warning", "gate hold"],
    a: `Active storms show up under World Events → Weather Warnings and as icons on the globe. Departures from airports inside a storm can face random gate holds. If a flight path goes through or near a storm, the plane must divert — about ${WX_DIVERT_MIN} minutes longer and a bit more fuel.`,
  },
  {
    id: "gazette",
    q: "What’s the Weekly Gazette?",
    keys: ["gazette", "newspaper", "paper", "weekly", "news"],
    phrases: ["weekly gazette"],
    a: `Every Sunday the game prints a newspaper under World Events summarizing the week — typhoons and other storms, rival bankruptcies and mergers, your acquisitions, and significant world headlines. Flip Week chips to re-read past issues (last ${PAPER_ARCHIVE} kept).`,
  },
  {
    id: "difficulty",
    q: "What’s the difference between Easy, Normal and Realism?",
    keys: ["easy", "normal", "realism", "difficulty", "hard", "mode"],
    phrases: ["difficulty", "realism mode"],
    a: `<b>Easy</b> discounts aircraft by class, boosts ticket & cargo revenue, cheapens marketing, seeds fewer rivals, and unlocks the Eco Friendly campaign.<br><br><b>Normal</b> is the standard balance with a free choice of game speed.<br><br><b>Realism</b> is otherwise like Normal, but airframes wear twice as fast and you’re locked to 4× speed. Difficulty is chosen when you found the airline and can’t be changed later.`,
  },
  {
    id: "charter",
    q: "How do charters and VIP jets work?",
    keys: ["charter", "charters", "vip", "bizjet", "desk", "ferry"],
    phrases: ["charter desk", "vip jet"],
    a: `Unlock the charter desk in Fleet Management (${CHARTER_UNLOCK_PTS} ⭐). Customers call with one-off routes and a fixed payout — any passenger aircraft with the range can accept.<br><br>VIP bizjets live in their own <b>Charter</b> shop section and stay locked until the desk is open. Flying a job with one earns +${Math.round((CHARTER_SPEC_PAY - 1) * 100)}% pay and can create repeat clients.<br><br>When ordering or configuring a VIP jet you arrange the cabin with club seats, tables, couches, and beds. That’s cosmetic only — it doesn’t change charter pay. Smaller airframes (Citation, Phenom) can’t fit beds; larger VIP frames unlock more furniture.`,
  },
  {
    id: "amenities",
    q: "What do Wi-Fi, entertainment and cabin upgrades do?",
    keys: ["wifi", "wi-fi", "entertainment", "cabin", "seats", "amenity", "amenities", "freighter", "convert"],
    phrases: ["cabin upgrade", "wifi"],
    a: `Every passenger aircraft carries three cabin systems, managed from Fleet Management → Configure: <b>Wi-Fi</b>, <b>entertainment</b> and <b>cabin & seats</b>. Better kit lifts passenger demand a little (high-speed Wi-Fi and premium interiors also earn onboard income per passenger); flying with no entertainment or a worn, dated cabin costs you bookings. New deliveries arrive with a modern loadout, but used airframes come with whatever the last owner fitted — often outdated systems or none at all. Upgrades cost money plus ${fmtDur(AMEN_DOWNTIME_MIN)} in the cabin shop, and refurbishing a used purchase includes a full modern cabin.<br><br>Airline cabins use First / Business / Economy space (F×3 · J×2 · Y×1). You can also convert many passenger jets to freighters from Configure — irreversible, with a cargo payload and a one-time cost.`,
  },
  {
    id: "trainpts",
    q: "How do training points work?",
    keys: ["tp", "train", "academy", "dispatch", "mgmt", "management", "crew"],
    phrases: ["training point", "training points", "train pts", "training academy", "company training", "pilot training", "cabin crew training", "management school"],
    a: `Training points (TP) are a separate currency from ⭐ points. Crews earn about <b>1 TP every 25 departures</b> (a lucky “tricky departure”), and Flight School graduations also bank TP (narrowbody +${CLASS_TP.narrow}, widebody +${CLASS_TP.wide}).<br><br>Spend them in <b>Company → Training</b> on permanent tracks:<br>• <b>Pilot</b> — less airframe wear; level ${WIDE_PILOT_LVL} certifies widebodies<br>• <b>Cabin crew</b> — a little more passenger demand<br>• <b>Chef academy</b> — unlocks Hot / Gourmet catering menus<br>• <b>Management</b> — cheaper payroll and negotiated aircraft deals<br><br>You can also spend TP on the <b>Dispatch office</b> (${AUTODEPART_TP} TP — automatic departures) and, once your hangar is large enough, extra hangar bays (${HANGAR_TP_COST} TP each). Every academy level-up also nudges reputation up a little.`,
  },
  {
    id: "chef",
    q: "How do chefs and catering menus work?",
    keys: ["chef", "chefs", "catering", "meal", "meals", "gourmet", "hot", "snack", "menu", "kitchen", "food"],
    phrases: ["chef academy", "hot meals", "gourmet menu", "onboard meal", "catering"],
    a: `Catering is stocked under <b>Finance & Marketing</b> — you buy meals in bulk, sell them onboard for a profit, and the menu lifts passenger demand while stock lasts. Unsold meals that expire are money wasted.<br><br>Without Chef training you only get <b>snack</b> service. Train <b>Chef academy</b> in Company → Training:<br>• <b>Level 1</b> (3 TP) unlocks Hot meals<br>• <b>Level 2</b> (5 TP) unlocks the Gourmet menu<br><br>Better tiers cost more to stock but sell for more and boost demand (Gourmet can also add a little reputation per flight). Chef academy is separate from Flight School — chefs don’t come from simulators.`,
  },
  {
    id: "school",
    q: "How does the Flight School work?",
    keys: ["school", "cadet", "cadets", "simulator", "simulators", "class", "campus", "graduates"],
    phrases: ["flight school", "cadet class", "pilot pool"],
    a: `Under Company → Flight school you can build a campus at any hub and furnish it like a lounge. Desks, libraries and briefing rooms grow class sizes, instructor offices shorten courses, and <b>simulators</b> do the real work: each one runs continuous cadet classes (narrowbody ${CLASS_DAYS.narrow} days, widebody ${CLASS_DAYS.wide} days — young pilots enrol on their own). Graduates join your pilot pool and crew new deliveries at ${Math.round(CADET_PAY_MULT * 100)}% of market pay, every class banks training points, and your first widebody class certifies the whole airline for heavy aircraft without needing Pilot training Lv ${WIDE_PILOT_LVL}.`,
  },
  {
    id: "used",
    q: "What’s the used market?",
    keys: ["used", "secondhand", "second-hand", "market", "wear", "classic", "concorde"],
    phrases: ["used market", "second hand", "secondhand"],
    a: `Under Purchase Aircraft → Used market you’ll find second-hand airframes with real hours and wear. Stock size varies (roughly a dozen to two dozen), and listings reshuffle every couple of days. Freighters show up sometimes — and retirement headlines (e.g. SpedEx parking MD-11Fs) can dump a wave onto the ramp — but buying cargo jets still needs the cargo division unlocked. Some classics (Concorde, early 747s, etc.) only appear there. Limited-production types can sell out of the new shop forever and then only show up used.`,
  },
  {
    id: "paint",
    q: "How do paint jobs work?",
    keys: ["paint", "livery", "liveries", "colour", "color", "colours", "colors"],
    phrases: ["paint job", "livery"],
    a: `Open Configure on a plane and pick body, belly, tail, and engine colours. Saving a new livery costs $5k–$40k depending on the aircraft and puts it in the paint shop for ${fmtDur(PAINT_DOWNTIME_MIN)}. Freighters lose their cabin windows (cockpit stays). The Aerobus Orca arrives in house colours (white body, black tail); the An-225 keeps its factory paint.`,
  },
  {
    id: "controls",
    q: "How do I move the globe?",
    keys: ["wasd", "arrows", "keyboard", "mouse", "drag", "pan", "move", "controls", "scroll", "pinch"],
    phrases: ["move the globe", "arrow keys"],
    a: `Drag with the mouse (or one finger) to spin the globe. <b>WASD</b> and the <b>arrow keys</b> do the same — W / ↑ pans up, S / ↓ down, A / ← left, D / → right. Scroll or pinch to zoom; zoom in close to reveal smaller airports.`,
  },
];

const HELP_STOP = new Set([
  "a", "an", "the", "how", "what", "why", "do", "does", "did", "is", "are", "was", "were",
  "my", "me", "i", "we", "you", "your", "to", "of", "and", "or", "in", "on", "for", "with",
  "about", "can", "could", "would", "should", "tell", "please", "help", "explain", "work",
  "works", "working", "thing", "things", "this", "that", "it", "its", "be", "been",
  "also", "any", "some", "into", "from", "when", "where", "which", "who", "whom",
]);

const HELP_DEV_ASK = /\b(dev(eloper)?\s*(tools?)?\s*(pass(code|word)?|pin|code)|pass\s*code|password|cheat\s*code|unlock\s*code|admin\s*(pass|code|pin)|secret\s*code|main\s*hippo)\b/i;

function scrubHelpLeak(html) {
  let out = String(html || "");
  try {
    if (typeof DEV_PASSCODE === "string" && DEV_PASSCODE) {
      const re = new RegExp(DEV_PASSCODE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      out = out.replace(re, "[redacted]");
    }
  } catch (_) {}
  return out;
}

function helpPlain(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function helpFormatAnswer(text) {
  const plain = scrubHelpLeak(String(text || "").trim());
  if (!plain) return "I’m not sure — try opening a topic tip below.";
  return esc(plain).replace(/\n+/g, "<br>");
}

/** Full guide text fed to the local model (never includes secrets). */
function helpGuideCorpus() {
  const bits = HELP_FAQ.map(item =>
    `TOPIC: ${item.q}\n${helpPlain(item.a)}`
  );
  if (G.state) {
    const s = G.state;
    bits.push(
      `LIVE AIRLINE SNAPSHOT (for context only):\n` +
      `Cash ${fmtMoney(s.cash)}, fuel ${fmtNum(s.fuel / 1000)} t, CO₂ ${fmtNum(s.co2 / 1000)} t, ` +
      `training points ${s.trainPts || 0}, reputation ${Math.round(s.reputation || 0)}, ` +
      `fleet ${s.planes.length}, hubs ${(s.hubs || []).join("/")}.`
    );
  }
  return bits.join("\n\n");
}

function helpRankTopics(raw, limit = 3) {
  const rawLow = String(raw || "").toLowerCase();
  const tokens = rawLow
    .replace(/[^a-z0-9\s+-]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1 && !HELP_STOP.has(t));
  if (!tokens.length) return [];

  const scored = HELP_FAQ.map(item => {
    const qLow = item.q.toLowerCase();
    const aLow = helpPlain(item.a).toLowerCase();
    const keySet = new Set((item.keys || []).map(k => k.toLowerCase()));
    let score = 0;
    for (const phrase of item.phrases || []) {
      if (rawLow.includes(phrase.toLowerCase())) score += 12;
    }
    for (const t of tokens) {
      const tfA = (aLow.split(t).length - 1);
      const tfQ = (qLow.split(t).length - 1);
      if (keySet.has(t)) score += 6;
      score += tfQ * 4 + Math.min(3, tfA) * 2;
      for (const k of keySet) {
        if (k.length > 2 && (k.startsWith(t) || t.startsWith(k))) { score += 2; break; }
      }
    }
    return { item, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Offline fallback: retrieve relevant guide chunks (not a fixed Q→A map). */
function helpRetrieveAnswer(raw) {
  const hits = helpRankTopics(raw, 3);
  if (!hits.length || hits[0].score < 4) {
    return {
      html: "I’m not sure from the guide. Open a tip below, or ask about training points, chefs, fuel, hubs, or charters.",
      topicId: null,
      source: "search",
    };
  }
  const top = hits.filter((h, i) => i === 0 || h.score >= hits[0].score * 0.55).slice(0, 2);
  const html = top.map(h => `<b>${esc(h.item.q)}</b><br>${h.item.a}`).join("<br><br>");
  return { html: scrubHelpLeak(html), topicId: hits[0].item.id, source: "search" };
}

function helpRefuse(raw) {
  return HELP_DEV_ASK.test(raw) ||
    (typeof DEV_PASSCODE === "string" && DEV_PASSCODE &&
      String(raw).toLowerCase().includes(DEV_PASSCODE.toLowerCase()));
}

function helpSetStatus(text) {
  UI.helpStatus = text || "";
  const el = document.getElementById("help-ai-status");
  if (el) el.textContent = UI.helpStatus;
}

function helpWarmAI() {
  if (typeof HelpAI === "undefined") return;
  if (HelpAI.status === "ready" || HelpAI.status === "loading") return;
  if (!HelpAI.supported()) {
    helpSetStatus("Guide search · WebGPU not available for local AI");
    return;
  }
  HelpAI.ensure((msg) => helpSetStatus(msg)).then((engine) => {
    if (engine) helpSetStatus("Local AI ready · answers run on your device");
    else helpSetStatus(HelpAI.progress || "Guide search ready");
  });
}

async function helpAnswerSmart(raw) {
  if (helpRefuse(raw)) {
    return {
      html: "Developer access codes aren’t part of the guide. The 🛠 button is for the game author — ask about routes, fuel, training points, chefs, or any other game feature instead.",
      topicId: null,
      source: "refuse",
    };
  }

  // Prefer local model when available; retrieve top topics as grounding context.
  if (typeof HelpAI !== "undefined") {
    const ranked = helpRankTopics(raw, 4);
    const focus = ranked.length
      ? ranked.map(h => `TOPIC: ${h.item.q}\n${helpPlain(h.item.a)}`).join("\n\n")
      : helpGuideCorpus();
    const guide = focus + "\n\n---\nFULL GUIDE INDEX:\n" +
      HELP_FAQ.map(x => `- ${x.q}`).join("\n");

    helpSetStatus(HelpAI.status === "ready" ? "Thinking…" : (HelpAI.progress || "Loading local model…"));
    try {
      const text = await HelpAI.ask(raw, guide);
      if (text) {
        helpSetStatus("Local AI · on-device");
        return {
          html: helpFormatAnswer(text),
          topicId: ranked[0] ? ranked[0].item.id : null,
          source: "ai",
        };
      }
    } catch (err) {
      console.warn("HelpAI ask failed:", err);
      helpSetStatus("Local AI failed — guide search");
    }
  }

  const fb = helpRetrieveAnswer(raw);
  helpSetStatus(fb.source === "search" ? "Guide search" : "");
  return fb;
}

function renderHelp() {
  const openId = UI.helpQ || null;
  const asked = UI.helpAsked || null;
  const ans = UI.helpAnswer || null;
  const busy = !!UI.helpBusy;
  const status = UI.helpStatus || (
    typeof HelpAI !== "undefined" && HelpAI.supported()
      ? (HelpAI.status === "ready" ? "Local AI ready · on-device" : "Local AI can load on first question")
      : "Guide search · WebGPU not available for local AI"
  );

  // Kick off model download when the panel is open (idle time).
  if (!busy) setTimeout(helpWarmAI, 0);

  const askForm = `
    <form class="help-ask" onsubmit="return uiHelpAsk(event)">
      <input id="help-chat-q" type="search" maxlength="240"
        placeholder="Ask anything about SkyTycoon…"
        value="${esc(UI.helpDraft || "")}"
        oninput="UI.helpDraft=this.value" autocomplete="off" aria-label="Ask help"
        ${busy ? "disabled" : ""}>
      <button type="submit" class="btn btn-gold" ${busy ? "disabled" : ""}>${busy ? "…" : "Ask"}</button>
    </form>
    <div class="muted mini help-ai-status" id="help-ai-status">${esc(status)}</div>`;

  let answerBlurb = "";
  if (asked && ans) {
    answerBlurb = `<details class="panel-tip help-answer" open>
      <summary>${esc(asked)}${UI.helpSource === "ai" ? ` <span class="muted mini">· local AI</span>` : ""}</summary>
      <div class="tip-body">${scrubHelpLeak(ans)}</div>
    </details>`;
  } else {
    answerBlurb = tip(
      `Ask in plain English — a small <b>local model</b> answers on your device when WebGPU is available (first load downloads the model). Otherwise the guide search retrieves the best tips. Browse topics below anytime.`,
      "How help works"
    );
  }

  const topics = HELP_FAQ.map(item => {
    const isOpen = openId === item.id;
    return `<details class="panel-tip help-topic" ${isOpen ? "open" : ""} data-help-id="${item.id}">
      <summary onclick="event.preventDefault();uiHelpToggle('${item.id}')">${esc(item.q)}</summary>
      ${isOpen ? `<div class="tip-body">${item.a}</div>` : ""}
    </details>`;
  }).join("");

  return `
    <div class="help-guide">
      <div class="muted mini panel-note">On-device help desk — tip blurbs match the rest of the UI.</div>
      ${askForm}
      ${answerBlurb}
      <h3 class="cat-head">Topics</h3>
      ${topics}
    </div>`;
}

function uiHelpAsk(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (UI.helpBusy) return false;
  const inp = document.getElementById("help-chat-q");
  const q = (inp && inp.value || UI.helpDraft || "").trim();
  if (!q) return false;

  UI.helpAsked = q;
  UI.helpDraft = "";
  UI.helpBusy = true;
  UI.helpAnswer = `<span class="muted">Thinking…</span>`;
  UI.helpSource = null;
  UI.helpQ = null;
  refreshPanel(true);

  helpAnswerSmart(q).then((res) => {
    UI.helpBusy = false;
    UI.helpAnswer = res.html;
    UI.helpSource = res.source;
    UI.helpQ = res.topicId || null;
    if (UI.panel === "help") refreshPanel(true);
    requestAnimationFrame(() => {
      const n = document.getElementById("help-chat-q");
      if (n) n.focus();
    });
  }).catch((err) => {
    console.warn(err);
    UI.helpBusy = false;
    const fb = helpRetrieveAnswer(q);
    UI.helpAnswer = fb.html;
    UI.helpSource = fb.source;
    UI.helpQ = fb.topicId;
    if (UI.panel === "help") refreshPanel(true);
  });
  return false;
}

function uiHelpToggle(id) {
  UI.helpQ = UI.helpQ === id ? null : id;
  if (UI.helpQ) {
    const item = HELP_FAQ.find(x => x.id === id);
    if (item) {
      UI.helpAsked = item.q;
      UI.helpAnswer = item.a;
      UI.helpSource = "topic";
    }
  }
  refreshPanel(true);
}

// ---------------- world events panel ----------------

function renderEvents() {
  const s = G.state;
  const intro = tip(`News headlines shift demand and prices. Weather warnings are regional storms — gate holds and diversions. Each Sunday the Weekly Gazette digests storms, rival deals, and headlines from the past week.`);

  const paperHtml = renderWeeklyGazette();

  const wxList = s.weather || [];
  const wxHtml = wxList.length
    ? `<h3 class="cat-head">⛈ Weather Warnings</h3>` + wxList.map(w => {
      const z = WEATHER_ZONES[w.zone];
      const hubsHit = (s.hubs || []).filter(h => { const ap = airportByCode[h]; return ap && z.test(ap); });
      const where = hubsHit.length
        ? `Hitting your hub${hubsHit.length > 1 ? "s" : ""} at <b>${hubsHit.join(", ")}</b>.`
        : `Centred over ${z.region}.`;
      return `<div class="card">
      <div class="card-head"><div><b>${z.typhoon ? "🌀" : "⛈"} ${z.name}</b></div>
        <div class="muted mini">${fmtDur(w.until - s.gameMin)} left</div></div>
      <div class="card-row muted mini">${where} Departures from airports in the region face random gate holds; any flight path through or near the storm must divert (~${WX_DIVERT_MIN} min longer).</div>
    </div>`;
    }).join("")
    : `<h3 class="cat-head">⛈ Weather Warnings</h3><div class="empty">Skies are clear.</div>`;

  const newsHead = `<h3 class="cat-head">📰 Headlines</h3>`;
  const newsHtml = !s.events.length
    ? `<div class="empty">The news cycle is quiet.<br><span class="mini muted">Something always happens eventually…</span></div>`
    : s.events.map(ev => {
      const usedFlood = ev.kind === "used";
      const campEv = ev.kind === "campaign";
      const camp = campEv ? campaignDef(ev.campId) : null;
      const campUp = campEv && (ev.campEffect || 1) >= 1 && (ev.campCost || 1) <= 1;
      const campDown = campEv && ((ev.campEffect || 1) < 1 || (ev.campCost || 1) > 1) && !campUp;
      const good = usedFlood || (campEv ? campUp : ev.mult >= 1);
      const tFlood = usedFlood && ev.typeId ? aircraftById[ev.typeId] : null;
      const target = usedFlood ? "Used market"
        : campEv ? (camp ? camp.name : "Marketing")
        : ev.airport ? `${ev.airport} — ${airportByCode[ev.airport].city}` : (ev.country || "Worldwide");
      const campBits = campEv ? [
        ev.campEffect && ev.campEffect !== 1 ? `effect ×${ev.campEffect}` : null,
        ev.campCost && ev.campCost !== 1 ? `launch cost ×${ev.campCost}` : null,
      ].filter(Boolean).join(" · ") : "";
      const effect = usedFlood
        ? `${ev.usedCount || "several"}× ${tFlood ? tFlood.name : "aircraft"} listed`
        : campEv ? (campBits || "marketing news")
        : ev.rival ? `off the market · pax demand ×${ev.mult}`
        : ev.kind === "fuel" ? `fuel prices ×${ev.mult}`
        : ev.kind === "co2" ? `CO₂ prices ×${ev.mult}`
        : `${ev.kind === "both" ? "pax & cargo" : ev.kind} demand ×${ev.mult}`;
      const icon = usedFlood ? "♻️" : campEv ? "📣" : (good ? "📈" : "📉");
      const tone = campEv ? (campUp ? "ok-text" : campDown ? "bad-text" : "muted") : (good ? "ok-text" : "bad-text");
      return `<div class="card">
      <div class="card-head"><div><b>${icon} ${esc(ev.name)}</b></div>
        <div class="muted mini">${fmtDur(ev.until - s.gameMin)} left</div></div>
      <div class="card-row muted">${esc(ev.desc)}${ev.rival ? " They can't compete on routes until the grounding lifts." : ""}</div>
      <div class="card-row"><span class="boost-badge">${esc(target)}</span>
        <span class="${tone} mini">${effect}</span></div>
    </div>`;
    }).join("");

  return intro + paperHtml + wxHtml + newsHead + newsHtml;
}

function renderWeeklyGazette() {
  const s = G.state;
  const papers = s.papers || [];
  const pending = (s.weekNotes || []).length;
  const daysIntoWeek = Math.floor((s.gameMin % WEEK_MIN) / 1440);
  const daysLeft = 7 - daysIntoWeek;
  const hoursLeft = Math.floor(((WEEK_MIN - (s.gameMin % WEEK_MIN)) % 1440) / 60);

  if (!papers.length) {
    return `<h3 class="cat-head">🗞 Weekly Gazette</h3>
      <div class="card paper-card">
        <div class="paper-mast">The ${esc(s.airline)} Gazette</div>
        <div class="muted mini">First edition drops end of Week 1
          ${pending ? ` · ${pending} story${pending === 1 ? "" : "ies"} already on the desk` : ""}
          · ~${daysLeft}d ${hoursLeft}h to press.</div>
      </div>`;
  }

  const idx = Math.min(UI.paperIdx || 0, papers.length - 1);
  UI.paperIdx = idx;
  const p = papers[idx];
  const kindIcon = { weather: "⛈", deal: "🤝", rival: "🏢", news: "📰" };
  const chips = papers.map((x, i) =>
    `<button class="chip ${i === idx ? "active" : ""}" onclick="uiPaperIdx(${i})">Week ${x.week}</button>`
  ).join("");

  const stories = (p.stories || []).map((st, i) => `
    <div class="paper-story ${i === 0 ? "lead" : ""}">
      <div class="paper-kicker">${kindIcon[st.kind] || "•"} ${st.kind === "deal" ? "Deal Desk" : st.kind === "rival" ? "Competitors" : st.kind === "weather" ? "Weather Desk" : "World"}</div>
      <div class="paper-hed">${esc(st.headline)}</div>
      ${st.detail ? `<div class="paper-dek">${esc(st.detail)}</div>` : ""}
    </div>`).join("");

  return `<h3 class="cat-head">🗞 Weekly Gazette</h3>
    <div class="brand-filter">${chips}</div>
    <div class="card paper-card">
      <div class="paper-mast">The ${esc(p.airline || s.airline)} Gazette</div>
      <div class="paper-dateline">Week ${p.week} · Day ${p.day} edition · ${p.stories.length} stor${p.stories.length === 1 ? "y" : "ies"}</div>
      ${stories}
      ${idx === 0 && pending ? `<div class="muted mini" style="margin-top:10px">Next issue in ~${daysLeft}d ${hoursLeft}h · ${pending} item${pending === 1 ? "" : "s"} filed so far.</div>` : ""}
    </div>`;
}

function uiPaperIdx(i) {
  UI.paperIdx = i;
  refreshPanel(true);
}

// ---------------- first-run tutorial ----------------

const TUTORIAL = [
  {
    id: "offer",
    title: "Take a quick tour?",
    body: `You’ve founded your airline with a free starter jet and $100M. Want a guided walkthrough of the side panels, routing, ticket prices, the used market, and more?<br><br><span class="muted mini">You can exit anytime — nothing is locked behind the tour.</span>`,
    offer: true,
  },
  {
    id: "topbar",
    title: "Your flight deck (top bar)",
    body: `Up top you’ll always see <b>cash</b>, <b>⭐ points</b>, <b>fuel</b>, <b>CO₂ quota</b>, and the <b>game clock</b>. Pause with the ⏸ button when you need a breath.<br><br>The airport search box jumps the globe to any market — handy when you’re planning hubs and routes.`,
  },
  {
    id: "globe",
    title: "The globe",
    body: `Drag to spin, or use <b>WASD / arrow keys</b> the same way. Scroll or pinch to zoom — tiny airports only appear up close. Tap an airport for hub info, or a plane icon for its flight card.<br><br>Your home hub and parked aircraft always stay visible.`,
  },
  {
    id: "buy",
    title: "Purchase Aircraft",
    body: `This is the new-jet catalogue. Filter by maker or search by name, then <b>Configure & order</b> — engines, cabin layout, and paint. Deliveries take game time; your free starter is already on the ramp at your hub.`,
    panel: "buy",
    shopTab: "new",
    highlight: "buy",
  },
  {
    id: "used",
    title: "Used market",
    body: `Switch to the <b>Used</b> tab for second-hand airframes — cheaper, with real hours and wear. Stock reshuffles every couple of days. Classics (Concorde, early 747s…) and some freighters often show up only here. Cargo jets still need the cargo division unlocked before you can buy them.`,
    panel: "buy",
    shopTab: "used",
    highlight: "buy",
  },
  {
    id: "fleet",
    title: "Fleet Management",
    body: `Your whole airline lives here — every airframe, charter desk (later), hangar orders, and Configure. From a plane card you can assign routes, send to maintenance, sell/return leases, and tweak Wi‑Fi, entertainment, and cabin class mix.`,
    panel: "fleet",
    highlight: "fleet",
  },
  {
    id: "route",
    title: "Your turn: create a route",
    body: `On your starter jet, press <b>Assign route</b> (or Route). Pick a destination within range — nearby big cities work well — set ticket price if you like, then <b>Save route</b>.<br><br><span class="ok-text">Waiting until you’ve saved a route…</span> (or skip ahead)`,
    panel: "fleet",
    highlight: "fleet",
    wait: "route",
  },
  {
    id: "fares",
    title: "Ticket pricing",
    body: `On the route form, <b>Ticket price</b> is a % of the standard fare. Higher fares earn more per passenger but book fewer seats; lower fares fill the cabin. Use <b>Suggested</b> for a solid starting point. Business / First can be priced separately if those cabins exist.`,
    panel: "fleet",
    highlight: "fleet",
  },
  {
    id: "planeCard",
    title: "Your turn: open a plane card",
    body: `Click your plane on the <b>globe</b> (or its row in Fleet). The card shows altitude, landing time, passenger thoughts, flight log, and — while grounded — Assign / Edit route plus Passenger view.<br><br><span class="ok-text">Waiting for you to open a plane card…</span>`,
    wait: "planeCard",
  },
  {
    id: "depart",
    title: "Getting airborne",
    body: `With a route set, planes need <b>fuel</b> and low enough wear. Without the Dispatch office (Company → Training), press <b>Depart</b> after each turnaround. Buy Dispatch once and departures run themselves.`,
    panel: "fleet",
    highlight: "fleet",
  },
  {
    id: "maint",
    title: "Maintenance",
    body: `Wear climbs with flight hours. High wear hurts bookings and can safety-ground the jet. Schedule checks here (or from Fleet) — they cost cash and take the airframe offline for a while.`,
    panel: "maint",
    highlight: "maint",
  },
  {
    id: "fuel",
    title: "Fuel & CO₂",
    body: `Buy jet fuel and CO₂ quota when prices dip, and expand tanks with ⭐ points. <b>No fuel = held at the gate.</b> You can overdraw CO₂, but each overdraft departure costs reputation — so keep an eye on the green tank.`,
    panel: "fuel",
    highlight: "fuel",
  },
  {
    id: "marketing",
    title: "Marketing campaigns",
    body: `Launch time-limited campaigns to boost passenger demand or reputation. Catering and alliances live here too — meals sell onboard for a profit and lift demand, while alliances add codeshare traffic once you’ve earned enough points.`,
    panel: "marketing",
    mktTab: "marketing",
    highlight: "marketing",
  },
  {
    id: "finance",
    title: "Finance ledger",
    body: `The <b>Finance</b> tab is your P&amp;L — ticket income, fuel, payroll, leases, and more. Check it after a busy day to see what’s making (or bleeding) money. Lounges are designed hub-by-hub under the Lounges tab.`,
    panel: "marketing",
    mktTab: "finance",
    highlight: "marketing",
  },
  {
    id: "events",
    title: "World Events",
    body: `Headlines shift demand and prices. Weather warnings spawn storms that can hold departures or force diversions. Every Sunday the <b>Weekly Gazette</b> digests the week’s storms, rival deals, and big news.`,
    panel: "events",
    highlight: "events",
  },
  {
    id: "company",
    title: "Company HQ",
    body: `Reputation, staff, training academy, flight school, subsidiaries, map style, and lifetime stats all live here. Training unlocks Dispatch, chef tiers, pilot levels for widebodies, and more — spend ⭐ wisely.`,
    panel: "company",
    highlight: "company",
  },
  {
    id: "help",
    title: "Help desk",
    body: `Stuck later? Open <b>Help</b> — ask in plain English (a small local AI answers on-device when WebGPU is available) or browse tip blurbs. It won’t hand out cheat codes.`,
    panel: "help",
    highlight: "help",
  },
  {
    id: "done",
    title: "You’re cleared to taxi",
    body: `That’s the tour. Grow the fleet, open hubs, watch fuel &amp; reputation, and check Finance when cash feels tight. Have fun building your airline — and reopen Help anytime if something’s unclear.`,
    panel: "fleet",
    highlight: "fleet",
  },
];

function offerTutorial() {
  UI.tut = { i: 0, active: true };
  renderTutorial();
}

function tutActive() {
  return !!(UI.tut && UI.tut.active);
}

function tutStep() {
  if (!tutActive()) return null;
  return TUTORIAL[UI.tut.i] || null;
}

function renderTutorial() {
  const el = $("#tutorial");
  if (!el) return;
  const step = tutStep();
  if (!step) {
    el.classList.add("hidden");
    document.body.classList.remove("tut-on");
    delete document.body.dataset.tutPanel;
    return;
  }
  el.classList.remove("hidden");
  document.body.classList.add("tut-on");
  if (step.highlight) document.body.dataset.tutPanel = step.highlight;
  else delete document.body.dataset.tutPanel;

  // Open the matching panel / tab for this beat
  if (step.panel) {
    if (step.shopTab) UI.shopTab = step.shopTab;
    if (step.mktTab) UI.mktTab = step.mktTab;
    if (UI.panel !== step.panel) openPanel(step.panel, { force: true });
    else refreshPanel(true);
  } else if (UI.panel && (step.id === "topbar" || step.id === "globe" || step.id === "planeCard")) {
    closePanel();
  }

  const total = TUTORIAL.length;
  const idx = UI.tut.i;
  $("#tut-step").textContent = step.offer ? "Optional" : `${idx} / ${total - 1}`;
  $("#tut-title").textContent = step.title;
  $("#tut-body").innerHTML = step.body;

  const actions = $("#tut-actions");
  if (step.offer) {
    actions.innerHTML = `
      <button type="button" class="btn" onclick="tutDecline()">No thanks</button>
      <button type="button" class="btn btn-gold" onclick="tutAccept()">Start tour</button>`;
  } else if (step.id === "done") {
    actions.innerHTML = `
      <button type="button" class="btn btn-gold" onclick="tutExit(true)">Finish</button>`;
  } else {
    const waitHint = step.wait
      ? `<span class="tut-wait muted mini">Do the step above, or continue</span>`
      : "";
    actions.innerHTML = `
      <button type="button" class="btn" onclick="tutExit()">Exit tutorial</button>
      ${waitHint}
      <button type="button" class="btn btn-gold" onclick="tutNext()">${step.wait ? "Skip ahead" : "Next"}</button>`;
  }
}

function tutAccept() {
  if (!tutActive()) return;
  UI.tut.i = 1;
  renderTutorial();
}

function tutDecline() {
  tutExit(false);
  openPanel("buy");
  toast("Tour skipped — Help is always in the sidebar if you need it.");
}

function tutNext() {
  if (!tutActive()) return;
  UI.tut.i = Math.min(UI.tut.i + 1, TUTORIAL.length - 1);
  renderTutorial();
}

function tutExit(finished) {
  UI.tut = { i: 0, active: false };
  const el = $("#tutorial");
  if (el) el.classList.add("hidden");
  document.body.classList.remove("tut-on");
  delete document.body.dataset.tutPanel;
  if (finished) {
    openPanel("fleet");
    toast("Tutorial complete — have fun!");
  }
}

function tutNotify(kind) {
  const step = tutStep();
  if (!step || !step.wait) return;
  if (step.wait === kind) tutNext();
}

// ---------------- onboarding ----------------

function showOnboarding() {
  const el = $("#onboard");
  el.classList.remove("hidden");
  UI.obHub = UI.obHub || "JFK";
  UI.obDiff = UI.obDiff || "normal";
  UI.obMap = UI.obMap || mapStylePref();
  renderObHub();
  renderObDiff();
  renderObMap();
}

function renderObHub() {
  const box = $("#ob-hub-box");
  if (!box) return;
  const ap = airportByCode[UI.obHub];
  box.innerHTML = `
    <div class="ob-hub-sel">Selected: <b>${UI.obHub}</b> — ${esc(ap.city)}, ${esc(ap.country)}</div>
    ${airportPicker("ob", UI.obHub, "obPickHub(%C)")}`;
}

function obPickHub(code) {
  UI.obHub = code;
  renderObHub();
}

function renderObDiff() {
  const box = $("#ob-diff");
  const note = $("#ob-diff-note");
  const speedWrap = $("#ob-speed-wrap");
  if (!box) return;
  const cur = UI.obDiff || "normal";
  box.innerHTML = Object.values(DIFFICULTY).map(d =>
    `<button type="button" class="chip ${cur === d.id ? "active" : ""}" onclick="obPickDiff('${d.id}')">${d.label}</button>`
  ).join("");
  if (note) note.textContent = (DIFFICULTY[cur] || DIFFICULTY.normal).blurb;
  if (speedWrap) {
    const locked = !!(DIFFICULTY[cur] && DIFFICULTY[cur].lockSpeed);
    speedWrap.classList.toggle("hidden", locked);
    if (locked) {
      const sel = $("#ob-speed");
      if (sel) sel.value = DIFFICULTY[cur].lockSpeed;
    }
  }
}

function obPickDiff(id) {
  if (!DIFFICULTY[id]) return;
  UI.obDiff = id;
  renderObDiff();
}

function renderObMap() {
  const box = $("#ob-map");
  const note = $("#ob-map-note");
  if (!box) return;
  const cur = UI.obMap || mapStylePref();
  const opts = [
    { id: "texture", label: "Texture map", blurb: "Detailed Earth photo on the globe." },
    { id: "simple", label: "Simple map", blurb: "Lightweight vector land & ocean." },
  ];
  box.innerHTML = opts.map(o =>
    `<button type="button" class="chip ${cur === o.id ? "active" : ""}" onclick="obPickMap('${o.id}')">${o.label}</button>`
  ).join("");
  if (note) {
    const o = opts.find(x => x.id === cur) || opts[0];
    note.textContent = `${o.blurb} You can change this anytime in Company.`;
  }
}

function obPickMap(id) {
  if (id !== "texture" && id !== "simple") return;
  UI.obMap = id;
  try { localStorage.setItem("sky_map_style", id); } catch (_) {}
  renderObMap();
}

function startGame() {
  const name = $("#ob-name").value.trim() || "New Horizon Air";
  const hub = UI.obHub || "JFK";
  const speed = ($("#ob-speed") && $("#ob-speed").value) || "fast";
  const starter = ($("#ob-starter") && $("#ob-starter").value) || "a320";
  const difficulty = UI.obDiff || "normal";
  const mapStyle = UI.obMap || mapStylePref();
  try { localStorage.setItem("sky_map_style", mapStyle === "simple" ? "simple" : "texture"); } catch (_) {}
  newGame(name, hub, speed, starter, difficulty);
  $("#onboard").classList.add("hidden");
  renderTopbar();
  pumpNotifs();
  toast(mapStyle === "simple"
    ? "Simple map selected — change anytime in Company."
    : "Texture map selected — change anytime in Company.");
  offerTutorial();
}
