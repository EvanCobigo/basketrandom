// Basket detection. A basket counts when the ball centre crosses the rim line
// moving downward while inside the opening. Balls that came up *through* the
// hoop from below are flagged and do not count until they leave the cylinder.

export class HoopSensor {
  constructor(hoop, ballRadius) {
    this.hoop = hoop;
    this.R = ballRadius;
    this.prevY = null;
    this.blocked = false;
  }

  /** @returns {boolean} true on a valid basket this step */
  check(pos, vy) {
    const h = this.hoop;
    const inside = pos.x > h.xMin + this.R * 0.35 && pos.x < h.xMax - this.R * 0.35;
    const prevY = this.prevY;
    this.prevY = pos.y;
    if (prevY === null) return false;

    const loose = pos.x < h.xMin - this.R * 0.5 || pos.x > h.xMax + this.R * 0.5;
    if (loose || pos.y > h.rimY + this.R * 3 || pos.y < h.rimY - this.R * 3) this.blocked = false;

    if (inside && prevY >= h.rimY && pos.y < h.rimY) this.blocked = true;   // came up from below
    if (inside && vy > 0 && prevY < h.rimY && pos.y >= h.rimY && !this.blocked) return true;
    return false;
  }
}

export class Scoreboard {
  constructor(winScore) {
    this.winScore = winScore;
    this.reset();
  }

  reset() {
    this.scores = [0, 0];
    this.history = [];
  }

  award(team, info) {
    this.scores[team]++;
    this.history.push({ team, ...info });
  }

  get winner() {
    if (this.scores[0] >= this.winScore) return 0;
    if (this.scores[1] >= this.winScore) return 1;
    return null;
  }

  get leader() {
    if (this.scores[0] === this.scores[1]) return null;
    return this.scores[0] > this.scores[1] ? 0 : 1;
  }
}
