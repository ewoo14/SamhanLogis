import { resolveQaShotsDir } from '../support/qa-screenshot-dir.mjs'
// PR #798 (#782 part3) 라이브 QA — 상업 SET 부모행 'SET' 마커(discoverability) 검증.
// index.html <style> CSS 1줄 추가만(fix/782-setpart-discoverability):
//   tr[data-is-set="1"]:not(.set-part) td.colD::before{content:"SET";...소형 파랑 pill}
// #797 QA 하네스(qa797-setpart-real-qa) 재사용 — 동일 QA797 마커 seed(상업 SET+구성품 2종+GEN 회귀비교).
// 시드: QA797-SET-01(부모 SET, catL=실외기 unit=SET) + QA797-PART-01(defaultQty=2)/QA797-PART-02
//   (defaultQty=1) 구성품 + QA797-GEN-01(일반 상업멀티 품목, unit=EA, SET 아님, 회귀비교용).
// 실행: 실 order-app dev server(mock 없음, VITE_API_BASE_URL=http://localhost:8080/api/v1)
//       + 실 partner-auth-service(bizNo 2118712345 / PIN 1234) + 실 partner-order/product-service.
import { chromium } from '@playwright/test';

const OUT = resolveQaShotsDir(process.env.QA_OUT || 'C:/dev/Samhan-Public/docs/qa/e782-part3-marker');
const URL = process.env.QA_URL || 'http://localhost:5198/';
const LABEL = process.env.QA_LABEL || 'after';

const SET_MODEL = 'QA797-SET-01';
const PART1 = 'QA797-PART-01'; // defaultQty=2
const PART2 = 'QA797-PART-02'; // defaultQty=1
const GEN_MODEL = 'QA797-GEN-01'; // 일반 상업멀티 품목(SET 아님, 회귀비교용)

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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

/** 지정 셀의 ::before 마커 상태(content/표시여부) + 행 정보를 읽는다. */
async function readMarkerInfo(page, rowSel) {
  return page.evaluate((rSel) => {
    const row = document.querySelector(rSel);
    if (!row) return null;
    const pc = row.querySelector('td.colD.pc-only');
    const mo = row.querySelector('td.colD.mobile-only');
    const plain = row.querySelector('td.colD:not(.pc-only):not(.mobile-only)');
    const nameCell = pc || mo || plain;
    const readCell = (cell) => {
      if (!cell) return null;
      const before = getComputedStyle(cell, '::before');
      const cs = getComputedStyle(cell);
      return {
        content: before.content,
        beforeDisplay: before.display,
        cellDisplay: cs.display,
        text: cell.textContent.trim(),
      };
    };
    return {
      classList: Array.from(row.classList),
      isSet: row.dataset.isSet || null,
      rowHeight: row.getBoundingClientRect().height,
      pc: readCell(pc),
      mo: readCell(mo),
      nameCellText: nameCell ? nameCell.textContent.trim() : null,
    };
  }, rowSel);
}

function hasSetMarker(cellInfo) {
  return !!cellInfo && cellInfo.content && cellInfo.content.includes('SET') && cellInfo.beforeDisplay !== 'none';
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

  console.log('[3] 마커 확인 — 수량 입력 전(구성품 미출현 상태)');
  const setInfoBefore = await readMarkerInfo(page, `#commBody tr[data-set-model="${SET_MODEL}"]`);
  console.log('  SET row (qty=0, before children):', JSON.stringify(setInfoBefore));
  record('부모 SET행 data-is-set=1 보유', setInfoBefore?.isSet === '1', setInfoBefore);
  record('부모 SET행 PC 셀에 SET 마커 렌더 (qty=0 상태에서도)', hasSetMarker(setInfoBefore?.pc), setInfoBefore?.pc);

  console.log('[4] QA797-SET-01 수량=3 입력 (PART-01 defaultQty=2 → "3 × 2", PART-02 defaultQty=1 → "3 × 1")');
  await page.fill(`#commBody .qty-input[data-model="${SET_MODEL}"]`, '3');
  await page.waitForTimeout(600);

  await setAnchor.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  await shotEl(page, '#cardComm', 'set-marker-desktop');

  const setInfo = await readMarkerInfo(page, `#commBody tr[data-set-model="${SET_MODEL}"]`);
  const part1Info = await readMarkerInfo(page, `#commBody tr[data-part-of="${SET_MODEL}"][data-m="${PART1}"]`);
  const part2Info = await readMarkerInfo(page, `#commBody tr[data-part-of="${SET_MODEL}"][data-m="${PART2}"]`);
  const genInfo = await readMarkerInfo(page, `#commBody tr[data-m="${GEN_MODEL}"]`);
  console.log('  SET row (parent, qty=3):', JSON.stringify(setInfo));
  console.log('  PART-01 row (child, .set-part):', JSON.stringify(part1Info));
  console.log('  PART-02 row (child, .set-part):', JSON.stringify(part2Info));
  console.log('  GEN row (일반 품목, 회귀비교):', JSON.stringify(genInfo));

  record('★ 부모 SET행에만 "SET" 마커 렌더 (PC)', hasSetMarker(setInfo?.pc), setInfo?.pc);
  record('★★ 구성품 하위행(PART-01, .set-part) 마커 미표시 (회귀 없음)', !hasSetMarker(part1Info?.pc), part1Info?.pc);
  record('★★ 구성품 하위행(PART-02, .set-part) 마커 미표시 (회귀 없음)', !hasSetMarker(part2Info?.pc), part2Info?.pc);
  record('★★ 일반 상업멀티 품목(GEN, unit=EA) 마커 미표시 (오탐 없음)', !hasSetMarker(genInfo?.pc), genInfo?.pc);
  record('구성품 하위행(PART-01) .set-part 클래스 보유(#797 회귀)', part1Info?.classList?.includes('set-part'), part1Info?.classList);
  record('구성품 하위행(PART-02) .set-part 클래스 보유(#797 회귀)', part2Info?.classList?.includes('set-part'), part2Info?.classList);
  record('GEN행 .set-part 미보유(#797 회귀)', genInfo != null && !genInfo.classList.includes('set-part'), genInfo?.classList);

  // 값 정합(수량표시) — #797 회귀 가드.
  const part1Qty = await page.locator(`#commBody tr[data-part-of="${SET_MODEL}"][data-m="${PART1}"] .qty-set`).textContent();
  record('PART-01 표시 수량 "3 × 2" (#797 회귀)', part1Qty?.trim() === '3 × 2', { part1Qty });

  console.log('[5] 밀도(행높이) 회귀 확인 — SET행 vs GEN행(둘 다 최상위, 마커 유무만 다름) 높이 동일');
  record('SET행 높이 == GEN행 높이 (마커가 행높이 미변경)', setInfo?.rowHeight === genInfo?.rowHeight,
    { setHeight: setInfo?.rowHeight, genHeight: genInfo?.rowHeight });

  console.log('[6] 이름 판독 유지 — 마커가 텍스트를 가리지 않고 nameCell textContent 그대로 유지');
  record('SET행 이름 텍스트 비어있지 않음(마커=CSS ::before 라 textContent 불변)', !!setInfo?.nameCellText && setInfo.nameCellText.length > 0, setInfo?.nameCellText);

  console.log('[7] UUID 미노출 확인 (상업멀티 카드 전체 텍스트)');
  const commText = await page.locator('#cardComm').innerText();
  record('상업멀티 카드 텍스트에 UUID 패턴 없음', !UUID_RE.test(commText), { sample: commText.slice(0, 0) });

  console.log('[8] 모바일 뷰(390x844) — pc-only/mobile-only 마커 중복노출 없음(뷰당 1개)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await setAnchor.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shotEl(page, '#cardComm', 'set-marker-mobile');

  const setInfoMobile = await readMarkerInfo(page, `#commBody tr[data-set-model="${SET_MODEL}"]`);
  const genInfoMobile = await readMarkerInfo(page, `#commBody tr[data-m="${GEN_MODEL}"]`);
  console.log('  SET row (mobile viewport):', JSON.stringify(setInfoMobile));
  console.log('  GEN row (mobile viewport):', JSON.stringify(genInfoMobile));

  record('모바일 뷰: PC 셀 display=none (숨김, 마커 중복 없음)', setInfoMobile?.pc?.cellDisplay === 'none', setInfoMobile?.pc);
  record('모바일 뷰: mobile-only 셀 표시 + SET 마커 렌더', hasSetMarker(setInfoMobile?.mo) && setInfoMobile?.mo?.cellDisplay !== 'none', setInfoMobile?.mo);
  record('모바일 뷰: GEN행 mobile-only 셀 마커 미표시 (오탐 없음)', !hasSetMarker(genInfoMobile?.mo), genInfoMobile?.mo);

  const part1MobileInfo = await readMarkerInfo(page, `#commBody tr[data-part-of="${SET_MODEL}"][data-m="${PART1}"]`);
  record('모바일 뷰: 구성품 하위행(PART-01) font-weight=400 유지 (#797 회귀)',
    (await page.evaluate((sel) => {
      const row = document.querySelector(sel);
      const cell = row ? row.querySelector('td.colD.mobile-only') : null;
      return cell ? getComputedStyle(cell).fontWeight : null;
    }, `#commBody tr[data-part-of="${SET_MODEL}"][data-m="${PART1}"]`)) === '400',
    part1MobileInfo?.mo);

  await page.close();
  await browser.close();

  console.log('\n=== VERDICT SUMMARY ===');
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`));
  console.log(`\nTOTAL ${results.length} / FAIL ${failed.length}`);
  console.log(failed.length === 0 ? 'DONE ALL-PASS' : 'DONE HAS-FAILURES');
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FAIL(uncaught)', e); process.exit(1); });
