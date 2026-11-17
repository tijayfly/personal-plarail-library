// Shared helpers: product lines, parse a free-text Plarail name, score image-search candidates.
// Works in Node (require) and is copied into the renderer.
(function (root) {
  // typical: rough UK price in £ for a new item in that line, used only for dummy values when there's no price paid.
  // accessory: items in this line are track / scenery / accessories and don't count as trains.
  const LINES = {
    Plarail:             { code: 'PLARAIL',   label: 'Plarail (standard)', color: '#1d5fbf', typical: 14 },
    'Plarail Advance':   { code: 'ADVANCE',   label: 'Plarail Advance',    color: '#0b2f6b', typical: 24 },
    'Plarail Real Class':{ code: 'REAL CLASS',label: 'Plarail Real Class', color: '#5b4636', typical: 30 },
    'Thomas & Friends':  { code: 'THOMAS',    label: 'Thomas & Friends Plarail', color: '#2f7fd6', typical: 12 },
    'Shinkansen series': { code: 'SHINKANSEN',label: 'Shinkansen series',  color: '#00739a', typical: 16 },
    Exclusive:           { code: 'EXCLUSIVE', label: 'Event / shop exclusive', color: '#c8102e', typical: 28 },
    Track:               { code: 'TRACK',     label: 'Track',              color: '#2d9be4', typical: 6, accessory: true },
    Scenery:             { code: 'SCENERY',   label: 'Scenery',            color: '#2f8f4e', typical: 12, accessory: true },
    Accessories:         { code: 'ACCESSORY', label: 'Accessories',        color: '#7a6a2e', typical: 6, accessory: true },
    Other:               { code: 'OTHER',     label: 'Other',              color: '#6b7280', typical: 12 },
  };
  const LINE_ORDER = Object.keys(LINES);
  const lineInfo = (l) => LINES[l] || LINES.Other;

  // standard vs limited; the limited kinds say why
  const RARITY = {
    standard: { label: 'Standard release', short: '' },
    limited:  { label: 'Limited', short: 'LIMITED' },
    event:    { label: 'Limited: event exclusive', short: 'EVENT' },
    shop:     { label: 'Limited: shop exclusive', short: 'SHOP' },
    luckybag: { label: 'Limited: lucky-bag exclusive', short: 'LUCKY BAG' },
    retired:  { label: 'Limited: discontinued', short: 'RETIRED' },
  };
  const RARITY_ORDER = ['standard', 'limited', 'event', 'shop', 'luckybag', 'retired'];
  const isLimited = (r) => !!r && r !== 'standard';

  // train type / series -> operator. Matched as whole words against the series.
  const OPERATORS = [
    [/^(E[1-8]|E10|E956|E926|E2|E3|E4|E5|E6|E7)$/, 'JR East'], [/^W7$/, 'JR West'], [/^H5$/, 'JR Hokkaido'],
    [/^(N700S?|N700A|700|300|L0|923|922)$/, 'JR Central'], [/^(500|N700 ?7000|0|100)$/, ''], [/^800$/, 'JR Kyushu'],
    [/^(E2\d\d|E3\d\d|E6\d\d|E001|E655|E26\d|20[59]|C61|C57|D51|SL)$/, 'JR East'],
    [/^(EF\d+|EH\d+|ED\d+|DD51|DF200|DE10|HD300|M250|KF)$/, 'JR Freight'],
    [/^(N100|100|500)$/i, ''],
  ];
  const SERIES_OPERATOR = { '0': 'JNR / JR', '100': 'JNR / JR', '500': 'JR West', 'N100': 'Tobu', 'E956': 'JR East', '922': 'JR Central', '923': 'JR Central' };
  const NAME_HINTS = [ // [regex on the name, series, operator]
    [/\bspacia ?x\b/i, 'N100', 'Tobu'], [/\bhayabusa\b/i, 'E5', 'JR East'], [/\bkomachi\b/i, 'E6', 'JR East'], [/\bkagayaki\b/i, 'E7', 'JR East / JR West'],
    [/\bmomotaro\b/i, 'EF210', 'JR Freight'], [/\bkintaro\b/i, 'EH500', 'JR Freight'], [/\balfa[ -]?x\b/i, 'E956', 'JR East'],
    [/\bmaglev|linear\b/i, 'L0', 'JR Central'], [/\byamanote\b/i, 'E235', 'JR East'], [/\byurikamome\b/i, '', 'Yurikamome'],
    [/\bshonan monorail\b/i, '', 'Shonan Monorail'], [/\beurostar\b/i, '', 'Eurostar'], [/\btgv\b/i, '', 'SNCF'],
    [/\bromance ?car\b/i, '', 'Odakyu'], [/\blaview\b/i, '001', 'Seibu'], [/\bskyliner\b/i, 'AE', 'Keisei'], [/\bhinotori\b/i, '80000', 'Kintetsu'],
    [/\bthomas|percy|james|gordon|edward|henry|toby|emily\b/i, '', ''],
  ];
  function operatorFor(series, name) {
    const s = String(series || '').toUpperCase().replace(/\s+/g, '');
    if (SERIES_OPERATOR[s] != null) return SERIES_OPERATOR[s];
    for (const [re, op] of OPERATORS) if (op && re.test(s)) return op;
    for (const [re, , op] of NAME_HINTS) if (re.test(name || '') && op) return op;
    return '';
  }

  const ESCAPE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tidy = (s) => String(s || '').replace(/\s+/g, ' ').replace(/^[\s,·\-–&]+|[\s,·\-–&]+$/g, '').trim();
  const cap = (s) => s.replace(/^\w/, (c) => c.toUpperCase());

  // "S-01 Light-up E5 Hayabusa", "AS-02 N700S", "Plarail Advance AS-02 N700S", "R-01 straight rail", "Alfa X 6-car with lights & airbrakes"
  function parseName(raw, lineHint) {
    let s = tidy(raw).replace(/[‘’]/g, "'").replace(/ /g, ' ');
    let line = lineHint && LINES[lineHint] ? lineHint : '', rarity = 'standard', number = '', lights = false, cars = null, powered = true;
    const features = [];
    // line words
    const LINE_PREFIX = [
      [/^(plarail|プラレール)\s*advance\b\s*|^プラレールアドバンス\s*/i, 'Plarail Advance'], [/^(plarail\s*)?real class\b\s*|^リアルクラス\s*/i, 'Plarail Real Class'],
      [/^(plarail\s*)?thomas (&|and) friends( plarail)?\b\s*/i, 'Thomas & Friends'], [/^(?=thomas\b)/i, 'Thomas & Friends'], [/^(plarail|プラレール)\b\s*/i, ''],
    ];
    for (const [re, l, keep] of LINE_PREFIX) if (re.test(s)) { if (l && !line) line = l; if (!keep) s = tidy(s.replace(re, '')); break; }
    // rarity words
    if (/\b(retired|discontinued|old ?stock|絶版)\b/i.test(s)) { rarity = 'retired'; s = s.replace(/\b(retired|discontinued|old ?stock)\b/ig, ' '); }
    else if (/\b(lucky ?bag|fukubukuro|福袋)\b/i.test(s)) { rarity = 'luckybag'; s = s.replace(/\b(lucky ?bag|fukubukuro)\b/ig, ' '); }
    else if (/\b(event|expo|plarail haku|plahaku|博)\b/i.test(s)) { rarity = 'event'; s = s.replace(/\b(event( exclusive| limited)?|plarail haku|plahaku)\b/ig, ' '); }
    else if (/\b(shop|store|toys ?r ?us|aeon|popondetta|bic camera|yodobashi|tomica shop|plarail shop) (exclusive|limited|only)\b/i.test(s) || /\b(exclusive|限定)\b/i.test(s)) { rarity = 'shop'; s = s.replace(/\b(exclusive|limited|only)\b/ig, ' '); }
    else if (/\blimited\b/i.test(s)) { rarity = 'limited'; s = s.replace(/\blimited\b/ig, ' '); }
    s = tidy(s);
    // model number on the box: S-01, AS-02, R-01, J-12, KF-05, TS-01
    const nm = s.match(/(^|\s)([A-Z]{1,3})-?(\d{1,3})(?=\s|$)/i);
    if (nm && !/^(E|H|N|EF|EH|ED|DD|DF|DE|HD|KH|W|C|D|L)$/i.test(nm[2]) || nm && /-/.test(nm[0]) && !/^(E|H|N|W|L)$/i.test(nm[2])) {
      number = nm[2].toUpperCase() + '-' + nm[3].padStart(2, '0');
      s = tidy(s.replace(nm[0], ' '));
      const p = nm[2].toUpperCase();
      if (!line) line = p === 'AS' ? 'Plarail Advance' : /^T[SR]?$/.test(p) ? 'Thomas & Friends' : p === 'R' ? 'Track' : p === 'J' ? 'Scenery' : 'Plarail';
      if (/^K[FHD]?$|^KF$/.test(p)) powered = false;
    }
    // "with …" clauses become features (lights set the light-up flag)
    const w = s.match(/\s+with\s+(.+)$/i);
    if (w) {
      for (let f of w[1].split(/\s*(?:&|,|\band\b|\+)\s*/)) { f = tidy(f); if (/^(head)?lights?$|^light-?up$/i.test(f)) lights = true; else if (f) features.push(cap(f)); }
      s = tidy(s.slice(0, w.index));
    }
    // light-up
    if (/\b(light-?up|lighted|with (head)?lights?|lights?)\b|ライト付?/i.test(s)) { lights = true; s = s.replace(/\b(light-?up|lighted)\b|ライト付?/ig, ' ').replace(/\bheadlights?\b|\blights?\b/ig, ' '); }
    // number of cars
    const cm = s.match(/\b(\d{1,2})[- ]?(car|cars|両)\b|(\d{1,2})両/i);
    if (cm) { cars = Number(cm[1] || cm[3]); s = s.replace(cm[0], ' '); }
    if (/\b(unpowered|no motor|non-?powered|wagon|coach only|trailer)\b/i.test(s)) powered = false;
    if (/\bunpowered|non-?powered|no motor\b/i.test(s)) s = s.replace(/\b(unpowered|non-?powered|no motor)\b/ig, ' ');
    s = tidy(s);
    // colour scheme words at the end ("blue white")
    const col = s.match(/\s+((?:blue|white|red|yellow|green|black|silver|gold|orange|purple|pink|grey|cream)(?:[ /&]+(?:blue|white|red|yellow|green|black|silver|gold|orange|purple|pink|grey|cream))*)$/i);
    if (col && tidy(s.slice(0, col.index))) { features.unshift(cap(col[1].toLowerCase().replace(/\s*[ /&]+\s*/g, ' & '))); s = tidy(s.slice(0, col.index)); }
    s = tidy(s.replace(/\s*&\s*$/, ''));
    // train type / series
    let series = '', operator = '';
    const dr = /\b(dr\.?|doctor) ?yellow\b/i.test(s);
    const sm = s.match(/(^|\s)(N700S|N700A|N700|E\d{1,3}|H5|W7|EF\d{2,3}|EH\d{3}|ED\d{2,3}|DD\d{2}|DF\d{3}|DE\d{2}|HD\d{3}|[CD]\d{2}|L0+|N100|\d{1,4}(?= ?series\b)|\d{3}(?=\s|$))(?:\s*series)?(?=\s|$)/i);
    if (sm) {
      series = sm[2].toUpperCase().replace(/^L0+$/, 'L0');
      if (dr) series = series === '0' ? '922' : series === '700' ? '923' : series;
    }
    for (const [re, ser, op] of NAME_HINTS) if (re.test(s)) { if (!series && ser) series = ser; if (op) operator = op; break; }
    if (!operator) operator = operatorFor(series, s);
    if (!line) line = 'Plarail';
    let accessory = !!lineInfo(line).accessory;
    if (!number && /\b(rail|track|points?|bridge|station|tunnel|crossing|platform|scenery|layout|set of rails)\b/i.test(s) && !/\b(set|with)\b.*\b(train|loco)/i.test(s) && !series) {
      if (line === 'Plarail') { line = /\b(rail|track|points?)\b/i.test(s) ? 'Track' : 'Scenery'; accessory = true; }
    }
    if (accessory) powered = false;
    const out = { line, number, title: cap(s) || tidy(raw), operator, series, cars, powered, lights, features: features.join(', '), rarity, accessory };
    return out;
  }

  // Text for photo and price searches (adds プラレール / Plarail)
  function searchQuery(it) {
    const l = it.line;
    const jp = l === 'Plarail Advance' ? 'プラレールアドバンス' : l === 'Plarail Real Class' ? 'プラレール リアルクラス' : l === 'Thomas & Friends' ? 'プラレール トーマス' : 'プラレール';
    const parts = [jp, 'Plarail', it.number, it.title, it.series && !String(it.title || '').toUpperCase().includes(String(it.series).toUpperCase()) ? it.series : ''];
    return tidy(parts.filter(Boolean).join(' '));
  }
  // shorter English query for eBay
  function ebayQuery(it) { return tidy(['Plarail', it.number, it.title].filter(Boolean).join(' ')); }

  const NOISE = /\b(review|reddit|tiktok|wiki|fandom|youtube|layout video|lot of|bundle|job ?lot|sticker|decal|wallpaper|3d print|unboxing|haul|drawing|illustration)\b/i;
  const OTHER_MAKERS = /\b(tomica|トミカ|kato|tomix|n ?gauge|nゲージ|ho ?scale|hot ?wheels|lego|bandai|capsule|カプセル|gacha|brio|hornby|bachmann)\b/i;
  const OWN = /plarail|プラレール/i;
  function tokens(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9\-. ]/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !['the', 'and', 'series', 'with', 'set', 'train', 'plarail', 'new'].includes(t));
  }
  function scoreCandidate(item, cand) {
    const t = cand.t || '';
    let score = 0;
    for (const w of tokens(item.title || '')) if (t.toLowerCase().includes(w)) score += 2;
    if (item.series && t.toUpperCase().includes(String(item.series).toUpperCase())) score += 1;
    if (item.number && t.toUpperCase().replace(/\s/g, '').includes(item.number)) score += 2;
    if (OWN.test(t)) score += 3;
    if (OTHER_MAKERS.test(t) && !OWN.test(t)) score -= 3;
    if (item.line === 'Plarail Advance' && /advance|アドバンス/i.test(t)) score += 1;
    if (NOISE.test(t)) score -= 4;
    return score;
  }
  function rankCandidates(item, cands) {
    return cands.map((c, i) => ({ ...c, score: scoreCandidate(item, c) - i * 0.3 })).sort((a, b) => b.score - a.score);
  }

  const api = { LINES, LINE_ORDER, lineInfo, RARITY, RARITY_ORDER, isLimited, parseName, searchQuery, ebayQuery, scoreCandidate, rankCandidates, operatorFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Match = api;
})(typeof window !== 'undefined' ? window : globalThis);
