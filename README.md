# Flop Hoops

A chaotic, one-button, 2-vs-2 ragdoll basketball game for the browser. Each player
controls a team of two floppy athletes with a single key. Hop, flail, grab the ball,
and release to shoot. Every round reshuffles the court, the ball and the players.
First team to **5** wins.

## Play

```bash
npm start
```

Then open http://localhost:8080. Nothing to install: Matter.js is vendored in `vendor/`.
Any static file server works too, for example `python3 -m http.server`.

| Action | Player 1 (Sunset) | Player 2 (Lagoon) |
| --- | --- | --- |
| Hop / raise arm | `W` | `↑` |
| Shoot | release `W` while holding the ball | release `↑` while holding the ball |

- Both of a team's characters jump together. Holding the key keeps hopping and keeps the arm raised.
- Touch the ball with a hand to grab it. A low, rolling ball is scooped up by any body part.
  Opponents can swipe a held ball.
- Release the key to shoot. Upright, mid-jump shots from close range are the most accurate.
  Shots get worse when you're tumbling, far away, or haven't raised your arm.
- Carry the ball through the rim to dunk.
- `Esc`/`P` pauses, `M` mutes. On touch screens, tap the left or right half of the screen.
- **1 Player vs CPU** puts a CPU on the Lagoon team.

## Randomized rounds

Each round picks an environment (Hardwood Gym, Sunny Beach, Night Rooftop, Frozen Rink with a
slippery floor, Moon Base with low gravity, City Park). It also rolls 1–3 modifiers, such as big
or tiny ball, bouncy or flat ball, long or stubby legs, big or tiny heads, tall or chunky bodies,
long arms, low or heavy gravity, super or weak jump, wide or tiny court, and high or low hoops.
On top of that, every value gets a small jitter. Both teams always share the same physics and
proportions, and the hoop is always reachable, so rounds stay fair. Player looks (skin, hair,
headwear, face, shoes, numbers) are randomized on their own.

## Architecture

```
index.html, styles.css    page, overlays (menu / pause / victory), responsive layout
vendor/matter.min.js      Matter.js 0.20 physics engine (MIT)
server.js                 zero-dependency static server
src/
  config.js       constants (timestep, timings, tuning, team colors)
  rng.js          random helpers (swappable for a seeded PRNG in tests)
  themes.js       visual environments (+ floor friction / bounce tweaks)
  randomizer.js   per-round config: modifiers, proportions, fairness guards, appearances
  physics.js      Matter engine setup, court/hoop geometry, PD "muscle" motors, collision routing
  character.js    articulated ragdoll (torso, head, 2 legs, arm, pivot joints) + jump/balance control
  ball.js         ball body, possession/steal/scoop model, ballistic shot with skill-based noise
  scoring.js      hoop sensors (downward crossing through the rim opening) + scoreboard
  match.js        one round of simulation (no DOM): steps physics, routes events, rescues stuck states
  ai.js           single-button CPU controller
  input.js        keyboard + touch, blur-safe key tracking
  renderer.js     Canvas 2D drawing: scenery, players, ball, hoops/nets, FX, scoreboard, banners
  effects.js      particles, popups, screen shake, flash
  audio.js        synthesized WebAudio sound effects
  ui.js           DOM overlay management
  game.js         state machine (menu → countdown → playing → scored → next round / victory, pause)
                  and the fixed 120 Hz timestep loop driven by requestAnimationFrame
  main.js         bootstrap
```

### Physics notes

- Fixed 120 Hz simulation steps with an accumulator. Rendering runs on `requestAnimationFrame`.
  The score slow-motion only scales the accumulator, never the step size.
- Each player is five bodies joined by pivot constraints. Their joints are driven by soft
  PD motors that conserve angular momentum. On the ground a weak balance reflex keeps them
  roughly upright. In the air it nearly switches off, so jumps tumble.
- A jump blends the torso's own "up" with a steered direction toward the ball, or toward the
  hoop when your team has the ball. A tilted player launches sideways, and a forward spin kick
  makes players flip.
- A held ball is steered toward the hand with velocity rather than glued in place. It still
  collides with rims, boards and other bodies and can be knocked loose.
- A basket counts only when the ball crosses the rim line moving downward inside the opening.
  A ball that came up through the net from below does not count.

## Tests

```bash
npm run sim   # headless CPU-vs-CPU rounds: checks for NaNs and stalls, prints pacing / shot stats
npm test      # sim + Playwright end-to-end run of the full UI flow (needs `playwright` available)
```

The end-to-end test opens the menu, checks the controls (W/↑, held repeat jumps) and pause /
resume / restart / menu. It then plays a full match to victory with CPUs on both sides at 4× speed
and checks the rematch, vs-CPU mode, mute, blur safety and the phone layout. Pass `--shots <dir>`
to save screenshots.
