// Canvas renderer. Reads simulation state and draws it; never mutates it.

import { VIEW_HEIGHT, GROUND_Y, TEAM_COLORS, TEAM_NAMES, WIN_SCORE } from './config.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.time = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = dpr;
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  /** World -> screen transform fitting the whole court. */
  _camera(W) {
    const sw = this.canvas.width;
    const sh = this.canvas.height;
    const scale = Math.min(sw / W, sh / VIEW_HEIGHT);
    const ox = (sw - W * scale) / 2;
    const oy = (sh - VIEW_HEIGHT * scale) / 2;
    return { scale, ox, oy, sw, sh };
  }

  /**
   * @param {object} s  { match, cfg, scores, effects, state, countdown, celebrate }
   */
  render(s, dt) {
    this.time += dt;
    const { ctx } = this;
    const { match, cfg, effects } = s;
    const W = match.W;
    const cam = this._camera(W);
    this.cam = cam;
    const theme = cfg.theme;

    // Letterbox fill uses the theme floor/sky so it never looks broken.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.sky[0];
    ctx.fillRect(0, 0, cam.sw, cam.sh * 0.6);
    ctx.fillStyle = theme.floorEdge;
    ctx.fillRect(0, cam.sh * 0.6, cam.sw, cam.sh * 0.4);

    ctx.setTransform(cam.scale, 0, 0, cam.scale, cam.ox + effects.shakeX * cam.scale, cam.oy + effects.shakeY * cam.scale);
    this._background(theme, cfg, W);
    this._floor(theme, W);
    for (const h of match.hoops) this._hoopBack(h, W);
    this._shadows(match);
    // Draw players sorted so the ball holder is on top.
    const chars = match.chars.slice().sort((a, b) => (a === match.ball.holder) - (b === match.ball.holder));
    for (const ch of chars) this._character(ch, match.ball.holder === ch ? match.ball : null);
    this._ball(match.ball, match);
    for (const h of match.hoops) this._hoopFront(h);
    this._particles(effects);
    this._ballIndicator(match.ball, theme);
    this._popups(effects);

    // Screen-space overlays.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (effects.flash > 0) {
      ctx.globalAlpha = effects.flash;
      ctx.fillStyle = effects.flashColor;
      ctx.fillRect(0, 0, cam.sw, cam.sh);
      ctx.globalAlpha = 1;
    }
    if (s.showHud) this._scoreboard(s, cam);
    if (s.banner) this._banner(s.banner, cam);
  }

  // ---------------------------------------------------------------- scenery

  _background(theme, cfg, W) {
    const { ctx } = this;
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(1, theme.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(-400, -400, W + 800, GROUND_Y + 400);
    const seeds = cfg.decor;
    const t = this.time;

    switch (theme.decor) {
      case 'bleachers': {
        ctx.fillStyle = '#c98f55';
        ctx.fillRect(-400, GROUND_Y - 330, W + 800, 330);
        ctx.globalAlpha = 0.5;
        for (let row = 0; row < 5; row++) {
          const y = GROUND_Y - 300 + row * 58;
          ctx.fillStyle = row % 2 ? '#b77d45' : '#a86f3b';
          ctx.fillRect(-400, y + 28, W + 800, 12);
          for (let i = 0; i < 26; i++) {
            const sd = seeds[(row * 13 + i) % seeds.length];
            const x = (i / 26) * (W + 120) - 40 + sd.x * 30;
            const bob = Math.sin(t * (2 + sd.s * 3) + i) * (2 + sd.c * 2);
            ctx.fillStyle = ['#e85d75', '#4f86c6', '#f6c85f', '#6fb07f', '#9c6fd6', '#f29e4c'][(i + row) % 6];
            ctx.beginPath();
            ctx.ellipse(x, y + 20 + bob, 14, 16, 0, 0, TAU);
            ctx.fill();
            ctx.fillStyle = ['#ffdbb5', '#d99a64', '#7d4b2a', '#f1c08c'][(i * 7 + row) % 4];
            ctx.beginPath();
            ctx.arc(x, y + bob, 10, 0, TAU);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#6d3f1c';
        ctx.fillRect(-400, GROUND_Y - 345, W + 800, 18);
        break;
      }
      case 'sea': {
        ctx.fillStyle = '#fff3a8';
        ctx.beginPath(); ctx.arc(W * 0.78, 170, 70, 0, TAU); ctx.fill();
        this._clouds(seeds, W, '#ffffff', t);
        ctx.fillStyle = '#2b9fd6';
        ctx.fillRect(-400, GROUND_Y - 150, W + 800, 150);
        ctx.fillStyle = '#56c1ec';
        for (let i = 0; i < 14; i++) {
          const x = (i / 14) * (W + 200) - 100 + Math.sin(t + i) * 12;
          ctx.fillRect(x, GROUND_Y - 120 + (i % 3) * 30, 60, 5);
        }
        // umbrellas
        for (const [fx, col] of [[0.12, '#ff5d73'], [0.88, '#ffd23f']]) {
          const x = W * fx;
          ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x, GROUND_Y - 150); ctx.stroke();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(x, GROUND_Y - 150, 80, Math.PI, 0); ctx.fill();
        }
        break;
      }
      case 'city': {
        ctx.fillStyle = '#fff6d5';
        ctx.beginPath(); ctx.arc(W * 0.22, 150, 50, 0, TAU); ctx.fill();
        ctx.fillStyle = '#14183a';
        ctx.beginPath(); ctx.arc(W * 0.22 + 22, 138, 44, 0, TAU); ctx.fill();
        for (let i = 0; i < 40; i++) {
          const sd = seeds[i];
          ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t * 1.5 + i))})`;
          ctx.fillRect(sd.x * W, sd.y * 300, 2.5, 2.5);
        }
        let x = -60;
        let i = 0;
        while (x < W + 60) {
          const sd = seeds[i++ % seeds.length];
          const bw = 90 + sd.s * 120;
          const bh = 160 + sd.c * 330;
          ctx.fillStyle = i % 2 ? '#1f2347' : '#262b55';
          ctx.fillRect(x, GROUND_Y - bh, bw, bh);
          ctx.fillStyle = '#ffd166';
          for (let wy = GROUND_Y - bh + 18; wy < GROUND_Y - 40; wy += 34) {
            for (let wx = x + 12; wx < x + bw - 16; wx += 26) {
              if (((wx * 7 + wy * 3) | 0) % 5 < 2) ctx.fillRect(wx, wy, 12, 16);
            }
          }
          x += bw + 8;
        }
        ctx.fillStyle = '#5b6177';
        ctx.fillRect(-400, GROUND_Y - 34, W + 800, 34);
        break;
      }
      case 'snow': {
        for (let i = 0; i < 12; i++) {
          const sd = seeds[i];
          const x = (i / 12) * (W + 100) + sd.s * 40 - 30;
          const h = 160 + sd.c * 140;
          ctx.fillStyle = '#2f7a5a';
          ctx.beginPath(); ctx.moveTo(x, GROUND_Y - h - 40); ctx.lineTo(x - 55, GROUND_Y - 30); ctx.lineTo(x + 55, GROUND_Y - 30); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.moveTo(x, GROUND_Y - h - 40); ctx.lineTo(x - 18, GROUND_Y - h + 10); ctx.lineTo(x + 18, GROUND_Y - h + 10); ctx.fill();
        }
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 70; i++) {
          const sd = seeds[i];
          const y = ((sd.y * GROUND_Y + t * (40 + sd.s * 60)) % GROUND_Y);
          const x = sd.x * W + Math.sin(t + i) * 20;
          ctx.beginPath(); ctx.arc(x, y, 2 + sd.c * 3, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'space': {
        for (let i = 0; i < 70; i++) {
          const sd = seeds[i];
          ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i * 3))})`;
          ctx.fillRect(sd.x * W, sd.y * (GROUND_Y - 100), 2 + sd.s * 2, 2 + sd.s * 2);
        }
        ctx.fillStyle = '#3d7bd9';
        ctx.beginPath(); ctx.arc(W * 0.75, 190, 85, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5bc27a';
        ctx.beginPath(); ctx.ellipse(W * 0.75 - 20, 170, 35, 22, 0.4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(W * 0.75 + 30, 225, 22, 14, -0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c9c9d4';
        ctx.beginPath(); ctx.ellipse(W * 0.3, GROUND_Y, W * 0.4, 70, 0, Math.PI, 0); ctx.fill();
        break;
      }
      case 'trees': {
        ctx.fillStyle = '#fff9c4';
        ctx.beginPath(); ctx.arc(W * 0.15, 140, 55, 0, TAU); ctx.fill();
        this._clouds(seeds, W, '#ffffff', t);
        for (let i = 0; i < 9; i++) {
          const sd = seeds[i + 5];
          const x = (i / 9) * (W + 100) + sd.s * 50;
          const r = 60 + sd.c * 50;
          ctx.fillStyle = '#7a5230';
          ctx.fillRect(x - 10, GROUND_Y - r - 90, 20, r + 90);
          ctx.fillStyle = i % 2 ? '#3f9b4a' : '#4fb35a';
          ctx.beginPath(); ctx.arc(x, GROUND_Y - r - 110, r, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = '#8a6a4a';
        ctx.fillRect(-400, GROUND_Y - 60, W + 800, 8);
        for (let x = -20; x < W + 20; x += 36) ctx.fillRect(x, GROUND_Y - 80, 6, 80);
        break;
      }
      default: break;
    }
  }

  _clouds(seeds, W, color, t) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 5; i++) {
      const sd = seeds[i + 20];
      const x = ((sd.x * W + t * (8 + sd.s * 10)) % (W + 300)) - 150;
      const y = 80 + sd.y * 220;
      const s = 0.7 + sd.c * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, 30 * s, 0, TAU);
      ctx.arc(x + 35 * s, y - 12 * s, 38 * s, 0, TAU);
      ctx.arc(x + 75 * s, y, 30 * s, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _floor(theme, W) {
    const { ctx } = this;
    ctx.fillStyle = theme.floor;
    ctx.fillRect(-400, GROUND_Y, W + 800, VIEW_HEIGHT - GROUND_Y + 400);
    ctx.fillStyle = theme.floorEdge;
    ctx.fillRect(-400, GROUND_Y + 70, W + 800, 400);
    if (theme.id === 'gym') {
      ctx.strokeStyle = theme.floorLine;
      ctx.lineWidth = 2;
      for (let x = 0; x < W; x += 80) {
        ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x - 30, GROUND_Y + 70); ctx.stroke();
      }
    }
    if (theme.id === 'ice') {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let x = 30; x < W; x += 140) ctx.fillRect(x, GROUND_Y + 12, 70, 4);
    }
    // Court markings
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W / 2, GROUND_Y + 2); ctx.lineTo(W / 2 - 25, GROUND_Y + 68);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(W / 2 - 12, GROUND_Y + 35, 120, 24, 0, 0, TAU);
    ctx.stroke();
    for (const s of [-1, 1]) {
      const x = s < 0 ? 0 : W;
      ctx.beginPath();
      ctx.ellipse(x, GROUND_Y + 35, W * 0.27, 30, 0, s < 0 ? -Math.PI / 2 : Math.PI / 2, s < 0 ? Math.PI / 2 : Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(-400, GROUND_Y, W + 800, 5);
  }

  _hoopBack(h, W) {
    const { ctx } = this;
    const poleX = h.side < 0 ? 6 : W - 6;
    // Pole and bracket
    ctx.fillStyle = '#5b6170';
    ctx.fillRect(poleX - 9, h.rimY - h.boardH * 0.3, 18, GROUND_Y - h.rimY + h.boardH * 0.3);
    ctx.fillStyle = '#3e4350';
    ctx.fillRect(poleX - 22, GROUND_Y - 14, 44, 14);
    // Backboard
    const bx = h.boardX - h.boardT / 2;
    const by = h.board.position.y - h.boardH / 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2d3340';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(bx, by, h.boardT, h.boardH, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = TEAM_COLORS[1 - h.scoringTeam].main;
    ctx.fillRect(bx + 3, by + h.boardH * 0.55, h.boardT - 6, h.boardH * 0.28);
  }

  _hoopFront(h) {
    const { ctx } = this;
    const a = h.faceX;
    const b = h.frontX;
    const y = h.rimY;
    // Net: a trapezoid of strings that sways with netSwing.
    const depth = 58 + Math.abs(b - a) * 0.15;
    const sway = h.netSwing * 18;
    const n = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2.5;
    const top = (i) => a + (b - a) * (i / n);
    const bot = (i) => a + (b - a) * (0.2 + 0.6 * (i / n)) + sway;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      ctx.moveTo(top(i), y);
      ctx.lineTo(bot(i), y + depth);
      if (i < n) {
        ctx.moveTo(top(i), y);
        ctx.lineTo(bot(i + 1), y + depth);
      }
    }
    for (let k = 1; k <= 3; k++) {
      const f = k / 3.4;
      ctx.moveTo(a + (b - a) * (0.2 * f) + sway * f, y + depth * f);
      ctx.lineTo(b - (b - a) * (0.2 * f) + sway * f, y + depth * f);
    }
    ctx.stroke();
    // Rim
    ctx.strokeStyle = '#ff5a1f';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a, y); ctx.lineTo(b, y);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#d8400d';
    ctx.beginPath(); ctx.arc(b, y, h.rimR + 1, 0, TAU); ctx.fill();
  }

  _shadows(match) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const shadow = (x, y, r) => {
      const hgt = Math.max(0, GROUND_Y - y);
      const s = Math.max(0.25, 1 - hgt / 700);
      ctx.beginPath();
      ctx.ellipse(x, GROUND_Y + 4, r * s, r * 0.22 * s, 0, 0, TAU);
      ctx.fill();
    };
    for (const ch of match.chars) shadow(ch.x, ch.legs[0].position.y + ch.dims.legLen / 2, ch.dims.torsoW * 0.9);
    shadow(match.ball.pos.x, match.ball.pos.y + match.ball.R, match.ball.R);
  }

  // ---------------------------------------------------------------- players

  _rect(body, w, h, r, fill, stroke) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.restore();
  }

  _leg(ch, leg) {
    const { ctx } = this;
    const d = ch.dims;
    const L = d.legLen + 4;
    const lk = ch.look;
    ctx.save();
    ctx.translate(leg.position.x, leg.position.y);
    ctx.rotate(leg.angle);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    // skin
    ctx.fillStyle = lk.skin;
    ctx.beginPath(); ctx.roundRect(-d.legW / 2, -L / 2, d.legW, L, d.legW * 0.45); ctx.fill(); ctx.stroke();
    // shorts
    ctx.fillStyle = lk.shorts;
    ctx.beginPath(); ctx.roundRect(-d.legW / 2 - 3, -L / 2 - 2, d.legW + 6, Math.min(L * 0.42, 34), 4); ctx.fill();
    // sock + shoe
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-d.legW / 2, L / 2 - 16, d.legW, 7);
    ctx.fillStyle = lk.shoes;
    ctx.beginPath();
    ctx.roundRect(-d.legW / 2 - 2 + (ch.dir > 0 ? 0 : -8), L / 2 - 9, d.legW + 10, 12, 5);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  _character(ch, heldBall) {
    const { ctx } = this;
    const d = ch.dims;
    const lk = ch.look;
    const tc = TEAM_COLORS[ch.team];

    this._leg(ch, ch.legs[ch.dir > 0 ? 0 : 1]);

    // Torso / jersey
    ctx.save();
    ctx.translate(ch.torso.position.x, ch.torso.position.y);
    ctx.rotate(ch.torso.angle);
    ctx.fillStyle = lk.jersey;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-d.torsoW / 2, -d.torsoH / 2, d.torsoW, d.torsoH, Math.min(d.torsoW, d.torsoH) * 0.35);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = lk.trim;
    ctx.fillRect(-d.torsoW / 2 + 4, d.torsoH / 2 - 12, d.torsoW - 8, 5);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(Math.min(d.torsoW * 0.6, d.torsoH * 0.38))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(lk.number), 0, 2);
    ctx.restore();

    this._leg(ch, ch.legs[ch.dir > 0 ? 1 : 0]);
    this._head(ch);

    // Arm (front)
    ctx.save();
    ctx.translate(ch.arm.position.x, ch.arm.position.y);
    ctx.rotate(ch.arm.angle);
    const L = d.armLen;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.fillStyle = lk.skin;
    ctx.beginPath(); ctx.roundRect(-d.armW / 2, -L / 2, d.armW, L, d.armW * 0.45); ctx.fill(); ctx.stroke();
    ctx.fillStyle = lk.jersey;
    ctx.beginPath(); ctx.roundRect(-d.armW / 2 - 2, -L / 2 - 3, d.armW + 4, Math.min(16, L * 0.3), 5); ctx.fill();
    ctx.fillStyle = lk.skin;
    ctx.beginPath(); ctx.arc(0, L / 2, d.armW * 0.75, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Team marker when holding the ball
    if (heldBall) {
      ctx.fillStyle = tc.main;
      const hy = ch.head.position.y - d.headR - 26;
      ctx.beginPath();
      ctx.moveTo(ch.head.position.x - 9, hy - 10);
      ctx.lineTo(ch.head.position.x + 9, hy - 10);
      ctx.lineTo(ch.head.position.x, hy + 2);
      ctx.fill();
    }
  }

  _head(ch) {
    const { ctx } = this;
    const r = ch.dims.headR;
    const lk = ch.look;
    const f = ch.dir;
    ctx.save();
    ctx.translate(ch.head.position.x, ch.head.position.y);
    ctx.rotate(ch.head.angle);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;

    if (lk.hair === 'afro') {
      ctx.fillStyle = lk.hairColor;
      ctx.beginPath(); ctx.arc(-f * r * 0.1, -r * 0.25, r * 1.32, 0, TAU); ctx.fill();
    }
    if (lk.hair === 'bun') {
      ctx.fillStyle = lk.hairColor;
      ctx.beginPath(); ctx.arc(-f * r * 0.55, -r * 0.95, r * 0.45, 0, TAU); ctx.fill();
    }

    ctx.fillStyle = lk.skin;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();

    // Hair / headwear
    ctx.fillStyle = lk.hairColor;
    switch (lk.hair) {
      case 'flat':
      case 'bun':
        ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill();
        break;
      case 'spiky':
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = Math.PI + (i / 6) * Math.PI;
          const rr = i % 2 ? r * 1.35 : r * 0.9;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
        break;
      case 'mohawk':
        ctx.beginPath(); ctx.roundRect(-r * 0.18, -r * 1.45, r * 0.36, r * 0.9, 4); ctx.fill();
        break;
      case 'cap':
        ctx.fillStyle = TEAM_COLORS[ch.team].dark;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.02, Math.PI, TAU); ctx.closePath(); ctx.fill();
        ctx.fillRect(f > 0 ? 0 : -r * 1.7, -r * 0.12, r * 1.7, r * 0.22);
        break;
      case 'headband':
        ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 1.1, Math.PI * 1.9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-r, -r * 0.55, r * 2, r * 0.25);
        break;
      default: break;
    }

    // Face looks towards the attack direction.
    const ex = f * r * 0.38;
    const ey = -r * 0.05;
    ctx.fillStyle = '#1b1b1b';
    const eye = (x) => {
      switch (lk.eyeStyle) {
        case 'wide':
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x, ey, r * 0.2, 0, TAU); ctx.fill();
          ctx.fillStyle = '#1b1b1b';
          ctx.beginPath(); ctx.arc(x + f * r * 0.06, ey, r * 0.1, 0, TAU); ctx.fill();
          break;
        case 'sleepy':
          ctx.fillRect(x - r * 0.14, ey, r * 0.28, r * 0.07);
          break;
        default:
          ctx.beginPath(); ctx.arc(x, ey, r * 0.1, 0, TAU); ctx.fill();
      }
      if (lk.eyeStyle === 'angry' || lk.brow) {
        ctx.save();
        ctx.strokeStyle = '#1b1b1b';
        ctx.lineWidth = Math.max(2, r * 0.08);
        ctx.beginPath();
        const tilt = lk.eyeStyle === 'angry' ? r * 0.1 : 0;
        ctx.moveTo(x - r * 0.16, ey - r * 0.25 - tilt * f);
        ctx.lineTo(x + r * 0.16, ey - r * 0.25 + tilt * f);
        ctx.stroke();
        ctx.restore();
      }
    };
    eye(ex);
    eye(ex - f * r * 0.42);
    if (lk.mustache) {
      ctx.fillStyle = lk.hairColor;
      ctx.beginPath(); ctx.ellipse(ex - f * r * 0.15, r * 0.35, r * 0.3, r * 0.1, 0, 0, TAU); ctx.fill();
    }
    // Mouth: open "O" while jumping/pressing, smile otherwise.
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.beginPath();
    if (ch.pressed) {
      ctx.fillStyle = '#6b1d1d';
      ctx.arc(ex - f * r * 0.15, r * 0.5, r * 0.13, 0, TAU);
      ctx.fill();
    } else {
      ctx.arc(ex - f * r * 0.15, r * 0.35, r * 0.18, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- ball

  _ball(ball, match) {
    const { ctx } = this;
    const b = ball.body;
    const R = ball.R;
    // Motion trail when moving fast.
    const tr = ball.trail;
    if (tr.length > 2) {
      const d = Math.hypot(tr[tr.length - 1].x - tr[0].x, tr[tr.length - 1].y - tr[0].y);
      if (d > R * 2) {
        for (let i = 0; i < tr.length - 1; i++) {
          ctx.globalAlpha = (i / tr.length) * 0.25;
          ctx.fillStyle = '#ff9a3c';
          ctx.beginPath(); ctx.arc(tr[i].x, tr[i].y, R * (0.4 + 0.6 * i / tr.length), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
    g.addColorStop(0, '#ffb15c');
    g.addColorStop(1, '#e8641c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3a1c0c';
    ctx.lineWidth = Math.max(2, R * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-R, 0); ctx.lineTo(R, 0);
    ctx.moveTo(0, -R); ctx.lineTo(0, R);
    ctx.moveTo(-R * 0.7, -R * 0.7); ctx.quadraticCurveTo(-R * 0.1, 0, -R * 0.7, R * 0.7);
    ctx.moveTo(R * 0.7, -R * 0.7); ctx.quadraticCurveTo(R * 0.1, 0, R * 0.7, R * 0.7);
    ctx.stroke();
    ctx.restore();
    void match;
  }

  _ballIndicator(ball, theme) {
    if (ball.pos.y > -ball.R) return;
    const { ctx } = this;
    const x = ball.pos.x;
    const h = Math.min(1, -ball.pos.y / 600);
    ctx.fillStyle = '#ff7a1a';
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 12); ctx.lineTo(x - 18, 42); ctx.lineTo(x + 18, 42); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(x, 64, 14 - h * 6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- FX

  _particles(fx) {
    const { ctx } = this;
    for (const p of fx.particles) {
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, a);
      if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 6 * a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size + (p.age / p.life) * 120, 0, TAU); ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _popups(fx) {
    const { ctx } = this;
    for (const p of fx.popups) {
      const k = p.age / p.life;
      const pop = k < 0.15 ? 0.4 + (k / 0.15) * 0.8 : k < 0.25 ? 1.2 - ((k - 0.15) / 0.1) * 0.2 : 1;
      ctx.save();
      ctx.translate(p.x, p.y - k * 90);
      ctx.scale(pop, pop);
      ctx.rotate(Math.sin(p.age * 10) * 0.04);
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.font = `900 ${p.size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = p.size * 0.16;
      ctx.strokeStyle = '#1b1b1b';
      ctx.lineJoin = 'round';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- HUD

  _scoreboard(s, cam) {
    const { ctx } = this;
    // Scale with the screen, but always leave room for the corner buttons.
    const u = Math.max(0.4, Math.min(cam.sw / 1500, cam.sh / 850, 1.6 * this.dpr, (cam.sw - 250 * this.dpr) / 470));
    const cx = cam.sw / 2;
    const top = 12 * u;
    const pw = 150 * u;
    const ph = 74 * u;
    const leader = s.scores[0] === s.scores[1] ? null : s.scores[0] > s.scores[1] ? 0 : 1;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Center plate
    ctx.fillStyle = 'rgba(20,22,32,0.88)';
    ctx.beginPath(); ctx.roundRect(cx - 70 * u, top, 140 * u, ph, 14 * u); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${13 * u}px system-ui, sans-serif`;
    ctx.fillText(`ROUND ${s.cfg.round}`, cx, top + 16 * u);
    ctx.font = `900 ${15 * u}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('FIRST TO', cx, top + 38 * u);
    ctx.font = `900 ${24 * u}px system-ui, sans-serif`;
    ctx.fillText(String(WIN_SCORE), cx, top + 58 * u);

    for (let team = 0; team < 2; team++) {
      const side = team === 0 ? -1 : 1;
      const x = cx + side * (70 * u + pw / 2 + 6 * u);
      const tc = TEAM_COLORS[team];
      const bump = s.scorePulse && s.scorePulse.team === team ? Math.max(0, 1 - s.scorePulse.t / 0.6) : 0;
      ctx.save();
      ctx.translate(x, top + ph / 2);
      ctx.scale(1 + bump * 0.25, 1 + bump * 0.25);
      if (leader === team) {
        ctx.shadowColor = tc.light;
        ctx.shadowBlur = (14 + Math.sin(this.time * 5) * 6) * u;
      }
      ctx.fillStyle = tc.main;
      ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 14 * u); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${13 * u}px system-ui, sans-serif`;
      ctx.fillText(`${TEAM_NAMES[team]} · ${s.labels[team]}`, 0, -ph / 2 + 15 * u);
      ctx.font = `900 ${40 * u}px system-ui, sans-serif`;
      ctx.fillText(String(s.scores[team]), 0, 6 * u);
      // progress pips
      for (let i = 0; i < WIN_SCORE; i++) {
        const px = (i - (WIN_SCORE - 1) / 2) * 16 * u;
        ctx.beginPath(); ctx.arc(px, ph / 2 - 11 * u, 4.5 * u, 0, TAU);
        ctx.fillStyle = i < s.scores[team] ? '#ffffff' : 'rgba(255,255,255,0.3)';
        ctx.fill();
      }
      if (leader === team) {
        ctx.fillStyle = '#ffd23f';
        ctx.font = `900 ${18 * u}px system-ui, sans-serif`;
        ctx.fillText('♛', -side * (pw / 2 - 14 * u), -ph / 2 + 15 * u);
      }
      ctx.restore();
    }

    // Leading indicator text
    ctx.font = `800 ${14 * u}px system-ui, sans-serif`;
    const lt = leader === null ? 'TIED' : `${TEAM_NAMES[leader]} LEADS`;
    const lw = ctx.measureText(lt).width + 24 * u;
    ctx.fillStyle = leader === null ? 'rgba(20,22,32,0.75)' : TEAM_COLORS[leader].dark;
    ctx.beginPath(); ctx.roundRect(cx - lw / 2, top + ph + 6 * u, lw, 24 * u, 12 * u); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(lt, cx, top + ph + 18 * u);

    // Round modifiers
    const mods = [s.cfg.theme.name.toUpperCase(), ...s.cfg.modifiers];
    ctx.font = `800 ${12 * u}px system-ui, sans-serif`;
    const widths = mods.map((m) => ctx.measureText(m).width + 20 * u);
    const total = widths.reduce((a, b) => a + b, 0) + (mods.length - 1) * 6 * u;
    let mx = cx - total / 2;
    const my = top + ph + 36 * u;
    mods.forEach((m, i) => {
      ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(20,22,32,0.7)';
      ctx.beginPath(); ctx.roundRect(mx, my, widths[i], 20 * u, 10 * u); ctx.fill();
      ctx.fillStyle = i === 0 ? '#1b1b1b' : '#ffd23f';
      ctx.fillText(m, mx + widths[i] / 2, my + 10.5 * u);
      mx += widths[i] + 6 * u;
    });
    ctx.restore();
  }

  _banner(b, cam) {
    const { ctx } = this;
    const u = Math.max(0.55, Math.min(cam.sw / 1500, cam.sh / 850, 1.6 * this.dpr));
    const k = Math.min(1, b.t / 0.18);
    ctx.save();
    ctx.translate(cam.sw / 2, cam.sh * 0.42);
    ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
    ctx.globalAlpha = b.alpha ?? 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${b.size * u}px system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = b.size * u * 0.16;
    ctx.strokeStyle = '#1b1b1b';
    ctx.strokeText(b.text, 0, 0);
    ctx.fillStyle = b.color || '#ffffff';
    ctx.fillText(b.text, 0, 0);
    if (b.sub) {
      ctx.font = `800 ${22 * u}px system-ui, sans-serif`;
      ctx.lineWidth = 6 * u;
      ctx.strokeText(b.sub, 0, b.size * u * 0.75);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(b.sub, 0, b.size * u * 0.75);
    }
    ctx.restore();
  }
}
