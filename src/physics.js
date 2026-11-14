// Physics world: Matter.js engine setup, static court geometry, the fixed-step
// update, collision event routing and small helpers used by the ragdolls.

import M from './matterRef.js';
import { GROUND_Y, STEP_MS, BASE_DELTA } from './config.js';

const { Engine, Bodies, Body, Composite, Events } = M;

export const toMatterVel = (pxPerSec) => (pxPerSec * BASE_DELTA) / 1000;
export const fromMatterVel = (v) => (v * 1000) / BASE_DELTA;

export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * PD "muscle" that drives the relative angle (b.angle - a.angle) toward
 * `target`. The correction is split by inertia so the joint conserves angular
 * momentum and the reaction visibly jostles the parent body.
 */
export function angularMotor(a, b, target, k, d) {
  const rel = wrapAngle(b.angle - a.angle - target);
  const wa = Body.getAngularVelocity(a);
  const wb = Body.getAngularVelocity(b);
  const corr = -(k * rel + d * (wb - wa));
  const ia = a.inertia;
  const ib = b.inertia;
  const sum = ia + ib;
  Body.setAngularVelocity(b, wb + (corr * ia) / sum);
  Body.setAngularVelocity(a, wa - (corr * ib) / sum);
}

/** Pulls a single body's absolute angle toward `target` (balance reflex). */
export function absoluteMotor(body, target, k, d) {
  const err = wrapAngle(body.angle - target);
  const w = Body.getAngularVelocity(body);
  Body.setAngularVelocity(body, w - k * err - d * w);
}

export class PhysicsWorld {
  constructor(cfg) {
    this.cfg = cfg;
    this.W = cfg.courtWidth;
    this.groundY = GROUND_Y;
    this.engine = Engine.create({
      gravity: { x: 0, y: 1, scale: cfg.gravity / 1e6 },
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 4,
      enableSleeping: false,
    });
    this.world = this.engine.world;
    this.pairListeners = [];
    this.time = 0;

    this._buildCourt();

    Events.on(this.engine, 'collisionStart', (e) => this._dispatch(e.pairs, true));
    Events.on(this.engine, 'collisionActive', (e) => this._dispatch(e.pairs, false));
  }

  onPair(fn) { this.pairListeners.push(fn); }

  _dispatch(pairs, isStart) {
    for (const fn of this.pairListeners) {
      for (let i = 0; i < pairs.length; i++) fn(pairs[i], isStart);
    }
  }

  add(obj) { Composite.add(this.world, obj); }
  remove(obj) { Composite.remove(this.world, obj); }

  _static(x, y, w, h, kind, extra = {}) {
    const b = Bodies.rectangle(x, y, w, h, { isStatic: true, label: kind, ...extra });
    b.plugin = { kind };
    this.add(b);
    return b;
  }

  _buildCourt() {
    const { W, groundY, cfg } = this;
    this.ground = this._static(W / 2, groundY + 150, W + 600, 300, 'ground', {
      friction: cfg.floorFriction,
      frictionStatic: cfg.floorFriction * 1.2,
      restitution: 0.1,
    });
    this.walls = [
      this._static(-60, groundY - 1200, 120, 3000, 'wall', { friction: 0.05, restitution: 0.4 }),
      this._static(W + 60, groundY - 1200, 120, 3000, 'wall', { friction: 0.05, restitution: 0.4 }),
    ];
    this.ceiling = this._static(W / 2, -760, W + 600, 120, 'wall', { restitution: 0.3 });
    this.hoops = [this._buildHoop(-1), this._buildHoop(1)];
  }

  /**
   * side -1 = left wall hoop, +1 = right wall hoop.
   * The hoop is a backboard (static rect) and a front-rim knob (static circle);
   * the gap between them is the opening the ball has to fall through.
   */
  _buildHoop(side) {
    const { W, groundY, cfg } = this;
    const rimY = groundY - cfg.rimHeight;
    const boardT = 16;
    const boardH = 190;
    const boardX = side < 0 ? 26 : W - 26;              // board centre (a short bracket off the wall)
    const faceX = boardX - side * (boardT / 2);          // court-facing side of the board
    const gap = cfg.ballRadius * 2 * 1.45 + 22;         // clear opening
    const rimR = 6;
    const frontX = faceX - side * (gap + rimR);

    const board = this._static(boardX, rimY - boardH * 0.62, boardT, boardH, 'board', {
      restitution: 0.55, friction: 0.1,
    });
    const rim = Bodies.circle(frontX, rimY, rimR, { isStatic: true, label: 'rim', restitution: 0.55, friction: 0.05 });
    rim.plugin = { kind: 'rim' };
    this.add(rim);
    // Small rim knob at the board so balls do not wedge between board and rim line.
    const backRim = Bodies.circle(faceX - side * 3, rimY, 4, { isStatic: true, label: 'rim', restitution: 0.5 });
    backRim.plugin = { kind: 'rim' };
    this.add(backRim);

    const innerA = faceX - side * 3;
    const innerB = frontX + side * rimR;
    return {
      side,
      rimY,
      board,
      rim,
      boardX,
      boardT,
      boardH,
      faceX,
      frontX,
      rimR,
      xMin: Math.min(innerA, innerB),
      xMax: Math.max(innerA, innerB),
      centerX: (innerA + innerB) / 2,
      // Team that scores by putting the ball in this hoop.
      scoringTeam: side > 0 ? 0 : 1,
      netSwing: 0,
      netVel: 0,
    };
  }

  step() {
    Engine.update(this.engine, STEP_MS);
    this.time += STEP_MS / 1000;
  }

  destroy() {
    Events.off(this.engine);
    Composite.clear(this.world, false);
    Engine.clear(this.engine);
    this.pairListeners.length = 0;
  }
}
