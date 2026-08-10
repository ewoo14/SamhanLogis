import { apiClient, type ApiEnvelope, type PageResponse } from './client'

export interface PartnerImportRejection {
  rowNumber: number
  reason: string
  rawPartnerCode: string
  rawName: string
}

export async function listPartnerImportRejections(
  sourceFileHash: string,
  page = 0,
  size = 100,
): Promise<PageResponse<PartnerImportRejection>> {
  const response = await apiClient.get<ApiEnvelope<{
    sourceFileHash: string
    page: number
    size: number
    totalElements: number
    totalPages: number
    items: PartnerImportRejection[]
  }>>(
    '/admin/partners/imports/ecount/rejections',
    { params: { sourceFileHash, page, size } },
  )
  const data = response.data.data
  return {
    content: data.items,
    totalElements: data.totalElements,
    totalPages: data.totalPages,
    number: data.page,
    size: data.size,
    first: data.page === 0,
    last: data.page + 1 >= data.totalPages,
  }
}

export interface PartnerImportResult {
  totalRows: number
  imported: number
  updated: number
  rejectedNullName: number
  skippedPlaceholder: number
  activeCount: number
  suspendedCount: number
  sourceFileHash: string
  rejectedSample: PartnerImportRejection[]
  excludedTrailerRows: number
  heldParseFailureRows: number
  heldSample: PartnerImportRejection[]
  infrastructureFailureRows: number
  infrastructureFailureSample: PartnerImportRejection[]
  infrastructureFailure: boolean
  registrationDateParsedCount: number
  createdAtLoadTimeCount: number
}

export async function importPartnerFile(file: File): Promise<PartnerImportResult> {
  const form = new FormData()
  form.append('file', file)
  const endpoint = /\.xlsx?$/i.test(file.name)
    ? '/admin/partners/imports/ecount-xlsx'
    : '/admin/partners/imports/ecount'
  const response = await apiClient.post<ApiEnvelope<PartnerImportResult>>(endpoint, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data.data
}
