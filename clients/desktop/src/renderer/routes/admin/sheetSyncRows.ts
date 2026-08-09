export interface SheetSyncResult {
  insertedRows?: number
  updatedRows?: number
  unchangedRows?: number
  softDeletedRows?: number
  skippedOccurrences?: number
  error?: string | null
  linkedOccurrences?: number
  bundlesMarkedProducts?: number
}

export interface SheetSyncSummary {
  byTab: Record<string, SheetSyncResult>
  byComponentTab?: Record<string, SheetSyncResult>
  failedTabs: number
}

export interface SheetSyncRow {
  tabName: string
  result: Required<Pick<SheetSyncResult, 'insertedRows' | 'updatedRows' | 'unchangedRows' | 'softDeletedRows' | 'skippedOccurrences'>> & Pick<SheetSyncResult, 'error'>
}

export function buildSheetSyncRows(summary: SheetSyncSummary): SheetSyncRow[] {
  const rows = Object.entries(summary.byTab ?? {}).map(([tabName, result]) => ({
    tabName,
    result: normalizeResult(result),
  }))

  for (const [tabName, result] of Object.entries(summary.byComponentTab ?? {})) {
    rows.push({
      tabName: `구성품 · ${tabName}`,
      result: normalizeResult({
        insertedRows: result.linkedOccurrences,
        updatedRows: result.bundlesMarkedProducts,
        unchangedRows: 0,
        softDeletedRows: result.softDeletedRows,
        skippedOccurrences: result.skippedOccurrences,
        error: result.error,
      }),
    })
  }

  return rows
}

function normalizeResult(result: SheetSyncResult): SheetSyncRow['result'] {
  return {
    insertedRows: result.insertedRows ?? 0,
    updatedRows: result.updatedRows ?? 0,
    unchangedRows: result.unchangedRows ?? 0,
    softDeletedRows: result.softDeletedRows ?? 0,
    skippedOccurrences: result.skippedOccurrences ?? 0,
    error: result.error,
  }
}
