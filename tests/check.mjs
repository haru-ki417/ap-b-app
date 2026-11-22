// 問題データのテスト
// 使い方: node tests/check.mjs
// 1. 問題データの形（解答群・正解の番号・解答例の字数・解答群の差し込み）を確かめる
// 2. 計算・トレースの問題は、問題文どおりの処理をここでもう一度計算し、正解と一致するか確かめる
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(root, p), "utf8");

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error("  NG: " + msg); } };
const section = name => console.log("■ " + name);

// index.html と同じ順にデータのスクリプトを読み込む（app.js は画面のコードなので文法だけ確かめる）
const scripts = [...read("index.html").matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const ctx = vm.createContext({});
vm.runInContext(scripts.filter(f => f !== "js/app.js").map(read).join("\n") +
  "\n;globalThis.__ = {FIELDS, PROBLEMS, PAST, CARDS, CARD_GROUPS, pastUrl};", ctx);
const { FIELDS, PROBLEMS, PAST, CARDS, CARD_GROUPS, pastUrl } = ctx.__;
new vm.Script(read("js/app.js"));

const len = s => [...s.replace(/\s/g, "")].length;

section(`問題データ ${PROBLEMS.length} 題`);
const ids = new Set();
let items = 0;
for (const p of PROBLEMS) {
  const at = `${p.id}（${p.title}）`;
  ok(!ids.has(p.id), `${at}: id が重複している`); ids.add(p.id);
  ok(/^[a-z0-9-]+$/.test(p.id), `${at}: id は英小文字・数字・ハイフンだけにする（URL の # に使う）`);
  ok(FIELDS[p.f], `${at}: 分野 ${p.f} がない`);
  ok(p.min > 0 && p.body.trim() && p.exp.trim(), `${at}: 目安時間・問題文・解説のどれかがない`);
  const keys = p.items.map(it => it.k);
  ok(new Set(keys).size === keys.length, `${at}: 解答欄の記号が重複している`);
  for (const k of keys) ok(p.body.includes(`〔${k}〕`) || p.body.includes(`〔 ${k} 〕`), `${at}: 問題文に〔${k}〕がない`);
  const groups = [...p.body.matchAll(/\{\{g:([a-z])\}\}/g)].map(m => m[1]);
  for (const g of groups) ok(keys.includes(g), `${at}: 解答群 {{g:${g}}} の解答欄がない`);
  for (const it of p.items) {
    items++;
    const ia = `${at} 〔${it.k}〕`;
    ok(["c", "n", "w"].includes(it.t), `${ia}: 種類 ${it.t} が不明`);
    if (it.t === "c") {
      ok(it.o.length >= 2 && new Set(it.o).size === it.o.length, `${ia}: 解答群が足りないか重複している`);
      ok(Number.isInteger(it.a) && it.a >= 0 && it.a < it.o.length, `${ia}: 正解の番号が範囲外`);
      ok(it.hideG || groups.includes(it.k), `${ia}: 解答群が問題文に表示されない`);
    }
    if (it.t === "n") ok(Array.isArray(it.a) && it.a.length > 0, `${ia}: 正解の候補がない`);
    if (it.t === "w") {
      ok(it.lim > 0 && len(it.a) <= it.lim, `${ia}: 解答例が ${len(it.a)} 字で、${it.lim} 字を超えている`);
      ok(it.kw.length > 0 && it.kw.every(alts => alts.some(a => it.a.includes(a))), `${ia}: 解答例にキーワードが入っていない`);
    }
  }
}
for (const f of Object.keys(FIELDS)) ok(PROBLEMS.some(p => p.f === f), `分野 ${f} の問題がない`);
for (const p of PROBLEMS) ok(p.level === undefined || p.level === "full", `${p.id}: level は full か なし`);
console.log(`  解答欄 ${items} 個（うち本番レベル ${PROBLEMS.filter(p => p.level === "full").length} 題）`);

section(`過去問 ${PAST.length} 回・要点カード ${CARDS.length} 枚`);
ok(new Set(PAST.map(s => s.id)).size === PAST.length, "過去問の id が重複している");
for (const s of PAST) for (const k of ["qs", "ans", "cmnt"]) ok(/^https:\/\/www\.ipa\.go\.jp\/shiken\/mondai-kaiotu\/[\w-]+-att\/20\d\dr0\d[aho]_ap_pm_(qs|ans|cmnt)\.pdf$/.test(pastUrl(s, k)), `過去問 ${s.name} の URL の形がおかしい: ${pastUrl(s, k)}`);
for (const c of CARDS) ok((FIELDS[c.f] || CARD_GROUPS[c.f]) && c.q.trim() && c.a.trim(), `カード「${c.q.slice(0, 15)}」の分野か内容がない`);
ok(new Set(CARDS.map(c => c.q)).size === CARDS.length, "要点カードの問いが重複している");

// ---------- 計算・トレースの再計算 ----------
section("計算・トレースの問題を解き直す");
const ans = (id, k) => {
  const it = PROBLEMS.find(p => p.id === id).items.find(x => x.k === k);
  return it.t === "c" ? it.o[it.a] : it.a[0];
};
const same = (id, k, v) => ok(String(ans(id, k)) === String(v), `${id}〔${k}〕: 正解 ${ans(id, k)}、計算すると ${v}`);

// p1 二分探索（要素番号は 1 から）
function binSearch(data, target) {
  let low = 1, high = data.length, loops = 0;
  while (low <= high) {
    loops++;
    const mid = Math.floor((low + high) / 2);
    if (data[mid - 1] === target) return [mid, loops];
    if (data[mid - 1] < target) low = mid + 1; else high = mid - 1;
  }
  return [-1, loops];
}
const d9 = [3, 8, 12, 17, 21, 25, 30, 34, 41];
same("p1", "c", binSearch(d9, 34)[0]);
same("p1", "d", binSearch(d9, 34)[1]);
same("p1", "e", binSearch(d9, 5)[1]);
const big = Array.from({ length: 1000 }, (_, i) => 2 * i);
let worst = 0;
for (let t = -1; t <= 2000; t++) worst = Math.max(worst, binSearch(big, t)[1]);
same("p1", "f", worst);
ok(ans("p1", "a") === "mid ＋ 1" && ans("p1", "b") === "mid − 1", "p1〔a〕〔b〕: 範囲の狭め方が違う");

// p2 ハッシュ表（オープンアドレス法、要素番号は 1 から 11）
const table = Array(12).fill(-1), pos = {}, loops = {};
for (const key of [25, 36, 14, 5, 47]) {
  let h = (key % 11) + 1, n = 0;
  while (table[h] !== -1) { h = (h % 11) + 1; n++; }
  table[h] = key; pos[key] = h; loops[key] = n;
}
same("p2", "b", pos[36]);
same("p2", "c", pos[5]);
same("p2", "d", loops[47]);

// p3 硬貨の最小枚数（動的計画法）と貪欲法
const coins = [1, 4, 6], amount = 8, dp = Array(amount + 1).fill(Infinity);
dp[0] = 0;
for (let i = 1; i <= amount; i++) for (const c of coins) if (c <= i && dp[i - c] + 1 < dp[i]) dp[i] = dp[i - c] + 1;
same("p3", "b", dp[3]);
same("p3", "c", dp[amount]);
let rest = amount, greedy = 0;
for (const c of [...coins].sort((a, b) => b - a)) { greedy += Math.floor(rest / c); rest %= c; }
same("p3", "d", greedy);

// d3 更新の喪失
same("d3", "a", 10 - 5);
same("d3", "b", 10 - 3 - 5);

// n1 サブネット設計（大きいセグメントから詰めて割り当てる）
const ip = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
const base = (192 << 24 >>> 0) + (168 << 16) + (10 << 8);
let next = base;
const seg = {};
for (const [name, hosts] of [["開発", 100], ["営業", 50], ["総務", 20], ["サーバ", 10]]) {
  let prefix = 32;
  while ((2 ** (32 - prefix)) - 2 < hosts + 1) prefix--;
  const size = 2 ** (32 - prefix);
  seg[name] = { prefix, net: next, bc: next + size - 1, usable: size - 2, mask: ip((0xffffffff << (32 - prefix)) >>> 0) };
  next += size;
}
same("n1", "a", seg["開発"].prefix);
same("n1", "b", seg["営業"].prefix);
ok(ip(seg["営業"].net) === "192.168.10.128", "n1: 営業のネットワークアドレスが問題文と違う");
same("n1", "c", ip(seg["営業"].bc));
same("n1", "d", seg["総務"].mask);
same("n1", "e", ip(seg["サーバ"].net));
same("n1", "f", seg["サーバ"].usable);

// e1 脈拍計
same("e1", "a", (Math.round(3.3 / 1024 * 1000 * 10) / 10).toFixed(1));
same("e1", "b", 1 / 0.05);
same("e1", "c", 240 / 60 * 2);
same("e1", "d", 10 / 0.05);
const avg = 10 * (5 / 50) + 0.1 * (45 / 50);
same("e1", "e", avg.toFixed(2));
same("e1", "f", Math.floor(220 / avg));

// e2 合成加速度
same("e2", "a", Math.hypot(1.2, -1.6, 1.5).toFixed(1));
ok(Math.hypot(1.2, -1.6, 1.5) >= 2.5 - 1e-9 && ans("e2", "b") === "確認中に遷移する", "e2〔b〕: 2.5G 以上なので確認中に遷移するはず");

// m1 EVM
const PV = 600, EV = 480, AC = 540, BAC = 1000;
same("m1", "a", EV - PV);
same("m1", "b", EV - AC);
same("m1", "c", (EV / AC).toFixed(2));
ok(PROBLEMS.find(p => p.id === "m1").items.find(x => x.k === "d").a.includes(String(EV / PV)), "m1〔d〕: SPI が違う");
same("m1", "e", BAC / (EV / AC));

// m2 クリティカルパス（最早終了日を前から計算）
function finish(dur) {
  const pre = { A: [], B: ["A"], C: ["A"], D: ["B"], E: ["C"], F: ["D", "E"] }, ef = {};
  for (const t of "ABCDEF") ef[t] = Math.max(0, ...pre[t].map(x => ef[x])) + dur[t];
  return ef;
}
const dur = { A: 3, B: 4, C: 2, D: 5, E: 6, F: 2 };
const ef = finish(dur);
same("m2", "a", ef.F);
same("m2", "b", ef.A + dur.B + dur.D >= ef.A + dur.C + dur.E ? "A→B→D→F" : "A→C→E→F");
same("m2", "c", ef.F - (ef.A + dur.C + dur.E + dur.F));
same("m2", "d", finish({ ...dur, B: dur.B - 2 }).F);
same("m2", "e", finish({ ...dur, E: dur.E + 3 }).F);

// v1 稼働率
same("v1", "a", Math.round(30 * 24 * 60 * 0.001 * 10) / 10);
same("v1", "b", (0.99 * 0.98).toFixed(4));
same("v1", "c", ((1 - 0.01 ** 2) * 0.98).toFixed(4));
same("v1", "d", 480 / (480 + 20));

// b1 損益分岐点
const price = 20000, vc = 12000, fc = 4000e4, cm = price - vc;
same("b1", "a", cm / price * 100);
same("b1", "b", fc / cm);
same("b1", "c", (fc + 1200e4) / cm);
same("b1", "d", ((7500 - fc / cm) / 7500 * 100).toFixed(1));
same("b1", "e", fc / (price - (vc - 2000)));

// a1 APサーバの台数と M/M/1
const perServer = 4 * (1000 / 50);
same("a1", "a", perServer);
same("a1", "b", Math.ceil(150 / (perServer * 0.7)));
same("a1", "c", Math.ceil(150 / (perServer * 0.7)) + 1);
const mm1 = (lam, ts) => { const rho = lam * ts; return [rho, ts / (1 - rho) * 1000]; };
same("a1", "d", Number(mm1(40, 0.02)[0].toFixed(3)));
same("a1", "e", Math.round(mm1(40, 0.02)[1]));
same("a1", "f", Math.round(mm1(45, 0.02)[1]));

// k1 送料計算のテスト設計：境界の両側の値と、分岐網羅に必要なケース
const ship = x => (x < 1 || x > 99999) ? "err" : x >= 5000 ? 0 : x >= 3000 ? 300 : 600;
const classes = new Set(), bad = new Set();
for (let x = -5; x <= 100005; x++) { const v = ship(x); (v === "err" ? bad : classes).add(v === "err" ? (x < 1 ? "low" : "high") : v); }
same("k1", "a", classes.size);
same("k1", "b", bad.size);
const edges = [];
for (let x = -5; x <= 100005; x++) if (String(ship(x)) !== String(ship(x + 1))) edges.push(x, x + 1);
same("k1", "d", new Set(edges).size);
ok(ship(4999) === 300 && ship(5000) === 0 && ans("k1", "c") === "4,999円と5,000円", "k1〔c〕: 送料無料の境界が違う");
// 分岐網羅：3 つの判定それぞれの真と偽を通す、最少のケース数を総当たりで求める
const path = x => (x < 1 || x > 99999) ? ["T"] : x >= 5000 ? ["F", "T"] : x >= 3000 ? ["F", "F", "T"] : ["F", "F", "F"];
const reps = [0, 6000, 4000, 1000, 100000];
const need = ["0T", "0F", "1T", "1F", "2T", "2F"];
let best = Infinity;
for (let m = 1; m < 1 << reps.length; m++) {
  const got = new Set();
  reps.forEach((x, i) => { if (m >> i & 1) path(x).forEach((r, j) => got.add(j + r)); });
  if (need.every(n => got.has(n))) best = Math.min(best, m.toString(2).split("1").length - 1);
}
same("k1", "e", best);

// k2 ベロシティ
const vel = (18 + 22 + 20) / 3;
same("k2", "a", vel);
same("k2", "b", Math.ceil(120 / vel));
same("k2", "c", Math.ceil(120 / vel) * 2);

// ---------- 本番レベルの問題 ----------
// pf1 最小ヒープ
function heapPush(h, x) { h.push(x); let i = h.length - 1, n = 0; while (i > 1 && h[Math.floor(i / 2)] > h[i]) { [h[i], h[Math.floor(i / 2)]] = [h[Math.floor(i / 2)], h[i]]; i = Math.floor(i / 2); n++; } return n; }
function heapPop(h) {
  const top = h[1]; h[1] = h[h.length - 1]; h.pop(); const size = h.length - 1; let i = 1;
  while (2 * i <= size) { let c = 2 * i; if (c + 1 <= size && h[c + 1] < h[c]) c++; if (h[i] <= h[c]) break; [h[i], h[c]] = [h[c], h[i]]; i = c; }
  return top;
}
const hp = [null], swaps = [8, 3, 5, 1, 9, 2].map(x => heapPush(hp, x));
same("pf1", "c", hp[3]); same("pf1", "d", hp[6]); same("pf1", "e", swaps[3]);
same("pf1", "f", heapPop(hp)); same("pf1", "g", hp[1]); same("pf1", "h", hp[3]);
same("pf1", "i", heapPush([null, ...Array.from({ length: 1023 }, (_, i) => i + 1)], 0));
ok(ans("pf1", "a") === "i ÷ 2 の商" && ans("pf1", "b") === "c ＋ 1", "pf1〔a〕〔b〕が違う");

// pf2 ダイクストラ法
{
  const n = 5, w = Array.from({ length: n + 1 }, () => Array(n + 1).fill(-1));
  for (const [a, b, c] of [[1, 2, 4], [1, 3, 1], [2, 3, 2], [2, 4, 5], [3, 4, 8], [3, 5, 12], [4, 5, 3]]) w[a][b] = w[b][a] = c;
  const dist = Array(n + 1).fill(Infinity), done = Array(n + 1).fill(false), prev = Array(n + 1).fill(0), order = [];
  dist[1] = 0;
  for (let k = 1; k <= n; k++) {
    let u = 0;
    for (let i = 1; i <= n; i++) if (!done[i] && (u === 0 || dist[i] < dist[u])) u = i;
    done[u] = true; order.push(u);
    for (let v = 1; v <= n; v++) if (w[u][v] !== -1 && !done[v] && dist[u] + w[u][v] < dist[v]) { dist[v] = dist[u] + w[u][v]; prev[v] = u; }
  }
  same("pf2", "c", order[2]); same("pf2", "d", dist[4]); same("pf2", "e", dist[5]); same("pf2", "f", prev[2]);
  const path = [5]; while (path[0] !== 1) path.unshift(prev[path[0]]);
  same("pf2", "g", path.join("→"));
}

// pf3 逆ポーランド記法
function rpn(s, swap = false) {
  const st = []; let max = 0;
  for (const t of s.split(" ")) {
    if (/^\d+$/.test(t)) st.push(Number(t));
    else { let r = st.pop(), l = st.pop(); if (swap) [l, r] = [r, l]; st.push({ "＋": l + r, "−": l - r, "×": l * r, "÷": Math.trunc(l / r) }[t]); }
    max = Math.max(max, st.length);
  }
  return [st[0], max];
}
same("pf3", "b", rpn("8 2 5 × ＋ 3 −")[0]); same("pf3", "c", rpn("8 2 5 × ＋ 3 −")[1]);
same("pf3", "e", rpn("1 2 ＋ 3 ＋ 4 ＋")[1]); same("pf3", "f", rpn("1 2 3 4 ＋ ＋ ＋")[1]);
ok(rpn("3 4 ＋ 5 2 − ×")[0] === 21, "pf3: 本文の例が 21 にならない");
const broken = ["＋", "−", "×", "÷"].filter(op => rpn(`7 2 ${op}`)[0] !== rpn(`7 2 ${op}`, true)[0]);
ok(broken.join("") === "−÷" && ans("pf3", "g") === "− と ÷", "pf3〔g〕: 取り違えで壊れる演算子が違う");
// 中置記法 → 後置記法（操車場アルゴリズム）で〔d〕を確かめる
{
  const prec = { "＋": 1, "−": 1, "×": 2, "÷": 2 }, out = [], ops = [];
  for (const t of "a × ( b ＋ c ) − d ÷ e".split(" ")) {
    if (t === "(") ops.push(t);
    else if (t === ")") { while (ops.at(-1) !== "(") out.push(ops.pop()); ops.pop(); }
    else if (prec[t]) { while (ops.length && prec[ops.at(-1)] >= prec[t]) out.push(ops.pop()); ops.push(t); }
    else out.push(t);
  }
  while (ops.length) out.push(ops.pop());
  same("pf3", "d", out.join(" "));
}

// nf1・nf2
same("nf1", "e", 2 ** (32 - 26) - 2);
{ const interval = 5, timeout = 2, fails = 3; same("nf2", "b", interval * fails + timeout); }

// df2 障害回復（チェックポイント 10:00、障害 10:05）
{
  const cp = 1000, txs = { a: [950, 955], b: [958, 1002], c: [959, null], d: [1001, 1003], e: [1004, null] };
  for (const [k, [s, c]] of Object.entries(txs)) {
    const need = c !== null ? (c < cp ? "何もしない" : "ロールフォワード") : (s < cp ? "ロールバック" : "何もしない");
    same("df2", k, need);
  }
  same("df2", "h", 200 * 50 * 8 * 3600 / 1e6);
}

// af1・af2
same("af1", "a", 1200000 * 5 / 1000 / 60);
same("af1", "b", 1200000 * 5 / 1000 / 60 / 8);
same("af1", "c", Math.max(1200000 * 3 / 4, 1200000 * 2 / 8) / 1000 / 60);
same("af1", "d", (1 / (0.1 + 0.9 / 8)).toFixed(1));
same("af2", "a", ((1 - 0.02 ** 2) * 0.99 * 100).toFixed(2));
same("af2", "b", (4 - 1) * 2);
same("af2", "c", 1);

// ef1・ef2
same("ef1", "a", 6 * 60 * 24);
same("ef1", "b", 6 * 60 * 24 * 8);
same("ef1", "c", 60 * 24 * (40 + 6 * 8));
same("ef2", "d", 12 * 0.75);
same("ef2", "e", Math.round(3.14 * 70 * 1000 / 360));

// kf1 時間帯の重なり：総当たりで正しい条件と、「重ならない」組を確かめる
{
  const overlap = (s1, e1, s2, e2) => { for (let t = Math.min(s1, s2); t < Math.max(e1, e2); t++) if (s1 <= t && t < e1 && s2 <= t && t < e2) return true; return false; };
  const forms = { "s2 ≦ e1 and s1 ≦ e2": (s1, e1, s2, e2) => s2 <= e1 && s1 <= e2, "s2 ＜ e1 and s1 ＜ e2": (s1, e1, s2, e2) => s2 < e1 && s1 < e2,
    "s1 ＜ s2 and e2 ＜ e1": (s1, e1, s2, e2) => s1 < s2 && e2 < e1, "s2 ＞ e1 or s1 ＞ e2": (s1, e1, s2, e2) => s2 > e1 || s1 > e2 };
  const right = Object.keys(forms).filter(f => { for (let s1 = 0; s1 < 6; s1++) for (let e1 = s1 + 1; e1 <= 6; e1++) for (let s2 = 0; s2 < 6; s2++) for (let e2 = s2 + 1; e2 <= 6; e2++) if (forms[f](s1, e1, s2, e2) !== overlap(s1, e1, s2, e2)) return false; return true; });
  ok(right.length === 1, "kf1: 正しい条件がちょうど1つでない");
  same("kf1", "d", right[0]);
  const m = t => { const [h, mi] = t.split(":").map(Number); return h * 60 + mi; };
  const it = PROBLEMS.find(p => p.id === "kf1").items.find(x => x.k === "e");
  const noOverlap = it.o.filter(o => { const [, a, b, c, d] = o.match(/既存 ([\d:]+)〜([\d:]+)、新規 ([\d:]+)〜([\d:]+)/); return !overlap(m(a), m(b), m(c), m(d)); });
  ok(noOverlap.length === 1, "kf1〔e〕: 重ならない組がちょうど1つでない");
  same("kf1", "e", noOverlap[0]);
}

// kf2 テストの品質評価
{
  const rows = { 受注: [10, 700, 45], 出荷: [20, 600, 5], 請求: [10, 500, 10] };
  const tot = Object.values(rows).reduce((a, r) => a.map((v, i) => v + r[i]), [0, 0, 0]);
  same("kf2", "a", tot[1] / tot[0]); same("kf2", "b", tot[2] / tot[0]); same("kf2", "e", rows.受注[2] / rows.受注[0]);
  const weakest = Object.entries(rows).sort((x, y) => x[1][1] / x[1][0] - y[1][1] / y[1][0])[0][0];
  same("kf2", "d", weakest);
}

// uf2 SLA
same("uf2", "b", Math.round(30 * 24 * 60 * 0.005));

// ---------- 配信するファイル ----------
section("オフライン用のファイル");
const sw = read("sw.js");
for (const m of sw.matchAll(/"\.\/([^"]*)"/g)) if (m[1]) ok(existsSync(join(root, m[1])), `sw.js の ${m[1]} がない`);
const manifest = JSON.parse(read("manifest.webmanifest"));
for (const ic of manifest.icons) ok(existsSync(join(root, ic.src)), `manifest の ${ic.src} がない`);
for (const m of read("index.html").matchAll(/(?:href|src)="([^"]+)"/g)) ok(existsSync(join(root, m[1])), `index.html の ${m[1]} がない`);

console.log(failed ? `\n失敗 ${failed} 件` : "\nすべて OK");
process.exit(failed ? 1 : 0);
