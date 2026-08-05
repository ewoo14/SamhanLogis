import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(
  resolve(__dirname, 'ArologisPreClassifyPage.tsx'),
  'utf8',
)

describe('ArologisPreClassifyPage UNKNOWN 안내 계약', () => {
  it('모드 결과와 맞는 제외 건수만 안내하고 무조건 재조회를 지시하지 않는다', () => {
    expect(pageSource).toContain('이번 실행 모드에서 제외되었습니다')
    expect(pageSource).toContain('창고 코드 보강 결과를 확인해 주세요. 상일·초월 외 창고는 가배차 대상이 아닙니다.')
    expect(pageSource).not.toContain('창고 정보를 확인한 뒤 다시 조회해 주세요.')
  })
})
