import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
// _local 격리(2026-07-27 재수렴 4차 X1 — qa/playwright 트리 관할 편입).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/d-ax-20-arologis-admin-photo-audit/screenshots'));

await fs.mkdir(outDir, { recursive: true });

const viewport = { width: 1360, height: 920 };

const styles = `
  :root {
    --bg: #f2f5f7;
    --surface: #ffffff;
    --subtle: #f7f9fb;
    --line: #d7e0e8;
    --ink: #172033;
    --muted: #5d6878;
    --faint: #8a96a6;
    --brand: #155e75;
    --brand-soft: #dff4f7;
    --success: #0f7a50;
    --success-soft: #dcf6e9;
    --warn: #9a5b05;
    --warn-soft: #fff3c4;
    --danger: #b42318;
    --danger-soft: #fee4df;
    --info: #2756a3;
    --info-soft: #e2ebfb;
    --violet: #6d3baa;
    --violet-soft: #efe7fb;
    --slate: #101828;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: "Malgun Gothic", "Pretendard", Arial, sans-serif;
  }
  .frame {
    width: 1360px;
    height: 920px;
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 24px;
    padding: 34px;
  }
  .nav {
    background: #13212f;
    color: #dbe6ef;
    border-radius: 8px;
    padding: 22px;
    display: flex;
    flex-direction: column;
    min-height: 852px;
  }
  .nav h2 { color: white; font-size: 24px; margin: 0 0 6px; }
  .nav p { color: #9fb0bf; font-size: 14px; line-height: 1.5; margin: 0; }
  .nav-group { margin-top: 28px; display: grid; gap: 8px; }
  .nav-item {
    min-height: 42px;
    border-radius: 6px;
    padding: 11px 12px;
    font-size: 14px;
    color: #b9c7d4;
  }
  .nav-item.active { background: #22364a; color: white; font-weight: 800; }
  .nav-foot {
    margin-top: auto;
    border-top: 1px solid #33485d;
    padding-top: 18px;
    display: grid;
    gap: 10px;
  }
  .content {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 26px;
    min-height: 852px;
    overflow: hidden;
  }
  .topline {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
  }
  .eyebrow {
    display: inline-flex;
    width: max-content;
    padding: 7px 11px;
    border-radius: 999px;
    background: var(--brand-soft);
    color: var(--brand);
    font-size: 13px;
    font-weight: 800;
  }
  h1 {
    margin: 12px 0 8px;
    font-size: 34px;
    line-height: 1.16;
    letter-spacing: 0;
  }
  h2 { margin: 0; font-size: 24px; line-height: 1.25; }
  h3 { margin: 0; font-size: 18px; line-height: 1.3; }
  p { margin: 0; font-size: 17px; line-height: 1.55; color: var(--muted); }
  .small { font-size: 14px; line-height: 1.45; }
  .micro { font-size: 12px; line-height: 1.35; }
  .muted { color: var(--muted); }
  .faint { color: var(--faint); }
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: max-content;
    padding: 5px 9px;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.2;
  }
  .success { background: var(--success-soft); color: var(--success); }
  .warn { background: var(--warn-soft); color: var(--warn); }
  .danger { background: var(--danger-soft); color: var(--danger); }
  .info { background: var(--info-soft); color: var(--info); }
  .brand { background: var(--brand-soft); color: var(--brand); }
  .violet { background: var(--violet-soft); color: var(--violet); }
  .toolbar {
    margin-top: 22px;
    padding: 14px;
    border-radius: 8px;
    background: var(--subtle);
    border: 1px solid var(--line);
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1.25fr;
    gap: 12px;
  }
  .filter {
    min-height: 60px;
    border: 1px solid #dce4ec;
    border-radius: 6px;
    background: #fff;
    padding: 10px 12px;
  }
  .filter span { display: block; color: var(--faint); font-size: 12px; font-weight: 800; }
  .filter strong { display: block; margin-top: 6px; font-size: 15px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-top: 20px;
  }
  .card {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    padding: 16px;
    min-height: 144px;
  }
  .card.tint { background: #fbfcfd; }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #e6edf3;
  }
  .row:last-child { border-bottom: 0; }
  .table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    font-size: 14px;
  }
  .table th, .table td {
    border-bottom: 1px solid #e5ebf1;
    padding: 12px 13px;
    text-align: left;
    vertical-align: middle;
  }
  .table th { background: #f7f9fb; color: var(--muted); font-size: 12px; }
  .table tr:last-child td { border-bottom: 0; }
  .thumb-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-top: 22px;
  }
  .thumb-card {
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }
  .thumb {
    height: 134px;
    position: relative;
    background:
      linear-gradient(160deg, rgba(21, 94, 117, .12), rgba(15, 122, 80, .12)),
      linear-gradient(145deg, #dbeafe 0 42%, #fef3c7 42% 57%, #cbd5e1 57% 100%);
  }
  .thumb.inspect {
    background:
      radial-gradient(circle at 62% 34%, rgba(180, 35, 24, .34), transparent 18%),
      linear-gradient(145deg, #e2e8f0, #fde68a 58%, #fecaca);
  }
  .thumb.reupload {
    background:
      repeating-linear-gradient(135deg, rgba(154, 91, 5, .18) 0 10px, transparent 10px 20px),
      linear-gradient(145deg, #e2e8f0, #fef3c7);
  }
  .thumb::after {
    content: "";
    position: absolute;
    inset: 31px 34px 24px;
    border-radius: 7px;
    border: 4px solid rgba(255,255,255,.86);
    box-shadow: inset 0 0 0 2px rgba(15,23,42,.12);
  }
  .thumb-meta { padding: 12px; display: grid; gap: 8px; }
  .split {
    display: grid;
    grid-template-columns: 1.1fr .9fr;
    gap: 18px;
    margin-top: 20px;
  }
  .audit-log {
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }
  .audit-item {
    display: grid;
    grid-template-columns: 12px 1fr max-content;
    gap: 12px;
    align-items: start;
    padding: 14px;
    border-bottom: 1px solid #e6edf3;
  }
  .audit-item:last-child { border-bottom: 0; }
  .dot {
    width: 10px;
    height: 10px;
    margin-top: 5px;
    border-radius: 999px;
    background: var(--brand);
  }
  .dot.warn { background: var(--warn); }
  .dot.success { background: var(--success); }
  .map {
    min-height: 230px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background:
      linear-gradient(90deg, rgba(215,224,232,.6) 1px, transparent 1px),
      linear-gradient(0deg, rgba(215,224,232,.6) 1px, transparent 1px),
      #f8fafc;
    background-size: 38px 38px;
    position: relative;
    overflow: hidden;
  }
  .pin {
    position: absolute;
    left: 55%;
    top: 43%;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: var(--brand);
    box-shadow: 0 0 0 8px rgba(21, 94, 117, .16);
  }
  .callout {
    position: absolute;
    left: 58%;
    top: 31%;
    padding: 10px 12px;
    border-radius: 6px;
    background: #fff;
    border: 1px solid var(--line);
    box-shadow: 0 10px 26px rgba(15, 23, 42, .12);
    min-width: 190px;
  }
  .matrix {
    width: 100%;
    border-collapse: collapse;
    margin-top: 18px;
    font-size: 15px;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--line);
  }
  .matrix th, .matrix td {
    border-bottom: 1px solid #e4ebf2;
    padding: 12px 13px;
    text-align: left;
    vertical-align: top;
  }
  .matrix th { background: #f8fafc; color: var(--muted); font-size: 12px; }
  .matrix tr:last-child td { border-bottom: 0; }
  .code {
    margin-top: 18px;
    padding: 16px;
    border-radius: 8px;
    background: var(--slate);
    color: #d1fae5;
    font-family: Consolas, "D2Coding", monospace;
    font-size: 15px;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .checklist {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-top: 20px;
  }
`;

const nav = `
  <aside class="nav">
    <h2>아로로지스</h2>
    <p>관리자 사진 감사</p>
    <div class="nav-group">
      <div class="nav-item">배차 현황</div>
      <div class="nav-item active">사진 감사</div>
      <div class="nav-item">전표 매핑</div>
      <div class="nav-item">회계 리포트</div>
      <div class="nav-item">설정</div>
    </div>
    <div class="nav-foot">
      <span class="badge success">MASTER / MANAGER</span>
      <p class="micro">내부 식별자 비공개 모드</p>
    </div>
  </aside>
`;

function layout(page) {
  return `<!doctype html>
  <html lang="ko">
    <head>
      <meta charset="utf-8" />
      <style>${styles}</style>
    </head>
    <body>
      <main class="frame">
        ${nav}
        <section class="content">
          <div class="topline">
            <div>
              <span class="eyebrow">${page.badge}</span>
              <h1>${page.title}</h1>
              <p>${page.summary}</p>
            </div>
            <span class="badge ${page.statusClass ?? 'success'}">${page.status ?? 'PASS'}</span>
          </div>
          ${page.body}
        </section>
      </main>
    </body>
  </html>`;
}

const toolbar = `
  <div class="toolbar">
    <div class="filter"><span>기간</span><strong>2026-05-15</strong></div>
    <div class="filter"><span>사진 유형</span><strong>배송사진 + 검수사진</strong></div>
    <div class="filter"><span>전표번호</span><strong>2026/05/16-41</strong></div>
    <div class="filter"><span>페이지 크기</span><strong>50건</strong></div>
  </div>
`;

const tableRows = `
  <table class="table">
    <thead>
      <tr><th>전표번호</th><th>거래처</th><th>사진 유형</th><th>파일</th><th>메타</th><th>상태</th></tr>
    </thead>
    <tbody>
      <tr><td>2026/05/16-412</td><td>강남 테스트상사</td><td>배송사진</td><td>delivery-001.jpg</td><td>GPS / 촬영시각 있음</td><td><span class="badge success">정상</span></td></tr>
      <tr><td>2026/05/16-413</td><td>서초 물류센터</td><td>검수사진</td><td>inspection-002.jpg</td><td>GPS 없음</td><td><span class="badge warn">확인필요</span></td></tr>
      <tr><td>2026/05/16-414</td><td>송파 공조</td><td>배송사진</td><td>delivery-003.png</td><td>45KB</td><td><span class="badge danger">재업로드 후보</span></td></tr>
      <tr><td>2026/05/16-415</td><td>마포 샘플상회</td><td>검수사진</td><td>inspection-004.jpg</td><td>촬영시각 없음</td><td><span class="badge warn">확인필요</span></td></tr>
      <tr><td>2026/05/16-416</td><td>성동 배송지</td><td>배송사진</td><td>delivery-005.jpg</td><td>GPS / 촬영시각 있음</td><td><span class="badge success">정상</span></td></tr>
    </tbody>
  </table>
`;

const pages = [
  {
    file: '01-scope-contract.png',
    badge: 'Scope / Contract',
    title: '관리자 사진 감사의 공개 계약',
    summary: 'D-AX-20은 배송 사진을 운영자가 검토할 수 있게 하되, 원본 저장 경로와 내부 식별자는 화면과 PR 캡처에서 제외합니다.',
    body: `
      <div class="grid">
        <div class="card">
          <h3>표시 허용</h3>
          <div class="row"><span>전표번호</span><strong>2026/05/16-412</strong></div>
          <div class="row"><span>거래처</span><strong>강남 테스트상사</strong></div>
          <div class="row"><span>사진 유형</span><span class="badge info">배송사진</span></div>
        </div>
        <div class="card">
          <h3>상태 산출</h3>
          <div class="row"><span>GPS</span><span class="badge success">있음</span></div>
          <div class="row"><span>촬영시각</span><span class="badge success">captured</span></div>
          <div class="row"><span>파일 크기</span><strong>842KB</strong></div>
        </div>
        <div class="card">
          <h3>비노출</h3>
          <div class="row"><span>내부 식별자</span><span class="badge success">숨김</span></div>
          <div class="row"><span>원본 저장 경로</span><span class="badge success">숨김</span></div>
          <div class="row"><span>인증 정보</span><span class="badge success">숨김</span></div>
        </div>
      </div>
      <table class="matrix">
        <tr><th>계약</th><th>관리자 화면 표시</th><th>PR 캡처 표시</th></tr>
        <tr><td>사진 목록</td><td>전표번호 / 거래처 / 유형 / 상태</td><td>동일</td></tr>
        <tr><td>썸네일</td><td>검토 preview 만 표시</td><td>mock preview 만 표시</td></tr>
        <tr><td>감사 로그</td><td>작성자 표시명 / 행위 / 시각</td><td>동일</td></tr>
        <tr><td>민감값</td><td>표시하지 않음</td><td>표시하지 않음</td></tr>
      </table>
    `,
  },
  {
    file: '02-filter-table.png',
    badge: 'Filter Table',
    title: '필터와 목록으로 사진 감사 대상을 좁힘',
    summary: '관리자는 날짜, 사진 유형, 전표번호로 감사 후보를 좁히고 비즈니스 식별자 기준으로 row 를 확인합니다.',
    body: `${toolbar}${tableRows}`,
  },
  {
    file: '03-thumbnail-no-url.png',
    badge: 'Thumbnail Privacy',
    title: '썸네일은 보이지만 원본 경로는 보이지 않음',
    summary: '목록과 상세 영역은 검토용 preview 를 보여주고 파일명/크기/유형만 노출합니다. 원본 저장 위치와 다운로드 경로는 UI 텍스트에 포함하지 않습니다.',
    body: `
      <div class="thumb-grid">
        <div class="thumb-card"><div class="thumb"></div><div class="thumb-meta"><strong>delivery-001.jpg</strong><span class="badge success">정상</span><p class="micro">842KB / 배송사진</p></div></div>
        <div class="thumb-card"><div class="thumb inspect"></div><div class="thumb-meta"><strong>inspection-002.jpg</strong><span class="badge warn">GPS 확인</span><p class="micro">1.2MB / 검수사진</p></div></div>
        <div class="thumb-card"><div class="thumb reupload"></div><div class="thumb-meta"><strong>delivery-003.png</strong><span class="badge danger">재업로드 후보</span><p class="micro">45KB / 배송사진</p></div></div>
        <div class="thumb-card"><div class="thumb"></div><div class="thumb-meta"><strong>inspection-004.jpg</strong><span class="badge warn">촬영시각 확인</span><p class="micro">733KB / 검수사진</p></div></div>
      </div>
      <div class="grid">
        <div class="card tint"><h3>허용 정보</h3><p class="small">파일명, 파일 크기, 사진 유형, 업로드 시각, 감사 상태</p></div>
        <div class="card tint"><h3>금지 정보</h3><p class="small">내부 식별자, 원본 저장 경로, 인증 정보, object key</p></div>
        <div class="card tint"><h3>검증</h3><p class="small">generator privacy guard 가 렌더링 HTML 을 검사하고 위반 시 실패합니다.</p></div>
      </div>
    `,
  },
  {
    file: '04-reupload-candidate-badge.png',
    badge: 'Reupload Candidate',
    title: '재업로드 후보를 badge 와 사유로 분리',
    summary: '관리자는 정상 사진과 재업로드 후보를 같은 표에서 보되, 후보 row 는 badge, 사유, 권장 조치가 즉시 보이게 합니다.',
    status: 'REVIEW',
    statusClass: 'warn',
    body: `
      <div class="split">
        <div>
          <table class="table" style="margin-top:0;">
            <thead><tr><th>전표번호</th><th>거래처</th><th>사진</th><th>사유</th><th>상태</th></tr></thead>
            <tbody>
              <tr><td>2026/05/16-414</td><td>송파 공조</td><td>delivery-003.png</td><td>45KB, GPS 없음</td><td><span class="badge danger">재업로드 후보</span></td></tr>
              <tr><td>2026/05/16-415</td><td>마포 샘플상회</td><td>inspection-004.jpg</td><td>촬영시각 없음</td><td><span class="badge warn">확인필요</span></td></tr>
              <tr><td>2026/05/16-416</td><td>성동 배송지</td><td>delivery-005.jpg</td><td>정상</td><td><span class="badge success">정상</span></td></tr>
            </tbody>
          </table>
          <div class="code">재업로드 후보 사유:
- 파일 용량이 너무 작음
- 촬영 위치 정보가 없음
- 촬영 시각 정보가 없음</div>
        </div>
        <div class="card">
          <h3>권장 조치</h3>
          <div class="row"><span>저용량</span><strong>기사에게 재촬영 요청</strong></div>
          <div class="row"><span>GPS 누락</span><strong>권역/정차 정보 대조</strong></div>
          <div class="row"><span>촬영시각 누락</span><strong>업로드 시각으로 보조 판단</strong></div>
          <div class="row"><span>PR 판정</span><span class="badge success">비노출 계약 유지</span></div>
        </div>
      </div>
    `,
  },
  {
    file: '05-gps-audit-metadata.png',
    badge: 'GPS / Audit Metadata',
    title: 'GPS 와 audit metadata 는 검토 가능한 수준으로만 표시',
    summary: 'GPS 는 좌표 없이 있음/없음과 권역 수준으로만 표시하고, audit 는 사용자 표시명과 행위 중심으로 보여줍니다.',
    body: `
      <div class="split">
        <div>
          <div class="map">
            <div class="pin"></div>
            <div class="callout">
              <strong>강남 권역</strong>
              <p class="micro">촬영 위치 정보 있음</p>
              <span class="badge success" style="margin-top:8px;">좌표 미노출</span>
            </div>
          </div>
          <div class="grid" style="grid-template-columns: repeat(2, 1fr);">
            <div class="card"><h3>촬영 metadata</h3><div class="row"><span>capturedAt</span><strong>2026-05-15 21:42</strong></div><div class="row"><span>uploadedAt</span><strong>2026-05-15 21:44</strong></div></div>
            <div class="card"><h3>사진 metadata</h3><div class="row"><span>유형</span><span class="badge info">배송사진</span></div><div class="row"><span>fileSize</span><strong>842KB</strong></div></div>
          </div>
        </div>
        <div class="audit-log">
          <div class="audit-item"><span class="dot success"></span><div><strong>관리자 김검수</strong><p class="micro">사진 정상 확인</p></div><span class="badge success">21:47</span></div>
          <div class="audit-item"><span class="dot warn"></span><div><strong>배차담당 박운영</strong><p class="micro">정차 정보와 GPS 권역 대조</p></div><span class="badge warn">21:46</span></div>
          <div class="audit-item"><span class="dot"></span><div><strong>기사앱 업로드</strong><p class="micro">배송사진 2장 등록</p></div><span class="badge info">21:44</span></div>
          <div class="audit-item"><span class="dot"></span><div><strong>시스템</strong><p class="micro">재업로드 후보 rule 평가</p></div><span class="badge brand">자동</span></div>
        </div>
      </div>
    `,
  },
  {
    file: '06-verification-matrix.png',
    badge: 'Verification Matrix',
    title: 'D-AX-20 검증 매트릭스',
    summary: 'PR 본문에서 QA 근거를 빠르게 확인할 수 있도록 SQL, generator, privacy guard, 이미지 크기 기준을 한 장에 요약했습니다.',
    body: `
      <table class="matrix">
        <tr><th>검증</th><th>명령 / 위치</th><th>PASS 기준</th><th>결과</th></tr>
        <tr><td>도메인 SQL</td><td>domain-integrity-check.md</td><td>metadata/GPS/BaseEntity 위반 0 rows</td><td><span class="badge success">정의됨</span></td></tr>
        <tr><td>캡처 생성</td><td>generate-d-ax-20...ps1</td><td>PNG 7장 생성</td><td><span class="badge success">자동</span></td></tr>
        <tr><td>이미지 크기</td><td>generator stdout</td><td>각 1360x920, 25KB 초과</td><td><span class="badge success">자동</span></td></tr>
        <tr><td>비노출 guard</td><td>generator privacy scan</td><td>UUID / raw path / 인증 정보 없음</td><td><span class="badge success">자동</span></td></tr>
        <tr><td>PR 본문</td><td>docs/qa PNG inline</td><td>최소 1장, 권장 6장 이상</td><td><span class="badge info">첨부대기</span></td></tr>
      </table>
      <div class="code">.\\scripts\\generate-d-ax-20-arologis-admin-photo-audit-screenshots.ps1

expected:
generated 7 PNG files
privacy guard PASS
all images 1360x920</div>
    `,
  },
  {
    file: '07-pr-inline-capture-checklist.png',
    badge: 'PR Checklist',
    title: 'PR 본문 인라인 첨부 체크리스트',
    summary: 'D-AX-20 PR 설명에는 캡처 6장 이상을 권장하며, 각 캡처는 관리자 감사 흐름의 서로 다른 검증 포인트를 담당합니다.',
    body: `
      <div class="checklist">
        <div class="card"><h3>01 scope / contract</h3><p class="small">공개 필드와 비노출 필드가 분리되어 있는지 확인</p></div>
        <div class="card"><h3>02 filter table</h3><p class="small">필터와 목록 row 가 비즈니스 식별자로 읽히는지 확인</p></div>
        <div class="card"><h3>03 thumbnail privacy</h3><p class="small">썸네일 preview 에 원본 저장 정보가 없는지 확인</p></div>
        <div class="card"><h3>04 reupload badge</h3><p class="small">후보 badge, 사유, 조치가 같은 화면에 있는지 확인</p></div>
        <div class="card"><h3>05 GPS / audit</h3><p class="small">GPS 좌표 없이 audit metadata 가 표시되는지 확인</p></div>
        <div class="card"><h3>06 verification matrix</h3><p class="small">검증 명령과 PASS 기준이 PR 본문에서 바로 보이는지 확인</p></div>
        <div class="card"><h3>07 attachment checklist</h3><p class="small">PR 첨부 누락 방지를 위한 최종 점검 화면</p></div>
        <div class="card tint"><h3>금지 노출</h3><p class="small">UUID, 인증 정보, 원본 저장 경로, object key, 실제 개인정보</p></div>
      </div>
    `,
  },
];

const forbiddenPatterns = [
  { name: 'uuid', pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i },
  { name: 'raw-http-location', pattern: /https?:\/\//i },
  { name: 'bearer-token', pattern: /\bBearer\b/i },
  { name: 'token', pattern: /\btoken\b/i },
  { name: 'downloadUrl', pattern: /downloadUrl/i },
  { name: 'storageKey', pattern: /storageKey/i },
  { name: 'presigned', pattern: /presigned/i },
  { name: 'internal-audit-rule-id', pattern: /LOW_FILE_SIZE|GPS_MISSING|CAPTURED_AT_MISSING/i },
];

function assertPrivacy(html, file) {
  for (const item of forbiddenPatterns) {
    if (item.pattern.test(html)) {
      throw new Error(`${file} privacy guard failed: ${item.name}`);
    }
  }
}

function readPngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
const generated = [];

try {
  if (pages.length < 6) {
    throw new Error(`Expected at least 6 screenshots, got ${pages.length}`);
  }

  for (const item of pages) {
    const html = layout(item);
    assertPrivacy(html, item.file);
    const target = path.join(outDir, item.file);
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: target, fullPage: false });
    const buffer = await fs.readFile(target);
    const size = readPngSize(buffer);

    if (size.width !== viewport.width || size.height !== viewport.height) {
      throw new Error(`${item.file} size mismatch: ${size.width}x${size.height}`);
    }
    if (buffer.length <= 25_000) {
      throw new Error(`${item.file} too small: ${buffer.length} bytes`);
    }

    generated.push({ file: target, bytes: buffer.length, ...size });
  }
} finally {
  await browser.close();
}

console.log(`D-AX-20 arologis admin photo audit screenshots ${generated.length} generated:`);
for (const item of generated) {
  console.log(`- ${item.file} (${item.width}x${item.height}, ${item.bytes} bytes)`);
}
console.log('privacy guard PASS');
