/**
 * 주문서 상세 — `/sales/partner-orders/:id`.
 *
 * <p>거래처가 입력한 그대로 표시 (수정 X). Bundle EXPAND/KEEP 결과 + expanded
 * components + 자동 생성 슬립 번호 표시.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Button, Input, Modal, Select } from '@samhan/design-system'
import {
  PARTNER_ORDER_STATUS_LABEL,
  getPartnerOrder,
  listPartnerOrderAuditLogs,
  updatePartnerOrder,
  type PartnerOrderDetail,
  type PartnerOrderUpdateRequest,
} from '../api/sales'
import { usePageTitleStore } from '../stores/pageTitle'
import { useSessionStore } from '../stores/session'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import styles from '../components/sales/sales.module.css'

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)
const bundleModeLabel = (mode: 'EXPAND' | 'KEEP' | null) => {
  if (mode === 'EXPAND') return '구성품 펼침'
  if (mode === 'KEEP') return '묶음 유지'
  return null
}
const EDIT_ROLES = ['SALES', 'MANAGER', 'MASTER']

type EditLine = PartnerOrderUpdateRequest['lines'][number]

function toEditLines(order: PartnerOrderDetail): EditLine[] {
  return order.lines.map((line) => ({
    modelCode: line.modelCode,
    productName: line.productName,
    categoryKey: 'homemulti',
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

  const isValidId = !!id && id !== 'undefined' && id !== 'null'
  const canEdit = !!auth?.role && EDIT_ROLES.includes(auth.role)
  const [editOpen, setEditOpen] = useState(false)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [partnerCode, setPartnerCode] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<EditLine[]>([])

  const query = useQuery({
    queryKey: ['partner-order', id],
    queryFn: () => getPartnerOrder(id!),
    enabled: isValidId,
    retry: 1,
  })

  const auditQuery = useQuery({
    queryKey: ['partner-order', id, 'audit-logs'],
    queryFn: () => listPartnerOrderAuditLogs(query.data!.orderNumber),
    enabled: !!query.data?.orderNumber,
    retry: 1,
  })

  const updateMutation = useMutation({
    mutationFn: (request: PartnerOrderUpdateRequest) => updatePartnerOrder(query.data!.orderNumber, request),
    onSuccess: async (updated) => {
      setConflictMessage(null)
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

  useEffect(() => {
    if (!query.data || editOpen) return
    setPartnerCode(query.data.partnerCode)
    setDueDate(query.data.dueDate ?? '')
    setMemo(query.data.memo ?? '')
    setLines(toEditLines(query.data))
  }, [query.data, editOpen])

  useEffect(() => {
    setPageTitle({ title: `주문서 ${query.data?.orderNumber ?? (isValidId ? id : '')}`, meta: '영업' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle, id, isValidId, query.data?.orderNumber])

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
            <span className={styles['badge']}>{query.data?.orderNumber ?? id}</span>
          </div>
          <div className={styles['topActions']}>
            {query.data && canEdit ? (
              <Button
                type="button"
                variant="primary"
                data-testid="partner-order-edit-open"
                onClick={() => {
                  setPartnerCode(query.data!.partnerCode)
                  setDueDate(query.data!.dueDate ?? '')
                  setMemo(query.data!.memo ?? '')
                  setLines(toEditLines(query.data!))
                  setEditOpen(true)
                }}
              >
                수정
              </Button>
            ) : null}
            <Link to="/sales/partner-orders" className={styles['btnGhost']}>
              ← 목록
            </Link>
          </div>
        </div>

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
                  <input readOnly value={query.data.partnerCode} />
                </div>
                <div className={styles['formField']}>
                  <label>연결 전표</label>
                  <input readOnly value={query.data.linkedSlipNo ?? '-'} />
                </div>
                <div className={styles['formField']}>
                  <label>배송지</label>
                  <input readOnly value={query.data.deliveryAddress ?? '-'} />
                </div>
                <div className={styles['formField']}>
                  <label>현장</label>
                  <input readOnly value={query.data.siteAddress ?? '-'} />
                </div>
                <div className={styles['formField']}>
                  <label>연락처</label>
                  <input readOnly value={query.data.contactPhone ?? '-'} />
                </div>
                <div className={styles['formField']}>
                  <label>납기</label>
                  <input readOnly value={query.data.dueDate ?? '-'} />
                </div>
                {query.data.memo ? (
                  <div className={styles['formField']} style={{ gridColumn: '1 / -1' }}>
                    <label>요청사항</label>
                    <textarea readOnly value={query.data.memo} rows={3} />
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles['card']} style={{ marginTop: 12 }}>
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
                      <tr key={`${line.modelCode}-${index}`}>
                        <td style={{ textAlign: 'left' }}>{line.productName}</td>
                        <td>{line.modelCode}</td>
                        <td>{line.quantity}</td>
                        <td className="numeric">{krw(line.deliveryPrice)}</td>
                        <td className="numeric">{krw(line.subtotal)}</td>
                        <td>
                          {bundleModeLabel(line.bundleMode) ? (
                            <span className={styles['badge']}>{bundleModeLabel(line.bundleMode)}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ textAlign: 'left', fontSize: 11 }}>
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

            <div className={styles['card']} style={{ marginTop: 12 }}>
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
                  {auditQuery.data!.map((entry) => (
                    <div
                      key={`${entry.revisionNo}-${entry.field}-${entry.changedAt}`}
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
                  lines,
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
              onClick={() => query.refetch()}
            >
              최신 내용 불러오기
            </Button>
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
        <div className={styles['tableWrap']} style={{ marginTop: 12 }}>
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
                <tr key={`${line.modelCode}-${index}`}>
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
    </div>
  )

  function updateLine(index: number, patch: Partial<EditLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }
}
