// 画面・解答用紙・採点・成績の保存（成績は端末の localStorage だけに置く）
const KANA = ['ア','イ','ウ','エ','オ','カ','キ','ク'];
const KEY = 'apB_v1';
let store = {};
try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { store = {}; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
function st(id) { if (!store[id]) store[id] = { ans: {}, self: {}, graded: false }; return store[id]; }

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const len = (s) => [...(s || '').replace(/\s/g, '')].length;
function norm(s) {
  return (s || '').normalize('NFKC').replace(/[−–—ー‐▲]/g, '-').replace(/[\s,，]/g, '')
    .replace(/(mv|hz|万円|時間|分|回|日|個|件|つ|種類|ma|g)$/i, '').replace(/^\//, '').toLowerCase();
}

let curF = 'all', cur = null, tab = 'q', t0 = 0, tick = null;

/* ---------- 一覧 ---------- */
function renderHome() {
  const chips = [['all', 'すべて']].concat(Object.entries(FIELDS).map(([k, v]) => [k, v.name]));
  $('#chips').innerHTML = chips.map(([k, n]) => `<button class="chip ${k === curF ? 'on' : ''}" data-f="${k}">${n}</button>`).join('');
  const list = PROBLEMS.filter(p => curF === 'all' || p.f === curF);
  $('#plist').innerHTML = list.map(p => {
    const s = store[p.id], F = FIELDS[p.f];
    let sc = '未着手', cls = '';
    if (s && s.graded) { const r = score(p); sc = r.pct + '%'; cls = r.pct >= 80 ? 'g' : r.pct >= 60 ? 'm' : 'b'; }
    else if (s && Object.keys(s.ans).length) sc = '途中';
    return `<a class="pitem" href="#${p.id}"><div class="t"><span class="tag ${p.f === 'sec' ? 'must' : ''}">${F.name}</span><span class="sub">目安${p.min}分・${p.items.length}問</span><b>${esc(p.title)}</b></div><div class="score ${cls}">${sc}</div></a>`;
  }).join('');
  const done = PROBLEMS.filter(p => store[p.id] && store[p.id].graded);
  const avg = done.length ? Math.round(done.reduce((a, p) => a + score(p).pct, 0) / done.length) : 0;
  $('#summary').innerHTML = `採点済み ${done.length} / ${PROBLEMS.length} 題` + (done.length ? `　平均 ${avg}%` : '') +
    `<br>解答と採点結果はこのスマホの中だけに保存され、オフラインでも使えます。`;
}
$('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; curF = b.dataset.f; renderHome(); });

/* ---------- 採点 ---------- */
function itemPoint(p, i) {
  const it = p.items[i], s = st(p.id), v = s.ans[i];
  if (it.t === 'c') return v === it.a ? 1 : 0;
  if (it.t === 'n') return it.a.map(norm).includes(norm(v)) ? 1 : 0;
  const m = s.self[i]; return m === 'o' ? 1 : m === 'm' ? 0.5 : m === 'x' ? 0 : null;
}
function score(p) {
  let got = 0, pend = 0;
  p.items.forEach((_, i) => { const v = itemPoint(p, i); if (v === null) pend++; else got += v; });
  return { got, pend, n: p.items.length, pct: Math.round(got / p.items.length * 100) };
}

/* ---------- 問題を開く ---------- */
function open(id) {
  cur = PROBLEMS.find(p => p.id === id);
  if (!cur) { close(); return; }
  $('#home').classList.add('hidden'); $('#view').classList.remove('hidden');
  $('#vttl').textContent = cur.title;
  t0 = Date.now(); clearInterval(tick); tick = setInterval(updTimer, 1000); updTimer();
  renderQ(); renderS(); renderE(); setTab('q');
  window.scrollTo(0, 0);
}
function close() {
  clearInterval(tick); cur = null;
  $('#view').classList.add('hidden'); $('#home').classList.remove('hidden'); renderHome();
}
function updTimer() {
  const s = Math.floor((Date.now() - t0) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  $('#timer').textContent = `${mm}:${ss} / 目安${cur.min}分`;
}
function setTab(t) {
  tab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  ['q', 's', 'e'].forEach(k => $('#pane-' + k).classList.toggle('hidden', k !== t));
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.t)));
$('#backBtn').addEventListener('click', () => { location.hash = ''; close(); });

function groupHtml(it, title) {
  return `<div class="grp"><div class="gh">${title}</div>` + it.o.map((o, j) => `<div>${KANA[j]}　${esc(o)}</div>`).join('') + '</div>';
}
function renderQ() {
  const body = cur.body.replace(/\{\{g:([a-z])\}\}/g, (_, k) => {
    const it = cur.items.find(x => x.k === k);
    return it ? groupHtml(it, it.g || `〔${k}〕の解答群`) : '';
  });
  $('#pane-q').innerHTML = `<p class="sub"><span class="tag ${cur.f === 'sec' ? 'must' : ''}">${FIELDS[cur.f].name}</span>目安${cur.min}分</p>` + body +
    `<div class="btns"><button class="btn" onclick="setTab('s')">解答用紙へ</button></div>`;
}

/* ---------- 解答用紙（全問題で共通の形式） ---------- */
function renderS() {
  const s = st(cur.id), g = s.graded;
  let h = `<div class="sheet-h"><h2>解答用紙</h2><span class="sub">${esc(cur.title)}</span></div>`;
  if (g) {
    const r = score(cur);
    h += `<div class="card result"><div class="big">${r.pct}%</div><div class="sub">${r.got} / ${r.n} 点` +
      (r.pend ? `（記述 ${r.pend} 問が自己採点待ち）` : '') + `</div></div>`;
  }
  cur.items.forEach((it, i) => {
    const v = s.ans[i], pt = g ? itemPoint(cur, i) : null;
    const cls = !g || pt === null ? '' : pt === 1 ? 'ok' : pt === 0 ? 'ng' : 'md';
    h += `<div class="row ${cls}"><div class="no">${i + 1}</div><div class="bd"><div class="lab">〔${it.k}〕 ${it.l}</div>`;
    if (it.t === 'c') {
      h += '<div class="opts">' + it.o.map((_, j) =>
        `<button class="opt ${v === j ? 'sel' : ''} ${g && j === it.a ? 'ans' : ''}" data-i="${i}" data-j="${j}" ${g ? 'disabled' : ''}>${KANA[j]}</button>`).join('') + '</div>';
      if (!it.hideG) h += `<details class="peek"><summary>解答群を見る</summary>${it.o.map((o, j) => `${KANA[j]}　${esc(o)}`).join('<br>')}</details>`;
      else h += `<div class="peek">解答群は1つ上と共通</div>`;
      if (g) h += `<div class="fb">正解：<b>${KANA[it.a]}</b>　${esc(it.o[it.a])}</div>`;
    } else if (it.t === 'n') {
      h += `<input class="num" data-i="${i}" autocomplete="off" value="${esc(v || '')}" ${g ? 'disabled' : ''} placeholder="数値・アドレスを入力">`;
      if (g) h += `<div class="fb">正解：<b>${esc(it.a[0])}</b></div>`;
    } else {
      const n = len(v);
      h += `<textarea data-i="${i}" ${g ? 'disabled' : ''} placeholder="${it.lim}字以内で記述">${esc(v || '')}</textarea>` +
        `<div class="cnt ${n > it.lim ? 'over' : ''}" id="cnt${i}">${n} / ${it.lim}字</div>`;
      if (g) {
        const nv = (v || '').normalize('NFKC');
        h += `<div class="fb">解答例：<div class="ma">${esc(it.a)}</div>キーワード：` +
          it.kw.map(alts => `<span class="kw ${alts.some(a => nv.includes(a.normalize('NFKC'))) ? 'hit' : ''}">${esc(alts[0])}</span>`).join('') +
          (n > it.lim ? `<div style="color:var(--ng)">字数オーバー（本番では減点・0点の可能性）</div>` : '') +
          `<div class="self">自己採点 <button data-i="${i}" data-m="o" class="${s.self[i] === 'o' ? 'on' : ''}">○</button><button data-i="${i}" data-m="m" class="${s.self[i] === 'm' ? 'on' : ''}">△</button><button data-i="${i}" data-m="x" class="${s.self[i] === 'x' ? 'on' : ''}">×</button></div></div>`;
      }
    }
    h += '</div></div>';
  });
  h += g
    ? `<div class="btns"><button class="btn ghost" id="retry">解き直す</button><button class="btn" onclick="setTab('e')">解説を読む</button></div>`
    : `<div class="btns"><button class="btn" id="grade">採点する</button></div>`;
  $('#pane-s').innerHTML = h;
}
$('#pane-s').addEventListener('click', e => {
  const s = st(cur.id);
  const o = e.target.closest('.opt');
  if (o && !s.graded) { const i = +o.dataset.i, j = +o.dataset.j; s.ans[i] = s.ans[i] === j ? undefined : j; save(); renderS(); return; }
  const m = e.target.closest('.self button');
  if (m) { s.self[+m.dataset.i] = m.dataset.m; save(); const y = window.scrollY; renderS(); window.scrollTo(0, y); return; }
  if (e.target.id === 'grade') { s.graded = true; save(); renderS(); renderE(); window.scrollTo(0, 0); return; }
  if (e.target.id === 'retry') { store[cur.id] = { ans: {}, self: {}, graded: false }; save(); t0 = Date.now(); renderS(); renderE(); window.scrollTo(0, 0); }
});
$('#pane-s').addEventListener('input', e => {
  const el = e.target; if (!el.dataset || el.dataset.i === undefined) return;
  const i = +el.dataset.i, s = st(cur.id); s.ans[i] = el.value; save();
  if (el.tagName === 'TEXTAREA') {
    const it = cur.items[i], n = len(el.value), c = $('#cnt' + i);
    c.textContent = `${n} / ${it.lim}字`; c.classList.toggle('over', n > it.lim);
  }
});

/* ---------- 解説 ---------- */
let peekExp = false;
function renderE() {
  const s = st(cur.id);
  if (!s.graded && !peekExp) {
    $('#pane-e').innerHTML = `<div class="lock">採点すると解説が表示されます。<div class="btns"><button class="btn ghost" id="peek">採点せずに見る</button></div></div>`;
    return;
  }
  $('#pane-e').innerHTML = `<h2>解答・解説</h2>` + cur.exp +
    `<div class="btns"><button class="btn ghost" onclick="setTab('s')">解答用紙へ</button><button class="btn" id="next">次の問題</button></div>`;
}
$('#pane-e').addEventListener('click', e => {
  if (e.target.id === 'peek') { peekExp = true; renderE(); peekExp = false; }
  if (e.target.id === 'next') {
    const k = PROBLEMS.indexOf(cur), n = PROBLEMS[(k + 1) % PROBLEMS.length];
    location.hash = n.id;
  }
});

/* ---------- ルーティング ---------- */
function route() { const id = location.hash.slice(1); if (id && PROBLEMS.some(p => p.id === id)) open(id); else close(); }
window.addEventListener('hashchange', route);
route();

// オフライン対応（ホーム画面アプリ用）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
