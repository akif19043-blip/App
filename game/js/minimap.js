/**
 * Corner minimap for the city: the whole grid at once, so the player can
 * always see where the delivery is and which streets they have not driven.
 *
 * Drawn with the 2D canvas API rather than a second WebGL view -- it is a few
 * dozen rectangles a frame and costs nothing next to the main scene.
 */

const COLORS = {
  ground: 'rgba(10, 14, 20, 0.72)',
  block: 'rgba(150, 162, 176, 0.35)',
  open: 'rgba(120, 200, 150, 0.34)',
  landmark: 'rgba(150, 178, 255, 0.62)',
  blockEdge: 'rgba(200, 212, 226, 0.18)',
  coin: '#ffc233',
  traffic: 'rgba(210, 220, 230, 0.75)',
  mission: '#8ef06a',
  player: '#ff8a3d',
  police: '#4f8dff',
  border: 'rgba(255, 255, 255, 0.14)',
};

const LANDMARKS = new Set(['block_tower', 'block_stadium', 'block_plaza']);

export class Minimap {
  /**
   * Two views, toggled by tapping the map: 'follow' zooms in on the car, which
   * is what you want while driving, and 'full' shows the whole city, which is
   * what you want to decide where to go next.
   */
  constructor(canvas, city, span = 220) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.city = city;
    this.span = span;
    this.mode = 'follow';
    this.origin = { x: 0, z: 0 };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
  }

  setMode(mode) {
    this.mode = mode === 'full' ? 'full' : 'follow';
    this.resize();
    return this.mode;
  }

  toggle() {
    return this.setMode(this.mode === 'full' ? 'follow' : 'full');
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const size = Math.max(80, Math.round(rect.width || 108));
    this.size = size;
    this.canvas.width = size * this.dpr;
    this.canvas.height = size * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // world metres -> minimap pixels, with a small margin
    const across = this.mode === 'full' ? this.city.extent : this.span;
    this.scale = (size - 8) / across;
    this.centre = size / 2;
  }

  toScreen(x, z) {
    return [this.centre + (x - this.origin.x) * this.scale,
            this.centre + (z - this.origin.z) * this.scale];
  }

  /**
   * The block kind at each blockCenters index. Car parks are drivable, so
   * they read as open ground rather than building, and the landmarks get
   * their own colour -- that is half of what makes them worth having.
   */
  setBlockKinds(kinds) {
    this.blockColors = kinds.map((kind) => {
      if (kind === 'block_parking') return COLORS.open;
      if (LANDMARKS.has(kind)) return COLORS.landmark;
      return COLORS.block;
    });
  }

  draw(car, coins, mission, traffic, police = null) {
    const ctx = this.ctx;
    const size = this.size;
    this.origin = this.mode === 'full' ? { x: 0, z: 0 } : { x: car.x, z: car.z };
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, size, size);

    // blocks: the gaps between them read as the street grid
    const side = this.city.block * this.scale;
    ctx.fillStyle = COLORS.block;
    ctx.strokeStyle = COLORS.blockEdge;
    ctx.lineWidth = 0.5;
    this.city.blockCenters.forEach(([x, z], index) => {
      const [sx, sy] = this.toScreen(x, z);
      ctx.fillStyle = (this.blockColors && this.blockColors[index])
        || COLORS.block;
      ctx.fillRect(sx - side / 2, sy - side / 2, side, side);
      ctx.strokeRect(sx - side / 2, sy - side / 2, side, side);
    });

    ctx.fillStyle = COLORS.coin;
    for (const coin of coins) {
      if (coin.taken) continue;
      const [sx, sy] = this.toScreen(coin.object.position.x,
                                     coin.object.position.z);
      ctx.fillRect(sx - 0.9, sy - 0.9, 1.8, 1.8);
    }

    ctx.fillStyle = COLORS.traffic;
    for (const other of traffic) {
      const [sx, sy] = this.toScreen(other.holder.position.x,
                                     other.holder.position.z);
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }

    // The patrol gets a blinking blue dot: knowing which way it is coming
    // from is most of what makes shaking it off a decision rather than luck.
    if (police && Math.floor(performance.now() / 260) % 2 === 0) {
      const [sx, sy] = this.toScreen(police.x, police.z);
      ctx.fillStyle = COLORS.police;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (mission) {
      let [mx, my] = this.toScreen(mission.x, mission.z);
      const [px, py] = this.toScreen(car.x, car.z);
      // Zoomed in the target is usually outside the frame; pin it to the edge
      // so the dashed line still points the way.
      const pad = 5;
      mx = Math.min(size - pad, Math.max(pad, mx));
      my = Math.min(size - pad, Math.max(pad, my));
      ctx.strokeStyle = 'rgba(142, 240, 106, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = COLORS.mission;
      ctx.beginPath();
      ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // player: a triangle pointing the way the car is actually facing
    const [px, py] = this.toScreen(car.x, car.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-car.heading);          // heading 0 faces -Z, which is up here
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(0, -4.6);
    ctx.lineTo(3.2, 3.6);
    ctx.lineTo(0, 1.8);
    ctx.lineTo(-3.2, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }
}
