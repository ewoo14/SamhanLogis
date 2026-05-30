/**
 * 주문서 상세 — `/sales/partner-orders/:id`.
 *
 * <p>거래처가 입력한 그대로 표시 (수정 X). Bundle EXPAND/KEEP 결과 + expanded
 * components + 자동 생성 슬립 번호 표시.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Button, Input, Modal, Select } from '@samhan/design-system'
import {
  PARTNER_ORDER_STATUS_LABEL,
  deletePartnerOrder,
  getPartnerOrder,
  holdPartnerOrder,
  releasePartnerOrder,
  updatePartnerOrder,
  type PartnerOrderDetail,
  type PartnerOrderUpdateRequest,
} from '../api/sales'
import { apiClient } from '../api/client'
import { partnerOrderAuditApi } from '../api/createAuditApi'
import { usePageTitleStore } from '../stores/pageTitle'
import { useSessionStore } from '../stores/session'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import { PartnerOrderVersionHistoryPanel } from '../components/audit/PartnerOrderVersionHistoryPanel'
import styles from '../components/sales/sales.module.css'

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)
const bundleModeLabel = (mode: 'EXPAND' | 'KEEP' | null) => {
  if (mode === 'EXPAND') return '구성품 펼침'
  if (mode === 'KEEP') return '묶음 유지'
  return null
}
const EDIT_ROLES = ['SALES', 'MANAGER', 'MASTER']
const PRINT_ROLES = ['SALES', 'MANAGER', 'MASTER']

type EditLine = PartnerOrderUpdateRequest['lines'][number] & { key: string }

function createEditLineKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

function toEditLines(order: PartnerOrderDetail): EditLine[] {
  return order.lines.map((line) => ({
    key: createEditLineKey(),
    modelCode: line.modelCode,
    productName: line.productName,
    categoryKey: line.categoryKey ?? 'homemulti',
    quantity: line.quantity,
    deliveryPrice: line.deliveryPrice,
    remark: null,
  }))
}

export function SalesPartnerOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const auth = useSessionStore((s) => s.auth)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const isValidId = !!id && id !== 'undefined' && id !== 'null'
  const orderId = id!
  const canEdit = !!auth?.role && EDIT_ROLES.includes(auth.role)
  const canPrint = !!auth?.role && PRINT_ROLES.includes(auth.role)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)
  const [printErrorMessage, setPrintErrorMessage] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [reloadSuccessMessage, setReloadSuccessMessage] = useState<string | null>(null)
  const [holdErrorMessage, setHoldErrorMessage] = useState<string | null>(null)
  const [partnerCode, setPartnerCode] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<EditLine[]>([])
  const reloadSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const query = useQuery({
    queryKey: ['partner-order', id],
    queryFn: () => getPartnerOrder(id!),
    enabled: isValidId,
    retry: 1,
  })
  const { refetch } = query

  const auditQuery = useQuery({
    queryKey: ['partner-order', id, 'audit-logs'],
    queryFn: () => partnerOrderAuditApi.listAuditLogs(orderId),
    enabled: !!query.data?.orderNumber,
    retry: 1,
  })

  const updateMutation = useMutation({
    mutationFn: (request: PartnerOrderUpdateRequest) => updatePartnerOrder(orderId, request),
    onSuccess: async (updated) => {
      setConflictMessage(null)
      setReloadSuccessMessage(null)
      setEditOpen(false)
      queryClient.setQueryData(['partner-order', id], updated)
      await queryClient.invalidateQueries({ queryKey: ['partner-order', id, 'audit-logs'] })
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setConflictMessage('다른 사용자가 먼저 수정했습니다. 최신 내용으로 다시 불러온 뒤 다시 저장해 주세요.')
        return
      }
      setConflictMessage('주문서 수정에 실패했습니다. 입력값을 확인해 주세요.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deletePartnerOrder(orderId),
    onSuccess: async () => {
      setDeleteErrorMessage(null)
      setDeleteOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
      navigate('/sales/partner-orders')
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 422) {
        setDeleteErrorMessage('확정 또는 전표 발행된 주문서는 삭제할 수 없습니다.')
        return
      }
      setDeleteErrorMessage('주문서 삭제에 실패했습니다. 상태를 확인해 주세요.')
    },
  })

  /**
   * 보류 처리 (DRAFT → ON_HOLD). edit 권한 게이트는 canEdit 로 보호.
   * 성공 시 목록 + 상세 쿼리 무효화.
   */
  const holdMutation = useMutation({
    mutationFn: () => holdPartnerOrder(orderId),
    onSuccess: async (updated) => {
      setHoldErrorMessage(null)
      queryClient.setQueryData(['partner-order', id], updated)
      await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
      await queryClient.invalidateQueries({ queryKey: ['partner-order', id, 'audit-logs'] })
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 409) {
          setHoldErrorMessage('진행중(DRAFT) 상태인 주문서만 보류할 수 있습니다.')
          return
        }
        if (error.response?.status === 403) {
          setHoldErrorMessage('주문서 보류 처리 권한이 없습니다. 관리자에게 문의해 주세요.')
          return
        }
      }
      setHoldErrorMessage('보류 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    },
  })

  /**
   * 보류 해제 (ON_HOLD → DRAFT). edit 권한 게이트는 canEdit 로 보호.
   * 성공 시 목록 + 상세 쿼리 무효화.
   */
  const releaseMutation = useMutation({
    mutationFn: () => releasePartnerOrder(orderId),
    onSuccess: async (updated) => {
      setHoldErrorMessage(null)
      queryClient.setQueryData(['partner-order', id], updated)
      await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
      await queryClient.invalidateQueries({ queryKey: ['partner-order', id, 'audit-logs'] })
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 409) {
          setHoldErrorMessage('보류(ON_HOLD) 상태인 주문서만 해제할 수 있습니다.')
          return
        }
        if (error.response?.status === 403) {
          setHoldErrorMessage('주문서 보류 해제 권한이 없습니다. 관리자에게 문의해 주세요.')
          return
        }
      }
      setHoldErrorMessage('보류 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    },
  })

  const syncFormFromData = useCallback((data: PartnerOrderDetail) => {
    setPartnerCode(data.partnerCode)
    setDueDate(data.dueDate ?? '')
    setMemo(data.memo ?? '')
    setLines(toEditLines(data))
  }, [])

  useEffect(() => {
    if (!query.data || editOpen) return
    syncFormFromData(query.data)
  }, [query.data, editOpen, syncFormFromData])

  const handleConflictReload = useCallback(async () => {
    const result = await refetch()
    if (result.data) {
      syncFormFromData(result.data)
      setConflictMessage(null)
      setReloadSuccessMessage('최신 내용으로 업데이트됐습니다. 다시 저장해 주세요.')
      if (reloadSuccessTimerRef.current) {
        clearTimeout(reloadSuccessTimerRef.current)
      }
      reloadSuccessTimerRef.current = setTimeout(() => {
        setReloadSuccessMessage(null)
        reloadSuccessTimerRef.current = null
      }, 3000)
    }
  }, [refetch, syncFormFromData])

  const handlePrint = useCallback(async () => {
    setPrintErrorMessage(null)
    try {
      const response = await apiClient.get(
        `/api/v1/partner-orders/${encodeURIComponent(orderId)}/print`,
        {
          responseType: 'blob',
          headers: auth?.partnerCode ? { 'X-Partner-Code': auth.partnerCode } : undefined,
        },
      )
      const blob = new Blob([response.data], { type: 'text/html;charset=UTF-8' })
      const url = URL.createObjectURL(blob)
      const opened = window.open(url, '_blank')
      if (!opened) {
        URL.revokeObjectURL(url)
        setPrintErrorMessage('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.')
        return
      }
      try {
        opened.opener = null
      } catch {
        // Browser engines can reject opener mutation for special windows.
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      console.error('partner order print failed', error)
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          setPrintErrorMessage('로그인이 만료되었습니다. 다시 로그인해 주세요.')
          return
        }
        if (error.response?.status === 403) {
          setPrintErrorMessage('이 주문서를 인쇄할 권한이 없습니다.')
          return
        }
        if (error.response?.status === 404) {
          setPrintErrorMessage('주문서를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.')
          return
        }
      }
      setPrintErrorMessage('주문서 인쇄 파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }
  }, [auth?.partnerCode, orderId])

  useEffect(() => {
    setPageTitle({ title: `주문서 ${query.data?.orderNumber ?? '조회 중'}`, meta: '영업' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle, query.data?.orderNumber])

  useEffect(() => {
    return () => {
      if (reloadSuccessTimerRef.current) {
        clearTimeout(reloadSuccessTimerRef.current)
      }
    }
  }, [])

  if (!isValidId) {
    return (
      <div className={styles['salesScope']}>
        <SalesSubNav />
        <div className={styles['wrap']}>
          <div className={styles['emptyState']}>
            <h3>주문번호가 지정되지 않았습니다</h3>
            <p>주문서 목록에서 항목을 선택해 주세요.</p>
            <Link to="/sales/partner-orders" className={styles['btnGhost']}>
              ← 목록으로 이동
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles['salesScope']}>
      <SalesSubNav />
      <div className={styles['wrap']}>
        <div className={styles['top']}>
          <div className={styles['title']}>
            주문서 상세
            <span className={styles['badge']}>{query.data?.orderNumber ?? '조회 중'}</span>
          </div>
          <div className={styles['topActions']}>
            {query.data && canPrint ? (
              <Button
                type="button"
                variant="secondary"
                data-testid="partner-order-print-open"
                onClick={handlePrint}
              >
                인쇄
              </Button>
            ) : null}
            {query.data && canEdit ? (
              <Button
                type="button"
                variant="primary"
                data-testid="partner-order-edit-open"
                onClick={() => {
                  syncFormFromData(query.data!)
                  setEditOpen(true)
                }}
              >
                수정
              </Button>
            ) : null}
            {query.data && canEdit && query.data.status === 'DRAFT' ? (
              <Button
                type="button"
                variant="warning"
                data-testid="partner-order-hold"
                disabled={holdMutation.isPending}
                onClick={() => {
                  setHoldErrorMessage(null)
                  holdMutation.mutate()
                }}
              >
                보류
              </Button>
            ) : null}
            {query.data && canEdit && query.data.status === 'ON_HOLD' ? (
              <Button
                type="button"
                variant="secondary"
                data-testid="partner-order-release"
                disabled={releaseMutation.isPending}
                onClick={() => {
                  setHoldErrorMessage(null)
                  releaseMutation.mutate()
                }}
              >
                보류 해제
              </Button>
            ) : null}
            {query.data && canEdit ? (
              <Button
                type="button"
                variant="danger"
                data-testid="partner-order-delete-open"
                onClick={() => {
                  setDeleteErrorMessage(null)
                  setDeleteOpen(true)
                }}
              >
                삭제
              </Button>
            ) : null}
            <Link to="/sales/partner-orders" className={`${styles['btnGhost']} ${styles['listBackLink']}`}>
              ← 목록
            </Link>
          </div>
        </div>
        {printErrorMessage ? (
          <div className={styles['errorBanner']} role="alert" data-testid="partner-order-print-error">
            {printErrorMessage}
          </div>
        ) : null}
        {holdErrorMessage ? (
          <div className={styles['errorBanner']} role="alert" data-testid="partner-order-hold-error">
            {holdErrorMessage}
          </div>
        ) : null}

        {query.isLoading ? (
          <div className={styles['emptyState']}>주문 상세를 불러오는 중…</div>
        ) : query.isError ? (
          <div className={styles['emptyState']}>
            <h3>주문 조회에 실패했습니다</h3>
            <p>주문번호를 확인한 뒤 다시 시도해 주세요.</p>
          </div>
        ) : query.data ? (
          <>
            <div className={styles['card']}>
              <div className={styles['cardHead']}>
                <div className={styles['cardTitle']}>
                  거래처 · {query.data.partnerName ?? query.data.partnerCode}
                  <span className={styles['badge']}>
                    {PARTNER_ORDER_STATUS_LABEL[query.data.status]}
                  </span>
                </div>
                <div className={styles['cardActions']}>
                  <span className={styles['ratio']}>합계 {krw(query.data.totalAmount)}원</span>
                </div>
              </div>
              <div className={styles['formGrid']}>
                <div className={styles['formField']}>
                  <label>거래처 코드</label>
                  <Input aria-label="거래처 코드" readOnly inputSize="sm" value={query.data.partnerCode} />
                </div>
                <div className={styles['formField']}>
                  <label>연결 전표</label>
                  <Input aria-label="연결 전표" readOnly inputSize="sm" value={query.data.linkedSlipNo ?? '-'} />
                </div>
                <div className={styles['formField']}>
                  <label>배송지</label>
                  <Input aria-label="배송지" readOnly inputSize="sm" value={query.data.deliveryAddress ?? '-'} />
                </div>
                <div className={styles['formField']}>
                  <label>현장</label>
                  <Input aria-label="현장" readOnly inputSize="sm" value={query.data.siteAddress ?? '-'} />
                </div>
                <div className={styles['formField']}>
                  <label>연락처</label>
                  <Input aria-label="연락처" readOnly inputSize="sm" value={query.data.contactPhone ?? '-'} />
                </div>
                <div className={styles['formField']}>
                  <label>납기</label>
                  <Input aria-label="납기" readOnly inputSize="sm" value={query.data.dueDate ?? '-'} />
                </div>
                {query.data.memo ? (
                  <div className={`${styles['formField']} ${styles['formFieldSpanAll']}`}>
                    <label>요청사항</label>
                    <Input aria-label="요청사항" readOnly inputSize="sm" value={query.data.memo} />
                  </div>
                ) : null}
              </div>
            </div>

            <div className={`${styles['card']} ${styles['cardMarginTop']}`}>
              <div className={styles['cardHead']}>
                <div className={styles['cardTitle']}>
                  라인 ({query.data.lines?.length ?? 0}건)
                </div>
              </div>
              <div className={styles['tableWrap']}>
                <table className={styles['estTable']}>
                  <thead>
                    {/* v2 §정정 4/5 — '품명'→'품목명', '모델 코드'→'모델명' */}
                    <tr>
                      <th>품목명</th>
                      <th>모델명</th>
                      <th>수량</th>
                      <th>납품가</th>
                      <th>소계</th>
                      <th>묶음 처리</th>
                      <th>구성품 펼침</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(query.data.lines ?? []).map((line, index) => (
                      <tr key={`${line.modelCode}-${line.productName}-${index}`}>
                        <td className={styles['tdLeft']}>{line.productName}</td>
                        <td>{line.modelCode}</td>
                        <td>{line.quantity}</td>
                        <td className={styles['numericCol']}>{krw(line.deliveryPrice)}</td>
                        <td className={styles['numericCol']}>{krw(line.subtotal)}</td>
                        <td>
                          {bundleModeLabel(line.bundleMode) ? (
                            <span className={styles['badge']}>{bundleModeLabel(line.bundleMode)}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className={styles['expandedComponentText']}>
                          {line.expandedComponents.length === 0
                            ? '-'
                            : line.expandedComponents.map((c) => (
                                <div key={c.modelCode}>
                                  {c.productName} ({c.modelCode}) × {c.quantity}
                                </div>
                              ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <PartnerOrderVersionHistoryPanel
              orderId={orderId}
              status={query.data.status}
            />

            <div className={`${styles['card']} ${styles['cardMarginTop']}`}>
              <div className={styles['cardHead']}>
                <div className={styles['cardTitle']}>수정 이력</div>
              </div>
              {auditQuery.isLoading ? (
                <div className={styles['emptyState']}>수정 이력을 불러오는 중…</div>
              ) : (auditQuery.data?.length ?? 0) === 0 ? (
                <div className={styles['emptyState']} data-testid="partner-order-edit-audit-empty">
                  아직 수정 이력이 없습니다
                </div>
              ) : (
                <div data-testid="partner-order-edit-audit-timeline">
                  {auditQuery.data!.map((entry, index) => (
                    <div
                      key={`${entry.revisionNo}-${entry.field}-${entry.changedAt}-${index}`}
                      className={styles['historyRow']}
                    >
                      <strong>{entry.actorName}</strong>
                      <span>{new Date(entry.changedAt).toLocaleString('ko-KR')}</span>
                      <span>{entry.field}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="주문서 수정"
        size="xl"
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              닫기
            </Button>
            <Button
              type="button"
              variant="primary"
              data-testid="partner-order-edit-submit"
              disabled={updateMutation.isPending || !query.data}
              onClick={() => {
                if (!query.data) return
                updateMutation.mutate({
                  updatedAt: query.data.updatedAt,
                  partnerCode,
                  bizCode: query.data.bizCode,
                  dueDate: dueDate || null,
                  memo: memo || null,
                  lines: lines.map((line) => ({
                    modelCode: line.modelCode,
                    productName: line.productName,
                    categoryKey: line.categoryKey,
                    quantity: line.quantity,
                    deliveryPrice: line.deliveryPrice,
                    remark: line.remark,
                  })),
                })
              }}
            >
              저장
            </Button>
          </>
        )}
      >
        {conflictMessage ? (
          <div
            className={styles['errorBanner']}
            role="alert"
            data-testid="partner-order-edit-conflict-banner"
          >
            {conflictMessage}
            <Button
              type="button"
              variant="secondary"
              data-testid="partner-order-edit-reload"
              onClick={handleConflictReload}
            >
              최신 내용 불러오기
            </Button>
          </div>
        ) : null}
        {reloadSuccessMessage ? (
          <div
            className={styles['successBanner']}
            role="status"
            data-testid="partner-order-edit-reload-success"
          >
            {reloadSuccessMessage}
          </div>
        ) : null}
        <div className={styles['formGrid']} data-testid="partner-order-edit-form">
          <Input
            label="거래처 코드"
            value={partnerCode}
            onChange={(e) => setPartnerCode(e.target.value)}
            data-testid="partner-order-edit-partner-code"
          />
          <Input
            label="납기"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            data-testid="partner-order-edit-due-date"
          />
          <Input
            label="요청사항"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            data-testid="partner-order-edit-memo"
          />
        </div>
        <div className={`${styles['tableWrap']} ${styles['cardMarginTop']}`}>
          <table className={styles['estTable']}>
            <thead>
              <tr>
                <th>품목명</th>
                <th>모델명</th>
                <th>구분</th>
                <th>수량</th>
                <th>납품가</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key}>
                  <td>
                    <Input
                      aria-label="품목명"
                      value={line.productName}
                      data-testid={`partner-order-edit-line-${index}-product-name`}
                      onChange={(e) => updateLine(index, { productName: e.target.value })}
                    />
                  </td>
                  <td>
                    <Input
                      aria-label="모델명"
                      value={line.modelCode}
                      data-testid={`partner-order-edit-line-${index}-model-code`}
                      onChange={(e) => updateLine(index, { modelCode: e.target.value })}
                    />
                  </td>
                  <td>
                    <Select
                      aria-label="구분"
                      value={line.categoryKey}
                      data-testid={`partner-order-edit-line-${index}-category`}
                      onChange={(e) => updateLine(index, { categoryKey: e.target.value })}
                    >
                      <option value="homemulti">홈멀티</option>
                      <option value="singleSets">싱글 세트</option>
                      <option value="commercialMulti">상업멀티</option>
                      <option value="oldProducts">구형</option>
                    </Select>
                  </td>
                  <td>
                    <Input
                      aria-label="수량"
                      type="number"
                      min={1}
                      value={line.quantity}
                      data-testid={`partner-order-edit-line-${index}-quantity`}
                      onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <Input
                      aria-label="납품가"
                      type="number"
                      min={0}
                      value={line.deliveryPrice}
                      data-testid={`partner-order-edit-line-${index}-delivery-price`}
                      onChange={(e) => updateLine(index, { deliveryPrice: Number(e.target.value) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="주문서 삭제"
        size="sm"
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              data-testid="partner-order-delete-confirm"
              disabled={deleteMutation.isPending || !query.data}
              onClick={() => {
                if (!query.data) return
                deleteMutation.mutate()
              }}
            >
              삭제
            </Button>
          </>
        )}
      >
        <div data-testid="partner-order-delete-confirm-dialog">
          <p>
            주문서 <strong>{query.data?.orderNumber ?? '조회 중'}</strong>을(를) 삭제하시겠습니까?
          </p>
          <p>삭제 후 목록과 상세 조회에서 제외됩니다.</p>
          {deleteErrorMessage ? (
            <div
              className={styles['errorBanner']}
              role="alert"
              data-testid="partner-order-delete-error"
            >
              {deleteErrorMessage}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  )

  function updateLine(index: number, patch: Partial<EditLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }
}
