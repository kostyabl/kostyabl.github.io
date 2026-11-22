// Одна орбита для всех трёх целей. Прогноз и полёт используют одну проверку столкновения.
class ThrowScene {
  center = {x: -35, y: 24};
  radius = 64;
  speed = 330;
  stage = 0;
  throws = 0;

  constructor() { this.reset(); }
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
    if (this.phase === 'hit') {
      if (this.stage === 2) {
        this.stage = 0;
        this.throws = 0;
      } else {
        this.stage++;
      }
    }
    this.reset();
  }
  targetAt(time) {
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
    const step = this.stage === 1 ? 1/30 : 1;
    for (let i=0; i<Math.round(1/step); i++) {
      const t = i*step;
      const impact = this.contact(p.x+vx*t,p.y+vy*t,vx,vy,this.age+t,step);
      if (impact !== null) return this.shieldClosed(impact) ? 'blocked' : 'hit';
    }
    return 'miss';
  }
  get aligned() { return this.aimOutcome === 'hit'; }
  get ready() { return this.phase === 'hold' && this.held >= .36; }
  hold() {
    if (this.phase !== 'idle') return;
    this.phase = 'hold';
    this.held = 0;
  }
  release() {
    if (this.phase !== 'hold') return false;
    if (!this.ready) { this.phase = 'early'; return false; }
    const p = this.fragment, v = this.direction;
    this.shot = {x:p.x, y:p.y, vx:v.x*this.speed, vy:v.y*this.speed};
    this.throws++;
    this.phase = 'flight';
    return true;
  }
  step(dt) {
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
    } else if (this.flight > 1.3 || Math.abs(p.x) > 210 || Math.abs(p.y) > 137) {
      this.phase = 'miss';
    }
  }
}
