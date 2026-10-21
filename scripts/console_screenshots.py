"""콘솔 스크린샷 검증: API(8770)·vite preview(4173)가 떠 있는 상태에서 주요 화면을 찍고 콘솔 오류를 확인한다.

  python3 scripts/console_screenshots.py docs/images   # CHROMIUM_PATH로 브라우저 경로 지정 가능
"""

import os
import sys
from playwright.sync_api import sync_playwright

out = sys.argv[1]
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    page = b.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("response", lambda r: r.status >= 400 and errors.append(f"HTTP {r.status} {r.url}"))
    page.goto(os.environ.get("CONSOLE_URL", "http://127.0.0.1:4173/"))
    page.get_by_text("주요 검토 항목").wait_for()
    page.get_by_text("자산이 많은 프로젝트").wait_for()
    page.wait_for_timeout(500)
    page.screenshot(path=f"{out}/atlas-dashboard.png", full_page=True)
    nav = page.get_by_role("navigation", name="콘솔 메뉴")
    nav.get_by_role("button", name="프로젝트").click()
    page.get_by_role("heading", name="프로젝트").wait_for()
    page.locator("tbody tr").first.wait_for()
    page.screenshot(path=f"{out}/atlas-projects.png", full_page=False)
    page.locator("tbody tr").first.click()
    page.get_by_text("프로젝트 코드").wait_for()
    page.locator("svg.atlas-dg").wait_for()
    page.locator("g.atlas-dg-node").nth(8).click()
    page.get_by_role("complementary", name="선택한 항목").wait_for()
    page.wait_for_timeout(300)
    page.screenshot(path=f"{out}/atlas-project-diagram.png", full_page=False)
    page.get_by_role("tab", name="자산").click()
    page.locator("tbody tr").first.wait_for()
    page.screenshot(path=f"{out}/atlas-project-detail.png", full_page=False)
    nav.get_by_role("button", name="구성도").click()
    page.locator("svg.atlas-dg[aria-label^='IDC']").wait_for()
    page.wait_for_timeout(400)
    page.screenshot(path=f"{out}/atlas-idc-diagram.png", full_page=False)
    nav.get_by_role("button", name="준비도 검토").click()
    page.get_by_text("전체 검토 결과").wait_for()
    page.get_by_role("cell", name="지원 종료 OS").first.click()
    page.wait_for_timeout(600)
    page.screenshot(path=f"{out}/atlas-review.png", full_page=False)
    nav.get_by_role("button", name="동기화 이력").click()
    page.get_by_text("변경 필드").wait_for()
    page.wait_for_timeout(300)
    page.screenshot(path=f"{out}/atlas-sync.png", full_page=False)
    page.get_by_role("searchbox", name="자산 검색").first.fill("erp-was")
    page.keyboard.press("Enter")
    page.get_by_role("heading", name="자산 목록").wait_for()
    page.wait_for_timeout(600)
    page.screenshot(path=f"{out}/atlas-assets-search.png", full_page=False)
    b.close()
print("console errors:", errors)
sys.exit(1 if errors else 0)
