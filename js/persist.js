// ============================================================
// SkyTycoon — durable persistence (localStorage + IndexedDB + cloud)
// Cloud sync keys saves by visitor IP when /api/* + KV env are set.
// ============================================================

const Persist = {
  LS_KEY: "skytycoon",
  IDB_NAME: "skytycoon-db",
  IDB_STORE: "saves",
  IDB_KEY: "main",
  cloudStatus: "unknown", // unknown | off | ok | err
  _db: null,

  async openDB() {
    if (this._db) return this._db;
    if (typeof indexedDB === "undefined") return null;
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(this.IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(this.IDB_STORE)) {
            db.createObjectStore(this.IDB_STORE);
          }
        };
        req.onsuccess = () => { this._db = req.result; resolve(this._db); };
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  },

  async idbGet() {
    const db = await this.openDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(this.IDB_STORE, "readonly");
        const req = tx.objectStore(this.IDB_STORE).get(this.IDB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  },

  async idbSet(state) {
    const db = await this.openDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(this.IDB_STORE, "readwrite");
        const store = tx.objectStore(this.IDB_STORE);
        if (state == null) store.delete(this.IDB_KEY);
        else store.put(state, this.IDB_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  },

  readLocal() {
    try {
      const raw = localStorage.getItem(this.LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) { return null; }
  },

  writeLocal(state) {
    if (!state) return false;
    const raw = JSON.stringify(state);
    try {
      localStorage.setItem(this.LS_KEY, raw);
      return true;
    } catch (_) {
      try {
        // Quota: trim heavy arrays then retry
        if (Array.isArray(state.log) && state.log.length > 400) state.log.length = 400;
        for (const p of (state.planes || [])) {
          if (p.hist && p.hist.length > 40) p.hist.length = 40;
        }
        localStorage.setItem(this.LS_KEY, JSON.stringify(state));
        return true;
      } catch (_) { return false; }
    }
  },

  newer(a, b) {
    if (!a) return false;
    if (!b) return true;
    return (a.lastSeen || 0) > (b.lastSeen || 0);
  },

  async cloudLoad() {
    try {
      const res = await fetch("/api/load", { method: "GET", credentials: "same-origin" });
      if (res.status === 204 || res.status === 404) {
        this.cloudStatus = res.headers.get("x-sky-cloud") === "off" ? "off" : "ok";
        return null;
      }
      if (!res.ok) { this.cloudStatus = "err"; return null; }
      const data = await res.json();
      this.cloudStatus = data.cloud === false ? "off" : "ok";
      return data.state || null;
    } catch (_) {
      this.cloudStatus = "off";
      return null;
    }
  },

  async cloudSave(state) {
    if (!state) return false;
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      if (!res.ok) { this.cloudStatus = "err"; return false; }
      const data = await res.json().catch(() => ({}));
      this.cloudStatus = data.cloud === false ? "off" : "ok";
      return !!data.ok;
    } catch (_) {
      this.cloudStatus = "off";
      return false;
    }
  },

  /** Pick the newest among localStorage, IndexedDB, and cloud. */
  async resolveBest() {
    const local = this.readLocal();
    const idb = await this.idbGet();
    const cloud = await this.cloudLoad();
    let best = null;
    for (const cand of [local, idb, cloud]) {
      if (this.newer(cand, best)) best = cand;
    }
    return best;
  },

  /** Write to all durable stores. */
  async persistAll(state) {
    if (!state) return;
    state.lastSeen = Date.now();
    this.writeLocal(state);
    await this.idbSet(state);
    // Fire-and-forget cloud (don't block ticks)
    this.cloudSave(state).catch(() => {});
  },
};

window.Persist = Persist;
