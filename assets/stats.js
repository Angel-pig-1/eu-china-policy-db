/* ==========================================================================
   数据总览 — 每张图都必须能继续研究（链接到 policies.html 对应筛选）
   ========================================================================== */
(function () {
  'use strict';

  var esc = Site.escapeHTML;
  var DATA_ALL = (typeof DATA !== 'undefined') ? DATA : [];
  var LIB_ALL = (typeof LIB !== 'undefined') ? LIB : [];

  /* ---------- 基础统计 ---------- */
  function sideCount(side) { return DATA_ALL.filter(function (d) { return d.side === side; }).length; }
  var nEU = sideCount('EU');
  var nCN = sideCount('CN');
  var nPol = DATA_ALL.length;
  var nLib = LIB_ALL.length;
  var latest = DATA_ALL.reduce(function (a, b) { return a.date > b.date ? a : b; });

  var YEARS = (function () {
    var s = {};
    DATA_ALL.forEach(function (d) { s[d.date.slice(0, 4)] = 1; });
    return Object.keys(s).sort();
  })();

  function yearCount(y, side) {
    return DATA_ALL.filter(function (d) { return d.date.slice(0, 4) === y && d.side === side; }).length;
  }

  /* ---------- 排行统计：先 trim，次数降序，同次数按名称排序（稳定） ---------- */
  function topN(items, n) {
    var map = {};
    items.forEach(function (raw) {
      var k = String(raw == null ? '' : raw).trim();
      if (!k) return;
      map[k] = (map[k] || 0) + 1;
    });
    return Object.keys(map).map(function (k) { return { name: k, count: map[k] }; })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      })
      .slice(0, n);
  }

  var framingAll = [];
  DATA_ALL.forEach(function (d) { (d.framings || []).forEach(function (f) { framingAll.push(f); }); });
  var industryAll = [];
  DATA_ALL.forEach(function (d) { (d.industries || []).forEach(function (f) { industryAll.push(f); }); });

  var topFramings = topN(framingAll, 8);
  var topIndustries = topN(industryAll, 12);

  /* ---------- 页头页脚 ---------- */
  Site.initHeader('stats');
  Site.initFooter({
    stats: '政策 ' + nPol + ' 条（EU ' + nEU + ' / CN ' + nCN + '）· 文献 ' + nLib + ' 条',
    latestYear: latest.date
  });

  /* ---------- 指标 ---------- */
  document.getElementById('stats-asof').textContent = '数据截至 ' + latest.date;
  document.getElementById('stats-grid').innerHTML = [
    { num: nPol, lbl: '政策总数' },
    { num: nEU, lbl: 'EU 政策' },
    { num: nCN, lbl: 'CN 政策' },
    { num: nLib, lbl: '文献条目' }
  ].map(function (s) {
    return '<div class="metric-cell"><div class="num">' + esc(String(s.num)) + '</div><div class="lbl">' + esc(s.lbl) + '</div></div>';
  }).join('');

  /* ---------- 年度双向条形图 ---------- */
  var maxV = 1;
  YEARS.forEach(function (y) {
    maxV = Math.max(maxV, yearCount(y, 'EU'), yearCount(y, 'CN'));
  });
  document.getElementById('diverging-chart').innerHTML = YEARS.map(function (y) {
    var e = yearCount(y, 'EU'), c = yearCount(y, 'CN');
    return '<div class="diverging-row">' +
      '<span class="y-label">' + esc(y) + '</span>' +
      '<span class="dv-track cn"><a class="dv-link" href="policies.html?year=' + esc(y) + '&side=CN" aria-label="' + esc(y) + ' 年 CN 政策 ' + c + ' 条">' +
        '<span class="dv-bar cn" style="width:' + (c / maxV * 100).toFixed(1) + '%"></span></a></span>' +
      '<span class="dv-track"><a class="dv-link" href="policies.html?year=' + esc(y) + '&side=EU" aria-label="' + esc(y) + ' 年 EU 政策 ' + e + ' 条">' +
        '<span class="dv-bar" style="width:' + (e / maxV * 100).toFixed(1) + '%"></span></a></span>' +
      '<span class="dv-count">' + e + '/' + c + '</span>' +
    '</div>';
  }).join('') +
  '<div class="diverging-axis"><span></span><span class="axis-mid">EU / CN</span><span></span></div>';

  /* ---------- 环图 ---------- */
  (function donut() {
    var R = 64, CIRC = 2 * Math.PI * R;
    var euFrac = nPol ? nEU / nPol : 0;
    var euLen = CIRC * euFrac;
    document.getElementById('donut').innerHTML =
      '<svg class="donut-svg" viewBox="0 0 168 168" role="img" aria-label="EU 与 CN 政策占比环图">' +
        '<circle cx="84" cy="84" r="' + R + '" fill="none" stroke="var(--eu)" stroke-width="20" ' +
          'stroke-dasharray="' + euLen.toFixed(1) + ' ' + (CIRC - euLen).toFixed(1) + '" stroke-dashoffset="' + (CIRC / 4).toFixed(1) + '" transform="rotate(-90 84 84)"/>' +
        '<circle cx="84" cy="84" r="' + R + '" fill="none" stroke="var(--cn)" stroke-width="20" ' +
          'stroke-dasharray="' + (CIRC - euLen).toFixed(1) + ' ' + euLen.toFixed(1) + '" stroke-dashoffset="' + (CIRC / 4 - euLen).toFixed(1) + '" transform="rotate(-90 84 84)"/>' +
        '<text x="84" y="80" text-anchor="middle" font-size="22" font-weight="700" fill="var(--ink)" font-family="var(--serif)">' + nPol + '</text>' +
        '<text x="84" y="100" text-anchor="middle" font-size="10" fill="var(--faint)" font-family="var(--mono)">POLICIES</text>' +
      '</svg>' +
      '<div class="donut-legend">' +
        '<a href="policies.html?side=EU"><span class="dot eu"></span>EU<span class="cnt">' + nEU + ' 条</span></a>' +
        '<a href="policies.html?side=CN"><span class="dot cn"></span>CN<span class="cnt">' + nCN + ' 条</span></a>' +
      '</div>';
  })();

  /* ---------- 排行图 ---------- */
  function rankHTML(list, cls) {
    var max = list.length ? list[0].count : 1;
    return list.map(function (r) {
      return '<a class="rank-row ' + cls + '" href="policies.html?q=' + encodeURIComponent(r.name) + '" aria-label="检索 ' + esc(r.name) + '，共 ' + r.count + ' 条">' +
        '<span class="rank-label" title="' + esc(r.name) + '">' + esc(r.name) + '</span>' +
        '<span class="rank-bar-track"><span class="rank-bar" style="width:' + (r.count / max * 100).toFixed(1) + '%"></span></span>' +
        '<span class="rank-count">' + r.count + '</span>' +
      '</a>';
    }).join('');
  }
  document.getElementById('framings-rank').innerHTML = rankHTML(topFramings, 'neutral');
  document.getElementById('industries-rank').innerHTML = rankHTML(topIndustries, 'neutral');

  /* ---------- 最新六项政策 ---------- */
  var latest6 = DATA_ALL.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 6);
  document.getElementById('latest6').innerHTML = latest6.map(function (d) {
    return '<a class="compact-item" href="policies.html?id=' + encodeURIComponent(d.id) + '">' +
      '<span class="ci-date">' + esc(Site.formatDate(d.date)) + '</span>' +
      '<span class="badge badge-' + d.side.toLowerCase() + '" style="flex-shrink:0">' + d.side + '</span>' +
      '<span class="ci-title">' + esc(d.nameZh || d.name) + '</span>' +
    '</a>';
  }).join('');
})();
