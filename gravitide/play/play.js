(() => {
  'use strict';
  const ru = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase().startsWith('ru');
  const t = (en, russian) => ru ? russian : en;
  const el = id => document.getElementById(id);
  const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
  const field = el('field'), control = el('control'), store = el('store');
  const scene = new ThrowScene();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const images = {};
  for (const name of ['anchor','debris']) {
    images[name] = new Image();
    images[name].src = 'assets/' + name + '.png';
  }
  document.documentElement.lang = ru ? 'ru' : 'en';
  el('edition').textContent = t('Browser demo','Браузерное демо');
  el('title').textContent = t('Gravity throw','Гравитационный бросок');
  el('mission').textContent = t('Hit the target with a piece of space debris.','Попади в цель космическим обломком.');
  store.textContent = t('Play on iPhone','Играть на iPhone');
  const targetName = t('TARGET','ЦЕЛЬ');
  const idleTip = t('Hold to capture the fragment. Release when the dotted line crosses the target.','Зажми, чтобы поймать обломок. Отпусти, когда пунктир пройдёт через цель.');
  const controls = t('Touch, mouse or Space','Касание, мышь или пробел');
  let input = null, lastState = '', previousTime = 0, impactAge = 0;
  let width = 0, height = 0, ratio = 1, pending = 0;

  function resize() {
    const rect = field.getBoundingClientRect();
    width = rect.width; height = rect.height;
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio);
    draw();
  }
  function line(points, color, size = 1, close = false) {
    ctx.beginPath(); ctx.moveTo(points[0][0],points[0][1]);
    for (const [x,y] of points.slice(1)) ctx.lineTo(x,y);
    if (close) ctx.closePath();
    ctx.strokeStyle = color; ctx.lineWidth = size; ctx.stroke();
  }
  function ring(x,y,r,color,size = 1,start = 0,end = Math.PI*2) {
    ctx.beginPath(); ctx.arc(x,y,r,start,end); ctx.lineWidth = size; ctx.strokeStyle = color; ctx.stroke();
  }
  function sprite(name,x,y,size,angle,fallback) {
    ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
    const img = images[name];
    if (img?.complete && img.naturalWidth) ctx.drawImage(img,-size/2,-size/2,size,size);
    else {ctx.fillStyle = fallback; ctx.fillRect(-size/4,-size/4,size/2,size/2);}
    ctx.restore();
  }
  function draw() {
    if (!ctx || !width || !height) return;
    ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,width,height);
    const scale = Math.min(width/350,height/253,2.5);
    ctx.translate(width/2,height/2); ctx.scale(scale,scale);
    const c = scene.center, dest = scene.target, p = scene.fragment;
    const held = scene.phase === 'hold', hit = scene.phase === 'hit';
    const aim = held && scene.ready && scene.aligned;
    const accent = aim ? '#ffe6a2' : '#92eee4';
    // Орбитальные отметки и короткий хвост подсказывают направление движения.
    for (const radius of [86,104]) ring(c.x,c.y,radius,'#294351',.55,-2.96,-.46);
    for (let n=0;n<56;n++) {
      const a = n*Math.PI/28, r = n%7 ? 71 : 75;
      line([[c.x+Math.cos(a)*69,c.y+Math.sin(a)*69],[c.x+Math.cos(a)*r,c.y+Math.sin(a)*r]],'#41606c',.7);
    }
    ring(c.x,c.y,scene.radius,held ? '#477f89' : '#304c5a',1);
    const glow = ctx.createRadialGradient(c.x,c.y,1,c.x,c.y,63);
    glow.addColorStop(0,held ? '#71ede64d' : '#5fcac534'); glow.addColorStop(1,'#5fcac500');
    ctx.fillStyle = glow; ctx.fillRect(c.x-64,c.y-64,128,128);
    ring(c.x,c.y,9,'#88e0da',1); ring(c.x,c.y,3,'#cefcf6',2.5);
    if (held) ring(c.x,c.y,15,accent,2,-Math.PI/2,-Math.PI/2 + Math.PI*2*Math.min(1,scene.held/.36));
    const s = scene.shipAngle, sx = c.x+Math.cos(s)*43, sy = c.y+Math.sin(s)*43;
    ctx.save(); ctx.translate(sx,sy); ctx.rotate(s+Math.PI/2);
    ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-6,7); ctx.lineTo(-3,0); ctx.lineTo(-6,-7); ctx.closePath();
    ctx.fillStyle = '#e2f7fa'; ctx.fill();
    line([[-5,0],[-13,0]],'#65d3e0',2); ctx.restore();
    if (!hit) {
      sprite('anchor',dest.x,dest.y,42,0,'#d38e6a');
      for (let i=0;i<4;i++) ring(dest.x,dest.y,24,aim?'#ffe6a2':'#f2a37f',1.6,i*Math.PI/2+.15,i*Math.PI/2+1.03);
      ctx.font='600 9px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#ffbf9e';ctx.fillText(targetName,dest.x,dest.y-31);
    } else {
      const progress = Math.min(1,impactAge/.6);
      ring(dest.x,dest.y,20+progress*18,'#b3fbdf',1.3);
      for (let i=0;i<12;i++) {
        const a = i*Math.PI/6, r = 28+progress*(12+i%3*5);
        line([[dest.x+Math.cos(a)*r,dest.y+Math.sin(a)*r],[dest.x+Math.cos(a)*(r+4),dest.y+Math.sin(a)*(r+4)]],'#a9e2d1',1.6);
      }
    }
    if (held && scene.ready) {
      const v = scene.direction;
      ctx.setLineDash([2,5]); ctx.lineCap='round';
      line([[p.x,p.y],[p.x+v.x*193,p.y+v.y*193]],accent,1.6);
      ctx.setLineDash([]); ctx.lineCap='butt';
    }
    if (scene.phase === 'flight') line([[p.x-scene.shot.vx*.06,p.y-scene.shot.vy*.06],[p.x,p.y]],'#8ce7df',3);
    if (!scene.shot) {
      for (let i=0;i<14;i++) ring(c.x,c.y,scene.radius,'rgba(123,225,220,'+(i+1)/23+')',2,scene.angle-(14-i)*.042,scene.angle-(13-i)*.042);
    }
    if (!hit && scene.phase !== 'miss') {
      sprite('debris',p.x,p.y,30,scene.angle*.7,'#9bafb4');
      ring(p.x,p.y,15.5,held ? accent : '#93c5c9',1);
    }
  }
  function updatePanel() {
    const state = scene.ready ? (scene.aligned ? 'aim' : 'ready') : scene.phase;
    if (state === lastState) return;
    lastState = state;
    let tip = idleTip, label = t('Hold to charge','Зажми для заряда'), hint = controls;
    if (state === 'hold') {tip=t('Charging the fragment…','Обломок заряжается…');label=t('Charging…','Заряжается…');}
    if (state === 'ready') {tip=t('Keep holding until the dotted line crosses the target.','Держи, пока пунктир не пройдёт через цель.');label=t('Aiming…','Прицеливание…');}
    if (state === 'aim') {tip=t('On target. Release now!','Цель на линии. Отпускай!');label=t('Release!','Отпускай!');}
    if (state === 'flight') {tip=t('Fragment in flight.','Обломок летит.');label=t('Throw in flight','Бросок');}
    if (state === 'early') {tip=t('Too soon. Hold a little longer to charge the fragment.','Рано. Подержи чуть дольше, чтобы зарядить обломок.');}
    if (state === 'miss') {tip=t('Missed. Release when the aim line turns gold.','Мимо. Отпусти, когда пунктир станет золотым.');}
    if (state === 'hit') {tip=t('Direct hit! Fly the first three expeditions free on iPhone.','Попадание! Первые три экспедиции на iPhone бесплатны.');hint='';}
    if (['early','miss','hit'].includes(state)) label=t('Try again','Ещё раз');
    el('status').textContent=tip; control.textContent=label; el('hint').textContent=hint;
    el('panel').classList.toggle('win',state==='hit');store.hidden=state!=='hit';
    control.dataset.held=String(scene.phase==='hold');
  }
  function frame(time) {
    pending=0;
    const dt = previousTime ? Math.min((time-previousTime)/1000,.045) : 0;
    previousTime=time;
    if (!(reduce && scene.phase==='idle')) scene.step(dt);
    if (scene.phase==='hit') impactAge+=dt;
    draw();updatePanel();
    if (!document.hidden && (scene.phase==='hold' || scene.phase==='flight' || (!reduce && (scene.phase==='idle' || (scene.phase==='hit' && impactAge<.6))))) startFrame();
    else previousTime=0;
  }
  function startFrame() {if (!pending && !document.hidden) pending=requestAnimationFrame(frame);}
  function reset() {scene.reset();impactAge=0;updatePanel();draw();startFrame();}
  function begin(key) {
    if (input!==null || scene.phase==='flight') return false;
    if (scene.phase!=='idle') reset();
    scene.hold();input=key;updatePanel();startFrame();return true;
  }
  function end(key) {
    if (input!==key) return;
    input=null;
    if (scene.release()) countThrow();
    updatePanel();startFrame();
  }
  function cancel() {if(input!==null){input=null;reset();}}
  for (const surface of [field,control]) {
    surface.addEventListener('pointerdown',e=>{
      if (!e.isPrimary || e.button!==0) return;
      if (surface===control && ['hit','miss','early'].includes(scene.phase)) return;
      if (begin(e.pointerId)) {surface.setPointerCapture(e.pointerId);e.preventDefault();}
    });
    surface.addEventListener('pointerup',e=>end(e.pointerId));
    surface.addEventListener('lostpointercapture',e=>{if(input===e.pointerId) cancel();});
    surface.addEventListener('pointercancel',e=>{if(input===e.pointerId) cancel();});
    surface.addEventListener('contextmenu',e=>e.preventDefault());
  }
  // Синтетический click после pointerup не должен немедленно сбросить результат.
  let retryDown=false;
  control.addEventListener('pointerdown',()=>{retryDown=['hit','miss','early'].includes(scene.phase);});
  control.addEventListener('click',e=>{
    if (retryDown){retryDown=false;reset();return;}
    if(e.detail===0) {
      if(['hit','miss','early'].includes(scene.phase)) reset();
      else if(input==='toggle') end('toggle'); else begin('toggle');
    }
  });
  window.addEventListener('keydown',e=>{
    if (e.code!=='Space' || e.target.closest?.('a') || e.altKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();if (!e.repeat) begin('key');
  });
  window.addEventListener('keyup',e=>{if(e.code==='Space' && input==='key'){e.preventDefault();end('key');}});
  window.addEventListener('blur',cancel);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancel();cancelAnimationFrame(pending);pending=0;previousTime=0;}else startFrame();
  });
  let throws=0;
  function countThrow() { throws++; }
  new ResizeObserver(resize).observe(field);
  for (const image of Object.values(images)) image.addEventListener('load',draw);
  updatePanel();resize();startFrame();
})();
