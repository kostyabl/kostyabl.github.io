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
  for (const name of ['anchor','debris','drifter','guardian']) {
    images[name] = new Image();
    images[name].src = 'assets/' + name + '.png';
  }
  document.documentElement.lang = ru ? 'ru' : 'en';
  el('edition').textContent = t('Browser demo','Браузерное демо');
  el('title').textContent = t('Gravity throw','Гравитационный бросок');
  const missions = [
    t('Hit the anchor. Clear five targets in as few throws as possible.','Порази якорь. Попробуй сбить пять целей за пять бросков.'),
    t('The drifter patrols the rail. Aim ahead of it.','Дрон патрулирует рельс. Бросай с упреждением.'),
    t('The sentinel has a pulse shield. Time your shot to pass through the gap.','Страж включает импульсный щит. Подгадай бросок так, чтобы обломок долетел, пока щит открыт.'),
    t('The scout flies in a wide loop. Tap the arena to place your ring ahead of it.','Разведчик летает по дуге. Коснись поля, чтобы поставить кольцо впереди него.'),
    t('The interceptor flies a faster figure eight. Move the ring to cut across its path.','Перехватчик летает восьмёркой. Переставь кольцо, чтобы перерезать ему путь.')
  ];
  store.textContent = t('Play on iPhone','Играть на iPhone');
  const sprites = ['anchor','drifter','guardian','drifter','guardian'];
  const labels = [t('ANCHOR','ЯКОРЬ'), t('DRIFTER','ДРОН'), null, t('SCOUT','РАЗВЕДЧИК'), t('INTERCEPTOR','ПЕРЕХВАТЧИК')];
  const recordKey = 'gravitide-demo-five-targets-best';
  let best = 0;
  function readBest() {
    try {
      const value = Number(localStorage.getItem(recordKey));
      if (Number.isSafeInteger(value) && value >= scene.levelCount) best = best ? Math.min(best,value) : value;
    } catch {}
  }
  readBest();
  const replay = el('replay');
  replay.textContent = t('Play again','Сыграть ещё');
  const controls = t('Drag to move the ring · Hold Space to orbit','Перетаскивай кольцо · Удерживай пробел для вращения');
  const requests = [];
  const nativeTouch = 'ontouchstart' in window || typeof window.TouchEvent === 'function';
  const aimTip = t('Hold to orbit. Drag to move the ring. Release to throw.',
    'Держи — обломок крутится. Перетаскивай кольцо по полю. Отпусти — обломок полетит.');
  const impactDuration = .6;
  let rippleTime = -1;
  let input = null, lastState = '', previousTime = 0, impactAge = 0;
  let width = 0, height = 0, ratio = 1, scale = 1, pending = 0;

  function resize() {
    const rect = field.getBoundingClientRect();
    width = rect.width; height = rect.height;
    ratio = Math.min(devicePixelRatio || 1, 2);
    scale = Math.min(width/350,height/253,2.5);
    if (scale > 0) scene.setFieldSize(width/(2*scale),height/(2*scale));
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
    ctx.translate(width/2,height/2); ctx.scale(scale,scale);
    const c = scene.center, dest = scene.target, p = scene.fragment;
    const held = scene.phase === 'hold', hit = scene.phase === 'hit';
    const aim = held && scene.aligned;
    const blocked = held && scene.aimOutcome === 'blocked';
    const accent = aim ? '#ffe6a2' : blocked ? '#c7adff' : '#92eee4';
    // Орбитальные отметки и короткий хвост подсказывают направление движения.
    for (const radius of [86,104]) ring(c.x,c.y,radius,'#294351',.55,-2.96,-.46);
    for (let n=0;n<56;n++) {
      const a = n*Math.PI/28, r = n%7 ? 71 : 75;
      line([[c.x+Math.cos(a)*69,c.y+Math.sin(a)*69],[c.x+Math.cos(a)*r,c.y+Math.sin(a)*r]],'#41606c',.7);
    }
    ring(c.x,c.y,scene.wellRadius,held ? '#477f89' : '#304c5a',1);
    const glow = ctx.createRadialGradient(c.x,c.y,1,c.x,c.y,63);
    glow.addColorStop(0,held ? '#71ede64d' : '#5fcac534'); glow.addColorStop(1,'#5fcac500');
    ctx.fillStyle = glow; ctx.fillRect(c.x-64,c.y-64,128,128);
    ring(c.x,c.y,9,'#88e0da',1); ring(c.x,c.y,3,'#cefcf6',2.5);
    const rippleAge = scene.age-rippleTime;
    if (!reduce && rippleAge >= 0 && rippleAge < .32) {
      ring(c.x,c.y,12+rippleAge*65,'rgba(158,243,236,'+(1-rippleAge/.32)+')',1.4);
    }
    if (held) ring(c.x,c.y,15,accent,2,-Math.PI/2,-Math.PI/2 + Math.PI*2*Math.min(1,scene.held/scene.chargeTime));
    const s = scene.shipAngle, sx = c.x+Math.cos(s)*43, sy = c.y+Math.sin(s)*43;
    ctx.save(); ctx.translate(sx,sy); ctx.rotate(s+Math.PI/2);
    ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-6,7); ctx.lineTo(-3,0); ctx.lineTo(-6,-7); ctx.closePath();
    ctx.fillStyle = '#e2f7fa'; ctx.fill();
    line([[-5,0],[-13,0]],'#65d3e0',2); ctx.restore();
    if (scene.stage === 1) {
      ctx.setLineDash([2,5]); line([[94,-60],[94,24]],'#779cac',1); ctx.setLineDash([]);
      for (const y of [-60,24]) line([[90,y],[98,y]],'#99b7c4',1.5);
    }
    let heading = 0;
    if (scene.freeFlight && !hit) {
      let older = scene.targetAt(scene.age-.45);
      for (let i=1; i<=9; i++) {
        const newer = scene.targetAt(scene.age-.45+i*.05);
        line([[older.x,older.y],[newer.x,newer.y]],'rgba(255,177,123,'+(i/17)+')',1+i*.25);
        heading = Math.atan2(newer.y-older.y,newer.x-older.x);
        older = newer;
      }
    }
    if (!hit) {
      const shield = scene.shieldClosed(scene.age);
      if (scene.stage === 2) {
        if (shield) {
          ctx.beginPath(); ctx.arc(dest.x,dest.y,23,0,2*Math.PI);
          ctx.fillStyle='#b89aff42'; ctx.fill();
          ring(dest.x,dest.y,23,'#c7adff',3);
        } else {
          for (const a of [-.8,Math.PI-.8]) ring(dest.x,dest.y,27,'#9f88b5',1,a,a+1.6);
        }
      }
      sprite(sprites[scene.stage],dest.x,dest.y,42,heading,'#d38e6a');
      const targetName = labels[scene.stage] || (shield ? t('SHIELD UP','ЩИТ ЗАКРЫТ') : t('SHIELD OPEN','ЩИТ ОТКРЫТ'));
      for (let i=0;i<4;i++) ring(dest.x,dest.y,24,aim?'#ffe6a2':'#f2a37f',1.6,i*Math.PI/2+.15,i*Math.PI/2+1.03);
      ctx.font='600 10px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#ffbf9e';ctx.fillText(targetName,dest.x,dest.y-31);
    } else {
      const progress = Math.min(1,impactAge/impactDuration);
      ring(dest.x,dest.y,20+progress*18,'#b3fbdf',1.3);
      for (let i=0;i<12;i++) {
        const a = i*Math.PI/6, r = 28+progress*(12+i%3*5);
        line([[dest.x+Math.cos(a)*r,dest.y+Math.sin(a)*r],[dest.x+Math.cos(a)*(r+4),dest.y+Math.sin(a)*(r+4)]],'#a9e2d1',1.6);
      }
    }
    if (held || scene.phase === 'flight') {
      const shot = held ? scene.preview : scene.shot;
      const remaining = shot.duration - scene.flight;
      const x = shot.x + shot.vx*remaining, y = shot.y + shot.vy*remaining;
      const guideColor = shot.outcome === 'hit' ? '#ffe6a2' :
        shot.outcome === 'blocked' ? '#c7adff' : '#92eee4';
      ctx.setLineDash([2,5]); ctx.lineCap='round';
      line([[p.x,p.y],[x,y]],guideColor,1.6);
      ctx.setLineDash([]); ctx.lineCap='butt';
      if (shot.outcome !== 'miss') {
        const arrival = scene.targetAt(scene.age+remaining);
        ring(arrival.x,arrival.y,arrival.radius,guideColor,1.2);
        ring(x,y,3,guideColor,2);
      }
    }
    if (scene.phase === 'flight') line([[p.x-scene.shot.vx*.06,p.y-scene.shot.vy*.06],[p.x,p.y]],'#8ce7df',3);
    if (!scene.shot) {
      for (let i=1;i<scene.trail.length;i++) {
        const a=scene.trail[i-1], b=scene.trail[i];
        line([[a.x,a.y],[b.x,b.y]],'rgba(123,225,220,'+i/scene.trail.length+')',2);
      }
    }
    if (!hit && scene.phase !== 'miss') {
      sprite('debris',p.x,p.y,30,scene.angle*.7,'#9bafb4');
      ring(p.x,p.y,15.5,held ? accent : '#93c5c9',1);
    }
  }
  function updatePanel() {
    const aiming = {hit:'aim', blocked:'shield', miss:'ready'};
    const state = scene.phase === 'hold' ? aiming[scene.aimOutcome] : scene.phase;
    const waiting = scene.phase === 'flight' ? requests.length : 0;
    const panelKey = [scene.stage, scene.throws, state, waiting].join('/');
    if (panelKey === lastState) return;
    lastState = panelKey;
    const finished = state === 'hit' && scene.finalStage;
    if (finished) {
      readBest();
      if (!best || scene.throws < best) {
        best = scene.throws;
        try { localStorage.setItem(recordKey,String(best)); } catch {}
      }
    }
    el('mission').textContent = missions[scene.stage];
    el('progress').textContent = t('Target ','Цель ') + (scene.stage+1) + ' / ' + scene.levelCount;
    el('shots').textContent = t('Throws · ','Броски · ') + scene.throws;
    el('best').hidden = !best;
    if (best) el('best').textContent = t('Best · ','Рекорд · ') + best;
    let tip = aimTip, label = t('Hold to orbit','Удерживай для вращения'), hint = controls;
    if (state === 'ready') {tip=t('Release to throw along the dotted line.','Отпусти, и обломок полетит по пунктиру.');label=t('Release to throw','Отпусти для броска');}
    if (state === 'shield') {tip=t('Release to throw. The shield is in the way.','Можешь бросать. Сейчас на пути щит.');label=t('Shield ahead','На пути щит');}
    if (state === 'aim') {tip=t('On target. Release now!','Цель на линии. Отпускай!');label=t('Release!','Отпускай!');}
    if (state === 'flight') {
      tip = waiting ? t('Throws waiting: ','Бросков в очереди: ') + waiting : t('Fragment in flight.','Обломок летит.');
    }
    if (state === 'miss') {tip=t('Missed. Release when the aim line turns gold.','Мимо. Отпусти, когда пунктир станет золотым.');}
    if (state === 'blocked') tip=t('The shield stopped your shot. Wait for a gold trajectory before release.','Обломок попал в щит. Дождись золотой траектории перед броском.');
    if (state === 'miss' || state === 'blocked') label=t('Hold to orbit','Удерживай для вращения');
    if (state === 'hit') {
      const results = [
        t('Anchor down. Next up: a moving target.','Якорь сбит. Следующая цель движется.'),
        t('Drifter down. The sentinel has a shield.','Дрон сбит. Дальше — страж со щитом.'),
        t('Sentinel down. Intercept the scout next.','Страж сбит. Следующая цель — летающий разведчик.'),
        t('Scout down. Intercept the last flyer.','Разведчик сбит. Остался перехватчик.')
      ];
      tip = results[scene.stage];
      hint = t('First three expeditions free on iPhone','Первые три экспедиции на iPhone бесплатны');
    }
    if (finished) {
      tip = scene.throws === scene.levelCount ? t('Perfect run! Five targets in five throws.','Чистая серия! Пять целей за пять бросков.') :
        t('All targets cleared. Throws: ','Все пять целей сбиты. Бросков: ') + scene.throws + '.';
    }
    el('status').textContent=tip; control.textContent=label; el('hint').textContent=hint;
    el('panel').classList.toggle('complete', finished);
    control.hidden = finished;
    replay.hidden = !finished;
    store.hidden = scene.stage === 0 && state !== 'hit';
    control.dataset.held=String(scene.phase==='hold');
  }
  function frame(time) {
    pending=0;
    const dt = previousTime ? Math.min((time-previousTime)/1000,.045) : 0;
    previousTime=time;
    const idleMotion = scene.freeFlight || !reduce;
    if (idleMotion || scene.phase !== 'idle') scene.step(dt);
    if (scene.phase==='hit') impactAge+=dt;
    if (scene.phase === 'hit' && !scene.finalStage && impactAge >= impactDuration) advanceScene();
    if (scene.phase === 'hit' && scene.finalStage) {
      requests.length = 0;
      input = null;
    }
    if (scene.phase !== 'hold' && scene.phase !== 'flight') processThrows();
    updatePanel();
    draw();
    const flyingTarget = scene.freeFlight && scene.phase !== 'hit';
    const showingHit = scene.phase === 'hit' && (!scene.finalStage || (!reduce && impactAge < impactDuration));
    const ambient = showingHit || (!reduce && scene.phase === 'idle');
    if (!document.hidden && (flyingTarget || ambient || scene.phase === 'hold' || scene.phase === 'flight')) startFrame();
    else previousTime=0;
  }
  function startFrame() {if (!pending && !document.hidden) pending=requestAnimationFrame(frame);}
  function fieldPoint(e) {
    const rect = field.getBoundingClientRect();
    return {x:(e.clientX-rect.left-rect.width/2)/scale, y:(e.clientY-rect.top-rect.height/2)/scale};
  }
  function moveRing(point) {
    if (point) {
      scene.placeRing(point.x,point.y);
      rippleTime = scene.age;
    }
  }
  function advanceScene() {
    scene.continueRun();
    impactAge = 0;
    rippleTime = -1;
  }
  replay.addEventListener('click',()=>{
    if (scene.phase !== 'hit' || !scene.finalStage) return;
    advanceScene();
    refreshInput();
    control.focus();
  });
  // Сохраняем ввод игрока, пока заканчивается полёт и виден эффект попадания.
  function processThrows() {
    const request = requests[0];
    if (!request || scene.phase === 'flight' || scene.phase === 'hit') return;
    if (scene.phase !== 'hold') {
      if (scene.phase !== 'idle') advanceScene();
      scene.hold();
      moveRing(request.point);
    }
    if (request.released) {
      scene.release();
      requests.shift();
      document.dispatchEvent(new Event('gravitide:throw'));
    }
  }
  function refreshInput() {
    processThrows();
    updatePanel();
    draw();
    startFrame();
  }
  function moveAim(point) {
    input.point = point;
    if (input === requests[0] && scene.phase === 'hold') {
      moveRing(point);
      updatePanel();
      draw();
    }
  }
  function begin(key, point = null) {
    if (input || (scene.phase === 'hit' && scene.finalStage)) return false;
    input = {key,point,released:false};
    requests.push(input);
    refreshInput();
    return true;
  }
  function cancelInput() {
    if (!input) return;
    const index = requests.indexOf(input);
    requests.splice(index,1);
    if (index === 0 && scene.phase === 'hold') {
      scene.phase = 'idle';
      scene.preview = null;
    }
    input = null;
    refreshInput();
  }
  function end(key, point = null) {
    if (!input || input.key !== key) return;
    if (input.point && point) moveAim(point);
    input.released = true;
    input = null;
    refreshInput();
  }
  const touchKey = touch => 'touch-' + touch.identifier;
  for (const surface of [field,control]) {
    if (nativeTouch) {
      surface.addEventListener('touchstart',e=>{
        e.preventDefault();
        if (e.touches.length !== 1) return;
        const touch = e.changedTouches[0];
        begin(touchKey(touch),surface === field ? fieldPoint(touch) : null);
      },{passive:false});
    }
    surface.addEventListener('pointerdown',e=>{
      if (!e.isPrimary || e.button !== 0 || (nativeTouch && e.pointerType === 'touch')) return;
      if (begin(e.pointerId,surface === field ? fieldPoint(e) : null)) {
        e.preventDefault();
        surface.setPointerCapture?.(e.pointerId);
      }
    });
    surface.addEventListener('contextmenu',e=>e.preventDefault());
  }
  field.addEventListener('pointermove',e=>{
    if (input?.point && input.key === e.pointerId) moveAim(fieldPoint(e));
  });
  field.addEventListener('touchmove',e=>{
    for (const touch of e.changedTouches) {
      if (input?.point && input.key === touchKey(touch)) moveAim(fieldPoint(touch));
    }
  });
  window.addEventListener('touchend',e=>{
    for (const touch of e.changedTouches) end(touchKey(touch),fieldPoint(touch));
  },true);
  window.addEventListener('touchcancel',e=>{
    for (const touch of e.changedTouches) {
      if (input?.key === touchKey(touch)) cancelInput();
    }
  },true);
  window.addEventListener('pointerup',e=>end(e.pointerId,fieldPoint(e)),true);
  window.addEventListener('pointercancel',e=>{if (input?.key === e.pointerId) cancelInput();},true);

  // Экранный диктор может активировать кнопку без касания или нажатия клавиши.
  control.addEventListener('click',e=>{
    if (e.detail === 0 && !e.pointerType && begin('activation')) end('activation');
  });
  window.addEventListener('keydown',e=>{
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.target !== control && e.target.closest?.('a,button,input,select,textarea,[contenteditable]')) return;
    if (['idle','hold'].includes(scene.phase) && e.code.startsWith('Arrow')) {
      const offsets = {ArrowLeft:[-12,0], ArrowRight:[12,0], ArrowUp:[0,-12], ArrowDown:[0,12]};
      const offset = offsets[e.code];
      if (offset) {
        e.preventDefault();
        scene.placeRing(scene.center.x+offset[0],scene.center.y+offset[1]);
        updatePanel(); draw();
      }
      return;
    }
    if (e.code !== 'Space' && !(e.key === 'Enter' && e.target === control)) return;
    e.preventDefault();
    if (!e.repeat) begin(e.code);
  });
  window.addEventListener('keyup',e=>{
    if (input?.key === e.code) { e.preventDefault(); end(e.code); }
  });
  window.addEventListener('blur',cancelInput);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelInput();cancelAnimationFrame(pending);pending=0;previousTime=0;}else startFrame();
  });
  new ResizeObserver(resize).observe(field);
  for (const image of Object.values(images)) image.addEventListener('load',draw);
  updatePanel();resize();startFrame();
})();
