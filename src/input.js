// Keyboard + touch input. Tracks held state per team button and queues
// one-shot UI actions (pause, confirm). Clears everything on blur so keys
// never get "stuck" when the window loses focus mid-press.

const TEAM_KEYS = [
  new Set(['KeyW']),
  new Set(['ArrowUp']),
];

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.touchTeams = [new Set(), new Set()];
    this.actions = [];
    this.target = target;
    this.touchEnabled = true;

    this._kd = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') this.actions.push('pause');
      if (e.code === 'Enter' || e.code === 'Space') this.actions.push('confirm');
      if (e.code === 'KeyM') this.actions.push('mute');
      this.actions.push('any');
    };
    this._ku = (e) => { this.down.delete(e.code); };
    this._blur = () => this.clear();
    this._vis = () => { if (document.hidden) { this.clear(); this.actions.push('blur'); } };

    target.addEventListener('keydown', this._kd);
    target.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
    document.addEventListener('visibilitychange', this._vis);
  }

  /** Touch: left half of the screen is team 0, right half team 1. */
  bindTouch(el) {
    const update = (e) => {
      if (!this.touchEnabled) return;
      e.preventDefault();
      this.touchTeams[0].clear();
      this.touchTeams[1].clear();
      const w = el.clientWidth;
      for (const t of e.touches) {
        this.touchTeams[t.clientX < w / 2 ? 0 : 1].add(t.identifier);
      }
      if (e.type === 'touchstart') this.actions.push('any');
    };
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      el.addEventListener(type, update, { passive: false });
    }
  }

  team(team) {
    for (const k of TEAM_KEYS[team]) if (this.down.has(k)) return true;
    return this.touchTeams[team].size > 0;
  }

  /** Consume queued one-shot actions. */
  take() {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  clear() {
    this.down.clear();
    this.touchTeams[0].clear();
    this.touchTeams[1].clear();
  }
}
