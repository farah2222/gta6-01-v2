import * as THREE from 'three';
import { box, rand, randInt, pick, clamp, angleDiff, dist2d } from './utils.js';
import { ROADS, ROAD_HALF, resolveCircle, groundHeight } from './city.js';
import { Car } from './vehicles.js';

// Lane offset for right-hand traffic: which side of the road centre a car
// drives on depends on its direction of travel.
function laneOffset(axis, dir) {
  if (axis === 'x') return dir > 0 ? 2.8 : -2.8; // moving +x: lane at +z
  return dir > 0 ? -2.8 : 2.8; // moving +z: lane at -x
}
function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

function makePedestrian(scene) {
  const g = new THREE.Group();
  const shirt = pick([0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xe67e22]);
  const legL = new THREE.Group();
  legL.position.set(-0.11, 0.78, 0);
  legL.add(box(0.17, 0.76, 0.17, 0x2c3e50, 0, -0.38, 0));
  const legR = new THREE.Group();
  legR.position.set(0.11, 0.78, 0);
  legR.add(box(0.17, 0.76, 0.17, 0x2c3e50, 0, -0.38, 0));
  g.add(legL, legR);
  g.add(box(0.55, 0.68, 0.3, shirt, 0, 1.12, 0));
  g.add(box(0.38, 0.38, 0.38, pick([0xe8b98a, 0xc98d5f, 0x8a5a3b, 0xf2c9a0]), 0, 1.7, 0));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return { group: g, legL, legR, phase: rand(Math.PI * 2) };
}

export class Traffic {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    this.peds = [];
    this.events = []; // drained by main: {type:'pedHit', x, z}
    const colors = [0x8a8f96, 0xd8d8d8, 0x3a6ea5, 0x7a4a8a, 0x4a7a5a, 0xc47a2a, 0x9a2a2a, 0x2a6a6a];
    for (let i = 0; i < 12; i++) {
      const car = new Car(scene, { name: 'Traffic', color: pick(colors), topSpeed: rand(10, 14), accel: 8 });
      car.driver = 'ai';
      this.spawnCarOnRoad(car, true);
      this.cars.push(car);
    }
    for (let i = 0; i < 18; i++) {
      this.peds.push(this.spawnPed());
    }
  }

  // Place an AI car at a random spot on a random road.
  spawnCarOnRoad(car, anywhere = false) {
    const axis = pick(['x', 'z']);
    const road = pick(ROADS);
    const dir = pick([-1, 1]);
    const along = anywhere ? rand(-180, 180) : rand(-200, 200);
    const lane = laneOffset(axis, dir);
    if (axis === 'x') car.place(along, road + lane, headingFor(axis, dir));
    else car.place(road + lane, along, headingFor(axis, dir));
    car.speed = rand(8, 13);
    car.ai = { axis, road, dir, desiredSpeed: rand(9, 14), turnCooldown: rand(1, 4) };
  }

  spawnPed() {
    const axis = pick(['x', 'z']);
    const road = pick(ROADS);
    const dir = pick([-1, 1]);
    const along = rand(-180, 180);
    const side = pick([-1, 1]);
    const off = ROAD_HALF + 2.2 + side * 1.4;
    const x = axis === 'x' ? along : road + off;
    const z = axis === 'x' ? road + off : along;
    const fig = makePedestrian(this.scene);
    fig.group.position.set(x, 0, z);
    return {
      ...fig,
      x, z,
      axis, road, dir, side,
      speed: rand(1.4, 2.6),
      heading: headingFor(axis, dir),
      state: 'walk', // 'walk' | 'down'
      timer: 0,
    };
  }

  // Is there a car close ahead of `car` on the same road?
  _blockedAhead(car, others) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (const o of others) {
      if (o === car || o.wrecked) continue;
      const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
      const ahead = dx * fx + dz * fz;
      if (ahead > 0 && ahead < 10) {
        const side = Math.abs(dx * fz - dz * fx);
        if (side < 2.6) return true;
      }
    }
    return false;
  }

  update(dt, playerCar, playerPos, playerOnFoot, colliders) {
    const allCars = [...this.cars, ...(playerCar ? [playerCar] : [])];
    for (const car of this.cars) {
      if (car.wrecked) continue;
      const ai = car.ai;
      // Decide to turn at an intersection now and then.
      ai.turnCooldown -= dt;
      const along = ai.axis === 'x' ? car.pos.x : car.pos.z;
      const nearCross = Math.abs(((along % 60) + 60) % 60) < 2.5 || Math.abs((((along % 60) + 60) % 60) - 60) < 2.5;
      if (nearCross && ai.turnCooldown <= 0 && Math.random() < 0.35) {
        const cross = Math.round(along / 60) * 60;
        if (Math.abs(cross) <= 180 && Math.random() < 0.7) {
          // Turn 90 degrees onto the crossing road.
          const newAxis = ai.axis === 'x' ? 'z' : 'x';
          const newDir = pick([-1, 1]);
          const lane = laneOffset(newAxis, newDir);
          if (newAxis === 'x') {
            car.pos.z = cross + lane;
            car.pos.x = clamp(car.pos.x, -195, 195);
          } else {
            car.pos.x = cross + lane;
            car.pos.z = clamp(car.pos.z, -195, 195);
          }
          ai.axis = newAxis;
          ai.road = cross;
          ai.dir = newDir;
        } else {
          // U-turn.
          ai.dir *= -1;
          const lane = laneOffset(ai.axis, ai.dir);
          if (ai.axis === 'x') car.pos.z = ai.road + lane;
          else car.pos.x = ai.road + lane;
        }
        ai.turnCooldown = rand(3, 7);
      }
      // Keep inside the city; turn around at the edges.
      if (Math.abs(car.pos.x) > 198 || Math.abs(car.pos.z) > 198) {
        ai.dir *= -1;
        const lane = laneOffset(ai.axis, ai.dir);
        if (ai.axis === 'x') car.pos.z = ai.road + lane;
        else car.pos.x = ai.road + lane;
        ai.turnCooldown = 3;
      }
      const desired = headingFor(ai.axis, ai.dir);
      const steer = clamp(angleDiff(car.heading, desired) * 1.6, -1, 1);
      const blocked = this._blockedAhead(car, allCars);
      const throttle = blocked ? (car.speed > 0.5 ? -0.7 : 0) : 0.75;
      const before = { x: car.pos.x, z: car.pos.z };
      car.drive(dt, steer, throttle);
      if (resolveCircle(car.pos, car.radius, colliders)) {
        // Bumped a building: stop and turn around.
        car.speed = 0;
        ai.dir *= -1;
        const lane = laneOffset(ai.axis, ai.dir);
        if (ai.axis === 'x') car.pos.z = ai.road + lane;
        else car.pos.x = ai.road + lane;
        ai.turnCooldown = 3;
      }
      // Gentle car-car separation.
      for (const o of allCars) {
        if (o === car || o.wrecked) continue;
        const d = dist2d(car.pos.x, car.pos.z, o.pos.x, o.pos.z);
        if (d < 3.4 && d > 0.01) {
          const push = (3.4 - d) / 2;
          const nx = (car.pos.x - o.pos.x) / d, nz = (car.pos.z - o.pos.z) / d;
          car.pos.x += nx * push;
          car.pos.z += nz * push;
        }
      }
      car.syncMesh();
    }

    // Pedestrians.
    for (const p of this.peds) {
      if (p.state === 'down') {
        p.timer -= dt;
        if (p.timer <= 0) {
          const fresh = this.spawnPed();
          p.group.position.set(fresh.x, fresh.z, 0);
          p.x = fresh.x; p.z = fresh.z;
          p.axis = fresh.axis; p.road = fresh.road; p.dir = fresh.dir; p.side = fresh.side;
          p.speed = fresh.speed;
          p.heading = fresh.heading;
          p.group.rotation.set(0, p.heading, 0);
          p.group.visible = true;
          p.state = 'walk';
          this.scene.remove(fresh.group);
        }
        continue;
      }
      const along = p.axis === 'x' ? p.x : p.z;
      const nearCross = Math.abs(((along % 60) + 60) % 60) < 2 || Math.abs((((along % 60) + 60) % 60) - 60) < 2;
      if (nearCross && Math.random() < dt * 0.25) {
        const cross = Math.round(along / 60) * 60;
        if (Math.abs(cross) <= 180) {
          p.axis = p.axis === 'x' ? 'z' : 'x';
          p.dir = pick([-1, 1]);
          p.road = cross;
          p.heading = headingFor(p.axis, p.dir);
        }
      }
      if (Math.abs(p.x) > 195 || Math.abs(p.z) > 195) p.dir *= -1;
      p.heading = headingFor(p.axis, p.dir);
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      p.x += fx * p.speed * dt;
      p.z += fz * p.speed * dt;
      // Stay on the sidewalk strip next to the road.
      const off = ROAD_HALF + 2.2 + p.side * 1.4;
      if (p.axis === 'x') p.z = p.road + off;
      else p.x = p.road + off;
      p.phase += dt * p.speed * 3.2;
      p.legL.rotation.x = Math.sin(p.phase) * 0.55;
      p.legR.rotation.x = -Math.sin(p.phase) * 0.55;
      p.group.position.set(p.x, groundHeight(p.x, p.z), p.z);
      p.group.rotation.y = p.heading;
      // Hit by the player's car?
      if (playerCar && !playerOnFoot && Math.abs(playerCar.speed) > 3) {
        const d = dist2d(p.x, p.z, playerCar.pos.x, playerCar.pos.z);
        if (d < 2.1) {
          p.state = 'down';
          p.timer = 6;
          p.group.rotation.set(0, p.heading, Math.PI / 2);
          p.group.position.y = 0.35;
          this.events.push({ type: 'pedHit', x: p.x, z: p.z });
        }
      }
    }
  }
}
