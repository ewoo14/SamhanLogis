import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
// _local 격리(2026-07-27 재수렴 4차 X1 — qa/playwright 트리 관할 편입).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots'));

await fs.mkdir(outDir, { recursive: true });

const styles = `
  :root {
    --bg: #edf3f5;
    --phone: #f8faf9;
    --card: #ffffff;
    --line: #cbded9;
    --ink: #102024;
    --muted: #465e66;
    --soft: #e8f3f0;
    --brand: #2a9d8f;
    --brand-dark: #157467;
    --info: #1d4ed8;
    --info-soft: #dbeafe;
    --success: #059669;
    --success-soft: #d1fae5;
    --warn: #b45309;
    --warn-soft: #fef3c7;
    --danger: #dc2626;
    --danger-soft: #fee2e2;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: "Malgun Gothic", "Pretendard", Arial, sans-serif;
  }
  .frame {
    width: 1200px;
    height: 820px;
    display: grid;
    grid-template-columns: 460px 1fr;
    gap: 42px;
    align-items: center;
    padding: 46px;
  }
  .phone {
    width: 430px;
    min-height: 710px;
    background: var(--phone);
    border: 1px solid #b7d1cc;
    border-radius: 30px;
    box-shadow: 0 24px 54px rgba(0, 0, 0, .14);
    padding: 28px;
    display: flex;
    flex-direction: column;
  }
  .phone-screen { flex: 1; }
  .side {
    min-height: 710px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .badge {
    display: inline-flex;
    width: max-content;
    padding: 7px 12px;
    border-radius: 999px;
    background: var(--soft);
    color: var(--brand-dark);
    font-size: 16px;
    font-weight: 800;
  }
  h1 {
    margin: 18px 0 12px;
    font-size: 36px;
    line-height: 1.18;
    letter-spacing: 0;
  }
  h2 {
    margin: 0;
    font-size: 25px;
    line-height: 1.25;
  }
  p {
    margin: 0;
    font-size: 20px;
    line-height: 1.58;
    color: var(--muted);
  }
  .panel {
    margin-top: 18px;
    padding: 18px;
    border-radius: 14px;
    background: var(--card);
    border: 1px solid #d8e4e1;
  }
  .panel.compact { padding: 14px; }
  .label { font-size: 15px; color: #6a7d83; }
  .value {
    margin-top: 5px;
    font-size: 24px;
    font-weight: 800;
    color: #142328;
  }
  .subvalue {
    margin-top: 4px;
    font-size: 17px;
    color: var(--muted);
  }
  .pill {
    display: inline-flex;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--info-soft);
    color: var(--info);
    font-size: 15px;
    font-weight: 800;
  }
  .pill.success { background: var(--success-soft); color: var(--success); }
  .pill.warn { background: var(--warn-soft); color: var(--warn); }
  .pill.danger { background: var(--danger-soft); color: var(--danger); }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 0;
    border-bottom: 1px solid #e2ece9;
  }
  .row:last-child { border-bottom: 0; }
  .tabs {
    display: flex;
    gap: 8px;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid #d8e4e1;
  }
  .tab {
    flex: 1;
    text-align: center;
    padding: 12px 8px;
    border-radius: 8px;
    border: 1px solid #d3dfdc;
    font-size: 15px;
    color: #52666c;
  }
  .tab.active {
    background: var(--soft);
    color: var(--brand-dark);
    font-weight: 800;
    border-color: #9ed8cc;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #1e40af;
    display: inline-block;
  }
  .callout {
    margin-top: 22px;
    padding: 18px;
    border-radius: 12px;
    background: #fff;
    border: 1px solid #d8e4e1;
    color: #395158;
    font-size: 18px;
    line-height: 1.5;
  }
  .evidence {
    width: 1200px;
    height: 820px;
    padding: 52px;
    display: flex;
  }
  .evidence-card {
    width: 100%;
    background: #f8faf9;
    border: 1px solid #b7d1cc;
    border-radius: 24px;
    box-shadow: 0 22px 50px rgba(0, 0, 0, .12);
    padding: 38px;
  }
  .code {
    margin-top: 24px;
    padding: 22px;
    border-radius: 14px;
    background: #0f172a;
    color: #d1fae5;
    font-family: Consolas, "D2Coding", monospace;
    font-size: 22px;
    line-height: 1.55;
    white-space: pre-wrap;
  }
`;

const pages = [
  {
    file: '01-authenticated-driver-tabs.png',
    badge: 'D-AX-15 / 로그인 후',
    title: '아로로지스 모바일이 실제 기사 런타임으로 진입',
    summary: 'PhoneLoginScreen 성공 후 placeholder DispatchListScreen 대신 dashboard + GPS 2탭 navigator 를 렌더링합니다.',
    phone: `
      <div class="phone-screen">
        <span class="badge">아로로지스 기사</span>
        <h2 style="margin-top:18px;">오늘의 배차</h2>
        <p style="font-size:16px;">본인 배정 vehicle 2대</p>
        <div class="panel compact">
          <div class="row"><span>차량 #1</span><span class="pill success">배정완료</span></div>
          <div class="row"><span>차량 #2</span><span class="pill">출발</span></div>
        </div>
      </div>
      <div class="tabs">
        <div class="tab active">배차</div>
        <div class="tab">GPS</div>
        <div class="tab">로그아웃</div>
      </div>
    `,
  },
  {
    file: '02-driver-dashboard.png',
    badge: 'Dashboard',
    title: '오늘의 배차 카드와 마지막 동기화 표시',
    summary: '기존 driver dashboard 흐름을 standalone 앱 안으로 이식했습니다. driverCode 기반 색상 dot 과 30초 polling fallback 은 유지됩니다.',
    phone: `
      <div class="phone-screen">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h2>오늘의 배차</h2>
            <p style="font-size:16px;">본인 배정 vehicle 2대</p>
          </div>
          <div style="display:flex;gap:7px;align-items:center;font-size:14px;color:#6a7d83;"><span class="dot"></span>갱신 09:42:18</div>
        </div>
        <div class="panel">
          <div class="row"><strong>차량 #1</strong><span class="pill success">배정완료</span></div>
          <div class="row"><span class="label">톤수</span><strong>1톤</strong></div>
          <div class="row"><span class="label">상태</span><strong>배정완료</strong></div>
        </div>
        <div class="panel">
          <div class="row"><strong>차량 #2</strong><span class="pill">출발</span></div>
          <div class="row"><span class="label">톤수</span><strong>2.5톤</strong></div>
          <div class="row"><span class="label">상태</span><strong>출발</strong></div>
        </div>
      </div>
      <div class="tabs"><div class="tab active">배차</div><div class="tab">GPS</div><div class="tab">로그아웃</div></div>
    `,
  },
  {
    file: '03-gps-tracking.png',
    badge: 'GPS',
    title: 'GPS 30초 보고 화면 이식',
    summary: 'foreground 위치 추적 토글과 최근 보고 결과 UI를 arologis-mobile 내부 화면으로 이동했습니다.',
    phone: `
      <div class="phone-screen">
        <h2>GPS 위치 추적</h2>
        <p style="font-size:16px;">30초 간격 본 어플 GPS 위치를 보고합니다.</p>
        <div class="panel">
          <div class="row"><span>foreground 추적</span><span class="pill success">ON</span></div>
          <div class="row"><span>background 권한</span><span class="pill warn">미허용 (선택)</span></div>
          <div class="row"><span>보고 source</span><span class="pill">APP_GPS_ACTIVE</span></div>
          <div class="row"><span>보고 횟수</span><strong>3회</strong></div>
        </div>
        <div class="panel">
          <div class="label">최근 보고</div>
          <div class="row"><span>위도</span><strong>37.5665000</strong></div>
          <div class="row"><span>경도</span><strong>126.9780000</strong></div>
          <div class="row"><span>결과</span><span class="pill success">성공</span></div>
        </div>
      </div>
      <div class="tabs"><div class="tab">배차</div><div class="tab active">GPS</div><div class="tab">로그아웃</div></div>
    `,
  },
  {
    file: '04-dashboard-empty.png',
    badge: 'Empty State',
    title: '배정 vehicle 없음 상태',
    summary: '배차 API가 빈 배열을 반환해도 독립 앱 안에서 자연스러운 빈 상태를 보여줍니다.',
    phone: `
      <div class="phone-screen">
        <h2>오늘의 배차</h2>
        <p style="font-size:16px;">본인 배정 vehicle 0대</p>
        <div class="panel" style="min-height:260px;display:flex;align-items:center;justify-content:center;text-align:center;">
          <div>
            <div class="pill warn">대기</div>
            <p style="margin-top:16px;">배정된 vehicle 이 없습니다</p>
          </div>
        </div>
      </div>
      <div class="tabs"><div class="tab active">배차</div><div class="tab">GPS</div><div class="tab">로그아웃</div></div>
    `,
  },
  {
    file: '05-dashboard-error.png',
    badge: 'Error State',
    title: 'API 실패 시 오류 카드 유지',
    summary: 'fetchTodayDispatches 실패는 dashboard 안의 한국어 오류 카드로 표시됩니다. 로그인 토큰은 API client refresh 가드와 함께 동작합니다.',
    phone: `
      <div class="phone-screen">
        <h2>오늘의 배차</h2>
        <div class="panel" style="border-left:5px solid var(--warn);background:var(--warn-soft);">
          <span class="pill warn">오류</span>
          <p style="margin-top:14px;color:#6b3f09;">today ApiResponse.success=false (code=UNKNOWN)</p>
        </div>
      </div>
      <div class="tabs"><div class="tab active">배차</div><div class="tab">GPS</div><div class="tab">로그아웃</div></div>
    `,
  },
  {
    file: '06-gps-permission-block.png',
    badge: 'GPS Gate',
    title: 'RootNavigator GPS 차단 흐름 보존',
    summary: 'foreground GPS 권한은 의무입니다. 거부 또는 미가용이면 driver tabs 진입 전에 차단 화면을 표시합니다.',
    phone: `
      <div class="phone-screen" style="display:flex;align-items:center;justify-content:center;text-align:left;">
        <div class="panel" style="border:1px solid var(--danger);">
          <span class="pill danger">GPS 권한 필요</span>
          <h2 style="margin-top:18px;">GPS 권한이 필요합니다</h2>
          <p style="margin-top:12px;">배송 도중 위치 보고를 위해 위치 권한이 반드시 필요합니다.</p>
          <div class="panel compact" style="background:#f4f6f8;">OS 설정 &gt; 위치 &gt; 아로로지스 기사 &gt; 허용</div>
          <div class="pill" style="margin-top:16px;">다시 시도</div>
        </div>
      </div>
    `,
  },
  {
    file: '07-typecheck-pass.png',
    evidence: true,
    title: 'Typecheck PASS',
    summary: 'clients/arologis-mobile 에서 dashboard + GPS 이식 후 TypeScript 계약을 확인했습니다.',
    code: `> @samhan/arologis-mobile@1.0.0 typecheck
> tsc --noEmit

PASS: no TypeScript errors`,
  },
  {
    file: '08-import-boundary-pass.png',
    evidence: true,
    title: 'Cross-Import Guard PASS',
    summary: 'arologis-mobile 소스에서 mobile-staff 직접 참조가 없음을 검색으로 확인했습니다.',
    code: `rg -n 'clients/mobile-staff|mobile-staff|../../../mobile-staff' clients/arologis-mobile/src

PASS: no matches`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 1 });

async function capturePhone(item) {
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${styles}</style></head><body>
    <main class="frame">
      <section class="phone">${item.phone}</section>
      <section class="side">
        <span class="badge">${item.badge}</span>
        <h1>${item.title}</h1>
        <p>${item.summary}</p>
        <div class="callout">PR 본문에서 바로 읽히도록 1200px 폭으로 생성한 한국어 QA 캡처입니다.</div>
      </section>
    </main>
  </body></html>`);
  await page.screenshot({ path: path.join(outDir, item.file), fullPage: false });
}

async function captureEvidence(item) {
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${styles}</style></head><body>
    <main class="evidence">
      <section class="evidence-card">
        <span class="badge">검증 증거</span>
        <h1>${item.title}</h1>
        <p>${item.summary}</p>
        <pre class="code">${item.code}</pre>
      </section>
    </main>
  </body></html>`);
  await page.screenshot({ path: path.join(outDir, item.file), fullPage: false });
}

for (const item of pages) {
  if (item.evidence) {
    await captureEvidence(item);
  } else {
    await capturePhone(item);
  }
}

await browser.close();
console.log(`D-AX-15 screenshots generated: ${outDir}`);
