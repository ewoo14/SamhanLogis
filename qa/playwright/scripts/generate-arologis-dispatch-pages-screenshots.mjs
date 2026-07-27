import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
// _local 격리(2026-07-27 재수렴 4차 X1 — qa/playwright 트리 관할 편입).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/arologis-dispatch-pages-extract/screenshots'))

await fs.mkdir(outDir, { recursive: true })

const styles = `
  :root {
    --bg: #f8fafc;
    --card: #ffffff;
    --line: #d9dee8;
    --ink: #172033;
    --muted: #5d667a;
    --soft: #eef2f7;
    --brand: #1d4ed8;
    --brand-soft: #dbeafe;
    --success: #059669;
    --success-soft: #d1fae5;
    --warning: #b45309;
    --warning-soft: #fef3c7;
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
  .page {
    width: 1440px;
    min-height: 960px;
    background: var(--bg);
  }
  .topbar {
    height: 58px;
    border-bottom: 1px solid var(--line);
    background: var(--card);
    display: flex;
    align-items: center;
    padding: 0 28px;
    gap: 28px;
  }
  .brand { font-size: 19px; font-weight: 700; }
  .nav { display: flex; gap: 8px; }
  .nav span {
    min-width: 86px;
    height: 32px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--muted);
  }
  .nav .active { background: var(--brand-soft); color: var(--brand); font-weight: 700; }
  .user { margin-left: auto; color: var(--muted); font-size: 12px; }
  main { padding: 28px 42px; }
  h1 { margin: 0; font-size: 28px; letter-spacing: 0; }
  .subtitle { margin: 8px 0 28px; color: var(--muted); font-size: 15px; }
  .grid { display: grid; grid-template-columns: 620px 660px; gap: 42px; }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 26px;
  }
  .panel { background: #f7f9fc; border: 1px solid var(--line); border-radius: 6px; padding: 18px; }
  h2 { margin: 0 0 18px; font-size: 19px; }
  .btn {
    display: inline-flex;
    height: 36px;
    min-width: 108px;
    border-radius: 6px;
    border: 1px solid var(--line);
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    background: var(--card);
    color: var(--muted);
  }
  .btn.primary { background: var(--brand); color: white; border-color: var(--brand); }
  .toolbar { display: flex; align-items: center; gap: 12px; margin: 0 0 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--card); }
  th, td { border-bottom: 1px solid var(--line); padding: 13px 14px; text-align: left; white-space: nowrap; }
  th { color: var(--muted); background: #f7f9fc; font-weight: 700; }
  .chip {
    display: inline-flex;
    height: 30px;
    min-width: 120px;
    padding: 0 12px;
    border-radius: 999px;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
  }
  .success { color: var(--success); background: var(--success-soft); }
  .warning { color: var(--warning); background: var(--warning-soft); }
  .danger { color: var(--danger); background: var(--danger-soft); }
  .notice { color: var(--muted); font-size: 13px; }
  .dropzone {
    height: 145px;
    border: 2px dashed var(--line);
    border-radius: 8px;
    background: #f7f9fc;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
`

function shell(title, subtitle, body) {
  return `<!doctype html>
  <html lang="ko">
    <head>
      <meta charset="utf-8" />
      <style>${styles}</style>
    </head>
    <body>
      <div class="page">
        <div class="topbar">
          <div class="brand">아로로지스</div>
          <div class="nav"><span class="active">배차</span><span>기사</span></div>
          <div class="user">관리자 (AROLOGIS_MASTER)</div>
        </div>
        <main>
          <h1>${title}</h1>
          <div class="subtitle">${subtitle}</div>
          ${body}
        </main>
      </div>
    </body>
  </html>`
}

const pages = [
  {
    name: '01-manual-dispatch.png',
    html: shell('수동 배차', '카카오 원문 참고와 차량/정차 직접 입력', `
      <div class="grid">
        <section class="card">
          <h2>카카오 원문</h2>
          <div class="panel" style="height: 220px; line-height: 1.8; white-space: pre-line;">주간 배차 샘플
1. 본사 창고
- 서울 강남구 테헤란로 123
- 거래처코드 P-2026-0501</div>
          <div style="margin-top: 22px;"><span class="btn">미리보기</span></div>
          <div class="panel" style="margin-top: 22px;">
            <h2 style="margin-bottom: 10px;">미리보기 결과 <span class="chip success">검증 완료</span></h2>
            <div class="notice">차량 1대 / 정차 2건 / 기사 자동 매칭 대기</div>
          </div>
        </section>
        <section class="card">
          <h2>배차 입력</h2>
          <table>
            <thead><tr><th>차량</th><th>톤수</th><th>정차</th><th>거래처</th><th>주소</th></tr></thead>
            <tbody>
              <tr><td>1</td><td>1톤</td><td>1</td><td>대구공조</td><td>서울 강남구 테헤란로 123</td></tr>
              <tr><td>1</td><td>1톤</td><td>2</td><td>인천냉동</td><td>인천 남동대로 45</td></tr>
            </tbody>
          </table>
          <div style="margin-top: 300px; text-align: right;"><span class="btn primary">저장</span></div>
        </section>
      </div>`),
  },
  {
    name: '02-pre-classify.png',
    html: shell('가배차 분류', '출고 전표를 권역과 수도권 접두어 기준으로 분류', `
      <div class="toolbar">
        <span class="btn primary">권역</span><span class="btn">수도권</span>
        <span class="notice" style="margin-left: auto;">실시간 자동 갱신 - 30초</span>
      </div>
      <section class="card">
        <h2>서울 권역 (3건)</h2>
        <table>
          <thead><tr><th>전표번호</th><th>거래처코드</th><th>거래처</th><th>주소</th><th>상태</th></tr></thead>
          <tbody>
            <tr><td>W10-001</td><td>1001</td><td>대구공조</td><td>서울 강남구</td><td><span class="chip success">배차됨</span></td></tr>
            <tr><td>W10-002</td><td>1002</td><td>서울냉동</td><td>서울 송파구</td><td><span class="chip warning">미배차</span></td></tr>
          </tbody>
        </table>
        <div class="panel" style="margin-top: 32px; border-color: var(--warning); background: var(--warning-soft);">
          <h2 style="color: var(--warning);">미분류 거래처 (1건)</h2>
          <div style="color: var(--warning);">주소가 권역 기준 데이터와 일치하지 않습니다.</div>
        </div>
      </section>`),
  },
  {
    name: '03-unassigned.png',
    html: shell('미배차 리스트', '미배차 전표를 확인하고 수동 배차로 바로 이동', `
      <div class="toolbar">
        <span class="btn primary">조회</span><span class="btn">CSV 다운로드</span>
        <span class="notice" style="margin-left: auto;">실시간 자동 갱신 - 30초</span>
      </div>
      <section class="card">
        <h2>2026-05-15 - 미배차 3건 / 전체 17건</h2>
        <table>
          <thead><tr><th>전표번호</th><th>거래처코드</th><th>거래처</th><th>주소</th><th>작업</th></tr></thead>
          <tbody>
            <tr><td>W10-101</td><td>2001</td><td>부산공조</td><td>부산 해운대구</td><td><span class="btn">수동 배차로 이동</span></td></tr>
            <tr><td>W10-102</td><td>2002</td><td>광주냉동</td><td>광주 북구</td><td><span class="btn">수동 배차로 이동</span></td></tr>
            <tr><td>W10-103</td><td>-</td><td>미연결 거래처</td><td>대전 서구</td><td><span class="btn">수동 배차로 이동</span></td></tr>
          </tbody>
        </table>
      </section>`),
  },
  {
    name: '04-reconcile.png',
    html: shell('실배차 비교', '운송사 엑셀 파일과 내부 배차 기록 비교', `
      <div class="dropzone">
        <h2 style="margin: 0;">운송사 .xlsx 파일을 끌어오거나 클릭하여 선택</h2>
        <div class="notice">.xlsx만 허용 - 파일당 최대 5MB - 다중 업로드 지원</div>
      </div>
      <div class="toolbar" style="margin-top: 24px;">
        <span class="btn primary">비교 실행</span>
        <span class="chip success">일치 128</span>
        <span class="chip warning">운송사 누락 2</span>
        <span class="chip danger">내부 누락 1</span>
      </div>
      <section class="card">
        <table>
          <thead><tr><th>상태</th><th>전표번호</th><th>일자</th><th>운송사</th><th>내부 시간</th><th>운송사 시간</th><th>비고</th></tr></thead>
          <tbody>
            <tr><td>운송사 누락</td><td>W10-301</td><td>2026-05-15</td><td>-</td><td>10:30</td><td>-</td><td>운송사 파일에 없음</td></tr>
            <tr><td>내부 누락</td><td>W10-302</td><td>2026-05-15</td><td>CJ</td><td>-</td><td>11:20</td><td>내부 배차 없음</td></tr>
          </tbody>
        </table>
      </section>`),
  },
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })

for (const item of pages) {
  await page.setContent(item.html, { waitUntil: 'load' })
  await page.screenshot({
    path: path.join(outDir, item.name),
    fullPage: false,
  })
  console.log(`saved: ${path.join(outDir, item.name)}`)
}

await browser.close()
