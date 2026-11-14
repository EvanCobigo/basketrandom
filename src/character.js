// Articulated ragdoll player: torso, head, two legs and one throwing arm, all
// joined by pivot constraints and driven by soft PD "muscles". A single button
// makes the whole thing hop and swing its arm, which is where the chaos comes from.

import M from './matterRef.js';
import { GROUND_Y, JUMP_COOLDOWN, SUPPORT_GRACE } from './config.js';
import { angularMotor, absoluteMotor, toMatterVel, wrapAngle } from './physics.js';
import { rand } from './rng.js';

const { Bodies, Body, Constraint } = M;

export class Character {
  /**
   * @param {PhysicsWorld} physics
   * @param {object} o  { x, team, index, dims, appearance }
   */
  constructor(physics, o) {
    this.physics = physics;
    this.team = o.team;
    this.index = o.index;
    this.dir = o.team === 0 ? 1 : -1;          // attack direction (+1 = towards right hoop)
    this.dims = o.dims;
    this.look = o.appearance;
    this.group = Body.nextGroup(true);         // own parts never collide with each other
    this.spawnX = o.x;

    this.lastSupport = -10;
    this.lastGround = -10;
    this.supportKind = 'legs';
    this.lastJump = -10;
    this.kickTimer = 0;
    this.pressed = false;
    this.armRaise = 0;                         // 0 = resting, 1 = fully raised (for rendering/aim)
    this.jumps = 0;

    this._build(o.x);
  }

  _build(x) {
    const d = this.dims;
    const g = GROUND_Y;
    const torsoY = g - 2 - d.legLen - d.torsoH / 2;
    const filter = { group: this.group };
    const tag = (b, part) => { b.plugin = { kind: 'part', part, owner: this }; return b; };

    this.torso = tag(Bodies.rectangle(x, torsoY, d.torsoW, d.torsoH, {
      chamfer: { radius: Math.min(d.torsoW, d.torsoH) * 0.35 },
      density: 0.0022, friction: 0.4, restitution: 0.15, frictionAir: 0.012,
      collisionFilter: filter, label: 'torso',
    }), 'torso');

    const neckY = torsoY - d.torsoH / 2;
    this.head = tag(Bodies.circle(x, neckY - d.headR * 0.85, d.headR, {
      density: 0.0012, friction: 0.3, restitution: 0.35, frictionAir: 0.012,
      collisionFilter: filter, label: 'head',
    }), 'head');

    const hipY = torsoY + d.torsoH / 2 - 4;
    const hipOff = d.torsoW * 0.24;
    this.legs = [-1, 1].map((s) => tag(Bodies.rectangle(x + s * hipOff, hipY + d.legLen / 2, d.legW, d.legLen + 4, {
      chamfer: { radius: d.legW * 0.45 },
      density: 0.0025, friction: 1.0, frictionStatic: 2, restitution: 0.05, frictionAir: 0.012,
      collisionFilter: filter, label: 'leg',
    }), 'leg'));

    const shoulderY = torsoY - d.torsoH / 2 + Math.min(12, d.torsoH * 0.2);
    this.shoulderLocal = { x: 0, y: shoulderY - torsoY };
    this.arm = tag(Bodies.rectangle(x, shoulderY + d.armLen / 2, d.armW, d.armLen, {
      chamfer: { radius: d.armW * 0.45 },
      density: 0.0012, friction: 0.5, restitution: 0.2, frictionAir: 0.012,
      collisionFilter: filter, label: 'arm',
    }), 'arm');

    this.parts = [this.torso, this.head, ...this.legs, this.arm];
    // Rest-pose offsets relative to the torso, used to re-assemble on teleport.
    this.restOffsets = this.parts.map((p) => ({ x: p.position.x - x, y: p.position.y - torsoY }));

    const pin = (bodyA, pointA, bodyB, pointB, stiffness = 0.95) => Constraint.create({
      bodyA, pointA, bodyB, pointB, length: 0, stiffness, damping: 0.05, render: { visible: false },
    });
    this.joints = [
      pin(this.torso, { x: 0, y: -d.torsoH / 2 + 2 }, this.head, { x: 0, y: d.headR * 0.85 }, 0.8),
      ...this.legs.map((leg, i) => pin(this.torso, { x: (i ? 1 : -1) * hipOff, y: d.torsoH / 2 - 4 }, leg, { x: 0, y: -d.legLen / 2 })),
      pin(this.torso, this.shoulderLocal, this.arm, { x: 0, y: -d.armLen / 2 }),
    ];

    this.physics.add([...this.parts, ...this.joints]);
  }

  get x() { return this.torso.position.x; }
  get y() { return this.torso.position.y; }

  /** World position of the hand (tip of the arm). */
  hand() {
    const a = this.arm.angle;
    const h = this.dims.armLen / 2;
    return { x: this.arm.position.x - Math.sin(a) * h, y: this.arm.position.y + Math.cos(a) * h };
  }

  shoulder() {
    const a = this.torso.angle;
    const s = this.shoulderLocal;
    return {
      x: this.torso.position.x + s.x * Math.cos(a) - s.y * Math.sin(a),
      y: this.torso.position.y + s.x * Math.sin(a) + s.y * Math.cos(a),
    };
  }

  /** Velocity of the hand point in Matter units (px per 16.67ms). */
  handVelocity() {
    const v = Body.getVelocity(this.arm);
    const w = Body.getAngularVelocity(this.arm);
    const h = this.hand();
    const rx = h.x - this.arm.position.x;
    const ry = h.y - this.arm.position.y;
    return { x: v.x - w * ry, y: v.y + w * rx };
  }

  markSupport(kind, t, ground = true) {
    // Feet give a full jump; landing on your back or head gives a weaker flop.
    if (kind === 'legs' || t - this.lastSupport > SUPPORT_GRACE) this.supportKind = kind;
    this.lastSupport = t;
    if (ground) this.lastGround = t;
  }

  armTargets() {
    return { rest: -this.dir * 0.3, raised: -this.dir * (Math.PI - 0.5) };
  }

  /**
   * Called every physics step.
   * @param {boolean} pressed  team button state
   * @param {number}  steer    -1..1 preferred horizontal direction for hops
   * @param {number}  t        physics time (s)
   * @returns {boolean} true if a jump happened this step
   */
  update(pressed, steer, t, dt) {
    this.pressed = pressed;
    const grounded = t - this.lastSupport < SUPPORT_GRACE;
    const tilt = wrapAngle(this.torso.angle);

    // Balance reflex: strong on the ground, weak in the air so jumps tumble.
    const lean = steer * 0.12;
    if (grounded) absoluteMotor(this.torso, lean, this.supportKind === 'legs' ? 0.02 : 0.012, 0.05);
    else absoluteMotor(this.torso, lean, 0.002, 0.003);

    // Neck keeps the head roughly aligned (with a wobble).
    angularMotor(this.torso, this.head, 0, 0.06, 0.12);

    // Legs: splay slightly, kick back briefly after a jump.
    this.kickTimer = Math.max(0, this.kickTimer - dt);
    const kick = this.kickTimer > 0 ? this.dir * 0.55 : 0;
    angularMotor(this.torso, this.legs[0], 0.14 + kick, 0.09, 0.18);
    angularMotor(this.torso, this.legs[1], -0.14 + kick, 0.09, 0.18);

    // Arm swings up through the front while the button is held.
    const { rest, raised } = this.armTargets();
    angularMotor(this.torso, this.arm, pressed ? raised : rest, 0.22, 0.32);
    const rel = wrapAngle(this.arm.angle - this.torso.angle);
    this.armRaise = Math.max(0, Math.min(1, (rel - rest) / (raised - rest)));

    let jumped = false;
    if (pressed && grounded && t - this.lastJump > JUMP_COOLDOWN) {
      this._jump(steer, tilt);
      this.lastJump = t;
      jumped = true;
    }
    return jumped;
  }

  _jump(steer, tilt) {
    // Mix the torso's own "up" with a steered world direction: a tilted player
    // launches sideways, an upright one hops forward. This is the main source
    // of the floppy unpredictability.
    const ux = Math.sin(tilt);
    const uy = -Math.cos(tilt);
    let wx = steer * 0.55;
    let wy = -1;
    const wl = Math.hypot(wx, wy);
    wx /= wl; wy /= wl;
    let dx = ux * 0.45 + wx * 0.55;
    let dy = uy * 0.45 + wy * 0.55;
    if (dy > -0.4) dy = -0.4;                        // never launch into the floor
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;

    const power = this.supportKind === 'legs' ? 1 : 0.7;
    const speed = this.physics.cfg.jumpSpeed * power * rand(0.93, 1.07);
    const vx = toMatterVel(dx * speed);
    const vy = toMatterVel(dy * speed);
    for (const p of this.parts) {
      const v = Body.getVelocity(p);
      Body.setVelocity(p, { x: v.x * 0.35 + vx, y: Math.min(v.y, 0) * 0.2 + vy });
    }
    // Forward tumble + a pinch of randomness.
    const spin = (Math.sign(steer || this.dir) * 0.045 + rand(-0.025, 0.025)) * (this.supportKind === 'legs' ? 1 : 1.8);
    Body.setAngularVelocity(this.torso, Body.getAngularVelocity(this.torso) + spin);
    this.kickTimer = 0.22;
    this.jumps++;
  }

  /** Bring a body back if it somehow escaped the court. */
  sanitize(W) {
    const p = this.torso.position;
    const bad = !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < -80 || p.x > W + 80 || p.y > GROUND_Y + 120;
    if (!bad) return false;
    const x = Math.max(80, Math.min(W - 80, Number.isFinite(p.x) ? p.x : this.spawnX));
    this.teleport(x);
    return true;
  }

  teleport(x) {
    const d = this.dims;
    const torsoY = GROUND_Y - 2 - d.legLen - d.torsoH / 2 - 40;
    this.parts.forEach((p, i) => {
      Body.setAngle(p, 0);
      Body.setPosition(p, { x: x + this.restOffsets[i].x, y: torsoY + this.restOffsets[i].y });
      Body.setVelocity(p, { x: 0, y: 0 });
      Body.setAngularVelocity(p, 0);
    });
  }

  partsTouchingY() {
    let max = -Infinity;
    for (const p of this.parts) max = Math.max(max, p.bounds.max.y);
    return max;
  }
}
