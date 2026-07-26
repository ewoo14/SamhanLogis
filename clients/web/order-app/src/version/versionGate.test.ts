import { describe, expect, it, vi } from 'vitest'
import { createVersionReloadGuard } from './versionGate'

describe('주문 웹 버전 안내 새로고침 보호', () => {
  it('작성 중이면 사용자가 확인하기 전까지 reload를 호출하지 않는다', () => {
    const reload = vi.fn()
    const guard = createVersionReloadGuard(() => true, reload)

    expect(guard()).toBe('confirmation-required')
    expect(reload).not.toHaveBeenCalled()
    expect(guard(true)).toBe('reloaded')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('작성 중이 아니면 사용자가 새로고침을 선택하는 즉시 reload한다', () => {
    const reload = vi.fn()
    const guard = createVersionReloadGuard(() => false, reload)

    expect(guard()).toBe('reloaded')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
