/**
 * 배차안내 SMS 발송 감사 이력 화면 — SP-09-2 FE.
 *
 * SEND_AUDIT 모드로 저장된 발송 이력을 조회한다.
 * BE 가 send 시점 SEND_AUDIT row 를 자동 append-only 저장한다.
 *
 * <h2>주요 기능</h2>
 * <ul>
 *   <li>날짜 범위 + 결과 상태 필터 (성공/실패/부분실패)</li>
 *   <li>수신 전화번호 가운데 4자리 **** 마스킹 (feedback_uuid_no_user_visibility)</li>
 *   <li>msg_id (Aligo 발급) 는 비즈니스 식별자 — 노출 OK</li>
 *   <li>내부 UUID (id) 사용자 미노출</li>
 *   <li>페이지네이션 (size=20)</li>
 *   <li>상세 Modal — 수신자별 발송 결과 전체 조회</li>
 * </ul>
 *
 * <h2>에러 처리</h2>
 * 422 / 502 → 한국어 메시지 (SP-09-1 패턴 — axios error.response.data.message 우선).
 *
 * <h2>UUID 비공개 (feedback_uuid_no_user_visibility)</h2>
 * 목록 row 의 id (UUID) 사용자 미노출. 상세 조회 내부 key 로만 사용.
 */
import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Badge, Button, Card, DataTable, Input, Modal, type DataTableColumn } from '@samhan/design-system'
import {
  getDispatchSmsHistoryDetail,
  listDispatchSmsHistory,
  type DispatchSmsSaveHistoryListRow,
  type SendAuditDetailEntry,
  type SendAuditResponsePayload,
} from '../api/dispatchSmsSaveHistoryApi'
import { formatDateTime } from '../components/DispatchSmsHistoryTab'
import { maskCreatedBy } from '../utils/maskCreatedBy'
import { usePageTitle } from '../hooks/usePageTitle'

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

/** 전화번호 가운데 4자리 마스킹 — 010-1234-5678 → 010-****-5678. */
function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '-'
  // room:단톡방이름 형태 (배차 SMS — 단톡방 경로) 는 그대로 표시 (전화번호 아님)
  if (phone.startsWith('room:')) return phone
  return phone.replace(/(\d{3})-?(\d{4})-?(\d{4})/, '$1-****-$3')
}

/** SEND_AUDIT requestParams 에서 날짜를 추출한다. */
function extractDate(row: DispatchSmsSaveHistoryListRow): string {
  const params = row.requestParams as Record<string, unknown> | null
  if (params && typeof params['date'] === 'string') return params['date']
  return '-'
}

/**
 * SEND_AUDIT sent/failed/blocked 카운트 추출.
 *
 * BE 계약 정합 (H-FE-01 fix):
 *   - 우선순위 1: responsePayload.sent/failed/blocked (BE saveSendAudit 저장 위치 — 정합)
 *   - 우선순위 2: requestParams.sent/failed/blocked (BE SP-09-2 fix 로 함께 저장 — fallback 호환)
 *
 * mock.ts 픽스처는 requestParams 에 sent/failed/blocked 를 포함하므로 fallback 경로로도 동작한다.
 */
function extractCounts(row: DispatchSmsSaveHistoryListRow): {
  sent: number
  failed: number
  blocked: number
} {
  // 우선: responsePayload (BE SEND_AUDIT 저장 위치 — 운영 환경 정합)
  const payload = (row as unknown as { responsePayload?: Record<string, unknown> }).responsePayload
  if (payload && typeof payload['sent'] === 'number') {
    return {
      sent: Number(payload['sent'] ?? 0),
      failed: Number(payload['failed'] ?? 0),
      blocked: Number(payload['blocked'] ?? 0),
    }
  }
  // fallback: requestParams (SP-09-2 fix 이후 중복 저장 + 구형 mock 호환)
  const params = row.requestParams as Record<string, unknown> | null
  if (!params) return { sent: 0, failed: 0, blocked: 0 }
  return {
    sent: Number(params['sent'] ?? 0),
    failed: Number(params['failed'] ?? 0),
    blocked: Number(params['blocked'] ?? 0),
  }
}

/** 결과 요약 Badge variant 결정. */
function resultVariant(sent: number, failed: number): 'success' | 'warning' | 'danger' {
  if (failed > 0 && sent === 0) return 'danger'
  if (failed > 0) return 'warning'
  return 'success'
}

/** SendAudit 상태 한국어 라벨. */
function statusLabel(status: 'SENT' | 'FAILED' | 'BLOCKED'): string {
  if (status === 'SENT') return '성공'
  if (status === 'FAILED') return '실패'
  return '발송금지'
}

function statusVariant(
  status: 'SENT' | 'FAILED' | 'BLOCKED',
): 'success' | 'danger' | 'warning' {
  if (status === 'SENT') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'warning'
}

/** axios error → 한국어 메시지 (SP-09-1 패턴). */
function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined
    return data?.message ?? fallback
  }
  if (err instanceof Error) return err.message
  return fallback
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function firstDayOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

type ResultFilter = 'ALL' | 'SUCCESS' | 'PARTIAL' | 'FAIL'

interface FilterState {
  from: string
  to: string
  result: ResultFilter
  page: number
}

// ---------------------------------------------------------------------------
// 상세 Modal
// ---------------------------------------------------------------------------

interface AuditDetailModalProps {
  open: boolean
  rowId: string | null
  onClose: () => void
}

function AuditDetailModal({ open, rowId, onClose }: AuditDetailModalProps) {
  const [error, setError] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['dispatch-sms-send-audit-detail', rowId],
    queryFn: async () => {
      if (!rowId) return null
      setError(null)
      try {
        return await getDispatchSmsHistoryDetail(rowId)
      } catch (err) {
        setError(extractErrorMessage(err, '발송 감사 상세 조회에 실패했습니다.'))
        return null
      }
    },
    enabled: open && rowId !== null,
  })

  const detail = detailQuery.data
  const payload = detail?.responsePayload as SendAuditResponsePayload | null | undefined

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="발송 감사 상세"
      size="lg"
      data-testid="dispatch-sms-send-audit-detail-modal"
    >
      {detailQuery.isLoading ? (
        <div style={centerStyle} role="status">로딩 중...</div>
      ) : error ? (
        <div role="alert" style={errorBannerStyle}>{error}</div>
      ) : detail && payload ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={detailMetaStyle}>
            <span>배차일: <strong>{payload.date ?? extractDate(detail as unknown as DispatchSmsSaveHistoryListRow)}</strong></span>
            <span>발송시각: <strong>{formatDateTime(detail.createdAt)}</strong></span>
            <span>실행자: <strong>{maskCreatedBy(detail.createdBy)}</strong></span>
            {payload.msgId ? (
              <span
                data-testid="dispatch-sms-send-audit-msg-id"
                title="Aligo 발급 메시지 ID"
              >
                Aligo msg_id: <strong>{payload.msgId}</strong>
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Badge variant="success">성공 {payload.sent}건</Badge>
            {payload.failed > 0 ? <Badge variant="danger">실패 {payload.failed}건</Badge> : null}
            {payload.blocked > 0 ? <Badge variant="warning">발송금지 {payload.blocked}건</Badge> : null}
          </div>
          {payload.details && payload.details.length > 0 ? (
            <DataTable<SendAuditDetailEntry & { _rowIdx: number }>
              columns={detailColumns as DataTableColumn<SendAuditDetailEntry & { _rowIdx: number }>[]}
              rows={payload.details.map((d, i) => ({ ...d, _rowIdx: i }))}
              rowKey={(row) => `${row.partnerCode}-${row.recipientPhone}-${row._rowIdx}`}
              emptyMessage="발송 상세 내역이 없습니다."
            />
          ) : (
            <div style={emptyBoxStyle}>발송 상세 내역이 없습니다.</div>
          )}
        </div>
      ) : (
        <div style={emptyBoxStyle}>상세 정보를 불러올 수 없습니다.</div>
      )}
    </Modal>
  )
}

const detailColumns: DataTableColumn<SendAuditDetailEntry>[] = [
  {
    key: 'partnerCode',
    header: '거래처코드',
    width: '120px',
  },
  {
    key: 'recipientPhone',
    header: '수신번호',
    width: '160px',
    render: (row) => maskPhone(row.recipientPhone),
  },
  {
    key: 'status',
    header: '결과',
    width: '90px',
    align: 'center',
    render: (row) => (
      <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
    ),
  },
  {
    key: 'reason',
    header: '사유',
    render: (row) => row.reason ?? '-',
  },
]

// ---------------------------------------------------------------------------
// 목록 테이블 컬럼
// ---------------------------------------------------------------------------

interface AuditListRow extends DispatchSmsSaveHistoryListRow {
  __date: string
  __sent: number
  __failed: number
  __blocked: number
}

function buildListColumns(
  onDetailClick: (id: string) => void,
): DataTableColumn<AuditListRow>[] {
  return [
    {
      key: '__date',
      header: '배차일',
      width: '110px',
      mobilePriority: 'primary',
      render: (row) => <span data-testid={`sms-audit-date-${row.__date}`}>{row.__date}</span>,
    },
    {
      key: 'createdAt',
      header: '발송시각',
      width: '150px',
      mobilePriority: 'secondary',
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'createdBy',
      header: '실행자',
      width: '100px',
      mobilePriority: 'hidden',
      render: (row) => maskCreatedBy(row.createdBy),
    },
    {
      key: '__sent',
      header: '성공',
      width: '70px',
      align: 'right',
      mobilePriority: 'hidden',
      render: (row) => (
        <Badge variant="success">{row.__sent}</Badge>
      ),
    },
    {
      key: '__failed',
      header: '실패',
      width: '70px',
      align: 'right',
      mobilePriority: 'hidden',
      render: (row) =>
        row.__failed > 0 ? (
          <Badge variant="danger">{row.__failed}</Badge>
        ) : (
          <span style={{ color: 'var(--color-neutral-400)' }}>0</span>
        ),
    },
    {
      key: '__blocked',
      header: '발송금지',
      width: '80px',
      align: 'right',
      mobilePriority: 'hidden',
      render: (row) =>
        row.__blocked > 0 ? (
          <Badge variant="warning">{row.__blocked}</Badge>
        ) : (
          <span style={{ color: 'var(--color-neutral-400)' }}>0</span>
        ),
    },
    {
      key: 'topic',
      header: '결과',
      width: '100px',
      align: 'center',
      mobilePriority: 'secondary',
      render: (row) => {
        const v = resultVariant(row.__sent, row.__failed)
        const label = v === 'success' ? '성공' : v === 'warning' ? '부분실패' : '실패'
        return <Badge variant={v}>{label}</Badge>
      },
    },
    {
      key: 'id',
      header: '상세',
      width: '70px',
      align: 'center',
      mobilePriority: 'hidden',
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          data-testid={`sms-audit-detail-btn-${row.__date}`}
          onClick={(e) => {
            e.stopPropagation()
            onDetailClick(row.id)
          }}
        >
          보기
        </Button>
      ),
    },
  ]
}

// ---------------------------------------------------------------------------
// 메인 페이지
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export function DispatchSmsSendAuditPage() {
  usePageTitle('SMS 발송 이력')

  const today = todayIso()
  const monthStart = firstDayOfMonth()

  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [resultFilter, setResultFilter] = useState<ResultFilter>('ALL')
  const [appliedFilter, setAppliedFilter] = useState<FilterState>({
    from: monthStart,
    to: today,
    result: 'ALL',
    page: 0,
  })
  const [topError, setTopError] = useState<string | null>(null)
  const [detailModalId, setDetailModalId] = useState<string | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  const listQueryKey = [
    'dispatch-sms-send-audit-list',
    appliedFilter.from,
    appliedFilter.to,
    appliedFilter.page,
  ] as const

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: async () => {
      setTopError(null)
      try {
        return await listDispatchSmsHistory({
          programType: 'DISPATCH_SMS',
          mode: 'SEND_AUDIT',
          from: appliedFilter.from,
          to: appliedFilter.to,
          page: appliedFilter.page,
          size: PAGE_SIZE,
        })
      } catch (err) {
        setTopError(extractErrorMessage(err, 'SMS 발송 이력 조회에 실패했습니다.'))
        return null
      }
    },
  })

  const rawRows: DispatchSmsSaveHistoryListRow[] = listQuery.data?.content ?? []

  /** 클라이언트 측 resultFilter 적용 — 서버가 SEND_AUDIT 만 내려주므로 로컬 필터링. */
  const filteredRows: AuditListRow[] = rawRows
    .map((row) => {
      const counts = extractCounts(row)
      return {
        ...row,
        __date: extractDate(row),
        __sent: counts.sent,
        __failed: counts.failed,
        __blocked: counts.blocked,
      }
    })
    .filter((row) => {
      if (appliedFilter.result === 'ALL') return true
      if (appliedFilter.result === 'SUCCESS') return row.__failed === 0
      if (appliedFilter.result === 'PARTIAL') return row.__failed > 0 && row.__sent > 0
      if (appliedFilter.result === 'FAIL') return row.__sent === 0 && row.__failed > 0
      return true
    })

  const totalPages = listQuery.data?.totalPages ?? 1

  const handleSearch = () => {
    setAppliedFilter({ from, to, result: resultFilter, page: 0 })
  }

  const handlePageChange = (newPage: number) => {
    setAppliedFilter((prev) => ({ ...prev, page: newPage }))
  }

  const handleDetailClick = (id: string) => {
    setDetailModalId(id)
    setDetailModalOpen(true)
  }

  const columns = buildListColumns(handleDetailClick)

  return (
    <div style={rootStyle}>
      <div style={headerRowStyle}>
        <h3 style={{ margin: 0 }}>SMS 발송 이력</h3>
        <span style={noticeStyle}>SEND_AUDIT — 발송 시점 자동 append-only 저장</span>
      </div>

      {topError ? (
        <div role="alert" style={errorBannerStyle} data-testid="sms-audit-top-error">
          {topError}
        </div>
      ) : null}

      <Card padding={4} shadow="sm">
        <div style={filterRowStyle}>
          <Input
            label="기간 시작"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            inputSize="sm"
            fullWidth={false}
            data-testid="sms-audit-filter-from"
          />
          <Input
            label="기간 종료"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            inputSize="sm"
            fullWidth={false}
            data-testid="sms-audit-filter-to"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={filterLabelStyle} htmlFor="sms-audit-result-filter">결과 상태</label>
            <select
              id="sms-audit-result-filter"
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value as ResultFilter)}
              style={selectStyle}
              data-testid="sms-audit-filter-result"
            >
              <option value="ALL">전체</option>
              <option value="SUCCESS">성공</option>
              <option value="PARTIAL">부분실패</option>
              <option value="FAIL">실패</option>
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <Button
              variant="primary"
              onClick={handleSearch}
              loading={listQuery.isFetching}
              data-testid="sms-audit-search-btn"
            >
              조회
            </Button>
          </div>
        </div>
      </Card>

      <Card padding={0} shadow="sm">
        <DataTable<AuditListRow>
          columns={columns}
          rows={filteredRows}
          rowKey={(row) => row.id}
          loading={listQuery.isFetching}
          emptyMessage="발송 이력이 없습니다. 날짜 범위를 확인하세요."
          data-testid="sms-audit-table"
          onRowClick={(row) => handleDetailClick(row.id)}
        />
      </Card>

      {totalPages > 1 ? (
        <div style={paginationStyle}>
          <Button
            variant="ghost"
            size="sm"
            disabled={appliedFilter.page === 0}
            onClick={() => handlePageChange(appliedFilter.page - 1)}
            data-testid="sms-audit-prev-page"
          >
            이전
          </Button>
          <span style={{ fontSize: 13 }}>
            {appliedFilter.page + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={appliedFilter.page >= totalPages - 1}
            onClick={() => handlePageChange(appliedFilter.page + 1)}
            data-testid="sms-audit-next-page"
          >
            다음
          </Button>
        </div>
      ) : null}

      <AuditDetailModal
        open={detailModalOpen}
        rowId={detailModalId}
        onClose={() => {
          setDetailModalOpen(false)
          setDetailModalId(null)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 스타일
// ---------------------------------------------------------------------------

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  flexWrap: 'wrap',
}

const noticeStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-500)',
}

const filterRowStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}

const filterLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-neutral-700)',
}

const selectStyle: CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--color-neutral-300)',
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--surface-card)',
  color: 'var(--color-neutral-900)',
  cursor: 'pointer',
}

const paginationStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  justifyContent: 'center',
}

const errorBannerStyle: CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--state-danger)',
  borderRadius: 6,
  background: 'var(--state-danger-bg)',
  color: 'var(--state-danger)',
  fontSize: 13,
}

const centerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: 32,
}

const emptyBoxStyle: CSSProperties = {
  padding: 12,
  background: 'var(--color-neutral-50)',
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 6,
  fontSize: 13,
  color: 'var(--color-neutral-500)',
}

const detailMetaStyle: CSSProperties = {
  display: 'flex',
  gap: 20,
  flexWrap: 'wrap',
  fontSize: 13,
  paddingBottom: 8,
  borderBottom: '1px solid var(--color-neutral-200)',
}
