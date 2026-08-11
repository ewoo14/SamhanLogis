import { resolveActorDisplayName } from './actorDisplayName'

describe('resolveActorDisplayName', () => {
  it('combining marks inside a UUID are treated as an unknown actor', () => {
    expect(resolveActorDisplayName('c\u0301afebabecafebabecafebabecafebabe')).toBeNull()
  })

  it('preserves a normal decomposed Hangul display name', () => {
    const name = '김감사'
    expect(resolveActorDisplayName(name)).toBe(name)
  })
})
