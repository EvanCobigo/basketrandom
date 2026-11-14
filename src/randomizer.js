// Round randomization: every round gets a fresh set of physical and visual
// parameters. Both teams always share the same physics/proportions so a round
// is never one-sided; only cosmetic appearance differs per player.

import { rand, randInt, pick, chance, shuffle } from './rng.js';
import { THEMES } from './themes.js';
import { TEAM_COLORS } from './config.js';

const BASE = {
  courtWidth: 1600,
  rimHeight: 445,          // above the floor
  gravity: 2300,           // px/s^2
  jumpHeight: 330,         // px of apex height for a clean jump
  ballRadius: 32,
  ballRestitution: 0.72,
  body: { torsoW: 50, torsoH: 86, legLen: 74, legW: 19, headR: 30, armLen: 70, armW: 15 },
};

// Each modifier tweaks the config. `group` keeps contradictory ones apart.
const MODIFIERS = [
  { id: 'bigBall', group: 'ball', label: 'BIG BALL', apply: (c) => { c.ballRadius *= rand(1.4, 1.55); } },
  { id: 'tinyBall', group: 'ball', label: 'TINY BALL', apply: (c) => { c.ballRadius *= rand(0.6, 0.68); } },
  { id: 'bouncy', group: 'bounce', label: 'BOUNCY BALL', apply: (c) => { c.ballRestitution = rand(0.88, 0.94); } },
  { id: 'dead', group: 'bounce', label: 'FLAT BALL', apply: (c) => { c.ballRestitution = rand(0.32, 0.42); } },
  { id: 'longLegs', group: 'legs', label: 'LONG LEGS', apply: (c) => { c.body.legLen *= rand(1.6, 1.9); } },
  { id: 'stubby', group: 'legs', label: 'STUBBY LEGS', apply: (c) => { c.body.legLen *= rand(0.5, 0.62); c.jumpHeight *= 1.1; } },
  { id: 'bigHead', group: 'head', label: 'BIG HEADS', apply: (c) => { c.body.headR *= rand(1.55, 1.8); } },
  { id: 'tinyHead', group: 'head', label: 'TINY HEADS', apply: (c) => { c.body.headR *= rand(0.55, 0.65); } },
  { id: 'tall', group: 'torso', label: 'TALL BODIES', apply: (c) => { c.body.torsoH *= rand(1.35, 1.55); c.body.torsoW *= 0.9; } },
  { id: 'chunky', group: 'torso', label: 'CHUNKY', apply: (c) => { c.body.torsoW *= rand(1.45, 1.65); c.body.torsoH *= 0.85; } },
  { id: 'longArms', group: 'arms', label: 'LONG ARMS', apply: (c) => { c.body.armLen *= rand(1.45, 1.65); } },
  { id: 'lowGrav', group: 'gravity', label: 'LOW GRAVITY', apply: (c) => { c.gravity *= rand(0.5, 0.62); } },
  { id: 'heavy', group: 'gravity', label: 'HEAVY GRAVITY', apply: (c) => { c.gravity *= rand(1.35, 1.5); } },
  { id: 'superJump', group: 'jump', label: 'SUPER JUMP', apply: (c) => { c.jumpHeight *= rand(1.35, 1.5); } },
  { id: 'weakJump', group: 'jump', label: 'WEAK JUMP', apply: (c) => { c.jumpHeight *= rand(0.72, 0.8); } },
  { id: 'wide', group: 'court', label: 'WIDE COURT', apply: (c) => { c.courtWidth = rand(1980, 2150); } },
  { id: 'narrow', group: 'court', label: 'TINY COURT', apply: (c) => { c.courtWidth = rand(1260, 1360); } },
  { id: 'highHoops', group: 'hoops', label: 'HIGH HOOPS', apply: (c) => { c.rimHeight *= rand(1.14, 1.2); } },
  { id: 'lowHoops', group: 'hoops', label: 'LOW HOOPS', apply: (c) => { c.rimHeight *= rand(0.78, 0.84); } },
];

const SKINS = ['#ffdbb5', '#f1c08c', '#d99a64', '#b0703f', '#7d4b2a', '#5a3420', '#ffe7cf'];
const HAIR_COLORS = ['#1d1a18', '#4a2c18', '#8a5a2b', '#d9a441', '#e8e1d0', '#c2452d', '#2f3e8f', '#2d8a4a'];
const HAIR_STYLES = ['bald', 'flat', 'spiky', 'afro', 'cap', 'headband', 'mohawk', 'bun'];
const SHOE_COLORS = ['#ffffff', '#222222', '#f4d03f', '#e74c3c', '#7dd3fc', '#a3e635'];

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function makeAppearance(team) {
  const tc = TEAM_COLORS[team];
  return {
    skin: pick(SKINS),
    hair: pick(HAIR_STYLES),
    hairColor: pick(HAIR_COLORS),
    jersey: shade(tc.main, randInt(-18, 18)),
    trim: tc.dark,
    shorts: chance(0.5) ? tc.dark : shade(tc.main, -45),
    shoes: pick(SHOE_COLORS),
    number: randInt(0, 99),
    mustache: chance(0.18),
    eyeStyle: pick(['dot', 'dot', 'wide', 'sleepy', 'angry']),
    brow: chance(0.5),
  };
}

function decorSeeds() {
  // Pre-rolled decoration layout so rendering is stable within a round.
  const items = [];
  for (let i = 0; i < 70; i++) items.push({ x: Math.random(), y: Math.random(), s: Math.random(), c: Math.random() });
  return items;
}

/**
 * Builds the config for a round. `prevThemeId` avoids repeating environments.
 */
export function generateRound(roundIndex, prevThemeId = null) {
  const cfg = JSON.parse(JSON.stringify(BASE));
  cfg.round = roundIndex;

  // Environment
  const themes = THEMES.filter((t) => t.id !== prevThemeId);
  cfg.theme = roundIndex === 1 ? THEMES[0] : pick(themes);

  // Mild jitter on everything so even "plain" rounds feel different.
  cfg.courtWidth *= rand(0.94, 1.08);
  cfg.rimHeight *= rand(0.95, 1.06);
  cfg.gravity *= rand(0.9, 1.12);
  cfg.jumpHeight *= rand(0.92, 1.1);
  cfg.ballRadius *= rand(0.9, 1.12);
  cfg.ballRestitution += rand(-0.06, 0.06);
  for (const k of Object.keys(cfg.body)) cfg.body[k] *= rand(0.9, 1.12);

  // Pick modifiers: round 1 is calm, later rounds get 1-3 twists.
  const count = roundIndex === 1 ? (chance(0.5) ? 1 : 0) : pick([1, 2, 2, 3]);
  const used = new Set();
  cfg.modifiers = [];
  if (cfg.theme.lowGravity) {
    cfg.gravity *= 0.45;
    used.add('gravity');
    cfg.modifiers.push('MOON GRAVITY');
  }
  for (const m of shuffle(MODIFIERS)) {
    if (cfg.modifiers.length >= count + (cfg.theme.lowGravity ? 1 : 0)) break;
    if (used.has(m.group)) continue;
    used.add(m.group);
    m.apply(cfg);
    cfg.modifiers.push(m.label);
  }
  if (cfg.theme.id === 'ice') cfg.modifiers.push('SLIPPERY FLOOR');

  cfg.ballRestitution = Math.min(0.95, Math.max(0.3, cfg.ballRestitution * cfg.theme.bounceMul));
  cfg.floorFriction = cfg.theme.friction;

  // ---- Fairness / playability guards ----
  const b = cfg.body;
  const standingReach = b.legLen + b.torsoH + b.armLen * 0.85;
  const needed = cfg.rimHeight + cfg.ballRadius + 25 - standingReach;
  if (cfg.jumpHeight < needed) cfg.jumpHeight = needed;          // hoop must be reachable
  cfg.jumpHeight = Math.min(cfg.jumpHeight, 600);
  // Keep total hang time sane regardless of gravity (prevents moon floatiness from being endless).
  cfg.jumpSpeed = Math.sqrt(2 * cfg.gravity * cfg.jumpHeight);

  // Appearance
  cfg.appearances = [makeAppearance(0), makeAppearance(0), makeAppearance(1), makeAppearance(1)];
  cfg.decor = decorSeeds();
  return cfg;
}
