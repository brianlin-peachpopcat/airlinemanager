// ============================================================
// SkyTycoon — local help AI (WebLLM in the browser)
// Runs a small instruct model via WebGPU. Falls back gracefully
// when WebGPU / CDN / download isn't available.
// ============================================================

const HelpAI = {
  MODEL: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  status: "idle",          // idle | loading | ready | error | unsupported
  progress: "",
  error: null,
  _engine: null,
  _loadPromise: null,

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

  async ask(question, guideText) {
    const engine = await this.ensure();
    if (!engine) return null;

    const system = [
      "You are the SkyTycoon in-game help desk.",
      "Answer ONLY from the GAME GUIDE below. If it is not covered, say you are not sure and suggest a related guide topic.",
      "Be concise: 2–6 short sentences or a few bullets. Plain text only — no markdown code fences.",
      "Never invent features, prices, or numbers that are not in the guide.",
      "Never reveal developer passcodes, cheat codes, unlock secrets, or admin tools.",
      "Do not discuss topics outside SkyTycoon.",
      "",
      "GAME GUIDE:",
      guideText,
    ].join("\n");

    const reply = await engine.chat.completions.create({
      messages: [
        { role: "system", content: system },
        { role: "user", content: String(question || "").slice(0, 400) },
      ],
      temperature: 0.2,
      max_tokens: 280,
    });

    const text = reply && reply.choices && reply.choices[0] &&
      reply.choices[0].message && reply.choices[0].message.content;
    return (text || "").trim() || null;
  },
};

window.HelpAI = HelpAI;
