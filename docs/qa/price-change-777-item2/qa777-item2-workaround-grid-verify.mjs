// 사전 존재(pre-existing) 결함 우회 검증 스크립트.
// 발견: buildCommSetIndex() 가 `window.COMM_PARTS` 를 참조하지만 실제 전역은
// classic <script> 최상위 `const COMM_PARTS = J(CP_RAW,[])` 라 window 프로퍼티가 아님
// (v4 legacy 임베드 커밋 13ce6f89e 부터 존재 — #777/#778 과 무관, pre-existing).
// 이 스크립트는 `window.COMM_PARTS = COMM_PARTS`(bare 전역 재노출)만 주입해 이 상위 버그를
// 우회하고, PR #778 자체 로직(commPartUnitPrice 공유헬퍼 → renderCommSetParts 배선)이
// 실제로 정확히 동작하는지 별도 확인한다. 가격/구성 데이터는 100% 실 DB 시드 그대로,
// 조작 없음 — 오직 참조 버그 1줄만 우회.
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

async function shotEl(page, sel, name) {
  await page.locator(sel).screenshot({ path: `${OUT}/${name}.png` });
  console.log('  saved(el)', name);
}

async function readCommRowState(page) {
  return page.evaluate(({ setModel, partModel }) => {
    const partRow = document.querySelector(`#commBody tr[data-part-of="${setModel}"][data-m="${partModel}"]`);
    const priceCell = partRow?.querySelector(`[data-cunit="${partModel}|${setModel}"]`);
    const subCell = partRow?.querySelector(`[data-csub="${partModel}|${setModel}"]`);
    const commTotal = document.getElementById('commTotal')?.textContent;
    return {
      found: !!partRow,
      partPriceCellText: priceCell?.textContent ?? null,
      partSubCellText: subCell?.textContent ?? null,
      commTotalText: commTotal ?? null,
      dueValue: document.getElementById('due')?.value ?? null,
    };
  }, { setModel: SET_MODEL, partModel: PART_MODEL });
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

  await login(page);
  await page.click('#btnEnterComm');
  await page.waitForTimeout(800);
  await page.waitForSelector(`#commBody tr[data-set-model="${SET_MODEL}"]`, { timeout: 5000 });

  await page.fill(`input.qty-input[data-model="${SET_MODEL}"]`, '1');
  await page.waitForTimeout(400);

  // pre-existing 버그 우회: window.COMM_PARTS 재노출 + 이미 메모이즈된(빈) 바 COMM_SET_INDEX 리셋
  // (COMM_SET_INDEX 도 top-level `let` 이라 window 프로퍼티가 아님 — bare 재대입 필요)
  await page.evaluate(() => { window.COMM_PARTS = COMM_PARTS; COMM_SET_INDEX = null; });
  console.log('window.COMM_PARTS exposed:', await page.evaluate(() => Array.isArray(window.COMM_PARTS) ? window.COMM_PARTS.length : 'still N/A'));
  const idxDiag = await page.evaluate((setModel) => {
    const idx = buildCommSetIndex();
    return { size: idx.size, keys: Array.from(idx.keys()), got: idx.get(setModel.toUpperCase().replace(/[^\w-]/g,'')) };
  }, SET_MODEL);
  console.log('buildCommSetIndex diag:', JSON.stringify(idxDiag));

  // due=2026-08-01 (BEFORE) 로 강제 세팅 (grid 는 hidden due 라도 값 읽기 가능)
  await page.evaluate(() => {
    const el = document.getElementById('due');
    el.value = '2026-08-01';
  });
  // 강제 재렌더 (renderComm 재호출로 우회된 인덱스 반영)
  await page.evaluate(() => { COMM_SET_INDEX = null; renderComm(); });
  await page.waitForTimeout(500);
  await shotEl(page, '#cardComm', '08-workaround-grid-due-2026-08-01-BEFORE');
  console.log('BEFORE (workaround):', JSON.stringify(await readCommRowState(page)));

  // due=2026-10-01 (AFTER)
  await page.evaluate(() => {
    const el = document.getElementById('due');
    el.value = '2026-10-01';
    COMM_SET_INDEX = null;
    renderComm();
  });
  await page.waitForTimeout(500);
  await shotEl(page, '#cardComm', '09-workaround-grid-due-2026-10-01-AFTER');
  console.log('AFTER (workaround):', JSON.stringify(await readCommRowState(page)));

  await browser.close();
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
