/**
 * D-AX-20 사진 감사 페이지 (`/admin/photo-audit`).
 *
 * <p>창고 운영자가 전표 첨부 사진을 유형/기간/전표번호로 조회하고, 같은 전표와
 * 같은 첨부 유형 안에서 현재 페이지에 중복 업로드된 후보를 확인하는 읽기 전용
 * 감사 화면이다. 응답은 전표번호 중심이며 내부 UUID 키를 포함하지 않는다.
 */
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Input,
  safeActorName,
  type BadgeVariant,
} from '@samhan/design-system'
import {
  listSlipPhotoAudit,
  type SlipPhotoAttachmentType,
  type SlipPhotoAuditFilterType,
  type SlipPhotoAuditItem,
  type SlipPhotoAuditParams,
} from '../../api/slipPhotoAuditApi'
import { usePageTitle } from '../../hooks/usePageTitle'

const PAGE_SIZE = 50

const ATTACHMENT_TYPE_LABEL: Record<SlipPhotoAttachmentType, string> = {
  DELIVERY: '배송사진',
  INSPECTION: '검수사진',
  ESTIMATE: '견적사진',
}

const ATTACHMENT_TYPE_VARIANT: Record<SlipPhotoAttachmentType, BadgeVariant> = {
  DELIVERY: 'brand',
  INSPECTION: 'warning',
  ESTIMATE: 'success',
}

const FILTER_TYPES: Array<{
  value: SlipPhotoAuditFilterType
  label: string
}> = [
  { value: 'ALL', label: '전체' },
  { value: 'DELIVERY', label: '배송사진' },
  { value: 'INSPECTION', label: '검수사진' },
  { value: 'ESTIMATE', label: '견적사진' },
]

const URL_LIKE_PATTERN = /https?:\/\/|x-amz-|storagekey|downloadurl/i

interface CommittedFilters {
  type: SlipPhotoAuditFilterType
  from: string
  to: string
  slipNo: string
  page: number
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  if (iso.length >= 16) {
    return `${iso.substring(0, 10)} ${iso.substring(11, 16)}`
  }
  return iso
}

function formatBytes(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toLocaleString('ko-KR', {
      maximumFractionDigits: 1,
    })} MB`
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024).toLocaleString('ko-KR')} KB`
  }
  return `${size.toLocaleString('ko-KR')} B`
}

function formatUploader(uploadedBy: string | null | undefined): string {
  return safeActorName(uploadedBy) ?? '업로더 확인 필요'
}

function extractErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') {
    return '사진 감사 목록을 불러오지 못했습니다.'
  }
  const maybe = err as {
    response?: { data?: { message?: unknown } }
    message?: unknown
  }
  const responseMessage = maybe.response?.data?.message
  if (typeof responseMessage === 'string' && responseMessage.trim()) {
    return responseMessage
  }
  if (typeof maybe.message === 'string' && maybe.message.trim()) {
    return maybe.message
  }
  return '사진 감사 목록을 불러오지 못했습니다.'
}

function toQueryParams(filters: CommittedFilters): SlipPhotoAuditParams {
  return {
    type: filters.type,
    from: filters.from || undefined,
    to: filters.to || undefined,
    slipNo: filters.slipNo.trim() || undefined,
    page: filters.page,
    size: PAGE_SIZE,
  }
}

function buildReuploadCounts(rows: SlipPhotoAuditItem[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.slipNo}::${row.attachmentType}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function reuploadKey(row: SlipPhotoAuditItem): string {
  return `${row.slipNo}::${row.attachmentType}`
}

function rowKey(row: SlipPhotoAuditItem): string {
  return `${row.slipNo}-${row.attachmentType}-${row.fileName}-${row.uploadedAt}`
}

function AttachmentTypeBadge({ type }: { type: SlipPhotoAttachmentType }) {
  return (
    <Badge variant={ATTACHMENT_TYPE_VARIANT[type]}>
      {ATTACHMENT_TYPE_LABEL[type]}
    </Badge>
  )
}

function GpsBadge({ hasGps }: { hasGps: boolean }) {
  return (
    <Badge variant={hasGps ? 'success' : 'neutral'}>
      {hasGps ? '있음' : '없음'}
    </Badge>
  )
}

function PhotoThumbnail({
  row,
  index,
}: {
  row: SlipPhotoAuditItem
  index: number
}) {
  const contentType = row.contentType.toLowerCase()
  if (!contentType.startsWith('image/')) return null
  const photoTypeLabel = ATTACHMENT_TYPE_LABEL[row.attachmentType]

  return (
    <span
      role="img"
      aria-label={`${photoTypeLabel} 미리보기, 전표 ${row.slipNo}`}
      data-testid={`photo-audit-thumbnail-${row.slipNo}-${index}`}
      style={thumbnailStyle}
    >
      사진
    </span>
  )
}

export function PhotoAuditPage() {
  usePageTitle('사진 감사')

  const [type, setType] = useState<SlipPhotoAuditFilterType>('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [slipNo, setSlipNo] = useState('')
  const [slipNoWarning, setSlipNoWarning] = useState('')
  const [committed, setCommitted] = useState<CommittedFilters>({
    type: 'ALL',
    from: '',
    to: '',
    slipNo: '',
    page: 0,
  })

  const query = useQuery({
    queryKey: ['admin', 'photo-audit', committed],
    queryFn: () => listSlipPhotoAudit(toQueryParams(committed)),
  })

  const rows = query.data?.content ?? []
  const reuploadCounts = useMemo(() => buildReuploadCounts(rows), [rows])
  const errorMessage = query.error ? extractErrorMessage(query.error) : null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (slipNoWarning) {
      return
    }
    setCommitted({
      type,
      from,
      to,
      slipNo: slipNo.trim(),
      page: 0,
    })
  }

  const handleSlipNoChange = (value: string) => {
    if (URL_LIKE_PATTERN.test(value)) {
      setSlipNo('')
      setSlipNoWarning('전표번호만 입력해 주세요.')
      return
    }
    setSlipNo(value)
    setSlipNoWarning('')
  }

  const movePage = (nextPage: number) => {
    setCommitted((prev) => ({
      ...prev,
      page: Math.max(0, nextPage),
    }))
  }

  return (
    <div data-testid="photo-audit-page" style={pageStyle}>
      <section style={sectionStyle}>
        <form
          onSubmit={handleSubmit}
          data-testid="photo-audit-filters"
          className="mobile-filter-grid"
          style={filterFormStyle}
        >
          <label style={selectFieldStyle}>
            <span style={fieldLabelStyle}>유형</span>
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value as SlipPhotoAuditFilterType)
              }}
              data-testid="photo-audit-type-select"
              style={selectStyle}
            >
              {FILTER_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <Input
            type="date"
            label="시작일"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            data-testid="photo-audit-from-input"
            inputSize="sm"
          />
          <Input
            type="date"
            label="종료일"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            data-testid="photo-audit-to-input"
            inputSize="sm"
          />
          <Input
            type="text"
            label="전표번호 (YYYY/MM/DD-순번)"
            placeholder="예: 2026/05/16-1"
            value={slipNo}
            onChange={(event) => handleSlipNoChange(event.target.value)}
            data-testid="photo-audit-slip-no-input"
            aria-describedby="photo-audit-slip-no-helper"
            inputSize="sm"
          />
          {slipNoWarning ? (
            <p
              id="photo-audit-slip-no-helper"
              data-testid="photo-audit-slip-no-helper"
              style={helperTextStyle}
            >
              {slipNoWarning}
            </p>
          ) : null}
          <div style={buttonFieldStyle}>
            <Button
              type="submit"
              loading={query.isFetching}
              disabled={Boolean(slipNoWarning)}
              aria-label="사진 감사 목록 조회"
              data-testid="photo-audit-search-button"
            >
              조회
            </Button>
          </div>
        </form>
      </section>

      <section style={sectionStyle}>
        <div style={resultHeaderStyle}>
          <h3 style={resultTitleStyle}>사진 감사 결과</h3>
          <span style={resultMetaStyle}>
            총 {(query.data?.totalElements ?? 0).toLocaleString('ko-KR')}건
            · {committed.page + 1}페이지
          </span>
        </div>

        {errorMessage ? (
          <div className="error-banner" role="alert" style={errorBannerStyle}>
            {errorMessage}
          </div>
        ) : null}

        {query.isLoading ? (
          <p style={emptyStyle}>불러오는 중...</p>
        ) : rows.length === 0 ? (
          <p data-testid="photo-audit-empty" style={emptyStyle}>
            조회된 사진 감사 내역이 없습니다.
          </p>
        ) : (
          <div style={tableScrollStyle}>
            <table
              className="slip-line-table"
              data-testid="photo-audit-table"
              style={tableStyle}
            >
              <thead>
                <tr>
                  <th style={leftHeaderStyle}>전표번호</th>
                  <th style={leftHeaderStyle}>유형</th>
                  <th style={leftHeaderStyle}>파일명</th>
                  <th style={leftHeaderStyle}>거래처</th>
                  <th style={leftHeaderStyle}>촬영시각</th>
                  <th style={leftHeaderStyle}>업로드시각</th>
                  <th style={leftHeaderStyle}>업로더</th>
                  <th style={leftHeaderStyle}>GPS 여부</th>
                  <th style={leftHeaderStyle}>재업로드 후보</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const count = reuploadCounts.get(reuploadKey(row)) ?? 1

                  return (
                    <tr
                      key={rowKey(row)}
                      data-testid={`photo-audit-row-${row.slipNo}-${index}`}
                    >
                      <td>
                        <strong>{row.slipNo}</strong>
                        <div style={subTextStyle}>{row.slipDate}</div>
                      </td>
                      <td>
                        <AttachmentTypeBadge type={row.attachmentType} />
                      </td>
                      <td>
                        <div style={fileCellStyle}>
                          <PhotoThumbnail row={row} index={index} />
                          <span>
                            <strong>{row.fileName}</strong>
                            <span style={subTextBlockStyle}>
                              {formatBytes(row.fileSize)} · {row.contentType}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>{row.partnerName || '—'}</td>
                      <td>{formatDateTime(row.capturedAt)}</td>
                      <td>{formatDateTime(row.uploadedAt)}</td>
                      <td>{formatUploader(row.uploadedBy)}</td>
                      <td>
                        <span
                          data-testid={`photo-audit-gps-${row.slipNo}-${index}`}
                        >
                          <GpsBadge hasGps={row.hasGps} />
                        </span>
                      </td>
                      <td>
                        {count > 1 ? (
                          <span
                            data-testid={`photo-audit-status-${row.slipNo}-${index}`}
                          >
                            <Badge variant="warning">재업로드 {count}회</Badge>
                          </span>
                        ) : (
                          <span aria-label="재업로드 후보 없음">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={paginationStyle}>
          <Button
            variant="ghost"
            size="sm"
            disabled={query.data?.first ?? true}
            onClick={() => movePage(committed.page - 1)}
          >
            이전
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={query.data?.last ?? true}
            onClick={() => movePage(committed.page + 1)}
          >
            다음
          </Button>
        </div>
      </section>
    </div>
  )
}

const pageStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
}

const sectionStyle: CSSProperties = {
  padding: 16,
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 6,
  background: 'var(--color-neutral-0)',
}

const filterFormStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(120px, 0.8fr) repeat(2, minmax(150px, 1fr)) minmax(220px, 1.4fr) auto',
  gap: 12,
  alignItems: 'end',
}

const selectFieldStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
}

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--color-neutral-700)',
}

const selectStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 6,
  border: '1px solid var(--color-neutral-300)',
  padding: '0 10px',
  background: 'var(--color-neutral-0)',
  color: 'var(--color-neutral-900)',
}

const buttonFieldStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'end',
  minHeight: 58,
}

const helperTextStyle: CSSProperties = {
  gridColumn: '4 / 5',
  margin: '-8px 0 0',
  color: 'var(--color-danger-700)',
  fontSize: 12,
}

const resultHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 12,
  marginBottom: 12,
}

const resultTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
}

const resultMetaStyle: CSSProperties = {
  color: 'var(--color-neutral-500)',
  fontSize: 12,
}

const errorBannerStyle: CSSProperties = {
  marginBottom: 12,
}

const emptyStyle: CSSProperties = {
  padding: 32,
  textAlign: 'center',
  color: 'var(--color-neutral-500)',
}

const tableScrollStyle: CSSProperties = {
  overflowX: 'auto',
}

const tableStyle: CSSProperties = {
  width: '100%',
  minWidth: 1120,
}

const leftHeaderStyle: CSSProperties = {
  textAlign: 'left',
}

const fileCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 220,
}

const thumbnailStyle: CSSProperties = {
  width: 56,
  height: 56,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
  border: '1px solid var(--color-neutral-200)',
  background: 'var(--color-neutral-100)',
  color: 'var(--color-neutral-500)',
  fontSize: 12,
  fontWeight: 700,
  flex: '0 0 auto',
}

const subTextStyle: CSSProperties = {
  color: 'var(--color-neutral-500)',
  fontSize: 12,
  marginTop: 2,
}

const subTextBlockStyle: CSSProperties = {
  display: 'block',
  color: 'var(--color-neutral-500)',
  fontSize: 12,
  marginTop: 2,
}

const paginationStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 12,
}
