import { apiClient, type ApiEnvelope } from './client'

export type CodefImportType = 'BANK' | 'CARD' | 'LOAN' | 'ALL'
export type CodefSubmitMethod = 'DRY_RUN' | 'CODEF'

export interface CodefImportRequest {
  from: string
  to: string
  type: CodefImportType
  accountRef?: string
  cardRef?: string
  loanRef?: string
  submitMethod?: CodefSubmitMethod
}

export interface CodefImportResponse {
  fetchedCount: number
  importedCount: number
  duplicateSkippedCount: number
  matchedCount: number
}

export async function importCodefTransactions(
  request: CodefImportRequest,
): Promise<CodefImportResponse> {
  const res = await apiClient.post<ApiEnvelope<CodefImportResponse>>(
    '/accounting/codef/import',
    request,
  )
  return res.data.data
}
