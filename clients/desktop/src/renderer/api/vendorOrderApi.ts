/**
 * vendor 발주서 OCR + confirm API 클라이언트 (PR-F2 Phase B FE).
 *
 * <p>BE ({@code partner-order-service} commit 9874aa9 — vendor.ocr 패키지) 의
 * admin endpoint 2개에 대한 wrapper.
 *
 * <h2>endpoint</h2>
 * <ul>
 *   <li>POST {@code /api/v1/admin/partner-order/vendor/upload} (multipart) —
 *       OCR + parser + 단가 lookup + DC 적용 → preview {@link VendorOrderUploadResponse}</li>
 *   <li>POST {@code /api/v1/admin/partner-order/vendor/confirm} (json) —
 *       사용자 검토/수정한 라인 → 신규 PartnerOrder 발급 {@link VendorOrderConfirmResponse}</li>
 * </ul>
 *
 * <h2>접근 제어</h2>
 * <p>BE endpoint 자체가 MASTER / MANAGER role 만 허용
 * ({@code @PreAuthorize("hasAnyRole('MASTER','MANAGER')")}). FE 라우트도 영업 그룹
 * (SALES / MANAGER / MASTER) 가드를 routes/index.tsx 에서 적용.
 *
 * <h2>UUID 비공개</h2>
 * <p>응답에 productId / partnerId 노출 X. 사용자 식별자 (vendorName / partnerCode /
 * modelCode / productName / orderNo) 만 노출.
 *
 * <h2>OCR 비활성 fallback</h2>
 * <p>BE 가 503 SERVICE_UNAVAILABLE 응답 시 ({@code samhan.partner-order.ocr.enabled=false} 또는
 * Tesseract 미설치) {@link OcrDisabledError} 로 변환되어 호출자가 사용자 친화 메시지로
 * 처리할 수 있도록 한다.
 */
import axios from 'axios'
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// vendor 식별자 — BE parser VENDOR_NAME 과 1:1
// ---------------------------------------------------------------------------

/** vendor 식별자 (BE {@code AirDesignerOrderParser.VENDOR_NAME} / {@code JSystemOrderParser.VENDOR_NAME}). */
export type VendorName = '에어디자이너' | '제이시스템'

// ---------------------------------------------------------------------------
// upload 응답
// ---------------------------------------------------------------------------

/** 단가 source — CATALOG (시트 lookup) / OCR (OCR 단가) / MANUAL (단가 누락). */
export type PreviewLineSource = 'CATALOG' | 'OCR' | 'MANUAL'

/**
 * BE {@code VendorOrderUploadResponse.PreviewLine} 와 1:1.
 *
 * <p>{@code unitPrice} / {@code dcRate} / {@code finalPrice} / {@code subtotal} 은
 * BE {@code BigDecimal} → JSON 으로 number 직렬화 (Jackson 기본).
 */
export interface VendorPreviewLine {
  /** 사용자 표시 제품명. */
  productName: string
  /** 모델코드 (시트 lookup key + 사용자 식별자). */
  modelCode: string
  /** 수량. */
  quantity: number
  /** 단가 (시트 lookup 우선, 없으면 OCR 단가). */
  unitPrice: number
  /** DC 적용율 (0.0~1.0). 0 = DC 미적용. */
  dcRate: number
  /** 단가 * (1 - dcRate) — 최종 적용 단가. */
  finalPrice: number
  /** finalPrice * quantity. */
  subtotal: number
  /** 단가 source. */
  source: PreviewLineSource
}

/**
 * BE {@code VendorOrderUploadResponse} 와 1:1.
 */
export interface VendorOrderUploadResponse {
  /** 인식된 vendor (또는 사용자 명시). */
  vendorName: string
  /** 거래처 코드 (parser 인식 또는 사용자 명시 — null 가능). */
  partnerCode: string | null
  /** 추출된 raw text (admin 검증용 — 길면 잘림). */
  ocrText: string
  /** 파싱된 라인 + 단가 + DC 적용. */
  parsedLines: VendorPreviewLine[]
  /** 라인 합산 (DC 적용 후). */
  totalAmount: number
  /** OCR 에서 직접 추출한 총액 (cross-check 용 — null 가능). */
  parsedTotal: number | null
  /** 사용자에게 제공할 안내 (예: "단가 누락 라인 N건"). */
  suggestions: string[]
}

// ---------------------------------------------------------------------------
// confirm 요청 / 응답
// ---------------------------------------------------------------------------

/**
 * BE {@code VendorOrderConfirmRequest.ConfirmLine} 와 1:1.
 *
 * <p>upload 응답의 {@link VendorPreviewLine} 을 사용자가 검토/수정한 결과.
 */
export interface VendorConfirmLine {
  /** 모델코드 (필수). */
  modelCode: string
  /** 표시명. */
  productName: string
  /** 수량 (>=1). */
  quantity: number
  /** 최종 단가 (DC 적용 후, 필수). */
  finalPrice: number
}

/**
 * BE {@code VendorOrderConfirmResponse} 와 1:1.
 */
export interface VendorOrderConfirmResponse {
  /** 신규 PartnerOrder 의 사용자 표시 주문번호 (예: "2026/05/10-1"). */
  orderNo: string
  /** 확정 vendor. */
  vendorName: string
  /** 확정 거래처. */
  partnerCode: string
  /** 합계. */
  totalAmount: number
  /** 처리 상태 (예: "REGISTERED"). */
  status: string
}

// ---------------------------------------------------------------------------
// 에러 — OCR 비활성 (503) graceful fallback
// ---------------------------------------------------------------------------

/**
 * OCR 기능이 비활성화 (BE 503) — 사용자 친화 메시지 표시 가드.
 *
 * <p>발생 조건: BE {@code samhan.partner-order.ocr.enabled=false} 또는 Tesseract 미설치.
 */
export class OcrDisabledError extends Error {
  constructor(message?: string) {
    super(message ?? 'OCR 기능이 비활성화되어 있습니다. 관리자에게 활성화 요청하세요.')
    this.name = 'OcrDisabledError'
  }
}

// ---------------------------------------------------------------------------
// API 호출
// ---------------------------------------------------------------------------

/**
 * vendor 발주서 업로드 → OCR + parser + 단가 lookup + DC 적용 미리보기.
 *
 * @param vendor 사용자 명시 vendor (BE parser auto-detect 보조)
 * @param file 발주서 파일 (PDF / PNG / JPG, 10MB 이하 권장)
 * @param partnerCode 사용자 명시 거래처 (옵션 — parser 인식 시도)
 * @return preview 응답 (사용자 검토 후 confirm 호출)
 * @throws OcrDisabledError BE 503 응답 시 (OCR 비활성)
 */
export async function uploadVendorOrder(
  vendor: VendorName,
  file: File,
  partnerCode?: string,
): Promise<VendorOrderUploadResponse> {
  const form = new FormData()
  form.append('file', file)
  // BE @RequestParam — multipart form field 로 전달.
  form.append('vendor', vendor)
  if (partnerCode && partnerCode.trim().length > 0) {
    form.append('partnerCode', partnerCode)
  }
  try {
    const res = await apiClient.post<ApiEnvelope<VendorOrderUploadResponse>>(
      '/api/v1/admin/partner-order/vendor/upload',
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        // OCR 처리는 ms 가 아닌 초 단위 — apiClient 기본 10s 보다 여유.
        timeout: 60_000,
      },
    )
    return res.data.data
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 503) {
      const data = err.response.data as { message?: string } | undefined
      throw new OcrDisabledError(data?.message)
    }
    throw err
  }
}

/**
 * preview 라인을 사용자가 검토/수정 후 confirm — 신규 vendor 발주 등록.
 *
 * @param vendorName 확정 vendor (필수)
 * @param partnerCode 확정 거래처 코드 (필수)
 * @param lines 확정 라인 (수정/삭제 후, 비어있을 수 없음)
 * @return 신규 PartnerOrder orderNo + 합계 + 상태
 */
export async function confirmVendorOrder(
  vendorName: string,
  partnerCode: string,
  lines: VendorConfirmLine[],
): Promise<VendorOrderConfirmResponse> {
  const res = await apiClient.post<ApiEnvelope<VendorOrderConfirmResponse>>(
    '/api/v1/admin/partner-order/vendor/confirm',
    {
      vendorName,
      partnerCode,
      lines,
    },
  )
  return res.data.data
}
