const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs/promises');
const path = require('node:path');
class Sessions {
  constructor(deps) { this.d = deps; this.state = 'idle'; this.active = null; this.closed = false; }
  set(state, detail = {}) { this.state = state; this.d.notify({ state, ...detail }); }
  valid(s) { return this.active === s && !s.abort.signal.aborted && !this.closed; }
  start() {
    if (this.closed || this.active) return false;
    const s = { id: randomUUID(), abort: new AbortController(), config: { ...this.d.config() }, stopRequested: false, began:performance.now() };
    this.active = s;
    this.set('loading');
    s.task = this.run(s);
    return true;
  }
  stop() {
    const s = this.active;
    if (!s || !['loading','recording'].includes(this.state)) return false;
    if (!s.stopRequested) {
      s.stopRequested = true; s.release = performance.now();
      this.set('stopping'); s.capture?.stop();
    }
    return true;
  }
  async cancel() {
    const s = this.active;
    if (!s) return;
    s.abort.abort(); s.capture?.cancel();
    await this.d.engine.unload(); // Aborting HTTP alone does not cancel native inference.
    await s.task;
  }
  async run(s) {
    try {
      s.target = await this.d.target(s.abort.signal);
      if (!this.valid(s) || s.stopRequested) return;
      if (s.target.copyOnly) s.config.pasteMethod = 'clipboard';
      s.dir = path.join(this.d.temp, s.id);
      await fs.mkdir(s.dir, { recursive: true });
      const file = path.join(s.dir, 'audio.wav');
      s.capture = this.d.capture(file, s.config, s.abort.signal);
      await s.capture.ready;
      s.captureStartupMs=performance.now()-s.began;
      if (!this.valid(s)) return;
      if (!s.stopRequested) this.set('recording'); else s.capture.stop();
      await s.capture.done;
      if (!s.stopRequested) throw Error('Microphone stopped unexpectedly');
      if (!this.valid(s)) return;
      await this.d.validateAudio(file);
      this.set('transcribing');
      const result = await this.d.engine.transcribe(file, s.config, s.abort.signal);
      if (!this.valid(s)) return;
      const raw = result.text.trim();
      if (!raw) throw Error('No speech detected');
      const cleaned = await this.d.cleanup(raw, s.config, s.abort.signal);
      if (!this.valid(s)) return;
      // Save before attempting insertion so every paste failure has copy recovery.
      const entry = { id: s.id, ts: new Date().toISOString(), raw, cleaned: cleaned.text, mode: cleaned.mode, format:cleaned.format||'plain',language:s.config.language,warning:cleaned.warning||'' };
      this.d.recovery(cleaned.text);
      await this.d.history(entry, s.config);
      if (!this.valid(s)) return;
      this.set('inserting');
      const insertion = await this.d.insert(cleaned.text, s.target, s.config, s.abort.signal);
      if (!this.valid(s)) return;
      let warning = [cleaned.warning,s.target.copyOnly ? 'Copied because VoiceFlow had focus. Click your text app and press Ctrl+V. For automatic paste, start F9 from that app.' : ''].filter(Boolean).join('; ');
      try { await this.d.metrics({ id: s.id, captureStartupMs:s.captureStartupMs,captureBackend:s.capture.backend,captureFallback:s.capture.fallbackReason,...result.metrics,...cleaned.metrics, releaseToInsertionMs: performance.now() - s.release, insertion }); }
      catch (e) { warning = [warning, `Timing log not written: ${e.message}`].filter(Boolean).join('; '); }
      if (!this.valid(s)) return;
      this.set('idle', { completion: insertion, warning });
    } catch (error) {
      if (this.valid(s)) this.set('error', { message: error.message });
    } finally {
      s.capture?.cancel();
      if (s.capture) await s.capture.done.catch(() => {});
      if (s.dir) await fs.rm(s.dir, { recursive: true, force: true }).catch(() => {});
      if (this.active === s) {
        this.active = null;
        if (s.abort.signal.aborted) this.set('idle', { completion: 'cancelled' });
        else if (!['idle','error'].includes(this.state)) this.set('idle');
      }
    }
  }
  async close() { this.closed = true; await this.cancel(); await this.d.engine.unload(); }
}
module.exports = { Sessions };
