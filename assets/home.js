/* ==========================================================================
   首页 — 档案规模优先，所有数字/年份/图表运行时从 DATA、LIB 计算
   ========================================================================== */
(function () {
  'use strict';

  var esc = Site.escapeHTML;
  var DATA_ALL = (typeof DATA !== 'undefined') ? DATA : [];
  if (typeof LEGAL !== 'undefined') DATA_ALL = DATA_ALL.concat(LEGAL);
  var LIB_ALL = (typeof LIB !== 'undefined') ? LIB : [];
  if (typeof ERA !== 'undefined') LIB_ALL = LIB_ALL.concat(ERA);
  if (typeof LONGTERM !== 'undefined') LIB_ALL = LIB_ALL.concat(LONGTERM);

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

  var COLL_ORDER = ['01', '02', '03', '04', '05', '06'];
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
    { num: latest.date.slice(5).replace('-', '.'), lbl: '最近收录 ' + latest.date.slice(0, 4), cls: '' }
  ];
  document.getElementById('index-stats').innerHTML = indexStats.map(function (s) {
    return '<div class="index-stat"><div class="num ' + s.cls + '">' + esc(String(s.num)) + '</div><div class="lbl">' + esc(s.lbl) + '</div></div>';
  }).join('');

  var euSeries = YEARS.map(function (y) { return yearCount(y, 'EU'); });
  var cnSeries = YEARS.map(function (y) { return yearCount(y, 'CN'); });

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
