// #780 (#779 P1 재작업) 라이브 QA — 상업 SET 구성품 그리드 rowspan 엔진 결정적 검증.
// 대상: fix/779-comm-grid-legacy 브랜치 (commit 0947241f2). buildCommSetIndex COMM_PARTS 참조 수정
//       + renderComm SET 하위행을 q>0 에만 렌더(밀도) + renderCommSetParts/adjustCommSetGroupRowSpans_
//       (B접근: 커버 tdL/M/S rowSpan 증분 + 하위행은 비그룹 셀만) + 모바일 4셀 미러.
// 시드: QA779_P1 마커(product_db classification/products/product_estimate_exposure/bundle_component/
//       price_history) — 실외기 L그룹 3행(A/SET/B, SET이 중간) + QA779검증그룹 L+M 3행(A/SET/B).
// 실행: 실 order-app dev server(:5195, VITE_API_BASE_URL=http://localhost:8080/api/v1, mock 없음)
//       + 실 partner-auth-service(bizNo 2118712345 / PIN 1234) + 실 partner-order/product-service.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
// _local 격리(2026-07-27 하네스 흡수 H2 — 기존 QA_OUT 기본값이 커밋 경로를 직접 가리켰다.
// QA_SHOTS_DIR 로 통일한다).
const OUT = resolveQaShotsDir(_dirname);
const URL = process.env.QA_URL || 'http://localhost:5195/';

const ODU_A = 'QA779-P1-ODU-A';
const ODU_SET = 'QA779-P1-ODU-SET';
const ODU_B = 'QA779-P1-ODU-B';
const ODU_PART_1 = 'QA779-P1-PART-1';
const ODU_PART_2 = 'QA779-P1-PART-2';
const IDU_A = 'QA779-P1-IDU-A';
const IDU_SET = 'QA779-P1-IDU-SET';
const IDU_B = 'QA779-P1-IDU-B';
const IDU_PART_1 = 'QA779-P1-PART-3';
const IDU_PART_2 = 'QA779-P1-PART-4';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log('  saved', name);
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

// commBody 전체 행 구조 스냅샷 (data 속성 + 가시 셀 텍스트 + className)
async function snapshotGrid(page) {
  return page.evaluate(() => {
    const body = document.querySelector('#commBody');
    return Array.from(body ? body.querySelectorAll('tr') : []).map((tr, i) => ({
      i,
      dataM: tr.getAttribute('data-m'),
      isSet: tr.getAttribute('data-is-set'),
      setModel: tr.getAttribute('data-set-model'),
      partOf: tr.getAttribute('data-part-of'),
      cellCount: tr.children.length,
      cells: Array.from(tr.children).map((td) => ({
        cls: td.className,
        rowSpan: td.rowSpan,
        colSpan: td.colSpan,
        text: td.textContent.trim(),
      })),
    }));
  });
}

// 헤더 열(모델명/수량/납품가/소계) bbox
async function headerBoxes(page) {
  const ths = page.locator('#wrapComm thead th');
  const n = await ths.count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const box = await ths.nth(i).boundingBox();
    const cls = await ths.nth(i).getAttribute('class');
    const text = (await ths.nth(i).textContent())?.trim();
    out.push({ i, cls, box, text });
  }
  return out;
}

// 특정 행(dataM 로 식별)의 각 <td> bbox + class
async function rowCellBoxes(page, dataM) {
  const row = page.locator(`#commBody tr[data-m="${dataM}"]`).first();
  const cnt = await row.locator('td').count();
  const out = [];
  for (let i = 0; i < cnt; i++) {
    const td = row.locator('td').nth(i);
    const box = await td.boundingBox();
    const cls = await td.getAttribute('class');
    const text = (await td.textContent())?.trim();
    out.push({ i, cls, box, text });
  }
  return out;
}

async function colLMRowSpan(page, anchorModel) {
  return page.evaluate((model) => {
    const row = document.querySelector(`#commBody tr[data-m="${model}"]`);
    const tdL = row ? row.querySelector('td.colL.pc-only') : null;
    const tdM = row ? row.querySelector('td.colM.pc-only') : null;
    return { colLRowSpan: tdL ? tdL.rowSpan : null, colMRowSpan: tdM ? tdM.rowSpan : null };
  }, anchorModel);
}

// 데스크톱에서 .mobile-only 셀은 display:none 이라 boundingBox()==null 이 정상(양쪽 다 null=정합).
// 한쪽만 null 이면 실제 표시상태 변화(버그 후보) — 그 경우만 불일치로 판정한다.
function approxEqual(a, b, eps = 2) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= eps;
}

async function fillQty(page, model, qty) {
  const sel = `#commBody .qty-input[data-model="${model}"]`;
  await page.fill(sel, String(qty));
  await page.waitForTimeout(500);
}

async function readPartPrices(page, setModel, partModel) {
  return page.evaluate(({ setModel, partModel }) => {
    const row = document.querySelector(`#commBody tr[data-part-of="${setModel}"][data-m="${partModel}"]`);
    const uCell = row ? row.querySelector(`[data-cunit="${partModel}|${setModel}"]`) : null;
    const sCell = row ? row.querySelector(`[data-csub="${partModel}|${setModel}"]`) : null;
    return { unit: uCell ? uCell.textContent.trim() : null, sub: sCell ? sCell.textContent.trim() : null };
  }, { setModel, partModel });
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // ============================================================
  // DESKTOP
  // ============================================================
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

  console.log('=== DESKTOP ===');
  console.log('[1] login (bizNo 2118712345 / PIN 1234)');
  await login(page);
  await shot(page, '00-login-landed');

  console.log('[2] 상업멀티 진입');
  await page.click('#btnEnterComm');
  await page.waitForTimeout(900);
  await page.waitForSelector(`#commBody tr[data-set-model="${ODU_SET}"]`, { timeout: 5000 });
  await page.waitForSelector(`#commBody tr[data-set-model="${IDU_SET}"]`, { timeout: 5000 });

  const initialGrid = await snapshotGrid(page);
  record('시드 6행 전량 렌더(A/SET/B x2그룹, 하위행 0)', initialGrid.length === 6, { rowCount: initialGrid.length });
  await shotEl(page, '#cardComm', '01-initial-grid-qty0-no-subrows');

  const initColLM_ODU = await colLMRowSpan(page, ODU_A);
  const initColLM_IDU = await colLMRowSpan(page, IDU_A);
  record('초기 실외기 tdL rowSpan=3 (lOnlyL, colM 없음)', initColLM_ODU.colLRowSpan === 3 && initColLM_ODU.colMRowSpan === null, initColLM_ODU);
  record('초기 QA779검증그룹 tdL=3 & tdM=3 (M레벨 존재)', initColLM_IDU.colLRowSpan === 3 && initColLM_IDU.colMRowSpan === 3, initColLM_IDU);

  const headers = await headerBoxes(page);
  console.log('  header boxes:', JSON.stringify(headers));

  const oduB_before = await rowCellBoxes(page, ODU_B);
  const iduB_before = await rowCellBoxes(page, IDU_B);
  console.log('  ODU-B before:', JSON.stringify(oduB_before));
  console.log('  IDU-B before:', JSON.stringify(iduB_before));

  console.log('[3] 실외기 SET 수량=2 입력 (2개 구성품 하위행 기대)');
  await fillQty(page, ODU_SET, 2);
  await shotEl(page, '#cardComm', '02-odu-set-qty2-subrows');

  const gridAfterOdu = await snapshotGrid(page);
  const oduParts = gridAfterOdu.filter((r) => r.partOf === ODU_SET);
  record('실외기 SET q=2 -> 하위행 2건 렌더', oduParts.length === 2, oduParts.map((r) => r.dataM));
  record('전체 행수 6 -> 8 (하위행 2건 추가)', gridAfterOdu.length === 8, { rowCount: gridAfterOdu.length });

  const colLM_ODU_after = await colLMRowSpan(page, ODU_A);
  record('실외기 tdL rowSpan 3->5 (B접근 증분)', colLM_ODU_after.colLRowSpan === 5, colLM_ODU_after);

  const oduB_after = await rowCellBoxes(page, ODU_B);
  const shiftCheckOdu = oduB_before.map((c, i) => {
    const other = oduB_after[i];
    return {
      i, cls: c.cls,
      beforeX: c.box?.x, afterX: other?.box?.x,
      sameCls: c.cls === other?.cls,
      xAligned: approxEqual(c.box?.x, other?.box?.x),
      textBefore: c.text, textAfter: other?.text,
    };
  });
  console.log('  ODU-B shift-check:', JSON.stringify(shiftCheckOdu));
  const oduBNoShift = shiftCheckOdu.every((c) => c.sameCls && c.xAligned && c.textBefore === c.textAfter);
  record('★ 실외기 B행 열 정렬 무결성 (하위행 삽입 후 미시프트, 셀 좌표 실측)', oduBNoShift, shiftCheckOdu);

  // 하위행 셀이 헤더 열(모델/수량/납품가/소계)과 정렬되는지 좌표로 검증
  const subRow1Cells = await rowCellBoxes(page, ODU_PART_1);
  const hModel = headers.find((h) => h.cls?.includes('model'));
  const hQty = headers.find((h) => h.text === '수량' && !h.cls);
  const hPrice = headers.find((h) => h.cls?.includes('h-price'));
  const hSub = headers.find((h) => h.cls?.includes('sub'));
  const subModel = subRow1Cells.find((c) => c.cls === 'model');
  const subQty = subRow1Cells.find((c) => c.cls === 'qty');
  const subPrice = subRow1Cells.find((c) => c.cls === 'price');
  const subSub = subRow1Cells.find((c) => c.cls?.includes('sub'));
  const alignment = {
    model: approxEqual(hModel?.box?.x, subModel?.box?.x),
    qty: approxEqual(hQty?.box?.x, subQty?.box?.x),
    price: approxEqual(hPrice?.box?.x, subPrice?.box?.x),
    sub: approxEqual(hSub?.box?.x, subSub?.box?.x),
  };
  console.log('  header vs subrow1 alignment:', JSON.stringify({ headers, subRow1Cells, alignment }));
  record('★ 하위행1(PART-1) 열이 헤더 모델/수량/납품가/소계와 x좌표 정렬', Object.values(alignment).every(Boolean), alignment);

  console.log('[4] QA779검증그룹 SET 수량=1 입력 (M레벨 존재 그룹, tdL+tdM 동시 증분 기대)');
  await fillQty(page, IDU_SET, 1);
  await shotEl(page, '#cardComm', '03-idu-set-qty1-subrows');

  const gridAfterIdu = await snapshotGrid(page);
  const iduParts = gridAfterIdu.filter((r) => r.partOf === IDU_SET);
  record('QA779검증그룹 SET q=1 -> 하위행 2건 렌더', iduParts.length === 2, iduParts.map((r) => r.dataM));
  record('전체 행수 8 -> 10 (하위행 2건 추가)', gridAfterIdu.length === 10, { rowCount: gridAfterIdu.length });

  const colLM_IDU_after = await colLMRowSpan(page, IDU_A);
  record('QA779검증그룹 tdL 3->5 & tdM 3->5 (동시 증분)', colLM_IDU_after.colLRowSpan === 5 && colLM_IDU_after.colMRowSpan === 5, colLM_IDU_after);

  const iduB_after = await rowCellBoxes(page, IDU_B);
  const shiftCheckIdu = iduB_before.map((c, i) => {
    const other = iduB_after[i];
    return {
      i, cls: c.cls,
      sameCls: c.cls === other?.cls,
      xAligned: approxEqual(c.box?.x, other?.box?.x),
      textBefore: c.text, textAfter: other?.text,
    };
  });
  console.log('  IDU-B shift-check:', JSON.stringify(shiftCheckIdu));
  const iduBNoShift = shiftCheckIdu.every((c) => c.sameCls && c.xAligned && c.textBefore === c.textAfter);
  record('★ QA779검증그룹 B행 열 정렬 무결성 (M레벨 그룹서도 미시프트)', iduBNoShift, shiftCheckIdu);

  await shotEl(page, '#cardComm', '04-both-sets-expanded-full-grid');

  console.log('[5] 밀도(q>0) 토글: 실외기 SET 수량 0 -> 하위행 제거 + rowSpan 원복 기대');
  await fillQty(page, ODU_SET, 0);
  await shotEl(page, '#cardComm', '05-odu-set-qty0-subrows-removed');
  const gridQty0 = await snapshotGrid(page);
  const oduPartsQty0 = gridQty0.filter((r) => r.partOf === ODU_SET);
  record('수량 0 -> 하위행 제거(0건)', oduPartsQty0.length === 0, { count: oduPartsQty0.length });
  const colLM_ODU_qty0 = await colLMRowSpan(page, ODU_A);
  record('수량 0 -> tdL rowSpan 5->3 원복', colLM_ODU_qty0.colLRowSpan === 3, colLM_ODU_qty0);

  console.log('[6] 밀도(q>0) 토글: 실외기 SET 수량 3 재입력 -> 재렌더 + rowSpan 재증분 기대');
  await fillQty(page, ODU_SET, 3);
  await shotEl(page, '#cardComm', '06-odu-set-qty3-subrows-readded');
  const gridQty3 = await snapshotGrid(page);
  const oduPartsQty3 = gridQty3.filter((r) => r.partOf === ODU_SET);
  record('수량 3 재입력 -> 하위행 2건 재렌더', oduPartsQty3.length === 2, oduPartsQty3.map((r) => r.dataM));
  const colLM_ODU_qty3 = await colLMRowSpan(page, ODU_A);
  record('수량 3 재입력 -> tdL rowSpan 3->5 재증분', colLM_ODU_qty3.colLRowSpan === 5, colLM_ODU_qty3);
  const qty3Prices = await readPartPrices(page, ODU_SET, ODU_PART_1);
  console.log('  qty3 part1 unit/sub (multiplier 반영 확인):', JSON.stringify(qty3Prices));

  console.log('[7] 구성품 단가 전환 — 기본 due(>=2026-04-01, 인상후) 확인');
  const dueDefault = await page.inputValue('#due').catch(() => null);
  console.log('  #due default value:', dueDefault);
  const pricesPostIncrease = {
    part1: await readPartPrices(page, ODU_SET, ODU_PART_1),
    part2: await readPartPrices(page, ODU_SET, ODU_PART_2),
  };
  record('기본 due(인상후) -> PART-1 단가=700,000', pricesPostIncrease.part1.unit === '700,000', pricesPostIncrease.part1);
  record('기본 due(인상후) -> PART-2 단가=250,000', pricesPostIncrease.part2.unit === '250,000', pricesPostIncrease.part2);

  console.log('[8] 주문정보 진입 -> 납기희망일 2026-02-01(변동일 2026-04-01 이전, 인상전 기대)');
  await page.click('#btnPreview');
  await page.waitForTimeout(600);
  await page.click('#btnProceed');
  await page.waitForTimeout(500);
  await page.fill('#due', '2026-02-01');
  await page.waitForTimeout(500);
  await shot(page, '07-orderinfo-due-2026-02-01-pre-increase');
  await page.click('#btnOrderCancel');
  await page.waitForTimeout(700);
  await page.click('#btnBack');
  await page.waitForTimeout(500);

  const pricesPreIncrease = {
    part1: await readPartPrices(page, ODU_SET, ODU_PART_1),
    part2: await readPartPrices(page, ODU_SET, ODU_PART_2),
  };
  await shotEl(page, '#cardComm', '08-odu-set-due-pre-increase-parts-baseline');
  record('due=2026-02-01(인상전) -> PART-1 단가 700,000->500,000 전환', pricesPreIncrease.part1.unit === '500,000', pricesPreIncrease.part1);
  record('due=2026-02-01(인상전) -> PART-2 단가 250,000->200,000 전환', pricesPreIncrease.part2.unit === '200,000', pricesPreIncrease.part2);

  console.log('[9] 납기희망일 원복 (2026-07-11, 변동일 이후, 인상후 복귀 기대)');
  await page.click('#btnPreview');
  await page.waitForTimeout(600);
  await page.click('#btnProceed');
  await page.waitForTimeout(500);
  await page.fill('#due', '2026-07-11');
  await page.waitForTimeout(500);
  await page.click('#btnOrderCancel');
  await page.waitForTimeout(700);
  await page.click('#btnBack');
  await page.waitForTimeout(500);
  const pricesRevert = {
    part1: await readPartPrices(page, ODU_SET, ODU_PART_1),
    part2: await readPartPrices(page, ODU_SET, ODU_PART_2),
  };
  await shotEl(page, '#cardComm', '09-odu-set-due-post-increase-parts-reverted');
  record('due=2026-07-11(인상후 복귀) -> PART-1 500,000->700,000 복귀', pricesRevert.part1.unit === '700,000', pricesRevert.part1);
  record('due=2026-07-11(인상후 복귀) -> PART-2 200,000->250,000 복귀', pricesRevert.part2.unit === '250,000', pricesRevert.part2);

  await page.close();

  // ============================================================
  // MOBILE (<=1280px)
  // ============================================================
  console.log('=== MOBILE (768px) ===');
  const mpage = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  mpage.on('pageerror', (e) => console.log('[m pageerror]', e.message));
  console.log('[m1] login');
  await login(mpage);
  console.log('[m2] 상업멀티 진입');
  await mpage.click('#btnEnterComm');
  await mpage.waitForTimeout(900);
  await mpage.waitForSelector(`#commBody tr[data-set-model="${ODU_SET}"]`, { timeout: 5000 });
  await shotEl(mpage, '#cardComm', '10-mobile-initial-grid');

  console.log('[m3] 실외기 SET 수량=2, QA779검증그룹 SET 수량=1 입력');
  await fillQty(mpage, ODU_SET, 2);
  await fillQty(mpage, IDU_SET, 1);
  await shotEl(mpage, '#cardComm', '11-mobile-both-sets-subrows');

  const mobileCellCounts = await mpage.evaluate(({ models }) => {
    const body = document.querySelector('#commBody');
    const rows = Array.from(body ? body.querySelectorAll('tr') : []);
    return rows
      .filter((r) => models.includes(r.getAttribute('data-m')) || models.includes(r.getAttribute('data-part-of')))
      .map((r) => {
        const visible = Array.from(r.children).filter((td) => getComputedStyle(td).display !== 'none');
        return {
          dataM: r.getAttribute('data-m'),
          partOf: r.getAttribute('data-part-of'),
          visibleCount: visible.length,
          visibleClasses: visible.map((td) => td.className),
          visibleTexts: visible.map((td) => td.textContent.trim()),
        };
      });
  }, { models: [ODU_A, ODU_SET, ODU_B, ODU_PART_1, ODU_PART_2, IDU_A, IDU_SET, IDU_B, IDU_PART_1, IDU_PART_2] });
  console.log('  mobile visible-cell-count per row:', JSON.stringify(mobileCellCounts, null, 2));
  const mobileAll4 = mobileCellCounts.every((r) => r.visibleCount === 4);
  record('모바일(≤1280px) 전 행 4셀 미러(품명/모델/수량/납품가)', mobileAll4, mobileCellCounts.map((r) => ({ row: r.dataM || r.partOf, n: r.visibleCount })));

  const mobileHeaderCount = await mpage.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('#wrapComm thead th'));
    return ths.filter((th) => getComputedStyle(th).display !== 'none').length;
  });
  record('모바일 헤더 가시 열수 = 4', mobileHeaderCount === 4, { mobileHeaderCount });

  await mpage.close();
  await browser.close();

  console.log('\n=== VERDICT SUMMARY ===');
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`));
  console.log(`\nTOTAL ${results.length} / FAIL ${failed.length}`);
  console.log(failed.length === 0 ? 'DONE ALL-PASS' : 'DONE HAS-FAILURES');
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FAIL(uncaught)', e); process.exit(1); });
