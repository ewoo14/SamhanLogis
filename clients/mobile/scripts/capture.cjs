/**
 * Playwright capture script — Phase 6 Sub-team D QA 캡처 5장.
 *
 * 출처: 06-frontend-design.md §QA + Sub-team D 의무 캡처 5장.
 *
 * 산출물:
 *   docs/qa/migration-fe-mobile/01-mobile-bizgate-login.png   (390x844)
 *   docs/qa/migration-fe-mobile/02-mobile-home.png            (390x844)
 *   docs/qa/migration-fe-mobile/03-mobile-order-form.png      (390x844)
 *   docs/qa/migration-fe-mobile/04-mobile-bottom-tab.png      (390x844)
 *   docs/qa/migration-fe-mobile/05-mobile-product-picker.png  (390x844)
 *
 * 실행:
 *   1) http-server dist -p 4173 백그라운드
 *   2) node scripts/capture.cjs
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const VIEWPORT = { width: 390, height: 844 };
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/';
const OUT_DIR = path.resolve(__dirname, '../../../docs/qa/migration-fe-mobile');

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
          {
            id: 'po-3',
            orderNumber: 'PO-20260503-0011',
            partnerCode: '1234567890',
            partnerName: '주식회사 샘플상사',
            orderDate: '2026-05-03',
            status: 'CONFIRMED',
            totalAmount: 7_640_000,
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

  // 01 BizGate
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  // 사업자번호 입력 — 첫 input 에 1234567890 채우기
  const inputs = page.locator('input');
  if ((await inputs.count()) > 0) {
    await inputs.first().fill('1234567890');
    await page.waitForTimeout(200);
  }
  await shoot(page, '01-mobile-bizgate-login.png');

  // 확인 버튼 클릭 → BottomTab Home 진입
  const submitBtn = page.getByText('확인', { exact: true }).first();
  if (await submitBtn.count()) {
    await submitBtn.click();
    await page.waitForTimeout(900);
  }

  // 02 Home
  await shoot(page, '02-mobile-home.png');

  // 04 Bottom Tab — 홈 탭 활성 + 4 탭 모두 보임 (전체 캡처와 동일하나 footer 가 보이게)
  // 04 는 Bottom Tab 강조용으로 동일 이미지 사용 또는 주문 탭으로 이동 후 캡처
  await shoot(page, '04-mobile-bottom-tab.png');

  // 03 Order Form — 주문 탭 → 새 주문 작성
  const orderTab = page.getByText('주문', { exact: true }).first();
  if (await orderTab.count()) {
    await orderTab.click();
    await page.waitForTimeout(700);
  }
  // OrderList → "+ 새 주문 작성" 버튼
  const newOrderBtn = page.getByText('+ 새 주문 작성').first();
  if (await newOrderBtn.count()) {
    await newOrderBtn.click();
    await page.waitForTimeout(700);
  }
  // 라인 1건 자동 추가를 위해 "+ 품목 추가" → 품목 선택 1건 → 돌아옴
  const addProductBtn = page.getByText('+ 품목 추가').first();
  if (await addProductBtn.count()) {
    await addProductBtn.click();
    await page.waitForTimeout(700);

    // 05 Product Picker — 품목 모달 캡처
    await shoot(page, '05-mobile-product-picker.png');

    // 품목 1건 선택
    const pickItem = page.getByText('HW-COMP-001').first();
    if (await pickItem.count()) {
      await pickItem.click();
      await page.waitForTimeout(700);
    }
  }
  // 주문 폼으로 돌아온 상태에서 03 캡처
  await shoot(page, '03-mobile-order-form.png');

  await browser.close();
  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
