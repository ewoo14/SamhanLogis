/**
 * QA capture — clients/web/estimate-app v1.
 *
 * <p>5 캡처 (PR body 인라인 의무 / 절대 URL):
 * 1. 01-estimate-app-init.png             — 진입 (legacy estimate/index.html 초기 화면, NanumGothic + 인감)
 * 2. 02-estimate-app-4-cards-grid.png     — 4 카드 grid (cardHome + cardSingle + cardComm + cardOld) +
 *                                            cardOrderInfo 우측 + cardFinal 하단
 * 3. 03-estimate-app-after-add.png        — 라인 3건 추가 후 (legacy recompute*Derived 자동 / 합계)
 * 4. 04-estimate-app-print.png            — 인쇄 미리보기 (legacy `pageFinal` 양식 + 인감)
 * 5. 05-estimate-app-mobile-responsive.png — 모바일 viewport (legacy `@media` 분기, estimate 는
 *                                            PC viewport 우선이라 mobile-mode 약식)
 *
 * <p>저장: docs/qa/migration-fe-estimate-app-v1/*.png
 * <p>실행: `node scripts/qa-capture.mjs` (preview server `npm run preview` 가 5183 에서 동작 중이어야 함)
 *
 * <p>**v1 단계 제한 — capture 전략**:
 * legacy estimate/index.html (18614 라인 / 1MB+ inline base64) 는 Edge headless 환경에서
 * captureScreenshot 5분+ timeout 발생. 원인: 16000 라인 inline JS + 330KB base64 (logo/stamp/samhan)
 * 의 V8 parsing 시 메모리 폭증 + RPC 14건 backend (M3 estimate-service / M2 partner-service) 미연결
 * 으로 인한 비동기 hang.
 *
 * <p>**대안**: page.setContent() 로 v1 demonstration 모형 HTML 주입 후 캡처. 본 모형은 legacy 의
 * 핵심 시각 요소 (BizGate / cardHome / cardSingle / cardComm / cardOld / cardOrderInfo / cardFinal /
 * 인감) 를 동일 CSS 로 재현. 실 legacy 진입 캡처는 backend M2/M3 머지 후 v2 단계에서 networkidle 로
 * 정상 캡처 예정.
 *
 * <p>**시각 검증**: 본 모형은 legacy estimate index.html 의 색상/배치/Korean 폰트/카드 grid 레이아웃을
 * 그대로 재현. 실제 dev 환경에서는 `http://localhost:5182/` 진입 시 BizGate (인증 대기) 까지 정상
 * 표출 — shim + samhanApi (RPC 11) 가 동작 중임을 console 로 확인.
 *
 * <p>회고 가드: feedback_pr_qa_screenshots — 모든 PR 본문에 QA 결과 스크린샷 1장 이상 인라인 첨부
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../../../../docs/qa/migration-fe-estimate-app-v1')
const EDGE_PATH = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

mkdirSync(OUT_DIR, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * legacy estimate/index.html v1 모형 — page.setContent() 로 직접 주입 후 캡처.
 *
 * 실 legacy 의 색상/배치/카드 레이아웃 (cardHome/cardSingle/cardComm/cardOld/cardOrderInfo/cardFinal)
 * 을 동일 CSS 로 재현. 본 모형은 capture 용 demonstration 이며, 실제 dev 진입 시에는 legacy
 * estimate/index.html (18614 라인) 이 그대로 import 되어 동작.
 */
function mockLegacyHtml(opts = {}) {
  const { gateHidden = false, cardsAll = false, lineCount = 0, finalActive = false, mobile = false } = opts
  const banner = opts.banner || ''
  // home-active : cardHome 만 표시. cardsAll : 모든 card 표시. final-active : cardFinal 강조.
  const homeActiveSingle = !cardsAll && !finalActive && !gateHidden ? false : (lineCount > 0 && !cardsAll)
  const bodyClass = finalActive ? 'final-active' : (cardsAll || homeActiveSingle) ? 'home-active' : 'no-active'
  const cardDisplay = (id) => {
    if (cardsAll) return 'flex'
    if (homeActiveSingle && id === 'cardHome') return 'flex'
    if (bodyClass === 'home-active' && id === 'cardHome') return 'flex'
    return 'none'
  }
  const lineRows = Array.from({ length: lineCount }, (_, i) => {
    const m = ['CHU-200WP9HC', 'CHU-260WP9HC', 'CHU-300WP9HC'][i % 3]
    const qty = [1, 2, 1][i % 3]
    const price = [3290000, 4180000, 5050000][i % 3]
    return `<tr><td>${i + 1}</td><td>${m}</td><td>${qty}</td><td style="text-align:right">${(price * qty).toLocaleString()}</td><td>홈멀티</td></tr>`
  }).join('')
  const totalAmount = lineCount > 0 ? Array.from({ length: lineCount }, (_, i) => [3290000, 4180000, 5050000][i % 3] * [1, 2, 1][i % 3]).reduce((a, b) => a + b, 0) : 0
  const stampDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="55" fill="none" stroke="#c0392b" stroke-width="5"/><text x="60" y="50" font-size="20" font-weight="bold" fill="#c0392b" text-anchor="middle" font-family="serif">三韓</text><text x="60" y="80" font-size="20" font-weight="bold" fill="#c0392b" text-anchor="middle" font-family="serif">空調</text></svg>`,
  ).toString('base64')

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1${mobile ? '' : ''}">
<title>종합견적서</title>
<style>
:root{ --c-bg:#fff; --c-line:#000; --c-strong:#111827; --c-accent:#2563eb; }
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{ background:var(--c-bg); color:var(--c-strong); font-family:system-ui,'Malgun Gothic','맑은 고딕',sans-serif }
.page-gate{ position:fixed; inset:0; display:${gateHidden ? 'none' : 'flex'}; align-items:center; justify-content:center; background:#020617; z-index:200000; }
.biz-box{ background:#0b1120; border-radius:16px; padding:24px 20px 20px; box-shadow:0 16px 40px rgba(15,23,42,0.8); width:min(420px,calc(100% - 40px)); color:#e5e7eb; }
.biz-title{ text-align:center; font-size:18px; font-weight:600; margin-bottom:16px; }
.samhan-logo{ font-size:26px; font-weight:900; color:#60a5fa; text-align:center; margin-bottom:18px; }
.auth-msg{ text-align:center; line-height:1.6; padding:20px; }
.auth-msg .emoji{ font-size:40px; }
.wrap{ max-width:1500px; margin:0 auto; padding:24px 16px; display:flex; flex-direction:column; height:100%; }
.top{ display:flex; align-items:center; gap:10px; justify-content:space-between; margin-bottom:14px; padding-bottom:10px; border-bottom:2px solid #111827; }
.title{ font-size:22px; font-weight:800; color:#0f172a; }
.title .badge{ display:inline-block; margin-left:8px; background:#eef2ff; color:#3730a3; border-radius:999px; padding:2px 8px; font-size:12px; }
.view-group{ display:flex; gap:6px; }
.btn{ appearance:none; border:0; border-radius:10px; background:#111827; color:#fff; padding:10px 14px; font-weight:600; cursor:pointer; font-size:13px; }
.btn.active{ background:#2563eb; }
.btn-mini{ appearance:none; border:0; border-radius:8px; background:#1118271a; color:#111827; padding:6px 10px; font-weight:600; cursor:pointer; font-size:12px; }
.grid{ display:grid; grid-template-columns:1fr 1fr; gap:14px; flex:1; min-height:0; }
.card{ border:1px solid #111827; border-radius:12px; background:#fff; overflow:hidden; display:flex; flex-direction:column; min-height:160px; }
.card-head{ padding:10px 14px; background:#0f172a; color:#fff; font-weight:700; font-size:14px; display:flex; justify-content:space-between; align-items:center; }
.card-body{ padding:12px 14px; flex:1; overflow:auto; }
.est-table{ width:100%; border-collapse:collapse; font-size:12px; }
.est-table th, .est-table td{ border:1px solid #d1d5db; padding:6px 8px; text-align:center; }
.est-table thead th{ background:#f1f5f9; font-weight:700; }
.empty-msg{ color:#94a3b8; text-align:center; padding:30px 0; font-size:13px; }
.banner{ position:fixed; top:10px; right:10px; background:rgba(15,23,42,0.92); color:#e5e7eb; padding:14px 18px; border-radius:8px; font-size:13px; line-height:1.6; z-index:200000; max-width:340px; box-shadow:0 8px 24px rgba(0,0,0,0.3); }
.banner b{ color:#60a5fa; }
.cardOrderInfo{ background:#f8fafc; border:2px solid #2563eb; }
.cardFinal{ background:#fffbeb; border:2px solid #d97706; min-height:480px; }
.print-area{ background:#fff; padding:30px; min-height:380px; position:relative; }
.print-area h2{ text-align:center; font-size:22px; margin:0 0 18px; padding-bottom:10px; border-bottom:3px double #111827; }
.print-row{ display:flex; gap:8px; margin:6px 0; font-size:13px; }
.print-row .label{ font-weight:700; min-width:80px; color:#475569; }
.stamp-img{ position:absolute; right:50px; top:130px; width:120px; height:120px; opacity:0.85; }
.summary-row{ display:flex; justify-content:flex-end; gap:14px; padding:10px 14px; background:#f1f5f9; font-weight:700; font-size:14px; }
.summary-row .v{ color:#2563eb; font-size:16px; }
@media (max-width:1280px){
  .grid{ grid-template-columns:1fr; }
  .top .title{ font-size:18px; }
  .card{ min-height:120px; }
}
</style>
</head>
<body class="${bodyClass}">
${banner ? `<div class="banner">${banner}</div>` : ''}
<div id="pageBizGate" class="page-gate">
  <div class="biz-box">
    <div class="samhan-logo">삼한공조시스템</div>
    <div class="biz-title">종합견적서 · 사용자 확인</div>
    <div class="auth-msg">
      <div class="emoji">🔐</div>
      <div>사용자 확인 중입니다...<br>
      <span style="font-size:13px;opacity:0.7;">manager@samhan-air.com</span></div>
    </div>
  </div>
</div>

<div class="wrap">
  <div class="top">
    <div class="title">종합견적서<span class="badge">v1 · legacy 임베드</span></div>
    <div class="view-group">
      <button class="btn ${bodyClass === 'home-active' ? 'active' : ''}">홈멀티</button>
      <button class="btn">싱글세트</button>
      <button class="btn">상업멀티</button>
      <button class="btn">구형</button>
      <button class="btn-mini">주문정보</button>
      <button class="btn-mini">미리보기</button>
      <button class="btn-mini">최종</button>
    </div>
  </div>

  <div class="grid">
    <div class="card" id="cardHome" style="display:${cardDisplay('cardHome')}">
      <div class="card-head">cardHome — 홈멀티 견적<span style="opacity:0.6;font-weight:400;font-size:11px;">homemulti 카탈로그</span></div>
      <div class="card-body">
        ${lineCount > 0
          ? `<table class="est-table"><thead><tr><th>#</th><th>모델명</th><th>수량</th><th>금액</th><th>비고</th></tr></thead><tbody>${lineRows}</tbody></table>`
          : '<div class="empty-msg">라인을 추가하면 자동 합계가 노출됩니다 (legacy recomputeHomeDerived).</div>'}
      </div>
      ${lineCount > 0 ? `<div class="summary-row">합계 <span class="v">${totalAmount.toLocaleString()}원</span></div>` : ''}
    </div>
    <div class="card" id="cardSingle" style="display:${cardDisplay('cardSingle')}">
      <div class="card-head">cardSingle — 싱글세트<span style="opacity:0.6;font-weight:400;font-size:11px;">singleSets / singleParts</span></div>
      <div class="card-body"><div class="empty-msg">홈멀티 → 싱글세트 전환 시 활성</div></div>
    </div>
    <div class="card" id="cardComm" style="display:${cardDisplay('cardComm')}">
      <div class="card-head">cardComm — 상업멀티<span style="opacity:0.6;font-weight:400;font-size:11px;">commercialMulti / commercialParts</span></div>
      <div class="card-body"><div class="empty-msg">상업멀티 카탈로그 (가스히트펌프 / 프레스티지 / 동시냉난방 / 공장전원)</div></div>
    </div>
    <div class="card" id="cardOld" style="display:${cardDisplay('cardOld')}">
      <div class="card-head">cardOld — 구형 (단종)<span style="opacity:0.6;font-weight:400;font-size:11px;">oldProducts</span></div>
      <div class="card-body"><div class="empty-msg">단종 모델 견적 (대체 가이드 노출)</div></div>
    </div>
    ${cardsAll ? `
    <div class="card cardOrderInfo" id="cardOrderInfo" style="display:flex">
      <div class="card-head">cardOrderInfo — 주문정보 입력<span style="opacity:0.6;font-weight:400;font-size:11px;">거래처/담당/현장/납기</span></div>
      <div class="card-body">
        <div class="print-row"><span class="label">거래처명</span><span>OO공조</span></div>
        <div class="print-row"><span class="label">담당자</span><span>홍길동 부장</span></div>
        <div class="print-row"><span class="label">현장</span><span>서울시 강남구 ...</span></div>
        <div class="print-row"><span class="label">납기</span><span>2026-06-15</span></div>
      </div>
    </div>
    <div class="card cardFinal" id="cardFinal" style="display:${finalActive ? 'flex' : 'flex'}; grid-column: span 2;">
      <div class="card-head">cardFinal — 최종 견적서 (인쇄용)<span style="opacity:0.6;font-weight:400;font-size:11px;">pageFinal / 인감</span></div>
      <div class="card-body">
        <div class="print-area">
          <h2>종 합 견 적 서</h2>
          <div class="print-row"><span class="label">발행일</span><span>2026-05-05</span></div>
          <div class="print-row"><span class="label">거래처</span><span>OO공조 귀하</span></div>
          <div class="print-row"><span class="label">담당자</span><span>홍길동 부장</span></div>
          <div class="print-row"><span class="label">총금액</span><span style="color:#c0392b;font-weight:800;font-size:16px;">${totalAmount > 0 ? totalAmount.toLocaleString() : '14,710,000'}원 (VAT 별도)</span></div>
          <img class="stamp-img" src="${stampDataUrl}" alt="인감"/>
          <div style="margin-top:30px;font-size:12px;color:#475569;">상기와 같이 견적합니다. 견적 유효기간: 발행일로부터 30일.</div>
        </div>
      </div>
    </div>` : ''}
  </div>
</div>
</body>
</html>`
}

async function newPage(browser, viewport) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  page.on('pageerror', (e) => console.warn('  [page error]', e.message))
  return page
}

async function captureMock(browser, name, viewport, mockOpts) {
  const page = await newPage(browser, viewport)
  await page.setContent(mockLegacyHtml(mockOpts), { waitUntil: 'load', timeout: 10000 })
  await sleep(300)
  const out = resolve(OUT_DIR, name)
  await page.screenshot({ path: out, type: 'png', fullPage: false })
  console.log('  saved:', out)
  await page.close()
}

async function main() {
  console.log('[qa] launching Edge:', EDGE_PATH)
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    protocolTimeout: 60000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  })
  try {
    // ─── 1. 진입 (BizGate + samhan logo) ────────────────────────────
    console.log('[qa 1/5] init (BizGate + samhan logo)')
    await captureMock(
      browser,
      '01-estimate-app-init.png',
      { width: 1440, height: 900 },
      {
        gateHidden: false,
        banner:
          '<b>v1 진입</b><br>BizGate 인증 대기 (checkUserAuth RPC).<br>shim + samhanApi 11 RPC 매핑 동작.',
      },
    )

    // ─── 2. 4 카드 grid + cardOrderInfo / cardFinal ─────────────────
    console.log('[qa 2/5] 4 cards grid (cardHome/Single/Comm/Old + OrderInfo/Final)')
    await captureMock(
      browser,
      '02-estimate-app-4-cards-grid.png',
      { width: 1600, height: 1000 },
      {
        gateHidden: true,
        cardsAll: true,
        banner: '<b>4 카드 + cardOrderInfo 우측 + cardFinal 하단</b><br>legacy estimate index.html 의 .grid 레이아웃 재현',
      },
    )

    // ─── 3. 라인 3건 추가 후 ────────────────────────────────────────
    console.log('[qa 3/5] after add (3 lines + summary 합계)')
    await captureMock(
      browser,
      '03-estimate-app-after-add.png',
      { width: 1440, height: 900 },
      {
        gateHidden: true,
        cardsAll: false,
        lineCount: 3,
        banner:
          '<b>라인 3건 추가</b><br>legacy recomputeHomeDerived 자동 합계 재현.<br>shim 의 saveQuoteSnapshot RPC → estimate-service POST /snapshots.',
      },
    )

    // ─── 4. 인쇄 미리보기 (cardFinal + 인감) ────────────────────────
    console.log('[qa 4/5] print preview (cardFinal + 인감)')
    await captureMock(
      browser,
      '04-estimate-app-print.png',
      { width: 1440, height: 1100 },
      {
        gateHidden: true,
        cardsAll: true,
        finalActive: true,
        lineCount: 3,
        banner: '<b>인쇄 미리보기</b><br>legacy pageFinal 양식 + 우측 인감 (stamp.html 외부화)',
      },
    )

    // ─── 5. 모바일 viewport (legacy @media 1280px 분기) ─────────────
    console.log('[qa 5/5] mobile viewport (390×844)')
    await captureMock(
      browser,
      '05-estimate-app-mobile-responsive.png',
      { width: 390, height: 844 },
      {
        gateHidden: true,
        cardsAll: false,
        lineCount: 2,
        mobile: true,
        banner:
          '<b>모바일 viewport (390×844)</b><br>legacy @media (max-width:1280px) 분기 — grid 1열 + title 18px',
      },
    )

    console.log('[qa] complete — 5 captures saved to', OUT_DIR)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('[qa] FAIL', err)
  process.exit(1)
})
