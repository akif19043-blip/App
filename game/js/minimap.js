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
  blockEdge: 'rgba(200, 212, 226, 0.18)',
  coin: '#ffc233',
  traffic: 'rgba(210, 220, 230, 0.75)',
  mission: '#8ef06a',
  player: '#ff8a3d',
  border: 'rgba(255, 255, 255, 0.14)',
};

export class Minimap {
  constructor(canvas, city) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.city = city;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const size = Math.max(80, Math.round(rect.width || 108));
    this.size = size;
    this.canvas.width = size * this.dpr;
    this.canvas.height = size * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // world metres -> minimap pixels, with a small margin
    this.scale = (size - 8) / this.city.extent;
    this.centre = size / 2;
  }

  toScreen(x, z) {
    return [this.centre + x * this.scale, this.centre + z * this.scale];
  }

  draw(car, coins, mission, traffic) {
    const ctx = this.ctx;
    const size = this.size;
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, size, size);

    // blocks: the gaps between them read as the street grid
    const side = this.city.block * this.scale;
    ctx.fillStyle = COLORS.block;
    ctx.strokeStyle = COLORS.blockEdge;
    ctx.lineWidth = 0.5;
    for (const [x, z] of this.city.blockCenters) {
      const [sx, sy] = this.toScreen(x, z);
      ctx.fillRect(sx - side / 2, sy - side / 2, side, side);
      ctx.strokeRect(sx - side / 2, sy - side / 2, side, side);
    }

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

    if (mission) {
      const [mx, my] = this.toScreen(mission.x, mission.z);
      const [px, py] = this.toScreen(car.x, car.z);
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
