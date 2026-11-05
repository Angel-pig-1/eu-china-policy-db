/* ==========================================================================
   CEA 中欧档案 — 共享脚本
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
    var themeMeta = document.querySelector('meta[name="theme-color"][data-current-theme]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      themeMeta.setAttribute('data-current-theme', '');
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', mode === 'dark' ? '#0b0b0d' : '#f5f5f7');
  }
  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  }

  /* ---------------- 可中断的触摸滑动关闭 ---------------- */
  function enableSwipeDismiss(element, options) {
    if (!element || !options || typeof options.onDismiss !== 'function') return;
    var axis = options.axis === 'x' ? 'x' : 'y';
    var start = null;
    var drag = null;
    var frame = 0;
    var lastX = 0;
    var lastY = 0;
    var lastTime = 0;
    var velocity = 0;
    var suppressClick = false;
    element.addEventListener('click', function (e) {
      if (!suppressClick || !e.isTrusted) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressClick = false;
    }, true);
    function resetTransform(animated) {
      element.style.transition = animated && !reduceMotion ? 'transform 200ms var(--ease)' : 'none';
      element.style.transform = '';
    }
    element.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'touch' || e.button !== 0 || !element.open || !window.matchMedia('(max-width: 900px)').matches) return;
      if (e.target.closest('input, select, textarea, [contenteditable="true"]')) return;
      var scroller = element.querySelector('.detail-inner, .filter-sheet-content');
      if (axis === 'y' && ((scroller && scroller.scrollTop > 0) || element.scrollTop > 0)) return;
      start = { x: e.clientX, y: e.clientY, time: performance.now(), id: e.pointerId };
      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = start.time;
      velocity = 0;
      drag = null;
    }, { passive: true });
    element.addEventListener('pointermove', function (e) {
      if (!start || e.pointerId !== start.id) return;
      var dx = e.clientX - start.x;
      var dy = e.clientY - start.y;
      if (!drag) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        var correctAxis = axis === 'x' ? Math.abs(dx) > Math.abs(dy) * 1.2 && dx > 0 : Math.abs(dy) > Math.abs(dx) * 1.2 && dy > 0;
        if (!correctAxis) { start = null; return; }
        drag = { distance: 0 };
        element.setPointerCapture(e.pointerId);
        element.style.transition = 'none';
      }
      e.preventDefault();
      var distance = Math.max(0, axis === 'x' ? dx : dy);
      var now = performance.now();
      var elapsed = Math.max(1, now - lastTime);
      var current = axis === 'x' ? e.clientX - lastX : e.clientY - lastY;
      velocity = velocity * 0.65 + (current / elapsed) * 0.35;
      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = now;
      drag.distance = distance;
      if (!frame) {
        frame = requestAnimationFrame(function () {
          frame = 0;
          if (!drag) return;
          var value = drag.distance + 'px';
          element.style.transform = axis === 'x' ? 'translateX(' + value + ')' : 'translateY(' + value + ')';
        });
      }
    }, { passive: false });
    function finish(e, cancelled) {
      if (!start || (e.pointerId !== undefined && e.pointerId !== start.id)) return;
      var wasDragging = !!drag;
      var distance = drag ? drag.distance : 0;
      start = null;
      drag = null;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      if (!wasDragging) return;
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 350);
      var extent = axis === 'x' ? element.clientWidth : element.clientHeight;
      var shouldClose = !cancelled && (distance > extent * 0.24 || (distance > 48 && velocity > 0.55));
      if (shouldClose) {
        element.style.transition = reduceMotion ? 'none' : 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)';
        element.style.transform = axis === 'x' ? 'translateX(102%)' : 'translateY(102%)';
        setTimeout(function () {
          resetTransform(false);
          options.onDismiss();
        }, reduceMotion ? 0 : 200);
      } else {
        resetTransform(true);
        setTimeout(function () { element.style.transition = ''; }, 210);
      }
    }
    element.addEventListener('pointerup', function (e) { finish(e, false); });
    element.addEventListener('pointercancel', function (e) { finish(e, true); });
  }

  /* ---------------- 页头 ---------------- */
  var NAV = [
    { href: 'index.html', label: '首页', key: 'home' },
    { href: 'policies.html', label: '政策库', key: 'policies' },
    { href: 'library.html', label: '文献库', key: 'library' },
    { href: 'stats.html', label: '数据总览', key: 'stats' }
  ];

  function brandMark() {
    return '<img class="brand-mark" src="assets/brand-blue.png" alt="" width="60" height="60" loading="eager" decoding="async">';
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
        '<a class="brand" href="index.html" aria-label="CEA 中欧档案，返回首页">' +
          brandMark() +
          '<span class="brand-text"><span class="brand-name">CEA</span>' +
          '<span class="brand-sub">中欧档案</span></span>' +
        '</a>' +
        '<nav class="main-nav" aria-label="主导航"><ul>' + navHTML + '</ul></nav>' +
        '<div class="header-actions">' +
          '<button type="button" class="icon-btn" data-theme-toggle aria-pressed="false" aria-label="切换主题"></button>' +
          '<button type="button" class="icon-btn menu-btn" data-menu-toggle aria-expanded="false" aria-controls="mobile-menu" aria-label="打开菜单">' + icon('menu') + '</button>' +
        '</div>' +
      '</div>';

    applyTheme(currentTheme(), false);
    mount.querySelector('[data-theme-toggle]').addEventListener('click', toggleTheme);

    var menuBtn = mount.querySelector('[data-menu-toggle]');
    var menu = document.createElement('dialog');
    menu.className = 'mobile-menu';
    menu.id = 'mobile-menu';
    menu.setAttribute('aria-label', '主导航');
    menu.innerHTML =
      '<div class="mobile-menu-bar"><span>浏览档案</span>' +
      '<button type="button" class="icon-btn mobile-menu-close" data-menu-close aria-label="关闭菜单">' + icon('close') + '</button></div>' +
      '<nav aria-label="移动端主导航"><ul>' + navHTML + '</ul></nav>' +
      '<p class="mobile-menu-foot">CEA · 中欧档案</p>';
    mount.insertAdjacentElement('afterend', menu);
    var menuOpen = false;
    var menuReturnFocus = null;
    var mobileQuery = window.matchMedia('(max-width: 900px)');
    function setMenu(open) {
      if (open === menuOpen) return;
      menuOpen = open;
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('menu-open', open);
      if (open) {
        menuReturnFocus = menuBtn;
        menu.classList.add('open');
        menu.showModal();
        menu.querySelector('[data-menu-close]').focus();
      } else {
        menu.classList.remove('open');
        if (menu.open) menu.close();
        if (menuReturnFocus && document.contains(menuReturnFocus)) menuReturnFocus.focus();
        menuReturnFocus = null;
      }
    }
    menuBtn.addEventListener('click', function () { setMenu(!menuOpen); });
    menu.querySelector('[data-menu-close]').addEventListener('click', function () { setMenu(false); });
    menu.addEventListener('cancel', function (e) {
      e.preventDefault();
      setMenu(false);
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    function handleBreakpoint() {
      if (!mobileQuery.matches && menuOpen) setMenu(false);
    }
    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', handleBreakpoint);
    else mobileQuery.addListener(handleBreakpoint);

    var filterToggle = document.querySelector('[data-filter-toggle]');
    if (filterToggle) {
      var filters = document.getElementById(filterToggle.getAttribute('aria-controls'));
      var filterSheet = document.createElement('dialog');
      filterSheet.className = 'filter-sheet';
      filterSheet.setAttribute('aria-labelledby', 'filter-sheet-title');
      filterSheet.innerHTML =
        '<div class="filter-sheet-bar"><h2 id="filter-sheet-title">筛选与排序</h2>' +
        '<button type="button" class="btn" data-filter-done>完成</button></div>' +
        '<div class="filter-sheet-content"></div>';
      document.body.appendChild(filterSheet);
      var filterContent = filterSheet.querySelector('.filter-sheet-content');
      Array.prototype.forEach.call(filters.querySelectorAll('select'), function (select) {
        var label = document.createElement('label');
        label.className = 'form-field';
        label.textContent = select.getAttribute('aria-label') || '筛选条件';
        select.parentNode.insertBefore(label, select);
        label.appendChild(select);
      });
      function setFilterSheet(open) {
        filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.classList.toggle('filter-sheet-open', open);
        if (open) {
          filterContent.appendChild(filters);
          filters.classList.add('is-open');
          filterSheet.showModal();
        } else {
          if (filterSheet.open) filterSheet.close();
          filterToggle.insertAdjacentElement('afterend', filters);
          filters.classList.remove('is-open');
        }
      }
      filterToggle.addEventListener('click', function () { setFilterSheet(true); });
      filterSheet.querySelector('[data-filter-done]').addEventListener('click', function () { setFilterSheet(false); });
      filterSheet.addEventListener('cancel', function (e) {
        e.preventDefault();
        setFilterSheet(false);
      });
      filterSheet.addEventListener('click', function (e) {
        if (e.target !== filterSheet) return;
        var rect = filterSheet.getBoundingClientRect();
        if (e.clientY < rect.top) setFilterSheet(false);
      });
      function handleFilterBreakpoint() {
        if (!mobileQuery.matches && filterSheet.open) setFilterSheet(false);
      }
      if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', handleFilterBreakpoint);
      else mobileQuery.addListener(handleFilterBreakpoint);
    }

    enableSwipeDismiss(menu, { axis: 'x', onDismiss: function () { setMenu(false); } });
    var activeFilterSheet = document.querySelector('.filter-sheet');
    enableSwipeDismiss(activeFilterSheet, { axis: 'y', onDismiss: function () {
      var done = activeFilterSheet.querySelector('[data-filter-done]');
      if (done) done.click();
    } });

    var filterBar = document.querySelector('.filter-bar');
    if (filterBar) {
      var lastScrollY = window.scrollY;
      var scrollQueued = false;
      var filterHideTimer = null;
      var filterReveal = document.createElement('button');
      filterBar.id = filterBar.id || 'filter-bar';
      filterReveal.type = 'button';
      filterReveal.className = 'btn filter-reveal';
      filterReveal.textContent = '筛选';
      filterReveal.setAttribute('aria-label', '展开筛选');
      filterReveal.setAttribute('aria-controls', filterBar.id);
      filterReveal.setAttribute('aria-expanded', 'false');
      filterReveal.hidden = true;
      filterReveal.style.cssText = 'position:fixed;right:var(--pad-page);bottom:calc(16px + env(safe-area-inset-bottom, 0px));z-index:40;display:none;';
      filterBar.insertAdjacentElement('afterend', filterReveal);
      function showFilterReveal(show) {
        filterReveal.hidden = !show;
        filterReveal.style.display = show ? 'inline-flex' : 'none';
      }
      function revealFilters() {
        clearTimeout(filterHideTimer);
        filterHideTimer = null;
        filterBar.removeAttribute('inert');
        filterBar.setAttribute('aria-hidden', 'false');
        filterBar.classList.remove('is-collapsed');
        showFilterReveal(false);
      }
      function finishFilterCollapse() {
        if (!filterBar.classList.contains('is-collapsed')) return;
        filterBar.setAttribute('inert', '');
        filterBar.setAttribute('aria-hidden', 'true');
        filterHideTimer = null;
      }
      function collapseFilters() {
        if (filterBar.classList.contains('is-collapsed')) return;
        filterBar.classList.add('is-collapsed');
        showFilterReveal(true);
        clearTimeout(filterHideTimer);
        filterHideTimer = setTimeout(finishFilterCollapse, 240);
      }
      function updateFilterVisibility() {
        scrollQueued = false;
        var y = window.scrollY;
        var delta = y - lastScrollY;
        lastScrollY = y;
        if (!mobileQuery.matches || menuOpen || filterBar.contains(document.activeElement) || y < 100 || delta < -4) {
          revealFilters();
        } else if (delta > 6 && y > 140) {
          collapseFilters();
        }
      }
      window.addEventListener('scroll', function () {
        if (!scrollQueued) {
          scrollQueued = true;
          requestAnimationFrame(updateFilterVisibility);
        }
      }, { passive: true });
      filterBar.addEventListener('focusin', revealFilters);
      filterBar.addEventListener('transitionend', function (e) {
        if (e.target === filterBar && e.propertyName === 'transform') finishFilterCollapse();
      });
      filterReveal.addEventListener('click', function () {
        revealFilters();
        var search = filterBar.querySelector('input[type="search"]');
        if (search) search.focus();
      });
      document.addEventListener('keydown', function (e) {
        var t = e.target;
        var typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (e.key !== '/' || typing || menuOpen) return;
        var search = filterBar.querySelector('input[type="search"]');
        if (!search) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        revealFilters();
        search.focus();
        search.select();
      }, true);
      if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', revealFilters);
      else mobileQuery.addListener(revealFilters);
    }
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
          '<a class="brand" href="index.html">' + brandMark() +
            '<span class="brand-text"><span class="brand-name">CEA</span>' +
            '<span class="brand-sub">中欧档案</span></span></a>' +
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
    enableSwipeDismiss: enableSwipeDismiss,
    reduceMotion: reduceMotion
  };
})();
