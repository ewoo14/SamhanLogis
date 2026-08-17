/**
 * #17 단가변동 S4b P1 — estimate-app "변동단가" 체크박스 초기 상태 라이브 QA.
 *
 * 전제:
 *  - product-service(:8084) 가 실 Postgres 로 기동 중이고, desktop 관리 화면(P0 캡처2)에서
 *    homemulti.defaultPreChange=true 로 PUT 저장이 이미 반영되어 있어야 한다.
 *  - estimate-app 서버(`node server.js`, 기본 :5183)가 product-service DB 원천으로 기동 중이어야
 *    한다(PRODUCT_SERVICE_URL 기본 http://localhost:8084, SAMHAN_INTERNAL_TOKEN 기본
 *    CHANGE_ME_LOCAL_ONLY — .env 미설정 시 placeholder가 사용됨).
 *  - checkUserAuth 접속 게이트 통과를 위해 user-service 에 존재하는 [DEV-SEED] 이메일을
 *    `?email=` 쿼리로 전달한다(기본 DEFAULT_USER_EMAIL=dev@samhan-air.com 은 시드에 없어 미승인
 *    처리되어 전체 body 가 "접근 권한 없음" 문구로 대체되므로 반드시 override 필요).
 *
 * 흐름(실측, #17 S4b P1 QA 로 처음 확인):
 *  1) GET / → 서버가 checkUserAuth 결과(authData)+PRICE_DEFAULT_VARIANT 등을 인라인 주입.
 *  2) 클라이언트가 재차 google.script.run(→/rpc) 로 startAuth() 를 호출 — 성공 시 3초짜리
 *     "환영합니다" 웰컴 게이트(#mobileGate)가 뜨고, 자동으로 "전표작성"(주문정보) 화면으로 전환된다.
 *  3) 상단 탭 "홈멀티"/"싱글중대형" 클릭 시에만 각 카테고리 옵션 패널(체크박스 포함)이 실제로
 *     화면에 보인다(그 전에는 DOM 에 존재하되 비가시).
 *
 * 출력: docs/qa/price-variant-canon/estimate-app-real-qa/*.png
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT_DIR = resolveQaShotsDir(path.resolve(ROOT, '..', '..', '..', 'docs', 'qa', 'price-variant-canon', 'estimate-app-real-qa'));
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.QA_BASE_URL || 'http://localhost:5183';
const EMAIL = process.env.QA_EMAIL || 'dev_master@samhan-air.com';

async function shot(page, file) {
  const p = path.join(OUT_DIR, file);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`[qa] ${file} (${(fs.statSync(p).size / 1024).toFixed(1)} KB)`);
}

async function checkboxState(page, id) {
  return page.evaluate((elId) => {
    const el = document.getElementById(elId);
    if (!el) return { exists: false };
    const label = el.closest('label')?.textContent?.trim() || '';
    return { exists: true, checked: el.checked, visible: el.offsetParent !== null, label };
  }, id);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const url = `${BASE}/?email=${encodeURIComponent(EMAIL)}`;
  console.log(`[qa] navigating ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });

  // PRICE_DEFAULT_VARIANT 인라인 상수 확인(서버가 실 product-service 값을 그대로 주입했는지) —
  // 웰컴 게이트/네비게이션과 무관하게 페이지 로드 직후 바로 확인 가능.
  const injected = await page.evaluate(() => {
    try {
      // eslint-disable-next-line no-undef
      return typeof PRICE_DEFAULT_VARIANT !== 'undefined' ? PRICE_DEFAULT_VARIANT : null;
    } catch (_e) {
      return null;
    }
  });
  console.log('[qa] PRICE_DEFAULT_VARIANT (실 product-service fetch 값) =', JSON.stringify(injected));

  // 웰컴 게이트(3초 애니메이션) + 자동 "전표작성" 화면 전환 대기.
  await page.waitForTimeout(6500);
  await shot(page, '08-estimate-app-orderinfo-after-welcome-gate.png');

  // 홈멀티 탭 — "변동단가" 체크박스 실사 확인(기대: 전부 checked=false).
  await page.click('#btnGoHome');
  await page.waitForTimeout(1000);
  const homeState = await checkboxState(page, 'chkHomeInc');
  console.log('[qa] #chkHomeInc(홈멀티) 상태 =', JSON.stringify(homeState));
  await shot(page, '09-estimate-app-home-chkHomeInc-checked.png');

  // 싱글중대형 탭 — 대조군(기대: checked=false, 미변경 카테고리).
  await page.click('#btnGoSingle');
  await page.waitForTimeout(1000);
  const singleState = await checkboxState(page, 'chkSingleInc');
  console.log('[qa] #chkSingleInc(싱글중대형, 대조) 상태 =', JSON.stringify(singleState));
  await shot(page, '10-estimate-app-single-chkSingleInc-unchecked-contrast.png');

  const summary = {
    priceDefaultVariantInjected: injected,
    homeCheckbox: homeState,
    singleCheckboxContrast: singleState,
    pageErrors,
  };
  console.log('[qa] SUMMARY =', JSON.stringify(summary, null, 2));

  const assertDefaults = ['homemulti', 'singleSets', 'commercialMulti', 'oldProducts']
    .every((category) => injected?.[category] === false);
  const assertHome = assertDefaults && homeState.exists && homeState.checked === false && homeState.visible === true && homeState.label === '변동단가';
  const assertSingle = injected?.singleSets === false && singleState.exists && singleState.checked === false;
  console.log(`[qa] PASS(4개 기본값 전부 해제+홈 라벨)=${assertHome}  PASS(싱글 대조 해제)=${assertSingle}`);

  await browser.close();
  console.log(`[qa] 완료. 출력 디렉토리: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('[qa] 실패:', e);
  process.exit(1);
});
