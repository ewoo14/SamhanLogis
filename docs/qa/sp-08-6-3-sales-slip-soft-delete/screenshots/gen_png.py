"""SP-08-6-3 QA PNG 4장 생성 스크립트 (Malgun Gothic 폴백 포함)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, '..', '..', '..', '..', 'scripts', 'lib'))
from qa_shots_dir import resolve_qa_shots_dir  # noqa: E402

# _local 격리(2026-07-27 하네스 흡수 H2 — 기존 기본값이 자기 자신의 형제 PNG 를 직접 덮어썼다).
OUT_DIR = resolve_qa_shots_dir(_HERE)

# Color tokens
WHITE = (255, 255, 255)
GRAY_50 = (249, 250, 251)
GRAY_100 = (243, 244, 246)
GRAY_200 = (229, 231, 235)
GRAY_400 = (156, 163, 175)
GRAY_600 = (75, 85, 99)
GRAY_700 = (55, 65, 81)
GRAY_800 = (31, 41, 55)
GRAY_900 = (17, 24, 39)
DANGER_50 = (254, 242, 242)
DANGER_300 = (252, 165, 165)
DANGER_700 = (185, 28, 28)
DANGER_800 = (153, 27, 27)
SUCCESS_50 = (236, 253, 245)
SUCCESS_700 = (4, 120, 87)
BLUE_600 = (37, 99, 235)
BLUE_100 = (219, 234, 254)
BLUE_800 = (30, 64, 175)

W, H = 900, 640


def get_font(size, bold=False):
    candidates = []
    if bold:
        candidates += [
            'C:/Windows/Fonts/malgunbd.ttf',
            'C:/Windows/Fonts/malgun.ttf',
        ]
    else:
        candidates += [
            'C:/Windows/Fonts/malgun.ttf',
        ]
    candidates += [
        '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
        '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


def shadow_rect(img, xy, r=14, fill=WHITE):
    x0, y0, x1, y1 = xy
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle((x0 + 4, y0 + 8, x1 + 4, y1 + 8), radius=r, fill=(0, 0, 0, 40))
    sh = sh.filter(ImageFilter.GaussianBlur(radius=8))
    img.alpha_composite(sh)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(xy, radius=r, fill=fill)


MX0, MY0, MX1, MY1 = 250, 120, 650, 490

# ── PNG 01: 삭제 확인 modal ───────────────────────────────────────────────────
img1 = Image.new('RGBA', (W, H), GRAY_100 + (255,))
over = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(over).rectangle([0, 0, W, H], fill=(0, 0, 0, 60))
img1.alpha_composite(over)

shadow_rect(img1, (MX0, MY0, MX1, MY1), r=14, fill=WHITE)
d = ImageDraw.Draw(img1)

d.rounded_rectangle((MX0, MY0, MX1, MY0 + 52), radius=14, fill=GRAY_50)
d.line((MX0, MY0 + 52, MX1, MY0 + 52), fill=GRAY_200, width=1)
d.text((MX0 + 16, MY0 + 14), '매출 전표 삭제', font=get_font(17, True), fill=GRAY_900)
d.text((MX1 - 32, MY0 + 16), 'X', font=get_font(14), fill=GRAY_400)

cy = MY0 + 68
d.rounded_rectangle((MX0 + 16, cy, MX1 - 16, cy + 185), radius=8, fill=WHITE, outline=GRAY_200, width=1)
d.text((MX0 + 28, cy + 16), '정말 삭제하시겠습니까?', font=get_font(14, True), fill=GRAY_900)
d.text((MX0 + 28, cy + 46), '전표번호: ', font=get_font(12), fill=GRAY_600)
d.text((MX0 + 28 + 72, cy + 46), 'SL-2026-00142', font=get_font(12, True), fill=GRAY_900)
d.text((MX0 + 28, cy + 70), '거래처:    세종전자', font=get_font(12), fill=GRAY_600)
d.line((MX0 + 28, cy + 96, MX1 - 28, cy + 96), fill=GRAY_200, width=1)
d.text((MX0 + 28, cy + 108), '삭제된 전표는 복구할 수 없습니다.', font=get_font(12), fill=DANGER_700)
d.text((MX0 + 16, cy + 168), 'data-testid="sales-slip-delete-confirm"', font=get_font(9), fill=GRAY_400)

d.line((MX0, MY1 - 56, MX1, MY1 - 56), fill=GRAY_200, width=1)
d.rounded_rectangle((MX0 + 16, MY1 - 44, MX0 + 96, MY1 - 16), radius=8, fill=WHITE, outline=GRAY_200, width=1)
d.text((MX0 + 30, MY1 - 38), '취소', font=get_font(13), fill=GRAY_800)
d.text((MX0 + 100, MY1 - 38), 'data-testid="...no"', font=get_font(8), fill=GRAY_400)
d.rounded_rectangle((MX1 - 96, MY1 - 44, MX1 - 16, MY1 - 16), radius=8, fill=DANGER_700)
d.text((MX1 - 76, MY1 - 38), '삭제', font=get_font(13, True), fill=WHITE)
d.text((MX1 - 96, MY1 - 12), 'data-testid="...yes"', font=get_font(8), fill=GRAY_400)

d.text((10, 10), 'SP-08-6-3 QA PNG 01 — 매출 전표 삭제 확인 modal', font=get_font(11), fill=GRAY_700)
d.text((10, 26), 'SAVED | SALES/MANAGER/MASTER | Malgun Gothic | UUID 비공개 | 전표번호만 노출', font=get_font(10), fill=GRAY_400)

img1.convert('RGB').save(os.path.join(OUT_DIR, '01-sales-delete-confirm-modal.png'), 'PNG')
print('PNG 01 saved')

# ── PNG 02: 422 SHIPPED 배너 ──────────────────────────────────────────────────
img2 = Image.new('RGBA', (W, H), GRAY_100 + (255,))
over2 = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(over2).rectangle([0, 0, W, H], fill=(0, 0, 0, 60))
img2.alpha_composite(over2)

MY1b = MY1 + 48
shadow_rect(img2, (MX0, MY0, MX1, MY1b), r=14, fill=WHITE)
d = ImageDraw.Draw(img2)

d.rounded_rectangle((MX0, MY0, MX1, MY0 + 52), radius=14, fill=GRAY_50)
d.line((MX0, MY0 + 52, MX1, MY0 + 52), fill=GRAY_200, width=1)
d.text((MX0 + 16, MY0 + 14), '매출 전표 삭제', font=get_font(17, True), fill=GRAY_900)
d.text((MX1 - 32, MY0 + 16), 'X', font=get_font(14), fill=GRAY_400)

cy = MY0 + 68
d.rounded_rectangle((MX0 + 16, cy, MX1 - 16, cy + 100), radius=8, fill=WHITE, outline=GRAY_200, width=1)
d.text((MX0 + 28, cy + 16), '정말 삭제하시겠습니까?', font=get_font(14, True), fill=GRAY_900)
d.text((MX0 + 28, cy + 46), '전표번호: SL-2026-00089', font=get_font(12), fill=GRAY_600)
d.text((MX0 + 28, cy + 68), '삭제된 전표는 복구할 수 없습니다.', font=get_font(12), fill=DANGER_700)

# 422 SHIPPED danger-banner
by = cy + 116
d.rounded_rectangle((MX0 + 16, by, MX1 - 16, by + 80), radius=6, fill=DANGER_50, outline=DANGER_300, width=1)
d.text((MX0 + 28, by + 10), '출고 완료된 매출 전표는 삭제할 수 없습니다', font=get_font(12, True), fill=DANGER_800)
d.text((MX0 + 28, by + 34), 'HTTP 422  SLIP_DELETE_SALES_SHIPPED', font=get_font(10), fill=DANGER_700)
d.text((MX0 + 16, by + 58), 'data-testid="sales-slip-delete-shipped-banner"', font=get_font(9), fill=GRAY_400)

fy = MY1b
d.line((MX0, fy - 56, MX1, fy - 56), fill=GRAY_200, width=1)
d.rounded_rectangle((MX0 + 16, fy - 44, MX0 + 96, fy - 16), radius=8, fill=WHITE, outline=GRAY_200, width=1)
d.text((MX0 + 30, fy - 38), '취소', font=get_font(13), fill=GRAY_800)
d.rounded_rectangle((MX1 - 96, fy - 44, MX1 - 16, fy - 16), radius=8, fill=DANGER_300)
d.text((MX1 - 76, fy - 38), '삭제', font=get_font(13), fill=WHITE)

d.text((10, 10), 'SP-08-6-3 QA PNG 02 — 422 SHIPPED 배너 (출고 진행 전표 삭제 불가)', font=get_font(11), fill=GRAY_700)
d.text((10, 26), 'SENT 이후 상태 | SLIP_DELETE_SALES_SHIPPED | danger-banner class + testid', font=get_font(10), fill=GRAY_400)

img2.convert('RGB').save(os.path.join(OUT_DIR, '02-sales-delete-shipped-alert.png'), 'PNG')
print('PNG 02 saved')

# ── PNG 03: 삭제 성공 + 목록 갱신 ───────────────────────────────────────────
img3 = Image.new('RGBA', (W, H), GRAY_100 + (255,))
d = ImageDraw.Draw(img3)

d.rectangle([0, 0, W, 56], fill=WHITE)
d.line([0, 56, W, 56], fill=GRAY_200, width=1)
d.text((20, 18), 'SamhanLogis', font=get_font(16, True), fill=GRAY_900)
d.text((W - 180, 18), '영업담당자 · SALES', font=get_font(11), fill=GRAY_600)

d.text((20, 72), '매출 전표 목록', font=get_font(13), fill=BLUE_600)

# success toast
d.rounded_rectangle((20, 96, W - 20, 140), radius=8, fill=SUCCESS_50, outline=(110, 231, 183), width=1)
d.text((40, 112), '전표가 삭제되었습니다', font=get_font(13, True), fill=SUCCESS_700)
d.text((W - 60, 112), 'X', font=get_font(13), fill=SUCCESS_700)

d.text((20, 156), '매출 전표 목록', font=get_font(17, True), fill=GRAY_900)
d.text((W - 100, 160), '+ 신규 전표', font=get_font(12), fill=BLUE_600)

thY = 190
d.rectangle([20, thY, W - 20, thY + 34], fill=GRAY_100)
cols = [(28, '전표번호'), (165, '거래처'), (310, '전표일'), (440, '상태'), (560, '금액'), (690, '담당자')]
for x, txt in cols:
    d.text((x, thY + 9), txt, font=get_font(11, True), fill=GRAY_600)

rows = [
    ('SL-2026-00152', '한국전자', '2026-05-18', '저장완료', '₩2,400,000', '박영업'),
    ('SL-2026-00150', '대성물산', '2026-05-17', '확인완료', '₩1,850,000', '이판매'),
    ('SL-2026-00148', '세림물류', '2026-05-16', '초안', '₩3,200,000', '김영업'),
]
for i, (no, partner, dt, status, amt, sales) in enumerate(rows):
    ry = thY + 34 + i * 40
    bg = WHITE if i % 2 == 0 else GRAY_50
    d.rectangle([20, ry, W - 20, ry + 40], fill=bg)
    d.text((28, ry + 12), no, font=get_font(11), fill=BLUE_600)
    d.text((165, ry + 12), partner, font=get_font(11), fill=GRAY_800)
    d.text((310, ry + 12), dt, font=get_font(11), fill=GRAY_800)
    sc = SUCCESS_700 if '완료' in status else GRAY_700
    d.text((440, ry + 12), status, font=get_font(11), fill=sc)
    d.text((560, ry + 12), amt, font=get_font(11), fill=GRAY_800)
    d.text((690, ry + 12), sales, font=get_font(11), fill=GRAY_800)

d.text((20, H - 52), 'SL-2026-00142 삭제됨 — 목록에서 제외 (is_deleted=true, @SQLRestriction)', font=get_font(10), fill=GRAY_400)
d.text((20, H - 34), 'navigate(\'/sales\', { state: { toast } })  |  invalidateQueries OUTBOUND', font=get_font(10), fill=GRAY_400)
d.text((10, 10), 'SP-08-6-3 QA PNG 03 — 삭제 성공 + 목록 갱신 리다이렉트', font=get_font(11), fill=GRAY_700)

img3.convert('RGB').save(os.path.join(OUT_DIR, '03-sales-delete-success-redirect.png'), 'PNG')
print('PNG 03 saved')

# ── PNG 04: INVENTORY 권한 가드 ───────────────────────────────────────────────
img4 = Image.new('RGBA', (W, H), GRAY_100 + (255,))
d = ImageDraw.Draw(img4)

d.rectangle([0, 0, W, 56], fill=WHITE)
d.line([0, 56, W, 56], fill=GRAY_200, width=1)
d.text((20, 18), 'SamhanLogis', font=get_font(16, True), fill=GRAY_900)
d.text((W - 200, 18), '재고담당자 · INVENTORY', font=get_font(11), fill=GRAY_600)

d.rectangle([20, 72, W - 20, H - 80], fill=WHITE)
d.line([20, 72, W - 20, 72], fill=GRAY_200, width=1)

d.text((36, 88), '매출 전표 상세', font=get_font(16, True), fill=GRAY_900)
d.rounded_rectangle((W - 240, 82, W - 148, 112), radius=8, fill=GRAY_100, outline=GRAY_200, width=1)
d.text((W - 226, 90), '수정 요청', font=get_font(12), fill=GRAY_700)
d.rounded_rectangle((W - 138, 82, W - 36, 112), radius=8, fill=WHITE, outline=GRAY_200, width=1)
d.text((W - 118, 90), '목록으로', font=get_font(12), fill=GRAY_700)

d.rounded_rectangle((36, 130, W - 36, 182), radius=6, fill=GRAY_50, outline=GRAY_200, width=1)
d.text((52, 143), '[권한 가드] 삭제 버튼 미노출', font=get_font(13, True), fill=GRAY_800)
d.text((52, 164), 'INVENTORY 역할 — SALES_DELETE_ROLES 에 미포함 → canDirectDeleteSales = false', font=get_font(11), fill=GRAY_600)

d.rounded_rectangle((36, 196, W - 36, 282), radius=6, fill=BLUE_100, outline=(191, 219, 254), width=1)
d.text((52, 210), "BE: @PreAuthorize(\"hasAnyRole('SALES','MANAGER','MASTER')\")", font=get_font(12), fill=BLUE_800)
d.text((52, 232), "FE: const SALES_DELETE_ROLES = ['SALES', 'MANAGER', 'MASTER']", font=get_font(12), fill=BLUE_800)
d.text((52, 254), "HTTP 403 → alert('매출 전표 삭제 권한이 없습니다')", font=get_font(12), fill=BLUE_800)

d.rounded_rectangle((36, 296, W - 36, 466), radius=6, fill=GRAY_50, outline=GRAY_200, width=1)
d.text((52, 310), 'SlipSalesDeleteIT — 권한 가드 케이스', font=get_font(12, True), fill=GRAY_800)
tests = [
    'D4: testDeleteSalesForbiddenForInventory()    -> 403',
    'D5: testDeleteSalesForbiddenForWarehouse()    -> 403',
    'D6: testDeleteSalesForbiddenForAccountant()   -> 403',
    'D7: testDeleteSalesNonOutboundForbidden()     -> 403  SLIP_DELETE_NON_SALES',
    'D8: testDeleteSalesShippedReturns422()        -> 422  SLIP_DELETE_SALES_SHIPPED',
]
for i, t in enumerate(tests):
    d.text((60, 336 + i * 24), t, font=get_font(11), fill=GRAY_700)

d.text((10, 10), 'SP-08-6-3 QA PNG 04 — INVENTORY 권한 가드 + 삭제 버튼 미노출', font=get_font(11), fill=GRAY_700)
d.text((10, 26), 'canDirectDeleteSales=false | PreAuthorize SALES/MANAGER/MASTER only', font=get_font(10), fill=GRAY_400)

img4.convert('RGB').save(os.path.join(OUT_DIR, '04-sales-delete-permission-guard.png'), 'PNG')
print('PNG 04 saved')

print('=== 4장 모두 생성 완료 ===')
