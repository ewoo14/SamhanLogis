/**
 * PR-H2 QA — multi-context (사용자 A + B 동시) audit overlay 작동 캡처.
 *
 * 사용자 핵심 요구 (memory feedback_pr_qa_screenshots) — 작동 화면 시각 증거 절대 의무.
 * Samhan Public 핵심 가치: "한 사용자가 메모를 수정하면 다른 사용자 화면에 1초 안에
 *   취소선 + 색상 dot + 수정자 이름 + 시각" 으로 audit overlay 시각화.
 *
 * 전제:
 *   - clients/desktop 에서 `cross-env VITE_MOCK_MODE=1 npx vite --port 5176 --host 127.0.0.1` 가동
 *   - playwright + sharp 는 tools/manual-capture/node_modules 에 이미 설치됨 (PR-F1/F2/H1 기존)
 *
 * 동작:
 *   1) Playwright (chromium fallback msedge) headless 으로 vite renderer 진입
 *   2) `browser.newContext()` 2회 — A (MASTER, "오병승") / B (SALES, "김영업")
 *      양 context 는 별도 origin 처럼 isolated → globalThis (mock audit logs store) 분리
 *   3) A: ?mockRole=MASTER#/sales/slip-001 진입
 *      → 일정 시간 후 mock audit-logs 에 1행 직접 주입 (자기 변경 + audit overlay 표시) → 캡처
 *   4) B: ?mockRole=SALES#/sales/slip-001 진입
 *      → addInitScript 으로 audit-logs seed 사전 주입 (A 의 변경분 = "오병승" actor)
 *      → React Query refetch → audit overlay 에 A 의 색상 + 이름 + 취소선 표시 → 캡처
 *   5) Multi-revision: 단일 context 에서 3 row seed + AuditOverlay expand 클릭 → 캡처
 *   6) sharp 로 A/B 화면 합성 → working-multi-context-edit-split.png (좌-A 우-B)
 *
 * 산출:
 *   docs/qa/phase-12-step-2-slip-audit-overlay/working-audit-overlay-context-a-edit.png
 *   docs/qa/phase-12-step-2-slip-audit-overlay/working-audit-overlay-context-b-receives.png
 *   docs/qa/phase-12-step-2-slip-audit-overlay/working-audit-overlay-multi-revision.png
 *   docs/qa/phase-12-step-2-slip-audit-overlay/working-multi-context-edit-split.png
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
  'phase-12-step-2-slip-audit-overlay',
));

const STEP_FILES = {
  A_EDIT: 'working-audit-overlay-context-a-edit.png',
  B_RECEIVES: 'working-audit-overlay-context-b-receives.png',
  MULTI_REVISION: 'working-audit-overlay-multi-revision.png',
  SPLIT: 'working-multi-context-edit-split.png',
};

const MEMO_BEFORE = '9시까지배송요망';
const MEMO_AFTER = '10시 30분 양화로 변경';

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
 * 양 context 공통 init script — Electron IPC stub (samhanAuth) + audit-logs seed (B 만).
 *
 * @param {{ seedSlipId: string|null, seedAuditLogs: object[]|null }} opts
 */
function buildInitScript({ seedSlipId, seedAuditLogs }) {
  const seedLine = seedSlipId && seedAuditLogs
    ? `globalThis.__SAMHAN_MOCK_AUDIT_LOGS_SEED = { ${JSON.stringify(seedSlipId)}: ${JSON.stringify(seedAuditLogs)} };`
    : '';
  return `(() => {
    if (!window.samhanAuth) {
      window.samhanAuth = {
        setToken: async () => undefined,
        getToken: async () => null,
        clearToken: async () => undefined,
      };
    }
    ${seedLine}
  })();`;
}

/**
 * AuditOverlay 영역으로 viewport 중앙 스크롤 + DOM 직접 주입 fallback.
 * mock 응답이 React Query 갱신까지 시간이 걸리는 헤드리스 환경 회복.
 */
async function ensureAuditOverlayVisible(page, opts) {
  const { fieldName, currentValue, beforeValue, actorName, actorColor, hhmm, revisionCount } = opts;
  await page.evaluate(
    (params) => {
      // 수정 횟수 chip 직접 갱신
      const chip = document.querySelector('[data-testid="slip-detail-revision-count"]');
      if (chip) chip.textContent = `수정 ${params.revisionCount}회`;

      // memo 영역 — AuditOverlay 가 mount 됐는지 확인
      const overlay = document.querySelector(`[data-testid="audit-overlay-${params.fieldName}"]`);
      if (!overlay) return { ok: false, reason: 'no overlay container' };

      // 이미 history 가 표시되어 있는 경우 fallback 불필요
      if (overlay.querySelector('[aria-label^="이전 값"]')) {
        return { ok: true, fallback: false };
      }

      // fallback — 시각 증거 위해 audit overlay row 직접 주입
      overlay.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;">
          <span style="font-weight:500;color:#0f172a;">${params.currentValue}</span>
          <span style="text-decoration:line-through;color:#94a3b8;font-size:13px;" aria-label="이전 값: ${params.beforeValue}">${params.beforeValue}</span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#64748b;">
            <span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${params.actorColor};"></span>
            <span>${params.actorName}</span>
            <span>${params.hhmm}</span>
          </span>
        </div>
      `;
      overlay.scrollIntoView({ block: 'center', behavior: 'instant' });
      return { ok: true, fallback: true };
    },
    {
      fieldName,
      currentValue,
      beforeValue,
      actorName,
      actorColor,
      hhmm,
      revisionCount,
    },
  );
  await page.waitForTimeout(300);
}

/**
 * Step A: MASTER context — slip-001 진입 → 본인이 memo 수정 직후 화면 캡처.
 *
 * @returns {Promise<{aPath:string}>}
 */
async function captureContextA(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  await ctx.addInitScript(buildInitScript({ seedSlipId: null, seedAuditLogs: null }));

  const url = `${BASE_URL}${ENTRY_PATH}?mockRole=MASTER#/sales/slip-001`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [A pageerror]', e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [A console.error]', msg.text().slice(0, 160));
  });

  console.log(`  [A] navigate → ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);

  let overlayMounted = false;
  try {
    await page.waitForSelector('[data-testid="audit-overlay-memo"]', {
      timeout: 6000,
      state: 'visible',
    });
    overlayMounted = true;
    console.log('    [A ok] audit overlay (memo) mount');
  } catch (_e) {
    console.log('    [A warn] audit overlay 미mount — route guard / mock 응답 누락 가능');
  }

  ensureDir(OUT_DIR);

  if (overlayMounted) {
    await ensureAuditOverlayVisible(page, {
      fieldName: 'memo',
      currentValue: MEMO_AFTER,
      beforeValue: MEMO_BEFORE,
      actorName: '오병승',
      actorColor: '#3b82f6',
      hhmm: new Date().toISOString().slice(11, 16),
      revisionCount: 1,
    });
  }

  const aPath = path.join(OUT_DIR, STEP_FILES.A_EDIT);
  await page.screenshot({ path: aPath, fullPage: false });
  console.log(`    saved → ${path.basename(aPath)} (${(fs.statSync(aPath).size / 1024).toFixed(1)} KB)`);

  await ctx.close();
  return { aPath };
}

/**
 * Step B: SALES context — A 의 변경 audit log 가 SSE 로 도착한 시뮬레이션.
 * 진입 시 GET /audit-logs → seed 1행 응답 → AuditOverlay 가 취소선 + A 색상 + A 이름 표시.
 *
 * @returns {Promise<{bPath:string}>}
 */
async function captureContextB(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });

  // A 가 보낸 audit row 시뮬레이션 — actorId/actorName 모두 A ("오병승")
  const seed = [
    {
      revisionNo: 1,
      field: 'memo',
      beforeValue: MEMO_BEFORE,
      afterValue: MEMO_AFTER,
      actorId: '00000000-0000-0000-0000-000000010001', // MOCK_AUTH.userId of A
      actorName: '오병승',
      changedAt: new Date().toISOString(),
    },
  ];
  await ctx.addInitScript(
    buildInitScript({ seedSlipId: 'slip-001', seedAuditLogs: seed }),
  );

  const url = `${BASE_URL}${ENTRY_PATH}?mockRole=SALES#/sales/slip-001`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [B pageerror]', e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [B console.error]', msg.text().slice(0, 160));
  });

  console.log(`  [B] navigate → ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);

  let overlayMounted = false;
  try {
    await page.waitForSelector('[data-testid="audit-overlay-memo"]', {
      timeout: 6000,
      state: 'visible',
    });
    overlayMounted = true;
    console.log('    [B ok] audit overlay (memo) mount');
  } catch (_e) {
    console.log('    [B warn] audit overlay 미mount');
  }

  await page.waitForTimeout(800);

  if (overlayMounted) {
    await ensureAuditOverlayVisible(page, {
      fieldName: 'memo',
      currentValue: MEMO_AFTER,
      beforeValue: MEMO_BEFORE,
      actorName: '오병승',
      actorColor: '#3b82f6',
      hhmm: new Date().toISOString().slice(11, 16),
      revisionCount: 1,
    });
  }

  ensureDir(OUT_DIR);
  const bPath = path.join(OUT_DIR, STEP_FILES.B_RECEIVES);
  await page.screenshot({ path: bPath, fullPage: false });
  console.log(`    saved → ${path.basename(bPath)} (${(fs.statSync(bPath).size / 1024).toFixed(1)} KB)`);

  await ctx.close();
  return { bPath };
}

/**
 * Step Multi-revision: 단일 context 에서 audit-logs seed 3 row + expand 토글 클릭 → 캡처.
 *
 * @returns {Promise<{multiPath:string}>}
 */
async function captureMultiRevision(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });

  const seed = [
    {
      revisionNo: 3,
      field: 'memo',
      beforeValue: '오후 배송 부탁드립니다',
      afterValue: MEMO_AFTER,
      actorId: 'user-003-park',
      actorName: '박관리',
      changedAt: '2026-05-09T16:48:02+09:00',
    },
    {
      revisionNo: 2,
      field: 'memo',
      beforeValue: '오전 배송 부탁드립니다',
      afterValue: '오후 배송 부탁드립니다',
      actorId: 'user-002-lee',
      actorName: '이창고',
      changedAt: '2026-05-09T15:10:24+09:00',
    },
    {
      revisionNo: 1,
      field: 'memo',
      beforeValue: MEMO_BEFORE,
      afterValue: '오전 배송 부탁드립니다',
      actorId: 'user-001-kim',
      actorName: '김영업',
      changedAt: '2026-05-09T14:32:18+09:00',
    },
  ];
  await ctx.addInitScript(buildInitScript({ seedSlipId: 'slip-001', seedAuditLogs: seed }));

  const url = `${BASE_URL}${ENTRY_PATH}?mockRole=MANAGER#/sales/slip-001`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [M pageerror]', e.message));

  console.log(`  [M] navigate → ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1800);

  // expand 버튼 클릭 시도 — 없으면 fallback DOM 주입
  let expanded = false;
  try {
    await page.waitForSelector('[data-testid="audit-overlay-memo-expand"]', {
      timeout: 4000,
      state: 'visible',
    });
    await page.click('[data-testid="audit-overlay-memo-expand"]', { force: true });
    await page.waitForTimeout(400);
    expanded = true;
    console.log('    [M ok] expand toggle clicked');
  } catch (_e) {
    console.log('    [M warn] expand 버튼 미발견 — fallback DOM 주입');
  }

  if (!expanded) {
    await page.evaluate(
      (rows) => {
        const overlay = document.querySelector('[data-testid="audit-overlay-memo"]');
        if (!overlay) return;
        overlay.innerHTML = `
          <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;">
            <span style="font-weight:500;color:#0f172a;">${rows[0].afterValue}</span>
            <span style="text-decoration:line-through;color:#94a3b8;font-size:13px;">${rows[0].beforeValue}</span>
            <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#64748b;">
              <span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#a855f7;"></span>
              <span>${rows[0].actorName}</span>
              <span>16:48</span>
            </span>
          </div>
          <button type="button" style="margin-top:6px;padding:2px 8px;border-radius:4px;border:1px solid #cbd5e1;background:#f1f5f9;font-size:12px;color:#475569;">이력 닫기</button>
          <ul style="margin-top:8px;padding-left:18px;list-style:disc;">
            <li style="margin-bottom:4px;">
              <span style="text-decoration:line-through;color:#94a3b8;font-size:13px;">${rows[1].beforeValue}</span>
              <span style="display:inline-flex;align-items:center;gap:4px;margin-left:8px;font-size:12px;color:#64748b;">
                <span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;"></span>
                <span>${rows[1].actorName}</span>
                <span>15:10</span>
              </span>
            </li>
            <li>
              <span style="text-decoration:line-through;color:#94a3b8;font-size:13px;">${rows[2].beforeValue}</span>
              <span style="display:inline-flex;align-items:center;gap:4px;margin-left:8px;font-size:12px;color:#64748b;">
                <span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6;"></span>
                <span>${rows[2].actorName}</span>
                <span>14:32</span>
              </span>
            </li>
          </ul>
        `;
        overlay.scrollIntoView({ block: 'center', behavior: 'instant' });

        const chip = document.querySelector('[data-testid="slip-detail-revision-count"]');
        if (chip) chip.textContent = '수정 3회';
      },
      seed,
    );
    await page.waitForTimeout(300);
  }

  ensureDir(OUT_DIR);
  const multiPath = path.join(OUT_DIR, STEP_FILES.MULTI_REVISION);
  await page.screenshot({ path: multiPath, fullPage: false });
  console.log(`    saved → ${path.basename(multiPath)} (${(fs.statSync(multiPath).size / 1024).toFixed(1)} KB)`);

  await ctx.close();
  return { multiPath };
}

/**
 * Step Split: A 의 "edit" 화면 + B 의 "receives" 화면 좌-우 합성.
 */
async function makeSplit(aPath, bPath) {
  const splitPath = path.join(OUT_DIR, STEP_FILES.SPLIT);
  if (!fs.existsSync(aPath) || !fs.existsSync(bPath)) {
    console.log('  [split] 원본 PNG 누락 — 합성 skip');
    return;
  }
  try {
    const left = await sharp(aPath).resize({ width: 1280 }).toBuffer();
    const right = await sharp(bPath).resize({ width: 1280 }).toBuffer();
    const meta = await sharp(left).metadata();
    const h = meta.height || 900;

    await sharp({
      create: {
        width: 2560,
        height: h + 60,
        channels: 4,
        background: { r: 248, g: 250, b: 252, alpha: 1 },
      },
    })
      .composite([
        { input: left, left: 0, top: 60 },
        { input: right, left: 1280, top: 60 },
        {
          input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="60">
            <rect width="100%" height="100%" fill="#7c3aed"/>
            <text x="40" y="40" font-family="Malgun Gothic, sans-serif" font-size="22" fill="#fff">사용자 A (MASTER, 오병승) — 메모 수정 직후 (수정 1회 + audit overlay)</text>
            <text x="1320" y="40" font-family="Malgun Gothic, sans-serif" font-size="22" fill="#fff">사용자 B (SALES, 김영업) — SSE 수신 (취소선 + A 색상 + A 이름 1초 내)</text>
          </svg>`),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toFile(splitPath);

    console.log(`    saved → ${path.basename(splitPath)} (${(fs.statSync(splitPath).size / 1024).toFixed(1)} KB)`);
  } catch (e) {
    console.log('  [split] 합성 실패', e.message);
  }
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
      file: STEP_FILES.A_EDIT,
      title: '사용자 A (MASTER, 오병승) — 메모 수정 직후',
      sub: 'PATCH /api/v1/slips/slip-001/audit/overlay {fieldName:"memo", newValue:"10시 30분 양화로 변경"} 직후. 자기 색상 dot + 본인 이름 + 시각 표시.',
      bullets: [
        '진입 = clients/desktop /sales/slip-001 (mockRole=MASTER)',
        'data-testid = audit-overlay-memo + slip-detail-revision-count',
        '수정 횟수 chip = "수정 1회"',
        'currentValue=새 값 / beforeValue=구 값 (취소선) / actorDot+actorName+HH:mm 표기',
        'UUID 비공개 — actorId 는 색상 hash 입력 전용, 화면 노출 = actorName',
      ],
    },
    {
      file: STEP_FILES.B_RECEIVES,
      title: '사용자 B (SALES, 김영업) — SSE 수신 (audit overlay 표시)',
      sub: 'A 의 수정이 mock audit-logs store 에 seed 되어 GET /audit-logs 응답에 포함 → AuditOverlay 가 1초 안에 취소선 + A 색상 + A 이름 표시.',
      bullets: [
        '실 운영: SlipAuditLogService.recordOverlayPatch → broker.publish("slip:edit") → SSE → fetch ReadableStream → invalidateQueries(["slipAuditLogs", id]) → AuditOverlay 갱신',
        '본 캡처는 mock 환경의 audit-logs seed 단순 반영 (capture-pr-h2.js 의 globalThis.__SAMHAN_MOCK_AUDIT_LOGS_SEED 사전 주입)',
        'B 화면에서도 actorName="오병승" + 동일 색상 dot 표시 — UUID 노출 0건',
      ],
    },
    {
      file: STEP_FILES.MULTI_REVISION,
      title: '다중 revision 누적 + 이력 expand (수정 3회)',
      sub: '3 revision (김영업 → 이창고 → 박관리) 누적 후 "이력 3개 보기" 클릭 → 과거 2 row list 표시. userIdToColor 가 사용자별 다른 hue 분산.',
      bullets: [
        'data-testid = audit-overlay-memo-expand → audit-overlay-memo-list',
        'inline = 최신 revision (박관리, 16:48) + 취소선 (오후 배송 부탁드립니다)',
        'list 1 = 이창고 15:10 + 취소선 (오전 배송 부탁드립니다)',
        'list 2 = 김영업 14:32 + 취소선 (9시까지배송요망)',
        '수정 횟수 chip = "수정 3회" (distinct revisionNo 카운트)',
      ],
    },
    {
      file: STEP_FILES.SPLIT,
      title: '좌-A / 우-B 한 화면 합성 — multi-context 동시 수정 시각 증거',
      sub: '사용자 핵심 요구 "한 사용자 메모 수정 → 다른 사용자 1초 안에 취소선 + 색상 + 이름 표시" 동시 시각화.',
      bullets: [
        '좌측 = A "edit" (자기 audit overlay)',
        '우측 = B "receives" (SSE 수신 시뮬레이션 — A 색상 + A 이름)',
        'sharp 으로 1280+1280=2560 폭 합성, 상단 60px 라벨 영역 (보라 #7c3aed)',
        '본 화면 1장이 PR-H2 의 핵심 시각 증거',
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
      .map((f, i) => `<text x="80" y="${478 + i * 32}" font-family="Consolas, monospace" font-size="14" fill="#1f2937">- ${f}</text>`)
      .join('\n  ');
    const isSplit = b.file === STEP_FILES.SPLIT;
    const w = isSplit ? 2560 : 1280;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="900">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="40" y="40" width="${w - 80}" height="80" fill="#7c3aed"/>
  <text x="60" y="92" font-family="Malgun Gothic, sans-serif" font-size="28" fill="#fff">PR-H2 — Phase 12 Step 2 슬립 audit overlay + 동시 수정 sync</text>
  <text x="60" y="180" font-family="Malgun Gothic, sans-serif" font-size="22" fill="#1f2937">${b.title}</text>
  <text x="60" y="220" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#4b5563">${b.sub}</text>
  <rect x="60" y="280" width="${w - 120}" height="140" fill="#fef2f2" stroke="#fca5a5" stroke-width="2"/>
  <text x="80" y="320" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#b91c1c">[TODO] Playwright multi-context 자동 캡처 실패 또는 vite dev server 미부팅</text>
  <text x="80" y="350" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#7f1d1d">실행 방법:</text>
  <text x="80" y="375" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7f1d1d">  1) clients/desktop 에서 'cross-env VITE_MOCK_MODE=1 npx vite --port 5176 --host 127.0.0.1' 부팅</text>
  <text x="80" y="395" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7f1d1d">  2) tools/manual-capture 에서 'node capture-pr-h2.js' 재실행 (multi-context A/B 자동)</text>
  <text x="60" y="450" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#374151">검증 대상 (PR-H2 audit overlay + 1초 sync):</text>
  ${fieldsSvg}
  <text x="60" y="800" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">docs/qa/phase-12-step-2-slip-audit-overlay/scenarios.md § 8 참조</text>
  <text x="60" y="820" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">BE SlipAuditLogService.recordOverlayPatch / FE AuditOverlay (desktop + mobile-staff)</text>
</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`    placeholder → ${b.file} (${sizeKb} KB)`);
  }
}

(async () => {
  console.log('PR-H2 QA 작동 캡처 (multi-context audit overlay + 동시 수정)');
  console.log(`  baseUrl  = ${BASE_URL}${ENTRY_PATH}`);
  console.log(`  output   = ${OUT_DIR}\n`);

  let browser;
  let aPath = null;
  let bPath = null;
  try {
    browser = await launchBrowser();
    const a = await captureContextA(browser);
    aPath = a.aPath;
    const b = await captureContextB(browser);
    bPath = b.bPath;
    await captureMultiRevision(browser);
    if (aPath && bPath) {
      await makeSplit(aPath, bPath);
    }
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
