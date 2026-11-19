import * as THREE from 'three';
import { box, cyl, clamp } from './utils.js';
import { groundHeight } from './city.js';

// A drivable car built from boxes, cylinders and emissive lights.
export function buildCarGroup(color, police = false) {
  const body = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0xf2f2f2 : color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.3), paint);
  chassis.position.y = 0.55;
  chassis.castShadow = true;
  body.add(chassis);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), dark);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  body.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.28, 1.1), paint);
  hood.position.set(0, 0.72, 1.45);
  body.add(hood);
  if (police) {
    // Black doors + light bar.
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
    for (const s of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 1.6), doorMat);
      door.position.set(s * 1.01, 0.62, -0.2);
      body.add(door);
    }
  }
  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), headMat);
    hl.position.set(s * 0.62, 0.6, 2.16);
    body.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tailMat);
    tl.position.set(s * 0.62, 0.6, -2.16);
    body.add(tl);
  }
  // Wheels: a steer pivot holds a spin group, which holds the cylinder.
  // The cylinder is laid on its side (axis along X); spinning the group
  // around X rolls the wheel.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb8bec6 });
  const wheels = [];
  const steerWheels = [];
  for (const [wx, wz, front] of [[-0.95, 1.45, true], [0.95, 1.45, true], [-0.95, -1.45, false], [0.95, -1.45, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const spin = new THREE.Group();
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    spin.add(wheel, hub);
    pivot.add(spin);
    body.add(pivot);
    wheels.push(spin);
    if (front) steerWheels.push(pivot);
  }
  // Police light bar, with separate red / blue halves for flashing.
  let lightL = null, lightR = null;
  if (police) {
    const bar = box(1.3, 0.16, 0.5, 0x222222, 0, 1.46, -0.25);
    body.add(bar);
    lightL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.52),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    lightL.position.set(-0.32, 1.48, -0.25);
    lightR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.52),
      new THREE.MeshBasicMaterial({ color: 0x2050ff }));
    lightR.position.set(0.32, 1.48, -0.25);
    body.add(lightL, lightR);
  }
  return { body, wheels, steerWheels, lightL, lightR };
}

export class Car {
  constructor(scene, opts) {
    this.name = opts.name || 'Car';
    this.color = opts.color || 0xcc3333;
    this.topSpeed = opts.topSpeed || 26;
    this.accel = opts.accel || 15;
    this.police = !!opts.police;
    this.owner = opts.owner || 'street'; // 'street' | 'player' | 'mission'
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.driver = 'none'; // 'none' | 'player' | 'ai' | 'police'
    this.wrecked = false;
    this.radius = 1.7;
    const built = buildCarGroup(this.color, this.police);
    this.group = built.body;
    this.wheels = built.wheels;
    this.steerWheels = built.steerWheels;
    this.lightL = built.lightL;
    this.lightR = built.lightR;
    this.flashT = 0;
    scene.add(this.group);
  }

  place(x, z, heading = 0) {
    this.pos.set(x, groundHeight(x, z), z);
    this.heading = heading;
    this.speed = 0;
    this.syncMesh();
  }

  // Arcade driving: steer -1..1, throttle -1..1 (negative = brake / reverse).
  drive(dt, steer, throttle) {
    if (this.wrecked) {
      this.speed *= Math.max(0, 1 - 2.5 * dt);
      this.syncMesh();
      return;
    }
    const power = throttle > 0 ? this.accel : this.accel * 0.75;
    this.speed += throttle * power * dt;
    this.speed -= this.speed * 0.32 * dt; // drag + rolling resistance
    if (throttle === 0 && Math.abs(this.speed) < 0.06) this.speed = 0;
    this.speed = clamp(this.speed, -this.topSpeed * 0.42, this.topSpeed);
    const steerFactor = clamp(Math.abs(this.speed) / 8, 0, 1) * (this.speed >= 0 ? 1 : -1);
    this.heading += steer * 1.85 * dt * steerFactor;
    this.steer = steer;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    this.pos.y = groundHeight(this.pos.x, this.pos.z);
    this.syncMesh();
  }

  syncMesh() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    // Body lean into turns and pitch under acceleration.
    this.group.rotation.z = -this.steer * 0.05 * clamp(Math.abs(this.speed) / 12, 0, 1);
    for (const w of this.wheels) w.rotation.x += (this.speed * 0.016);
    for (const p of this.steerWheels) p.rotation.y = this.steer * 0.38;
  }

  flash(dt) {
    if (!this.lightL) return;
    this.flashT += dt;
    const on = Math.floor(this.flashT * 4) % 2 === 0;
    this.lightL.material.color.setHex(on ? 0xff2020 : 0x550000);
    this.lightR.material.color.setHex(on ? 0x000055 : 0x2050ff);
  }

  damage(n) {
    if (this.wrecked) return true;
    this.health -= n;
    if (this.health <= 0) {
      this.health = 0;
      this.wrecked = true;
      this.speed = 0;
      return true;
    }
    return false;
  }

  repair() {
    this.health = this.maxHealth;
    this.wrecked = false;
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}
