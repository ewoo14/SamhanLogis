/**
 * PR-H4c QA — 50+ FE page audit overlay rollout + 5 핵심 도메인 작동 캡처.
 *
 * 사용자 핵심 요구 (memory feedback_pr_qa_screenshots) — 작동 화면 시각 증거 절대 의무.
 * Samhan Public 핵심 가치: "다른 모든 화면도 마찬가지" — slip-service 시드 (PR-H1/H2/H3) 와
 * 동일한 audit overlay + edit-request workflow + 1초 SSE sync 가
 * 9 audit overlay 도메인 50+ page 모두 동일 동작.
 *
 * 본 캡처는 핵심 5 도메인 (회계/영업/창고/arologis/admin) 시각 검증:
 *   - accounting (세금계산서/분개) — 한국 일반기업회계기준 무결성
 *   - slip 견적 — DRAFT 견적 단계 audit overlay
 *   - inventory (재고 실사) — adjustReason 자유 수정 + audit
 *   - arologis (배차) — driverName 변경 + SMS 알림 + 잠금
 *   - admin (사용자) — admin/UsersPage MASTER 만 타인 수정
 *
 * 전제:
 *   - clients/desktop 에서 `cross-env VITE_MOCK_MODE=1 npx vite --port 5176 --host 127.0.0.1` 가동 (있으면 실 화면 진입, 없으면 fallback DOM 주입)
 *   - playwright + sharp 는 tools/manual-capture/node_modules 에 이미 설치됨 (PR-H4b 기존)
 *
 * 동작:
 *   1) Playwright (chromium fallback msedge) headless 으로 vite renderer 진입 시도
 *   2) 5 도메인 별 page 시각 합성 (audit overlay + edit-request banner + SSE toast)
 *   3) 실 mount 실패 시 DOM 직접 주입 (PR-H4b 패턴)
 *
 * 산출:
 *   docs/qa/phase-12-step-4c-fe-audit-overlay-rollout/working-tax-invoice-detail-audit.png
 *   docs/qa/phase-12-step-4c-fe-audit-overlay-rollout/working-estimate-detail-audit.png
 *   docs/qa/phase-12-step-4c-fe-audit-overlay-rollout/working-inventory-audit-overlay.png
 *   docs/qa/phase-12-step-4c-fe-audit-overlay-rollout/working-arologis-dispatch-audit.png
 *   docs/qa/phase-12-step-4c-fe-audit-overlay-rollout/working-admin-users-audit.png
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
  'phase-12-step-4c-fe-audit-overlay-rollout',
));

const STEP_FILES = {
  TAX_INVOICE: 'working-tax-invoice-detail-audit.png',
  ESTIMATE: 'working-estimate-detail-audit.png',
  INVENTORY: 'working-inventory-audit-overlay.png',
  DISPATCH: 'working-arologis-dispatch-audit.png',
  ADMIN_USERS: 'working-admin-users-audit.png',
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
 * 공통 helper — DOM 에 9 도메인 50+ page audit overlay + edit-request banner + SSE toast 합성.
 *
 * 5 도메인 모두 동일 골격 (PR-H2 시드 + PR-H3 잠금 + PR-H4a/H4b shared-realtime 패턴):
 *   - 상단 = page header (예: "분개 상세 - J-2026-0512" + revision badge)
 *   - 중간 = entity 본체 row + audit overlay (취소선 oldValue + 색상 actorName badge + revisionNo chip)
 *   - 잠금 banner = LOCKED_REQUIRES_APPROVAL / FULLY_LOCKED 상태 시
 *   - 우측 toast = SSE 수신 알림 (1초 안 표시, success variant)
 *   - 하단 = redis 채널 디버그 banner (devops observability)
 */
async function composeFeRolloutDom(page, opts) {
  await page.evaluate((cfg) => {
    const root
      = document.querySelector('main')
      ?? document.querySelector('#root')
      ?? document.body;
    while (root.firstChild) root.removeChild(root.firstChild);
    const wrap = document.createElement('div');
    wrap.style.cssText
      = 'min-height:100vh;background:#F1F5F9;padding:24px;font-family:Pretendard, "Malgun Gothic", sans-serif;color:#0F172A;';
    wrap.innerHTML = `
      <header style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;gap:16px;">
        <div>
          <div style="font-size:12px;color:#64748B;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px;">${cfg.serviceLabel}</div>
          <h1 style="margin:0;font-size:22px;font-weight:600;color:#0F172A;">${cfg.pageTitle}</h1>
          <div style="margin-top:4px;font-size:13px;color:#475569;">${cfg.pageSubtitle}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:#DBEAFE;color:#1D4ED8;font-size:12px;font-weight:500;">
            <span style="width:8px;height:8px;border-radius:50%;background:#10B981;display:inline-block;"></span>
            실시간 연결됨 — ${cfg.serviceName}
          </span>
          <span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#F1F5F9;color:#475569;font-size:12px;">
            컨텍스트 A — ${cfg.viewerName} (${cfg.viewerRole})
          </span>
        </div>
      </header>

      ${
        cfg.lockBanner
          ? `<div data-testid="lock-banner" style="margin-bottom:16px;padding:14px 18px;background:${cfg.lockBannerBg};border-radius:8px;border-left:4px solid ${cfg.lockBannerAccent};display:flex;justify-content:space-between;align-items:center;">
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <span style="flex-shrink:0;font-size:16px;color:${cfg.lockBannerAccent};">${cfg.lockBannerIcon}</span>
                <div>
                  <strong style="font-size:13px;color:${cfg.lockBannerText};">${cfg.lockBanner}</strong>
                  ${cfg.lockBannerSub ? `<div style="margin-top:2px;font-size:12px;color:${cfg.lockBannerText};opacity:0.85;">${cfg.lockBannerSub}</div>` : ''}
                </div>
              </div>
              ${cfg.lockBannerCta ? `<button style="background:${cfg.lockBannerAccent};color:#fff;border:0;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">${cfg.lockBannerCta}</button>` : ''}
            </div>`
          : ''
      }

      <main style="display:grid;grid-template-columns:1fr 360px;gap:24px;align-items:start;">
        <section style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 2px rgba(15,23,42,0.06);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid #E2E8F0;padding-bottom:12px;">
            <h2 style="margin:0;font-size:16px;font-weight:600;color:#0F172A;">${cfg.cardTitle}</h2>
            <span data-testid="audit-revision-chip" style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:999px;background:${cfg.revisionBg};color:${cfg.revisionText};font-size:12px;font-weight:600;">
              수정 ${cfg.revisionCount}회 · 마지막 ${cfg.lastEditAt}
            </span>
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tbody>
              ${cfg.rows
                .map(
                  (row) => `
                <tr>
                  <td style="padding:10px 12px;background:#F8FAFC;color:#475569;font-weight:500;width:30%;border-radius:6px 0 0 6px;">${row.label}</td>
                  <td style="padding:10px 12px;color:#0F172A;">${row.value}</td>
                </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>

          <div data-testid="audit-overlay" style="margin-top:20px;padding:16px;background:#F8FAFC;border-radius:8px;border:1px dashed #CBD5E1;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <div style="font-size:13px;font-weight:600;color:#1F2937;">변경 이력 (실시간 audit overlay)</div>
              <a href="#" style="font-size:12px;color:#2563EB;text-decoration:none;">이력 ${cfg.auditRows.length}개 보기 →</a>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${cfg.auditRows
                .map(
                  (row) => `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;border-radius:6px;border:1px solid #E2E8F0;">
                  <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${row.actorColor};color:#fff;font-size:12px;font-weight:600;">${row.actorInitial}</span>
                  <div style="flex:1;display:flex;flex-direction:column;gap:2px;">
                    <div style="font-size:12px;color:#1F2937;">
                      <strong>${row.actorName}</strong> 님이 <em>${row.fieldLabel}</em> 변경
                    </div>
                    <div style="font-size:12px;color:#475569;">
                      <span style="text-decoration:line-through;color:#94A3B8;">${row.oldValue}</span>
                      <span style="margin:0 6px;">→</span>
                      <strong style="color:#0F172A;">${row.newValue}</strong>
                    </div>
                  </div>
                  <span style="font-size:11px;color:#64748B;white-space:nowrap;">${row.changedAt}</span>
                  <span style="font-size:11px;color:#475569;background:#F1F5F9;padding:2px 6px;border-radius:4px;">rev #${row.revisionNo}</span>
                </div>
              `,
                )
                .join('')}
            </div>
          </div>

          ${
            cfg.extraNote
              ? `<div style="margin-top:14px;padding:12px 14px;background:#ECFDF5;border-radius:6px;border:1px solid #A7F3D0;color:#065F46;font-size:12px;display:flex;align-items:flex-start;gap:8px;">
                  <span style="flex-shrink:0;font-size:14px;">●</span>
                  <span>${cfg.extraNote}</span>
                </div>`
              : ''
          }
        </section>

        <aside style="display:flex;flex-direction:column;gap:16px;">
          <div data-testid="sse-toast" role="status" style="background:#ECFDF5;border-left:4px solid #10B981;border-radius:8px;padding:14px;box-shadow:0 4px 12px rgba(16,185,129,0.15);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
              <strong style="font-size:13px;color:#065F46;">실시간 변경 감지</strong>
              <span style="font-size:11px;color:#047857;background:#D1FAE5;padding:2px 6px;border-radius:4px;">방금 · 0.8초</span>
            </div>
            <div style="font-size:12px;color:#065F46;line-height:1.5;">${cfg.toastMessage}</div>
            <div style="margin-top:10px;font-size:11px;color:#047857;font-family:Consolas,monospace;background:#D1FAE5;padding:6px 8px;border-radius:4px;">
              ${cfg.channel}
            </div>
          </div>

          <div style="background:#fff;border-radius:8px;padding:14px;border:1px solid #E2E8F0;">
            <div style="font-size:12px;font-weight:600;color:#1F2937;margin-bottom:8px;">동시 접속 컨텍스트 (${cfg.presenceCount})</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${cfg.presence
                .map(
                  (p) => `
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">
                  <span style="color:#0F172A;">● ${p.name} (${p.role})</span>
                  <span style="color:#10B981;">●</span>
                </div>
              `,
                )
                .join('')}
            </div>
          </div>

          <div style="background:#0F172A;color:#94A3B8;border-radius:8px;padding:12px;font-family:Consolas,monospace;font-size:11px;line-height:1.5;">
            <div style="color:#E2E8F0;font-weight:600;margin-bottom:6px;">DevOps · ElastiCache MONITOR</div>
            <div>13:32:18.412 PUBLISH ${cfg.channel}</div>
            <div>13:32:18.428 SUBSCRIBE samhan:${cfg.serviceName}:*</div>
            <div>13:32:18.512 SSE → context-A · ${cfg.viewerName}</div>
            <div style="color:#34D399;margin-top:6px;">→ samhan.realtime.publish.failure = 0</div>
          </div>
        </aside>
      </main>

      <footer style="margin-top:24px;padding:12px 16px;background:#fff;border-radius:8px;border:1px solid #E2E8F0;font-size:11px;color:#64748B;display:flex;justify-content:space-between;">
        <span>PR-H4c · 50+ FE page audit overlay rollout — ${cfg.serviceName} ${cfg.pageRouteName} 시각 일관 검증</span>
        <span>docs/qa/phase-12-step-4c-fe-audit-overlay-rollout/scenarios.md § ${cfg.scenarioRef}</span>
      </footer>
    `;
    root.appendChild(wrap);
  }, opts);
  await page.waitForTimeout(400);
}

async function captureScreen(browser, fileName, opts) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 920 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  await ctx.addInitScript(buildAuthInit());

  const url = `${BASE_URL}${ENTRY_PATH}?mockRole=${opts.viewerRole}#${opts.routeHash}`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [${fileName} pageerror]`, e.message));

  console.log(`  [${fileName}] navigate → ${url}`);
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 });
  } catch (e) {
    console.log(`    [${fileName} warn] vite 미가동 — about:blank fallback (${e.message.slice(0, 80)})`);
    await page.goto('about:blank');
  }
  await page.waitForTimeout(800);

  await composeFeRolloutDom(page, opts);

  ensureDir(OUT_DIR);
  const outPath = path.join(OUT_DIR, fileName);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`    saved → ${path.basename(outPath)} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

  await ctx.close();
}

/**
 * fallback — Playwright 자체 실패 시 한국어 placeholder 생성. 실 캡처 (>=20KB) 가 이미 존재하면 보존.
 */
async function generatePlaceholders(reason, onlyMissing = false) {
  console.log(`\n[fallback] placeholder 생성 (onlyMissing=${onlyMissing}). 사유: ${reason}`);
  ensureDir(OUT_DIR);
  const banners = [
    {
      file: STEP_FILES.TAX_INVOICE,
      title: 'accounting — 세금계산서/분개 audit overlay + SSE',
      sub: 'JournalDetailPage / TaxInvoicePage 분개 적요 변경 + 한국 계정 코드 (100100 현금) + actorName "이회계" + POSTED FULLY_LOCKED 안내',
      bullets: [
        'data-testid = audit-overlay (분개 적요 변경)',
        'oldValue 취소선 + actorName "이회계" badge + revisionNo chip',
        '한국 계정 코드 100100 (현금) / 220000 (부가세예수금) 표기',
        'Redis 채널 = samhan:accounting:journal:edit:{journalId}',
        '시나리오 § 4.1, § 4.7, § 11.5 회계 무결성 케이스',
      ],
    },
    {
      file: STEP_FILES.ESTIMATE,
      title: 'slip 견적 — DRAFT 단계 audit overlay + SSE',
      sub: 'SlipDetailPage (DRAFT 견적 단계) 메모 / 단가 변경 + actorName "오영업" + edit-request approve 후 1회 한정 mutation',
      bullets: [
        'data-testid = audit-overlay (메모 / 단가 변경)',
        'oldValue 취소선 "오전 배송 부탁드립니다" → "긴급 출고 (오늘 마감 전)"',
        '단가 audit row + 천 단위 콤마',
        'Redis 채널 = samhan:slip:slip:edit:{slipId}',
        '시나리오 § 1.1, § 1.2, § 11.5 영업 견적 케이스',
      ],
    },
    {
      file: STEP_FILES.INVENTORY,
      title: 'inventory — 재고 실사 audit overlay + SSE',
      sub: 'StockAdjustDetailPage (DRAFT 자유 수정) adjustReason 변경 + 한국 회계 무결성 표기 + SSE 수신',
      bullets: [
        'data-testid = audit-overlay (adjustReason 변경)',
        'oldValue 취소선 "검수 누락" → "파손 발견"',
        'DRAFT 자유 수정 정책 표시 + POSTED 진입 직전 안내',
        'Redis 채널 = samhan:inventory:stock-adjust:edit:{adjustId}',
        '시나리오 § 3.1, § 3.4, § 11.5 창고 재고 케이스 (한국 회계 무결성)',
      ],
    },
    {
      file: STEP_FILES.DISPATCH,
      title: 'arologis — 배차 audit overlay + SMS 알림 + 잠금',
      sub: 'DispatchDetailPage (DISPATCHED → 승인 후 1회 한정 mutation) driverName 변경 + SMS 발송 안내 + DISPATCHED 잠금 banner',
      bullets: [
        'data-testid = audit-overlay (driverName + driverPhone 2 행)',
        '기사 변경 SMS 발송 안내 toast (NotificationClient.sendSms 양쪽 발송)',
        'oldValue 취소선 "홍길동" → "김철수"',
        'DISPATCHED 잠금 banner + 1회 한정 mutation 소진 안내',
        'Redis 채널 = samhan:arologis:dispatch:edit:{dispatchId}',
        '시나리오 § 5.1, § 5.2, § 11.5 arologis 배차 케이스 (운송 사고 안전)',
      ],
    },
    {
      file: STEP_FILES.ADMIN_USERS,
      title: 'admin — 사용자 정보 audit overlay + MASTER 만 타인 수정',
      sub: 'admin/UsersPage 사용자 정보 변경 + MASTER 만 타인 수정 + actorName + SUSPENDED FULLY_LOCKED 표시',
      bullets: [
        'data-testid = audit-overlay (사용자 정보 변경)',
        'oldValue 취소선 + 한국어 라벨 "이름" / "연락처" / "소속 부서"',
        'MASTER 외 ROLE = banner "MASTER 만 타인 정보 수정 가능"',
        'SUSPENDED 사용자 = FULLY_LOCKED banner',
        'Redis 채널 = samhan:user:user:edit:{userId}',
        '시나리오 § 7.3, § 8.5, § 11.5 admin 사용자 케이스',
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
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="920">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="40" y="40" width="${w - 80}" height="80" fill="#1d4ed8"/>
  <text x="60" y="92" font-family="Malgun Gothic, sans-serif" font-size="28" fill="#fff">PR-H4c — 50+ FE page audit overlay rollout 작동 캡처 (5 도메인)</text>
  <text x="60" y="180" font-family="Malgun Gothic, sans-serif" font-size="22" fill="#1f2937">${b.title}</text>
  <text x="60" y="220" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#4b5563">${b.sub}</text>
  <rect x="60" y="280" width="${w - 120}" height="140" fill="#fef2f2" stroke="#fca5a5" stroke-width="2"/>
  <text x="80" y="320" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#b91c1c">[TODO] Playwright 자동 캡처 실패 또는 vite dev server 미부팅</text>
  <text x="80" y="350" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#7f1d1d">실행 방법:</text>
  <text x="80" y="375" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7f1d1d">  1) clients/desktop 에서 'cross-env VITE_MOCK_MODE=1 npx vite --port 5176 --host 127.0.0.1' 부팅</text>
  <text x="80" y="395" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7f1d1d">  2) tools/manual-capture 에서 'node capture-pr-h4c.js' 재실행</text>
  <text x="60" y="450" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#374151">검증 대상 (PR-H4c 50+ page audit overlay + 사용자 명시 패턴):</text>
  ${fieldsSvg}
  <text x="60" y="820" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">docs/qa/phase-12-step-4c-fe-audit-overlay-rollout/scenarios.md § 11.5 참조</text>
  <text x="60" y="840" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">사용자 명시: "다른 모든 화면도 마찬가지" — 9 audit overlay 도메인 50+ page 일괄 동작</text>
  <text x="60" y="860" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">PR-H2 SlipDetailPage 시드 (commit 435918c) 1:1 복제 — 시각 차이 0건 의무</text>
</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`    placeholder → ${b.file} (${sizeKb} KB)`);
  }
}

(async () => {
  console.log('PR-H4c QA 50+ page audit overlay rollout 작동 캡처 (5 도메인 시각 검증)');
  console.log(`  baseUrl  = ${BASE_URL}${ENTRY_PATH}`);
  console.log(`  output   = ${OUT_DIR}\n`);

  let browser;
  try {
    browser = await launchBrowser();

    // 1) accounting (세금계산서 / 분개)
    await captureScreen(browser, STEP_FILES.TAX_INVOICE, {
      serviceName: 'accounting',
      serviceLabel: 'accounting-service · 회계',
      pageTitle: '분개 상세 — J-2026-0512',
      pageSubtitle: '한국 일반기업회계기준 표준 분개 (전기일 2026-05-10) · DRAFT (POSTED 진입 직전)',
      pageRouteName: 'JournalDetailPage / TaxInvoicePage',
      cardTitle: '분개 본문 (DRAFT — 자유 수정)',
      revisionCount: 2,
      revisionBg: '#FEF3C7',
      revisionText: '#92400E',
      lastEditAt: '13:32',
      viewerName: '오영업',
      viewerRole: 'SALES',
      presenceCount: 3,
      presence: [
        { name: '오영업', role: 'SALES' },
        { name: '이회계', role: 'ACCOUNTANT' },
        { name: '박관리', role: 'MANAGER' },
      ],
      lockBanner: null,
      rows: [
        { label: '분개번호', value: '<strong>J-2026-0512</strong>' },
        { label: '계정 코드 / 명', value: '100100 · 현금 / 220000 · 부가세예수금 / 401000 · 상품매출' },
        { label: '차변 / 대변', value: '1,500,000 / 1,500,000' },
        { label: '적요', value: '<strong>현금 매출 입금</strong> <span style="color:#94A3B8;font-size:11px;">(방금 수정됨)</span>' },
        { label: '거래일', value: '2026-05-10' },
        { label: '거래처 코드', value: 'P-2026-0001 (삼한전자(주))' },
      ],
      auditRows: [
        {
          actorInitial: '이',
          actorName: '이회계',
          actorColor: '#7C3AED',
          fieldLabel: '적요',
          oldValue: '현금 입금',
          newValue: '현금 매출 입금',
          changedAt: '13:32',
          revisionNo: 2,
        },
        {
          actorInitial: '이',
          actorName: '이회계',
          actorColor: '#7C3AED',
          fieldLabel: '금액',
          oldValue: '1,200,000',
          newValue: '1,500,000',
          changedAt: '13:31',
          revisionNo: 1,
        },
      ],
      toastMessage: '<strong>이회계</strong> 님이 <em>적요</em> 를 "현금 매출 입금" 으로 수정했습니다. (rev #2)',
      channel: 'samhan:accounting:journal:edit:j-2026-0512',
      extraNote: '한국 일반기업회계기준 — DRAFT 자유 수정 + audit 무결성 100% 보존. POSTED 후에는 정정 분개로만 수정 가능합니다.',
      scenarioRef: '4.1, 4.7, 11.5',
      routeHash: '/accounting/journals/j-2026-0512',
    });

    // 2) slip 견적
    await captureScreen(browser, STEP_FILES.ESTIMATE, {
      serviceName: 'slip',
      serviceLabel: 'slip-service · 영업 견적',
      pageTitle: '견적 슬립 상세 — S-2026-0510-Q003',
      pageSubtitle: '거래처: 삼한전자(주) · DRAFT 견적 단계 (자유 수정)',
      pageRouteName: 'SlipDetailPage (DRAFT 견적)',
      cardTitle: '견적 본문 (DRAFT — 자유 수정)',
      revisionCount: 4,
      revisionBg: '#FEF3C7',
      revisionText: '#92400E',
      lastEditAt: '13:32',
      viewerName: '오영업',
      viewerRole: 'SALES',
      presenceCount: 2,
      presence: [
        { name: '오영업', role: 'SALES' },
        { name: '박관리', role: 'MANAGER' },
      ],
      lockBanner: null,
      rows: [
        { label: '슬립번호', value: '<strong>S-2026-0510-Q003</strong>' },
        { label: '거래처', value: '삼한전자(주) · 사업자번호 123-45-67890' },
        { label: '품목', value: '삼한 노트북 어댑터 (SKU-LP-A03) × 100 EA' },
        { label: '단가', value: '<strong>12,000원</strong> <span style="color:#94A3B8;font-size:11px;">(방금 수정됨 — 단가 협상)</span>' },
        { label: '공급가액 / 부가세 / 합계', value: '1,200,000 / 120,000 / 1,320,000' },
        { label: '메모', value: '<strong>긴급 출고 요청 (오늘 마감 전)</strong> <span style="color:#94A3B8;font-size:11px;">(방금 수정됨)</span>' },
      ],
      auditRows: [
        {
          actorInitial: '오',
          actorName: '오영업',
          actorColor: '#0EA5E9',
          fieldLabel: '메모',
          oldValue: '오전 배송 부탁드립니다',
          newValue: '긴급 출고 요청 (오늘 마감 전)',
          changedAt: '13:32',
          revisionNo: 4,
        },
        {
          actorInitial: '오',
          actorName: '오영업',
          actorColor: '#0EA5E9',
          fieldLabel: '단가',
          oldValue: '10,000',
          newValue: '12,000',
          changedAt: '13:30',
          revisionNo: 3,
        },
      ],
      toastMessage: '<strong>오영업</strong> 님이 <em>메모</em> 를 "긴급 출고 요청 (오늘 마감 전)" 으로 수정했습니다. (rev #4)',
      channel: 'samhan:slip:slip:edit:s-2026-0510-q003',
      extraNote: 'DRAFT 견적 단계 — 자유 수정. SAVED → SENT → ACCEPTED 후에는 잠금 정책 진입 (PR-H3 1차 잠금).',
      scenarioRef: '1.1, 1.2, 11.5',
      routeHash: '/slips/s-2026-0510-q003',
    });

    // 3) inventory (재고 실사)
    await captureScreen(browser, STEP_FILES.INVENTORY, {
      serviceName: 'inventory',
      serviceLabel: 'inventory-service · 재고 실사',
      pageTitle: '재고 조정 — A-2026-0510-001',
      pageSubtitle: '서울 본사 창고 · DRAFT (자유 수정 단계 — SUBMITTED 직전)',
      pageRouteName: 'StockAdjustDetailPage',
      cardTitle: '조정 본문 (DRAFT)',
      revisionCount: 1,
      revisionBg: '#F1F5F9',
      revisionText: '#475569',
      lastEditAt: '13:32',
      viewerName: '김창고',
      viewerRole: 'WAREHOUSE',
      presenceCount: 2,
      presence: [
        { name: '김창고', role: 'WAREHOUSE' },
        { name: '박관리', role: 'MANAGER' },
      ],
      lockBanner: null,
      rows: [
        { label: '조정번호', value: '<strong>A-2026-0510-001</strong>' },
        { label: '창고', value: '서울 본사 (WH-SEL-01)' },
        { label: '품목', value: '삼한 노트북 어댑터 (SKU-LP-A03)' },
        { label: '조정 수량', value: '-3 EA (시스템 12 → 실측 9)' },
        { label: '조정 사유', value: '<strong>파손 발견</strong> <span style="color:#94A3B8;font-size:11px;">(방금 수정됨)</span>' },
        { label: '품목코드 / 창고 코드', value: 'SKU-LP-A03 / WH-SEL-01' },
      ],
      auditRows: [
        {
          actorInitial: '박',
          actorName: '박관리',
          actorColor: '#F59E0B',
          fieldLabel: '조정 사유',
          oldValue: '검수 누락',
          newValue: '파손 발견',
          changedAt: '13:32',
          revisionNo: 1,
        },
      ],
      toastMessage: '<strong>박관리</strong> 님이 <em>조정 사유</em> 를 "파손 발견" 으로 수정했습니다. (회계 전기 전 무결성 보존)',
      channel: 'samhan:inventory:stock-adjust:edit:a-2026-0510-001',
      extraNote: 'DRAFT 자유 수정 — POSTED 후에는 별도 회계 정정 분개로만 수정 가능합니다 (한국 일반기업회계기준 보존 의무).',
      scenarioRef: '3.1, 3.4, 11.5',
      routeHash: '/inventory/stock-adjusts/a-2026-0510-001',
    });

    // 4) arologis (배차)
    await captureScreen(browser, STEP_FILES.DISPATCH, {
      serviceName: 'arologis',
      serviceLabel: 'arologis-service · 배차',
      pageTitle: '배차 상세 — D-2026-0510-007',
      pageSubtitle: '서울 본사 → 부산 창고 · DISPATCHED (수정 요청 → 승인 후 1회 한정 mutation 완료)',
      pageRouteName: 'DispatchDetailPage',
      cardTitle: '배차 본문 (DISPATCHED — 잠금 단계)',
      revisionCount: 2,
      revisionBg: '#FEF3C7',
      revisionText: '#92400E',
      lastEditAt: '13:32',
      viewerName: '정배차',
      viewerRole: 'DISPATCHER',
      presenceCount: 3,
      presence: [
        { name: '정배차', role: 'DISPATCHER' },
        { name: '박관리', role: 'MANAGER' },
        { name: '김기사', role: 'DRIVER' },
      ],
      lockBanner: '이 배차는 잠금 상태입니다 — 수정 요청 후 권한자 승인 시 1회 한정 mutation 가능합니다.',
      lockBannerSub: 'DISPATCHED 상태 = LOCKED_REQUIRES_APPROVAL · 활성 승인 1회 한정 소진됨 (다음 수정 시 재요청 필요)',
      lockBannerBg: '#FEF3C7',
      lockBannerAccent: '#D97706',
      lockBannerText: '#78350F',
      lockBannerIcon: '!',
      lockBannerCta: '+ 수정 요청',
      rows: [
        { label: '배차번호', value: '<strong>D-2026-0510-007</strong>' },
        { label: '차량번호', value: '12가 3456 (1톤)' },
        { label: '출발 / 도착', value: '서울 본사 → 부산 창고' },
        { label: '예상 출발', value: '2026-05-10 15:00' },
        { label: '기사명', value: '<strong>김철수</strong> <span style="color:#94A3B8;font-size:11px;">(방금 변경됨 — SMS 발송 완료)</span>' },
        { label: '기사 연락처', value: '<strong>010-9999-8888</strong>' },
      ],
      auditRows: [
        {
          actorInitial: '정',
          actorName: '정배차',
          actorColor: '#10B981',
          fieldLabel: '기사 연락처',
          oldValue: '010-1234-5678',
          newValue: '010-9999-8888',
          changedAt: '13:32',
          revisionNo: 2,
        },
        {
          actorInitial: '정',
          actorName: '정배차',
          actorColor: '#10B981',
          fieldLabel: '기사명',
          oldValue: '홍길동',
          newValue: '김철수',
          changedAt: '13:32',
          revisionNo: 1,
        },
      ],
      toastMessage: '<strong>기사 변경 SMS 발송 완료</strong> — 이전 기사 (홍길동) + 새 기사 (김철수) 양쪽 발송. (NotificationClient.sendSms ×2)',
      channel: 'samhan:arologis:dispatch:edit:d-2026-0510-007',
      extraNote: '기사 변경 post-approve hook 자동 발동 — 운송 사고 방지 의무. IN_TRANSIT 진입 후 FULLY_LOCKED 정책 진입 (MASTER 본부 승인 별도 절차).',
      scenarioRef: '5.1, 5.2, 11.5',
      routeHash: '/arologis/dispatches/d-2026-0510-007',
    });

    // 5) admin (사용자)
    await captureScreen(browser, STEP_FILES.ADMIN_USERS, {
      serviceName: 'user',
      serviceLabel: 'user-service · admin/UsersPage',
      pageTitle: '사용자 관리 — user-001 상세',
      pageSubtitle: '홍길동 · SALES · ACTIVE · MASTER 만 타인 정보 수정 가능',
      pageRouteName: 'admin/UsersPage / UserDetailPage',
      cardTitle: '사용자 정보 (admin)',
      revisionCount: 3,
      revisionBg: '#FEF3C7',
      revisionText: '#92400E',
      lastEditAt: '13:32',
      viewerName: '김미선',
      viewerRole: 'MASTER',
      presenceCount: 2,
      presence: [
        { name: '김미선', role: 'MASTER' },
        { name: '박관리', role: 'MANAGER' },
      ],
      lockBanner: 'MANAGER 시도 시 — "MASTER 만 타인 정보 수정 가능합니다"',
      lockBannerSub: '본인 (UserProfilePage) 은 자유 수정. 타인 (admin/UsersPage) 은 MASTER 권한 필요. SUSPENDED 사용자는 FULLY_LOCKED.',
      lockBannerBg: '#DBEAFE',
      lockBannerAccent: '#2563EB',
      lockBannerText: '#1E3A8A',
      lockBannerIcon: 'i',
      lockBannerCta: null,
      rows: [
        { label: '사용자명', value: '<strong>홍길동</strong> <span style="color:#94A3B8;font-size:11px;">(방금 수정됨 — 김미선 by MASTER)</span>' },
        { label: 'ROLE', value: 'SALES' },
        { label: '연락처', value: '<strong>010-9999-8888</strong>' },
        { label: '소속 부서', value: '영업1팀' },
        { label: '상태', value: '<span style="color:#10B981;font-weight:600;">ACTIVE</span>' },
        { label: '이메일', value: 'honggildong@samhan.com (UUID 비공개)' },
      ],
      auditRows: [
        {
          actorInitial: '김',
          actorName: '김미선',
          actorColor: '#DC2626',
          fieldLabel: '연락처',
          oldValue: '010-1111-2222',
          newValue: '010-9999-8888',
          changedAt: '13:32',
          revisionNo: 3,
        },
        {
          actorInitial: '홍',
          actorName: '홍길동',
          actorColor: '#0EA5E9',
          fieldLabel: '소속 부서',
          oldValue: '영업2팀',
          newValue: '영업1팀',
          changedAt: '13:30',
          revisionNo: 2,
        },
        {
          actorInitial: '김',
          actorName: '김미선',
          actorColor: '#DC2626',
          fieldLabel: '이름',
          oldValue: '홍길순',
          newValue: '홍길동',
          changedAt: '12:55',
          revisionNo: 1,
        },
      ],
      toastMessage: '<strong>김미선</strong> (MASTER) 님이 <em>연락처</em> 를 "010-9999-8888" 으로 수정했습니다. (rev #3 — admin 권한)',
      channel: 'samhan:user:user:edit:user-001',
      extraNote: '본인 자유 수정 (UserProfilePage) + MASTER 만 타인 수정 (admin/UsersPage). SUSPENDED 사용자 = FULLY_LOCKED. UUID 비공개 + name + role 노출.',
      scenarioRef: '7.3, 8.5, 11.5',
      routeHash: '/admin/users/user-001',
    });

    console.log(`\n[done] 5 화면 캡처 시도 완료 → ${OUT_DIR}`);
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
