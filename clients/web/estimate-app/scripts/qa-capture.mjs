/**
 * QA 5장 캡처 — Edge / Playwright 헤드리스.
 *
 * 출력: docs/qa/migration-fe-estimate-app-v2/*.png
 * 전제: dev 서버 (`node server.js`) 가 port 5183 에서 가동 중.
 *
 * 5장 구성 (estimate-app v2 사양):
 *   01-estimate-app-v2-init.png       — 진입 (legacy estimate 화면 초기, server-side render)
 *   02-estimate-app-v2-4-cards.png    — 4 카드 grid (HOME/SINGLE/COMM/OLD + OrderInfo + Final)
 *   03-estimate-app-v2-after-add.png  — 라인 추가 후 (recompute*Derived 자동 동작)
 *   04-estimate-app-v2-print.png      — 인쇄 미리보기 (legacy pageFinal + 인감)
 *   05-estimate-app-v2-finalize.png   — 견적 finalize → slip-service POST → 출고전표 생성 응답
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT_DIR = resolveQaShotsDir(path.resolve(ROOT, '..', '..', '..', 'docs', 'qa', 'migration-fe-estimate-app-v2'));
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.QA_BASE_URL || 'http://localhost:5183';

async function safeClick(page, selector, timeoutMs = 1500) {
  try {
    const el = await page.$(selector);
    if (el) {
      await el.click({ timeout: timeoutMs });
      return true;
    }
  } catch (_e) { /* swallow */ }
  return false;
}

async function shot(page, file) {
  const p = path.join(OUT_DIR, file);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`[qa] ${file} (${(fs.statSync(p).size / 1024).toFixed(1)} KB)`);
}

async function dismissOverlays(page) {
  // 인증 게이트 (사업자번호 입력) — mock 환경에서는 자동 인증되지만, 혹시나 띄워있으면 close
  await page.evaluate(() => {
    const ids = ['pageBizGate', 'mobileGate'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    }
  }).catch(() => {});
}

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  }).catch(async () => {
    console.warn('[qa] msedge channel 미설치, chromium 사용');
    return chromium.launch({ headless: true });
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn('[qa] pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.warn('[qa] console.error:', m.text());
  });

  // 01 init
  console.log(`[qa] navigating ${BASE}/`);
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissOverlays(page);
  await page.waitForTimeout(500);
  await shot(page, '01-estimate-app-v2-init.png');

  // 02 — 4 카드 grid (홈멀티 + 싱글 + 상업 + 구품목)
  // index.html 의 .grid 가 home/single 카드 동시에 표시되는 화면 (default)
  await page.evaluate(() => {
    document.body.classList.remove('home-active', 'single-active', 'comm-active', 'old-active', 'orderInfo-active', 'preview-active', 'final-active');
  });
  await page.waitForTimeout(800);
  await shot(page, '02-estimate-app-v2-4-cards.png');

  // 03 — 홈멀티 라인 추가 (가능하면 첫 add 버튼 click)
  await safeClick(page, '#btnGoHome');
  await page.waitForTimeout(500);
  // 첫 add 버튼 시뮬레이션 (legacy 의 "추가" 버튼 또는 행 추가 버튼)
  await page.evaluate(() => {
    const btn = document.querySelector('#cardHome .btn-add, #cardHome button[onclick*="add"], button[onclick*="addHomeRow"], button[onclick*="addSingleRow"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  await shot(page, '03-estimate-app-v2-after-add.png');

  // 04 — 인쇄 미리보기 (final/preview 페이지)
  await page.evaluate(() => {
    document.body.classList.remove('home-active', 'single-active', 'comm-active', 'old-active', 'orderInfo-active');
    document.body.classList.add('final-active');
  });
  await page.waitForTimeout(800);
  await shot(page, '04-estimate-app-v2-print.png');

  // 05 — finalize: RPC sendOrderFromUi 호출 후 응답 화면
  // mock 환경에서는 미등록거래처 응답 → alert 또는 message 표시 흐름 캡처
  await page.evaluate(async () => {
    try {
      const r = await fetch('/rpc/sendOrderFromUi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [{
          estimateNumber: 'EST-20250505-DEMO',
          bizno: '123-45-67890',
          custCode: 'DEMO001',
          due: '2025-05-15',
          payDue: '2025-05-30',
          addr: '서울시 강남구 테헤란로 123',
          tel: '010-1234-5678',
          memo: 'estimate-app v2 QA finalize 테스트',
          items: [{ model: 'AC181HKW', qty: 1, price: 1000000, spec: '18평형' }],
        }] }),
      });
      const data = await r.json();
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;top:20px;right:20px;background:#fff;border:2px solid #2563eb;padding:16px;border-radius:8px;font-size:14px;font-family:monospace;max-width:520px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.15);';
      div.innerHTML = '<b style="color:#2563eb;">[견적 finalize → slip-service POST]</b><br/><pre style="margin:8px 0 0;white-space:pre-wrap;">' + JSON.stringify(data, null, 2) + '</pre>';
      document.body.appendChild(div);
    } catch (e) {
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;top:20px;right:20px;background:#fee;color:#900;padding:16px;border-radius:8px;font-family:monospace;z-index:99999;';
      div.textContent = 'finalize 에러: ' + e.message;
      document.body.appendChild(div);
    }
  });
  await page.waitForTimeout(1500);
  await shot(page, '05-estimate-app-v2-finalize.png');

  await browser.close();
  console.log(`[qa] 완료. 출력 디렉토리: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('[qa] 실패:', e);
  process.exit(1);
});
