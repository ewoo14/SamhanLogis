from PIL import Image, ImageDraw
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, '..', '..', '..', 'scripts', 'lib'))
from qa_shots_dir import resolve_qa_shots_dir  # noqa: E402

# _local 격리(2026-07-27 하네스 흡수 H2 — 기존 하드코딩 절대경로('/c/dev/SamhanLogis/...')는
# 2026-06-06 rename 이전 이름이라 이미 무효했고, 유효했다 해도 커밋 경로를 직접 가리켰다).
OUT = resolve_qa_shots_dir(os.path.join(_HERE, 'screenshots'))

W, H = 1280, 900
BG = (245, 247, 250)
WHITE = (255, 255, 255)
BLUE = (37, 99, 235)
BLUE_LIGHT = (219, 234, 254)
GREEN = (22, 163, 74)
GREEN_LIGHT = (220, 252, 231)
RED = (220, 38, 38)
GRAY_BORDER = (209, 213, 219)
GRAY_TEXT = (107, 114, 128)
DARK = (17, 24, 39)
HEADER_BG = (31, 41, 55)
INDIGO = (99, 102, 241)


def make_base():
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([(0, 0), (W, 56)], fill=HEADER_BG)
    d.text((20, 16), 'Samhan Public', fill=(255, 255, 255))
    d.text((W - 260, 16), '회계담당자 (ACCOUNTANT)', fill=(156, 163, 175))
    return img, d


def card(d, x, y, w, h, bg=WHITE):
    d.rounded_rectangle([(x, y), (x + w, y + h)], radius=8, fill=bg, outline=GRAY_BORDER, width=1)


def sidebar(d, active_idx):
    d.rectangle([(0, 56), (220, H)], fill=(31, 41, 55))
    labels = ['대시보드', '영업', '구매', '회계 - 마감', '회계 - 원장', '보고서']
    for i, lbl in enumerate(labels):
        y = 70 + i * 44
        if i == active_idx:
            d.rectangle([(0, y - 4), (220, y + 32)], fill=(55, 65, 81))
            d.rectangle([(0, y - 4), (4, y + 32)], fill=BLUE)
        c = (255, 255, 255) if i == active_idx else (156, 163, 175)
        d.text((20, y + 6), lbl, fill=c)


# ─────────────────────────────────────
# 01: 일마감 처리 화면
# ─────────────────────────────────────
img, d = make_base()
sidebar(d, 3)

card(d, 240, 74, W - 260, 70)
d.text((260, 84), '매출 마감', fill=DARK)
d.text((260, 108), '/warehouse/closing  |  ACCOUNTANT / MASTER', fill=GRAY_TEXT)

card(d, 240, 162, W - 260, 210)
d.text((260, 178), '마감 실행', fill=DARK)
d.rounded_rectangle([(260, 204), (380, 234)], radius=6, fill=BLUE, outline=BLUE)
d.text((278, 212), '일별 (DAILY)', fill=WHITE)
d.rounded_rectangle([(394, 204), (520, 234)], radius=6, fill=WHITE, outline=GRAY_BORDER)
d.text((410, 212), '월별 (MONTHLY)', fill=DARK)

d.text((260, 248), '마감 일자', fill=GRAY_TEXT)
d.rounded_rectangle([(260, 266), (470, 294)], radius=4, fill=WHITE, outline=GRAY_BORDER)
d.text((270, 273), '2026-05-18', fill=DARK)

d.rounded_rectangle([(260, 316), (430, 346)], radius=6, fill=BLUE)
d.text((276, 323), '마감 실행', fill=WHITE)
d.text((446, 323), 'data-testid="closing-new-button"', fill=INDIGO)

card(d, 240, 392, W - 260, 230)
d.text((260, 406), '마감 목록  (data-testid="closing-list-table")', fill=DARK)
d.rectangle([(240, 428), (W - 20, 452)], fill=(243, 244, 246))
for i, hl in enumerate(['구분', '기간 일자', '상태', '매출 합계', '마감일시']):
    d.text((260 + i * 190, 434), hl, fill=GRAY_TEXT)
d.line([(240, 452), (W - 20, 452)], fill=GRAY_BORDER, width=1)
d.text((260, 460), '일별', fill=DARK)
d.text((450, 460), '2026-05-18', fill=DARK)
d.rounded_rectangle([(640, 456), (720, 476)], radius=4, fill=GREEN_LIGHT)
d.text((648, 460), '마감완료', fill=GREEN)
d.text((830, 460), '12,450,000', fill=DARK)

card(d, 240, 642, W - 260, 90)
d.text((260, 654), '일별 Detail  (data-testid="closing-daily-detail-table")', fill=DARK)
d.text((260, 676), 'taxInvoiceNo: T-2026/05-0007  |  partnerName: (주)삼성물산  |  totalAmount: 1,650,000', fill=GRAY_TEXT)
d.text((260, 698), 'V15__add_daily_closings.sql  |  GET /accounting/closings/daily?date=2026-05-18', fill=GRAY_TEXT)

d.text((260, 756), 'UUID 비공개: taxInvoiceNo / partnerName 표시, partnerId 미노출', fill=GRAY_TEXT)

img.save(f'{OUT}/01-daily-closing-screen.png')
print('saved 01-daily-closing-screen.png')


# ─────────────────────────────────────
# 02: 일마감 결과 confirm modal
# ─────────────────────────────────────
img, d = make_base()
sidebar(d, 3)

# 뒤 배경
card(d, 240, 74, W - 260, 780, bg=(220, 225, 235))
d.text((400, 120), '매출 마감 화면 (배경)', fill=(180, 185, 195))

# Modal overlay
d.rectangle([(0, 0), (W, H)], fill=(17, 24, 39))
img2 = Image.new('RGBA', (W, H), (0, 0, 0, 0))
img_base = img.convert('RGBA')
overlay = Image.new('RGBA', (W, H), (17, 24, 39, 140))
img = Image.alpha_composite(img_base, overlay).convert('RGB')
d = ImageDraw.Draw(img)

MX, MY, MW, MH = 390, 180, 500, 430
card(d, MX, MY, MW, MH)

d.rectangle([(MX, MY), (MX + MW, MY + 54)], fill=BLUE)
d.text((MX + 20, MY + 16), '일마감 처리 완료', fill=WHITE)
d.text((MX + MW - 30, MY + 16), 'X', fill=(200, 210, 230))

d.ellipse([(MX + MW // 2 - 32, MY + 68), (MX + MW // 2 + 32, MY + 132)], fill=GREEN_LIGHT, outline=GREEN, width=2)
d.text((MX + MW // 2 - 6, MY + 88), 'OK', fill=GREEN)

rows = [
    ('마감 일자', '2026-05-18'),
    ('처리 구분', '일별 (DAILY)'),
    ('매출 합계', '12,450,000 원'),
    ('세금계산서', '7 건 (ISSUED)'),
    ('슬립 잠금', '23 건 LOCKED'),
]
for ri, (lbl, val) in enumerate(rows):
    ry = MY + 154 + ri * 28
    d.text((MX + 50, ry), lbl + ':', fill=GRAY_TEXT)
    d.text((MX + 220, ry), val, fill=DARK)

d.rounded_rectangle([(MX + 60, MY + 354), (MX + MW - 60, MY + 390)], radius=6, fill=BLUE)
d.text((MX + MW // 2 - 14, MY + 362), '확인', fill=WHITE)

d.text((MX + 20, MY + 408), 'AccountingPeriodResponse: periodType/periodDate/status', fill=GRAY_TEXT)

img.save(f'{OUT}/02-daily-closing-confirm-modal.png')
print('saved 02-daily-closing-confirm-modal.png')


# ─────────────────────────────────────
# 03: 원장 조회 화면
# ─────────────────────────────────────
img, d = make_base()
sidebar(d, 4)

card(d, 240, 74, W - 260, 60)
d.text((260, 84), '거래처별 원장', fill=DARK)
d.text((260, 106), '/accounting/partner-ledger  |  ACCOUNTANT / MANAGER / MASTER', fill=GRAY_TEXT)

card(d, 240, 152, W - 260, 96)
d.text((260, 166), '기간 시작', fill=GRAY_TEXT)
d.rounded_rectangle([(260, 182), (420, 208)], radius=4, fill=WHITE, outline=GRAY_BORDER)
d.text((268, 188), '2026-05-01', fill=DARK)
d.text((260, 164), 'data-testid="partner-ledger-from"', fill=INDIGO)

d.text((436, 166), '기간 종료', fill=GRAY_TEXT)
d.rounded_rectangle([(436, 182), (596, 208)], radius=4, fill=WHITE, outline=GRAY_BORDER)
d.text((444, 188), '2026-05-18', fill=DARK)

d.text((614, 166), '거래처 코드', fill=GRAY_TEXT)
d.rounded_rectangle([(614, 182), (820, 208)], radius=4, fill=WHITE, outline=GRAY_BORDER)
d.text((622, 188), 'SP-001', fill=DARK)
d.text((614, 164), 'data-testid="partner-ledger-partner"', fill=INDIGO)

d.rounded_rectangle([(836, 182), (950, 208)], radius=4, fill=BLUE)
d.text((860, 188), '조회', fill=WHITE)
d.text((836, 164), 'data-testid="partner-ledger-search"', fill=INDIGO)

card(d, 240, 266, W - 260, 150)
d.text((260, 278), '매출/수금/채권 집계 (BE-A8 — GET /accounting/sales/aggregate)', fill=DARK)
d.rectangle([(240, 298), (W - 20, 320)], fill=(243, 244, 246))
for i, hl in enumerate(['거래처코드', '거래처명', '매출합계', '수금합계', '채권잔액']):
    d.text((260 + i * 196, 304), hl, fill=GRAY_TEXT)
for ri, row in enumerate([
    ('SP-001', '(주)삼성물산', '5,200,000', '3,000,000', '2,200,000'),
    ('SP-002', '엘지전자(주)', '3,800,000', '3,800,000', '0'),
]):
    ry = 326 + ri * 28
    d.line([(240, ry - 2), (W - 20, ry - 2)], fill=GRAY_BORDER, width=1)
    for ci, v in enumerate(row):
        d.text((260 + ci * 196, ry), v, fill=DARK)
d.text((260, 400), 'data-testid="partner-ledger-aggregate-table"', fill=INDIGO)

card(d, 240, 436, W - 260, 220)
d.text((260, 448), 'SP-001 원장 라인 (BE-A9 — GET /accounting/journals/ledger-data)', fill=DARK)
d.rectangle([(240, 468), (W - 20, 490)], fill=(243, 244, 246))
for i, hl in enumerate(['일자', '분개번호', '계정', '적요', '차변', '대변', '잔액']):
    d.text((260 + i * 142, 474), hl, fill=GRAY_TEXT)
for ri, row in enumerate([
    ('2026-05-02', 'JV-2026/05-001', '110', '수금 처리', '0', '1,200,000', '1,200,000'),
    ('2026-05-05', 'JV-2026/05-004', '401', '판매전표', '2,000,000', '0', '800,000'),
    ('2026-05-10', 'JV-2026/05-009', '110', '수금 처리', '0', '800,000', '0'),
]):
    ry = 496 + ri * 28
    d.line([(240, ry - 2), (W - 20, ry - 2)], fill=GRAY_BORDER, width=1)
    for ci, v in enumerate(row):
        d.text((260 + ci * 142, ry), v, fill=DARK)
d.text((260, 582), 'data-testid="partner-ledger-detail-table"', fill=INDIGO)

d.rounded_rectangle([(240, 676), (390, 706)], radius=4, fill=BLUE)
d.text((256, 683), '인쇄 미리보기', fill=WHITE)
d.text((240, 660), 'data-testid="partner-ledger-print-button"', fill=INDIGO)

d.rounded_rectangle([(406, 676), (590, 706)], radius=4, fill=WHITE, outline=GRAY_BORDER)
d.text((420, 683), 'CSV 다운로드', fill=DARK)
d.text((406, 660), 'data-testid="partner-ledger-csv-download"', fill=INDIGO)

img.save(f'{OUT}/03-partner-ledger-screen.png')
print('saved 03-partner-ledger-screen.png')


# ─────────────────────────────────────
# 04: 원장 인쇄 미리보기
# ─────────────────────────────────────
img, d = make_base()
d.text((20, 16), 'Samhan Public  |  인쇄 미리보기', fill=(255, 255, 255))
d.text((W - 200, 16), '/print/partner-ledger', fill=(156, 163, 175))

PX, PY, PW, PH = 60, 74, W - 120, H - 90
card(d, PX, PY, PW, PH)

d.text((PX + 40, PY + 18), '(주)삼한공조시스템', fill=DARK)
d.text((PX + PW - 300, PY + 18), '거래처별 원장', fill=DARK)
d.line([(PX + 20, PY + 44), (PX + PW - 20, PY + 44)], fill=GRAY_BORDER, width=2)

d.text((PX + 40, PY + 58), '거래처: (주)삼성물산  (SP-001)', fill=DARK)
d.text((PX + 40, PY + 78), '사업자등록번호: 123-45-67890', fill=GRAY_TEXT)
d.text((PX + 40, PY + 98), '기간: 2026-05-01 ~ 2026-05-18', fill=GRAY_TEXT)
d.text((PX + PW - 280, PY + 58), '출력일: 2026-05-18', fill=GRAY_TEXT)
d.text((PX + PW - 280, PY + 78), '출력자: 회계담당자', fill=GRAY_TEXT)

d.line([(PX + 20, PY + 120), (PX + PW - 20, PY + 120)], fill=GRAY_BORDER, width=1)

col_x = [PX + 30, PX + 120, PX + 260, PX + 350, PX + 530, PX + 650, PX + 800]
headers = ['일자', '분개번호', '계정', '적요', '차변', '대변', '잔액']
d.rectangle([(PX + 20, PY + 128), (PX + PW - 20, PY + 150)], fill=(243, 244, 246))
for i, hl in enumerate(headers):
    d.text((col_x[i], PY + 134), hl, fill=GRAY_TEXT)

ledger = [
    ('2026-05-02', 'JV-2026/05-001', '110', '상품매출 수금', '0', '1,200,000', '1,200,000 Cr'),
    ('2026-05-05', 'JV-2026/05-004', '401', '판매전표 SP-2601', '2,000,000', '0', '800,000 Dr'),
    ('2026-05-10', 'JV-2026/05-009', '110', '수금 처리', '0', '800,000', '0'),
    ('2026-05-15', 'JV-2026/05-018', '401', '판매전표 SP-2612', '3,200,000', '0', '3,200,000 Dr'),
    ('2026-05-18', 'JV-2026/05-022', '110', '수금 처리', '0', '1,000,000', '2,200,000 Dr'),
]
for ri, row in enumerate(ledger):
    ry = PY + 156 + ri * 28
    d.line([(PX + 20, ry - 4), (PX + PW - 20, ry - 4)], fill=GRAY_BORDER, width=1)
    for ci, v in enumerate(row):
        base_v = v.replace(' Dr', '').replace(' Cr', '')
        color = RED if 'Dr' in v else (GREEN if 'Cr' in v else DARK)
        d.text((col_x[ci], ry), base_v, fill=color)

tot_y = PY + 156 + len(ledger) * 28 + 8
d.line([(PX + 20, tot_y - 2), (PX + PW - 20, tot_y - 2)], fill=DARK, width=2)
d.rectangle([(PX + 20, tot_y), (PX + PW - 20, tot_y + 28)], fill=(243, 244, 246))
d.text((PX + 40, tot_y + 6), '합 계', fill=DARK)
d.text((col_x[4], tot_y + 6), '5,200,000', fill=DARK)
d.text((col_x[5], tot_y + 6), '3,000,000', fill=DARK)
d.text((col_x[6], tot_y + 6), '2,200,000', fill=RED)

d.line([(PX + 20, PY + PH - 60), (PX + PW - 20, PY + PH - 60)], fill=GRAY_BORDER, width=1)
d.text((PX + 40, PY + PH - 46), 'UUID 미노출: partnerCode / partnerName / journalNo 만 표시', fill=GRAY_TEXT)
d.text((PX + 40, PY + PH - 26), 'ACCOUNTANT / MANAGER / MASTER  |  인쇄 라우트: /print/partner-ledger', fill=GRAY_TEXT)

img.save(f'{OUT}/04-partner-ledger-print-preview.png')
print('saved 04-partner-ledger-print-preview.png')

print('All 4 PNGs generated.')
