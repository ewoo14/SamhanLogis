export interface SheetSyncResult {
  inserted?: number
  updated?: number
  unchanged?: number
  softDeleted?: number
  skipped?: number
  error?: string | null
  linked?: number
  bundlesMarked?: number
}

export interface SheetSyncSummary {
  byTab: Record<string, SheetSyncResult>
  byComponentTab?: Record<string, SheetSyncResult>
  failedTabs: number
}

export interface SheetSyncRow {
  tabName: string
  result: Required<Pick<SheetSyncResult, 'inserted' | 'updated' | 'unchanged' | 'softDeleted' | 'skipped'>> & Pick<SheetSyncResult, 'error'>
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
        inserted: result.linked,
        updated: result.bundlesMarked,
        unchanged: 0,
        softDeleted: result.softDeleted,
        skipped: result.skipped,
        error: result.error,
      }),
    })
  }

  return rows
}

function normalizeResult(result: SheetSyncResult): SheetSyncRow['result'] {
  return {
    inserted: result.inserted ?? 0,
    updated: result.updated ?? 0,
    unchanged: result.unchanged ?? 0,
    softDeleted: result.softDeleted ?? 0,
    skipped: result.skipped ?? 0,
    error: result.error,
  }
}
