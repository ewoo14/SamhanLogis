// false-green 2차 방어: 실제 실행 건수 검증. results.json 의 stats 로
// expected(통과)>0 && skipped==0 아니면 비정상 종료(1).
import { readFileSync } from 'node:fs'
const path = 'playwright-report/results.json'
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
if (skipped > 0) { console.error(`[guard] skipped=${skipped} > 0 — 조건부 skip false-green 차단`); process.exit(1) }
process.exit(0)
