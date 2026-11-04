(function () {
  'use strict';

  var CONCEPTS = [
    { keys: ['关键原材料', '关键矿产', '矿产', '矿业', '稀土', 'critical raw material', 'critical mineral', 'mineral', 'mining', 'rare earth'], terms: ['矿产', '矿业', '关键矿产', '关键原材料', '稀土', '锂', '钴', '镍', '石墨', 'mineral', 'mining', 'critical raw material', 'critical mineral', 'rare earth', 'lithium', 'cobalt', 'nickel', 'graphite', 'raw materials'] },
    { keys: ['人工智能', '机器学习', '算法', 'artificial intelligence', 'machine learning', 'algorithm', 'ai act'], terms: ['人工智能', '机器学习', '算法', 'artificial intelligence', 'machine learning', 'algorithm', 'ai act', 'general-purpose ai', 'ai governance'] },
    { keys: ['人权', '基本权利', '强迫劳动', '现代奴役', 'human rights', 'fundamental rights', 'forced labour', 'forced labor', 'modern slavery'], terms: ['人权', '基本权利', '强迫劳动', '现代奴役', '尽职调查', 'human rights', 'fundamental rights', 'forced labour', 'forced labor', 'modern slavery', 'due diligence'] },
    { keys: ['劳动法', '劳工', '劳动', '就业', '平台劳动', 'labour law', 'labor law', 'labour', 'labor', 'working conditions', 'platform work', 'employment'], terms: ['劳动法', '劳工', '劳动', '就业', '平台劳动', 'labour', 'labor', 'working conditions', 'platform work', 'employment', 'worker'] },
    { keys: ['商标', 'trade mark', 'trademark'], terms: ['商标', 'trade mark', 'trademark', 'trade marks', 'eutm'] },
    { keys: ['专利', 'patent', 'unitary patent', 'european patent'], terms: ['专利', 'patent', 'patents', 'unitary patent', 'european patent', 'patent convention'] },
    { keys: ['数据保护', '个人数据', '隐私', 'data protection', 'personal data', 'privacy', 'gdpr'], terms: ['数据保护', '个人数据', '隐私', 'data protection', 'personal data', 'privacy', 'gdpr', 'data act', 'data governance'] },
    { keys: ['环境', '气候', '碳排放', '碳边境', 'environment', 'climate', 'carbon', 'cbam'], terms: ['环境', '气候', '碳排放', '碳边境', '废物', '生物多样性', 'environment', 'climate', 'carbon', 'cbam', 'waste', 'biodiversity', 'water'] },
    { keys: ['贸易', '关税', '倾销', '出口', '进口', 'trade', 'tariff', 'dumping', 'export', 'import'], terms: ['贸易', '关税', '倾销', '反补贴', '出口', '进口', '供应链', 'trade', 'tariff', 'dumping', 'countervailing', 'export', 'import', 'supply chain'] },
    { keys: ['知识产权', '版权', '商业秘密', '外观设计', 'intellectual property', 'copyright', 'trade secret', 'design'], terms: ['知识产权', '版权', '商业秘密', '外观设计', 'intellectual property', 'copyright', 'trade secret', 'design protection', 'designs'] },
    { keys: ['国家安全', '投资审查', '外商投资', 'national security', 'investment screening', 'foreign investment'], terms: ['国家安全', '投资审查', '外商投资', 'national security', 'investment screening', 'foreign investment', 'foreign direct investment'] },
    { keys: ['欧盟委员会', '欧洲议会', '欧盟理事会', '欧洲联盟', '欧盟', 'european commission', 'european parliament', 'european union', 'council of the eu'], terms: ['欧盟', '欧洲联盟', '欧盟委员会', '欧洲议会', '欧盟理事会', 'eu', 'european commission', 'european parliament', 'european union', 'council of the eu', 'european'] }
  ];
  var STOP = /关于|有关|相关|文件|文献|资料|政策|法规|法律|法案|查找|搜索|我想找|我想|我要|需要|帮我|一下|全部|所有|有哪些|哪些|的|和|与|及|或|是|找|要|能|可以/g;

  function norm(value) {
    return String(value == null ? '' : value).normalize('NFKC').toLowerCase();
  }

  function score(haystack, title, query) {
    var q = norm(query).trim();
    if (!q) return 0;
    var hay = norm(haystack);
    var name = norm(title);
    var remaining = q;
    var groups = [];

    CONCEPTS.forEach(function (concept) {
      var keys = concept.keys.slice().sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < keys.length; i++) {
        var key = norm(keys[i]);
        if (remaining.indexOf(key) !== -1) {
          groups.push(concept.terms);
          remaining = remaining.replace(key, ' ');
          break;
        }
      }
    });

    remaining = remaining.replace(STOP, ' ');
    var tokens = remaining.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    tokens.forEach(function (token) { groups.push([token]); });
    if (!groups.length) groups.push([q]);

    var total = 0;
    for (var i = 0; i < groups.length; i++) {
      var best = -1;
      groups[i].forEach(function (term) {
        var t = norm(term);
        if (t && hay.indexOf(t) !== -1) {
          var value = 10 + Math.min(4, t.length / 4);
          if (name.indexOf(t) !== -1) value += 8;
          if (value > best) best = value;
        }
      });
      if (best < 0) return -1;
      total += best;
    }
    if (name.indexOf(q) !== -1) total += 30;
    return total;
  }

  window.SemanticSearch = { score: score };
})();
