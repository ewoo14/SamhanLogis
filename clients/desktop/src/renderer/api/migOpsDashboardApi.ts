import { apiClient, type ApiEnvelope } from './client'

export interface MigOpsMetric {
  slice: string
  count: string
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
  diffCount: string
}

export interface AgingNetMetric {
  netReceivable: string
  netPayable: string
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
