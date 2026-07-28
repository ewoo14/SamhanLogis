import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const outDir = resolveQaShotsDir(path.join(REPO, 'docs', 'qa', '2026-07-28-963-preexisting-fix'));
const URL = 'http://127.0.0.1:5180/';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

const readOptions = () => page.evaluate(() => ({
  panel: document.querySelector('#comm_panel')?.value ?? null,
  p360: document.querySelector('#comm_p360')?.value ?? null,
  remote: document.querySelector('#comm_remote')?.value ?? null,
  exHose: !!document.querySelector('#comm_ex_hose')?.checked,
  exBase: !!document.querySelector('#comm_ex_base')?.checked,
}));

const readBranchEvidence = () => page.evaluate(() => {
  const input = document.querySelector('#commBody .qty-input[data-model="AXJ-TA3419M"]');
  if (!input) return null;
  const row = input.closest('tr');
  const rect = row.getBoundingClientRect();
  const style = getComputedStyle(input);
  return {
    model: input.dataset.model,
    value: input.value,
    color: style.color,
    fontWeight: style.fontWeight,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom },
    rowText: row.textContent.trim().replace(/\s+/g, ' '),
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
});

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  // 기존 실 QA fixture가 사용하는 승인 거래처 계정으로 실제 BizGate를 통과한다.
  await page.locator('#bizGateInput').fill('2118712345');
  await page.locator('#btnBizQuery').click();
  await page.waitForSelector('#authPw1', { state: 'visible', timeout: 30000 });
  await page.locator('#authPw1').fill('1234');
  await page.locator('#btnAuthAction').click();
  await page.waitForSelector('#pageBizGate', { state: 'hidden', timeout: 30000 });
  await page.waitForTimeout(4500);
  const gateImage = page.locator('#gateImageModal');
  if (await gateImage.isVisible().catch(() => false)) {
    await page.locator('#btnImgClose').click();
    await page.waitForTimeout(500);
  }
  const tutorial = page.locator('#tutBox');
  if (await tutorial.isVisible().catch(() => false)) {
    const skip = page.locator('button:has-text("튜토리얼 스킵")');
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(500);
    }
  }
  await page.evaluate(() => {
    document.querySelectorAll('.tut-blocker, #tutTargeter, #tutBox, #welcomeAnimLayer').forEach((node) => node.remove());
  });
  await page.waitForSelector('#btnEnterComm', { state: 'visible', timeout: 30000 });
  await page.locator('#btnEnterComm').click();
  await page.waitForSelector('#commBody .qty-input', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(300);

  // 결함 ①: 실제 상업멀티 옵션을 바꾼 뒤 검색 입력이 renderComm()를 호출한다.
  await page.selectOption('#comm_panel', '블랙판넬');
  await page.selectOption('#comm_p360', '사각');
  await page.selectOption('#comm_remote', '컬러유선');
  await page.check('#comm_ex_hose');
  await page.check('#comm_ex_base');
  const optionsBeforeSearch = await readOptions();
  await page.locator('#commFilterText').fill('T형');
  await page.waitForTimeout(300);
  const optionsAfterSearch = await readOptions();
  await page.screenshot({ path: path.join(outDir, '01-commercial-options-after-search.png'), fullPage: true });
  await page.locator('#commFilterText').fill('');
  await page.waitForTimeout(300);
  const optionsAfterClear = await readOptions();
  await page.screenshot({ path: path.join(outDir, '02-commercial-options-after-search-clear.png'), fullPage: true });

  if (JSON.stringify(optionsAfterSearch) !== JSON.stringify(optionsBeforeSearch)) {
    throw new Error(`옵션 검색 후 값 불일치: ${JSON.stringify({ optionsBeforeSearch, optionsAfterSearch })}`);
  }
  if (JSON.stringify(optionsAfterClear) !== JSON.stringify(optionsBeforeSearch)) {
    throw new Error(`옵션 검색어 삭제 후 값 불일치: ${JSON.stringify({ optionsBeforeSearch, optionsAfterClear })}`);
  }

  // 결함 ②: 실제 상업 실외기 수량을 바꿔 재계산을 발생시키고 T형 분기관 잠금을 확인한다.
  const outdoor = page.locator('#commBody .qty-input[data-model="AM140AXVGHH1"]');
  if (await outdoor.count() !== 1) throw new Error('실데이터 실외기 AM140AXVGHH1 행을 찾지 못했습니다.');
  const branch = page.locator('#commBody .qty-input[data-model="AXJ-TA3419M"]');
  if (await branch.count() !== 1) throw new Error('실데이터 T형 분기관 AXJ-TA3419M 행을 찾지 못했습니다.');

  await outdoor.fill('1');
  await page.waitForTimeout(200);
  await branch.fill('77');
  await page.waitForTimeout(200);
  await outdoor.fill('2');
  await page.waitForTimeout(400);
  await branch.scrollIntoViewIfNeeded();
  const branchEvidence = await readBranchEvidence();
  await page.screenshot({ path: path.join(outDir, '03-commercial-t-branch-after-recompute.png'), fullPage: true });

  if (!branchEvidence) throw new Error('재계산 후 T형 분기관 DOM 증거가 없습니다.');
  if (branchEvidence.value !== '77') throw new Error(`분기관 수량 소실: ${JSON.stringify(branchEvidence)}`);
  if (branchEvidence.color !== 'rgb(37, 99, 235)') throw new Error(`분기관 색상 불일치: ${JSON.stringify(branchEvidence)}`);
  if (branchEvidence.fontWeight !== '700' && branchEvidence.fontWeight !== 'bold') throw new Error(`분기관 굵기 불일치: ${JSON.stringify(branchEvidence)}`);
  if (branchEvidence.rect.width <= 0 || branchEvidence.rect.height <= 0 || branchEvidence.rect.bottom <= 0 || branchEvidence.rect.top >= branchEvidence.viewport.height) {
    throw new Error(`분기관 행이 viewport 밖입니다: ${JSON.stringify(branchEvidence)}`);
  }

  function buildMetrics() {
    return {
      url: URL,
      optionsBeforeSearch,
      optionsAfterSearch,
      optionsAfterClear,
      branchEvidence,
      consoleErrors,
      pageErrors,
      screenshots: [
        '01-commercial-options-after-search.png',
        '02-commercial-options-after-search-clear.png',
        '03-commercial-t-branch-after-recompute.png',
      ],
    };
  }
  fs.writeFileSync(path.join(outDir, 'metrics.json'), `${JSON.stringify(buildMetrics(), null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(buildMetrics(), null, 2));
} finally {
  await context.close();
  await browser.close();
}
