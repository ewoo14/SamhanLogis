import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs', 'qa', '2026-07-28-963-sol2-fix'));
const appUrl = 'http://127.0.0.1:5180/';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

const waitForApp = async () => {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#bizGateInput').fill('2118712345');
  await page.locator('#btnBizQuery').click();
  await page.waitForSelector('#authPw1', { state: 'visible', timeout: 30000 });
  await page.locator('#authPw1').fill('1234');
  await page.locator('#btnAuthAction').click();
  await page.waitForSelector('#pageBizGate', { state: 'hidden', timeout: 30000 });
  await page.waitForTimeout(4500);
  if (await page.locator('#gateImageModal').isVisible().catch(() => false)) {
    await page.locator('#btnImgClose').click();
  }
  if (await page.locator('#tutBox').isVisible().catch(() => false)) {
    const skip = page.locator('button:has-text("튜토리얼 스킵")');
    if (await skip.isVisible().catch(() => false)) await skip.click();
  }
  await page.evaluate(() => {
    document.querySelectorAll('.tut-blocker, #tutTargeter, #tutBox, #welcomeAnimLayer').forEach((node) => node.remove());
  });
};

const go = async (button, bodySelector) => {
  await page.locator(button).click();
  await page.waitForSelector(bodySelector, { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(300);
};

const setQty = async (selector, value) => {
  const input = page.locator(selector);
  if (await input.count() !== 1) throw new Error(`수량 입력칸을 찾지 못했습니다: ${selector}`);
  await input.scrollIntoViewIfNeeded();
  await input.fill(String(value));
  await page.waitForTimeout(300);
};

const readEvidence = async (selector, totalSelector) => {
  const inputLocator = page.locator(selector);
  await inputLocator.scrollIntoViewIfNeeded();
  return inputLocator.evaluate((input, totalSel) => {
  const row = input.closest('tr');
  const rect = row.getBoundingClientRect();
  const style = getComputedStyle(input);
  const totalNode = document.querySelector(totalSel) || document.querySelector(`${totalSel}Inline`);
  const visibleTotalText = totalNode?.textContent?.trim() || '';
  const subtotalSelector = totalSel.includes('comm') ? '#commBody [data-csub]' : '#singleBody [data-ss]';
  const subtotalSum = Array.from(document.querySelectorAll(subtotalSelector))
    .reduce((sum, node) => sum + (Number(node.textContent?.replace(/[^\d-]/g, '')) || 0), 0);
  const totalText = visibleTotalText || String(subtotalSum);
  const totalDigits = totalText.replace(/[^\d-]/g, '');
  return {
    model: input.dataset.model || input.dataset.sid || '',
    value: input.value,
    color: style.color,
    fontWeight: style.fontWeight,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom },
    rowText: row.textContent.trim().replace(/\s+/g, ' '),
    totalText,
    totalAmount: totalDigits ? Number(totalDigits) : null,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
  }, totalSelector);
};

const assertEvidence = (evidence, label) => {
  if (!evidence || evidence.value !== '77') throw new Error(`${label} 수량 불일치: ${JSON.stringify(evidence)}`);
  if (evidence.color !== 'rgb(37, 99, 235)') throw new Error(`${label} 색상 불일치: ${JSON.stringify(evidence)}`);
  if (evidence.fontWeight !== '700' && evidence.fontWeight !== 'bold') throw new Error(`${label} 굵기 불일치: ${JSON.stringify(evidence)}`);
  if (evidence.rect.width <= 0 || evidence.rect.height <= 0 || evidence.rect.bottom <= 0 || evidence.rect.top >= evidence.viewport.height) {
    throw new Error(`${label} 행 사각형 불일치: ${JSON.stringify(evidence)}`);
  }
  if (!Number.isFinite(evidence.totalAmount)) throw new Error(`${label} 합계가 숫자가 아닙니다: ${JSON.stringify(evidence)}`);
};

const capture = async (name) => {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
};

const readSingleRows = async () => page.locator('#singleBody .qty-input').evaluateAll((inputs) => inputs.map((input) => {
  const row = input.closest('tr');
  return { id: input.dataset.sid, model: input.dataset.model || '', text: row?.textContent?.trim().replace(/\s+/g, ' ') || '' };
}));

const chooseSingleScenario = async (kind) => {
  const rows = await readSingleRows();
  const targetRe = {
    roundFoot: /발통세트/i,
    wiredBoard: /유선\s*보드|AIM-?A01N/i,
    ceilingPump: /실링.*드레인펌프|실링.*펌프/i,
  }[kind];
  const target = rows.find((row) => targetRe.test(row.text));
  if (!target) throw new Error(`싱글 ${kind} 파생 target을 찾지 못했습니다: ${JSON.stringify(rows.filter((row) => targetRe.test(row.text)).slice(0, 3))}`);
  const sourceRe = {
    roundFoot: /실외기/i,
    wiredBoard: /1\s*-?\s*way|1way/i,
    ceilingPump: /실링/i,
  }[kind];
  const source = rows.find((row) => row.id !== target.id && sourceRe.test(row.text) && !/발통세트|유선\s*보드|드레인펌프/i.test(row.text));
  if (!source) throw new Error(`싱글 ${kind} 원천 수량 행을 찾지 못했습니다.`);
  return { target, source };
};

const runSingleScenario = async (kind) => {
  await page.locator('#btnResetSingle').click();
  await page.waitForTimeout(300);
  const { target, source } = await chooseSingleScenario(kind);
  const cssValue = (value) => String(value).replace(/["\\]/g, '\\$&');
  const sourceSelector = `#singleBody .qty-input[data-sid="${cssValue(source.id)}"]`;
  const targetSelector = `#singleBody .qty-input[data-sid="${cssValue(target.id)}"]`;
  await setQty(sourceSelector, 1);
  await setQty(targetSelector, 77);
  await setQty(sourceSelector, 2);
  const evidence = await readEvidence(targetSelector, '#singleTotal');
  assertEvidence(evidence, `싱글 ${kind}`);
  await capture(`single-${kind}`);
  return { kind, source, target, evidence };
};

try {
  await waitForApp();

  // 상업: 검색/재렌더 후 옵션 보존, T형 분기관 잠금/금액, 리뉴얼 필터 잠금/재계산.
  await go('#btnEnterComm', '#commBody .qty-input');
  await page.selectOption('#comm_panel', '블랙판넬');
  await page.selectOption('#comm_p360', '사각');
  await page.selectOption('#comm_remote', '컬러유선');
  await page.check('#comm_ex_hose');
  await page.check('#comm_ex_base');
  const optionsBeforeSearch = await page.evaluate(() => ({
    panel: document.querySelector('#comm_panel')?.value,
    p360: document.querySelector('#comm_p360')?.value,
    remote: document.querySelector('#comm_remote')?.value,
    exHose: !!document.querySelector('#comm_ex_hose')?.checked,
    exBase: !!document.querySelector('#comm_ex_base')?.checked,
  }));
  await page.locator('#commFilterText').fill('T형');
  await page.waitForTimeout(300);
  await page.locator('#commFilterText').fill('');
  await page.waitForTimeout(300);
  const optionsAfterSearch = await page.evaluate(() => ({
    panel: document.querySelector('#comm_panel')?.value,
    p360: document.querySelector('#comm_p360')?.value,
    remote: document.querySelector('#comm_remote')?.value,
    exHose: !!document.querySelector('#comm_ex_hose')?.checked,
    exBase: !!document.querySelector('#comm_ex_base')?.checked,
  }));
  if (JSON.stringify(optionsBeforeSearch) !== JSON.stringify(optionsAfterSearch)) throw new Error('상업 검색/재렌더 후 옵션이 변했습니다.');

  await setQty('#commBody .qty-input[data-model="AM140AXVGHH1"]', 1);
  await setQty('#commBody .qty-input[data-model="AXJ-TA3419M"]', 77);
  await setQty('#commBody .qty-input[data-model="AM140AXVGHH1"]', 2);
  const branchEvidence = await readEvidence('#commBody .qty-input[data-model="AXJ-TA3419M"]', '#commTotal');
  assertEvidence(branchEvidence, '상업 T형 분기관');
  await capture('commercial-t-branch-lock-and-total');

  await page.locator('#btnResetComm').click();
  await page.waitForTimeout(300);
  await setQty('#commBody .qty-input[data-model="AM035FXMRHC1"]', 1);
  const filterAutomatic = await page.locator('#commBody .qty-input[data-model="AF-R09A"]').inputValue();
  await setQty('#commBody .qty-input[data-model="AF-R09A"]', 77);
  await setQty('#commBody .qty-input[data-model="AM035FXMRHC1"]', 2);
  const filterEvidence = await readEvidence('#commBody .qty-input[data-model="AF-R09A"]', '#commTotal');
  assertEvidence(filterEvidence, '상업 리뉴얼 필터');
  await capture('commercial-renew-filter-lock-and-total');

  // 싱글: 새로 추가되는 파생품도 같은 입력 잠금/재계산 경로를 공유한다.
  await go('#btnGoSingle', '#singleBody .qty-input');
  const singleEvidence = [];
  for (const kind of ['roundFoot', 'wiredBoard', 'ceilingPump']) singleEvidence.push(await runSingleScenario(kind));

  // 구형 snapshot: manualQtyLocks를 제거한 실제 shot을 applySnapshot에 넣어 H-2를 확인한다.
  await page.evaluate(() => {
    const target = document.querySelector('#singleBody .qty-input[data-sid]');
    if (!target) throw new Error('snapshot 검증 target이 없습니다.');
    target.value = '77';
    target.dispatchEvent(new Event('input', { bubbles: true }));
    const shot = takeSnapshot();
    delete shot.core.manualQtyLocks;
    applySnapshot(shot);
  });
  await page.waitForTimeout(400);

  function buildMetrics() {
    return {
      url: appUrl,
      optionsBeforeSearch,
      optionsAfterSearch,
      filterAutomatic,
      branchEvidence,
      filterEvidence,
      singleEvidence,
      consoleErrors,
      pageErrors,
      screenshots: [
        'commercial-t-branch-lock-and-total.png',
        'commercial-renew-filter-lock-and-total.png',
        'single-roundFoot.png',
        'single-wiredBoard.png',
        'single-ceilingPump.png',
      ],
    };
  }
  fs.writeFileSync(path.join(outDir, 'metrics.json'), `${JSON.stringify(buildMetrics(), null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(buildMetrics(), null, 2));
} finally {
  await context.close();
  await browser.close();
}
