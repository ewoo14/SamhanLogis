import { describe, expect, it } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- scripts/ 는 tsc typecheck 범위 밖(.cjs 순수 모듈).
import { DEFAULT_STALE_GRACE_MS, isStaleDs4Run, parseDs4RunName } from '../../../scripts/ds4-real-qa-stale.cjs'

/** #913-1/R1-1/R1-2 안전망 — self-healing sweep/reap이 공유하는 순수 판정 로직 단위 테스트.
 * I/O가 없어 서버 없이도 빠르게 검증할 수 있다. */
describe('ds4-real-qa-stale — stale run 판정', () => {
  it('label에 공백이 있어도 끝에서부터 pid-시각-uuid를 정확히 분리한다', () => {
    const parsed = parseDs4RunName('DS4 실서버QA probe-timeout 12345-1690000000000-89445fa4-4f12-4ef1-9d92-5fa9bbaa35d8')
    expect(parsed).toEqual({
      label: 'DS4 실서버QA probe-timeout',
      ownerPid: 12345,
      startedAtMs: 1690000000000,
      runUuid: '89445fa4-4f12-4ef1-9d92-5fa9bbaa35d8',
    })
  })

  it('이 하네스가 만든 이름이 아니면(형태 불일치) null — 실사용자 양식명을 절대 건드리지 않는다', () => {
    for (const name of [
      '2026년 상반기 출고전표', // 일반 사용자 양식명
      'DS4 실서버QA 이름만_비슷함', // pid-시각-uuid 형태가 없음
      'DS4 실서버QA 12345-abc-89445fa4-4f12-4ef1-9d92-5fa9bbaa35d8', // 시각이 숫자가 아님
      '', // 빈 문자열
    ]) {
      expect(parseDs4RunName(name), name).toBeNull()
    }
  })

  it('🚨 R1-1 불변식 5 — 소유자가 살아있으면 유예기간을 넘겨도 절대 stale이 아니다', () => {
    const name = `DS4 실서버QA ${process.pid}-${Date.now() - DEFAULT_STALE_GRACE_MS * 10}-89445fa4-4f12-4ef1-9d92-5fa9bbaa35d8`
    expect(isStaleDs4Run(name)).toBe(false)
  })

  it('유예기간 이내면 소유자가 죽었어도 아직 stale이 아니다(막 시작한 run 보호)', () => {
    // 확실히 죽은 pid를 만들려고 짧게 살다 죽는 프로세스를 기다리는 대신, 실존 가능성이 0에
    // 가까운 매우 큰 pid를 쓴다(Windows/Linux 모두 pid 상한이 이보다 훨씬 작다).
    const almostCertainlyDeadPid = 2 ** 30
    const name = `DS4 실서버QA ${almostCertainlyDeadPid}-${Date.now()}-89445fa4-4f12-4ef1-9d92-5fa9bbaa35d8`
    expect(isStaleDs4Run(name, { graceMs: DEFAULT_STALE_GRACE_MS })).toBe(false)
  })

  it('유예기간을 넘겼고 소유자가 죽었으면 stale이다', () => {
    const almostCertainlyDeadPid = 2 ** 30
    const name = `DS4 실서버QA ${almostCertainlyDeadPid}-${Date.now() - DEFAULT_STALE_GRACE_MS * 2}-89445fa4-4f12-4ef1-9d92-5fa9bbaa35d8`
    expect(isStaleDs4Run(name, { graceMs: DEFAULT_STALE_GRACE_MS })).toBe(true)
  })
})
