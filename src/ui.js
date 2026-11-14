// DOM overlays: main menu, pause, victory, corner buttons.

export class UI {
  constructor(root) {
    this.root = root;
    this.current = null;
    this.panels = {
      menu: root.querySelector('#menu'),
      pause: root.querySelector('#pause'),
      victory: root.querySelector('#victory'),
    };
    this.howto = root.querySelector('#howto');
    this.muteBtn = root.querySelector('#btn-mute');
    this.pauseBtn = root.querySelector('#btn-pause');
    this.handlers = {};
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      const fn = this.handlers[btn.dataset.action];
      if (fn) fn(btn);
      btn.blur();
    });
  }

  on(action, fn) { this.handlers[action] = fn; }

  show(name) {
    this.current = name;
    for (const [k, el] of Object.entries(this.panels)) el.classList.toggle('hidden', k !== name);
    this.pauseBtn.classList.toggle('hidden', name === 'menu' || name === 'victory');
    document.body.classList.toggle('in-menu', name === 'menu');
    if (name !== 'menu') this.howto.classList.add('hidden');
    const first = name && this.panels[name].querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  toggleHowTo() { this.howto.classList.toggle('hidden'); }

  showVictory(team, scores, name, cpuWon) {
    const el = this.panels.victory;
    el.dataset.team = String(team);
    el.querySelector('.v-title').textContent = cpuWon ? 'CPU WINS!' : `${name} WINS!`;
    el.querySelector('.v-score').textContent = `${scores[0]} – ${scores[1]}`;
    el.querySelector('.v-sub').textContent = cpuWon ? 'The robots are taking over. Rematch?' : `Team ${team + 1} takes the match!`;
    this.show('victory');
  }

  setMuted(muted) {
    this.muteBtn.textContent = muted ? '🔇' : '🔊';
    this.muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  }
}
