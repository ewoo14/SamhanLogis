import { apiClient, type ApiEnvelope } from './client'
export interface ReceivedDispatchGroup { groupNo: string; dispatchDate: string; vehicleLabel: string; carrierCode: string; carrierName: string; slips: string }
export const receivedDispatchGroupsApi = { async list(dispatchDate: string) { const r = await apiClient.get<ApiEnvelope<ReceivedDispatchGroup[]>>('/admin/arologis/dispatch-groups', { params: { dispatchDate } }); return r.data.data ?? [] } }
