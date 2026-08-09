/**
 * 관리자 — 구글 시트 동기화 (`/admin/sheet-sync`).
 *
 * PR-D Phase B FE-A. BE endpoint (commit 8b6ac60):
 * - POST /api/v1/products/admin/sync       — 캐시 invalidate + sync 실행
 * - GET  /api/v1/products/admin/sync/last  — 마지막 sync 시각 + 결과 조회
 *
 * <p><b>구성</b>:
 * - 헤더 — "구글 시트 동기화" + 마지막 sync 시각 표시
 * - "지금 동기화" 버튼 (mutate pending 동안 disabled + 우측 spinner)
 * - 결과 표 — Product row와 구성품 occurrence를 단위가 드러나는 라벨로 표시
 *
 * <p><b>refetch 정책</b>:
 * - useQuery refetchOnMount = 'always' — 페이지 진입 시 항상 최신 last 조회
 * - useMutation onSuccess 후 ['admin', 'sheet-sync', 'last'] invalidate
 * - PR-H4c FE-C: 30초 polling — sync 진행 중 다른 사용자가 동시에 trigger 한 결과 자동 반영
 *
 * <p><b>가드</b>: routes/index.tsx 의 PermissionGuard(products.sync, VIEW) 가 담당. 본 화면 내부 추가 가드 불요.
 *
 * <p><b>PR-H4c FE-C 보강 — 실시간 동기화</b>:
 * - 본 화면은 read-only — sync trigger 만 mutation. audit overlay / edit-request 미적용.
 * - 30초 polling 으로 last sync 결과 자동 갱신 (다른 워크스테이션 trigger 결과 자동 반영).
 *
 * data-testid:
 * - admin-sheetsync-trigger-btn
 * - admin-sheetsync-last-time
 * - admin-sheetsync-result-table
 * - admin-sheetsync-tab-row (per row)
 * - admin-sheetsync-realtime-indicator
 *
 * memory feedback_uuid_no_user_visibility — 본 도메인 UUID 노출 없음 (tab 이름만 표시).
 * memory feedback_role_naming_full — MASTER 가드 표기 풀네임.
 */
import { useMemo } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Button, Spinner } from '@samhan/design-system'
import {
  getLastSync,
  triggerSync,
  type SyncSummary,
} from '../../api/sheetSyncApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { buildSheetSyncRows, type SheetSyncRowResult } from './sheetSyncRows'

const LAST_QUERY_KEY = ['admin', 'sheet-sync', 'last'] as const

export function SheetSyncPage() {
  usePageTitle('구글 시트 동기화')
  const queryClient = useQueryClient()

  const lastQuery = useQuery({
    queryKey: LAST_QUERY_KEY,
    queryFn: getLastSync,
    refetchOnMount: 'always',
    // PR-H4c FE-C: 30초 polling — 다른 워크스테이션이 sync trigger 한 결과 자동 반영.
    refetchInterval: 30_000,
  })

  const triggerMutation = useMutation({
    mutationFn: triggerSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LAST_QUERY_KEY })
    },
  })

  const lastSyncAtLabel = useMemo(() => {
    const at = lastQuery.data?.lastSyncAt
    if (!at) return '아직 sync 이력이 없습니다'
    try {
      const d = new Date(at)
      if (Number.isNaN(d.getTime())) return at
      return formatKoreanDateTime(d)
    } catch {
      return at
    }
  }, [lastQuery.data?.lastSyncAt])

  // 결과 표 source: mutation 성공 직후엔 mutation.data 우선, 그 외엔 last summary
  const summary: SyncSummary | null =
    triggerMutation.data ?? lastQuery.data?.summary ?? null

  const rows = useMemo(() => {
    if (!summary) return []
    return buildSheetSyncRows(summary)
  }, [summary])

  const isPending = triggerMutation.isPending

  return (
    <>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 4px' }}>구글 시트 동기화</h3>
          <div
            data-testid="admin-sheetsync-last-time"
            style={{
              fontSize: 12,
              color: 'var(--color-neutral-600)',
            }}
          >
            마지막 동기화: {lastQuery.isLoading ? '조회 중…' : lastSyncAtLabel}
          </div>
          <div
            data-testid="admin-sheetsync-realtime-indicator"
            style={{
              fontSize: 12,
              color: 'var(--color-neutral-500)',
              marginTop: 2,
            }}
          >
            실시간 자동 갱신 · 30초
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isPending ? (
            <Spinner size="sm" tone="var(--color-brand-500)" label="동기화 중" />
          ) : null}
          <Button
            type="button"
            variant="primary"
            data-testid="admin-sheetsync-trigger-btn"
            disabled={isPending}
            onClick={() => triggerMutation.mutate()}
          >
            {isPending ? '동기화 중…' : '지금 동기화'}
          </Button>
        </div>
      </header>

      {triggerMutation.isError ? (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            border: '1px solid var(--color-danger-300, #fca5a5)',
            background: 'var(--color-danger-50, #fef2f2)',
            color: 'var(--color-danger-700, #b91c1c)',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          동기화 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : null}

      {summary?.error ? (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            border: '1px solid var(--color-danger-300, #fca5a5)',
            background: 'var(--color-danger-50, #fef2f2)',
            color: 'var(--color-danger-700, #b91c1c)',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {summary.error}
        </div>
      ) : null}

      {summary ? (
        <SummaryTotals summary={summary} />
      ) : null}

      <div
        data-testid="admin-sheetsync-result-table"
        style={{
          border: '1px solid var(--color-neutral-200)',
          borderRadius: 6,
          background: 'var(--color-neutral-0)',
          overflow: 'hidden',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                background: 'var(--color-neutral-50)',
                color: 'var(--color-neutral-700)',
              }}
            >
              <th style={thStyle}>탭 이름</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>신규 Product row / 연결 occurrence</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>변경 Product row / Bundle Product</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>
                삭제 Product row / 구성품 row
              </th>
              <th style={thStyle}>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 24,
                    textAlign: 'center',
                    color: 'var(--color-neutral-500)',
                  }}
                >
                  {lastQuery.isLoading
                    ? '마지막 동기화 결과를 불러오는 중…'
                    : '동기화 결과가 없습니다. 상단의 "지금 동기화" 버튼을 눌러 주세요.'}
                </td>
              </tr>
            ) : (
              rows.map(({ tabName, kind, result }) => (
                <tr
                  key={tabName}
                  data-testid="admin-sheetsync-tab-row"
                  style={{
                    borderTop: '1px solid var(--color-neutral-100)',
                  }}
                >
                  <td style={tdStyle}>{tabName}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {kind === 'component' ? result.linkedOccurrences : result.insertedRows}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {kind === 'component' ? result.bundlesMarkedProducts : result.updatedRows}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {kind === 'component' ? result.softDeletedComponentRows : result.softDeletedProductRows}
                  </td>
                  <td style={{ ...tdStyle, color: result.error ? 'var(--color-danger-700, #b91c1c)' : 'var(--color-neutral-500)' }}>
                    {formatTabRemark(result)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

interface SummaryTotalsProps {
  summary: SyncSummary
}

function SummaryTotals({ summary }: SummaryTotalsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        marginBottom: 12,
        flexWrap: 'wrap',
        fontSize: 13,
      }}
    >
      <TotalChip label="총 신규 row" value={summary.totalInsertedRows} tone="brand" />
      <TotalChip label="총 변경 row" value={summary.totalUpdatedRows} tone="success" />
      <TotalChip
        label="총 삭제"
        value={summary.totalSoftDeletedRows + summary.totalSoftDeletedComponentRows}
        tone="warning"
      />
      <TotalChip label="총 skip occurrence" value={summary.totalSkippedOccurrences} tone="neutral" />
      <TotalChip label="수동 보존 Product occurrence" value={summary.totalPreservedManualProductOccurrences} tone="neutral" />
      <TotalChip label="수동 보존 구성품 occurrence" value={summary.totalPreservedManualComponentOccurrences} tone="neutral" />
      <TotalChip
        label="탭 결과"
        value={`${summary.successfulTabs}/${summary.totalTabs} 성공`}
        tone={summary.failedTabs > 0 ? 'warning' : 'success'}
      />
      <TotalChip
        label="소요"
        value={`${summary.durationMs}ms`}
        tone="neutral"
      />
    </div>
  )
}

interface TotalChipProps {
  label: string
  value: number | string
  tone: 'brand' | 'success' | 'warning' | 'neutral'
}

const CHIP_BG: Record<TotalChipProps['tone'], string> = {
  brand: 'var(--color-brand-50)',
  success: 'var(--color-success-50, #ecfdf5)',
  warning: 'var(--color-warning-50, #fffbeb)',
  neutral: 'var(--color-neutral-50)',
}

const CHIP_FG: Record<TotalChipProps['tone'], string> = {
  brand: 'var(--color-brand-700)',
  success: 'var(--color-success-700, #047857)',
  warning: 'var(--color-warning-800, #8C5C13)',
  neutral: 'var(--color-neutral-700)',
}

function TotalChip({ label, value, tone }: TotalChipProps) {
  return (
    <div
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        background: CHIP_BG[tone],
        color: CHIP_FG[tone],
        fontWeight: 600,
      }}
    >
      {label} {value}
    </div>
  )
}

export function formatTabRemark(result: SheetSyncRowResult): string {
  const parts: string[] = []
  if (result.error) parts.push(result.error)
  if (result.unchangedRows) parts.push(`변경 없음 ${result.unchangedRows}`)
  if (result.skippedOccurrences) parts.push(`skip occurrence ${result.skippedOccurrences}`)
  return parts.length === 0 ? '—' : parts.join(' / ')
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatKoreanDateTime(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  borderBottom: '1px solid var(--color-neutral-200)',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
}
