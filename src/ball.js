// The basketball: a bouncy Matter circle plus the possession model. A held
// ball is *not* glued — it is steered towards the hand with velocity each step,
// so it still collides with rims, boards and opponents and can be knocked loose.

import M from './matterRef.js';
import { GROUND_Y, GRAB_COOLDOWN_SELF, GRAB_COOLDOWN_STEAL, STEAL_MIN_HOLD, STEP_MS, BASE_DELTA } from './config.js';
import { toMatterVel, fromMatterVel, wrapAngle } from './physics.js';
import { gauss, rand } from './rng.js';

const { Bodies, Body } = M;
const STEP_SCALE = STEP_MS / BASE_DELTA;          // Matter velocity -> displacement per step

export class Ball {
  constructor(physics, cfg) {
    this.physics = physics;
    this.cfg = cfg;
    this.R = cfg.ballRadius;
    // Mass scales gently with size so big balls feel heavy but stay playable.
    const density = 0.0009 * Math.pow(32 / this.R, 0.6);
    this.body = Bodies.circle(physics.W / 2, 160, this.R, {
      restitution: cfg.ballRestitution,
      friction: 0.06,
      frictionStatic: 0.2,
      frictionAir: 0.0004,
      density,
      label: 'ball',
    });
    this.body.plugin = { kind: 'ball', owner: this };
    physics.add(this.body);

    this.holder = null;
    this.holdTime = 0;
    this.noGrab = new Map();          // character -> time until which it cannot grab
    this.ignoreGroupUntil = 0;        // thrower's parts pass through the ball briefly
    this.lastToucherTeam = null;
    this.lastHolderTeam = null;
    this.frozen = false;              // held in place during countdown
    this.restTimer = 0;
    this.trail = [];
    this.contacts = new Map();        // character -> last body-contact time
  }

  get pos() { return this.body.position; }

  drop(x, y, vx = 0) {
    this.release(0);
    this.spawn = { x, y };
    Body.setPosition(this.body, { x, y });
    Body.setVelocity(this.body, { x: toMatterVel(vx), y: 0 });
    Body.setAngularVelocity(this.body, rand(-0.1, 0.1));
    this.restTimer = 0;
    this.trail.length = 0;
  }

  release(t) {
    if (this.holder) {
      this.noGrab.set(this.holder, t + GRAB_COOLDOWN_SELF);
      this.ignoreGroupUntil = t + 0.14;
    }
    this.holder = null;
    this.holdTime = 0;
  }

  _take(ch, t) {
    if (this.holder && this.holder !== ch) this.noGrab.set(this.holder, t + GRAB_COOLDOWN_STEAL);
    this.holder = ch;
    this.holdTime = 0;
    this.lastToucherTeam = ch.team;
    this.lastHolderTeam = ch.team;
    this.body.collisionFilter.group = ch.group;
  }

  /** Body contact from the collision system (any part of a player). */
  touch(ch, t) {
    this.lastToucherTeam = ch.team;
    this.contacts.set(ch, t);
  }

  canGrab(ch, t) {
    return (this.noGrab.get(ch) || -1) < t;
  }

  /**
   * Possession and held-ball steering. Returns an event string or null.
   */
  update(chars, t, dt) {
    const b = this.body;
    if (this.frozen) {
      Body.setPosition(b, this.spawn);
      Body.setVelocity(b, { x: 0, y: 0 });
      return null;
    }

    let event = null;
    const grabDist = (ch) => this.R + ch.dims.armW * 0.9 + 4;

    if (!this.holder) {
      if (t > this.ignoreGroupUntil) b.collisionFilter.group = 0;
      let best = null;
      let bestD = Infinity;
      for (const ch of chars) {
        if (!this.canGrab(ch, t)) continue;
        const h = ch.hand();
        const d = Math.hypot(h.x - b.position.x, h.y - b.position.y);
        if (d < grabDist(ch) && d < bestD) { best = ch; bestD = d; }
      }
      // Floor scoop: a ball rolling low on the floor that bumps any body part
      // gets picked up, so a dead ball can never strand the hands.
      if (!best && b.position.y > GROUND_Y - this.R * 2.2) {
        for (const [ch, ct] of this.contacts) {
          if (t - ct < 0.05 && this.canGrab(ch, t)) { best = ch; break; }
        }
      }
      if (best) { this._take(best, t); event = 'grab'; }
    } else {
      this.holdTime += dt;
      // Opponents can swipe it out of your hand.
      if (this.holdTime > STEAL_MIN_HOLD) {
        for (const ch of chars) {
          if (ch.team === this.holder.team || !this.canGrab(ch, t)) continue;
          const h = ch.hand();
          const d = Math.hypot(h.x - b.position.x, h.y - b.position.y);
          if (d < grabDist(ch) * 0.95) { this._take(ch, t); event = 'steal'; break; }
        }
      }
    }

    if (this.holder) {
      const ch = this.holder;
      const h = ch.hand();
      const s = ch.shoulder();
      let ox = h.x - s.x;
      let oy = h.y - s.y;
      const ol = Math.hypot(ox, oy) || 1;
      ox /= ol; oy /= ol;
      const tx = h.x + ox * this.R * 0.75;
      const ty = h.y + oy * this.R * 0.75;
      const ex = tx - b.position.x;
      const ey = ty - b.position.y;
      const scooping = this.holdTime < 0.3;   // pulled up from the floor: no knock-loose yet
      if (!scooping && Math.hypot(ex, ey) > this.R * 2.8) {
        // Knocked loose by a rim, a wall or a body.
        this.release(t);
        event = 'loose';
      } else {
        const hv = ch.handVelocity();
        const pull = (scooping ? 0.25 : 0.5) / STEP_SCALE;
        Body.setVelocity(b, { x: hv.x + ex * pull, y: hv.y + ey * pull });
        Body.setAngularVelocity(b, Body.getAngularVelocity(b) * 0.9 + Body.getAngularVelocity(ch.arm) * 0.1);
      }
    }

    // Rolling resistance on the floor so loose balls settle instead of rolling forever.
    if (!this.holder && b.position.y > GROUND_Y - this.R - 3) {
      const v = Body.getVelocity(b);
      Body.setVelocity(b, { x: v.x * 0.993, y: v.y });
    }

    // Track resting-off-the-floor time to rescue balls stuck on boards/heads.
    const speed = fromMatterVel(Math.hypot(b.velocity.x, b.velocity.y) / STEP_SCALE);
    if (!this.holder && speed < 40 && b.position.y < GROUND_Y - this.R - 30) this.restTimer += dt;
    else this.restTimer = 0;

    this.trail.push({ x: b.position.x, y: b.position.y });
    if (this.trail.length > 10) this.trail.shift();
    return event;
  }

  /**
   * Shoot towards a hoop. Aim is a ballistic solution degraded by how clean
   * the shot was: body tilt, arm elevation, distance and body speed all add
   * noise, so a calm, upright jump-shot near the hoop usually drops while
   * tumbling hail-marys mostly clank.
   */
  shoot(hoop, t) {
    const ch = this.holder;
    if (!ch) return null;
    const b = this.body;
    const g = this.cfg.gravity;
    const px = b.position.x;
    const py = b.position.y;
    const tx = hoop.centerX;
    const ty = hoop.rimY - 6;
    const dx = tx - px;
    const adx = Math.abs(dx);
    const up = py - ty;                               // +: target above launch point

    const tilt = Math.abs(wrapAngle(ch.torso.angle));
    const bodySpeed = fromMatterVel(Math.hypot(ch.torso.velocity.x, ch.torso.velocity.y) / STEP_SCALE);
    const elev = ch.armRaise;
    const distF = Math.min(1, adx / (this.physics.W * 0.75));

    let vx;
    let vy;
    if (adx < this.R * 1.2 && up < 0) {
      // Directly over the rim: just let it go (dunk-ish).
      vx = Math.sign(dx) * 60;
      vy = 60;
    } else {
      let theta = (52 + 12 * (1 - distF)) * Math.PI / 180;
      if (adx < 220) theta = 66 * Math.PI / 180;
      let denom = adx * Math.tan(theta) - up;
      while (denom < 20 && theta < 1.45) { theta += 0.05; denom = adx * Math.tan(theta) - up; }
      denom = Math.max(denom, 20);
      let v = Math.sqrt((g * adx * adx) / (2 * Math.cos(theta) ** 2 * denom));

      const sigma = 0.03
        + 0.07 * Math.min(1, tilt / 1.2)
        + 0.07 * distF
        + 0.06 * (1 - elev)
        + 0.03 * Math.min(1, bodySpeed / 900);
      v *= 1 + gauss() * sigma;
      theta += gauss() * sigma * 0.55;
      vx = Math.sign(dx || ch.dir) * v * Math.cos(theta);
      vy = -v * Math.sin(theta);
      // A bit of the arm's own swing leaks in.
      const hv = ch.handVelocity();
      vx += fromMatterVel(hv.x) * 0.08;
      vy += fromMatterVel(hv.y) * 0.04;
    }

    this.release(t);
    Body.setVelocity(b, { x: toMatterVel(vx), y: toMatterVel(vy) });
    Body.setAngularVelocity(b, -Math.sign(vx) * 0.12);   // backspin
    return { from: ch, vx, vy };
  }
}
