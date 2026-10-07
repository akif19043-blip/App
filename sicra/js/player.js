/**
 * The runner: lane changes, jumps, slides, gravity, flying with wings, the
 * shield bubble, and the run-cycle animation. Collision against obstacles
 * is the track's job; the player only exposes its box.
 */

import * as THREE from 'three';
import { LANES, LANE_WIDTH, LANE_SWITCH_TIME, PLAYER, POWERUPS, COLORS, CHARACTERS } from './config.js';
import { makeFigure, poseFigure } from './figure.js';

const LANE_SPEED = LANE_WIDTH / LANE_SWITCH_TIME;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.figure = null;
    this.setCharacter(CHARACTERS[0].id);

    // shield bubble
    this.shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1),
      new THREE.MeshStandardMaterial({ color: COLORS.shield, transparent: true, opacity: 0.28, roughness: 0.2, metalness: 0.4, emissive: COLORS.shield, emissiveIntensity: 0.5 }));
    this.shieldMesh.position.y = 1.0;
    this.shieldMesh.visible = false;
    this.group.add(this.shieldMesh);

    // wings
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, 1.6, 0.5, -0.2, 1.9, -0.2, -0.5, 1.1, -0.35, -0.3, 0, 0, 0, 1.9, -0.2, -0.5,
    ], 3));
    wingGeo.setIndex([0, 1, 2, 0, 2, 3]);
    wingGeo.computeVertexNormals();
    const wingMat = new THREE.MeshStandardMaterial({ color: COLORS.wings, side: THREE.DoubleSide, emissive: COLORS.wings, emissiveIntensity: 0.4, roughness: 0.6 });
    this.wingL = new THREE.Mesh(wingGeo, wingMat);
    this.wingR = new THREE.Mesh(wingGeo, wingMat);
    this.wingR.scale.x = -1;
    this.wings = new THREE.Group();
    this.wings.add(this.wingL, this.wingR);
    this.wings.position.set(0, 1.45, -0.15);
    this.wings.visible = false;
    this.group.add(this.wings);

    this.reset();
  }

  setCharacter(id) {
    const look = CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
    if (this.figure) this.group.remove(this.figure.root);
    this.figure = makeFigure(look);
    this.group.add(this.figure.root);
    this.characterId = look.id;
  }

  reset() {
    this.lane = 1;
    this.x = LANES[1];
    this.y = 0;
    this.z = 0;
    this.vy = 0;
    this.grounded = true;
    this.sliding = 0;
    this.pendingJump = 0;
    this.pendingSlide = false;
    this.flying = false;
    this.flyEnding = false;
    this.phase = 0;
    this.state = 'idle';
    this.dead = null;            // null | 'caught' | 'fell'
    this.power = { magnet: 0, shield: 0, wings: 0 };
    this.stats = { jumps: 0, slides: 0, gaps: 0, nearMisses: 0 };
    this.switchFrom = -1;        // lane we are leaving, for near-miss checks
    this.switchFromX = 0;
    this.switchZ = 0;
    this.switchTimer = 0;
    this.coyote = 0;             // grace after running off an edge
    this.overGap = false;
    this.lean = 0.12;
    this.wasOnRoof = true;
    this.group.position.set(this.x, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.shieldMesh.visible = false;
    this.wings.visible = false;
    poseFigure(this.figure, 'idle', 0, 0);
  }

  /** Collision box in world space. */
  box() {
    const height = this.sliding > 0 ? PLAYER.slideHeight : PLAYER.height;
    return {
      x0: this.x - PLAYER.width / 2, x1: this.x + PLAYER.width / 2,
      z0: this.z - PLAYER.depth / 2, z1: this.z + PLAYER.depth / 2,
      y0: this.y, y1: this.y + height,
    };
  }

  get position() {
    return this.group.position;
  }

  /** Apply an input action. Returns the action that actually happened. */
  act(action, sfx) {
    if (this.dead) return null;
    switch (action) {
      case 'left':
      case 'right': {
        const next = this.lane + (action === 'left' ? -1 : 1);
        if (next < 0 || next >= LANES.length) return null;
        this.switchFrom = this.lane;
        this.switchFromX = LANES[this.lane];
        this.switchZ = this.z;
        this.switchTimer = LANE_SWITCH_TIME + 0.08;
        this.lane = next;
        sfx?.lane();
        return action;
      }
      case 'jump':
        if (this.flying) return null;
        if (this.grounded || (this.coyote > 0 && this.vy <= 0)) {
          this.doJump(sfx);
          return 'jump';
        }
        this.pendingJump = 0.14;    // landed a moment later: still jump
        return null;
      case 'slide':
        if (this.flying) return null;
        if (this.grounded) {
          this.doSlide(sfx);
          return 'slide';
        }
        // in the air: dive, then slide on landing
        this.vy = Math.min(this.vy, -PLAYER.jumpSpeed * 1.4);
        this.pendingSlide = true;
        return 'dive';
      default:
        return null;
    }
  }

  doJump(sfx) {
    this.vy = PLAYER.jumpSpeed;
    this.grounded = false;
    this.sliding = 0;
    this.pendingJump = 0;
    this.stats.jumps += 1;
    sfx?.jump();
  }

  doSlide(sfx) {
    this.sliding = PLAYER.slideTime;
    this.pendingSlide = false;
    this.stats.slides += 1;
    sfx?.slide();
  }

  /** Give a power-up. Duration from the saved upgrade level. */
  grant(kind, level) {
    const cfg = POWERUPS[kind];
    const dur = cfg.base + cfg.perLevel * (level - 1);
    this.power[kind] = Math.max(this.power[kind], dur);
    if (kind === 'wings') {
      this.flying = true;
      this.flyEnding = false;
      this.sliding = 0;
      this.grounded = false;
      this.vy = 0;
    }
  }

  /**
   * Advance the simulation.
   * @param {number} dt
   * @param {number} speed       forward speed, m/s
   * @param {(z:number)=>boolean} roofAt  is there roof under this z?
   * @param {object} sfx
   * @returns {string|null} an event: 'land' | 'gap' | 'fell' | 'powerdown:<kind>'
   */
  update(dt, speed, roofAt, sfx) {
    let event = null;
    if (this.dead) {
      this.updateDead(dt);
      return null;
    }

    // forward
    this.z += speed * dt;

    // lanes
    const targetX = LANES[this.lane];
    const dx = targetX - this.x;
    const step = LANE_SPEED * dt;
    this.x = Math.abs(dx) <= step ? targetX : this.x + Math.sign(dx) * step;
    if (this.switchTimer > 0) {
      this.switchTimer -= dt;
      if (this.switchTimer <= 0) this.switchFrom = -1;
    }

    // power-up timers
    for (const kind of Object.keys(this.power)) {
      if (this.power[kind] <= 0) continue;
      this.power[kind] -= dt;
      if (this.power[kind] <= 0) {
        this.power[kind] = 0;
        if (kind === 'wings') this.flyEnding = true;
        else event = 'powerdown:' + kind;
      }
    }

    const roof = roofAt(this.z);

    if (this.flying) {
      // glide up to cruising height, hold it, come down when the roof is back
      if (this.flyEnding && this.landingClear(roofAt, speed)) {
        this.flying = false;
        this.flyEnding = false;
        this.vy = 0;
        event = 'powerdown:wings';
      } else {
        const k = 1 - Math.exp(-dt * 4);
        this.y += (POWERUPS.wingsHeight - this.y) * k;
        this.grounded = false;
      }
    }

    if (!this.flying) {
      if (this.grounded) {
        if (!roof) {
          this.grounded = false;
          this.vy = 0;
          this.sliding = 0;
          this.coyote = PLAYER.coyote;
        }
      }
      if (!this.grounded) {
        if (this.coyote > 0) this.coyote -= dt;
        this.vy -= PLAYER.gravity * dt;
        this.y += this.vy * dt;
        if (roof && this.y < -PLAYER.ledge && this.vy <= 0) {
          // too low to clamber onto the next roof: into the facade
          this.y = Math.min(this.y, -PLAYER.ledge);
          this.dead = 'fell';
          this.state = 'fall';
          return 'fell';
        }
        if (this.y <= 0 && this.vy <= 0 && roof) {
          this.y = 0;
          this.vy = 0;
          this.grounded = true;
          this.coyote = 0;
          event = 'land';
          sfx?.land();
          if (this.pendingSlide) this.doSlide(sfx);
          else if (this.pendingJump > 0) this.doJump(sfx);
        }
        if (this.y < PLAYER.fallDeath) {
          this.dead = 'fell';
          this.state = 'fall';
          return 'fell';
        }
      }
    }

    // gap bookkeeping: count a gap once when we cross back onto roof
    if (!roof && this.wasOnRoof) this.overGap = true;
    if (roof && this.overGap) {
      this.overGap = false;
      if (this.y > PLAYER.fallDeath) {
        this.stats.gaps += 1;
        if (!event) event = 'gap';
      }
    }
    this.wasOnRoof = roof;

    if (this.pendingJump > 0) this.pendingJump -= dt;
    if (this.sliding > 0) this.sliding -= dt;

    // animation
    const stride = Math.max(0.6, 1.9 - speed * 0.03);
    this.phase += (speed / stride) * dt * Math.PI;
    this.lean = 0.08 + speed * 0.012;
    if (this.flying) this.state = 'fly';
    else if (this.sliding > 0) this.state = 'slide';
    else if (!this.grounded) this.state = this.vy > -2 ? 'jump' : (this.y < -0.5 ? 'fall' : 'jump');
    else this.state = 'run';
    poseFigure(this.figure, this.state, this.phase, this.lean);

    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.z = -dx * 0.12;

    this.shieldMesh.visible = this.power.shield > 0;
    if (this.shieldMesh.visible) {
      const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.05;
      this.shieldMesh.scale.setScalar(pulse);
      this.shieldMesh.rotation.y += dt * 1.5;
      // blink when about to run out
      this.shieldMesh.material.opacity = this.power.shield < 2 ? (Math.sin(performance.now() * 0.02) > 0 ? 0.3 : 0.08) : 0.28;
    }
    this.wings.visible = this.flying;
    if (this.flying) {
      const flap = Math.sin(performance.now() * 0.012) * 0.5;
      this.wingL.rotation.z = flap;
      this.wingR.rotation.z = -flap;
    }
    return event;
  }

  /** Is there roof under the whole glide down from cruising height? */
  landingClear(roofAt, speed) {
    const fallTime = Math.sqrt((2 * Math.max(0.1, this.y)) / PLAYER.gravity);
    const dist = speed * fallTime + 2;
    for (let s = 0; s <= dist; s += 0.5) if (!roofAt(this.z + s)) return false;
    return true;
  }

  /** Death animation: caught = thrown back, fell = keeps falling. */
  updateDead(dt) {
    if (this.dead === 'fell') {
      this.vy -= PLAYER.gravity * dt;
      this.y += this.vy * dt;
      this.group.position.set(this.x, this.y, this.z);
      this.group.rotation.x += dt * 2;
      poseFigure(this.figure, 'fall', 0, 0);
    } else {
      poseFigure(this.figure, 'caught', 0, 0);
    }
  }

  /** A hit that kills. */
  kill(how) {
    this.dead = how;
    this.sliding = 0;
    this.shieldMesh.visible = false;
    this.wings.visible = false;
    this.group.rotation.z = 0;
    if (how === 'caught') {
      this.group.rotation.y = Math.PI;
      poseFigure(this.figure, 'caught', 0, 0);
    }
  }

  /** Revive after a death: back on the roof, shield for a moment. */
  revive() {
    this.dead = null;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.sliding = 0;
    this.flying = false;
    this.flyEnding = false;
    this.pendingJump = 0;
    this.pendingSlide = false;
    this.group.rotation.set(0, 0, 0);
    this.power.shield = Math.max(this.power.shield, 3);
  }
}
