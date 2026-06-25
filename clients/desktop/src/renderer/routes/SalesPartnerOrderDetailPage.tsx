/**
 * 주문서 상세 — `/sales/partner-orders/:id`.
 *
 * <p>거래처가 입력한 그대로 표시 (수정 X). Bundle EXPAND/KEEP 결과 + expanded
 * components + 자동 생성 슬립 번호 표시.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Button, Input, Modal, Select, WarehouseAutocomplete } from '@samhan/design-system'
import type { Warehouse } from '@samhan/design-system'
import { listWarehouses, type StockBalanceLookupLine } from '../api/inventory'
import {
  PARTNER_ORDER_STATUS_LABEL,
  convertPartnerOrderToSlip,
  deletePartnerOrder,
  getPartnerOrder,
  holdPartnerOrder,
  releasePartnerOrder,
  updatePartnerOrder,
  type ConvertToSlipItem,
  type PartnerOrderDetail,
  type PartnerOrderUpdateRequest,
} from '../api/sales'
import { InventoryLookupModal } from './components/InventoryLookupModal'
import { LineLookupReferenceModal } from './components/LineLookupReferenceModal'
import { apiClient } from '../api/client'
import { partnerOrderAuditApi } from '../api/createAuditApi'
import { PartnerOrderCollaborationPanel } from '../components/collab/PartnerOrderCollaborationPanel'
import { MobileActionSheet } from '../components/common/MobileActionSheet'
import { MobileCollapsible } from '../components/common/MobileCollapsible'
import { usePageTitleStore } from '../stores/pageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { useIsMobile } from '../hooks/useIsMobile'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import { PartnerOrderVersionHistoryPanel } from '../components/audit/PartnerOrderVersionHistoryPanel'
import styles from '../components/sales/sales.module.css'

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)
const statusBadgeStyle = (status: string) => {
  switch (status) {
    case 'ON_HOLD':
      return { background: '#FEF3C7', color: '#92400E' }
    case 'CONVERTED':
      return { background: '#EDE9FE', color: '#5B21B6' }
    case 'CONFIRMED':
      return { background: '#D1FAE5', color: '#065F46' }
    case 'CANCELED':
      return { background: '#FEE2E2', color: '#991B1B' }
    case 'DRAFT':
    default:
      return { background: '#F3F4F6', color: '#4B5563' }
  }
}

const emptyLabel = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '-' : String(value)

const bundleModeLabel = (mode: 'EXPAND' | 'KEEP' | null) => {
  if (mode === 'EXPAND') return '구성품 펼침'
  if (mode === 'KEEP') return '묶음 유지'
  return null
}
/**
 * 출고전표 전환 가능 status 화이트리스트 — BE requireConvertible(DRAFT/ON_HOLD 한정) 과 정합.
 * CONFIRMED 포함 나머지 상태는 전환 불가(BE 409 또는 business rule 위반).
 * CONVERTED: slipNo=null 이어도 이미 전량 전환 완료이므로 FE 에서 차단.
 * NOTE: BE requireConvertible 이 CONVERTED 상태를 slipNo!=null 로만 검사하는 결함이 있어
 *       (slipNo=null + status=CONVERTED 가 BE 를 통과할 수 있음) FE 에서 화이트리스트로 방어.
 */
const CONVERTIBLE_STATUS: ReadonlySet<string> = new Set(['DRAFT', 'ON_HOLD'])
const COLLAB_LOCKED_STATUS: ReadonlySet<string> = new Set(['CANCELED', 'CONVERTED', 'CONFIRMING'])

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
    remark: line.remark,
  }))
}

export function SalesPartnerOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const { canAccess } = usePermissions()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const isValidId = !!id && id !== 'undefined' && id !== 'null'
  const orderId = id!
  const canEdit = canAccess('sales.partner-order.edit', 'update')
  // [C2c] 삭제는 BE PartnerOrderDeleteController 가 sales.partner-order.edit + DELETE 요구 →
  // 7-action 분리 모델에서 update 와 별개로 delete 권한을 확인(Codex review P1).
  const canDelete = canAccess('sales.partner-order.edit', 'delete')
  const canPrint = canAccess('sales.partner-order.print', 'print')
  const canConvert = canAccess('sales.partner-order.convert', 'create')
  const canViewProductLookups = canAccess('products.list', 'view')
  const [editOpen, setEditOpen] = useState(false)
  const [collabEditMode, setCollabEditMode] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  /** Phase 2.6d: 재고조회 다중선택 라인 ID 집합. */
  const [checkedLineIds, setCheckedLineIds] = useState<Set<string>>(new Set())
  /** Phase 2.6d: 재고조회 모달 open 상태. */
  const [inventoryLookupOpen, setInventoryLookupOpen] = useState(false)
  const [lineLookupOpen, setLineLookupOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)
  const [printErrorMessage, setPrintErrorMessage] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [reloadSuccessMessage, setReloadSuccessMessage] = useState<string | null>(null)
  const [holdErrorMessage, setHoldErrorMessage] = useState<string | null>(null)
  const [convertErrorMessage, setConvertErrorMessage] = useState<string | null>(null)
  const [convertSuccessMessage, setConvertSuccessMessage] = useState<string | null>(null)
  /** 부분전환 모달: 라인별 전환 수량 (lineId → qty). */
  const [convertQtyMap, setConvertQtyMap] = useState<Record<string, number>>({})
  /** 부분전환 모달: 선택된 출고 창고 (필수, 기본값 없음). */
  const [convertWarehouse, setConvertWarehouse] = useState<Warehouse | null>(null)

  /** 출고 창고 후보 목록 — inventory 단일 출처. */
  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })
  const [partnerCode, setPartnerCode] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<EditLine[]>([])
  const reloadSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const convertSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    onSuccess: async () => {
      setConflictMessage(null)
      setReloadSuccessMessage(null)
      setEditOpen(false)
      // PUT 응답은 product-service enrich 필드(productType 등)가 빠질 수 있어 상세 GET 재조회로 보정한다.
      await queryClient.invalidateQueries({ queryKey: ['partner-order', id] })
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
   * 부분전환 — 선택 라인/수량을 출고전표로 전환한다 (Phase 2.6a).
   * canConvert 권한 게이트는 버튼 표시 조건으로 보호.
   * 성공 시 목록 + 상세 쿼리 무효화 + 성공 토스트.
   */
  const convertMutation = useMutation({
    mutationFn: (payload: { items: ConvertToSlipItem[]; warehouseCode: string }) =>
      convertPartnerOrderToSlip(orderId, payload),
    onSuccess: async (result) => {
      setConvertErrorMessage(null)
      setConvertOpen(false)
      setConvertQtyMap({})
      setConvertWarehouse(null)
      await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
      await queryClient.invalidateQueries({ queryKey: ['partner-order', id] })
      const msg = result.fullyConverted
        ? `판매전표 ${result.slipNo} 발행 — 전체 수량 전환 완료`
        : `판매전표 ${result.slipNo} 발행 — 잔여 수량이 남아 있습니다`
      setConvertSuccessMessage(msg)
      if (convertSuccessTimerRef.current) clearTimeout(convertSuccessTimerRef.current)
      convertSuccessTimerRef.current = setTimeout(() => {
        setConvertSuccessMessage(null)
        convertSuccessTimerRef.current = null
      }, 4000)
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 409) {
          // Phase 2.6c: 재고 부족 409 처리 — Designer guide §3.4 기준.
          // BE 가 insufficientLines 배열을 포함하면 FE 가 업무 문구 조합.
          // BE 가 message 문자열만 전달하면 현행 패턴 유지.
          const respData = error.response.data as Record<string, unknown> | undefined
          const lines = respData?.['insufficientLines']
          if (Array.isArray(lines) && lines.length > 0) {
            type InsufficientLine = {
              productName?: string
              modelCode?: string
              requestedQty?: number
              availableQty?: number
            }
            const typedLines = lines as InsufficientLine[]
            const first = typedLines[0]!
            const firstName = first.productName ?? ''
            const firstModel = first.modelCode ? ` (${first.modelCode})` : ''
            const firstReq = first.requestedQty ?? '?'
            const firstAvail = first.availableQty ?? 0
            const extraCount = typedLines.length - 1

            let msg: string
            if (typedLines.length === 1) {
              // 단일 품목 — Designer §3.2
              msg = firstAvail === 0
                ? `재고 부족으로 전환할 수 없습니다.\n${firstName}${firstModel} — 요청 ${firstReq}개 / 가용 0개\n수량을 줄이거나 담당자에게 재고 보충을 요청해 주세요.`
                : `재고 부족으로 전환할 수 없습니다.\n${firstName}${firstModel} — 요청 ${firstReq}개 / 가용 ${firstAvail}개\n전환수량을 ${firstAvail}개 이하로 조정하거나 나누어 전환해 주세요.`
            } else {
              // 복수 품목 — Designer §3.3
              msg = `재고 부족 품목이 있어 전환할 수 없습니다.\n${firstName}${firstModel} — 요청 ${firstReq}개 / 가용 ${firstAvail}개\n외 ${extraCount}건 재고 부족 — 품목별 수량을 조정해 주세요.`
            }
            setConvertErrorMessage(msg)
            return
          }
          // insufficientLines 없음 — message 문자열 또는 fallback
          const beMessage = respData?.['message'] as string | undefined
          if (beMessage) {
            setConvertErrorMessage(beMessage)
            return
          }
          setConvertErrorMessage('재고 부족으로 전환할 수 없습니다. 수량을 줄이거나 담당자에게 확인해 주세요.')
          return
        }
        if (error.response?.status === 403) {
          setConvertErrorMessage('판매전표 전환 권한이 없습니다. 관리자에게 문의해 주세요.')
          return
        }
      }
      setConvertErrorMessage('전환에 실패했습니다. 잠시 후 다시 시도해 주세요.')
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
        { responseType: 'blob' },
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
  }, [orderId])

  const openEditDialog = useCallback(() => {
    if (!query.data) return
    syncFormFromData(query.data)
    setEditOpen(true)
  }, [query.data, syncFormFromData])

  const openConvertDialog = useCallback(() => {
    if (!query.data) return
    setConvertErrorMessage(null)
    const initQty: Record<string, number> = {}
    for (const line of query.data.lines) {
      const remaining = line.quantity - (line.convertedQuantity ?? 0)
      if (remaining > 0) {
        initQty[line.lineId] = remaining
      }
    }
    setConvertQtyMap(initQty)
    setConvertWarehouse(null)
    setConvertOpen(true)
  }, [query.data])

  const openDeleteDialog = useCallback(() => {
    setDeleteErrorMessage(null)
    setDeleteOpen(true)
  }, [])

  const holdOrder = useCallback(() => {
    setHoldErrorMessage(null)
    holdMutation.mutate()
  }, [holdMutation])

  const releaseOrder = useCallback(() => {
    setHoldErrorMessage(null)
    releaseMutation.mutate()
  }, [releaseMutation])

  useEffect(() => {
    setPageTitle({ title: `주문서 ${query.data?.orderNumber ?? '조회 중'}`, meta: '영업' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle, query.data?.orderNumber])

  useEffect(() => {
    return () => {
      if (reloadSuccessTimerRef.current) {
        clearTimeout(reloadSuccessTimerRef.current)
      }
      if (convertSuccessTimerRef.current) {
        clearTimeout(convertSuccessTimerRef.current)
      }
    }
  }, [])

  // Phase 2.6d: 주문 id 변경 시 재고조회 체크 상태 초기화 (P1-1)
  useEffect(() => {
    setCheckedLineIds(new Set())
  }, [id])

  // Phase 2.6d: 재고조회 모달 lines — useMemo로 본문 최상위 계산 (P1-3 IIFE 제거)
  // Round C #23 세트 재고 가드(§2-1): BUNDLE 라인은 재고조회 대상 제외(SlipFormPage 동형).
  //   product-service enrich 로 BE 가 productType 을 전사 → FE 가 "BUNDLE" 라인을 걸러낸다.
  //   세트는 재고를 구성품 단위로 조회하므로 세트 단위 재고(0행/0수량)를 표시하지 않는다.

  /** 선택된 주문 라인 중 productId 가 있는 전체 라인 (BUNDLE 포함). productType 동반. */
  const selectedOrderLines = useMemo(
    () =>
      (query.data?.lines ?? []).filter(
        (l) => checkedLineIds.has(l.lineId) && !!l.productId,
      ),
    [query.data?.lines, checkedLineIds],
  )

  /** 재고조회 매트릭스 전달 라인 — BUNDLE 제외 후 modelCode→modelName 매핑(UUID 미노출). */
  const inventoryLookupLines = useMemo<StockBalanceLookupLine[]>(
    () =>
      selectedOrderLines
        .filter((l) => l.productType !== 'BUNDLE')
        .map((l) => ({
          productId: l.productId,
          // modelCode = modelName 매핑 (주문 라인 필드명 차이)
          modelName: l.modelCode,
          productName: l.productName,
        })),
    [selectedOrderLines],
  )

  /** 선택 라인이 전부 BUNDLE 인 경우 — 모달에 세트 전용 안내 표시(bundleOnlyLines). */
  const allSelectedAreBundle =
    selectedOrderLines.length > 0 &&
    selectedOrderLines.every((l) => l.productType === 'BUNDLE')

  /** 선택 라인 중 세트(BUNDLE) 건수 — 혼합 선택 시 제외 고지에 사용. */
  const selectedBundleCount = useMemo(
    () => selectedOrderLines.filter((l) => l.productType === 'BUNDLE').length,
    [selectedOrderLines],
  )

  const canCollabEdit =
    !!query.data &&
    canAccess('sales.partner-order.edit', 'update') &&
    !COLLAB_LOCKED_STATUS.has(query.data.status)

  const canOpenConvert =
    !!query.data &&
    canConvert &&
    query.data.linkedSlipNo == null &&
    CONVERTIBLE_STATUS.has(query.data.status)

  const canHoldOrder = !!query.data && canEdit && query.data.status === 'DRAFT'
  const canReleaseOrder = !!query.data && canEdit && query.data.status === 'ON_HOLD'

  const mobilePrimaryAction = query.data
    ? canReleaseOrder
      ? { label: '보류 해제', onClick: releaseOrder, disabled: releaseMutation.isPending }
      : canCollabEdit && !collabEditMode
        ? { label: '수정', onClick: () => setCollabEditMode(true), disabled: false }
        : canOpenConvert
          ? { label: '판매전표 전환', onClick: openConvertDialog, disabled: convertMutation.isPending }
          : null
    : null

  const collabCurrentValues = query.data
    ? {
        memo: query.data.memo,
        dueDate: query.data.dueDate,
        lines: query.data.lines.map((line, index) => ({
          // BE PartnerOrderDocumentCollaborationPort lineKey = order.getLines() 순회 1-based index.
          lineKey: index + 1,
          modelCode: line.modelCode,
          productName: line.productName,
          quantity: line.quantity,
          deliveryPrice: line.deliveryPrice,
          subtotal: line.subtotal,
          convertedQuantity: line.convertedQuantity ?? 0,
          remark: line.remark,
        })),
      }
    : null

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
          {!isMobile ? (
          <div className={`${styles['topActions']} detail-action-bar`}>
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
            {query.data && canCollabEdit && !collabEditMode ? (
              <Button
                type="button"
                variant="primary"
                data-testid="partner-order-collab-edit-open"
                onClick={() => setCollabEditMode(true)}
              >
                수정
              </Button>
            ) : null}
            {query.data && canEdit ? (
              <Button
                type="button"
                variant="secondary"
                data-testid="partner-order-edit-open"
                onClick={openEditDialog}
              >
                정식 편집
              </Button>
            ) : null}
            {query.data && canEdit && query.data.status === 'DRAFT' ? (
              <Button
                type="button"
                variant="warning"
                data-testid="partner-order-hold"
                disabled={holdMutation.isPending}
                onClick={holdOrder}
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
                onClick={releaseOrder}
              >
                보류 해제
              </Button>
            ) : null}
            {query.data &&
              canConvert &&
              query.data.linkedSlipNo == null &&
              CONVERTIBLE_STATUS.has(query.data.status) ? (
              <Button
                type="button"
                variant="primary"
                data-testid="partner-order-convert-open"
                disabled={convertMutation.isPending}
                onClick={openConvertDialog}
              >
                판매전표 전환
              </Button>
            ) : null}
            {query.data && canDelete ? (
              <Button
                type="button"
                variant="danger"
                data-testid="partner-order-delete-open"
                onClick={openDeleteDialog}
              >
                삭제
              </Button>
            ) : null}
            <Link to="/sales/partner-orders" className={`${styles['btnGhost']} ${styles['listBackLink']}`}>
              ← 목록
            </Link>
          </div>
          ) : null}
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
        {convertErrorMessage ? (
          <div className={styles['errorBanner']} role="alert" data-testid="partner-order-convert-error">
            {convertErrorMessage}
          </div>
        ) : null}
        {convertSuccessMessage ? (
          <div
            className={styles['successBanner']}
            role="status"
            data-testid="partner-order-convert-toast"
          >
            {convertSuccessMessage}
          </div>
        ) : null}

        {isMobile && query.data ? (
          <>
            <div className="mobile-summary-card" data-testid="partner-order-mobile-summary">
              <div className="mobile-summary-card-header">
                <span className="mobile-summary-doc-no">{query.data.orderNumber}</span>
                <span
                  className="mobile-status-badge"
                  style={statusBadgeStyle(query.data.status)}
                >
                  {PARTNER_ORDER_STATUS_LABEL[query.data.status]}
                </span>
              </div>
              <div className="mobile-summary-partner">
                {query.data.partnerName ?? query.data.partnerCode}
              </div>
              <div className="mobile-summary-divider" />
              <div className="mobile-summary-total-row">
                <span className="mobile-summary-total-amount">
                  {krw(query.data.totalAmount)}원
                </span>
                <span className="mobile-summary-date">
                  납기 {query.data.dueDate ?? '-'}
                </span>
              </div>
            </div>

            <div className="mobile-action-bar" role="toolbar" aria-label="주문서 액션">
              {mobilePrimaryAction ? (
                <button
                  type="button"
                  className="mobile-action-primary"
                  disabled={mobilePrimaryAction.disabled}
                  onClick={mobilePrimaryAction.onClick}
                >
                  {mobilePrimaryAction.label}
                </button>
              ) : null}
              {canPrint ? (
                <button
                  type="button"
                  className="mobile-action-icon"
                  aria-label="인쇄"
                  onClick={handlePrint}
                >
                  인쇄
                </button>
              ) : null}
              <button
                type="button"
                className="mobile-action-icon"
                aria-label="더보기"
                onClick={() => setMoreOpen(true)}
              >
                ···
              </button>
              <MobileActionSheet open={moreOpen} onClose={() => setMoreOpen(false)}>
                    {canCollabEdit && !collabEditMode && mobilePrimaryAction?.label !== '수정' ? (
                      <button
                        type="button"
                        className="mobile-more-sheet-item"
                        onClick={() => {
                          setMoreOpen(false)
                          setCollabEditMode(true)
                        }}
                      >
                        수정
                      </button>
                    ) : null}
                    {canEdit ? (
                      <button
                        type="button"
                        className="mobile-more-sheet-item"
                        onClick={() => {
                          setMoreOpen(false)
                          openEditDialog()
                        }}
                      >
                        정식 편집
                      </button>
                    ) : null}
                    {canHoldOrder ? (
                      <button
                        type="button"
                        className="mobile-more-sheet-item"
                        disabled={holdMutation.isPending}
                        onClick={() => {
                          setMoreOpen(false)
                          holdOrder()
                        }}
                      >
                        보류
                      </button>
                    ) : null}
                    {canReleaseOrder && mobilePrimaryAction?.label !== '보류 해제' ? (
                      <button
                        type="button"
                        className="mobile-more-sheet-item"
                        disabled={releaseMutation.isPending}
                        onClick={() => {
                          setMoreOpen(false)
                          releaseOrder()
                        }}
                      >
                        보류 해제
                      </button>
                    ) : null}
                    {canOpenConvert && mobilePrimaryAction?.label !== '판매전표 전환' ? (
                      <button
                        type="button"
                        className="mobile-more-sheet-item"
                        disabled={convertMutation.isPending}
                        onClick={() => {
                          setMoreOpen(false)
                          openConvertDialog()
                        }}
                      >
                        판매전표 전환
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="mobile-more-sheet-item danger"
                        onClick={() => {
                          setMoreOpen(false)
                          openDeleteDialog()
                        }}
                      >
                        삭제
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      onClick={() => {
                        setMoreOpen(false)
                        navigate('/sales/partner-orders')
                      }}
                    >
                      목록으로
                    </button>
              </MobileActionSheet>
            </div>
          </>
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
            {isMobile ? (
              <MobileCollapsible
                title="주문 상세 정보"
                className="mobile-section-card"
              >
                {[
                  { label: '거래처 코드', value: query.data.partnerCode },
                  { label: '연결 전표', value: query.data.linkedSlipNo },
                  { label: '배송지', value: query.data.deliveryAddress },
                  { label: '현장', value: query.data.siteAddress },
                  { label: '연락처', value: query.data.contactPhone },
                  { label: '납기', value: query.data.dueDate },
                  { label: '요청사항', value: query.data.memo },
                ].map(({ label, value }) => {
                  const displayValue = emptyLabel(value)
                  return (
                    <div key={label} className="mobile-field-row">
                      <span className="mobile-field-label">{label}</span>
                      <span
                        className={`mobile-field-value${displayValue === '-' ? ' mobile-field-value-empty' : ''}`}
                      >
                        {displayValue}
                      </span>
                    </div>
                  )
                })}
              </MobileCollapsible>
            ) : null}

            {!isMobile ? (
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
            ) : null}

            <div className={`${styles['card']} ${styles['cardMarginTop']}`}>
              <div className={`${styles['cardHead']} detail-mobile-hide`}>
                <div className={styles['cardTitle']}>
                  라인 ({query.data.lines?.length ?? 0}건)
                </div>
                {/* Phase 2.6d: 선택 품목 재고조회 버튼 */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={checkedLineIds.size === 0}
                    data-testid="partner-order-inventory-lookup-btn"
                    onClick={() => setInventoryLookupOpen(true)}
                    title={
                      checkedLineIds.size === 0
                        ? '라인을 1개 이상 선택하세요'
                        : `선택 ${checkedLineIds.size}건 재고조회`
                    }
                  >
                    선택 품목 재고조회
                    {checkedLineIds.size > 0 ? ` (${checkedLineIds.size})` : ''}
                  </Button>
                  {canViewProductLookups ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid="partner-order-line-lookup-btn"
                      onClick={() => setLineLookupOpen(true)}
                    >
                      참조 조회
                    </Button>
                  ) : null}
                  {checkedLineIds.size > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCheckedLineIds(new Set())}
                    >
                      선택 해제
                    </Button>
                  )}
                </div>
              </div>
              <div className={`${styles['tableWrap']} detail-mobile-hide`}>
                <table className={styles['estTable']}>
                  <thead>
                    {/* v2 §정정 4/5 — '품명'→'품목명', '모델 코드'→'모델명' */}
                    <tr>
                      {/* Phase 2.6d: 재고조회 체크박스 컬럼 */}
                      <th style={{ width: 28, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          aria-label="전체 선택"
                          checked={
                            (query.data.lines?.length ?? 0) > 0 &&
                            (query.data.lines ?? []).every((l) =>
                              checkedLineIds.has(l.lineId),
                            )
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCheckedLineIds(
                                new Set((query.data.lines ?? []).map((l) => l.lineId)),
                              )
                            } else {
                              setCheckedLineIds(new Set())
                            }
                          }}
                        />
                      </th>
                      <th>품목명</th>
                      <th>모델명</th>
                      <th>수량</th>
                      <th>납품가</th>
                      <th>소계</th>
                      <th>전환됨</th>
                      <th>잔여</th>
                      <th>묶음 처리</th>
                      <th>구성품 펼침</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(query.data.lines ?? []).map((line, index) => {
                      const converted = line.convertedQuantity ?? 0
                      const remaining = line.quantity - converted
                      const checked = checkedLineIds.has(line.lineId)
                      return (
                        <tr key={`${line.lineId}-${index}`}>
                          {/* Phase 2.6d: 재고조회 체크박스 */}
                          <td style={{ textAlign: 'center', paddingLeft: 4 }}>
                            <input
                              type="checkbox"
                              aria-label={`${line.modelCode} 재고조회 선택`}
                              checked={checked}
                              onChange={() => {
                                setCheckedLineIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(line.lineId)) {
                                    next.delete(line.lineId)
                                  } else {
                                    next.add(line.lineId)
                                  }
                                  return next
                                })
                              }}
                            />
                          </td>
                          <td className={styles['tdLeft']}>{line.productName}</td>
                          <td>{line.modelCode}</td>
                          <td className={styles['numericCol']}>{line.quantity}</td>
                          <td className={styles['numericCol']}>{krw(line.deliveryPrice)}</td>
                          <td className={styles['numericCol']}>{krw(line.subtotal)}</td>
                          <td className={styles['numericCol']}>
                            {converted > 0 ? (
                              <span className={styles['convertedQtyBadge']}>{converted}</span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className={styles['numericCol']}>
                            {converted > 0 ? remaining : '-'}
                          </td>
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
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mobile-action-bar" role="toolbar" aria-label="주문 라인 액션">
                <button
                  type="button"
                  className="mobile-action-primary"
                  disabled={checkedLineIds.size === 0}
                  data-testid="partner-order-inventory-lookup-btn"
                  onClick={() => setInventoryLookupOpen(true)}
                >
                  재고조회{checkedLineIds.size > 0 ? ` (${checkedLineIds.size})` : ''}
                </button>
                {checkedLineIds.size > 0 ? (
                  <button
                    type="button"
                    className="mobile-action-icon"
                    aria-label="선택 해제"
                    onClick={() => setCheckedLineIds(new Set())}
                  >
                    해제
                  </button>
                ) : null}
                {canViewProductLookups ? (
                  <button
                    type="button"
                    className="mobile-action-icon"
                    aria-label="참조 조회"
                    onClick={() => setLineLookupOpen(true)}
                  >
                    참조
                  </button>
                ) : null}
              </div>
              <div className="mobile-item-list" data-testid="partner-order-mobile-lines">
                {(query.data.lines ?? []).map((line, index) => {
                  const converted = line.convertedQuantity ?? 0
                  const remaining = line.quantity - converted
                  const checked = checkedLineIds.has(line.lineId)
                  const componentCount = line.expandedComponents.length
                  return (
                    <div
                      key={`mobile-${line.lineId}-${index}`}
                      className="mobile-item-card"
                    >
                      <div className="mobile-item-check-wrap">
                        <input
                          type="checkbox"
                          className="mobile-item-check"
                          aria-label={`${line.productName} 재고조회 선택`}
                          checked={checked}
                          onChange={() => {
                            setCheckedLineIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(line.lineId)) {
                                next.delete(line.lineId)
                              } else {
                                next.add(line.lineId)
                              }
                              return next
                            })
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="mobile-item-card-header">
                            <div className="mobile-item-name">{line.productName}</div>
                            {bundleModeLabel(line.bundleMode) ? (
                              <span className="mobile-item-chip">
                                {bundleModeLabel(line.bundleMode)}
                              </span>
                            ) : null}
                          </div>
                          {line.modelCode ? (
                            <div className="mobile-item-model">{line.modelCode}</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mobile-item-divider" />

                      <div className="mobile-item-metrics">
                        <div className="mobile-item-metric">
                          <span className="mobile-item-metric-label">수량</span>
                          <span className="mobile-item-metric-value">
                            {line.quantity.toLocaleString()}
                          </span>
                        </div>
                        <div className="mobile-item-metric">
                          <span className="mobile-item-metric-label">납품가</span>
                          <span className="mobile-item-metric-value">
                            {krw(line.deliveryPrice)}
                          </span>
                        </div>
                      </div>

                      <div className="mobile-item-total-row">
                        <span className="mobile-item-total-label">소계</span>
                        <span className="mobile-item-total-value">
                          {krw(line.subtotal)}원
                        </span>
                      </div>

                      {(converted > 0 || componentCount > 0) ? (
                        <div className="mobile-item-chips">
                          {converted > 0 ? (
                            <span className="mobile-item-chip mobile-item-chip-converted">
                              전환됨 {converted}개
                            </span>
                          ) : null}
                          {converted > 0 && remaining > 0 ? (
                            <span className="mobile-item-chip mobile-item-chip-remaining">
                              잔여 {remaining}개
                            </span>
                          ) : null}
                          {componentCount > 0 ? (
                            <span className="mobile-item-chip">
                              구성품 {componentCount}개
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>

            {isMobile ? (
              <>
                <MobileCollapsible title="버전 이력" className="mobile-section-card">
                  <PartnerOrderVersionHistoryPanel
                    orderId={orderId}
                    status={query.data.status}
                  />
                </MobileCollapsible>

                {collabCurrentValues ? (
                  <MobileCollapsible
                    title="협업 · 코멘트"
                    defaultOpen
                    className="mobile-section-card"
                  >
                    <PartnerOrderCollaborationPanel
                      orderId={orderId}
                      currentValues={collabCurrentValues}
                      editMode={collabEditMode}
                      onEditModeChange={setCollabEditMode}
                      onCommitted={() => {
                        void queryClient.invalidateQueries({ queryKey: ['partner-order', id] })
                        void queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
                        void queryClient.invalidateQueries({ queryKey: ['partner-order', id, 'audit-logs'] })
                      }}
                    />
                  </MobileCollapsible>
                ) : null}

                <MobileCollapsible title="수정 이력" className="mobile-section-card">
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
                </MobileCollapsible>
              </>
            ) : (
              <>
                <PartnerOrderVersionHistoryPanel
                  orderId={orderId}
                  status={query.data.status}
                />

                {collabCurrentValues ? (
                  <PartnerOrderCollaborationPanel
                    orderId={orderId}
                    currentValues={collabCurrentValues}
                    editMode={collabEditMode}
                    onEditModeChange={setCollabEditMode}
                    onCommitted={() => {
                      void queryClient.invalidateQueries({ queryKey: ['partner-order', id] })
                      void queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
                      void queryClient.invalidateQueries({ queryKey: ['partner-order', id, 'audit-logs'] })
                    }}
                  />
                ) : null}

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
            )}
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
                      <option value="singleSets">싱글중대형</option>
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
      {/* 출고전표 전환 모달 (Phase 2.6a) */}
      <Modal
        open={convertOpen}
        onClose={() => {
          if (!convertMutation.isPending) {
            setConvertOpen(false)
            setConvertErrorMessage(null)
            setConvertWarehouse(null)
          }
        }}
        title="판매전표 전환"
        size="lg"
        closeOnBackdropClick={!convertMutation.isPending}
        closeOnEsc={!convertMutation.isPending}
        data-testid="partner-order-convert-modal"
        footer={(
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={convertMutation.isPending}
              onClick={() => {
                setConvertOpen(false)
                setConvertErrorMessage(null)
                setConvertWarehouse(null)
              }}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="primary"
              data-testid="partner-order-convert-submit"
              disabled={
                convertMutation.isPending ||
                !query.data ||
                !convertWarehouse ||
                Object.values(convertQtyMap).every((q) => q <= 0)
              }
              onClick={() => {
                if (!query.data || !convertWarehouse) return
                const items = query.data.lines
                  .filter((line) => {
                    const remaining = line.quantity - line.convertedQuantity
                    const qty = convertQtyMap[line.lineId] ?? 0
                    return remaining > 0 && qty > 0
                  })
                  .map((line) => ({
                    orderLineId: line.lineId,
                    quantity: convertQtyMap[line.lineId]!,
                  }))
                if (items.length === 0) return
                setConvertErrorMessage(null)
                convertMutation.mutate({ items, warehouseCode: convertWarehouse.code })
              }}
            >
              {convertMutation.isPending ? '전환 중…' : '판매전표로 전환'}
            </Button>
          </>
        )}
      >
        <div data-testid="partner-order-convert-modal-body">
          {convertErrorMessage ? (
            <div
              className={styles['errorBanner']}
              role="alert"
              data-testid="partner-order-convert-modal-error"
              style={{ whiteSpace: 'pre-line', alignItems: 'flex-start' }}
            >
              {convertErrorMessage}
            </div>
          ) : null}
          {/* 비가역 경고 — 출고전표 발행 후 취소 불가 */}
          <div className={styles['convertWarningBanner']} role="note">
            <strong>주의:</strong> 전환 시 판매전표가 즉시 발행됩니다. 이 작업은 되돌릴 수 없습니다.
            {(() => {
              const convertibleLines = (query.data?.lines ?? []).filter(
                (l) => (l.quantity - (l.convertedQuantity ?? 0)) > 0,
              )
              const selectedItems = convertibleLines.filter(
                (l) => (convertQtyMap[l.lineId] ?? 0) > 0,
              )
              return selectedItems.length > 0
                ? ` (${selectedItems.length}개 품목 전환 예정)`
                : null
            })()}
          </div>
          {/* 슬라이스 C — 출고 창고 필수 선택 (inventory 단일 출처). 미선택 시 전환 불가. */}
          {(() => {
            const hasConvertQty = Object.values(convertQtyMap).some((q) => q > 0)
            const convertWarehouseError = warehousesQuery.isError
              ? '창고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
              : (!convertWarehouse && hasConvertQty ? '출고 창고를 선택하세요.' : undefined)
            return (
              <div data-testid="partner-order-convert-warehouse" style={{ marginBottom: 'var(--space-3)' }}>
                <WarehouseAutocomplete
                  warehouses={warehousesQuery.data ?? []}
                  value={convertWarehouse?.id ?? null}
                  onChange={(_id, warehouse) => setConvertWarehouse(warehouse)}
                  label="출고 창고"
                  placeholder={warehousesQuery.isLoading ? '창고 목록 불러오는 중…' : '창고 코드 또는 이름 입력…'}
                  hideVirtual
                  required
                  disabled={convertMutation.isPending || warehousesQuery.isLoading}
                  error={convertWarehouseError}
                />
              </div>
            )
          })()}
          <div className={styles['tableWrap']}>
            <table className={styles['estTable']}>
              <thead>
                <tr>
                  <th>품목명</th>
                  <th>모델명</th>
                  <th className={styles['numericTh']}>주문수량</th>
                  <th className={styles['numericTh']}>전환됨</th>
                  <th className={styles['numericTh']}>잔여</th>
                  <th className={`${styles['numericTh']} ${styles['convertQtyTh']}`}>전환수량</th>
                </tr>
              </thead>
              <tbody>
                {(query.data?.lines ?? []).map((line, index) => {
                  const remaining = line.quantity - (line.convertedQuantity ?? 0)
                  const currentQty = convertQtyMap[line.lineId] ?? 0
                  const disabled = remaining <= 0
                  return (
                    <tr
                      key={line.lineId}
                      className={disabled ? styles['convertLineDisabled'] : undefined}
                    >
                      <td className={styles['tdLeft']}>
                        {line.productName}
                        {disabled ? (
                          <span className={styles['convertedLabel']}> 전환완료</span>
                        ) : null}
                      </td>
                      <td>{line.modelCode}</td>
                      <td className={styles['numericCol']}>{line.quantity}</td>
                      <td className={styles['numericCol']}>{line.convertedQuantity ?? 0}</td>
                      <td className={styles['numericCol']}>{remaining}</td>
                      <td>
                        <Input
                          aria-label={`${line.productName} 전환수량`}
                          type="number"
                          min={0}
                          max={remaining}
                          value={disabled ? 0 : currentQty}
                          disabled={disabled}
                          data-testid={`partner-order-convert-qty-${index}`}
                          onChange={(e) => {
                            const raw = Number(e.target.value)
                            const clamped = Math.max(0, Math.min(remaining, raw))
                            setConvertQtyMap((prev) => ({
                              ...prev,
                              [line.lineId]: clamped,
                            }))
                          }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Phase 2.6d: 재고조회 모달 */}
      {/* Round C #23 세트 재고 가드: BUNDLE 라인 제외 후 전달, 전부 세트면 bundleOnlyLines=true,
          혼합이면 excludedBundleCount 로 "세트 N건 제외" 안내 (SlipFormPage 동형) */}
      <InventoryLookupModal
        open={inventoryLookupOpen}
        onClose={() => setInventoryLookupOpen(false)}
        lines={inventoryLookupLines}
        bundleOnlyLines={allSelectedAreBundle}
        excludedBundleCount={allSelectedAreBundle ? 0 : selectedBundleCount}
      />
      <LineLookupReferenceModal
        open={lineLookupOpen}
        onClose={() => setLineLookupOpen(false)}
      />
    </div>
  )

  function updateLine(index: number, patch: Partial<EditLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }
}
