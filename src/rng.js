// Small random helpers. All gameplay randomness goes through here so it is easy
// to swap for a seeded generator (the headless tests do this).

let source = Math.random;

export function setRandomSource(fn) { source = fn || Math.random; }

/** Mulberry32 seeded PRNG. */
export function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const random = () => source();
export const rand = (min, max) => min + (max - min) * source();
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const chance = (p) => source() < p;
export const pick = (arr) => arr[Math.floor(source() * arr.length)];

export function gauss() {
  // Box-Muller, clamped to avoid absurd tails
  const u = 1 - source();
  const v = source();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-3, Math.min(3, g));
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(source() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
