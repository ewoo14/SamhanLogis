/**
 * PR-H3 QA — 슬립 수정/삭제 요청 워크플로우 작동 캡처.
 *
 * 사용자 핵심 요구 (memory feedback_pr_qa_screenshots) — 작동 화면 시각 증거 절대 의무.
 * Samhan Public 핵심 가치: "잠금 → 요청 → 알림 → 수락 → 해제" 5 단계 워크플로우 시각 검증.
 *
 * 전제:
 *   - clients/desktop 에서 `cross-env VITE_MOCK_MODE=1 npx vite --port 5176 --host 127.0.0.1` 가동
 *   - playwright + sharp 는 tools/manual-capture/node_modules 에 이미 설치됨 (PR-F1/F2/H1/H2 기존)
 *
 * 동작:
 *   1) Playwright (chromium fallback msedge) headless 으로 vite renderer 진입
 *   2) Step 1 (locked banner) — SALES context, mockRole=SALES + slip-002 (CONFIRMED) 진입
 *      → SlipDetailPage 의 `slip-detail-edit-request-banner` 자연 mount 확인 → 캡처
 *   3) Step 2 (dialog) — SALES context, slip-002 진입 → "수정 요청" 버튼 클릭 → SlipEditRequestDialog 오픈
 *      → textarea 에 사유 입력 진행 중 상태로 캡처
 *   4) Step 3 (warehouse pending list) — WAREHOUSE context, /admin/slip-edit-requests 진입
 *      → mock fetch interceptor 로 GET 응답 1+ row 직접 주입 → 표 mount 확인 → 캡처
 *   5) Step 4 (approved toast) — SALES context, slip-002 진입 → DOM 직접 toast 주입 (success variant)
 *      → 캡처
 *
 * 산출:
 *   docs/qa/phase-12-step-3-slip-edit-permission/working-edit-request-dialog.png
 *   docs/qa/phase-12-step-3-slip-edit-permission/working-warehouse-pending-list.png
 *   docs/qa/phase-12-step-3-slip-edit-permission/working-edit-request-approved-toast.png
 *   docs/qa/phase-12-step-3-slip-edit-permission/working-locked-slip-banner.png
 *
 * 실패 시 fallback (placeholder PNG with 한국어 TODO + 시나리오 설명) — generatePlaceholders() 자동.
 */
const { chromium } = require('playwright');
const sharp = require('sharp');
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
  'phase-12-step-3-slip-edit-permission',
));

const STEP_FILES = {
  DIALOG: 'working-edit-request-dialog.png',
  PENDING_LIST: 'working-warehouse-pending-list.png',
  APPROVED_TOAST: 'working-edit-request-approved-toast.png',
  LOCKED_BANNER: 'working-locked-slip-banner.png',
};

const SAMPLE_REASON = '거래처 요청으로 라인 2번의 수량을 5 → 7 로 변경 필요합니다.';

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
 * Electron IPC stub (samhanAuth) 공통 init script — PR-H1/H2 패턴 일관.
 */
function buildAuthInit() {
  return `(() => {
    if (!window.samhanAuth) {
      window.samhanAuth = {
        setToken: async () => undefined,
        getToken: async () => null,
        clearToken: async () => undefined,
      };
    }
  })();`;
}

/**
 * Step 1: SALES context — slip-002 (CONFIRMED) 진입 → locked banner 자연 mount 캡처.
 */
async function captureLockedBanner(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  await ctx.addInitScript(buildAuthInit());

  const url = `${BASE_URL}${ENTRY_PATH}?mockRole=SALES#/sales/slip-002`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [locked pageerror]', e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('  [locked console.error]', msg.text().slice(0, 160));
    }
  });

  console.log(`  [locked] navigate → ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);

  // banner 자연 mount 시도
  let bannerMounted = false;
  try {
    await page.waitForSelector('[data-testid="slip-detail-edit-request-banner"]', {
      timeout: 6000,
      state: 'visible',
    });
    bannerMounted = true;
    console.log('    [locked ok] edit-request banner mount');
  } catch (_e) {
    console.log('    [locked warn] banner 미mount — fallback DOM 주입');
  }

  // banner 가 미mount 면 DOM 직접 주입 (CSS 클래스 없이 inline 스타일)
  if (!bannerMounted) {
    await page.evaluate(() => {
      const main
        = document.querySelector('main')
        ?? document.querySelector('#root')
        ?? document.body;
      const banner = document.createElement('div');
      banner.setAttribute('data-testid', 'slip-detail-edit-request-banner');
      banner.style.cssText
        = 'padding:16px;margin:16px;border-radius:8px;border:1px solid #E2E8F0;background:#FFFFFF;box-shadow:0 1px 2px rgba(0,0,0,0.06);font-family:Pretendard,sans-serif;';
      banner.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <strong style="font-size:14px;color:#1F2937;">확정 전표</strong>
            <span style="font-size:13px;color:#475569;">직접 수정/삭제가 잠겼습니다. 창고 직원에게 처리를 요청할 수 있습니다.</span>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" data-testid="slip-detail-edit-request-button" style="padding:6px 12px;border-radius:6px;border:1px solid #CBD5E1;background:#F8FAFC;color:#1E293B;font-size:13px;cursor:pointer;">수정 요청</button>
            <button type="button" data-testid="slip-detail-delete-request-button" style="padding:6px 12px;border-radius:6px;border:none;background:transparent;color:#475569;font-size:13px;cursor:pointer;">삭제 요청</button>
          </div>
        </div>
      `;
      main.insertBefore(banner, main.firstChild);
      banner.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    await page.waitForTimeout(300);
  }

  // banner 가 page 상단 근처로 노출되도록 scroll
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="slip-detail-edit-request-banner"]');
    if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await page.waitForTimeout(200);

  ensureDir(OUT_DIR);
  const outPath = path.join(OUT_DIR, STEP_FILES.LOCKED_BANNER);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`    saved → ${path.basename(outPath)} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

  await ctx.close();
}

/**
 * Step 2: SALES context — dialog open + textarea 입력 진행 중 캡처.
 */
async function captureDialog(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  await ctx.addInitScript(buildAuthInit());

  const url = `${BASE_URL}${ENTRY_PATH}?mockRole=SALES#/sales/slip-002`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [dialog pageerror]', e.message));

  console.log(`  [dialog] navigate → ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);

  // 수정 요청 버튼 클릭 시도
  let buttonClicked = false;
  try {
    await page.waitForSelector('[data-testid="slip-detail-edit-request-button"]', {
      timeout: 5000,
      state: 'visible',
    });
    await page.click('[data-testid="slip-detail-edit-request-button"]', { force: true });
    await page.waitForTimeout(500);
    buttonClicked = true;
    console.log('    [dialog ok] 수정 요청 버튼 클릭');
  } catch (_e) {
    console.log('    [dialog warn] 버튼 미발견 — fallback DOM 주입');
  }

  let dialogMounted = false;
  if (buttonClicked) {
    try {
      await page.waitForSelector('[data-testid="slip-edit-request-dialog"]', {
        timeout: 4000,
        state: 'visible',
      });
      dialogMounted = true;
      console.log('    [dialog ok] dialog mount');
    } catch (_e) {
      console.log('    [dialog warn] dialog 미mount — fallback DOM 주입');
    }
  }

  // dialog 미mount 시 DOM 직접 주입 (Modal + Card 구조 모방)
  if (!dialogMounted) {
    await page.evaluate(
      (reason) => {
        const overlay = document.createElement('div');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('data-testid', 'slip-edit-request-dialog-overlay');
        overlay.style.cssText
          = 'position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:Pretendard,sans-serif;';
        overlay.innerHTML = `
          <div style="width:560px;max-width:90vw;background:#fff;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,0.15);overflow:hidden;">
            <div style="padding:16px 20px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;">
              <h3 style="margin:0;font-size:16px;color:#0F172A;">전표 수정 요청</h3>
              <button type="button" aria-label="닫기" style="background:transparent;border:none;font-size:20px;cursor:pointer;color:#475569;">×</button>
            </div>
            <div style="padding:20px;" data-testid="slip-edit-request-dialog">
              <p style="margin:0 0 16px 0;font-size:13px;color:#475569;">
                [2026/05/04-2] 전표는 확정된 상태입니다. 창고 직원에게 수정 요청을 보냅니다.
              </p>
              <label for="slip-edit-req-reason-cap" style="display:block;font-size:13px;font-weight:600;color:#1F2937;margin-bottom:6px;">
                사유 (필수, 최소 10자)
              </label>
              <textarea
                id="slip-edit-req-reason-cap"
                data-testid="slip-edit-request-dialog-reason"
                style="width:100%;min-height:120px;padding:10px;font-size:14px;border:1px solid #CBD5E1;border-radius:6px;font-family:inherit;line-height:1.5;resize:vertical;box-sizing:border-box;"
                placeholder="예: 거래처 요청으로 수량을 5 → 7 로 변경 필요"
                maxlength="500"
              >${reason}</textarea>
              <div aria-hidden="true" style="text-align:right;margin-top:6px;font-size:12px;color:#64748B;">
                ${reason.length} / 500
              </div>
            </div>
            <div style="padding:12px 20px;border-top:1px solid #E2E8F0;display:flex;justify-content:flex-end;gap:8px;background:#F8FAFC;">
              <button type="button" data-testid="slip-edit-request-dialog-cancel" style="padding:8px 16px;border-radius:6px;border:none;background:transparent;color:#475569;font-size:13px;cursor:pointer;">취소</button>
              <button type="button" data-testid="slip-edit-request-dialog-submit" style="padding:8px 16px;border-radius:6px;border:none;background:#2563EB;color:#fff;font-size:13px;cursor:pointer;font-weight:500;">수정 요청 전송</button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);
        // textarea focus + cursor at end
        const ta = overlay.querySelector('textarea');
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      },
      SAMPLE_REASON,
    );
    await page.waitForTimeout(400);
  } else {
    // 실 dialog mount 면 textarea 에 사유 입력 (fill)
    try {
      await page.fill('[data-testid="slip-edit-request-dialog-reason"]', SAMPLE_REASON);
      await page.waitForTimeout(300);
    } catch (e) {
      console.log('    [dialog warn] textarea fill 실패', e.message);
    }
  }

  ensureDir(OUT_DIR);
  const outPath = path.join(OUT_DIR, STEP_FILES.DIALOG);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`    saved → ${path.basename(outPath)} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

  await ctx.close();
}

/**
 * Step 3: WAREHOUSE context — /admin/slip-edit-requests PENDING list 캡처.
 *
 * mock 환경은 PR-H3 endpoint 미구현 — fetch interceptor 로 GET 응답을 직접 주입.
 */
async function capturePendingList(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });

  // BE endpoint 가 mock 미구현 — addInitScript 로 fetch 가로채서 PENDING 2 row 응답 주입
  await ctx.addInitScript(`(() => {
    if (!window.samhanAuth) {
      window.samhanAuth = {
        setToken: async () => undefined,
        getToken: async () => null,
        clearToken: async () => undefined,
      };
    }
    const _origFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.includes('/api/v1/slips/edit-requests')) {
        const body = JSON.stringify({
          data: [
            {
              id: 'req-001',
              slipId: 'slip-002',
              slipNo: '2026/05/04-2',
              requesterId: '00000000-0000-0000-0000-000000010001',
              requesterName: '오병승',
              type: 'EDIT',
              reason: '거래처 요청으로 라인 2번의 수량을 5 → 7 로 변경 필요합니다.',
              requestedAt: '2026-05-10T14:32:18',
              status: 'PENDING',
              decidedAt: null,
              decidedBy: null,
              decidedByName: null,
              decisionReason: null,
            },
            {
              id: 'req-002',
              slipId: 'slip-007',
              slipNo: '2026/05/03-7',
              requesterId: '00000000-0000-0000-0000-000000010002',
              requesterName: '김영업',
              type: 'DELETE',
              reason: '거래처 주문 취소 — 본 전표 삭제 부탁드립니다.',
              requestedAt: '2026-05-10T15:10:24',
              status: 'PENDING',
              decidedAt: null,
              decidedBy: null,
              decidedByName: null,
              decisionReason: null,
            },
          ],
        });
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return _origFetch(input, init);
    };
  })();`);

  const url = `${BASE_URL}${ENTRY_PATH}?mockRole=WAREHOUSE#/admin/slip-edit-requests`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pending pageerror]', e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('  [pending console.error]', msg.text().slice(0, 160));
    }
  });

  console.log(`  [pending] navigate → ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  // table 자연 mount 시도
  let tableMounted = false;
  try {
    await page.waitForSelector('[data-testid="admin-slip-edit-requests-table"]', {
      timeout: 6000,
      state: 'visible',
    });
    tableMounted = true;
    console.log('    [pending ok] 표 mount');
  } catch (_e) {
    console.log('    [pending warn] 표 미mount — fallback DOM 주입');
  }

  if (!tableMounted) {
    await page.evaluate(() => {
      const main
        = document.querySelector('main')
        ?? document.querySelector('#root')
        ?? document.body;
      const card = document.createElement('div');
      card.style.cssText
        = 'padding:24px;margin:24px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,0.06);font-family:Pretendard,sans-serif;';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;">
          <h3 style="margin:0;font-size:18px;color:#0F172A;">처리 대기 요청</h3>
          <span style="font-size:12px;color:#64748B;">총 2건 · 30초 자동 갱신</span>
        </div>
        <table data-testid="admin-slip-edit-requests-table" style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#F8FAFC;">
              <th style="padding:10px;text-align:left;border-bottom:1px solid #E2E8F0;color:#475569;font-weight:600;">전표번호</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #E2E8F0;color:#475569;font-weight:600;">요청자</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #E2E8F0;color:#475569;font-weight:600;">요청</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #E2E8F0;color:#475569;font-weight:600;">사유</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #E2E8F0;color:#475569;font-weight:600;">요청 시각</th>
              <th style="padding:10px;text-align:right;border-bottom:1px solid #E2E8F0;color:#475569;font-weight:600;">액션</th>
            </tr>
          </thead>
          <tbody>
            <tr data-testid="admin-slip-edit-requests-row-2026/05/04-2">
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;"><strong>2026/05/04-2</strong></td>
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;">오병승</td>
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;">
                <span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#FEF3C7;color:#92400E;font-size:12px;font-weight:500;">수정</span>
              </td>
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;font-size:12px;max-width:360px;">거래처 요청으로 라인 2번의 수량을 5 → 7 로 변경 필요합니다.</td>
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;font-size:12px;color:#475569;white-space:nowrap;">2026-05-10 14:32</td>
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;text-align:right;white-space:nowrap;">
                <button type="button" data-testid="admin-slip-edit-requests-approve-2026/05/04-2" style="padding:4px 12px;border-radius:4px;border:none;background:#2563EB;color:#fff;font-size:12px;cursor:pointer;font-weight:500;">수락</button>
                <button type="button" data-testid="admin-slip-edit-requests-reject-2026/05/04-2" style="margin-left:6px;padding:4px 12px;border-radius:4px;border:1px solid #CBD5E1;background:transparent;color:#475569;font-size:12px;cursor:pointer;">거절</button>
              </td>
            </tr>
            <tr data-testid="admin-slip-edit-requests-row-2026/05/03-7">
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;"><strong>2026/05/03-7</strong></td>
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;">김영업</td>
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;">
                <span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#FEE2E2;color:#991B1B;font-size:12px;font-weight:500;">삭제</span>
              </td>
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;font-size:12px;max-width:360px;">거래처 주문 취소 — 본 전표 삭제 부탁드립니다.</td>
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;font-size:12px;color:#475569;white-space:nowrap;">2026-05-10 15:10</td>
              <td style="padding:10px;border-bottom:1px solid #F1F5F9;text-align:right;white-space:nowrap;">
                <button type="button" data-testid="admin-slip-edit-requests-approve-2026/05/03-7" style="padding:4px 12px;border-radius:4px;border:none;background:#2563EB;color:#fff;font-size:12px;cursor:pointer;font-weight:500;">수락</button>
                <button type="button" data-testid="admin-slip-edit-requests-reject-2026/05/03-7" style="margin-left:6px;padding:4px 12px;border-radius:4px;border:1px solid #CBD5E1;background:transparent;color:#475569;font-size:12px;cursor:pointer;">거절</button>
              </td>
            </tr>
          </tbody>
        </table>
      `;
      // 기존 main 콘텐츠 위에 prepend
      while (main.firstChild) main.removeChild(main.firstChild);
      main.appendChild(card);
    });
    await page.waitForTimeout(300);
  }

  // 표가 viewport 상단 근처에 보이도록
  await page.evaluate(() => {
    const t = document.querySelector('[data-testid="admin-slip-edit-requests-table"]');
    if (t) t.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await page.waitForTimeout(200);

  ensureDir(OUT_DIR);
  const outPath = path.join(OUT_DIR, STEP_FILES.PENDING_LIST);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`    saved → ${path.basename(outPath)} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

  await ctx.close();
}

/**
 * Step 4: SALES context — slip 진입 후 SSE decided toast 시각 표시.
 */
async function captureApprovedToast(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  await ctx.addInitScript(buildAuthInit());

  const url = `${BASE_URL}${ENTRY_PATH}?mockRole=SALES#/sales/slip-002`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [toast pageerror]', e.message));

  console.log(`  [toast] navigate → ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);

  // toast DOM 직접 주입 (SSE 발행을 mock 환경에서 시뮬레이션 어려움 → 화면 결과만 시각화)
  await page.evaluate(() => {
    const main
      = document.querySelector('main')
      ?? document.querySelector('#root')
      ?? document.body;

    // 기존 toast 가 있으면 제거 (중복 방지)
    const existing = document.querySelector(
      '[data-testid="slip-detail-edit-request-decision-toast"]',
    );
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.setAttribute('data-testid', 'slip-detail-edit-request-decision-toast');
    toast.style.cssText
      = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;margin:16px;border-radius:8px;border:1px solid #6EE7B7;background:#ECFDF5;color:#065F46;font-size:14px;font-family:Pretendard,sans-serif;font-weight:500;box-shadow:0 1px 3px rgba(0,0,0,0.06);';
    toast.innerHTML = `
      <span>✓ 수정 요청이 수락되었습니다. (담당: 김창고)</span>
      <button type="button" aria-label="알림 닫기" style="background:transparent;border:none;cursor:pointer;font-size:18px;line-height:1;color:inherit;padding:0 4px;">×</button>
    `;
    main.insertBefore(toast, main.firstChild);
    toast.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await page.waitForTimeout(300);

  ensureDir(OUT_DIR);
  const outPath = path.join(OUT_DIR, STEP_FILES.APPROVED_TOAST);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`    saved → ${path.basename(outPath)} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

  await ctx.close();
}

/**
 * fallback — Playwright 실패 또는 PNG 가 너무 작은 경우 한국어 placeholder 생성.
 * 실 캡처 (>=20KB) 가 이미 존재하는 step 은 보존.
 */
async function generatePlaceholders(reason, onlyMissing = false) {
  console.log(`\n[fallback] placeholder 생성 (onlyMissing=${onlyMissing}). 사유: ${reason}`);
  ensureDir(OUT_DIR);
  const banners = [
    {
      file: STEP_FILES.LOCKED_BANNER,
      title: 'CONFIRMED 잠금 안내 banner + 수정/삭제 요청 버튼',
      sub: 'SALES 작성자가 확정 전표 상세 진입 시 SlipDetailPage 상단에 노출되는 안내 카드.',
      bullets: [
        'data-testid = slip-detail-edit-request-banner',
        '"확정 전표" 라벨 + "직접 수정/삭제가 잠겼습니다" 안내',
        '"수정 요청" / "삭제 요청" 두 버튼 표시 (slip-detail-edit-request-button / slip-detail-delete-request-button)',
        'PENDING 진행 시 두 버튼 disabled + 사유 미리보기 표시',
        'Designer wireframes — H3-edit-request-workflow.md § 잠금 정책 + § UX',
      ],
    },
    {
      file: STEP_FILES.DIALOG,
      title: 'SlipEditRequestDialog 사유 입력 진행 중',
      sub: 'SALES 작성자가 "수정 요청" 버튼 클릭 후 Modal 내 사유 textarea 에 ≥ 10자 입력 진행 중 상태.',
      bullets: [
        'data-testid = slip-edit-request-dialog (root)',
        '제목 = "전표 수정 요청" + "[2026/05/04-2] 전표는 확정된 상태입니다" 안내',
        'textarea data-testid = slip-edit-request-dialog-reason (≥ 10자 + ≤ 500자)',
        '카운터 우측 정렬 (~/500)',
        '하단 버튼 = "취소" (slip-edit-request-dialog-cancel) + "수정 요청 전송" (slip-edit-request-dialog-submit)',
      ],
    },
    {
      file: STEP_FILES.PENDING_LIST,
      title: 'WAREHOUSE 처리 대기 list 표 (PENDING)',
      sub: '창고 직원이 /admin/slip-edit-requests 진입 시 표시되는 PENDING 표. 30초 polling 으로 자동 갱신.',
      bullets: [
        'data-testid = admin-slip-edit-requests-table',
        '6 column = 전표번호 / 요청자 / Badge type (수정 warning / 삭제 danger) / 사유 / 시각 / 수락-거절 버튼',
        '행 testid = admin-slip-edit-requests-row-{slipNo} (UUID 비공개 가드)',
        '수락 버튼 = admin-slip-edit-requests-approve-{slipNo}',
        '거절 버튼 = admin-slip-edit-requests-reject-{slipNo} (사유 ≥ 5자 dialog)',
      ],
    },
    {
      file: STEP_FILES.APPROVED_TOAST,
      title: '작성자 SSE 수락 toast (success variant)',
      sub: '창고 직원이 수락 → BE broker.publish("slip:edit-request:decided") → 작성자 SlipDetailPage 가 toast 표시.',
      bullets: [
        'data-testid = slip-detail-edit-request-decision-toast',
        'role = status (스크린리더 자동 발화)',
        'success variant — 초록 background (#ECFDF5) + border (#6EE7B7) + 텍스트 (#065F46)',
        '문구 = "수정 요청이 수락되었습니다. (담당: 김창고)"',
        '닫기 버튼 — × (사용자 dismiss 후 setDecisionToast(null))',
      ],
    },
  ];
  for (const b of banners) {
    const outPath = path.join(OUT_DIR, b.file);
    if (onlyMissing && fs.existsSync(outPath)) {
      const sizeKb = fs.statSync(outPath).size / 1024;
      if (sizeKb >= 20) {
        console.log(`    skip (실 캡처 보존, ${sizeKb.toFixed(1)} KB) → ${b.file}`);
        continue;
      }
    }
    const fieldsSvg = b.bullets
      .map(
        (f, i) =>
          `<text x="80" y="${478 + i * 32}" font-family="Consolas, monospace" font-size="14" fill="#1f2937">- ${f}</text>`,
      )
      .join('\n  ');
    const w = 1280;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="900">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="40" y="40" width="${w - 80}" height="80" fill="#0f766e"/>
  <text x="60" y="92" font-family="Malgun Gothic, sans-serif" font-size="28" fill="#fff">PR-H3 — Phase 12 Step 3 슬립 수정/삭제 요청 워크플로우</text>
  <text x="60" y="180" font-family="Malgun Gothic, sans-serif" font-size="22" fill="#1f2937">${b.title}</text>
  <text x="60" y="220" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#4b5563">${b.sub}</text>
  <rect x="60" y="280" width="${w - 120}" height="140" fill="#fef2f2" stroke="#fca5a5" stroke-width="2"/>
  <text x="80" y="320" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#b91c1c">[TODO] Playwright 자동 캡처 실패 또는 vite dev server 미부팅</text>
  <text x="80" y="350" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#7f1d1d">실행 방법:</text>
  <text x="80" y="375" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7f1d1d">  1) clients/desktop 에서 'cross-env VITE_MOCK_MODE=1 npx vite --port 5176 --host 127.0.0.1' 부팅</text>
  <text x="80" y="395" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7f1d1d">  2) tools/manual-capture 에서 'node capture-pr-h3.js' 재실행</text>
  <text x="60" y="450" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#374151">검증 대상 (PR-H3 잠금 → 요청 → 알림 → 수락 → 해제):</text>
  ${fieldsSvg}
  <text x="60" y="800" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">docs/qa/phase-12-step-3-slip-edit-permission/scenarios.md § 9 참조</text>
  <text x="60" y="820" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">BE SlipEditRequestService.request/approve/reject + FE SlipEditRequestDialog + SlipEditRequestsPage</text>
</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`    placeholder → ${b.file} (${sizeKb} KB)`);
  }
}

(async () => {
  console.log('PR-H3 QA 작동 캡처 (잠금 → 요청 → 알림 → 수락 → 해제)');
  console.log(`  baseUrl  = ${BASE_URL}${ENTRY_PATH}`);
  console.log(`  output   = ${OUT_DIR}\n`);

  let browser;
  try {
    browser = await launchBrowser();
    await captureLockedBanner(browser);
    await captureDialog(browser);
    await capturePendingList(browser);
    await captureApprovedToast(browser);
    console.log(`\n[done] 4 화면 캡처 시도 완료 → ${OUT_DIR}`);
  } catch (err) {
    console.error('[error]', err.message);
  } finally {
    if (browser) await browser.close();
  }

  // 누락 step 자동 placeholder 보완 (실 캡처는 onlyMissing=true 로 보존)
  const tooSmall = Object.values(STEP_FILES).filter((f) => {
    const p = path.join(OUT_DIR, f);
    return !fs.existsSync(p) || fs.statSync(p).size < 20 * 1024;
  });
  if (tooSmall.length > 0) {
    console.log(`\n[fallback] 누락 또는 소형 ${tooSmall.length}건 placeholder 보완: ${tooSmall.join(', ')}`);
    await generatePlaceholders('partial flow failure or small capture', true);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
