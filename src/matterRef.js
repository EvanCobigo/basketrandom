// Matter.js is loaded as a classic script (vendor/matter.min.js) in the browser,
// and injected onto globalThis by the Node test harness.
const Matter = globalThis.Matter;
if (!Matter) throw new Error('Matter.js must be loaded before the game modules');
export default Matter;
