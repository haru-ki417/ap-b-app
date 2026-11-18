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
    saved = page.evaluate("Object.keys(JSON.parse(localStorage.getItem('apB_v1'))).length")
    check(saved == 2, "成績が端末に保存される")

    ctx.set_offline(True)
    server.shutdown()
    page.reload()
    check(page.locator(".pitem").count() == total, "オフラインでも開ける")
    page.click(".pitem >> nth=10")
    page.click(".tab[data-t=s]")
    check(page.locator(".row").count() > 0, "オフラインでも解答用紙が出る")

    check(not errors, "スクリプトのエラーがない" + (f": {errors}" if errors else ""))
    browser.close()

print("\n失敗 %d 件" % len(failed) if failed else "\nすべて OK")
sys.exit(1 if failed else 0)
