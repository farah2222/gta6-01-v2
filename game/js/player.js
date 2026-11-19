import * as THREE from 'three';
import { box, clamp, angleLerp } from './utils.js';
import { resolveCircle, groundHeight } from './city.js';

// Danny Reyes on foot: a stylized low-poly figure built from boxes.
export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    this.pos = new THREE.Vector3(8, 0, 8);
    this.heading = 0;
    this.vy = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.attackT = 0;
    this.attackCooldown = 0;
    this.moving = false;

    const skin = 0xe8b98a;
    const shirt = 0x14b8a6;
    const pants = 0x2b2f36;
    // Legs pivot at the hip so they can swing.
    this.legL = new THREE.Group();
    this.legL.position.set(-0.14, 0.82, 0);
    this.legL.add(box(0.22, 0.8, 0.22, pants, 0, -0.4, 0));
    this.legR = new THREE.Group();
    this.legR.position.set(0.14, 0.82, 0);
    this.legR.add(box(0.22, 0.8, 0.22, pants, 0, -0.4, 0));
    this.group.add(this.legL, this.legR);
    this.group.add(box(0.62, 0.72, 0.34, shirt, 0, 1.18, 0)); // torso
    // Arms pivot at the shoulder.
    this.armL = new THREE.Group();
    this.armL.position.set(-0.42, 1.5, 0);
    this.armL.add(box(0.18, 0.66, 0.18, shirt, 0, -0.3, 0));
    this.armR = new THREE.Group();
    this.armR.position.set(0.42, 1.5, 0);
    this.armR.add(box(0.18, 0.66, 0.18, shirt, 0, -0.3, 0));
    this.group.add(this.armL, this.armR);
    this.group.add(box(0.4, 0.4, 0.4, skin, 0, 1.78, 0)); // head
    this.group.add(box(0.44, 0.13, 0.44, 0xf59e0b, 0, 2.0, 0)); // cap
    this.group.add(box(0.44, 0.05, 0.2, 0xf59e0b, 0, 1.95, 0.28)); // cap brim
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  setPosition(x, z) {
    this.pos.set(x, groundHeight(x, z), z);
    this.group.position.copy(this.pos);
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  // Start a punch. Returns false while on cooldown.
  attack() {
    if (this.attackCooldown > 0) return false;
    this.attackT = 0.32;
    this.attackCooldown = 0.45;
    return true;
  }

  update(dt, input, camYaw, colliders) {
    // Camera-relative movement: W walks away from the camera.
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let mx = 0, mz = 0;
    if (input.forward) { mx += fx; mz += fz; }
    if (input.back) { mx -= fx; mz -= fz; }
    if (input.right) { mx += rx; mz += rz; }
    if (input.left) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.01;
    const speed = input.run ? 9.5 : 5.2;
    if (this.moving) {
      mx /= len; mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      this.heading = angleLerp(this.heading, targetHeading, 1 - Math.exp(-12 * dt));
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      this.walkPhase += dt * speed * 1.6;
      resolveCircle(this.pos, 0.6, colliders);
    }
    // Jump + gravity.
    const gy = groundHeight(this.pos.x, this.pos.z);
    if (input.jump && this.onGround) {
      this.vy = 7.6;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gy) {
        this.pos.y = gy;
        this.vy = 0;
        this.onGround = true;
      }
    } else {
      this.pos.y = gy;
    }
    // Walk / punch animation.
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.65 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    if (this.attackT > 0) {
      this.attackT -= dt;
      const p = 1 - this.attackT / 0.32;
      this.armR.rotation.x = -2.1 * Math.sin(p * Math.PI);
      this.armL.rotation.x = 0.4;
    } else {
      this.armR.rotation.x = -swing * 0.8;
      this.armL.rotation.x = swing * 0.8;
    }
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }
}
