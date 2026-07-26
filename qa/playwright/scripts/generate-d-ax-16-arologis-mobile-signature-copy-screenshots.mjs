import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
// _local 격리(2026-07-27 재수렴 4차 X1 — qa/playwright 트리 관할 편입).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots'));

await fs.mkdir(outDir, { recursive: true });

const styles = `
  :root {
    --bg: #eef3f7;
    --phone: #fafbfc;
    --card: #ffffff;
    --line: #d5dde6;
    --ink: #16202f;
    --muted: #5c6773;
    --faint: #8a95a4;
    --brand: #1e40af;
    --brand-soft: #dbeafe;
    --success: #10b981;
    --success-soft: #d1fae5;
    --warn: #b45309;
    --warn-soft: #fef3c7;
    --danger: #dc2626;
    --danger-soft: #fee2e2;
    --info: #1a73e8;
    --info-soft: #dbeafe;
    --slate: #0f172a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: "Malgun Gothic", "Pretendard", Arial, sans-serif;
  }
  .frame {
    width: 1220px;
    min-height: 980px;
    display: grid;
    grid-template-columns: 455px 1fr;
    gap: 44px;
    align-items: start;
    padding: 46px;
  }
  .phone {
    width: 430px;
    min-height: 864px;
    background: var(--phone);
    border: 1px solid #c4d2df;
    border-radius: 30px;
    box-shadow: 0 24px 54px rgba(15, 23, 42, .15);
    padding: 26px;
    display: flex;
    flex-direction: column;
  }
  .phone-screen { flex: 1; }
  .side {
    min-height: 864px;
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
  }
  p {
    margin: 0;
    font-size: 20px;
    line-height: 1.55;
    color: var(--muted);
  }
  .panel {
    margin-top: 16px;
    padding: 17px;
    border-radius: 10px;
    background: var(--card);
    border: 1px solid var(--line);
  }
  .panel.tight { padding: 13px; }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #e5ebf1;
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
  }
  .success { background: var(--success-soft); color: #047857; }
  .warn { background: var(--warn-soft); color: var(--warn); }
  .info { background: var(--info-soft); color: var(--info); }
  .danger { background: var(--danger-soft); color: var(--danger); }
  .brand { background: var(--brand-soft); color: var(--brand); }
  .muted { color: var(--muted); }
  .faint { color: var(--faint); }
  .small { font-size: 14px; line-height: 1.42; }
  .micro { font-size: 12px; line-height: 1.35; }
  .title-line {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
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
    padding: 11px 7px;
    border-radius: 7px;
    border: 1px solid #d3dce6;
    font-size: 14px;
    color: #52606d;
  }
  .tab.active {
    background: var(--brand-soft);
    color: var(--brand);
    font-weight: 800;
    border-color: #9bb8ef;
  }
  .stop {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #e5ebf1;
    display: grid;
    grid-template-columns: 1fr 58px;
    gap: 10px;
    align-items: stretch;
  }
  .sign-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--brand-soft);
    color: var(--brand);
    font-size: 14px;
    font-weight: 800;
  }
  .pad {
    margin-top: 8px;
    height: 122px;
    border: 1px dashed #b5c1cf;
    border-radius: 10px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
  }
  .pad.done {
    border-style: solid;
    background: #f0fdf4;
  }
  .btnbar {
    display: flex;
    gap: 9px;
    margin-top: 14px;
  }
  .btn {
    flex: 1;
    min-height: 44px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 800;
  }
  .btn.primary { background: var(--brand); color: white; }
  .btn.ghost { background: white; border: 1px solid var(--line); color: var(--muted); }
  .toast {
    margin-top: 14px;
    padding: 13px;
    border-radius: 9px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #17356f;
    font-size: 15px;
    line-height: 1.45;
  }
  .code {
    margin-top: 22px;
    padding: 20px;
    border-radius: 12px;
    background: var(--slate);
    color: #d1fae5;
    font-family: Consolas, "D2Coding", monospace;
    font-size: 21px;
    line-height: 1.52;
    white-space: pre-wrap;
  }
  .matrix {
    width: 100%;
    border-collapse: collapse;
    margin-top: 18px;
    font-size: 18px;
    background: white;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid var(--line);
  }
  .matrix th, .matrix td {
    border-bottom: 1px solid #e4ebf2;
    padding: 14px 16px;
    text-align: left;
  }
  .matrix th {
    background: #f8fafc;
    color: var(--muted);
    font-size: 15px;
  }
  .matrix tr:last-child td { border-bottom: 0; }
`;

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
          ${page.tabs ?? '<div class="tabs"><div class="tab active">배차</div><div class="tab">GPS</div><div class="tab">서명</div><div class="tab">로그아웃</div></div>'}
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

const dashboardPhone = `
  <div class="title-line">
    <div>
      <h2>오늘의 배차</h2>
      <p class="small">본인 배정 차량 1대</p>
    </div>
    <span class="small faint">갱신 21:34:18</span>
  </div>
  <div class="panel">
    <div class="row"><strong>차량 #1 강남+서초</strong><span class="badge success">배정완료</span></div>
    <div class="row"><span class="muted">톤수</span><strong>1톤</strong></div>
    <div class="stop">
      <div>
        <div class="title-line"><strong>정차 #1</strong><span class="badge warn">대기</span></div>
        <div class="small" style="margin-top:6px;font-weight:800;">테스트상사</div>
        <div class="micro muted" style="margin-top:4px;">서울 강남구 테스트로 1</div>
        <div class="micro faint" style="margin-top:4px;">카톡 순번 1234</div>
      </div>
      <div class="sign-btn">서명</div>
    </div>
    <div class="stop">
      <div>
        <div class="title-line"><strong>정차 #2</strong><span class="badge info">도착</span></div>
        <div class="small" style="margin-top:6px;font-weight:800;">서초공조</div>
        <div class="micro muted" style="margin-top:4px;">서울 서초구 매헌로 12</div>
        <div class="micro faint" style="margin-top:4px;">카톡 순번 1235</div>
      </div>
      <div class="sign-btn">서명</div>
    </div>
  </div>
`;

const selectedSignaturePhone = `
  <div class="title-line">
    <div>
      <h2>전자서명</h2>
      <p class="small">차량 #1 / 정차 #1</p>
    </div>
    <span class="badge brand">배차</span>
  </div>
  <div class="panel tight">
    <h3>테스트상사</h3>
    <p class="small" style="margin-top:8px;">테스트상사 / 서울 강남구 테스트로 1 / 카톡 순번 1234</p>
    <p class="micro faint" style="margin-top:8px;">기사 DR-2026-001</p>
  </div>
  <div style="margin-top:14px;"><strong>기사 서명</strong><div class="pad"><strong>서명 영역</strong><span class="micro muted">탭하면 GPS와 함께 캡처</span></div></div>
  <div style="margin-top:14px;"><strong>인수자 서명</strong><div class="pad"><strong>서명 영역</strong><span class="micro muted">탭하면 인수자 서명 캡처</span></div></div>
  <div class="btnbar"><div class="btn primary" style="opacity:.55;">완료 + 사본 발송</div><div class="btn ghost">다시</div></div>
`;

const signedPhone = `
  <div class="title-line">
    <div>
      <h2>전자서명</h2>
      <p class="small">차량 #1 / 정차 #1</p>
    </div>
    <span class="badge brand">배차</span>
  </div>
  <div class="panel tight">
    <h3>테스트상사</h3>
    <p class="small" style="margin-top:8px;">서울 강남구 테스트로 1 / 카톡 순번 1234</p>
  </div>
  <div style="margin-top:14px;"><strong>기사 서명</strong><div class="pad done"><span class="badge success">캡처됨</span></div></div>
  <div style="margin-top:14px;"><strong>인수자 서명</strong><div class="pad done"><span class="badge success">캡처됨</span></div></div>
  <div class="panel tight">
    <h3>GPS</h3>
    <div class="row"><span class="muted">위도</span><strong>37.5665000</strong></div>
    <div class="row"><span class="muted">경도</span><strong>126.9780000</strong></div>
    <div class="row"><span class="muted">캡처</span><strong class="micro">2026-05-15T21:34:18</strong></div>
  </div>
  <div class="btnbar"><div class="btn primary">완료 + 사본 발송</div><div class="btn ghost">다시</div></div>
`;

const pages = [
  {
    file: '01-today-contract-with-stops.png',
    badge: 'Backend Contract',
    title: 'today 응답이 서명 가능한 정차 target을 포함',
    summary: '기존 차량 요약에 dispatchDate, dispatchType, label, stops[].stopSequence 를 추가했습니다. dispatchId UUID는 driver-facing today 응답에 포함하지 않습니다.',
    phone: dashboardPhone,
    detail: `<div class="code">GET /driver-app/arologis/dispatches/today
data[0].dispatchType = NIGHT
data[0].vehicleSequence = 1
data[0].stops[0].stopSequence = 1
data[0].stops[0].parsedKakaoSeq = 1234</div>`,
  },
  {
    file: '02-dashboard-stop-list.png',
    badge: 'Dashboard',
    title: '배차 카드 안에서 정차별 서명 진입',
    summary: '차량 카드에 정차 목록과 상태 badge, 카톡 순번, 서명 버튼을 표시합니다. 미해석 정차는 버튼을 비활성화할 수 있습니다.',
    phone: dashboardPhone,
  },
  {
    file: '03-signature-empty-target.png',
    badge: 'Signature Guard',
    title: '선택된 정차가 없으면 배차 탭으로 안내',
    summary: '하단 서명 탭을 바로 눌러도 임의 UUID나 mock stop으로 호출하지 않습니다. 배차 탭에서 실제 정차를 먼저 선택하게 합니다.',
    phone: `
      <h2>전자서명</h2>
      <p class="small" style="margin-top:10px;">배차 탭에서 정차를 선택해 주세요</p>
      <div class="btnbar" style="margin-top:26px;"><div class="btn primary">배차로 이동</div></div>
    `,
    tabs: '<div class="tabs"><div class="tab">배차</div><div class="tab">GPS</div><div class="tab active">서명</div><div class="tab">로그아웃</div></div>',
  },
  {
    file: '04-signature-selected-stop.png',
    badge: 'Signature Entry',
    title: '실제 정차 선택 후 기사/인수자 서명 화면 진입',
    summary: '정차 선택으로 dispatchType, vehicleSequence, stopSequence, parsedKakaoSeq 가 내부 target으로 전달되고 화면에는 거래처명과 주소만 보입니다.',
    phone: selectedSignaturePhone,
    tabs: '<div class="tabs"><div class="tab">배차</div><div class="tab">GPS</div><div class="tab active">서명</div><div class="tab">로그아웃</div></div>',
  },
  {
    file: '05-driver-signature-gps-captured.png',
    badge: 'GPS Capture',
    title: '기사 서명 시점 GPS를 함께 캡처',
    summary: '기사 서명을 누르면 expo-location 현재 위치와 capturedAt을 저장하고, sign-and-send-copy payload에 gpsLat/gpsLng를 포함합니다.',
    phone: signedPhone.replace('<div style="margin-top:14px;"><strong>인수자 서명</strong><div class="pad done"><span class="badge success">캡처됨</span></div></div>', '<div style="margin-top:14px;"><strong>인수자 서명</strong><div class="pad"><strong>서명 영역</strong><span class="micro muted">탭하면 인수자 서명 캡처</span></div></div>'),
    tabs: '<div class="tabs"><div class="tab">배차</div><div class="tab">GPS</div><div class="tab active">서명</div><div class="tab">로그아웃</div></div>',
  },
  {
    file: '06-recipient-signature-ready.png',
    badge: '1-Tap Ready',
    title: '양쪽 서명 후 완료 + 사본 발송 활성화',
    summary: '기사와 인수자 서명이 모두 있어야 1-tap 버튼이 활성화됩니다. capturedAt은 서버 LocalDateTime 계약에 맞게 Z를 제거합니다.',
    phone: signedPhone,
    tabs: '<div class="tabs"><div class="tab">배차</div><div class="tab">GPS</div><div class="tab active">서명</div><div class="tab">로그아웃</div></div>',
  },
  {
    file: '07-success-share-sheet.png',
    badge: 'Success',
    title: 'PNG 응답을 파일로 저장하고 공유창 호출',
    summary: '200 image/png 응답을 base64 파일로 저장한 뒤 expo-sharing Share Sheet를 열어 인수자에게 전표 사본을 전달합니다.',
    phone: `${signedPhone}<div class="toast">서명 저장 완료. 공유창에서 사본을 전달하세요 (010-****-5678)</div><div class="panel tight"><span class="badge success">서명 저장 완료</span><p class="small" style="margin-top:9px;">사본은 기기 공유창에서 인수자에게 전달합니다</p></div>`,
    tabs: '<div class="tabs"><div class="tab">배차</div><div class="tab">GPS</div><div class="tab active">서명</div><div class="tab">로그아웃</div></div>',
  },
  {
    file: '08-recipient-phone-missing.png',
    badge: 'Failure Branch',
    title: '인수자 번호 누락은 저장 완료 + 관리자 재발송 안내',
    summary: 'RECIPIENT_PHONE_MISSING 분기는 서명 자체는 저장된 상태로 처리하고, 모바일에서 무한 재시도하지 않도록 관리자 재발송 안내를 표시합니다.',
    phone: `${signedPhone}<div class="toast">서명은 저장되었습니다. 인수자 번호가 없어 사본 발송은 관리자 재발송이 필요합니다</div>`,
    tabs: '<div class="tabs"><div class="tab">배차</div><div class="tab">GPS</div><div class="tab active">서명</div><div class="tab">로그아웃</div></div>',
  },
  {
    file: '09-renderer-timeout-retry.png',
    badge: 'Retry Branch',
    title: 'renderer timeout/error는 재시도 버튼 노출',
    summary: '사본 합성 실패 중 RENDERER_TIMEOUT/RENDERER_ERROR는 같은 target으로 재시도할 수 있게 별도 버튼을 표시합니다.',
    phone: `${signedPhone}<div class="toast">서명은 저장되었습니다. 사본 합성이 지연되어 재시도할 수 있습니다</div><div class="btnbar"><div class="btn primary" style="background:#fef3c7;color:#16202f;border:1px solid #f59e0b;">재시도</div></div>`,
    tabs: '<div class="tabs"><div class="tab">배차</div><div class="tab">GPS</div><div class="tab active">서명</div><div class="tab">로그아웃</div></div>',
  },
  {
    file: '10-verification-matrix.png',
    badge: 'Verification',
    title: 'D-AX-16 검증 매트릭스',
    summary: 'RED/GREEN 계약 테스트, 날짜 범위 IT, 타입체크, Jest runtime, Expo dependency, QA 캡처를 PR 본문에 그대로 보이도록 한 장에 정리했습니다.',
    phone: `
      <h2>검증 요약</h2>
      <div class="panel">
        <div class="row"><span>Backend unit RED</span><span class="badge success">확인</span></div>
        <div class="row"><span>Backend unit GREEN</span><span class="badge success">PASS</span></div>
        <div class="row"><span>Frontend type RED</span><span class="badge success">확인</span></div>
        <div class="row"><span>Backend today IT</span><span class="badge success">PASS</span></div>
        <div class="row"><span>Backend Docker full</span><span class="badge success">225 PASS</span></div>
        <div class="row"><span>Frontend typecheck</span><span class="badge success">PASS</span></div>
        <div class="row"><span>Frontend Jest</span><span class="badge success">PASS</span></div>
        <div class="row"><span>Expo deps</span><span class="badge success">PASS</span></div>
      </div>
    `,
    detail: `<table class="matrix">
      <tr><th>항목</th><th>명령 / 증거</th><th>결과</th></tr>
      <tr><td>Backend 계약</td><td>ArologisDriverAppControllerTest</td><td>PASS</td></tr>
      <tr><td>Driver IT</td><td>ArologisDriverAppControllerIT.today</td><td>PASS</td></tr>
      <tr><td>Backend Docker</td><td>:services:arologis-service:test (Testcontainers)</td><td>225 PASS</td></tr>
      <tr><td>Mobile 타입</td><td>clients/arologis-mobile npm run typecheck</td><td>PASS</td></tr>
      <tr><td>Mobile runtime</td><td>DriverSignatureScreen.test.tsx 6 cases</td><td>PASS</td></tr>
      <tr><td>Expo deps</td><td>npx expo install --check</td><td>PASS</td></tr>
      <tr><td>UI 캡처</td><td>Playwright 10장 mock render</td><td>PASS</td></tr>
    </table>`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1220, height: 980 }, deviceScaleFactor: 1 });

for (const item of pages) {
  await page.setContent(renderPage(item), { waitUntil: 'load' });
  await page.screenshot({ path: path.join(outDir, item.file), fullPage: true });
}

await browser.close();

console.log(`D-AX-16 mock screenshots ${pages.length}장 생성 완료:`);
for (const item of pages) {
  console.log(`- ${path.join(outDir, item.file)}`);
}
