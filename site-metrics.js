// Анонимные суточные счётчики для страниц сайта и игровой демоверсии.
(() => {
  'use strict';
  const endpoint = 'https://script.google.com/macros/s/AKfycbyHEB3_k6x5lGUUY4Mp7ltYnE6uZ3FM-bk-KtJCRDKlv1xNqtwWdVtY6EVxqRJ9_WkYbQ/exec';
  const pages = {
    '/': 'home', '/privacy.html': 'privacy', '/sshtunnel/': 'ssh_en',
    '/sshtunnel/ru.html': 'ssh_ru', '/gravitide/play/': 'demo', '/gravitide/press/': 'press'
  };
  const path = location.pathname.replace(/\/index\.html$/, '/');
  const page = pages[path];
  if (!page || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  const test = new URLSearchParams(location.search).get('qa') === '1';
  const mode = test ? 'test' : 'live';
  const iphone = /\biPhone\b/i.test(navigator.userAgent);
  // Отдельно для обычных посещений и QA. Идентификатор посетителя не создаётся.
  const key = 'site-metrics-v1-' + mode;
  let state = {};
  try { state = JSON.parse(sessionStorage.getItem(key) || '{}') || {}; } catch {}
  function save() { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {} }
  function send(events) {
    const body = new URLSearchParams({mode, events:events.join(',')});
    fetch(endpoint, {method:'POST', body, mode:'no-cors', credentials:'omit',
      referrerPolicy:'no-referrer', keepalive:true}).catch(() => {});
  }
  function visit() {
    const events = ['view_' + page];
    if (!state.tab) { state.tab = true; save(); events.push('tab'); }
    send(events);
  }
  visit();
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    // При возврате из bfcache данные могли поменяться на другой странице вкладки.
    try { state = JSON.parse(sessionStorage.getItem(key) || '{}') || {}; } catch {}
    visit();
  });
  if (page === 'demo') {
    document.addEventListener('gravitide:throw', () => {
      if (state.throws >= 2) return;
      state.throws = (state.throws || 0) + 1;
      save();
      if (state.throws === 1) send(iphone ? ['first','iphone_first'] : ['first']);
      else send(['second']);
    });
  }
  document.addEventListener('click', e => {
    const link = e.target.closest?.('a[href]');
    if (!link) return;
    if (page === 'demo' && link.id === 'store' && iphone && !state.store) {
      state.store = true;
      save();
      send(['iphone_store']);
    }
    if ((page === 'ssh_en' || page === 'ssh_ru') && link.hasAttribute('download') &&
        link.pathname.endsWith('/SSHTunnel-arm64.zip')) send(['zip']);
  }, true);
})();
