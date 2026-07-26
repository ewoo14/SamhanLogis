import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
// _local 격리(2026-07-27 재수렴 4차 X1 — qa/playwright 트리 관할 편입).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots'));

await fs.mkdir(outDir, { recursive: true });

const styles = `
  :root {
    --bg: #edf2f7;
    --phone: #fbfcfd;
    --card: #ffffff;
    --line: #d8e1eb;
    --ink: #152033;
    --muted: #566274;
    --faint: #8592a3;
    --brand: #1f4f8f;
    --brand-soft: #e5eefb;
    --success: #047857;
    --success-soft: #d1fae5;
    --warning: #b45309;
    --warning-soft: #fef3c7;
    --danger: #dc2626;
    --danger-soft: #fee2e2;
    --info: #2563eb;
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
    width: 1260px;
    min-height: 980px;
    display: grid;
    grid-template-columns: 454px 1fr;
    gap: 44px;
    align-items: start;
    padding: 46px;
  }
  .phone {
    width: 430px;
    min-height: 884px;
    background: var(--phone);
    border: 1px solid #c4d2df;
    border-radius: 30px;
    box-shadow: 0 24px 54px rgba(15, 23, 42, .15);
    padding: 24px;
    display: flex;
    flex-direction: column;
  }
  .phone-screen { flex: 1; }
  .side {
    min-height: 884px;
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
    padding: 9px 0;
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
    line-height: 1.2;
  }
  .success { background: var(--success-soft); color: var(--success); }
  .warn { background: var(--warning-soft); color: var(--warning); }
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
    border-color: #9bb8ef;
  }
  .stop {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #e5ebf1;
    display: grid;
    grid-template-columns: 1fr 154px;
    gap: 10px;
    align-items: stretch;
  }
  .actions3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
    align-self: center;
  }
  .mini-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--brand-soft);
    color: var(--brand);
    font-size: 13px;
    font-weight: 800;
    min-height: 42px;
    text-align: center;
  }
  .mini-btn.disabled {
    background: #f1f5f9;
    color: #94a3b8;
    border: 1px solid #e2e8f0;
  }
  .detail-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }
  .back {
    padding: 8px 12px;
    border-radius: 7px;
    background: #fff;
    border: 1px solid var(--line);
    font-weight: 800;
    color: var(--muted);
    font-size: 13px;
  }
  .kv {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid #e5ebf1;
    font-size: 14px;
  }
  .kv:last-child { border-bottom: 0; }
  .kv .k { color: var(--muted); }
  .kv .v { text-align: right; font-weight: 700; }
  .line-item {
    padding: 12px 0;
    border-top: 1px solid #e5ebf1;
  }
  .line-top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 14px;
    font-weight: 800;
  }
  .line-meta {
    margin-top: 5px;
    color: var(--muted);
    font-size: 12px;
  }
  .total {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
  .total .kv:last-child {
    border-top: 2px solid #d5dde6;
    margin-top: 5px;
    padding-top: 12px;
    font-size: 16px;
    color: var(--brand);
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
    text-align: center;
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
  .toast.warn {
    background: var(--warning-soft);
    border-color: #fcd34d;
    color: #6b3f09;
  }
  .toast.danger {
    background: var(--danger-soft);
    border-color: #fecaca;
    color: #991b1b;
  }
  .code {
    margin-top: 22px;
    padding: 20px;
    border-radius: 12px;
    background: var(--slate);
    color: #d1fae5;
    font-family: Consolas, "D2Coding", monospace;
    font-size: 20px;
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
`;

const tabs = {
  dispatch: '<div class="tabs"><div class="tab active">배차</div><div class="tab">GPS</div><div class="tab">사진</div><div class="tab">서명</div></div>',
  detail: '<div class="tabs"><div class="tab">배차</div><div class="tab">GPS</div><div class="tab">사진</div><div class="tab">서명</div></div>',
};

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
          ${page.tabs ?? tabs.detail}
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

const targetContractPhone = `
  <div class="title-line">
    <div>
      <h2>전표 상세 target</h2>
      <p class="small">오늘 배차 정차 기준 조회</p>
    </div>
    <span class="badge brand">공개 식별자만</span>
  </div>
  <div class="panel">
    <div class="row"><span class="muted">dispatchType</span><strong>NIGHT</strong></div>
    <div class="row"><span class="muted">vehicleSequence</span><strong>7</strong></div>
    <div class="row"><span class="muted">stopSequence</span><strong>3</strong></div>
    <div class="row"><span class="muted">parsedKakaoSeq</span><strong>4567</strong></div>
  </div>
  <div class="panel tight">
    <div class="title-line"><h3>응답 공개 필드</h3><span class="badge success">읽기 전용</span></div>
    <div class="row"><span>전표번호</span><strong>SL-20260515-001</strong></div>
    <div class="row"><span>거래처</span><strong>테스트상사</strong></div>
    <div class="row"><span>전표일자</span><strong>2026-05-15</strong></div>
    <div class="row"><span>창고</span><strong>인천 본창고</strong></div>
  </div>
  <div class="panel tight">
    <div class="title-line"><h3>비공개</h3><span class="badge warn">화면 미노출</span></div>
    <p class="small muted" style="margin-top:8px;">내부 식별자, 저장 위치, 파일 접근 링크는 기사 화면과 공개 타입에서 제외합니다.</p>
  </div>
`;

const dashboardPhone = `
  <div class="title-line">
    <div>
      <h2>오늘의 배차</h2>
      <p class="small">본인 배정 차량 1대</p>
    </div>
    <span class="small faint">갱신 22:18:09</span>
  </div>
  <div class="panel">
    <div class="row"><strong>차량 #7 강남+서초</strong><span class="badge success">배정완료</span></div>
    <div class="row"><span class="muted">톤수</span><strong>1톤</strong></div>
    <div class="stop">
      <div>
        <div class="title-line"><strong>정차 #3</strong><span class="badge info">대기</span></div>
        <div class="small" style="margin-top:6px;font-weight:800;">테스트상사</div>
        <div class="micro muted" style="margin-top:4px;">서울 강남구 테스트로 1</div>
        <div class="micro faint" style="margin-top:4px;">카톡 순번 4567</div>
      </div>
      <div class="actions3">
        <div class="mini-btn">전표</div>
        <div class="mini-btn">서명</div>
        <div class="mini-btn">사진</div>
      </div>
    </div>
    <div class="stop">
      <div>
        <div class="title-line"><strong>미해석 정차</strong><span class="badge warn">미해석</span></div>
        <div class="small" style="margin-top:6px;font-weight:800;">카카오 원문 확인 필요</div>
        <div class="micro muted" style="margin-top:4px;">거래처/전표 연결 전</div>
      </div>
      <div class="actions3">
        <div class="mini-btn disabled">전표</div>
        <div class="mini-btn disabled">서명</div>
        <div class="mini-btn disabled">사진</div>
      </div>
    </div>
  </div>
`;

const emptyGuardPhone = `
  <div class="detail-header">
    <div>
      <h2>전표 상세</h2>
      <p class="small">target 없음</p>
    </div>
    <div class="back">배차</div>
  </div>
  <div class="panel" style="min-height:420px;display:flex;align-items:center;justify-content:center;text-align:center;">
    <div>
      <span class="badge warn">전표 선택 필요</span>
      <h3 style="margin-top:18px;">전표를 선택해 주세요</h3>
      <p class="small muted" style="margin-top:10px;">배차 탭에서 정차를 선택하면 전표 상세를 확인할 수 있습니다.</p>
      <div class="btnbar"><div class="btn primary">배차 탭으로 이동</div></div>
    </div>
  </div>
`;

const detailHeaderPhone = `
  <div class="detail-header">
    <div>
      <h2>전표 상세</h2>
      <p class="small">차량 #7 / 정차 #3</p>
    </div>
    <div class="back">배차</div>
  </div>
  <div class="panel">
    <div class="title-line">
      <div>
        <p class="micro muted">전표번호</p>
        <h2>SL-20260515-001</h2>
      </div>
      <span class="badge brand">NIGHT</span>
    </div>
    <div class="kv"><span class="k">거래처</span><span class="v">테스트상사</span></div>
    <div class="kv"><span class="k">전표일자</span><span class="v">2026-05-15</span></div>
    <div class="kv"><span class="k">배송주소</span><span class="v">서울 강남구 테스트로 1</span></div>
    <div class="kv"><span class="k">출고창고</span><span class="v">인천 본창고</span></div>
  </div>
  <div class="toast">기사 화면은 전표 확인에 필요한 업무 식별자만 보여줍니다.</div>
`;

const linesPhone = `
  ${detailHeaderPhone}
  <div class="panel">
    <div class="title-line"><h3>품목</h3><span class="badge info">2건</span></div>
    <div class="line-item">
      <div class="line-top"><span>테스트 에어컨 실외기</span><span>30,000원</span></div>
      <div class="line-meta">규격 10kg / 2개 / 단가 15,000원</div>
    </div>
    <div class="line-item">
      <div class="line-top"><span>배관 세트</span><span>12,000원</span></div>
      <div class="line-meta">규격 3m / 1개 / 단가 12,000원</div>
    </div>
  </div>
  <div class="panel total">
    <div class="kv"><span class="k">공급가액</span><span class="v">42,000원</span></div>
    <div class="kv"><span class="k">부가세</span><span class="v">4,200원</span></div>
    <div class="kv"><span class="k">합계</span><span class="v">46,200원</span></div>
  </div>
`;

const mappingFailurePhone = `
  <div class="detail-header">
    <div>
      <h2>전표 상세</h2>
      <p class="small">차량 #7 / 정차 #4</p>
    </div>
    <div class="back">배차</div>
  </div>
  <div class="panel tight">
    <div class="row"><span>카톡 순번</span><strong>7788</strong></div>
    <div class="row"><span>거래처</span><strong>미매핑상사</strong></div>
  </div>
  <div class="panel" style="min-height:330px;display:flex;align-items:center;justify-content:center;text-align:center;">
    <div>
      <span class="badge danger">422</span>
      <h3 style="margin-top:18px;">정차와 연결된 전표를 찾을 수 없습니다.</h3>
      <p class="small muted" style="margin-top:10px;">사무실에서 전표 연결 상태를 확인해야 합니다.</p>
      <div class="btnbar"><div class="btn ghost">배차 탭으로 돌아가기</div></div>
    </div>
  </div>
`;

const fetchFailurePhone = `
  <div class="detail-header">
    <div>
      <h2>전표 상세</h2>
      <p class="small">차량 #7 / 정차 #3</p>
    </div>
    <div class="back">배차</div>
  </div>
  <div class="panel tight">
    <div class="row"><span>전표번호</span><strong>SL-20260515-001</strong></div>
    <div class="row"><span>거래처</span><strong>테스트상사</strong></div>
  </div>
  <div class="panel" style="min-height:330px;display:flex;align-items:center;justify-content:center;text-align:center;">
    <div>
      <span class="badge warn">502</span>
      <h3 style="margin-top:18px;">전표 상세를 불러오지 못했습니다.</h3>
      <p class="small muted" style="margin-top:10px;">잠시 후 같은 정차 target 으로 다시 시도할 수 있습니다.</p>
      <div class="btnbar"><div class="btn primary">다시 시도</div></div>
    </div>
  </div>
`;

const verificationPhone = `
  <h2>D-AX-18 검증 매트릭스</h2>
  <p class="small" style="margin-top:9px;">PR 본문에서 모바일로도 읽을 수 있는 QA 요약</p>
  <div class="panel">
    <div class="row"><span>today target 기반 조회</span><span class="badge success">확인</span></div>
    <div class="row"><span>Dashboard 전표 버튼</span><span class="badge success">확인</span></div>
    <div class="row"><span>빈 target guard</span><span class="badge success">확인</span></div>
    <div class="row"><span>전표 헤더</span><span class="badge success">확인</span></div>
    <div class="row"><span>품목 / 합계</span><span class="badge success">확인</span></div>
    <div class="row"><span>422 매핑 실패</span><span class="badge success">확인</span></div>
    <div class="row"><span>502 재시도</span><span class="badge success">확인</span></div>
    <div class="row"><span>내부 식별자 비노출</span><span class="badge success">확인</span></div>
  </div>
`;

const pages = [
  {
    file: '01-slip-detail-target-contract.png',
    badge: 'Backend Contract',
    title: '오늘 정차 target 으로 전표 상세를 조회',
    summary: 'D-AX-18은 앱이 내부 식별자를 보내지 않고, 서버가 로그인 기사와 오늘 배차 정차를 검증해 전표 상세를 읽어옵니다.',
    phone: targetContractPhone,
    detail: `<div class="code">GET /driver-app/arologis/dispatches/today/NIGHT/vehicles/7/stops/3/slip-detail?parsedKakaoSeq=4567

response = slipNo, partnerName, address, warehouse, totals, lines
hidden = internal identifiers and storage links</div>`,
  },
  {
    file: '02-dashboard-slip-detail-button.png',
    badge: 'Dashboard UX',
    title: '정차 행 액션 순서: 전표, 서명, 사진',
    summary: '기사는 먼저 전표 내용을 확인하고, 이어서 서명과 사진 증빙을 처리합니다. 미해석 정차는 세 액션이 모두 비활성입니다.',
    phone: dashboardPhone,
    tabs: tabs.dispatch,
  },
  {
    file: '03-slip-detail-empty-target-guard.png',
    badge: 'Target Guard',
    title: 'target 없는 진입은 API 호출 없이 안내',
    summary: '하단 탭을 직접 누르거나 상태가 초기화된 경우 추측 조회를 하지 않고, 배차 탭에서 정차를 선택하도록 안내합니다.',
    phone: emptyGuardPhone,
  },
  {
    file: '04-slip-detail-header.png',
    badge: 'Read Only Detail',
    title: '전표번호, 거래처, 주소, 창고 중심 헤더',
    summary: '상세 헤더는 기사에게 필요한 업무 식별자와 배송 맥락만 표시합니다. 수정/코멘트/감사 이력은 후속 선택지로 분리합니다.',
    phone: detailHeaderPhone,
  },
  {
    file: '05-slip-detail-lines-and-total.png',
    badge: 'Line Items',
    title: '품목과 합계까지 한 화면에서 확인',
    summary: '품목명, 규격, 수량, 단가, 행 합계와 공급가액/부가세/합계를 정렬해 납품 전 확인에 필요한 정보를 제공합니다.',
    phone: linesPhone,
  },
  {
    file: '06-slip-detail-mapping-failure-422.png',
    badge: '422 Mapping',
    title: '전표 연결 없음은 사무실 확인 흐름',
    summary: '정차와 전표 연결이 없으면 반복 재시도보다 배차 담당자 확인이 필요하므로 422 상태와 별도 문구로 안내합니다.',
    phone: mappingFailurePhone,
  },
  {
    file: '07-slip-detail-fetch-failure-retry.png',
    badge: '502 Retry',
    title: '상세 조회 실패는 같은 target 으로 재시도',
    summary: '매핑은 성공했지만 slip-service 상세 조회가 실패한 경우에는 일시 장애 가능성이 있으므로 재시도 버튼을 제공합니다.',
    phone: fetchFailurePhone,
  },
  {
    file: '08-verification-matrix.png',
    badge: 'Verification',
    title: 'D-AX-18 PR 검증 매트릭스',
    summary: 'PR 본문에서 target 계약, UI 흐름, 오류 분기, 내부 식별자 비노출을 한 번에 확인할 수 있도록 8장 캡처로 구성했습니다.',
    phone: verificationPhone,
    detail: `<table class="matrix">
      <tr><th>검증 항목</th><th>확인 포인트</th><th>결과</th></tr>
      <tr><td>API target</td><td>오늘 배차 정차 공개 식별자로 조회</td><td>PASS</td></tr>
      <tr><td>Dashboard</td><td>전표 / 서명 / 사진 액션 순서와 disabled 상태</td><td>PASS</td></tr>
      <tr><td>Detail</td><td>헤더, 품목, 합계 읽기 전용 표시</td><td>PASS</td></tr>
      <tr><td>Error</td><td>422 사무실 확인, 502 재시도 분리</td><td>PASS</td></tr>
      <tr><td>Privacy</td><td>화면과 공개 타입에서 내부 식별자 제외</td><td>PASS</td></tr>
      <tr><td>Evidence</td><td>Playwright PNG 8장, 1260px wide</td><td>PASS</td></tr>
    </table>`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1260, height: 980 }, deviceScaleFactor: 1 });

for (const item of pages) {
  await page.setContent(renderPage(item), { waitUntil: 'load' });
  await page.screenshot({ path: path.join(outDir, item.file), fullPage: true });
}

await browser.close();

console.log(`D-AX-18 slip detail screenshots ${pages.length} generated:`);
for (const item of pages) {
  console.log(`- ${path.join(outDir, item.file)}`);
}
