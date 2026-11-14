// Lightweight visual juice: particles, floating text, screen shake, flashes.

export class Effects {
  constructor() {
    this.particles = [];
    this.popups = [];
    this.shakeAmp = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flash = 0;
    this.flashColor = '#fff';
  }

  clear() {
    this.particles.length = 0;
    this.popups.length = 0;
    this.shakeAmp = 0;
    this.flash = 0;
  }

  shake(amount) { this.shakeAmp = Math.max(this.shakeAmp, amount); }

  flashScreen(color, strength = 0.35) {
    this.flash = strength;
    this.flashColor = color;
  }

  confetti(x, y, colors, n = 60) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const s = 300 + Math.random() * 700;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1.4 + Math.random() * 0.9, age: 0, size: 5 + Math.random() * 7,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
        color: colors[i % colors.length], kind: 'confetti', g: 900,
      });
    }
  }

  dust(x, y, n = 6, color = 'rgba(255,255,255,0.7)') {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 140,
        life: 0.35 + Math.random() * 0.25, age: 0, size: 4 + Math.random() * 6,
        rot: 0, vr: 0, color, kind: 'dust', g: 300,
      });
    }
  }

  ring(x, y, color) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, age: 0, size: 10, rot: 0, vr: 0, color, kind: 'ring', g: 0 });
  }

  popup(text, x, y, color, size = 64, life = 1.6) {
    this.popups.push({ text, x, y, color, size, life, age: 0 });
  }

  update(dt) {
    for (const p of this.particles) {
      p.age += dt;
      p.vy += p.g * dt;
      p.vx *= p.kind === 'confetti' ? 0.985 : 0.95;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const p of this.popups) p.age += dt;
    this.popups = this.popups.filter((p) => p.age < p.life);

    this.shakeAmp *= Math.pow(0.0015, dt);
    if (this.shakeAmp < 0.3) this.shakeAmp = 0;
    this.shakeX = (Math.random() * 2 - 1) * this.shakeAmp;
    this.shakeY = (Math.random() * 2 - 1) * this.shakeAmp;
    this.flash = Math.max(0, this.flash - dt * 1.4);
  }
}
