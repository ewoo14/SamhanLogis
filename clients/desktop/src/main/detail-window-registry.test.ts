import { describe, expect, it, vi } from 'vitest'
import { DetailWindowRegistry, type DetailWindowRequest } from './detail-window-registry'

describe('DetailWindowRegistry', () => {
  it('focuses the existing window instead of creating a duplicate for the same document', () => {
    const focus = vi.fn()
    const createWindow = vi.fn(() => ({ focus, isDestroyed: () => false }))
    const registry = new DetailWindowRegistry(createWindow)
    const request: DetailWindowRequest = {
      documentType: 'OUTBOUND_SLIP',
      documentId: '42',
      route: '/sales/42',
    }

    const first = registry.open(request)
    const second = registry.open(request)

    expect(second).toBe(first)
    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(1)
  })
})
