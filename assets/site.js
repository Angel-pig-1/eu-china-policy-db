/* ==========================================================================
   ICES 中欧政策档案 — 共享脚本
   工具函数 / 页头页脚 / 主题切换 / CSV / Toast
   依赖：无（data.js / library_data.js 由各页面自行加载）
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 图标（内联 SVG，无外部资源） ---------------- */
  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/>',
    moon: '<path d="M20.6 14.2A8.6 8.6 0 0 1 9.8 3.4a8.6 8.6 0 1 0 10.8 10.8z"/>',
    menu: '<path d="M3.5 7h17M3.5 12h17M3.5 17h17"/>',
    close: '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>',
    download: '<path d="M12 3.5v11M7.5 10l4.5 4.5L16.5 10M4 17.5v2.5h16v-2.5"/>',
    link: '<path d="M9.8 14.2l4.4-4.4M8.2 11l-2.3 2.3a3.54 3.54 0 0 0 5 5L13.2 16M15.8 13l2.3-2.3a3.54 3.54 0 0 0-5-5L10.8 8"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="1.5"/><path d="M15.5 5.5v-2h-12v12h2"/>',
    print: '<path d="M7 8V3.5h10V8M7 17H4.5v-6.8A2.7 2.7 0 0 1 7.2 7.5h9.6a2.7 2.7 0 0 1 2.7 2.7V17H17"/><rect x="7" y="14.5" width="10" height="6.5"/>',
    external: '<path d="M14 4h6v6M20 4L11 13M19 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5.5"/>',
    file: '<path d="M6.5 3.5h7.5L18.5 8v12a.5.5 0 0 1-.5.5H6.5a.5.5 0 0 1-.5-.5v-16a.5.5 0 0 1 .5-.5z"/><path d="M13.5 3.5V8h5"/>',
    arrow: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    reset: '<path d="M4.5 8.5A8 8 0 1 1 4 13.5M4.5 3.5v5h5"/>'
  };

  function icon(name) {
    var d = ICONS[name] || '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
  }

  /* ---------------- 基础工具 ---------------- */
  function escapeHTML(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function norm(s) {
    if (s === null || s === undefined) return '';
    return String(s).normalize('NFKC').toLowerCase();
  }

  function formatDate(d) {
    if (!d) return '—';
    var s = String(d).trim();
    if (/^\d{4}$/.test(s)) return s;
    if (/^\d{4}-\d{2}$/.test(s)) return s.replace(/-/g, '.');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, '.');
    return s;
  }

  function fileUrl(path) {
    return encodeURI(String(path));
  }

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait === undefined ? 100 : wait);
    };
  }

  /* ---------------- Toast ---------------- */
  var toastRegion = null;
  function ensureToastRegion() {
    if (toastRegion) return toastRegion;
    toastRegion = document.createElement('div');
    toastRegion.className = 'toast-region';
    toastRegion.setAttribute('aria-live', 'polite');
    toastRegion.setAttribute('role', 'status');
    document.body.appendChild(toastRegion);
    return toastRegion;
  }

  function toast(msg) {
    var region = ensureToastRegion();
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    region.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 260);
    }, 2400);
  }

  /* ---------------- 剪贴板（含回退） ---------------- */
  function copyText(text, okMsg) {
    function done() { toast(okMsg || '已复制到剪贴板'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) done(); else toast('复制失败，请手动复制');
    }
    if (navigator.clipboard && window.isSecureContext !== false) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ---------------- CSV 导出 ---------------- */
  function csvCell(v) {
    if (v === null || v === undefined) v = '';
    return '"' + String(v).replace(/"/g, '""') + '"';
  }

  function downloadCSV(filename, headers, rows) {
    var lines = [];
    lines.push(headers.map(csvCell).join(','));
    for (var i = 0; i < rows.length; i++) {
      lines.push(rows[i].map(csvCell).join(','));
    }
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      a.remove();
      URL.revokeObjectURL(url);
    }, 200);
  }

  function todayStamp() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /* ---------------- 主题 ---------------- */
  function currentTheme() {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }
  function applyTheme(mode, persist) {
    var root = document.documentElement;
    if (mode === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    if (persist) {
      try { localStorage.setItem('ices-theme', mode); } catch (e) { /* 隐私模式等 */ }
    }
    var btn = document.querySelector('[data-theme-toggle]');
    if (btn) {
      btn.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
      btn.setAttribute('aria-label', mode === 'dark' ? '切换到浅色模式' : '切换到深色模式');
      btn.innerHTML = icon(mode === 'dark' ? 'sun' : 'moon');
    }
  }
  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  }

  /* ---------------- 页头 ---------------- */
  var NAV = [
    { href: 'index.html', label: '首页', key: 'home' },
    { href: 'policies.html', label: '政策库', key: 'policies' },
    { href: 'library.html', label: '文献库', key: 'library' },
    { href: 'stats.html', label: '数据总览', key: 'stats' },
    { href: 'policies.html', label: '政策搜索', key: 'policy-search' }
  ];

  function brandMarkSVG() {
    return '<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">' +
      '<circle cx="20" cy="20" r="17.5" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
      '<ellipse cx="20" cy="20" rx="17.5" ry="7.5" fill="none" stroke="currentColor" stroke-width="1"/>' +
      '<ellipse cx="20" cy="20" rx="7.5" ry="17.5" fill="none" stroke="currentColor" stroke-width="1"/>' +
      '<line x1="20" y1="2.5" x2="20" y2="37.5" stroke="currentColor" stroke-width="0.8"/>' +
      '<line x1="2.5" y1="20" x2="37.5" y2="20" stroke="currentColor" stroke-width="0.8"/>' +
      '<circle cx="27.5" cy="13" r="3.2" class="brand-dot"/>' +
      '<circle cx="11.5" cy="26.5" r="3.2" class="brand-dot"/>' +
      '</svg>';
  }

  function initHeader(activeKey) {
    var mount = document.getElementById('site-header');
    if (!mount) return;
    var navHTML = NAV.map(function (n) {
      var cur = n.key === activeKey ? ' aria-current="page"' : '';
      var ic = n.key === 'policy-search' ? icon('search') : '';
      return '<li><a class="nav-link" href="' + n.href + '"' + cur + '>' + ic + '<span>' + n.label + '</span></a></li>';
    }).join('');

    mount.className = 'site-header';
    mount.innerHTML =
      '<div class="header-inner">' +
        '<a class="brand" href="index.html" aria-label="ICES 中欧政策档案，返回首页">' +
          brandMarkSVG() +
          '<span class="brand-text"><span class="brand-name">ICES</span>' +
          '<span class="brand-sub">中欧政策档案</span></span>' +
        '</a>' +
        '<nav class="main-nav" aria-label="主导航"><ul>' + navHTML + '</ul></nav>' +
        '<div class="header-actions">' +
          '<button type="button" class="icon-btn" data-theme-toggle aria-pressed="false" aria-label="切换主题"></button>' +
          '<button type="button" class="icon-btn menu-btn" data-menu-toggle aria-expanded="false" aria-controls="mobile-menu" aria-label="打开菜单">' + icon('menu') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="mobile-menu" id="mobile-menu" aria-hidden="true" inert>' +
        '<ul>' + navHTML + '</ul>' +
        '<p class="mobile-menu-foot">ICES · 中欧政策档案</p>' +
      '</div>';

    // 主题按钮初始状态
    applyTheme(currentTheme(), false);

    // 主题切换
    mount.querySelector('[data-theme-toggle]').addEventListener('click', toggleTheme);

    // 移动菜单
    var menuBtn = mount.querySelector('[data-menu-toggle]');
    var menu = mount.querySelector('#mobile-menu');
    var menuOpen = false;
    function setMenu(open) {
      menuOpen = open;
      menu.classList.toggle('open', open);
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuBtn.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
      menuBtn.innerHTML = icon(open ? 'close' : 'menu');
      document.body.classList.toggle('menu-open', open);
      if (open) {
        if (menu.removeAttribute) menu.removeAttribute('inert');
        menu.removeAttribute('inert');
        var first = menu.querySelector('a');
        if (first) first.focus();
      } else {
        menu.setAttribute('inert', '');
        menuBtn.focus();
      }
    }
    menuBtn.addEventListener('click', function () { setMenu(!menuOpen); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen) setMenu(false);
    });
    // 点击菜单内链接后关闭
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
  }

  /* ---------------- 页脚 ---------------- */
  function initFooter(opts) {
    opts = opts || {};
    var mount = document.getElementById('site-footer');
    if (!mount) return;
    var stats = opts.stats || '';
    var year = opts.latestYear ? String(opts.latestYear).slice(0, 4) : '';
    mount.className = 'site-footer';
    mount.innerHTML =
      '<div class="footer-inner">' +
        '<div class="footer-brand">' +
          '<a class="brand" href="index.html">' + brandMarkSVG() +
            '<span class="brand-text"><span class="brand-name">ICES</span>' +
            '<span class="brand-sub">中欧政策档案</span></span></a>' +
          '<p class="footer-meta">' + escapeHTML(stats) + (year ? ' · 数据截至 ' + escapeHTML(year) : '') + '</p>' +
        '</div>' +
        '<nav class="footer-nav" aria-label="页脚导航">' +
          NAV.slice(0, 4).map(function (n) {
            return '<a class="nav-link" href="' + n.href + '">' + n.label + '</a>';
          }).join('') +
        '</nav>' +
      '</div>';
  }

  /* ---------------- 导出 ---------------- */
  window.Site = {
    icon: icon,
    escapeHTML: escapeHTML,
    norm: norm,
    formatDate: formatDate,
    fileUrl: fileUrl,
    debounce: debounce,
    toast: toast,
    copyText: copyText,
    downloadCSV: downloadCSV,
    todayStamp: todayStamp,
    initHeader: initHeader,
    initFooter: initFooter,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
    reduceMotion: reduceMotion
  };
})();
