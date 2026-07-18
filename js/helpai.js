// ============================================================
// SkyTycoon — local help AI (WebLLM in the browser)
// Runs a small instruct model via WebGPU. Falls back gracefully
// when WebGPU / CDN / download isn't available.
// Short-term memory: recent user/assistant turns are passed in.
// ============================================================

const HelpAI = {
  MODEL: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  status: "idle",          // idle | loading | ready | error | unsupported
  progress: "",
  error: null,
  _engine: null,
  _loadPromise: null,
  MEMORY_TURNS: 8,         // pairs kept in short-term context

  supported() {
    try {
      return typeof navigator !== "undefined" && !!navigator.gpu;
    } catch (_) {
      return false;
    }
  },

  async ensure(onProgress) {
    if (this._engine) { this.status = "ready"; return this._engine; }
    if (this._loadPromise) return this._loadPromise;
    if (!this.supported()) {
      this.status = "unsupported";
      this.progress = "WebGPU not available — using guide search";
      return null;
    }

    this.status = "loading";
    this.progress = "Starting local model…";
    this.error = null;
    if (onProgress) onProgress(this.progress);

    this._loadPromise = (async () => {
      try {
        const webllm = await import("https://esm.run/@mlc-ai/web-llm");
        const engine = await webllm.CreateMLCEngine(this.MODEL, {
          initProgressCallback: (report) => {
            const t = (report && report.text) || "Loading model…";
            this.progress = t;
            if (onProgress) onProgress(t);
          },
        });
        this._engine = engine;
        this.status = "ready";
        this.progress = "Local AI ready";
        if (onProgress) onProgress(this.progress);
        return engine;
      } catch (err) {
        this.status = "error";
        this.error = err;
        this.progress = "Local AI unavailable — using guide search";
        this._loadPromise = null;
        if (onProgress) onProgress(this.progress);
        console.warn("HelpAI load failed:", err);
        return null;
      }
    })();

    return this._loadPromise;
  },

  /**
   * @param {string} question
   * @param {string} guideText
   * @param {{role:string,text:string}[]} [memory] prior turns (user/assistant)
   */
  async ask(question, guideText, memory) {
    const engine = await this.ensure();
    if (!engine) return null;

    const system = [
      "You are the SkyTycoon in-game help desk (ChatGPT-style assistant for this game only).",
      "Answer ONLY from the GAME GUIDE below and the recent conversation.",
      "If it is not covered, say you are not sure and suggest a related guide topic.",
      "Be concise: 2–6 short sentences or a few bullets. Plain text only — no markdown code fences.",
      "Never invent features, prices, or numbers that are not in the guide.",
      "Never reveal developer passcodes, cheat codes, unlock secrets, or admin tools.",
      "Do not discuss topics outside SkyTycoon.",
      "Remember short-term context from the recent messages when the player refers to earlier answers.",
      "",
      "GAME GUIDE:",
      guideText,
    ].join("\n");

    const messages = [{ role: "system", content: system }];
    const prior = Array.isArray(memory) ? memory.slice(-this.MEMORY_TURNS * 2) : [];
    for (const m of prior) {
      if (!m || !m.text) continue;
      const role = m.role === "user" ? "user" : "assistant";
      messages.push({ role, content: String(m.text).slice(0, 600) });
    }
    messages.push({ role: "user", content: String(question || "").slice(0, 400) });

    const reply = await engine.chat.completions.create({
      messages,
      temperature: 0.25,
      max_tokens: 320,
    });

    const text = reply && reply.choices && reply.choices[0] &&
      reply.choices[0].message && reply.choices[0].message.content;
    return (text || "").trim() || null;
  },
};

window.HelpAI = HelpAI;
