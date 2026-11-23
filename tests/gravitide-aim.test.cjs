const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');

const source = readFileSync(join(__dirname, '../gravitide/play/orbit.js'), 'utf8');
const ThrowScene = runInNewContext(source + '\nThrowScene');

function finishShot(scene, fps) {
  const expected = {...scene.preview};
  const age = scene.age;
  assert.ok(scene.release());
  assert.deepEqual({...scene.shot}, expected);
  for (let i = 0; scene.phase === 'flight' && i < 10*fps; i++) scene.step(1/fps);
  assert.equal(scene.phase, expected.outcome);
  assert.ok(Math.abs(scene.age-age-expected.duration) < 1e-8);
  assert.ok(Math.abs(scene.shot.x-expected.x-expected.vx*expected.duration) < 1e-7);
  assert.ok(Math.abs(scene.shot.y-expected.y-expected.vy*expected.duration) < 1e-7);
  if (expected.outcome !== 'miss') {
    const t = scene.target;
    assert.ok(Math.hypot(scene.shot.x-t.x, scene.shot.y-t.y) <= t.radius+scene.fragmentRadius+.05);
    assert.equal(scene.shieldClosed(scene.age),expected.outcome === 'blocked');
  }
}

test('короткое отпускание запускает обломок на всех уровнях, включая тап для переноса кольца', () => {
  for (const stage of [0,1,2,3,4]) {
    const scene = new ThrowScene();
    scene.stage = stage;
    scene.hold();
    scene.step(.08);
    if (scene.freeFlight) {
      scene.placeRing(35,25);
      assert.equal(scene.center.x,35);
    }
    finishShot(scene,60);
    assert.equal(scene.throws,1);
  }
});

test('направление выпуска определяется скоростью даже рядом с врагом', () => {
  const scene = new ThrowScene();
  scene.hold();
  scene.body = {x:0,y:-65,vx:100,vy:0};
  scene.updateAim();
  assert.equal(scene.aimOutcome,'hit');
  // Линия проходит чуть выше края цели. Предыдущая автодоводка превращала такой промах в попадание.
  scene.body.y = -97;
  scene.updateAim();
  assert.equal(scene.aimOutcome,'miss');
  assert.equal(scene.preview.vx,scene.speed);
  assert.equal(scene.preview.vy,0);
  finishShot(scene,60);
});

test('перенос кольца сохраняет положение и инерцию обломка, затем сила искривляет движение', () => {
  const scene = new ThrowScene();
  scene.hold();
  scene.step(.5);
  const body = {...scene.body};
  scene.placeRing(scene.center.x+30,scene.center.y-20);
  assert.deepEqual({...scene.body},body);
  scene.step(.1);
  assert.ok(Math.hypot(scene.body.vx-body.vx,scene.body.vy-body.vy)>1);
  assert.ok(Math.hypot(scene.body.x-body.x-body.vx*.1,scene.body.y-body.y-body.vy*.1)>.1);
  const direction = scene.direction;
  scene.release();
  assert.ok(Math.abs(scene.shot.vx*direction.y-scene.shot.vy*direction.x)<1e-8);
});

test('на всех уровнях исход и точка встречи совпадают с пунктиром при разных частотах кадров', () => {
  const seen=new Set();
  for (const fps of [24,60,120]) {
    for (let stage=0;stage<5;stage++) {
      for (let tick=0;tick<36;tick++) {
        const scene=new ThrowScene();
        scene.stage=stage;
        // Перебираем фазы щита отдельно от длительности удержания.
        scene.step(stage === 2 ? (tick%6)*.6 : tick*.12);
        scene.placeRing(-40,32);
        scene.hold();
        const holdFrames=Math.ceil((.25+tick*.055)*fps);
        for (let i=0;i<holdFrames;i++) scene.step(1/fps);
        seen.add(scene.aimOutcome);
        finishShot(scene,fps===24?120:24);
      }
    }
  }
  assert.deepEqual(seen,new Set(['miss','hit','blocked']));
});

test('враги и пригодность прицела не влияют на физику обломка', () => {
  const scenes = Array.from({length:5},(_,stage)=>{
    const scene=new ThrowScene();
    scene.stage=stage;
    scene.hold();
    return scene;
  });
  for (let frame=0;frame<600;frame++) {
    for (const scene of scenes) scene.step(1/60);
    for (const scene of scenes) assert.deepEqual({...scene.body},{...scenes[0].body});
  }
});

test('гравитация устойчива при разной частоте кадров и резком переносе кольца', () => {
  let reference;
  for (const fps of [30,60,120]) {
    const scene=new ThrowScene();
    scene.hold();
    for (let frame=0;frame<fps*10;frame++) {
      if (frame===fps*2) scene.placeRing(90,-40);
      if (frame===fps*5) scene.placeRing(-90,40);
      scene.step(1/fps);
      assert.ok(Object.values(scene.body).every(Number.isFinite));
      assert.ok(Math.abs(scene.body.x)<=scene.halfWidth-scene.fragmentRadius);
      assert.ok(Math.abs(scene.body.y)<=scene.halfHeight-scene.fragmentRadius);
    }
    if (reference) {
      assert.ok(Math.hypot(scene.body.x-reference.x,scene.body.y-reference.y)<.1);
      assert.ok(Math.hypot(scene.body.vx-reference.vx,scene.body.vy-reference.vy)<.1);
    }
    reference={...scene.body};
  }
});
