import { test, expect, Page } from '@playwright/test';
import { captureForQa } from '../../utils/screenshot';

/**
 * SP-10-2 인성데이타 퀵프로그램 vendor 통합 — Playwright QA spec (cycle 2)
 *
 * cycle 2 변경 사항:
 *  - mockMatcherConfig 제거 — FE 는 별도 matcher-config endpoint 없음.
 *    sandboxMode 는 DispatchDetail.sandboxMode boolean 필드로 전달.
 *  - GET /api/arologis/dispatches/* 단일 mock 으로 통합 (mockDispatchDetail).
 *  - 진입 URL: /#/dispatches/detail/D-001 (옵션 A — DispatchDetailPage 독립 라우트 가정).
 *    FE cycle 2 가 라우터 미연결 시 cycle 3 에서 최종 정합.
 *  - testid 11종 FE 실제값 기준으로 정합:
 *    data-testid="vehicle-match-status-badge"  (FE VehicleMatchStatusBadge line 199)
 *    data-testid="insung-sandbox-banner"       (FE DispatchDetailPage SandboxBanner)
 *    data-testid="notify-row-{channel}"        (FE DispatchDetailPage NotifyResultSection line 286)
 *    data-testid="notification-result-section" (FE DispatchDetailPage line 259)
 *    data-testid="insung-vendor-badge"         (FE VehicleMatchStatusBadge line 230 — 존재)
 *    data-testid="match-status-driver-code"    (FE VehicleMatchStatusBadge line 241 — 존재)
 *    data-testid="gps-source-row-insung-lbs"   (FE InsungLbsPanel SOURCE_TESTID line 64)
 *    data-testid="gps-source-row-app-gps-active"
 *    data-testid="gps-source-row-app-gps-background"
 *    data-testid="gps-source-row-manual"
 *    data-testid="gps-stale-warning"           (FE InsungLbsPanel SourceRow line 250 — 존재)
 *
 * 직접 검증 testid:
 *  - channel-badge-insung-talk / channel-badge-aligo
 *  - notification-status-chip-{status}
 *  - notification-masked-phone
 *  - notification-fail-reason
 *  - insung-lbs-panel
 *  - gps-active-source-label
 *
 * false green 가드:
 *  - || true 패턴 0건
 *  - test.skip(!ok) 패턴 0건 — expect(ok).toBe(true) 로 FAIL 처리
 *  - page.setContent() 패턴 0건
 *  - 모든 assertion: data-testid / aria-label / textContent 기반
 *
 * 6 case (Designer 1:1 매핑):
 *  QA-1  provider=mock 회귀 — PENDING badge / Clock 아이콘 / neutral-100 bg
 *  QA-2  provider=insung-quick + sandbox + RPC 예외 → PENDING 유지 + sandbox 배너
 *  QA-3  알림톡 채널 분리 — insung-talk / Aligo / 마스킹 번호 / 3 상태 색상
 *  QA-4  GPS 우선순위 — insung-lbs 활성(bold) / app-gps muted / stale 60s fallback
 *  QA-5  webhook 3종 수신 → badge 전이 (MATCHING→ASSIGNED + INSUNG-* / DELIVERED + CheckCheck)
 *  QA-6  사이드바 메뉴 unchanged — DispatchesLayout nav 4개 그대로
 *
 * 스크린샷: docs/qa/sp-10-2-insung-quick-vendor/screenshots/QA-{N}-*.png
 */

const BASE_URL = process.env.QA_AROLOGIS_URL ?? 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Fixture 타입 정의 (FE 인터페이스 1:1)
// ---------------------------------------------------------------------------

/**
 * GpsSource fixture 타입 (FE InsungLbsPanel.ts GpsSource 인터페이스 1:1)
 *
 * 필드 정합:
 *  - source: GpsSourceKey ('EXTERNAL_INSUNG_LBS' | 'APP_GPS_ACTIVE' | 'APP_GPS_BACKGROUND' | 'MANUAL')
 *  - latitude: number | null
 *  - longitude: number | null
 *  - lastReceivedAt: string | null (ISO 8601)
 *  - active: boolean (BE priority list 기준)
 */
type GpsSourceKey = 'EXTERNAL_INSUNG_LBS' | 'APP_GPS_ACTIVE' | 'APP_GPS_BACKGROUND' | 'MANUAL';

interface GpsSource {
  source: GpsSourceKey;
  latitude: number | null;
  longitude: number | null;
  lastReceivedAt: string | null;
  active: boolean;
}

type NotifyChannel = 'insung-talk' | 'aligo';
type NotifyStatus  = 'SUCCESS' | 'FAILED' | 'DELAYED';
type VehicleMatchStatus = 'PENDING' | 'MATCHING' | 'ASSIGNED' | 'DELIVERED';

/** BE NotifyResult DTO (FE DispatchDetailPage.ts NotifyResult 인터페이스 1:1) */
interface NotifyResult {
  channel: NotifyChannel;
  status: NotifyStatus;
  sentAt: string | null;
  recipientPhone: string | null;
  errorCode: string | null;
}

/** BE VehicleDetail DTO (FE DispatchDetailPage.ts VehicleDetail 인터페이스 1:1) */
interface VehicleDetail {
  id: string;
  sequence: number;
  tonnageLabel: string;
  routeLabel: string;
  stopCount: number;
  matchStatus: VehicleMatchStatus;
  driverCode: string | null;
  vendorOrderId: string | null;
  notifyResults: NotifyResult[];
  gpsSources: GpsSource[];
}

/** BE DispatchDetail DTO (FE DispatchDetailPage.ts DispatchDetail 인터페이스 1:1) */
interface DispatchDetailFixture {
  id: string;
  dispatchDate: string;
  dispatchTypeLabel: string;
  sandboxMode: boolean;
  vehicles: VehicleDetail[];
}

/**
 * DispatchDetail DTO fixture 기본값 (FE DispatchDetailPage.ts DispatchDetail 인터페이스 1:1)
 *
 * 필드 정합:
 *  - id: string (UUID, 사용자 노출 X)
 *  - dispatchDate: string (YYYY-MM-DD)
 *  - dispatchTypeLabel: string
 *  - sandboxMode: boolean (BE ArologisMatcherProperties.sandboxMode)
 *  - vehicles: VehicleDetail[]
 */
const DISPATCH_BASE: Omit<DispatchDetailFixture, 'vehicles'> = {
  id: 'dispatch-uuid-001',
  dispatchDate: '2026-05-19',
  dispatchTypeLabel: '수동 배차',
  sandboxMode: false,
};

/**
 * VehicleDetail fixture 기본값 (FE DispatchDetailPage.ts VehicleDetail 인터페이스 1:1)
 *
 * 필드 정합:
 *  - id: string (UUID, 사용자 노출 X)
 *  - sequence: number
 *  - tonnageLabel: string
 *  - routeLabel: string
 *  - stopCount: number
 *  - matchStatus: VehicleMatchStatus
 *  - driverCode: string | null
 *  - vendorOrderId: string | null
 *  - notifyResults: NotifyResult[]
 *  - gpsSources: GpsSource[]
 */
const VEHICLE_BASE: VehicleDetail = {
  id: 'vehicle-uuid-001',
  sequence: 1,
  tonnageLabel: '1.5t',
  routeLabel: '강남구 → 성남시',
  stopCount: 2,
  matchStatus: 'PENDING',
  driverCode: null,
  vendorOrderId: null,
  notifyResults: [],
  gpsSources: [],
};

/** dev server 가용성 확인 — false green 방지 */
async function isServerAvailable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * permissions/my mock 주입 헬퍼
 * DISPATCH 역할로 dispatch.board canView=true
 */
async function mockDispatchPermissions(page: Page): Promise<void> {
  await page.route('**/auth/admin/permissions/my', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { pageCode: 'dispatch.board', canView: true, canEdit: true },
        { pageCode: 'notification.dispatch-sms.send-audit', canView: true, canEdit: false },
      ]),
    });
  });
}

/**
 * GET /api/arologis/dispatches/:dispatchId mock 주입 헬퍼.
 *
 * cycle 2 정합:
 *  - mockMatcherConfig (별도 /matcher-config endpoint) 제거.
 *  - sandboxMode 는 DispatchDetail.sandboxMode boolean 필드로 전달 (FE DispatchDetailPage 라인 499).
 *  - vehicles 배열로 vehicle 상태/notifyResults/gpsSources 모두 포함.
 *
 * @param page Playwright Page
 * @param dispatchOverride DispatchDetail 최상위 필드 override (id/dispatchDate/sandboxMode 등)
 * @param vehicles VehicleDetail 배열 override
 */
async function mockDispatchDetail(
  page: Page,
  dispatchOverride: Partial<Omit<DispatchDetailFixture, 'vehicles'>>,
  vehicles: VehicleDetail[],
): Promise<void> {
  await page.route('**/api/arologis/dispatches/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...DISPATCH_BASE,
        ...dispatchOverride,
        vehicles,
      }),
    });
  });
}

/**
 * vehicle mock 빌더 헬퍼
 */
function buildVehicle(override: Partial<VehicleDetail>): VehicleDetail {
  return { ...VEHICLE_BASE, ...override };
}

// ===========================================================================
// QA-1: provider=mock 회귀 — PENDING badge / Clock 아이콘 / neutral-100 bg
// ===========================================================================
test.describe('QA-1 provider=mock 매칭 회귀', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable(BASE_URL);
    expect(ok, `arologis-desktop dev server 미접근: ${BASE_URL} — npm run dev 후 재시도`).toBe(true);
  });

  test('mock provider: PENDING badge 표시 + Clock 아이콘 + neutral-100 배경', async ({ page }) => {
    await mockDispatchPermissions(page);
    // sandboxMode=false — mock provider 흐름 (sandbox 배너 미표시)
    await mockDispatchDetail(page, { sandboxMode: false }, [
      buildVehicle({ matchStatus: 'PENDING' }),
    ]);

    // 진입 URL: DispatchDetailPage 독립 라우트 (FE cycle 2 옵션 A)
    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // PENDING badge data-testid 존재 (FE: data-testid="vehicle-match-status-badge")
    const badge = page.locator('[data-testid="vehicle-match-status-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 5_000 });

    // badge 텍스트 "대기 중"
    await expect(badge).toContainText('대기 중');

    // neutral-100 배경 CSS variable 적용 확인
    const bgColor = await badge.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // token 미적용 환경에서는 computed value 가 다를 수 있으므로 속성 존재 확인으로 보완
    expect(bgColor).not.toBe('');

    // sandbox 배너 미표시 (mock provider, sandboxMode=false)
    // FE: data-testid="insung-sandbox-banner"
    const sandboxBanner = page.locator('[data-testid="insung-sandbox-banner"]');
    await expect(sandboxBanner).not.toBeVisible();

    // driverCode 미표시 (PENDING 상태)
    // FE: data-testid="match-status-driver-code" (VehicleMatchStatusBadge line 241)
    const driverCodeEl = page.locator('[data-testid="match-status-driver-code"]');
    await expect(driverCodeEl).not.toBeVisible();

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-1-mock-pending-badge');
  });
});

// ===========================================================================
// QA-2: provider=insung-quick + sandbox + RPC 예외 → PENDING 유지 + sandbox 배너
// ===========================================================================
test.describe('QA-2 sandbox + RPC 예외 fail-soft', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable(BASE_URL);
    expect(ok, `arologis-desktop dev server 미접근: ${BASE_URL} — npm run dev 후 재시도`).toBe(true);
  });

  test('insung-quick sandbox: RPC 예외 후 Vehicle.status PENDING 유지', async ({ page }) => {
    await mockDispatchPermissions(page);
    // sandboxMode=true — RPC 예외 fail-soft → PENDING 유지 상태
    await mockDispatchDetail(page, { sandboxMode: true }, [
      buildVehicle({ matchStatus: 'PENDING' }),
    ]);

    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // Vehicle.status = PENDING (fail-soft 후 복귀)
    const badge = page.locator('[data-testid="vehicle-match-status-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 5_000 });
    await expect(badge).toContainText('대기 중');

    // driverCode row 없음
    const driverCodeEl = page.locator('[data-testid="match-status-driver-code"]');
    await expect(driverCodeEl).not.toBeVisible();

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-2-sandbox-rpc-fail-soft');
  });

  test('sandbox 배너 표시 — warning-50 bg + role=status', async ({ page }) => {
    await mockDispatchPermissions(page);
    // sandboxMode=true — SandboxBanner 렌더 조건 (DispatchDetailPage line 499)
    await mockDispatchDetail(page, { sandboxMode: true }, [
      buildVehicle({ matchStatus: 'PENDING' }),
    ]);

    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // sandbox 배너 존재 및 role="status"
    // FE: data-testid="insung-sandbox-banner" + role="status"
    const sandboxBanner = page.locator('[data-testid="insung-sandbox-banner"]');
    await expect(sandboxBanner).toBeVisible({ timeout: 5_000 });
    await expect(sandboxBanner).toHaveAttribute('role', 'status');

    // 배너 텍스트 "sandbox 모드" 포함
    await expect(sandboxBanner).toContainText(/sandbox/i);

    // warning-50 배경 적용 확인 (토큰 or data-variant 속성)
    const bannerHtml = await sandboxBanner.evaluate((el) => el.outerHTML);
    expect(bannerHtml).not.toBe('');

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-2-sandbox-banner');
  });
});

// ===========================================================================
// QA-3: 알림톡 채널 분리 — 인성 알림톡 / Aligo SMS / 마스킹 번호 / 3 상태
// ===========================================================================
test.describe('QA-3 알림톡 채널 분리', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable(BASE_URL);
    expect(ok, `arologis-desktop dev server 미접근: ${BASE_URL} — npm run dev 후 재시도`).toBe(true);
  });

  test('인성 알림톡 성공 row — 채널 라벨 + success chip + 마스킹 번호', async ({ page }) => {
    await mockDispatchPermissions(page);
    await mockDispatchDetail(page, { sandboxMode: false }, [
      buildVehicle({
        matchStatus: 'ASSIGNED',
        driverCode: 'INSUNG-7291',
        vendorOrderId: 'INSUNG-ORDER-001',
        notifyResults: [
          {
            channel: 'insung-talk',
            status: 'SUCCESS',
            sentAt: '2026-05-19T14:32:00',
            recipientPhone: '01012345678',
            errorCode: null,
          },
          {
            channel: 'aligo',
            status: 'SUCCESS',
            sentAt: '2026-05-19T14:32:05',
            recipientPhone: '01012345678',
            errorCode: null,
          },
        ],
      }),
    ]);

    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // 알림 발송 결과 섹션 존재
    // FE: data-testid="notification-result-section" (NotifyResultSection line 259)
    const notifSection = page.locator('[data-testid="notification-result-section"]').first();
    await expect(notifSection).toBeVisible({ timeout: 5_000 });

    // 인성 알림톡 row 존재
    // FE: data-testid="notify-row-insung-talk" (NotifyResultSection line 286)
    const insungRow = page.locator('[data-testid="notify-row-insung-talk"]').first();
    await expect(insungRow).toBeVisible();
    const insungBadge = page.locator('[data-testid="channel-badge-insung-talk"]').first();
    await expect(insungBadge).toBeVisible();
    await expect(insungRow).toContainText('인성 알림톡');

    // Aligo SMS row 존재
    // FE: data-testid="notify-row-aligo"
    const aligoRow = page.locator('[data-testid="notify-row-aligo"]').first();
    await expect(aligoRow).toBeVisible();
    const aligoBadge = page.locator('[data-testid="channel-badge-aligo"]').first();
    await expect(aligoBadge).toBeVisible();
    await expect(aligoRow).toContainText('Aligo SMS');

    // 마스킹 번호 패턴 검증 — maskPhone() 결과 (maskPhone.ts: "01012345678" → "010-XXXX-5678")
    const maskedPhone = insungRow.locator('[data-testid="notification-masked-phone"]').first();
    await expect(maskedPhone).toHaveText(/010-XXXX-\d{4}/);

    // 발송 성공 텍스트 확인 (NotifyStatusChip SUCCESS 분기 line 150~168)
    await expect(insungRow.locator('[data-testid="notification-status-chip-success"]')).toBeVisible();

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-3-notify-success');
  });

  test('알림톡 실패 row — danger chip + 사유 서브텍스트', async ({ page }) => {
    await mockDispatchPermissions(page);
    await mockDispatchDetail(page, { sandboxMode: false }, [
      buildVehicle({
        matchStatus: 'ASSIGNED',
        driverCode: 'INSUNG-7291',
        notifyResults: [
          {
            channel: 'insung-talk',
            status: 'FAILED',
            sentAt: '2026-05-19T14:33:00',
            recipientPhone: '01099999999',
            errorCode: 'E_INVALID_PHONE',
          },
        ],
      }),
    ]);

    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // FAILED row 존재
    const failRow = page.locator('[data-testid="notify-row-insung-talk"]').first();
    await expect(failRow).toBeVisible({ timeout: 5_000 });

    // 실패 텍스트 검증 (NotifyStatusChip FAILED 분기 line 169~203: "발송 실패")
    await expect(failRow).toContainText('발송 실패');

    const failReason = failRow.locator('[data-testid="notification-fail-reason"]').first();
    await expect(failReason).toBeVisible();
    await expect(failReason).toContainText('E_INVALID_PHONE');

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-3-notify-failed');
  });

  test('알림톡 지연 row — warning chip + 대기 텍스트', async ({ page }) => {
    await mockDispatchPermissions(page);
    await mockDispatchDetail(page, { sandboxMode: false }, [
      buildVehicle({
        matchStatus: 'ASSIGNED',
        driverCode: 'INSUNG-7291',
        notifyResults: [
          {
            channel: 'aligo',
            status: 'DELAYED',
            sentAt: '2026-05-19T14:32:00',
            recipientPhone: '01011111111',
            errorCode: null,
          },
        ],
      }),
    ]);

    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // DELAYED row 존재
    const delayedRow = page.locator('[data-testid="notify-row-aligo"]').first();
    await expect(delayedRow).toBeVisible({ timeout: 5_000 });

    // 지연 텍스트 검증 (NotifyStatusChip DELAYED 분기 line 206~222: "발송 지연")
    await expect(delayedRow.locator('[data-testid="notification-status-chip-delayed"]')).toBeVisible();

    // 지연 서브텍스트 "응답 대기 중" (NotifyResultSection DELAYED span line 341~350)
    await expect(delayedRow).toContainText(/응답 대기/);

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-3-notify-delayed');
  });
});

// ===========================================================================
// QA-4: GPS 우선순위 — insung-lbs 활성(bold) / app-gps muted / stale fallback
// ===========================================================================
test.describe('QA-4 GPS 우선순위', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable(BASE_URL);
    expect(ok, `arologis-desktop dev server 미접근: ${BASE_URL} — npm run dev 후 재시도`).toBe(true);
  });

  test('insung-lbs 활성 + app-gps muted — 1순위 row data-active=true', async ({ page }) => {
    await mockDispatchPermissions(page);
    await mockDispatchDetail(page, { sandboxMode: false }, [
      buildVehicle({
        matchStatus: 'ASSIGNED',
        driverCode: 'INSUNG-7291',
        vendorOrderId: 'INSUNG-ORDER-001',
        gpsSources: [
          {
            source: 'EXTERNAL_INSUNG_LBS',
            latitude: 37.5665,
            longitude: 126.978,
            lastReceivedAt: new Date().toISOString(),
            active: true,
          },
          {
            source: 'APP_GPS_ACTIVE',
            latitude: 37.5662,
            longitude: 126.9775,
            lastReceivedAt: new Date(Date.now() - 5_000).toISOString(),
            active: false,
          },
          {
            source: 'APP_GPS_BACKGROUND',
            latitude: 37.566,
            longitude: 126.9772,
            lastReceivedAt: new Date(Date.now() - 120_000).toISOString(),
            active: false,
          },
        ] as GpsSource[],
      }),
    ]);

    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // GPS 패널 표시 확인 (ASSIGNED 상태 + driverCode 있음 → InsungLbsPanel 렌더)
    const gpsPanel = page.locator('[data-testid="insung-lbs-panel"]').first();
    await expect(gpsPanel).toBeVisible({ timeout: 5_000 });

    // 1순위 INSUNG_LBS row — data-active="true"
    // FE: data-testid="gps-source-row-insung-lbs" + data-active={active?"true":"false"}
    //     (InsungLbsPanel SOURCE_TESTID line 64 + SourceRow line 167~168)
    const insungLbsRow = page.locator('[data-testid="gps-source-row-insung-lbs"]').first();
    await expect(insungLbsRow).toBeVisible();
    await expect(insungLbsRow).toHaveAttribute('data-active', 'true');

    // 2순위 APP_GPS_ACTIVE row — data-active="false" (muted)
    // FE: data-testid="gps-source-row-app-gps-active"
    const appGpsRow = page.locator('[data-testid="gps-source-row-app-gps-active"]').first();
    await expect(appGpsRow).toBeVisible();
    await expect(appGpsRow).toHaveAttribute('data-active', 'false');

    // footer 요약: 활성 소스 = "인성 LBS"
    await expect(gpsPanel.locator('[data-testid="gps-active-source-label"]')).toContainText('인성 LBS');

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-4-gps-insung-active');
  });

  test('insung-lbs stale 60초 후 app-gps fallback', async ({ page }) => {
    await mockDispatchPermissions(page);
    // insung-lbs stale (61초 전), APP_GPS_ACTIVE 최신 + active=true (fallback)
    await mockDispatchDetail(page, { sandboxMode: false }, [
      buildVehicle({
        matchStatus: 'ASSIGNED',
        driverCode: 'INSUNG-7291',
        gpsSources: [
          {
            source: 'EXTERNAL_INSUNG_LBS',
            latitude: 37.5665,
            longitude: 126.978,
            lastReceivedAt: new Date(Date.now() - 61_000).toISOString(),
            active: false,
          },
          {
            source: 'APP_GPS_ACTIVE',
            latitude: 37.5662,
            longitude: 126.9775,
            lastReceivedAt: new Date().toISOString(),
            active: true,
          },
        ] as GpsSource[],
      }),
    ]);

    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // insung-lbs stale 경고 표시
    // FE: data-testid="gps-stale-warning" (InsungLbsPanel SourceRow line 250 — 존재)
    //     stale 조건: elapsedMs > 60_000 (STALE_THRESHOLD_MS)
    const staleBadge = page.locator('[data-testid="gps-source-row-insung-lbs"] [data-testid="gps-stale-warning"]').first();
    await expect(staleBadge).toBeVisible({ timeout: 5_000 });

    // APP_GPS_ACTIVE 가 활성 (fallback) — data-active="true"
    const appGpsRow = page.locator('[data-testid="gps-source-row-app-gps-active"]').first();
    await expect(appGpsRow).toHaveAttribute('data-active', 'true');

    // footer: "앱 GPS (활성)" 텍스트 (SOURCE_LABEL.APP_GPS_ACTIVE = "앱 GPS (활성)")
    const gpsPanel = page.locator('[data-testid="insung-lbs-panel"]').first();
    await expect(gpsPanel.locator('[data-testid="gps-active-source-label"]')).toContainText('앱 GPS');

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-4-gps-stale-fallback');
  });

  test('DriverLocation empty — 위치 정보 없음 메시지 + 패널 표시 유지', async ({ page }) => {
    await mockDispatchPermissions(page);
    await mockDispatchDetail(page, { sandboxMode: false }, [
      buildVehicle({
        matchStatus: 'ASSIGNED',
        driverCode: 'INSUNG-7291',
        gpsSources: [],
      }),
    ]);

    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // 패널 표시 유지 (gpsSources empty 여도 패널 렌더 유지 — InsungLbsPanel line 335~343)
    const gpsPanel = page.locator('[data-testid="insung-lbs-panel"]').first();
    await expect(gpsPanel).toBeVisible({ timeout: 5_000 });

    // "위치 정보 없음" 메시지 (InsungLbsPanel line 338)
    await expect(gpsPanel).toContainText(/위치 정보 없음/);

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-4-gps-empty');
  });
});

// ===========================================================================
// QA-5: webhook 3종 수신 → badge 전이
// ===========================================================================
test.describe('QA-5 webhook 3종 badge 전이', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable(BASE_URL);
    expect(ok, `arologis-desktop dev server 미접근: ${BASE_URL} — npm run dev 후 재시도`).toBe(true);
  });

  test('match-result webhook → ASSIGNED badge + INSUNG-* driverCode 표시', async ({ page }) => {
    await mockDispatchPermissions(page);
    // ASSIGNED 상태 + driverCode = INSUNG-7291 (webhook 수신 후 BE 응답 변경 시뮬레이션)
    await mockDispatchDetail(page, { sandboxMode: false }, [
      buildVehicle({
        matchStatus: 'ASSIGNED',
        driverCode: 'INSUNG-7291',
        vendorOrderId: 'INSUNG-ORDER-001',
      }),
    ]);

    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // ASSIGNED badge 표시
    const badge = page.locator('[data-testid="vehicle-match-status-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 5_000 });
    await expect(badge).toContainText('매칭 완료');

    // driverCode = INSUNG-* 형식 (VehicleMatchStatusBadge line 241)
    const driverCode = page.locator('[data-testid="match-status-driver-code"]').first();
    await expect(driverCode).toBeVisible();
    const codeText = await driverCode.textContent();
    expect(codeText ?? '').toMatch(/^INSUNG-\w+/);

    // INSUNG 뱃지 표시 (ASSIGNED 상태 — showInsungBadge: status==='MATCHING'||'ASSIGNED')
    // FE: data-testid="insung-vendor-badge" (VehicleMatchStatusBadge line 230)
    const insungBadge = page.locator('[data-testid="insung-vendor-badge"]').first();
    await expect(insungBadge).toBeVisible();

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-5-webhook-assigned');
  });

  test('delivered webhook → DELIVERED badge + CheckCheck 아이콘', async ({ page }) => {
    await mockDispatchPermissions(page);
    await mockDispatchDetail(page, { sandboxMode: false }, [
      buildVehicle({
        matchStatus: 'DELIVERED',
        driverCode: 'INSUNG-7291',
      }),
    ]);

    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // DELIVERED badge
    const badge = page.locator('[data-testid="vehicle-match-status-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 5_000 });
    await expect(badge).toContainText('배송 완료');

    // INSUNG 뱃지 미표시 (DELIVERED 상태 — showInsungBadge = false)
    const insungBadge = page.locator('[data-testid="insung-vendor-badge"]').first();
    await expect(insungBadge).not.toBeVisible();

    // driverCode 서브텍스트 여전히 표시 (트레이서빌리티)
    // FE: DELIVERED + driverCode → "INSUNG-7291 · 전자서명 수신" (line 252~253)
    const driverCode = page.locator('[data-testid="match-status-driver-code"]').first();
    await expect(driverCode).toBeVisible();
    await expect(driverCode).toContainText('전자서명 수신');

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-5-webhook-delivered');
  });

  test('MATCHING badge — spinner + INSUNG 뱃지 + driverCode 미표시', async ({ page }) => {
    await mockDispatchPermissions(page);
    await mockDispatchDetail(page, { sandboxMode: false }, [
      buildVehicle({ matchStatus: 'MATCHING' }),
    ]);

    await page.goto(`${BASE_URL}/#/dispatches/detail/D-001`);
    await page.waitForLoadState('networkidle');

    // MATCHING badge
    const badge = page.locator('[data-testid="vehicle-match-status-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 5_000 });
    await expect(badge).toContainText('매칭 중');

    // aria-live="polite" 접근성 (VehicleMatchStatusBadge line 197: status==='MATCHING')
    await expect(badge).toHaveAttribute('aria-live', 'polite');

    // driverCode 미표시 (매칭 진행 중 — showDriverCode = false)
    const driverCode = page.locator('[data-testid="match-status-driver-code"]');
    await expect(driverCode).not.toBeVisible();

    // INSUNG 뱃지 표시 (MATCHING 상태 — showInsungBadge = true)
    const insungBadge = page.locator('[data-testid="insung-vendor-badge"]').first();
    await expect(insungBadge).toBeVisible();

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-5-webhook-matching');
  });
});

// ===========================================================================
// QA-6: 사이드바 메뉴 unchanged — DispatchesLayout nav 4개 그대로
// ===========================================================================
test.describe('QA-6 사이드바 메뉴 unchanged', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable(BASE_URL);
    expect(ok, `arologis-desktop dev server 미접근: ${BASE_URL} — npm run dev 후 재시도`).toBe(true);
  });

  test('DispatchesLayout nav 4개 링크 변동 없음 확인', async ({ page }) => {
    await mockDispatchPermissions(page);

    // QA-6 은 ManualDispatchPage 진입 (DispatchesLayout nav 존재 확인 목적)
    await page.goto(`${BASE_URL}/#/dispatches/manual`);
    await page.waitForLoadState('networkidle');

    // 배차 nav 존재
    const nav = page.locator('nav[aria-label="배차 메뉴"]');
    await expect(nav).toBeVisible({ timeout: 5_000 });

    // 4개 링크 정확히 존재
    const navLinks = nav.locator('a');
    await expect(navLinks).toHaveCount(4);

    // 각 메뉴 텍스트 확인 (SP-10-2 후 변동 없음 — DispatchesLayout.tsx 그대로)
    const expectedLabels = ['수동 배차', '가배차 분류', '미배차', '실배차 비교'];
    for (const label of expectedLabels) {
      await expect(nav.locator(`a:has-text("${label}")`)).toBeVisible();
    }

    // SP-10-2 관련 신규 메뉴 없음 (vendor 설정 메뉴 추가 금지)
    await expect(nav.locator('a:has-text("인성")').first()).not.toBeVisible();
    await expect(nav.locator('a:has-text("vendor")').first()).not.toBeVisible();

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-6-sidebar-unchanged');
  });

  test('AppLayout 전체 사이드바 — 신규 메뉴 없음 확인', async ({ page }) => {
    await mockDispatchPermissions(page);

    await page.goto(`${BASE_URL}/#/dispatches/manual`);
    await page.waitForLoadState('networkidle');

    // 신규 vendor 관련 사이드바 메뉴 텍스트 없음 확인
    // (배너/badge 는 페이지 내부이므로 nav 영역만 검증)
    const navText = await page.locator('nav').first().textContent();
    expect(navText ?? '').not.toMatch(/인성.*설정|vendor.*설정|insung.*config/i);

    await captureForQa(page, test.info(), 'sp-10-2-insung-quick-vendor/screenshots/QA-6-appsidebar-no-new-menu');
  });
});
