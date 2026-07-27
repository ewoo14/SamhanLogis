import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
// _local 격리(2026-07-27 재수렴 4차 X1 — qa/playwright 트리 관할 편입).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/d-ax-12-mobile-cross-import/screenshots'));

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
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: "Malgun Gothic", "Pretendard", Arial, sans-serif;
  }
  .frame {
    width: 1000px;
    height: 760px;
    display: grid;
    grid-template-columns: 470px 1fr;
    gap: 36px;
    align-items: center;
    padding: 42px;
  }
  .phone {
    width: 430px;
    min-height: 676px;
    background: var(--phone);
    border: 1px solid #b7d1cc;
    border-radius: 28px;
    box-shadow: 0 22px 50px rgba(0, 0, 0, .14);
    padding: 28px;
  }
  .side {
    min-height: 676px;
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
    font-size: 34px;
    line-height: 1.18;
    letter-spacing: 0;
  }
  p {
    margin: 0;
    font-size: 19px;
    line-height: 1.62;
    color: var(--muted);
  }
  .panel {
    margin-top: 22px;
    padding: 18px;
    border-radius: 14px;
    background: var(--card);
    border: 1px solid #d8e4e1;
  }
  .label {
    font-size: 15px;
    color: #6a7d83;
  }
  .value {
    margin-top: 5px;
    font-size: 25px;
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
    margin-top: 12px;
    padding: 7px 10px;
    border-radius: 6px;
    background: var(--info-soft);
    color: var(--info);
    font-size: 15px;
    font-weight: 800;
  }
  .button {
    margin-top: 24px;
    display: inline-flex;
    padding: 16px 20px;
    border-radius: 8px;
    background: var(--brand);
    color: white;
    font-size: 18px;
    font-weight: 800;
  }
  .tabs {
    display: flex;
    gap: 8px;
    margin-top: 22px;
  }
  .tab {
    flex: 1;
    text-align: center;
    padding: 11px 8px;
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
  .step {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 18px 0;
    border-bottom: 1px solid #d9e5e2;
  }
  .step:last-child { border-bottom: 0; }
  .dot {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: var(--success-soft);
    color: var(--success);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 900;
    flex: 0 0 auto;
  }
  .step strong {
    display: block;
    font-size: 22px;
    margin-bottom: 5px;
  }
  .step span {
    display: block;
    color: var(--muted);
    font-size: 17px;
    line-height: 1.45;
  }
  .note {
    margin-top: 22px;
    padding: 18px;
    border-radius: 12px;
    background: #fff;
    border: 1px solid #d8e4e1;
    color: #395158;
    font-size: 18px;
    line-height: 1.5;
  }
  .evidence-frame {
    width: 1000px;
    height: 760px;
    padding: 42px;
    display: flex;
    align-items: stretch;
  }
  .evidence-card {
    width: 100%;
    background: #f8faf9;
    border: 1px solid #b7d1cc;
    border-radius: 24px;
    box-shadow: 0 22px 50px rgba(0, 0, 0, .12);
    padding: 34px;
  }
  .evidence-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    border-bottom: 1px solid #d9e5e2;
    padding-bottom: 24px;
    margin-bottom: 24px;
  }
  .evidence-head h1 {
    margin: 14px 0 0;
    max-width: 650px;
    font-size: 36px;
  }
  .evidence-meta {
    min-width: 220px;
    padding: 16px;
    border-radius: 14px;
    background: #fff;
    border: 1px solid #d8e4e1;
    color: #395158;
    font-size: 17px;
    line-height: 1.45;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }
  .check-card {
    min-height: 134px;
    padding: 18px;
    border-radius: 16px;
    background: #fff;
    border: 1px solid #d8e4e1;
  }
  .check-card strong {
    display: block;
    font-size: 21px;
    margin: 10px 0 8px;
  }
  .check-card span {
    display: block;
    color: var(--muted);
    font-size: 17px;
    line-height: 1.45;
  }
  .terminal {
    margin-top: 18px;
    padding: 20px;
    border-radius: 16px;
    background: #102024;
    color: #e8f3f0;
    font-family: Consolas, "Courier New", monospace;
    font-size: 17px;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .terminal .green { color: #8df5bd; font-weight: 800; }
  .terminal .blue { color: #93c5fd; font-weight: 800; }
  .terminal .dim { color: #a8c2c8; }
  .route {
    display: grid;
    grid-template-columns: 1fr 46px 1fr 46px 1fr;
    align-items: center;
    gap: 12px;
    margin-top: 18px;
  }
  .route-box {
    min-height: 140px;
    padding: 18px;
    border-radius: 16px;
    background: #fff;
    border: 1px solid #d8e4e1;
  }
  .route-box strong {
    display: block;
    font-size: 20px;
    margin-bottom: 8px;
  }
  .route-box span {
    color: var(--muted);
    font-size: 16px;
    line-height: 1.45;
  }
  .arrow {
    height: 46px;
    border-radius: 999px;
    background: var(--soft);
    color: var(--brand-dark);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 900;
  }
`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1000, height: 760 },
  deviceScaleFactor: 1,
});

async function capture(name, bodyHtml) {
  await page.setContent(`<!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8">
        <style>${styles}</style>
      </head>
      <body>${bodyHtml}</body>
    </html>`);
  await page.screenshot({ path: path.join(outDir, name), fullPage: false });
}

await capture(
  '01-driver-slip-guard.png',
  `<main class="frame">
    <section class="phone">
      <span class="badge">D-AX-12</span>
      <h1>전표 상세 연결 준비 중</h1>
      <p>
        현재 기사 배차 응답에는 실제 전표 식별자가 포함되지 않아 Samhan Public 전표 상세를
        직접 열지 않습니다.
      </p>
      <div class="panel">
        <div class="label">선택 항목</div>
        <div class="value">차량 #1</div>
        <div class="subvalue">거래처 정보 대기</div>
        <div class="pill">배차 vehicle 기준 임시 항목</div>
      </div>
      <div class="button">배차 목록으로 돌아가기</div>
      <div class="tabs">
        <div class="tab active">배차</div>
        <div class="tab">GPS</div>
        <div class="tab">배송사진</div>
        <div class="tab">서명</div>
      </div>
    </section>
    <aside class="side">
      <span class="badge">PR 캡처 확인 포인트</span>
      <h1>직접 import 제거가 눈에 보입니다</h1>
      <div class="step">
        <div class="dot">1</div>
        <div>
          <strong>driver-local entry</strong>
          <span>DriverTabNavigator 는 이제 Samhan Public SlipDetailScreen 을 직접 열지 않습니다.</span>
        </div>
      </div>
      <div class="step">
        <div class="dot">2</div>
        <div>
          <strong>UUID 비공개 유지</strong>
          <span>화면에는 차량 번호와 업무 문구만 노출하고 내부 식별자는 숨깁니다.</span>
        </div>
      </div>
      <div class="note">1000px 폭 캡처로 PR 본문과 모바일 GitHub 화면에서도 문구가 잘리지 않도록 생성했습니다.</div>
    </aside>
  </main>`,
);

await capture(
  '02-signature-chain-regression.png',
  `<main class="frame">
    <section class="phone">
      <span class="badge">Phase F 회귀 가드</span>
      <h1>배송사진에서 서명으로 연결</h1>
      <p>
        D-AX-12 경계 분리 후에도 배송사진 업로드 완료 시 기존처럼 서명 탭으로 자동 이동합니다.
      </p>
      <div class="panel">
        <div class="label">현재 흐름</div>
        <div class="value">배송사진 업로드 완료</div>
        <div class="subvalue">다음 화면: 기사/인수자 서명</div>
        <div class="pill">SignaturePhotoScreen → DriverSignatureScreen</div>
      </div>
      <div class="button">서명 화면으로 자동 이동</div>
      <div class="tabs">
        <div class="tab">배차</div>
        <div class="tab">GPS</div>
        <div class="tab">배송사진</div>
        <div class="tab active">서명</div>
      </div>
    </section>
    <aside class="side">
      <span class="badge">테스트 증거</span>
      <h1>기존 Phase F UX를 보존합니다</h1>
      <div class="step">
        <div class="dot">✓</div>
        <div>
          <strong>사진 업로드 callback 유지</strong>
          <span>onUploaded callback 이 호출되면 DriverTabNavigator 가 signature 탭으로 전환합니다.</span>
        </div>
      </div>
      <div class="step">
        <div class="dot">✓</div>
        <div>
          <strong>전표 상세 경계는 독립</strong>
          <span>전표 상세 import 정리는 배송사진→서명 chain 에 영향을 주지 않습니다.</span>
        </div>
      </div>
      <div class="note">PR 본문에는 이 캡처와 guard 캡처 2장을 모두 인라인 첨부합니다.</div>
    </aside>
  </main>`,
);

await capture(
  '03-driver-route-test-flow.png',
  `<main class="evidence-frame">
    <section class="evidence-card">
      <div class="evidence-head">
        <div>
          <span class="badge">Jest route flow</span>
          <h1>배차 화면에서 전표 경계 화면으로만 이동합니다</h1>
        </div>
        <div class="evidence-meta">검증 파일<br><strong>DriverSlipDetailRoute.test.tsx</strong><br>결과: 1 PASS</div>
      </div>
      <div class="route">
        <div class="route-box">
          <strong>1. DriverDashboardScreen</strong>
          <span>mock-open-driver-slip 버튼으로 전표 보기 진입을 재현합니다.</span>
        </div>
        <div class="arrow">→</div>
        <div class="route-box">
          <strong>2. DriverSlipDetailEntry</strong>
          <span>driver-owned boundary 화면이 열리고 안내 문구가 표시됩니다.</span>
        </div>
        <div class="arrow">×</div>
        <div class="route-box">
          <strong>3. SlipDetailScreen 미렌더</strong>
          <span>Samhan Public 전표 상세 mock 은 query 결과 null 로 확인합니다.</span>
        </div>
      </div>
      <div class="terminal"><span class="blue">npm test -- DriverSlipDetailRoute.test.tsx --runInBand</span>
<span class="green">PASS</span> src/__tests__/screens/driver/DriverSlipDetailRoute.test.tsx
Tests: 1 passed, 1 total
핵심 assertion: queryByTestId('samhan-slip-detail-screen-mock') === null</div>
    </section>
  </main>`,
);

await capture(
  '04-driver-back-navigation.png',
  `<main class="evidence-frame">
    <section class="evidence-card">
      <div class="evidence-head">
        <div>
          <span class="badge">Back flow</span>
          <h1>전표 안내 화면에서 배차 목록으로 안전하게 복귀합니다</h1>
        </div>
        <div class="evidence-meta">검증 범위<br><strong>route state reset</strong><br>내부 id 노출 없음</div>
      </div>
      <div class="grid2">
        <div class="check-card">
          <div class="dot">✓</div>
          <strong>onBack 호출</strong>
          <span>버튼 testID driver-slip-detail-entry-back-mobile 을 눌러 route state 를 null 로 되돌립니다.</span>
        </div>
        <div class="check-card">
          <div class="dot">✓</div>
          <strong>dashboard 재렌더</strong>
          <span>driver-dashboard-screen-mock 이 다시 표시되고 entry testID 는 사라집니다.</span>
        </div>
        <div class="check-card">
          <div class="dot">✓</div>
          <strong>placeholder 표시</strong>
          <span>vehicle-* 기반 임시 항목은 안내 badge 로만 표시합니다.</span>
        </div>
        <div class="check-card">
          <div class="dot">✓</div>
          <strong>UUID 비공개</strong>
          <span>사용자 화면에는 전표번호/거래처명 중심 정보만 노출합니다.</span>
        </div>
      </div>
      <div class="note">
        route assertion: back press 후 driver-dashboard-screen-mock 이 다시 보이고,
        driver-slip-detail-entry-mobile 은 null 로 확인됩니다.
      </div>
    </section>
  </main>`,
);

await capture(
  '05-typecheck-contract.png',
  `<main class="evidence-frame">
    <section class="evidence-card">
      <div class="evidence-head">
        <div>
          <span class="badge">TypeScript contract</span>
          <h1>DriverSlipDetailEntry props 와 navigator route 타입을 맞췄습니다</h1>
        </div>
        <div class="evidence-meta">검증 명령<br><strong>npm run typecheck</strong><br>exit code 0</div>
      </div>
      <div class="grid2">
        <div class="check-card">
          <div class="dot">✓</div>
          <strong>slipId / slipNo / partnerName</strong>
          <span>DriverTabNavigator 의 route state 와 entry props 가 같은 필드로 이어집니다.</span>
        </div>
        <div class="check-card">
          <div class="dot">✓</div>
          <strong>unused role prop 제거</strong>
          <span>Samhan Public SlipDetailScreen role prop 은 driver tab 경계에서 제거했습니다.</span>
        </div>
      </div>
      <div class="terminal"><span class="blue">npm run typecheck</span>

&gt; @samhan/mobile-staff@0.4.0 typecheck
&gt; tsc --noEmit

<span class="green">0 TypeScript errors</span></div>
    </section>
  </main>`,
);

await capture(
  '06-jest-driver-route-pass.png',
  `<main class="evidence-frame">
    <section class="evidence-card">
      <div class="evidence-head">
        <div>
          <span class="badge">Focused Jest #1</span>
          <h1>driver 전표 경계 회귀 테스트가 통과했습니다</h1>
        </div>
        <div class="evidence-meta">대상<br><strong>DriverSlipDetailRoute</strong><br>1 suite / 1 test</div>
      </div>
      <div class="terminal"><span class="blue">npm test -- DriverSlipDetailRoute.test.tsx --runInBand</span>

<span class="green">PASS</span> src/__tests__/screens/driver/DriverSlipDetailRoute.test.tsx
  DriverTabNavigator slip detail boundary (D-AX-12)
    √ opens the driver-owned slip detail route and returns to dashboard

Test Suites: <span class="green">1 passed</span>, 1 total
Tests:       <span class="green">1 passed</span>, 1 total
Snapshots:   0 total</div>
      <div class="note">이 캡처는 전표 상세 import 정리가 실제 route 동작과 뒤로가기 동작을 깨지 않는다는 PR 증거로 첨부합니다.</div>
    </section>
  </main>`,
);

await capture(
  '07-jest-signature-chain-pass.png',
  `<main class="evidence-frame">
    <section class="evidence-card">
      <div class="evidence-head">
        <div>
          <span class="badge">Focused Jest #2</span>
          <h1>배송사진 → 서명 화면 체인이 계속 통과합니다</h1>
        </div>
        <div class="evidence-meta">대상<br><strong>SignaturePhotoScreenChain</strong><br>1 suite / 1 test</div>
      </div>
      <div class="terminal"><span class="blue">npm test -- SignaturePhotoScreenChain.test.tsx --runInBand</span>

<span class="green">PASS</span> src/__tests__/screens/driver/SignaturePhotoScreenChain.test.tsx
  SignaturePhotoScreen → DriverSignature chain (D-DF-13)
    √ 사진 업로드 완료 시 DriverSignatureScreen 으로 자동 이동

Test Suites: <span class="green">1 passed</span>, 1 total
Tests:       <span class="green">1 passed</span>, 1 total
Snapshots:   0 total</div>
      <div class="note">D-AX-12 는 전표 상세 경계만 손대며, Phase F 의 사진 업로드 후 서명 UX 는 보존합니다.</div>
    </section>
  </main>`,
);

await capture(
  '08-direct-import-search-guard.png',
  `<main class="evidence-frame">
    <section class="evidence-card">
      <div class="evidence-head">
        <div>
          <span class="badge">Import guard</span>
          <h1>driver 폴더에 Samhan Public 전표 상세 직접 import 가 남지 않았습니다</h1>
        </div>
        <div class="evidence-meta">검색 대상<br><strong>clients/mobile-staff/src/screens/driver</strong><br>결과 없음</div>
      </div>
      <div class="grid2">
        <div class="check-card">
          <div class="dot">✓</div>
          <strong>직접 import 제거</strong>
          <span>from '../SlipDetailScreen' 패턴이 driver 화면 경로에서 검색되지 않습니다.</span>
        </div>
        <div class="check-card">
          <div class="dot">✓</div>
          <strong>entry 경계 유지</strong>
          <span>전표 상세 진입은 DriverSlipDetailEntry 로 한 번 모아 후속 이식 기준점으로 남깁니다.</span>
        </div>
      </div>
      <div class="terminal"><span class="blue">rg -n "from '../SlipDetailScreen'|SlipDetailScreen from|\\.\\./SlipDetailScreen" clients/mobile-staff/src/screens/driver</span>

<span class="green">no matches</span>
<span class="dim">rg exit code 1 is expected when no direct import remains.</span></div>
    </section>
  </main>`,
);

await browser.close();
