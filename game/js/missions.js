import * as THREE from 'three';
import { box, dist2d, fmtMoney } from './utils.js';

// Marisol Vega's job chain: five missions, from a first delivery to the big
// getaway. Each mission is a list of stages the player works through.
const DEFS = [
  {
    title: '1 — Package Run',
    giver: 'MARISOL VEGA',
    brief: "Danny, first job. Take this package to the Sunset Café on the beach road. Three minutes — don't keep the customer waiting, and try not to wreck my city on day one.",
    objective: 'Deliver the package to Sunset Café',
    stages: [{ type: 'goto', x: -168, z: 90, label: 'Deliver the package to Sunset Café' }],
    time: 180, reward: 250,
  },
  {
    title: "2 — Rico's Ride",
    giver: 'MARISOL VEGA',
    brief: "Rico's waiting outside the Palmera Grand downtown. Pick him up and get him to the safehouse on Coral Street. Fair warning — the cops will be watching, so lose them before you park.",
    objective: 'Pick up Rico at the Palmera Grand',
    stages: [
      { type: 'goto', x: -8, z: 52, label: 'Pick up Rico at the Palmera Grand' },
      { type: 'loseheat', label: 'Lose the cops — stay out of sight until the heat dies down' },
      { type: 'goto', x: 148, z: -148, label: 'Take Rico to the Coral Street safehouse' },
    ],
    time: 0, reward: 400,
  },
  {
    title: '3 — The Yellow Comet',
    giver: 'MARISOL VEGA',
    brief: "A collector wants the yellow Comet parked by the pier. Borrow it — permanently — and bring it to Vega's Garage on the east side. The owner will notice. The cops will notice. Drive like it.",
    objective: 'Steal the yellow Comet by the pier',
    stages: [
      { type: 'steal', label: 'Steal the yellow Comet by the pier' },
      { type: 'goto', x: 118, z: 118, label: "Deliver the Comet to Vega's Garage" },
    ],
    time: 0, reward: 600,
  },
  {
    title: '4 — Beach Dash',
    giver: 'MARISOL VEGA',
    brief: "Time to prove those wheels, Danny. Six checkpoints down the beach road, and the clock is not your friend. Fastest run in the city gets bragging rights — and my money.",
    objective: 'Hit all 6 checkpoints on the beach road',
    stages: [{ type: 'race', checkpoints: [[-168, 150], [-168, 90], [-168, 30], [-168, -30], [-168, -90], [-168, -150]], label: 'Hit the next checkpoint' }],
    time: 150, reward: 800,
  },
  {
    title: '5 — The Big Getaway',
    giver: 'MARISOL VEGA',
    brief: "Last job, Danny. The package goes to the boat at the end of the pier — and the whole city's finest will be on your tail from the first second. Make it to the boat and we're both rich. Don't get caught.",
    objective: 'Reach the boat at the end of the pier',
    stages: [{ type: 'goto', x: -292, z: 0, label: 'Reach the boat at the end of the pier' }],
    time: 240, reward: 1500, startStars: 3,
  },
];

function makeBeacon(scene) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.2, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 13;
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffd21f })
  );
  gem.position.y = 5;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  g.add(beam, gem, ring);
  g.visible = false;
  scene.add(g);
  return { group: g, gem, ring };
}

function makeRico(scene) {
  const g = new THREE.Group();
  g.add(box(0.2, 0.78, 0.2, 0x3b3b3b, -0.13, 0.4, 0));
  g.add(box(0.2, 0.78, 0.2, 0x3b3b3b, 0.13, 0.4, 0));
  g.add(box(0.58, 0.7, 0.32, 0xd84a4a, 0, 1.16, 0));
  g.add(box(0.38, 0.38, 0.38, 0xc98d5f, 0, 1.74, 0));
  g.add(box(0.42, 0.12, 0.42, 0x222222, 0, 1.96, 0));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(-8, 0, 52);
  g.visible = false;
  scene.add(g);
  return g;
}

export class Missions {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx; // {player, getPlayerCar, police, hud, audio, addMoney, onMissionComplete, onMissionFailed, onStoryComplete, carsByName}
    this.index = -1; // no mission active
    this.stage = 0;
    this.timeLeft = 0;
    this.active = false;
    this.done = false; // whole story finished
    this.nextTimer = 0;
    this.raceCp = 0;
    this.target = null;
    this.beacon = makeBeacon(scene);
    this.rico = makeRico(scene);
    this.bobT = 0;
  }

  get currentTitle() {
    return this.active ? DEFS[this.index].title : (this.done ? 'STORY COMPLETE' : 'FREE ROAM');
  }

  get currentObjective() {
    if (!this.active) {
      return this.done
        ? 'You finished all of Marisol’s jobs. Palmera Bay is yours — free roam!'
        : 'Explore Palmera Bay. Your first job is waiting with Marisol.';
    }
    return DEFS[this.index].stages[this.stage].label;
  }

  start(i) {
    const def = DEFS[i];
    if (!def) return;
    this.index = i;
    this.stage = 0;
    this.raceCp = 0;
    this.active = true;
    this.timeLeft = def.time;
    this.rico.visible = i === 1;
    if (def.startStars) this.ctx.police.setStars(def.startStars, 'The heat is on');
    this.ctx.hud.say(def.giver, def.brief, 9);
    this.ctx.hud.feed(def.title + ' — ' + def.stages[0].label);
    this._placeMarker();
  }

  _stageDef() {
    return DEFS[this.index].stages[this.stage];
  }

  _placeMarker() {
    const s = this._stageDef();
    if (!s) { this.target = null; this.beacon.group.visible = false; return; }
    if (s.type === 'goto') {
      this.target = { x: s.x, z: s.z };
      this.beacon.group.position.set(s.x, 0, s.z);
      this.beacon.group.visible = true;
    } else if (s.type === 'steal') {
      const car = this.ctx.carsByName.comet;
      this.target = { x: car.pos.x, z: car.pos.z };
      this.beacon.group.position.set(car.pos.x, 0, car.pos.z);
      this.beacon.group.visible = true;
    } else if (s.type === 'race') {
      const cp = s.checkpoints[this.raceCp];
      this.target = { x: cp[0], z: cp[1] };
      this.beacon.group.position.set(cp[0], 0, cp[1]);
      this.beacon.group.visible = true;
    } else {
      // loseheat: no fixed target, keep the beacon hidden.
      this.target = null;
      this.beacon.group.visible = false;
    }
  }

  // Called by main when the player enters a car.
  onCarEntered(car) {
    if (!this.active) return;
    const s = this._stageDef();
    if (this.index === 2 && s.type === 'steal' && car.name === 'Comet') {
      this.ctx.police.addStars(1, 'You stole the Comet!');
      this.ctx.hud.say('MARISOL VEGA', 'That’s the one! Now get it to my garage — and don’t scratch the paint.', 6);
      this._advance();
    }
  }

  _advance() {
    const def = DEFS[this.index];
    this.stage++;
    if (this.stage >= def.stages.length) {
      this._complete();
      return;
    }
    const s = this._stageDef();
    this.ctx.hud.feed(s.label);
    this._placeMarker();
  }

  _complete() {
    const def = DEFS[this.index];
    this.active = false;
    this.beacon.group.visible = false;
    this.target = null;
    this.ctx.addMoney(def.reward);
    this.ctx.audio.fanfare();
    this.ctx.audio.chime();
    this.ctx.hud.toast('MISSION COMPLETE', '+' + fmtMoney(def.reward) + ' — ' + def.title);
    this.ctx.hud.feed('Mission complete: ' + def.title + ' +' + fmtMoney(def.reward));
    this.ctx.onMissionComplete(this.index, def.reward);
    if (this.index >= DEFS.length - 1) {
      this.done = true;
      this.ctx.onStoryComplete();
    } else {
      this.nextTimer = 4;
    }
  }

  _fail(reason) {
    this.active = false;
    this.beacon.group.visible = false;
    this.target = null;
    this.ctx.audio.failed();
    this.ctx.onMissionFailed(reason, this.index);
  }

  update(dt) {
    this.bobT += dt;
    if (this.beacon.group.visible) {
      this.beacon.gem.position.y = 5 + Math.sin(this.bobT * 2.4) * 0.7;
      this.beacon.gem.rotation.y += dt * 1.6;
      const s = 1 + Math.sin(this.bobT * 2.4) * 0.12;
      this.beacon.ring.scale.set(s, s, 1);
    }
    if (this.nextTimer > 0) {
      this.nextTimer -= dt;
      if (this.nextTimer <= 0) this.start(this.index + 1);
      return;
    }
    if (!this.active) return;
    const def = DEFS[this.index];
    if (def.time > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this._fail('Out of time on "' + def.title + '". Marisol is not impressed.');
        return;
      }
    }
    const p = this.ctx.player;
    const s = this._stageDef();
    if (s.type === 'goto') {
      if (dist2d(p.x, p.z, s.x, s.z) < 7) {
        if (this.index === 1 && this.stage === 0) {
          // Picked up Rico: he hops in, the cops light up.
          this.rico.visible = false;
          this.ctx.police.setStars(2, 'Rico is with you — the cops noticed');
          this.ctx.hud.say('RICO', 'Yo, Danny! Drive, man — we got heat already!', 5);
          this.ctx.audio.horn();
          this._advance();
        } else if (this.index === 1 && this.stage === 2) {
          this.ctx.hud.say('RICO', 'Safehouse, baby. Marisol owes you big for this one.', 5);
          this._advance();
        } else {
          this._complete();
        }
      }
    } else if (s.type === 'loseheat') {
      if (this.ctx.police.stars === 0) {
        this.ctx.hud.say('MARISOL VEGA', 'Clean. Now get Rico to the safehouse.', 5);
        this._advance();
      }
    } else if (s.type === 'steal') {
      // The marker follows the Comet if someone else moves it.
      const car = this.ctx.carsByName.comet;
      this.target = { x: car.pos.x, z: car.pos.z };
      this.beacon.group.position.set(car.pos.x, 0, car.pos.z);
    } else if (s.type === 'race') {
      const cp = s.checkpoints[this.raceCp];
      if (dist2d(p.x, p.z, cp[0], cp[1]) < 8) {
        this.ctx.audio.chime();
        this.raceCp++;
        if (this.raceCp >= s.checkpoints.length) {
          this._complete();
        } else {
          this.ctx.hud.feed('Checkpoint ' + this.raceCp + ' / ' + s.checkpoints.length);
          this._placeMarker();
        }
      }
    }
  }

  restartCurrent() {
    if (this.index >= 0) this.start(this.index);
  }
}
