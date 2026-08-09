import type { ComponentSyncResult, TabSyncResult } from '../../api/sheetSyncApi'

export interface SheetSyncResult extends Partial<TabSyncResult>, Partial<ComponentSyncResult> {}

export interface SheetSyncRowResult {
  insertedRows?: number
  updatedRows?: number
  unchangedRows?: number
  softDeletedProductRows?: number
  softDeletedComponentRows?: number
  skippedOccurrences?: number
  linkedOccurrences?: number
  bundlesMarkedProducts?: number
  error?: string | null
}

export interface SheetSyncSummary {
  byTab: Record<string, TabSyncResult>
  byComponentTab?: Record<string, ComponentSyncResult>
  failedTabs: number
}

export interface SheetSyncRow {
  tabName: string
  kind: 'product' | 'component'
  result: SheetSyncRowResult
}

export function buildSheetSyncRows(summary: SheetSyncSummary): SheetSyncRow[] {
  const rows: SheetSyncRow[] = Object.entries(summary.byTab ?? {}).map(([tabName, result]) => ({
    tabName,
    kind: 'product' as const,
    result: normalizeResult(result),
  }))

  for (const [tabName, result] of Object.entries(summary.byComponentTab ?? {})) {
    rows.push({
      tabName: `구성품 · ${tabName}`,
      kind: 'component' as const,
      result: normalizeResult({
        linkedOccurrences: result.linkedOccurrences,
        bundlesMarkedProducts: result.bundlesMarkedProducts,
        unchangedRows: 0,
        softDeletedComponentRows: result.softDeletedComponentRows,
        skippedOccurrences: result.skippedOccurrences,
        error: result.error,
      }),
    })
  }

  return rows
}

function normalizeResult(result: SheetSyncResult): SheetSyncRowResult {
  return {
    insertedRows: result.insertedRows ?? 0,
    updatedRows: result.updatedRows ?? 0,
    unchangedRows: result.unchangedRows ?? 0,
    softDeletedProductRows: result.softDeletedProductRows ?? 0,
    softDeletedComponentRows: result.softDeletedComponentRows ?? 0,
    skippedOccurrences: result.skippedOccurrences ?? 0,
    linkedOccurrences: result.linkedOccurrences ?? 0,
    bundlesMarkedProducts: result.bundlesMarkedProducts ?? 0,
    error: result.error,
  }
}
