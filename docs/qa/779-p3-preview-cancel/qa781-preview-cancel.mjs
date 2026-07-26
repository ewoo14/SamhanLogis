// #781 (#779 P3) 라이브 QA — order-app 주문정보 "취소"→미리보기 재표시 시 group-top + 합계 non-stale 검증.
// 대상: fix/779-p3-preview-cancel 브랜치. btnOrderCancel: showModal() 원시재오픈 → openPreview() 정식재빌드.
//       #due change 핸들러: 평면 재작성(group-top 누락+깨진 tfoot 셀렉터) 제거.
// 실행: 실 order-app dev server(:5189, VITE_API_BASE_URL=http://localhost:8080/api/v1, mock 없음)
//       + 실 partner-auth-service(bizNo 2118712345 / PIN 1234) + 실 partner-order/product-service.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
// _local 격리(2026-07-27 하네스 흡수 H2 — 기존 QA_OUT 기본값이 커밋 경로를 직접 가리켰다.
// QA_SHOTS_DIR 로 통일한다).
const OUT = resolveQaShotsDir(_dirname);
const URL = process.env.QA_URL || 'http://localhost:5189/';
const TAG = process.env.QA_TAG || 'AFTER';
const SET_MODEL = 'QA777-COMM-SET-01'; // #778 QA 잔존 시드 (있으면 재사용, 없으면 fallback)

function parseNum(txt) {
  if (txt == null) return NaN;
  const n = Number(String(txt).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.png`, fullPage: false });
  console.log('  saved', `${TAG}-${name}`);
}
async function shotEl(page, sel, name) {
  await page.locator(sel).screenshot({ path: `${OUT}/${TAG}-${name}.png` });
  console.log('  saved(el)', `${TAG}-${name}`);
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

// 미리보기 DOM 상태 읽기: group-top 존재여부 + 각 행 소계 합 vs 표시된 합계(#pvSubtotal)
async function readPreviewIntegrity(page) {
  return page.evaluate(() => {
    const body = document.querySelector('#previewBody');
    const rows = Array.from(body ? body.querySelectorAll('tr') : []);
    const groupTopRows = rows.filter((r) => r.classList.contains('group-top'));
    const leafRows = rows.filter((r) => !r.classList.contains('group-top'));
    const rowTexts = rows.map((r) => ({
      isGroupTop: r.classList.contains('group-top'),
      text: r.textContent.trim().replace(/\s+/g, ' '),
    }));
    const leafSubtotals = leafRows.map((r) => {
      const tds = r.querySelectorAll('td');
      const last = tds[tds.length - 1];
      return last ? last.textContent.trim() : null;
    });
    const sumOfLeaf = leafSubtotals.reduce((acc, t) => {
      const n = Number(String(t).replace(/[^0-9.-]/g, ''));
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
    const pvSubtotal = document.getElementById('pvSubtotal')?.textContent ?? null;
    const dlgOpen = document.querySelector('#dlgPreview')?.open ?? null;
    return {
      dlgOpen,
      rowCount: rows.length,
      groupTopCount: groupTopRows.length,
      leafRowCount: leafRows.length,
      rowTexts,
      leafSubtotals,
      sumOfLeaf,
      pvSubtotalText: pvSubtotal,
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

  console.log(`=== TAG=${TAG} URL=${URL} ===`);
  console.log('[1] login (bizNo 2118712345 / PIN 1234)');
  await login(page);
  await shot(page, '01-login-landed');

  console.log('[2] 상업멀티 진입');
  await page.click('#btnEnterComm');
  await page.waitForTimeout(900);

  const setRowExists = await page.locator(`#commBody tr[data-set-model="${SET_MODEL}"]`).count();
  let targetModel = SET_MODEL;
  if (!setRowExists) {
    console.log(`  [fallback] ${SET_MODEL} 미존재 — commBody 내 첫 SET(비-accessory) row 탐색`);
    const anySetRow = page.locator('#commBody tr[data-set-model]').first();
    const cnt = await page.locator('#commBody tr[data-set-model]').count();
    console.log(`  commBody 내 data-set-model row 총 ${cnt}건`);
    if (cnt > 0) {
      targetModel = await anySetRow.getAttribute('data-set-model');
      console.log(`  fallback target = ${targetModel}`);
    } else {
      targetModel = null;
    }
  } else {
    console.log(`  [OK] ${SET_MODEL} 시드 잔존 확인`);
  }

  if (!targetModel) {
    console.log('FAIL: 상업멀티 그리드에 SET 품목(data-set-model) 자체가 없음 — 테스트 데이터 부재로 진행 불가');
    await shotEl(page, '#cardComm', '02-comm-grid-NO-SET-FOUND');
    await browser.close();
    process.exit(2);
  }

  await shotEl(page, '#cardComm', '02-comm-grid-before-qty');
  console.log(`[3] 수량 1 입력 (target=${targetModel})`);
  await page.fill(`#commBody .qty-input[data-model="${targetModel}"]`, '1');
  await page.waitForTimeout(600);
  await shotEl(page, '#cardComm', '03-comm-grid-qty1');
  console.log('  due default value:', await page.inputValue('#due').catch(() => 'ERR'));

  console.log('[4] 미리보기 최초 오픈 (openPreview) — 기준 상태');
  await page.click('#btnPreview');
  await page.waitForTimeout(700);
  await shot(page, '04-preview-initial-open');
  const initial = await readPreviewIntegrity(page);
  console.log('  initial preview state:', JSON.stringify(initial));

  console.log('[5] 주문하기 -> 주문정보 페이지 진입');
  await page.click('#btnProceed');
  await page.waitForTimeout(500);
  await shot(page, '05-orderinfo-entered');

  const dueBefore = await page.inputValue('#due').catch(() => null);
  // commercialMulti 변동일 = 2026-04-01(price_change_schedule). 오늘(기본 due)은 그 이후(인상 후,
  // QA781-COMM-PART-01 release_price=500,000) → 2026-02-01(변동일 이전, price_history baseline
  // 350,000)로 이동해 실제 가격 스왑을 유발한다 (500,000 -> 350,000, COMM_PARTS_INC 게이트 실증).
  const newDue = dueBefore === '2026-02-01' ? '2026-07-11' : '2026-02-01';
  console.log(`[6] 납품일(#due) 변경: ${dueBefore} -> ${newDue} (commercialMulti 변동일 2026-04-01 교차)`);
  await page.fill('#due', newDue);
  await page.waitForTimeout(500);
  await shot(page, '06-orderinfo-due-changed');

  console.log('[7] 취소(btnOrderCancel) -> 미리보기 재표시');
  await page.click('#btnOrderCancel');
  await page.waitForTimeout(800);
  await shot(page, '07-preview-RESHOW-after-cancel');
  const reshow = await readPreviewIntegrity(page);
  console.log('  reshow-after-cancel preview state:', JSON.stringify(reshow));

  console.log('[8] 비교용: 뒤로(닫기) -> 미리보기 재오픈 (신선 openPreview) 캡처');
  await page.click('#btnBack');
  await page.waitForTimeout(400);
  await page.click('#btnPreview');
  await page.waitForTimeout(700);
  await shot(page, '08-preview-fresh-reopen-compare');
  const freshReopen = await readPreviewIntegrity(page);
  console.log('  fresh-reopen preview state:', JSON.stringify(freshReopen));

  console.log('=== VERDICT ===');
  const reshowSumMatchesFoot = Math.abs(reshow.sumOfLeaf - parseNum(reshow.pvSubtotalText)) < 1;
  const reshowHasGroupTop = reshow.groupTopCount > 0;
  const reshowMatchesFresh = JSON.stringify(reshow.rowTexts) === JSON.stringify(freshReopen.rowTexts)
    && reshow.pvSubtotalText === freshReopen.pvSubtotalText;
  // 가격 실제 전환 실증: 초기(due=post-increase, 500,000) vs 재표시(due=pre-increase, 350,000) 총합이
  // 실제로 달라야 "stale 아님"이 의미있게 증명된다(같으면 우연히 안 바뀐 값과 구분 불가).
  const totalActuallyChanged = reshow.sumOfLeaf !== initial.sumOfLeaf;
  const verdict = {
    dueBefore, newDue,
    totalActuallyChanged,
    initial_groupTopCount: initial.groupTopCount,
    initial_pvSubtotalText: initial.pvSubtotalText,
    initial_sumOfLeaf: initial.sumOfLeaf,
    reshow_groupTopCount: reshow.groupTopCount,
    reshow_pvSubtotalText: reshow.pvSubtotalText,
    reshow_sumOfLeaf: reshow.sumOfLeaf,
    reshowHasGroupTop,
    reshowSumMatchesFoot,
    reshowMatchesFresh,
    PASS: reshowHasGroupTop && reshowSumMatchesFoot && reshowMatchesFresh && totalActuallyChanged,
  };
  console.log(JSON.stringify(verdict, null, 2));

  await browser.close();
  console.log(verdict.PASS ? 'DONE PASS' : 'DONE FAIL');
  process.exit(verdict.PASS ? 0 : 1);
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
