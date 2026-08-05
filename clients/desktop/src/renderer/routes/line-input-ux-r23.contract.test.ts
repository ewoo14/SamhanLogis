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
    expect(route('JournalFormPage.tsx')).toContain('isJournalLineConfirmed')
    expect(route('TransferFormPage.tsx')).toContain('emptyLine,\n          1,')
    expect(route('EstimateFormPage.tsx')).toContain('emptyLine,\n        1,')
  })

  it('R26 네 화면 삭제 경로는 최소행 뒤에도 trailing 입력행을 복원한다', () => {
    for (const name of ['SlipFormPage.tsx', 'EstimateFormPage.tsx', 'JournalFormPage.tsx', 'TransferFormPage.tsx']) {
      expect(route(name), name).toContain('removeLinePreservingMinimum')
    }
    expect(readFileSync(resolve(process.cwd(), 'src/renderer/utils/autoBlankRow.ts'), 'utf8'))
      .toContain('ensureTrailingBlankRow(next, emptyRow, isConfirmed)')
  })

  it('R28 읽기 전용 hydrate와 legacy 복원 fence의 경계를 유지한다', () => {
    const estimate = route('EstimateFormPage.tsx')
    const history = readFileSync(
      resolve(process.cwd(), 'src/renderer/components/audit/EstimateVersionHistoryPanel.tsx'),
      'utf8',
    )
    expect(estimate).toContain('const readOnlyEstimate = e.status !== \'QUOTE_DRAFT\' && e.status !== \'QUOTE_SENT\'')
    expect(estimate).toContain('consumeEstimateRestoreFence(editId, serverVersion)')
    expect(history).toContain('markEstimateRestoreFence(estimateId, restored.version)')
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
