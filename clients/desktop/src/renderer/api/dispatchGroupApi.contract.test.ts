import { describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { carrierApi, dispatchCarrierApi, dispatchGroupApi } from './dispatchGroupApi'

describe('S3 dispatch-group API contract', () => {
  it('uses carrier master paths and preserves business identifiers', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: [{ code: 'ARO', name: '아로로지스', isArologis: true, isActive: true }] } } as never)
    const rows = await carrierApi.list()
    expect(get).toHaveBeenCalledWith('/admin/carriers')
    expect(rows[0]).toMatchObject({ code: 'ARO', name: '아로로지스' })

    const dispatchRows = await dispatchCarrierApi.list()
    expect(get).toHaveBeenCalledWith('/admin/carriers/dispatch-lookup')
    expect(dispatchRows[0]).toMatchObject({ code: 'ARO', name: '아로로지스' })
  })

  it('lists groups by dispatch date and exposes the group transfer mutation', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: [] } } as never)
    await dispatchGroupApi.list('2026-08-04')
    expect(get).toHaveBeenCalledWith('/admin/dispatch-groups', { params: { dispatchDate: '2026-08-04' } })
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: {} } } as never)
    await dispatchGroupApi.transfer('DG-01')
    expect(post).toHaveBeenCalledWith('/admin/dispatch-groups/DG-01/transfer')
  })

  it('targets groups and carriers only with identifiers returned by responses', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { data: {} } } as never)
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: { data: {} } } as never)
    const del = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { data: null } } as never)
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: {} } } as never)

    await dispatchGroupApi.update('DG-01', { dispatchDate: '2026-08-04', vehicleLabel: '1톤' })
    await dispatchGroupApi.assignCarrier('DG-01', 'ARO')
    await dispatchGroupApi.addSlip('DG-01', '2026/08/04-1', 'OUTBOUND')
    await dispatchGroupApi.removeSlip('DG-01', '2026/08/04-1')
    await dispatchGroupApi.reorder('DG-01', ['2026/08/04-1'])
    await dispatchGroupApi.remove('DG-01')
    await carrierApi.update('ARO', { name: '아로로지스' })
    await carrierApi.remove('ARO')

    expect(put).toHaveBeenCalledWith('/admin/dispatch-groups/DG-01', expect.anything())
    expect(put).toHaveBeenCalledWith('/admin/dispatch-groups/DG-01/carrier/ARO')
    expect(put).toHaveBeenCalledWith('/admin/dispatch-groups/DG-01/slips/order', { slipNos: ['2026/08/04-1'] })
    expect(patch).toHaveBeenCalledWith('/admin/carriers/ARO', { name: '아로로지스' })
    expect(del).toHaveBeenCalledWith('/admin/dispatch-groups/DG-01')
    expect(del).toHaveBeenCalledWith('/admin/carriers/ARO')
    expect([...put.mock.calls, ...patch.mock.calls, ...del.mock.calls].flat().join(' ')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  })
})
