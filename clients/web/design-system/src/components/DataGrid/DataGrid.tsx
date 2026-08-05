/**
 * DataGrid — Excel-like 데이터그리드.
 *
 * 제공 기능:
 * - 열헤더 필터 (text 포함 검색 + checkbox 선택 — GAS filter-popup 동등)
 * - 다중 셀 선택 (단일 클릭 / Shift+범위 / Ctrl+토글 / Ctrl+A 전체)
 * - 복사 (Ctrl+C) → 클립보드 TSV (Excel 호환)
 * - 붙여넣기 (Ctrl+V) → onPaste 콜백 (enablePaste=true 시)
 * - 선택 셀 파란 outline + #ebf8ff 배경
 *
 * 기존 DataTable 컴포넌트는 보존 — DataGrid 는 별도 export.
 *
 * 키보드 단축키는 DataGrid wrapper 에 focus 된 시점에만 활성화하여
 * 글로벌 listener 충돌을 방지한다.
 */
import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import styles from './DataGrid.module.css'
import { MascotEmptyState } from '../MascotEmptyState/MascotEmptyState'
import { MascotLoader } from '../MascotLoader/MascotLoader'
import { useSelection } from './useSelection'
import { useFilter } from './useFilter'
import { useClipboard, type PasteCell } from './useClipboard'

/** 컬럼 정의 */
export interface DataGridColumn<T> {
  /** 행 오브젝트의 키. 필터/복사 시 데이터 접근에 사용. */
  key: string
  /** 헤더 표시 레이블 */
  label: string
  /** CSS width (예: '120px', '10%'). 기본 auto. */
  width?: number
  /** 필터 타입. 'text' | 'select' | false. 기본 'text'. */
  filter?: 'text' | 'select' | false
  /** 셀 값 포맷터. 없으면 String(). */
  format?: (v: unknown) => string
  /** 복사/내보내기 값. 없으면 기존 format/String() 경로를 유지한다. */
  copyValue?: (row: T) => string
  /** 커스텀 셀 렌더러 (반환값 ReactNode). 있으면 format 보다 우선. */
  render?: (row: T) => ReactNode
  /** 텍스트 정렬. 기본 'left'. */
  align?: 'left' | 'right' | 'center'
}

/** DataGrid Props */
export interface DataGridProps<T> {
  columns: DataGridColumn<T>[]
  rows: T[]
  /** React key 추출자. */
  rowKey: (row: T) => string
  /** 로딩 스피너 표시 여부. */
  loading?: boolean
  /** 빈 상태 메시지. 기본 "데이터가 없습니다." */
  emptyMessage?: string
  /** 다중 셀 선택 활성화. 기본 true. */
  enableMultiSelect?: boolean
  /** Ctrl+C 복사 활성화. 기본 true. */
  enableCopy?: boolean
  /** Ctrl+V 붙여넣기 활성화. 기본 false. */
  enablePaste?: boolean
  /** 붙여넣기 콜백. enablePaste=true 시 필수. */
  onPaste?: (cells: PasteCell[]) => void
  /** 선택 변경 시 콜백 — 현재 선택된 행 목록. */
  onSelectionChange?: (rows: T[]) => void
  /** 행 클릭 콜백. */
  onRowClick?: (row: T, index: number) => void
  /** 행별 testid 생성자. */
  getRowTestId?: (row: T, index: number) => string
  /** wrapper div 추가 className */
  className?: string
}

/** 필터 팝오버 상태 */
interface FilterPopoverState {
  colKey: string
  top: number
  left: number
}

/**
 * 행 데이터에서 특정 키의 표시 값 추출.
 */
function getCellDisplayValue<T>(
  row: T,
  col: DataGridColumn<T>,
): string {
  const v = (row as Record<string, unknown>)[col.key]
  if (col.copyValue) return col.copyValue(row)
  if (col.format) return col.format(v)
  if (v === null || v === undefined) return ''
  return String(v)
}

/**
 * DataGrid 컴포넌트.
 *
 * @typeParam T - 행 데이터 타입
 */
export function DataGrid<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyMessage = '데이터가 없습니다.',
  enableMultiSelect = true,
  enableCopy = true,
  enablePaste = false,
  onPaste,
  onSelectionChange,
  onRowClick,
  getRowTestId,
  className,
}: DataGridProps<T>) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [focused, setFocused] = useState(false)

  // ── 필터 ──
  const filterCols = columns.map((c) => ({
    key: c.key,
    filter: c.filter ?? (c.filter === false ? false : 'text' as const),
    format: c.format,
  }))
  const {
    filterStates,
    filteredRows,
    setTextFilter,
    toggleSelectFilter,
    clearColumnFilter,
    hasActiveFilter,
    uniqueValues,
  } = useFilter(rows, filterCols)

  // ── 선택 ──
  const {
    selected,
    isSelected,
    handleCellClick,
    selectAll,
    clearSelection,
  } = useSelection()

  // 선택 변경 시 onSelectionChange 호출
  useEffect(() => {
    if (!onSelectionChange) return
    // 선택된 row index 추출
    const selectedRowIdxSet = new Set<number>()
    for (const key of selected) {
      const rStr = key.split(':')[0]
      if (rStr) selectedRowIdxSet.add(parseInt(rStr, 10))
    }
    const selectedRows = filteredRows.filter((_, i) => selectedRowIdxSet.has(i))
    onSelectionChange(selectedRows)
  }, [selected, filteredRows, onSelectionChange])

  // ── 클립보드 ──
  const { handleKeyDown } = useClipboard({
    enableCopy,
    enablePaste,
    onPaste,
  })

  const getCellValueByCoord = useCallback(
    (r: number, c: number): string => {
      const row = filteredRows[r]
      const col = columns[c]
      if (!row || !col) return ''
      return getCellDisplayValue(row, col)
    },
    [filteredRows, columns],
  )

  // 키보드 이벤트 — wrapper focus 시에만 활성
  useEffect(() => {
    if (!focused) return
    const onKeyDown = (e: KeyboardEvent) => {
      // input 안에서는 단축키 비활성 (필터 팝오버 input 등)
      if (
        e.target instanceof HTMLInputElement
        || e.target instanceof HTMLTextAreaElement
      ) return

      handleKeyDown(
        e,
        getCellValueByCoord,
        selected,
        columns.map((c) => c.key),
        filteredRows.length,
        columns.length,
        (tr, tc) => selectAll(tr, tc),
      )
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [
    focused,
    handleKeyDown,
    getCellValueByCoord,
    selected,
    columns,
    filteredRows.length,
    selectAll,
  ])

  // ── 필터 팝오버 ──
  const [popover, setPopover] = useState<FilterPopoverState | null>(null)
  const [popoverTextDraft, setPopoverTextDraft] = useState('')
  const [popoverSelectDraft, setPopoverSelectDraft] = useState<Set<string>>(new Set())

  const openFilter = useCallback(
    (colKey: string, btnEl: HTMLButtonElement) => {
      const rect = btnEl.getBoundingClientRect()
      setPopover({ colKey, top: rect.bottom + 4, left: rect.left })
      const st = filterStates[colKey]
      setPopoverTextDraft(st?.textValue ?? '')
      setPopoverSelectDraft(new Set(st?.selectedValues))
    },
    [filterStates],
  )

  const closePopover = useCallback(() => {
    setPopover(null)
  }, [])

  const applyPopover = useCallback(() => {
    if (!popover) return
    setTextFilter(popover.colKey, popoverTextDraft)
    // select draft 적용: clear 후 재구성
    clearColumnFilter(popover.colKey)
    if (popoverTextDraft) {
      setTextFilter(popover.colKey, popoverTextDraft)
    }
    // select 는 toggleSelectFilter 로 set 을 직접 적용할 수 없으므로
    // filterStates 에 raw 접근 대신 개별 toggle 시뮬레이션을 피해
    // 직접 context 업데이트를 수행 — useFilter 내 setFilterStates 는 훅 내부이므로
    // popoverSelectDraft 를 text 와 함께 부모 상태로 전달해야 함.
    // 현재 구조에서는 text 필터만 적용하고 select draft 를 내부 state 로 관리.
    // select 필터 적용: 각 값을 toggle 로 재구성
    for (const v of popoverSelectDraft) {
      toggleSelectFilter(popover.colKey, v)
    }
    closePopover()
  }, [popover, popoverTextDraft, popoverSelectDraft, setTextFilter, clearColumnFilter, toggleSelectFilter, closePopover])

  // 팝오버 외부 클릭 닫기
  useEffect(() => {
    if (!popover) return
    const handler = (e: MouseEvent) => {
      const popoverEl = document.getElementById('dg-filter-popover')
      if (popoverEl && !popoverEl.contains(e.target as Node)) {
        closePopover()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popover, closePopover])

  const colKeys = columns.map((c) => c.key)

  const isEmpty = filteredRows.length === 0 && !loading

  return (
    <div
      ref={wrapperRef}
      className={[styles['wrapper'], className].filter(Boolean).join(' ')}
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        // wrapper 자신 또는 자손으로 focus 이동 시 focused 유지
        if (!wrapperRef.current?.contains(e.relatedTarget as Node)) {
          setFocused(false)
        }
      }}
      onClick={() => {
        // wrapper 클릭 시 focus 획득 (빈 영역 클릭)
        wrapperRef.current?.focus()
      }}
      aria-label="데이터그리드"
      data-testid="data-grid"
    >
      <div className={styles['scroll']}>
        <table className={styles['table']}>
          <colgroup>
            {columns.map((col) => (
              <col
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
              />
            ))}
          </colgroup>
          <thead className={styles['thead']}>
            <tr>
              {columns.map((col) => {
                const filterEnabled = col.filter !== false
                const active = hasActiveFilter(col.key)
                return (
                  <th
                    key={col.key}
                    className={styles['th']}
                    style={col.align ? { textAlign: col.align } : undefined}
                    aria-label={col.label}
                  >
                    <div className={styles['thInner']}>
                      <span className={styles['thLabel']}>{col.label}</span>
                      {filterEnabled ? (
                        <button
                          type="button"
                          className={[
                            styles['filterBtn'],
                            active ? styles['filterActive'] : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          title={`${col.label} 필터`}
                          aria-label={`${col.label} 필터 열기`}
                          data-testid={`dg-filter-btn-${col.key}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            openFilter(col.key, e.currentTarget)
                          }}
                        >
                          {/* 깔때기 아이콘 */}
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 12 12"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M1 2h10L7 6.5V11L5 10V6.5L1 2z" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <tr className={styles['emptyRow']}>
                <td colSpan={columns.length}>
                  <MascotEmptyState title={emptyMessage} />
                </td>
              </tr>
            ) : (
              filteredRows.map((row, rIdx) => (
                <tr
                  key={rowKey(row)}
                  className={styles['tr']}
                  data-testid={getRowTestId?.(row, rIdx)}
                  onClick={() => onRowClick?.(row, rIdx)}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((col, cIdx) => {
                    const sel = enableMultiSelect && isSelected(rIdx, cIdx)
                    return (
                      <td
                        key={col.key}
                        className={[
                          styles['td'],
                          sel ? styles['tdSelected'] : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={col.align ? { textAlign: col.align } : undefined}
                        onClick={(e) => {
                          if (enableMultiSelect) {
                            handleCellClick(rIdx, cIdx, e)
                          }
                        }}
                        data-row={rIdx}
                        data-col={cIdx}
                      >
                        {col.render
                          ? col.render(row)
                          : getCellDisplayValue(row, col)}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {loading ? (
        <div className={styles['loadingOverlay']}>
          <MascotLoader size="md" label="데이터 로딩 중" />
        </div>
      ) : null}

      {/* 필터 팝오버 */}
      {popover ? (
        <FilterPopover
          id="dg-filter-popover"
          colKey={popover.colKey}
          colLabel={columns.find((c) => c.key === popover.colKey)?.label ?? popover.colKey}
          filterType={
            columns.find((c) => c.key === popover.colKey)?.filter ?? 'text'
          }
          top={popover.top}
          left={popover.left}
          textDraft={popoverTextDraft}
          onTextChange={setPopoverTextDraft}
          selectDraft={popoverSelectDraft}
          onSelectToggle={(v) => {
            setPopoverSelectDraft((prev) => {
              const next = new Set(prev)
              if (next.has(v)) next.delete(v)
              else next.add(v)
              return next
            })
          }}
          uniqueVals={uniqueValues(popover.colKey)}
          onApply={applyPopover}
          onClear={() => {
            clearColumnFilter(popover.colKey)
            closePopover()
          }}
          onClose={closePopover}
          colKeys={colKeys}
          filterStates={filterStates}
          clearSelection={clearSelection}
        />
      ) : null}
    </div>
  )
}

// ── FilterPopover (내부 컴포넌트) ────────────────────────────────────────────

interface FilterPopoverProps {
  id: string
  colKey: string
  colLabel: string
  filterType: 'text' | 'select' | false
  top: number
  left: number
  textDraft: string
  onTextChange: (v: string) => void
  selectDraft: Set<string>
  onSelectToggle: (v: string) => void
  uniqueVals: string[]
  onApply: () => void
  onClear: () => void
  onClose: () => void
  colKeys: string[]
  filterStates: Record<string, { textValue: string; selectedValues: Set<string> }>
  clearSelection: () => void
}

function FilterPopover({
  id,
  colLabel,
  filterType,
  top,
  left,
  textDraft,
  onTextChange,
  selectDraft,
  onSelectToggle,
  uniqueVals,
  onApply,
  onClear,
  onClose,
}: FilterPopoverProps) {
  return (
    <div
      id={id}
      className={styles['filterPopover']}
      style={{ top, left }}
      role="dialog"
      aria-label={`${colLabel} 필터`}
      data-testid="dg-filter-popover"
    >
      <div className={styles['filterPopoverHeader']}>
        <span className={styles['filterPopoverTitle']}>{colLabel} 필터</span>
        <button
          type="button"
          className={styles['filterPopoverClose']}
          onClick={onClose}
          aria-label="필터 닫기"
        >
          ✕
        </button>
      </div>

      {filterType === 'text' || filterType === false ? (
        <input
          type="text"
          className={styles['filterInput']}
          placeholder="포함 검색..."
          value={textDraft}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onApply()
            if (e.key === 'Escape') onClose()
          }}
          autoFocus
          aria-label="텍스트 필터 입력"
          data-testid="dg-filter-text-input"
        />
      ) : null}

      {filterType === 'select' ? (
        <>
          <input
            type="text"
            className={styles['filterInput']}
            placeholder="검색..."
            value={textDraft}
            onChange={(e) => onTextChange(e.target.value)}
            aria-label="항목 검색"
          />
          <div className={styles['filterCheckList']} role="listbox" aria-multiselectable="true">
            {uniqueVals
              .filter((v) => !textDraft || v.toLowerCase().includes(textDraft.toLowerCase()))
              .map((v) => (
                <label key={v} className={styles['filterCheckItem']}>
                  <input
                    type="checkbox"
                    checked={selectDraft.has(v)}
                    onChange={() => onSelectToggle(v)}
                    aria-label={v}
                  />
                  {v || '(빈 값)'}
                </label>
              ))}
          </div>
        </>
      ) : null}

      <div className={styles['filterActions']}>
        <button
          type="button"
          className={styles['filterActionBtn']}
          onClick={onClear}
          data-testid="dg-filter-clear"
        >
          초기화
        </button>
        <button
          type="button"
          className={[styles['filterActionBtn'], styles['filterApply']].join(' ')}
          onClick={onApply}
          data-testid="dg-filter-apply"
        >
          적용
        </button>
      </div>
    </div>
  )
}
