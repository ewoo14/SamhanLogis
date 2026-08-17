/**
 * 전표 도메인 API 클라이언트 (출고 / 입고).
 *
 * 노출 endpoint:
 * - `GET    /slips`                — Page<SlipSummary> 페이지 조회 (slipType / status 필터)
 * - `GET    /slips/{id}`           — 라인 포함 상세 (`SlipDetail`)
 * - `POST   /slips`                — 신규 전표 생성 (DRAFT)
 * - `GET    /slips/lookup-product` — 모델명 → product 요약 (onBlur lookup)
 * - `POST   /slips/{id}/{action}`  — 라이프사이클 transition (save/send/accept/...)
 *
 * UUID 비공개 가드: 응답 객체의 `id`/`partnerId`/`sourceWarehouseId` 등 UUID
 * 필드는 axios body 안 / URL path param 으로만 사용한다. 화면 표시 영역에는
 * 절대 노출하지 않는다 (`feedback_uuid_no_user_visibility.md`).
 */
import {
  apiClient,
  type ApiEnvelope,
  type PageResponse,
} from './client'
import { withLineIdContract } from './lineIdContract'
import type { SlipStatus } from '@samhan/design-system'
import type { DeliveryTagCode } from '@samhan/design-system'
import { isSinglePanelOption } from '../utils/bundleOptionDomain'
import { searchSlips } from './slipSearch'

/** 본 슬라이스 범위 — 출고/입고 2종. */
export type SlipType = 'OUTBOUND' | 'INBOUND'

/** 전표 발행 출처 — 취소 가능 여부처럼 subtype별 lifecycle 가드에 사용한다. */
export type SlipSourceType = 'ESTIMATE' | 'PARTNER_ORDER' | 'MANUAL' | 'MIGRATED_ECOUNT' | 'INBOUND_XLSX'

/** 목록용 요약 응답 — BE `SlipResponse`. */
export interface SlipSummary {
  id: string
  slipType: SlipType
  slipNo: string
  slipDate: string
  seqNo: number
  status: SlipStatus
  partnerId: string | null
  partnerName: string | null
  partnerCode?: string | null
  sourceWarehouseId: string | null
  destinationWarehouseId: string | null
  deliveryTag: DeliveryTagCode | null
  deliveryTagLabel?: string | null
  requesterId: string | null
  acceptedBy: string | null
  acceptedAt: string | null
  completedAt: string | null
  confirmedAt: string | null
  updatedAt: string
  version: number
  isDeleted?: boolean
  deletedAt?: string | null
  deletedByName?: string | null
}

/** 창고 QR 출고 전용 최소 문맥 — 영업 정보와 UUID를 포함하지 않는다. */
export interface SlipScanContext {
  slipType: 'OUTBOUND'
  slipNo: string
  status: SlipStatus
  canScan: boolean
  lines: Array<{ productCode: string | null; quantity: number; serialManaged: boolean }>
}

/** 라인 응답 — BE `SlipLineResponse`. */
export interface SlipLineDetail {
  id: string
  productId: string
  productName: string | null
  modelName: string | null
  /**
   * 규격 (예: "220V", "4HP") — Slice A 신규 (피드백 #4 / Designer components.md § 3).
   * BE `SlipLineResponse.specification` (varchar 50, nullable).
   */
  specification: string | null
  quantity: number
  unitPrice: string
  lineTotal: string
  note: string | null
  /** VAT 포함 단가 — 단가 부가세포함 전환(2026-06-09). 화면 '단가' 표시값. nullable(legacy). */
  unitPriceWithVat?: string | null
  /** 공급가액(라인 단위, VAT 미포함). nullable(legacy). */
  supplyAmount?: string | null
  /** 부가세(라인 단위). nullable(legacy). */
  vatAmount?: string | null
  /**
   * 단가 권위 도메인 — #937 재수렴 6차 A안 (V59). `'VAT_INCLUSIVE'` / `'SUPPLY'`,
   * V59 이전 legacy 행은 null.
   *
   * 두 단가 컬럼 중 어느 쪽이 사용자 입력인지 표시 계층이 **추측하지 않게** 하는 해석 계약이다
   * (화면 표시 값 아님). 없으면 `lineVat.resolveUnitPrices` 가 현행 휴리스틱으로 떨어진다.
   */
  unitPriceDomain?: string | null
  /**
   * 세트 전개 첫 구성품 여부 — PR-3 V34 / PR #461.
   * BUNDLE 세트가 전개 저장될 때 첫 번째 구성품 라인 = true, 나머지 = false.
   * 일반 단품 라인 = false (기본값).
   */
  setHead?: boolean
  /**
   * 세트 구성품의 부모 세트 modelCode — PR-3 V34 / PR #461.
   * 해당 라인이 세트 전개 구성품인 경우 부모 세트의 modelCode 값.
   * 일반 단품 라인 = null.
   */
  parentSetModel?: string | null
  /** 저장 후 재조회되는 EXPAND 선택 옵션 문맥. */
  setOptions?: BundleSetOptions | null
}

/**
 * 결재란 출고자/검수자 응답 — Slice A 신규 (Designer README.md § 2.3 + ux-flow.md § 2.4).
 * BE 가 user-service lookup 후 fullName 포함 (Option A 권장).
 */
export interface SlipApprovalActor {
  /** 사용자 UUID — 화면 미노출 (UUID 비공개 가드). */
  userId: string
  /** 사용자 이름 — 결재란 셀에 표시. */
  fullName: string
  /** ISO 8601 timestamp — 결재란 셀에 HH:mm 부분만 표시. */
  signedAt: string
}

/** 상세 응답 — BE `SlipDetailResponse`. */
export interface SlipDetail extends SlipSummary {
  /** 회계 마감 잠금 여부 — SlipStatus와 독립된 표시/변경 제한 축. */
  lockFlag: boolean
  /** 발행 출처. 구 응답 누락 시 기존 수기 전표와 동일하게 처리한다. */
  sourceType?: SlipSourceType
  /** 원천 견적번호 또는 주문번호 — UUID는 화면에 노출하지 않는다. */
  sourceReference?: string | null
  memo: string | null
  lines: SlipLineDetail[]
  partnerCode?: string | null
  inspectionStatus?: 'READY' | 'NOT_READY' | null
  /** 서버가 현재 로그인 사용자에게 계산해 준 OUTBOUND INSPECT capability. */
  canInspect?: boolean
  /**
   * 기사명 — link-dispatch-slice 신규 (Designer plan §7).
   * DRAFT/SAVED 단계만 편집 가능 (BE 가드와 동일).
   * SMS 발송 시 BE 가 driverPhone 으로 메시지 송신.
   */
  driverName?: string | null
  /**
   * 기사 휴대폰 (010-XXXX-XXXX 정규화) — link-dispatch-slice 신규.
   * KOREAN_MOBILE_PHONE_PATTERN 검증.
   */
  driverPhone?: string | null
  /**
   * ACCEPTED 트랜지션 시점 자동 채워지는 출고자 (피드백 #9).
   * 미도달 시 undefined / null. Designer ux-flow.md § 2.1 참고.
   */
  dispatcher?: SlipApprovalActor | null
  /**
   * INSPECTING 트랜지션 시점 자동 채워지는 검수자 (피드백 #9).
   * 미도달 시 undefined / null. Designer ux-flow.md § 2.2 참고.
   */
  inspector?: SlipApprovalActor | null
  /** 담당부서 (BE 가 사용자 부서 lookup 후 전달). */
  ownerDepartment?: string | null
  /** 담당자 (slip.createdBy 의 fullName). */
  ownerFullName?: string | null
  /**
   * 출고자 이름 — 결재란 OUTBOUND_DISPATCH 표시용 flat 필드.
   * BE 상세 GET 에서만 resolve 되며 mutation 응답/lookup 실패 시 null.
   */
  dispatcherFullName?: string | null
  /**
   * 검수자 이름 — 결재란 OUTBOUND_INSPECT/INBOUND_INSPECT 표시용 flat 필드.
   * BE 상세 GET 에서만 resolve 되며 mutation 응답/lookup 실패 시 null.
   */
  inspectorFullName?: string | null
  /**
   * 입고자 이름 — 결재란 INBOUND_RECEIVE 표시용 flat 필드.
   * BE 상세 GET 에서만 resolve 되며 mutation 응답/lookup 실패 시 null.
   */
  acceptedByFullName?: string | null
  /** 배송지 — DispatchView 에서 14pt 본문으로 표시. */
  shippingAddress?: string | null
  /** 검수지 주소 — audit overlay / 협업 수정완료 대상. */
  inspectionAddress?: string | null
  /** 수령자 연락처 — audit overlay / 협업 수정완료 대상. */
  receiverPhone?: string | null
  /** 거래처 연락처 — DispatchView 에서 14pt 본문으로 표시. */
  contactPhone?: string | null
  /** 거래처 연락처 snapshot — audit overlay / 협업 수정완료 대상. */
  customerTel?: string | null
  /** 거래처 주소 snapshot — audit overlay / 협업 수정완료 대상. */
  customerAddress?: string | null
  /** 거래처 대표자 snapshot — audit overlay / 협업 수정완료 대상. */
  customerRepresentative?: string | null
  /** 결제 만기 라벨 — audit overlay / 협업 수정완료 대상. */
  paymentDueLabel?: string | null
  /** 할인 정보 — audit overlay / 협업 수정완료 대상. */
  discountInfo?: string | null
  /** 회수 조건 — audit overlay / 협업 수정완료 대상. */
  collectTerm?: string | null
  /** 약정 조건 — audit overlay / 협업 수정완료 대상. */
  agreeTerm?: string | null
  /**
   * signature-slice-C 신규 필드 7개 (모두 nullable, 미서명 시 null).
   *
   * BE Plan §3 V5__add_slip_signature.sql 의 컬럼과 1:1 대응. signaturePng 은 base64
   * dataURL ("data:image/png;base64,...") 형태로 BE 가 인코딩하여 응답.
   */
  /** 서명 시점 ISO 8601 — 미서명 시 null. */
  signedAt?: string | null
  /** 인수자명 (≤50자) — 미서명 시 null. */
  signerName?: string | null
  /** PNG base64 dataURL — 미서명 시 null. SignatureViewer 의 signaturePngBase64 prop 으로 그대로 전달. */
  signaturePng?: string | null
  /** SHA-256 hex (64자) — 미서명 시 null. SignatureViewer 가 앞 8자만 표시. */
  signatureHash?: string | null
  /** 서명 채널 — MOBILE_CANVAS / PAPER_SCAN / 기타 (Phase 6+ 확장). */
  signatureChannel?: 'MOBILE_CANVAS' | 'PAPER_SCAN' | string | null
  /** 인수자 share 토큰 (base64url) — 모바일 `/share/{token}` 라우트 경로. */
  signatureShareToken?: string | null
  /** share 유효기간 ISO 8601 (+30일). */
  signatureShareExpiresAt?: string | null

  /**
   * Slice C2 (PR #23 follow-up) — 배송기사 서명 4 필드 (nullable).
   * Slip.driverName 은 기존 Slice B 필드 재사용 (별도 driverSignerName X).
   */
  driverSignedAt?: string | null
  driverSignaturePng?: string | null
  driverSignatureHash?: string | null
  driverSignatureChannel?: 'MOBILE_CANVAS' | 'PAPER_SCAN' | string | null

  /**
   * V20 신규 5필드 — BE V20__add_slip_v20_fields.sql 컬럼과 1:1 대응 (모두 nullable).
   * 판매/구매조회(SlipQueryRow) 와 동일 필드명 사용.
   */
  /** 배송주소 (최대 500자) — 거래처 shippingAddress 복사 또는 직접 입력. */
  deliveryAddress?: string | null
  /** 감리주소 (최대 500자) — "배송주소와 동일" 체크박스 연동. */
  supervisionAddress?: string | null
  /** 프로젝트명 (최대 200자). */
  projectName?: string | null
  /** 인수자 번호 (최대 20자, 010-XXXX-XXXX 형식 권장). */
  recipientPhone?: string | null
  /** 입금예정일 (ISO 8601 date string YYYY-MM-DD). */
  paymentDueDate?: string | null
  /** 사업자번호 — 거래처 선택 시 자동 표시 (사용자 입력 X, UUID 비공개 가드). */
  businessNumber?: string | null
  /** 인쇄 여부 — 서버에서 관리, readonly 표시 전용. */
  printed?: boolean | null
  /**
   * 하차일(N) — 출고전표 배송일정 에픽(M상N하). 지방/야적 전표만 값 보유. "YYYY-MM-DD" 형식.
   * null = 배송일정 미적용(비지방/비야적 태그, 또는 신규 전표 저장 전).
   */
  unloadDate?: string | null
  /**
   * 배송일정 파생 라벨 — BE 에서 (slipDate, unloadDate, deliveryTag)로 파생.
   * 예: "25상26하" / "당착" / null(비적용).
   * 특이사항 앞에 표시용. 메모에 저장하지 않는 구조화 태그.
   */
  deliveryScheduleLabel?: string | null
}

/** 검수완료 전표 되돌림 가능성 — 실행 없이 읽기 전용으로만 조회한다. */
export interface SlipRevertability {
  slipNo: string
  revertable: boolean
  reasonCodes: string[]
  reasons: string[]
  userVisibleText: string
}

/**
 * 세트 전개 옵션 — BE `BundleSetOptions` (estimate/web/dto) 와 1:1.
 *
 * <p>BUNDLE(세트) 품목 라인에 한해 사용. 종합견적서 GAS 의 옵션 선택
 * (실외기 교체/제외, 판넬 선택/360 형상, 자재 포함 여부) 을 그대로 전달하여
 * BE BundleExpander 가 6:4 재분배 + 옵션 필터링으로 구성품 라인을 전개한다.
 * SINGLE 품목 라인은 undefined 로 둔다(전개 없음).
 */
export interface BundleSetOptions {
  /** 실외기 교체 옵션 modelCode — 지정 시 기본 실외기를 이 모델로 대체. */
  remoteOption?: string | null
  /** 실외기 제외 여부 — true 면 실외기 구성품 전개 제외. */
  remoteExcluded?: boolean | null
  /** 판넬 선택 — '' | 판넬제외 | 블랙판넬 | 승강판넬 | 공청판넬 중 1종. */
  panelOption?: string | null
  /**
   * 판넬 360 형상값 — BE `BundleExpander` 가 패널 variant 와 **정확 일치**로 매칭.
   * 값: `''`(미지정) | `'원형'` | `'사각'`. (BE 계약: String, boolean 아님.)
   */
  panelShape360?: string | null
  /** 자재 포함 여부 — true 면 자재류 구성품 포함. */
  materialIncluded?: boolean | null
  /** 세트 구성품을 하나의 명시적 인스턴스로 묶는 안정 키. 기존 JSON에는 없을 수 있다. */
  instanceKey?: string | null
}

/** 협업 세션에서 새로 추가한 BUNDLE 인스턴스의 충돌 방지용 key. */
export function createBundleInstanceKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

/** 빈 세트 옵션 — 신규 라인 초기값. */
export function emptyBundleSetOptions(): BundleSetOptions {
  return {
    remoteOption: '',
    remoteExcluded: false,
    panelOption: '',
    panelShape360: '',
    materialIncluded: false,
  }
}

/**
 * 라인 setOptions 를 API 전송용으로 정규화.
 * - `productType !== "BUNDLE"` → `undefined` (BE 전개 생략).
 * - 빈 문자열/서버 도메인 밖의 판넬 옵션/형상 → `null` (BE 기본값 사용).
 * 견적/전표 양 화면 공용 (중복 제거 + panelShape360 String 계약 단일점 보장).
 */
export function toApiBundleSetOptions(
  productType: string | null | undefined,
  opts: BundleSetOptions | undefined,
): BundleSetOptions | undefined {
  if (productType !== 'BUNDLE') return undefined
  const o = opts ?? emptyBundleSetOptions()
  const trimOrNull = (v: string | null | undefined): string | null =>
    v && v.trim() ? v.trim() : null
  const panelOption = trimOrNull(o.panelOption)
  return {
    remoteOption: trimOrNull(o.remoteOption),
    remoteExcluded: Boolean(o.remoteExcluded),
    panelOption: isSinglePanelOption(panelOption) ? panelOption : null,
    panelShape360: trimOrNull(o.panelShape360),
    materialIncluded: Boolean(o.materialIncluded),
    instanceKey: o.instanceKey ?? null,
  }
}

export interface ExpandedSlipLine {
  productId: string | null
  modelCode?: string | null
  modelName?: string | null
  name?: string | null
  quantity: number
  unitPrice: number | string
  /** 서버가 null을 명시하면 KEEP 부모(BUNDLE)이며, 구성품은 componentKind를 가진다. */
  componentKind?: string | null
  /** EXPAND 구성품 계보의 첫 행 여부 — 서버 BundleExpander 응답을 그대로 보존한다. */
  setHead?: boolean
  specification?: string | null
}

/** 저장 경로와 동일한 product-service BundleExpander 결과를 입력 행으로 사용한다. */
export async function expandBundleLine(input: {
  parentModelCode: string
  quantity: number
  unitPrice: string
  specification?: string
  setOptions?: BundleSetOptions
}): Promise<ExpandedSlipLine[]> {
  const res = await apiClient.post<ApiEnvelope<ExpandedSlipLine[]>>('/slips/expand-line', input)
  return res.data.data
}

/** 라인 input — BE `CreateSlipRequest.SlipLineRequest`. */
export interface SlipLineInput {
  /** 상세 응답 `id` 왕복값 — payload 전용, 화면 미표시. 신규 라인은 null/미지정. */
  lineId?: string | null
  productId: string
  productName?: string
  modelName?: string
  /**
   * 규격 (Slice A 신규 — Designer components.md § 3).
   * 빈 값 / undefined 모두 허용. DB column varchar(50).
   */
  specification?: string
  quantity: number
  unitPrice: string
  note?: string
  /** 세트 전개 옵션 — BUNDLE 품목 라인에 한해 전달(BE BundleExpander). */
  setOptions?: BundleSetOptions
  /** 화면에서 전개된 구성품의 부모 세트 modelCode. */
  parentSetModel?: string | null
  /** 화면에서 전개된 세트의 첫 구성품 여부. */
  setHead?: boolean
  /** 화면 전개 세트의 원 부모 productId — 가격기억 기준. */
  bundleParentProductId?: string | null
  /** 화면 전개 세트의 원 부모 입력단가 — 가격기억 기준. */
  bundleParentUnitPrice?: string | null
  /**
   * 단가 부가세포함 여부 — true 면 `unitPrice` 가 VAT 포함 단가이며 BE 가 라인 단위로
   * 공급가액/부가세를 분리(eCount 방식). 2026-06-09 단가 부가세포함 전환.
   */
  priceVatInclusive?: boolean
  /** 권위 공급가액 S — VAT 열을 편집한 라인에서만 3값 함께 전송. */
  supplyAmount?: string
  /** 권위 부가세 V — VAT 열을 편집한 라인에서만 3값 함께 전송. */
  vatAmount?: string
  /** 권위 VAT 포함 합계 T — 전표 lineTotal 컬럼과 구분되는 요청 합계. */
  lineTotalWithVat?: string
}

/** 입고 전표 direct PUT 수정 요청 — BE `SlipUpdateRequest`. */
export interface SlipUpdateRequest {
  updatedAt: string
  /**
   * 거래처 UUID — payload 전용(화면 미표시). null 이면 BE 가 기존 거래처를 보존한다.
   *
   * <p>D-R8-7 신규. 종전 계약은 partnerName 만 받아 거래처를 바꿔 저장해도 partner_id 가
   * 불변이었고, 그 결과 (거래처+품목) 가격기억이 <b>원 거래처</b>에 각인됐다(R8-QA-3 라이브 실증).
   */
  partnerId?: string | null
  partnerName?: string | null
  partnerCode?: string | null
  memo?: string | null
  businessNumber?: string | null
  deliveryAddress?: string | null
  supervisionAddress?: string | null
  projectName?: string | null
  recipientPhone?: string | null
  paymentDueDate?: string | null
  lines: SlipLineInput[]
}

/** 신규 전표 생성 요청 body — BE `CreateSlipRequest`. */
export interface CreateSlipRequest {
  slipType: SlipType
  slipDate?: string
  sourceWarehouseId?: string
  destinationWarehouseId?: string
  partnerId?: string
  /** 가입고 XLSX 고정 거래처 업무코드 — 사용자 화면에는 UUID 대신 코드만 노출한다. */
  partnerCode?: string
  partnerName?: string
  deliveryTag?: DeliveryTagCode
  memo?: string
  /** 기사명 — link-dispatch-slice 신규 (옵션). */
  driverName?: string
  /** 기사 휴대폰 — link-dispatch-slice 신규 (옵션, 010-XXXX-XXXX). */
  driverPhone?: string
  // PR-G1 backlog #2 — V16 e-Count 12 컬럼 (모두 옵션, BE 가 null 시 기본 분기).
  /** "10"=출고 / "11"=입고. null 시 slipType 분기 자동. */
  ioType?: string
  /** HHmmss. null 시 BE 가 서버 시각 자동 채움. */
  timeDate?: string
  /** 거래처 연락처 (자동 채움 가능). */
  customerTel?: string
  /** 거래처 사업장 주소 (자동 채움 가능). */
  customerAddress?: string
  /** 거래처 대표자명 (자동 채움 가능). */
  customerRepresentative?: string
  /** 배송지 주소 — 별도 입력. */
  shippingAddress?: string
  /** 검수지 주소 — 별도 입력. */
  inspectionAddress?: string
  /** 수령자 연락처 — 별도 입력. */
  receiverPhone?: string
  /** 결제 만기 라벨 (예: "MM-DD" 또는 "익월말"). */
  paymentDueLabel?: string
  /** 할인 정보 (자유 입력). */
  discountInfo?: string
  /** 대금 회수 조건 ("월말" / "익월말" / "현금" 등). */
  collectTerm?: string
  /** 거래 약정 조건 (자유 입력). */
  agreeTerm?: string
  // V20 신규 5필드 (BE V20__add_slip_v20_fields.sql 컬럼과 1:1 대응, 모두 옵션)
  /** 배송주소 (최대 500자). */
  deliveryAddress?: string
  /** 감리주소 (최대 500자). */
  supervisionAddress?: string
  /** 프로젝트명 (최대 200자). */
  projectName?: string
  /** 인수자 번호 (최대 20자, 010-XXXX-XXXX 형식 권장). */
  recipientPhone?: string
  /** 입금예정일 (YYYY-MM-DD). */
  paymentDueDate?: string
  /**
   * 하차일 override (YYYY-MM-DD) — 배송일정 에픽(M상N하).
   * null/미지정 시 BE 가 규칙(N=출고일+1, 일요일 skip) 으로 자동 계산.
   * 당착(지방 당일하차) 시 slipDate 와 동일 값을 전송.
   */
  unloadDate?: string
  /** 생성 출처 — 가입고 XLSX 경로가 저장 계층까지 보존하는 provenance. */
  sourceType?: SlipSourceType
  /** 파일·창고·청크 단위 재시도 멱등성 키. 헤더가 유실돼도 저장할 정본. */
  idempotencyKey?: string
  lines: SlipLineInput[]
}

/** 페이지 조회 옵션 — slipType / status / deliveryTag 필터, 0-based page. */
export interface ListSlipsOptions {
  slipType?: SlipType
  status?: SlipStatus
  /** 배송태그 필터 — OUTBOUND: 8종, INBOUND: 3종. */
  deliveryTag?: DeliveryTagCode | null
  /** 삭제행(취소선) 포함 여부 — OUTBOUND 목록 화면 전용 opt-in. 기본 미전송(활성전용). */
  includeDeleted?: boolean
  page?: number
  size?: number
}

/** 모델명 lookup 응답 — BE `ProductSummary` (slip-service facade). */
export interface ProductLookupResult {
  productId: string
  modelName: string
  productName: string
  sellingPrice: string
  /** 품목코드 — 세트 전개 시 BE 가 부모 modelCode 로 사용. */
  modelCode?: string
  /** 품목 유형 — "SINGLE" | "BUNDLE". BUNDLE 이면 세트 옵션 노출. */
  productType?: string
  goodsType?: 'GOODS' | 'NON_GOODS'
  /** 카탈로그 자동 규격 — 견적 라인 확정 시 저장되는 값. */
  specification?: string | null
  /** product-service가 계산한 유효 정액DC율(%) 및 적용 출처. */
  fixedDiscountRate?: number | null
  fixedDiscountSource?: string | null
  /** product-service가 판정한 정액DC 분류 정본. */
  discountOption?: 'THREE_SIXTY' | 'FOUR_WAY' | 'ONE_WAY' | 'STAND' | 'DELUXE' | 'FIRST_GRADE' | null
  status?: string | null
}

interface ProductLookupWireResult {
  id: string
  modelName: string
  name: string
  sellingPrice: string | number | null
  modelCode?: string | null
  productType?: string | null
  goodsType?: 'GOODS' | 'NON_GOODS' | null
  specification?: string | null
  fixedDiscountRate?: string | number | null
  fixedDiscountSource?: string | null
  discountOption?: 'THREE_SIXTY' | 'FOUR_WAY' | 'ONE_WAY' | 'STAND' | 'DELUXE' | 'FIRST_GRADE' | null
  status?: string | null
}

/** 거래처+품목 최근 수동단가 기억 응답 — 단가는 VAT 포함 입력 단가. */
export interface PriceMemoryResult {
  unitPrice: number
  source: string
  /** 원 전표/견적이 실제 저장된 logical event time (`remembered_at`). */
  updatedAt: string | null
}

/** 거래처+복수 품목 최근 수동단가 bulk 응답 항목 — miss 품목은 응답에서 생략된다. */
export interface BulkPriceMemoryResult extends PriceMemoryResult {
  productId: string
}

export interface BulkPriceMemoryLookupResult {
  /** 성공 chunk 에서 반환된 hit. 성공 chunk 의 miss 는 배열에서 생략된다. */
  hits: BulkPriceMemoryResult[]
  /**
   * 호출 자체가 실패한 chunk 에 포함됐던 productId.
   *
   * R6-L1 정정: 현재 두 폼 호출자(SlipFormPage/EstimateFormPage 의
   * refreshAutoPricesForPartner)는 `hits` 만 소비하고 이 배열은 사용하지 않는다 —
   * 실패 품목도 hit 미포함 품목과 동일하게 판매가(CATALOG) fallback 으로 처리된다.
   * (miss 와 chunk 실패를 구분해 고지하려는 후속 소비자를 위해 필드는 유지.)
   */
  failedProductIds: string[]
}

/**
 * 전표 페이지 조회. 빈 필터 시 전체.
 *
 * @return Spring `Page<SlipResponse>` 형태
 */
export async function listSlips(
  options: ListSlipsOptions = {},
): Promise<PageResponse<SlipSummary>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.slipType) params['slipType'] = options.slipType
  if (options.status) params['status'] = options.status
  if (options.deliveryTag) params['deliveryTag'] = options.deliveryTag
  // E2 삭제행(취소선) 노출은 OUTBOUND 목록 화면 전용 opt-in. BE 는 미전송/false 시 활성전용(엑셀·조회·INBOUND 누출 차단).
  if (options.includeDeleted) params['includeDeleted'] = 'true'

  const res = await apiClient.get<ApiEnvelope<PageResponse<SlipSummary>>>(
    '/slips',
    { params },
  )
  return res.data.data
}

/**
 * 전표 단건 상세 조회 — 라인 포함.
 *
 * @param id 전표 UUID (path param 으로만 사용, 화면 표시 X)
 */
export async function getSlip(id: string): Promise<SlipDetail> {
  const res = await apiClient.get<ApiEnvelope<SlipDetail>>(`/slips/${id}`)
  return res.data.data
}

/** 상태·재고·후속 연결을 변경하지 않는 되돌림 preflight 조회. */
export async function getSlipRevertability(id: string): Promise<SlipRevertability> {
  const res = await apiClient.get<ApiEnvelope<SlipRevertability>>(
    `/slips/${encodeURIComponent(id)}/revertability`,
  )
  return res.data.data
}

/** 전표번호와 유형으로 전표를 해석한다. UUID는 검색 결과 내부에서만 사용한다. */
export async function getSlipByNumber(slipNo: string, slipType: SlipType): Promise<SlipDetail> {
  const date = slipNo.slice(0, 10).replace(/\//g, '-')
  const page = await querySlips({ slipType, dateFrom: date, dateTo: date, page: 0, size: 20, searchSlipNo: slipNo })
  const summary = page.content.find((candidate) => candidate.slipNo === slipNo)
  if (!summary) throw new Error(`전표 ${slipNo}를 찾을 수 없습니다.`)
  return getSlip(summary.id)
}

/** 창고 담당자가 목록 권한 없이 전표번호로 출고 QR 문맥에 진입한다. */
export async function getOutboundSlipScanContextByNumber(slipNo: string): Promise<SlipScanContext> {
  const normalized = slipNo.trim()
  if (!normalized) throw new Error('slipNo is required')
  const res = await apiClient.get<ApiEnvelope<SlipScanContext>>('/slips/scan-context/by-number', {
    params: { slipNo: normalized },
  })
  return res.data.data
}

/** 사용자 권한으로 출고전표 번호를 exact 해석해 라인 포함 상세를 조회한다. */
export async function getOutboundSlipBySlipNo(slipNo: string): Promise<SlipDetail> {
  const normalizedSlipNo = slipNo.trim()
  if (!normalizedSlipNo) throw new Error('slipNo is required')

  const searched = await searchSlips(normalizedSlipNo, 20, 'OUTBOUND')
  const searchHit = searched.find((row) => row.slipNo === normalizedSlipNo)
  if (!searchHit) throw new Error('outbound slip reference not found')

  const day = searchHit.slipDate.slice(0, 10)
  const page = await querySlips({
    slipType: 'OUTBOUND',
    dateFrom: day,
    dateTo: day,
    page: 0,
    size: 20,
    searchSlipNo: normalizedSlipNo,
  })
  const exactRow = page.content.find((row) => row.slipNo === normalizedSlipNo)
  if (!exactRow) throw new Error('outbound slip detail reference not found')
  return getSlip(exactRow.id)
}

/**
 * 신규 전표 생성. 응답은 라인 포함 상세 (`SlipDetailResponse`).
 *
 * @return 생성된 전표 (status=DRAFT)
 */
export async function createSlip(
  body: CreateSlipRequest,
  options?: { idempotencyKey?: string },
): Promise<SlipDetail> {
  const res = await apiClient.post<ApiEnvelope<SlipDetail>>('/slips', body, {
    headers: options?.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
  })
  return res.data.data
}

/**
 * 거래처+품목 최근 수동단가 조회.
 *
 * partnerId/productId 는 화면 표시 금지 UUID이며 API payload 전용이다. 204/miss 는 null.
 */
export async function getPriceMemory(
  partnerId: string,
  productId: string,
): Promise<PriceMemoryResult | null> {
  const res = await apiClient.get<ApiEnvelope<PriceMemoryResult>>(
    '/slips/price-memory',
    {
      params: { partnerId, productId },
    },
  )
  if (res.status === 204) return null
  return res.data.data
}

/** BE bulk 계약 상한 — 1회 호출당 고유 productId 최대 개수 (BE 는 요청당 100개 제한). */
const PRICE_MEMORY_BULK_CHUNK_SIZE = 100

/**
 * 거래처+복수 품목 최근 수동단가 bulk 조회.
 *
 * 거래처 변경처럼 여러 자동채움 라인을 동시에 갱신할 때만 사용한다. BE 계약상 hit 항목만
 * 반환하며 전체 miss 도 200 + 빈 배열이다. productIds 는 중복 제거 후 1개 이상이어야 하고,
 * BE 상한(100개) 초과분은 100개 단위 chunk 순차 호출로 합산한다 — 고유 품목 101개↑에서
 * throw 되어 전 라인이 조용히 판매가(CATALOG) 강등되는 것을 방지(R4-F5).
 * chunk 실패는 해당 productId 만 failedProductIds 로 분리하고 앞선 성공 hit 는 보존한다
 * (R6-L1: 현재 폼 호출자는 hits 만 소비 — 실패 품목도 miss 와 동일하게 판매가 fallback).
 */
export async function getPriceMemories(
  partnerId: string,
  productIds: string[],
): Promise<BulkPriceMemoryLookupResult> {
  const uniqueProductIds = [...new Set(productIds)]
  if (uniqueProductIds.length === 0) {
    throw new Error('price memory bulk productIds must contain at least 1 unique item')
  }
  const results: BulkPriceMemoryResult[] = []
  const failedProductIds: string[] = []
  for (let start = 0; start < uniqueProductIds.length; start += PRICE_MEMORY_BULK_CHUNK_SIZE) {
    const chunk = uniqueProductIds.slice(start, start + PRICE_MEMORY_BULK_CHUNK_SIZE)
    try {
      const res = await apiClient.post<ApiEnvelope<BulkPriceMemoryResult[]>>(
        '/slips/price-memory/bulk',
        { partnerId, productIds: chunk },
      )
      results.push(...(res.data.data ?? []))
    } catch {
      failedProductIds.push(...chunk)
    }
  }
  return { hits: results, failedProductIds }
}

/**
 * 입고 전표 soft delete — optimistic lock (updatedAt 필수).
 *
 * BE `DELETE /slips/{id}` + request body `{ updatedAt }`.
 * 응답 없음 (204). 204/200 모두 성공으로 처리.
 *
 * 에러 코드:
 * - 409 Conflict       — 낙관적 잠금 충돌 (다른 사용자가 먼저 수정)
 * - 422 Unprocessable  — SLIP_DELETE_INSPECTION_COMPLETED (검수 완료 전표 삭제 불가)
 * - 403 Forbidden      — 권한 부족
 *
 * @param id        전표 UUID (path param 전용, 화면 표시 금지)
 * @param updatedAt 낙관적 잠금용 마지막 수정 시각 (ISO 8601)
 */
export async function deletePurchaseSlip(
  id: string,
  updatedAt: string,
): Promise<void> {
  await apiClient.delete<ApiEnvelope<void>>(
    `/slips/${encodeURIComponent(id)}`,
    { data: { updatedAt } },
  )
}

/**
 * 출고 전표 soft delete — SP-08-6-3 신규. optimistic lock (updatedAt 필수).
 *
 * BE `DELETE /slips/{id}/sales` + request body `{ updatedAt }`.
 * 응답 없음 (204). 204/200 모두 성공으로 처리.
 *
 * 에러 코드:
 * - 409 Conflict       — 낙관적 잠금 충돌 (다른 사용자가 먼저 수정)
 * - 422 Unprocessable  — SLIP_DELETE_SHIPPED (출고 완료 전표 삭제 불가)
 * - 403 Forbidden      — 권한 부족 (SALES/MANAGER/MASTER 이외)
 *
 * @param id        전표 UUID (path param 전용, 화면 표시 금지)
 * @param updatedAt 낙관적 잠금용 마지막 수정 시각 (ISO 8601)
 */
export async function deleteSalesSlip(
  id: string,
  updatedAt: string,
): Promise<void> {
  await apiClient.delete<ApiEnvelope<void>>(
    `/slips/${encodeURIComponent(id)}/sales`,
    { data: { updatedAt } },
  )
}

/**
 * 전표 soft-delete 복원 — 목록 삭제행 복원 액션.
 *
 * BE `POST /slips/{id}/restore`.
 * 응답은 라인 미포함 `SlipResponse`.
 *
 * 에러 코드:
 * - 409 Conflict  — 동일 식별자 활성 전표 공존 또는 무결성 충돌
 * - 403 Forbidden — 권한 부족
 *
 * @param id 전표 UUID (path param 전용, 화면 표시 금지)
 */
export async function restoreSlip(id: string): Promise<SlipSummary> {
  const res = await apiClient.post<ApiEnvelope<SlipSummary>>(
    `/slips/${encodeURIComponent(id)}/restore`,
    {},
  )
  return res.data.data
}

/**
 * 입고 전표 direct PUT 수정.
 *
 * @param id 전표 UUID (path param 전용, 화면 표시 금지)
 * @param body updatedAt 낙관적 잠금 + 헤더/라인 전체 교체 요청
 */
export async function updatePurchaseSlip(
  id: string,
  body: SlipUpdateRequest,
): Promise<SlipDetail> {
  const res = await apiClient.put<ApiEnvelope<SlipDetail>>(
    `/slips/${encodeURIComponent(id)}`,
    // [D-R8-9] 계약 마커는 여기서만 얹는다 — 호출자가 잊을 수 없게. 누락 시 BE 400.
    withLineIdContract(body),
  )
  return res.data.data
}

/**
 * 출고 전표 direct PUT 수정 — SP-08-6-2 신규.
 *
 * OUTBOUND 전표의 헤더 및 라인을 전체 교체 (optimistic lock).
 * 에러 코드:
 * - 409 Conflict      — 낙관적 잠금 충돌 (다른 사용자가 먼저 수정)
 * - 422 Unprocessable — 라인 입력값 검증 오류
 * - 403 Forbidden     — 권한 부족 (SALES/MANAGER/MASTER 이외)
 *
 * @param id   전표 UUID (path param 전용, 화면 표시 금지)
 * @param body updatedAt 낙관적 잠금 + 헤더/라인 전체 교체 요청
 */
export async function updateSalesSlip(
  id: string,
  body: SlipUpdateRequest,
): Promise<SlipDetail> {
  const res = await apiClient.put<ApiEnvelope<SlipDetail>>(
    `/slips/${encodeURIComponent(id)}/sales`,
    // [D-R8-9] 매입 미러 — 계약 마커 스탬프.
    withLineIdContract(body),
  )
  return res.data.data
}

/**
 * 기사 정보 부분 갱신 요청 — link-dispatch-slice 신규.
 *
 * BE `UpdateSlipDriverRequest` (PATCH /slips/{id}/driver).
 * DRAFT/SAVED 단계만 허용 (BE 가드와 동일).
 */
export interface UpdateSlipDriverRequest {
  driverName?: string | null
  driverPhone?: string | null
}

/**
 * 기사 정보 부분 갱신 — DRAFT/SAVED 단계만.
 */
export async function updateSlipDriver(
  slipId: string,
  body: UpdateSlipDriverRequest,
): Promise<SlipDetail> {
  const res = await apiClient.patch<ApiEnvelope<SlipDetail>>(
    `/slips/${slipId}/driver`,
    body,
  )
  return res.data.data
}

/**
 * 라인 추가 요청 body — BE `AddLineRequest`. DRAFT/SAVED 단계만 허용.
 */
export interface AddLineRequest {
  productId: string
  productName?: string
  modelName?: string
  specification?: string
  quantity: number
  unitPrice: string
  note?: string
  /** 세트 전개 옵션 — BUNDLE 품목 라인 추가 시 전달(BE addSlipLinesExpanded). 에픽 후속 #2. */
  setOptions?: BundleSetOptions
  /** 단가 부가세포함 여부 — true 면 unitPrice 가 VAT 포함 단가. */
  priceVatInclusive?: boolean
  /** 권위 공급가액·부가세·합계 — 편집 라인에서만 3값 함께 전송. */
  supplyAmount?: string
  vatAmount?: string
  lineTotalWithVat?: string
}

/**
 * 라인 추가 — DRAFT/SAVED 단계만. 다른 단계에서 호출 시 BE 가 409 반환.
 */
export async function addLine(slipId: string, body: AddLineRequest): Promise<SlipDetail> {
  const res = await apiClient.post<ApiEnvelope<SlipDetail>>(`/slips/${slipId}/lines`, body)
  return res.data.data
}

/**
 * 라인 제거 — DRAFT/SAVED 단계만. orphan removal. 응답 없음 (204).
 */
export async function removeLine(slipId: string, lineId: string): Promise<void> {
  await apiClient.delete(`/slips/${slipId}/lines/${lineId}`)
}

/**
 * 전표 복사 — BE `POST /slips/{id}/duplicate` 1회 호출 (R6-H2 서버 복사 전환).
 *
 * 기존 FE 는 전개된 구성품 라인을 평면 본문으로 재-POST 해 세트 계보
 * (setHead/parentSetModel)가 소실되고 구성품 배분가가 "복사 1클릭"마다 가격기억에
 * 각인되는 결함이 있었다. 서버 복사 semantics: 헤더는 기존 FE 승계 범위와 동일,
 * 전표일자=오늘 + 신규 채번 + DRAFT, 라인은 금액 권위값 verbatim + 계보 승계,
 * 가격기억은 비구성품 라인만 기록, sourceOrderLineId 미승계.
 *
 * 요청 body 없음. 응답(201)은 기존 POST /slips 와 동일 스키마(`SlipDetailResponse`) —
 * lines[].setHead / lines[].parentSetModel 포함으로 복사본 세트 표시 즉시 렌더 가능.
 *
 * 에러 코드:
 * - 403 Forbidden — 생성 권한 없음
 * - 404 Not Found — 원본 미존재/삭제
 * - 409 Conflict  — OUTBOUND 당일 마감 초과
 *
 * @param sourceId 원본 전표 UUID (path param 전용, 화면 표시 금지)
 */
export async function duplicateSlip(sourceId: string): Promise<SlipDetail> {
  const res = await apiClient.post<ApiEnvelope<SlipDetail>>(
    `/slips/${encodeURIComponent(sourceId)}/duplicate`,
  )
  return res.data.data
}

/**
 * 모델명 → product 요약 lookup. SlipFormPage 라인 입력 onBlur 시 호출.
 *
 * 200 응답 시 productName / sellingPrice 자동 fill 에 사용한다.
 * 미존재 (404) 는 axios error 로 던지며 호출자가 "찾을 수 없음" 메시지 처리.
 *
 * @param modelName 사용자가 입력한 모델명 (예: AJ040RXH4BC1)
 */
export async function lookupProductByModelName(
  modelName: string,
): Promise<ProductLookupResult> {
  const res = await apiClient.get<ApiEnvelope<ProductLookupWireResult>>(
    '/slips/lookup-product',
    { params: { modelName } },
  )
  const data = res.data.data
  if (!data?.id || !data.name) {
    throw new Error('product lookup response contract mismatch')
  }
  return {
    productId: data.id,
    modelName: data.modelName,
    productName: data.name,
    sellingPrice: String(data.sellingPrice ?? '0'),
    modelCode: data.modelCode ?? undefined,
    productType: data.productType ?? undefined,
    goodsType: data.goodsType ?? undefined,
    specification: data.specification ?? undefined,
    fixedDiscountRate: data.fixedDiscountRate == null ? null : Number(data.fixedDiscountRate),
    fixedDiscountSource: data.fixedDiscountSource ?? null,
    discountOption: data.discountOption ?? null,
    status: data.status ?? null,
  }
}

/**
 * PR-G1 backlog #2 — 거래처 자동 채움 lookup 응답.
 * BE `PartnerAdminResponse` 의 customer 필드 부분만 추출 (UUID 미노출).
 */
export interface PartnerAutoFillResult {
  partnerCode: string
  name: string
  phone: string | null
  address: string | null
  address1?: string | null
  address2?: string | null
  representative: string | null
  note?: string | null
  managerName?: string | null
}

/**
 * PR-G1 backlog #2 — 거래처 코드 → 자동 채움 데이터 lookup.
 *
 * SlipFormPage "거래처 자동 채움" 버튼이 호출. 200 시 customerTel/customerAddress/
 * customerRepresentative 3 필드 fill (사용자 수정 가능). 404 시 axios error 던짐 →
 * 호출자가 "거래처 미존재" 안내.
 *
 * @param partnerCode 거래처 코드 (사용자 노출 식별자)
 */
export async function lookupPartnerForAutoFill(
  partnerCode: string,
): Promise<PartnerAutoFillResult> {
  const res = await apiClient.get<ApiEnvelope<PartnerAutoFillResult>>(
    `/admin/partners/${encodeURIComponent(partnerCode)}`,
  )
  const d = res.data.data
  return {
    partnerCode: d.partnerCode,
    name: d.name,
    phone: d.phone ?? null,
    address: d.address ?? null,
    address1: d.address1 ?? null,
    address2: d.address2 ?? null,
    representative: d.representative ?? null,
    note: d.note ?? null,
    managerName: d.managerName ?? null,
  }
}

/**
 * 판매/구매 조회 전용 풍성한 컬럼 응답 — BE `SlipResponse` (신규 필드 포함).
 *
 * UUID 비공개 가드: `id` / `partnerId` / `sourceWarehouseId` / `destinationWarehouseId` 는
 * 내부 처리 전용. 화면 표시에는 slipNo / partnerCode / businessNumber 만 사용.
 */
export interface SlipQueryRow {
  id: string
  slipType: SlipType
  slipNo: string
  slipDate: string
  status: SlipStatus
  partnerName: string | null
  partnerCode: string | null
  businessNumber: string | null
  deliveryAddress: string | null
  supervisionAddress: string | null
  projectName: string | null
  recipientPhone: string | null
  paymentDueDate: string | null
  printed: boolean
  memo: string | null
  totalAmount: number
  /** 사용자 화면 표시용 부가세 포함 금액. legacy 응답에는 없을 수 있다. */
  displayTotalAmount?: number | null
  totalQuantity: number
  salesPersonName: string | null
  editHistoryCount: number
  deliveryTag: DeliveryTagCode | null
  deliveryTagLabel: string | null
  inspectionStatus?: 'READY' | 'NOT_READY' | null
  sourceWarehouseId: string | null
  destinationWarehouseId: string | null
  /** 낙관적 잠금용 — soft delete / PUT 시 필요. ISO 8601. */
  updatedAt: string
  isDeleted?: boolean
  deletedAt?: string | null
  deletedByName?: string | null
}

/** 판매/구매 조회 검색 옵션 */
export interface QuerySlipsOptions {
  slipType: 'OUTBOUND' | 'INBOUND'
  dateFrom: string
  dateTo: string
  page: number
  size: number
  searchPartnerName?: string
  searchPartnerCode?: string
  searchBusinessNumber?: string
  searchSlipNo?: string
  searchProjectName?: string
  searchDeliveryAddress?: string
}

/**
 * 판매/구매 조회 페이지 API.
 *
 * BE `GET /slips/query` — QuerySlipsOptions 를 쿼리 파라미터로 전달.
 * 응답은 Page<SlipQueryRow> (Spring Data Page 형태).
 */
export async function querySlips(
  opts: QuerySlipsOptions,
): Promise<PageResponse<SlipQueryRow>> {
  const params: Record<string, string | number> = {
    slipType: opts.slipType,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    page: opts.page,
    size: opts.size,
  }
  if (opts.searchPartnerName)    params['searchPartnerName']    = opts.searchPartnerName
  if (opts.searchPartnerCode)    params['searchPartnerCode']    = opts.searchPartnerCode
  if (opts.searchBusinessNumber) params['searchBusinessNumber'] = opts.searchBusinessNumber
  if (opts.searchSlipNo)         params['searchSlipNo']         = opts.searchSlipNo
  if (opts.searchProjectName)    params['searchProjectName']    = opts.searchProjectName
  if (opts.searchDeliveryAddress) params['searchDeliveryAddress'] = opts.searchDeliveryAddress

  const res = await apiClient.get<ApiEnvelope<PageResponse<SlipQueryRow>>>(
    '/slips/query',
    { params },
  )
  return res.data.data
}

/**
 * 전표 라이프사이클 transition action 코드 — BE `SlipController` POST endpoint suffix 와 1:1.
 *
 * - `save`     DRAFT → SAVED
 * - `send`     SAVED → SENT
 * - `accept`   SENT → ACCEPTED (출고자 자동 채움)
 * - `process`  ACCEPTED → PROCESSING
 * - `inspect`  PROCESSING → INSPECTING (검수자 자동 채움) — Slice A 신규
 * - `complete` INSPECTING → COMPLETED (Slice A 에서 PROCESSING → COMPLETED 가 INSPECTING 거침)
 * - `ship`     COMPLETED → SHIPPING (출고전표 한정)
 * - `deliver`  SHIPPING → DELIVERED (출고전표 한정)
 * - `confirm`  DELIVERED→CONFIRMED (출고) / COMPLETED→CONFIRMED (입고)
 * - `reject`   SENT/ACCEPTED → REJECTED (사유 필수)
 * - `cancel`   DRAFT/SAVED/SENT → CANCELED
 */
export type SlipTransitionAction =
  | 'save'
  | 'send'
  | 'accept'
  | 'process'
  | 'inspect'
  | 'complete'
  | 'ship'
  | 'deliver'
  | 'confirm'
  | 'reject'
  | 'cancel'

/**
 * 라이프사이클 transition 호출. reject 만 body (`reason`) 필요.
 *
 * @param id 전표 UUID
 * @param action transition 액션 코드
 * @param body reject 사유 (그 외 transition 은 미사용)
 */
export async function transitionSlip(
  id: string,
  action: SlipTransitionAction,
  body?: { reason?: string },
): Promise<SlipDetail> {
  const res = await apiClient.post<ApiEnvelope<SlipDetail>>(
    `/slips/${id}/${action}`,
    body ?? {},
  )
  return res.data.data
}
