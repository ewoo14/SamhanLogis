// false-green 2차 방어: 실제 실행 건수 검증. results.json 의 stats 로
// expected(통과)>0 을 강제하고, 게이트(비격리)셋의 skip 을 0 으로 엄격 강제한다.
// 게이트 171 은 skipped=0(로컬+CI 실증)이므로, 조건부 test.skip 이 향후 회귀로
// 발동(예: d2-order-merge 혼합 거래처 시나리오 precondition 붕괴)하면 silent
// false-green 대신 CI fail 로 드러난다. 정당한 조건부 skip 이 필요한 스펙은
// 게이트 대상이 아니므로 manual/*-real-qa 컨벤션 또는 QUARANTINE 으로 분리한다.
import { readFileSync } from 'node:fs'
// html 리포터의 playwright-report/ 와 충돌하지 않도록 별도 디렉토리(playwright-json) 사용
const path = 'playwright-json/results.json'
let stats
try {
  stats = JSON.parse(readFileSync(path, 'utf8')).stats
} catch (e) {
  console.error('[guard] results.json 없음 — 테스트 미실행 의심:', e.message)
  process.exit(1)
}
const { expected = 0, unexpected = 0, skipped = 0, flaky = 0 } = stats
console.log(`[guard] expected=${expected} unexpected=${unexpected} skipped=${skipped} flaky=${flaky}`)
if (expected === 0) { console.error('[guard] 통과 테스트 0 — 미실행/전량 skip false-green'); process.exit(1) }
if (unexpected > 0) { console.error(`[guard] unexpected=${unexpected} — 리포터/exit 불일치 방어`); process.exit(1) }
if (skipped > 0) { console.error(`[guard] skipped=${skipped} > 0 — 게이트 스펙 silent skip 금지(회귀로 인한 조건부 skip false-green 차단)`); process.exit(1) }
process.exit(0)
