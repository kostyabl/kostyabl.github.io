// Одна учебная орбита. Прицел и бросок используют общую касательную.
class ThrowScene {
  target = {x: 104, y: -65, radius: 18};
  center = {x: -35, y: 24};
  radius = 64;
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
  get fragment() {
    if (this.shot) return this.shot;
    return {x:this.center.x + this.radius * Math.cos(this.angle), y:this.center.y + this.radius * Math.sin(this.angle)};
  }
  get direction() { return {x:-Math.sin(this.angle), y:Math.cos(this.angle)}; }
  get aligned() {
    const p = this.fragment, v = this.direction;
    const x = this.target.x - p.x, y = this.target.y - p.y;
    return x*v.x + y*v.y > 0 && Math.abs(x*v.y - y*v.x) <= this.target.radius + 4;
  }
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
    this.shot = {x:p.x, y:p.y, vx:v.x*330, vy:v.y*330};
    this.phase = 'flight';
    return true;
  }
  step(dt) {
    this.age += dt;
    if (this.phase === 'idle') this.angle = -3.72 + .23*Math.sin(this.age*.85);
    if (this.phase === 'hold') {
      this.held += dt;
      this.angle += dt * (this.ready && this.aligned ? .56 : 1.6);
      this.shipAngle += dt*.92;
    }
    if (this.phase !== 'flight') return;
    const p = this.shot, dx = p.vx*dt, dy = p.vy*dt;
    const tx = this.target.x - p.x, ty = this.target.y - p.y;
    const along = Math.max(0, Math.min(1, (tx*dx + ty*dy)/(dx*dx + dy*dy || 1)));
    p.x += dx; p.y += dy;
    this.flight += dt;
    if (Math.hypot(tx - along*dx, ty - along*dy) <= this.target.radius+4) this.phase = 'hit';
    else if (this.flight > 1.3 || Math.abs(p.x) > 210 || Math.abs(p.y) > 137) this.phase = 'miss';
  }
}
