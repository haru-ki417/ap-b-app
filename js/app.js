// 画面・解答用紙・採点・過去問の記録・要点カード・本番モード
// 成績や記録は端末の localStorage だけに置く（外部には送らない）
const KANA = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク'];
const KEY = 'apB_v1';
const EXAM_MIN = 150;
const FKEYS = Object.keys(FIELDS);
const CHOICE_KEYS = FKEYS.filter(k => k !== 'sec');
const qno = f => f === 'sec' ? 1 : FKEYS.indexOf(f) + 1; // 本番の問番号

// 本番の問番号の順（分野の順）に並べる。同じ分野の中は、短い問題 → 本番レベルの順
PROBLEMS.sort((x, y) => (FKEYS.indexOf(x.f) - FKEYS.indexOf(y.f)) || ((x.level === 'full') - (y.level === 'full')));

let store = {};
try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { store = {}; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
function st(id) { if (!store[id]) store[id] = { ans: {}, self: {}, graded: false }; return store[id]; }
// 問題以外の記録は _ で始まるキーに置く（問題の id は英小文字で始まる）
const conf = () => (store._conf = store._conf || { fields: [], date: '' });
const pastRec = () => (store._past = store._past || {});
const known = () => (store._cards = store._cards || {});
const myFields = () => conf().fields.length ? conf().fields : CHOICE_KEYS;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const len = (s) => [...(s || '').replace(/\s/g, '')].length;
function norm(s) {
  return (s || '').normalize('NFKC').replace(/[−–—ー‐▲]/g, '-').replace(/[\s,，]/g, '')
    .replace(/(mv|hz|万円|円|時間|ms|秒|分|回|日|個|件|台|つ|種類|ma|g|%|ポイント|週間|週)$/i, '').replace(/^\//, '').toLowerCase();
}
const pctCls = v => v >= 80 ? 'g' : v >= 60 ? 'm' : 'b';
const fieldTag = f => `<span class="tag ${f === 'sec' ? 'must' : ''}">問${qno(f)} ${FIELDS[f].name}</span>`;
const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;

let view = 'practice', curF = 'mine', cur = null, tab = 'q', t0 = 0, tick = null;
let cardG = 'how', cardOnlyNew = false, openPast = null, resetArm = false;

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
const graded = p => store[p.id] && store[p.id].graded;

/* ---------- 画面の切り替え ---------- */
const VIEWS = ['practice', 'past', 'cards', 'record', 'review', 'mock'];
function show(v) {
  view = v; cur = null; clearInterval(tick); tick = null;
  $('#view').classList.add('hidden'); $('#home').classList.remove('hidden');
  VIEWS.forEach(k => $('#v-' + k).classList.toggle('hidden', k !== v));
  const navKey = v === 'review' || v === 'mock' ? 'practice' : v;
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.v === navKey));
  ({ practice: renderPractice, past: renderPast, cards: renderCards, record: renderRecord, review: renderReview, mock: renderMock })[v]();
  if (v === 'mock' && store._exam) tick = setInterval(renderMockClock, 1000);
  window.scrollTo(0, 0);
}
document.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.v === 'practice' ? '' : b.dataset.v; if (b.dataset.v === 'practice') route(); }));

function daysLeft() {
  const d = conf().date; if (!d) return null;
  const t = new Date(d + 'T00:00:00'), now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((t - now) / 86400000);
}

/* ---------- 演習 ---------- */
function renderPractice() {
  const dl = daysLeft();
  $('#countdown').innerHTML = dl === null ? '' : dl > 0 ? `本番まで あと <b>${dl}</b> 日` : dl === 0 ? '<b>今日が本番</b>' : '';
  const wrongN = PROBLEMS.filter(p => graded(p) && p.items.some((_, i) => itemPoint(p, i) !== 1)).length;
  $('#actions').innerHTML = `<a class="btn" href="#mock">${store._exam ? '本番モード（解答中）' : '本番モード（150分）'}</a><a class="btn ghost" href="#review">復習（${wrongN}題）</a>`;
  const chips = [['mine', '自分の分野'], ['all', 'すべて'], ['full', '本番レベル']].concat(FKEYS.map(k => [k, FIELDS[k].name]));
  $('#chips').innerHTML = chips.map(([k, n]) => `<button class="chip ${k === curF ? 'on' : ''}" data-f="${k}">${n}</button>`).join('');
  const mine = ['sec'].concat(myFields());
  const list = PROBLEMS.filter(p => curF === 'all' || (curF === 'mine' ? mine.includes(p.f) : curF === 'full' ? p.level === 'full' : p.f === curF));
  $('#plist').innerHTML = list.map(p => {
    const s = store[p.id];
    let sc = '未着手', cls = '';
    if (s && s.graded) { const r = score(p); sc = r.pct + '%'; cls = pctCls(r.pct); }
    else if (s && Object.keys(s.ans).length) sc = '途中';
    return `<a class="pitem" href="#${p.id}"><div class="t">${fieldTag(p.f)}${p.level === 'full' ? '<span class="tag full">本番レベル</span>' : ''}<span class="sub">目安${p.min}分・${p.items.length}問</span><b>${esc(p.title)}</b></div><div class="score ${cls}">${sc}</div></a>`;
  }).join('') || '<p class="sub">この条件の問題はありません。</p>';
  const done = PROBLEMS.filter(graded);
  const a = avg(done.map(p => score(p).pct));
  $('#summary').innerHTML = `採点済み ${done.length} / ${PROBLEMS.length} 題` + (a !== null ? `　平均 ${a}%` : '') +
    (conf().fields.length ? '' : '<br>「記録」タブで本番に選ぶ分野を設定すると、「自分の分野」で絞り込めます。') +
    `<br>解答と記録はこのスマホの中だけに保存され、オフラインでも使えます。`;
}
$('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; curF = b.dataset.f; renderPractice(); });

/* ---------- 復習 ---------- */
function renderReview() {
  const rows = PROBLEMS.filter(graded).map(p => {
    const miss = p.items.map((it, i) => [it, itemPoint(p, i)]).filter(([, v]) => v !== 1);
    return miss.length ? { p, miss } : null;
  }).filter(Boolean);
  $('#v-review').innerHTML = `<a class="back" href="#">‹ 演習</a><h2>復習</h2>
  <p class="sub">採点した問題のうち、×・△・自己採点待ちの設問がある問題です。開くと解答用紙で正解と解説を確認でき、「解き直す」で白紙に戻せます。</p>` +
    (rows.length ? rows.map(({ p, miss }) => `<a class="pitem" href="#${p.id}"><div class="t">${fieldTag(p.f)}<b>${esc(p.title)}</b>
      <span class="sub">${miss.map(([it, v]) => `${v === null ? '？' : v === 0.5 ? '△' : '×'}〔${it.k}〕${it.l}`).join('　')}</span></div>
      <div class="score ${pctCls(score(p).pct)}">${score(p).pct}%</div></a>`).join('') : '<div class="card">まだ復習する設問はありません。</div>');
}

/* ---------- 本番モード ---------- */
function pickFor(f) {
  const pool = PROBLEMS.filter(p => p.f === f);
  const rank = p => (graded(p) ? 2 : 0) + (p.level === 'full' ? 0 : 1);
  const best = Math.min(...pool.map(rank));
  const cands = pool.filter(p => rank(p) === best);
  return cands[Math.floor(Math.random() * cands.length)];
}
function renderMock() {
  const ex = store._exam;
  let h = `<a class="back" href="#">‹ 演習</a><h2>本番モード</h2>`;
  if (!ex) {
    const sel = store._mockSel || myFields().slice(0, 4);
    h += `<p class="sub">問1（情報セキュリティ）と、選んだ4分野から1題ずつ出題します。制限時間は${EXAM_MIN}分。未着手の本番レベルの問題を優先して選びます。</p>
    <div class="card"><b>選ぶ4分野</b>（${sel.length} / 4）<div class="chips wrapc">` +
      CHOICE_KEYS.map(k => `<button class="chip ${sel.includes(k) ? 'on' : ''}" data-mf="${k}">${FIELDS[k].name}</button>`).join('') +
      `</div><div class="btns"><button class="btn" id="mockStart" ${sel.length === 4 ? '' : 'disabled'}>${EXAM_MIN}分で始める</button></div></div>`;
    const hist = store._mocks || [];
    if (hist.length) h += `<h2>これまでの結果</h2>` + hist.slice().reverse().map(m => `<div class="card mrow"><span>${esc(m.date)}</span><span>${m.fields.map(f => FIELDS[f].name).join('・')}</span><b class="${pctCls(m.score)}">${m.score}点</b></div>`).join('');
  } else {
    h += `<div class="card result"><div class="sub">残り時間</div><div class="big" id="mockClock"></div></div>
    <p class="sub">各問題を開いて解き、解答用紙で採点してください。記述の自己採点まで終えたら「終了して結果を見る」を押します。</p>`;
    ex.ids.forEach((id, i) => {
      const p = PROBLEMS.find(x => x.id === id); if (!p) return;
      const s = store[id]; const r = score(p);
      const stt = s && s.graded ? (r.pend ? `採点済み（記述 ${r.pend} 問が自己採点待ち）` : `${r.pct}%`) : s && Object.keys(s.ans).length ? '解答中' : '未着手';
      h += `<a class="pitem" href="#${id}"><div class="t">${fieldTag(p.f)}<b>${i + 1}. ${esc(p.title)}</b><span class="sub">${stt}</span></div></a>`;
    });
    h += `<div class="btns"><button class="btn" id="mockEnd">終了して結果を見る</button></div>
    <div class="btns"><button class="btn ghost" id="mockQuit">${resetArm ? 'もう一度押すと記録せずにやめます' : '記録せずにやめる'}</button></div>`;
  }
  $('#v-mock').innerHTML = h;
  renderMockClock();
}
function mockLeft() { const ex = store._exam; return ex ? ex.start + EXAM_MIN * 60000 - Date.now() : 0; }
function fmtLeft(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function renderMockClock() {
  const el = $('#mockClock'); if (!el || !store._exam) return;
  const ms = mockLeft(); el.textContent = ms > 0 ? fmtLeft(ms) : '時間切れ'; el.classList.toggle('over', ms <= 0);
}
$('#v-mock').addEventListener('click', e => {
  const c = e.target.closest('[data-mf]');
  if (c) {
    const sel = store._mockSel || myFields().slice(0, 4), k = c.dataset.mf;
    store._mockSel = sel.includes(k) ? sel.filter(x => x !== k) : sel.length < 4 ? sel.concat(k) : sel;
    save(); renderMock(); return;
  }
  if (e.target.id === 'mockStart') {
    const sel = store._mockSel || myFields().slice(0, 4);
    const fields = ['sec'].concat(sel.slice().sort((a, b) => FKEYS.indexOf(a) - FKEYS.indexOf(b)));
    const ids = fields.map(f => pickFor(f).id);
    ids.forEach(id => { store[id] = { ans: {}, self: {}, graded: false }; });
    store._exam = { ids, fields: sel, start: Date.now() }; save(); show('mock'); return;
  }
  if (e.target.id === 'mockEnd') {
    const ex = store._exam, ps = ex.ids.map(id => PROBLEMS.find(p => p.id === id));
    const sc = Math.round(ps.reduce((a, p) => a + (graded(p) ? score(p).got / p.items.length : 0), 0) / ps.length * 100);
    const d = new Date();
    (store._mocks = store._mocks || []).push({ date: `${d.getMonth() + 1}/${d.getDate()}`, fields: ex.fields, score: sc, ids: ex.ids,
      min: Math.round((Date.now() - ex.start) / 60000) });
    store._exam = null; save();
    $('#v-mock').innerHTML = `<a class="back" href="#">‹ 演習</a><h2>本番モードの結果</h2>
      <div class="card result"><div class="big ${pctCls(sc)}">${sc}点</div><div class="sub">${sc >= 60 ? '合格ライン（60点）を超えています' : '合格ラインは60点です'}・かかった時間 ${store._mocks.slice(-1)[0].min}分</div></div>` +
      ps.map(p => `<a class="pitem" href="#${p.id}"><div class="t">${fieldTag(p.f)}<b>${esc(p.title)}</b></div><div class="score ${pctCls(score(p).pct)}">${graded(p) ? score(p).pct + '%' : '未採点'}</div></a>`).join('') +
      `<p class="sub">点数は、各問題の設問ごとの正解の割合（△は半分）を平均したものです。本番の配点とは異なります。</p>`;
    clearInterval(tick); return;
  }
  if (e.target.id === 'mockQuit') {
    if (!resetArm) { resetArm = true; renderMock(); setTimeout(() => { resetArm = false; }, 4000); return; }
    resetArm = false; store._exam = null; save(); show('mock');
  }
});

/* ---------- 過去問 ---------- */
function renderPast() {
  const cols = ['sec'].concat(myFields());
  const rec = pastRec();
  const cnt = f => PAST.filter(s => rec[s.id] && rec[s.id][f]).length;
  let h = `<h2>IPAの過去問（午後）</h2>
  <p class="sub">本番の科目Bと同じ形式の、IPAが公開している午後の過去問題です。時間を測って解き、解答例で採点して点数を記録しましょう。問題冊子・解答例・採点講評はIPAのサイトのPDFを開きます（ネット接続が必要）。</p>
  <div class="card"><b>解いた回数</b><div class="pgrid">` +
    cols.map(f => `<span>問${qno(f)} ${FIELDS[f].name}</span><b>${cnt(f)} / ${PAST.length}</b>`).join('') + `</div>` +
    (conf().fields.length ? '' : `<p class="sub">「記録」タブで本番に選ぶ分野を設定すると、その分野だけ表示されます。</p>`) + `</div>`;
  PAST.forEach(s => {
    const r = rec[s.id] || {};
    h += `<div class="card past"><div class="ph"><b>${s.name}</b><span class="links">
      <a href="${pastUrl(s, 'qs')}" target="_blank" rel="noopener">問題</a><a href="${pastUrl(s, 'ans')}" target="_blank" rel="noopener">解答例</a><a href="${pastUrl(s, 'cmnt')}" target="_blank" rel="noopener">講評</a></span></div>
      <div class="pchips">` + cols.map(f => {
        const x = r[f];
        return `<button class="pchip ${x ? pctCls(x.pct) : ''} ${openPast === s.id + '/' + f ? 'sel' : ''}" data-ps="${s.id}" data-pf="${f}">問${qno(f)}<small>${x ? x.pct + '%' : FIELDS[f].s}</small></button>`;
      }).join('') + `</div>`;
    if (openPast && openPast.startsWith(s.id + '/')) {
      const f = openPast.split('/')[1], x = r[f] || {};
      h += `<div class="pedit"><div class="lab">${s.name} 問${qno(f)} ${FIELDS[f].name}</div>
        <label>正解した設問の割合（%）<input class="num" id="pPct" inputmode="numeric" value="${x.pct ?? ''}" placeholder="0〜100"></label>
        <label>メモ（間違えた理由・覚えること）<textarea id="pMemo">${esc(x.memo || '')}</textarea></label>
        <div class="btns"><button class="btn" id="pSave">記録する</button>${x.pct !== undefined ? '<button class="btn ghost" id="pDel">記録を消す</button>' : ''}</div>
        ${x.date ? `<div class="sub">記録した日：${esc(x.date)}</div>` : ''}</div>`;
    }
    h += `</div>`;
  });
  h += `<p class="sub">出典：独立行政法人情報処理推進機構（IPA）「問題冊子・配点割合・解答例・採点講評」。令和2年度春期は試験が中止されたため問題がありません。2026年度からのCBTの問題は公開されていません。</p>`;
  $('#v-past').innerHTML = h;
}
$('#v-past').addEventListener('click', e => {
  const c = e.target.closest('[data-ps]');
  if (c) { const k = c.dataset.ps + '/' + c.dataset.pf; openPast = openPast === k ? null : k; renderPast(); return; }
  if (e.target.id === 'pSave' || e.target.id === 'pDel') {
    const [sid, f] = openPast.split('/'), rec = pastRec();
    rec[sid] = rec[sid] || {};
    if (e.target.id === 'pDel') delete rec[sid][f];
    else {
      const v = Math.round(Number(norm($('#pPct').value)));
      if (!(v >= 0 && v <= 100)) { $('#pPct').classList.add('bad'); return; }
      const d = new Date();
      rec[sid][f] = { pct: v, memo: $('#pMemo').value, date: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` };
    }
    openPast = null; save(); renderPast();
  }
});

/* ---------- 要点カード ---------- */
function renderCards() {
  const groups = Object.entries(CARD_GROUPS).concat(FKEYS.filter(k => CARDS.some(c => c.f === k)).map(k => [k, FIELDS[k].name]));
  const kn = known();
  const list = CARDS.map((c, i) => ({ c, i })).filter(({ c, i }) => c.f === cardG && !(cardOnlyNew && kn[i]));
  const total = CARDS.filter(c => c.f === cardG).length, done = CARDS.filter((c, i) => c.f === cardG && kn[i]).length;
  $('#v-cards').innerHTML = `<h2>要点カード</h2><p class="sub">タップすると答えが出ます。覚えたら「覚えた」を押すと、次から外せます。</p>
  <div class="chips">` + groups.map(([k, n]) => `<button class="chip ${k === cardG ? 'on' : ''}" data-cg="${k}">${n}</button>`).join('') + `</div>
  <div class="crow"><span class="sub">覚えた ${done} / ${total}</span><button class="chip ${cardOnlyNew ? 'on' : ''}" id="onlyNew">まだ覚えていないものだけ</button></div>` +
    list.map(({ c, i }) => `<div class="fcard" data-ci="${i}"><div class="fq">${esc(c.q)}</div><div class="fa hidden">${esc(c.a)}</div>
      <div class="fk"><button class="kbtn ${kn[i] ? 'on' : ''}" data-ki="${i}">${kn[i] ? '覚えた ✓' : '覚えた'}</button></div></div>`).join('') +
    (list.length ? '' : '<div class="card">このグループのカードはすべて覚えました。</div>');
}
$('#v-cards').addEventListener('click', e => {
  const g = e.target.closest('[data-cg]'); if (g) { cardG = g.dataset.cg; renderCards(); return; }
  if (e.target.id === 'onlyNew') { cardOnlyNew = !cardOnlyNew; renderCards(); return; }
  const k = e.target.closest('[data-ki]');
  if (k) { const kn = known(), i = k.dataset.ki; if (kn[i]) delete kn[i]; else kn[i] = 1; save(); const y = window.scrollY; renderCards(); window.scrollTo(0, y); return; }
  const c = e.target.closest('.fcard'); if (c) c.querySelector('.fa').classList.toggle('hidden');
});

/* ---------- 記録・設定 ---------- */
function renderRecord() {
  const c = conf(), rec = pastRec(), kn = known();
  let h = `<h2>設定</h2><div class="card"><label>本番の日<input type="date" class="num" id="examDate" value="${esc(c.date)}"></label>
    <div class="lab" style="margin-top:10px">本番で選ぶ分野（候補も含めて選べます）</div><div class="chips wrapc">` +
    CHOICE_KEYS.map(k => `<button class="chip ${c.fields.includes(k) ? 'on' : ''}" data-sf="${k}">${FIELDS[k].name}</button>`).join('') +
    `</div><p class="sub">選んだ分野は「演習」の「自分の分野」、「過去問」、「本番モード」で使います。</p></div>
    <h2>分野別の成績</h2><div class="card"><table class="stat"><tr><th>分野</th><th>演習</th><th>過去問</th><th>カード</th></tr>`;
  FKEYS.forEach(f => {
    const ex = avg(PROBLEMS.filter(p => p.f === f && graded(p)).map(p => score(p).pct));
    const pa = avg(PAST.map(s => rec[s.id] && rec[s.id][f] && rec[s.id][f].pct).filter(v => v !== undefined && v !== null));
    const cs = CARDS.map((x, i) => [x, i]).filter(([x]) => x.f === f);
    const cell = v => v === null ? '<td class="sub">—</td>' : `<td class="${pctCls(v)}">${v}%</td>`;
    h += `<tr class="${f === 'sec' || c.fields.includes(f) ? 'mine' : ''}"><td>問${qno(f)} ${FIELDS[f].name}</td>${cell(ex)}${cell(pa)}<td class="sub">${cs.length ? cs.filter(([, i]) => kn[i]).length + '/' + cs.length : '—'}</td></tr>`;
  });
  h += `</table><p class="sub">太字は本番で選ぶ分野。60%未満（赤）の分野から優先して復習しましょう。</p></div>
    <h2>パソコンで使う</h2><div class="card"><p class="sub">パソコンのブラウザでも同じURL（haru-ki417.github.io/ap-b-app）で使えます。画面が広いと、左に問題、右に解答用紙が並び、本番のCBTと同じようにキーボードで解答を入力できます。ChromeやEdgeでは、アドレスバーの右端のインストールボタン（またはメニューの「アプリとしてインストール」）から、アプリとしてデスクトップに置けます。</p></div>
    <h2>記録の引き継ぎ（スマホ ⇔ パソコン）</h2><div class="card">
    <p class="sub">記録は端末ごと（ブラウザ・ホーム画面のアプリごと）に別々に保存されます。別の端末で続けるときは、ここで書き出した記録を、もう一方の端末の「読み込む」に貼り付けてください。</p>
    <div class="btns"><button class="btn" id="expBtn">記録を書き出す</button></div>
    <div id="expArea" class="hidden"><textarea id="expText" readonly></textarea>
      <div class="btns"><button class="btn ghost" id="expCopy">コピー</button><button class="btn ghost" id="expFile">ファイルに保存</button></div>
      <p class="sub" id="expMsg">コピーして、LINEのKeepやメモ、メールなどでもう一方の端末に送ってください。</p></div>
    <div class="lab" style="margin-top:12px">読み込む（いまの記録は置き換わります）</div>
    <textarea id="impText" placeholder="書き出した記録を貼り付け"></textarea>
    <div class="btns"><label class="btn ghost filebtn">ファイルを選ぶ<input type="file" id="impFile" accept=".json,application/json,text/plain" hidden></label><button class="btn" id="impBtn">${impArm ? 'もう一度押すと置き換えます' : '読み込む'}</button></div>
    <p class="sub" id="impMsg"></p></div>
    <h2>データ</h2><div class="card"><p class="sub">記録はこの端末のこのアプリの中だけにあります。</p>
    <div class="btns"><button class="btn ghost" id="resetAll">${resetArm ? 'もう一度押すとすべて消えます' : 'すべての記録を消す'}</button></div></div>`;
  $('#v-record').innerHTML = h;
}
$('#v-record').addEventListener('click', e => {
  const f = e.target.closest('[data-sf]');
  if (f) { const c = conf(), k = f.dataset.sf; c.fields = c.fields.includes(k) ? c.fields.filter(x => x !== k) : c.fields.concat(k); c.fields.sort((a, b) => FKEYS.indexOf(a) - FKEYS.indexOf(b)); delete store._mockSel; save(); renderRecord(); return; }
  if (e.target.id === 'resetAll') {
    if (!resetArm) { resetArm = true; renderRecord(); setTimeout(() => { resetArm = false; if (view === 'record' && !cur) renderRecord(); }, 4000); return; }
    resetArm = false; store = {}; save(); renderRecord();
  }
});
$('#v-record').addEventListener('change', e => {
  if (e.target.id === 'examDate') { conf().date = e.target.value; save(); }
  if (e.target.id === 'impFile' && e.target.files[0]) {
    const r = new FileReader();
    r.onload = () => { $('#impText').value = r.result; $('#impMsg').textContent = 'ファイルを読み込みました。「読み込む」を押してください。'; };
    r.readAsText(e.target.files[0]);
  }
});

/* ---------- 記録の書き出し・読み込み ---------- */
let impArm = false;
const EXPORT_TAG = 'apB-record';
function exportText() { return JSON.stringify({ app: EXPORT_TAG, v: 1, at: new Date().toISOString(), data: store }); }
function parseImport(text) {
  let o; try { o = JSON.parse(text.trim()); } catch (e) { return null; }
  if (!o || o.app !== EXPORT_TAG || typeof o.data !== 'object' || Array.isArray(o.data)) return null;
  return o;
}
function recordSummary(d) {
  const probs = Object.keys(d).filter(k => !k.startsWith('_') && d[k] && d[k].graded).length;
  const past = Object.values(d._past || {}).reduce((a, x) => a + Object.keys(x).length, 0);
  return `採点済みの問題 ${probs} 題・過去問の記録 ${past} 件・覚えたカード ${Object.keys(d._cards || {}).length} 枚`;
}
$('#v-record').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'expBtn') { $('#expArea').classList.remove('hidden'); $('#expText').value = exportText(); $('#expMsg').textContent = recordSummary(store) + '。コピーして、もう一方の端末に送ってください。'; return; }
  if (id === 'expCopy') {
    const t = $('#expText'); t.select();
    (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => { $('#expMsg').textContent = 'コピーしました。'; },
      () => { try { document.execCommand('copy'); $('#expMsg').textContent = 'コピーしました。'; } catch (err) { $('#expMsg').textContent = '選択した文字を長押ししてコピーしてください。'; } });
    return;
  }
  if (id === 'expFile') {
    const d = new Date(), name = `apB-record-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('#expText').value], { type: 'application/json' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); $('#expMsg').textContent = `${name} を保存しました（保存できない環境では「コピー」を使ってください）。`;
    return;
  }
  if (id === 'impBtn') {
    const o = parseImport($('#impText').value);
    if (!o) { $('#impMsg').textContent = 'このアプリで書き出した記録ではないようです。全部をそのまま貼り付けてください。'; impArm = false; return; }
    if (!impArm) { impArm = true; e.target.textContent = 'もう一度押すと置き換えます'; $('#impMsg').textContent = `読み込む記録：${recordSummary(o.data)}。いまの記録（${recordSummary(store)}）は置き換わります。`; return; }
    impArm = false; store = o.data; save(); renderRecord(); $('#impMsg').textContent = '読み込みました。'; return;
  }
});

/* ---------- 問題を開く ---------- */
function open(id) {
  cur = PROBLEMS.find(p => p.id === id);
  if (!cur) { show('practice'); return; }
  $('#home').classList.add('hidden'); $('#view').classList.remove('hidden');
  $('#vttl').textContent = cur.title;
  const inExam = store._exam && store._exam.ids.includes(id);
  $('#backBtn').textContent = inExam ? '‹ 本番' : '‹ 一覧';
  t0 = Date.now(); clearInterval(tick); tick = setInterval(updTimer, 1000); updTimer();
  renderQ(); renderS(); renderE(); setTab('q');
  window.scrollTo(0, 0);
}
function updTimer() {
  if (!cur) return;
  if (store._exam && store._exam.ids.includes(cur.id)) {
    const ms = mockLeft(); $('#timer').textContent = ms > 0 ? `残り ${fmtLeft(ms)}` : '時間切れ'; return;
  }
  const s = Math.floor((Date.now() - t0) / 1000);
  $('#timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} / 目安${cur.min}分`;
}
// 幅の広い画面（PCなど）では、左に問題、右に解答用紙か解説を並べる
const WIDE = window.matchMedia('(min-width: 1000px)');
function setTab(t) {
  const wide = WIDE.matches;
  if (wide && t === 'q') t = tab === 'e' ? 'e' : 's';
  tab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  ['q', 's', 'e'].forEach(k => $('#pane-' + k).classList.toggle('hidden', !(k === t || (wide && k === 'q'))));
  if (wide) { $('#pane-' + t).scrollTop = 0; } else window.scrollTo(0, 0);
}
WIDE.addEventListener('change', () => { if (cur) setTab(tab === 'e' ? 'e' : WIDE.matches ? 's' : 'q'); });
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.t)));
$('#backBtn').addEventListener('click', () => {
  const back = store._exam && cur && store._exam.ids.includes(cur.id) ? 'mock' : (VIEWS.includes(lastView) ? lastView : 'practice');
  location.hash = back === 'practice' ? '' : back; if (back === 'practice') route();
});

function groupHtml(it, title) {
  return `<div class="grp"><div class="gh">${title}</div>` + it.o.map((o, j) => `<div>${KANA[j]}　${esc(o)}</div>`).join('') + '</div>';
}
function renderQ() {
  const body = cur.body.replace(/\{\{g:([a-z])\}\}/g, (_, k) => {
    const it = cur.items.find(x => x.k === k);
    return it ? groupHtml(it, it.g || `〔${k}〕の解答群`) : '';
  });
  $('#pane-q').innerHTML = `<p class="sub">${fieldTag(cur.f)}${cur.level === 'full' ? '<span class="tag full">本番レベル</span>' : ''}目安${cur.min}分</p>` + body +
    `<div class="btns to-sheet"><button class="btn" onclick="setTab('s')">解答用紙へ</button></div>`;
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
  const inExam = store._exam && store._exam.ids.includes(cur.id);
  $('#pane-e').innerHTML = `<h2>解答・解説</h2>` + cur.exp +
    `<div class="btns"><button class="btn ghost" onclick="setTab('s')">解答用紙へ</button><button class="btn" id="next">${inExam ? '本番モードに戻る' : '次の問題'}</button></div>`;
}
$('#pane-e').addEventListener('click', e => {
  if (e.target.id === 'peek') { peekExp = true; renderE(); peekExp = false; }
  if (e.target.id === 'next') {
    if (store._exam && store._exam.ids.includes(cur.id)) { location.hash = 'mock'; return; }
    const k = PROBLEMS.indexOf(cur), n = PROBLEMS[(k + 1) % PROBLEMS.length];
    location.hash = n.id;
  }
});

/* ---------- ルーティング ---------- */
let lastView = 'practice';
function route() {
  const id = location.hash.slice(1);
  if (id && PROBLEMS.some(p => p.id === id)) { open(id); return; }
  const v = VIEWS.includes(id) ? id : 'practice';
  if (['practice', 'past', 'cards', 'record', 'review'].includes(v)) lastView = v;
  show(v);
}
window.addEventListener('hashchange', route);
route();

// オフライン対応（ホーム画面アプリ用）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
