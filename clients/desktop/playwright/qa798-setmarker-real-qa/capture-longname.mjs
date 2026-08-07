import { resolveQaShotsDir } from '../support/qa-screenshot-dir.mjs'
// PR #798 (#782 part3) 라이브 QA 추가검증 — Design/FE Low 지적 대응:
// "PC뷰서 긴 SET 품목명 — 마커가 첫줄 폭 잠식→wrap/overflow:hidden 잘림 경계".
// QA797-SET-01 name 을 임시로 42자 실제 HVAC 상업장비명 스타일 긴 이름으로 UPDATE 한 뒤
// (docker restart samhan-partner-order-service 로 bootstrap prefetch 갱신 완료 후) 렌더 검증.
// 캡처 후 원본 이름으로 즉시 revert 예정(별도 _tmp-revert-set.sql).
import { chromium } from '@playwright/test';

const OUT = resolveQaShotsDir(process.env.QA_OUT || '../../docs/qa/e782-part3-marker');
const URL = process.env.QA_URL || 'http://localhost:5198/';
const SET_MODEL = 'QA797-SET-01';
const LONG_NAME = '삼성 상업용 냉난방 인버터 스탠드형 20마력 멀티 실외기 초고효율 세트 모델';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
}
async function shotEl(page, sel, name) {
  await page.locator(sel).screenshot({ path: `${OUT}/${name}.png` });
  console.log('  saved(el)', name);
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
  if (await gateModal.isVisible().catch(() => false)) { await page.click('#btnImgClose').catch(() => {}); await page.waitForTimeout(500); }
  const tutBox = page.locator('#tutBox');
  if (await tutBox.isVisible().catch(() => false)) {
    const skipBtn = page.locator('button:has-text("튜토리얼 스킵")');
    if (await skipBtn.isVisible().catch(() => false)) { await skipBtn.click(); await page.waitForTimeout(500); }
  }
  await page.evaluate(() => document.querySelectorAll('.tut-blocker').forEach((el) => el.remove()));
}

async function measureWrap(page, sel) {
  return page.evaluate((s) => {
    const row = document.querySelector(s);
    if (!row) return null;
    const cell = row.querySelector('td.colD.pc-only') || row.querySelector('td.colD');
    if (!cell) return null;
    const cr = cell.getBoundingClientRect();
    const before = getComputedStyle(cell, '::before');
    const cs = getComputedStyle(cell);
    return {
      text: cell.textContent.trim(),
      cellClientW: cell.clientWidth,
      cellClientH: cell.clientHeight,
      cellScrollW: cell.scrollWidth,
      cellScrollH: cell.scrollHeight,
      wrapsToMultiLine: cell.scrollHeight > (parseFloat(cs.lineHeight) * 1.4 || 0),
      horizontalOverflowClipped: cell.scrollWidth > cell.clientWidth + 1 && (cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis'),
      overflowX: cs.overflowX,
      whiteSpace: cs.whiteSpace,
      textOverflow: cs.textOverflow,
      markerContent: before.content,
      rowHeight: row.getBoundingClientRect().height,
    };
  }, sel);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  console.log('[1] login');
  await login(page);

  console.log('[2] 상업멀티 진입');
  await page.click('#btnEnterComm');
  await page.waitForTimeout(900);

  const setAnchor = page.locator(`#commBody tr[data-set-model="${SET_MODEL}"]`);
  const anchorCount = await setAnchor.count();
  record('QA797-SET-01(긴 이름) SET 행 렌더', anchorCount > 0, { anchorCount });
  if (anchorCount === 0) {
    await shotEl(page, '#cardComm', '99-fatal-longname-no-anchor');
    await browser.close();
    process.exit(1);
  }

  // PC 표시명은 stripCommKeywords()(#798 무관 기존 로직)가 "실외기/판넬/DUCT" 등 분류 중복 키워드를
  // 제거한다 — 원본 DB name(42자)과 정확히 일치하지 않을 수 있음(정상). 충분히 길고(15자 초과) DB
  // 원본 긴 이름 갱신이 반영됐는지(구 이름이 아닌지)만 확인.
  const nameNow = await page.locator(`#commBody tr[data-set-model="${SET_MODEL}"] td.colD.pc-only`).textContent();
  const nameNowTrim = (nameNow || '').trim();
  record('PC 표시명이 긴 이름 UPDATE 반영(구 짧은 이름 아님 + 15자 초과, bootstrap prefetch 갱신 확인)',
    nameNowTrim.length > 15 && nameNowTrim !== 'QA797 상업 시각폴리시 테스트', { nameNowTrim, rawDbName: LONG_NAME, note: 'stripCommKeywords()가 실외기 등 분류중복어 제거 — #798 무관 기존 로직' });
  const nameNowMobileRaw = await page.locator(`#commBody tr[data-set-model="${SET_MODEL}"] td.colD.mobile-only`).textContent();
  record('모바일 표시명(rawNameOf, 스크럽 미적용)은 DB 원본 42자 그대로', nameNowMobileRaw?.trim() === LONG_NAME, { nameNowMobileRaw });

  await setAnchor.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  await shotEl(page, '#cardComm', 'longname-set-desktop-1440-full-card');

  // 이름셀만 확대 캡처(잘림 경계 근접 확인용).
  await page.locator(`#commBody tr[data-set-model="${SET_MODEL}"] td.colD.pc-only`).screenshot({ path: `${OUT}/longname-set-desktop-1440-cell-closeup.png` });
  console.log('  saved(el) longname-set-desktop-1440-cell-closeup');

  const wrapInfo = await measureWrap(page, `#commBody tr[data-set-model="${SET_MODEL}"]`);
  console.log('  wrapInfo(1440px):', JSON.stringify(wrapInfo));
  record('마커 렌더 유지(긴 이름에서도)', wrapInfo?.markerContent?.includes('SET'), wrapInfo);
  record('overflow:hidden/text-overflow:ellipsis 로 인한 잘림 없음(줄바꿈으로 전체 표시)', !wrapInfo?.horizontalOverflowClipped, wrapInfo);
  record('긴 이름은 여러 줄로 wrap(행 높이 자동 확장, 정보 손실 없음)', wrapInfo?.wrapsToMultiLine === true, wrapInfo);

  // 좀 더 좁은 데스크톱 폭(1366, 흔한 노트북 해상도)에서도 확인.
  // 주의: CSS breakpoint 는 `@media (max-width:1280px)` (1280 포함) — 1280 을 쓰면 pc-only 가
  // display:none 되어 mobile-only 로 전환되므로(PC뷰 테스트 목적과 어긋남) 1366 사용.
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.waitForTimeout(400);
  await setAnchor.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shotEl(page, '#cardComm', 'longname-set-desktop-1366-full-card');
  const wrapInfo1366 = await measureWrap(page, `#commBody tr[data-set-model="${SET_MODEL}"]`);
  console.log('  wrapInfo(1366px):', JSON.stringify(wrapInfo1366));
  record('1366px 폭(PC, breakpoint 상회)에서도 잘림(overflow:hidden) 없음', !wrapInfo1366?.horizontalOverflowClipped, wrapInfo1366);
  record('1366px 폭에서 pc-only 셀 여전히 표시(mobile 미전환 확인)', wrapInfo1366?.cellClientW > 0, wrapInfo1366);

  await page.close();
  await browser.close();

  console.log('\n=== VERDICT SUMMARY (longname) ===');
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`));
  console.log(`\nTOTAL ${results.length} / FAIL ${failed.length}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FAIL(uncaught)', e); process.exit(1); });
