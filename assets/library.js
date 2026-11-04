/* ==========================================================================
   文献库 — 复用政策库主从工作台，替换检索语义
   状态：{ q, side:all|EU|CN|INTL, coll:all|01|02|03, year, sort, selectedId, rows }
   ========================================================================== */
(function () {
  'use strict';

  var esc = Site.escapeHTML;
  var LIB_ALL = (typeof LIB !== 'undefined') ? LIB : [];

  /* ---------- 派生数据（全部运行时计算） ---------- */
  var NUM = {};
  LIB_ALL.forEach(function (d, i) { NUM[d.id] = String(i + 1).padStart(3, '0'); });

  var COLL_ORDER = ['01', '02', '03'];
  var COLL_DEFS = {};
  LIB_ALL.forEach(function (d) {
    if (!COLL_DEFS[d.coll]) COLL_DEFS[d.coll] = { no: d.coll, name: d.collName, count: 0 };
    COLL_DEFS[d.coll].count++;
  });

  var YEARS = (function () {
    var s = {};
    LIB_ALL.forEach(function (d) { if (d.year) s[String(d.year)] = 1; });
    return Object.keys(s).sort();
  })();
  var TYPES = (function () {
    var s = {};
    LIB_ALL.forEach(function (d) { if (d.type) s[d.type] = 1; });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
  })();

  function displayTitle(t) { return String(t || '').replace(/_/g, ' '); }
  function fmtSize(kb) { return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB'; }

  /* ---------- 状态 ---------- */
  var state = { q: '', side: 'all', coll: 'all', type: 'all', year: 'all', sort: 'desc', selectedId: null, rows: [] };
  var validSides = { all: 1, EU: 1, CN: 1, INTL: 1 };
  var validColls = { all: 1, '01': 1, '02': 1, '03': 1 };
  var validSorts = { desc: 1, asc: 1, title: 1 };

  /* ---------- DOM ---------- */
  var elQ = document.getElementById('f-q');
  var elSide = document.getElementById('f-side');
  var elColl = document.getElementById('f-coll');
  var elType = document.getElementById('f-type');
  var elYear = document.getElementById('f-year');
  var elSort = document.getElementById('f-sort');
  var elCount = document.getElementById('result-count');
  var elChips = document.getElementById('chip-row');
  var elList = document.getElementById('result-list');
  var elDetail = document.getElementById('detail-pane');
  var elDetailInner = document.getElementById('detail-inner');
  var elBackdrop = document.getElementById('detail-backdrop');

  /* ---------- 控件选项 ---------- */
  function fillSelect(sel, options, current) {
    sel.innerHTML = options.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (o.v === current ? ' selected' : '') + '>' + esc(o.t) + '</option>';
    }).join('');
  }

  fillSelect(elColl, [{ v: 'all', t: '全部专题' }].concat(
    COLL_ORDER.filter(function (c) { return COLL_DEFS[c]; }).map(function (c) {
      return { v: c, t: c + ' ' + COLL_DEFS[c].name + '（' + COLL_DEFS[c].count + '）' };
    })
  ), 'all');
  fillSelect(elType, [{ v: 'all', t: '全部类型' }].concat(TYPES.map(function (t) { return { v: t, t: t }; })), 'all');
  fillSelect(elYear, [{ v: 'all', t: '全部年份' }].concat(YEARS.map(function (y) { return { v: y, t: y + ' 年' }; })), 'all');
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

  /* ---------- URL 参数 ---------- */
  function fromURL() {
    var p = new URLSearchParams(location.search);
    if (p.has('q')) state.q = p.get('q').slice(0, 200);
    if (p.has('side') && validSides[p.get('side')]) state.side = p.get('side');
    if (p.has('coll') && validColls[p.get('coll')]) state.coll = p.get('coll');
    if (p.has('type') && (p.get('type') === 'all' || TYPES.indexOf(p.get('type')) !== -1)) state.type = p.get('type');
    if (p.has('year')) {
      var y = p.get('year');
      if (y === 'all' || YEARS.indexOf(y) !== -1) state.year = y;
    }
    if (p.has('sort') && validSorts[p.get('sort')]) state.sort = p.get('sort');
    if (p.has('id')) {
      var id = p.get('id');
      if (LIB_ALL.some(function (d) { return d.id === id; })) state.selectedId = id;
    }
  }

  function toURL() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.side !== 'all') p.set('side', state.side);
    if (state.coll !== 'all') p.set('coll', state.coll);
    if (state.type !== 'all') p.set('type', state.type);
    if (state.year !== 'all') p.set('year', state.year);
    if (state.sort !== 'desc') p.set('sort', state.sort);
    if (state.selectedId) p.set('id', state.selectedId);
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  /* ---------- 检索 ---------- */
  function haystack(d) {
    var parts = [d.title, d.authors, d.inst, d.cat, d.type, d.collName];
    if (d.tags) parts = parts.concat(d.tags);
    return Site.norm(parts.filter(Boolean).join(' '));
  }
  var HAY = {};
  LIB_ALL.forEach(function (d) { HAY[d.id] = haystack(d); });

  function applyFilters() {
    var q = Site.norm(state.q.trim());
    var rows = LIB_ALL.filter(function (d) {
      if (state.side !== 'all' && d.side !== state.side) return false;
      if (state.coll !== 'all' && d.coll !== state.coll) return false;
      if (state.type !== 'all' && d.type !== state.type) return false;
      if (state.year !== 'all' && String(d.year) !== state.year) return false;
      if (q && HAY[d.id].indexOf(q) === -1) return false;
      return true;
    });
    if (state.sort === 'desc') rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    else if (state.sort === 'asc') rows.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    else rows.sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
    state.rows = rows;

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
    elCount.textContent = '结果 ' + state.rows.length + ' / ' + LIB_ALL.length + ' 条';
  }

  var CHIP_DEFS = [
    { key: 'q', label: function () { return '检索：“' + state.q + '”'; } },
    { key: 'side', label: function () { return '侧别：' + state.side; } },
    { key: 'coll', label: function () { return '专题：' + state.coll + ' ' + (COLL_DEFS[state.coll] ? COLL_DEFS[state.coll].name : ''); } },
    { key: 'type', label: function () { return '类型：' + state.type; } },
    { key: 'year', label: function () { return '年份：' + state.year; } }
  ];

  function renderChips() {
    var html = '';
    CHIP_DEFS.forEach(function (c) {
      var active = state[c.key] !== 'all' && state[c.key] !== '';
      if (active) {
        html += '<span class="filter-chip">' + esc(c.label()) +
          '<button type="button" data-chip="' + esc(c.key) + '" aria-label="清除' + esc(c.key) + '筛选">×</button></span>';
      }
    });
    elChips.innerHTML = html;
  }

  function sideBadge(side) {
    var cls = side === 'EU' ? 'badge-eu' : side === 'CN' ? 'badge-cn' : 'badge-src';
    return '<span class="badge ' + cls + '">' + esc(side) + '</span>';
  }

  function renderList() {
    if (!state.rows.length) {
      elList.innerHTML =
        '<div class="empty-state"><p>没有符合条件的文献记录。</p>' +
        '<button type="button" class="btn" id="btn-clear-all">清除全部筛选</button></div>';
      var c = document.getElementById('btn-clear-all');
      if (c) c.addEventListener('click', resetFilters);
      return;
    }
    elList.innerHTML = state.rows.map(function (d) {
      var sel = d.id === state.selectedId;
      var inst = d.inst || d.cat || '';
      return '<div class="result-row" role="option" id="opt-' + esc(d.id) + '" data-id="' + esc(d.id) + '" aria-selected="' + sel + '" tabindex="' + (sel ? 0 : -1) + '">' +
        '<span class="row-num">' + NUM[d.id] + '</span>' +
        '<span class="row-main">' +
          '<span class="row-meta">' + sideBadge(d.side) +
            '<span class="badge badge-src">' + esc(d.coll) + ' ' + esc(d.collName) + '</span>' +
            '<span class="badge badge-fmt">' + esc(d.fmt.toUpperCase()) + '</span>' +
            '<span class="row-date">' + esc(Site.formatDate(d.date)) + '</span>' +
          '</span>' +
          '<span class="row-title-zh">' + esc(displayTitle(d.title)) + '</span>' +
          (inst ? '<span class="row-title-en">' + esc(inst) + (d.type ? ' · ' + esc(d.type) : '') + '</span>' : '') +
        '</span>' +
      '</div>';
    }).join('');
  }

  function syncControls() {
    elQ.value = state.q;
    Array.prototype.forEach.call(elSide.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.val === state.side ? 'true' : 'false');
    });
    elColl.value = state.coll;
    elType.value = state.type;
    elYear.value = state.year;
    elSort.value = state.sort;
  }

  /* ---------- 详情 ---------- */
  function findItem(id) {
    for (var i = 0; i < LIB_ALL.length; i++) if (LIB_ALL[i].id === id) return LIB_ALL[i];
    return null;
  }

  function detailHTML(d) {
    var fileUrl = Site.fileUrl(d.file);
    var tags = (d.tags || []).map(function (t) {
      return '<button type="button" class="tag-chip" data-search="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('');

    var actions =
      '<button type="button" class="btn" data-act="copylink">' + Site.icon('link') + '<span>复制链接</span></button>' +
      '<button type="button" class="btn" data-act="copycite">' + Site.icon('copy') + '<span>复制文献信息</span></button>' +
      '<button type="button" class="btn" data-act="print">' + Site.icon('print') + '<span>打印摘要</span></button>' +
      '<a class="btn" href="' + esc(fileUrl) + '" target="_blank" rel="noopener">' + Site.icon('external') + '<span>新窗口打开</span></a>';

    return '' +
      '<button type="button" class="icon-btn detail-close" data-act="close" aria-label="关闭详情">' + Site.icon('close') + '</button>' +
      '<div class="detail-top">' + sideBadge(d.side) +
        '<span class="badge badge-src">' + esc(d.coll) + ' · ' + esc(d.collName) + '</span>' +
        '<span class="badge badge-fmt">' + esc(d.fmt.toUpperCase()) + ' · ' + esc(fmtSize(d.sizeKB)) + '</span>' +
        '<span class="row-date">' + esc(Site.formatDate(d.date)) + '</span>' +
        '<span class="row-date">№ ' + NUM[d.id] + '</span>' +
      '</div>' +
      '<h2 class="detail-title-zh">' + esc(displayTitle(d.title)) + '</h2>' +
      '<p class="detail-title-en" style="font-style:normal;font-family:var(--mono);font-size:12px">' + esc(d.title) + '</p>' +
      '<div class="detail-actions">' + actions + '</div>' +
      '<div class="tablist" role="tablist" aria-label="文献内容">' +
        '<button type="button" role="tab" id="tab-summary" aria-controls="panel-summary" aria-selected="true">文献信息</button>' +
        '<button type="button" role="tab" id="tab-original" aria-controls="panel-original" aria-selected="false" tabindex="-1">原始文献</button>' +
      '</div>' +
      '<div role="tabpanel" id="panel-summary" aria-labelledby="tab-summary" tabindex="0">' +
        '<dl class="detail-meta-grid">' +
          '<div class="detail-meta-cell"><dt>专题</dt><dd>' + esc(d.coll) + ' ' + esc(d.collName) + '</dd></div>' +
          '<div class="detail-meta-cell"><dt>侧别</dt><dd>' + esc(d.side) + '</dd></div>' +
          '<div class="detail-meta-cell"><dt>日期</dt><dd>' + esc(Site.formatDate(d.date)) + '</dd></div>' +
          '<div class="detail-meta-cell"><dt>类型</dt><dd>' + esc(d.type || '—') + '</dd></div>' +
          '<div class="detail-meta-cell"><dt>格式 / 大小</dt><dd>' + esc(d.fmt.toUpperCase()) + ' · ' + esc(fmtSize(d.sizeKB)) + '</dd></div>' +
          (d.authors ? '<div class="detail-meta-cell"><dt>作者</dt><dd>' + esc(d.authors) + '</dd></div>' : '') +
          (d.inst ? '<div class="detail-meta-cell"><dt>机构 / 来源</dt><dd>' + esc(d.inst) + '</dd></div>' : '') +
          (d.cat ? '<div class="detail-meta-cell"><dt>类目</dt><dd>' + esc(d.cat) + '</dd></div>' : '') +
        '</dl>' +
        (tags ? '<div class="detail-section"><div class="detail-tags-block"><div class="detail-tags-row"><span class="detail-tags-label">标签</span>' + tags + '</div></div></div>' : '') +
      '</div>' +
      '<div role="tabpanel" id="panel-original" aria-labelledby="tab-original" tabindex="0" hidden>' +
        '<div class="original-frame-wrap" id="original-mount">' +
          '<div class="original-frame-bar"><span>' + esc(d.file) + '</span>' +
          '<a class="btn btn-ghost" href="' + esc(fileUrl) + '" target="_blank" rel="noopener">' + Site.icon('external') + '<span>新窗口打开</span></a></div>' +
        '</div>' +
      '</div>';
  }

  var originalLoaded = false;
  var currentItem = null;
  var tabRefs = null;

  function initTabs(d) {
    tabRefs = {
      d: d,
      tabSummary: elDetailInner.querySelector('#tab-summary'),
      tabOriginal: elDetailInner.querySelector('#tab-original'),
      panelSummary: elDetailInner.querySelector('#panel-summary'),
      panelOriginal: elDetailInner.querySelector('#panel-original')
    };
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
        f.src = Site.fileUrl(tabRefs.d.file);
        f.title = '原始文献：' + displayTitle(tabRefs.d.title);
        mount.appendChild(f);
        originalLoaded = true;
      }
    }
  }

  function selectItem(id, focusRow) {
    var d = findItem(id);
    if (!d) return;
    state.selectedId = id;
    currentItem = d;
    originalLoaded = false;
    elDetailInner.innerHTML = detailHTML(d);
    initTabs(d);
    renderList();
    toURL();
    elDetail.scrollTop = 0;

    var mobile = window.matchMedia('(max-width: 900px)').matches;
    if (mobile) {
      elDetail.classList.add('open');
      elBackdrop.hidden = false;
      requestAnimationFrame(function () { elBackdrop.classList.add('show'); });
      document.body.classList.add('detail-open');
      var c = elDetail.querySelector('.detail-close');
      if (c) c.focus();
    }
    if (focusRow) {
      var row = elList.querySelector('[data-id="' + CSS.escape(id) + '"]');
      if (row) row.focus();
    }
  }

  function closeDetail(skipURL) {
    state.selectedId = null;
    currentItem = null;
    elDetail.classList.remove('open');
    elBackdrop.classList.remove('show');
    document.body.classList.remove('detail-open');
    setTimeout(function () { elBackdrop.hidden = true; }, 240);
    elDetailInner.innerHTML = placeholderHTML();
    if (!skipURL) {
      renderList();
      toURL();
      elList.focus();
    }
  }

  function placeholderHTML() {
    return '<div class="empty-state" style="padding-top:96px"><p style="font-family:var(--serif);font-size:19px;font-weight:700;color:var(--muted)">选择左侧文献开始阅读</p>' +
      '<p style="font-size:13px">点击列表中的任意文献，查看专题信息与原始文献。</p>' +
      '<div class="detail-quick-links" aria-label="快捷检索">' +
        '<button type="button" class="tag-chip" data-search="中欧关系">中欧关系</button>' +
        '<button type="button" class="tag-chip" data-search="贸易协定">贸易协定</button>' +
        '<button type="button" class="tag-chip" data-search="航天法">航天法</button>' +
      '</div></div>';
  }

  elDetailInner.addEventListener('click', function (ev) {
    var chip = ev.target.closest('[data-search]');
    if (chip) {
      state.q = chip.dataset.search;
      closeDetail(true);
      applyFilters();
      elQ.focus();
      return;
    }
    if (!currentItem) return;
    var d = currentItem;
    var act = ev.target.closest('[data-act]');
    if (act) {
      var a = act.dataset.act;
      if (a === 'copylink') {
        var link = location.pathname + '?id=' + encodeURIComponent(d.id);
        Site.copyText(location.origin === 'null' ? link : location.origin + link, '记录链接已复制');
      } else if (a === 'copycite') {
        var cite = d.title + '. ' + (d.inst ? d.inst + '. ' : '') + d.collName + '专题, ' + (d.type || '文献') +
          (d.date ? ', ' + d.date : '') + '. ' + d.file;
        Site.copyText(cite, '文献信息已复制');
      } else if (a === 'print') window.print();
      else if (a === 'close') closeDetail();
    }
  });

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
  elColl.addEventListener('change', function () { state.coll = elColl.value; applyFilters(); });
  elType.addEventListener('change', function () { state.type = elType.value; applyFilters(); });
  elYear.addEventListener('change', function () { state.year = elYear.value; applyFilters(); });
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
    state.q = ''; state.side = 'all'; state.coll = 'all'; state.type = 'all'; state.year = 'all'; state.sort = 'desc';
    applyFilters();
  }
  btnReset.addEventListener('click', resetFilters);

  /* ---------- CSV 导出（字段用原始标题，不改源数据） ---------- */
  btnCsv.addEventListener('click', function () {
    if (!state.rows.length) { Site.toast('当前没有可导出的记录'); return; }
    var headers = ['ID', '侧别', '日期', '标题（原始）', '专题编号', '专题名称', '类目', '类型', '机构', '标签', '格式', '大小KB', '文件路径', '源路径'];
    var rows = state.rows.map(function (d) {
      return [d.id, d.side, d.date, d.title, d.coll, d.collName, d.cat || '', d.type || '', d.inst || '',
        (d.tags || []).join('；'), d.fmt, String(d.sizeKB), d.file, d.src || ''];
    });
    Site.downloadCSV('cea-library-' + Site.todayStamp() + '.csv', headers, rows);
    Site.toast('已导出 ' + rows.length + ' 条记录');
  });

  /* ---------- 列表交互 ---------- */
  elList.addEventListener('click', function (ev) {
    var row = ev.target.closest('[data-id]');
    if (row) selectItem(row.dataset.id, true);
  });

  elList.addEventListener('keydown', function (ev) {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    var ids = state.rows.map(function (r) { return r.id; });
    if (!ids.length) return;
    var idx = state.selectedId ? ids.indexOf(state.selectedId) : -1;
    if (ev.key === 'ArrowDown') idx = Math.min(ids.length - 1, idx + 1);
    else idx = Math.max(0, idx === -1 ? 0 : idx - 1);
    selectItem(ids[idx], true);
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
    } else if (ev.key === 'Escape' && state.selectedId) {
      closeDetail();
    }
  });

  elBackdrop.addEventListener('click', function () { if (state.selectedId) closeDetail(); });

  /* ---------- 启动 ---------- */
  Site.initHeader('library');
  Site.initFooter({
    stats: '文献 ' + LIB_ALL.length + ' 条（' +
      COLL_ORDER.filter(function (c) { return COLL_DEFS[c]; }).map(function (c) {
        return COLL_DEFS[c].name + ' ' + COLL_DEFS[c].count;
      }).join(' / ') + '）',
    latestYear: LIB_ALL.reduce(function (a, b) { return String(a.date) > String(b.date) ? a : b; }).date
  });

  fromURL();
  syncControls();
  elDetailInner.innerHTML = placeholderHTML();
  applyFilters();
  if (state.selectedId) selectItem(state.selectedId, false);
})();
