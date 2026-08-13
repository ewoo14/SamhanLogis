import { apiClient } from './client'

export type QuantitySyncCategory = 'HOME_MULTI' | 'SINGLE_SET' | 'COMM_MULTI'

export interface QuantitySyncProductRef {
  productCode: string
  productName: string
  factor?: number | string | null
  multiplier?: number | string | null
  roundingMode?: 'NONE' | 'FLOOR' | null
  componentVariant?: string | null
  componentShape?: string | null
  displayOrder?: number | null
}

export interface QuantitySyncRule {
  ruleKey: string
  estimateCategory: QuantitySyncCategory
  name: string
  enabled: boolean
  aggregation: 'SUM'
  when: Record<string, unknown>
  inactiveBehavior: 'ZERO'
  conflictPolicy: 'ADD' | 'REPLACE'
  priority: number
  legacyRef: string
  sources: QuantitySyncProductRef[]
  targets: QuantitySyncProductRef[]
}

export interface QuantitySyncRuleRequest {
  ruleKey: string
  estimateCategory: QuantitySyncCategory
  name: string
  enabled: boolean
  aggregation: 'SUM'
  when: Record<string, unknown>
  inactiveBehavior: 'ZERO'
  conflictPolicy: 'ADD' | 'REPLACE'
  priority: number
  legacyRef: string
  sources: Array<{ productCode: string; factor: number }>
  targets: Array<{
    productCode: string
    multiplier: number
    roundingMode: 'NONE' | 'FLOOR'
    componentVariant?: string | null
    componentShape?: string | null
    displayOrder: number
  }>
}

export async function listQuantitySyncRules(
  estimateCategory: QuantitySyncCategory,
): Promise<QuantitySyncRule[]> {
  const res = await apiClient.get<QuantitySyncRule[]>('/api/v1/quantity-sync-rules', {
    params: { estimateCategory },
  })
  return res.data
}

export async function createQuantitySyncRule(
  request: QuantitySyncRuleRequest,
): Promise<QuantitySyncRule> {
  const res = await apiClient.post<QuantitySyncRule>('/api/v1/quantity-sync-rules', request)
  return res.data
}

export async function replaceQuantitySyncRule(
  ruleKey: string,
  request: QuantitySyncRuleRequest,
): Promise<QuantitySyncRule> {
  const res = await apiClient.put<QuantitySyncRule>(
    `/api/v1/quantity-sync-rules/${encodeURIComponent(ruleKey)}`,
    request,
  )
  return res.data
}

export async function deleteQuantitySyncRule(ruleKey: string): Promise<void> {
  await apiClient.delete(`/api/v1/quantity-sync-rules/${encodeURIComponent(ruleKey)}`)
}
