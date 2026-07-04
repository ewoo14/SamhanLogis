import { apiClient, type ApiEnvelope } from './client'

export type CodefConnectionBusinessType = 'BANK' | 'CARD' | 'LOAN'
export type CodefConnectionStatus = 'ACTIVE' | 'ADDITIONAL_AUTH' | 'ERROR' | string

export interface RegisterInstitutionRequest {
  businessType: CodefConnectionBusinessType
  organization: string
  loginType: string
  credentials: Record<string, string>
}

export interface RegisteredInstitutionResponse {
  businessType: CodefConnectionBusinessType
  organizationCode: string
  accountIdentifier: string | null
  nickname: string | null
  status: CodefConnectionStatus
  registeredAt: string | null
  lastVerifiedAt: string | null
  message: string | null
}

export interface RegisteredInstitutionListResponse {
  institutions: RegisteredInstitutionResponse[]
}

export interface UnregisterInstitutionRequest {
  businessType: CodefConnectionBusinessType
  organizationCode: string
}

export interface CodefAccountItem {
  ref: string
  name: string
  bankName: string
  accountNumber: string
}

export interface CodefCardItem {
  ref: string
  name: string
  issuerName: string
  cardNumber: string
}

export interface CodefLoanItem {
  ref: string
  name: string
  lenderName: string
  loanType: string
}

const BASE_PATH = '/accounting/codef/connection'

export async function registerCodefInstitution(
  request: RegisterInstitutionRequest,
): Promise<RegisteredInstitutionResponse> {
  const res = await apiClient.post<ApiEnvelope<RegisteredInstitutionResponse>>(
    `${BASE_PATH}/institutions`,
    request,
  )
  return res.data.data
}

export async function listCodefRegisteredInstitutions(): Promise<RegisteredInstitutionResponse[]> {
  const res = await apiClient.get<ApiEnvelope<RegisteredInstitutionListResponse>>(
    `${BASE_PATH}/institutions`,
  )
  return res.data.data.institutions
}

export async function unregisterCodefInstitution(
  request: UnregisterInstitutionRequest,
): Promise<RegisteredInstitutionResponse> {
  const res = await apiClient.patch<ApiEnvelope<RegisteredInstitutionResponse>>(
    `${BASE_PATH}/institutions/unregister`,
    request,
  )
  return res.data.data
}

export async function listCodefConnectionAccounts(): Promise<CodefAccountItem[]> {
  const res = await apiClient.get<ApiEnvelope<{ accounts: CodefAccountItem[] }>>(
    `${BASE_PATH}/accounts`,
  )
  return res.data.data.accounts
}

export async function listCodefConnectionCards(): Promise<CodefCardItem[]> {
  const res = await apiClient.get<ApiEnvelope<{ cards: CodefCardItem[] }>>(
    `${BASE_PATH}/cards`,
  )
  return res.data.data.cards
}

export async function listCodefConnectionLoans(): Promise<CodefLoanItem[]> {
  const res = await apiClient.get<ApiEnvelope<{ loans: CodefLoanItem[] }>>(
    `${BASE_PATH}/loans`,
  )
  return res.data.data.loans
}
