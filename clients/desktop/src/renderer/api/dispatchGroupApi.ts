import { apiClient, type ApiEnvelope } from './client'

export interface Carrier {
  code: string
  name: string
  isArologis: boolean
  isActive: boolean
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
}

export interface CreateCarrierRequest {
  code: string
  name: string
  isArologis: boolean
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
  carrierCode?: string | null
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
  async update(code: string, request: UpdateCarrierRequest): Promise<Carrier> {
    const response = await apiClient.patch<ApiEnvelope<Carrier>>(`/admin/carriers/${encodeURIComponent(code)}`, request)
    return response.data.data
  },
  async remove(code: string): Promise<void> {
    await apiClient.delete(`/admin/carriers/${encodeURIComponent(code)}`)
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
  async update(groupNo: string, request: Pick<CreateDispatchGroupRequest, 'dispatchDate' | 'vehicleLabel'>): Promise<DispatchGroup> {
    const response = await apiClient.put<ApiEnvelope<DispatchGroup>>(`/admin/dispatch-groups/${encodeURIComponent(groupNo)}`, request)
    return response.data.data
  },
  async remove(groupNo: string): Promise<void> {
    await apiClient.delete(`/admin/dispatch-groups/${encodeURIComponent(groupNo)}`)
  },
  async assignCarrier(groupNo: string, carrierCode: string): Promise<DispatchGroup> {
    const response = await apiClient.put<ApiEnvelope<DispatchGroup>>(`/admin/dispatch-groups/${encodeURIComponent(groupNo)}/carrier/${encodeURIComponent(carrierCode)}`)
    return response.data.data
  },
  async clearCarrier(groupNo: string): Promise<DispatchGroup> {
    const response = await apiClient.delete<ApiEnvelope<DispatchGroup>>(`/admin/dispatch-groups/${encodeURIComponent(groupNo)}/carrier`)
    return response.data.data
  },
  async addSlip(groupNo: string, slipNo: string, inclusionType: 'OUTBOUND' | 'INBOUND'): Promise<DispatchGroup> {
    const response = await apiClient.post<ApiEnvelope<DispatchGroup>>(`/admin/dispatch-groups/${encodeURIComponent(groupNo)}/slips`, { slipNo, inclusionType })
    return response.data.data
  },
  async removeSlip(groupNo: string, slipNo: string): Promise<DispatchGroup> {
    const response = await apiClient.delete<ApiEnvelope<DispatchGroup>>(`/admin/dispatch-groups/${encodeURIComponent(groupNo)}/slips/${encodeURIComponent(slipNo)}`)
    return response.data.data
  },
  async reorder(groupNo: string, slipNos: string[]): Promise<DispatchGroup> {
    const response = await apiClient.put<ApiEnvelope<DispatchGroup>>(`/admin/dispatch-groups/${encodeURIComponent(groupNo)}/slips/order`, { slipNos })
    return response.data.data
  },
}
