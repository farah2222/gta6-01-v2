import { fmtMoney, fmtTime, clamp } from './utils.js';
import { ROADS } from './city.js';

// All DOM HUD: money, wanted stars, health, minimap, speed, objectives,
// dialogue box, message feed, toasts and the overlay screens.
export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'money', 'stars', 'health-fill', 'mission-title', 'objective', 'timer',
      'minimap', 'speed', 'car-health', 'feed', 'dialogue', 'dlg-speaker', 'dlg-text',
      'marker-arrow', 'toast', 'toast-title', 'toast-sub',
      'menu', 'pause', 'end', 'end-title', 'end-sub', 'end-stats', 'end-btn',
      'play-btn', 'resume-btn', 'restart-btn', 'menu-btn', 'save-line']) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.dialogueT = 0;
    this.toastT = 0;
    this.feedItems = [];
  }

  // ---- Minimap ------------------------------------------------------------
  _mapXY(x, z) {
    // World x,z in [-260, 220] -> canvas 200x200.
    return [((x + 260) / 480) * 200, ((z + 260) / 480) * 200];
  }

  drawMinimap(state) {
    const g = this.mapCtx;
    const W = 200;
    g.clearRect(0, 0, W, W);
    // Sea and sand on the west edge.
    g.fillStyle = '#1f7fc4';
    g.fillRect(0, 0, this._mapXY(-246, 0)[0], W);
    g.fillStyle = '#e8d29a';
    g.fillRect(this._mapXY(-246, 0)[0], 0, this._mapXY(-186, 0)[0] - this._mapXY(-246, 0)[0], W);
    // Land.
    g.fillStyle = '#69a85c';
    g.fillRect(this._mapXY(-186, 0)[0], 0, W - this._mapXY(-186, 0)[0], W);
    // City blocks.
    g.fillStyle = '#5d7a52';
    for (const c of state.colliders) {
      const [x0, y0] = this._mapXY(c.minX, c.minZ);
      const [x1, y1] = this._mapXY(c.maxX, c.maxZ);
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    // Roads.
    g.strokeStyle = '#3a3f46';
    g.lineWidth = 5;
    for (const r of ROADS) {
      let [x0, y0] = this._mapXY(-210, r);
      let [x1, y1] = this._mapXY(210, r);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      [x0, y0] = this._mapXY(r, -210);
      [x1, y1] = this._mapXY(r, 210);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    // Mission marker (pulsing yellow diamond).
    if (state.target) {
      const [mx, my] = this._mapXY(state.target.x, state.target.z);
      const pulse = 5 + Math.sin(state.time * 5) * 2;
      g.fillStyle = '#ffd21f';
      g.beginPath();
      g.moveTo(mx, my - pulse - 3);
      g.lineTo(mx + pulse + 3, my);
      g.lineTo(mx, my + pulse + 3);
      g.lineTo(mx - pulse - 3, my);
      g.closePath();
      g.fill();
      g.strokeStyle = '#7a5a00';
      g.lineWidth = 1;
      g.stroke();
    }
    // Traffic dots.
    g.fillStyle = 'rgba(220,220,220,.85)';
    for (const c of state.trafficCars) {
      const [x, y] = this._mapXY(c.pos.x, c.pos.z);
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Police dots.
    for (const c of state.policeCars) {
      const [x, y] = this._mapXY(c.pos.x, c.pos.z);
      g.fillStyle = '#ff3b30';
      g.beginPath(); g.arc(x, y, 3.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(x, y, 1.4, 0, Math.PI * 2); g.fill();
    }
    // Player arrow. Canvas x = world x (east), canvas y = world z (south),
    // so the arrow is rotated from "up" (north) by atan2(sin h, -cos h).
    const [px, py] = this._mapXY(state.playerX, state.playerZ);
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(Math.sin(state.playerHeading), -Math.cos(state.playerHeading)));
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }

  // ---- Per-frame update ----------------------------------------------------
  update(state, dt) {
    this.el.money.textContent = fmtMoney(state.money);
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<span class="${i < state.stars ? 'on' : 'off'}">&#9733;</span>`;
    this.el.stars.innerHTML = stars;
    const hp = clamp(state.health, 0, 100);
    this.el['health-fill'].style.width = hp + '%';
    this.el['health-fill'].classList.toggle('low', hp < 30);
    this.el['mission-title'].textContent = state.missionTitle;
    this.el.objective.textContent = state.objective;
    if (state.timeLeft > 0) {
      this.el.timer.classList.remove('hidden');
      this.el.timer.textContent = fmtTime(state.timeLeft);
      this.el.timer.classList.toggle('urgent', state.timeLeft < 30);
    } else {
      this.el.timer.classList.add('hidden');
    }
    if (state.inCar) {
      this.el.speed.classList.remove('hidden');
      this.el.speed.innerHTML = Math.round(Math.abs(state.speed) * 3.2) + ' <small>km/h</small>';
      this.el['car-health'].classList.remove('hidden');
      this.el['car-health'].textContent = 'CAR ' + Math.round(state.carHealth) + '%';
    } else {
      this.el.speed.classList.add('hidden');
      this.el['car-health'].classList.add('hidden');
    }
    if (this.dialogueT > 0) {
      this.dialogueT -= dt;
      if (this.dialogueT <= 0) this.el.dialogue.classList.add('hidden');
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.el.toast.classList.add('hidden');
    }
    // Edge arrow pointing at the mission target.
    if (state.arrow) {
      this.el['marker-arrow'].classList.remove('hidden');
      const a = this.el['marker-arrow'];
      a.style.left = state.arrow.x + 'px';
      a.style.top = state.arrow.y + 'px';
      a.style.transform = 'rotate(' + state.arrow.angle + 'rad)';
      a.style.opacity = String(state.arrow.dist < 12 ? 0.25 : 1);
    } else {
      this.el['marker-arrow'].classList.add('hidden');
    }
    this.drawMinimap(state);
  }

  feed(msg) {
    const div = document.createElement('div');
    div.className = 'feed-msg';
    div.textContent = msg;
    this.el.feed.appendChild(div);
    this.feedItems.push(div);
    while (this.feedItems.length > 4) this.feedItems.shift().remove();
    setTimeout(() => { div.remove(); const i = this.feedItems.indexOf(div); if (i >= 0) this.feedItems.splice(i, 1); }, 6000);
  }

  say(speaker, text, dur = 6) {
    this.el['dlg-speaker'].textContent = speaker;
    this.el['dlg-text'].textContent = text;
    this.el.dialogue.classList.remove('hidden');
    this.dialogueT = dur;
  }

  toast(title, sub) {
    this.el['toast-title'].textContent = title;
    this.el['toast-sub'].textContent = sub;
    this.el.toast.classList.remove('hidden');
    this.toastT = 3.2;
  }

  show(id) { this.el[id].classList.remove('hidden'); }
  hide(id) { this.el[id].classList.add('hidden'); }
  showHud() { this.el.hud.classList.remove('hidden'); }
  hideHud() { this.el.hud.classList.add('hidden'); }
}
