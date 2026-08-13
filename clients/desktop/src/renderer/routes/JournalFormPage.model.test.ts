import { describe, expect, it } from 'vitest'
import {
  buildRiskyPartnerLinesWarning,
  findRiskyPartnerLines,
  type RiskyPartnerLineCandidate,
} from './JournalFormPage.model'

function line(overrides: Partial<RiskyPartnerLineCandidate> = {}): RiskyPartnerLineCandidate {
  return {
    uid: 'line-1',
    accountCode: '1039',
    partnerId: null,
    debit: 1000,
    credit: 0,
    ...overrides,
  }
}

describe('findRiskyPartnerLines (#831 R-3 — 저널 편집 거래처 무경고 소실 가드)', () => {
  it('hydrate 라인 중 partnerId 가 없는 의미있는 라인을 위험으로 분류한다 (이름이 애초에 공란인 경우 — 장애 중 상세 공란 성사)', () => {
    const lines = [line({ uid: 'a', partnerId: null }), line({ uid: 'b', accountCode: '4019', credit: 1000, partnerId: 'p-1' })]
    const hydrated = new Set(['a', 'b'])
    expect(findRiskyPartnerLines(lines, hydrated)).toEqual([lines[0]])
  })

  it('hydrate 라인 중 이름은 있었지만 검색으로 partnerId 를 복원하지 못한 라인도 위험으로 분류한다', () => {
    // 폼 상태에서는 partnerName 유무와 무관하게 partnerId 로만 판단한다(:359 기존 가드가
    // partnerName 유무로 분기해 "이름 없으면 통과"하던 역전을 없앤다).
    const lines = [line({ uid: 'a', partnerId: null })]
    expect(findRiskyPartnerLines(lines, new Set(['a']))).toEqual(lines)
  })

  it('사용자가 이번 세션에 새로 추가한 라인(hydrate 아님)은 의식적으로 비워둔 것이므로 위험에서 제외한다', () => {
    const lines = [line({ uid: 'fresh', partnerId: null })]
    expect(findRiskyPartnerLines(lines, new Set())).toEqual([])
  })

  it('계정/금액이 없는(무의미한) 라인은 위험에서 제외한다', () => {
    const lines = [line({ uid: 'a', accountCode: '', partnerId: null }), line({ uid: 'b', debit: 0, credit: 0, partnerId: null })]
    expect(findRiskyPartnerLines(lines, new Set(['a', 'b']))).toEqual([])
  })

  it('partnerId 가 복원된 라인은 위험에서 제외한다', () => {
    const lines = [line({ uid: 'a', partnerId: 'p-1' })]
    expect(findRiskyPartnerLines(lines, new Set(['a']))).toEqual([])
  })
})

describe('buildRiskyPartnerLinesWarning (#831 R-3 — G2 안내 문구)', () => {
  it('조회 장애가 의심되면(suspectedUnavailable) 외부 조회 장애를 명시하고 사용자 귀책으로 오인시키지 않는다', () => {
    const msg = buildRiskyPartnerLinesWarning([{ accountCode: '1039' }, { accountCode: '108' }], true)
    expect(msg).toContain('거래처 조회 서비스에 일시 장애')
    expect(msg).toContain('1039')
    expect(msg).toContain('108')
    expect(msg).not.toContain('다시 선택하세요')
  })

  it('장애 근거가 없으면(healthy) "실제로 거래처가 없는지 확인" 문구로 헤지한다 — 확정적으로 장애라 단정하지 않는다', () => {
    const msg = buildRiskyPartnerLinesWarning([{ accountCode: '4019' }], false)
    expect(msg).toContain('401')
    expect(msg).toContain('실제로 거래처가 없는')
    expect(msg).not.toContain('장애')
  })
})
