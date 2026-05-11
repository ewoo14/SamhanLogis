/**
 * 견적서 작성/편집 화면 — `/sales/estimates/new` + `/:id/edit` (P2-1 #6).
 *
 * <p>UX:
 * <ul>
 *   <li>거래처 선택 — partner-service `searchPartners` 자동완성 (snapshot 자동 입력).</li>
 *   <li>유효기간 — 작성일 기준 +30일 default. 사용자 변경 가능.</li>
 *   <li>라인 입력 — 모델명 onBlur lookup → productId / productName / 단가 자동 채움.</li>
 *   <li>저장 — DRAFT 생성/갱신 후 상세로 이동.</li>
 *   <li>발송 — 편집 모드에서만. DRAFT → SENT 전이.</li>
 * </ul>
 *
 * <p>매뉴얼 출처: {@code docs/manual/01-영업/06-견적서.md}.
 * UUID 비공개 가드 — productId / partnerId 는 state 에만, 화면 표시는 modelName / partnerName.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Spinner } from '@samhan/design-system'
import {
  createEstimate,
  getEstimate,
  sendEstimate,
  updateEstimate,
  type CreateEstimateRequest,
  type EstimateLineRequest,
  type UpdateEstimateRequest,
} from '../api/estimateApi'
import { estimateAuditApi } from '../api/createAuditApi'
import { EstimateRealtimeClient } from '../realtime/EstimateRealtimeClient'
import { AuditRevisionBadge } from '../components/audit/AuditOverlaySection'
import { searchPartners, type PartnerSummary } from '../api/sales'
import { lookupProductByModelName } from '../api/slip'
import { usePageTitle } from '../hooks/usePageTitle'

let __lineUidCounter = 0
const nextLineUid = (): string => `est-line-${++__lineUidCounter}`

interface DraftLine {
  uid: string
  /** lookup 성공 시 채워지는 product UUID — 화면 미노출. */
  productId: string | null
  modelName: string
  productName: string
  specification: string
  quantity: string
  unitPrice: string
  note: string
  lookupError: string | null
  lookupLoading: boolean
}

const emptyLine = (): DraftLine => ({
  uid: nextLineUid(),
  productId: null,
  modelName: '',
  productName: '',
  specification: '',
  quantity: '1',
  unitPrice: '0',
  note: '',
  lookupError: null,
  lookupLoading: false,
})

const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const datePlusDays = (iso: string, days: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const fmt = (n: number): string => Math.trunc(n).toLocaleString('ko-KR')

const calcLineSupply = (qty: string, unitPrice: string): number => {
  const q = Number.parseFloat(qty || '0')
  const p = Number.parseFloat(unitPrice || '0')
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0
  return Math.trunc(q * p)
}

export function EstimateFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id?: string }>()
  const editId = params['id']
  const isEdit = Boolean(editId)

  usePageTitle(isEdit ? '견적서 편집' : '견적서 작성')

  const detailQuery = useQuery({
    queryKey: ['estimate', editId],
    queryFn: () => getEstimate(editId!),
    enabled: isEdit,
  })

  // PR-H4c: edit 모드 audit log 백필
  const auditQuery = useQuery({
    queryKey: ['estimate', editId, 'audit-logs'],
    queryFn: () => estimateAuditApi.listAuditLogs(editId!).catch(() => []),
    enabled: isEdit && !!editId,
  })

  // PR-H4c: edit 모드 SSE 구독
  useEffect(() => {
    if (!isEdit || !editId) return
    const ctrl = EstimateRealtimeClient.subscribe(editId, (evt) => {
      void queryClient.invalidateQueries({ queryKey: ['estimate', editId] })
      if (evt.event === 'estimate:edit' || evt.event === 'message') {
        void queryClient.invalidateQueries({ queryKey: ['estimate', editId, 'audit-logs'] })
      }
    })
    return () => ctrl.abort()
  }, [isEdit, editId, queryClient])

  const revertMutation = useMutation({
    mutationFn: (revisionNo: number) =>
      estimateAuditApi.revertToRevision(editId!, revisionNo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['estimate', editId] })
      void queryClient.invalidateQueries({ queryKey: ['estimate', editId, 'audit-logs'] })
    },
    onError: () => alert('복원에 실패했습니다.'),
  })

  const [partner, setPartner] = useState<PartnerSummary | null>(null)
  const [partnerName, setPartnerName] = useState<string>('')
  const [partnerBusinessNo, setPartnerBusinessNo] = useState<string>('')
  const [partnerAddress, setPartnerAddress] = useState<string>('')
  const [partnerIdSnapshot, setPartnerIdSnapshot] = useState<string>('')
  const [estimateDate, setEstimateDate] = useState<string>(today())
  const [validUntil, setValidUntil] = useState<string>(datePlusDays(today(), 30))
  const [memo, setMemo] = useState<string>('')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()])
  const [topError, setTopError] = useState<string>('')

  const [partnerKeyword, setPartnerKeyword] = useState<string>('')
  const [showPartnerSuggest, setShowPartnerSuggest] = useState<boolean>(false)
  const partnerSearchQuery = useQuery({
    queryKey: ['partners', 'search', partnerKeyword],
    queryFn: () => searchPartners(partnerKeyword, 8),
    enabled: partnerKeyword.trim().length >= 1 && showPartnerSuggest,
  })

  // edit mode hydrate
  useEffect(() => {
    if (!isEdit) return
    const e = detailQuery.data
    if (!e) return
    setPartnerIdSnapshot(e.partnerId)
    setPartnerName(e.partnerName)
    setPartnerBusinessNo(e.partnerBusinessNo ?? '')
    setPartnerAddress(e.partnerAddress ?? '')
    setEstimateDate(e.estimateDate)
    setValidUntil(e.validUntil ?? '')
    setMemo(e.memo ?? '')
    setLines(
      e.lines.length > 0
        ? e.lines.map((l) => ({
            uid: nextLineUid(),
            productId: l.productId,
            modelName: l.modelName ?? '',
            productName: l.productName ?? '',
            specification: l.specification ?? '',
            quantity: String(l.quantity),
            unitPrice: l.unitPrice,
            note: l.note ?? '',
            lookupError: null,
            lookupLoading: false,
          }))
        : [emptyLine()],
    )
  }, [isEdit, detailQuery.data])

  const totals = useMemo(() => {
    const supply = lines.reduce(
      (sum, l) => sum + calcLineSupply(l.quantity, l.unitPrice),
      0,
    )
    const vat = Math.trunc(supply * 0.1)
    return { supply, vat, total: supply + vat }
  }, [lines])

  const handleSelectPartner = (p: PartnerSummary) => {
    setPartner(p)
    setPartnerName(p.companyName)
    setPartnerBusinessNo(p.businessRegistrationNumber)
    setPartnerAddress(p.address ?? '')
    setPartnerKeyword(p.companyName)
    setShowPartnerSuggest(false)
  }

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    )
  }
  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (index: number) => {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? [emptyLine()] : next
    })
  }

  // 모델명 onBlur lookup
  const handleModelLookup = async (index: number) => {
    const line = lines[index]
    if (!line || !line.modelName.trim()) return
    updateLine(index, { lookupLoading: true, lookupError: null })
    try {
      const result = await lookupProductByModelName(line.modelName.trim())
      updateLine(index, {
        productId: result.productId,
        productName: result.productName,
        unitPrice:
          line.unitPrice === '0' || !line.unitPrice
            ? result.sellingPrice
            : line.unitPrice,
        lookupError: null,
        lookupLoading: false,
      })
    } catch (err: unknown) {
      updateLine(index, {
        lookupError:
          err instanceof Error
            ? '모델 미존재 또는 lookup 실패'
            : '알 수 없는 오류',
        lookupLoading: false,
      })
    }
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateEstimateRequest) => createEstimate(body),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      navigate(`/sales/estimates/${created.id}`, { replace: true })
    },
    onError: (err: Error) => setTopError(`저장 실패: ${err.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: (body: UpdateEstimateRequest) => updateEstimate(editId!, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      queryClient.invalidateQueries({ queryKey: ['estimate', updated.id] })
      navigate(`/sales/estimates/${updated.id}`, { replace: true })
    },
    onError: (err: Error) => setTopError(`수정 실패: ${err.message}`),
  })

  const sendMutation = useMutation({
    mutationFn: (id: string) => sendEstimate(id),
    onSuccess: (sent) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      queryClient.invalidateQueries({ queryKey: ['estimate', sent.id] })
      alert(`발송 완료: ${sent.estimateNo}`)
      navigate(`/sales/estimates/${sent.id}`, { replace: true })
    },
    onError: (err: Error) => setTopError(`발송 실패: ${err.message}`),
  })

  const buildBody = (): CreateEstimateRequest | null => {
    setTopError('')
    if (!partnerIdSnapshot && !partner) {
      setTopError('거래처를 선택하세요.')
      return null
    }
    if (!partnerName.trim()) {
      setTopError('거래처명이 비어있습니다.')
      return null
    }
    const valid = lines.filter(
      (l) => l.productId && Number.parseInt(l.quantity || '0', 10) > 0,
    )
    if (valid.length === 0) {
      setTopError(
        '라인 1개 이상 (모델명 lookup 성공 + 수량 > 0) 을 입력하세요.',
      )
      return null
    }
    const apiLines: EstimateLineRequest[] = valid.map((l) => ({
      productId: l.productId!,
      productName: l.productName.trim() || undefined,
      modelName: l.modelName.trim() || undefined,
      specification: l.specification.trim() || undefined,
      quantity: Number.parseInt(l.quantity || '0', 10),
      unitPrice: l.unitPrice || '0',
      note: l.note.trim() || undefined,
    }))
    return {
      estimateDate: estimateDate || undefined,
      partnerId: partnerIdSnapshot || partner?.businessRegistrationNumber || '',
      partnerName: partnerName.trim(),
      partnerBusinessNo: partnerBusinessNo.trim() || undefined,
      partnerAddress: partnerAddress.trim() || undefined,
      validUntil: validUntil || undefined,
      memo: memo.trim() || undefined,
      lines: apiLines,
    }
  }

  const handleSave = () => {
    const body = buildBody()
    if (!body) return
    if (isEdit) {
      const updateBody: UpdateEstimateRequest = {
        partnerId: body.partnerId,
        partnerName: body.partnerName,
        partnerBusinessNo: body.partnerBusinessNo,
        partnerAddress: body.partnerAddress,
        validUntil: body.validUntil,
        memo: body.memo,
        lines: body.lines,
      }
      updateMutation.mutate(updateBody)
    } else {
      createMutation.mutate(body)
    }
  }

  const handleSend = async () => {
    if (!isEdit || !editId) {
      setTopError('먼저 저장 후 발송할 수 있습니다.')
      return
    }
    if (
      !confirm(
        '이 견적서를 발송하시겠습니까?\n발송 후 거래처가 수락/거절을 결정합니다.',
      )
    )
      return
    const body = buildBody()
    if (!body) return
    try {
      const updateBody: UpdateEstimateRequest = {
        partnerId: body.partnerId,
        partnerName: body.partnerName,
        partnerBusinessNo: body.partnerBusinessNo,
        partnerAddress: body.partnerAddress,
        validUntil: body.validUntil,
        memo: body.memo,
        lines: body.lines,
      }
      await updateEstimate(editId, updateBody)
      sendMutation.mutate(editId)
    } catch (err: unknown) {
      setTopError(
        `발송 전 저장 실패: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (isEdit && detailQuery.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="견적서 불러오는 중" />
      </div>
    )
  }

  const isReadOnly =
    isEdit &&
    detailQuery.data &&
    detailQuery.data.status !== 'QUOTE_DRAFT' &&
    detailQuery.data.status !== 'QUOTE_SENT'

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    sendMutation.isPending

  return (
    <>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>
            {isEdit ? '견적서 편집' : '견적서 작성'}
          </h3>
          <p style={{ marginTop: 4, fontSize: 13, color: '#6B7280' }}>
            모델명을 입력하고 다른 영역을 클릭하면 품목명/단가가 자동 입력됩니다.
          </p>
        </div>
        {/* PR-H4c: 편집 모드 — 수정 횟수 + 복원 dropdown */}
        {isEdit ? (
          <AuditRevisionBadge
            logs={auditQuery.data ?? []}
            isError={auditQuery.isError}
            reverting={revertMutation.isPending}
            onRevert={(rev) => revertMutation.mutate(rev)}
            testIdPrefix="estimate-form"
          />
        ) : null}
      </div>

      {isReadOnly ? (
        <div
          className="error-banner"
          role="alert"
          style={{ marginBottom: 16, padding: 12 }}
        >
          이 견적서는 수락/거절/변환되어 더 이상 수정할 수 없습니다.
        </div>
      ) : null}

      <Card>
        {/* 거래처 선택 */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Input
            label="거래처 검색"
            placeholder="거래처명 또는 사업자번호"
            value={partnerKeyword}
            onChange={(e) => {
              setPartnerKeyword(e.target.value)
              setShowPartnerSuggest(true)
            }}
            onFocus={() => setShowPartnerSuggest(true)}
            disabled={Boolean(isReadOnly)}
            data-testid="estimate-form-partner-select"
          />
          {showPartnerSuggest &&
          partnerKeyword.trim().length >= 1 &&
          (partnerSearchQuery.data?.length ?? 0) > 0 ? (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 4,
                background: '#fff',
                border: '1px solid var(--color-neutral-300)',
                borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                zIndex: 10,
                maxHeight: 240,
                overflowY: 'auto',
              }}
              role="listbox"
            >
              {(partnerSearchQuery.data ?? []).map((p) => (
                <div
                  key={p.businessRegistrationNumber}
                  role="option"
                  aria-selected={
                    partner?.businessRegistrationNumber ===
                    p.businessRegistrationNumber
                  }
                  onClick={() => handleSelectPartner(p)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: 13,
                    borderBottom: '1px solid #F3F4F6',
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{p.companyName}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#6B7280',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {p.businessRegistrationNumber} ·{' '}
                    {p.address ?? '주소 없음'}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Input
            label="거래처명"
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            disabled={Boolean(isReadOnly)}
            required
            data-testid="estimate-form-partner-name"
          />
          <Input
            label="사업자번호"
            value={partnerBusinessNo}
            onChange={(e) => setPartnerBusinessNo(e.target.value)}
            disabled={Boolean(isReadOnly)}
            data-testid="estimate-form-partner-business-no"
          />
          <Input
            label="작성일"
            type="date"
            value={estimateDate}
            onChange={(e) => setEstimateDate(e.target.value)}
            disabled={Boolean(isReadOnly)}
            data-testid="estimate-form-estimate-date"
          />
          <Input
            label="유효기간"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            disabled={Boolean(isReadOnly)}
            data-testid="estimate-form-valid-until"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Input
            label="주소"
            value={partnerAddress}
            onChange={(e) => setPartnerAddress(e.target.value)}
            disabled={Boolean(isReadOnly)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Input
            label="비고"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            disabled={Boolean(isReadOnly)}
          />
        </div>

        {/* 라인 헤더 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              '32px 160px 1fr 100px 80px 130px 130px 36px',
            gap: 8,
            padding: '8px 0',
            borderBottom: '2px solid var(--line-default)',
            fontSize: 12,
            color: '#6B7280',
            fontWeight: 600,
          }}
        >
          <div style={{ textAlign: 'center' }}>#</div>
          <div>모델명</div>
          <div>품목명</div>
          <div>규격</div>
          <div style={{ textAlign: 'right' }}>수량</div>
          <div style={{ textAlign: 'right' }}>단가</div>
          <div style={{ textAlign: 'right' }}>소계</div>
          <div />
        </div>

        {lines.map((line, i) => {
          const supply = calcLineSupply(line.quantity, line.unitPrice)
          return (
            <div
              key={line.uid}
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '32px 160px 1fr 100px 80px 130px 130px 36px',
                gap: 8,
                padding: '6px 0',
                alignItems: 'center',
                borderBottom: '1px solid #F3F4F6',
              }}
              data-testid={`estimate-form-line-${i}`}
            >
              <div style={{ textAlign: 'center', color: '#6B7280' }}>
                {i + 1}
              </div>
              <div>
                <input
                  type="text"
                  value={line.modelName}
                  onChange={(e) =>
                    updateLine(i, { modelName: e.target.value })
                  }
                  onBlur={() => handleModelLookup(i)}
                  placeholder="예: AJ040RXH4BC1"
                  disabled={Boolean(isReadOnly)}
                  style={{
                    height: 32,
                    width: '100%',
                    padding: '0 8px',
                    border: line.lookupError
                      ? '1px solid var(--state-danger)'
                      : '1px solid var(--color-neutral-300)',
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                  data-testid={`estimate-form-line-${i}-model`}
                />
                {line.lookupError ? (
                  <div style={{ fontSize: 10, color: 'var(--state-danger)', marginTop: 2 }}>
                    {line.lookupError}
                  </div>
                ) : null}
              </div>
              <input
                type="text"
                value={line.productName}
                onChange={(e) =>
                  updateLine(i, { productName: e.target.value })
                }
                placeholder={line.lookupLoading ? '조회 중...' : '품목명'}
                disabled={Boolean(isReadOnly)}
                style={{
                  height: 32,
                  padding: '0 8px',
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  fontSize: 13,
                  background: line.productId ? '#F9FAFB' : '#fff',
                }}
              />
              <input
                type="text"
                value={line.specification}
                onChange={(e) =>
                  updateLine(i, { specification: e.target.value })
                }
                placeholder="규격"
                disabled={Boolean(isReadOnly)}
                style={{
                  height: 32,
                  padding: '0 8px',
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  fontSize: 13,
                }}
              />
              <input
                type="text"
                inputMode="numeric"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
                disabled={Boolean(isReadOnly)}
                style={{
                  height: 32,
                  padding: '0 8px',
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  fontSize: 13,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
                data-testid={`estimate-form-line-${i}-qty`}
              />
              <input
                type="text"
                inputMode="decimal"
                value={line.unitPrice}
                onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                disabled={Boolean(isReadOnly)}
                style={{
                  height: 32,
                  padding: '0 8px',
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  fontSize: 13,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
                data-testid={`estimate-form-line-${i}-unit-price`}
              />
              <div
                style={{
                  textAlign: 'right',
                  fontSize: 13,
                  color: 'var(--ink-primary)',
                  fontVariantNumeric: 'tabular-nums',
                  background: '#F9FAFB',
                  padding: '8px',
                  borderRadius: 4,
                }}
              >
                {fmt(supply)}
              </div>
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={Boolean(isReadOnly)}
                aria-label={`라인 ${i + 1} 삭제`}
                style={{
                  height: 32,
                  width: 32,
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  background: '#fff',
                  color: 'var(--state-danger)',
                  cursor: isReadOnly ? 'not-allowed' : 'pointer',
                }}
              >
                ×
              </button>
            </div>
          )
        })}

        {!isReadOnly ? (
          <div style={{ marginTop: 12 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={addLine}
              data-testid="estimate-form-add-line"
            >
              + 라인 추가
            </Button>
          </div>
        ) : null}

        {/* 합계 */}
        <div
          style={{
            marginTop: 16,
            padding: '12px 16px',
            background: '#F9FAFB',
            borderRadius: 6,
            display: 'grid',
            gridTemplateColumns: '1fr 140px 140px 140px',
            gap: 16,
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums',
            alignItems: 'center',
          }}
          data-testid="estimate-form-totals"
        >
          <div style={{ fontWeight: 600 }}>합계</div>
          <div style={{ textAlign: 'right' }}>
            공급가액 <strong>{fmt(totals.supply)}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            부가세 <strong>{fmt(totals.vat)}</strong>
          </div>
          <div style={{ textAlign: 'right', fontSize: 16 }}>
            총합 <strong>{fmt(totals.total)}</strong>
          </div>
        </div>
      </Card>

      {topError ? (
        <div
          className="error-banner"
          role="alert"
          style={{ marginTop: 16, padding: 12, color: 'var(--state-danger)' }}
        >
          {topError}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 16,
        }}
      >
        <Button variant="ghost" onClick={() => navigate(-1)}>
          취소
        </Button>
        {!isReadOnly ? (
          <>
            <Button
              variant="ghost"
              onClick={handleSave}
              disabled={isPending}
              data-testid="estimate-form-save-button"
            >
              {isPending ? '저장 중...' : '저장 (DRAFT)'}
            </Button>
            {isEdit ? (
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={isPending}
                data-testid="estimate-form-send-button"
              >
                {sendMutation.isPending ? '발송 중...' : '발송 (SENT)'}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  )
}
