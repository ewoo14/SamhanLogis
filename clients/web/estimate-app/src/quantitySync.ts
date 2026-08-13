/** 종합견적서가 소비하는 HOME_MULTI 서버 규칙 evaluator. */
export type QuantitySyncRule = {
  estimateCategory?: unknown
  enabled?: unknown
  aggregation?: unknown
  inactiveBehavior?: unknown
  conflictPolicy?: unknown
  sources?: unknown
  targets?: unknown
}

export type QuantitySyncCatalogRow = {
  id?: unknown
  model?: unknown
  modelCode?: unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function codeOf(row: QuantitySyncCatalogRow): string {
  return text(row.modelCode ?? row.model)
}

function rowsByCode(catalog: QuantitySyncCatalogRow[], code: string): QuantitySyncCatalogRow[] {
  const needle = code.toUpperCase()
  return catalog.filter((row) => codeOf(row).toUpperCase() === needle)
}

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function rowKey(row: QuantitySyncCatalogRow): string {
  return text(row.id ?? codeOf(row))
}

/** 규칙 하나를 평가한다. source/target graph가 불완전하면 null로 fallback을 요청한다. */
function evaluateRule(
  rule: QuantitySyncRule,
  catalog: QuantitySyncCatalogRow[],
  quantities: Map<string, number>,
): Array<{ code: string; quantity: number; conflictPolicy: string }> | null {
  if (rule.enabled !== true || text(rule.estimateCategory) !== 'HOME_MULTI') return null
  if (text(rule.aggregation) !== 'SUM' || text(rule.inactiveBehavior) !== 'ZERO') return null
  const sources = Array.isArray(rule.sources) ? rule.sources as Array<Record<string, unknown>> : []
  const targets = Array.isArray(rule.targets) ? rule.targets as Array<Record<string, unknown>> : []
  if (sources.length === 0 || targets.length === 0) return null

  let sourceTotal = 0
  for (const source of sources) {
    const sourceCode = text(source.productCode)
    const factor = positiveNumber(source.factor)
    const rows = rowsByCode(catalog, sourceCode)
    if (!sourceCode || factor == null || rows.length === 0) return null
    for (const row of rows) sourceTotal += (Number(quantities.get(rowKey(row))) || 0) * factor
  }

  return targets.map((target) => {
    const targetCode = text(target.productCode)
    const multiplier = positiveNumber(target.multiplier)
    const rows = rowsByCode(catalog, targetCode)
    if (!targetCode || multiplier == null || rows.length === 0) throw new Error('invalid target')
    const raw = sourceTotal * multiplier
    const quantity = text(target.roundingMode || 'NONE') === 'FLOOR' ? Math.floor(raw) : raw
    return { code: targetCode, quantity, conflictPolicy: text(rule.conflictPolicy || 'ADD') }
  })
}

/** 모든 HOME_MULTI 규칙을 평가한다. 오류는 null로 반환해 legacy fallback을 보장한다. */
export function evaluateQuantitySyncRules(
  rules: unknown,
  catalog: QuantitySyncCatalogRow[],
  quantities: Map<string, number>,
): Map<string, number> | null {
  if (!Array.isArray(rules) || !Array.isArray(catalog) || !(quantities instanceof Map)) return null
  const result = new Map<string, number>()
  try {
    for (const rawRule of rules) {
      if (!rawRule || typeof rawRule !== 'object') return null
      const evaluated = evaluateRule(rawRule as QuantitySyncRule, catalog, quantities)
      if (evaluated == null) return null
      for (const item of evaluated) {
        const row = rowsByCode(catalog, item.code)[0]
        if (!row) return null
        const key = rowKey(row)
        if (item.conflictPolicy === 'REPLACE' || !result.has(key)) result.set(key, item.quantity)
        else result.set(key, (result.get(key) || 0) + item.quantity)
      }
    }
  } catch (_) {
    return null
  }
  return result
}
