const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

// Настоящие обработчики страницы; вместо монитора кадры запускает тест.
function game() {
  const window = new EventTarget();
  const document = new EventTarget();
  const frames = new Map();
  const elements = new Map();
  let frameId = 0, time = 0, throws = 0;
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, Object.assign(new EventTarget(), {
        dataset:{}, classList:{toggle() {}}, closest() { return null; },
        getContext() { return null; },
        getBoundingClientRect() { return {left:0,top:0,width:390,height:420}; }
      }));
    }
    return elements.get(id);
  }
  Object.assign(document, {documentElement:{}, getElementById:element, querySelector:()=>element('canvas')});
  document.addEventListener('gravitide:throw',()=>throws++);
  const context = vm.createContext({
    document, window, Event, navigator:{language:'en'}, matchMedia:()=>({matches:false}),
    Image:class extends EventTarget {}, ResizeObserver:class { observe() {} },
    devicePixelRatio:1, localStorage:{getItem(){return null;},setItem(){}},
    performance:{now:()=>time},
    requestAnimationFrame(fn){ frames.set(++frameId,fn); return frameId; },
    cancelAnimationFrame(id){ frames.delete(id); }
  });
  for (const file of ['orbit.js','play.js']) {
    vm.runInContext(readFileSync(join(__dirname,'../gravitide/play',file),'utf8'),context);
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
  function tap(surface='control') {
    send(surface,'pointerdown');
    send('window','pointerup');
    send(surface,'click',{detail:1});
  }
  function hitNext() {
    send('control','pointerdown');
    let framesLeft=1000;
    while (element('control').textContent!=='Release!' && framesLeft-- > 0) tick();
    assert.ok(framesLeft>0,'ожидали пригодную траекторию');
    send('window','pointerup');
    tick(120);
    assert.equal(element('store').hidden,false);
  }
  return {send,tick,tap,hitNext,element,count:()=>throws};
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

test('прерывания и последующий pointerup и click выпускают один обломок',()=>{
  for (const signal of ['pointercancel','lostpointercapture','blur']) {
    const g=game();
    g.send('control','pointerdown');
    g.tick(20);
    g.send(signal==='lostpointercapture'?'control':'window',signal);
    g.send('window','pointerup');
    g.send('control','click',{detail:1});
    assert.equal(g.count(),1,signal);
  }
});

test('активация кнопки без событий указателя выпускает обломок за одно нажатие',()=>{
  const g=game();
  g.send('control','click',{detail:0,pointerId:-1});
  assert.equal(g.count(),1);
});
