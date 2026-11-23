const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

// Настоящие обработчики страницы; вместо монитора кадры запускает тест.
function game(nativeTouch = false, reducedMotion = false) {
  const window = new EventTarget();
  if (nativeTouch) window.ontouchstart = null;
  const document = new EventTarget();
  const frames = new Map();
  const elements = new Map();
  let frameId = 0, time = 0, throws = 0;
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, Object.assign(new EventTarget(), {
        dataset:{}, classList:{toggle() {}}, closest() { return null; },
        focus() {}, getContext() { return null; },
        getBoundingClientRect() { return {left:0,top:0,width:390,height:420}; }
      }));
    }
    return elements.get(id);
  }
  Object.assign(document, {documentElement:{}, getElementById:element, querySelector:()=>element('canvas')});
  document.addEventListener('gravitide:throw',()=>throws++);
  const context = vm.createContext({
    document, window, Event, navigator:{language:'en'}, matchMedia:q=>({matches:reducedMotion && q.includes('reduced-motion')}),
    Image:class extends EventTarget {}, ResizeObserver:class { observe() {} },
    devicePixelRatio:1, localStorage:{getItem(){return null;},setItem(){}},
    performance:{now:()=>time},
    requestAnimationFrame(fn){ frames.set(++frameId,fn); return frameId; },
    cancelAnimationFrame(id){ frames.delete(id); }
  });
  for (const file of ['orbit.js','play.js']) {
    vm.runInContext(readFileSync(join(__dirname,'../gravitide/play',file),'utf8'),context);
    if (file === 'orbit.js') vm.runInContext('ThrowScene = class extends ThrowScene { constructor() { super(); globalThis.scene = this; } }',context);
  }
  function send(target,type,props={}) {
    const event = Object.assign(new Event(type,{cancelable:true}), {
      pointerId:7, isPrimary:true, button:0, clientX:130, clientY:155, ...props
    });
    (target==='window' ? window : element(target)).dispatchEvent(event);
  }
  function tick(n=1) {
    for (let i=0;i<n;i++) {
      time+=1000/60;
      const work=[...frames.values()];
      frames.clear();
      work.forEach(fn=>fn(time));
    }
  }
  function tap(surface='field') {
    send(surface,'pointerdown');
    send('window','pointerup');
    send(surface,'click',{detail:1});
  }
  function hitNext() {
    send('field','pointerdown');
    let framesLeft=1000;
    while (element('control').textContent!=='Release!' && framesLeft-- > 0) tick();
    assert.ok(framesLeft>0,'ожидали пригодную траекторию');
    send('window','pointerup');
    tick(120);
    assert.equal(element('store').hidden,false);
  }
  return {send,tick,tap,hitNext,element,scene:context.scene,count:()=>throws};
}

test('три быстрых нажатия дают три броска без отдельной кнопки повтора',()=>{
  const g=game();
  g.tap(); g.tap(); g.tap();
  assert.equal(g.count(),1);
  assert.match(g.element('status').textContent,/Throws waiting: 2/);
  g.tick(600);
  assert.equal(g.count(),3);
  assert.equal(g.element('shots').textContent,'Throws · 3');
  g.tap();
  assert.equal(g.count(),4);
});

test('касание поля на четвёртом уровне сразу бросает даже без кадра зарядки',()=>{
  const g=game();
  g.hitNext(); g.hitNext(); g.hitNext();
  g.tap('field');
  assert.equal(g.element('progress').textContent,'Target 4 / 5');
  assert.equal(g.count(),4);
});

test('удержание кнопки и поля крутит обломок, отпускание бросает ровно один раз',()=>{
  for (const nativeTouch of [true,false]) {
    for (const surface of ['control','field']) {
      for (const duration of [3,90]) {
        const g=game(nativeTouch);
        const props={pointerType:nativeTouch?'touch':'mouse'};
        const finger={identifier:1,clientX:100,clientY:175};
        g.send(surface,'pointerdown',props);
        if (nativeTouch) g.send(surface,'touchstart',{touches:[finger],changedTouches:[finger]});
        const angle=g.scene.angle;
        g.tick(duration);
        assert.equal(g.count(),0);
        assert.equal(g.scene.phase,'hold');
        assert.ok(g.scene.angle>angle);
        g.send(surface,'lostpointercapture',props);
        if (nativeTouch) {
          g.send('window','pointercancel',props);
          g.send('window','touchend',{changedTouches:[{identifier:2}]});
        }
        assert.equal(g.count(),0);
        g.send('window','pointerup',props);
        if (nativeTouch) g.send('window','touchend',{changedTouches:[finger]});
        g.send(surface,'click',{detail:1,...props});
        assert.equal(g.count(),1);
        assert.equal(g.scene.phase,'flight');
      }
    }
  }
});

test('перетаскивание перемещает кольцо на каждом уровне без броска до отпускания',()=>{
  for (let stage=0;stage<5;stage++) {
    for (const touch of [false,true]) {
      const g=game(touch);
      g.scene.stage=stage;
      const start={identifier:1,clientX:100,clientY:175};
      const end={...start,clientX:240,clientY:230};
      if (touch) g.send('field','touchstart',{touches:[start],changedTouches:[start]});
      else g.send('field','pointerdown',start);
      const center={...g.scene.center};
      g.tick(30);
      if (touch) g.send('field','touchmove',{changedTouches:[end]});
      else g.send('field','pointermove',end);
      assert.ok(g.scene.center.x>center.x);
      assert.ok(g.scene.center.y>center.y);
      assert.equal(g.count(),0);
      const preview={...g.scene.preview};
      if (touch) g.send('window','touchend',{changedTouches:[end]});
      else g.send('window','pointerup',end);
      assert.equal(g.count(),1);
      assert.deepEqual({...g.scene.shot},preview);
    }
  }
});

test('системное прерывание не бросает обломок, следующее удержание работает',()=>{
  for (const signal of ['pointercancel','blur','touchcancel']) {
    const g=game(signal==='touchcancel');
    const finger={identifier:8};
    if (signal==='touchcancel') g.send('control','touchstart',{touches:[finger],changedTouches:[finger]});
    else g.send('control','pointerdown');
    g.tick(25);
    g.send('window',signal,{changedTouches:[finger]});
    g.send('control','click',{detail:1});
    g.tick(40);
    assert.equal(g.count(),0,signal);
    g.tap();
    assert.equal(g.count(),1,signal);
  }
});

test('пробел удерживает обломок до отпускания',()=>{
  const g=game();
  g.send('window','keydown',{code:'Space'});
  g.tick(90);
  assert.equal(g.count(),0);
  assert.equal(g.scene.phase,'hold');
  g.send('window','keyup',{code:'Space'});
  assert.equal(g.count(),1);
});

test('четыре цели сменяются сами, финал и перезапуск не бросают обломок',()=>{
  for (const reduce of [false,true]) {
    const g=game(false,reduce);
    for (let hit=1;hit<=5;hit++) {
      g.hitNext();
      assert.equal(g.count(),hit);
      assert.equal(g.element('progress').textContent,'Target '+Math.min(hit+1,5)+' / 5');
    }
    g.tick(180);
    assert.equal(g.element('replay').hidden,false);
    g.tap('status');
    g.tap('field');
    assert.equal(g.count(),5);
    g.send('replay','click');
    g.tick(180);
    assert.equal(g.element('progress').textContent,'Target 1 / 5');
    assert.equal(g.element('shots').textContent,'Throws · 0');
    assert.equal(g.element('replay').hidden,true);
    assert.equal(g.count(),5);
  }
});
