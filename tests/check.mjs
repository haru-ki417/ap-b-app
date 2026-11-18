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

const ctx = vm.createContext({});
vm.runInContext(read("js/problems.js") + "\n;globalThis.__ = {FIELDS, PROBLEMS};", ctx);
const { FIELDS, PROBLEMS } = ctx.__;
new vm.Script(read("js/app.js")); // 画面のコードは文法だけ確かめる

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
console.log(`  解答欄 ${items} 個`);

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

// ---------- 配信するファイル ----------
section("オフライン用のファイル");
const sw = read("sw.js");
for (const m of sw.matchAll(/"\.\/([^"]*)"/g)) if (m[1]) ok(existsSync(join(root, m[1])), `sw.js の ${m[1]} がない`);
const manifest = JSON.parse(read("manifest.webmanifest"));
for (const ic of manifest.icons) ok(existsSync(join(root, ic.src)), `manifest の ${ic.src} がない`);
for (const m of read("index.html").matchAll(/(?:href|src)="([^"]+)"/g)) ok(existsSync(join(root, m[1])), `index.html の ${m[1]} がない`);

console.log(failed ? `\n失敗 ${failed} 件` : "\nすべて OK");
process.exit(failed ? 1 : 0);
