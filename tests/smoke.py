"""スマホ幅のブラウザーで開き、解答・採点・解説・オフライン起動まで通るか確かめる。

使い方: pip install playwright && python -m playwright install chromium
        python3 tests/smoke.py            （CHROME_PATH で使うブラウザーを指定できる）
"""
import functools, http.server, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


server = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
port = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://localhost:{port}/"

failed = []
def check(cond, msg):
    print(("  OK  " if cond else "  NG  ") + msg)
    if not cond:
        failed.append(msg)

with sync_playwright() as p:
    opts = {"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}
    browser = p.chromium.launch(**opts)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(url)
    total = page.evaluate("PROBLEMS.length")
    check(page.locator(".pitem").count() == total, f"一覧に {total} 題が並ぶ")
    page.evaluate("navigator.serviceWorker.ready")
    time.sleep(1)

    page.click(".chip[data-f=prog]")
    check(page.locator(".pitem").count() == page.evaluate("PROBLEMS.filter(p=>p.f==='prog').length"), "分野で絞り込める")
    page.click(".chip[data-f=all]")

    # セキュリティの1題目：選択・記述・自己採点
    page.click(".pitem >> nth=0")
    page.locator("#pane-q .grp").first.wait_for()  # 一覧から問題に切り替わるのを待つ（# の変化は非同期）
    check("指摘1" in page.inner_text("#pane-q"), "問題タブに問題文が出る")
    check(page.locator("#pane-q .grp").count() >= 2, "解答群が問題文に差し込まれる")
    page.click(".tab[data-t=s]")
    page.click('.opt[data-i="0"][data-j="2"]')
    page.fill('textarea[data-i="2"]', "出力時に特殊文字をエスケープする")
    check(page.inner_text("#cnt2").startswith("16 /"), "記述欄の字数が数えられる")
    page.fill('textarea[data-i="4"]', "あ" * 31)
    check("over" in page.get_attribute("#cnt4", "class"), "字数オーバーが赤く出る")
    page.click("#grade")
    check(page.locator(".row.ok").count() >= 1, "選択問題が自動で採点される")
    page.click('.self button[data-i="2"][data-m="o"]')
    check("2 / 5" in page.inner_text(".result"), "自己採点が得点に入る")
    page.click(".tab[data-t=e]")
    check("SQLインジェクション" in page.inner_text("#pane-e"), "採点後に解説が出る")

    # 数値入力（全角・単位つきでも正解になる）
    page.goto(url + "#p1")
    page.click(".tab[data-t=s]")
    page.fill('input[data-i="2"]', "８")
    page.fill('input[data-i="5"]', "10回")
    page.click("#grade")
    check(page.locator(".row.ok").count() == 2, "全角数字や単位つきの数値も正解になる")

    page.goto(url)
    check("%" in page.locator(".pitem >> nth=0").inner_text(), "一覧に得点が残る")
    saved = page.evaluate("Object.keys(JSON.parse(localStorage.getItem('apB_v1'))).filter(k => !k.startsWith('_')).length")
    check(saved == 2, "成績が端末に保存される")

    # 記録：本番の日と選ぶ分野
    page.click(".nav button[data-v=record]")
    for f in ["prog", "arch", "nw", "db"]:
        page.click(f'[data-sf={f}]')
    page.fill("#examDate", "2099-01-01")
    page.dispatch_event("#examDate", "change")
    check(page.locator("[data-sf].on").count() == 4, "記録タブで選ぶ分野を設定できる")
    page.click(".nav button[data-v=practice]")
    check("あと" in page.inner_text("#countdown"), "演習タブに本番までの日数が出る")
    mine = page.evaluate("PROBLEMS.filter(p => ['sec','prog','arch','nw','db'].includes(p.f)).length")
    check(page.locator(".pitem").count() == mine, "「自分の分野」で選んだ分野だけが並ぶ")

    # 過去問：点数の記録
    page.click(".nav button[data-v=past]")
    page.locator(".card.past").first.wait_for()
    check(page.locator(".card.past").count() == page.evaluate("PAST.length"), "過去問の回がすべて並ぶ")
    page.click("[data-ps=r07a][data-pf=prog]")
    page.fill("#pPct", "７５")
    page.click("#pSave")
    check("75%" in page.inner_text("[data-ps=r07a][data-pf=prog]"), "過去問の点数を記録できる")
    href = page.get_attribute(".card.past >> nth=0 >> a >> nth=1", "href")
    check(href.endswith("_ap_pm_ans.pdf"), "過去問の解答例へのリンクがある")

    # 要点カード
    page.click(".nav button[data-v=cards]")
    page.click(".fcard >> nth=0")
    check(page.locator(".fcard >> nth=0 >> .fa").is_visible(), "要点カードをタップすると答えが出る")
    page.click('.fcard >> nth=0 >> .kbtn')
    check("1 /" in page.inner_text(".crow"), "覚えたカードが数えられる")

    # 本番モード
    page.goto(url + "#mock")
    page.click("#mockStart")
    check(page.locator("#v-mock .pitem").count() == 5, "本番モードで5題が出る")
    check(":" in page.inner_text("#mockClock"), "本番モードの残り時間が出る")
    page.click("#v-mock .pitem >> nth=0")
    page.locator("#pane-q h4").first.wait_for()
    check("残り" in page.inner_text("#timer"), "本番モードの問題では残り時間が出る")
    page.goto(url + "#mock")
    page.click("#mockEnd")
    check("点" in page.inner_text("#v-mock .result"), "本番モードの結果が出る")

    # 記録の書き出しと、別の端末（別のブラウザ）への読み込み
    page.goto(url + "#record")
    page.click("#expBtn")
    exported = page.input_value("#expText")
    check('"app":"apB-record"' in exported, "記録を書き出せる")
    ctx2 = browser.new_context(viewport={"width": 1440, "height": 900})
    pc = ctx2.new_page()
    pc.on("pageerror", lambda e: errors.append(str(e)))
    pc.goto(url + "#record")
    pc.fill("#impText", "これは記録ではない")
    pc.click("#impBtn")
    check("ではない" in pc.inner_text("#impMsg"), "記録でない文字列は読み込まない")
    pc.fill("#impText", exported)
    pc.click("#impBtn")
    pc.click("#impBtn")
    check("読み込みました" in pc.inner_text("#impMsg"), "書き出した記録を別の端末で読み込める")
    check(pc.evaluate("score(PROBLEMS.find(p => p.id === 's1')).pct") == page.evaluate("score(PROBLEMS.find(p => p.id === 's1')).pct"), "読み込んだ記録の得点が一致する")

    # パソコンの幅：問題と解答用紙を横に並べる
    pc.goto(url + "#pf2")
    pc.locator("#pane-q h4").first.wait_for()
    check(pc.locator("#pane-q").is_visible() and pc.locator("#pane-s").is_visible(), "広い画面では問題と解答用紙が横に並ぶ")
    pc.click(".tab[data-t=e]")
    check(pc.locator("#pane-q").is_visible() and pc.locator("#pane-e").is_visible() and not pc.locator("#pane-s").is_visible(), "広い画面で解説に切り替えても問題は表示されたまま")
    box_q, box_e = pc.locator("#pane-q").bounding_box(), pc.locator("#pane-e").bounding_box()
    check(box_q["x"] + box_q["width"] <= box_e["x"] + 1, "問題が左、解説が右に並ぶ")
    ctx2.close()

    page.goto(url)
    ctx.set_offline(True)
    server.shutdown()
    page.reload()
    check(page.locator(".pitem").count() == mine, "オフラインでも開ける")
    page.click(".pitem >> nth=3")
    page.locator("#pane-q h4").first.wait_for()
    page.click(".tab[data-t=s]")
    check(page.locator(".row").count() > 0, "オフラインでも解答用紙が出る")

    check(not errors, "スクリプトのエラーがない" + (f": {errors}" if errors else ""))
    browser.close()

print("\n失敗 %d 件" % len(failed) if failed else "\nすべて OK")
sys.exit(1 if failed else 0)
