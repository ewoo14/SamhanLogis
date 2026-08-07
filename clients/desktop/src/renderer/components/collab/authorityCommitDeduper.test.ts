import { describe, expect, it } from 'vitest'
import { AuthorityCommitDeduper } from './authorityCommitDeduper'

describe('AuthorityCommitDeduper', () => {
  it('keeps a bounded FIFO window while consuming a duplicate only once inside the window', () => {
    const deduper = new AuthorityCommitDeduper(3)

    expect(deduper.consume('commit-1')).toBe(true)
    expect(deduper.consume('commit-1')).toBe(false)
    expect(deduper.consume('commit-2')).toBe(true)
    expect(deduper.consume('commit-3')).toBe(true)
    expect(deduper.size).toBe(3)

    expect(deduper.consume('commit-4')).toBe(true)
    expect(deduper.size).toBe(3)
    expect(deduper.consume('commit-1')).toBe(true)
  })

  it('ignores blank commit ids without growing the window', () => {
    const deduper = new AuthorityCommitDeduper(2)

    expect(deduper.consume('  ')).toBe(false)
    expect(deduper.size).toBe(0)
  })
})
