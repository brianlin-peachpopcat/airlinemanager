"use strict";
/* ============================================================
   LIVERY ART — photo-real side profiles for the paint shop
   Templates live in img/liveries/*.png (white, transparent bg).
   Parts are normalized regions; fills are multiply-tinted and
   clipped to the plane silhouette so overshoot is harmless.
   ============================================================ */

/* Engine regions are boxes [x0,y0,x1,y1] measured from the template's
   alpha channel (tools/analyze_liveries*.py) so they hug each nacelle;
   they render as octagons (corner-cut boxes) to follow the cowl shape. */
const LIVERY_TEMPLATES = {
  twin: {
    src: "img/liveries/twin.png",
    // window strip band [x0,y0,x1,y1] used for cargo window removal
    win: [0.10, 0.64, 0.79, 0.76],
    belly: [[-0.02, 0.83], [0.84, 0.83], [0.84, 1.02], [-0.02, 1.02]],
    eng: [[0.300, 0.70, 0.437, 1.02]],
    tail: [[0.775, 0.68], [0.85, -0.02], [1.02, -0.02], [1.02, 0.38], [0.88, 0.68]],
  },
  ejet: {
    src: "img/liveries/ejet.png",
    srcGnd: "img/liveries/ejet-gnd.png",
    win: [0.12, 0.62, 0.74, 0.70],
    belly: [[-0.02, 0.82], [0.84, 0.82], [0.84, 1.02], [-0.02, 1.02]],
    eng: [[0.300, 0.68, 0.450, 1.00]],
    tail: [[0.78, 0.58], [0.85, -0.02], [1.02, -0.02], [1.02, 0.40], [0.90, 0.58]],
  },
  a340: {
    src: "img/liveries/a340.png",
    win: [0.08, 0.56, 0.75, 0.71],
    belly: [[-0.02, 0.79], [0.86, 0.79], [0.86, 1.02], [-0.02, 1.02]],
    eng: [[0.305, 0.74, 0.418, 1.00], [0.418, 0.72, 0.550, 0.98]],
    tail: [[0.83, 0.62], [0.885, -0.02], [1.02, -0.02], [1.02, 0.34], [0.91, 0.62]],
  },
  dc8: {
    src: "img/liveries/dc8.png",
    srcGnd: "img/liveries/dc8-gnd.png",
    win: [0.09, 0.655, 0.74, 0.778],
    winGnd: [0.09, 0.60, 0.74, 0.72],
    belly: [[-0.02, 0.80], [0.86, 0.80], [0.86, 1.02], [-0.02, 1.02]],
    eng: [[0.300, 0.72, 0.415, 1.00], [0.415, 0.70, 0.545, 0.98]],
    tail: [[0.82, 0.58], [0.88, -0.02], [1.02, -0.02], [1.02, 0.34], [0.91, 0.58]],
  },
  b707: {
    src: "img/liveries/b707.png",
    srcGnd: "img/liveries/b707-gnd.png",
    win: [0.09, 0.691, 0.74, 0.756],
    winGnd: [0.09, 0.648, 0.74, 0.708],
    belly: [[-0.02, 0.80], [0.86, 0.80], [0.86, 1.02], [-0.02, 1.02]],
    eng: [[0.300, 0.72, 0.415, 1.00], [0.415, 0.70, 0.545, 0.98]],
    tail: [[0.82, 0.55], [0.88, -0.02], [1.02, -0.02], [1.02, 0.32], [0.91, 0.55]],
  },
  rj: {
    src: "img/liveries/rj.png",
    win: [0.11, 0.46, 0.74, 0.78],
    belly: [[-0.02, 0.82], [0.68, 0.82], [0.68, 1.02], [-0.02, 1.02]],
    eng: [[0.660, 0.38, 0.835, 0.72]],
    tail: [[0.84, 0.60], [0.885, -0.02], [1.02, -0.02], [1.02, 0.60]],
  },
  crj7: {
    src: "img/liveries/crj7.png",
    srcGnd: "img/liveries/crj7-gnd.png",
    win: [0.14, 0.52, 0.70, 0.66],
    belly: [[-0.02, 0.80], [0.72, 0.80], [0.72, 1.02], [-0.02, 1.02]],
    eng: [[0.680, 0.40, 0.850, 0.72]],
    tail: [[0.82, 0.52], [0.88, -0.02], [1.02, -0.02], [1.02, 0.55]],
  },
  q400: {
    src: "img/liveries/q400.png",
    srcGnd: "img/liveries/q400-gnd.png",
    win: [0.18, 0.55, 0.68, 0.68],
    belly: [[-0.02, 0.80], [0.78, 0.80], [0.78, 1.02], [-0.02, 1.02]],
    eng: [[0.300, 0.32, 0.500, 0.58]],
    tail: [[0.78, 0.48], [0.84, -0.02], [1.02, -0.02], [1.02, 0.52], [0.90, 0.52]],
  },
  atr: {
    src: "img/liveries/atr.png",
    win: [0.22, 0.66, 0.68, 0.80],
    belly: [[-0.02, 0.83], [0.75, 0.83], [0.75, 1.02], [-0.02, 1.02]],
    eng: [[0.315, 0.36, 0.545, 0.62]],
    tail: [[0.78, 0.55], [0.83, -0.02], [1.02, -0.02], [1.02, 0.55]],
  },
  l188: {
    // Electra art is gear-down only — showroom pose reuses the same plate.
    src: "img/liveries/l188.png",
    srcGnd: "img/liveries/l188.png",
    win: [0.18, 0.595, 0.70, 0.625],
    belly: [[-0.02, 0.80], [0.78, 0.80], [0.78, 1.02], [-0.02, 1.02]],
    eng: [[0.300, 0.48, 0.425, 0.82], [0.440, 0.48, 0.565, 0.82]],
    tail: [[0.78, 0.38], [0.85, -0.02], [1.02, -0.02], [1.02, 0.55], [0.90, 0.55]],
  },
  c208: {
    src: "img/liveries/c208.png",
    win: [0.28, 0.42, 0.62, 0.58],
    belly: [[-0.02, 0.72], [0.72, 0.72], [0.72, 1.02], [-0.02, 1.02]],
    eng: [[0.02, 0.42, 0.22, 0.72]],
    tail: [[0.72, 0.35], [0.80, -0.02], [1.02, -0.02], [1.02, 0.42], [0.88, 0.45]],
  },
  dhc6: {
    src: "img/liveries/dhc6.png",
    win: [0.22, 0.48, 0.62, 0.62],
    belly: [[-0.02, 0.78], [0.75, 0.78], [0.75, 1.02], [-0.02, 1.02]],
    eng: [[0.28, 0.28, 0.48, 0.55]],
    tail: [[0.75, 0.42], [0.82, -0.02], [1.02, -0.02], [1.02, 0.48], [0.90, 0.48]],
  },
  light: {
    src: "img/liveries/light.png",
    win: [0.24, 0.46, 0.63, 0.64],
    belly: [[-0.02, 0.68], [0.70, 0.68], [0.70, 1.02], [-0.02, 1.02]],
    eng: [[0.080, 0.60, 0.300, 0.88]],
    tail: [[0.72, 0.42], [0.80, -0.02], [1.02, -0.02], [1.02, 0.42]],
  },
  citx: {
    src: "img/liveries/citx.png",
    srcGnd: "img/liveries/citx-gnd.png",
    win: [0.22, 0.58, 0.58, 0.66],
    belly: [[-0.02, 0.78], [0.80, 0.78], [0.80, 1.02], [-0.02, 1.02]],
    eng: [[0.62, 0.40, 0.78, 0.68]],
    tail: [[0.78, 0.52], [0.84, -0.02], [1.02, -0.02], [1.02, 0.20], [0.92, 0.52]],
  },
  ph300: {
    src: "img/liveries/ph300.png",
    srcGnd: "img/liveries/ph300-gnd.png",
    win: [0.28, 0.46, 0.58, 0.58],
    belly: [[-0.02, 0.72], [0.78, 0.72], [0.78, 1.02], [-0.02, 1.02]],
    eng: [[0.60, 0.36, 0.76, 0.62]],
    tail: [[0.76, 0.48], [0.82, -0.02], [1.02, -0.02], [1.02, 0.22], [0.90, 0.48]],
  },
  b1900: {
    src: "img/liveries/b1900.png",
    srcGnd: "img/liveries/b1900-gnd.png",
    win: [0.22, 0.48, 0.62, 0.62],
    belly: [[-0.02, 0.78], [0.78, 0.78], [0.78, 1.02], [-0.02, 1.02]],
    eng: [[0.28, 0.55, 0.48, 0.82]],
    tail: [[0.78, 0.48], [0.84, -0.02], [1.02, -0.02], [1.02, 0.50], [0.90, 0.50]],
  },
  tri: {
    src: "img/liveries/tri.png",
    win: [0.09, 0.63, 0.79, 0.73],
    belly: [[-0.02, 0.82], [0.86, 0.82], [0.86, 1.02], [-0.02, 1.02]],
    eng: [[0.408, 0.78, 0.525, 1.00], [0.700, 0.32, 0.845, 0.52]],
    tail: [[0.855, 0.30], [0.885, -0.02], [1.02, -0.02], [1.02, 0.30]],
  },
  md11: {
    src: "img/liveries/md11.png",
    srcGnd: "img/liveries/md11-gnd.png",
    // gear-up / gear-down crops sit at different heights — blank both
    win: [0.12, 0.675, 0.82, 0.725],
    winGnd: [0.12, 0.505, 0.82, 0.580],
    belly: [[-0.02, 0.80], [0.86, 0.80], [0.86, 1.02], [-0.02, 1.02]],
    eng: [[0.340, 0.70, 0.480, 1.00], [0.700, 0.30, 0.870, 0.55]],
    tail: [[0.82, 0.52], [0.88, -0.02], [1.02, -0.02], [1.02, 0.32], [0.92, 0.52]],
  },
  dc9r: {
    src: "img/liveries/dc9.png",
    srcGnd: "img/liveries/dc9-gnd.png",
    win: [0.12, 0.52, 0.70, 0.66],
    belly: [[-0.02, 0.80], [0.70, 0.80], [0.70, 1.02], [-0.02, 1.02]],
    eng: [[0.680, 0.38, 0.860, 0.72]],
    tail: [[0.82, 0.55], [0.88, -0.02], [1.02, -0.02], [1.02, 0.55]],
  },
  b747: {
    src: "img/liveries/b747.png",
    win: [0.05, 0.66, 0.80, 0.76],
    belly: [[-0.02, 0.82], [0.86, 0.82], [0.86, 0.96], [-0.02, 0.96]],
    eng: [[0.293, 0.76, 0.393, 1.00], [0.435, 0.73, 0.532, 0.95]],
    tail: [[0.82, 0.60], [0.885, -0.02], [1.02, -0.02], [1.02, 0.36], [0.92, 0.60]],
  },
  b737ng: {
    src: "img/liveries/b737ng.png",
    win: [0.05, 0.655, 0.77, 0.735],
    belly: [[-0.02, 0.83], [0.86, 0.83], [0.86, 1.02], [-0.02, 1.02]],
    eng: [[0.313, 0.72, 0.442, 1.00]],
    tail: [[0.79, 0.60], [0.86, -0.02], [1.02, -0.02], [1.02, 0.40], [0.90, 0.60]],
  },
  b38m: {
    src: "img/liveries/b38m.png",
    win: [0.05, 0.655, 0.77, 0.735],
    belly: [[-0.02, 0.83], [0.86, 0.83], [0.86, 1.02], [-0.02, 1.02]],
    eng: [[0.312, 0.72, 0.436, 1.00]],
    tail: [[0.79, 0.60], [0.86, -0.02], [1.02, -0.02], [1.02, 0.40], [0.90, 0.60]],
  },
  a330: {
    src: "img/liveries/a330.png",
    win: [0.04, 0.615, 0.79, 0.70],
    belly: [[-0.02, 0.80], [0.87, 0.80], [0.87, 1.02], [-0.02, 1.02]],
    eng: [[0.308, 0.72, 0.432, 1.00]],
    tail: [[0.80, 0.55], [0.875, -0.02], [1.02, -0.02], [1.02, 0.28], [0.90, 0.55]],
  },
  b757: {
    src: "img/liveries/b757.png",
    win: [0.04, 0.63, 0.80, 0.71],
    belly: [[-0.02, 0.79], [0.87, 0.79], [0.87, 1.02], [-0.02, 1.02]],
    eng: [[0.346, 0.73, 0.470, 1.00]],
    tail: [[0.78, 0.58], [0.87, -0.02], [1.02, -0.02], [1.02, 0.32], [0.91, 0.58]],
  },
  b777: {
    src: "img/liveries/b777.png",
    win: [0.05, 0.63, 0.80, 0.73],
    belly: [[-0.02, 0.83], [0.87, 0.83], [0.87, 1.02], [-0.02, 1.02]],
    eng: [[0.335, 0.72, 0.435, 1.02]],
    tail: [[0.80, 0.58], [0.88, -0.02], [1.02, -0.02], [1.02, 0.30], [0.91, 0.58]],
  },
  a350: {
    src: "img/liveries/a350.png",
    win: [0.04, 0.60, 0.80, 0.70],
    belly: [[-0.02, 0.80], [0.87, 0.80], [0.87, 1.02], [-0.02, 1.02]],
    eng: [[0.325, 0.72, 0.445, 1.02]],
    tail: [[0.80, 0.55], [0.875, -0.02], [1.02, -0.02], [1.02, 0.28], [0.90, 0.55]],
  },
  b787: {
    src: "img/liveries/b787.png",
    win: [0.045, 0.645, 0.81, 0.72],
    belly: [[-0.02, 0.84], [0.87, 0.84], [0.87, 1.02], [-0.02, 1.02]],
    eng: [[0.332, 0.72, 0.432, 1.02]],
    tail: [[0.79, 0.60], [0.865, -0.02], [1.02, -0.02], [1.02, 0.30], [0.90, 0.60]],
  },
  crj9: {
    src: "img/liveries/crj9.png",
    win: [0.15, 0.57, 0.67, 0.70],
    belly: [[-0.02, 0.85], [0.80, 0.85], [0.80, 1.02], [-0.02, 1.02]],
    eng: [[0.700, 0.44, 0.815, 0.76]],
    tail: [[0.79, 0.55], [0.845, -0.02], [1.02, -0.02], [1.02, 0.35], [0.88, 0.55]],
  },
  a320r: {
    src: "img/liveries/a320.png",
    win: [0.15, 0.60, 0.74, 0.68],
    belly: [[-0.02, 0.78], [0.82, 0.78], [0.82, 1.02], [-0.02, 1.02]],
    eng: [[0.293, 0.72, 0.432, 1.00]],
    tail: [[0.78, 0.58], [0.825, -0.02], [1.02, -0.02], [1.02, 0.45], [0.88, 0.58]],
  },
  a318r: {
    src: "img/liveries/a318.png",
    win: [0.17, 0.62, 0.73, 0.71],
    belly: [[-0.02, 0.80], [0.80, 0.80], [0.80, 1.02], [-0.02, 1.02]],
    eng: [[0.285, 0.72, 0.428, 1.00]],
    tail: [[0.755, 0.55], [0.80, -0.02], [1.02, -0.02], [1.02, 0.50], [0.865, 0.55]],
  },
  a220r: {
    src: "img/liveries/a220.png",
    win: [0.15, 0.61, 0.79, 0.69],
    belly: [[-0.02, 0.79], [0.84, 0.79], [0.84, 1.02], [-0.02, 1.02]],
    eng: [[0.303, 0.73, 0.442, 1.00]],
    tail: [[0.80, 0.58], [0.85, -0.02], [1.02, -0.02], [1.02, 0.45], [0.90, 0.58]],
  },
  b146: {
    src: "img/liveries/b146.png",
    win: [0.19, 0.64, 0.68, 0.72],
    belly: [[-0.02, 0.82], [0.78, 0.82], [0.78, 1.02], [-0.02, 1.02]],
    eng: [[0.272, 0.57, 0.465, 0.82]],
    tail: [[0.705, 0.54], [0.775, -0.02], [0.985, -0.02], [0.945, 0.54]],
  },
  s340: {
    src: "img/liveries/s340.png",
    win: [0.26, 0.62, 0.66, 0.69],
    belly: [[-0.02, 0.82], [0.80, 0.82], [0.80, 1.02], [-0.02, 1.02]],
    eng: [[0.290, 0.70, 0.540, 0.94]],
    tail: [[0.735, 0.62], [0.805, -0.02], [1.00, -0.02], [0.955, 0.62]],
  },
  a380: {
    src: "img/liveries/a380.png",
    win: [0.06, 0.55, 0.80, 0.80],
    belly: [[-0.02, 0.82], [0.84, 0.82], [0.84, 1.02], [-0.02, 1.02]],
    eng: [[0.276, 0.76, 0.398, 0.99], [0.432, 0.74, 0.556, 0.97]],
    tail: [[0.81, 0.55], [0.865, -0.02], [1.02, -0.02], [1.02, 0.34], [0.905, 0.55]],
  },
  mc21: {
    src: "img/liveries/mc21.png",
    srcGnd: "img/liveries/mc21-gnd.png",
    win: [0.12, 0.63, 0.72, 0.675],
    belly: [[-0.02, 0.82], [0.84, 0.82], [0.84, 1.02], [-0.02, 1.02]],
    eng: [[0.300, 0.70, 0.450, 1.00]],
    tail: [[0.78, 0.55], [0.84, -0.02], [1.02, -0.02], [1.02, 0.42], [0.90, 0.55]],
  },
  il96: {
    // Source art already has gear down — reuse as grounded pose for showroom.
    src: "img/liveries/il96.png",
    srcGnd: "img/liveries/il96.png",
    win: [0.12, 0.48, 0.78, 0.58],
    belly: [[-0.02, 0.80], [0.86, 0.80], [0.86, 1.02], [-0.02, 1.02]],
    eng: [[0.285, 0.68, 0.415, 0.96], [0.420, 0.66, 0.555, 0.97]],
    tail: [[0.80, 0.58], [0.875, -0.02], [1.02, -0.02], [1.02, 0.36], [0.91, 0.58]],
  },
  beluga: {
    src: "img/liveries/beluga.png",
    // no cabin window strip — the whale freighter has none to blank out
    belly: [[-0.02, 0.78], [0.86, 0.78], [0.86, 1.02], [-0.02, 1.02]],
    eng: [[0.300, 0.68, 0.470, 0.98]],
    tail: [[0.78, 0.48], [0.84, -0.02], [1.02, -0.02], [1.02, 0.38], [0.90, 0.48]],
  },
  an225: {
    src: "img/liveries/an225.png",
    // factory-only — no paint regions needed
  },
};

// box [x0,y0,x1,y1] -> octagon polygon (corners cut 25% of the short side)
function _lartOct(b) {
  const [x0, y0, x1, y1] = b;
  const k = Math.min(x1 - x0, y1 - y0) * 0.25;
  return [
    [x0 + k, y0], [x1 - k, y0], [x1, y0 + k], [x1, y1 - k],
    [x1 - k, y1], [x0 + k, y1], [x0, y1 - k], [x0, y0 + k],
  ];
}

// aircraft type id -> template
const LIVERY_TPL_MAP = {
  // Embraero E-Jets + Lineage (shared E-Jet profile)
  e175: "ejet", e190e2: "ejet", e195e2: "ejet", lin1000: "ejet",
  // generic twin-engine airliners (types without a dedicated profile)
  b763: "twin", b764: "twin", b731: "twin",
  b763f: "twin",
  // dedicated renders: A320 family (A318 has its own), A220
  a320: "a320r", a320n: "a320r", a321n: "a320r", a21x: "a320r",
  a318: "a318r",
  a220: "a220r",
  // 737NG family (700/800 + BCF freighter)
  b737: "b737ng", b738: "b737ng", b738f: "b737ng", b717: "b737ng",
  // 737 MAX
  b38m: "b38m",
  // A330 family + A300/A310
  a332: "a330", a333: "a330", a339: "a330", a332f: "a330",
  a300: "a330", a310: "a330", a310f: "a330",
  // 757
  b752: "b757",
  // 777 family
  b77w: "b777", b779: "b777", b77f: "b777", b77l: "b777",
  // A350 family
  a359: "a350", a35k: "a350", a35u: "a350", a35f: "a350",
  // 787 family (dedicated side-profile)
  b788: "b787", b789: "b787", b7810: "b787",
  // A340 family
  a343: "a340", a346: "a340",
  // rear-engine regional jets
  crj7: "crj7", crj9: "crj9",
  // DC-9 / MD-88 family
  dc9: "dc9r", md88: "dc9r",
  // turboprops
  atr42: "atr", atr72: "atr", q400: "q400", l188: "l188",
  dhc6: "dhc6",
  // rest of the light fleet (+ small bizjets)
  c208: "c208", c408: "light", ka350: "light", b1900: "b1900",
  ph300: "ph300", citx: "citx", g650: "light",
  a220c: "a220r", bbj737: "b737ng", a343c: "a340", bbj787: "b787",
  // dedicated side-profile renders
  b146: "b146", s340: "s340",
  // trijets — L-1011 keeps generic tri; MD-11/DC-10 share MD-11 profile
  l1011: "tri",
  dc10: "md11", md11: "md11", md11f: "md11",
  // 747 family
  b74sp: "b747", b741: "b747", b744: "b747", b74d: "b747", b748: "b747", b748f: "b747",
  // A380
  a388: "a380",
  // MC-21
  mc214: "mc21",
  // Il-96 family
  il96: "il96", il964: "il96",
  // BelugaXL (Aerobus Orca)
  blgxl: "beluga",
  // An-225 — factory paint only
  an225: "an225",
  // classic quadjets
  dc8: "dc8",
  b707: "b707",
  // no template (SVG fallback): conc, an124
};

// types whose paint can never be changed
const NO_PAINT_TYPES = { an225: true };

function liveryTplKey(t) {
  return LIVERY_TPL_MAP[t.id] || null;
}

/* Factory / house liveries for special types (shown in shop + applied on delivery). */
const HOUSE_LIVERIES = {
  // Aerobus Orca — white whale, black tail & engines (house colours)
  blgxl: { body: "#f4f7fb", belly: "#d5dce6", tail: "#111418", eng: "#111418" },
};

/* Tail logos players can stamp on the fin in Configure → Livery. */
const TAIL_LOGOS = [
  { id: "", name: "None" },
  { id: "globe",   name: "Globe",   src: "img/liveries/logos/globe.png" },
  { id: "maple",   name: "Maple",   src: "img/liveries/logos/maple.png" },
  { id: "heart",   name: "Heart",   src: "img/liveries/logos/heart.png" },
  { id: "jade",    name: "Jade",    src: "img/liveries/logos/jade.png" },
  { id: "star",    name: "Star",    src: "img/liveries/logos/star.png" },
  { id: "orbit",   name: "Orbit",   src: "img/liveries/logos/orbit.png" },
  { id: "chevron", name: "Chevron", src: "img/liveries/logos/chevron.png" },
  { id: "wings",   name: "Wings",   src: "img/liveries/logos/wings.png" },
  { id: "swoosh",  name: "Swoosh",  src: "img/liveries/logos/swoosh.png" },
  { id: "sun",     name: "Sun",     src: "img/liveries/logos/sun.png" },
  { id: "bars",    name: "Bars",    src: "img/liveries/logos/bars.png" },
];

const _logoImgs = {};
function _logoImg(id) {
  if (!id) return null;
  let img = _logoImgs[id];
  if (!img) {
    const def = TAIL_LOGOS.find(x => x.id === id);
    if (!def || !def.src) return null;
    img = new Image();
    img.src = def.src;
    _logoImgs[id] = img;
  }
  return img;
}

function _tailLogoPlacement(tpl, W, H) {
  // Size the crest from the tail polygon so it fills most of the fin,
  // then clip-draw so nothing spills past the stabilizer.
  if (!tpl.tail || tpl.tail.length < 3) {
    const s = 0.18 * Math.min(W, H);
    return { cx: 0.90 * W, cy: 0.28 * H, s, pts: null };
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of tpl.tail) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const bw = Math.max(8, (x1 - x0) * W);
  const bh = Math.max(8, (y1 - y0) * H);
  // leave margin so swept leading edges don't clip corners
  const s = Math.min(bw, bh) * 0.52;
  // a touch forward (left) and mid-height on the fin
  const cx = (x0 * 0.48 + x1 * 0.52) * W;
  const cy = (y0 + (y1 - y0) * 0.48) * H;
  return { cx, cy, s, pts: tpl.tail };
}

/* Fictional carriers for shop / used-market demo paint.
   Keep schemes clean (no brown/sepia bodies) so multiply over the
   white templates stays crisp. Each type picks one stably. */
const SHOP_BRAND_LIVERIES = [
  // ---- the five worldwide carriers ----
  { name: "Global Air",            body: "#f4f7fb", belly: "#c5d0de", tail: "#1a3a6b", eng: "#d8e0ea" },
  { name: "Apex World Airways",    body: "#f7f8fa", belly: "#c8d0d8", tail: "#9b1c2e", eng: "#e2e6ea" },
  { name: "Horizon International", body: "#f2faf9", belly: "#c5ddd9", tail: "#0d7a7a", eng: "#d4ebe8" },
  { name: "Atlas Skylines",        body: "#f7f8fa", belly: "#c9ced4", tail: "#e85d04", eng: "#e4e7eb" },
  { name: "Meridian Airways",      body: "#f7f4fb", belly: "#d4cce0", tail: "#5b2c8a", eng: "#e6dff0" },
  // ---- extra house schemes for catalog variety ----
  { name: "Nordic Link",           body: "#eef4fb", belly: "#b4c6d8", tail: "#2c5aa0", eng: "#2c5aa0" },
  { name: "Pacific Rim Air",       body: "#f7fafc", belly: "#c5d0de", tail: "#c45c26", eng: "#e8edf2" },
  { name: "Sahara Express",        body: "#fafbfc", belly: "#d0d5dc", tail: "#c9a227", eng: "#e8e6d8" },
  { name: "Alpine Jet",            body: "#eef7f3", belly: "#b5d4c8", tail: "#1b5e4a", eng: "#1b5e4a" },
  { name: "Redline Airways",       body: "#faf7f7", belly: "#d8c8c8", tail: "#c41e3a", eng: "#c41e3a" },
  { name: "Cobalt Charter",        body: "#f4f7fb", belly: "#b8c6d8", tail: "#1e3a8a", eng: "#1e3a8a" },
  { name: "Sunrise Air",           body: "#fafbfc", belly: "#d0d5dc", tail: "#ff8c42", eng: "#e8edf2" },
  { name: "Polar Route",           body: "#f2f5f8", belly: "#b0bcc8", tail: "#334155", eng: "#94a3b8" },
  { name: "Jade Pacific",          body: "#f3faf6", belly: "#b5d4c4", tail: "#0f766e", eng: "#d1fae5" },
  { name: "Skyline Express",       body: "#f5f8fc", belly: "#c0cad6", tail: "#2563eb", eng: "#93c5fd" },
];

function _shopBrandHash(typeId) {
  let h = 2166136261;
  const s = String(typeId || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function _mixHex(hex, toward, t) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  const n = /^#?([0-9a-f]{6})$/i.exec(String(toward || "#808890").trim());
  if (!m || !n) return hex;
  const a = parseInt(m[1], 16), b = parseInt(n[1], 16);
  const ch = (s, d) => Math.round((((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t));
  const r = ch(16, 16), g = ch(8, 8), bl = ch(0, 0);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/** Stable shop livery for a type. `used` mutes colors for the second-hand ramp. */
function shopLiveryFor(typeId, used) {
  // factory-only types stay untinted white so the photo shows through
  if (NO_PAINT_TYPES[typeId]) {
    return { body: "#ffffff", belly: "#ffffff", tail: "#ffffff", eng: "#ffffff" };
  }
  const house = HOUSE_LIVERIES[typeId];
  const brand = house || SHOP_BRAND_LIVERIES[_shopBrandHash(typeId) % SHOP_BRAND_LIVERIES.length];
  const liv = { body: brand.body, belly: brand.belly, tail: brand.tail, eng: brand.eng };
  if (used) {
    const worn = "#8a9098";
    liv.body = _mixHex(liv.body, worn, 0.22);
    liv.belly = _mixHex(liv.belly, worn, 0.28);
    liv.tail = _mixHex(liv.tail, worn, 0.18);
    liv.eng = _mixHex(liv.eng, worn, 0.25);
  }
  return liv;
}

/** Types that always use the bush / wilderness marketplace backdrop. */
const SHOP_BUSH_TYPES = { c208: true, dhc6: true };

/** Marketplace card backdrop + landing-gear pose.
    Sky = gear up. Showroom / bush = gear DOWN only (never gear-up on the floor).
    Types without a grounded template always use sky. C208 / Twin Otter → bush.
    Gear-down-only art (srcGnd === src) stays in the showroom. */
function shopDisplayFor(typeId, used) {
  const t = typeof aircraftById !== "undefined" ? aircraftById[typeId] : null;
  const key = t ? liveryTplKey(t) : null;
  const tpl = key ? LIVERY_TEMPLATES[key] : null;
  const hasGnd = !!(tpl && tpl.srcGnd);
  if (SHOP_BUSH_TYPES[typeId]) {
    return { bg: "bush", pose: hasGnd ? "gnd" : "up" };
  }
  // No gear-down art → sky only (keeps landing gear from floating in a showroom).
  if (!hasGnd) return { bg: "sky", pose: "up" };
  // Template is gear-down only — keep it on the showroom floor.
  if (tpl.srcGnd === tpl.src) {
    return { bg: "showroom", pose: "gnd" };
  }
  const mode = _shopBrandHash(String(typeId) + (used ? ":u" : ":n")) % 3;
  if (mode === 0) return { bg: "sky", pose: "up" };
  return { bg: "showroom", pose: "gnd" };
}

const _lartImgs = {};
function _lartImg(key, pose) {
  const cacheKey = pose === "gnd" ? key + ":gnd" : key;
  let img = _lartImgs[cacheKey];
  if (!img) {
    const tpl = LIVERY_TEMPLATES[key];
    img = new Image();
    img.src = (pose === "gnd" && tpl.srcGnd) ? tpl.srcGnd : tpl.src;
    _lartImgs[cacheKey] = img;
  }
  return img;
}

/* Returns HTML for a tintable canvas preview, or null if this type
   has no photo template (caller falls back to planeArtSVG).
   pose: "up" (in-flight) or "gnd" (gear down) when a grounded src exists. */
function liveryArtHTML(t, livery, cargo, pose) {
  const key = liveryTplKey(t);
  if (!key) return null;
  const p = pose === "gnd" && LIVERY_TEMPLATES[key].srcGnd ? "gnd" : "up";
  const payload = esc(JSON.stringify({ tpl: key, liv: livery || {}, cargo: !!cargo, pose: p }));
  return `<canvas class="lart-canvas" data-lart="${payload}"></canvas>`;
}

function _lartPath(ctx, pts, W, H, holes) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * W, pts[i][1] * H);
  ctx.closePath();
  // subpaths that get cut out via even-odd fill (e.g. engine nacelles)
  if (holes) for (const hole of holes) {
    ctx.moveTo(hole[0][0] * W, hole[0][1] * H);
    for (let i = 1; i < hole.length; i++) ctx.lineTo(hole[i][0] * W, hole[i][1] * H);
    ctx.closePath();
  }
}

function _isWhite(c) {
  if (!c) return true;
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return false;
  const v = parseInt(m[1], 16);
  return ((v >> 16) & 255) > 246 && ((v >> 8) & 255) > 246 && (v & 255) > 246;
}

function _paintLart(cv) {
  let d;
  try { d = JSON.parse(cv.dataset.lart); } catch (e) { return; }
  const tpl = LIVERY_TEMPLATES[d.tpl];
  if (!tpl) return;
  const pose = d.pose === "gnd" && tpl.srcGnd ? "gnd" : "up";
  const img = _lartImg(d.tpl, pose);
  if (!img.complete || !img.naturalWidth) {
    img.addEventListener("load", () => _paintLart(cv), { once: true });
    return;
  }
  const W = img.naturalWidth, H = img.naturalHeight;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0);

  const clip = () => {  // re-clip to the plane silhouette
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  };

  // freighters fly without cabin windows — blank the cabin strip only,
  // never the nose/cockpit (win bands sometimes start too far forward).
  // Gear-down crops often shift the strip; prefer winGnd when posing on the ground.
  if (d.cargo && (tpl.win || tpl.winGnd)) {
    let [x0, y0, x1, y1] = (pose === "gnd" && tpl.winGnd) ? tpl.winGnd : (tpl.win || tpl.winGnd);
    // Keep the cockpit (far nose) but don't skip the forward cabin windows.
    x0 = Math.max(x0, 0.105);
    if (x1 > x0 && y1 > y0) {
      ctx.fillStyle = "#f2f4f7";
      ctx.fillRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H);
      clip();
    }
  }

  const liv = d.liv || {};
  // Single opaque paint layer: later parts overwrite earlier ones, then one
  // multiply pass tints the template. Every pixel belongs to a part, so
  // part borders are exact — no unpainted boxes around the engines.
  if (!(_isWhite(liv.body) && _isWhite(liv.belly) && _isWhite(liv.eng) && _isWhite(liv.tail))) {
    const layer = document.createElement("canvas");
    layer.width = W; layer.height = H;
    const lctx = layer.getContext("2d");
    lctx.fillStyle = liv.body || "#ffffff";
    lctx.fillRect(0, 0, W, H);
    const part = (pts, color) => {
      lctx.fillStyle = color || "#ffffff";
      _lartPath(lctx, pts, W, H);
      lctx.fill();
    };
    if (tpl.belly) part(tpl.belly, liv.belly);
    if (tpl.tail) part(tpl.tail, liv.tail);
    if (tpl.eng) for (const box of tpl.eng) part(_lartOct(box), liv.eng);
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(layer, 0, 0);
    clip();
  }

  // optional tail logo / crest — sized to the fin, clipped to the tail polygon
  if (liv.logo) {
    const logo = _logoImg(liv.logo);
    if (!logo) { /* unknown id */ }
    else if (!logo.complete || !logo.naturalWidth) {
      logo.addEventListener("load", () => { delete cv.dataset.painted; _paintLart(cv); }, { once: true });
      return;
    } else {
      const place = _tailLogoPlacement(tpl, W, H);
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      if (place.pts) {
        _lartPath(ctx, place.pts, W, H);
        ctx.clip();
      }
      ctx.drawImage(logo, place.cx - place.s / 2, place.cy - place.s / 2, place.s, place.s);
      ctx.restore();
      clip();
    }
  }

  cv.dataset.painted = "1";
}

function paintLiveryCanvases() {
  document.querySelectorAll("canvas.lart-canvas:not([data-painted])").forEach(_paintLart);
}

// self-contained: repaint whenever new canvases appear in the DOM
if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
  const _lartObs = new MutationObserver(() => {
    if (document.querySelector("canvas.lart-canvas:not([data-painted])")) paintLiveryCanvases();
  });
  if (document.body) _lartObs.observe(document.body, { childList: true, subtree: true });
  else document.addEventListener("DOMContentLoaded", () => _lartObs.observe(document.body, { childList: true, subtree: true }));
}
