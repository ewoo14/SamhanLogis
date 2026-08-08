/**
 * 04-모바일 카테고리 placeholder PNG 생성 — Phase B 본 단계 mobile-staff (RN Expo) 별도 client
 * 캡처는 후속 단계로 분리. 본 스크립트는 docs 본문 인라인용 임시 placeholder 만 채움.
 *
 * <h2>출력</h2>
 * <ul>
 *   <li>{@code docs/manual/screenshots/04-모바일/04-driver-dashboard.png}</li>
 *   <li>{@code 04-driver-list.png}</li>
 *   <li>{@code 04-driver-signature.png}</li>
 *   <li>{@code 04-recipient-view.png}</li>
 *   <li>{@code 04-sales-estimate.png}</li>
 *   <li>{@code 04-photo-attach.png}</li>
 * </ul>
 *
 * <h2>형식</h2>
 * <p>1280×920 (desktop 과 동일 viewport) 한국어 안내 + 후속 캡처 절차.
 *    매트릭스 의 27148/41046 bytes 패턴은 회피 (sharp 동적 svg → 가변 size).
 *
 * <h2>실행</h2>
 * <pre>node tools/manual-capture/generate-mobile-placeholders.js</pre>
 */
const sharp = require('sharp')
const path = require('node:path')
const fs = require('node:fs')
const { resolveQaShotsDir } = require('../../scripts/lib/qa-shots-dir.cjs')

// _local 격리(2026-07-27 하네스 흡수 H1 — 2026-07-26 G3 라운드와 동일 계약).
const OUT_DIR = resolveQaShotsDir(path.resolve(__dirname, '..', '..', 'docs', 'manual', 'screenshots', '04-모바일'), { protect: false })

/**
 * 매트릭스 § 2.1 04-모바일 PNG 명세 (8~10 PNG).
 * mobile-staff RN Expo client 정식 캡처는 Phase B 후속 단계 (별도 capture-mobile-all.js).
 */
const MOBILE = [
  { id: '04-driver-dashboard', title: '기사 앱 대시보드', route: 'mobile-staff `/`' },
  { id: '04-driver-list', title: '기사 배차 목록', route: 'mobile-staff dispatch list' },
  { id: '04-driver-signature', title: '기사 전자 서명', route: 'mobile-staff `/signature`' },
  { id: '04-recipient-view', title: '수령인 서명 화면', route: 'desktop `/mobile/share/:token`' },
  { id: '04-sales-estimate', title: '영업 앱 견적 webview', route: 'mobile estimate webview' },
  { id: '04-photo-attach', title: '사진 첨부 (P1 backlog)', route: 'TBD — Phase 12 step-7' },
  { id: '04-driver-tracking-screen', title: '기사 위치 추적 화면', route: 'mobile-staff GPS tracking' },
  { id: '04-driver-app-mode-toggle', title: '기사 앱 모드 토글', route: 'mobile-staff settings' },
]

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

async function main() {
  ensureDir(OUT_DIR)
  for (const m of MOBILE) {
    const w = 1280
    const h = 920
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="40" y="40" width="${w - 80}" height="80" fill="#0f766e"/>
  <text x="60" y="92" font-family="Malgun Gothic, sans-serif" font-size="24" fill="#fff">04-모바일 — ${m.title}</text>
  <text x="60" y="180" font-family="Malgun Gothic, sans-serif" font-size="22" fill="#1f2937">${m.id}</text>
  <text x="60" y="220" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#4b5563">화면: ${m.route}</text>
  <rect x="60" y="280" width="${w - 120}" height="200" fill="#ecfeff" stroke="#67e8f9" stroke-width="2"/>
  <text x="80" y="320" font-family="Malgun Gothic, sans-serif" font-size="18" fill="#0e7490">[Phase B 후속] mobile-staff RN Expo client 별도 캡처 단계</text>
  <text x="80" y="355" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#155e75">정식 실 캡처 절차:</text>
  <text x="80" y="382" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#164e63">  1) cd clients/mobile-staff &amp;&amp; npx expo start --web --port 8081</text>
  <text x="80" y="408" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#164e63">  2) Playwright 모바일 viewport (390×844 iPhone 14) + ko-KR locale 캡처</text>
  <text x="80" y="434" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#164e63">  3) docs/manual/screenshots/04-모바일/${m.id}.png 교체</text>
  <text x="80" y="460" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#164e63">  4) 본 placeholder 삭제</text>
  <text x="60" y="540" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#374151">매트릭스: docs/manual-capture-matrix.md § 2.1 (04-모바일)</text>
  <text x="60" y="565" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#374151">캡처 스크립트 후속: tools/manual-capture/capture-mobile.js (PR-H4b 기반 확장)</text>
  <rect x="60" y="610" width="${w - 120}" height="220" fill="#fff7ed" stroke="#fed7aa" stroke-width="2"/>
  <text x="80" y="650" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#9a3412">본 placeholder 사유</text>
  <text x="80" y="678" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7c2d12">  - mobile-staff 는 RN Expo 기반 별도 client (Electron desktop 과 다른 빌드)</text>
  <text x="80" y="702" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7c2d12">  - Phase B 본 단계 (capture-manual-all.js) 는 desktop Vite mock 모드 한정</text>
  <text x="80" y="726" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7c2d12">  - 운영자 매뉴얼 본문 (Phase C) 작성 시 본 placeholder 인라인 + TODO marker 부착</text>
  <text x="80" y="750" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7c2d12">  - mobile 실 캡처는 Phase 12 step-7 또는 Phase 11 AWS 배포 직전 별도 PR 분리</text>
  <text x="60" y="870" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">Phase 12 step-6 manual-rewrite Phase B 산출물 — desktop 88 PNG 실 캡처 + 04-모바일 placeholder ${MOBILE.length}건</text>
  <text x="60" y="892" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">생성: ${new Date().toISOString().slice(0, 10)} · 출력: docs/manual/screenshots/04-모바일/</text>
</svg>`
    const outPath = path.join(OUT_DIR, `${m.id}.png`)
    await sharp(Buffer.from(svg)).png().toFile(outPath)
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1)
    console.log(`  generated → ${m.id}.png (${sizeKb} KB)`)
  }
  console.log(`\n[done] 04-모바일 placeholder ${MOBILE.length}건 생성 → ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
