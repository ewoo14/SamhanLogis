/**
 * SSE authority commit 멱등 키의 유한 FIFO 보관소.
 *
 * 최근 사건만 기억해 장기 화면의 메모리 증가를 막는다. 상한 밖으로 밀려난
 * commitId는 다시 들어오면 새 사건으로 취급한다.
 */
export class AuthorityCommitDeduper {
  static readonly DEFAULT_MAX_SIZE = 2_048

  private readonly maxSize: number
  private readonly ids = new Set<string>()
  private readonly order: string[] = []

  constructor(maxSize = AuthorityCommitDeduper.DEFAULT_MAX_SIZE) {
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new Error('authority commit deduper maxSize must be a positive integer')
    }
    this.maxSize = maxSize
  }

  get size(): number {
    return this.ids.size
  }

  consume(rawCommitId: string): boolean {
    const commitId = rawCommitId.trim()
    if (!commitId || this.ids.has(commitId)) return false

    this.ids.add(commitId)
    this.order.push(commitId)
    if (this.order.length > this.maxSize) {
      const evicted = this.order.shift()
      if (evicted) this.ids.delete(evicted)
    }
    return true
  }
}
