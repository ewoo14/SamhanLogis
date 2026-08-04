import { apiClient, type ApiEnvelope } from './client'

export interface Carrier {
  code: string
  name: string
  isArologis: boolean
  isActive: boolean
  /** 내부 mutation path 전용. 응답 계약이 제공할 때만 보관하며 화면에는 렌더링하지 않는다. */
  id?: string
  partnerId?: string | null
}

export interface DispatchGroupSlip {
  slipNo: string
  inclusionType: 'OUTBOUND' | 'INBOUND'
  sequence: number
}

export interface DispatchGroup {
  groupNo: string
  dispatchDate: string
  vehicleLabel: string
  carrierCode: string | null
  carrierName: string | null
  carrierArologis: boolean | null
  transferStatus: 'NOT_SENT' | 'SENT' | 'FAILED'
  slips: DispatchGroupSlip[]
  /** S1 응답이 제공할 때만 mutation에 사용. UUID를 화면에 표시하지 않는다. */
  id?: string
}

export interface CreateCarrierRequest {
  code: string
  name: string
  isArologis: boolean
  partnerId?: string | null
}

export interface UpdateCarrierRequest {
  code?: string
  name?: string
  isArologis?: boolean
  partnerId?: string | null
  isActive?: boolean
}

export interface CreateDispatchGroupRequest {
  groupNo: string
  dispatchDate: string
  vehicleLabel: string
  carrierId?: string | null
}

export const carrierApi = {
  async list(): Promise<Carrier[]> {
    const response = await apiClient.get<ApiEnvelope<Carrier[]>>('/admin/carriers')
    return response.data.data ?? []
  },
  async create(request: CreateCarrierRequest): Promise<Carrier> {
    const response = await apiClient.post<ApiEnvelope<Carrier>>('/admin/carriers', request)
    return response.data.data
  },
  async update(id: string, request: UpdateCarrierRequest): Promise<Carrier> {
    const response = await apiClient.patch<ApiEnvelope<Carrier>>(`/admin/carriers/${encodeURIComponent(id)}`, request)
    return response.data.data
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(`/admin/carriers/${encodeURIComponent(id)}`)
  },
}

export const dispatchGroupApi = {
  async list(dispatchDate: string): Promise<DispatchGroup[]> {
    const response = await apiClient.get<ApiEnvelope<DispatchGroup[]>>('/admin/dispatch-groups', { params: { dispatchDate } })
    return response.data.data ?? []
  },
  async create(request: CreateDispatchGroupRequest): Promise<DispatchGroup> {
    const response = await apiClient.post<ApiEnvelope<DispatchGroup>>('/admin/dispatch-groups', request)
    return response.data.data
  },
  async update(id: string, request: Pick<CreateDispatchGroupRequest, 'dispatchDate' | 'vehicleLabel'>): Promise<DispatchGroup> {
    const response = await apiClient.put<ApiEnvelope<DispatchGroup>>(`/admin/dispatch-groups/${encodeURIComponent(id)}`, request)
    return response.data.data
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(`/admin/dispatch-groups/${encodeURIComponent(id)}`)
  },
  async assignCarrier(id: string, carrierId: string): Promise<DispatchGroup> {
    const response = await apiClient.put<ApiEnvelope<DispatchGroup>>(`/admin/dispatch-groups/${encodeURIComponent(id)}/carrier/${encodeURIComponent(carrierId)}`)
    return response.data.data
  },
  async clearCarrier(id: string): Promise<DispatchGroup> {
    const response = await apiClient.delete<ApiEnvelope<DispatchGroup>>(`/admin/dispatch-groups/${encodeURIComponent(id)}/carrier`)
    return response.data.data
  },
  async addSlip(id: string, slipNo: string, inclusionType: 'OUTBOUND' | 'INBOUND'): Promise<DispatchGroup> {
    const response = await apiClient.post<ApiEnvelope<DispatchGroup>>(`/admin/dispatch-groups/${encodeURIComponent(id)}/slips`, { slipNo, inclusionType })
    return response.data.data
  },
  async removeSlip(id: string, slipNo: string): Promise<DispatchGroup> {
    const response = await apiClient.delete<ApiEnvelope<DispatchGroup>>(`/admin/dispatch-groups/${encodeURIComponent(id)}/slips/${encodeURIComponent(slipNo)}`)
    return response.data.data
  },
}
