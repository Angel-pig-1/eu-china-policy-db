/* ==========================================================================
   政策库 — 主从式研究工作台
   状态驱动 + URL 深链 + 键盘导航 + CSV 导出 + 原始文件懒加载
   ========================================================================== */
(function () {
  'use strict';

  var esc = Site.escapeHTML;
  var DATA_ALL = (typeof DATA !== 'undefined') ? DATA : [];
  if (typeof LEGAL !== 'undefined') DATA_ALL = DATA_ALL.concat(LEGAL);
  if (typeof LEAD_POLICY !== 'undefined') DATA_ALL = DATA_ALL.concat(LEAD_POLICY);

  /* ---------- 派生数据（全部运行时计算） ---------- */
  var NUM = {}; // id -> 三位档案序号
  DATA_ALL.forEach(function (d, i) { NUM[d.id] = String(i + 1).padStart(3, '0'); });

  var YEARS = [];
  (function () {
    var s = {};
    DATA_ALL.forEach(function (d) { s[d.date.slice(0, 4)] = 1; });
    YEARS = Object.keys(s).sort();
  })();

  var latestDate = DATA_ALL.reduce(function (a, b) { return a.date > b.date ? a : b; }).date;

  /* ---------- 状态 ---------- */
  var state = { q: '', side: 'all', year: 'all', source: 'all', sort: 'desc', selectedId: null, rows: [] };
  var validSides = { all: 1, EU: 1, CN: 1 };
  var validSources = { all: 1, ices: 1, ext: 1 };
  var validSorts = { desc: 1, asc: 1, title: 1 };

  /* ---------- DOM ---------- */
  var elQ = document.getElementById('f-q');
  var elSide = document.getElementById('f-side');
  var elYear = document.getElementById('f-year');
  var elSource = document.getElementById('f-source');
  var elSort = document.getElementById('f-sort');
  var elCount = document.getElementById('result-count');
  var elChips = document.getElementById('chip-row');
  var elList = document.getElementById('result-list');
  var elDetail = document.getElementById('detail-pane');
  var elDetailInner = document.getElementById('detail-inner');
  var mobileQuery = window.matchMedia('(max-width: 900px)');

  /* ---------- 初始化控件选项 ---------- */
  function fillSelect(sel, options, current) {
    sel.innerHTML = options.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (o.v === current ? ' selected' : '') + '>' + esc(o.t) + '</option>';
    }).join('');
  }

  fillSelect(elYear, [{ v: 'all', t: '全部年份' }].concat(YEARS.map(function (y) { return { v: y, t: y + ' 年' }; })), 'all');
  fillSelect(elSource, [
    { v: 'all', t: '全部来源' },
    { v: 'ices', t: '核心收录' },
    { v: 'ext', t: '延伸收录' }
  ], 'all');
  fillSelect(elSort, [
    { v: 'desc', t: '日期 ↓ 新→旧' },
    { v: 'asc', t: '日期 ↑ 旧→新' },
    { v: 'title', t: '按标题排序' }
  ], 'desc');

  document.getElementById('search-icon').innerHTML = Site.icon('search');
  var btnReset = document.getElementById('btn-reset');
  btnReset.innerHTML = Site.icon('reset') + '<span>重置</span>';
  var btnCsv = document.getElementById('btn-csv');
  btnCsv.innerHTML = Site.icon('download') + '<span>导出 CSV</span>';

  /* ---------- URL 参数解析 ---------- */
  function fromURL() {
    var p = new URLSearchParams(location.search);
    if (p.has('q')) state.q = p.get('q').slice(0, 200);
    if (p.has('side') && validSides[p.get('side')]) state.side = p.get('side');
    if (p.has('year')) {
      var y = p.get('year');
      if (y === 'all' || YEARS.indexOf(y) !== -1) state.year = y;
    }
    if (p.has('source') && validSources[p.get('source')]) state.source = p.get('source');
    if (p.has('sort') && validSorts[p.get('sort')]) state.sort = p.get('sort');
    if (p.has('id')) {
      var id = p.get('id');
      if (DATA_ALL.some(function (d) { return d.id === id; })) state.selectedId = id;
    }
  }

  function toURL(push) {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.side !== 'all') p.set('side', state.side);
    if (state.year !== 'all') p.set('year', state.year);
    if (state.source !== 'all') p.set('source', state.source);
    if (state.sort !== 'desc') p.set('sort', state.sort);
    if (state.selectedId) p.set('id', state.selectedId);
    var qs = p.toString();
    var url = location.pathname + (qs ? '?' + qs : '');
    if (push) history.pushState({ icesDetail: true }, '', url);
    else history.replaceState(history.state, '', url);
  }

  /* ---------- 搜索匹配 ---------- */
  function haystack(d) {
    var parts = [d.name, d.nameZh, d.cnLabel, d.side, d.background, d.backgroundZh, d.implication, d.implicationZh, d.status, d.statusZh];
    if (d.framings) parts = parts.concat(d.framings);
    if (d.industries) parts = parts.concat(d.industries);
    return Site.norm(parts.filter(Boolean).join(' '));
  }
  var HAY = {};
  DATA_ALL.forEach(function (d) { HAY[d.id] = haystack(d); });

  /* ---------- 筛选 + 排序 ---------- */
  function applyFilters() {
    var q = Site.norm(state.q.trim());
    var scores = {};
    var rows = DATA_ALL.filter(function (d) {
      if (state.side !== 'all' && d.side !== state.side) return false;
      if (state.year !== 'all' && d.date.slice(0, 4) !== state.year) return false;
      if (state.source !== 'all' && d.source !== state.source) return false;
      if (q) {
        scores[d.id] = SemanticSearch.score(HAY[d.id], (d.nameZh || '') + ' ' + d.name, q);
        if (scores[d.id] < 0) return false;
      }
      return true;
    });
    if (q && !rows.length) {
      rows = DATA_ALL.filter(function (d) {
        if (state.side !== 'all' && d.side !== state.side) return false;
        if (state.year !== 'all' && d.date.slice(0, 4) !== state.year) return false;
        if (state.source !== 'all' && d.source !== state.source) return false;
        scores[d.id] = SemanticSearch.score(HAY[d.id], (d.nameZh || '') + ' ' + d.name, q, true);
        return scores[d.id] >= 0;
      });
    }
    if (q) rows.sort(function (a, b) { return scores[b.id] - scores[a.id]; });
    else if (state.sort === 'desc') rows.sort(function (a, b) { return b.date.localeCompare(a.date); });
    else if (state.sort === 'asc') rows.sort(function (a, b) { return a.date.localeCompare(b.date); });
    else rows.sort(function (a, b) {
      var ta = a.nameZh || a.name, tb = b.nameZh || b.name;
      return ta.localeCompare(tb, 'zh-Hans-CN');
    });
    state.rows = rows;

    // 选中项被新筛选排除 → 关闭详情并移除 id
    if (state.selectedId && !rows.some(function (r) { return r.id === state.selectedId; })) {
      closeDetail(true);
    }
    renderAll();
  }

  /* ---------- 渲染 ---------- */
  function renderAll() {
    renderCount();
    renderChips();
    renderList();
    syncControls();
    toURL();
  }

  function renderCount() {
    elCount.textContent = '结果 ' + state.rows.length + ' / ' + DATA_ALL.length + ' 条';
  }

  var CHIP_DEFS = [
    { key: 'q', label: function () { return '搜索：“' + state.q + '”'; } },
    { key: 'side', label: function () { return '侧别：' + state.side; } },
    { key: 'year', label: function () { return '年份：' + state.year; } },
    { key: 'source', label: function () { return '来源：' + (state.source === 'ices' ? '核心收录' : '延伸收录'); } }
  ];

  function renderChips() {
    var html = '';
    CHIP_DEFS.forEach(function (c) {
      var active = state[c.key] !== 'all' && state[c.key] !== '';
      if (active) {
        var label = c.label();
        html += '<button type="button" class="filter-chip" data-chip="' + c.key + '" aria-label="清除筛选：' + esc(label) + '">' +
          '<span class="filter-chip-label">' + esc(label) + '</span></button>';
      }
    });
    elChips.innerHTML = html;
  }

  function sideBadge(side) {
    return '<span class="badge badge-' + side.toLowerCase() + '">' + side + '</span>';
  }

  var PAGE_SIZE = 120;
  var renderedCount = 0;
  var listSentinel = null;
  var listObserver = null;
  var observerRoot = null;

  function rowHTML(d) {
    var sel = d.id === state.selectedId;
    var tags = (d.framings || []).slice(0, 2).map(function (f) {
      return '<span class="tag-chip">' + esc(f) + '</span>';
    }).join('');
    return '<li><a class="result-row' + (sel ? ' selected' : '') + '" id="opt-' + esc(d.id) + '" data-id="' + esc(d.id) + '" href="?id=' + encodeURIComponent(d.id) + '"' + (sel ? ' aria-current="true"' : '') + '>' +
      '<span class="row-num">' + NUM[d.id] + '</span>' +
      '<span class="row-main">' +
        '<span class="row-meta">' + sideBadge(d.side) +
          '<span class="badge badge-src">' + (d.source === 'ices' ? '核心' : '延伸') + '</span>' +
          '<span class="row-date">' + esc(Site.formatDate(d.date)) + '</span>' +
        '</span>' +
        '<span class="row-title-zh">' + esc(d.nameZh || d.name) + '</span>' +
        '<span class="row-title-en">' + esc(d.name) + '</span>' +
        (tags ? '<span class="row-tags">' + tags + '</span>' : '') +
      '</span>' +
    '</a></li>';
  }

  function initialRenderCount() {
    var count = Math.min(PAGE_SIZE, state.rows.length);
    if (state.selectedId) {
      for (var i = 0; i < state.rows.length; i++) {
        if (state.rows[i].id === state.selectedId) {
          count = Math.max(count, Math.min(state.rows.length, Math.ceil((i + 1) / PAGE_SIZE) * PAGE_SIZE));
          break;
        }
      }
    }
    return count;
  }

  function observeListSentinel() {
    if (!('IntersectionObserver' in window)) return;
    var root = mobileQuery.matches ? null : elList.parentElement;
    if (listObserver && observerRoot !== root) {
      listObserver.disconnect();
      listObserver = null;
    }
    if (!listObserver) {
      observerRoot = root;
      listObserver = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting && entries[i].target === listSentinel) {
            loadMore();
            break;
          }
        }
      }, { root: root, rootMargin: '600px 0px' });
    }
    listObserver.disconnect();
    if (listSentinel) listObserver.observe(listSentinel);
  }

  function renderList() {
    if (listObserver) listObserver.disconnect();
    listSentinel = null;
    renderedCount = initialRenderCount();
    if (!state.rows.length) {
      elList.innerHTML =
        '<li class="empty-state"><p>没有符合条件的政策记录。</p>' +
        '<button type="button" class="btn" id="btn-clear-all">清除全部筛选</button></li>';
      var c = document.getElementById('btn-clear-all');
      if (c) c.addEventListener('click', resetFilters);
      return;
    }
    var html = state.rows.slice(0, renderedCount).map(rowHTML).join('');
    if (renderedCount < state.rows.length) html += '<li class="list-sentinel" aria-hidden="true" style="height:1px"></li>';
    elList.innerHTML = html;
    listSentinel = elList.querySelector('.list-sentinel');
    observeListSentinel();
  }

  function appendRows(start, end) {
    var template = document.createElement('template');
    template.innerHTML = state.rows.slice(start, end).map(rowHTML).join('');
    elList.insertBefore(template.content, listSentinel);
    if (end >= state.rows.length) {
      if (listObserver && listSentinel) listObserver.unobserve(listSentinel);
      if (listSentinel) listSentinel.remove();
      listSentinel = null;
    }
  }

  function loadMore() {
    if (renderedCount >= state.rows.length) return;
    var start = renderedCount;
    renderedCount = Math.min(state.rows.length, renderedCount + PAGE_SIZE);
    appendRows(start, renderedCount);
  }

  function ensureItemRendered(id) {
    for (var i = renderedCount; i < state.rows.length; i++) {
      if (state.rows[i].id === id) {
        var start = renderedCount;
        renderedCount = Math.min(state.rows.length, Math.max(i + 1, renderedCount + PAGE_SIZE));
        appendRows(start, renderedCount);
        return;
      }
    }
  }

  function syncSelectedRows() {
    Array.prototype.forEach.call(elList.querySelectorAll('.result-row.selected, .result-row[aria-current="true"]'), function (row) {
      row.classList.remove('selected');
      row.removeAttribute('aria-current');
    });
    if (!state.selectedId) return;
    var row = elList.querySelector('[data-id="' + CSS.escape(state.selectedId) + '"]');
    if (row) {
      row.classList.add('selected');
      row.setAttribute('aria-current', 'true');
    }
  }

  function syncControls() {
    elQ.value = state.q;
    Array.prototype.forEach.call(elSide.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.val === state.side ? 'true' : 'false');
    });
    elYear.value = state.year;
    elSource.value = state.source;
    elSort.value = state.sort;
  }

  /* ---------- 详情 ---------- */
  function findItem(id) {
    for (var i = 0; i < DATA_ALL.length; i++) if (DATA_ALL[i].id === id) return DATA_ALL[i];
    return null;
  }

  function detailHTML(d) {
    var srcLabel = d.source === 'ices' ? '核心收录' : '延伸收录';
    var fileUrl = d.file ? Site.fileUrl('originals/' + d.file) : null;
    var link = location.origin === 'null' || location.origin === 'file://'
      ? location.pathname + '?id=' + encodeURIComponent(d.id)
      : location.origin + location.pathname + '?id=' + encodeURIComponent(d.id);

    var actions =
      '<button type="button" class="btn" data-act="copylink">' + Site.icon('link') + '<span>复制链接</span></button>' +
      '<button type="button" class="btn" data-act="copycite">' + Site.icon('copy') + '<span>复制引文</span></button>' +
      '<button type="button" class="btn" data-act="print">' + Site.icon('print') + '<span>打印摘要</span></button>' +
      (d.url ? '<a class="btn" href="' + esc(d.url) + '" target="_blank" rel="noopener">' + Site.icon('external') + '<span>官方来源</span></a>' : '');

    function bilingual(zh, en) {
      return '<div class="detail-bilingual">' +
        '<p class="detail-zh">' + esc(zh || '—') + '</p>' +
        '<p class="detail-en">' + esc(en || '—') + '</p></div>';
    }
    function section(title, zh, en) {
      return '<section class="detail-section"><h3>' + title + '</h3>' + bilingual(zh, en) + '</section>';
    }

    var tagsBlock = '';
    var fr = (d.framings || []).map(function (f) {
      return '<button type="button" class="tag-chip" data-search="' + esc(f) + '">' + esc(f) + '</button>';
    }).join('');
    var ind = (d.industries || []).map(function (f) {
      return '<button type="button" class="tag-chip" data-search="' + esc(f) + '">' + esc(f) + '</button>';
    }).join('');
    if (fr || ind) {
      tagsBlock = '<div class="detail-section"><div class="detail-tags-block">' +
        (fr ? '<div class="detail-tags-row"><span class="detail-tags-label">监管框架</span>' + fr + '</div>' : '') +
        (ind ? '<div class="detail-tags-row"><span class="detail-tags-label">行业代码</span>' + ind + '</div>' : '') +
        '</div></div>';
    }

    return '' +
      '<button type="button" class="icon-btn detail-close" data-act="close" aria-label="关闭详情">' + Site.icon('close') + '</button>' +
      '<div class="detail-top">' + sideBadge(d.side) +
        '<span class="badge badge-src">' + srcLabel + '</span>' +
        '<span class="row-date">' + esc(Site.formatDate(d.date)) + '</span>' +
        '<span class="row-date">№ ' + NUM[d.id] + '</span>' +
      '</div>' +
      '<h2 class="detail-title-zh" id="detail-title">' + esc(d.nameZh || d.name) + '</h2>' +
      '<p class="detail-title-en">' + esc(d.name) + '</p>' +
      (d.cnLabel && d.cnLabel !== d.nameZh ? '<p class="detail-cn-label">' + esc(d.cnLabel) + '</p>' : '') +
      '<div class="detail-actions">' + actions + '</div>' +
      '<div class="tablist" role="tablist" aria-label="政策内容">' +
        '<button type="button" role="tab" id="tab-summary" aria-controls="panel-summary" aria-selected="true">政策摘要</button>' +
        '<button type="button" role="tab" id="tab-original" aria-controls="panel-original" aria-selected="false" tabindex="-1">原始文件</button>' +
      '</div>' +
      '<div role="tabpanel" id="panel-summary" aria-labelledby="tab-summary" tabindex="0">' +
        '<dl class="detail-meta-grid">' +
          '<div class="detail-meta-cell"><dt>侧别</dt><dd>' + d.side + '</dd></div>' +
          '<div class="detail-meta-cell"><dt>来源</dt><dd>' + srcLabel + '</dd></div>' +
          '<div class="detail-meta-cell"><dt>日期</dt><dd>' + esc(Site.formatDate(d.date)) + '</dd></div>' +
          '<div class="detail-meta-cell"><dt>受影响对象</dt><dd>' + esc(String(d.impacted != null ? d.impacted : '—')) + '</dd></div>' +
          (d.url ? '<div class="detail-meta-cell"><dt>官方链接</dt><dd><a href="' + esc(d.url) + '" target="_blank" rel="noopener" style="word-break:break-all">' + esc(d.url) + '</a></dd></div>' : '') +
          (d.file ? '<div class="detail-meta-cell"><dt>本地文件</dt><dd>' + esc(d.file) + '</dd></div>' : '') +
        '</dl>' +
        section('状态 Status', d.statusZh, d.status) +
        section('背景 Background', d.backgroundZh, d.background) +
        section('影响 Implication', d.implicationZh, d.implication) +
        tagsBlock +
      '</div>' +
      '<div role="tabpanel" id="panel-original" aria-labelledby="tab-original" tabindex="0" hidden>' +
        (d.file
          ? '<div class="original-frame-wrap" id="original-mount">' +
              '<div class="original-frame-bar"><span>' + esc(d.file) + '</span>' +
              '<a class="btn btn-ghost" href="' + esc(fileUrl) + '" target="_blank" rel="noopener">' + Site.icon('external') + '<span>新窗口打开</span></a></div>' +
            '</div>'
          : '<div class="original-missing"><p>本地未收录该文件的原文镜像。</p>' +
            (d.url ? '<p style="margin-top:10px"><a class="btn" href="' + esc(d.url) + '" target="_blank" rel="noopener">' + Site.icon('external') + '<span>前往官方来源阅读</span></a></p>' : '') +
            '</div>') +
      '</div>';
  }

  var originalLoaded = false;
  var currentItem = null;

  function syncDetailMode() {
    var mobile = mobileQuery.matches;
    if (mobile && state.selectedId) {
      if (elDetail.open && !elDetail.classList.contains('open')) elDetail.close();
      if (!elDetail.open) elDetail.showModal();
      elDetail.classList.add('open');
      document.body.classList.add('detail-open');
    } else {
      if (elDetail.open && (!mobile || elDetail.classList.contains('open'))) elDetail.close();
      elDetail.classList.remove('open');
      document.body.classList.remove('detail-open');
      if (!mobile && !elDetail.open) elDetail.show();
    }
  }

  function selectItem(id, focusRow, userInitiated) {
    var d = findItem(id);
    if (!d) return;
    var push = !!(userInitiated && mobileQuery.matches && !elDetail.classList.contains('open'));
    state.selectedId = id;
    ensureItemRendered(id);
    syncSelectedRows();
    currentItem = d;
    originalLoaded = false;
    elDetailInner.innerHTML = detailHTML(d);
    initTabs(d);
    syncDetailMode();
    toURL(push);
    elDetail.scrollTop = 0;

    if (mobileQuery.matches) {
      var c = elDetail.querySelector('.detail-close');
      if (c) c.focus();
    } else if (focusRow) {
      var row = elList.querySelector('[data-id="' + CSS.escape(id) + '"]');
      if (row) row.focus();
    }
  }

  function clearClosedDetail() {
    if (state.selectedId || elDetail.classList.contains('open')) return;
    elDetailInner.innerHTML = placeholderHTML();
    tabRefs = null;
  }

  function closeDetail(skipURL) {
    var returnId = state.selectedId;
    var mobile = elDetail.classList.contains('open');
    state.selectedId = null;
    currentItem = null;
    if (elDetail.open) elDetail.close();
    elDetail.classList.remove('open');
    document.body.classList.remove('detail-open');
    clearClosedDetail();
    syncDetailMode();
    syncSelectedRows();
    if (!skipURL) {
      toURL();
      var row = returnId ? elList.querySelector('[data-id="' + CSS.escape(returnId) + '"]') : null;
      if (mobile && row) row.focus();
      else elList.focus();
    }
  }

  function requestCloseDetail() {
    if (mobileQuery.matches && elDetail.classList.contains('open') && history.state && history.state.icesDetail) {
      history.back();
      return;
    }
    closeDetail();
  }

  elDetail.addEventListener('cancel', function (ev) {
    ev.preventDefault();
    if (state.selectedId) requestCloseDetail();
  });

  elDetail.addEventListener('click', function (ev) {
    if (ev.target !== elDetail || !mobileQuery.matches) return;
    var rect = elDetail.getBoundingClientRect();
    if (ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom) {
      requestCloseDetail();
    }
  });

  mobileQuery.addEventListener('change', function () {
    syncDetailMode();
    observeListSentinel();
  });
  Site.enableSwipeDismiss(elDetail, { axis: 'y', onDismiss: requestCloseDetail });

  function placeholderHTML() {
    return '<div class="empty-state" style="padding-top:96px"><p id="detail-title" style="font-family:var(--serif);font-size:19px;font-weight:700;color:var(--muted)">选择左侧记录开始阅读</p>' +
      '<p style="font-size:13px">点击列表中的任意政策，查看中英双语摘要与原始文件。</p></div>';
  }

  /* 详情操作：启动时绑定一次委托监听 */
  elDetailInner.addEventListener('click', function (ev) {
    if (!currentItem) return;
    var d = currentItem;
    var act = ev.target.closest('[data-act]');
    if (act) {
      var a = act.dataset.act;
      if (a === 'copylink') {
        var link = location.pathname + '?id=' + encodeURIComponent(d.id);
        Site.copyText(location.origin === 'null' ? link : location.origin + link, '记录链接已复制');
      } else if (a === 'copycite') {
        var cite = (d.nameZh || d.name) + '（' + d.name + '）. ' + d.date + '. CEA 中欧档案. ' + (d.url || (location.origin === 'null' ? '' : location.origin) + location.pathname + '?id=' + d.id);
        Site.copyText(cite, '引文信息已复制');
      } else if (a === 'print') window.print();
      else if (a === 'close') requestCloseDetail();
      return;
    }
    var chip = ev.target.closest('[data-search]');
    if (chip) {
      state.q = chip.dataset.search;
      closeDetail(true);
      applyFilters();
      elQ.focus();
    }
  });

  /* 标签页（每次渲染后重新取元素） */
  var tabRefs = null;
  function initTabs(d) {
    var tabSummary = elDetailInner.querySelector('#tab-summary');
    var tabOriginal = elDetailInner.querySelector('#tab-original');
    var panelSummary = elDetailInner.querySelector('#panel-summary');
    var panelOriginal = elDetailInner.querySelector('#panel-original');
    tabRefs = { d: d, tabSummary: tabSummary, tabOriginal: tabOriginal, panelSummary: panelSummary, panelOriginal: panelOriginal };
  }

  function activateTab(isSummary) {
    if (!tabRefs) return;
    tabRefs.tabSummary.setAttribute('aria-selected', isSummary ? 'true' : 'false');
    tabRefs.tabOriginal.setAttribute('aria-selected', isSummary ? 'false' : 'true');
    tabRefs.tabSummary.tabIndex = isSummary ? 0 : -1;
    tabRefs.tabOriginal.tabIndex = isSummary ? -1 : 0;
    tabRefs.panelSummary.hidden = !isSummary;
    tabRefs.panelOriginal.hidden = isSummary;
    if (!isSummary && !originalLoaded && tabRefs.d.file) {
      var mount = elDetailInner.querySelector('#original-mount');
      if (mount) {
        var f = document.createElement('iframe');
        f.loading = 'lazy';
        f.src = Site.fileUrl('originals/' + tabRefs.d.file);
        f.title = '原始文件：' + tabRefs.d.name;
        mount.appendChild(f);
        originalLoaded = true;
      }
    }
  }

  elDetailInner.addEventListener('click', function (ev) {
    var t = ev.target.closest('[role="tab"]');
    if (!t || !tabRefs) return;
    activateTab(t.id === 'tab-summary');
  });

  elDetailInner.addEventListener('keydown', function (ev) {
    if (!tabRefs) return;
    if (ev.target.closest && ev.target.closest('[role="tab"]')) {
      if (ev.key === 'ArrowRight') { activateTab(false); tabRefs.tabOriginal.focus(); }
      else if (ev.key === 'ArrowLeft') { activateTab(true); tabRefs.tabSummary.focus(); }
    }
  });

  /* ---------- 筛选事件 ---------- */
  var debouncedQ = Site.debounce(function () {
    state.q = elQ.value;
    applyFilters();
  }, 100);
  elQ.addEventListener('input', debouncedQ);

  elSide.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-val]');
    if (!b) return;
    state.side = b.dataset.val;
    applyFilters();
  });
  elYear.addEventListener('change', function () { state.year = elYear.value; applyFilters(); });
  elSource.addEventListener('change', function () { state.source = elSource.value; applyFilters(); });
  elSort.addEventListener('change', function () { state.sort = elSort.value; applyFilters(); });

  elChips.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-chip]');
    if (!b) return;
    var k = b.dataset.chip;
    if (k === 'q') { state.q = ''; elQ.value = ''; }
    else state[k] = 'all';
    applyFilters();
  });

  function resetFilters() {
    state.q = ''; state.side = 'all'; state.year = 'all'; state.source = 'all'; state.sort = 'desc';
    applyFilters();
  }
  btnReset.addEventListener('click', resetFilters);

  /* ---------- CSV 导出 ---------- */
  btnCsv.addEventListener('click', function () {
    if (!state.rows.length) { Site.toast('当前没有可导出的记录'); return; }
    var headers = ['ID', '侧别', '日期', '中文标题', '英文标题', '状态（中）', '状态（英）', '背景（中）', '背景（英）', '影响（中）', '影响（英）', '监管框架', '行业代码', '官方链接', '本地文件'];
    var rows = state.rows.map(function (d) {
      return [d.id, d.side, d.date, d.nameZh || '', d.name || '', d.statusZh || '', d.status || '',
        d.backgroundZh || '', d.background || '', d.implicationZh || '', d.implication || '',
        (d.framings || []).join('；'), (d.industries || []).join('；'), d.url || '', d.file || ''];
    });
    Site.downloadCSV('cea-policies-' + Site.todayStamp() + '.csv', headers, rows);
    Site.toast('已导出 ' + rows.length + ' 条记录');
  });

  /* ---------- 列表交互 ---------- */
  elList.addEventListener('click', function (ev) {
    var row = ev.target.closest('a[data-id]');
    if (!row || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    selectItem(row.dataset.id, true, true);
  });

  elList.addEventListener('keydown', function (ev) {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    var ids = state.rows.map(function (r) { return r.id; });
    if (!ids.length) return;
    var idx = state.selectedId ? ids.indexOf(state.selectedId) : -1;
    if (ev.key === 'ArrowDown') idx = Math.min(ids.length - 1, idx + 1);
    else idx = Math.max(0, idx === -1 ? 0 : idx - 1);
    selectItem(ids[idx], true, true);
    var row = elList.querySelector('[data-id="' + CSS.escape(ids[idx]) + '"]');
    if (row) row.scrollIntoView({ block: 'nearest' });
  });

  /* ---------- 全局键盘 ---------- */
  document.addEventListener('keydown', function (ev) {
    var t = ev.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (ev.key === '/' && !typing) {
      ev.preventDefault();
      elQ.focus();
      elQ.select();
    } else if (ev.key === 'Escape' && state.selectedId && !elDetail.classList.contains('open')) {
      requestCloseDetail();
    }
  });

  window.addEventListener('popstate', function () {
    closeDetail(true);
    state.q = ''; state.side = 'all'; state.year = 'all'; state.source = 'all'; state.sort = 'desc';
    state.selectedId = null; state.rows = [];
    fromURL();
    syncControls();
    applyFilters();
    if (state.selectedId) selectItem(state.selectedId, false);
  });

  /* ---------- 启动 ---------- */
  Site.initHeader('policies');
  var euN = DATA_ALL.filter(function (d) { return d.side === 'EU'; }).length;
  var cnN = DATA_ALL.filter(function (d) { return d.side === 'CN'; }).length;
  var footStats = '政策 ' + DATA_ALL.length + ' 条（EU ' + euN + ' / CN ' + cnN + '）' +
    (typeof LIB !== 'undefined' ? ' · 文献 ' + LIB.length + ' 条' : '');
  Site.initFooter({ stats: footStats, latestYear: latestDate });

  fromURL();
  syncControls();
  elDetailInner.innerHTML = placeholderHTML();
  applyFilters();
  if (state.selectedId) selectItem(state.selectedId, false);
  else syncDetailMode();
})();
