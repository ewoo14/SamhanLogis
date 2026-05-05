/**
 * partner-order-service (M4) endpoint wrapper.
 *
 * 출처: migration/analysis/04-migration-plan.md §2.4 (M4)
 *
 * UUID 미노출 원칙 (`feedback_uuid_no_user_visibility.md`):
 *   - 화면에는 orderNumber, partnerCode, modelCode 만 노출
 *   - id (UUID) 는 navigation params 에 한해 내부 전달
 */

import { api } from './client';

/** 주문 status — backend enum 과 1:1 (§2.4.1) */
export type PartnerOrderStatus = 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED';

/** 주문 라인 (PartnerOrderLine + productSpecs[] §2.4.2 Phase 4.5 보강) */
export interface PartnerOrderLine {
  id: string;
  /** 라인 표시 순서 (1-base) */
  lineNo: number;
  modelCode: string;
  modelName: string;
  qty: number;
  unitPrice: number;
  amount: number;
  /** 부속품/장비 spec — displayOrder 순 */
  productSpecs?: Array<{ specKey: string; specValue: string; unit?: string }>;
}

/** 주문 master (§2.4.1) */
export interface PartnerOrderMaster {
  id: string;
  orderNumber: string; // PO-YYYYMMDD-NNNN
  partnerCode: string; // 사업자번호 (UUID 대체)
  partnerName: string;
  orderDate: string; // ISO date
  dueDate?: string;
  status: PartnerOrderStatus;
  totalAmount: number;
  shippingAddress?: string;
  receiverPhone?: string;
  memo?: string;
  externalSlipNo?: string;
  lines: PartnerOrderLine[];
}

/**
 * 주문 목록 조회 (거래처 본인 주문만 — 인증 토큰 partnerId 기반).
 *
 * @param status 필터 (생략 시 전체)
 */
export async function fetchPartnerOrders(status?: PartnerOrderStatus): Promise<PartnerOrderMaster[]> {
  const { data } = await api.get<PartnerOrderMaster[]>('/api/v1/partner-orders', {
    params: status ? { status } : undefined,
  });
  return data;
}

/** 주문 상세 조회 */
export async function fetchPartnerOrderDetail(orderId: string): Promise<PartnerOrderMaster> {
  const { data } = await api.get<PartnerOrderMaster>(`/api/v1/partner-orders/${orderId}`);
  return data;
}

/** 주문 작성 요청 body */
export interface CreatePartnerOrderRequest {
  orderDate: string;
  dueDate?: string;
  shippingAddress?: string;
  receiverPhone?: string;
  memo?: string;
  lines: Array<{ modelCode: string; qty: number; unitPrice: number }>;
}

/** 주문 작성 (DRAFT → SUBMITTED) */
export async function createPartnerOrder(req: CreatePartnerOrderRequest): Promise<PartnerOrderMaster> {
  const { data } = await api.post<PartnerOrderMaster>('/api/v1/partner-orders', req);
  return data;
}

/** 임시저장 (PartnerOrderDraft, §2.4.3) */
export async function savePartnerOrderDraft(formJson: unknown): Promise<{ id: string }> {
  const { data } = await api.post<{ id: string }>('/api/v1/partner-orders/drafts', { formJson });
  return data;
}
