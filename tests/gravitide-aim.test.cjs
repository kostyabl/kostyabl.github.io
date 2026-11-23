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

test('прицел через движущуюся мишень даёт упреждение, которое сохраняется при отпускании', () => {
  const scene = new ThrowScene();
  scene.stage = 1;
  scene.hold();
  scene.age = 1.867;
  scene.angle = -1.305;
  scene.updateAim(0);
  const p=scene.fragment, v=scene.direction, t=scene.target;
  assert.ok((t.x-p.x)*v.x+(t.y-p.y)*v.y > 0);
  assert.ok(Math.abs((t.x-p.x)*v.y-(t.y-p.y)*v.x) < t.radius);
  assert.equal(scene.planShot(p,v.x*scene.speed,v.y*scene.speed).outcome,'miss');
  assert.equal(scene.aimOutcome,'hit');
  finishShot(scene,24);
});

test('после выхода из зоны захвата есть время отпустить; дальний промах остаётся промахом', () => {
  const scene = new ThrowScene();
  scene.hold();
  for (let i=0;i<240;i++) {
    scene.step(1/60);
    if (scene.grace > 0 && scene.grace < scene.reactionTime) break;
  }
  assert.ok(scene.grace > .35 && scene.grace < scene.reactionTime);
  for (let i=0;i<18;i++) { scene.step(1/60); assert.equal(scene.aimOutcome,'hit'); }
  finishShot(scene,30);
  scene.reset();
  scene.hold();
  assert.equal(scene.aimOutcome,'miss');
  finishShot(scene,60);
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

test('прицел проходит через окно попадания с той же угловой скоростью на всех уровнях', () => {
  for (let stage=0; stage<5; stage++) {
    for (const fps of [30,60,120]) {
      const scene = new ThrowScene();
      scene.stage = stage;
      scene.hold();
      const initialAngle = scene.angle;
      scene.step(1/fps);
      const stepAngle = scene.angle-initialAngle;
      assert.ok(stepAngle > 0);
      const outcomes = new Set();
      for (let frame=0; frame<fps*8; frame++) {
        outcomes.add(scene.aimOutcome);
        const before = scene.angle;
        scene.step(1/fps);
        assert.ok(Math.abs(scene.angle-before-stepAngle) < 1e-10,
          `Цель ${stage+1}, ${fps} кадров/с: скорость изменилась при прицеливании`);
      }
      assert.ok(outcomes.has('hit') && outcomes.has('miss'));
    }
  }
});
