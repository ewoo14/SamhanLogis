import { describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { carrierApi, dispatchGroupApi } from './dispatchGroupApi'

describe('S3 dispatch-group API contract', () => {
  it('uses carrier master paths and preserves business identifiers', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: [{ code: 'ARO', name: '아로로지스', isArologis: true, isActive: true }] } } as never)
    const rows = await carrierApi.list()
    expect(get).toHaveBeenCalledWith('/admin/carriers')
    expect(rows[0]).toMatchObject({ code: 'ARO', name: '아로로지스' })
  })

  it('lists groups by dispatch date and does not expose a transfer mutation', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: [] } } as never)
    await dispatchGroupApi.list('2026-08-04')
    expect(get).toHaveBeenCalledWith('/admin/dispatch-groups', { params: { dispatchDate: '2026-08-04' } })
    expect(dispatchGroupApi).not.toHaveProperty('transfer')
  })
})
