import * as THREE from 'three';
import { clamp, dist2d, fmtMoney, angleLerp } from './utils.js';
import { AudioEngine } from './audio.js';
import { buildCity, groundHeight, resolveCircle } from './city.js';
import { Player } from './player.js';
import { Car } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';

const SAVE_KEY = 'palmera-bay-save-v1';

// Danny's cars parked around the city. The blue sedan is his own; the
// yellow Comet is Marisol's mission target; the rest belong to strangers.
const PARKED_CARS = [
  { name: "Danny's Sedan", color: 0x2a6fd8, topSpeed: 27, accel: 16, x: 14, z: 3, heading: Math.PI / 2, owner: 'player' },
  { name: 'Comet', color: 0xffd21f, topSpeed: 34, accel: 19, x: -177, z: -14, heading: 0, owner: 'mission' },
  { name: 'Coupe', color: 0xc0392b, topSpeed: 30, accel: 17, x: -40, z: -58, heading: Math.PI / 2, owner: 'street' },
  { name: 'Hatch', color: 0xe67e22, topSpeed: 25, accel: 15, x: 62, z: 122, heading: 0, owner: 'street' },
  { name: 'Pickup', color: 0x1abc9c, topSpeed: 24, accel: 14, x: -122, z: 62, heading: Math.PI, owner: 'street' },
  { name: 'Van', color: 0xecf0f1, topSpeed: 22, accel: 13, x: 122, z: -62, heading: -Math.PI / 2, owner: 'street' },
  { name: 'Sunset Coupe', color: 0x8e44ad, topSpeed: 29, accel: 17, x: -62, z: -122, heading: Math.PI / 2, owner: 'street' },
  { name: 'Palm Sedan', color: 0x27ae60, topSpeed: 26, accel: 15, x: 172, z: 30, heading: Math.PI, owner: 'street' },
];

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(120, 80, 120);

    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.cityData = buildCity(this.scene);
    this.player = new Player(this.scene);
    this.traffic = new Traffic(this.scene, this.cityData);
    this.police = new Police(this.scene, this.cityData);

    // Parked, drivable cars.
    this.drivableCars = [];
    this.carsByName = {};
    for (const spec of PARKED_CARS) {
      const car = new Car(this.scene, spec);
      car.place(spec.x, spec.z, spec.heading);
      this.drivableCars.push(car);
      this.carsByName[spec.name] = car;
    }

    this.missions = new Missions(this.scene, {
      player: this.player,
      getPlayerCar: () => this.currentCar,
      police: this.police,
      hud: this.hud,
      audio: this.audio,
      addMoney: (n) => { this.money += n; },
      onMissionComplete: (i) => { this.missionIndex = i + 1; this.save(); },
      onMissionFailed: (reason) => { this.endGame('failed', reason); },
      onStoryComplete: () => { this.endGame('story'); },
      carsByName: { comet: this.carsByName['Comet'] },
    });

    // State.
    this.state = 'menu'; // 'menu' | 'playing' | 'paused' | 'over'
    this.overKind = null;
    this.money = 0;
    this.missionIndex = 0;
    this.health = 100;
    this.inCar = false;
    this.currentCar = null;
    this.carsStolen = 0;
    this.bustedCount = 0;
    this.playTime = 0;
    this.lastDamageT = -99;
    this.elapsed = 0;
    this.shakeT = 0;
    this.crashSndT = 0;
    this.ramDmgT = 0;
    this.menuAngle = 0;

    // Camera.
    this.camYaw = Math.PI * 0.75;
    this.camPitch = 0.32;
    this.camYawOffset = 0;
    this.camPos = new THREE.Vector3(120, 80, 120);

    // Input.
    this.keys = {};
    this.input = { forward: false, back: false, left: false, right: false, run: false, jump: false };
    this.dragging = false;
    this.dragMoved = 0;
    this.dragDownT = 0;

    this.load();
    this._bindEvents();
    this._showMenuSaveLine();
    this._exposeDebug();

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ---- Persistence ---------------------------------------------------------
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      this.money = s.money || 0;
      this.missionIndex = s.missionIndex || 0;
      this.carsStolen = s.carsStolen || 0;
      this.bustedCount = s.busted || 0;
      this.playTime = s.playTime || 0;
      if (s.muted) this.audio.setMuted(true);
      if (this.missionIndex >= 5) this.missions.done = true;
    } catch (e) { /* fresh start */ }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: this.money,
        missionIndex: this.missionIndex,
        carsStolen: this.carsStolen,
        busted: this.bustedCount,
        playTime: Math.round(this.playTime),
        muted: this.audio.muted,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  _showMenuSaveLine() {
    const el = this.hud.el['save-line'];
    if (this.money > 0 || this.missionIndex > 0) {
      el.textContent = 'Saved progress: ' + fmtMoney(this.money) + ' · Mission ' +
        Math.min(this.missionIndex + 1, 5) + ' of 5 · ' + this.carsStolen + ' cars stolen';
      this.hud.el['play-btn'].textContent = this.missionIndex >= 5 ? 'FREE ROAM' : 'CONTINUE';
    }
  }

  // ---- Input ----------------------------------------------------------------
  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      this._refreshInput();
      if (e.code === 'KeyE' && this.state === 'playing') this.tryEnterCar();
      if (e.code === 'KeyF' && this.state === 'playing' && !this.inCar) this.doAttack();
      if ((e.code === 'KeyP' || e.code === 'Escape') && (this.state === 'playing' || this.state === 'paused')) this.togglePause();
      if (e.code === 'KeyM') {
        this.audio.setMuted(!this.audio.muted);
        this.hud.feed(this.audio.muted ? 'Sound muted' : 'Sound on');
        this.save();
      }
      if (e.code === 'KeyR' && this.state === 'over') this.retryAfterOver();
      if (e.code === 'Enter' && this.state === 'menu') this.startGame();
      if (e.code === 'Enter' && this.state === 'paused') this.togglePause();
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this._refreshInput();
    });
    const cv = this.renderer.domElement;
    cv.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.dragMoved = 0;
      this.dragDownT = performance.now();
      this._lastPX = e.clientX;
      this._lastPY = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this._lastPX;
      const dy = e.clientY - this._lastPY;
      this._lastPX = e.clientX;
      this._lastPY = e.clientY;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      if (this.state === 'playing' && this.inCar) {
        this.camYawOffset = clamp(this.camYawOffset - dx * 0.004, -1.2, 1.2);
      } else {
        this.camYaw -= dx * 0.005;
        this.camPitch = clamp(this.camPitch + dy * 0.004, 0.08, 1.15);
      }
    });
    window.addEventListener('pointerup', () => {
      if (this.dragging && performance.now() - this.dragDownT < 250 && this.dragMoved < 6) {
        if (this.state === 'playing' && !this.inCar) this.doAttack();
      }
      this.dragging = false;
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    this.hud.el['play-btn'].addEventListener('click', () => this.startGame());
    this.hud.el['resume-btn'].addEventListener('click', () => this.togglePause());
    this.hud.el['restart-btn'].addEventListener('click', () => {
      this.togglePause();
      this.resetRun();
      this.missions.restartCurrent();
      this.hud.feed('Mission restarted');
    });
    this.hud.el['menu-btn'].addEventListener('click', () => {
      this.state = 'menu';
      this.hud.hide('pause');
      this.hud.show('menu');
      this.hud.hideHud();
      this._showMenuSaveLine();
      this.save();
    });
    this.hud.el['end-btn'].addEventListener('click', () => this.retryAfterOver());
  }

  _refreshInput() {
    const k = this.keys;
    this.input.forward = !!(k.KeyW || k.ArrowUp);
    this.input.back = !!(k.KeyS || k.ArrowDown);
    this.input.left = !!(k.KeyA || k.ArrowLeft);
    this.input.right = !!(k.KeyD || k.ArrowRight);
    this.input.run = !!k.ShiftLeft || !!k.ShiftRight;
    this.input.jump = !!k.Space;
  }

  // ---- Flow ------------------------------------------------------------------
  startGame() {
    this.audio.ensure();
    this.audio.click();
    this.hud.hide('menu');
    this.hud.hide('end');
    this.hud.showHud();
    this.state = 'playing';
    this.player.setPosition(8, 8);
    if (this.missionIndex >= 5) {
      this.missions.done = true;
      this.hud.feed('Free roam — all five jobs done. Palmera Bay is yours.');
    } else if (!this.missions.active) {
      this.missions.start(this.missionIndex);
    }
    this.save();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.hud.show('pause');
      this.audio.setEngine(false, 0);
      this.audio.setSiren(false);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hud.hide('pause');
      this.audio.ensure();
    }
  }

  endGame(kind, sub = '') {
    this.state = 'over';
    this.overKind = kind;
    this.audio.setEngine(false, 0);
    this.audio.setSiren(false);
    const t = this.hud.el['end-title'];
    const s = this.hud.el['end-sub'];
    const stats = this.hud.el['end-stats'];
    const btn = this.hud.el['end-btn'];
    const statHtml = 'Money: <b>' + fmtMoney(this.money) + '</b> &nbsp;·&nbsp; Missions: <b>' +
      this.missionIndex + ' / 5</b> &nbsp;·&nbsp; Cars stolen: <b>' + this.carsStolen +
      '</b> &nbsp;·&nbsp; Busted: <b>' + this.bustedCount + '</b>';
    if (kind === 'busted') {
      this.bustedCount++;
      this.audio.busted();
      t.textContent = 'BUSTED';
      t.className = 'big-end busted';
      s.textContent = 'The Palmera Bay police finally caught up with Danny. The job is blown — but the city is still out there.';
      btn.textContent = 'TRY AGAIN';
    } else if (kind === 'wasted') {
      this.audio.wasted();
      t.textContent = 'WASTED';
      t.className = 'big-end wasted';
      s.textContent = 'Danny pushed his luck too far. A trip to the hospital, a dented reputation — and a reason to come back swinging.';
      btn.textContent = 'TRY AGAIN';
    } else if (kind === 'failed') {
      t.textContent = 'MISSION FAILED';
      t.className = 'big-end wasted';
      s.textContent = sub || 'The job fell through.';
      btn.textContent = 'RETRY MISSION';
    } else if (kind === 'story') {
      this.audio.fanfare();
      t.textContent = 'PALMERA BAY IS YOURS';
      t.className = 'big-end win';
      s.textContent = 'All five jobs done. The boat is gone, the money is yours, and Marisol Vega says you are the best driver this city has ever seen. Free roam — the bay is yours now.';
      btn.textContent = 'KEEP EXPLORING';
    }
    stats.innerHTML = statHtml;
    this.hud.show('end');
    this.save();
  }

  retryAfterOver() {
    this.audio.click();
    this.hud.hide('end');
    if (this.overKind === 'story') {
      this.state = 'playing';
      return;
    }
    this.resetRun();
    if (this.overKind === 'failed' && this.missions.index >= 0) {
      this.missions.restartCurrent();
    } else if (this.missions.index >= 0 && !this.missions.done) {
      this.missions.restartCurrent();
    }
    this.state = 'playing';
  }

  resetRun() {
    this.health = 100;
    this.police.reset();
    if (this.inCar && this.currentCar) {
      this.currentCar.driver = 'none';
      this.currentCar.repair();
    }
    this.inCar = false;
    this.currentCar = null;
    this.player.group.visible = true;
    this.player.setPosition(8, 8);
    this.camYaw = Math.PI * 0.75;
    this.camPitch = 0.32;
  }

  // ---- Actions ---------------------------------------------------------------
  tryEnterCar() {
    if (this.inCar) {
      // Exit: step out to the left side of the car.
      const car = this.currentCar;
      const sx = car.pos.x + Math.cos(car.heading) * 2.6;
      const sz = car.pos.z - Math.sin(car.heading) * 2.6;
      car.driver = 'none';
      car.speed = 0;
      this.currentCar = null;
      this.inCar = false;
      this.player.group.visible = true;
      this.player.setPosition(sx, sz);
      this.player.heading = car.heading;
      this.camYaw = car.heading + Math.PI;
      return;
    }
    let best = null, bestD = 4.5;
    for (const car of this.drivableCars) {
      const d = dist2d(this.player.x, this.player.z, car.pos.x, car.pos.z);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (!best) {
      this.hud.feed('No car nearby — press E next to a parked car.');
      return;
    }
    if (best.wrecked) {
      this.hud.feed('This car is wrecked.');
      return;
    }
    this.inCar = true;
    this.currentCar = best;
    best.driver = 'player';
    this.player.group.visible = false;
    this.camYawOffset = 0;
    if (best.owner === 'street') {
      this.carsStolen++;
      this.police.addStars(1, 'Grand theft auto');
      this.hud.feed('You stole the ' + best.name + '! The cops saw that.');
      this.audio.horn();
    } else if (best.owner === 'player') {
      this.hud.feed("Your car. Let's roll.");
    } else {
      this.hud.feed('The ' + best.name + ' — nice wheels.');
    }
    this.missions.onCarEntered(best);
  }

  doAttack() {
    if (!this.player.attack()) return;
    this.audio.punch();
    const px = this.player.x, pz = this.player.z;
    const fx = Math.sin(this.player.heading), fz = Math.cos(this.player.heading);
    // Punch a pedestrian or a cop standing in front of Danny.
    for (const p of this.traffic.peds) {
      if (p.state !== 'walk') continue;
      const dx = p.x - px, dz = p.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < 2.3 && (dx * fx + dz * fz) > 0) {
        p.state = 'down';
        p.timer = 6;
        p.group.rotation.set(0, p.heading, Math.PI / 2);
        p.group.position.y = 0.35;
        this.police.addStars(1, 'Assault in broad daylight');
        this.hud.feed('You knocked someone down! The cops saw that.');
      }
    }
    for (const cop of this.police.cops) {
      const dx = cop.x - px, dz = cop.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < 2.4 && (dx * fx + dz * fz) > 0) {
        cop.x += (dx / d) * 7;
        cop.z += (dz / d) * 7;
        cop.group.position.set(cop.x, groundHeight(cop.x, cop.z), cop.z);
        this.police.addStars(1, 'You hit an officer!');
        this.hud.feed('You shoved a cop! Bad idea, Danny.');
      }
    }
  }

  _damagePlayer(n) {
    this.health -= n;
    this.lastDamageT = this.elapsed;
    this.shakeT = Math.max(this.shakeT, 0.35);
    if (this.health <= 0) {
      this.health = 0;
      this.endGame('wasted');
    }
  }

  // ---- Frame -------------------------------------------------------------------
  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    if (this.state === 'playing') this._update(dt);
    else if (this.state === 'menu') {
      this.menuAngle += dt * 0.04;
      this.camera.position.set(Math.sin(this.menuAngle) * 190, 85, Math.cos(this.menuAngle) * 190);
      this.camera.lookAt(0, 0, 0);
      this._animateAmbient(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  _animateAmbient(dt) {
    for (const c of this.cityData.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 340) c.position.x = -340;
    }
    this.cityData.sea.position.y = 0.02 + Math.sin(this.elapsed * 0.7) * 0.05;
  }

  _update(dt) {
    this.playTime += dt;
    const colliders = this.cityData.colliders;

    // Player / car movement.
    if (this.inCar && this.currentCar) {
      const car = this.currentCar;
      const throttle = (this.input.forward ? 1 : 0) - (this.input.back ? 1 : 0);
      const steer = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
      const before = { x: car.pos.x, z: car.pos.z };
      car.drive(dt, steer, throttle);
      if (resolveCircle(car.pos, car.radius, colliders)) {
        if (Math.abs(car.speed) > 6) {
          car.damage(Math.abs(car.speed) * 1.1);
          this.audio.crash();
          this.shakeT = 0.4;
          if (car.health <= 0) this.hud.feed('Your car is wrecked!');
        }
        car.speed *= 0.35;
      }
      // Car vs car bumps.
      for (const other of [...this.traffic.cars, ...this.police.cars, ...this.drivableCars]) {
        if (other === car || other.wrecked) continue;
        const d = dist2d(car.pos.x, car.pos.z, other.pos.x, other.pos.z);
        if (d < 3.3 && d > 0.01) {
          const push = (3.3 - d) / 2;
          const nx = (car.pos.x - other.pos.x) / d, nz = (car.pos.z - other.pos.z) / d;
          car.pos.x += nx * push;
          car.pos.z += nz * push;
          if (Math.abs(car.speed) > 8) {
            car.damage(4);
            if (other.driver === 'police') this.police.addStars(1, 'You hit a police car!');
            if (this.elapsed - this.crashSndT > 0.5) { this.audio.crash(); this.crashSndT = this.elapsed; }
          }
          car.speed *= 0.85;
        }
      }
      // World bounds.
      car.pos.x = clamp(car.pos.x, -320, 320);
      car.pos.z = clamp(car.pos.z, -320, 320);
      this.audio.setEngine(true, Math.abs(car.speed) / car.topSpeed);
    } else {
      this.player.update(dt, this.input, this.camYaw, colliders);
      this.player.pos.x = clamp(this.player.pos.x, -320, 320);
      this.player.pos.z = clamp(this.player.pos.z, -320, 320);
      this.audio.setEngine(false, 0);
    }

    // Traffic + pedestrians.
    this.traffic.update(dt, this.inCar ? this.currentCar : null, this.player.pos, !this.inCar, colliders);
    for (const ev of this.traffic.events.splice(0)) {
      if (ev.type === 'pedHit') {
        this.police.addStars(1, 'You hit a pedestrian!');
        this.hud.feed('You hit a pedestrian! The cops saw that.');
        this.audio.crash();
        this.shakeT = 0.4;
      }
    }

    // A moving car clipping Danny on foot hurts.
    if (!this.inCar && this.elapsed - this.ramDmgT > 0.6) {
      for (const c of [...this.traffic.cars, ...this.police.cars]) {
        if (c.wrecked || Math.abs(c.speed) < 3) continue;
        const d = dist2d(c.pos.x, c.pos.z, this.player.x, this.player.z);
        if (d < 1.9) {
          this._damagePlayer(12);
          this.ramDmgT = this.elapsed;
          this.audio.crash();
          const nx = (this.player.x - c.pos.x) / (d || 1);
          const nz = (this.player.z - c.pos.z) / (d || 1);
          this.player.pos.x += nx * 3;
          this.player.pos.z += nz * 3;
          break;
        }
      }
    }

    // Police + wanted.
    const pState = {
      pos: this.inCar ? this.currentCar.pos : this.player.pos,
      inCar: this.inCar,
      car: this.currentCar,
      speed: this.inCar ? Math.abs(this.currentCar.speed) : 0,
      health: this.health,
    };
    this.police.update(dt, pState, colliders, this.audio);
    for (const ev of this.police.events.splice(0)) {
      if (ev.type === 'stars') {
        if (ev.n > 0) this.hud.feed(ev.reason ? ev.reason + ' — ' + ev.n + ' star' + (ev.n > 1 ? 's' : '') : ev.n + ' stars');
        else this.hud.feed('You lost the cops. Heat is off.');
      } else if (ev.type === 'ram') {
        if (this.elapsed - this.crashSndT > 0.5) { this.audio.crash(); this.crashSndT = this.elapsed; }
        this.shakeT = Math.max(this.shakeT, 0.3);
      } else if (ev.type === 'ramFoot') {
        this._damagePlayer(14 * dt);
      }
    }
    if (this.police.status === 'busted') {
      this.police.status = null;
      this.endGame('busted');
      return;
    }

    // Wrecked player car: Danny is thrown out.
    if (this.inCar && this.currentCar && this.currentCar.wrecked) {
      this.hud.feed('Your car is wrecked — bail out!');
      this.tryEnterCar();
    }

    // Health regen when the heat is off.
    if (this.police.stars === 0 && this.health < 100 && this.elapsed - this.lastDamageT > 5) {
      this.health = Math.min(100, this.health + 4 * dt);
    }

    // Missions.
    this.missions.update(dt);
    if (this.state !== 'playing') return; // mission may have ended the game

    // Camera.
    this._updateCamera(dt);
    this._animateAmbient(dt);

    // HUD.
    const target = this.missions.target;
    this.hud.update({
      money: this.money,
      stars: this.police.stars,
      health: this.health,
      missionTitle: this.missions.currentTitle,
      objective: this.missions.currentObjective,
      timeLeft: this.missions.active ? this.missions.timeLeft : 0,
      inCar: this.inCar,
      speed: this.inCar ? this.currentCar.speed : 0,
      carHealth: this.inCar ? this.currentCar.health : 100,
      playerX: this.player.x,
      playerZ: this.player.z,
      playerHeading: this.inCar ? this.currentCar.heading : this.player.heading,
      target,
      colliders,
      trafficCars: this.traffic.cars,
      policeCars: this.police.cars,
      time: this.elapsed,
      arrow: target ? this._markerArrow(target) : null,
    }, dt);
  }

  _markerArrow(target) {
    const v = new THREE.Vector3(target.x, 3, target.z).project(this.camera);
    const w = window.innerWidth, h = window.innerHeight;
    const cx = w / 2, cy = h / 2;
    let sx = (v.x * 0.5 + 0.5) * w;
    let sy = (-v.y * 0.5 + 0.5) * h;
    let behind = v.z > 1;
    if (behind) { sx = w - sx; sy = h - sy; }
    const dx = sx - cx, dy = sy - cy;
    const dist = Math.hypot(dx, dy);
    const maxR = Math.min(w, h) * 0.36;
    let ax = sx, ay = sy;
    if (dist > maxR || behind) {
      const a = Math.atan2(dy, dx);
      ax = cx + Math.cos(a) * maxR;
      ay = cy + Math.sin(a) * maxR;
    }
    const angle = Math.atan2(ay - cy, ax - cx) + Math.PI / 2;
    return { x: ax, y: ay, angle, dist };
  }

  _updateCamera(dt) {
    if (this.inCar && this.currentCar) {
      const car = this.currentCar;
      const h = car.heading + this.camYawOffset;
      const fx = Math.sin(h), fz = Math.cos(h);
      const desired = new THREE.Vector3(
        car.pos.x - fx * 12,
        car.pos.y + 5.2,
        car.pos.z - fz * 12
      );
      const k = 1 - Math.exp(-5 * dt);
      this.camPos.lerp(desired, k);
      this.camYawOffset *= Math.exp(-1.2 * dt);
      this.camera.position.copy(this.camPos);
      if (this.shakeT > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shakeT * 0.9;
        this.camera.position.y += (Math.random() - 0.5) * this.shakeT * 0.6;
      }
      this.camera.lookAt(car.pos.x + fx * 4, car.pos.y + 1.4, car.pos.z + fz * 4);
    } else {
      const p = this.player.pos;
      const dist = 8.5;
      const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
      const desired = new THREE.Vector3(
        p.x + Math.sin(this.camYaw) * cp * dist,
        p.y + sp * dist + 1.2,
        p.z + Math.cos(this.camYaw) * cp * dist
      );
      const k = 1 - Math.exp(-14 * dt);
      this.camPos.lerp(desired, k);
      this.camera.position.copy(this.camPos);
      if (this.shakeT > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shakeT * 0.9;
        this.camera.position.y += (Math.random() - 0.5) * this.shakeT * 0.6;
      }
      this.camera.lookAt(p.x, p.y + 1.6, p.z);
    }
    if (this.shakeT > 0) this.shakeT -= dt;
  }

  // ---- Debug hooks for automated play-testing and screenshots ----
  _exposeDebug() {
    window.PB = {
      game: this,
      start: () => this.startGame(),
      setWanted: (n) => this.police.setStars(n, ''),
      // Wanted 3 + patrol cars around the player for a chase shot: one
      // behind, one ahead driving at the player so it is visible.
      chaseNow: () => {
        this.police.setStars(3, '');
        const base = this.inCar ? this.currentCar : null;
        const hx = base ? Math.sin(base.heading) : 0;
        const hz = base ? Math.cos(base.heading) : 1;
        const px = this.inCar ? base.pos.x : this.player.x;
        const pz = this.inCar ? base.pos.z : this.player.z;
        const car1 = this.police._makePatrolCar();
        car1.place(px - hx * 24 + 4, pz - hz * 24, Math.atan2(hx, hz));
        const car2 = this.police._makePatrolCar();
        car2.place(px + hx * 34 - 4, pz + hz * 34, Math.atan2(-hx, -hz));
      },
      clearDialogue: () => { this.hud.el.dialogue.classList.add('hidden'); this.hud.dialogueT = 0; },
      setCarHeading: (h) => { if (this.currentCar) this.currentCar.heading = h; },
      // Snap the chase/orbit camera to its target immediately (screenshots).
      snapCam: () => {
        if (this.inCar && this.currentCar) {
          const car = this.currentCar;
          const h = car.heading + this.camYawOffset;
          this.camPos.set(car.pos.x - Math.sin(h) * 12, car.pos.y + 5.2, car.pos.z - Math.cos(h) * 12);
        } else {
          const p = this.player.pos;
          const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
          this.camPos.set(p.x + Math.sin(this.camYaw) * cp * 8.5, p.y + sp * 8.5 + 1.2, p.z + Math.cos(this.camYaw) * cp * 8.5);
        }
      },
      teleport: (x, z) => {
        if (this.inCar && this.currentCar) this.currentCar.place(x, z, this.currentCar.heading);
        else this.player.setPosition(x, z);
      },
      enterCar: (name) => {
        const car = this.carsByName[name];
        if (!car) return false;
        if (this.inCar) this.tryEnterCar();
        this.player.setPosition(car.pos.x + 2, car.pos.z);
        this.tryEnterCar();
        return this.inCar;
      },
      startMission: (i) => { this.missions.start(i); },
      setCamYaw: (y) => { this.camYaw = y; },
      state: () => ({
        state: this.state,
        money: this.money,
        stars: this.police.stars,
        health: Math.round(this.health),
        mission: this.missions.currentTitle,
        objective: this.missions.currentObjective,
        pos: [Math.round(this.player.x), Math.round(this.player.z)],
        inCar: this.inCar,
        car: this.currentCar ? this.currentCar.name : null,
      }),
    };
  }
}

new Game();
