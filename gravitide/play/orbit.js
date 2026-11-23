// Учебные цели и уровни свободного полёта. Прогноз и полёт используют одну проверку столкновения.
class ThrowScene {
  center = {x: -35, y: 24};
  radius = 64;
  speed = 240;
  fragmentRadius = 13;
  chargeTime = .20;
  // Параметры колодца из GravityCore, линейный масштаб арены — 0.4.
  wellRadius = 104;
  coreRadius = 60;
  softening = 8;
  gravityStrength = 400;
  referenceDistance = 60;
  radialDamping = 2;
  captureThreshold = 16;
  captureImpulse = 100;
  forceRampUp = .08;
  maxSpeed = 1200;
  wallRestitution = .9;
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
    this.clampCenter(this.center.x, this.center.y);
  }
  clampCenter(x, y) {
    const maxX = Math.max(0, this.halfWidth-this.radius-7);
    const maxY = Math.max(0, this.halfHeight-this.radius-7);
    const next = {x:Math.max(-maxX,Math.min(maxX,x)), y:Math.max(-maxY,Math.min(maxY,y))};
    if (this.center.x === next.x && this.center.y === next.y) return;
    this.center = next;
    if (this.phase === 'hold') this.updateAim();
  }
  placeRing(x, y) {
    if (this.phase === 'idle' || this.phase === 'hold') this.clampCenter(x,y);
  }
  reset() {
    this.phase = 'idle';
    this.angle = -3.72;
    this.age = 0;
    this.held = 0;
    this.flight = 0;
    this.shot = null;
    this.preview = null;
    const orbitSpeed = Math.sqrt(this.gravityAt(this.radius)*this.radius);
    this.body = {
      x:this.center.x+this.radius*Math.cos(this.angle),
      y:this.center.y+this.radius*Math.sin(this.angle),
      vx:-Math.sin(this.angle)*orbitSpeed,
      vy:Math.cos(this.angle)*orbitSpeed
    };
    this.insideWell = false;
    this.trail = [];
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
  get fragment() { return this.shot || this.body; }
  get direction() {
    const speed = Math.hypot(this.body.vx,this.body.vy);
    return speed > 0 ? {x:this.body.vx/speed,y:this.body.vy/speed} : {x:0,y:0};
  }
  gravityAt(distance) {
    if (distance >= this.wellRadius) return 0;
    const scale = this.gravityStrength*this.referenceDistance**2;
    const base = distance < this.coreRadius
      ? scale/(this.coreRadius**2+this.softening**2)*distance/this.coreRadius
      : scale/(distance**2+this.softening**2);
    return base*(1-(distance/this.wellRadius)**2)**2;
  }
  integrateHeld(dt) {
    const p = this.body;
    const dx = this.center.x-p.x, dy = this.center.y-p.y;
    const distance = Math.hypot(dx,dy);
    const inside = distance > 0 && distance < this.wellRadius;
    if (inside) {
      const nx=dx/distance, ny=dy/distance;
      const tangent = -ny*p.vx+nx*p.vy;
      if (!this.insideWell && Math.abs(tangent) < this.captureThreshold) {
        const impulse = (tangent < 0 ? -1 : 1)*this.captureImpulse;
        p.vx -= ny*impulse;
        p.vy += nx*impulse;
      }
      const radialSpeed = p.vx*nx+p.vy*ny;
      const acceleration = this.gravityAt(distance)*Math.min(1,this.held/this.forceRampUp)
        -this.radialDamping*radialSpeed;
      p.vx += nx*acceleration*dt;
      p.vy += ny*acceleration*dt;
    }
    this.insideWell = inside;
    const speed = Math.hypot(p.vx,p.vy);
    if (speed > this.maxSpeed) {
      p.vx *= this.maxSpeed/speed;
      p.vy *= this.maxSpeed/speed;
    }
    p.x += p.vx*dt;
    p.y += p.vy*dt;
    // Отскок от стен сохраняет обломок на арене при переносе колодца.
    for (const [axis,velocity,bound] of [
      ['x','vx',this.halfWidth-this.fragmentRadius],
      ['y','vy',this.halfHeight-this.fragmentRadius]
    ]) {
      if (Math.abs(p[axis]) > bound) {
        const side = Math.sign(p[axis]);
        p[axis] = side*bound;
        if (p[velocity]*side > 0) p[velocity] *= -this.wallRestitution;
      }
    }
    this.angle = Math.atan2(p.y-this.center.y,p.x-this.center.x);
  }
  // В системе отсчёта цели ищем первое касание за этот шаг, включая касание по краю.
  contact(x, y, vx, vy, start, dt) {
    const a = this.targetAt(start), b = this.targetAt(start + dt);
    const rx = x-a.x, ry = y-a.y;
    const dx = vx*dt-(b.x-a.x), dy = vy*dt-(b.y-a.y);
    const gap = rx*rx+ry*ry-(a.radius+this.fragmentRadius)**2;
    if (gap <= 0) return start;
    const length = dx*dx+dy*dy, dot = rx*dx+ry*dy;
    const disc = dot*dot-length*gap;
    if (!length || dot >= 0 || disc < 0) return null;
    const fraction = gap/(-dot + Math.sqrt(disc));
    return fraction <= 1 ? start+fraction*dt : null;
  }
  planShot(p, vx, vy) {
    const edgeTime = (pos, velocity, bound) => velocity === 0 ? Infinity :
      (Math.sign(velocity)*(bound+8)-pos)/velocity;
    const horizon = Math.max(0, Math.min(this.flightLimit,
      edgeTime(p.x,vx,this.halfWidth), edgeTime(p.y,vy,this.halfHeight)));
    const steps = this.stage === 1 || this.freeFlight ? Math.max(1,Math.ceil(horizon*60)) : 1;
    const step = horizon/steps;
    for (let i=0; i<steps; i++) {
      const t = i*step;
      const impact = this.contact(p.x+vx*t,p.y+vy*t,vx,vy,this.age+t,step);
      if (impact !== null) {
        return {x:p.x,y:p.y,vx,vy,duration:impact-this.age,
          outcome:this.shieldClosed(impact) ? 'blocked' : 'hit'};
      }
    }
    return {x:p.x,y:p.y,vx,vy,duration:horizon,outcome:'miss'};
  }
  updateAim() {
    const p = this.body, direction = this.direction;
    const launchSpeed = Math.min(this.maxSpeed,Math.max(this.speed,Math.hypot(p.vx,p.vy)));
    this.preview = this.planShot(p,direction.x*launchSpeed,direction.y*launchSpeed);
  }
  get aimOutcome() { return this.preview?.outcome || 'miss'; }
  get flightLimit() {
    if (!this.freeFlight) return 1.3;
    return Math.hypot(this.halfWidth+125,this.halfHeight+85)/this.speed + .35;
  }
  get aligned() { return this.aimOutcome === 'hit'; }
  hold() {
    if (this.phase !== 'idle') return;
    this.phase = 'hold';
    this.held = 0;
    this.insideWell = false;
    this.updateAim();
  }
  release() {
    if (this.phase !== 'hold') return false;
    // Запускаем именно показанный бросок, включая рассчитанное время встречи.
    this.shot = {...this.preview};
    this.throws++;
    this.phase = 'flight';
    return true;
  }
  step(dt) {
    if (this.freeFlight && this.phase === 'miss') {
      this.age += dt;
      return;
    }
    if (!['idle','hold','flight'].includes(this.phase)) return;
    const start = this.age;
    this.age += dt;
    if (this.phase === 'hold') {
      // Малые шаги сохраняют устойчивость силы и отскоков при редких кадрах.
      const steps = Math.max(1,Math.ceil(dt*240));
      for (let i=0;i<steps;i++) {
        this.held += dt/steps;
        this.integrateHeld(dt/steps);
      }
      this.shipAngle += dt*.92;
      this.trail.push({x:this.body.x,y:this.body.y});
      if (this.trail.length > 20) this.trail.shift();
      this.updateAim();
    }
    if (this.phase !== 'flight') return;
    const p = this.shot;
    const elapsed = Math.min(dt,Math.max(0,p.duration-this.flight));
    p.x += p.vx*elapsed; p.y += p.vy*elapsed;
    this.flight += elapsed;
    if (this.flight >= p.duration) {
      this.age = start+elapsed;
      this.phase = p.outcome;
    }
  }
}
