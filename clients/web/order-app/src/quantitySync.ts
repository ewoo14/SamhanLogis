/**
 * 칩 기반 수량 동기화 규칙의 order-app 소비 경계.
 *
 * <p>이번 슬라이스는 S-03 하나만 허용한다. 규칙이 없거나 유효하지 않으면 호출자가
 * legacy 계산으로 되돌아가고, 이 모듈은 0을 만들어 반환하지 않는다.
 */

export const SINGLE_S03_RULE_KEY = 'SINGLE_S03_CEILING_DRAIN_PUMP'

export type QuantitySyncSource = {
  productCode?: unknown
  factor?: unknown
}

export type QuantitySyncTarget = {
  productCode?: unknown
  multiplier?: unknown
  roundingMode?: unknown
  displayOrder?: unknown
}

export type QuantitySyncRule = {
  ruleKey?: unknown
  legacyRef?: unknown
  estimateCategory?: unknown
  enabled?: unknown
  aggregation?: unknown
  when?: unknown
  conditionJson?: unknown
  inactiveBehavior?: unknown
  sources?: unknown
  targets?: unknown
}

export type SingleCatalogRow = {
  id?: unknown
  model?: unknown
  modelCode?: unknown
  name?: unknown
}

export type SingleQuantitySyncResult = {
  status: 'ready' | 'error'
  targetProductCode: string | null
  targetQuantities: Map<string, number>
  missingCatalogCodes: string[]
  errorMessage: string | null
}

export type SingleQuantitySyncRuleSelection = {
  status: 'ready' | 'error'
  rule: QuantitySyncRule | null
  errorMessage: string | null
  missingCatalogCodes: string[]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function positiveNumber(value: unknown, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label}은 0보다 큰 유한수여야 합니다.`)
  }
  return parsed
}

function rowsForProductCode(catalog: SingleCatalogRow[], productCode: string): SingleCatalogRow[] {
  return catalog.filter((row) => text(row.modelCode ?? row.model).toUpperCase() === productCode.toUpperCase())
}

function sourceRows(catalog: SingleCatalogRow[], sources: QuantitySyncSource[]): SingleCatalogRow[] {
  return sources.flatMap((source) => rowsForProductCode(catalog, text(source.productCode)))
}

function errorResult(message: string, missingCatalogCodes: string[] = []): SingleQuantitySyncResult {
  return {
    status: 'error',
    targetProductCode: null,
    targetQuantities: new Map(),
    missingCatalogCodes,
    errorMessage: message,
  }
}

function selectionError(message: string, missingCatalogCodes: string[] = []): SingleQuantitySyncRuleSelection {
  return {
    status: 'error',
    rule: null,
    errorMessage: message,
    missingCatalogCodes,
  }
}

/** API 목록에서 S-03의 단일 규칙을 고르고 catalog graph를 검증한다. */
export function selectSingleS03Rule(
  rules: unknown,
  catalog: SingleCatalogRow[],
): SingleQuantitySyncRuleSelection {
  if (!Array.isArray(rules)) {
    return selectionError('수량 동기화 규칙 목록 응답 형식이 올바르지 않습니다.')
  }

  const candidates = rules.filter((item): item is QuantitySyncRule => {
    if (!item || typeof item !== 'object') return false
    const rule = item as QuantitySyncRule
    return text(rule.ruleKey) === SINGLE_S03_RULE_KEY || text(rule.legacyRef) === 'S-03'
  })
  const exact = candidates.filter((rule) => text(rule.ruleKey) === SINGLE_S03_RULE_KEY)
  if (exact.length !== 1) {
    return selectionError(`S-03 규칙을 정확히 하나 찾지 못했습니다(발견 ${exact.length}개).`)
  }

  const rule = exact[0]
  if (!rule) return selectionError('S-03 규칙을 정확히 하나 찾지 못했습니다.')
  if (rule.enabled !== true) return selectionError('S-03 규칙이 비활성화되어 있습니다.')
  if (text(rule.estimateCategory) !== 'SINGLE_SET') {
    return selectionError('S-03 규칙의 estimateCategory가 SINGLE_SET이 아닙니다.')
  }
  if (text(rule.aggregation) !== 'SUM') return selectionError('S-03 규칙은 SUM만 지원합니다.')
  if (text(rule.inactiveBehavior) !== 'ZERO') {
    return selectionError('S-03 규칙은 inactive_behavior ZERO만 지원합니다.')
  }

  const when = rule.when ?? rule.conditionJson ?? {}
  if (!when || typeof when !== 'object' || Array.isArray(when) || Object.keys(when).length > 0) {
    return selectionError('S-03 규칙은 조건 없는 설정만 지원합니다.')
  }
  if (!Array.isArray(rule.sources) || rule.sources.length !== 1) {
    return selectionError('S-03 규칙은 source 하나만 가져야 합니다.')
  }
  if (!Array.isArray(rule.targets) || rule.targets.length !== 1) {
    return selectionError('S-03 규칙은 target 하나만 가져야 합니다.')
  }

  const sourceCode = text((rule.sources[0] as QuantitySyncSource).productCode)
  const targetCode = text((rule.targets[0] as QuantitySyncTarget).productCode)
  if (!sourceCode || !targetCode) return selectionError('S-03 source/target modelCode가 비어 있습니다.')

  const missing = [sourceCode, targetCode].filter((code) => rowsForProductCode(catalog, code).length === 0)
  if (missing.length > 0) {
    return selectionError(
      `S-03 규칙 대상 품목이 싱글 카탈로그에 없습니다: ${missing.join(', ')}`,
      missing,
    )
  }

  try {
    positiveNumber((rule.sources[0]! as QuantitySyncSource).factor, 'S-03 factor')
    positiveNumber((rule.targets[0]! as QuantitySyncTarget).multiplier, 'S-03 multiplier')
  } catch (error) {
    return selectionError(error instanceof Error ? error.message : String(error))
  }

  return { status: 'ready', rule, errorMessage: null, missingCatalogCodes: [] }
}

/**
 * 한 번의 S-03 계산을 수행한다.
 *
 * <p>수동 잠금은 order-app의 {@code setDerivedQty}가 담당하므로 이 함수는 계산값만 만든다.
 * source/target catalog 누락은 빈 Map/0으로 숨기지 않고 error 결과로 반환한다.
 */
export function evaluateSingleS03Rule(
  rule: QuantitySyncRule | null,
  catalog: SingleCatalogRow[],
  quantities: Map<string, number>,
): SingleQuantitySyncResult {
  if (!rule) return errorResult('S-03 규칙이 없습니다.')
  const sourceList = Array.isArray(rule.sources) ? rule.sources as QuantitySyncSource[] : []
  const targetList = Array.isArray(rule.targets) ? rule.targets as QuantitySyncTarget[] : []
  if (sourceList.length !== 1 || targetList.length !== 1) {
    return errorResult('S-03 source/target 정의가 단일 관계가 아닙니다.')
  }

  const sourceDefinition = sourceList[0]!
  const targetDefinition = targetList[0]!
  const sourceCode = text(sourceDefinition.productCode)
  const targetCode = text(targetDefinition.productCode)
  const source = sourceRows(catalog, sourceList)
  const target = rowsForProductCode(catalog, targetCode)
  const missing = [
    source.length === 0 ? sourceCode : '',
    target.length === 0 ? targetCode : '',
  ].filter(Boolean)
  if (missing.length > 0) {
    return errorResult(`S-03 규칙 대상 품목이 싱글 카탈로그에 없습니다: ${missing.join(', ')}`, missing)
  }

  try {
    const factor = positiveNumber(sourceDefinition.factor, 'S-03 factor')
    const multiplier = positiveNumber(targetDefinition.multiplier, 'S-03 multiplier')
    const sourceTotal = source.reduce((sum, row) => sum + (Number(quantities.get(text(row.id))) || 0) * factor, 0)
    const rawTargetQuantity = sourceTotal * multiplier
    const roundingMode = text(targetDefinition.roundingMode || 'NONE')
    const targetQuantity = roundingMode === 'FLOOR' ? Math.floor(rawTargetQuantity) : rawTargetQuantity
    const targetRow = target[0]!
    return {
      status: 'ready',
      targetProductCode: targetCode,
      targetQuantities: new Map([[targetRow.id === undefined ? targetCode : text(targetRow.id), targetQuantity]]),
      missingCatalogCodes: [],
      errorMessage: null,
    }
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error))
  }
}
