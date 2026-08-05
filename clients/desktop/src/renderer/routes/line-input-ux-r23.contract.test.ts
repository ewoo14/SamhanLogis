import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = (name: string) => readFileSync(resolve(process.cwd(), 'src/renderer/routes', name), 'utf8')

describe('R23 line input contracts', () => {
  it('R23 RED-A3 네 화면 모두 마지막 행 자동 빈행 유틸을 연결한다', () => {
    for (const name of ['SlipFormPage.tsx', 'EstimateFormPage.tsx', 'JournalFormPage.tsx', 'TransferFormPage.tsx']) {
      expect(route(name), name).toContain('appendBlankRowIfLastChanged')
    }
  })

  it('R23 RED-A5 분개 최소 2행·이동 최소 1행 규칙을 유지한다', () => {
    expect(route('JournalFormPage.tsx')).toContain('removeLinePreservingMinimum(prev, target.uid, (line) => line.uid, emptyLine, 2)')
    expect(route('TransferFormPage.tsx')).toContain('lines.length === 1')
  })

  it('R23 RED-B2 판매·구매 신규 전표 두 자동완성 모두 다건 모달을 사용한다', () => {
    const source = route('SlipFormPage.tsx')
    expect(source).not.toContain('resultSelectionMode={null}')
    expect(source.match(/resultSelectionMode="single"/g)).toHaveLength(2)
  })

  it('R23 RED-B5 네 화면에 수동 라인 추가 버튼과 addLine 식별자가 없다', () => {
    for (const name of ['SlipFormPage.tsx', 'EstimateFormPage.tsx', 'JournalFormPage.tsx', 'TransferFormPage.tsx']) {
      const source = route(name)
      expect(source, name).not.toContain('addLine')
      expect(source, name).not.toContain('+ 라인 추가')
    }
  })
})
