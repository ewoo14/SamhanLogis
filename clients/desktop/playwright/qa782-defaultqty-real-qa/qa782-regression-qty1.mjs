import { resolveQaShotsDir } from '../support/qa-screenshot-dir.mjs'
// PR #796 (#782) 라이브 QA 추가 라운드 — default_qty=1 회귀 없음 실증.
// 같은 SET(QA782-SET-01) 안에 두 구성품: PART-01(defaultQty=2, 이미 확인) + PART-02(defaultQty=1,
// 신규). setQty=3 입력 시 PART-02 는 "3 × 1" 표시 + 제출 qty=3(=setQty 그대로, 곱셈에 의한 변화 없음)
// 이어야 한다 — PR 이전에도 이 case 는 정상(undefined -> parseInt||1=1 fallback과 결과가 같음)이므로
// 회귀가드로 유효.
import { chromium } from '@playwright/test';

const OUT = resolveQaShotsDir(process.env.QA_OUT || 'C:/dev/Samhan-Public/docs/qa/e782-defaultqty');
const URL = process.env.QA_URL || 'http://localhost:5197/';

const SET_MODEL = 'QA782-SET-01';
const PART1 = 'QA782-PART-01'; // defaultQty=2
const PART2 = 'QA782-PART-02'; // defaultQty=1 (회귀가드)

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
  // 튜토리얼 오버레이가 남아있으면(tutBlockTop) 강제 제거 — 회귀가드 스크립트는 UI 튜토리얼
  // 검증 대상이 아니므로 클릭 차단만 해소.
  await page.evaluate(() => {
    document.querySelectorAll('.tut-blocker').forEach((el) => el.remove());
  });
}

async function readPartRow(page, setModel, partModel) {
  return page.evaluate(({ setModel, partModel }) => {
    const row = document.querySelector(`#commBody tr[data-part-of="${setModel}"][data-m="${partModel}"]`);
    if (!row) return null;
    const qtySpan = row.querySelector('td.qty .qty-set');
    return { qtyText: qtySpan ? qtySpan.textContent.trim() : null, partQtyAttr: row.getAttribute('data-part-qty') };
  }, { setModel, partModel });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(page);
  await page.click('#btnEnterComm');
  await page.waitForTimeout(900);
  await page.waitForSelector(`#commBody tr[data-set-model="${SET_MODEL}"]`, { timeout: 5000 });

  await page.fill(`#commBody .qty-input[data-model="${SET_MODEL}"]`, '3');
  await page.waitForTimeout(500);
  await shotEl(page, '#cardComm', 'display-regression-2parts');

  const p1 = await readPartRow(page, SET_MODEL, PART1);
  const p2 = await readPartRow(page, SET_MODEL, PART2);
  console.log('  PART-01 (defaultQty=2):', JSON.stringify(p1));
  console.log('  PART-02 (defaultQty=1, 회귀가드):', JSON.stringify(p2));
  record('PART-01(qty=2) 표시 "3 × 2" (기존 확인 재현)', p1?.qtyText === '3 × 2', p1);
  record('★ PART-02(qty=1) 표시 "3 × 1" — defaultQty=1 은 항상 곱셈 불변(회귀 없음)', p2?.qtyText === '3 × 1', p2);

  // 미리보기에서 두 라인 모두 수량 확인
  await page.click('#btnPreview');
  await page.waitForTimeout(700);
  const previewRows = await page.evaluate(() => {
    const body = document.querySelector('#previewBody');
    if (!body) return [];
    return Array.from(body.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((td) => td.textContent.trim()));
  });
  const row1 = previewRows.find((r) => r.some((c) => c.includes(PART1)));
  const row2 = previewRows.find((r) => r.some((c) => c.includes(PART2)));
  console.log('  preview row1:', JSON.stringify(row1));
  console.log('  preview row2:', JSON.stringify(row2));
  record('제출 미리보기 PART-01 수량=6 (3×2)', row1 && row1[3] === '6', row1);
  record('★ 제출 미리보기 PART-02 수량=3 (3×1, 회귀 없음 — setQty 그대로)', row2 && row2[3] === '3', row2);

  await browser.close();
  console.log('\n=== VERDICT SUMMARY ===');
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`));
  console.log(`\nTOTAL ${results.length} / FAIL ${failed.length}`);
  process.exit(failed.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error('FAIL(uncaught)', e); process.exit(1); });
