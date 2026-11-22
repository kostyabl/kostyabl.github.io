// Учебные цели и уровни свободного полёта. Прогноз и полёт используют одну проверку столкновения.
class ThrowScene {
  center = {x: -35, y: 24};
  radius = 64;
  speed = 330;
  levelCount = 5;
  halfWidth = 175;
  halfHeight = 126.5;
  stage = 0;
  throws = 0;

  constructor() { this.reset(); }
  get freeFlight() { return this.stage >= 3; }
  get finalStage() { return this.stage + 1 === this.levelCount; }
  setFieldSize(halfWidth, halfHeight) {
    this.halfWidth = halfWidth;
    this.halfHeight = halfHeight;
    if (this.freeFlight) this.clampCenter(this.center.x, this.center.y);
  }
  clampCenter(x, y) {
    const maxX = Math.max(0, this.halfWidth-this.radius-7);
    const maxY = Math.max(0, this.halfHeight-this.radius-7);
    this.center = {x:Math.max(-maxX,Math.min(maxX,x)), y:Math.max(-maxY,Math.min(maxY,y))};
  }
  placeRing(x, y) {
    if (this.freeFlight && (this.phase === 'idle' || this.phase === 'hold')) this.clampCenter(x,y);
  }
  reset() {
    this.phase = 'idle';
    this.angle = -3.72;
    this.age = 0;
    this.held = 0;
    this.flight = 0;
    this.shot = null;
    this.shipAngle = 1.65;
  }
  continueRun() {
    const sameFlightLevel = this.freeFlight && this.phase !== 'hit';
    const flightClock = this.age;
    if (this.phase === 'hit') {
      this.center = {x:-35,y:24};
      if (this.finalStage) {
        this.stage = 0;
        this.throws = 0;
      } else {
        this.stage++;
      }
    }
    this.reset();
    if (sameFlightLevel) this.age = flightClock;
  }
  targetAt(time) {
    if (this.stage === 3) {
      const angle = .85*time + .6;
      return {x:22+88*Math.cos(angle), y:-12+48*Math.sin(angle), radius:16};
    }
    if (this.stage === 4) {
      const angle = 1.13*time + .25;
      return {x:108*Math.cos(angle), y:-8+51*Math.sin(2*angle), radius:14};
    }
    if (this.stage === 1) return {x:94, y:-18 + 42*Math.sin(time*1.65), radius:15};
    if (this.stage === 2) return {x:78, y:-76, radius:16};
    return {x:104, y:-65, radius:18};
  }
  get target() { return this.targetAt(this.age); }
  shieldClosed(time) {
    return this.stage === 2 && time % 3.6 < 1.5;
  }
  get fragment() {
    if (this.shot) return this.shot;
    return {x:this.center.x + this.radius * Math.cos(this.angle), y:this.center.y + this.radius * Math.sin(this.angle)};
  }
  get direction() { return {x:-Math.sin(this.angle), y:Math.cos(this.angle)}; }
  // В системе отсчёта цели ищем первое касание за этот шаг, включая касание по краю.
  contact(x, y, vx, vy, start, dt) {
    const a = this.targetAt(start), b = this.targetAt(start + dt);
    const rx = x-a.x, ry = y-a.y;
    const dx = vx*dt-(b.x-a.x), dy = vy*dt-(b.y-a.y);
    const gap = rx*rx+ry*ry-(a.radius+4)**2;
    if (gap <= 0) return start;
    const length = dx*dx+dy*dy, dot = rx*dx+ry*dy;
    const disc = dot*dot-length*gap;
    if (!length || dot >= 0 || disc < 0) return null;
    const fraction = gap/(-dot + Math.sqrt(disc));
    return fraction <= 1 ? start+fraction*dt : null;
  }
  get aimOutcome() {
    const p = this.fragment, v = this.direction;
    const vx = v.x*this.speed, vy = v.y*this.speed;
    // Неподвижные цели допускают расчёт одним отрезком.
    const horizon = this.freeFlight ? this.flightLimit : 1;
    const step = this.stage === 1 || this.freeFlight ? 1/60 : 1;
    for (let i=0; i<Math.ceil(horizon/step); i++) {
      const t = i*step;
      const impact = this.contact(p.x+vx*t,p.y+vy*t,vx,vy,this.age+t,Math.min(step,horizon-t));
      if (impact !== null) return this.shieldClosed(impact) ? 'blocked' : 'hit';
    }
    return 'miss';
  }
  get flightLimit() {
    if (!this.freeFlight) return 1.3;
    return Math.hypot(this.halfWidth+125,this.halfHeight+85)/this.speed + .35;
  }
  get aligned() { return this.aimOutcome === 'hit'; }
  get ready() { return this.phase === 'hold' && this.held >= .36; }
  hold() {
    if (this.phase !== 'idle') return;
    this.phase = 'hold';
    this.held = 0;
  }
  release(placementTap = false) {
    if (this.phase !== 'hold') return false;
    if (!this.ready) { this.phase = placementTap && this.freeFlight ? 'idle' : 'early'; return false; }
    const p = this.fragment, v = this.direction;
    this.shot = {x:p.x, y:p.y, vx:v.x*this.speed, vy:v.y*this.speed};
    this.throws++;
    this.phase = 'flight';
    return true;
  }
  step(dt) {
    if (this.freeFlight && (this.phase === 'miss' || this.phase === 'early')) {
      this.age += dt;
      return;
    }
    if (!['idle','hold','flight'].includes(this.phase)) return;
    const start = this.age;
    this.age += dt;
    if (this.phase === 'idle') this.angle = -3.72 + .23*Math.sin(this.age*.85);
    if (this.phase === 'hold') {
      this.held += dt;
      this.angle += dt * (this.ready && this.aligned ? .56 : 1.6);
      this.shipAngle += dt*.92;
    }
    if (this.phase !== 'flight') return;
    const p = this.shot;
    const impact = this.contact(p.x,p.y,p.vx,p.vy,start,dt);
    const elapsed = impact === null ? dt : impact-start;
    p.x += p.vx*elapsed; p.y += p.vy*elapsed;
    this.flight += elapsed;
    if (impact !== null) {
      this.age = impact;
      this.phase = this.shieldClosed(impact) ? 'blocked' : 'hit';
    } else if (this.flight > this.flightLimit ||
        Math.abs(p.x) > (this.freeFlight ? this.halfWidth+8 : 210) ||
        Math.abs(p.y) > (this.freeFlight ? this.halfHeight+8 : 137)) {
      this.phase = 'miss';
    }
  }
}
