/**
 * partner-order-service (M4) endpoint client.
 *
 * <p>Migration Plan §2.4.7 endpoint:
 * <pre>
 *   GET   /api/v1/partner-orders?bizno
 *   GET   /api/v1/partner-orders/{id}
 *   POST  /api/v1/partner-orders         body: { lines, info } → DRAFT
 *   POST  /api/v1/partner-orders/{id}/confirm
 *   POST  /api/v1/partner-orders/drafts  임시저장 (saveOrderSnapshot 대체)
 * </pre>
 *
 * <p>현 단계 partner-order-service 미존재 → 모든 호출 mock fallback.
 */
import axios from 'axios'
import { apiClient } from './client'
import type { OrderInfo, OrderLine, PartnerOrderDetail, PartnerOrderSummary } from '../types'

const STORAGE_KEY = 'samhan.order.history.mock'

interface ListParams {
  bizno: string
  startDate?: string
  endDate?: string
  search?: string
}

/**
 * 거래처 주문 이력 조회.
 *
 * @returns 주문 list (legacy `#pageHistory` Notion ORDER DB 조회 1:1).
 */
export async function listPartnerOrders(params: ListParams): Promise<PartnerOrderSummary[]> {
  try {
    const res = await apiClient.get<{ content: PartnerOrderSummary[] }>('/api/v1/partner-orders', { params })
    return res.data.content
  } catch (err) {
    if (axios.isAxiosError(err) && (err.response === undefined || err.response.status === 404)) {
      return readMockOrders().filter((o) => !params.bizno || o.bizno === params.bizno)
    }
    throw err
  }
}

/** 단일 주문 상세 조회. */
export async function getPartnerOrder(orderNo: string): Promise<PartnerOrderDetail> {
  try {
    const res = await apiClient.get<PartnerOrderDetail>(`/api/v1/partner-orders/${encodeURIComponent(orderNo)}`)
    return res.data
  } catch (err) {
    if (axios.isAxiosError(err) && (err.response === undefined || err.response.status === 404)) {
      const stored = readMockOrders().find((o) => o.orderNo === orderNo)
      if (!stored) throw new Error(`주문번호 ${orderNo} 를 찾을 수 없습니다.`)
      return {
        ...stored,
        lines: [],
        info: { deliveryAddress: '', receiver: '', receiverPhone: '', dueDate: stored.dueDate },
      }
    }
    throw err
  }
}

/** 신규 주문 생성 (DRAFT). 발송 전 단계 — 거래처 입력 진행 중. */
export async function createOrderDraft(input: {
  bizno: string
  partnerName: string
  lines: OrderLine[]
  info: OrderInfo
}): Promise<PartnerOrderSummary> {
  try {
    const res = await apiClient.post<PartnerOrderSummary>('/api/v1/partner-orders', input)
    return res.data
  } catch (err) {
    if (axios.isAxiosError(err) && (err.response === undefined || err.response.status === 404)) {
      // mock — sessionStorage 에 누적
      const stored = readMockOrders()
      const orderNo = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(stored.length + 1).padStart(4, '0')}`
      const total = input.lines.reduce((s, l) => s + l.qty * l.deliveryPrice, 0)
      const summary: PartnerOrderSummary = {
        orderNo,
        bizno: input.bizno,
        partnerName: input.partnerName,
        status: 'DRAFT',
        totalAmount: total,
        orderedAt: new Date().toISOString(),
        dueDate: input.info.dueDate,
        lineCount: input.lines.length,
      }
      writeMockOrders([summary, ...stored])
      return summary
    }
    throw err
  }
}

/** DRAFT → CONFIRMED 발송. */
export async function confirmOrder(orderNo: string): Promise<PartnerOrderSummary> {
  try {
    const res = await apiClient.post<PartnerOrderSummary>(
      `/api/v1/partner-orders/${encodeURIComponent(orderNo)}/confirm`,
    )
    return res.data
  } catch (err) {
    if (axios.isAxiosError(err) && (err.response === undefined || err.response.status === 404)) {
      const stored = readMockOrders()
      const found = stored.find((o) => o.orderNo === orderNo)
      if (!found) throw new Error(`주문 ${orderNo} 을 찾을 수 없습니다.`)
      found.status = 'CONFIRMED'
      writeMockOrders(stored)
      return found
    }
    throw err
  }
}

/* ---------- mock storage helpers ---------- */
function readMockOrders(): PartnerOrderSummary[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PartnerOrderSummary[]) : []
  } catch {
    return []
  }
}

function writeMockOrders(rows: PartnerOrderSummary[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    /* ignore */
  }
}
