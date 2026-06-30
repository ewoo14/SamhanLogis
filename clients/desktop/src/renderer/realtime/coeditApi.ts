import { apiClient, type ApiEnvelope } from '../api/client'
import { collabHeaders } from '../auth/collabHeaders'

export interface CoeditApi {
  getUpdates: () => Promise<string[]>
  postUpdate: (update: string) => Promise<void>
  postAwareness: (awareness: string) => Promise<void>
}

interface CoeditUpdatesResponse {
  updates: string[]
}

export function normalizeCoeditBasePath(basePath: string): string {
  const trimmed = basePath.trim().replace(/\/+$/, '')
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.startsWith('/api/v1/')
    ? withLeadingSlash
    : `/api/v1${withLeadingSlash}`
}

/**
 * 문서별 coedit HTTP API client factory.
 *
 * <p>호출자는 도메인 basePath(`/slips/{id}` 등)만 넘긴다. 기존 gateway 계약인 `/api/v1`
 * prefix 와 collab 인증 헤더는 이 factory 가 유지한다.
 */
export function makeCoeditApi(basePath: string): CoeditApi {
  const normalizedBasePath = normalizeCoeditBasePath(basePath)

  return {
    async getUpdates(): Promise<string[]> {
      const res = await apiClient.get<ApiEnvelope<CoeditUpdatesResponse>>(
        `${normalizedBasePath}/collab/coedit`,
        { headers: await collabHeaders() },
      )
      return res.data.data.updates
    },
    async postUpdate(update: string): Promise<void> {
      await apiClient.post<ApiEnvelope<null>>(
        `${normalizedBasePath}/collab/coedit/update`,
        { update },
        { headers: await collabHeaders() },
      )
    },
    async postAwareness(awareness: string): Promise<void> {
      await apiClient.post<ApiEnvelope<null>>(
        `${normalizedBasePath}/collab/coedit/awareness`,
        { awareness },
        { headers: await collabHeaders() },
      )
    },
  }
}
