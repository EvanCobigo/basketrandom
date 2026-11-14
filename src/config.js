// Global, round-independent constants. Everything that varies per round lives
// in the config produced by randomizer.js.

export const VIEW_HEIGHT = 900;          // world units visible vertically
export const GROUND_Y = 800;             // top surface of the floor
export const PHYSICS_HZ = 120;           // fixed simulation rate
export const STEP_MS = 1000 / PHYSICS_HZ;
export const MAX_STEPS_PER_FRAME = 10;   // spiral-of-death guard
export const BASE_DELTA = 1000 / 60;     // Matter.js velocity unit (px per 16.67ms)

export const WIN_SCORE = 5;

// Timings (seconds)
export const COUNTDOWN_TIME = 1.6;
export const CELEBRATE_TIME = 2.2;
export const SLOWMO_TIME = 0.7;
export const SLOWMO_SCALE = 0.3;

// Gameplay tuning
export const JUMP_COOLDOWN = 0.3;        // min seconds between jumps
export const SUPPORT_GRACE = 0.09;       // how long after touching ground a jump is still allowed
export const GRAB_COOLDOWN_SELF = 0.4;   // thrower can't re-grab immediately
export const GRAB_COOLDOWN_STEAL = 0.6;  // someone who lost the ball can't take it right back
export const STEAL_MIN_HOLD = 0.5;       // ball must be held this long before it can be stolen
export const BALL_STUCK_TIME = 2.2;      // resting off the floor this long -> re-drop
export const MAX_HOLD_TIME = 6;          // auto-drop if a player hogs the ball

export const TEAM_NAMES = ['SUNSET', 'LAGOON'];
export const TEAM_COLORS = [
  { main: '#ff6a3d', dark: '#c8401b', light: '#ffb08f', ui: '#ff7a4f' },
  { main: '#2b8cff', dark: '#1458b8', light: '#9cc9ff', ui: '#3d9bff' },
];
