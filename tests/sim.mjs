// Headless CPU-vs-CPU simulation used to sanity-check and tune the physics.
// Usage: node tests/sim.mjs [rounds] [seed]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.Matter = require('../vendor/matter.min.js');

const { setRandomSource, seeded } = await import('../src/rng.js');
const { generateRound } = await import('../src/randomizer.js');
const { Match, STEP_DT } = await import('../src/match.js');
const { CpuController } = await import('../src/ai.js');

const rounds = Number(process.argv[2] || 12);
const seed = Number(process.argv[3] || 1);
setRandomSource(seeded(seed));

const ROUND_LIMIT = 60; // seconds of sim before we call a round stalled
let failures = 0;
const stats = { scored: 0, stalled: 0, times: [], shots: 0, grabs: 0, jumps: 0, dunks: 0, own: 0, steals: 0, rescues: 0, tumbles: 0 };
let prevTheme = null;

for (let r = 1; r <= rounds; r++) {
  const cfg = generateRound(r, prevTheme);
  prevTheme = cfg.theme.id;
  const m = new Match(cfg);
  const cpus = [new CpuController(0, 0.6), new CpuController(1, 0.6)];
  let t = 0;
  let res = null;
  let drops = -1;
  let upsideDown = 0;
  while (t < ROUND_LIMIT) {
    const controls = cpus.map((c) => c.update(m, STEP_DT));
    m.step(controls);
    t += STEP_DT;
    for (const e of m.drainEvents()) {
      if (e.type === 'throw') stats.shots++;
      if (e.type === 'grab') stats.grabs++;
      if (e.type === 'steal') stats.steals++;
      if (e.type === 'jump') stats.jumps++;
      if (e.type === 'drop') drops++;
    }
    for (const ch of m.chars) {
      for (const p of ch.parts) {
        if (!Number.isFinite(p.position.x) || !Number.isFinite(p.position.y)) { failures++; console.log('NaN!', r); }
      }
      if (Math.cos(ch.torso.angle) < -0.3) upsideDown++;
    }
    if (m.scored) { res = m.scored; break; }
  }
  stats.rescues += Math.max(0, drops);
  stats.tumbles += upsideDown * STEP_DT / 4;
  if (res) {
    stats.scored++; stats.times.push(t);
    if (res.dunk) stats.dunks++;
    if (res.ownGoal) stats.own++;
  } else stats.stalled++;
  console.log(`round ${r} ${cfg.theme.id.padEnd(8)} [${cfg.modifiers.join(', ')}] ->`,
    res ? `team ${res.team} in ${t.toFixed(1)}s${res.dunk ? ' DUNK' : ''}${res.ownGoal ? ' OWN' : ''}` : 'STALLED',
    `| upside-down ${(upsideDown * STEP_DT / 4).toFixed(1)}s/player, re-drops ${Math.max(0, drops)}`);
  m.destroy();
}
const avg = stats.times.reduce((a, b) => a + b, 0) / (stats.times.length || 1);
console.log('\nSUMMARY', JSON.stringify({ ...stats, times: undefined, avgTime: +avg.toFixed(1), shotsPerRound: +(stats.shots / rounds).toFixed(1), shotPct: +((stats.scored - stats.dunks) / (stats.shots || 1)).toFixed(2) }));
if (failures) { console.error('FAIL: NaN positions'); process.exit(1); }
