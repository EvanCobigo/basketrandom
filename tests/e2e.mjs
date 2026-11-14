// End-to-end browser test: drives the real page with Playwright through the
// whole flow (menu, controls, pause, full match to victory, rematch, menu,
// vs-CPU, mute, mobile layout). Usage: node tests/e2e.mjs [--shots dir]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsIdx = process.argv.indexOf('--shots');
const shotDir = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

const port = 8000 + Math.floor(Math.random() * 900);
const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
await new Promise((res) => server.stdout.once('data', res));

let failed = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failed++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name + '.png') }); };
  const g = (fn, arg) => page.evaluate(fn, arg);

  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.__game);
  check(await page.isVisible('#menu'), 'main menu visible on load');
  const b0 = await g(() => ({ ...window.__game.match.ball.pos }));
  await wait(600);
  const b1 = await g(() => ({ ...window.__game.match.ball.pos }));
  check(b0.x !== b1.x || b0.y !== b1.y, 'demo match animates behind the menu');
  await shot('01-menu');

  await page.click('[data-action="howto"]');
  check(await page.isVisible('#howto'), 'How to play opens');
  await page.click('[data-action="howto"]');
  check(!(await page.isVisible('#howto')), 'How to play closes');

  // ---- 2 player match
  await page.click('[data-action="start-2p"]');
  check(!(await page.isVisible('#menu')), 'menu hidden after start');
  check(await g(() => window.__game.state) === 'countdown', 'countdown state after start');
  check(await g(() => window.__game.match.ball.frozen), 'ball held during countdown');
  await shot('02-countdown');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 5000 });
  check(true, 'countdown -> playing');

  const ys = () => g(() => window.__game.match.chars.map((c) => c.torso.position.y));
  const jumps = () => g(() => window.__game.match.chars.map((c) => c.jumps));
  let j0 = await jumps();
  await page.keyboard.down('KeyW');
  await wait(250);
  await shot('03-p1-jump');
  await page.keyboard.up('KeyW');
  let j1 = await jumps();
  check(j1[0] > j0[0] && j1[1] > j0[1], 'W makes both Player 1 characters jump');
  check(j1[2] === j0[2] && j1[3] === j0[3], 'W does not move Player 2');
  await wait(400);
  j0 = await jumps();
  await page.keyboard.down('ArrowUp');
  await wait(1100);
  j1 = await jumps();
  await page.keyboard.up('ArrowUp');
  check(j1[2] - j0[2] >= 2 && j1[3] - j0[3] >= 2, `holding Up repeats jumps for Player 2 (${j1[2] - j0[2]}, ${j1[3] - j0[3]})`);
  const armUp = await g(() => window.__game.match.chars[2].armRaise);
  check(typeof armUp === 'number', 'arm raise tracked');

  // ---- pause
  await page.keyboard.press('Escape');
  await wait(80);
  check(await page.isVisible('#pause'), 'Escape opens pause menu');
  const p0 = await ys();
  await wait(400);
  const p1 = await ys();
  check(JSON.stringify(p0) === JSON.stringify(p1), 'simulation frozen while paused');
  await shot('04-pause');
  await page.click('[data-action="resume"]');
  check(!(await page.isVisible('#pause')) && !(await g(() => window.__game.paused)), 'Resume button resumes');
  await page.click('#btn-pause');
  await wait(50);
  check(await g(() => window.__game.paused), 'on-screen pause button pauses');
  await page.keyboard.press('KeyP');
  await wait(80);
  check(!(await g(() => window.__game.paused)), 'P toggles pause off');

  // ---- full match driven by the CPU on both sides, sped up
  await g(() => { window.__game.forceCpu = [true, true]; window.__game.speed = 4; });
  const seen = new Set();
  let lastScores = '0,0';
  let scoreSteps = 0;
  let celebrationShot = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const st = await g(() => ({ state: window.__game.state, scores: window.__game.scoreboard.scores.join(','), theme: window.__game.cfg.theme.id, mods: window.__game.cfg.modifiers.join('|') }));
    seen.add(st.theme + ':' + st.mods);
    if (st.scores !== lastScores) {
      const [a0, b0s] = lastScores.split(',').map(Number);
      const [a1, b1s] = st.scores.split(',').map(Number);
      if (a1 + b1s === a0 + b0s + 1) scoreSteps++;
      lastScores = st.scores;
      if (!celebrationShot) { await g(() => { window.__game.speed = 1; }); await wait(250); await shot('05-score'); await g(() => { window.__game.speed = 4; }); celebrationShot = true; }
    }
    if (st.state === 'victory') break;
    await wait(150);
  }
  const final = await g(() => ({ state: window.__game.state, scores: window.__game.scoreboard.scores, winner: window.__game.scoreboard.winner, history: window.__game.scoreboard.history.length }));
  check(final.state === 'victory', `match reaches victory (${final.scores.join('-')})`);
  check(Math.max(...final.scores) === 5, 'winner has exactly 5 points');
  check(scoreSteps === final.history, `scores increment one at a time (${scoreSteps} steps)`);
  check(seen.size >= 3, `rounds are randomized (${seen.size} distinct setups)`);
  check(await page.isVisible('#victory'), 'victory screen shown');
  const title = await page.textContent('#victory .v-title');
  check(/WINS/.test(title), `victory title "${title}"`);
  await wait(500);
  await shot('06-victory');

  await page.click('[data-action="rematch"]');
  const rm = await g(() => ({ s: window.__game.scoreboard.scores.join(','), state: window.__game.state, round: window.__game.cfg.round }));
  check(rm.s === '0,0' && rm.state === 'countdown' && rm.round === 1, 'Rematch resets to round 1, 0-0');
  check(!(await page.isVisible('#victory')), 'victory screen closes on rematch');

  // ---- restart and menu from pause
  await page.keyboard.press('Escape');
  await page.click('[data-action="restart"]');
  check(await g(() => window.__game.state) === 'countdown' && !(await page.isVisible('#pause')), 'Restart match from pause');
  await page.keyboard.press('Escape');
  await page.click('#pause [data-action="menu"]');
  check(await page.isVisible('#menu') && await g(() => window.__game.mode) === 'demo', 'Main menu from pause');

  // ---- vs CPU
  await g(() => { window.__game.forceCpu = [false, false]; window.__game.speed = 1; });
  await page.click('[data-action="start-cpu"]');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 5000 });
  const c0 = await jumps();
  await wait(2500);
  const c1 = await jumps();
  check(c1[2] > c0[2] && c1[0] === c0[0], 'CPU drives Player 2 while Player 1 stays idle');
  await shot('07-vs-cpu');

  // ---- mute
  const m0 = await page.textContent('#btn-mute');
  await page.click('#btn-mute');
  const m1 = await page.textContent('#btn-mute');
  check(m0 !== m1, 'mute button toggles');
  await page.keyboard.press('KeyM');
  await wait(80);
  check((await page.textContent('#btn-mute')) === m0, 'M key toggles mute');

  // ---- blur safety: losing focus pauses and clears held keys
  await page.keyboard.down('KeyW');
  await g(() => window.dispatchEvent(new Event('blur')));
  check(!(await g(() => window.__game.input.team(0))), 'held keys cleared on window blur');
  await page.keyboard.up('KeyW');

  // ---- mobile layout
  await page.setViewportSize({ width: 390, height: 844 });
  await wait(300);
  const overflow = await g(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'no horizontal overflow at phone width');
  await shot('08-mobile');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.keyboard.press('Escape');
  await page.click('#pause [data-action="menu"]');
  await wait(300);
  await shot('09-mobile-landscape-menu');

  check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
} finally {
  await browser.close();
  server.kill();
}
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nAll e2e checks passed');
