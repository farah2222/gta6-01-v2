import * as THREE from 'three';
import { box, rand, pick, clamp, angleDiff, dist2d } from './utils.js';
import { ROADS, resolveCircle, groundHeight } from './city.js';
import { Car } from './vehicles.js';

// Wanted level (1-5 stars) and the police response: chasing patrol cars
// and foot officers who try to arrest Danny.
export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.stars = 0;
    this.cars = [];
    this.cops = [];
    this.decayT = 0;
    this.bustedT = 0;
    this.status = null; // null | 'busted'
    this.events = []; // drained by main: {type:'stars', n, reason} etc.
    this.onStars = null;
    this.nearestDist = 999;
  }

  setStars(n, reason = '') {
    const next = clamp(Math.round(n), 0, 5);
    if (next === this.stars) return;
    this.stars = next;
    this.decayT = 0;
    this.bustedT = 0;
    this.events.push({ type: 'stars', n: next, reason });
    if (this.onStars) this.onStars(next, reason);
  }

  addStars(n, reason = '') {
    this.setStars(this.stars + n, reason);
  }

  // A road point roughly `dist` metres from the player, for spawning.
  _spawnPoint(playerPos, dist) {
    for (let tries = 0; tries < 12; tries++) {
      const axis = pick(['x', 'z']);
      const road = pick(ROADS);
      const along = clamp((axis === 'x' ? playerPos.x : playerPos.z) + pick([-1, 1]) * dist * rand(0.8, 1.3), -180, 180);
      const x = axis === 'x' ? along : road;
      const z = axis === 'x' ? road : along;
      if (dist2d(x, z, playerPos.x, playerPos.z) > 40) return { x, z };
    }
    return { x: playerPos.x + 60, z: playerPos.z };
  }

  _makePatrolCar() {
    const car = new Car(this.scene, {
      name: 'PBPD Patrol', color: 0xf2f2f2, topSpeed: 30, accel: 19, police: true,
    });
    car.driver = 'police';
    this.cars.push(car);
    return car;
  }

  _makeCop(x, z) {
    const g = new THREE.Group();
    const legL = new THREE.Group();
    legL.position.set(-0.13, 0.8, 0);
    legL.add(box(0.2, 0.78, 0.2, 0x1c2733, 0, -0.39, 0));
    const legR = new THREE.Group();
    legR.position.set(0.13, 0.8, 0);
    legR.add(box(0.2, 0.78, 0.2, 0x1c2733, 0, -0.39, 0));
    g.add(legL, legR);
    g.add(box(0.6, 0.7, 0.32, 0x1e3a5f, 0, 1.16, 0)); // navy uniform
    g.add(box(0.38, 0.38, 0.38, 0xe8b98a, 0, 1.74, 0));
    g.add(box(0.42, 0.12, 0.42, 0x10233d, 0, 1.95, 0)); // cap
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(x, 0, z);
    this.scene.add(g);
    const cop = { group: g, legL, legR, phase: rand(6), x, z, speed: 7.4 };
    this.cops.push(cop);
    return cop;
  }

  reset() {
    for (const c of this.cars) c.dispose(this.scene);
    for (const c of this.cops) this.scene.remove(c.group);
    this.cars = [];
    this.cops = [];
    this.stars = 0;
    this.decayT = 0;
    this.bustedT = 0;
    this.status = null;
    this.nearestDist = 999;
  }

  update(dt, player, colliders, audio) {
    // player: {pos, inCar, car, speed, health}
    const wantedCars = this.stars >= 1 ? Math.min(1 + Math.floor(this.stars / 2), 4) : 0;
    // Spawn / despawn patrol cars.
    while (this.cars.length < wantedCars) {
      const car = this._makePatrolCar();
      const p = this._spawnPoint(player.pos, 65);
      car.place(p.x, p.z, rand(Math.PI * 2));
    }
    while (this.cars.length > wantedCars) {
      const car = this.cars.pop();
      car.dispose(this.scene);
    }
    // Foot cops only chase Danny on foot.
    const wantedCops = !player.inCar && this.stars >= 1 ? Math.min(this.stars, 2) : 0;
    while (this.cops.length < wantedCops) {
      const p = this._spawnPoint(player.pos, 35);
      this._makeCop(p.x, p.z);
    }
    while (this.cops.length > wantedCops) {
      const cop = this.cops.pop();
      this.scene.remove(cop.group);
    }

    this.nearestDist = 999;
    let anyClose = false;

    // Patrol cars pursue the player and ram.
    for (const car of this.cars) {
      if (car.wrecked) continue;
      const dx = player.pos.x - car.pos.x;
      const dz = player.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      this.nearestDist = Math.min(this.nearestDist, d);
      const desired = Math.atan2(dx, dz);
      const steer = clamp(angleDiff(car.heading, desired) * 2.2, -1, 1);
      let throttle = 1;
      if (d < 6) throttle = 0.75;
      if (d < 3.4) {
        // Ramming: shove the player's car and damage it; on foot, hurt Danny.
        if (player.inCar && player.car) {
          const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
          player.car.pos.x += fx * 6 * dt;
          player.car.pos.z += fz * 6 * dt;
          player.car.damage(9 * dt);
          this.events.push({ type: 'ram', x: player.pos.x, z: player.pos.z });
        } else if (d < 2.4) {
          this.events.push({ type: 'ramFoot', x: player.pos.x, z: player.pos.z });
        }
        throttle = 0.4;
      }
      car.drive(dt, steer, throttle);
      resolveCircle(car.pos, car.radius, colliders);
      car.flash(dt);
      if (d < 55) anyClose = true;
    }

    // Foot cops run Danny down and try to arrest him.
    let copTouching = false;
    for (const cop of this.cops) {
      const dx = player.pos.x - cop.x;
      const dz = player.pos.z - cop.z;
      const d = Math.hypot(dx, dz);
      this.nearestDist = Math.min(this.nearestDist, d);
      if (d > 0.5) {
        const h = Math.atan2(dx, dz);
        cop.x += Math.sin(h) * cop.speed * dt;
        cop.z += Math.cos(h) * cop.speed * dt;
        cop.phase += dt * cop.speed * 1.8;
        cop.legL.rotation.x = Math.sin(cop.phase) * 0.7;
        cop.legR.rotation.x = -Math.sin(cop.phase) * 0.7;
        cop.group.rotation.y = h;
      }
      cop.group.position.set(cop.x, groundHeight(cop.x, cop.z), cop.z);
      if (d < 2.3) copTouching = true;
      if (d < 55) anyClose = true;
    }

    // Busted: arrested on foot, or boxed in while driving.
    if (this.stars >= 1) {
      if (!player.inCar && copTouching) {
        this.bustedT += dt;
        if (this.bustedT > 1.5) this.status = 'busted';
      } else if (player.inCar && player.speed < 1.5) {
        let boxed = false;
        for (const car of this.cars) {
          if (!car.wrecked && dist2d(car.pos.x, car.pos.z, player.pos.x, player.pos.z) < 4.5) boxed = true;
        }
        if (boxed) {
          this.bustedT += dt;
          if (this.bustedT > 3) this.status = 'busted';
        } else {
          this.bustedT = Math.max(0, this.bustedT - dt);
        }
      } else {
        this.bustedT = Math.max(0, this.bustedT - dt * 2);
      }
      // Wanted decays when no police can see Danny.
      if (!anyClose) {
        this.decayT += dt;
        if (this.decayT > 6) {
          this.decayT = 0;
          this.setStars(this.stars - 1, 'You lost them');
        }
      } else {
        this.decayT = 0;
      }
    }

    if (audio) audio.setSiren(this.stars >= 1);
  }
}
