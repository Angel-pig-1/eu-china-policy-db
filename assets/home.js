/* ==========================================================================
   首页 — 档案规模优先，所有数字/年份/图表运行时从 DATA、LIB 计算
   ========================================================================== */
(function () {
  'use strict';

  var esc = Site.escapeHTML;
  var DATA_ALL = (typeof DATA !== 'undefined') ? DATA : [];
  var LIB_ALL = (typeof LIB !== 'undefined') ? LIB : [];

  /* ---------- 派生统计 ---------- */
  function sideCount(side) { return DATA_ALL.filter(function (d) { return d.side === side; }).length; }
  var nEU = sideCount('EU');
  var nCN = sideCount('CN');
  var nPol = DATA_ALL.length;
  var nLib = LIB_ALL.length;

  var YEARS = (function () {
    var s = {};
    DATA_ALL.forEach(function (d) { s[d.date.slice(0, 4)] = 1; });
    return Object.keys(s).sort();
  })();
  var minYear = YEARS[0], maxYear = YEARS[YEARS.length - 1];
  var latest = DATA_ALL.reduce(function (a, b) { return a.date > b.date ? a : b; });

  function yearCount(y, side) {
    return DATA_ALL.filter(function (d) { return d.date.slice(0, 4) === y && d.side === side; }).length;
  }

  var COLL_ORDER = ['01', '02', '03'];
  var COLL_DEFS = {};
  LIB_ALL.forEach(function (d) {
    if (!COLL_DEFS[d.coll]) COLL_DEFS[d.coll] = { no: d.coll, name: d.collName, count: 0 };
    COLL_DEFS[d.coll].count++;
  });

  /* ---------- 页头页脚 ---------- */
  Site.initHeader('home');
  Site.initFooter({
    stats: '政策 ' + nPol + ' 条（EU ' + nEU + ' / CN ' + nCN + '）· 文献 ' + nLib + ' 条',
    latestYear: latest.date
  });

  document.getElementById('hero-search-icon').innerHTML = Site.icon('search');

  /* ---------- 首屏右栏：档案索引 ---------- */
  var indexStats = [
    { num: nPol + nLib, lbl: '档案总条目', cls: '' },
    { num: nPol, lbl: '政策记录', cls: '' },
    { num: nLib, lbl: '文献条目', cls: '' },
    { num: nEU, lbl: 'EU 政策', cls: 'eu' },
    { num: nCN, lbl: 'CN 政策', cls: 'cn' },
    { num: YEARS.length, lbl: '覆盖年份 ' + minYear + '—' + maxYear, cls: '' },
    { num: maxYear, lbl: '最新收录年份', cls: '' },
    { num: latest.date.slice(5).replace('-', '.'), lbl: '最近收录 ' + latest.date.slice(0, 4), cls: '' }
  ];
  document.getElementById('index-stats').innerHTML = indexStats.map(function (s) {
    return '<div class="index-stat"><div class="num ' + s.cls + '">' + esc(String(s.num)) + '</div><div class="lbl">' + esc(s.lbl) + '</div></div>';
  }).join('');

  /* ---------- EU/CN 双折线（内联 SVG，无图表库） ---------- */
  function lineChart(years, eu, cn) {
    var W = 560, H = 210, PL = 34, PR = 12, PT = 14, PB = 30;
    var maxV = Math.max(1, Math.max.apply(null, eu.concat(cn)));
    function x(i) { return PL + (years.length === 1 ? 0 : i * (W - PL - PR) / (years.length - 1)); }
    function y(v) { return PT + (1 - v / maxV) * (H - PT - PB); }
    function path(vals) {
      return vals.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    }
    var grid = '';
    var steps = Math.min(4, maxV);
    for (var g = 0; g <= steps; g++) {
      var gv = Math.round(maxV * g / steps);
      var gy = y(gv);
      grid += '<line x1="' + PL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + gy.toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>' +
        '<text x="' + (PL - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end" font-size="9" fill="var(--faint)" font-family="var(--mono)">' + gv + '</text>';
    }
    var ticks = '';
    years.forEach(function (yr, i) {
      if (years.length <= 8 || i % 2 === 0) {
        ticks += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" fill="var(--faint)" font-family="var(--mono)">' + esc(yr.slice(2)) + '</text>';
      }
    });
    var euPts = '', cnPts = '';
    eu.forEach(function (v, i) { euPts += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="2.2" fill="var(--eu)"/>'; });
    cn.forEach(function (v, i) { if (v > 0) cnPts += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="2.2" fill="var(--cn)"/>'; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="EU 与 CN 年度收录折线图" style="width:100%;height:auto">' +
      grid + ticks +
      '<path d="' + path(cn) + '" fill="none" stroke="var(--cn)" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="' + path(eu) + '" fill="none" stroke="var(--eu)" stroke-width="2" stroke-linejoin="round"/>' +
      euPts + cnPts + '</svg>';
  }

  var euSeries = YEARS.map(function (y) { return yearCount(y, 'EU'); });
  var cnSeries = YEARS.map(function (y) { return yearCount(y, 'CN'); });
  document.getElementById('hero-chart').innerHTML = lineChart(YEARS, euSeries, cnSeries);

  /* 滚动轻微位移（≤18px），prefers-reduced-motion 关闭 */
  if (!Site.reduceMotion) {
    var chartEl = document.getElementById('hero-chart');
    var ticking = false;
    function parallax() {
      ticking = false;
      var r = chartEl.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      var delta = (vh * 0.5 - (r.top + r.height * 0.5)) * 0.05;
      delta = Math.max(-18, Math.min(18, delta));
      chartEl.style.transform = 'translateY(' + delta.toFixed(1) + 'px)';
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(parallax); }
    }, { passive: true });
    parallax();
  }

  /* ---------- 指标带 ---------- */
  var band = [
    { num: nPol, lbl: '政策记录' },
    { num: nLib, lbl: '文献条目' },
    { num: YEARS.length, lbl: '覆盖年份（' + minYear + '—' + maxYear + '）' },
    { num: maxYear, lbl: '最新收录年份' }
  ];
  document.getElementById('metric-band').innerHTML = band.map(function (s) {
    return '<div class="metric-cell"><div class="num">' + esc(String(s.num)) + '</div><div class="lbl">' + esc(s.lbl) + '</div></div>';
  }).join('');

  /* ---------- 年度图表（柱，点击进筛选） ---------- */
  var maxCount = Math.max(1, Math.max.apply(null, euSeries.concat(cnSeries)));
  document.getElementById('yearly-chart').innerHTML = YEARS.map(function (y, i) {
    var e = euSeries[i], c = cnSeries[i];
    return '<div class="yearly-row">' +
      '<a class="y-label" href="policies.html?year=' + esc(y) + '">' + esc(y) + '</a>' +
      '<div class="yearly-bars">' +
        '<a class="yearly-bar-link" href="policies.html?year=' + esc(y) + '&side=EU" aria-label="' + esc(y) + ' 年 EU 政策 ' + e + ' 条">' +
          '<div class="yearly-bar" style="--w:' + (e / maxCount * 100).toFixed(1) + '%"></div></a>' +
        '<a class="yearly-bar-link" href="policies.html?year=' + esc(y) + '&side=CN" aria-label="' + esc(y) + ' 年 CN 政策 ' + c + ' 条">' +
          '<div class="yearly-bar cn" style="--w:' + (c / maxCount * 100).toFixed(1) + '%"></div></a>' +
      '</div></div>';
  }).join('');

  /* ---------- 最新政策（前 5） ---------- */
  var latest5 = DATA_ALL.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 5);
  document.getElementById('latest-list').innerHTML = latest5.map(function (d) {
    return '<a class="latest-item" href="policies.html?id=' + encodeURIComponent(d.id) + '">' +
      '<span class="li-date">' + esc(Site.formatDate(d.date)) + '</span>' +
      '<span class="row-badge-slot">' +
        '<span class="badge badge-' + d.side.toLowerCase() + '">' + d.side + '</span>' +
      '</span>' +
      '<span><span class="li-title">' + esc(d.nameZh || d.name) + '</span>' +
      '<span class="li-sub">' + esc(d.name) + '</span></span>' +
    '</a>';
  }).join('');

  /* ---------- 文献专题 ---------- */
  document.getElementById('coll-grid').innerHTML = COLL_ORDER.filter(function (c) { return COLL_DEFS[c]; }).map(function (c) {
    var def = COLL_DEFS[c];
    return '<a class="coll-cell" href="library.html?coll=' + esc(c) + '">' +
      '<span class="coll-no">COLL. ' + esc(c) + '</span>' +
      '<h3>' + esc(def.name) + '</h3>' +
      '<span class="coll-count">' + def.count + ' 条文献</span>' +
      '<span class="coll-arrow">进入专题 →</span>' +
    '</a>';
  }).join('');
})();
