import { describe, expect, it } from 'vitest'

declare const process: { cwd: () => string }
declare function require(id: string): any

const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

describe('발송내역 삭제행 필드 계약', () => {
  const source = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

  it('응답과 화면이 같은 날짜·주문번호·주소·메모 필드를 사용한다', () => {
    expect(source).toContain('row.outDate')
    expect(source).toContain('row.orderNo')
    expect(source).toContain('row.orderDate')
    expect(source).toContain('row.addr')
    expect(source).toContain('row.note')
  })

  it('삭제행은 식별 가능한 필드를 표시하고 조작 버튼을 만들지 않는다', () => {
    expect(source).toContain('deleted ? \'<span aria-label="삭제된 원본">삭제됨</span>\'')
    expect(source).toMatch(/deleted \? '[^']*' : `[^`]*button/)
  })
})
