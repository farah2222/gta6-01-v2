import * as THREE from 'three';
import { rand, randInt, pick, canvasTexture, box, cyl } from './utils.js';

// ---- World layout -------------------------------------------------------
// Roads run on a 60-unit grid. Beach and sea lie west of x = BEACH_X.
// The pier reaches into the sea at z = 0.
export const ROADS = [-180, -120, -60, 0, 60, 120, 180];
export const ROAD_HALF = 6;
export const CITY_EDGE = 210;
export const BEACH_X = -186;
export const SEA_X = -246;
export const PIER_END_X = -292;
export const BLOCK_CENTERS = [-150, -90, -30, 30, 90, 150];

// Walkable height: the pier deck sits 0.35 above the ground.
export function groundHeight(x, z) {
  if (z > -6 && z < 6 && x < BEACH_X && x > PIER_END_X) return 0.35;
  return 0;
}

// Push a circle (x, z, radius) out of every building collider it overlaps.
// Mutates pos, returns true when a collision happened.
export function resolveCircle(pos, radius, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        const pl = pos.x - c.minX, pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

function windowTexture(base, lit) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 12; y += 22) {
      for (let x = 10; x < w - 12; x += 20) {
        const r = Math.random();
        g.fillStyle = r < 0.22 ? lit : (r < 0.6 ? '#202b38' : '#31445a');
        g.fillRect(x, y, 12, 14);
      }
    }
  });
}

function roadTexture() {
  // U runs along the road (repeated), V runs across its 12-unit width.
  return canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = '#3a3f46';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f3339';
    for (let i = 0; i < 40; i++) g.fillRect(rand(w), rand(h), 3, 2);
    // Double yellow centre lines, running along the road.
    g.fillStyle = '#f5c542';
    g.fillRect(0, h / 2 - 7, w, 3);
    g.fillRect(0, h / 2 + 4, w, 3);
    // White edge lines.
    g.fillStyle = '#e8e4d8';
    g.fillRect(0, 4, w, 2);
    g.fillRect(0, h - 6, w, 2);
  });
}

function makePalm() {
  const g = new THREE.Group();
  const h = rand(4.2, 6.2);
  const trunk = cyl(0.16, 0.26, h, 0x8a6b45, 0, h / 2, 0);
  trunk.rotation.z = rand(-0.08, 0.08);
  g.add(trunk);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44 });
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 2.4), frondMat);
    const a = (i / 6) * Math.PI * 2;
    frond.position.set(Math.sin(a) * 0.9, h + 0.1, Math.cos(a) * 0.9);
    frond.rotation.y = a;
    frond.rotation.x = 0.55;
    g.add(frond);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
  nuts.position.set(0, h - 0.15, 0);
  g.add(nuts);
  return g;
}

function makeUmbrella(color) {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.05, 2.4, 0xffffff, 0, 1.2, 0, 6));
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.8, 10), new THREE.MeshLambertMaterial({ color }));
  top.position.y = 2.6;
  g.add(top);
  return g;
}

export function buildCity(scene) {
  const colliders = [];
  const clouds = [];

  // ---- Sky, light, fog ----
  scene.background = new THREE.Color(0x87c5eb);
  scene.fog = new THREE.Fog(0xa8d4ef, 320, 850);
  const hemi = new THREE.HemisphereLight(0xbfdfff, 0x8a7a5a, 1.15);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xffffff, 0.28));
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.7);
  sun.position.set(140, 200, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
  sunBall.position.set(300, 260, -420);
  scene.add(sunBall);

  // ---- Ground, sand, sea ----
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100),
    new THREE.MeshLambertMaterial({ color: 0x69a85c }));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(60, 760),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-216, 0.06, 0);
  sand.receiveShadow = true;
  scene.add(sand);
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x1f7fc4 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(340, 780), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-416, 0.02, 0);
  scene.add(sea);
  // A lighter band where the waves meet the sand.
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(10, 780),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ef }));
  surf.rotation.x = -Math.PI / 2;
  surf.position.set(-248, 0.05, 0);
  scene.add(surf);

  // ---- Roads (textured asphalt with dashes) ----
  const rTex = roadTexture();
  rTex.wrapS = THREE.RepeatWrapping;
  rTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshLambertMaterial({ map: rTex });
  for (const r of ROADS) {
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(430, ROAD_HALF * 2), roadMat.clone());
    rx.material.map = rTex.clone();
    rx.material.map.repeat.set(430 / 16, 1);
    rx.material.map.needsUpdate = true;
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.08, r);
    rx.receiveShadow = true;
    scene.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(430, ROAD_HALF * 2), roadMat.clone());
    rz.material.map = rTex.clone();
    rz.material.map.repeat.set(430 / 16, 1);
    rz.material.map.needsUpdate = true;
    rz.rotation.x = -Math.PI / 2;
    rz.rotation.z = Math.PI / 2;
    rz.position.set(r, 0.08, 0);
    rz.receiveShadow = true;
    scene.add(rz);
  }

  // ---- Sidewalks ----
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(48, 0.14, 48), walkMat);
      w.position.set(bx, 0.07, bz);
      w.receiveShadow = true;
      scene.add(w);
    }
  }

  // ---- Buildings ----
  const facades = [
    windowTexture('#7fa8c9', '#ffe9a8'),
    windowTexture('#5d7f9e', '#ffd97a'),
    windowTexture('#c9a06a', '#fff3c4'),
    windowTexture('#8d99ae', '#ffe9a8'),
  ];
  const houseColors = [0xf2c9a0, 0xf7e6c4, 0xcfe8d8, 0xf6c6d8, 0xd8e4f6, 0xffe9b0];
  const addCollider = (x, z, w, d) => {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const downtown = Math.abs(bx) <= 90 && Math.abs(bz) <= 90;
      const beachfront = bx === -150;
      if (downtown) {
        // Glass tower.
        const w = rand(20, 28), d = rand(20, 28), h = rand(26, 58);
        const mat = new THREE.MeshLambertMaterial({ map: pick(facades) });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(bx + rand(-4, 4), h / 2, bz + rand(-4, 4));
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        const roof = box(w * 0.7, 1.2, d * 0.7, 0x4a5568, b.position.x, h + 0.6, b.position.z);
        scene.add(roof);
        addCollider(b.position.x, b.position.z, w, d);
      } else if (beachfront) {
        // Low beach hotel.
        const w = rand(24, 32), d = rand(16, 20), h = rand(10, 17);
        const mat = new THREE.MeshLambertMaterial({ map: pick(facades) });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(bx, h / 2, bz + rand(-6, 6));
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        addCollider(b.position.x, b.position.z, w, d);
      } else {
        // Suburban houses, two per block.
        for (let k = 0; k < 2; k++) {
          const hx = bx + (k === 0 ? -11 : 11);
          const hz = bz + rand(-10, 10);
          const w = rand(9, 13), d = rand(9, 13), h = rand(4, 7);
          const col = pick(houseColors);
          const b = box(w, h, d, col, hx, h / 2, hz);
          b.castShadow = true;
          b.receiveShadow = true;
          scene.add(b);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, rand(2, 3.4), 4),
            new THREE.MeshLambertMaterial({ color: pick([0xb3543f, 0x7a5a3a, 0x4a6b8a]) }));
          roof.position.set(hx, h + 1.2, hz);
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          scene.add(roof);
          addCollider(hx, hz, w, d);
        }
      }
    }
  }

  // ---- Palm trees ----
  const palmSpots = [];
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      palmSpots.push([bx + 25, bz + 25], [bx - 25, bz - 25]);
    }
  }
  for (let z = -180; z <= 180; z += 24) palmSpots.push([-200, z]);
  for (const [x, z] of palmSpots) {
    if (Math.random() < 0.55) continue;
    const p = makePalm();
    p.position.set(x + rand(-2, 2), 0, z + rand(-2, 2));
    p.rotation.y = rand(Math.PI * 2);
    scene.add(p);
  }

  // ---- Beach props ----
  const umbColors = [0xff6b6b, 0xffd21f, 0x4ecdc4, 0xff9f1c, 0x7b61ff];
  for (let i = 0; i < 14; i++) {
    const u = makeUmbrella(pick(umbColors));
    u.position.set(rand(-232, -196), 0, rand(-180, 180));
    scene.add(u);
    const towel = box(1.2, 0.04, 2.2, pick(umbColors), u.position.x + rand(-2, 2), 0.1, u.position.z + rand(-2, 2));
    towel.rotation.y = rand(Math.PI);
    scene.add(towel);
  }
  // Lifeguard tower.
  const lg = new THREE.Group();
  lg.add(box(0.25, 3.4, 0.25, 0xffffff, -1, 1.7, -1));
  lg.add(box(0.25, 3.4, 0.25, 0xffffff, 1, 1.7, -1));
  lg.add(box(0.25, 3.4, 0.25, 0xffffff, -1, 1.7, 1));
  lg.add(box(0.25, 3.4, 0.25, 0xffffff, 1, 1.7, 1));
  lg.add(box(2.6, 0.3, 2.6, 0xff5b5b, 0, 3.5, 0));
  lg.add(box(2.4, 1.1, 2.2, 0xffffff, 0, 4.2, 0));
  const lgRoof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1, 4), new THREE.MeshLambertMaterial({ color: 0xff5b5b }));
  lgRoof.position.y = 5.3;
  lgRoof.rotation.y = Math.PI / 4;
  lg.add(lgRoof);
  lg.position.set(-208, 0, 40);
  scene.add(lg);
  addCollider(-208, 40, 3, 3);

  // ---- Pier ----
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a6b45 });
  for (let x = -190; x >= -292; x -= 9) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.3, 12), pierMat);
    plank.position.set(x, 0.2, 0);
    plank.receiveShadow = true;
    scene.add(plank);
  }
  for (let x = -192; x >= -290; x -= 14) {
    for (const z of [-5.4, 5.4]) {
      const post = cyl(0.3, 0.3, 2.6, 0x6b4a2a, x, -0.8, z, 8);
      scene.add(post);
    }
  }
  // Rails along the pier edges.
  for (const z of [-5.8, 5.8]) {
    const rail = box(104, 0.12, 0.12, 0x6b4a2a, -241, 1.15, z);
    scene.add(rail);
  }
  // Lamp posts on the pier.
  for (let x = -200; x >= -288; x -= 22) {
    const pole = cyl(0.08, 0.1, 3, 0x333333, x, 1.5, -5.4, 6);
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    lamp.position.set(x, 3.1, -5.4);
    scene.add(lamp);
  }
  // End platform + shack + the getaway boat.
  const plat = box(14, 0.4, 16, 0x9a6b45, -296, 0.2, 0);
  plat.receiveShadow = true;
  scene.add(plat);
  const shack = box(4, 3, 4, 0x4ecdc4, -296, 1.9, -4);
  shack.castShadow = true;
  scene.add(shack);
  addCollider(-296, -4, 4, 4);
  const boat = new THREE.Group();
  boat.add(box(3, 1.1, 7, 0xffffff, 0, 0.4, 0));
  boat.add(box(2, 1, 3, 0x1f7fc4, 0, 1.4, -0.5));
  boat.add(box(2.6, 0.2, 7.4, 0xff5b5b, 0, 1.0, 0));
  boat.position.set(-306, 0.1, 2);
  boat.rotation.y = 0.3;
  scene.add(boat);
  // Pier entrance posts block cars, not people.
  addCollider(-188, -7, 2, 2);
  addCollider(-188, 7, 2, 2);

  // ---- Streetlights at intersections ----
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      if (Math.abs(rx) > 120 || Math.abs(rz) > 120) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6), lampMat);
      pole.position.set(rx + 8, 2.7, rz + 8);
      scene.add(pole);
      const arm = box(1.6, 0.1, 0.1, 0x2b2f36, rx + 7.2, 5.4, rz + 8);
      scene.add(arm);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bulbMat);
      bulb.position.set(rx + 6.4, 5.3, rz + 8);
      scene.add(bulb);
    }
  }

  // ---- Clouds (unlit so they stay bright white) ----
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    const n = randInt(3, 5);
    for (let k = 0; k < n; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rand(4, 8), 10, 8), cloudMat);
      s.position.set(k * rand(4, 7) - n * 2.5, rand(-1, 1), rand(-3, 3));
      s.scale.y = 0.45;
      c.add(s);
    }
    c.position.set(rand(-320, 320), rand(60, 95), rand(-320, 320));
    scene.add(c);
    clouds.push(c);
  }

  // ---- Named landmarks (for missions and spawning) ----
  const landmarks = {
    cafe: { x: -168, z: 90, name: 'Sunset Café' },
    hotel: { x: -8, z: 52, name: 'Palmera Grand Hotel' },
    safehouse: { x: 148, z: -148, name: 'Coral Street Safehouse' },
    garage: { x: 118, z: 118, name: "Vega's Garage" },
    pierEnd: { x: -292, z: 0, name: 'Pier End' },
    playerSpawn: { x: 8, z: 8 },
  };

  return { colliders, clouds, sea, landmarks };
}
