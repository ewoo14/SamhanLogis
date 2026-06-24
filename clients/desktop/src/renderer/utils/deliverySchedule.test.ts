import { describe, expect, test } from 'vitest'
import {
  computeUnloadDate,
  isScheduledTag,
  scheduleLabel,
} from './deliverySchedule'

// ── isScheduledTag ──────────────────────────────────────────────────────────

describe('isScheduledTag', () => {
  test('REGION → true', () => expect(isScheduledTag('REGION')).toBe(true))
  test('STACK → true', () => expect(isScheduledTag('STACK')).toBe(true))
  test('DAY → false', () => expect(isScheduledTag('DAY')).toBe(false))
  test('null → false', () => expect(isScheduledTag(null)).toBe(false))
  test('undefined → false', () => expect(isScheduledTag(undefined)).toBe(false))
  test('LOGEN → false', () => expect(isScheduledTag('LOGEN')).toBe(false))
})

// ── computeUnloadDate ───────────────────────────────────────────────────────

describe('computeUnloadDate', () => {
  test('비적용 태그(DAY) → null', () => {
    expect(computeUnloadDate('2026-06-24', 'DAY')).toBeNull()
  })

  test('tag null → null', () => {
    expect(computeUnloadDate('2026-06-24', null)).toBeNull()
  })

  test('slipDate null → null', () => {
    expect(computeUnloadDate(null, 'REGION')).toBeNull()
  })

  // 평일 지방 (수 06-24 → 목 06-25)
  test('지방 평일(수) → 익일(목)', () => {
    expect(computeUnloadDate('2026-06-24', 'REGION')).toBe('2026-06-25')
  })

  // 평일 야적 (수 06-24 → 목 06-25)
  test('야적 평일(수) → 익일(목)', () => {
    expect(computeUnloadDate('2026-06-24', 'STACK')).toBe('2026-06-25')
  })

  // 지방 금요일(06-26) → 토요일(06-27) — N=토는 일요일 아님, 그대로
  test('지방 금요일 → 토요일(N=토이므로 skip 없음)', () => {
    expect(computeUnloadDate('2026-06-26', 'REGION')).toBe('2026-06-27')
  })

  // 지방 토요일(06-27) → 익일=일요일(06-28) → 월요일(06-29) [일요일 skip]
  test('지방 토요일 → 일요일skip → 월요일', () => {
    // 2026-06-27 = 토요일, N = 06-28 = 일요일 → 지방이므로 skip → 06-29 월요일
    expect(computeUnloadDate('2026-06-27', 'REGION')).toBe('2026-06-29')
  })

  // 야적 토요일(06-27) → 익일=일요일(06-28) → 일요일 유지(예외)
  test('야적 토요일 → 일요일 그대로(예외)', () => {
    // 2026-06-27 = 토요일, tag=STACK, N=06-28 일요일 → 야적&&M=토 예외 → 일요일 그대로
    expect(computeUnloadDate('2026-06-27', 'STACK')).toBe('2026-06-28')
  })

  // 야적 평일 중 N이 일요일인 케이스: 야적 토요일이 아닌 경우
  // 예: 야적 일요일(2026-06-28) + 1 = 월요일(06-29) → 조건 불해당(M≠토)
  test('야적 일요일(06-28) → 익일 월요일(06-29)', () => {
    // 2026-06-28 = 일요일, tag=STACK, N = 06-29 = 월요일 → skip 불필요
    expect(computeUnloadDate('2026-06-28', 'STACK')).toBe('2026-06-29')
  })

  // 월말 경계 — 지방 06-30(화) → 07-01(수)
  test('지방 월말 경계(06-30) → 07-01', () => {
    expect(computeUnloadDate('2026-06-30', 'REGION')).toBe('2026-07-01')
  })

  // 당착 케이스: slipDate 자체를 unloadDate 로 사용 (FE 는 computeUnloadDate 를 호출하지 않음)
  // 이 테스트는 scheduleLabel 의 당착 판정을 위한 참조용
})

// ── scheduleLabel ───────────────────────────────────────────────────────────

describe('scheduleLabel', () => {
  test('비적용 태그(DAY) → null', () => {
    expect(scheduleLabel('2026-06-25', '2026-06-26', 'DAY')).toBeNull()
  })

  test('tag null → null', () => {
    expect(scheduleLabel('2026-06-25', '2026-06-26', null)).toBeNull()
  })

  test('unloadDate null → null', () => {
    expect(scheduleLabel('2026-06-25', null, 'REGION')).toBeNull()
  })

  // 지방 평일: 25상26하
  test('지방 25→26 → "25상26하"', () => {
    expect(scheduleLabel('2026-06-25', '2026-06-26', 'REGION')).toBe('25상26하')
  })

  // 야적: 27상28하
  test('야적 27→28 → "27상28하"', () => {
    expect(scheduleLabel('2026-06-27', '2026-06-28', 'STACK')).toBe('27상28하')
  })

  // 당착 (지방 && N == M)
  test('지방 당착(N==M) → "당착"', () => {
    expect(scheduleLabel('2026-06-25', '2026-06-25', 'REGION')).toBe('당착')
  })

  // 야적 N==M 은 당착 아님 (REGION 한정)
  test('야적 N==M → 일반 라벨(당착 아님)', () => {
    expect(scheduleLabel('2026-06-25', '2026-06-25', 'STACK')).toBe('25상25하')
  })

  // 월말 경계: 30상1하 (leading zero 없음)
  test('월말 경계 30→07-01 → "30상1하"', () => {
    expect(scheduleLabel('2026-06-30', '2026-07-01', 'REGION')).toBe('30상1하')
  })
})

// ── 당착 토글 시나리오 ────────────────────────────────────────────────────

describe('당착 토글 통합 시나리오', () => {
  test('당착 토글 ON: unloadDate=slipDate → scheduleLabel="당착"', () => {
    const slipDate = '2026-06-25'
    const unloadDate = slipDate // 당착 체크 시 FE 가 unloadDate=slipDate 로 고정
    expect(scheduleLabel(slipDate, unloadDate, 'REGION')).toBe('당착')
  })

  test('당착 토글 OFF 후 기본값 복원: computeUnloadDate → scheduleLabel 일반', () => {
    const slipDate = '2026-06-25' // 수요일
    const unloadDate = computeUnloadDate(slipDate, 'REGION') // → 06-26
    expect(unloadDate).toBe('2026-06-26')
    expect(scheduleLabel(slipDate, unloadDate, 'REGION')).toBe('25상26하')
  })

  test('태그 해제 시: computeUnloadDate null, scheduleLabel null', () => {
    expect(computeUnloadDate('2026-06-25', null)).toBeNull()
    expect(scheduleLabel('2026-06-25', '2026-06-26', null)).toBeNull()
  })
})
