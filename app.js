/* Переключатель темы, подсветка залипшей шапки и появление блоков при скролле */

(function () {
    'use strict';

    // --- Тема -------------------------------------------------------------
    var root = document.documentElement;
    var toggle = document.getElementById('themeToggle');

    function currentTheme() {
        var explicit = root.getAttribute('data-theme');
        if (explicit) return explicit;
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    if (toggle) {
        toggle.addEventListener('click', function () {
            var next = currentTheme() === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem('theme', next); } catch (e) { /* приватный режим */ }
        });
    }

    // --- Шапка ------------------------------------------------------------
    var header = document.getElementById('siteHeader');

    if (header) {
        var onScroll = function () {
            header.classList.toggle('is-stuck', window.scrollY > 8);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    // --- Появление блоков -------------------------------------------------
    var items = document.querySelectorAll('.reveal');

    if (!('IntersectionObserver' in window)) {
        items.forEach(function (el) { el.classList.add('is-visible'); });
        return;
    }

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry, i) {
            if (!entry.isIntersecting) return;
            var el = entry.target;
            el.style.transitionDelay = (i * 80) + 'ms';
            el.classList.add('is-visible');
            observer.unobserve(el);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    items.forEach(function (el) { observer.observe(el); });
})();
