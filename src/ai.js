// CPU opponent. It only has the same single button a human has, so it plays
// by timing presses and releases. Reaction delays and random shot ranges keep
// it beatable and a little goofy.

import { rand, chance } from './rng.js';

export class CpuController {
  constructor(team, skill = 0.6) {
    this.team = team;
    this.skill = skill;
    this.pressed = false;
    this.timer = 0;          // time in the current pressed/released phase
    this.wait = 0;           // reaction delay before next decision
    this.shotRange = rand(260, 620);
  }

  reset() {
    this.pressed = false;
    this.timer = 0;
    this.wait = rand(0.1, 0.3);
  }

  /** @returns {boolean} button state for this frame */
  update(match, dt) {
    this.timer += dt;
    if (this.wait > 0) { this.wait -= dt; return this.pressed; }

    const ball = match.ball;
    const mine = match.chars.filter((c) => c.team === this.team);
    const holder = ball.holder;
    const hoop = match.hoops[this.team === 0 ? 1 : 0];

    if (holder && holder.team === this.team) {
      const dist = Math.abs(hoop.centerX - holder.x);
      if (!this.pressed) {
        // Wind up: press to hop forward with the ball raised.
        if (this.timer > rand(0.05, 0.35)) this._set(true);
      } else {
        const vy = holder.torso.velocity.y;
        const nearApex = vy > -1.2 && holder.y < holder.physics.groundY - holder.dims.legLen - 40;
        const inRange = dist < this.shotRange;
        const tooLong = this.timer > 1.6;
        const desperate = this.timer > 1.0 && chance(0.02);
        if ((inRange && nearApex) || tooLong || desperate) {
          this._set(false);
          this.shotRange = rand(200, 700) * (0.6 + this.skill * 0.6);
          this.wait = rand(0.15, 0.35);
        }
      }
      return this.pressed;
    }

    // Not holding: hop towards the ball in pulses, jump when it's close and high.
    const near = mine.reduce((best, c) => Math.min(best, Math.hypot(c.x - ball.pos.x, c.y - ball.pos.y)), Infinity);
    const close = near < 220 + this.skill * 60;
    if (this.pressed) {
      const holdFor = close ? rand(0.25, 0.45) : rand(0.12, 0.22);
      if (this.timer > holdFor) { this._set(false); this.wait = rand(0.04, 0.2) * (1.4 - this.skill); }
    } else {
      const pause = close ? rand(0.02, 0.12) : rand(0.15, 0.45);
      if (this.timer > pause) { this._set(true); this.wait = rand(0.0, 0.08); }
    }
    return this.pressed;
  }

  _set(v) {
    this.pressed = v;
    this.timer = 0;
  }
}
