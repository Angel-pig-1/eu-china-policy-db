/* ==========================================================================
   文献库 — 复用政策库主从工作台，替换检索语义
   状态：{ q, side:all|EU|CN|INTL, coll:all|01–07, year, sort, selectedId, rows }
   ========================================================================== */
(function () {
  'use strict';

  var esc = Site.escapeHTML;
  var LIB_ALL = (typeof LIB !== 'undefined') ? LIB : [];
  if (typeof ERA !== 'undefined') LIB_ALL = LIB_ALL.concat(ERA);
  if (typeof LONGTERM !== 'undefined') LIB_ALL = LIB_ALL.concat(LONGTERM);
  if (typeof LEAD !== 'undefined') LIB_ALL = LIB_ALL.concat(LEAD);

  /* ---------- 派生数据（全部运行时计算） ---------- */
  var NUM = {};
  LIB_ALL.forEach(function (d, i) { NUM[d.id] = String(i + 1).padStart(3, '0'); });

  var COLL_ORDER = ['01', '02', '03', '04', '05', '06', '07'];
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
  var CATS = (function () {
    var s = {};
    LIB_ALL.forEach(function (d) { if (d.cat) s[d.cat] = 1; });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
  })();

  function displayTitle(t, d) {
    var s = String(t || '')
      .replace(/\.(?:pdf|html?|docx?|pptx?|xlsx?)$/i, '')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Za-z])(\d{4})/g, '$1 $2')
      .replace(/(\d{4})(?=[A-Z][a-z])/g, '$1 ')
      .replace(/\s+/g, ' ')
      .replace(/\s+([)\].,;:])/g, '$1')
      .trim();
    if (!s) return '未命名文献';
    if (/^(?:INDEX|文件清单|文献清单|可视化报告)$/i.test(s) && d) {
      var label = s.toUpperCase() === 'INDEX' ? '文献索引' : s;
      var scope = d.cat || d.collName || '当前专题';
      if (d.file) {
        var parts = String(d.file).split('/');
        var parent = parts.length > 1 ? parts[parts.length - 2].replace(/^\d+_/, '') : '';
        if (parent && parent !== 'library') scope = parent;
      }
      return scope + ' · ' + label;
    }
    if (d && TITLE_COUNTS[s.toLowerCase()] > 1 && d.year && s.indexOf(String(d.year)) === -1) {
      s += '（' + d.year + '）';
    }
    return s;
  }
  var TITLE_COUNTS = {};
  LIB_ALL.forEach(function (d) {
    var key = displayTitle(d.title).toLowerCase();
    TITLE_COUNTS[key] = (TITLE_COUNTS[key] || 0) + 1;
  });
  function fmtSize(kb) { return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB'; }

  /* ---------- 状态 ---------- */
  var state = { q: '', side: 'all', coll: 'all', cat: 'all', type: 'all', year: 'all', sort: 'topic', selectedId: null, rows: [] };
  var validSides = { all: 1, EU: 1, CN: 1, INTL: 1 };
  var validColls = { all: 1, '01': 1, '02': 1, '03': 1, '04': 1, '05': 1, '06': 1, '07': 1 };
  var validSorts = { topic: 1, desc: 1, asc: 1, title: 1 };

  /* ---------- DOM ---------- */
  var elQ = document.getElementById('f-q');
  var elSide = document.getElementById('f-side');
  var elColl = document.getElementById('f-coll');
  var elCat = document.getElementById('f-cat');
  var elType = document.getElementById('f-type');
  var elYear = document.getElementById('f-year');
  var elSort = document.getElementById('f-sort');
  var elCount = document.getElementById('result-count');
  var elChips = document.getElementById('chip-row');
  var elList = document.getElementById('result-list');
  var elDetail = document.getElementById('detail-pane');
  var elDetailInner = document.getElementById('detail-inner');
  var mobileQuery = window.matchMedia('(max-width: 900px)');

  /* ---------- 控件选项 ---------- */
  function fillSelect(sel, options, current) {
    sel.innerHTML = options.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (o.v === current ? ' selected' : '') + '>' + esc(o.t) + '</option>';
    }).join('');
  }

  function fillCats() {
    var s = {};
    LIB_ALL.forEach(function (d) {
      if (d.cat && (state.coll === 'all' || d.coll === state.coll)) s[d.cat] = 1;
    });
    var cats = Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
    fillSelect(elCat, [{ v: 'all', t: '全部分类' }].concat(cats.map(function (c) { return { v: c, t: c }; })), state.cat);
  }

  fillSelect(elColl, [{ v: 'all', t: '全部专题' }].concat(
    COLL_ORDER.filter(function (c) { return COLL_DEFS[c]; }).map(function (c) {
      return { v: c, t: c + ' ' + COLL_DEFS[c].name + '（' + COLL_DEFS[c].count + '）' };
    })
  ), 'all');
  fillSelect(elType, [{ v: 'all', t: '全部类型' }].concat(TYPES.map(function (t) { return { v: t, t: t }; })), 'all');
  fillCats();
  fillSelect(elYear, [{ v: 'all', t: '全部年份' }].concat(YEARS.map(function (y) { return { v: y, t: y + ' 年' }; })), 'all');
  fillSelect(elSort, [
    { v: 'topic', t: '主题分类' },
    { v: 'desc', t: '日期 ↓ 新→旧' },
    { v: 'asc', t: '日期 ↑ 旧→新' },
    { v: 'title', t: '标题字母' }
  ], 'topic');

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
    if (p.has('cat') && (p.get('cat') === 'all' || CATS.indexOf(p.get('cat')) !== -1)) state.cat = p.get('cat');
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

  function toURL(push) {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.side !== 'all') p.set('side', state.side);
    if (state.coll !== 'all') p.set('coll', state.coll);
    if (state.cat !== 'all') p.set('cat', state.cat);
    if (state.type !== 'all') p.set('type', state.type);
    if (state.year !== 'all') p.set('year', state.year);
    if (state.sort !== 'topic') p.set('sort', state.sort);
    if (state.selectedId) p.set('id', state.selectedId);
    var qs = p.toString();
    var url = location.pathname + (qs ? '?' + qs : '');
    if (push) history.pushState({ icesDetail: true }, '', url);
    else history.replaceState(history.state, '', url);
  }

  /* ---------- 检索 ---------- */
  function haystack(d) {
    var parts = [d.title, d.originalTitle, d.authors, d.inst, d.side, d.cat, d.type, d.collName];
    if (d.tags) parts = parts.concat(d.tags);
    return Site.norm(parts.filter(Boolean).join(' '));
  }
  var HAY = {};
  LIB_ALL.forEach(function (d) { HAY[d.id] = haystack(d); });

  function applyFilters() {
    var q = Site.norm(state.q.trim());
    var scores = {};
    var rows = LIB_ALL.filter(function (d) {
      if (state.side !== 'all' && d.side !== state.side) return false;
      if (state.coll !== 'all' && d.coll !== state.coll) return false;
      if (state.cat !== 'all' && d.cat !== state.cat) return false;
      if (state.type !== 'all' && d.type !== state.type) return false;
      if (state.year !== 'all' && String(d.year) !== state.year) return false;
      if (q) {
        scores[d.id] = SemanticSearch.score(HAY[d.id], d.title, q);
        if (scores[d.id] < 0) return false;
      }
      return true;
    });
    if (q && !rows.length) {
      rows = LIB_ALL.filter(function (d) {
        if (state.side !== 'all' && d.side !== state.side) return false;
        if (state.coll !== 'all' && d.coll !== state.coll) return false;
        if (state.cat !== 'all' && d.cat !== state.cat) return false;
        if (state.type !== 'all' && d.type !== state.type) return false;
        if (state.year !== 'all' && String(d.year) !== state.year) return false;
        scores[d.id] = SemanticSearch.score(HAY[d.id], d.title, q, true);
        return scores[d.id] >= 0;
      });
    }
    if (q) rows.sort(function (a, b) { return scores[b.id] - scores[a.id]; });
    else if (state.sort === 'topic') rows.sort(function (a, b) {
      return String(a.coll).localeCompare(String(b.coll)) || String(a.cat || '').localeCompare(String(b.cat || ''), 'zh-CN') || String(a.title).localeCompare(String(b.title));
    });
    else if (state.sort === 'desc') rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
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
    { key: 'cat', label: function () { return '分类：' + state.cat; } },
    { key: 'type', label: function () { return '类型：' + state.type; } },
    { key: 'year', label: function () { return '年份：' + state.year; } }
  ];

  function renderChips() {
    var html = '';
    CHIP_DEFS.forEach(function (c) {
      var active = state[c.key] !== 'all' && state[c.key] !== '';
      if (active) {
        var label = c.label();
        html += '<button type="button" class="filter-chip" data-chip="' + esc(c.key) + '" aria-label="清除筛选：' + esc(label) + '">' +
          '<span class="filter-chip-label">' + esc(label) + '</span></button>';
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
        '<li class="empty-state"><p>没有符合条件的文献记录。</p>' +
        '<button type="button" class="btn" id="btn-clear-all">清除全部筛选</button></li>';
      var c = document.getElementById('btn-clear-all');
      if (c) c.addEventListener('click', resetFilters);
      return;
    }
    elList.innerHTML = state.rows.map(function (d) {
      var sel = d.id === state.selectedId;
      var inst = d.inst || d.cat || '';
      return '<li><a class="result-row' + (sel ? ' selected' : '') + '" id="opt-' + esc(d.id) + '" data-id="' + esc(d.id) + '" href="?id=' + encodeURIComponent(d.id) + '"' + (sel ? ' aria-current="true"' : '') + '>' +
        '<span class="row-num">' + NUM[d.id] + '</span>' +
        '<span class="row-main">' +
          '<span class="row-meta">' + sideBadge(d.side) +
            '<span class="badge badge-src">' + esc(d.coll) + ' ' + esc(d.collName) + '</span>' +
            '<span class="badge badge-fmt">' + esc(d.fmt.toUpperCase()) + '</span>' +
            '<span class="row-date">' + esc(Site.formatDate(d.date)) + '</span>' +
          '</span>' +
          '<span class="row-title-zh">' + esc(displayTitle(d.title, d)) + '</span>' +
          (inst ? '<span class="row-title-en">' + esc(inst) + (d.type ? ' · ' + esc(d.type) : '') + '</span>' : '') +
        '</span>' +
      '</a></li>';
    }).join('');
  }

  function syncControls() {
    elQ.value = state.q;
    Array.prototype.forEach.call(elSide.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.val === state.side ? 'true' : 'false');
    });
    elColl.value = state.coll;
    elCat.value = state.cat;
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
    var fileUrl = d.external ? (d.hosted ? d.file : (d.url || d.file || d.src)) : Site.fileUrl(d.file);
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
        '<span class="badge badge-fmt">' + (d.external && !d.hosted ? '在线资源' : esc(d.fmt.toUpperCase()) + ' · ' + esc(fmtSize(d.sizeKB))) + '</span>' +
        '<span class="row-date">' + esc(Site.formatDate(d.date)) + '</span>' +
        '<span class="row-date">№ ' + NUM[d.id] + '</span>' +
      '</div>' +
      '<h2 class="detail-title-zh" id="detail-title">' + esc(displayTitle(d.title, d)) + '</h2>' +
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
          '<div class="detail-meta-cell"><dt>格式 / 大小</dt><dd>' + (d.external && !d.hosted ? '在线资源' : esc(d.fmt.toUpperCase()) + ' · ' + esc(fmtSize(d.sizeKB))) + '</dd></div>' +
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
        var item = tabRefs.d;
        if (item.external && !item.hosted) {
          var online = document.createElement('div');
          online.className = 'original-missing';
          var onlineLink = item.url || item.file || item.src;
          online.innerHTML = '<p>该资源由原网站在线提供，本站未托管。</p><a class="btn" href="' + esc(onlineLink) + '" target="_blank" rel="noopener">打开原网站</a>';
          mount.appendChild(online);
        } else if (item.hosted && String(item.fmt).toLowerCase() !== 'pdf') {
          var attachment = document.createElement('div');
          attachment.className = 'original-missing';
          attachment.innerHTML = '<p>已托管附件，需下载后打开。</p><a class="btn" href="' + esc(item.file) + '" target="_blank" rel="noopener">下载附件</a>';
          mount.appendChild(attachment);
        } else if (item.external && String(item.fmt).toLowerCase() === 'pdf') {
          var fallback = document.createElement('div');
          fallback.className = 'original-missing';
          fallback.innerHTML = '<p>原文 PDF 已收录。若站内预览尚未启用，可直接打开或下载完整附件。</p><a class="btn" href="' + esc(item.file) + '" target="_blank" rel="noopener">打开 / 下载 PDF</a>';
          mount.appendChild(fallback);
          var releasePrefix = 'https://github.com/Angel-pig-1/eu-china-policy-db/releases/download/';
          if (item.file.indexOf(releasePrefix) === 0) {
            var proxyUrl = new URL('/pdf-proxy/' + item.file.slice(releasePrefix.length), location.href).href;
            fetch(proxyUrl, { method: 'HEAD' }).then(function (response) {
              if (!response.ok || !response.headers.get('Content-Type').includes('application/pdf')) return;
              var viewer = new URL('assets/pdfjs/web/viewer.html', location.href);
              viewer.searchParams.set('file', proxyUrl);
              var hostedFrame = document.createElement('iframe');
              hostedFrame.loading = 'lazy';
              hostedFrame.src = viewer.href;
              hostedFrame.title = '原始文献：' + displayTitle(item.title, item);
              fallback.replaceWith(hostedFrame);
            }).catch(function () {});
          }
        } else {
          var f = document.createElement('iframe');
          f.loading = 'lazy';
          var fileUrl = Site.fileUrl(item.file);
          if (String(item.fmt).toLowerCase() === 'pdf') {
            var viewer = new URL('assets/pdfjs/web/viewer.html', location.href);
            viewer.searchParams.set('file', new URL(fileUrl, location.href).href);
            f.src = viewer.href;
          } else {
            f.src = fileUrl;
          }
          f.title = '原始文献：' + displayTitle(item.title, item);
          mount.appendChild(f);
        }
        originalLoaded = true;
      }
    }
  }

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
    currentItem = d;
    originalLoaded = false;
    elDetailInner.innerHTML = detailHTML(d);
    initTabs(d);
    renderList();
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
    if (!skipURL) {
      renderList();
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

  mobileQuery.addEventListener('change', syncDetailMode);
  Site.enableSwipeDismiss(elDetail, { axis: 'y', onDismiss: requestCloseDetail });

  function placeholderHTML() {
    return '<div class="empty-state" style="padding-top:96px"><p id="detail-title" style="font-family:var(--serif);font-size:19px;font-weight:700;color:var(--muted)">选择左侧文献开始阅读</p>' +
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
      else if (a === 'close') requestCloseDetail();
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
  elColl.addEventListener('change', function () {
    state.coll = elColl.value;
    state.cat = 'all';
    fillCats();
    applyFilters();
  });
  elCat.addEventListener('change', function () { state.cat = elCat.value; applyFilters(); });
  elType.addEventListener('change', function () { state.type = elType.value; applyFilters(); });
  elYear.addEventListener('change', function () { state.year = elYear.value; applyFilters(); });
  elSort.addEventListener('change', function () { state.sort = elSort.value; applyFilters(); });

  elChips.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-chip]');
    if (!b) return;
    var k = b.dataset.chip;
    if (k === 'q') { state.q = ''; elQ.value = ''; }
    else state[k] = 'all';
    if (k === 'coll') fillCats();
    applyFilters();
  });

  function resetFilters() {
    state.q = ''; state.side = 'all'; state.coll = 'all'; state.cat = 'all'; state.type = 'all'; state.year = 'all'; state.sort = 'topic';
    fillCats();
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
    state.q = ''; state.side = 'all'; state.coll = 'all'; state.cat = 'all'; state.type = 'all'; state.year = 'all'; state.sort = 'topic';
    state.selectedId = null; state.rows = [];
    fromURL();
    fillCats();
    syncControls();
    applyFilters();
    if (state.selectedId) selectItem(state.selectedId, false);
  });

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
  fillCats();
  syncControls();
  elDetailInner.innerHTML = placeholderHTML();
  applyFilters();
  if (state.selectedId) selectItem(state.selectedId, false);
  else syncDetailMode();
})();
