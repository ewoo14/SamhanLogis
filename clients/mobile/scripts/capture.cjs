/**
 * Playwright capture script — Phase 6 Mobile v3 QA 캡처 6장.
 *
 * 출처: 06-frontend-design.md §QA + Mobile v3 Sub-team 의무 캡처 6장.
 *
 * 산출물 (390x844, iPhone 14 Pro):
 *   docs/qa/migration-fe-mobile-v3/01-mobile-bizgate-v3.png
 *   docs/qa/migration-fe-mobile-v3/02-mobile-home-9-menus.png
 *   docs/qa/migration-fe-mobile-v3/03-mobile-order-form-empty.png
 *   docs/qa/migration-fe-mobile-v3/04-mobile-order-form-after-add.png
 *   docs/qa/migration-fe-mobile-v3/05-mobile-order-form-with-info.png
 *   docs/qa/migration-fe-mobile-v3/06-mobile-bottom-tab.png
 *
 * 실행:
 *   1) npx expo export --platform web (dist 생성)
 *   2) npx http-server dist -p 4173 백그라운드
 *   3) node scripts/capture.cjs
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const VIEWPORT = { width: 390, height: 844 };
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/';
const OUT_DIR = path.resolve(__dirname, '../../../docs/qa/migration-fe-mobile-v3');

const json = (status, body) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** 모든 backend API 를 mock — BizGate / 주문 / 품목 */
async function mockApi(page) {
  await page.route(/\/api\/v1\/auth\/biz-gate$/, (route) =>
    route.fulfill(
      json(200, {
        status: 'OK',
        partnerCode: '1234567890',
        partnerName: '주식회사 샘플상사',
        token: 'mock-token-xyz',
      }),
    ),
  );

  await page.route(/\/api\/v1\/partner-orders(\?.*)?$/, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill(
        json(200, [
          {
            id: 'po-1',
            orderNumber: 'PO-20260505-0003',
            partnerCode: '1234567890',
            partnerName: '주식회사 샘플상사',
            orderDate: '2026-05-05',
            status: 'SUBMITTED',
            totalAmount: 4_280_000,
            shippingAddress: '서울시 강남구 테헤란로 152',
            lines: [],
          },
          {
            id: 'po-2',
            orderNumber: 'PO-20260504-0007',
            partnerCode: '1234567890',
            partnerName: '주식회사 샘플상사',
            orderDate: '2026-05-04',
            status: 'SHIPPED',
            totalAmount: 1_950_000,
            shippingAddress: '경기도 성남시 분당구 판교로 235',
            lines: [],
          },
        ]),
      );
    }
    return route.fulfill(json(200, {}));
  });

  await page.route(/\/api\/v1\/products(\?.*)?$/, (route) =>
    route.fulfill(
      json(200, [
        {
          id: 'p1',
          modelCode: 'HW-COMP-001',
          modelName: '컴프레서 5HP 2단 압축기',
          category: 'HW',
          unit: 'EA',
          defaultUnitPrice: 1_280_000,
        },
        {
          id: 'p2',
          modelCode: 'HW-EVAP-203',
          modelName: '증발기 코일 600x900 STS304',
          category: 'HW',
          unit: 'EA',
          defaultUnitPrice: 540_000,
        },
        {
          id: 'p3',
          modelCode: 'HW-COND-118',
          modelName: '응축기 핀튜브 1200x800',
          category: 'HW',
          unit: 'EA',
          defaultUnitPrice: 720_000,
        },
        {
          id: 'p4',
          modelCode: 'HW-MOTOR-08',
          modelName: '브러시리스 모터 380V 7.5kW',
          category: 'HW',
          unit: 'EA',
          defaultUnitPrice: 980_000,
        },
      ]),
    ),
  );
}

async function shoot(page, name) {
  const target = path.join(OUT_DIR, name);
  await page.screenshot({ path: target, type: 'png' });
  console.log('saved', target);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  page.on('console', (m) => console.log('[browser]', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await mockApi(page);

  // 01 BizGate (v2 동일)
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const bizInput = page.locator('[data-testid="biz-no-input"]');
  if ((await bizInput.count()) > 0) {
    await bizInput.first().fill('1234567890');
    await page.waitForTimeout(200);
  }
  await shoot(page, '01-mobile-bizgate-v3.png');

  // 조회 → BottomTab Home 진입 (legacy "조회" label)
  const submitBtn = page.locator('[data-testid="biz-submit"]');
  if (await submitBtn.count()) {
    await submitBtn.first().click();
    await page.waitForTimeout(1200);
  }

  // 06 Bottom Tab — viewport 캡처 먼저 (홈 첫 화면 + Bottom Tab 4탭 보임)
  await shoot(page, '06-mobile-bottom-tab.png');

  // 02 Home — 9 메뉴 노출 (스크롤 ScrollView 내부 → 전체 길이로 viewport 변경)
  // React Native Web 의 ScrollView 가 body overflow:hidden 안에 있어 fullPage 가 안 통함.
  // viewport 높이를 일시적으로 키우고 + scrollable container overflow 풀어서 전체 캡처.
  await page.evaluate(() => {
    document.documentElement.style.overflow = 'visible';
    document.body.style.overflow = 'visible';
    // 모든 ScrollView 내부 div 의 overflow 를 visible 로 변경
    document.querySelectorAll('div').forEach((d) => {
      if (d.style && d.style.overflow === 'scroll') d.style.overflow = 'visible';
    });
  });
  await page.setViewportSize({ width: 390, height: 1700 });
  await page.waitForTimeout(400);
  await shoot(page, '02-mobile-home-9-menus.png');
  // viewport 원복
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);

  // 03 Order Form (empty) — 홈 화면의 홈멀티 카테고리 클릭 (testID 사용)
  const enterHome = page.locator('[data-testid="enter-home"]');
  if (await enterHome.count()) {
    await enterHome.first().click();
    await page.waitForTimeout(900);
  }
  // 03 캡처 — 라인 0건 → cardOrderInfo 표시 X
  await shoot(page, '03-mobile-order-form-empty.png');

  // 04 — 라인 1건 추가 → cardOrderInfo 자동 표시 + scrollTo
  const addProductBtn = page.locator('[data-testid="add-product-button"]');
  if (await addProductBtn.count()) {
    await addProductBtn.first().click();
    await page.waitForTimeout(900);
    // ProductPicker 모달에서 첫 품목 선택 (모델명 텍스트로 클릭)
    const pickItem = page.getByText('컴프레서', { exact: false }).first();
    if (await pickItem.count()) {
      await pickItem.click();
      await page.waitForTimeout(1100);
    }
  }
  // 04 캡처 — cardOrderInfo 자동 표시 (전체 form 보이게 viewport 확장)
  await page.evaluate(() => {
    document.documentElement.style.overflow = 'visible';
    document.body.style.overflow = 'visible';
    document.querySelectorAll('div').forEach((d) => {
      if (d.style && d.style.overflow === 'scroll') d.style.overflow = 'visible';
    });
  });
  await page.setViewportSize({ width: 390, height: 1700 });
  await page.waitForTimeout(300);
  await shoot(page, '04-mobile-order-form-after-add.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);

  // 05 — cardOrderInfo 입력 완료 + 발주 button 활성화
  // testID 로 채움 (web 에선 data-testid)
  const fillByTestId = async (testId, value) => {
    const sel = `[data-testid="${testId}"]`;
    if ((await page.locator(sel).count()) > 0) {
      await page.locator(sel).first().fill(value);
      await page.waitForTimeout(120);
    }
  };
  await fillByTestId('info-shipping-address', '서울시 강남구 테헤란로 152, 5층');
  await fillByTestId('info-receiver-phone', '010-1234-5678');
  await fillByTestId('info-due-date', '2026-05-12');
  await fillByTestId('info-request-note', '오전 9시 도착요청');

  // 05 캡처 — cardOrderInfo 입력 완료 + 발주 button 활성화 (전체 form)
  await page.evaluate(() => {
    document.documentElement.style.overflow = 'visible';
    document.body.style.overflow = 'visible';
    document.querySelectorAll('div').forEach((d) => {
      if (d.style && d.style.overflow === 'scroll') d.style.overflow = 'visible';
    });
  });
  await page.setViewportSize({ width: 390, height: 1700 });
  await page.waitForTimeout(300);
  await shoot(page, '05-mobile-order-form-with-info.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);

  await browser.close();
  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
