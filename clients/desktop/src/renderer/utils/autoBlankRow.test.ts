import { describe, expect, it } from 'vitest'
import {
  appendBlankRowIfLastChanged,
  filterMeaningfulRows,
  removeLinePreservingMinimum,
} from './autoBlankRow'

interface TestLine {
  uid: string
  account: string
  debit: number
  credit: number
}

const emptyLine = (): TestLine => ({ uid: `empty-${Math.random()}`, account: '', debit: 0, credit: 0 })
const same = (a: TestLine, b: TestLine) => a.account === b.account && a.debit === b.debit && a.credit === b.credit
const meaningful = (line: TestLine) => Boolean(line.account) && (line.debit > 0 || line.credit > 0)

describe('행 자동 빈행 공통 계약', () => {
  it('마지막 행에 실제 값이 입력되면 빈행을 하나 추가한다', () => {
    const before = { uid: 'last', account: '', debit: 0, credit: 0 }
    const after = { ...before, account: '102' }
    const next = appendBlankRowIfLastChanged(
      [before], before, after, (line) => line.uid, emptyLine, same,
    )
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual(after)
  })

  it('마지막 행이 아니거나 값이 같으면 빈행을 추가하지 않는다', () => {
    const first = { uid: 'first', account: '102', debit: 100, credit: 0 }
    const last = { uid: 'last', account: '', debit: 0, credit: 0 }
    expect(appendBlankRowIfLastChanged([first, last], first, first, (line) => line.uid, emptyLine, same)).toHaveLength(2)
    expect(appendBlankRowIfLastChanged([first, last], last, last, (line) => line.uid, emptyLine, same)).toHaveLength(2)
  })

  it('저장 필터는 빈행을 제외하고 분개 합계도 의미 있는 행만 남긴다', () => {
    const rows = [
      { uid: 'debit', account: '102', debit: 1000, credit: 0 },
      { uid: 'credit', account: '401', debit: 0, credit: 1000 },
      { uid: 'blank', account: '', debit: 0, credit: 0 },
    ]
    const saved = filterMeaningfulRows(rows, meaningful)
    expect(saved.map((line) => line.uid)).toEqual(['debit', 'credit'])
    expect(saved.reduce((sum, line) => sum + line.debit, 0)).toBe(1000)
    expect(saved.reduce((sum, line) => sum + line.credit, 0)).toBe(1000)
  })

  it('행 삭제는 판매전표처럼 최소 한 빈행을 유지한다', () => {
    const line = { uid: 'only', account: '', debit: 0, credit: 0 }
    const next = removeLinePreservingMinimum([line], 'only', (item) => item.uid, emptyLine, 1)
    expect(next).toHaveLength(1)
    expect(next[0].account).toBe('')
  })
})
