import { apiClient, type ApiEnvelope } from './client'

export interface MigOpsMetric {
  slice: string
  count: number
}

export interface TransformStatusMetric extends MigOpsMetric {
  status: string
}

export interface RejectedMetric extends MigOpsMetric {
  errorCode: string
}

export interface DailyClosingDiffMetric {
  closingKind: string
  sourceKind: string
  diffCount: number
}

export interface AgingNetMetric {
  netReceivable: number
  netPayable: number
}

export interface ReimportRunMetric extends MigOpsMetric {
  status: string
}

export interface EcountMigOpsDashboardResponse {
  transformStatus: TransformStatusMetric[]
  importedTotals: MigOpsMetric[]
  rejectedTotals: RejectedMetric[]
  dailyClosingDiffs: DailyClosingDiffMetric[]
  agingNet: AgingNetMetric
  reimportRuns: ReimportRunMetric[]
  reimportFilesScanned: MigOpsMetric[]
  observedAt: string
}

export async function getEcountMigOpsDashboard(): Promise<EcountMigOpsDashboardResponse> {
  const res = await apiClient.get<ApiEnvelope<EcountMigOpsDashboardResponse>>('/dashboard/ecount-mig')
  return res.data.data
}
