import { describe, it, expect } from 'vitest'

import { stripSlipNoZeros, toOrderPathId } from './orderNo'

/**
 * `orderNo` 유틸 단위 테스트 — 인쇄 미리보기 표준화 슬라이스1.
 *
 * 본 테스트는 desktop 인쇄 양식(입고/출고전표)이 의존하는 전표번호 표시 계약을 박제한다.
 * desktop 자체 vitest 설정으로 CI 단위 테스트 게이트에 포함된다. 본 파일은 production
 * typecheck/build 대상에서 제외(`*.test.ts` exclude)되어 `npm run typecheck` 0 을 유지한다.
 *
 * 검증 대상 계약(실 구현 동작 기준 — `stripSlipNoZeros` 는 마지막 `-` 뒤 숫자부만 0제거):
 *  - 전표번호 표준 `YYYY/MM/DD-NNN` 의 날짜 0은 보존, 번호부 앞자리 0만 제거
 *  - 하이픈이 없거나 마지막 `-` 뒤가 숫자가 아니면 원본 폴백(no-op)
 *  - null/undefined/빈 문자열은 빈 문자열
 */
describe('stripSlipNoZeros', () => {
  describe('전표번호 표준(YYYY/MM/DD-NNN) — 날짜 0 보존 + 번호부 0제거', () => {
    it('2026/04/08-001 → 2026/04/08-1 (날짜 0 보존, 번호부 선행 0제거)', () => {
      expect(stripSlipNoZeros('2026/04/08-001')).toBe('2026/04/08-1')
    })

    it('2026/02/18-001 → 2026/02/18-1 (출고전표 C3 시드 케이스)', () => {
      expect(stripSlipNoZeros('2026/02/18-001')).toBe('2026/02/18-1')
    })

    it('2026/04/08-010 → 2026/04/08-10 (앞자리 0만 제거, 뒤 0 보존)', () => {
      expect(stripSlipNoZeros('2026/04/08-010')).toBe('2026/04/08-10')
    })

    it('2026/12/31-0010 → 2026/12/31-10 (다중 선행 0 제거)', () => {
      expect(stripSlipNoZeros('2026/12/31-0010')).toBe('2026/12/31-10')
    })

    it('2026/04/08-1 → 2026/04/08-1 (이미 0 없음 — 변화 없음)', () => {
      expect(stripSlipNoZeros('2026/04/08-1')).toBe('2026/04/08-1')
    })
  })

  describe('마지막 -뒤 숫자부 단독 케이스', () => {
    it('-000 → -0 (전부 0 → 최소 0 유지)', () => {
      expect(stripSlipNoZeros('-000')).toBe('-0')
    })

    it('-0 → -0 (단일 0 유지)', () => {
      expect(stripSlipNoZeros('-0')).toBe('-0')
    })
  })

  describe('폴백 — 하이픈 없음 / 비숫자 tail (원본 그대로)', () => {
    it('하이픈이 없는 숫자열은 원본 폴백(번호부 분리 불가): 001 → 001', () => {
      // 구현 계약: 마지막 `-` 가 없으면 번호부를 분리하지 않고 원본 반환.
      // (단독 숫자열은 전표번호 표준 형식이 아니므로 0제거 대상이 아님)
      expect(stripSlipNoZeros('001')).toBe('001')
    })

    it('하이픈이 없는 숫자열은 원본 폴백: 010 → 010', () => {
      expect(stripSlipNoZeros('010')).toBe('010')
    })

    it('마지막 -뒤가 비숫자면 원본 폴백: ABC-12x → ABC-12x', () => {
      expect(stripSlipNoZeros('ABC-12x')).toBe('ABC-12x')
    })

    it('마지막 -뒤가 비숫자면 원본 폴백: NO-DASH-HERE-abc → NO-DASH-HERE-abc', () => {
      expect(stripSlipNoZeros('NO-DASH-HERE-abc')).toBe('NO-DASH-HERE-abc')
    })
  })

  describe('null / undefined / 빈 문자열', () => {
    it('null → 빈 문자열', () => {
      expect(stripSlipNoZeros(null)).toBe('')
    })

    it('undefined → 빈 문자열', () => {
      expect(stripSlipNoZeros(undefined)).toBe('')
    })

    it("빈 문자열 → 빈 문자열", () => {
      expect(stripSlipNoZeros('')).toBe('')
    })
  })
})

describe('toOrderPathId', () => {
  it('슬래시 → 하이픈 치환 (URL 경로 세그먼트): 2026/05/31-2 → 2026-05-31-2', () => {
    expect(toOrderPathId('2026/05/31-2')).toBe('2026-05-31-2')
  })

  it('하이픈 입력은 no-op: 2026-05-31-2 → 2026-05-31-2', () => {
    expect(toOrderPathId('2026-05-31-2')).toBe('2026-05-31-2')
  })
})
