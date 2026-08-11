import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  deriveLegacyAnalysis as deriveAfter,
  withProfitFields as withProfitFieldsAfter,
  type InOutAnalysisRow,
} from './inoutAnalysisModel'

type Analysis = ReturnType<typeof deriveAfter>
type Derive = (rows: readonly InOutAnalysisRow[]) => Analysis

function loadBefore(): { deriveLegacyAnalysis: Derive } {
  const source = execFileSync('git', [
    'show',
    'HEAD:clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts',
  ], { encoding: 'utf8' })
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} as Record<string, unknown> }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports as { deriveLegacyAnalysis: Derive }
}

const deriveBefore = loadBefore().deriveLegacyAnalysis

const row = (
  modelCode: string,
  inboundQuantity: number,
  outboundQuantity: number,
  monthly: InOutAnalysisRow['monthly'],
) => withProfitFieldsAfter({
  modelCode,
  productName: modelCode,
  inboundQuantity,
  outboundQuantity,
  purchaseAmount: inboundQuantity > 0 ? inboundQuantity * 100 : null,
  salesAmount: outboundQuantity * 150,
  monthly,
})

function assertOnlyMissingForecastChanged(
  name: string,
  rows: InOutAnalysisRow[],
  previousDataMonths: readonly number[],
) {
  const before = deriveBefore(rows)
  const after = deriveAfter(rows)
  const beforeWithoutForecast = { ...before, forecast: undefined }
  const afterWithoutForecast = { ...after, forecast: undefined }
  expect(afterWithoutForecast, `${name}: forecast 외 모든 필드`).toEqual(beforeWithoutForecast)
  expect(after.forecast.map((point) => point.month), `${name}: forecast 월 좌표`).toEqual(
    before.forecast.map((point) => point.month),
  )
  for (const beforePoint of before.forecast) {
    const afterPoint = after.forecast.find((point) => point.month === beforePoint.month)!
    if (previousDataMonths.includes(beforePoint.month)) {
      expect(afterPoint.quantity, `${name}: 자료 존재 ${beforePoint.month}월 숫자`).toBe(beforePoint.quantity)
    } else {
      expect(afterPoint.quantity, `${name}: 자료 부재 ${beforePoint.month}월`).toBeNull()
    }
  }
  return { name, before, after }
}

describe('D-G5 SOL 수정 전후 숫자 대조', () => {
  it('혼합 fixture에서 자료 존재월 숫자와 분석 지표가 모두 동일하다', () => {
    const rows = [
      row('A', 3, 70, [
        { year: 2025, month: 1, inboundQuantity: 0, outboundQuantity: 10 },
        { year: 2025, month: 4, inboundQuantity: 3, outboundQuantity: 0 },
        { year: 2025, month: 5, inboundQuantity: 0, outboundQuantity: 30 },
        { year: 2026, month: 1, inboundQuantity: 0, outboundQuantity: 20 },
        { year: 2026, month: 3, inboundQuantity: 0, outboundQuantity: 30 },
      ]),
      row('B', 2, 20, [
        { year: 2025, month: 5, inboundQuantity: 0, outboundQuantity: 10 },
        { year: 2026, month: 2, inboundQuantity: 0, outboundQuantity: 20 },
      ]),
      row('C', 1, 5, [{ year: 2026, month: 3, inboundQuantity: 0, outboundQuantity: 5 }]),
      row('INBOUND-ONLY', 9, 0, [{ year: 2025, month: 4, inboundQuantity: 9, outboundQuantity: 0 }]),
    ]
    const result = assertOnlyMissingForecastChanged('혼합', rows, [4, 5])
    expect(result.before.forecastRate).toBe(7.5)
    expect(result.before.forecast.find((point) => point.month === 4)?.quantity).toBe(0)
    expect(result.after.forecast.find((point) => point.month === 4)?.quantity).toBe(0)
    expect(result.before.forecast.find((point) => point.month === 5)?.quantity).toBe(300)
    expect(result.after.forecast.find((point) => point.month === 5)?.quantity).toBe(300)
    console.log('DG5_NUMERIC_MIXED=' + JSON.stringify(result))
  })

  it('forecast 대상 모든 월에 전년 점이 있으면 배열 전체가 byte-for-byte 동일하다', () => {
    const previous = Array.from({ length: 12 }, (_, index) => ({
      year: 2025,
      month: index + 1,
      inboundQuantity: index === 7 ? 4 : 0,
      outboundQuantity: index === 7 ? 0 : (index + 1) * 3,
    }))
    const current = Array.from({ length: 6 }, (_, index) => ({
      year: 2026,
      month: index + 1,
      inboundQuantity: 0,
      outboundQuantity: (index + 1) * 6,
    }))
    const rows = [row('ALL-KNOWN', 4, 126, [...previous, ...current])]
    const before = deriveBefore(rows)
    const after = deriveAfter(rows)
    expect(after).toEqual(before)
    expect(after.forecast.find((point) => point.month === 8)?.quantity).toBe(0)
    console.log('DG5_NUMERIC_ALL_KNOWN=' + JSON.stringify({ before, after }))
  })

  it('당해-only는 지표를 보존하고 forecast 수량만 null로 바뀐다', () => {
    const rows = [row('CURRENT-ONLY', 0, 12, [
      { year: 2026, month: 2, inboundQuantity: 0, outboundQuantity: 12 },
    ])]
    const result = assertOnlyMissingForecastChanged('당해-only', rows, [])
    expect(result.after.previousYear).toBe(2025)
    expect(result.after.forecast.every((point) => point.quantity === null)).toBe(true)
    console.log('DG5_NUMERIC_CURRENT_ONLY=' + JSON.stringify(result))
  })
})
