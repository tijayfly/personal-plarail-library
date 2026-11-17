/* DEPOT renderer — shared by the full Electron app and the static view-only export. */
(function () {
  'use strict';
  const API = window.depot || null;                  // present only in the Electron full version
  const SNAP = !API;                                 // the exported view-only snapshot
  let VIEW = SNAP;                                   // view mode: no prices, no editing (snapshot, or previewed in the full app)
  const M = window.Match;
  const $app = document.getElementById('app');

  let DB = { items: [], settings: {} };
  const state = loadUI();

  function loadUI() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('depot-ui') || '{}'); } catch (e) {}
    return Object.assign({ q: '', line: 'All', sort: 'line', dir: 1, view: 'grid', review: false }, s);
  }
  function saveUI() { try { localStorage.setItem('depot-ui', JSON.stringify(state)); } catch (e) {} }

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // pence show unless the amount is whole pounds
  const gbp = (n, dp) => {
    if (n == null || isNaN(n)) return '—';
    if (dp == null) dp = Math.abs(n) >= 100 || Math.abs(n - Math.round(n)) < 0.005 ? 0 : 2;
    return (n < 0 ? '−£' : '£') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  };
  const signed = (n) => n == null ? '—' : (n > 0 ? '+' : '') + gbp(n);
  const pct = (n) => n == null || !isFinite(n) ? '' : (n > 0 ? '+' : '') + n.toFixed(0) + '%';
  const L = (l) => M.lineInfo(l);
  const cost = (it) => it.gift ? 0 : (it.paid || 0);
  const value = (it) => it.current && it.current.gbp != null ? it.current.gbp : null;
  const pl = (it) => value(it) == null ? null : value(it) - cost(it);
  const plPct = (it) => cost(it) > 0 && pl(it) != null ? (pl(it) / cost(it)) * 100 : null;
  const needsCheck = (i) => !!(i.imageReview || !i.image);
  const cls = (n) => n == null || Math.abs(n) < 0.005 ? '' : n > 0 ? 'gain' : 'loss';
  const trains = (items) => items.reduce((s, i) => s + (i.accessory ? 0 : (i.qty || 1)), 0);
  const rarity = (it) => M.RARITY[it.rarity] || M.RARITY.standard;
  const badge = (it, small) => `<span class="bbadge${small ? ' sm' : ''}" style="--b:${L(it.line).color}">${esc(L(it.line).code)}</span>`;
  // "JR East · E5", "Tobu · N100"
  const opLine = (it) => [it.operator, it.series && !String(it.title || '').toUpperCase().includes(String(it.series).toUpperCase()) ? it.series + (/^\d+$/.test(it.series) ? ' series' : '') : ''].filter(Boolean).join(' · ');
  // little spec chips: 6 cars · powered · light-up
  function specLine(it) {
    if (it.accessory) return it.features || '';
    return [it.cars ? it.cars + (it.cars === 1 ? ' car' : ' cars') : '', it.powered === false ? 'Unpowered' : 'Powered', it.lights ? 'Light-up' : ''].filter(Boolean).join(' · ');
  }
  function imgSrc(it) {
    if (!it.image) return null;
    if (it.image.local) return SNAP ? it.image.local : 'depot://' + it.image.local;
    return it.image.url || it.image.thumb || null;
  }
  function imgTag(it, extra = '') {
    const src = imgSrc(it);
    if (!src) return `<div class="noimg">${ICON.camera}No photo yet</div>`;
    const fb = it.image && it.image.thumb && !it.image.local ? ` data-fallback="${esc(it.image.thumb)}"` : '';
    return `<img src="${esc(src)}"${fb} alt="${esc(it.title)}" loading="lazy" referrerpolicy="no-referrer" ${extra}>`;
  }
  document.addEventListener('error', (e) => {
    const el = e.target;
    if (el.tagName !== 'IMG') return;
    if (el.dataset.fallback && el.src !== el.dataset.fallback) { el.src = el.dataset.fallback; delete el.dataset.fallback; return; }
    if (!el.dataset.dead) { el.dataset.dead = 1; el.replaceWith(Object.assign(document.createElement('div'), { className: 'noimg', innerHTML: ICON.camera + 'Photo unavailable' })); }
  }, true);
  // refresh values and say plainly if eBay failed
  async function refreshValues(ids) {
    const t0 = Date.now() - 1000;
    DB = await API.refreshPrices(ids);
    const scope = DB.items.filter((i) => !ids || ids.includes(i.id));
    const failed = scope.filter((i) => i.current && i.current.error && Date.parse(i.current.errorAt || 0) >= t0);
    if (!failed.length) toast(ids && ids.length === 1 ? 'Value refreshed' : 'Values refreshed');
    else toast((ids && ids.length === 1 ? 'Couldn’t refresh: ' : `Couldn’t refresh ${failed.length} of ${scope.length} items: `) + failed[0].current.error, 7000);
  }
  const ebayFails = (items) => items.filter((i) => i.current && i.current.error).length;
  const failNote = (n) => `<span class="price-err">⚠ eBay failed for ${n} train${n > 1 ? 's' : ''}</span>`;
  function toast(msg, ms = 2600) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
  const ICON = {
    eye: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    camera: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
    list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="3" rx="1"/><rect x="3" y="10.5" width="18" height="3" rx="1"/><rect x="3" y="17" width="18" height="3" rx="1"/></svg>',
    sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    bulb: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>',
    back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>',
  };

  // ---------- theme ----------
  const themeBtn = document.getElementById('theme-btn');
  function paintThemeBtn() { themeBtn.innerHTML = document.documentElement.dataset.theme === 'dark' ? ICON.sun : ICON.moon; }
  themeBtn.onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('depot-theme', t); } catch (e) {}
    paintThemeBtn();
  };
  paintThemeBtn();

  // ---------- chrome ----------
  function renderTabs(route) {
    const tabs = [['#/', 'Collection', route === 'collection' || route === 'item'], ['#/wishlist', 'Wishlist', route === 'wishlist']];
    if (!VIEW) tabs.push(['#/settings', 'Settings', route === 'settings']);
    let html = tabs.map(([h, l, on]) => `<a href="${h}" class="${on ? 'active' : ''}">${l}</a>`).join('');
    if (!VIEW) html += `<a href="#/add" class="add ${route === 'add' ? 'active' : ''}">+ Add item</a>`;
    document.getElementById('tabs').innerHTML = html;
    document.getElementById('mode-pill').textContent = VIEW && !SNAP ? 'VIEW MODE · PREVIEW' : VIEW
      ? 'VIEW ONLY · ' + (DB.exported ? new Date(DB.exported).toLocaleDateString('en-GB') : '')
      : (DB.settings.priceProvider === 'ebay' ? 'LIVE · eBay UK' : 'VALUES: DUMMY DATA');
  }

  // ---------- list views ----------
  const natural = (s) => String(s || '').replace(/\d+/g, (d) => d.padStart(6, '0')).toLowerCase();
  const lineIdx = (i) => String(M.LINE_ORDER.indexOf(i.line in M.LINES ? i.line : 'Other')).padStart(2, '0');
  // within a line: numbered items in box order (S-01, S-02… before AS-, KF-, R-…), then unnumbered by name
  const PREFIX = { S: 0, AS: 1, TS: 2, T: 2 };
  const numKey = (n) => { const p = (String(n).match(/^[A-Z]+/) || [''])[0]; return String(PREFIX[p] ?? 5) + natural(n); };
  const lineKey = (i) => lineIdx(i) + '|' + (i.number ? '0' + numKey(i.number) : '1') + '|' + i.title.toLowerCase();
  function listItems(list) {
    const q = state.q.trim().toLowerCase();
    let items = DB.items.filter((i) => i.list === list);
    const counts = { All: items.length };
    for (const i of items) counts[i.line] = (counts[i.line] || 0) + 1;
    if (q) items = items.filter((i) => [i.title, i.line, L(i.line).code, L(i.line).label, i.number, i.operator, i.series, i.series ? i.series + ' series' : '', i.cars ? i.cars + ' cars' : '', i.powered === false ? 'unpowered' : 'powered',
      i.lights ? 'light-up lights' : '', i.features, rarity(i).label, rarity(i).short, i.notes, VIEW ? '' : i.boughtAt, i.accessory ? 'track scenery accessory' : ''].join(' ').toLowerCase().includes(q));
    if (state.line !== 'All') items = items.filter((i) => i.line === state.line);
    if (state.review && !VIEW) items = items.filter(needsCheck);
    const key = {
      line: lineKey,
      number: (i) => (i.number ? '0' + numKey(i.number) : '1') + i.title.toLowerCase(),
      name: (i) => i.title.toLowerCase(),
      operator: (i) => (i.operator || '~').toLowerCase() + '|' + natural(i.series) + '|' + i.title.toLowerCase(),
      series: (i) => (i.series ? natural(i.series) : '~') + '|' + i.title.toLowerCase(),
      cars: (i) => String(i.cars || 0).padStart(3, '0') + lineKey(i),
      rarity: (i) => String(9 - M.RARITY_ORDER.indexOf(i.rarity || 'standard')) + lineKey(i),
      added: (i) => i.added || '',
      paid: (i) => list === 'wishlist' ? (i.targetPrice || 0) : cost(i),
      value: (i) => value(i) || 0,
      pl: (i) => pl(i) || 0,
      plpct: (i) => plPct(i) || 0,
    }[state.sort] || ((i) => i.title);
    items.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : a.title.localeCompare(b.title)) * state.dir; });
    return { items, counts };
  }

  function statsBar(items) {
    if (VIEW) return '';
    const paid = items.reduce((s, i) => s + cost(i), 0);
    const valued = items.filter((i) => value(i) != null);
    const val = valued.reduce((s, i) => s + value(i), 0);
    const gain = valued.reduce((s, i) => s + pl(i), 0);
    const n = trains(items);
    const gifts = items.filter((i) => i.gift).length;
    const bought = trains(items.filter((i) => !i.gift && i.paid));
    const boughtPaid = items.filter((i) => !i.gift && i.paid && !i.accessory).reduce((s, i) => s + cost(i), 0);
    const acc = items.filter((i) => i.accessory).length;
    return `<section class="stats">
      <div class="stat"><div class="stat-label">Trains</div><div class="stat-value">${n}</div><div class="stat-sub">${gifts} gift${gifts === 1 ? '' : 's'}${acc ? ` · +${acc} track / scenery` : ''}</div></div>
      <div class="stat"><div class="stat-label">Total paid</div><div class="stat-value">${gbp(paid)}</div><div class="stat-sub">${bought ? gbp(boughtPaid / bought, 2) + ' per bought train' : 'gifts counted as £0'}</div></div>
      <div class="stat"><div class="stat-label">Current value</div><div class="stat-value">${gbp(val)}</div><div class="stat-sub">${ebayFails(items) ? failNote(ebayFails(items)) : `${valued.length}/${items.length} valued`}</div></div>
      <div class="stat"><div class="stat-label">Profit / loss</div><div class="stat-value ${cls(gain)}">${signed(gain)}</div><div class="stat-sub ${cls(gain)}">${paid ? pct((gain / paid) * 100) + ' on cost' : ''}</div></div>
    </section>`;
  }

  function toolbar(counts, list, shown) {
    const lines = M.LINE_ORDER.filter((b) => counts[b]).concat(Object.keys(counts).filter((b) => b !== 'All' && !M.LINES[b]));
    const chips = ['All', ...lines].map((b) =>
      `<button class="chip ${state.line === b ? 'on' : ''}" data-line="${esc(b)}" title="${esc(b === 'All' ? 'Everything' : L(b).label)}">${b === 'All' ? 'All' : badge({ line: b }, true)}<span class="n">${counts[b] || 0}</span></button>`).join('');
    const sorts = [['line', 'Line & number'], ['number', 'Model number'], ['name', 'Name'], ['operator', 'Operator'], ['series', 'Series'], ['cars', 'Number of cars'], ['rarity', 'Rarity'], ['added', 'Date added']];
    if (!VIEW) sorts.push(list === 'wishlist' ? ['paid', 'Target price'] : ['paid', 'Price paid'], ['value', 'Current value']);
    if (!VIEW && list === 'collection') sorts.push(['pl', 'Profit / loss £'], ['plpct', 'Profit / loss %']);
    return `<div class="toolbar">
      <div class="search">${ICON.search}<input id="q" placeholder="Search ${list === 'wishlist' ? 'wishlist' : 'collection'}: name, number, operator, series…" value="${esc(state.q)}">${state.q ? '<button class="search-x" id="qx" type="button" title="Clear search" aria-label="Clear search">✕</button>' : ''}</div>
      <div class="chips">${chips}</div>
      <select id="sort">${sorts.map(([v, l]) => `<option value="${v}" ${state.sort === v ? 'selected' : ''}>Sort: ${l}</option>`).join('')}</select>
      <button class="icon-btn" id="dir" title="Reverse order">${state.dir > 0 ? '↑' : '↓'}</button>
      <div class="seg"><button data-view="grid" class="${state.view === 'grid' ? 'on' : ''}" title="Grid">${ICON.grid}</button><button data-view="table" class="${state.view === 'table' ? 'on' : ''}" title="Table">${ICON.list}</button></div>
      ${VIEW ? '' : `<button class="chip ${state.review ? 'on' : ''}" id="review" title="Entries with no photo, or a photo auto-matched with low confidence">Check photos<span class="n">${DB.items.filter((i) => i.list === list && needsCheck(i)).length}</span></button>`}
      <span class="result-count">${shown} shown</span>
    </div>`;
  }

  function rarityTag(it) {
    const r = rarity(it);
    return r.short ? `<span class="rarity r-${esc(it.rarity)}">${r.short}</span>` : '';
  }
  // grid card: a long, wide Plarail-style box with a coloured lid band, the train on a strip of blue track, and the box's side edge
  function card(it) {
    let money = '', plTag = '';
    if (!VIEW) {
      if (it.list === 'wishlist') {
        money = `<div class="card-money"><span><span class="now">${gbp(value(it))}</span> <span class="was">now</span></span><span class="was">target ${gbp(it.targetPrice)}</span></div>`;
      } else {
        const p = pl(it);
        if (p != null) plTag = `<span class="pl-pill on-img ${cls(p)}">${signed(p)}</span>`;
        money = `<div class="card-money cm-row"><span class="now">${gbp(value(it))}</span><span class="was">${it.gift ? 'gift' : 'paid ' + gbp(cost(it))}</span></div>`;
      }
    }
    const op = opLine(it), sp = specLine(it);
    return `<a class="card box${it.accessory ? ' acc' : ''}" href="#/item/${it.id}" style="--b:${L(it.line).color}">
      <div class="lid"><span class="lid-no">${esc(it.number || '—')}</span><span class="lid-line">${esc(L(it.line).code)}</span>${it.lights ? `<span class="lid-ico" title="Light-up">${ICON.bulb}</span>` : ''}</div>
      <div class="card-img">${imgTag(it)}${rarityTag(it)}${plTag}<i class="rail"></i></div>
      <div class="card-body"><div class="card-title">${esc(it.title)}${it.qty > 1 ? ` <span class="model-no">×${it.qty}</span>` : ''}</div>${op ? `<div class="card-series">${esc(op)}</div>` : ''}${sp ? `<div class="card-sub">${esc(sp)}</div>` : ''}${money}</div>
    </a>`;
  }

  function table(items, list) {
    const cols = [['', null], ['Line', 'line'], ['No.', 'number'], ['Name', 'name'], ['Operator', 'operator'], ['Series', 'series'], ['Cars', 'cars', 1], ['', null], ['Rarity', 'rarity']];
    if (!VIEW) {
      if (list === 'wishlist') cols.push(['Target', 'paid', 1], ['Current', 'value', 1]);
      else cols.push(['Paid', 'paid', 1], ['Current', 'value', 1], ['P/L', 'pl', 1], ['P/L %', 'plpct', 1]);
    }
    const head = cols.map(([l, k, n]) => `<th class="${n ? 'num' : ''}" ${k ? `data-sort="${k}"` : ''}>${l}${state.sort === k ? (state.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
    const rows = items.map((it) => {
      const src = imgSrc(it);
      const flags = it.accessory ? '<span class="flag">TRACK/SCENERY</span>' : (it.powered === false ? '<span class="flag">UNPOWERED</span>' : '') + (it.lights ? `<span class="flag lt" title="Light-up">${ICON.bulb}</span>` : '');
      let tds = `<td>${src ? `<img class="thumb" src="${esc(src)}" ${it.image && it.image.thumb && !it.image.local ? `data-fallback="${esc(it.image.thumb)}"` : ''} referrerpolicy="no-referrer" loading="lazy" alt="">` : ''}</td>
        <td>${badge(it, true)}</td><td class="model-no">${esc(it.number || '')}</td><td>${esc(it.title)}${it.qty > 1 ? ' ×' + it.qty : ''}</td><td>${esc(it.operator || '')}</td><td>${esc(it.series || '')}</td><td class="num">${it.cars || ''}</td><td>${flags}</td><td>${rarityTag(it)}</td>`;
      if (!VIEW) {
        if (list === 'wishlist') tds += `<td class="num">${gbp(it.targetPrice)}</td><td class="num">${gbp(value(it))}</td>`;
        else tds += `<td class="num">${it.gift ? 'Gift' : gbp(cost(it))}</td><td class="num">${gbp(value(it))}</td><td class="num ${cls(pl(it))}">${signed(pl(it))}</td><td class="num ${cls(pl(it))}">${pct(plPct(it))}</td>`;
      }
      return `<tr data-id="${it.id}">${tds}</tr>`;
    }).join('');
    return `<table class="list"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderList(list) {
    const { items, counts } = listItems(list);
    const all = DB.items.filter((i) => i.list === list);
    let html = '';
    if (list === 'collection') html += statsBar(all);
    else if (!VIEW) html += `<section class="stats" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat"><div class="stat-label">Wanted</div><div class="stat-value">${all.length}</div><div class="stat-sub">on the list</div></div>
        <div class="stat"><div class="stat-label">Target spend</div><div class="stat-value">${gbp(all.reduce((s, i) => s + (i.targetPrice || 0), 0))}</div><div class="stat-sub">from your notes</div></div>
        <div class="stat"><div class="stat-label">Market now</div><div class="stat-value">${gbp(all.reduce((s, i) => s + (value(i) || 0), 0))}</div><div class="stat-sub">${ebayFails(all) ? failNote(ebayFails(all)) : DB.settings.priceProvider === 'ebay' ? 'eBay UK' : 'dummy data'}</div></div></section>`;
    html += toolbar(counts, list, items.length);
    if (!items.length) html += `<div class="empty">Nothing matches.${!VIEW && list === 'wishlist' ? ' Add one with “+ Add item” and choose Wishlist.' : ''}</div>`;
    else html += state.view === 'table' ? table(items, list) : `<div class="grid">${items.map(card).join('')}</div>`;
    html += foot();
    $app.innerHTML = html;
    bindToolbar(list);
  }
  function foot() {
    return `<div class="foot">${VIEW ? 'View-only snapshot · prices hidden' : 'Data: ' + esc(DB.updated ? new Date(DB.updated).toLocaleString('en-GB') : '')} · Unofficial fan-made tracker, not affiliated with Takara Tomy</div>`;
  }
  function bindToolbar(list) {
    const q = document.getElementById('q');
    const qx = document.getElementById('qx');
    if (qx) qx.onclick = () => { state.q = ''; saveUI(); renderList(list); document.getElementById('q').focus(); };
    q.onkeydown = (e) => { if (e.key === 'Escape' && q.value) { e.preventDefault(); qx && qx.click(); } };
    q.oninput = () => { state.q = q.value; saveUI(); const pos = q.selectionStart; renderList(list); const n = document.getElementById('q'); n.focus(); n.setSelectionRange(pos, pos); };
    $app.querySelectorAll('[data-line]').forEach((b) => b.onclick = () => { state.line = b.dataset.line; saveUI(); renderList(list); });
    document.getElementById('sort').onchange = (e) => { state.sort = e.target.value; saveUI(); renderList(list); };
    document.getElementById('dir').onclick = () => { state.dir *= -1; saveUI(); renderList(list); };
    $app.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { state.view = b.dataset.view; saveUI(); renderList(list); });
    const rv = document.getElementById('review'); if (rv) rv.onclick = () => { state.review = !state.review; saveUI(); renderList(list); };
    $app.querySelectorAll('th[data-sort]').forEach((th) => th.onclick = () => { if (state.sort === th.dataset.sort) state.dir *= -1; else { state.sort = th.dataset.sort; state.dir = 1; } saveUI(); renderList(list); });
    $app.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = () => location.hash = '#/item/' + tr.dataset.id);
  }

  // ---------- item page ----------
  function renderItem(id, edit) {
    const it = DB.items.find((x) => x.id === id);
    if (!it) { $app.innerHTML = `<div class="empty">Entry not found. <a href="#/">Back to collection</a></div>`; return; }
    const backHref = it.list === 'wishlist' ? '#/wishlist' : '#/';
    const src = it.image && (it.image.title || '');
    const r = rarity(it);
    const yn = (b) => b ? 'Yes' : 'No';
    const spec = [['Line', `${badge(it)} &nbsp;${esc(L(it.line).label)}`]];
    if (it.number) spec.push(['Model no.', `<span class="model-no" style="font-size:13px;color:var(--ink)">${esc(it.number)}</span>`]);
    spec.push(['Name', esc(it.title)]);
    if (!it.accessory || it.operator) spec.push(['Operator', esc(it.operator || '—')]);
    if (!it.accessory || it.series) spec.push(['Series', esc(it.series ? it.series + (/^\d+$/.test(it.series) ? ' series' : '') : '—')]);
    if (!it.accessory) spec.push(['Cars', esc(it.cars || '—')], ['Powered', it.powered === false ? 'No (unpowered)' : 'Yes'], ['Light-up', yn(it.lights)]);
    if (it.features) spec.push([it.accessory ? 'Contents' : 'Features', esc(it.features)]);
    spec.push(['Rarity', r.short ? `${rarityTag(it)} &nbsp;${esc(r.label)}` : esc(r.label)]);
    if (it.accessory) spec.push(['Type', 'Track / scenery / accessory (not counted as a train)']);
    spec.push(['Quantity', it.qty || 1]);
    if (!VIEW && it.boughtAt) spec.push(['Bought', esc(it.boughtAt)]);
    spec.push(['Added', esc(it.added || '—')]);
    if (it.notes) spec.push(['Notes', `<span class="model-no">${esc(it.notes)}</span>`]);
    if (!VIEW && it.list === 'wishlist' && it.whereToBuy) spec.push(['Where', esc(it.whereToBuy)]);

    let money = '';
    if (!VIEW) {
      const c = it.current || {};
      const curLine = `<div><div class="k">Current value</div><div class="v">${gbp(value(it), 2)}</div><div class="s">${esc(c.source || 'not valued')}${c.samples ? ' · ' + c.samples + ' listings' : ''}</div>${c.error ? `<div class="s price-err">⚠ Last refresh failed: ${esc(c.error)}</div>` : ''}</div>`;
      if (it.list === 'wishlist') {
        money = `<div class="money"><div><div class="k">Target price</div><div class="v">${gbp(it.targetPrice, 2)}</div><div class="s">from your list</div></div>${curLine}</div>`;
      } else {
        const p = pl(it);
        money = `<div class="money"><div><div class="k">Price paid</div><div class="v">${it.gift ? 'Gift' : gbp(cost(it), 2)}</div><div class="s">${it.gift ? 'counted as £0' : ''}</div></div>${curLine}<div class="pl"><span class="k">Profit / loss</span><span class="v ${cls(p)}">${signed(p)} <span style="font-size:14px">${pct(plPct(it))}</span></span></div></div>`;
      }
    }
    const actions = VIEW ? '' : `<div class="actions">
        <button class="btn primary" id="edit">Edit details</button>
        <button class="btn" id="photo">Change photo</button>
        <button class="btn" id="reprice">Refresh value</button>
        <button class="btn danger" id="del">Delete entry</button>
        ${it.list === 'wishlist' ? '<button class="btn go" id="gotit">Got it! Move to collection</button>' : ''}
      </div>
`;
    const op = opLine(it), sp = specLine(it);
    $app.innerHTML = `<a class="back" href="${backHref}">${ICON.back} Back to ${it.list === 'wishlist' ? 'wishlist' : 'collection'}</a>
      <div class="item">
        <div>
          <div class="bigbox" style="--b:${L(it.line).color}">
            <div class="bigbox-front">
              <div class="bb-lid"><span class="bb-no">${esc(it.number || '')}</span><span class="bb-line">${esc(it.line === 'Other' ? 'Plarail' : L(it.line).label.replace(' (standard)', ''))}</span>${rarityTag(it)}</div>
              <div class="bb-window">${imgTag(it)}<i class="rail"></i></div>
              <div class="bb-name">${esc(it.title)}</div>
              <div class="bb-foot"><span>${esc(op)}</span><span>${esc(sp)}</span></div>
            </div>
            <div class="bigbox-side"><span>${esc(it.number || L(it.line).code)}</span></div>
          </div>
          ${VIEW ? '' : `<div class="photo-src"><span>${it.image ? (it.image.own ? 'Your own photo' : 'Photo found online' + (src ? ': “' + esc(src.slice(0, 80)) + '”' : '')) : 'No photo'}${it.imageReview ? ' · <b style="color:var(--red)">auto-matched — please check</b>' : ''}</span></div>`}
        </div>
        <div class="spec">
          <div class="spec-head" style="--b:${L(it.line).color}"><div class="model-no">ENTRY ${esc(it.id.toUpperCase())} · ${it.list === 'wishlist' ? 'WISHLIST' : 'IN COLLECTION'}</div><h1>${esc([it.number, it.title].filter(Boolean).join(' '))}</h1><div class="series">${esc([op, sp].filter(Boolean).join(' · '))}</div></div>
          <div class="spec-rows">${spec.map(([k, v]) => `<div class="k">${k}</div><div>${v}</div>`).join('')}</div>
          ${money}
          ${actions}
        </div>
      </div>
      <div id="edit-area"></div>${foot()}`;
    if (VIEW) return;
    document.getElementById('edit').onclick = () => editForm(it);
    document.getElementById('photo').onclick = () => photoPicker(it);
    document.getElementById('reprice').onclick = async (e) => { e.target.disabled = true; e.target.textContent = 'Refreshing…'; await refreshValues([it.id]); renderItem(id); };
    document.getElementById('del').onclick = async () => { if (await API.deleteItem(it.id)) { DB = await API.getDB(); location.hash = backHref; } };
    const g = document.getElementById('gotit');
    if (g) g.onclick = () => gotIt(it);
    if (edit) editForm(it);
  }

  const lineOptions = (sel, auto) => (auto ? `<option value="auto">Auto-detect</option>` : '') + M.LINE_ORDER.concat(sel && !M.LINES[sel] && sel !== 'auto' ? [sel] : []).map((b) => `<option value="${esc(b)}" ${sel === b ? 'selected' : ''}>${esc(L(b).label)}</option>`).join('');
  const uniq = (k) => [...new Set(DB.items.map((i) => i[k]).filter(Boolean))].sort().map((m) => `<option value="${esc(m)}">`).join('');
  const OPS = ['JR East', 'JR Central', 'JR West', 'JR Hokkaido', 'JR Kyushu', 'JR Shikoku', 'JR Freight', 'JNR / JR', 'Tobu', 'Odakyu', 'Seibu', 'Keisei', 'Kintetsu', 'Meitetsu', 'Tokyo Metro', 'Yurikamome', 'Shonan Monorail'];
  function fieldsHTML(d, list) {
    return `<div class="form">
      <label class="span-1">Model no.<input class="input" name="number" value="${esc(d.number || '')}" placeholder="S-01, AS-02"></label>
      <label class="span-3">Train name<input class="input" name="title" value="${esc(d.title || '')}" placeholder="e.g. E5 Hayabusa" required></label>
      <label class="span-2">Line<select name="line">${lineOptions(d.line || 'Plarail')}</select></label>
      <label class="span-2">Operator<input class="input" name="operator" value="${esc(d.operator || '')}" placeholder="e.g. JR East" list="ops"></label>
      <label class="span-1">Series<input class="input" name="series" value="${esc(d.series || '')}" placeholder="E5, N700S"></label>
      <label class="span-1">No. of cars<input class="input" name="cars" type="number" min="1" value="${d.cars ?? ''}"></label>
      <label class="span-1 check"><input type="checkbox" name="powered" ${d.powered !== false ? 'checked' : ''}> Powered</label>
      <label class="span-1 check"><input type="checkbox" name="lights" ${d.lights ? 'checked' : ''}> Light-up</label>
      <label class="span-3">Features / variant<input class="input" name="features" value="${esc(d.features || '')}" placeholder="e.g. Sound, opening doors, blue &amp; white"></label>
      <label class="span-2">Rarity<select name="rarity">${M.RARITY_ORDER.map((k) => `<option value="${k}" ${(d.rarity || 'standard') === k ? 'selected' : ''}>${M.RARITY[k].label}</option>`).join('')}</select></label>
      <label class="span-1">Quantity<input class="input" name="qty" type="number" min="1" value="${d.qty || 1}"></label>
      <label class="span-6 check"><input type="checkbox" name="accessory" ${d.accessory ? 'checked' : ''}> Track / scenery / accessory (tracked, but not counted as a train)</label>
      ${list === 'wishlist'
        ? `<label class="span-2">Target price (£)<input class="input" name="targetPrice" type="number" step="0.01" value="${d.targetPrice ?? ''}"></label>
           <label class="span-2">Where to buy<input class="input" name="whereToBuy" value="${esc(d.whereToBuy || '')}"></label>`
        : `<label class="span-2">Price paid (£)<input class="input" name="paid" type="number" step="0.01" value="${d.gift ? '' : (d.paid ?? '')}"></label>
           <label class="span-2 check"><input type="checkbox" name="gift" ${d.gift ? 'checked' : ''}> Gift (counts as £0)</label>`}
      <label class="span-2">Bought (where / when)<input class="input" name="boughtAt" value="${esc(d.boughtAt || '')}" placeholder="e.g. Bic Camera, Jan 2026" list="bought"></label>
      <label class="span-2">Date added<input class="input" name="added" type="date" value="${esc(d.added || new Date().toISOString().slice(0, 10))}"></label>
      <label class="span-6">Notes<textarea name="notes" rows="2">${esc(d.notes || '')}</textarea></label>
      <datalist id="ops">${[...new Set(OPS.concat(DB.items.map((i) => i.operator).filter(Boolean)))].map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
      <datalist id="bought">${uniq('boughtAt')}</datalist>
    </div>`;
  }
  // track / scenery / accessory lines tick the "not a train" box
  function bindFields(form) {
    const sel = form.querySelector('[name=line]'), acc = form.querySelector('[name=accessory]'), pw = form.querySelector('[name=powered]');
    sel.onchange = () => { if (L(sel.value).accessory) { acc.checked = true; pw.checked = false; } else if (acc.checked && !L(sel.value).accessory) acc.checked = false; };
  }
  function readFields(form, base) {
    const f = new FormData(form); const o = { ...base };
    const str = (k) => (f.get(k) || '').trim();
    o.number = str('number').toUpperCase(); o.title = str('title') || base.title; o.line = f.get('line');
    o.operator = str('operator'); o.series = str('series'); const c = parseInt(f.get('cars') || '', 10); o.cars = c > 0 ? c : null;
    o.powered = !!f.get('powered'); o.lights = !!f.get('lights'); o.features = str('features');
    o.rarity = f.get('rarity') || 'standard'; o.accessory = !!f.get('accessory');
    o.qty = Math.max(1, parseInt(f.get('qty') || '1', 10)); o.notes = str('notes'); o.added = f.get('added'); o.boughtAt = str('boughtAt');
    if (o.list === 'wishlist') { const t = f.get('targetPrice'); o.targetPrice = t === '' ? null : Number(t); o.whereToBuy = str('whereToBuy'); }
    else { o.gift = !!f.get('gift'); const p = f.get('paid'); o.paid = o.gift || p === '' ? null : Number(p); }
    return o;
  }
  function editForm(it) {
    const area = document.getElementById('edit-area');
    area.innerHTML = `<form class="panel" style="margin-top:20px" id="ef"><h2>Edit details</h2><p class="hint">Changes save to your local collection file.</p>${fieldsHTML(it, it.list)}
      <div class="row" style="margin-top:16px"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" id="cancel">Cancel</button></div></form>`;
    area.scrollIntoView({ behavior: 'smooth' });
    bindFields(document.getElementById('ef'));
    document.getElementById('cancel').onclick = () => area.innerHTML = '';
    document.getElementById('ef').onsubmit = async (e) => {
      e.preventDefault();
      const o = readFields(e.target, it);
      const renamed = o.title !== it.title || o.number !== it.number;
      await API.saveItem(o);
      DB = await API.refreshPrices([o.id]);
      toast('Saved'); renderItem(it.id);
      if (renamed && !it.image) relookup(DB.items.find((x) => x.id === o.id), true);
    };
  }
  // ---------- photo picker ----------
  function photoPicker(it, onPick) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    let cands = (it.imageCandidates || []).slice();
    bg.innerHTML = `<div class="modal"><div class="modal-head"><h3>Choose photo</h3><button class="icon-btn" id="x">✕</button></div>
      <div class="modal-body">
        <div class="row"><input class="input" id="pq" style="flex:1" value="${esc(M.searchQuery(it))}"><button class="btn primary" id="ps">Search online</button><button class="btn" id="pf">Use my own photo…</button></div>
        <div class="row" style="margin-top:10px"><input class="input" id="pu" style="flex:1" placeholder="…or paste an image URL"><button class="btn" id="pub">Use URL</button></div>
        <div class="section-title">Candidates</div><div class="cands" id="pc"></div>
      </div></div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.onclick = (e) => { if (e.target === bg) close(); };
    bg.querySelector('#x').onclick = close;
    function paint() {
      bg.querySelector('#pc').innerHTML = cands.length ? cands.map((c, i) => `<button class="cand ${it.image && it.image.url === c.u ? 'sel' : ''}" data-i="${i}"><img src="${esc(c.th || c.u)}" data-fallback="${esc(c.u)}" referrerpolicy="no-referrer" loading="lazy" alt=""><span>${esc(c.t || '')}</span></button>`).join('') : '<div class="empty">No candidates — search above.</div>';
      bg.querySelectorAll('.cand').forEach((b) => b.onclick = async () => { const c = cands[+b.dataset.i]; await pick(c); });
    }
    async function pick(c) {
      if (onPick) { onPick(c); close(); return; }
      toast('Saving photo…');
      const updated = await API.setImage(it.id, c);
      if (updated) { updated.imageCandidates = cands; await API.saveItem(updated); }
      DB = await API.getDB(); close(); renderItem(it.id);
    }
    bg.querySelector('#ps').onclick = async () => {
      const b = bg.querySelector('#ps'); b.disabled = true; b.textContent = 'Searching…';
      try { const r = await API.imageSearch(bg.querySelector('#pq').value); cands = M.rankCandidates(it, r).concat(cands.filter((c) => !r.some((x) => x.u === c.u))).slice(0, 24); } catch (e) { toast('Search failed — check your connection'); }
      b.disabled = false; b.textContent = 'Search online'; paint();
    };
    bg.querySelector('#pub').onclick = () => { const u = bg.querySelector('#pu').value.trim(); if (/^https?:\/\//.test(u)) pick({ u, th: null, t: 'Pasted URL' }); };
    bg.querySelector('#pf').onclick = async () => {
      if (onPick) { toast('Save the entry first, then add your own photo from its page'); return; }
      const r = await API.setImageFromFile(it.id); if (r) { DB = await API.getDB(); close(); renderItem(it.id); }
    };
    paint();
  }

  // ---------- update details from the (corrected) name ----------
  async function relookup(it, afterRename) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><div class="modal-head"><h3>Find a photo</h3><button class="icon-btn" id="x">✕</button></div>
      <div class="modal-body"><p style="margin-top:0">${afterRename ? 'You changed the name. ' : ''}Looking up <b>${esc(it.title)}</b>…</p></div></div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('#x').onclick = close;
    let cands = [];
    try { cands = M.rankCandidates(it, await API.imageSearch(M.searchQuery(it))); } catch (e) { cands = []; }
    if (!document.body.contains(bg)) return;
    let chosen = cands[0] || null;
    const paint = () => cands.slice(0, 12).map((c, i) => `<button type="button" class="cand ${chosen === c ? 'sel' : ''}" data-i="${i}"><img src="${esc(c.th || c.u)}" data-fallback="${esc(c.u)}" referrerpolicy="no-referrer" alt=""><span>${esc(c.t)}</span></button>`).join('');
    bg.querySelector('.modal-body').innerHTML = `
      <p style="margin-top:0">Photos found for <b>${esc(it.title)}</b>. Pick one, or skip.</p>
      <div class="cands" id="rc">${cands.length ? paint() : '<div class="empty">No photos found online.</div>'}</div>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="apply" ${cands.length ? '' : 'disabled'}>Use this photo</button><button class="btn" id="cancel">Skip</button></div>`;
    const bind = () => bg.querySelectorAll('#rc .cand').forEach((b) => b.onclick = () => { chosen = cands[+b.dataset.i]; bg.querySelector('#rc').innerHTML = paint(); bind(); });
    bind();
    bg.querySelector('#cancel').onclick = close;
    bg.querySelector('#apply').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'Saving…';
      const u = await API.setImage(it.id, chosen);
      if (u) { u.imageCandidates = cands.slice(0, 12).map(({ t, u, th, p }) => ({ t, u, th, p })); await API.saveItem(u); }
      DB = await API.getDB(); close(); toast('Photo saved'); renderItem(it.id);
    };
  }

  // ---------- wishlist → collection ----------
  function gotIt(it) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" style="width:min(460px,100%)"><div class="modal-head"><h3>Got it!</h3><button class="icon-btn" id="x">✕</button></div>
      <form class="modal-body" id="gf"><p style="margin-top:0">Move <b>${esc(it.title)}</b> into your collection.</p>
      <div class="form"><label class="span-3">Price paid (£)<input class="input" name="paid" type="number" step="0.01" value="${it.targetPrice ?? ''}" required></label>
      <label class="span-3">Date<input class="input" name="added" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="span-6">Bought (where / when)<input class="input" name="boughtAt" value="${esc(it.whereToBuy || '')}"></label>
      <label class="span-6 check"><input type="checkbox" name="gift"> It was a gift</label></div>
      <div class="row" style="margin-top:16px"><button class="btn go" type="submit">Move to collection</button></div></form></div>`;
    document.body.appendChild(bg);
    bg.querySelector('#x').onclick = () => bg.remove();
    const gift = bg.querySelector('[name=gift]'), paid = bg.querySelector('[name=paid]');
    gift.onchange = () => { paid.required = !gift.checked; paid.disabled = gift.checked; };
    bg.querySelector('#gf').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const o = { ...it, list: 'collection', gift: !!f.get('gift'), paid: f.get('gift') ? null : Number(f.get('paid')), added: f.get('added'), boughtAt: (f.get('boughtAt') || '').trim(), id: newId('p') };
      delete o.targetPrice; delete o.whereToBuy;
      await API.saveItem(o);
      await API.removeItem(it.id);
      DB = await API.getDB();
      bg.remove(); toast('Added to collection'); location.hash = '#/item/' + o.id;
    };
  }
  function newId(prefix) {
    let n = 1; const ids = new Set(DB.items.map((i) => i.id));
    while (ids.has(prefix + String(n).padStart(3, '0'))) n++;
    return prefix + String(n).padStart(3, '0');
  }

  // ---------- add ----------
  function renderAdd() {
    $app.innerHTML = `<div class="panel" style="max-width:980px">
      <h2>Add an item</h2><p class="hint">Type the name the way it’s on the box, e.g. “S-01 Light-up E5 Hayabusa”, “AS-02 N700S”, “R-01 straight rail” or “EH500 Kintaro &amp; freight set”. Add “limited”, “event”, “lucky bag” or “retired” if it is one. DEPOT works out the line, model number, operator, series, cars and light-up, finds photos online, and you check it all before saving.</p>
      <form id="af"><div class="form">
        <label class="span-3">Name<input class="input" name="name" required autofocus placeholder="e.g. S-36 Spacia X"></label>
        <label class="span-1">Line<select name="line">${lineOptions('auto', true)}</select></label>
        <label class="span-1">Price paid (£)<input class="input" name="paid" type="number" step="0.01"></label>
        <label class="span-1">Add to<select name="list"><option value="collection">Collection</option><option value="wishlist">Wishlist (price = target)</option></select></label>
        <label class="span-3">Bought (where / when)<input class="input" name="boughtAt" placeholder="e.g. Toys R Us, Nov 2023" list="bought2"></label>
        <label class="span-1 check"><input type="checkbox" name="gift"> Gift</label>
        <datalist id="bought2">${uniq('boughtAt')}</datalist>
      </div><div class="row" style="margin-top:16px"><button class="btn red" type="submit" id="lk">Look up details</button></div></form>
      <div id="review"></div></div>`;
    document.getElementById('af').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target); const btn = document.getElementById('lk');
      btn.disabled = true; btn.textContent = 'Looking up…';
      let auto;
      try { auto = await API.autofill(f.get('name'), f.get('line')); } catch (err) { auto = { ...M.parseName(f.get('name'), f.get('line')), imageCandidates: [] }; }
      btn.disabled = false; btn.textContent = 'Look up again';
      const list = f.get('list'); const price = f.get('paid') === '' ? null : Number(f.get('paid'));
      const draft = {
        id: newId(list === 'wishlist' ? 'w' : 'p'), list, title: auto.title, line: auto.line, number: auto.number, operator: auto.operator, series: auto.series,
        cars: auto.cars, powered: auto.powered, lights: auto.lights, features: auto.features, rarity: auto.rarity, accessory: auto.accessory,
        qty: 1, notes: '', original: f.get('name'), boughtAt: (f.get('boughtAt') || '').trim(),
        gift: list === 'collection' && !!f.get('gift'), paid: list === 'collection' && !f.get('gift') ? price : null,
        targetPrice: list === 'wishlist' ? price : undefined, image: null, imageCandidates: auto.imageCandidates || [], added: new Date().toISOString().slice(0, 10),
      };
      let chosen = draft.imageCandidates[0] || null;
      const rv = document.getElementById('review');
      const paintCands = () => `<div class="cands">${draft.imageCandidates.slice(0, 12).map((c, i) => `<button type="button" class="cand ${chosen === c ? 'sel' : ''}" data-i="${i}"><img src="${esc(c.th || c.u)}" data-fallback="${esc(c.u)}" referrerpolicy="no-referrer" alt=""><span>${esc(c.t)}</span></button>`).join('') || '<div class="empty">No photos found — you can add one after saving.</div>'}</div>`;
      rv.innerHTML = `<form id="rf"><div class="section-title">Check the details</div>${fieldsHTML(draft, list)}
        <div class="note">Current value uses ${DB.settings.priceProvider === 'ebay' ? 'eBay UK listings' : 'dummy data until eBay access is approved'}.</div>
        <div class="section-title">Pick a photo</div><div id="cw">${paintCands()}</div>
        <div class="row" style="margin-top:18px"><button class="btn primary" type="submit">Save to ${list}</button></div></form>`;
      bindFields(document.getElementById('rf'));
      const bindC = () => document.querySelectorAll('#cw .cand').forEach((b) => b.onclick = () => { chosen = draft.imageCandidates[+b.dataset.i]; document.getElementById('cw').innerHTML = paintCands(); bindC(); });
      bindC();
      document.getElementById('rf').onsubmit = async (ev) => {
        ev.preventDefault();
        const o = readFields(ev.target, draft);
        await API.saveItem(o);
        if (chosen) { const u = await API.setImage(o.id, chosen); if (u && (chosen.score == null || chosen.score < 6)) { u.imageReview = true; await API.saveItem(u); } }
        DB = await API.refreshPrices([o.id]);
        toast('Saved'); location.hash = '#/item/' + o.id;
      };
    };
  }

  // ---------- settings ----------
  async function renderSettings() {
    const s = DB.settings; const paths = await API.paths();
    const noPhoto = DB.items.filter((i) => !i.image).length;
    $app.innerHTML = `<div class="settings-grid">
      <form class="panel" id="sf"><h2>Values</h2><p class="hint">Where “current value” comes from.</p>
        <div class="form">
          <label class="span-6 check"><input type="radio" name="priceProvider" value="dummy" ${s.priceProvider !== 'ebay' ? 'checked' : ''}> Dummy data (placeholder values from the price paid, or a typical price for the product line)</label>
          <label class="span-6 check"><input type="radio" name="priceProvider" value="ebay" ${s.priceProvider === 'ebay' ? 'checked' : ''}> eBay UK — median asking price of Buy It Now listings</label>
          <label class="span-3">eBay App ID (Client ID)<input class="input" name="ebayAppId" value="${esc(s.ebayAppId || '')}" autocomplete="off"></label>
          <label class="span-3">eBay Cert ID (Client Secret)<input class="input" name="ebayCertId" type="password" value="${esc(s.ebayCertId || '')}" autocomplete="off"></label>
        </div>
        <p class="hint" style="margin-top:10px">Use your <b>Production</b> keys. They're stored only in your local data file.</p>
        <p class="hint" id="ebaystatus"></p>
        <div class="row"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" id="ebaytest">Test eBay keys</button><button class="btn" type="button" id="rp">Refresh all values</button></div>
      </form>
      <form class="panel" id="gf2"><h2>View-only page</h2><p class="hint">Exports a static web page of your collection with <b>all price data removed</b> (paid, current values, P&amp;L, wishlist targets, where you bought it).</p>
        <div class="row"><button class="btn red" type="button" id="ex">${s.githubPublish ? 'Export &amp; publish' : 'Export view-only snapshot'}</button><button class="btn" type="button" id="exo">Open folder</button></div>
        <p class="hint" style="margin-top:12px">Saved to: <span class="model-no">${esc(paths.view)}</span></p>
        <div class="section-title">Publish to GitHub</div>
        <div class="form">
          <label class="span-6 check"><input type="checkbox" name="githubPublish" ${s.githubPublish ? 'checked' : ''}> Also publish to GitHub every time I export</label>
          <label class="span-4">Repository (owner/name)<input class="input" name="githubRepo" value="${esc(s.githubRepo || '')}" placeholder="your-name/your-repo"></label>
          <label class="span-2">Branch<input class="input" name="githubBranch" value="${esc(s.githubBranch || '')}" placeholder="default"></label>
          <label class="span-6">Access token<input class="input" name="githubToken" type="password" value="${esc(s.githubToken || '')}" autocomplete="off" placeholder="github_pat_…"></label>
        </div>
        <p class="hint" style="margin-top:10px">Use a fine-grained token limited to this one repo with <b>Contents: Read and write</b>. It's stored only in your local data file. Only DEPOT's own files are changed in the repo; anything else (README etc.) is left alone.</p>
        <div class="row"><button class="btn primary" type="submit">Save GitHub settings</button><button class="btn" type="button" id="pub">Publish now</button>${s.githubRepo ? `<button class="btn" type="button" id="ghopen">Open repo</button>` : ''}</div>
        <p class="hint" id="ghstatus" style="margin-top:12px">${s.githubLast ? 'Last published ' + esc(new Date(s.githubLast.at).toLocaleString('en-GB')) + (s.githubLast.changed ? ` · ${s.githubLast.uploaded} file(s) updated${s.githubLast.removed ? ', ' + s.githubLast.removed + ' removed' : ''}` : ' · no changes') : 'Not published yet.'}</p>
      </form>
      <div class="panel"><h2>Photos</h2><p class="hint">Photos are downloaded once and kept with your data so they work offline.</p>
        <div class="row"><button class="btn primary" id="ap" ${noPhoto ? '' : 'disabled'}>Find photos for ${noPhoto} entr${noPhoto === 1 ? 'y' : 'ies'} without one</button><button class="btn" id="ci">Download any missing photos</button></div>
        <p class="hint" style="margin-top:12px">Auto-found photos with a weak match are flagged. Photos to check (missing, or auto-matched with low confidence): <a href="#/" id="chk-c">${DB.items.filter((i) => i.list === 'collection' && needsCheck(i)).length} in collection</a> · <a href="#/wishlist" id="chk-w">${DB.items.filter((i) => i.list === 'wishlist' && needsCheck(i)).length} in wishlist</a>. Picking a new photo clears the flag.</p>
      </div>
      <div class="panel"><h2>Data</h2><p class="hint">Everything lives in one JSON file plus an images folder. A backup of the previous version is kept on every save.</p>
        <div class="row"><button class="btn" id="od">Open data folder</button></div>
        <p class="hint" style="margin-top:12px"><span class="model-no">${esc(paths.data)}</span></p>
      </div>
    </div>${foot()}`;
    document.getElementById('sf').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const ns = { priceProvider: f.get('priceProvider'), ebayAppId: f.get('ebayAppId').trim(), ebayCertId: f.get('ebayCertId').trim() };
      if (ns.priceProvider === 'ebay' && (!ns.ebayAppId || !ns.ebayCertId)) { toast('Add both eBay keys first — staying on dummy data'); ns.priceProvider = 'dummy'; }
      DB.settings = await API.saveSettings(ns); toast('Settings saved'); renderTabs('settings');
    };
    document.getElementById('rp').onclick = async (e) => { e.target.disabled = true; e.target.textContent = 'Refreshing…'; await refreshValues(); renderSettings(); };
    document.getElementById('ebaytest').onclick = async (e) => {
      const f = new FormData(document.getElementById('sf')), st = document.getElementById('ebaystatus');
      e.target.disabled = true; st.className = 'hint'; st.textContent = 'Testing with eBay…';
      const r = await API.testEbay(f.get('ebayAppId') || '', f.get('ebayCertId') || '');
      e.target.disabled = false; st.className = 'hint ' + (r.ok ? 'gain' : 'price-err'); st.textContent = (r.ok ? '✓ ' : '⚠ ') + r.message;
    };
    const doExport = async (publish) => {
      const st = document.getElementById('ghstatus'); st.textContent = publish ? 'Exporting and publishing to GitHub…' : 'Exporting…';
      const r = await API.exportViewOnly(publish === undefined ? undefined : { publish });
      DB = await API.getDB();
      if (r.publishError) { st.innerHTML = '<b style="color:var(--loss)">Publish failed:</b> ' + esc(r.publishError); toast('Exported, but publishing failed'); return; }
      if (r.github) { st.textContent = r.github.changed ? `Published: ${r.github.uploaded} file(s) updated${r.github.removed ? ', ' + r.github.removed + ' removed' : ''}.` : 'Published: GitHub was already up to date.'; toast('Exported & published'); }
      else { st.textContent = `Exported ${r.count} entries.`; toast(`Exported ${r.count} entries`); }
    };
    document.getElementById('ex').onclick = () => doExport();
    document.getElementById('pub').onclick = () => doExport(true);
    const gho = document.getElementById('ghopen'); if (gho) gho.onclick = () => API.openUrl('https://github.com/' + DB.settings.githubRepo);
    document.getElementById('gf2').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      DB.settings = await API.saveSettings({ githubPublish: !!f.get('githubPublish'), githubRepo: f.get('githubRepo').trim(), githubBranch: f.get('githubBranch').trim(), githubToken: f.get('githubToken').trim() });
      toast('GitHub settings saved'); renderSettings();
    };
    document.getElementById('exo').onclick = () => API.openPath(paths.view);
    document.getElementById('od').onclick = () => API.openPath(paths.data);
    ['chk-c', 'chk-w'].forEach((id) => document.getElementById(id).onclick = () => { state.review = true; state.line = 'All'; state.q = ''; saveUI(); });
    document.getElementById('ci').onclick = () => { API.cacheImages(); toast('Downloading photos in the background'); };
    document.getElementById('ap').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'Searching… (you can keep using the app)';
      const r = await API.autoPhotos();
      DB = await API.getDB();
      toast(r && r.busy ? 'Already running' : `Found photos for ${r.found} of ${r.total}. Check the flagged ones.`, 4000);
      if (location.hash.startsWith('#/settings')) renderSettings();
    };
  }

  // ---------- router ----------
  // remember where you were in each list, so Back returns to the same spot
  const listScroll = {}; let lastKey = null;
  const routeKey = (h) => { const [a, b] = h.split('/'); return a === 'item' && b ? 'item' : a === 'wishlist' ? 'wishlist' : a === 'add' || a === 'settings' ? a : 'collection'; };
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [a, b, c] = h.split('/');
    const key = routeKey(h), y = window.scrollY;
    if (lastKey === 'collection' || lastKey === 'wishlist') listScroll[lastKey] = y;
    const fromItem = lastKey === 'item', same = key === lastKey && key !== 'item';
    lastKey = key;
    if (a === 'item' && b) { renderTabs('item'); renderItem(b, c === 'edit'); }
    else if (a === 'wishlist') { renderTabs('wishlist'); renderList('wishlist'); }
    else if (a === 'add' && !VIEW) { renderTabs('add'); renderAdd(); }
    else if (a === 'settings' && !VIEW) { renderTabs('settings'); renderSettings(); }
    else { renderTabs('collection'); renderList('collection'); }
    const target = same ? y : fromItem && listScroll[key] ? listScroll[key] : 0;
    window.scrollTo(0, target);
    if (target) { requestAnimationFrame(() => window.scrollTo(0, target)); setTimeout(() => window.scrollTo(0, target), 250); }
  }

  async function boot() {
    if (SNAP) { DB = window.DEPOT_SNAPSHOT || { items: [] }; DB.settings = {}; }
    else {
      DB = await API.getDB();
      API.on('db-changed', async () => { DB = await API.getDB(); if (!document.querySelector('.modal-bg') && !document.getElementById('rf') && !document.getElementById('ef')) route(); });
      API.on('progress', (p) => {
        const el = document.getElementById('progress');
        const what = p.kind === 'github' ? 'Uploading to GitHub' : p.kind === 'autophoto' ? 'Finding photos' : 'Downloading photos';
        el.textContent = p.done < p.total ? `${what} ${p.done}/${p.total}` : '';
      });
    }
    DB.items = DB.items.filter((i) => i.list === 'collection' || i.list === 'wishlist');
    for (const i of DB.items) { if (!i.line) i.line = 'Other'; if (!i.title) i.title = i.number || 'Untitled'; }
    window.addEventListener('hashchange', route);
    document.body.classList.toggle('view-mode', VIEW);
    if (!SNAP) {
      const vb = document.createElement('button');
      vb.className = 'icon-btn view-btn'; vb.id = 'view-btn'; vb.innerHTML = ICON.eye;
      const sync = () => { vb.classList.toggle('on', VIEW); vb.title = VIEW ? 'View mode on — click to turn off' : 'View mode: preview the page without prices or editing'; document.body.classList.toggle('view-mode', VIEW); };
      vb.onclick = () => { VIEW = !VIEW; sync(); if (VIEW && /^#\/(add|settings)/.test(location.hash)) location.hash = '#/'; else route(); };
      document.getElementById('theme-btn').before(vb); sync();
    }
    // floating back-to-top button
    const top = document.createElement('button');
    top.className = 'to-top'; top.title = 'Back to top'; top.setAttribute('aria-label', 'Back to top'); top.textContent = '↑';
    top.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(top);
    const onScroll = () => top.classList.toggle('show', window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    route(); onScroll();
  }
  boot();
})();
