import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
// _local 격리(2026-07-27 재수렴 4차 X1 — qa/playwright 트리 관할 편입).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots'));

await fs.mkdir(outDir, { recursive: true });

const styles = `
  :root {
    --bg: #eef3f6;
    --phone: #fbfcfd;
    --card: #ffffff;
    --line: #d8e2ea;
    --ink: #172033;
    --muted: #5d6878;
    --faint: #8a96a6;
    --brand: #1f6b6d;
    --brand-soft: #dff3f1;
    --info: #2756a3;
    --info-soft: #e2ebfb;
    --success: #0f7a50;
    --success-soft: #dcf6e9;
    --warn: #a16207;
    --warn-soft: #fff1c2;
    --danger: #b42318;
    --danger-soft: #fee4df;
    --slate: #111827;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: "Malgun Gothic", "Pretendard", Arial, sans-serif;
  }
  .frame {
    width: 1260px;
    min-height: 900px;
    display: grid;
    grid-template-columns: 452px 1fr;
    gap: 44px;
    align-items: start;
    padding: 46px;
  }
  .phone {
    width: 430px;
    min-height: 800px;
    background: var(--phone);
    border: 1px solid #c7d5df;
    border-radius: 30px;
    box-shadow: 0 24px 54px rgba(17, 24, 39, .14);
    padding: 24px;
    display: flex;
    flex-direction: column;
  }
  .phone-screen { flex: 1; }
  .side {
    min-height: 800px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .eyebrow {
    display: inline-flex;
    width: max-content;
    padding: 7px 12px;
    border-radius: 999px;
    background: var(--brand-soft);
    color: var(--brand);
    font-size: 16px;
    font-weight: 800;
  }
  h1 {
    margin: 18px 0 12px;
    font-size: 38px;
    line-height: 1.16;
    letter-spacing: 0;
  }
  h2 {
    margin: 0;
    font-size: 25px;
    line-height: 1.25;
  }
  h3 {
    margin: 0;
    font-size: 18px;
    line-height: 1.3;
  }
  p {
    margin: 0;
    font-size: 20px;
    line-height: 1.55;
    color: var(--muted);
  }
  .small { font-size: 14px; line-height: 1.42; }
  .micro { font-size: 12px; line-height: 1.35; }
  .muted { color: var(--muted); }
  .faint { color: var(--faint); }
  .panel {
    margin-top: 14px;
    padding: 15px;
    border-radius: 10px;
    background: var(--card);
    border: 1px solid var(--line);
  }
  .panel.tight { padding: 12px; }
  .title-line {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #e6edf3;
  }
  .row:last-child { border-bottom: 0; }
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: max-content;
    padding: 5px 9px;
    border-radius: 5px;
    font-size: 13px;
    font-weight: 800;
    line-height: 1.2;
  }
  .success { background: var(--success-soft); color: var(--success); }
  .warn { background: var(--warn-soft); color: var(--warn); }
  .info { background: var(--info-soft); color: var(--info); }
  .danger { background: var(--danger-soft); color: var(--danger); }
  .brand { background: var(--brand-soft); color: var(--brand); }
  .tabs {
    display: flex;
    gap: 7px;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid #d8e2ec;
  }
  .tab {
    flex: 1;
    text-align: center;
    padding: 11px 6px;
    border-radius: 7px;
    border: 1px solid #d3dce6;
    font-size: 13px;
    color: #52606d;
  }
  .tab.active {
    background: var(--brand-soft);
    color: var(--brand);
    font-weight: 800;
    border-color: #9fc9c6;
  }
  .webview {
    min-height: 500px;
    border: 1px solid #ced8e2;
    border-radius: 12px;
    background: linear-gradient(180deg, #ffffff 0%, #f7fafc 100%);
    overflow: hidden;
  }
  .web-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 13px 14px;
    border-bottom: 1px solid #e3eaf0;
    background: #f8fafc;
  }
  .web-body { padding: 14px; }
  .metric-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 14px;
  }
  .metric {
    min-height: 78px;
    padding: 12px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid #e1e8ef;
  }
  .metric strong {
    display: block;
    margin-top: 6px;
    font-size: 22px;
  }
  .empty-toggle {
    min-height: 340px;
    display: grid;
    place-items: center;
    text-align: center;
    border: 1px dashed #b9c8d5;
    border-radius: 12px;
    background: #f8fafc;
    padding: 24px;
  }
  .code {
    margin-top: 22px;
    padding: 20px;
    border-radius: 12px;
    background: var(--slate);
    color: #d1fae5;
    font-family: Consolas, "D2Coding", monospace;
    font-size: 19px;
    line-height: 1.52;
    white-space: pre-wrap;
  }
  .matrix {
    width: 100%;
    border-collapse: collapse;
    margin-top: 18px;
    font-size: 17px;
    background: white;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid var(--line);
  }
  .matrix th, .matrix td {
    border-bottom: 1px solid #e4ebf2;
    padding: 13px 14px;
    text-align: left;
    vertical-align: top;
  }
  .matrix th {
    background: #f8fafc;
    color: var(--muted);
    font-size: 14px;
  }
  .matrix tr:last-child td { border-bottom: 0; }
  .flow {
    display: grid;
    grid-template-columns: 1fr 44px 1fr;
    align-items: stretch;
    gap: 12px;
    margin-top: 20px;
  }
  .flow-box {
    padding: 16px;
    border-radius: 10px;
    background: #fff;
    border: 1px solid var(--line);
  }
  .arrow {
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--brand-soft);
    color: var(--brand);
    font-size: 24px;
    font-weight: 900;
    align-self: center;
    height: 44px;
  }
`;

const tabs = '<div class="tabs"><div class="tab active">견적</div><div class="tab">사진</div><div class="tab">설정</div></div>';

function renderPage(page) {
  return `<!doctype html>
  <html lang="ko">
    <head>
      <meta charset="utf-8" />
      <style>${styles}</style>
    </head>
    <body>
      <main class="frame">
        <section class="phone">
          <div class="phone-screen">${page.phone}</div>
          ${page.tabs ?? tabs}
        </section>
        <section class="side">
          <span class="eyebrow">${page.badge}</span>
          <h1>${page.title}</h1>
          <p>${page.summary}</p>
          ${page.detail ?? ''}
        </section>
      </main>
    </body>
  </html>`;
}

const estimateWebViewPhone = `
  <div class="title-line">
    <div>
      <h2>mobile-staff</h2>
      <p class="small">견적 WebView 단일 진입</p>
    </div>
    <span class="badge success">D-AX-19</span>
  </div>
  <div class="panel">
    <div class="webview">
      <div class="web-head">
        <strong>영업 견적</strong>
        <span class="badge brand">mobile-mode</span>
      </div>
      <div class="web-body">
        <div class="title-line">
          <div>
            <h3>오늘 견적 현황</h3>
            <p class="small muted" style="margin-top:6px;">기존 estimate-app v2 화면 보존</p>
          </div>
          <span class="badge info">WebView</span>
        </div>
        <div class="metric-grid">
          <div class="metric"><span class="micro muted">진행 견적</span><strong>12</strong></div>
          <div class="metric"><span class="micro muted">대기 상담</span><strong>4</strong></div>
          <div class="metric"><span class="micro muted">방문 예정</span><strong>3</strong></div>
          <div class="metric"><span class="micro muted">완료</span><strong>8</strong></div>
        </div>
        <div class="panel tight">
          <div class="row"><span>viewport shim</span><span class="badge success">유지</span></div>
          <div class="row"><span>legacy source</span><span class="badge success">유지</span></div>
          <div class="row"><span>native root</span><span class="badge success">단순화</span></div>
        </div>
      </div>
    </div>
  </div>
`;

const decisionPhone = `
  <div class="title-line">
    <div>
      <h2>운영 책임 정리</h2>
      <p class="small">앱 경계 결정</p>
    </div>
    <span class="badge brand">Retirement</span>
  </div>
  <div class="panel">
    <div class="row"><span>mobile-staff</span><strong>견적 WebView</strong></div>
    <div class="row"><span>arologis-mobile</span><strong>배송기사 런타임</strong></div>
    <div class="row"><span>공통 목표</span><strong>사용자 혼선 제거</strong></div>
  </div>
  <div class="flow">
    <div class="flow-box">
      <span class="badge warn">이전</span>
      <h3 style="margin-top:12px;">하나의 앱에 두 역할</h3>
      <p class="small muted" style="margin-top:8px;">견적 업무와 기사 업무가 앱 루트에서 분기</p>
    </div>
    <div class="arrow">→</div>
    <div class="flow-box">
      <span class="badge success">D-AX-19</span>
      <h3 style="margin-top:12px;">역할별 앱 분리</h3>
      <p class="small muted" style="margin-top:8px;">mobile-staff 는 견적만 담당</p>
    </div>
  </div>
`;

const noDriverTogglePhone = `
  <div class="title-line">
    <div>
      <h2>앱 시작 화면</h2>
      <p class="small">역할 전환 UI 없음</p>
    </div>
    <span class="badge success">단일 흐름</span>
  </div>
  <div class="panel">
    <div class="empty-toggle">
      <div>
        <span class="badge brand">견적 업무</span>
        <h3 style="margin-top:18px;">전환 버튼 없이 바로 견적 화면</h3>
        <p class="small muted" style="margin-top:10px;">앱 루트에서 선택해야 할 mode 가 없습니다.</p>
      </div>
    </div>
  </div>
  <div class="panel tight">
    <div class="row"><span>mode-driver testID</span><span class="badge success">없음</span></div>
    <div class="row"><span>기사 탭</span><span class="badge success">없음</span></div>
    <div class="row"><span>GPS / 서명 shortcut</span><span class="badge success">없음</span></div>
  </div>
`;

const boundaryPhone = `
  <div class="title-line">
    <div>
      <h2>코드 경계 guard</h2>
      <p class="small">root 경로 import 검색</p>
    </div>
    <span class="badge success">no match</span>
  </div>
  <div class="panel">
    <div class="row"><span>App.tsx</span><span class="badge success">root only</span></div>
    <div class="row"><span>AppRootNavigator</span><span class="badge success">EstimateWebViewScreen</span></div>
    <div class="row"><span>기사 runtime import</span><span class="badge success">없음</span></div>
  </div>
  <div class="code">rg -n "DriverTabNavigator|DriverDashboardScreen|DriverSignatureScreen|SignaturePhotoScreen|LocationTrackingScreen|mode-driver" App.tsx AppRootNavigator.tsx

result: no matches in runtime root</div>
`;

const matrixPhone = `
  <h2>D-AX-19 검증 매트릭스</h2>
  <p class="small" style="margin-top:9px;">PR 본문용 QA 요약</p>
  <div class="panel">
    <div class="row"><span>retirement decision</span><span class="badge success">확인</span></div>
    <div class="row"><span>app root estimate only</span><span class="badge success">확인</span></div>
    <div class="row"><span>no driver toggle</span><span class="badge success">확인</span></div>
    <div class="row"><span>code boundary guard</span><span class="badge success">확인</span></div>
    <div class="row"><span>screenshot evidence</span><span class="badge success">5 PNG</span></div>
  </div>
`;

const pages = [
  {
    file: '01-retirement-decision.png',
    badge: 'Decision',
    title: 'mobile-staff driver mode 은퇴 결정',
    summary: 'D-AX-19는 mobile-staff 를 영업 견적 앱으로 되돌리고, 배송기사 런타임은 arologis-mobile 에 집중시킵니다.',
    phone: decisionPhone,
    detail: `<table class="matrix">
      <tr><th>앱</th><th>남는 책임</th><th>검증</th></tr>
      <tr><td>mobile-staff</td><td>견적 WebView, viewport shim, 기존 estimate 화면</td><td>AppRootNavigator test</td></tr>
      <tr><td>arologis-mobile</td><td>오늘 배차, GPS, 서명, 사진, 전표 확인</td><td>후속 driver 앱 소유</td></tr>
      <tr><td>PR evidence</td><td>mock capture 5장</td><td>Playwright HTML render</td></tr>
    </table>`,
  },
  {
    file: '02-app-root-estimate-only.png',
    badge: 'App Root',
    title: 'AppRootNavigator 는 견적 화면만 렌더링',
    summary: '앱 루트는 SafeAreaView 안에서 EstimateWebViewScreen 을 직접 표시합니다. 로그인/역할 분기보다 견적 WebView 보존을 우선합니다.',
    phone: estimateWebViewPhone,
    detail: `<div class="code">export default function AppRootNavigator() {
  return (
    &lt;SafeAreaView&gt;
      &lt;EstimateWebViewScreen /&gt;
    &lt;/SafeAreaView&gt;
  );
}</div>`,
  },
  {
    file: '03-no-driver-toggle.png',
    badge: 'UI Guard',
    title: '기사 mode 전환 UI 가 보이지 않습니다',
    summary: '사용자는 시작 화면에서 앱 역할을 선택하지 않습니다. PR 검증은 toggle, 탭, shortcut 부재를 focused Jest 로 확인합니다.',
    phone: noDriverTogglePhone,
    detail: `<div class="code">npm test -- AppRootNavigator.test.tsx --runInBand

expect(screen.getByTestId("estimate-webview-screen")).toBeTruthy()
expect(screen.queryByTestId("mode-driver")).toBeNull()
expect(screen.queryByText("배송기사")).toBeNull()</div>`,
  },
  {
    file: '04-code-boundary-import-guard.png',
    badge: 'Import Guard',
    title: 'root/import 경계에 기사 런타임 직접 연결 없음',
    summary: 'D-AX-19 검증은 앱 루트 파일에서 기사 navigator, 기사 화면 import, mode 분기 문자열을 검색해 잔존 연결을 막습니다.',
    phone: boundaryPhone,
    detail: `<table class="matrix">
      <tr><th>검증 대상</th><th>금지 패턴</th><th>정상 결과</th></tr>
      <tr><td>App.tsx</td><td>driver navigator import</td><td>no match</td></tr>
      <tr><td>AppRootNavigator.tsx</td><td>driver screen import</td><td>no match</td></tr>
      <tr><td>runtime root</td><td>mode-driver / setMode driver</td><td>no match</td></tr>
    </table>`,
  },
  {
    file: '05-verification-matrix.png',
    badge: 'Verification',
    title: 'D-AX-19 PR 검증 매트릭스',
    summary: 'typecheck, focused Jest, import guard, screenshot generation 을 PR 본문에서 바로 확인할 수 있도록 한 장에 요약했습니다.',
    phone: matrixPhone,
    detail: `<table class="matrix">
      <tr><th>검증</th><th>명령</th><th>기대 결과</th></tr>
      <tr><td>mobile-staff typecheck</td><td>npm run typecheck</td><td>0 errors</td></tr>
      <tr><td>focused Jest</td><td>npm test -- AppRootNavigator.test.tsx --runInBand</td><td>estimate only</td></tr>
      <tr><td>import guard</td><td>rg driver root patterns</td><td>no matches</td></tr>
      <tr><td>screenshot generation</td><td>generate-d-ax-19...ps1</td><td>5 PNG files</td></tr>
      <tr><td>capture privacy</td><td>visual text review</td><td>no internal values</td></tr>
    </table>`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1260, height: 900 }, deviceScaleFactor: 1 });

for (const item of pages) {
  await page.setContent(renderPage(item), { waitUntil: 'load' });
  await page.screenshot({ path: path.join(outDir, item.file), fullPage: false });
}

await browser.close();

console.log(`D-AX-19 mobile-staff driver mode retirement screenshots ${pages.length} generated:`);
for (const item of pages) {
  console.log(`- ${path.join(outDir, item.file)}`);
}
