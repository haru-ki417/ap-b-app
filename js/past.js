// IPA が公開している応用情報技術者試験 午後の過去問題（問題冊子・解答例・採点講評）
// 出典：独立行政法人情報処理推進機構（IPA）https://www.ipa.go.jp/shiken/mondai-kaiotu/index.html
// 問番号と分野の対応：問1 情報セキュリティ（必須）、問2〜11 は FIELDS の note の順
const PAST_BASE = 'https://www.ipa.go.jp/shiken/mondai-kaiotu/';
const PAST = [
  { id: 'r07a', name: '令和7年度 秋期', dir: 'nl10bi0000009lh8-att/2025r07a' },
  { id: 'r07h', name: '令和7年度 春期', dir: 'nl10bi0000009lh8-att/2025r07h' },
  { id: 'r06a', name: '令和6年度 秋期', dir: 'm42obm000000afqx-att/2024r06a' },
  { id: 'r06h', name: '令和6年度 春期', dir: 'm42obm000000afqx-att/2024r06h' },
  { id: 'r05a', name: '令和5年度 秋期', dir: 'ps6vr70000010d6y-att/2023r05a' },
  { id: 'r05h', name: '令和5年度 春期', dir: 'ps6vr70000010d6y-att/2023r05h' },
  { id: 'r04a', name: '令和4年度 秋期', dir: 'gmcbt80000008smf-att/2022r04a' },
  { id: 'r04h', name: '令和4年度 春期', dir: 'gmcbt80000009sgk-att/2022r04h' },
  { id: 'r03a', name: '令和3年度 秋期', dir: 'gmcbt8000000apad-att/2021r03a' },
  { id: 'r03h', name: '令和3年度 春期', dir: 'gmcbt8000000d5ru-att/2021r03h' },
  { id: 'r02o', name: '令和2年度 10月', dir: 'gmcbt8000000d05l-att/2020r02o' },
];
const pastUrl = (p, kind) => `${PAST_BASE}${p.dir}_ap_pm_${kind}.pdf`; // kind: qs 問題冊子 / ans 解答例 / cmnt 採点講評
