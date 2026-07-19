// ============================================================
// SkyTycoon — aircraft side-profile artwork (inline SVG)
// Parameterized silhouettes: turboprops get props, the 747 gets
// its hump, the A380 a double deck, quads get four nacelles.
// ============================================================

const ART_STYLE = {
  c208: "prop", c408: "prop", b1900: "prop", ka350: "prop", dhc6: "prop",
  atr42: "prop", atr72: "prop", q400: "prop", l188: "prop",
  ph300: "narrow", citx: "narrow", g650: "narrow", lin1000: "narrow",
  a220c: "narrow", bbj737: "narrow", a343c: "wide", bbj787: "wide",
  crj7: "narrow", crj9: "narrow", e175: "narrow", e195e2: "narrow", a21x: "narrow",
  a320: "narrow", b764: "wide", b788: "wide",
  a310: "wide", b7810: "wide", a35k: "wide", a35u: "wide", a35f: "wide",
  a310f: "wide", an124: "wide", an225: "wide", blgxl: "wide",
  e190e2: "narrow", a220: "narrow", a320n: "narrow", b38m: "narrow",
  a321n: "narrow", b752: "narrow", b737: "narrow", b738: "narrow", md88: "narrow",
  dc9: "narrow", a318: "narrow", b731: "narrow", b717: "narrow", dc8: "narrow", mc214: "narrow",
  b763: "wide", a339: "wide", b789: "wide", a359: "wide", b77w: "wide", b77l: "wide",
  a332: "wide", a333: "wide", md11: "wide",
  dc10: "wide", l1011: "wide", a343: "wide", a346: "wide", b779: "wide",
  b748: "b747", b744: "b747", b74d: "b747", b74sp: "b747", a388: "a380",
  b738f: "narrow", b763f: "wide", md11f: "wide", a332f: "wide", b77f: "wide", b748f: "b747",
  a300: "wide", b707: "narrow", b731: "narrow", b741: "b747", conc: "narrow",
  a3: "narrow",
  il96: "wide", il964: "wide",
};

// per-type quirks: rear-mounted engines, tail (tri-jet) engine, no windows
const ART_FLAGS = {
  md88: { rear: true },
  dc9: { rear: true },
  crj7: { rear: true },
  crj9: { rear: true },
  a310f: { cargo: true },
  a35f: { cargo: true },
  an124: { engines: 4, cargo: true },
  an225: { engines: 4, cargo: true, hh: 11, len: 1.08 },
  blgxl: { cargo: true, hh: 13, len: 0.88 },   // Aerobus Orca — bulbous freighter
  b74sp: { len: 0.82 },                        // stubby jumbo
  b731: { len: 0.68 },                         // the original stubby 737
  b74d: { engines: 4 },
  md11: { tri: true },
  dc10: { tri: true },
  l1011: { tri: true },
  a343: { engines: 4 },
  a343c: { engines: 4 },
  a346: { engines: 4, len: 1.05 },
  bbj787: { len: 0.95 },
  bbj737: { len: 0.88 },
  a220c: { len: 0.85 },
  md11f: { tri: true, cargo: true },
  b707: { engines: 4 },
  dc8: { engines: 4 },
  l188: { engines: 4 },
  il96: { engines: 4 },
  il964: { engines: 4, len: 1.05 },
  conc: { hh: 5.5, len: 1.18 },        // slim needle-nosed dart
  a3: { len: 0.42, hh: 7.5 },          // Aerobus's shortest airliner (joke stub)
  ph300: { rear: true, len: 0.72 },
  citx: { rear: true, len: 0.78 },
  g650: { rear: true, len: 0.9 },
  lin1000: { len: 0.95 },
  b738f: { cargo: true },
  b763f: { cargo: true },
  a332f: { cargo: true },
  b77f: { cargo: true },
  b748f: { cargo: true },
};

const ART_C = {
  body: "#f7fafc", belly: "#dbe4ec", outline: "#5b6c7c",
  wing: "#cfd9e3", win: "#2b4a68", eng: "#e2e9f0", intake: "#1d3348",
  accent: "#e8a833", glass: "#1f3d5c",
};

function planeArtSVG(t, livery) {
  // livery: optional { body, belly, tail, eng } hex overrides
  const style = ART_STYLE[t.id] ||
    (t.tons ? "wide" : t.cat === "Widebody" ? "wide" : t.cat === "Light" ? "prop" : t.cat === "Charter" ? "narrow" : "narrow");
  const flags = ART_FLAGS[t.id] || {};
  const prevC = { ...ART_C };
  if (livery) {
    if (livery.body) { ART_C.body = livery.body; }
    if (livery.belly) { ART_C.belly = livery.belly; }
    if (livery.tail) { ART_C.accent = livery.tail; }
    if (livery.eng) { ART_C.eng = livery.eng; }
  }
  try {
    return planeArtSVGInner(t, style, flags);
  } finally {
    Object.assign(ART_C, prevC);
  }
}

function planeArtSVGInner(t, style, flags) {
  // fuselage length scales a little with seat count within its class
  if (style === "prop") return artProp(t);
  if (style === "b747") return artJet(t, { hh: 9, hump: true, engines: 4, len: 1.0, ...flags });
  if (style === "a380") return artJet(t, { hh: 12, deck2: true, engines: 4, len: 1.0, ...flags });
  if (style === "wide") return artJet(t, { hh: 9, engines: 2, len: 0.97, ...flags });
  const len = 0.78 + Math.min(0.18, ((t.seats || 150) - 100) / 700);
  return artJet(t, { hh: 7, engines: 2, len, ...flags });
}

function artJet(t, o) {
  const C = ART_C;
  const cy = 47, hh = o.hh;
  const noseX = 118 + 96 * o.len;        // nose tip (right)
  const tailX = 118 - 90 * o.len;        // tail cone (left)
  const top = cy - hh, bot = cy + hh;
  const wx = (noseX + tailX) / 2 + 8;    // wing root x

  // Fuselage: rounded nose at right, tail cone sweeping gently upward at left.
  const fuselage = `M ${tailX + 30},${top}
    L ${noseX - 46},${top}
    Q ${noseX - 10},${top} ${noseX},${cy - 1}
    Q ${noseX - 10},${bot} ${noseX - 46},${bot}
    L ${tailX + 40},${bot}
    Q ${tailX + 16},${bot} ${tailX + 9},${cy + hh * 0.35}
    L ${tailX},${cy - hh * 0.85}
    Q ${tailX + 14},${top} ${tailX + 30},${top} Z`;

  // Swept vertical tail fin sitting on the rear fuselage.
  const fin = `M ${tailX + 38},${top} L ${tailX + 20},${top} L ${tailX + 2},${top - 30} L ${tailX + 16},${top - 30} Z`;
  const finAccent = `M ${tailX + 20},${top} L ${tailX + 8},${top - 20} L ${tailX + 20},${top - 20} L ${tailX + 32},${top} Z`;
  // Swept horizontal stabiliser at the tail.
  const stab = `M ${tailX + 20},${cy - 1} L ${tailX + 2},${cy - 8} L ${tailX + 14},${cy - 8} L ${tailX + 32},${cy - 1} Z`;
  // Swept-back wing dropping below the belly.
  const wing = `M ${wx + 26},${bot - 2} L ${wx - 36},${bot + 16} L ${wx - 18},${bot + 17} L ${wx + 34},${bot - 1} Z`;

  // Podded engine hung under the wing on a short pylon.
  const podEngine = (ex, scale = 1) => `
    <line x1="${ex}" y1="${bot - 1}" x2="${ex}" y2="${bot + 4}" stroke="${C.outline}" stroke-width="1.3"/>
    <rect x="${ex - 12 * scale}" y="${bot + 3}" width="${24 * scale}" height="${10 * scale}" rx="${5 * scale}"
      fill="${C.eng}" stroke="${C.outline}" stroke-width="1.1"/>
    <ellipse cx="${ex + 12 * scale}" cy="${bot + 3 + 5 * scale}" rx="2.4" ry="${4.3 * scale}" fill="${C.intake}"/>`;
  // Rear fuselage-mounted engine (DC-9/MD-88/CRJ).
  const rearEngine = `
    <rect x="${tailX + 26}" y="${top - 3}" width="22" height="9" rx="4" fill="${C.eng}" stroke="${C.outline}" stroke-width="1.1"/>
    <ellipse cx="${tailX + 48}" cy="${top + 1.5}" rx="2.2" ry="4" fill="${C.intake}"/>`;

  let engines;
  if (o.rear) {
    engines = rearEngine;
  } else if (o.engines === 4) {
    engines = podEngine(wx - 30, 0.9) + podEngine(wx + 4, 1);
  } else {
    engines = podEngine(wx - 6, 1);
  }
  if (o.tri) {                                             // tail (#2) engine at fin root
    engines += `<ellipse cx="${tailX + 15}" cy="${top - 15}" rx="7.5" ry="5" fill="${C.eng}" stroke="${C.outline}" stroke-width="1"/>
      <ellipse cx="${tailX + 8}" cy="${top - 15}" rx="1.8" ry="3.4" fill="${C.intake}"/>`;
  }

  // 747: raised upper-deck "hump" over the forward fuselage, cockpit on top.
  const hump = o.hump ? `
    <path d="M ${noseX - 24},${top + 1}
             Q ${noseX - 30},${top - 11} ${noseX - 54},${top - 11}
             L ${noseX - 92},${top - 11}
             Q ${noseX - 110},${top - 11} ${noseX - 118},${top} Z"
      fill="${C.body}" stroke="${C.outline}" stroke-width="1.2"/>
    <line x1="${noseX - 52}" y1="${top - 6}" x2="${noseX - 98}" y2="${top - 6}"
      stroke="${C.win}" stroke-width="1.6" stroke-dasharray="2 3"/>` : "";

  const winY2 = o.deck2 ? `
    <line x1="${tailX + 34}" y1="${cy + 4}" x2="${noseX - 42}" y2="${cy + 4}"
      stroke="${C.win}" stroke-width="2" stroke-dasharray="2 3"/>` : "";

  const cockpitY = o.hump ? top - 7 : (o.deck2 ? top + 6 : top + 2);
  return `<svg class="plane-art-svg" viewBox="0 0 240 96" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${t.maker} ${t.name} side profile">
    <ellipse cx="120" cy="90" rx="86" ry="4" fill="rgba(0,0,0,0.22)"/>
    <path d="${stab}" fill="${C.wing}" stroke="${C.outline}" stroke-width="1"/>
    <path d="${fin}" fill="${C.body}" stroke="${C.outline}" stroke-width="1.2"/>
    <path d="${finAccent}" fill="${C.accent}" opacity="0.92"/>
    <path d="${fuselage}" fill="${C.body}" stroke="${C.outline}" stroke-width="1.2"/>
    <path d="M ${tailX + 12},${cy + hh - 3} L ${noseX - 32},${cy + hh - 3} L ${noseX - 38},${bot} L ${tailX + 30},${bot} Q ${tailX + 16},${bot} ${tailX + 9},${cy + hh * 0.35} Z"
      fill="${C.belly}" opacity="0.85"/>
    ${hump}
    ${o.cargo
      ? `<rect x="${noseX - 82}" y="${top + 3}" width="20" height="${hh + 2}" rx="2"
           fill="none" stroke="${C.outline}" stroke-width="1" opacity="0.7"/>`
      : `<line x1="${tailX + 30}" y1="${top + 5}" x2="${noseX - 46}" y2="${top + 5}"
           stroke="${C.win}" stroke-width="2" stroke-dasharray="2 3"/>${winY2}`}
    <path d="M ${noseX - 19},${cockpitY} L ${noseX - 6},${cy - 3} L ${noseX - 14},${cy - 2} L ${noseX - 25},${cockpitY + 1} Z" fill="${C.glass}"/>
    <line x1="${tailX + 14}" y1="${cy + hh - 2}" x2="${noseX - 20}" y2="${cy + hh - 2}"
      stroke="${C.accent}" stroke-width="2"/>
    <path d="${wing}" fill="${C.wing}" stroke="${C.outline}" stroke-width="1"/>
    ${engines}
  </svg>`;
}

function artProp(t) {
  const C = ART_C;
  const cy = 48, hh = 8;
  const noseX = 196, tailX = 52;
  const top = cy - hh, bot = cy + hh;
  const wx = 128;   // wing/engine position (high wing)

  return `<svg class="plane-art-svg" viewBox="0 0 240 96" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${t.maker} ${t.name} side profile">
    <ellipse cx="120" cy="88" rx="78" ry="4" fill="rgba(0,0,0,0.25)"/>
    <!-- T-tail -->
    <path d="M ${tailX + 14},${top + 1} L ${tailX + 2},${top - 30} L ${tailX + 20},${top - 30} L ${tailX + 40},${top + 1} Z"
      fill="${C.body}" stroke="${C.outline}" stroke-width="1.2"/>
    <path d="M ${tailX + 12},${top - 30} L ${tailX + 24},${top - 30} L ${tailX + 40},${top + 1} L ${tailX + 24},${top + 1} Z" fill="${C.accent}" opacity="0.9"/>
    <rect x="${tailX - 8}" y="${top - 33}" width="42" height="4" rx="2" fill="${C.wing}" stroke="${C.outline}" stroke-width="1"/>
    <!-- fuselage -->
    <path d="M ${tailX + 10},${top} L ${noseX - 34},${top}
      Q ${noseX - 8},${top} ${noseX},${cy - 1}
      Q ${noseX - 6},${bot} ${noseX - 32},${bot}
      L ${tailX + 30},${bot}
      Q ${tailX + 12},${bot - 1} ${tailX + 4},${cy + 2}
      Q ${tailX + 2},${top + 3} ${tailX + 10},${top} Z"
      fill="${C.body}" stroke="${C.outline}" stroke-width="1.2"/>
    <path d="M ${tailX + 10},${cy + hh - 3} L ${noseX - 20},${cy + hh - 3} L ${noseX - 26},${bot} L ${tailX + 30},${bot} Q ${tailX + 12},${bot - 1} ${tailX + 4},${cy + 2} Z"
      fill="${C.belly}" opacity="0.8"/>
    <!-- windows + cockpit -->
    <line x1="${tailX + 32}" y1="${top + 5}" x2="${noseX - 36}" y2="${top + 5}"
      stroke="${C.win}" stroke-width="2" stroke-dasharray="2 3"/>
    <path d="M ${noseX - 16},${top + 2} L ${noseX - 4},${cy - 2} L ${noseX - 12},${cy - 1} L ${noseX - 22},${top + 3} Z" fill="${C.glass}"/>
    <line x1="${tailX + 12}" y1="${cy + hh - 2}" x2="${noseX - 14}" y2="${cy + hh - 2}"
      stroke="${C.accent}" stroke-width="2"/>
    <!-- high wing over fuselage -->
    <rect x="${wx - 34}" y="${top - 4}" width="64" height="4" rx="2" fill="${C.wing}" stroke="${C.outline}" stroke-width="1"/>
    <!-- engine nacelle on wing + prop -->
    <rect x="${wx - 4}" y="${top - 9}" width="26" height="10" rx="4.5" fill="${C.eng}" stroke="${C.outline}" stroke-width="1"/>
    <circle cx="${wx + 24}" cy="${top - 4}" r="2.2" fill="${C.intake}"/>
    <ellipse cx="${wx + 26}" cy="${top - 4}" rx="2" ry="15" fill="rgba(90,110,130,0.4)"/>
  </svg>`;
}
