// ============================================================
// SkyTycoon — canvas orthographic globe (no dependencies)
// ============================================================

const DEG = Math.PI / 180;

// Faint flavour labels drawn over the globe. [lat, lon, text, kind]
// kind: "sea" (italic, watery), "range" (mountains), "land" (deserts/regions),
// "mark" (man-made). Purely decorative.
const LANDMARKS = [
  [35, 18, "Mediterranean Sea", "sea"],
  [45.5, -83, "Great Lakes", "sea"],
  [15, -75, "Caribbean Sea", "sea"],
  [15, 89, "Bay of Bengal", "sea"],
  [25, -90, "Gulf of Mexico", "sea"],
  [70, 5, "Norwegian Sea", "sea"],
  [46.5, 9.5, "Swiss Alps", "range"],
  [28, 84, "Himalayas", "range"],
  [43, -110, "Rocky Mountains", "range"],
  [-20, -68, "Andes", "range"],
  [23, 13, "Sahara Desert", "land"],
  [-25, 134, "Outback", "land"],
  [43, 104, "Gobi Desert", "land"],
  [-3, -62, "Amazon", "land"],
  [62, 100, "Siberia", "land"],
  [40.4, 116.6, "Great Wall of China", "mark"],
  [26, 30, "Nile Valley", "mark"],
];

const LANDMARK_STYLE = {
  sea:   { color: "120,180,235", italic: true },
  range: { color: "225,232,240", italic: false },
  land:  { color: "225,205,150", italic: true },
  mark:  { color: "240,215,150", italic: false },
};

class Globe {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.rotLon = -60 * DEG;   // yaw
    this.tilt = 18 * DEG;      // pitch
    this.zoom = 1;
    this.dragging = false;
    this.lastX = 0; this.lastY = 0;
    this.hoverAirport = null;
    this.onAirportClick = null;
    this._airportScreen = [];  // projected airport positions for hit tests

    this._ptrs = new Map();   // active pointers for pinch-zoom (touch / stylus)
    this._pinchDist = 0;

    canvas.addEventListener("pointerdown", (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragging = true; this.moved = false;
      this._downX = e.clientX; this._downY = e.clientY;
      this._vLon = 0; this._vTilt = 0;       // kill any spin momentum
      this.lastX = e.clientX; this.lastY = e.clientY;
      // Refresh hover under the finger immediately (touch often skips pointermove).
      this._refreshHoverAt(this.mouseX, this.mouseY);
      if (this._ptrs.size === 2) {
        const pts = [...this._ptrs.values()];
        this._pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      if (this._ptrs.has(e.pointerId)) {
        this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      // Two-finger pinch → zoom (phones / iPads have no mouse wheel)
      if (this._ptrs.size >= 2) {
        const pts = [...this._ptrs.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this._pinchDist > 0 && dist > 0) {
          const scale = dist / this._pinchDist;
          if (Math.abs(scale - 1) > 0.002) {
            this.zoom = Math.max(0.65, Math.min(22, this.zoom * scale));
            this.moved = true;
            this._zoomBusyUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + 160;
            this._earthKey = "";
          }
        }
        this._pinchDist = dist;
        this.lastX = e.clientX; this.lastY = e.clientY;
        return;
      }
      if (this.dragging) {
        const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
        // Fingers jitter more than a mouse — use a larger slop before treating as drag.
        const slop = this._touchHit() ? 14 : 3;
        const fromDown = Math.hypot(e.clientX - (this._downX || e.clientX), e.clientY - (this._downY || e.clientY));
        if (fromDown > slop || Math.abs(dx) + Math.abs(dy) > slop) this.moved = true;
        if (this.moved) {
          const dLon = dx / (this.radius() * 1.1);
          const dTilt = dy / (this.radius() * 1.1);
          this.rotLon += dLon;
          this.tilt = Math.max(-1.55, Math.min(1.55, this.tilt + dTilt));
          // exponential moving average of the drag velocity → release momentum
          this._vLon = 0.7 * dLon + 0.3 * (this._vLon || 0);
          this._vTilt = 0.7 * dTilt + 0.3 * (this._vTilt || 0);
        }
        this.lastX = e.clientX; this.lastY = e.clientY;
      } else {
        this._refreshHoverAt(this.mouseX, this.mouseY);
      }
    });
    const endPtr = (e) => {
      this._ptrs.delete(e.pointerId);
      if (this._ptrs.size < 2) this._pinchDist = 0;
      if (this._ptrs.size === 0) this.dragging = false;
    };
    canvas.addEventListener("pointerup", (e) => {
      const wasPinch = this._ptrs.size >= 2 || this._pinchDist > 0;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.mouseX = x; this.mouseY = y;
      endPtr(e);
      if (this._ptrs.size > 0) return;       // still holding another finger
      this.dragging = false;
      if (this.moved || wasPinch) return;
      // Hit-test at the tap point — don't rely on last-frame hover (broken on touch).
      const hit = this.hitTestAt(x, y);
      if (hit.plane && this.onPlaneClick) this.onPlaneClick(hit.plane);
      else if (hit.airport && this.onAirportClick) this.onAirportClick(hit.airport);
    });
    canvas.addEventListener("pointercancel", endPtr);
    canvas.addEventListener("pointerleave", () => {
      if (!this.dragging) {
        this.hoverAirport = null;
        this.hoverPlane = null;
      }
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      // Normalize wheel / trackpad deltas so zoom speed feels even.
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;          // lines → px
      else if (e.deltaMode === 2) dy *= 120;    // pages → px
      // Stronger steps when already zoomed in so zooming back out isn't a slog.
      const sens = 0.00155 * (1 + 0.55 * Math.log2(Math.max(1, this.zoom)));
      this.zoom *= Math.exp(-dy * sens);
      // High zoom separates metro clusters (JFK / LGA / EWR, etc.)
      this.zoom = Math.max(0.65, Math.min(22, this.zoom));
      // Soft-raster while the wheel is busy; sharpen after it settles.
      this._zoomBusyUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + 160;
      this._earthKey = "";
    }, { passive: false });

    // WASD / arrows — same orbit as mouse drag (W/↑ = drag up, etc.)
    this._keys = new Set();
    const panCodes = {
      KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1,
      ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
    };
    const typingFocus = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    window.addEventListener("keydown", (e) => {
      if (!panCodes[e.code] || typingFocus()) return;
      e.preventDefault();
      if (!this._keys.has(e.code)) {
        this._keys.add(e.code);
        this._vLon = 0; this._vTilt = 0;   // kill spin momentum, same as grab
      }
    });
    window.addEventListener("keyup", (e) => { this._keys.delete(e.code); });
    window.addEventListener("blur", () => { this._keys.clear(); });

    this._loadEarthTexture();
  }

  // Apply held WASD / arrow keys as if the mouse were dragging that way.
  _applyKeyPan() {
    if (!this._keys || !this._keys.size) { this._keyPanning = false; return; }
    const el = document.activeElement;
    if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) {
      this._keyPanning = false;
      return;
    }
    let dx = 0, dy = 0;
    if (this._keys.has("KeyA") || this._keys.has("ArrowLeft")) dx -= 1;
    if (this._keys.has("KeyD") || this._keys.has("ArrowRight")) dx += 1;
    if (this._keys.has("KeyW") || this._keys.has("ArrowUp")) dy -= 1;   // mouse-up
    if (this._keys.has("KeyS") || this._keys.has("ArrowDown")) dy += 1;
    if (!dx && !dy) { this._keyPanning = false; return; }
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    // ~7 px of drag per frame — matches a steady mouse pan at 60 fps
    const px = 7;
    const dLon = (dx * px) / (this.radius() * 1.1);
    const dTilt = (dy * px) / (this.radius() * 1.1);
    this.rotLon += dLon;
    this.tilt = Math.max(-1.55, Math.min(1.55, this.tilt + dTilt));
    this._keyPanning = true;
  }

  // Equirectangular Earth plate → sampled onto the orthographic sphere.
  // Airports stay correct because UVs use the same lat/lon frame as project().
  _loadEarthTexture() {
    const img = new Image();
    const fromData = typeof EARTH_TEX_DATA_URL === "string" && EARTH_TEX_DATA_URL;
    img.onload = () => {
      if (this._ingestEarthImage(img)) {
        console.log("Earth texture ready", this._earthTw + "×" + this._earthTh);
      }
      // Prefer the on-disk 4K plate over http(s); file:// stays on the data-URL pack.
      const http = typeof location !== "undefined" && /^https?:$/i.test(location.protocol);
      if (!http || (this._earthTw >= 4096)) return;
      const hi = new Image();
      hi.onload = () => {
        if (this._ingestEarthImage(hi)) {
          console.log("Earth texture upgraded", this._earthTw + "×" + this._earthTh);
        }
      };
      hi.src = "assets/globe/earth-4k.jpg";
    };
    img.onerror = () => console.warn("Earth texture failed to load");
    // Data-URL pack works on file://; fall back to the sharp jpg next to index.html
    img.src = fromData ? EARTH_TEX_DATA_URL : "assets/globe/earth-4k.jpg";
  }

  _ingestEarthImage(img) {
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ictx = c.getContext("2d", { willReadFrequently: true });
      // The raw satellite plate reads a bit grey in-game — richen it once here
      ictx.filter = "saturate(1.35) contrast(1.05)";
      ictx.drawImage(img, 0, 0);
      ictx.filter = "none";
      this._earthPix = ictx.getImageData(0, 0, c.width, c.height).data;
      this._earthTw = c.width;
      this._earthTh = c.height;
      this._earthKey = "";
      return true;
    } catch (err) {
      // Keep any earlier (data-URL) plate; don't spam if we already have pixels
      if (!this._earthPix) {
        console.warn("Earth texture could not be read — serve the game over http:// (not file://).", err);
      }
      return false;
    }
  }

  // Bilinear sample of the equirectangular plate (u,v in texel space).
  _sampleEarth(u, v) {
    const pix = this._earthPix;
    const tw = this._earthTw, th = this._earthTh;
    // wrap longitude; clamp latitude
    u = ((u % tw) + tw) % tw;
    if (v < 0) v = 0; else if (v > th - 1.001) v = th - 1.001;
    const x0 = u | 0, y0 = v | 0;
    const x1 = (x0 + 1) % tw, y1 = y0 + 1 < th ? y0 + 1 : y0;
    const fx = u - x0, fy = v - y0;
    const i00 = (y0 * tw + x0) * 4, i10 = (y0 * tw + x1) * 4;
    const i01 = (y1 * tw + x0) * 4, i11 = (y1 * tw + x1) * 4;
    const r = pix[i00] * (1 - fx) * (1 - fy) + pix[i10] * fx * (1 - fy)
      + pix[i01] * (1 - fx) * fy + pix[i11] * fx * fy;
    const g = pix[i00 + 1] * (1 - fx) * (1 - fy) + pix[i10 + 1] * fx * (1 - fy)
      + pix[i01 + 1] * (1 - fx) * fy + pix[i11 + 1] * fx * fy;
    const b = pix[i00 + 2] * (1 - fx) * (1 - fy) + pix[i10 + 2] * fx * (1 - fy)
      + pix[i01 + 2] * (1 - fx) * fy + pix[i11 + 2] * fx * fy;
    return [r, g, b];
  }

  // Rasterize in *screen space* so zoomed-in views stay ~1 pixel sharp
  // (old path stretched a 560px sphere over a huge disc → mush).
  drawEarthTex(cx, cy, R) {
    const pix = this._earthPix;
    if (!pix) return false;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    // Soft interaction only while actively moving — tiny residual momentum
    // used to keep the soft path for too long after release.
    const busy = this.dragging
      || this._keyPanning
      || now < (this._zoomBusyUntil || 0)
      || Math.abs(this._vLon || 0) > 0.0012
      || Math.abs(this._vTilt || 0) > 0.0012;
    // Idle = full device pixels. Drag/zoom stays close to screen res so the
    // globe doesn't look mushy (old path was ~380k px → heavy blurry upscale).
    const dpr = busy
      ? Math.min(1.35, this.dpr || 1)
      : Math.min(2, this.dpr || 1);
    const maxPix = busy
      ? (this.zoom >= 3 ? 1600000 : 1200000)
      : (this.zoom >= 3 ? 2800000 : 2200000);
    let bw = Math.max(64, Math.ceil(this.w * dpr));
    let bh = Math.max(64, Math.ceil(this.h * dpr));
    const area = bw * bh;
    if (area > maxPix) {
      const s = Math.sqrt(maxPix / area);
      bw = Math.max(64, Math.ceil(bw * s));
      bh = Math.max(64, Math.ceil(bh * s));
    }

    const key = `${bw}x${bh}|${this.rotLon.toFixed(4)}|${this.tilt.toFixed(4)}|${R.toFixed(1)}`;
    if (this._earthKey !== key || !this._earthBuf) {
      if (!this._earthBuf || this._earthBuf.width !== bw || this._earthBuf.height !== bh) {
        this._earthBuf = document.createElement("canvas");
        this._earthBuf.width = bw;
        this._earthBuf.height = bh;
        this._earthBufCtx = this._earthBuf.getContext("2d", { willReadFrequently: true });
        this._earthOut = this._earthBufCtx.createImageData(bw, bh);
      }
      const out = this._earthOut.data;
      const tw = this._earthTw, th = this._earthTh;
      const cr = this._cr, sr = this._sr, ctl = this._ctl, stl = this._stl;
      const invBw = this.w / bw, invBh = this.h / bh;
      const invR = 1 / R;
      // Only walk the disc's screen AABB — big win when zoomed out.
      const pad = 1;
      const x0s = Math.max(0, Math.floor((cx - R) / invBw) - pad);
      const x1s = Math.min(bw - 1, Math.ceil((cx + R) / invBw) + pad);
      const y0s = Math.max(0, Math.floor((cy - R) / invBh) - pad);
      const y1s = Math.min(bh - 1, Math.ceil((cy + R) / invBh) + pad);

      out.fill(0);

      for (let py = y0s; py <= y1s; py++) {
        const sy = (py + 0.5) * invBh;
        for (let px = x0s; px <= x1s; px++) {
          const sx = (px + 0.5) * invBw;
          const nx = (sx - cx) * invR;
          // Match toScreen(): canvas +Y is down, view-space +Y is up
          const ny = (cy - sy) * invR;
          const rr = nx * nx + ny * ny;
          if (rr > 1) continue;
          const nz = Math.sqrt(1 - rr);

          const y0 = ny * ctl + nz * stl;
          const zr = -ny * stl + nz * ctl;
          const x0 = nx * cr - zr * sr;
          const z0 = nx * sr + zr * cr;

          const lon = Math.atan2(x0, z0);
          const lat = Math.asin(Math.max(-1, Math.min(1, y0)));
          const u = ((lon + Math.PI) / (Math.PI * 2)) * tw;
          const v = ((Math.PI * 0.5 - lat) / Math.PI) * th;

          const [er, eg, eb] = this._sampleEarth(u, v);
          const shade = 0.72 + 0.28 * nz;
          const di = (py * bw + px) * 4;
          out[di]     = er * shade;
          out[di + 1] = eg * shade;
          out[di + 2] = eb * shade;
          out[di + 3] = 255;
        }
      }
      this._earthBufCtx.putImageData(this._earthOut, 0, 0);
      this._earthKey = key;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    // Avoid blurry upscale when the buffer already matches the screen closely.
    const scaleX = this.w / this._earthBuf.width;
    ctx.imageSmoothingEnabled = scaleX > 1.08;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this._earthBuf, 0, 0, this.w, this.h);
    const gloss = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    gloss.addColorStop(0, "rgba(255,255,255,0.14)");
    gloss.addColorStop(0.45, "rgba(255,255,255,0.03)");
    gloss.addColorStop(1, "rgba(0,20,50,0.22)");
    ctx.fillStyle = gloss;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
    return true;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
    }
    this.w = w; this.h = h; this.dpr = dpr;
  }

  radius() { return Math.min(this.w || 600, this.h || 600) * 0.40 * this.zoom; }

  // Coarse pointers (fingers) need bigger airport / plane hit targets.
  _touchHit() {
    try {
      if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) return true;
    } catch (_) {}
    return typeof navigator !== "undefined" && (navigator.maxTouchPoints || 0) > 0;
  }

  planeHitR() { return this._touchHit() ? 40 : 14; }
  airportHitPad() { return this._touchHit() ? 22 : 7; }

  /** Closest plane / airport under a canvas point. Planes win ties (easier dispatch taps). */
  hitTestAt(x, y) {
    let plane = null, planeD = Infinity;
    const planeR = this.planeHitR();
    for (const pl of (this._planeScreen || [])) {
      const d = Math.hypot(x - pl.x, y - pl.y);
      const r = pl.r != null ? pl.r : planeR;
      if (d <= r && d < planeD) { planeD = d; plane = pl.id; }
    }
    let airport = null, airportD = Infinity;
    const pad = this.airportHitPad();
    for (const a of (this._airportScreen || [])) {
      const d = Math.hypot(x - a.x, y - a.y);
      const r = (a.r || 4) + pad;
      if (d <= r && d < airportD) { airportD = d; airport = a.ap; }
    }
    // Prefer a plane unless the airport is clearly closer
    if (plane && airport && airportD + 6 < planeD) plane = null;
    return { plane, airport };
  }

  _refreshHoverAt(x, y) {
    if (x == null || y == null) return;
    const hit = this.hitTestAt(x, y);
    this.hoverPlane = hit.plane;
    this.hoverAirport = hit.airport;
  }

  // Discrete zoom bands stop airports flickering in/out while scrolling.
  lodBand() {
    const z = this.zoom;
    if (z < 0.95) return 1;   // whole globe
    if (z < 1.35) return 2;   // continent
    if (z < 1.85) return 3;   // multi-country
    if (z < 2.5) return 4;
    if (z < 3.5) return 5;
    if (z < 5) return 6;
    if (z < 7) return 7;
    if (z < 11) return 8;     // metro area
    if (z < 18) return 9;     // city cluster (NYC tri-airport, etc.)
    return 10;                // street-level separation
  }

  minMarketSize() {
    const b = this.lodBand();
    if (b >= 6) return 1;     // fully zoomed in — everything
    if (b >= 5) return 2;
    if (b >= 4) return 3;
    if (b >= 3) return 4;
    if (b >= 2) return 5;     // continent view — mid-size markets and up
    return 8;                 // whole-globe view — major hubs only
  }

  // Effective market size for LOD — ocean gateways read as major hubs.
  displaySize(ap) {
    return ap.ocean ? Math.max(ap.size, 8) : ap.size;
  }

  // Player hubs, route endpoints and parked aircraft always stay visible.
  shouldShowAirport(ap, state) {
    if (state) {
      if (state.hub === ap.code) return true;
      if (state.hubs && state.hubs.has(ap.code)) return true;
      if (state.parked && state.parked[ap.code]) return true;
      if (state.routeCodes && state.routeCodes.has(ap.code)) return true;
    }
    return this.displaySize(ap) >= this.minMarketSize();
  }

  shouldLabelAirport(ap, isHub, isOwnedHub) {
    const b = this.lodBand();
    if (isHub || isOwnedHub) return true;
    const sz = this.displaySize(ap);
    if (sz >= 9) return b >= 1;
    if (sz >= 8) return b >= 2;
    if (sz >= 7) return b >= 3;
    if (sz >= 6) return b >= 4;
    if (sz >= 5) return b >= 5;
    if (sz >= 3) return b >= 6;
    return b >= 7;
  }

  // Spin the globe to face an airport and zoom enough to resolve it.
  focusAirport(ap, zoom = 3.2) {
    if (!ap) return;
    this.rotLon = -ap.lon * DEG;
    this.tilt = Math.max(-1.35, Math.min(1.35, ap.lat * DEG * 0.55));
    this.zoom = Math.max(this.zoom, zoom);
    this._vLon = 0;
    this._vTilt = 0;
  }

  // Nudge overlapping airport labels apart at high zoom (metro clusters).
  placeAirportLabel(x, y, rr, placed) {
    let lx = x + rr + 3, ly = y + 3.5;
    if (this.lodBand() < 8) return { lx, ly };
    for (let n = 0; n < 6; n++) {
      let hit = false;
      for (const p of placed) {
        if (Math.hypot(lx - p.x, ly - p.y) < 14) { hit = true; break; }
      }
      if (!hit) break;
      ly += (n % 2 === 0 ? -12 : 12);
      lx += 4;
    }
    placed.push({ x: lx, y: ly });
    return { lx, ly };
  }

  // Is a screen point anywhere near the viewport?
  onScreen(x, y, margin = 40) {
    return x >= -margin && x <= this.w + margin && y >= -margin && y <= this.h + margin;
  }

  // Project an airport via its cached earth-fixed vector.
  projectAp(ap) {
    let v = ap.__vec;
    if (!v) {
      const la = ap.lat * DEG, lo = ap.lon * DEG, cl = Math.cos(la);
      v = ap.__vec = [cl * Math.sin(lo), Math.sin(la), cl * Math.cos(lo)];
    }
    return this.projectVec(v[0], v[1], v[2]);
  }

  // lat/lon (deg) -> {x, y (screen units rel. to center), z (toward viewer)}
  project(lat, lon) {
    const la = lat * DEG, lo = lon * DEG + this.rotLon;
    const cl = Math.cos(la);
    const x0 = cl * Math.sin(lo);
    const y0 = Math.sin(la);
    const z0 = cl * Math.cos(lo);
    const ct = Math.cos(this.tilt), st = Math.sin(this.tilt);
    const y1 = y0 * ct - z0 * st;
    const z1 = y0 * st + z0 * ct;
    return { x: x0, y: y1, z: z1 };
  }

  // Earth-fixed unit vector -> view space using per-frame rotation
  // coefficients (set in render). No trig per point — just multiplies.
  projectVec(x0, y0, z0) {
    const x = x0 * this._cr + z0 * this._sr;
    const zr = z0 * this._cr - x0 * this._sr;
    return { x, y: y0 * this._ctl - zr * this._stl, z: y0 * this._stl + zr * this._ctl };
  }

  // Cache a polygon's earth-fixed vectors on the array itself ([lon,lat] pairs).
  static polyVecs(poly) {
    let v = poly.__vecs;
    if (!v) {
      v = new Float64Array(poly.length * 3);
      for (let i = 0; i < poly.length; i++) {
        const lon = poly[i][0] * DEG, lat = poly[i][1] * DEG;
        const cl = Math.cos(lat);
        v[i * 3] = cl * Math.sin(lon);
        v[i * 3 + 1] = Math.sin(lat);
        v[i * 3 + 2] = cl * Math.cos(lon);
      }
      poly.__vecs = v;
    }
    return v;
  }

  toScreen(p) {
    const R = this.radius();
    return { x: this.w / 2 + p.x * R, y: this.h / 2 - p.y * R };
  }

  // Clamp a back-hemisphere point to the horizon circle
  horizonPoint(p) {
    const m = Math.hypot(p.x, p.y) || 1e-6;
    return { x: p.x / m, y: p.y / m, z: 0 };
  }

  render(state) {
    this.resize();
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.w, this.h);

    this._applyKeyPan();

    // spin momentum after release, easing out
    if (!this.dragging && !this._keyPanning &&
        (Math.abs(this._vLon || 0) > 0.00004 || Math.abs(this._vTilt || 0) > 0.00004)) {
      this.rotLon += this._vLon;
      this.tilt = Math.max(-1.55, Math.min(1.55, this.tilt + this._vTilt));
      this._vLon *= 0.95;
      this._vTilt *= 0.95;
    }

    const cx = this.w / 2, cy = this.h / 2, R = this.radius();

    // per-frame rotation coefficients for projectVec (no trig per point)
    this._sr = Math.sin(this.rotLon); this._cr = Math.cos(this.rotLon);
    this._stl = Math.sin(this.tilt); this._ctl = Math.cos(this.tilt);

    // --- night sky: starfield prerendered once, blitted every frame ---
    if (!this._starCanvas || this._starW !== this.w || this._starH !== this.h) {
      this._starW = this.w; this._starH = this.h;
      this._starCanvas = document.createElement("canvas");
      this._starCanvas.width = Math.max(1, this.w);
      this._starCanvas.height = Math.max(1, this.h);
      const sctx = this._starCanvas.getContext("2d");
      for (let i = 0; i < 230; i++) {
        const a = 0.2 + Math.random() * 0.55;
        sctx.fillStyle = `rgba(215,228,255,${a.toFixed(3)})`;
        sctx.fillRect(Math.random() * this.w, Math.random() * this.h,
          0.4 + Math.random() * 1.3, 0.4 + Math.random() * 1.3);
      }
    }
    ctx.drawImage(this._starCanvas, 0, 0);

    // --- atmosphere glow + ocean sphere (gradients cached per zoom/size) ---
    if (this._gradR !== R || this._gradW !== this.w || this._gradH !== this.h) {
      this._gradR = R; this._gradW = this.w; this._gradH = this.h;
      this._glowGrad = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.25);
      this._glowGrad.addColorStop(0, "rgba(120,190,255,0.28)");
      this._glowGrad.addColorStop(1, "rgba(120,190,255,0)");
      this._oceanGrad = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      this._oceanGrad.addColorStop(0, "#4a9be0");
      this._oceanGrad.addColorStop(0.6, "#2470bd");
      this._oceanGrad.addColorStop(1, "#123f7e");
    }
    ctx.fillStyle = this._glowGrad;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, 7); ctx.fill();

    // Detailed plate is optional; the vector globe remains available by preference.
    const textured = mapStylePref() === "texture" && this.drawEarthTex(cx, cy, R);
    if (!textured) {
      ctx.fillStyle = this._oceanGrad;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      ctx.lineWidth = 1;
      for (let i = 0; i < WORLD.length; i++) {
        if (i === WORLD.length - 1) {
          ctx.fillStyle = "#eef4f6";
          ctx.strokeStyle = "rgba(180,205,220,0.8)";
        } else {
          ctx.fillStyle = "#63a03c";
          ctx.strokeStyle = "rgba(52,96,38,0.75)";
        }
        this.drawPolygon(WORLD[i], ctx);
      }
      if (typeof LAKES !== "undefined") {
        ctx.fillStyle = "#2470bd";
        ctx.strokeStyle = "rgba(20,60,110,0.5)";
        for (const lake of LAKES) this.drawPolygon(lake, ctx);
      }
    }

    // --- graticule (fainter over the photo plate) ---
    ctx.strokeStyle = textured ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    this.drawGrid();

    // --- faint geographic labels over notable landmarks ---
    this.drawLandmarks();

    // --- routes ---
    if (state) {
      for (const r of state.routeList) {
        this.drawArc(r.from, r.to, r.highlight);
      }
    }

    // --- active weather systems (typhoons spin; other storms flash) ---
    if (state && state.weather && state.weather.length) {
      const wt = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
      for (const wx of state.weather) {
        const wp = this.project(wx.lat, wx.lon);
        if (wp.z <= 0.02) continue;
        const ws = this.toScreen(wp);
        const wScale = 0.6 + 0.4 * wp.z;   // shrink toward the limb
        if (wx.typhoon) this.drawTyphoon(ws.x, ws.y, R * 0.16 * wScale, wt);
        else this.drawStormCloud(ws.x, ws.y, R * 0.10 * wScale, wt);
      }
    }

    // Airports vs parked planes: default puts planes on top so gate aircraft
    // stay clickable; Company toggle can put airport dots back on top.
    this._planeScreen = [];
    this._airportScreen = [];
    const airportsOnTop = typeof airportsOnTopPref === "function" && airportsOnTopPref();
    if (airportsOnTop) {
      this.drawParkedFleet(state);
      this.drawAirportDots(state);
    } else {
      this.drawAirportDots(state);
      this.drawParkedFleet(state);
    }

    // --- planes in flight (clickable, always above ground markers) ---
    if (state) {
      for (const pl of state.planesInFlight) {
        const s = this.drawPlane(pl.from, pl.to, pl.prog);
        if (s && pl.id) {
          this._planeScreen.push({ id: pl.id, x: s.x, y: s.y, r: this.planeHitR() });
        }
      }
    }
    if (this.mouseX != null) this._refreshHoverAt(this.mouseX, this.mouseY);
    const hoverPlane = this.hoverPlane;
    const hover = this.hoverAirport;
    this.canvas.style.cursor = (hoverPlane || hover)
      ? "pointer"
      : (this.dragging ? "grabbing" : "grab");

    // --- hover tooltip ---
    if (hover && !hoverPlane) {
      const p = this.toScreen(this.project(hover.lat, hover.lon));
      const label = `${hover.code} · ${hover.city}`;
      ctx.font = "600 12px system-ui, sans-serif";
      const tw = ctx.measureText(label).width + 16;
      let tx = Math.min(this.w - tw - 6, p.x + 12), ty = Math.max(20, p.y - 14);
      ctx.fillStyle = "rgba(10,22,40,0.92)";
      ctx.strokeStyle = "rgba(127,212,255,0.5)";
      ctx.beginPath(); ctx.roundRect(tx, ty - 15, tw, 22, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#dcecfa";
      ctx.fillText(label, tx + 8, ty);
    }

    ctx.restore();
  }

  drawAirportDots(state) {
    const ctx = this.ctx;
    const labelPlaced = [];
    const band = this.lodBand();
    for (const ap of AIRPORTS) {
      const p = this.projectAp(ap);
      if (p.z <= 0.02) continue;
      const isHub = state && state.hub === ap.code;
      const isOwnedHub = state && state.hubs && state.hubs.has(ap.code);
      if (!this.shouldShowAirport(ap, state)) continue;
      const s = this.toScreen(p);
      if (!this.onScreen(s.x, s.y)) continue;
      const hasRoute = state && state.routeCodes && state.routeCodes.has(ap.code);
      const dSize = this.displaySize(ap);
      const zoomShrink = band >= 9 ? 0.72 : band >= 8 ? 0.85 : 1;
      const rr = (isHub ? 6 : isOwnedHub ? 5 : (2 + dSize * 0.28)) * zoomShrink;
      this._airportScreen.push({ ap, x: s.x, y: s.y, r: rr });

      // Hover is resolved once after all markers via hitTestAt (touch-safe).

      ctx.beginPath();
      ctx.arc(s.x, s.y, rr, 0, 7);
      const glow = band >= 3 && band < 9;
      if (isHub || isOwnedHub) {
        ctx.fillStyle = "#ffc94d";
        if (glow) { ctx.shadowColor = "rgba(255,180,40,0.9)"; ctx.shadowBlur = isHub ? 12 : 8; }
        ctx.fill();
        if (glow) ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (ap.ocean && !hasRoute) {
        ctx.fillStyle = "rgba(255,255,255,0.97)";
        if (glow) { ctx.shadowColor = "rgba(160,220,255,0.85)"; ctx.shadowBlur = 10; }
        ctx.fill();
        if (glow) ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(90,190,255,0.95)"; ctx.lineWidth = 1.6; ctx.stroke();
      } else {
        ctx.fillStyle = hasRoute ? "#ffd24d" : "rgba(255,255,255,0.92)";
        ctx.fill();
        ctx.strokeStyle = "rgba(15,40,75,0.7)"; ctx.lineWidth = 1; ctx.stroke();
      }
      if (this.shouldLabelAirport(ap, isHub, isOwnedHub)) {
        const { lx, ly } = this.placeAirportLabel(s.x, s.y, rr, labelPlaced);
        const text = band >= 9 ? `${ap.code} · ${ap.city}` : ap.code;
        ctx.font = band >= 9 ? "600 11px system-ui, sans-serif" : "600 10px system-ui, sans-serif";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeStyle = "rgba(10,30,60,0.75)";
        ctx.strokeText(text, lx, ly);
        ctx.fillStyle = (isHub || isOwnedHub) ? "#ffe08a" : "#ffffff";
        ctx.fillText(text, lx, ly);
      }
    }
  }

  drawParkedFleet(state) {
    if (!state || !state.parked) return;
    const ctx = this.ctx;
    ctx.font = "600 9px system-ui, sans-serif";
    for (const code in state.parked) {
      const ap = airportByCode[code];
      if (!ap) continue;
      const p = this.projectAp(ap);
      if (p.z <= 0.02) continue;
      const s = this.toScreen(p);
      if (!this.onScreen(s.x, s.y)) continue;
      const ids = state.parked[code];
      const list = Array.isArray(ids) ? ids : [];
      const n = list.length || (+ids || 0);
      if (!n) continue;
      const drawOne = (x, y, id, hitR) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1.25, 1.25);
        ctx.fillStyle = "rgba(235,242,250,0.92)";
        ctx.strokeStyle = "rgba(15,40,75,0.65)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(7, 0); ctx.lineTo(1.5, -1.4); ctx.lineTo(-1, -5.5); ctx.lineTo(-2.6, -5.2);
        ctx.lineTo(-1.6, -1.2); ctx.lineTo(-4.5, -1); ctx.lineTo(-6, -3); ctx.lineTo(-7, -2.6);
        ctx.lineTo(-5.8, 0); ctx.lineTo(-7, 2.6); ctx.lineTo(-6, 3); ctx.lineTo(-4.5, 1);
        ctx.lineTo(-1.6, 1.2); ctx.lineTo(-2.6, 5.2); ctx.lineTo(-1, 5.5); ctx.lineTo(1.5, 1.4);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        if (id) this._planeScreen.push({ id, x, y, r: hitR != null ? hitR : this.planeHitR() });
      };
      if (list.length) {
        // Compact apron stack — slight pile at the airport, not a long taxi line
        // that can look like aircraft sitting on someone else's route.
        const show = list.slice(0, 4);
        const stackR = this._touchHit() ? 48 : 18;
        // One fat apron target first (top of stack) so a near-miss still opens a plane.
        this._planeScreen.push({ id: show[0], x: s.x, y: s.y + 12, r: stackR });
        show.forEach((id, i) => {
          const ox = ((i % 2) * 2 - 0.5) * 3;
          const oy = 9 + i * 3.2;
          drawOne(s.x + ox, s.y + oy, id, this.planeHitR());
        });
        if (n > show.length) {
          ctx.lineWidth = 3;
          ctx.lineJoin = "round";
          ctx.miterLimit = 2;
          ctx.strokeStyle = "rgba(10,30,60,0.75)";
          ctx.strokeText("+" + (n - show.length), s.x + 10, s.y + 9 + show.length * 3.2);
          ctx.fillStyle = "rgba(235,242,250,0.9)";
          ctx.fillText("+" + (n - show.length), s.x + 10, s.y + 9 + show.length * 3.2);
        }
      } else {
        drawOne(s.x, s.y + 10, null);
        if (n > 1) {
          ctx.lineWidth = 3;
          ctx.lineJoin = "round";
          ctx.miterLimit = 2;
          ctx.strokeStyle = "rgba(10,30,60,0.75)";
          ctx.strokeText("x" + n, s.x + 8, s.y + 14);
          ctx.fillStyle = "rgba(235,242,250,0.9)";
          ctx.fillText("x" + n, s.x + 8, s.y + 14);
        }
      }
    }
  }

  drawLandmarks() {
    const ctx = this.ctx;
    const R = this.radius();
    const size = Math.max(8, Math.min(14, R * 0.028));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Round joins — sharp miter spikes on M / X / A look like black triangles.
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    for (const [lat, lon, text, kind] of LANDMARKS) {
      const p = this.project(lat, lon);
      if (p.z <= 0.22) continue;                       // hide near the limb / far side
      const s = this.toScreen(p);
      const st = LANDMARK_STYLE[kind] || LANDMARK_STYLE.land;
      const fade = Math.min(1, (p.z - 0.22) / 0.35);   // ease in away from the edge
      const alpha = (0.34 * fade).toFixed(2);
      ctx.font = `${st.italic ? "italic " : ""}600 ${size}px system-ui, sans-serif`;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = `rgba(10,25,45,${(0.35 * fade).toFixed(2)})`;
      ctx.strokeText(text, s.x, s.y);
      ctx.fillStyle = `rgba(${st.color},${alpha})`;
      ctx.fillText(text, s.x, s.y);
    }
    // restore text defaults so later labels/tooltips aren't centred
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // Lat/lon grid drawn from vectors precomputed once.
  drawGrid() {
    if (!this._gridLines) {
      this._gridLines = [];
      for (let lat = -60; lat <= 60; lat += 30) {
        const pts = [];
        for (let lon = -180; lon <= 180; lon += 5) pts.push([lon, lat]);
        this._gridLines.push(Globe.polyVecs(pts));
      }
      for (let lon = -180; lon < 180; lon += 30) {
        const pts = [];
        for (let lat = -85; lat <= 85; lat += 5) pts.push([lon, lat]);
        this._gridLines.push(Globe.polyVecs(pts));
      }
    }
    const ctx = this.ctx;
    ctx.beginPath();
    for (const v of this._gridLines) {
      let pen = false;
      for (let i = 0; i < v.length; i += 3) {
        const p = this.projectVec(v[i], v[i + 1], v[i + 2]);
        if (p.z > 0) {
          const s = this.toScreen(p);
          pen ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
          pen = true;
        } else pen = false;
      }
    }
    ctx.stroke();
  }

  // Draw a polygon clipped to the visible hemisphere. Hidden runs are
  // replaced by an arc along the horizon between the exact exit and entry
  // crossings — naively clamping each hidden vertex can jump to the wrong
  // side of the disc and fill giant false triangles.
  drawPolygon(poly, ctx, mode) {
    ctx = ctx || this.ctx;
    const n = poly.length;
    const v = Globe.polyVecs(poly);
    const pts = new Array(n);
    let s0 = -1;
    for (let i = 0; i < n; i++) {
      const p = this.projectVec(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
      pts[i] = p;
      if (s0 < 0 && p.z > 0) s0 = i;
    }
    if (s0 < 0) return;                       // fully hidden

    const path = [];
    const lineToP = (p) => { path.push(this.toScreen(p)); };
    // point where the edge a→b pierces the horizon (z = 0), on the circle
    const crossPoint = (a, b) => {
      const t = a.z / (a.z - b.z);
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const m = Math.hypot(x, y) || 1e-6;
      return { x: x / m, y: y / m, z: 0 };
    };
    // walk the horizon the short way between two angles
    const arcAlong = (from, to) => {
      let d = to - from;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.15));
      for (let k = 1; k <= steps; k++) {
        const ang = from + d * k / steps;
        lineToP({ x: Math.cos(ang), y: Math.sin(ang), z: 0 });
      }
    };

    let exitAng = null;
    for (let i = 0; i < n; i++) {
      const a = pts[(s0 + i) % n];
      const b = pts[(s0 + i + 1) % n];
      if (a.z > 0) {
        lineToP(a);
        if (b.z <= 0) {                       // leaving the visible side
          const c = crossPoint(a, b);
          lineToP(c);
          exitAng = Math.atan2(c.y, c.x);
        }
      } else if (b.z > 0) {                   // re-entering
        const c = crossPoint(a, b);
        if (exitAng != null) {
          arcAlong(exitAng, Math.atan2(c.y, c.x));
          exitAng = null;
        }
        lineToP(c);
      }
    }
    if (path.length < 3) return;

    // skip polygons entirely outside the viewport (big win when zoomed in)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of path) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    if (maxX < -50 || minX > this.w + 50 || maxY < -50 || minY > this.h + 50) return;
    if (maxX - minX < 1.5 && maxY - minY < 1.5) return;   // sub-pixel speck

    // draw with midpoint quadratic smoothing — rounds off the hand-drawn
    // coastline corners so land looks more natural
    ctx.beginPath();
    const m = path.length;
    const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    let prev = mid(path[m - 1], path[0]);
    ctx.moveTo(prev.x, prev.y);
    for (let i = 0; i < m; i++) {
      const p = path[i], nx = path[(i + 1) % m];
      const md = mid(p, nx);
      ctx.quadraticCurveTo(p.x, p.y, md.x, md.y);
    }
    ctx.closePath();
    if (mode !== "stroke") ctx.fill();
    if (mode !== "fill") ctx.stroke();
  }

  // Spherical interpolation between two airports
  static slerpVec(a, b, t) {
    const av = Globe.vec(a.lat, a.lon), bv = Globe.vec(b.lat, b.lon);
    let dot = av[0] * bv[0] + av[1] * bv[1] + av[2] * bv[2];
    dot = Math.max(-1, Math.min(1, dot));
    const om = Math.acos(dot);
    if (om < 1e-6) return av;
    const sa = Math.sin((1 - t) * om) / Math.sin(om);
    const sb = Math.sin(t * om) / Math.sin(om);
    return [av[0] * sa + bv[0] * sb, av[1] * sa + bv[1] * sb, av[2] * sa + bv[2] * sb];
  }

  static vec(lat, lon) {
    const la = lat * DEG, lo = lon * DEG;
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  }

  static vecToLatLon(v) {
    return { lat: Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG, lon: Math.atan2(v[1], v[0]) / DEG };
  }

  // Great-circle vectors are cached per airport pair — slerp is trig-heavy
  // and route arcs don't move.
  arcVecs(a, b) {
    if (!this._arcCache) this._arcCache = new Map();
    const key = `${a.code || a.lat + "," + a.lon}|${b.code || b.lat + "," + b.lon}`;
    let v = this._arcCache.get(key);
    if (!v) {
      if (this._arcCache.size > 400) this._arcCache.clear();
      const N = 40;
      v = new Float64Array((N + 1) * 3);
      for (let i = 0; i <= N; i++) {
        // slerp gives earth-fixed vectors as [x=cl*cos(lon), y=cl*sin(lon), z=sin(lat)];
        // convert to projectVec's frame (x=cl*sin(lon), y=sin(lat), z=cl*cos(lon))
        const w = Globe.slerpVec(a, b, i / N);
        v[i * 3] = w[1];
        v[i * 3 + 1] = w[2];
        v[i * 3 + 2] = w[0];
      }
      this._arcCache.set(key, v);
    }
    return v;
  }

  drawArc(a, b, highlight) {
    const ctx = this.ctx;
    const v = this.arcVecs(a, b);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < v.length; i += 3) {
      const p = this.projectVec(v[i], v[i + 1], v[i + 2]);
      if (p.z > 0) {
        const s = this.toScreen(p);
        pen ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
        pen = true;
      } else pen = false;
    }
    ctx.strokeStyle = highlight ? "rgba(255,210,60,0.95)" : "rgba(255,235,150,0.45)";
    ctx.lineWidth = highlight ? 2 : 1.2;
    ctx.stroke();
  }

  drawPlane(a, b, prog) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const ll1 = Globe.vecToLatLon(Globe.slerpVec(a, b, prog));
    const ll2 = Globe.vecToLatLon(Globe.slerpVec(a, b, Math.min(1, prog + 0.01)));
    const p1 = this.project(ll1.lat, ll1.lon);
    if (p1.z <= 0.02) return null;
    const p2 = this.project(ll2.lat, ll2.lon);
    const s1 = this.toScreen(p1), s2 = this.toScreen(p2);
    const ang = Math.atan2(s2.y - s1.y, s2.x - s1.x);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(s1.x, s1.y);
    ctx.rotate(ang);
    ctx.scale(1.55, 1.55);
    // plane silhouette pointing +x
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(10,30,60,0.85)";
    ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(0,20,50,0.6)"; ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(7, 0);      // nose
    ctx.lineTo(1.5, -1.4);
    ctx.lineTo(-1, -5.5);  // left wing
    ctx.lineTo(-2.6, -5.2);
    ctx.lineTo(-1.6, -1.2);
    ctx.lineTo(-4.5, -1);
    ctx.lineTo(-6, -3);    // left tail
    ctx.lineTo(-7, -2.6);
    ctx.lineTo(-5.8, 0);
    ctx.lineTo(-7, 2.6);
    ctx.lineTo(-6, 3);
    ctx.lineTo(-4.5, 1);
    ctx.lineTo(-1.6, 1.2);
    ctx.lineTo(-2.6, 5.2);
    ctx.lineTo(-1, 5.5);   // right wing
    ctx.lineTo(1.5, 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return s1;
  }

  // A spinning cyclone: layered cloud disc, multi-arm spiral, calm eye.
  drawTyphoon(x, y, r, t) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-t * 0.85);

    // Soft outer rainbands
    const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.15);
    halo.addColorStop(0, "rgba(180,205,230,0.15)");
    halo.addColorStop(0.55, "rgba(140,170,205,0.28)");
    halo.addColorStop(1, "rgba(120,150,185,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2); ctx.fill();

    // Dense swirling body
    const disc = ctx.createRadialGradient(0, 0, r * 0.08, 0, 0, r);
    disc.addColorStop(0, "rgba(245,250,255,0.75)");
    disc.addColorStop(0.35, "rgba(200,220,240,0.55)");
    disc.addColorStop(0.7, "rgba(150,180,210,0.35)");
    disc.addColorStop(1, "rgba(130,160,190,0)");
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

    // Spiral rainbands (thick translucent strokes)
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let arm = 0; arm < 4; arm++) {
      const base = arm * (Math.PI / 2);
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const f = i / 48;
        const ang = base + f * 3.6;
        const rad = r * (0.12 + f * 0.88);
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(255,255,255,${(0.55 - arm * 0.08).toFixed(2)})`;
      ctx.lineWidth = Math.max(2, r * (0.14 - arm * 0.018));
      ctx.stroke();
      // darker underside on each band for depth
      ctx.strokeStyle = `rgba(90,120,155,${(0.22 - arm * 0.03).toFixed(2)})`;
      ctx.lineWidth = Math.max(1, r * (0.06 - arm * 0.008));
      ctx.stroke();
    }

    // Eye wall + calm eye
    const eyeWall = ctx.createRadialGradient(0, 0, r * 0.04, 0, 0, r * 0.22);
    eyeWall.addColorStop(0, "rgba(40,70,105,0.15)");
    eyeWall.addColorStop(0.55, "rgba(55,85,120,0.55)");
    eyeWall.addColorStop(1, "rgba(90,120,150,0)");
    ctx.fillStyle = eyeWall;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(30,55,85,0.75)";
    ctx.beginPath(); ctx.arc(0, 0, r * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(180,210,235,0.35)";
    ctx.beginPath(); ctx.arc(0, 0, r * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // A dark storm cell with layered clouds and flickering lightning.
  drawStormCloud(x, y, r, t) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    const disc = ctx.createRadialGradient(0, 0, r * 0.08, 0, 0, r * 1.05);
    disc.addColorStop(0, "rgba(70,85,110,0.82)");
    disc.addColorStop(0.55, "rgba(90,105,130,0.45)");
    disc.addColorStop(1, "rgba(95,110,130,0)");
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2); ctx.fill();

    // Lobes so it reads as a thunderhead, not a flat disc
    ctx.fillStyle = "rgba(55,70,95,0.55)";
    for (const [ox, oy, s] of [[-0.35, -0.15, 0.42], [0.05, -0.28, 0.48], [0.38, -0.08, 0.36], [-0.1, 0.12, 0.4]]) {
      ctx.beginPath();
      ctx.ellipse(ox * r, oy * r, s * r, s * r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Occasional sharp lightning flash
    const pulse = Math.sin(t * 7.5);
    const flash = pulse > 0.82 ? (pulse - 0.82) / 0.18 : 0;
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,235,150,${(0.55 + flash * 0.45).toFixed(2)})`;
      ctx.strokeStyle = `rgba(255,250,220,${(0.7 + flash * 0.3).toFixed(2)})`;
      ctx.lineWidth = Math.max(1.2, r * 0.06);
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(r * 0.05, -r * 0.35);
      ctx.lineTo(-r * 0.18, r * 0.02);
      ctx.lineTo(r * 0.02, r * 0.02);
      ctx.lineTo(-r * 0.08, r * 0.42);
      ctx.lineTo(r * 0.22, -r * 0.02);
      ctx.lineTo(r * 0.02, -r * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
