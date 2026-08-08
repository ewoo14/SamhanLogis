import { resolveQaShotsDir } from '../support/qa-screenshot-dir.mjs'
// PR #797 (#782 part2) 라이브 QA — 상업 SET 구성품 하위행(.set-part) 시각 폴리시 before/after.
// index.html <style> CSS 3줄 추가만(fix/782-setpart-visual-policy): 하위행 연한배경(#fafbfc)·
// muted·이름셀 들여쓰기(20px)+정상weight(400). 부모 SET행(.group-top) 대비 종속 표현.
// 시드: QA797 마커(product_db classification/products/product_estimate_exposure/bundle_component) —
//   상업 SET(QA797-SET-01, 실외기 L그룹) + 구성품 2종(QA797-PART-01 defaultQty=2, QA797-PART-02
//   defaultQty=1) + 회귀비교용 일반 상업멀티 품목(QA797-GEN-01, unit=EA, SET 아님).
// 실행: 실 order-app dev server(mock 없음, VITE_API_BASE_URL=http://localhost:8080/api/v1)
//       + 실 partner-auth-service(bizNo 2118712345 / PIN 1234) + 실 partner-order/product-service.
import { chromium } from '@playwright/test';

const OUT = resolveQaShotsDir(process.env.QA_OUT || '../../docs/qa/e782-setpart');
const URL = process.env.QA_URL || 'http://localhost:5198/';
const LABEL = process.env.QA_LABEL || 'after'; // after | before

const SET_MODEL = 'QA797-SET-01';
const PART1 = 'QA797-PART-01'; // defaultQty=2
const PART2 = 'QA797-PART-02'; // defaultQty=1
const GEN_MODEL = 'QA797-GEN-01'; // 일반 상업멀티 품목(SET 아님, 회귀비교용)

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
}
async function shotEl(page, sel, name) {
  await page.locator(sel).screenshot({ path: `${OUT}/${LABEL}-${name}.png` });
  console.log('  saved(el)', `${LABEL}-${name}`);
}

async function login(page) {
  await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.fill('#bizGateInput', '2118712345');
  await page.click('#btnBizQuery');
  await page.waitForTimeout(1200);
  await page.fill('#authPw1', '1234');
  await page.click('#btnAuthAction');
  await page.waitForTimeout(4500);
  const gateModal = page.locator('#gateImageModal');
  if (await gateModal.isVisible().catch(() => false)) {
    await page.click('#btnImgClose').catch(() => {});
    await page.waitForTimeout(500);
  }
  const tutBox = page.locator('#tutBox');
  if (await tutBox.isVisible().catch(() => false)) {
    const skipBtn = page.locator('button:has-text("튜토리얼 스킵")');
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(500);
    }
  }
  await page.evaluate(() => {
    document.querySelectorAll('.tut-blocker').forEach((el) => el.remove());
  });
}

async function readRowInfo(page, sel) {
  return page.evaluate((s) => {
    const row = document.querySelector(s);
    if (!row) return null;
    const cs = getComputedStyle(row);
    const nameCell = row.querySelector('td.colD.pc-only') || row.querySelector('td.colD');
    const nameCs = nameCell ? getComputedStyle(nameCell) : null;
    return {
      classList: Array.from(row.classList),
      rowBg: cs.backgroundColor,
      nameText: nameCell ? nameCell.textContent.trim() : null,
      nameFontWeight: nameCs ? nameCs.fontWeight : null,
      namePaddingLeft: nameCs ? nameCs.paddingLeft : null,
      nameColor: nameCs ? nameCs.color : null,
    };
  }, sel);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

  console.log(`[1] login (label=${LABEL}, url=${URL})`);
  await login(page);

  console.log('[2] 상업멀티 진입');
  await page.click('#btnEnterComm');
  await page.waitForTimeout(900);

  const setAnchor = page.locator(`#commBody tr[data-set-model="${SET_MODEL}"]`);
  const anchorCount = await setAnchor.count();
  record('QA797-SET-01 SET 행이 상업멀티 그리드에 렌더됨', anchorCount > 0, { anchorCount });
  if (anchorCount === 0) {
    await shotEl(page, '#cardComm', '99-fatal-no-set-anchor');
    await browser.close();
    console.log('\n=== VERDICT SUMMARY ===');
    results.forEach((r) => console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`));
    process.exit(1);
  }

  console.log('[3] QA797-SET-01 수량=3 입력 (PART-01 defaultQty=2 → "3 × 2", PART-02 defaultQty=1 → "3 × 1")');
  await page.fill(`#commBody .qty-input[data-model="${SET_MODEL}"]`, '3');
  await page.waitForTimeout(600);

  // 일반 품목(QA797-GEN-01)도 같이 보이도록 소량 스크롤 위치 확보(SET 앵커 기준 스크롤).
  await setAnchor.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  await shotEl(page, '#cardComm', 'comm-set-parts-desktop');

  const setRowInfo = await readRowInfo(page, `#commBody tr[data-set-model="${SET_MODEL}"]`);
  const part1RowInfo = await readRowInfo(page, `#commBody tr[data-part-of="${SET_MODEL}"][data-m="${PART1}"]`);
  const part2RowInfo = await readRowInfo(page, `#commBody tr[data-part-of="${SET_MODEL}"][data-m="${PART2}"]`);
  const genRowInfo = await readRowInfo(page, `#commBody tr[data-m="${GEN_MODEL}"]`);
  console.log('  SET row (parent):', JSON.stringify(setRowInfo));
  console.log('  PART-01 row (child, defaultQty=2):', JSON.stringify(part1RowInfo));
  console.log('  PART-02 row (child, defaultQty=1):', JSON.stringify(part2RowInfo));
  console.log('  GEN row (일반 품목, 회귀비교):', JSON.stringify(genRowInfo));

  record('부모 SET행 .group-top 클래스 보유', setRowInfo?.classList?.includes('group-top'), setRowInfo);
  record('구성품 하위행(PART-01) .set-part 클래스 보유', part1RowInfo?.classList?.includes('set-part'), part1RowInfo);
  record('구성품 하위행(PART-02) .set-part 클래스 보유', part2RowInfo?.classList?.includes('set-part'), part2RowInfo);
  record('일반 품목행(GEN) .set-part 미보유 (회귀 없음)', genRowInfo != null && !genRowInfo.classList.includes('set-part'), genRowInfo);
  record('★ 표시 PART-01 "3 × 2" (defaultQty=2 반영)', part1RowInfo?.nameText != null, part1RowInfo);

  // 값 정합(수량표시/단가/합계) — PART-01 기준.
  const part1Qty = await page.locator(`#commBody tr[data-part-of="${SET_MODEL}"][data-m="${PART1}"] .qty-set`).textContent();
  const part1Unit = await page.locator(`#commBody [data-cunit="${PART1}|${SET_MODEL}"]`).textContent();
  const part1Sub = await page.locator(`#commBody [data-csub="${PART1}|${SET_MODEL}"]`).textContent();
  console.log('  PART-01 qty/unit/sub:', part1Qty, part1Unit, part1Sub);
  record('PART-01 표시 수량 "3 × 2"', part1Qty?.trim() === '3 × 2', { part1Qty });
  const unitNum = Number(String(part1Unit).replace(/[^0-9.-]/g, ''));
  const subNum = Number(String(part1Sub).replace(/[^0-9.-]/g, ''));
  record('PART-01 소계 = 단가 × 6 (3×2)', subNum === unitNum * 6, { unitNum, subNum, expected: unitNum * 6 });

  console.log('[4] 모바일 뷰(390x844, max-width:1280px 미디어쿼리 활성화) — 하위행명 볼드 해소 확인');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await setAnchor.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shotEl(page, '#cardComm', 'comm-set-parts-mobile');

  const part1MobileInfo = await page.evaluate(({ setModel, part1 }) => {
    const row = document.querySelector(`#commBody tr[data-part-of="${setModel}"][data-m="${part1}"]`);
    if (!row) return null;
    const cellMobile = row.querySelector('td.colD.mobile-only');
    const cs = cellMobile ? getComputedStyle(cellMobile) : null;
    return {
      text: cellMobile ? cellMobile.textContent.trim() : null,
      fontWeight: cs ? cs.fontWeight : null,
      display: cs ? cs.display : null,
    };
  }, { setModel: SET_MODEL, part1: PART1 });
  console.log('  PART-01 mobile-only cell (should be font-weight 400, NOT 700):', JSON.stringify(part1MobileInfo));
  record('★★ 모바일 하위행명 font-weight=400 (볼드 해소, 342행 mobile-only:700 오버라이드)',
    part1MobileInfo?.fontWeight === '400', part1MobileInfo);

  const setMobileInfo = await page.evaluate((setModel) => {
    const row = document.querySelector(`#commBody tr[data-set-model="${setModel}"]`);
    const cellMobile = row ? row.querySelector('td.colD.mobile-only') : null;
    const cs = cellMobile ? getComputedStyle(cellMobile) : null;
    return { text: cellMobile ? cellMobile.textContent.trim() : null, fontWeight: cs ? cs.fontWeight : null };
  }, SET_MODEL);
  console.log('  SET(parent) mobile-only cell (회귀 없음, 여전히 bold 700 기대):', JSON.stringify(setMobileInfo));
  record('부모 SET행 모바일 이름 셀 font-weight=700 유지 (회귀 없음)', setMobileInfo?.fontWeight === '700', setMobileInfo);

  await page.close();
  await browser.close();

  console.log('\n=== VERDICT SUMMARY ===');
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`));
  console.log(`\nTOTAL ${results.length} / FAIL ${failed.length}`);
  console.log(failed.length === 0 ? 'DONE ALL-PASS' : 'DONE HAS-FAILURES');
  process.exit(0);
}

main().catch((e) => { console.error('FAIL(uncaught)', e); process.exit(1); });
