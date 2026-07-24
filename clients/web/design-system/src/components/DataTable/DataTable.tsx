import { type ReactNode } from 'react'
import styles from './DataTable.module.css'
import { MascotEmptyState } from '../MascotEmptyState/MascotEmptyState'
import { MascotLoader } from '../MascotLoader/MascotLoader'

export interface DataTableColumn<T> {
  /** row 의 key 또는 임의 식별자. */
  key: keyof T | string
  header: string
  /** 셀 렌더러. 없으면 String(row[key]). */
  render?: (row: T) => ReactNode
  /** CSS width — 예: '120px', '20%'. */
  width?: string
  align?: 'left' | 'right' | 'center'
  /** 헤더(th) 정렬 — 미지정 시 {@link align} 따름. 본문은 우측/가운데인데 헤더만 가운데일 때 사용. */
  headerAlign?: 'left' | 'right' | 'center'
  mobilePriority?: 'primary' | 'secondary' | 'hidden'
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  loading?: boolean
  /** 헤더를 화면에서 숨기되 컬럼 폭 계산은 유지한다. */
  hideHeader?: boolean
  /** 고정 컬럼 폭이 필요한 표에서 사용한다. 기본은 브라우저 자동 레이아웃. */
  tableLayout?: 'auto' | 'fixed'
  /** rows 가 비어있을 때 표시할 메시지. 기본 "데이터가 없습니다." */
  emptyMessage?: string
  onRowClick?: (row: T) => void
  /** onRowClick 이 있어도 특정 행 클릭을 비활성화할 때 사용한다. */
  rowClickable?: (row: T) => boolean
  /** React key 추출자. 필수. */
  rowKey: (row: T) => string
  /** Optional test id extractor applied to each data row <tr>. */
  rowTestId?: (row: T, index: number) => string | undefined
  /**
   * 행 단위 추가 className 산출자 (옵션) — 행 단위 상태 시각화에 사용.
   * 예) link-dispatch-slice 의 LinkDispatchListPage 에서 sent 행 옅은 파랑 배경.
   * undefined 또는 빈 문자열 반환 시 추가 클래스 미부여.
   */
  rowClassName?: (row: T) => string | undefined
  className?: string
}

/**
 * 기본 셀 값 추출 — render 가 없을 때.
 * `noUncheckedIndexedAccess` 환경에서도 안전하도록 unknown 캐스팅.
 */
const defaultCell = <T,>(row: T, key: keyof T | string): ReactNode => {
  const v = (row as Record<string, unknown>)[String(key)]
  if (v === null || v === undefined) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v)
  }
  return String(v)
}

/**
 * DataTable — dumb 테이블. 정렬/페이지네이션은 외부 책임.
 *
 * - 헤더 sticky top
 * - 행 hover 표시
 * - onRowClick 있으면 cursor pointer + 행 클릭 가능
 * - rowClickable 이 false 인 행은 클릭 class/handler 를 붙이지 않음
 * - loading=true 면 Spinner 오버레이
 * - rows 비어있으면 emptyMessage 셀 표시
 */
export function DataTable<T>({
  columns,
  rows,
  loading = false,
  hideHeader = false,
  tableLayout = 'auto',
  emptyMessage = '데이터가 없습니다.',
  onRowClick,
  rowClickable,
  rowKey,
  rowTestId,
  rowClassName,
  className,
}: DataTableProps<T>) {
  const wrapperClasses = [styles['wrapper'], className]
    .filter(Boolean)
    .join(' ')
  const tableClasses = [
    styles['table'],
    tableLayout === 'fixed' ? styles['fixedLayout'] : null,
  ]
    .filter(Boolean)
    .join(' ')
  const theadClasses = [
    styles['thead'],
    hideHeader ? styles['hiddenHeader'] : null,
  ]
    .filter(Boolean)
    .join(' ')

  const isEmpty = rows.length === 0 && !loading
  return (
    <div className={wrapperClasses}>
      <div className={styles['scroll']}>
        <table className={tableClasses}>
          <colgroup>
            {columns.map((col) => (
              <col
                key={String(col.key)}
                style={col.width ? { width: col.width } : undefined}
              />
            ))}
          </colgroup>
          <thead className={theadClasses} aria-hidden={hideHeader ? true : undefined}>
            <tr>
              {columns.map((col) => {
                // 헤더 정렬은 headerAlign 우선, 없으면 align 따름.
                const headerAlign = col.headerAlign ?? col.align
                const alignClass =
                  headerAlign === 'right'
                    ? styles['alignRight']
                    : headerAlign === 'center'
                      ? styles['alignCenter']
                      : styles['alignLeft']
                const thClasses = [styles['th'], alignClass]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <th
                    key={String(col.key)}
                    scope="col"
                    className={thClasses}
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <tr className={styles['emptyRow']}>
                <td className={styles['emptyCell']} colSpan={columns.length}>
                  {/* 가로 스크롤 시 "보이는 창" 중앙에 고정 — DataTable.module.css 참고 */}
                  <div className={styles['emptyCellSticky']}>
                    <MascotEmptyState title={emptyMessage} />
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const k = rowKey(row)
                const extraClass = rowClassName?.(row)
                const testId = rowTestId?.(row, index)
                const canClickRow = Boolean(onRowClick) && (rowClickable?.(row) ?? true)
                const trClasses = [
                  styles['tr'],
                  canClickRow ? styles['clickable'] : null,
                  extraClass ? extraClass : null,
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <tr
                    key={k}
                    className={trClasses}
                    {...(testId ? { 'data-testid': testId } : {})}
                    onClick={canClickRow && onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => {
                      const alignClass =
                        col.align === 'right'
                          ? styles['alignRight']
                          : col.align === 'center'
                            ? styles['alignCenter']
                            : styles['alignLeft']
                      const tdClasses = [styles['td'], alignClass]
                        .filter(Boolean)
                        .join(' ')
                      return (
                        <td
                          key={String(col.key)}
                          className={tdClasses}
                          data-label={col.header}
                          data-mobile-priority={col.mobilePriority ?? undefined}
                        >
                          {col.render ? col.render(row) : defaultCell(row, col.key)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {loading ? (
        <div className={styles['loadingOverlay']} aria-live="polite">
          <MascotLoader size="md" label="데이터 로딩 중" />
        </div>
      ) : null}
    </div>
  )
}

export default DataTable
