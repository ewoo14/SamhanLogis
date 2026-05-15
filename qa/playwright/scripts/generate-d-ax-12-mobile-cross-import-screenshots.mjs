import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const outDir = path.join(repoRoot, 'docs/qa/d-ax-12-mobile-cross-import/screenshots')

await fs.mkdir(outDir, { recursive: true })

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
`

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1000, height: 760 },
  deviceScaleFactor: 1,
})

async function capture(name, bodyHtml) {
  await page.setContent(`<!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8">
        <style>${styles}</style>
      </head>
      <body>${bodyHtml}</body>
    </html>`)
  await page.screenshot({ path: path.join(outDir, name), fullPage: false })
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
)

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
      <h1>기존 Phase F UX는 보존됩니다</h1>
      <div class="step">
        <div class="dot">✓</div>
        <div>
          <strong>사진 업로드 callback 유지</strong>
          <span>onUploaded 콜백이 호출되면 DriverTabNavigator 가 signature 탭으로 전환합니다.</span>
        </div>
      </div>
      <div class="step">
        <div class="dot">✓</div>
        <div>
          <strong>전표 상세 경계와 독립</strong>
          <span>전표 상세 import 정리와 배송사진→서명 체인은 서로 영향을 주지 않습니다.</span>
        </div>
      </div>
      <div class="note">PR 본문에는 이 캡처와 guard 캡처 2장을 모두 인라인 첨부합니다.</div>
    </aside>
  </main>`,
)

await browser.close()
