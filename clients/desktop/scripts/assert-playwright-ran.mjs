// false-green 2차 방어: 실제 실행 건수 검증. results.json 의 stats 로
// expected(통과)>0 을 강제한다. 잔여 통과셋에는 조건부 skip 이 있을 수 있어
// skipped 는 경고만 남기되, skipped > expected 는 전량 skip 위장 가능성으로 실패시킨다.
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
if (skipped > expected) { console.error(`[guard] skipped=${skipped} > expected=${expected} — 비정상 skip 비율 false-green 차단`); process.exit(1) }
if (unexpected > 0) { console.error(`[guard] unexpected=${unexpected} — 리포터/exit 불일치 방어`); process.exit(1) }
if (skipped > 0) { console.warn(`[guard] skipped=${skipped} — 조건부 skip 허용(통과 테스트 ${expected}건 존재)`) }
process.exit(0)
