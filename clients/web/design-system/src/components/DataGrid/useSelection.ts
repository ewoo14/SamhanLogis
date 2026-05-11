/**
 * useSelection — DataGrid 다중 셀 선택 훅.
 *
 * 지원 인터랙션:
 * - 단일 클릭 → 1셀 선택 (이전 선택 해제)
 * - Shift+클릭 → anchor 부터 현재 셀까지 사각형 범위 선택
 * - Ctrl+클릭 (또는 Meta+클릭) → 토글 추가/제거
 * - Ctrl+A → 현재 페이지 전체 선택
 *
 * 셀 좌표는 {rowIndex: number, colIndex: number} 로 표현.
 * Set<string> 에 `${rowIndex}:${colIndex}` 키로 저장.
 */
import { useState, useCallback, useRef } from 'react'

export interface CellCoord {
  rowIndex: number
  colIndex: number
}

function cellKey(r: number, c: number): string {
  return `${r}:${c}`
}

function rectKeys(a: CellCoord, b: CellCoord): Set<string> {
  const keys = new Set<string>()
  const r1 = Math.min(a.rowIndex, b.rowIndex)
  const r2 = Math.max(a.rowIndex, b.rowIndex)
  const c1 = Math.min(a.colIndex, b.colIndex)
  const c2 = Math.max(a.colIndex, b.colIndex)
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      keys.add(cellKey(r, c))
    }
  }
  return keys
}

export interface UseSelectionReturn {
  selected: Set<string>
  anchor: CellCoord | null
  isSelected: (r: number, c: number) => boolean
  handleCellClick: (r: number, c: number, e: React.MouseEvent) => void
  selectAll: (totalRows: number, totalCols: number) => void
  clearSelection: () => void
}

export function useSelection(): UseSelectionReturn {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchorRef = useRef<CellCoord | null>(null)

  const isSelected = useCallback((r: number, c: number) => {
    return selected.has(cellKey(r, c))
  }, [selected])

  const handleCellClick = useCallback((r: number, c: number, e: React.MouseEvent) => {
    const isShift = e.shiftKey
    const isCtrl = e.ctrlKey || e.metaKey

    setSelected((prev) => {
      if (isShift && anchorRef.current) {
        // 범위 선택 — anchor 부터 현재까지 직사각형
        const rect = rectKeys(anchorRef.current, { rowIndex: r, colIndex: c })
        if (isCtrl) {
          // Ctrl+Shift: 기존 선택에 범위 추가
          const next = new Set(prev)
          rect.forEach((k) => next.add(k))
          return next
        }
        return rect
      }
      if (isCtrl) {
        // 토글
        const next = new Set(prev)
        const k = cellKey(r, c)
        if (next.has(k)) next.delete(k)
        else next.add(k)
        anchorRef.current = { rowIndex: r, colIndex: c }
        return next
      }
      // 단순 클릭 — 단독 선택
      anchorRef.current = { rowIndex: r, colIndex: c }
      return new Set([cellKey(r, c)])
    })
  }, [])

  const selectAll = useCallback((totalRows: number, totalCols: number) => {
    const all = new Set<string>()
    for (let r = 0; r < totalRows; r++) {
      for (let c = 0; c < totalCols; c++) {
        all.add(cellKey(r, c))
      }
    }
    setSelected(all)
    anchorRef.current = { rowIndex: 0, colIndex: 0 }
  }, [])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    anchorRef.current = null
  }, [])

  return {
    selected,
    anchor: anchorRef.current,
    isSelected,
    handleCellClick,
    selectAll,
    clearSelection,
  }
}
