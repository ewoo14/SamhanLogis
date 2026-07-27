// #778 (#777 item2) 라이브 QA — 상업 구성품 카테고리별 단가 자동전환 (실 GUI 완주)
// 실 order-app dev server(:5185, VITE_API_BASE_URL=:8080 게이트웨이 직결, mock 없음)
// + 실 partner-auth-service(bizNo 2118712345 / PIN 1234) + 실 partner-order/product-service.
//
// 참고: OrderInfo -> "취소"(OrderCancel)로 돌아온 미리보기는 legacy `#due` change 핸들러
// (index.html:9268, v4 임베드 이전부터 존재하는 pre-existing 코드)가 buildSendRows() 기반으로
// #previewBody 를 별도 재작성하면서 group-top 행 누락 + 합계(#pvFoot 는 <tfoot> 밖이라
// `#dlgPreview tfoot td:last-child` 셀렉터가 매치 실패)가 STALE 로 남는 기존 버그를 노출한다.
// 이는 #778/#777 범위 밖(legacy 전역 이슈, 카테고리 무관)이므로 "참고 캡처"로 별도 저장하고,
// #778 자체(H1: commPartUnitPrice 공유헬퍼) 검증은 `#btnPreview` 재클릭(신선한 openPreview())
// 캡처로 한다.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
// _local 격리(2026-07-27 하네스 흡수 H2 — override 자체가 없어 재실행마다 커밋 증거를 덮어썼다).
const OUT = resolveQaShotsDir(_dirname);
const URL = 'http://localhost:5185/';
const SET_MODEL = 'QA777-COMM-SET-01';
const PART_MODEL = 'QA777-COMM-PART-01';

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  saved', name);
}
async function shotEl(page, sel, name) {
  await page.locator(sel).screenshot({ path: `${OUT}/${name}.png` });
  console.log('  saved(el)', name);
}

async function readCommRowState(page) {
  return page.evaluate(({ setModel, partModel }) => {
    const partRow = document.querySelector(`#commBody tr[data-part-of="${setModel}"][data-m="${partModel}"]`);
    const priceCell = partRow?.querySelector(`[data-cunit="${partModel}|${setModel}"]`);
    const subCell = partRow?.querySelector(`[data-csub="${partModel}|${setModel}"]`);
    const setRow = document.querySelector(`#commBody tr[data-set-model="${setModel}"]`);
    const setUnitCell = setRow?.querySelector(`[data-cunit="${setModel}"]`);
    const setSubCell = setRow?.querySelector(`[data-csub="${setModel}"]`);
    const commTotal = document.getElementById('commTotal')?.textContent;
    return {
      setUnitCellText: setUnitCell?.textContent ?? null,
      setSubCellText: setSubCell?.textContent ?? null,
      partPriceCellText: priceCell?.textContent ?? null,
      partSubCellText: subCell?.textContent ?? null,
      commTotalText: commTotal ?? null,
      dueValue: document.getElementById('due')?.value ?? null,
    };
  }, { setModel: SET_MODEL, partModel: PART_MODEL });
}

async function readPreviewState(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#previewBody tr'));
    const texts = rows.map((r) => r.textContent.trim().replace(/\s+/g, ' '));
    const pvSubtotal = document.getElementById('pvSubtotal')?.textContent ?? null;
    return { rows: texts, pvSubtotal };
  });
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
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  console.log('[1] login');
  await login(page);
  await shot(page, '00-mobilegate');

  console.log('[2] 상업멀티 진입');
  await page.click('#btnEnterComm');
  await page.waitForTimeout(800);
  await page.waitForSelector(`#commBody tr[data-set-model="${SET_MODEL}"]`, { timeout: 5000 });
  console.log('  due default value:', await page.inputValue('#due').catch(() => 'ERR'));

  console.log('[3] 수량 1 입력 (default due)');
  await page.fill(`input.qty-input[data-model="${SET_MODEL}"]`, '1');
  await page.waitForTimeout(500);
  await shotEl(page, '#cardComm', '01-comm-grid-qty1-default-due');
  console.log('  row state (default due):', JSON.stringify(await readCommRowState(page)));

  console.log('[4] 주문정보 진입 -> 납기희망일 2026-08-01 (변동일 전, 명시적 세팅)');
  await page.click('#btnPreview');
  await page.waitForTimeout(600);
  await page.click('#btnProceed');
  await page.waitForTimeout(500);
  await page.fill('#due', '2026-08-01');
  await page.waitForTimeout(400);
  await shot(page, '02-orderinfo-due-2026-08-01');
  console.log('  due after fill:', await page.inputValue('#due'));

  console.log('[5] 취소(OrderCancel) -> 참고캡처(legacy change-handler stale 재현)');
  await page.click('#btnOrderCancel');
  await page.waitForTimeout(700);
  await shot(page, 'ref-a-preview-orderCancel-reshow-due-2026-08-01');
  console.log('  [참고] OrderCancel reshow state:', JSON.stringify(await readPreviewState(page)));

  console.log('[6] 뒤로 -> 그리드 확인 (due=2026-08-01, BEFORE 기대 500000)');
  await page.click('#btnBack');
  await page.waitForTimeout(500);
  await page.fill(`input.qty-input[data-model="${SET_MODEL}"]`, '1');
  await page.waitForTimeout(500);
  await shotEl(page, '#cardComm', '03-comm-grid-due-2026-08-01-BEFORE.png'.replace('.png', ''));
  const gridBefore = await readCommRowState(page);
  console.log('  row state (BEFORE):', JSON.stringify(gridBefore));

  console.log('[7] 미리보기 재오픈 (신선한 openPreview(), due=2026-08-01) -> H1 CLEAN 캡처');
  await page.click('#btnPreview');
  await page.waitForTimeout(700);
  await shot(page, '04-preview-CLEAN-due-2026-08-01-BEFORE');
  const previewBefore = await readPreviewState(page);
  console.log('  preview state (CLEAN BEFORE):', JSON.stringify(previewBefore));

  console.log('[8] 주문정보 재진입 -> 납기희망일 2026-10-01 (변동일 후)');
  await page.click('#btnProceed');
  await page.waitForTimeout(500);
  await page.fill('#due', '2026-10-01');
  await page.waitForTimeout(400);
  await shot(page, '05-orderinfo-due-2026-10-01');
  console.log('  due after fill:', await page.inputValue('#due'));

  console.log('[9] 취소(OrderCancel) -> 참고캡처(legacy change-handler stale 재현, after)');
  await page.click('#btnOrderCancel');
  await page.waitForTimeout(700);
  await shot(page, 'ref-b-preview-orderCancel-reshow-due-2026-10-01');
  console.log('  [참고] OrderCancel reshow state:', JSON.stringify(await readPreviewState(page)));

  console.log('[10] 뒤로 -> 그리드 확인 (due=2026-10-01, AFTER 기대 700000)');
  await page.click('#btnBack');
  await page.waitForTimeout(500);
  await page.fill(`input.qty-input[data-model="${SET_MODEL}"]`, '1');
  await page.waitForTimeout(500);
  await shotEl(page, '#cardComm', '06-comm-grid-due-2026-10-01-AFTER');
  const gridAfter = await readCommRowState(page);
  console.log('  row state (AFTER):', JSON.stringify(gridAfter));

  console.log('[11] 미리보기 재오픈 (신선한 openPreview(), due=2026-10-01) -> H1 CLEAN 캡처');
  await page.click('#btnPreview');
  await page.waitForTimeout(700);
  await shot(page, '07-preview-CLEAN-due-2026-10-01-AFTER');
  const previewAfter = await readPreviewState(page);
  console.log('  preview state (CLEAN AFTER):', JSON.stringify(previewAfter));

  console.log('=== SUMMARY ===');
  console.log(JSON.stringify({ gridBefore, previewBefore, gridAfter, previewAfter }, null, 2));

  await browser.close();
  console.log('DONE');
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
