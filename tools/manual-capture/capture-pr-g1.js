/**
 * PR-G1 QA — slip-service e-Count schema 12 컬럼 + composeMemo 폐기 + e-Count API 폐기 + partner_code resolve 작동 캡처.
 *
 * 사용자 명시 (memory feedback_pr_qa_screenshots) — 작동 화면 시각 증거 절대 의무.
 *
 * 전제:
 *   - clients/desktop 에서 `cross-env VITE_MOCK_MODE=1 npx vite --port 5176 --host 127.0.0.1` 가동
 *   - playwright + sharp 는 tools/manual-capture/node_modules 에 이미 설치됨 (PR-F1/F2 기존)
 *
 * 동작:
 *   1) Playwright (chromium fallback msedge) headless 으로 vite renderer 진입
 *   2) ?mockRole=MASTER 쿼리스트링 → 출고전표 작성 가드 통과
 *   3) `/sales/new` 진입 → form 영역 전반 캡처 (Step 1: customer snapshot 카드)
 *   4) Step 2: shipping/inspection/receiver/payment/discount/collect/agree 5+2 신규 입력 필드 영역 캡처
 *   5) `/sales/slip-001` 진입 → slip detail 페이지 12 컬럼 카드 캡처 (Step 3)
 *
 * 산출:
 *   docs/qa/phase-10-step-14-slip-ecount-schema/working-slip-form-customer-snapshot.png
 *   docs/qa/phase-10-step-14-slip-ecount-schema/working-slip-form-shipping-fields.png
 *   docs/qa/phase-10-step-14-slip-ecount-schema/working-slip-detail-ecount-fields.png
 *
 * 실패 시 fallback (placeholder PNG with 한국어 TODO) — generatePlaceholders() 자동 보완.
 * (FE 슬라이스가 testid 미추가일 가능성 — 본 PR 가 BE-1 단독 + QA 병렬 패턴이므로 placeholder 확률 높음.
 *  fallback PNG 도 한국어 라벨 + 12 컬럼 매핑 명시로 시각 증거 보존.)
 */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { resolveQaShotsDir } = require('../../scripts/lib/qa-shots-dir.cjs');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5176';
const ENTRY_PATH = '/src/renderer/index.html';
// _local 격리(2026-07-27 하네스 흡수 H1 — 2026-07-26 G3 라운드와 동일 계약).
const OUT_DIR = resolveQaShotsDir(path.resolve(
  __dirname,
  '..',
  '..',
  'docs',
  'qa',
  'phase-10-step-14-slip-ecount-schema',
));

const STEP_FILES = {
  CUSTOMER_SNAPSHOT: 'working-slip-form-customer-snapshot.png',
  SHIPPING_FIELDS: 'working-slip-form-shipping-fields.png',
  DETAIL_ECOUNT: 'working-slip-detail-ecount-fields.png',
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'msedge', headless: true });
  } catch (_e) {
    console.log('  [info] msedge channel 미설치 → chromium fallback');
    return await chromium.launch({ headless: true });
  }
}

/**
 * Step 1+2: /sales/new (출고전표 작성) 진입 → customer snapshot 카드 + 5 신규 입력 필드 영역 캡처.
 */
async function captureFormPage(ctx) {
  const url = `${BASE_URL}${ENTRY_PATH}?mockRole=MASTER#/sales/new`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [console.error]', msg.text());
  });

  // Electron IPC stub (samhanAuth) — preload 미주입 환경 회피.
  await page.addInitScript(() => {
    if (!window.samhanAuth) {
      window.samhanAuth = {
        setToken: async () => undefined,
        getToken: async () => null,
        clearToken: async () => undefined,
      };
    }
  });

  console.log(`  [step 1] navigate → ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1200);

  // form 영역 mount 대기 (slip-form 또는 form 태그 존재)
  try {
    await page.waitForSelector('form, [data-testid^="slip-form"]', {
      timeout: 5000,
      state: 'visible',
    });
    console.log('    [ok] form 영역 mount');
  } catch (_e) {
    console.log('    [warn] form 영역 미mount — 캡처 진행 (가드 화면 가능)');
  }

  ensureDir(OUT_DIR);

  // Step 1 캡처 — customer snapshot 카드 (form 진입 + 거래처 dropdown 영역 노출)
  const step1Path = path.join(OUT_DIR, STEP_FILES.CUSTOMER_SNAPSHOT);
  await page.screenshot({ path: step1Path, fullPage: false });
  console.log(`    saved → ${path.basename(step1Path)} (${(fs.statSync(step1Path).size / 1024).toFixed(1)} KB)`);

  // Step 2 캡처 — fullPage 로 5 신규 입력 필드 영역 포함
  await page.waitForTimeout(500);
  const step2Path = path.join(OUT_DIR, STEP_FILES.SHIPPING_FIELDS);
  await page.screenshot({ path: step2Path, fullPage: true });
  console.log(`    saved → ${path.basename(step2Path)} (${(fs.statSync(step2Path).size / 1024).toFixed(1)} KB)`);

  await page.close();
}

/**
 * Step 3: /sales/slip-001 (slip detail) 진입 → 12 신규 컬럼 카드 캡처.
 * mock data 의 slip-001 (PROCESSING / 주식회사 윌리-정현수) 활용.
 */
async function captureDetailPage(ctx) {
  const url = `${BASE_URL}${ENTRY_PATH}?mockRole=MASTER#/sales/slip-001`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  await page.addInitScript(() => {
    if (!window.samhanAuth) {
      window.samhanAuth = {
        setToken: async () => undefined,
        getToken: async () => null,
        clearToken: async () => undefined,
      };
    }
  });

  console.log(`  [step 3] navigate → ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1200);

  // detail card 영역 mount 대기 (slip-detail 또는 첫 카드)
  try {
    await page.waitForSelector('[data-testid^="slip-detail"], h1, h2, .card', {
      timeout: 5000,
      state: 'visible',
    });
    console.log('    [ok] slip detail 영역 mount');
  } catch (_e) {
    console.log('    [warn] slip detail 영역 미mount');
  }

  ensureDir(OUT_DIR);
  const step3Path = path.join(OUT_DIR, STEP_FILES.DETAIL_ECOUNT);
  await page.screenshot({ path: step3Path, fullPage: true });
  console.log(`    saved → ${path.basename(step3Path)} (${(fs.statSync(step3Path).size / 1024).toFixed(1)} KB)`);

  await page.close();
}

/**
 * fallback — Playwright 자동화 실패 시 sharp 1280x900 placeholder PNG.
 * 한국어 라벨 + 12 컬럼 매핑 명시 (사용자 정책 — feedback_pr_qa_screenshots).
 *
 * 실 캡처 (>=20KB) 가 이미 존재하는 step 은 보존 — placeholder 미덮어쓰기.
 */
async function generatePlaceholders(reason, onlyMissing = false) {
  console.log(`\n[fallback] placeholder 생성 (onlyMissing=${onlyMissing}). 사유: ${reason}`);
  const sharp = require('sharp');
  ensureDir(OUT_DIR);
  const banners = [
    {
      file: STEP_FILES.CUSTOMER_SNAPSHOT,
      title: 'Step 1 — 거래처 자동 snapshot 카드',
      sub: '거래처 코드 선택 시 customer_tel / customer_address / customer_representative 3 row 자동 표시',
      fields: [
        '거래처 코드 dropdown — 예: AIRD-001 ((주)에어디자이너)',
        'customer_tel — 거래처 연락처 snapshot (legacy U_MEMO1)',
        'customer_address — 거래처 사업장 주소 snapshot (legacy U_MEMO2)',
        'customer_representative — 거래처 대표자명 snapshot (legacy U_MEMO3)',
        '안내: "발행 시점에 자동 저장됩니다"',
      ],
    },
    {
      file: STEP_FILES.SHIPPING_FIELDS,
      title: 'Step 2 — 배송지 / 검수지 / 수령자 / 결제 / 할인 / 회수 / 약정 입력 필드',
      sub: 'composeMemo prepend 폐기 — 5 신규 컬럼 입력 영역 분리 (legacy U_TXT1 / ADD_TXT_01_T / ADD_TXT_03_T / ADD_TXT_05_T / ADD_TXT_06_T + COLL_TERM / AGREE_TERM)',
      fields: [
        'shipping_address — 배송지 주소 (legacy U_TXT1)',
        'inspection_address — 검수지 주소 (legacy ADD_TXT_01_T)',
        'receiver_phone — 수령자 연락처 (legacy ADD_TXT_03_T)',
        'payment_due_label — 결제 만기 라벨 (legacy ADD_TXT_05_T)',
        'discount_info — 할인 정보 자유 텍스트 (legacy ADD_TXT_06_T)',
        'collect_term — 대금 회수 조건 (legacy COLL_TERM)',
        'agree_term — 거래 약정 조건 (legacy AGREE_TERM)',
        '메모 (자유 입력) — Slip.memo 1000자 (5 prefix 폐기)',
      ],
    },
    {
      file: STEP_FILES.DETAIL_ECOUNT,
      title: 'Step 3 — slip detail 12 신규 컬럼 카드',
      sub: '"거래처/배송 정보 (e-Count 매핑)" 카드에 12 컬럼 모두 별도 row 표시',
      fields: [
        'io_type — 10 (출고) / 11 (입고)',
        'time_date — 발행 시각 HHmmss (예: 143218)',
        'customer_tel / customer_address / customer_representative — 3 snapshot row',
        'shipping_address / inspection_address / receiver_phone — 3 배송 row',
        'payment_due_label / discount_info — 2 결제·할인 row',
        'collect_term / agree_term — 2 회수·약정 row',
        'memo (자유 입력) — 별도 카드 (5 prefix 0건)',
      ],
    },
  ];
  for (const b of banners) {
    const outPath = path.join(OUT_DIR, b.file);
    if (onlyMissing && fs.existsSync(outPath)) {
      const sizeKb = fs.statSync(outPath).size / 1024;
      // 실 캡처 (>=20KB) 보존 — placeholder 미덮어쓰기
      if (sizeKb >= 20) {
        console.log(`    skip (실 캡처 보존, ${sizeKb.toFixed(1)} KB) → ${b.file}`);
        continue;
      }
    }
    const fieldsSvg = b.fields
      .map((f, i) => `<text x="80" y="${478 + i * 28}" font-family="Consolas, monospace" font-size="13" fill="#1f2937">- ${f}</text>`)
      .join('\n  ');
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="900">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="40" y="40" width="1200" height="80" fill="#1e40af"/>
  <text x="60" y="92" font-family="Malgun Gothic, sans-serif" font-size="28" fill="#fff">PR-G1 — slip e-Count schema (12 컬럼)</text>
  <text x="60" y="180" font-family="Malgun Gothic, sans-serif" font-size="22" fill="#1f2937">${b.title}</text>
  <text x="60" y="220" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#4b5563">${b.sub}</text>
  <rect x="60" y="280" width="1160" height="120" fill="#fef2f2" stroke="#fca5a5" stroke-width="2"/>
  <text x="80" y="320" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#b91c1c">[TODO] Playwright 자동 캡처 실패 또는 FE 슬라이스 testid 미추가</text>
  <text x="80" y="350" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#7f1d1d">실행 방법: clients/desktop 에서 'cross-env VITE_MOCK_MODE=1 npx vite --port 5176' 부팅 후</text>
  <text x="80" y="375" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#7f1d1d">tools/manual-capture 에서 'node capture-pr-g1.js' 재실행</text>
  <text x="60" y="450" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#374151">검증 대상 (legacy e-Count BulkDatas → V16 12 컬럼):</text>
  ${fieldsSvg}
  <text x="60" y="800" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">docs/qa/phase-10-step-14-slip-ecount-schema/scenarios.md § 6 참조</text>
  <text x="60" y="820" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">V16 migration: services/slip-service/src/main/resources/db/migration/V16__add_slip_ecount_schema.sql</text>
</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`    placeholder → ${b.file} (${sizeKb} KB)`);
  }
}

(async () => {
  console.log('PR-G1 QA 작동 캡처 (slip e-Count schema 12 컬럼)');
  console.log(`  baseUrl  = ${BASE_URL}${ENTRY_PATH}`);
  console.log(`  output   = ${OUT_DIR}\n`);

  let browser;
  try {
    browser = await launchBrowser();
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
    await captureFormPage(ctx);
    await captureDetailPage(ctx);
    await ctx.close();
    console.log(`\n[done] 3 화면 캡처 완료 → ${OUT_DIR}`);
  } catch (err) {
    console.error('[error]', err.message);
  } finally {
    if (browser) await browser.close();
  }

  // 누락 step 자동 placeholder 보완 (실 캡처는 onlyMissing=true 로 보존)
  const missing = Object.values(STEP_FILES).filter(
    (f) => !fs.existsSync(path.join(OUT_DIR, f)),
  );
  const tooSmall = Object.values(STEP_FILES).filter((f) => {
    const p = path.join(OUT_DIR, f);
    return fs.existsSync(p) && fs.statSync(p).size < 20 * 1024;
  });
  if (missing.length > 0 || tooSmall.length > 0) {
    console.log(`\n[fallback] 누락 ${missing.length}건 + 소형 ${tooSmall.length}건 placeholder 보완`);
    await generatePlaceholders('partial flow failure or small capture', true);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
