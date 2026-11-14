// Game state machine: menu -> countdown -> playing -> scored -> (next round | victory).
// Owns the fixed-timestep loop and wires simulation events to sound and FX.

import {
  STEP_MS, MAX_STEPS_PER_FRAME, WIN_SCORE, COUNTDOWN_TIME, CELEBRATE_TIME,
  SLOWMO_TIME, SLOWMO_SCALE, TEAM_COLORS, TEAM_NAMES, GROUND_Y,
} from './config.js';
import { Match } from './match.js';
import { generateRound } from './randomizer.js';
import { Scoreboard } from './scoring.js';
import { CpuController } from './ai.js';
import { Effects } from './effects.js';

const STEP_S = STEP_MS / 1000;

export class Game {
  constructor({ renderer, input, audio, ui }) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.ui = ui;
    this.effects = new Effects();
    this.scoreboard = new Scoreboard(WIN_SCORE);

    this.state = 'menu';
    this.paused = false;
    this.mode = 'demo';                 // 'demo' | '2p' | 'cpu'
    this.match = null;
    this.cfg = null;
    this.stateTime = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.banner = null;
    this.scorePulse = null;
    this.rimSinceThrow = false;
    this.lastFrame = performance.now();
    this.cpus = [new CpuController(0, 0.55), new CpuController(1, 0.6)];
    this.forceCpu = [false, false];     // test hook: let the CPU drive any team
    this.speed = 1;                     // test hook: simulation speed multiplier
    this.round = 0;

    this._startRound(true);
    this.ui.show('menu');
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  // ------------------------------------------------------------ flow

  startMatch(mode) {
    this.audio.unlock();
    this.mode = mode;
    this.scoreboard.reset();
    this.round = 0;
    this.paused = false;
    this.effects.clear();
    this.cpus.forEach((c) => c.reset());
    this.ui.show(null);
    this._startRound(false);
  }

  toMenu() {
    this.mode = 'demo';
    this.paused = false;
    this.scoreboard.reset();
    this.round = 0;
    this.effects.clear();
    this._startRound(true);
    this.ui.show('menu');
  }

  _startRound(demo) {
    const prevTheme = this.cfg ? this.cfg.theme.id : null;
    if (this.match) this.match.destroy();
    this.round++;
    this.cfg = generateRound(demo ? 2 + Math.floor(Math.random() * 5) : this.round, prevTheme);
    if (!demo) this.cfg.round = this.round;
    this.match = new Match(this.cfg);
    this.match.drainEvents();
    this.acc = 0;
    this.timeScale = 1;
    this.scorePulse = null;
    this.rimSinceThrow = true;
    if (demo) {
      this._setState('playing');
    } else {
      this._setState('countdown');
      this.match.ball.frozen = true;
    }
  }

  _setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  togglePause() {
    if (!['countdown', 'playing', 'scored'].includes(this.state) || this.mode === 'demo') return;
    this.paused = !this.paused;
    this.input.clear();
    this.ui.show(this.paused ? 'pause' : null);
  }

  // ------------------------------------------------------------ loop

  _frame(now) {
    const realDt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this._handleActions();

    if (!this.paused) this._update(realDt * this.speed);
    this.effects.update(this.paused ? 0 : realDt);
    this.renderer.render({
      match: this.match,
      cfg: this.cfg,
      effects: this.effects,
      scores: this.scoreboard.scores,
      showHud: this.mode !== 'demo',
      banner: this.banner,
      scorePulse: this.scorePulse,
      labels: this._labels(),
    }, this.paused ? 0 : realDt);
    requestAnimationFrame(this._frame);
  }

  _labels() {
    return this.mode === 'cpu' ? ['P1 · W', 'CPU'] : ['P1 · W', 'P2 · ↑'];
  }

  _handleActions() {
    for (const a of this.input.take()) {
      if (a === 'any' || a === 'confirm') this.audio.unlock();
      if (a === 'mute') this.ui.setMuted(this.audio.toggleMute());
      if (a === 'pause') {
        if (this.state === 'victory' || this.mode === 'demo') continue;
        this.togglePause();
      }
      if (a === 'blur' && !this.paused && this.mode !== 'demo' && ['countdown', 'playing', 'scored'].includes(this.state)) {
        this.togglePause();
      }
    }
  }

  _controls() {
    const m = this.match;
    const res = [false, false];
    for (let team = 0; team < 2; team++) {
      const cpu = this.mode === 'demo' || (this.mode === 'cpu' && team === 1) || this.forceCpu[team];
      res[team] = cpu ? this.cpus[team].update(m, STEP_S) : this.input.team(team);
    }
    if (this.state === 'countdown') return [false, false];
    if (this.state === 'victory') {
      // Winners bounce around, losers sulk.
      const w = this.scoreboard.winner;
      return [w === 0 && Math.sin(this.stateTime * 6) > 0, w === 1 && Math.sin(this.stateTime * 6) > 0];
    }
    return res;
  }

  _update(dt) {
    this.stateTime += dt;
    this._updateState(dt);

    this.acc += dt * this.timeScale;
    let steps = 0;
    const maxSteps = MAX_STEPS_PER_FRAME * this.speed;
    while (this.acc >= STEP_S && steps < maxSteps) {
      const controls = this._controls();
      this.match.step(controls);
      this.acc -= STEP_S;
      steps++;
      this._handleEvents(this.match.drainEvents());
    }
    if (steps >= maxSteps) this.acc = 0;
  }

  _updateState(dt) {
    const m = this.match;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.life && this.banner.t > this.banner.life) this.banner = null;
    }
    if (this.scorePulse) this.scorePulse.t += dt;

    switch (this.state) {
      case 'countdown': {
        const t = this.stateTime;
        if (!this.banner || this.banner.kind !== 'round') {
          this.banner = { kind: 'round', text: `ROUND ${this.cfg.round}`, sub: this.cfg.modifiers.join(' · ') || this.cfg.theme.name, size: 76, color: '#ffffff', t: 0, life: COUNTDOWN_TIME };
          this.audio.countdown(false);
        }
        if (t >= COUNTDOWN_TIME) {
          m.ball.frozen = false;
          this.audio.whistle();
          this.banner = { kind: 'go', text: 'GO!', size: 96, color: '#ffd23f', t: 0, life: 0.6 };
          this._setState('playing');
        }
        break;
      }
      case 'playing':
        if (m.scored && this.mode === 'demo') {
          if (this.stateTime > 0.5) this._startRound(true);
        } else if (m.scored) {
          this._onScore(m.scored);
        } else if (this.mode === 'demo' && this.stateTime > 30) {
          this._startRound(true);
        }
        break;
      case 'scored': {
        this.timeScale = this.stateTime < SLOWMO_TIME ? SLOWMO_SCALE : Math.min(1, this.timeScale + dt * 3);
        if (this.stateTime >= CELEBRATE_TIME) {
          if (this.scoreboard.winner !== null) this._victory();
          else this._startRound(false);
        }
        break;
      }
      case 'victory':
        this.timeScale = 1;
        break;
      default: break;
    }
  }

  _onScore(s) {
    this.scoreboard.award(s.team, { round: this.cfg.round, dunk: s.dunk, ownGoal: s.ownGoal });
    this._setState('scored');
    this.scorePulse = { team: s.team, t: 0 };
    const tc = TEAM_COLORS[s.team];
    const h = s.hoop;
    this.effects.shake(22);
    this.effects.flashScreen(tc.light, 0.35);
    this.effects.confetti(h.centerX, h.rimY + 20, [tc.main, tc.light, '#ffffff', '#ffd23f'], 80);
    this.effects.ring(h.centerX, h.rimY, '#ffffff');
    const word = s.ownGoal ? 'OOPS! OWN BASKET' : s.dunk ? 'DUNK!' : !this.rimSinceThrow ? 'SWISH!' : 'BUCKET!';
    const px = Math.max(260, Math.min(this.match.W - 260, h.centerX - h.side * 160));
    this.effects.popup(word, px, h.rimY - 70, tc.light, s.ownGoal ? 52 : 78, 1.9);
    this.effects.popup('+1', h.centerX, h.rimY - 10, '#ffffff', 56, 1.4);
    const sc = this.scoreboard.scores;
    const nearWin = Math.max(sc[0], sc[1]) === WIN_SCORE - 1 && this.scoreboard.winner === null;
    this.banner = {
      kind: 'score', text: `${sc[0]} – ${sc[1]}`, sub: nearWin ? 'MATCH POINT!' : `${TEAM_NAMES[s.team]} SCORES`,
      size: 88, color: tc.light, t: 0, life: CELEBRATE_TIME - 0.2,
    };
    this.audio.score();
  }

  _victory() {
    this._setState('victory');
    this.timeScale = 1;
    const w = this.scoreboard.winner;
    this.banner = null;
    this.audio.victory();
    const tc = TEAM_COLORS[w];
    this.effects.confetti(this.match.W / 2, 200, [tc.main, tc.light, '#fff', '#ffd23f'], 140);
    this.ui.showVictory(w, this.scoreboard.scores, TEAM_NAMES[w], this.mode === 'cpu' && w === 1);
  }

  _handleEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'jump':
          this.audio.jump();
          if (e.y > GROUND_Y - 260) this.effects.dust(e.x, GROUND_Y, 3);
          break;
        case 'impact':
          this.audio.bounce(e.kind, e.speed);
          if (e.kind === 'rim') { this.rimSinceThrow = true; if (e.speed > 500) this.effects.shake(4); }
          if (e.kind === 'ground' && e.speed > 600) this.effects.dust(e.x, GROUND_Y, 4);
          break;
        case 'bump':
          this.audio.bump(e.speed);
          if (e.speed > 700) this.effects.shake(3);
          break;
        case 'grab':
          this.audio.grab();
          break;
        case 'steal':
          this.audio.grab();
          if (this.state === 'playing' && this.mode !== 'demo') this.effects.popup('STEAL!', e.x, e.y - 60, '#ffd23f', 34, 0.9);
          break;
        case 'throw':
          this.audio.throw();
          this.rimSinceThrow = false;
          break;
        case 'drop':
          if (this.state === 'playing') this.audio.whistle();
          break;
        default: break;
      }
    }
  }
}
