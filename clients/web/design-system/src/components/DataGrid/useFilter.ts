/**
 * useFilter — DataGrid 열헤더 필터 훅.
 *
 * 각 컬럼에 대해 text 필터 값과 checkbox 선택 값을 관리한다.
 * `filteredRows` 는 모든 활성 필터를 AND 조건으로 적용한 결과를 반환한다.
 *
 * 필터 타입:
 * - 'text'   — 포함 검색 (대소문자 무시)
 * - 'select' — 고유값 checkbox 선택 (미선택 = 전체 허용)
 * - false    — 필터 비활성
 */
import { useState, useCallback, useMemo } from 'react'

export interface ColumnFilterDef {
  key: string
  filter?: 'text' | 'select' | false
}

export interface FilterState {
  textValue: string
  selectedValues: Set<string>
}

function defaultFilterState(): FilterState {
  return { textValue: '', selectedValues: new Set<string>() }
}

export interface UseFilterReturn<T> {
  /** 열키별 현재 필터 상태 */
  filterStates: Record<string, FilterState>
  /** 필터 적용 후 rows */
  filteredRows: T[]
  /** text 필터 값 변경 */
  setTextFilter: (colKey: string, value: string) => void
  /** select 필터 toggle */
  toggleSelectFilter: (colKey: string, value: string) => void
  /** 특정 컬럼 필터 초기화 */
  clearColumnFilter: (colKey: string) => void
  /** 필터 적용 여부 (UI 강조용) */
  hasActiveFilter: (colKey: string) => boolean
  /** 특정 컬럼에 대해 유니크 값 목록 (필터 팝오버 checkbox 용) */
  uniqueValues: (colKey: string) => string[]
}

/**
 * 행 데이터에서 특정 키의 표시 값을 문자열로 추출.
 * format 함수가 있으면 그것을 사용, 없으면 String() 변환.
 */
function getCellString<T>(
  row: T,
  colKey: string,
  format?: (v: unknown) => string,
): string {
  const v = (row as Record<string, unknown>)[colKey]
  if (format) return format(v)
  if (v === null || v === undefined) return ''
  return String(v)
}

export function useFilter<T>(
  rows: T[],
  columns: Array<{ key: string; filter?: 'text' | 'select' | false; format?: (v: unknown) => string }>,
): UseFilterReturn<T> {
  const [filterStates, setFilterStates] = useState<Record<string, FilterState>>({})

  const getState = useCallback((colKey: string): FilterState => {
    return filterStates[colKey] ?? defaultFilterState()
  }, [filterStates])

  const setTextFilter = useCallback((colKey: string, value: string) => {
    setFilterStates((prev) => ({
      ...prev,
      [colKey]: { ...getState(colKey), textValue: value },
    }))
  }, [getState])

  const toggleSelectFilter = useCallback((colKey: string, value: string) => {
    setFilterStates((prev) => {
      const cur = prev[colKey] ?? defaultFilterState()
      const next = new Set(cur.selectedValues)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return { ...prev, [colKey]: { ...cur, selectedValues: next } }
    })
  }, [])

  const clearColumnFilter = useCallback((colKey: string) => {
    setFilterStates((prev) => {
      const next = { ...prev }
      delete next[colKey]
      return next
    })
  }, [])

  const hasActiveFilter = useCallback((colKey: string): boolean => {
    const s = filterStates[colKey]
    if (!s) return false
    return s.textValue.trim().length > 0 || s.selectedValues.size > 0
  }, [filterStates])

  const uniqueValues = useCallback((colKey: string): string[] => {
    const col = columns.find((c) => c.key === colKey)
    const vals = new Set<string>()
    for (const row of rows) {
      vals.add(getCellString(row, colKey, col?.format))
    }
    return Array.from(vals).sort()
  }, [rows, columns])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      for (const col of columns) {
        if (!col.filter) continue
        const state = filterStates[col.key]
        if (!state) continue
        const cellVal = getCellString(row, col.key, col.format)
        if (col.filter === 'text' && state.textValue.trim()) {
          if (!cellVal.toLowerCase().includes(state.textValue.toLowerCase())) {
            return false
          }
        }
        if (col.filter === 'select' && state.selectedValues.size > 0) {
          if (!state.selectedValues.has(cellVal)) {
            return false
          }
        }
      }
      return true
    })
  }, [rows, columns, filterStates])

  return {
    filterStates,
    filteredRows,
    setTextFilter,
    toggleSelectFilter,
    clearColumnFilter,
    hasActiveFilter,
    uniqueValues,
  }
}
