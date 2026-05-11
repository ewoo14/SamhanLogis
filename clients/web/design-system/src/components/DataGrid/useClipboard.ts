/**
 * useClipboard — DataGrid 복사/붙여넣기 훅.
 *
 * - Ctrl+C: 선택된 셀을 TSV (탭/줄바꿈 구분) 로 클립보드 복사 (Excel 호환).
 *   선택된 셀의 최소 bounding-box 를 추출하여 직사각형 TSV 를 생성.
 *   비어있는 셀은 빈 문자열 포함.
 * - Ctrl+V: enablePaste=true 시 클립보드 TSV 를 분석하여 onPaste 콜백 호출.
 *   anchor 셀부터 시작점으로 붙여넣기 (row/col 오프셋 계산).
 *
 * 키보드 리스너는 DataGrid 가 focus 된 시점에만 활성화 (blur 시 제거).
 * 글로벌 listener 충돌 회피: tabIndex=0 인 wrapper div 에 onFocus/onBlur 연결.
 */
import { useCallback, useRef } from 'react'

export interface PasteCell {
  row: number
  col: string
  value: string
}

export interface UseClipboardOptions {
  enableCopy?: boolean
  enablePaste?: boolean
  onPaste?: (cells: PasteCell[]) => void
}

export interface UseClipboardReturn {
  /** DataGrid wrapper 에 부착할 keyboard 핸들러 — focusin 시 등록, focusout 시 해제. */
  handleKeyDown: (
    e: KeyboardEvent,
    getCellValue: (r: number, c: number) => string,
    selected: Set<string>,
    colKeys: string[],
    totalRows: number,
    totalCols: number,
    selectAll: (rows: number, cols: number) => void,
  ) => void
}

/**
 * `${r}:${c}` 키 집합에서 최소 bounding box 계산.
 */
function boundingBox(selected: Set<string>): {
  r1: number; c1: number; r2: number; c2: number
} | null {
  if (selected.size === 0) return null
  let r1 = Infinity, c1 = Infinity, r2 = -Infinity, c2 = -Infinity
  for (const key of selected) {
    const [rs, cs] = key.split(':')
    const r = parseInt(rs ?? '0', 10)
    const c = parseInt(cs ?? '0', 10)
    if (r < r1) r1 = r
    if (r > r2) r2 = r
    if (c < c1) c1 = c
    if (c > c2) c2 = c
  }
  return { r1, c1, r2, c2 }
}

export function useClipboard(options: UseClipboardOptions): UseClipboardReturn {
  const { enableCopy = true, enablePaste = false, onPaste } = options
  const anchorRef = useRef<{ r: number; c: number } | null>(null)

  const handleKeyDown = useCallback(
    (
      e: KeyboardEvent,
      getCellValue: (r: number, c: number) => string,
      selected: Set<string>,
      colKeys: string[],
      totalRows: number,
      totalCols: number,
      selectAll: (rows: number, cols: number) => void,
    ) => {
      const isCtrl = e.ctrlKey || e.metaKey

      // Ctrl+A — 전체 선택
      if (isCtrl && e.key === 'a') {
        e.preventDefault()
        selectAll(totalRows, totalCols)
        return
      }

      // Ctrl+C — 복사
      if (isCtrl && e.key === 'c' && enableCopy) {
        e.preventDefault()
        const box = boundingBox(selected)
        if (!box) return
        const { r1, c1, r2, c2 } = box
        const lines: string[] = []
        for (let r = r1; r <= r2; r++) {
          const cells: string[] = []
          for (let c = c1; c <= c2; c++) {
            // selected 가 비직사각형일 수 있으므로 선택 여부와 무관하게 bounding box 기준
            cells.push(getCellValue(r, c))
          }
          lines.push(cells.join('\t'))
        }
        const tsv = lines.join('\n')
        void navigator.clipboard.writeText(tsv)
        return
      }

      // Ctrl+V — 붙여넣기
      if (isCtrl && e.key === 'v' && enablePaste && onPaste) {
        e.preventDefault()
        // anchor 결정: selected 에서 최소 r, c
        const box = boundingBox(selected)
        if (!box) return
        const startRow = box.r1
        const startCol = box.c1
        void navigator.clipboard.readText().then((text) => {
          const lines = text.split('\n')
          const cells: PasteCell[] = []
          for (let dr = 0; dr < lines.length; dr++) {
            const line = lines[dr]
            if (line === undefined) continue
            const values = line.split('\t')
            for (let dc = 0; dc < values.length; dc++) {
              const rIdx = startRow + dr
              const cIdx = startCol + dc
              if (rIdx >= totalRows || cIdx >= totalCols) continue
              const colKey = colKeys[cIdx]
              if (!colKey) continue
              cells.push({ row: rIdx, col: colKey, value: values[dc] ?? '' })
            }
          }
          onPaste(cells)
        })
        return
      }

      // anchorRef 갱신 보조 (anchor 는 selection 훅이 담당)
      void anchorRef
    },
    [enableCopy, enablePaste, onPaste],
  )

  return { handleKeyDown }
}
