const codes = { F8: 66, F9: 67, F10: 68, F11: 87, F12: 88, 'Ctrl+Shift+Space': 57 };
class Hotkey {
  constructor(config, start, stop, cancel) { this.config = config; this.start = start; this.stop = stop; this.cancel = cancel; this.down = false; }
  keydown(e) {
    if (e.keycode === 1) { this.cancel(); return; }
    const c = this.config();
    if (e.keycode !== codes[c.hotkey] || (c.hotkey.includes('+') && (!e.ctrlKey || !e.shiftKey || e.altKey))) return;
    if (this.down) return;
    this.down = true;
    if (c.hotkeyMode === 'toggle') { if (!this.stop()) this.start(); }
    else this.start();
  }
  keyup(e) {
    if (e.keycode !== codes[this.config().hotkey] || !this.down) return;
    this.down = false;
    if (this.config().hotkeyMode === 'hold') this.stop();
  }
  reset() { this.down = false; }
}
module.exports = { Hotkey, codes };
