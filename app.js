/* 红楼一梦 · 网页版 app.js */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const state = {
  bench: 'zhi',            // zhi | cheng
  tab: 'home',
  curPerson: '贾宝玉',
  curGather: 'poems',
  curChapter: 1,
  annosOn: true,
  data: { zhi: null, cheng: null, people: null, curated: null },
};

const ANNO_TYPE_NOTE = 'note';   // 校记
const ANNO_LABEL = { zhi: '脂评本 · 八十回', cheng: '程乙本 · 一百二十回' };

/* ---------- 数据加载 ---------- */
async function loadTexts(bench) {
  if (state.data[bench]) return state.data[bench];
  const res = await fetch(`data/${bench === 'zhi' ? 'zhiping' : 'chengben'}.json`);
  state.data[bench] = await res.json();
  return state.data[bench];
}
async function loadPeople() {
  if (state.data.people) return state.data.people;
  const res = await fetch('data/people.json');
  state.data.people = await res.json();
  return state.data.people;
}
async function loadCurated() {
  if (state.data.curated) return state.data.curated;
  const res = await fetch('data/curated.json');
  const cur = await res.json();
  cur.meds = cur.medicines;   // 别名统一
  state.data.curated = cur;
  return cur;
}

/* ---------- 统计 ---------- */
async function renderStats() {
  const [zhi, cheng, people, cur] = await Promise.all([loadTexts('zhi'), loadTexts('cheng'), loadPeople(), loadCurated()]);
  const zChars = zhi.reduce((a, c) => a + c.paras.reduce((b, p) => b + p.text.replace('◆', '').length, 0), 0);
  const cChars = cheng.reduce((a, c) => a + c.paras.reduce((b, p) => b + p.text.length, 0), 0);
  const zAnnos = zhi.reduce((a, c) => a + c.paras.reduce((b, p) => b + p.annos.length, 0), 0);
  const rows = [
    ['正文', `${(zChars / 10000).toFixed(1)} 万字`, `${(cChars / 10000).toFixed(1)} 万字`],
    ['人物', `${people.persons.length} 位`, `${people.persons.length} 位`],
    ['关系', `${people.relations.length} 条`, `${people.relations.length} 条`],
    ['诗词', `${cur.poems.length} 首`, `${cur.poems.length} 首`],
    ['吃食', `${cur.foods.length} 道`, `${cur.foods.length} 道`],
    ['药方', `${cur.meds.length} 帖`, `${cur.meds.length} 帖`],
  ];
  $('#statsBody').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  $('#heroNote').textContent = `脂砚斋等批语 ${zAnnos} 条，跟着原文落位`;
}

/* ---------- 导航 ---------- */
function go(tab) {
  state.tab = tab;
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-view').forEach(v => v.classList.toggle('active', v.id === 'tab-' + tab));
  window.scrollTo(0, 0);
  if (tab === 'home') renderStats();
  if (tab === 'search') setTimeout(() => $('#searchInput').focus(), 50);
  if (tab === 'people') initPeople();
  if (tab === 'gather') initGather();
  if (tab === 'events') initEvents();
  if (tab === 'read') initRead();
  if (tab === 'card') initCard();
}

/* ---------- 搜索 ---------- */
const HOT = ['贾宝玉', '林黛玉', '薛宝钗', '王熙凤', '贾母', '刘姥姥', '晴雯', '袭人', '葬花', '冷香丸', '螃蟹'];
let searchTimer = null;
function initSearch() {
  $('#hotChips').innerHTML = HOT.map(w => `<button onclick="quickSearch('${w}')">${w}</button>`).join('');
  $('#searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (!q) { $('#searchResults').innerHTML = ''; return; }
    searchTimer = setTimeout(() => doSearch(q), 180);
  });
}
function quickSearch(w) { $('#searchInput').value = w; doSearch(w); }

async function doSearch(q) {
  const [people, cur] = await Promise.all([loadPeople(), loadCurated()]);
  const rows = [];
  const add = (type, title, sub, ch, payload) => rows.push({ type, title, sub, ch, payload });

  // 人
  for (const p of people.persons) {
    if (p.name.includes(q)) {
      add('人', p.name, p.desc || `${p.relCount} 条关系`, '', { kind: 'person', name: p.name });
      if (rows.length > 6) break;
    }
  }
  // 诗词/吃食/药方
  for (const [arr, type, k2] of [[cur.poems, '诗', 'poem'], [cur.foods, '食', 'food'], [cur.meds, '药', 'med']]) {
    for (const it of arr) {
      if (it.t.includes(q) || (it.txt && it.txt.includes(q)) || (it.who || []).some(w => w.includes(q))) {
        add(type, it.t, (it.who || []).join('、'), it.ch ? `第 ${it.ch} 回` : '', { kind: k2, item: it, q });
      }
    }
  }
  // 事件
  for (const ev of cur.events) {
    if (ev.t.includes(q) || ev.brief.includes(q) || (ev.who || []).some(w => w.includes(q))) {
      add('事', ev.t, ev.brief, `第 ${ev.ch} 回`, { kind: 'event', ev });
    }
  }
  // 脂批 + 原文（需要文本）
  const text = await loadTexts(state.bench);
  let annoHits = 0, textHits = 0;
  for (const c of text) {
    for (const p of c.paras) {
      for (let ai = 0; ai < p.annos.length; ai++) {
        const a = p.annos[ai];
        if (annoHits < 8 && a.text.includes(q)) {
          annoHits++;
          add('批', a.text.slice(0, 30), `${ANNO_LABEL[state.bench]} · ${c.title}`, `第 ${c.num} 回`,
            { kind: 'anno', ch: c.num, pi: c.paras.indexOf(p), ai });
        }
      }
      if (textHits < 8 && p.text.includes(q)) {
        textHits++;
        const i = p.text.indexOf(q);
        add('文', `…${p.text.slice(Math.max(0, i - 12), i + q.length + 18)}…`, `${ANNO_LABEL[state.bench]} · ${c.title}`, `第 ${c.num} 回`,
          { kind: 'text', ch: c.num, pi: c.paras.indexOf(p), q });
      }
    }
    if (annoHits >= 8 && textHits >= 8) break;
  }
  renderResults(rows, q);
}
function renderResults(rows, q) {
  if (!rows.length) {
    $('#searchResults').innerHTML = `<div style="text-align:center;color:var(--ink-dim);padding:30px 0">「${q}」没有查到什么，换个词试试</div>`;
    return;
  }
  $('#searchResults').innerHTML = rows.map((r, i) => `
    <div class="r-row" onclick="openResult(${i})">
      <span class="r-badge rb-${r.type}">${r.type}</span>
      <div class="r-main">
        <div class="r-title">${esc(r.title)}</div>
        <div class="r-sub">${esc(r.sub || '')}</div>
      </div>
      <span class="r-ch">${r.ch}</span>
    </div>`).join('');
  window._results = rows;
}
async function openResult(i) {
  const r = window._results[i]; if (!r) return;
  const p = r.payload;
  if (p.kind === 'person') { go('people'); selectPerson(p.name); }
  else if (p.kind === 'poem' || p.kind === 'food' || p.kind === 'med') { go('gather'); showGatherDetail(p.item); }
  else if (p.kind === 'event') { go('events'); highlightEvent(p.ev); }
  else if (p.kind === 'anno' || p.kind === 'text') {
    await openReaderAt(p.ch, p.pi, p.q);
  }
}

/* ---------- 人物 ---------- */
async function initPeople() {
  const people = await loadPeople();
  drawGraph(state.curPerson);
  renderPersonList('');
  $('#personFilter').oninput = e => renderPersonList(e.target.value.trim());
}
function personRels(name, people) {
  const rels = people.relations.filter(r => r.a === name || r.b === name);
  const seen = new Map();   // 同一人只保留第一条
  const out = [];
  for (const r of rels) {
    const other = r.a === name ? r.b : r.a;
    if (!seen.has(other)) { seen.set(other, true); out.push(r); }
  }
  return out;
}
function renderPersonList(filter) {
  const people = state.data.people;
  let ps = people.persons;
  if (filter) ps = ps.filter(p => p.name.includes(filter));
  $('#personList').innerHTML = ps.slice(0, 120).map(p =>
    `<button class="${p.name === state.curPerson ? 'big' : ''}" onclick="selectPerson('${p.name}')">${p.name}<small style="color:var(--ink-dim)"> ${p.relCount}</small></button>`
  ).join('');
}
const NODE_COLORS = ['#c96a3b', '#c2679a', '#4fa3a5', '#d9a53b', '#8f7cc9', '#5aa06c', '#b8433a', '#7a95c9'];
function drawGraph(center) {
  const people = state.data.people;
  const rels = personRels(center, people)
    .sort((a, b) => (b.a === center ? 1 : 0) - (a.a === center ? 1 : 0))
    .slice(0, 14);
  const W = 680, H = 520, cx = W / 2, cy = H / 2;
  const nodes = rels.map((r, i) => {
    const ang = (-Math.PI / 2) + (i * 2 * Math.PI / Math.max(rels.length, 6));
    const rad = 170;
    return {
      name: r.a === center ? r.b : r.a,
      rel: r.rel,
      ch: r.ch,
      x: cx + Math.cos(ang) * rad * 1.25,
      y: cy + Math.sin(ang) * rad * 0.85,
      color: NODE_COLORS[i % NODE_COLORS.length],
    };
  });
  let svg = `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}"/>`;
  svg = nodes.map(n =>
    `<line x1="${cx}" y1="${cy}" x2="${n.x}" y2="${n.y}" stroke="rgba(217,180,92,.35)" stroke-width="1.2"/>`
  ).join('');
  svg += nodes.map(n => `
    <g style="cursor:pointer" onclick="selectPerson('${n.name}')">
      <circle cx="${n.x}" cy="${n.y}" r="9" fill="${n.color}"/>
      <text x="${n.x}" y="${n.y + 30}" text-anchor="middle" fill="#ecdcbc" font-size="15">${n.name}</text>
      <text x="${n.x}" y="${n.y - 16}" text-anchor="middle" fill="#9a7c42" font-size="12">${n.rel}</text>
    </g>`).join('');
  svg += `
    <circle cx="${cx}" cy="${cy}" r="22" fill="#c96a3b" stroke="rgba(217,180,92,.5)" stroke-width="2"/>
    <text x="${cx}" y="${cy + 46}" text-anchor="middle" fill="#eccb7f" font-size="18" font-weight="bold">${center}</text>`;
  $('#relGraph').innerHTML = svg;
  $('#graphNote').textContent = `${center} 有 ${personRels(center, people).length} 条关系，图上是关系最多的 ${nodes.length} 位`;
  const me = people.persons.find(p => p.name === center);
  const d = $('#personDetail');
  if (me && (me.desc || rels.length)) {
    d.classList.add('show');
    d.innerHTML = `<b>${esc(center)}</b>　<span style="color:var(--ink-dim)">${esc(me.desc || '')}</span>
      <div style="margin-top:8px;color:var(--ink-dim)">关系：${rels.map(r => `${r.a === center ? r.b : r.a}（${r.rel}${r.ch ? '·第' + r.ch + '回' : ''}）`).join('　')}</div>`;
  } else d.classList.remove('show');
}
async function selectPerson(name) {
  await loadPeople();
  state.curPerson = name;
  drawGraph(name);
  renderPersonList($('#personFilter').value.trim());
  $('#graphTitle').textContent = name;
}

/* ---------- 采 ---------- */
async function initGather() {
  await loadCurated();
  $$('#gatherTabs button').forEach(b => b.onclick = () => {
    state.curGather = b.dataset.g;
    $$('#gatherTabs button').forEach(x => x.classList.toggle('active', x === b));
    renderGather();
  });
  renderGather();
}
function renderGather() {
  const cur = state.data.curated;
  const key = state.curGather;
  const arr = cur[key];
  const label = { poems: '首', foods: '道', meds: '帖' }[key];
  $('#gatherCount').textContent = `共 ${arr.length} ${label}`;
  $('#gatherList').innerHTML = arr.map((it, i) => `
    <div class="g-item" onclick="showGatherDetail(arr_${key}[${i}])">
      <div class="t">${esc(it.t)}</div>
      <div class="m">第 ${it.ch} 回${it.who && it.who.length ? ' · ' + it.who.join('、') : ''}${it.kind ? ' · ' + it.kind : ''}</div>
    </div>`).join('');
  window['arr_' + key] = arr;
  $('#gatherDetail').style.display = 'none';
}
const KIND_LABEL = { poems: '诗', foods: '食', meds: '药' };
function showGatherDetail(it) {
  const kind = state.curGather === 'poems' ? '诗词' : state.curGather === 'foods' ? '吃食' : '药方';
  $('#gatherDetail').style.display = 'block';
  $('#gatherDetail').innerHTML = `
    <div class="d-chips">
      <span class="d-chip">${KIND_LABEL[state.curGather]}</span>
      <span class="d-chip">第 ${it.ch} 回</span>
      ${it.kind ? `<span class="d-chip">${it.kind}</span>` : ''}
    </div>
    <div class="d-label">是 什 么</div>
    <div class="d-text">${esc(it.txt)}</div>
    ${it.who && it.who.length ? `<div class="d-label" style="letter-spacing:.2em">相 关 人 物</div>
      <div class="d-chips">${it.who.map(w => `<span class="d-chip" style="cursor:pointer" onclick="go('people');selectPerson('${w}')">${w}</span>`).join('')}</div>` : ''}
    <div class="d-label">原 文</div>
    <div class="d-quote"><div class="q">${esc(it.txt)}</div><div class="from">—— 第 ${it.ch} 回</div></div>
    <button class="d-jump" onclick="openReaderAt(${it.ch})">去读第 ${it.ch} 回原文 →</button>`;
  $('#gatherDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- 事 ---------- */
async function initEvents() {
  await loadCurated();
  const evs = [...state.data.curated.events].sort((a, b) => a.ch - b.ch);
  $('#evCount').textContent = `共 ${evs.length} 件大事`;
  $('#eventList').innerHTML = evs.map((ev, i) => `
    <div class="e-item" id="ev-${i}" onclick="openReaderAt(${ev.ch})">
      <div class="e-ch">第 ${ev.ch} 回</div>
      <div class="e-t">${esc(ev.t)}</div>
      <div class="e-b">${esc(ev.brief)}</div>
    </div>`).join('');
  window._events = evs;
}
function highlightEvent(ev) {
  const i = window._events.indexOf(ev);
  const el = $('#ev-' + i);
  if (el) { el.style.borderColor = 'var(--gold)'; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

/* ---------- 读 ---------- */
async function initRead() {
  await renderChapterList();
  openChapter(state.curChapter);
}
async function renderChapterList() {
  const text = await loadTexts(state.bench);
  $('#readTitle').textContent = `整本原文 · ${ANNO_LABEL[state.bench]}`;
  $('#readSub').innerHTML = text.map(c =>
    `<button data-ch="${c.num}" onclick="openChapter(${c.num})">第${c.num}回 ${esc(c.title.slice(0, 12))}…</button>`
  ).join('');
}
async function openChapter(num) {
  state.curChapter = num;
  const text = await loadTexts(state.bench);
  const c = text.find(x => x.num === num);
  if (!c) return;
  $$('#readSub button').forEach(b => b.classList.toggle('cur', +b.dataset.ch === num));
  const annoCount = c.paras.reduce((a, p) => a + p.annos.length, 0);
  let html = `<h3>第${c.num}回　${esc(c.title)}</h3>
    <div class="read-mode-tip">${ANNO_LABEL[state.bench]}${state.bench === 'zhi' ? ` · 本章批语 ${annoCount} 条` : ''}</div>`;
  html += c.paras.map((p, pi) => {
    // 按占位符拆分正文，插入批语标记
    const parts = p.text.split('◆');
    let out = '';
    let ai = 0;
    for (let k = 0; k < parts.length; k++) {
      out += esc(parts[k]);
      if (k < parts.length - 1 && ai < p.annos.length) {
        out += `<span class="anno-mark" onclick="showAnno(${num},${pi},${ai})">批</span>`;
        ai++;
      }
    }
    // 占位符数量少于批语数（前段并入的批语），补一个标记
    for (; ai < p.annos.length; ai++) {
      out += `<span class="anno-mark" onclick="showAnno(${num},${pi},${ai})">批</span>`;
    }
    return `<p>${out}</p>`;
  }).join('');
  html += `<div class="read-nav">
    <button ${num <= 1 ? 'disabled' : ''} onclick="openChapter(${num - 1})">← 上一回</button>
    <button ${num >= text.length ? 'disabled' : ''} onclick="openChapter(${num + 1})">下一回 →</button>
  </div>`;
  $('#readerBody').innerHTML = html;
  $('#readerBody').classList.toggle('no-anno', !state.annosOn);
}
async function openReaderAt(ch, pi, q) {
  go('read');
  await renderChapterList();
  await openChapter(ch);
  const el = $('#readerBody');
  if (pi != null) {
    const ps = $$('p', el);
    const target = ps[pi] || ps[0];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.style.transition = 'background .3s';
      target.style.background = 'rgba(217,180,92,.12)';
      setTimeout(() => target.style.background = '', 1600);
    }
  }
}
function showAnno(ch, pi, ai) {
  const text = state.data[state.bench];
  const c = text.find(x => x.num === ch);
  const a = c.paras[pi] && c.paras[pi].annos[ai];
  if (!a) return;
  const isNote = a.icons && a.icons.includes('note');
  $('#annoHead').textContent = isNote ? '校 记' : '脂 批';
  $('#annoBody').textContent = a.text;
  $('#annoPop').style.display = 'block';
}
function closeAnno() { $('#annoPop').style.display = 'none'; }
function toggleAnnos() {
  state.annosOn = !state.annosOn;
  const b = $('#annoToggle');
  b.textContent = state.annosOn ? '批语：开' : '批语：关';
  b.classList.toggle('off', !state.annosOn);
  $('#readerBody').classList.toggle('no-anno', !state.annosOn);
}

/* ---------- 人物卡片 ---------- */
async function initCard() {
  await loadPeople();
  const sel = $('#cardPick');
  if (!sel.options.length) {
    sel.innerHTML = state.data.people.persons.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    sel.value = '林黛玉';
  }
}
async function genCard() {
  await loadPeople();
  const name = $('#cardPick').value;
  const people = state.data.people;
  const p = people.persons.find(x => x.name === name) || { desc: '', relCount: 0 };
  const rels = personRels(name, people).slice(0, 8);
  const cv = $('#cardCanvas');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  // 背景
  ctx.fillStyle = '#1c0e08';
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(W / 2, H * .3, 50, W / 2, H / 2, W);
  grad.addColorStop(0, 'rgba(184,67,58,.22)');
  grad.addColorStop(1, 'rgba(184,67,58,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(217,180,92,.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.strokeStyle = 'rgba(217,180,92,.25)';
  ctx.strokeRect(36, 36, W - 72, H - 72);
  const gold = '#d9b45c', goldHi = '#eccb7f', ink = '#ecdcbc', dim = '#9a7c42';
  ctx.textAlign = 'center';
  // 标头
  ctx.fillStyle = gold;
  ctx.font = '28px "Songti SC", serif';
  ctx.fillText('红  楼  一  梦', W / 2, 110);
  // 大名字
  ctx.fillStyle = goldHi;
  ctx.font = 'bold 110px "Songti SC", "STKaiti", serif';
  ctx.fillText(name, W / 2, 300);
  // 分隔
  ctx.strokeStyle = 'rgba(217,180,92,.4)';
  ctx.beginPath(); ctx.moveTo(W / 2 - 120, 345); ctx.lineTo(W / 2 + 120, 345); ctx.stroke();
  // 简介
  ctx.fillStyle = ink;
  ctx.font = '24px "Songti SC", serif';
  wrapText(ctx, p.desc || '红楼梦中人', W / 2, 400, 480, 42);
  // 关系
  if (rels.length) {
    ctx.fillStyle = dim;
    ctx.font = '20px "Songti SC", serif';
    ctx.fillText('—— 与 之 相 关 ——', W / 2, 520);
    ctx.fillStyle = ink;
    ctx.font = '24px "Songti SC", serif';
    const lines = rels.map(r => `${r.a === name ? r.b : r.a} · ${r.rel}`);
    wrapText(ctx, lines.join('　'), W / 2, 560, 500, 40);
  }
  // 底部
  ctx.fillStyle = dim;
  ctx.font = '18px "Songti SC", serif';
  ctx.fillText(`${p.relCount} 条关系 · 每条标着第几回`, W / 2, 800);
  ctx.fillText('红楼一梦 · 网页版', W / 2, 845);
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const chars = [...text];
  let line = '', yy = y;
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > maxW) {
      ctx.fillText(line, x, yy); line = ch; yy += lh;
    } else line += ch;
  }
  if (line) ctx.fillText(line, x, yy);
}
function saveCard() {
  const a = document.createElement('a');
  a.download = `红楼一梦·${$('#cardPick').value}.png`;
  a.href = $('#cardCanvas').toDataURL('image/png');
  a.click();
}

/* ---------- 底本切换 ---------- */
function switchBench(bench) {
  state.bench = bench;
  $$('#benchSwitch button').forEach(b => b.classList.toggle('active', b.dataset.bench === bench));
  if (state.tab === 'read') { renderChapterList().then(() => openChapter(state.curChapter)); }
  if (state.tab === 'search' && $('#searchInput').value.trim()) doSearch($('#searchInput').value.trim());
}

/* ---------- utils ---------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- boot ---------- */
$$('#tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
$$('#benchSwitch button').forEach(b => b.onclick = () => switchBench(b.dataset.bench));
initSearch();
renderStats();
