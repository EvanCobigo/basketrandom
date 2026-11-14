// One round of play: owns the physics world, the four ragdolls, the ball and
// the hoop sensors. Pure simulation (no DOM) so it also runs headless in tests.
// Game code feeds it button states and drains `events` for sound/FX.

import { PhysicsWorld, fromMatterVel } from './physics.js';
import { Character } from './character.js';
import { Ball } from './ball.js';
import { HoopSensor } from './scoring.js';
import { GROUND_Y, STEP_MS, BASE_DELTA, BALL_STUCK_TIME, MAX_HOLD_TIME } from './config.js';
import { rand } from './rng.js';

const DT = STEP_MS / 1000;
const STEP_SCALE = STEP_MS / BASE_DELTA;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Match {
  constructor(cfg) {
    this.cfg = cfg;
    this.physics = new PhysicsWorld(cfg);
    this.W = this.physics.W;
    this.hoops = this.physics.hoops;
    this.events = [];
    this.scored = null;           // { team, hoop, dunk, ownGoal } once a basket happens
    this.prevControls = [false, false];

    const W = this.W;
    const spots = [W * 0.2, W * 0.36, W * 0.8, W * 0.64];
    this.chars = spots.map((x, i) => new Character(this.physics, {
      x, team: i < 2 ? 0 : 1, index: i, dims: cfg.body, appearance: cfg.appearances[i],
    }));

    this.ball = new Ball(this.physics, cfg);
    this.sensors = this.hoops.map((h) => new HoopSensor(h, this.ball.R));
    this.dropBall(true);

    this.physics.onPair((pair, isStart) => this._onPair(pair, isStart));
  }

  get time() { return this.physics.time; }

  dropBall(initial = false) {
    const x = this.W / 2 + (initial ? 0 : rand(-40, 40));
    this.ball.drop(x, initial ? 230 : 150, rand(-60, 60));
    this.events.push({ type: 'drop' });
  }

  _onPair(pair, isStart) {
    const a = pair.bodyA;
    const b = pair.bodyB;
    const pa = a.plugin || {};
    const pb = b.plugin || {};
    const t = this.time;
    this._support(pa, pb, a, b, t);
    this._support(pb, pa, b, a, t);
    if (pa.kind === 'ball' && pb.kind === 'part') this.ball.touch(pb.owner, t);
    else if (pb.kind === 'ball' && pa.kind === 'part') this.ball.touch(pa.owner, t);
    if (isStart) {
      if (pa.kind === 'ball') this._ballHit(a, pb, b);
      else if (pb.kind === 'ball') this._ballHit(b, pa, a);
      else if (pa.kind === 'part' && pb.kind === 'part' && pa.owner !== pb.owner) {
        const rv = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y) / STEP_SCALE;
        if (rv > 4) this.events.push({ type: 'bump', speed: fromMatterVel(rv), x: a.position.x, y: a.position.y });
      }
    }
  }

  _support(p, other, body, otherBody, t) {
    if (p.kind !== 'part') return;
    if (other.kind === 'ground') {
      p.owner.markSupport(p.part === 'leg' ? 'legs' : 'body', t);
    } else if (other.kind === 'part' && other.owner !== p.owner && p.part === 'leg'
      && body.position.y < otherBody.position.y && t - other.owner.lastGround < 0.12) {
      p.owner.markSupport('legs', t, false); // standing on a grounded player: stack jump
    }
  }

  _ballHit(ballBody, other, otherBody) {
    const v = ballBody.velocity;
    const ov = otherBody.isStatic ? { x: 0, y: 0 } : otherBody.velocity;
    const speed = fromMatterVel(Math.hypot(v.x - ov.x, v.y - ov.y) / STEP_SCALE);
    if (speed < 60) return;
    if (other.kind === 'rim') this._swingNet(otherBody.position.x, speed);
    this.events.push({ type: 'impact', kind: other.kind, speed, x: ballBody.position.x, y: ballBody.position.y });
  }

  _swingNet(x, speed) {
    const hoop = this.hoops[x < this.W / 2 ? 0 : 1];
    hoop.netVel += Math.min(speed, 900) * 0.004 * (Math.random() < 0.5 ? -1 : 1);
  }

  /**
   * Advance one fixed physics step.
   * @param {[boolean, boolean]} controls  button state per team
   */
  step(controls) {
    const t = this.time;
    const ball = this.ball;

    // Release edge = shoot, if that team is holding the ball.
    for (let team = 0; team < 2; team++) {
      if (this.prevControls[team] && !controls[team] && ball.holder && ball.holder.team === team) {
        const hoop = this.hoops[ball.holder.dir > 0 ? 1 : 0];
        const shot = ball.shoot(hoop, t);
        if (shot) this.events.push({ type: 'throw', team, x: ball.pos.x, y: ball.pos.y });
      }
      this.prevControls[team] = controls[team];
    }

    for (const ch of this.chars) {
      const jumped = ch.update(controls[ch.team], this._steer(ch), t, DT);
      if (jumped) this.events.push({ type: 'jump', team: ch.team, x: ch.x, y: ch.y });
    }

    const be = ball.update(this.chars, t, DT);
    if (be) this.events.push({ type: be, team: ball.holder ? ball.holder.team : null, x: ball.pos.x, y: ball.pos.y });
    if (ball.holder && ball.holdTime > MAX_HOLD_TIME) {
      ball.release(t);
      this.events.push({ type: 'loose' });
    }

    this.physics.step();

    // Basket detection (one basket per round).
    if (!this.scored) {
      const vy = ball.body.velocity.y;
      for (let i = 0; i < 2; i++) {
        if (this.sensors[i].check(ball.pos, vy)) {
          const hoop = this.hoops[i];
          const team = hoop.scoringTeam;
          const dunk = !!ball.holder;
          const ownGoal = ball.lastHolderTeam !== null && ball.lastHolderTeam !== team;
          this.scored = { team, hoop, dunk, ownGoal, time: this.time };
          hoop.netVel += 0.25 * (Math.random() < 0.5 ? -1 : 1);
          this.events.push({ type: 'score', team, dunk, ownGoal, x: hoop.centerX, y: hoop.rimY });
        }
      }
    } else {
      for (const s of this.sensors) s.prevY = ball.pos.y;
    }

    // Net spring animation.
    for (const h of this.hoops) {
      h.netVel += -h.netSwing * 0.02;
      h.netVel *= 0.96;
      h.netSwing += h.netVel * 0.5;
    }

    this._rescue();
  }

  _rescue() {
    const ball = this.ball;
    const p = ball.pos;
    const bad = !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.y > GROUND_Y + 60 || p.x < -50 || p.x > this.W + 50;
    if (bad || ball.restTimer > BALL_STUCK_TIME) {
      ball.release(this.time);
      this.dropBall();
    }
    for (const ch of this.chars) ch.sanitize(this.W);
  }

  /** Preferred hop direction: chase the ball, or push towards the hoop with it. */
  _steer(ch) {
    const ball = this.ball;
    if (ball.holder && ball.holder.team === ch.team) {
      const hoop = this.hoops[ch.dir > 0 ? 1 : 0];
      const goalX = hoop.centerX - ch.dir * (ball.holder === ch ? 140 : 320);
      return clamp((goalX - ch.x) / 260, -1, 1);
    }
    let target = ball.pos.x;
    // Defenders lean slightly towards their own hoop side of the ball.
    if (ball.holder) target -= ch.dir * 60;
    return clamp((target - ch.x) / 240, -1, 1);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  destroy() {
    this.physics.destroy();
  }
}

export const STEP_DT = DT;
