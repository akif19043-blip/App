/**
 * Drawing. Canvas 2D, no images: everything is painted from code.
 *
 * The look is one idea: night. A meadow is painted, then a layer of darkness
 * goes over it with holes cut wherever there is light -- the firefly, its
 * shots, the embers. Bugs are dark shapes you mostly see by their eyes, which
 * are drawn on top of the dark, so the swarm is always readable even where
 * the meadow is not.
 */

import { DAWN, VIEW } from './config.js';
import { makeRng } from './rng.js';

const TAU = Math.PI * 2;

/** A soft round stamp: drawn scaled, it is a glow or a hole in the dark. */
function makeStamp(size, stops) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  return canvas;
}

/** One tile of meadow, painted once with a fixed seed so it never shimmers. */
function makeMeadow() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const rng = makeRng(2024);
  g.fillStyle = '#1b3a32';
  g.fillRect(0, 0, size, size);
  // Patches of lighter and darker turf, wrapped so the tile is seamless.
  const blot = (x, y, r, color) => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        g.fillStyle = color;
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, TAU);
        g.fill();
      }
    }
  };
  for (let i = 0; i < 26; i += 1) {
    blot(rng() * size, rng() * size, 30 + rng() * 70,
         rng() < 0.5 ? 'rgba(40, 84, 66, 0.35)' : 'rgba(14, 36, 30, 0.35)');
  }
  const blade = (x, y) => {
    const h = 6 + rng() * 10;
    const lean = (rng() - 0.5) * 6;
    g.strokeStyle = rng() < 0.5 ? '#2f6150' : '#3b735d';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h);
    g.stroke();
  };
  for (let i = 0; i < 900; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    blade(x, y);
    if (x < 16) blade(x + size, y);
    if (y < 16) blade(x, y + size);
  }
  // Clover and night flowers.
  const flowers = ['#6f63ad', '#9d92cf', '#5a86ad', '#b9b3d6'];
  for (let i = 0; i < 22; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const color = flowers[Math.floor(rng() * flowers.length)];
    for (let p = 0; p < 5; p += 1) {
      const a = (p / 5) * TAU;
      blot(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.9, color);
    }
    blot(x, y, 1.3, '#c9b75e');
  }
  for (let i = 0; i < 30; i += 1) {
    blot(rng() * size, rng() * size, 2 + rng() * 3, 'rgba(100, 112, 104, 0.25)');
  }
  return canvas;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const EYES = {
  gnat: '#ff8a5c', wasp: '#ffd04a', beetle: '#ff5a5a', spitter: '#c77dff',
  moth: '#ffb3f0', queen: '#ff3b6b',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dark = document.createElement('canvas');
    this.dctx = this.dark.getContext('2d');
    this.meadow = makeMeadow();
    this.pattern = this.ctx.createPattern(this.meadow, 'repeat');
    this.hole = makeStamp(128, [[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,0.75)'],
                                [1, 'rgba(0,0,0,0)']]);
    this.glows = new Map();
    this.particles = [];
    this.numbers = [];
    this.shake = 0;
    this.cam = { x: 0, y: 0 };
    this.time = 0;
    this.zoom = 1;
    this.view = { w: VIEW.short, h: VIEW.short };
    this.ambient = this.makeAmbient();
  }

  glow(color) {
    let stamp = this.glows.get(color);
    if (!stamp) {
      stamp = makeStamp(64, [[0, color], [0.35, color.replace(/[\d.]+\)$/, '0.35)')],
                             [1, color.replace(/[\d.]+\)$/, '0)')]]);
      this.glows.set(color, stamp);
    }
    return stamp;
  }

  /**
   * Fit the canvas to its box. Returns how much of the world is on screen,
   * which the run uses to place spawns just out of sight.
   */
  resize(width, height, dpr) {
    this.dpr = dpr;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    // Darkness is soft-edged by nature, so half resolution costs nothing.
    this.dark.width = Math.max(1, Math.round(width / 2));
    this.dark.height = Math.max(1, Math.round(height / 2));
    this.zoom = Math.min(width, height) / VIEW.short;
    this.view = { w: width / this.zoom, h: height / this.zoom };
    return this.view;
  }

  // ----------------------------------------------------------- effects --

  /** Turn the run's events into particles, numbers and shake. */
  absorb(events, options) {
    for (const e of events) {
      if (e.t === 'kill') {
        const big = e.r > 20;
        this.burst(e.x, e.y, big ? 18 : 6, 'smoke', big ? 3 : 1.4);
        this.burst(e.x, e.y, big ? 16 : 3, 'spark', big ? 2 : 1);
      } else if (e.t === 'hit' && options.numbers) {
        if (this.numbers.length > 60) this.numbers.shift();
        this.numbers.push({ x: e.x + (Math.random() - 0.5) * 10, y: e.y, text: String(e.amount),
                            life: 0.6 });
      } else if (e.t === 'hurt') {
        this.shake = Math.min(10, this.shake + 6);
      } else if (e.t === 'level' || e.t === 'revive' || e.t === 'dawn') {
        this.levelFlash = 0.5;
      }
    }
  }

  burst(x, y, count, kind, scale = 1) {
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length > 500) this.particles.shift();
      const a = Math.random() * TAU;
      const speed = (kind === 'spark' ? 90 : 40) * (0.4 + Math.random()) * scale;
      this.particles.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: kind === 'spark' ? 0.45 : 0.6, max: kind === 'spark' ? 0.45 : 0.6,
        size: (kind === 'spark' ? 2 : 6) * (0.6 + Math.random() * 0.8) * Math.sqrt(scale),
        kind,
      });
    }
  }

  // -------------------------------------------------------------- draw --

  /** A frame of the night. */
  draw(run, dt, options = {}) {
    this.time += dt;
    const p = run.player;
    this.cam.x = p.x;
    this.cam.y = p.y;
    this.shake = Math.max(0, this.shake - dt * 30);
    // One shake offset per frame: every layer has to move together.
    this.jolt = this.shake
      ? { x: (Math.random() - 0.5) * this.shake, y: (Math.random() - 0.5) * this.shake }
      : { x: 0, y: 0 };
    this.levelFlash = Math.max(0, (this.levelFlash || 0) - dt);

    const night = 0.8 - 0.62 * smoothstep(DAWN * 0.7, DAWN, run.time);
    this.paintGround();
    this.paintEmbers(run);
    this.paintBodies(run);
    this.paintParticles(dt, 'smoke');
    this.paintDarkness(run, night);
    this.paintLights(run);
    this.paintEyes(run);
    this.paintPlayer(p);
    this.paintParticles(dt, 'spark');
    this.paintNumbers(dt);
    this.paintPointers(run);
    this.paintScreen(run, p);
  }

  worldTransform(ctx = this.ctx, scale = this.dpr) {
    const k = this.zoom * scale;
    const sx = this.jolt ? this.jolt.x : 0;
    const sy = this.jolt ? this.jolt.y : 0;
    ctx.setTransform(k, 0, 0, k,
      (this.width / 2 + sx) * scale - this.cam.x * k,
      (this.height / 2 + sy) * scale - this.cam.y * k);
  }

  paintGround() {
    const ctx = this.ctx;
    this.worldTransform();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.pattern;
    const w = this.view.w / 2 + 40;
    const h = this.view.h / 2 + 40;
    ctx.fillRect(this.cam.x - w, this.cam.y - h, w * 2, h * 2);
  }

  paintEmbers(run) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    const stamp = this.glow('rgba(255,140,40,0.9)');
    for (const e of run.embers) {
      const fade = Math.min(1, e.life / 0.4);
      const flicker = 0.75 + Math.sin(this.time * 23 + e.x) * 0.25;
      const size = e.r * 2.6 * flicker;
      ctx.globalAlpha = 0.75 * fade;
      ctx.drawImage(stamp, e.x - size / 2, e.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  paintBodies(run) {
    const ctx = this.ctx;
    const p = run.player;
    for (const e of run.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(Math.atan2(p.y - e.y, p.x - e.x));
      this.bug(ctx, e);
      ctx.restore();
    }
  }

  /** One shadow-bug, nose along +x. */
  bug(ctx, e) {
    const r = e.r;
    const t = this.time + e.phase;
    const flap = Math.abs(Math.sin(t * 22));
    const body = e.def.elite || e.def.boss ? '#2a1846' : '#1c1330';
    const wing = 'rgba(150, 140, 210, 0.32)';
    ctx.fillStyle = wing;
    if (e.kind === 'gnat' || e.kind === 'wasp') {
      const size = e.kind === 'wasp' ? 1.1 : 0.8;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(-r * 0.2, side * r * 0.7, r * size, r * 0.35 * (0.4 + flap), side * 0.5, 0, TAU);
        ctx.fill();
      }
    }
    if (e.kind === 'moth' || e.kind === 'queen') {
      const beat = 0.75 + Math.sin(t * 6) * 0.25;
      for (const side of [-1, 1]) {
        ctx.fillStyle = 'rgba(98, 70, 150, 0.55)';
        ctx.beginPath();
        ctx.ellipse(r * 0.1, side * r * 1.05 * beat, r * 0.9, r * 0.75 * beat, side * 0.35, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-r * 0.7, side * r * 0.75 * beat, r * 0.6, r * 0.45 * beat, -side * 0.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(210, 160, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(r * 0.15, side * r * 1.1 * beat, r * 0.28, 0, TAU);
        ctx.fill();
      }
    }
    if (e.kind === 'beetle') {
      ctx.strokeStyle = body;
      ctx.lineWidth = 2.5;
      const step = Math.sin(t * 9) * 3;
      for (const side of [-1, 1]) {
        for (let i = -1; i <= 1; i += 1) {
          ctx.beginPath();
          ctx.moveTo(i * r * 0.5, side * r * 0.6);
          ctx.lineTo(i * r * 0.5 + (i ? step * i : step), side * r * 1.35);
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = body;
    ctx.beginPath();
    if (e.kind === 'wasp') ctx.ellipse(0, 0, r * 1.35, r * 0.75, 0, 0, TAU);
    else if (e.kind === 'moth' || e.kind === 'queen') ctx.ellipse(0, 0, r * 0.95, r * 0.5, 0, 0, TAU);
    else ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 95, 180, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (e.kind === 'wasp') {
      ctx.strokeStyle = 'rgba(255, 210, 90, 0.25)';
      ctx.lineWidth = 2.5;
      for (const x of [-r * 0.5, -r * 0.05]) {
        ctx.beginPath();
        ctx.moveTo(x, -r * 0.7);
        ctx.lineTo(x, r * 0.7);
        ctx.stroke();
      }
    } else if (e.kind === 'beetle') {
      ctx.strokeStyle = 'rgba(120, 95, 180, 0.6)';
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(r * 0.5, 0);
      ctx.stroke();
    } else if (e.kind === 'spitter') {
      ctx.fillStyle = body;
      ctx.fillRect(r * 0.6, -r * 0.28, r * 0.7, r * 0.56);
    } else if (e.kind === 'queen') {
      // A crest of spikes over the head: the queen should read as one.
      ctx.fillStyle = '#4a2c7a';
      for (let i = -2; i <= 2; i += 1) {
        const y = i * r * 0.14;
        ctx.beginPath();
        ctx.moveTo(r * 0.55, y - r * 0.07);
        ctx.lineTo(r * 0.55 - r * 0.45 * (1 - Math.abs(i) * 0.2), y * 1.8);
        ctx.lineTo(r * 0.55, y + r * 0.07);
        ctx.fill();
      }
    }

    if (e.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.85, e.flash * 10)})`;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
    }
  }

  paintParticles(dt, kind) {
    const ctx = this.ctx;
    this.worldTransform();
    if (kind === 'spark') ctx.globalCompositeOperation = 'lighter';
    for (const q of this.particles) {
      if (q.kind !== kind) continue;
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.92;
      q.vy *= 0.92;
      const k = Math.max(0, q.life / q.max);
      if (kind === 'smoke') {
        ctx.fillStyle = `rgba(30, 20, 50, ${0.5 * k})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * (1.6 - k), 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(255, 230, 150, ${k})`;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
    }
    if (kind === 'spark') this.particles = this.particles.filter((q) => q.life > 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The night, with holes where there is light. */
  paintDarkness(run, alpha) {
    const g = this.dctx;
    const w = this.dark.width;
    const h = this.dark.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.fillStyle = `rgba(4, 7, 22, ${alpha})`;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const k = this.zoom / 2;
    g.setTransform(k, 0, 0, k, w / 2 - this.cam.x * k, h / 2 - this.cam.y * k);
    const hole = (x, y, r, strength = 1) => {
      g.globalAlpha = strength;
      g.drawImage(this.hole, x - r, y - r, r * 2, r * 2);
    };
    const p = run.player;
    const breathe = 1 + Math.sin(this.time * 3) * 0.04;
    hole(p.x, p.y, 250 * breathe);
    hole(p.x, p.y, 120 * breathe);
    for (const s of run.shots) hole(s.x, s.y, 48, 0.7);
    for (const o of run.haloOrbs()) hole(o.x, o.y, 60, 0.7);
    for (const e of run.embers) hole(e.x, e.y, e.r * 3, 0.6);
    for (const pulse of run.pulses) hole(pulse.x, pulse.y, pulse.r * 1.1, 0.5 * pulse.life / pulse.max);
    g.globalAlpha = 1;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.dark, 0, 0, this.canvas.width, this.canvas.height);
  }

  paintLights(run) {
    const ctx = this.ctx;
    this.worldTransform();
    ctx.globalCompositeOperation = 'lighter';

    for (const pulse of run.pulses) {
      const k = pulse.life / pulse.max;
      ctx.strokeStyle = `rgba(217, 255, 120, ${0.8 * k})`;
      ctx.lineWidth = 3 + 9 * k;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.r * (1.05 - 0.25 * k), 0, TAU);
      ctx.stroke();
    }

    for (const arc of run.arcs) {
      const k = arc.life / arc.max;
      for (const [width, color] of [[7, `rgba(120, 180, 255, ${0.35 * k})`],
                                    [2.2, `rgba(235, 245, 255, ${k})`]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(arc.points[0].x, arc.points[0].y);
        for (let i = 1; i < arc.points.length; i += 1) {
          const a = arc.points[i - 1];
          const b = arc.points[i];
          for (let s = 1; s <= 3; s += 1) {
            const f = s / 4;
            ctx.lineTo(a.x + (b.x - a.x) * f + (Math.random() - 0.5) * 14,
                       a.y + (b.y - a.y) * f + (Math.random() - 0.5) * 14);
          }
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
    }

    const dew = this.glow('rgba(110,230,255,0.9)');
    const amber = this.glow('rgba(255,170,60,0.95)');
    const berry = this.glow('rgba(255,80,110,0.95)');
    for (const gem of run.gems) {
      const bob = Math.sin(this.time * 4 + gem.x) * 1.5;
      if (gem.kind === 'xp') {
        const size = 14 + Math.min(14, gem.value * 2);
        ctx.drawImage(dew, gem.x - size / 2, gem.y - size / 2 + bob, size, size);
      } else {
        const size = gem.kind === 'berry' ? 34 : 22;
        ctx.drawImage(gem.kind === 'gold' ? amber : berry, gem.x - size / 2, gem.y - size / 2 + bob,
                      size, size);
      }
    }

    const spit = this.glow('rgba(200,110,255,0.95)');
    for (const s of run.spits) ctx.drawImage(spit, s.x - 13, s.y - 13, 26, 26);

    const spark = this.glow('rgba(220,255,130,0.95)');
    ctx.strokeStyle = 'rgba(240, 255, 190, 0.95)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const s of run.shots) {
      ctx.drawImage(spark, s.x - 16, s.y - 16, 32, 32);
      ctx.beginPath();
      ctx.moveTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }

    const orb = this.glow('rgba(170,240,255,0.95)');
    for (const o of run.haloOrbs()) {
      ctx.drawImage(orb, o.x - 22, o.y - 22, 44, 44);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 0.55, 0, TAU);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    // Solid cores over the glows, so pickups read as things and not haze.
    for (const gem of run.gems) {
      const bob = Math.sin(this.time * 4 + gem.x) * 1.5;
      if (gem.kind === 'xp') {
        const s = 3 + Math.min(3, gem.value * 0.5);
        ctx.fillStyle = '#d8f8ff';
        ctx.beginPath();
        ctx.moveTo(gem.x, gem.y - s * 1.4 + bob);
        ctx.lineTo(gem.x + s, gem.y + bob);
        ctx.lineTo(gem.x, gem.y + s * 1.4 + bob);
        ctx.lineTo(gem.x - s, gem.y + bob);
        ctx.fill();
      } else if (gem.kind === 'gold') {
        ctx.fillStyle = '#ffc861';
        ctx.beginPath();
        ctx.arc(gem.x, gem.y + bob, 4.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff1c4';
        ctx.fillRect(gem.x - 1.5, gem.y - 2.5 + bob, 2, 2);
      } else {
        ctx.fillStyle = '#ff5c7d';
        ctx.beginPath();
        ctx.arc(gem.x, gem.y + bob, 7, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#7bd36a';
        ctx.fillRect(gem.x - 1, gem.y - 10 + bob, 2, 4);
      }
    }
  }

  paintEyes(run) {
    const ctx = this.ctx;
    const p = run.player;
    ctx.globalCompositeOperation = 'lighter';
    for (const e of run.enemies) {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const color = EYES[e.kind];
      const big = e.def.elite || e.def.boss;
      const ahead = e.r * (e.kind === 'wasp' ? 0.95 : 0.55);
      const apart = e.r * (big ? 0.28 : 0.38);
      const size = big ? e.r * 0.16 : Math.max(1.8, e.r * 0.2);
      // Blink now and then, each bug on its own clock.
      const blink = Math.sin(this.time * 0.9 + e.phase * 7) > 0.985;
      if (big) {
        const halo = this.glow('rgba(255,90,160,0.6)');
        ctx.drawImage(halo, e.x - e.r * 1.6, e.y - e.r * 1.6, e.r * 3.2, e.r * 3.2);
      }
      ctx.fillStyle = color;
      for (const side of [-1, 1]) {
        const x = e.x + ca * ahead - sa * apart * side;
        const y = e.y + sa * ahead + ca * apart * side;
        ctx.beginPath();
        if (blink) ctx.ellipse(x, y, size, size * 0.2, a, 0, TAU);
        else ctx.arc(x, y, size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  paintPlayer(p) {
    const ctx = this.ctx;
    const t = this.time;
    if (p.inv > 0 && p.hurt > 0 && Math.floor(t * 20) % 2) return;
    ctx.globalCompositeOperation = 'lighter';
    const glow = this.glow('rgba(214,255,110,0.9)');
    const pulse = 1 + Math.sin(t * 5) * 0.08;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(glow, p.x - 46 * pulse, p.y - 46 * pulse, 92 * pulse, 92 * pulse);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.facing);
    const flap = 0.35 + Math.abs(Math.sin(t * 38)) * 0.65;
    ctx.fillStyle = 'rgba(230, 245, 255, 0.55)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(1, side * 8 * flap, 9, 4.5 * flap, side * 0.35, 0, TAU);
      ctx.fill();
    }
    // Lantern: the glowing tail.
    const tail = ctx.createRadialGradient(-6, 0, 0, -6, 0, 9);
    tail.addColorStop(0, '#ffffe0');
    tail.addColorStop(0.5, '#e4ff6e');
    tail.addColorStop(1, '#9fd63a');
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.ellipse(-6, 0, 8.5, 6.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#23301f';
    ctx.beginPath();
    ctx.ellipse(4, 0, 5.5, 4.4, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(9.5, 0, 3.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#23301f';
    ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(11, side * 1.5);
      ctx.quadraticCurveTo(16, side * 4, 17, side * 7);
      ctx.stroke();
    }
    ctx.restore();

    // Health, under the firefly where the eye already is -- only once hurt.
    if (p.hp < p.maxHp) {
      const w = 34;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(p.x - w / 2 - 1, p.y + 19, w + 2, 5);
      const k = p.hp / p.maxHp;
      ctx.fillStyle = k > 0.35 ? '#7be07b' : '#ff5c5c';
      ctx.fillRect(p.x - w / 2, p.y + 20, w * k, 3);
    }
  }

  paintNumbers(dt) {
    const ctx = this.ctx;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10, 8, 20, 0.85)';
    for (const n of this.numbers) {
      n.life -= dt;
      n.y -= 28 * dt;
      ctx.globalAlpha = Math.min(1, n.life * 3);
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.globalAlpha = 1;
    this.numbers = this.numbers.filter((n) => n.life > 0);
  }

  /** Arrows at the edge of the screen toward a moth or the queen out of view. */
  paintPointers(run) {
    const ctx = this.ctx;
    const halfW = this.view.w / 2 - 24;
    const halfH = this.view.h / 2 - 24;
    for (const e of run.enemies) {
      if (!e.def.elite && !e.def.boss) continue;
      const dx = e.x - this.cam.x;
      const dy = e.y - this.cam.y;
      if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) continue;
      const scale = Math.min(halfW / Math.abs(dx || 1), halfH / Math.abs(dy || 1));
      const x = this.cam.x + dx * scale;
      const y = this.cam.y + dy * scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = e.def.boss ? '#ff3b6b' : '#ffb3f0';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, -8);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-8, 8);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Screen-space washes: dawn, a hit, low health, a level-up. */
  paintScreen(run, p) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dawn = smoothstep(DAWN * 0.7, DAWN, run.time);
    if (dawn > 0) {
      const sky = ctx.createLinearGradient(0, h, 0, 0);
      sky.addColorStop(0, `rgba(255, 150, 90, ${0.22 * dawn})`);
      sky.addColorStop(1, 'rgba(255, 150, 90, 0)');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
    }
    const low = p.hp / p.maxHp < 0.3 ? 0.25 + Math.sin(this.time * 6) * 0.1 : 0;
    const red = Math.max(low, p.hurt * 2);
    if (red > 0) {
      const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3,
                                            w / 2, h / 2, Math.max(w, h) * 0.7);
      edge.addColorStop(0, 'rgba(255, 30, 60, 0)');
      edge.addColorStop(1, `rgba(255, 30, 60, ${Math.min(0.55, red)})`);
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.levelFlash > 0) {
      ctx.fillStyle = `rgba(230, 255, 160, ${this.levelFlash * 0.3})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ----------------------------------------------------------- ambient --

  makeAmbient() {
    const rng = makeRng(7);
    const flies = [];
    for (let i = 0; i < 16; i += 1) {
      flies.push({ x: rng.range(-500, 500), y: rng.range(-500, 500),
                   a: rng() * TAU, speed: rng.range(14, 34), phase: rng() * TAU });
    }
    const eyes = [];
    for (let i = 0; i < 10; i += 1) {
      eyes.push({ a: rng() * TAU, d: rng.range(0.42, 0.62), phase: rng() * TAU,
                  color: Object.values(EYES)[i % 4] });
    }
    return { flies, eyes, drift: 0 };
  }

  /** The menus' backdrop: the meadow at rest, a few fireflies, eyes waiting. */
  drawAmbient(dt) {
    this.time += dt;
    const amb = this.ambient;
    amb.drift += dt;
    this.cam.x = Math.cos(amb.drift * 0.05) * 120;
    this.cam.y = amb.drift * 6;
    this.shake = 0;
    this.jolt = { x: 0, y: 0 };
    this.paintGround();
    const ctx = this.ctx;

    const g = this.dctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.dark.width, this.dark.height);
    g.fillStyle = 'rgba(4, 7, 22, 0.7)';
    g.fillRect(0, 0, this.dark.width, this.dark.height);
    g.globalCompositeOperation = 'destination-out';
    const k = this.zoom / 2;
    g.setTransform(k, 0, 0, k, this.dark.width / 2 - this.cam.x * k,
                   this.dark.height / 2 - this.cam.y * k);
    for (const f of amb.flies) {
      f.a += Math.sin(this.time * 0.7 + f.phase) * dt;
      f.x += Math.cos(f.a) * f.speed * dt;
      f.y += Math.sin(f.a) * f.speed * dt;
      // Keep them around the camera.
      if (f.x - this.cam.x > 520) f.x -= 1040;
      if (f.x - this.cam.x < -520) f.x += 1040;
      if (f.y - this.cam.y > 520) f.y -= 1040;
      if (f.y - this.cam.y < -520) f.y += 1040;
      const r = 80 + Math.sin(this.time * 2 + f.phase) * 20;
      g.globalAlpha = 0.6;
      g.drawImage(this.hole, f.x - r, f.y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.dark, 0, 0, this.canvas.width, this.canvas.height);

    this.worldTransform();
    ctx.globalCompositeOperation = 'lighter';
    const glow = this.glow('rgba(214,255,110,0.9)');
    for (const f of amb.flies) {
      const s = 26 + Math.sin(this.time * 3 + f.phase) * 6;
      ctx.drawImage(glow, f.x - s / 2, f.y - s / 2, s, s);
      ctx.fillStyle = '#f4ffc0';
      ctx.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);
    }
    const reach = Math.hypot(this.view.w, this.view.h) / 2;
    for (const e of amb.eyes) {
      const open = Math.sin(this.time * 0.6 + e.phase);
      if (open < 0.2) continue;
      const x = this.cam.x + Math.cos(e.a) * reach * e.d * 1.6;
      const y = this.cam.y + Math.sin(e.a) * reach * e.d;
      ctx.fillStyle = e.color;
      ctx.globalAlpha = Math.min(1, (open - 0.2) * 3);
      ctx.beginPath();
      ctx.arc(x - 5, y, 2.4, 0, TAU);
      ctx.arc(x + 5, y, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
