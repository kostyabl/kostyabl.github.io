// Google Analytics 4 работает параллельно с агрегатами Apps Script.
(() => {
  'use strict';
  const measurementId = '';
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) return;
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;

  const params = new URLSearchParams(location.search);
  const debug = params.get('ga_debug') === '1';
  // Обычный режим QA использует только отдельный тестовый отчёт Apps Script.
  if (params.get('qa') === '1' && !debug) return;
  const storageKey = 'ga4-consent-v1';
  let choice;
  try { choice = localStorage.getItem(storageKey); } catch {}
  const ru = document.documentElement.lang.startsWith('ru') ||
    (location.pathname.startsWith('/gravitide/play/') && /^ru/i.test(navigator.language));
  const words = (english, russian) => ru ? russian : english;
  let enabled = false;
  let panel;

  function gtag() { window.dataLayer.push(arguments); }
  function sendPageView() {
    const page = new URL(location.pathname, location.origin);
    for (const name of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) {
      if (params.has(name)) page.searchParams.set(name, params.get(name));
    }
    let referrer = '';
    if (document.referrer) {
      try { referrer = new URL(document.referrer).origin; } catch {}
    }
    gtag('event', 'page_view', {send_to:measurementId, page_location:page.href,
      page_referrer:referrer, page_title:document.title});
  }
  function enable() {
    if (enabled) return;
    enabled = true;
    window['ga-disable-' + measurementId] = false;
    window.dataLayer = window.dataLayer || [];
    gtag('consent', 'default', {analytics_storage:'granted', ad_storage:'denied',
      ad_user_data:'denied', ad_personalization:'denied'});
    gtag('js', new Date());
    const config = {send_page_view:false, allow_google_signals:false,
      allow_ad_personalization_signals:false, cookie_domain:'none', cookie_expires:7776000};
    if (debug) config.debug_mode = true;
    gtag('config', measurementId, config);
    sendPageView();
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.append(tag);
  }
  const names = {
    first:'gravitide_first_throw', second:'gravitide_second_throw',
    iphone_first:'gravitide_iphone_first_throw', iphone_store:'gravitide_iphone_app_store',
    zip:'sshtunnel_download'
  };
  window.addEventListener('site:milestones', e => {
    if (!enabled) return;
    for (const event of e.detail) {
      if (Object.hasOwn(names,event)) gtag('event', names[event], {send_to:measurementId});
    }
  });
  window.addEventListener('pageshow', e => { if (enabled && e.persisted) sendPageView(); });

  const settings = document.getElementById('ga-settings');
  function select(value) {
    const wasEnabled = enabled;
    choice = value;
    try { localStorage.setItem(storageKey,value); } catch {}
    panel?.remove();
    panel = null;
    if (value === 'allow') { enable(); return; }
    if (wasEnabled) {
      enabled = false;
      window['ga-disable-' + measurementId] = true;
      gtag('consent', 'update', {analytics_storage:'denied'});
      for (const name of ['_ga','_ga_' + measurementId.slice(2)]) {
        document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax; Secure';
      }
    }
  }
  function showSettings() {
    if (panel) { panel.querySelector('button').focus(); return; }
    panel = document.createElement('aside');
    panel.setAttribute('aria-label', 'Google Analytics');
    panel.style.cssText = 'box-sizing:border-box;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px 14px;padding:12px 16px;font:14px/1.4 system-ui;background:#122431;color:#f1f7fa;text-align:center';
    const label = document.createElement('span');
    label.textContent = words('Allow Google Analytics cookies to measure visits and gameplay?',
      'Разрешить Google Analytics использовать cookie для статистики посещений и игры?');
    panel.append(label);
    for (const [value,title] of [['allow',words('Allow','Разрешить')],['deny',words('Decline','Отказаться')]]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = title;
      button.style.cssText = 'min-height:36px;padding:5px 12px;border:1px solid #aac4cc;border-radius:8px;background:transparent;color:#f1f7fa;cursor:pointer;font:inherit';
      button.addEventListener('click', () => select(value));
      panel.append(button);
    }
    if (settings) settings.after(panel);
    else document.body.prepend(panel);
  }
  if (settings) {
    settings.hidden = false;
    settings.addEventListener('click',showSettings);
  }
  if (choice === 'allow') enable();
  else if (choice !== 'deny') showSettings();
})();
