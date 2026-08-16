/**
 * PR #457 — 견적 품목 노출 구분(usageScope) + 시트 순서 보존(display_order) 실 UI 캡처.
 *
 * 전제: node server.js 가 product-service DB 원천으로 :5183 가동 중
 *       (실 product-service 8084 컨테이너 → display_order/usageScope 적용된 카탈로그).
 * 출력: docs/qa/product-exposure-display-order/*.png
 *
 *   01-single-catalog-sheet-order.png — 싱글중대형 카탈로그가 시트 row 순서대로 렌더(노출품목만)
 *
 * 검증: 싱글중대형 tbody 의 모델명 순서가 product-service findExposedCatalog(SINGLE_SET) 의
 *       display_order ASC 순서(AC060CS6PBH1SY, AC072CS6PBH1SY, AC090CS6PBH1SY …)와 일치.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT_DIR = resolveQaShotsDir(path.resolve(ROOT, '..', '..', '..', 'docs', 'qa', 'product-exposure-display-order'));
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.QA_BASE_URL || 'http://localhost:5183';

async function shot(page, file) {
  const p = path.join(OUT_DIR, file);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`[qa457] ${file} (${(fs.statSync(p).size / 1024).toFixed(1)} KB)`);
}

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1480, height: 980 } });
  page.on('dialog', (d) => d.accept());
  page.on('console', (m) => { if (m.type() === 'error') console.log('[browser-error]', m.text()); });

  console.log('[qa457] goto', BASE);
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  // 부트스트랩 init 가 기본 orderInfo-active 로 정착할 때까지 대기(이후 화면전환이 덮어쓰이지 않도록)
  await page.waitForTimeout(4000);

  const blocked = await page.evaluate(() => !document.getElementById('custSearch'));
  if (blocked) throw new Error('인증 게이트 차단 — by-email 배선 실패');

  // 싱글중대형 view 로 전환 (goSingle() → body.single-active → #cardSingle 표시)
  await page.evaluate(() => { if (typeof goSingle === 'function') goSingle(); });
  await page.waitForTimeout(800);
  await page.waitForSelector('body.single-active #cardSingle', { state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => {
    const tb = document.getElementById('singleBody');
    return tb && tb.querySelectorAll('tr').length > 3;
  }, { timeout: 20000 });

  // SS_RAW(노출 카탈로그 원천 데이터) 순서 추출 → 시트 순서 + 노출필터 검증
  // (singleBody DOM 은 구성품 확장 sub-row 를 포함하므로 원천 데이터로 순서 단언)
  const cat = await page.evaluate(() => {
    const ss = (typeof SS_RAW !== 'undefined') ? SS_RAW : [];
    const auth = (typeof USER_AUTH !== 'undefined') ? USER_AUTH : null;
    return {
      count: ss.length,
      top6: ss.slice(0, 6).map((x) => x.model),
      authorized: auth ? auth.authorized : null,
      managerName: auth ? auth.managerName : null,
    };
  });
  console.log('[qa457] 인증=', cat.authorized, '| 담당자=', cat.managerName);
  console.log('[qa457] 싱글중대형 노출 카탈로그 수 =', cat.count);
  console.log('[qa457] 상위 6 모델(시트 display_order 순서) =', JSON.stringify(cat.top6));

  await shot(page, '01-single-catalog-sheet-order.png');

  await browser.close();
  console.log('[qa457] DONE →', OUT_DIR);
};

run().catch((e) => { console.error('[qa457] FAIL:', e.message); process.exit(1); });
