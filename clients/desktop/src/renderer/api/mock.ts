/**
 * Mock 모드 (dev-only) — 백엔드 미부팅 환경에서 11 화면 시연 + 자동 캡처용.
 *
 * 활성화 조건: 빌드 시 환경변수 `VITE_MOCK_MODE=1` 설정.
 * 프로덕션 빌드에는 본 모듈이 import 되지만 인터셉터가 no-op 으로 통과한다 (환경변수 미설정).
 *
 * 본 모듈은 PR #18 의 QA 스크린샷 자동 캡처를 위해 추가된 dev-only 도구이며,
 * 실제 운영 시점에는 사용되지 않는다.
 *
 * 본 슬라이스 (slip-output-format) 갱신:
 * - `GET /slips/lookup-product?modelName=...` mock 추가 (onBlur lookup)
 * - `GET /slips/{id}` mock 추가 (상세 라인 포함)
 * - `POST /slips/{id}/{action}` 라이프사이클 transition mock (status 진행)
 * - `GET /inventory/transfers` + `POST` + `GET /{id}` + transition mock
 */
import type { AxiosRequestConfig } from 'axios'

/** ApiResponse envelope 형태 — `shared/common/dto/ApiResponse.java` 와 동일. */
function envelope<T>(data: T) {
  return {
    success: true,
    code: 'OK',
    message: null as string | null,
    data,
    timestamp: new Date().toISOString(),
  }
}

function mockError(status: number, code: string, message: string) {
  return {
    __mockStatus: status,
    body: {
      success: false,
      code,
      message,
      data: null,
      timestamp: new Date().toISOString(),
    },
  }
}

function mockLocationParams(): URLSearchParams {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return new URLSearchParams()
  }
  const params = new URLSearchParams(window.location.search)
  const hashQuery = window.location.hash.split('?')[1]
  if (hashQuery) {
    const hashParams = new URLSearchParams(hashQuery)
    hashParams.forEach((value, key) => params.set(key, value))
  }
  return params
}

function parseMockBody(config: AxiosRequestConfig): Record<string, unknown> {
  if (!config.data) return {}
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof config.data === 'object') {
    return config.data as Record<string, unknown>
  }
  return {}
}

function normalizeAdminPartner(row: Record<string, unknown>) {
  return {
    partnerCode: String(row['partnerCode'] ?? ''),
    name: String(row['name'] ?? row['partnerName'] ?? ''),
    bizNo: String(row['bizNo'] ?? row['businessNumber'] ?? ''),
    phone: (row['phone'] as string | null | undefined) ?? null,
    status: row['status'] ?? 'ACTIVE',
    creditLimit: row['creditLimit'] ?? '0',
    outstandingBalance: row['outstandingBalance'] ?? row['currentBalance'] ?? '0',
  }
}

function buildMockPartnerFull(body: Record<string, unknown>) {
  const partnerCode = String(body['partnerCode'] ?? 'P-SP01-0001')
  const bizNo = String(body['bizNo'] ?? '123-45-67890')
  const name = String(body['name'] ?? '(주)SP01검증공조')
  // 거래 상태 — 버전이력 패널의 TERMINATED 복원 가드 검증용 (지정 시 row status 반영).
  const status = String(body['status'] ?? 'ACTIVE')
  const priceDiscount = body['priceDiscount'] as Record<string, unknown> | undefined
  const shippingAddresses = Array.isArray(body['shippingAddresses'])
    ? body['shippingAddresses'] as Record<string, unknown>[]
    : []
  const contacts = Array.isArray(body['contacts'])
    ? body['contacts'] as Record<string, unknown>[]
    : []

  return {
    basic: {
      partnerCode,
      bizNo,
      name,
      representative: null,
      businessType: null,
      industry: null,
      address: null,
      phone: null,
      fax: null,
      email: null,
      email2: null,
      mobile: null,
      website: null,
      partnerGroup1: null,
      partnerGroup2: null,
      creditLimit: 0,
      outstandingBalance: 0,
      status,
      registrationDate: new Date().toISOString().slice(0, 10),
    },
    priceDiscount: {
      basicDiscountRate: Number(priceDiscount?.['basicDiscountRate'] ?? 0),
      paymentTermDays: Number(priceDiscount?.['paymentTermDays'] ?? 30),
      discountMemo: (priceDiscount?.['discountMemo'] as string | null | undefined) ?? null,
    },
    shippingAddresses: shippingAddresses.map((addr, index) => ({
      id: `addr-sp01-${index + 1}`,
      alias: (addr['alias'] as string | null | undefined) ?? null,
      zipCode: (addr['zipCode'] as string | null | undefined) ?? null,
      address: String(addr['address'] ?? ''),
      phone: (addr['phone'] as string | null | undefined) ?? null,
      receiverName: (addr['receiverName'] as string | null | undefined) ?? null,
      isDefault: Boolean(addr['isDefault']),
      memo: (addr['memo'] as string | null | undefined) ?? null,
    })),
    contacts: contacts.map((contact, index) => ({
      id: `contact-sp01-${index + 1}`,
      contactName: String(contact['contactName'] ?? ''),
      position: (contact['position'] as string | null | undefined) ?? null,
      phone: (contact['phone'] as string | null | undefined) ?? null,
      email: (contact['email'] as string | null | undefined) ?? null,
      isPrimary: Boolean(contact['isPrimary']),
      memo: (contact['memo'] as string | null | undefined) ?? null,
    })),
  }
}

/** 본 환경이 mock 모드인지 — Vite import.meta.env 기반 컴파일 타임 결정. */
export function isMockMode(): boolean {
  return import.meta.env['VITE_MOCK_MODE'] === '1'
    || import.meta.env.MODE === 'development_mock'
}

/**
 * Mock token snapshot — AuthGuard 자동 인증 우회 + 헤더 chip 표시용.
 *
 * role override: dev-only — `?mockRole=MASTER` 쿼리스트링으로 강제 (PR-F1 QA 캡처용).
 * MASTER 가드 admin 페이지 캡처 시 가드 통과를 위해 사용. 미지정 시 MANAGER 기본.
 */
function _resolveMockRole(): string {
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    const params = mockLocationParams()
    const override = params.get('mockRole')
    if (override) return override
  }
  return 'MANAGER'
}

export const MOCK_AUTH = {
  token: 'mock-jwt-token',
  userId: '00000000-0000-0000-0000-000000010001',
  role: _resolveMockRole(),
  fullName: '오병승',
  partnerCode: 'P-MOCK-001',
}

/** 시드 창고 (V2 시드 4종 + Phase 2.6d 전창고 머지 검증용 신규 1종) */
const MOCK_WAREHOUSES = [
  {
    id: '11111111-1111-1111-1111-000000000001',
    code: 'HQ-001',
    name: '본사창고',
    type: 'HEADQUARTERS',
    active: true,
    address: '서울시 강남구 본사',
    displayOrder: 1,
    description: '본사 보유 메인 창고',
  },
  {
    id: '11111111-1111-1111-1111-000000000002',
    code: 'VH-001',
    name: '1호차 차량재고',
    type: 'VEHICLE',
    active: true,
    address: null,
    displayOrder: 2,
    description: '출장 차량 이동 재고 (창고원/기사 단위)',
  },
  {
    id: '11111111-1111-1111-1111-000000000003',
    code: 'CS-001',
    name: '거래처 위탁창고',
    type: 'CONSIGNMENT',
    active: true,
    address: null,
    displayOrder: 3,
    description: '거래처에 위탁한 재고 (소유권은 자사)',
  },
  {
    id: '11111111-1111-1111-1111-000000000004',
    code: 'VR-001',
    name: '가상창고',
    type: 'VIRTUAL',
    active: true,
    address: null,
    displayOrder: 4,
    description: '삼성 직배/반품/서비스 인보이스 등 비물리',
  },
  /**
   * Phase 2.6d: 전창고 머지 검증용 신규 창고.
   * batch(/inventory/balances/batch) 에는 이 창고의 잔량 row 가 없으므로
   * FE fetchProductBalancesMatrix 가 0/0/0 으로 채우는지 검증 가능.
   */
  {
    id: '11111111-1111-1111-1111-000000000005',
    code: 'BK-001',
    name: '백업창고',
    type: 'CONSIGNMENT',
    active: true,
    address: null,
    displayOrder: 5,
    description: '2.6d 전창고 머지 검증용 — batch 미포함 창고(0/0/0 표시 확인)',
  },
]

/** noUncheckedIndexedAccess 회피용 — 4 시드 명시 참조 */
const HQ_ID = MOCK_WAREHOUSES[0]!.id
const VH_ID = MOCK_WAREHOUSES[1]!.id

/**
 * Slice C: 서명 mock fixture — 1×1 빨강 PNG dataURL.
 *
 * 실제 서명은 320×200 canvas + 사용자 stroke → 5~15KB PNG. 본 fixture 는 시연/스크린샷용
 * 최소 PNG (브라우저가 비어있는 사각형으로 렌더). SignatureViewer 의 max-width fit 검증용.
 */
const MOCK_SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII='

/**
 * Slice C: 서명된 전표 1건의 시드 데이터 — slip-002 (CONFIRMED) 에 적용.
 *
 * SlipDetailPage 의 "전자서명 정보" 카드 + DispatchView 인쇄 인수자 셀 PNG 양쪽 시연.
 */
const MOCK_SIGNATURE_SEED = {
  signedAt: '2026-05-04T15:42:18+09:00',
  signerName: '김인수',
  signaturePng: MOCK_SIGNATURE_PNG,
  signatureHash: 'a3f2b1c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1',
  signatureChannel: 'MOBILE_CANVAS' as const,
  signatureShareToken: 'Xy7kP2mQrN4vL8wAbCdEfGhIjKlMnOp',
  signatureShareExpiresAt: '2026-06-03T15:42:18+09:00',
}

/**
 * 시연용 mock 전표 7건.
 * Slice A 신규 필드: `dispatcher` / `inspector` / `ownerDepartment` / `ownerFullName`
 * / `shippingAddress` / `contactPhone` 모두 포함 (Designer README.md § 2.3).
 *
 * Slice A 신규: INSPECTING status mock 2건 (slip-006, slip-007).
 */
const MOCK_SLIPS = [
  {
    id: 'slip-001',
    slipNo: '2026/05/04-1',
    slipType: 'OUTBOUND',
    slipDate: '2026-05-04',
    seqNo: 1,
    status: 'PROCESSING',
    partnerId: 'p001',
    partnerName: '주식회사 윌리-정현수',
    sourceWarehouseId: HQ_ID,
    destinationWarehouseId: null,
    deliveryTag: 'DAY',
    memo: '9시까지배송요망',
    ownerDepartment: '영업1팀',
    ownerFullName: '오병승',
    shippingAddress: '서울특별시 강남구 테헤란로 152',
    contactPhone: '010-1234-5678',
    driverName: '홍지수',
    driverPhone: '010-1234-5678',
    dispatcher: {
      userId: '00000000-0000-0000-0000-000000020001',
      fullName: '홍지수',
      signedAt: '2026-05-04T14:32:18+09:00',
    },
    inspector: null,
    // V20 신규 필드
    deliveryAddress: '서울특별시 강남구 테헤란로 152',
    supervisionAddress: null,
    projectName: '강남 오피스텔 A동 공조',
    recipientPhone: '010-1234-5678',
    paymentDueDate: '2026-05-31',
    businessNumber: '123-45-67890',
    printed: false,
  },
  {
    id: 'slip-002',
    slipNo: '2026/05/04-2',
    slipType: 'OUTBOUND',
    slipDate: '2026-05-04',
    seqNo: 2,
    status: 'CONFIRMED',
    partnerId: 'p002',
    partnerName: '○○종합건설',
    sourceWarehouseId: HQ_ID,
    destinationWarehouseId: null,
    deliveryTag: 'STACK',
    memo: '[야적] 05/04 상차 05/05 하차',
    ownerDepartment: '영업1팀',
    ownerFullName: '오병승',
    shippingAddress: '경기도 성남시 분당구 판교로 235',
    contactPhone: '031-987-6543',
    dispatcher: {
      userId: '00000000-0000-0000-0000-000000020001',
      fullName: '홍지수',
      signedAt: '2026-05-04T10:12:00+09:00',
    },
    inspector: {
      userId: '00000000-0000-0000-0000-000000020002',
      fullName: '김기철',
      signedAt: '2026-05-04T11:45:30+09:00',
    },
    // signature-slice-C: 서명 완료 시드 — SlipDetailPage / DispatchView 인쇄 양쪽 시연
    ...MOCK_SIGNATURE_SEED,
    // V20 신규 필드
    deliveryAddress: '경기도 성남시 분당구 판교로 235',
    supervisionAddress: '경기도 성남시 분당구 판교로 235',
    projectName: '판교 테크노밸리 B동',
    recipientPhone: '031-987-6543',
    paymentDueDate: '2026-05-31',
    businessNumber: '234-56-78901',
    printed: true,
  },
  {
    id: 'slip-003',
    slipNo: '2026/05/03-7',
    slipType: 'INBOUND',
    slipDate: '2026-05-03',
    seqNo: 7,
    status: 'COMPLETED',
    partnerId: 'p003',
    partnerName: '삼성전자',
    sourceWarehouseId: null,
    destinationWarehouseId: HQ_ID,
    deliveryTag: 'RETURN_TRIP',
    memo: '회차 입고',
    ownerDepartment: '구매팀',
    ownerFullName: '이정훈',
    shippingAddress: null,
    contactPhone: null,
    dispatcher: null,
    inspector: null,
  },
  {
    id: 'slip-004',
    slipNo: '2026/05/03-3',
    slipType: 'OUTBOUND',
    slipDate: '2026-05-03',
    seqNo: 3,
    status: 'ACCEPTED',
    partnerId: 'p001',
    partnerName: '주식회사 윌리-정현수',
    sourceWarehouseId: VH_ID,
    destinationWarehouseId: null,
    deliveryTag: 'DAY',
    memo: '',
    ownerDepartment: '영업1팀',
    ownerFullName: '오병승',
    shippingAddress: '서울특별시 송파구 올림픽로 300',
    contactPhone: '010-9876-5432',
    dispatcher: {
      userId: '00000000-0000-0000-0000-000000020001',
      fullName: '홍지수',
      signedAt: '2026-05-03T09:15:00+09:00',
    },
    inspector: null,
  },
  {
    id: 'slip-005',
    slipNo: '2026/05/02-12',
    slipType: 'OUTBOUND',
    slipDate: '2026-05-02',
    seqNo: 12,
    status: 'DRAFT',
    partnerId: 'p004',
    partnerName: '한일냉동기술',
    sourceWarehouseId: HQ_ID,
    destinationWarehouseId: null,
    deliveryTag: 'GYEONGDONG_FREIGHT',
    memo: '경동화물',
    ownerDepartment: '영업2팀',
    ownerFullName: '박서연',
    shippingAddress: null,
    contactPhone: null,
    dispatcher: null,
    inspector: null,
  },
  // Slice A 신규: INSPECTING status mock (검수 단계 시연용)
  {
    id: 'slip-006',
    slipNo: '2026/05/04-3',
    slipType: 'OUTBOUND',
    slipDate: '2026-05-04',
    seqNo: 3,
    status: 'INSPECTING',
    partnerId: 'p001',
    partnerName: '주식회사 윌리-정현수',
    sourceWarehouseId: HQ_ID,
    destinationWarehouseId: null,
    deliveryTag: 'DAY',
    memo: '검수 진행 중',
    ownerDepartment: '영업1팀',
    ownerFullName: '오병승',
    shippingAddress: '서울특별시 마포구 양화로 45',
    contactPhone: '010-2222-3333',
    dispatcher: {
      userId: '00000000-0000-0000-0000-000000020001',
      fullName: '홍지수',
      signedAt: '2026-05-04T13:00:00+09:00',
    },
    inspector: {
      userId: '00000000-0000-0000-0000-000000020002',
      fullName: '김기철',
      signedAt: '2026-05-04T16:45:02+09:00',
    },
  },
  {
    id: 'slip-007',
    slipNo: '2026/05/04-4',
    slipType: 'OUTBOUND',
    slipDate: '2026-05-04',
    seqNo: 4,
    status: 'INSPECTING',
    partnerId: 'p002',
    partnerName: '○○종합건설',
    sourceWarehouseId: HQ_ID,
    destinationWarehouseId: null,
    deliveryTag: 'STACK',
    memo: '검수 대기 → 시작',
    ownerDepartment: '영업2팀',
    ownerFullName: '박서연',
    shippingAddress: '인천광역시 연수구 송도과학로 32',
    contactPhone: '032-555-7777',
    dispatcher: {
      userId: '00000000-0000-0000-0000-000000020001',
      fullName: '홍지수',
      signedAt: '2026-05-04T14:00:00+09:00',
    },
    inspector: {
      userId: '00000000-0000-0000-0000-000000020002',
      fullName: '김기철',
      signedAt: '2026-05-04T17:20:00+09:00',
    },
  },
]

/** 시연용 mock 이동전표 5건 */
const MOCK_TRANSFERS = [
  {
    id: 'tr-001',
    transferNo: '2026/05/04-1',
    sourceWarehouseId: HQ_ID,
    sourceWarehouseCode: 'HQ-001',
    destinationWarehouseId: VH_ID,
    destinationWarehouseCode: 'VH-001',
    reason: 'REBALANCE',
    reasonDetail: '5월 1주차 차량 재배치',
    status: 'APPROVED',
    requesterId: '00000000-0000-0000-0000-000000010001',
    approverId: '00000000-0000-0000-0000-000000010002',
    requestedAt: '2026-05-04T09:10:00',
    approvedAt: '2026-05-04T09:30:00',
    shippedAt: null,
    receivedAt: null,
    confirmedAt: null,
  },
  {
    id: 'tr-002',
    transferNo: '2026/05/03-2',
    sourceWarehouseId: VH_ID,
    sourceWarehouseCode: 'VH-001',
    destinationWarehouseId: HQ_ID,
    destinationWarehouseCode: 'HQ-001',
    reason: 'CONSOLIDATE',
    reasonDetail: '차량 잔여재고 본사 회수',
    status: 'CONFIRMED',
    requesterId: '00000000-0000-0000-0000-000000010001',
    approverId: '00000000-0000-0000-0000-000000010002',
    requestedAt: '2026-05-03T08:00:00',
    approvedAt: '2026-05-03T08:15:00',
    shippedAt: '2026-05-03T10:00:00',
    receivedAt: '2026-05-03T15:30:00',
    confirmedAt: '2026-05-03T16:00:00',
  },
  {
    id: 'tr-003',
    transferNo: '2026/05/04-3',
    sourceWarehouseId: HQ_ID,
    sourceWarehouseCode: 'HQ-001',
    destinationWarehouseId: VH_ID,
    destinationWarehouseCode: 'VH-001',
    reason: 'URGENT',
    reasonDetail: '긴급 출장 보충',
    status: 'REQUESTED',
    requesterId: '00000000-0000-0000-0000-000000010001',
    approverId: null,
    requestedAt: '2026-05-04T11:00:00',
    approvedAt: null,
    shippedAt: null,
    receivedAt: null,
    confirmedAt: null,
  },
  {
    id: 'tr-004',
    transferNo: '2026/05/04-4',
    sourceWarehouseId: HQ_ID,
    sourceWarehouseCode: 'HQ-001',
    destinationWarehouseId: VH_ID,
    destinationWarehouseCode: 'VH-001',
    reason: 'MAINTENANCE',
    reasonDetail: '점검 후 회수',
    status: 'SHIPPED',
    requesterId: '00000000-0000-0000-0000-000000010001',
    approverId: '00000000-0000-0000-0000-000000010002',
    requestedAt: '2026-05-04T07:00:00',
    approvedAt: '2026-05-04T07:30:00',
    shippedAt: '2026-05-04T09:45:00',
    receivedAt: null,
    confirmedAt: null,
  },
  {
    id: 'tr-005',
    transferNo: '2026/05/02-7',
    sourceWarehouseId: HQ_ID,
    sourceWarehouseCode: 'HQ-001',
    destinationWarehouseId: VH_ID,
    destinationWarehouseCode: 'VH-001',
    reason: 'OTHER',
    reasonDetail: null,
    status: 'CANCELED',
    requesterId: '00000000-0000-0000-0000-000000010001',
    approverId: null,
    requestedAt: '2026-05-02T14:00:00',
    approvedAt: null,
    shippedAt: null,
    receivedAt: null,
    confirmedAt: null,
  },
]

/** 모델명 lookup 시연용 — 5개 mock product (대소문자 구분 없음). */
const MOCK_PRODUCTS_BY_MODEL: Record<
  string,
  { productId: string; modelName: string; productName: string; sellingPrice: string }
> = {
  AJ040RXH4BC1: {
    productId: 'p-aj040',
    modelName: 'AJ040RXH4BC1',
    productName: '시스템에어컨 4Way 4HP',
    sellingPrice: '1850000',
  },
  AJ052RXH5BC1: {
    productId: 'p-aj052',
    modelName: 'AJ052RXH5BC1',
    productName: '시스템에어컨 4Way 5HP',
    sellingPrice: '2120000',
  },
  AJ036NCH3CH: {
    productId: 'p-aj036',
    modelName: 'AJ036NCH3CH',
    productName: '천장형 1Way 3HP',
    sellingPrice: '1450000',
  },
  AJ100NCDKH: {
    productId: 'p-aj100',
    modelName: 'AJ100NCDKH',
    productName: '실외기 10HP',
    sellingPrice: '4200000',
  },
  'MWR-WE10N': {
    productId: 'p-mwr10',
    modelName: 'MWR-WE10N',
    productName: '유선 리모컨 (WE10N)',
    sellingPrice: '85000',
  },
}

/**
 * 라인 시연용 — 상세 화면 라인 표시.
 * Slice A: `specification` 필드 추가 (피드백 #4 / Designer components.md § 3).
 */
const SAMPLE_LINES = [
  {
    id: 'line-001',
    productId: 'p-aj040',
    productName: '시스템에어컨 4Way 4HP',
    modelName: 'AJ040RXH4BC1',
    specification: '4HP', // Slice A
    quantity: 2,
    unitPrice: '1850000',
    lineTotal: '3700000',
    note: null,
  },
  {
    id: 'line-002',
    productId: 'p-mwr10',
    productName: '유선 리모컨 (WE10N)',
    modelName: 'MWR-WE10N',
    specification: '220V', // Slice A
    quantity: 2,
    unitPrice: '85000',
    lineTotal: '170000',
    note: null,
  },
  {
    id: 'line-003',
    productId: 'p-pc1nw',
    productName: 'WIFI 판넬',
    modelName: 'PC1NWSK3NW',
    specification: null, // Slice A — 빈 값 허용 ('-' 표시)
    quantity: 1,
    unitPrice: '120000',
    lineTotal: '120000',
    note: null,
  },
]

const SAMPLE_TRANSFER_LINES = [
  {
    id: 'tline-001',
    productId: 'p-aj040',
    requestedQuantity: 5,
    shippedQuantity: 0,
    receivedQuantity: 0,
  },
  {
    id: 'tline-002',
    productId: 'p-mwr10',
    requestedQuantity: 5,
    shippedQuantity: 0,
    receivedQuantity: 0,
  },
]

// ============================================================================
// P1-3: 안전재고 알림 mock seed data
// ============================================================================

/**
 * 안전재고 임계 미만 알림 시드 — availableQty < threshold 인 3건.
 * UUID 비공개 가드: productCode / modelName / warehouseCode 만 노출.
 */
/**
 * BE `SafetyStockAlertResponse` record 와 1:1 정합 (TM PR #143 cross-check).
 * V8 seed BELOW 3건과 동일 결정적 UUID 사용.
 */
const MOCK_SAFETY_STOCK_ALERTS = [
  {
    productId: 'a0a0a0a0-0000-0000-0000-000000000002',
    productCode: 'AJ056RXH4BC1',
    productName: '시스템에어컨 멀티 5.6kW',
    warehouseId: '11111111-1111-1111-1111-000000000001',
    warehouseName: 'HQ 본사 창고',
    threshold: 50,
    currentQty: 43,
    shortage: 7,
    note: '[DEV-SEED] AJ056 멀티 HQ 안전재고 — 부족 상태',
  },
  {
    productId: 'a0a0a0a0-0000-0000-0000-000000000003',
    productCode: 'AM100RXMDH',
    productName: '시스템에어컨 실외기 10마력',
    warehouseId: '11111111-1111-1111-1111-000000000001',
    warehouseName: 'HQ 본사 창고',
    threshold: 30,
    currentQty: 27,
    shortage: 3,
    note: '[DEV-SEED] AM100 실외기 HQ 안전재고 — 부족 상태',
  },
  {
    productId: 'a0a0a0a0-0000-0000-0000-000000000001',
    productCode: 'AJ040RXH4BC1',
    productName: '시스템에어컨 싱글 4.0kW',
    warehouseId: '11111111-1111-1111-1111-000000000002',
    warehouseName: 'VH 분원 창고',
    threshold: 10,
    currentQty: 6,
    shortage: 4,
    note: '[DEV-SEED] AJ040 싱글 VH 안전재고 — 부족 상태',
  },
]

// Issue 4 Slice 2 — 통합 알림 센터 mock seed
const MOCK_NOTIFICATION_CENTER: Array<{
  id: string
  channel: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  title: string
  body: string | null
  deeplink: string | null
  createdAt: string
  readAt: string | null
}> = [
  {
    id: 'n0000000-0000-0000-0000-000000000001',
    channel: 'SAFETY_STOCK',
    severity: 'WARNING',
    title: 'AJ056RXH4BC1 HQ 본사 창고 안전재고 부족',
    body: '현재 43 / 임계 50 (부족 -7)',
    deeplink: '/inventory/safety-stock-alerts',
    createdAt: '2026-05-22T10:00:00',
    readAt: null,
  },
  {
    id: 'n0000000-0000-0000-0000-000000000002',
    channel: 'MESSENGER',
    severity: 'INFO',
    title: '김미선 → 새 메시지',
    body: '김종 압축기 견적 검토 부탁드립니다',
    deeplink: '/messenger',
    createdAt: '2026-05-22T10:30:00',
    readAt: null,
  },
  {
    id: 'n0000000-0000-0000-0000-000000000004',
    channel: 'APPROVAL',
    severity: 'INFO',
    title: '회계 수정 요청 — 홍길동',
    body: '수정 요청: 1월 마감 후 발견된 매입 누락 건 수정',
    deeplink: '/admin/accounting-edit-requests',
    createdAt: '2026-05-26T10:00:00',
    readAt: null,
  },
  {
    id: 'n0000000-0000-0000-0000-000000000003',
    channel: 'ECOUNT_IMPORT',
    severity: 'CRITICAL',
    title: 'mig-2 product import 실패',
    body: '2836 row rejected (Eureka product-service stale)',
    deeplink: '/admin/ecount/reimport',
    createdAt: '2026-05-22T09:00:00',
    readAt: null,
  },
]

interface MockDispatchSmsHistoryRow {
  id: string
  programType: string
  saveMode: string
  topic: string
  createdAt: string
  createdBy: string
  requestParams: Record<string, unknown>
  rowCount: number
  responsePayload?: unknown
}

const mockDispatchSmsHistoryRows: MockDispatchSmsHistoryRow[] = []

/**
 * URL + method 매칭으로 mock 응답을 반환. 매칭 실패 시 null.
 */
export function getMockResponse(config: AxiosRequestConfig): unknown | null {
  const method = (config.method ?? 'get').toUpperCase()
  const url = config.url ?? ''

  // POST /auth/login → 토큰 응답
  if (method === 'POST' && url.endsWith('/auth/login')) {
    return envelope({
      token: MOCK_AUTH.token,
      userId: MOCK_AUTH.userId,
      role: MOCK_AUTH.role,
      fullName: MOCK_AUTH.fullName,
      partnerCode: MOCK_AUTH.partnerCode,
    })
  }

  // GET /users/me/is-executive-office — 대표실 부서 소속 여부 판정.
  // ?mockRole=MASTER + ?mockDepartment=대표실 시 isExecutiveOffice: true.
  // MASTER 이하 또는 대표실 미소속 시 false.
  // [PR-HR] AdminLayout 진입 가드용 mock.
  if (method === 'GET' && url.includes('/users/me/is-executive-office')) {
    const params =
      typeof window !== 'undefined' && window.location
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams()
    const mockRole = params.get('mockRole') ?? MOCK_AUTH.role
    const mockDept = params.get('mockDepartment') ?? ''
    const isExecutiveOffice =
      mockRole === 'MASTER' && (mockDept === '대표실' || mockDept === '')
    return envelope({
      isExecutiveOffice,
      departmentName: isExecutiveOffice ? '대표실' : (mockDept || '영업1팀'),
    })
  }

  // GET /api/notifications/my
  if (method === 'GET' && url.endsWith('/api/notifications/my')) {
    return envelope(MOCK_NOTIFICATION_CENTER.filter((n) => n.readAt === null))
  }

  // GET /api/notifications/history?page=&size=
  if (method === 'GET' && url.includes('/api/notifications/history')) {
    return envelope({
      content: MOCK_NOTIFICATION_CENTER,
      number: 0,
      size: 50,
      totalElements: MOCK_NOTIFICATION_CENTER.length,
      totalPages: 1,
    })
  }

  // POST /api/notifications/{id}/acknowledge
  const ackMatch = url.match(/\/api\/notifications\/([^/]+)\/acknowledge$/)
  if (method === 'POST' && ackMatch) {
    const id = ackMatch[1]!
    const target = MOCK_NOTIFICATION_CENTER.find((n) => n.id === id)
    if (target) target.readAt = new Date().toISOString()
    return envelope(null)
  }

  // GET /inventory/warehouses
  if (method === 'GET' && url.endsWith('/inventory/warehouses')) {
    return envelope(MOCK_WAREHOUSES)
  }

  // POST /inventory/warehouses → 신규 창고 1건
  if (method === 'POST' && url.endsWith('/inventory/warehouses')) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as Record<string, unknown>
    return envelope({
      id: 'new-' + Date.now(),
      code: body['code'],
      name: body['name'],
      type: body['type'],
      address: body['address'],
      displayOrder: body['displayOrder'] ?? 0,
      description: body['description'],
    })
  }

  // GET /api/products?q=... — AC-2 품목 자동완성 검색 (product-service `/products?q=` 프록시)
  if (method === 'GET' && (url.endsWith('/api/products') || url.includes('/api/products?'))) {
    const q = String(config.params?.['q'] ?? '').toLowerCase()
    const allProducts = Object.values(MOCK_PRODUCTS_BY_MODEL)
    const matched = q
      ? allProducts.filter(
          (p) =>
            p.modelName.toLowerCase().includes(q) ||
            p.productName.toLowerCase().includes(q),
        )
      : allProducts
    // ApiEnvelope<Page<ProductSummaryResponse>> 형태
    return envelope({
      content: matched.map((p) => ({
        id: p.productId,
        name: p.productName,
        modelName: p.modelName,
        productCode: null,
        categoryId: null,
        sellingPrice: p.sellingPrice,
        status: 'ACTIVE',
      })),
      totalElements: matched.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // GET /slips/lookup-product?modelName=...
  if (method === 'GET' && url.includes('/slips/lookup-product')) {
    const modelName = (config.params?.['modelName'] ?? '') as string
    const found = MOCK_PRODUCTS_BY_MODEL[modelName.toUpperCase()]
      ?? MOCK_PRODUCTS_BY_MODEL[modelName]
    if (found) {
      return envelope(found)
    }
    // 미존재는 mock 환경에서도 404 시뮬레이션 — null 반환 시 axios 가 실제 호출 시도
    // 하지만 백엔드 미부팅이라 실패. 간단히 envelope 안에 not-found 표시 대신
    // 호출자에서 에러 처리하도록 빈 객체 + status 200 으로 진행 (mock 한계).
    // → 화면 동작 확인용으로는 sample 1건 항상 반환:
    return envelope({
      productId: 'p-fallback',
      modelName,
      productName: `(샘플) ${modelName}`,
      sellingPrice: '1000000',
    })
  }

  // ==========================================================================
  // PR-H1: slip 코멘트 mock (in-memory per-context — multi-context QA 캡처 지원)
  // - 화면 노출 = authorName + body + createdAt (UUID 비공개 가드)
  // - addInitScript 로 globalThis.__SAMHAN_MOCK_COMMENTS_SEED 사전 주입 가능
  //   (capture-pr-h1.js multi-context "B 가 SSE 로 수신" 시뮬레이션)
  // ==========================================================================
  type MockSlipComment = {
    id: string
    authorId: string
    authorName: string
    body: string
    createdAt: string
  }
  const g = globalThis as unknown as {
    __SAMHAN_MOCK_COMMENTS?: Record<string, MockSlipComment[]>
    __SAMHAN_MOCK_COMMENTS_SEED?: Record<string, MockSlipComment[]>
  }
  if (!g.__SAMHAN_MOCK_COMMENTS) {
    g.__SAMHAN_MOCK_COMMENTS = {}
    // capture 스크립트가 미리 주입한 seed 가 있으면 1회 흡수
    if (g.__SAMHAN_MOCK_COMMENTS_SEED) {
      for (const [k, v] of Object.entries(g.__SAMHAN_MOCK_COMMENTS_SEED)) {
        g.__SAMHAN_MOCK_COMMENTS[k] = [...v]
      }
    }
  }
  const commentsStore = g.__SAMHAN_MOCK_COMMENTS

  // POST /api/v1/slips/{slipId}/comments — 신규 코멘트
  const commentPostMatch = url.match(/\/slips\/([^/?]+)\/comments$/)
  if (method === 'POST' && commentPostMatch) {
    const slipId = commentPostMatch[1]!
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      body?: string
    }
    const created: MockSlipComment = {
      id: `mock-comment-${Date.now()}`,
      authorId: MOCK_AUTH.userId,
      authorName: MOCK_AUTH.fullName,
      body: body.body ?? '',
      createdAt: new Date().toISOString(),
    }
    if (!commentsStore[slipId]) commentsStore[slipId] = []
    commentsStore[slipId].push(created)
    return envelope(created)
  }

  // GET /api/v1/slips/{slipId}/comments?limit=N — 백필
  const commentGetMatch = url.match(/\/slips\/([^/?]+)\/comments(\?.*)?$/)
  if (method === 'GET' && commentGetMatch) {
    const slipId = commentGetMatch[1]!
    const list = commentsStore[slipId] ?? []
    return envelope(list)
  }

  // ==========================================================================
  // PR-H2: slip audit-log mock (in-memory per-context — capture-pr-h2.js 지원)
  // - 화면 노출 = actorName (UUID 비공개 가드, actorId 는 색상 hash 입력 전용)
  // - addInitScript 로 globalThis.__SAMHAN_MOCK_AUDIT_LOGS_SEED 사전 주입 가능
  //   (B context 가 "A 가 메모 수정 → SSE 로 audit row 수신" 시뮬레이션)
  // ==========================================================================
  type MockSlipAuditLog = {
    revisionNo: number
    field: string
    beforeValue: string | null
    afterValue: string | null
    actorId: string
    actorName: string
    changedAt: string
  }
  const ga = globalThis as unknown as {
    __SAMHAN_MOCK_AUDIT_LOGS?: Record<string, MockSlipAuditLog[]>
    __SAMHAN_MOCK_AUDIT_LOGS_SEED?: Record<string, MockSlipAuditLog[]>
  }
  if (!ga.__SAMHAN_MOCK_AUDIT_LOGS) {
    ga.__SAMHAN_MOCK_AUDIT_LOGS = {}
    if (ga.__SAMHAN_MOCK_AUDIT_LOGS_SEED) {
      for (const [k, v] of Object.entries(ga.__SAMHAN_MOCK_AUDIT_LOGS_SEED)) {
        ga.__SAMHAN_MOCK_AUDIT_LOGS[k] = [...v]
      }
    }
  }
  const auditLogsStore = ga.__SAMHAN_MOCK_AUDIT_LOGS

  // GET /api/v1/slips/{slipId}/audit-logs — audit timeline 백필 (revisionNo 내림차순)
  const auditLogsGetMatch = url.match(/\/slips\/([^/?]+)\/audit-logs(\?.*)?$/)
  if (method === 'GET' && auditLogsGetMatch) {
    const slipId = auditLogsGetMatch[1]!
    const list = (auditLogsStore[slipId] ?? []).slice().sort(
      (a, b) => b.revisionNo - a.revisionNo,
    )
    return envelope(list)
  }

  // Phase 2.1: POST /api/v1/slips/{slipId}/revisions/{revisionNo}/restore — 특정 시점 복원.
  // restore POST 가 revisions GET 보다 먼저 (더 구체적인 path) 매칭되어야 함.
  const revisionRestoreMatch = url.match(/\/slips\/([^/?]+)\/revisions\/(\d+)\/restore$/)
  if (method === 'POST' && revisionRestoreMatch) {
    const slipId = revisionRestoreMatch[1]!
    const found = (MOCK_SLIPS.find((s) => s.id === slipId) ?? MOCK_SLIPS[0]!) as Record<string, unknown>
    // 복원 결과는 SlipDetail — 현재 mock slip 을 SAVED 로 되돌린 스냅샷으로 응답.
    return envelope({
      ...found,
      status: 'SAVED',
      lines: SAMPLE_LINES,
    })
  }

  // Phase 2.1: GET /api/v1/slips/{slipId}/revisions — 버전이력 목록 (최신 우선).
  // 결정적 fixture 2건 (rev2 EDIT lineAdded=1, rev1 CREATE).
  const revisionsGetMatch = url.match(/\/slips\/([^/?]+)\/revisions(\?.*)?$/)
  if (method === 'GET' && revisionsGetMatch) {
    const slipId = revisionsGetMatch[1]!
    const slip = MOCK_SLIPS.find((s) => s.id === slipId) ?? MOCK_SLIPS[0]!
    const slipNo = slip.slipNo
    return envelope([
      {
        revisionNo: 2,
        revisionType: 'EDIT',
        sourceRevisionNo: null,
        slipNo,
        slipDate: slip.slipDate,
        actorName: MOCK_AUTH.fullName,
        createdAt: '2026-05-29T14:32:18',
        changeSummary: { headerChanged: 0, lineAdded: 1, lineRemoved: 0, lineModified: 0 },
      },
      {
        revisionNo: 1,
        revisionType: 'CREATE',
        sourceRevisionNo: null,
        slipNo,
        slipDate: slip.slipDate,
        actorName: MOCK_AUTH.fullName,
        createdAt: '2026-05-29T09:10:00',
        changeSummary: { headerChanged: 0, lineAdded: 0, lineRemoved: 0, lineModified: 0 },
      },
    ])
  }

  // ==========================================================================
  // Phase 2.2: estimate 버전이력/복원/상세 — `/api/v1/slips/estimates/{id}...`
  //   slip list match (`url.includes('/slips')`, 아래) 가 estimates path 를 가로채므로
  //   반드시 그 앞단(여기) 에 배치한다. restore(POST) → revisions(GET) → detail(GET) 순
  //   (더 구체적인 path 우선). slip {id} revisions/detail match 는 estimates 가 사이에
  //   끼어 잡히지 않아 충돌 없다.
  // ==========================================================================

  // POST /api/v1/slips/estimates/{id}/revisions/{n}/restore — 특정 시점 복원.
  const estimateRestoreMatch = url.match(/\/slips\/estimates\/([^/?]+)\/revisions\/(\d+)\/restore$/)
  if (method === 'POST' && estimateRestoreMatch) {
    const id = estimateRestoreMatch[1]!
    return envelope(buildMockEstimateDetail(id))
  }

  // GET /api/v1/slips/estimates/{id}/revisions — 버전이력 목록 (최신 우선).
  // 결정적 fixture 2건 (rev2 EDIT lineAdded=1, rev1 CREATE).
  const estimateRevisionsGetMatch = url.match(/\/slips\/estimates\/([^/?]+)\/revisions(\?.*)?$/)
  if (method === 'GET' && estimateRevisionsGetMatch) {
    const id = estimateRevisionsGetMatch[1]!
    const detail = buildMockEstimateDetail(id)
    return envelope([
      {
        revisionNo: 2,
        revisionType: 'EDIT',
        sourceRevisionNo: null,
        estimateNo: detail.estimateNo,
        estimateDate: detail.estimateDate,
        actorName: MOCK_AUTH.fullName,
        createdAt: '2026-05-29T14:32:18',
        changeSummary: { headerChanged: 0, lineAdded: 1, lineRemoved: 0, lineModified: 0 },
      },
      {
        revisionNo: 1,
        revisionType: 'CREATE',
        sourceRevisionNo: null,
        estimateNo: detail.estimateNo,
        estimateDate: detail.estimateDate,
        actorName: MOCK_AUTH.fullName,
        createdAt: '2026-05-29T09:10:00',
        changeSummary: { headerChanged: 0, lineAdded: 0, lineRemoved: 0, lineModified: 0 },
      },
    ])
  }

  // GET /api/v1/slips/estimates/{id} (단건 상세) — EstimateDetail shape.
  const estimateSlipsDetailMatch = url.match(/\/slips\/estimates\/([^/?]+)$/)
  if (method === 'GET' && estimateSlipsDetailMatch && !url.includes('/print')) {
    const id = estimateSlipsDetailMatch[1]!
    return envelope(buildMockEstimateDetail(id))
  }

  // PATCH /api/v1/slips/{slipId}/audit/overlay — 단일 필드 수정 + audit row INSERT
  const auditOverlayMatch = url.match(/\/slips\/([^/?]+)\/audit\/overlay$/)
  if (method === 'PATCH' && auditOverlayMatch) {
    const slipId = auditOverlayMatch[1]!
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      fieldName?: string
      newValue?: string
    }
    const list = auditLogsStore[slipId] ?? []
    const nextRevision = list.length === 0 ? 1 : Math.max(...list.map((l) => l.revisionNo)) + 1
    // 현 mock slip 에서 oldValue 추출 (없으면 빈 문자열)
    const slip = MOCK_SLIPS.find((s) => s.id === slipId) as Record<string, unknown> | undefined
    const oldValue = slip ? (slip[body.fieldName ?? ''] as string | null | undefined) ?? null : null
    const created: MockSlipAuditLog = {
      revisionNo: nextRevision,
      field: body.fieldName ?? '',
      beforeValue: oldValue,
      afterValue: body.newValue ?? null,
      actorId: MOCK_AUTH.userId,
      actorName: MOCK_AUTH.fullName,
      changedAt: new Date().toISOString(),
    }
    if (!auditLogsStore[slipId]) auditLogsStore[slipId] = []
    auditLogsStore[slipId].push(created)
    return envelope({ revisionNo: nextRevision, message: '수정되었습니다' })
  }

  // POST /api/v1/slips/{slipId}/revert/{revisionNo} — 특정 revision 으로 복원
  const auditRevertMatch = url.match(/\/slips\/([^/?]+)\/revert\/(\d+)$/)
  if (method === 'POST' && auditRevertMatch) {
    const slipId = auditRevertMatch[1]!
    const list = auditLogsStore[slipId] ?? []
    const nextRevision = list.length === 0 ? 1 : Math.max(...list.map((l) => l.revisionNo)) + 1
    return envelope({ newRevisionNo: nextRevision, message: '복원되었습니다' })
  }

  // GET /slips/{id} (단건 상세) — UUID-like 또는 'slip-001' 패턴
  const slipDetailMatch = url.match(/\/slips\/([^/?]+)$/)
  if (method === 'GET' && slipDetailMatch && !url.includes('lookup-product') && !url.match(/\/slips\/cleanup/)) {
    const id = slipDetailMatch[1]!
    const found = MOCK_SLIPS.find((s) => s.id === id) ?? MOCK_SLIPS[0]!
    return envelope({
      ...found,
      lines: SAMPLE_LINES,
    })
  }

  // ==========================================================================
  // signature-slice-C: 전자서명 mock endpoint
  // ==========================================================================

  // POST /public/batches/{token}/slips/{slipNo}/signature — 모바일 서명 저장
  const publicSignatureMatch = url.match(
    /\/public\/batches\/([^/]+)\/slips\/([^/]+)\/signature$/,
  )
  if (method === 'POST' && publicSignatureMatch) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      signerName?: string
      signaturePngBase64?: string
      clientHash?: string
    }
    const now = new Date()
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    return envelope({
      signedAt: now.toISOString(),
      shareToken: `mock-share-${Date.now().toString(36)}`,
      shareTokenExpiresAt: expires.toISOString(),
      signatureHash:
        body.clientHash
        ?? 'a3f2b1c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1',
    })
  }

  // GET /public/signatures/{shareToken} — 인수자 view
  const publicShareMatch = url.match(/\/public\/signatures\/([^/?]+)$/)
  if (method === 'GET' && publicShareMatch) {
    return envelope({
      slip: {
        slipNo: '2026-05-04-2',
        partnerName: '○○종합건설',
        deliveryAddress: '경기도 성남시 분당구 판교로 235',
        deliveryDate: '2026-05-04',
        lines: [
          { itemName: '시스템에어컨 4Way 4HP (AJ040RXH4BC1)', quantity: 2, uom: 'EA' },
          { itemName: '유선 리모컨 (MWR-WE10N)', quantity: 2, uom: 'EA' },
          { itemName: 'WIFI 판넬 (PC1NWSK3NW)', quantity: 1, uom: 'EA' },
        ],
        totalAmount: 3990000,
      },
      signature: {
        signerName: MOCK_SIGNATURE_SEED.signerName,
        signedAt: MOCK_SIGNATURE_SEED.signedAt,
        signaturePngBase64: MOCK_SIGNATURE_SEED.signaturePng,
        signatureHashShort: MOCK_SIGNATURE_SEED.signatureHash.slice(0, 8),
      },
      shareTokenExpiresAt: MOCK_SIGNATURE_SEED.signatureShareExpiresAt,
    })
  }

  // GET /api/slips/{id}/signature — 관리자 조회 (admin)
  const adminSignatureGetMatch = url.match(/\/slips\/([^/]+)\/signature$/)
  if (method === 'GET' && adminSignatureGetMatch) {
    return envelope({
      signedAt: MOCK_SIGNATURE_SEED.signedAt,
      signerName: MOCK_SIGNATURE_SEED.signerName,
      signaturePngBase64: MOCK_SIGNATURE_SEED.signaturePng,
      signatureHash: MOCK_SIGNATURE_SEED.signatureHash,
      signatureChannel: MOCK_SIGNATURE_SEED.signatureChannel,
      shareToken: MOCK_SIGNATURE_SEED.signatureShareToken,
      shareTokenExpiresAt: MOCK_SIGNATURE_SEED.signatureShareExpiresAt,
    })
  }

  // DELETE /api/slips/{id}/signature?reason=... — 무효화 (MASTER only)
  const adminSignatureDeleteMatch = url.match(/\/slips\/([^/]+)\/signature$/)
  if (method === 'DELETE' && adminSignatureDeleteMatch) {
    return envelope(null)
  }

  // ============================================================================
  // 판매/구매 조회 (SalesQueryPage / PurchaseQueryPage) — 풍성한 컬럼 mock
  // GET /slips/query — 신규 필드 포함 10+ rows (페이지네이션 검증용)
  // ============================================================================
  if (method === 'GET' && url.includes('/slips/query')) {
    const slipTypeMatch = url.match(/[?&]slipType=([^&]+)/)
    const slipType = slipTypeMatch?.[1]
    const pageMatch = url.match(/[?&]page=(\d+)/)
    const pageNo = parseInt(pageMatch?.[1] ?? '0', 10)
    const sizeMatch = url.match(/[?&]size=(\d+)/)
    const pageSize = parseInt(sizeMatch?.[1] ?? '50', 10)

    /** 판매(OUTBOUND) 조회 12건 mock rows */
    const OUTBOUND_QUERY_ROWS = [
      {
        id: 'sq-001', slipType: 'OUTBOUND', slipNo: '2026/05/10-1',
        slipDate: '2026-05-10', status: 'CONFIRMED', partnerName: '주식회사 윌리-정현수',
        partnerCode: 'WR-001', businessNumber: '123-45-67890',
        deliveryAddress: '서울특별시 강남구 테헤란로 152',
        supervisionAddress: '서울 강남구 삼성동 100', projectName: '강남 오피스텔 A동',
        recipientPhone: '010-1234-5678', paymentDueDate: '2026-05-31',
        printed: true, memo: '9시까지 배송 요망', totalAmount: 3870000, totalQuantity: 4,
        salesPersonName: '오병승', editHistoryCount: 2,
        deliveryTag: 'DAY', deliveryTagLabel: '당일',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000001', destinationWarehouseId: null,
      },
      {
        id: 'sq-002', slipType: 'OUTBOUND', slipNo: '2026/05/10-2',
        slipDate: '2026-05-10', status: 'SAVED', partnerName: '○○종합건설',
        partnerCode: 'OO-002', businessNumber: '234-56-78901',
        deliveryAddress: '경기도 성남시 분당구 판교로 235',
        supervisionAddress: null, projectName: null,
        recipientPhone: '031-987-6543', paymentDueDate: '2026-05-31',
        printed: false, memo: '[야적] 05/10 상차 05/11 하차', totalAmount: 5240000, totalQuantity: 3,
        salesPersonName: '박서연', editHistoryCount: 0,
        deliveryTag: 'STACK', deliveryTagLabel: '야적',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000001', destinationWarehouseId: null,
      },
      {
        id: 'sq-003', slipType: 'OUTBOUND', slipNo: '2026/05/09-5',
        slipDate: '2026-05-09', status: 'SHIPPING', partnerName: '한일냉동기술',
        partnerCode: 'HI-003', businessNumber: '345-67-89012',
        deliveryAddress: '부산광역시 해운대구 센텀시티 100',
        supervisionAddress: '부산 해운대구 센텀 A빌딩 3F', projectName: '센텀 물류센터 냉동 공사',
        recipientPhone: '051-234-5678', paymentDueDate: '2026-06-15',
        printed: true, memo: '경동화물 발송 확인 필요', totalAmount: 8400000, totalQuantity: 6,
        salesPersonName: '이정훈', editHistoryCount: 1,
        deliveryTag: 'GYEONGDONG_FREIGHT', deliveryTagLabel: '경동화물',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000001', destinationWarehouseId: null,
      },
      {
        id: 'sq-004', slipType: 'OUTBOUND', slipNo: '2026/05/09-3',
        slipDate: '2026-05-09', status: 'PROCESSING', partnerName: '삼성물산 건설부문',
        partnerCode: 'SM-004', businessNumber: '456-78-90123',
        deliveryAddress: '인천광역시 연수구 송도과학로 32',
        supervisionAddress: '인천 연수구 송도 B빌딩', projectName: '송도 국제도시 HVAC',
        recipientPhone: '032-555-7777', paymentDueDate: null,
        printed: false, memo: null, totalAmount: 12600000, totalQuantity: 8,
        salesPersonName: '오병승', editHistoryCount: 3,
        deliveryTag: 'REGION', deliveryTagLabel: '지방',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000002', destinationWarehouseId: null,
      },
      {
        id: 'sq-005', slipType: 'OUTBOUND', slipNo: '2026/05/08-11',
        slipDate: '2026-05-08', status: 'CONFIRMED', partnerName: '대림산업',
        partnerCode: 'DL-005', businessNumber: '567-89-01234',
        deliveryAddress: '대전광역시 유성구 테크노파크로 50',
        supervisionAddress: null, projectName: '대전 테크노파크 공조 설치',
        recipientPhone: '042-888-9999', paymentDueDate: '2026-05-30',
        printed: true, memo: '긴급 — 당일 도착 필수', totalAmount: 2100000, totalQuantity: 2,
        salesPersonName: '박서연', editHistoryCount: 0,
        deliveryTag: 'DAY', deliveryTagLabel: '당일',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000001', destinationWarehouseId: null,
      },
      {
        id: 'sq-006', slipType: 'OUTBOUND', slipNo: '2026/05/08-7',
        slipDate: '2026-05-08', status: 'SENT', partnerName: '현대건설',
        partnerCode: 'HD-006', businessNumber: '678-90-12345',
        deliveryAddress: '서울특별시 송파구 올림픽로 300',
        supervisionAddress: '서울 송파 현장사무소', projectName: '잠실 주상복합 A타워',
        recipientPhone: '02-1234-5678', paymentDueDate: '2026-05-31',
        printed: false, memo: null, totalAmount: 6720000, totalQuantity: 5,
        salesPersonName: '이정훈', editHistoryCount: 0,
        deliveryTag: 'LOGEN', deliveryTagLabel: '로젠택배',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000001', destinationWarehouseId: null,
      },
      {
        id: 'sq-007', slipType: 'OUTBOUND', slipNo: '2026/05/07-2',
        slipDate: '2026-05-07', status: 'DELIVERED', partnerName: '롯데건설',
        partnerCode: 'LT-007', businessNumber: '789-01-23456',
        deliveryAddress: '경기도 수원시 영통구 삼성로 129',
        supervisionAddress: null, projectName: null,
        recipientPhone: '031-111-2222', paymentDueDate: '2026-06-10',
        printed: true, memo: '대여품 포함', totalAmount: 1850000, totalQuantity: 1,
        salesPersonName: '오병승', editHistoryCount: 1,
        deliveryTag: 'RENTAL', deliveryTagLabel: '대여',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000002', destinationWarehouseId: null,
      },
      {
        id: 'sq-008', slipType: 'OUTBOUND', slipNo: '2026/05/07-9',
        slipDate: '2026-05-07', status: 'COMPLETED', partnerName: 'GS건설',
        partnerCode: 'GS-008', businessNumber: '890-12-34567',
        deliveryAddress: '서울특별시 마포구 양화로 45',
        supervisionAddress: '마포 현장 2공구', projectName: '마포 오피스텔 공조',
        recipientPhone: '010-2222-3333', paymentDueDate: '2026-05-28',
        printed: false, memo: '반납 포함 (4EA)', totalAmount: 3310000, totalQuantity: 3,
        salesPersonName: '박서연', editHistoryCount: 2,
        deliveryTag: 'RETURN_RENTAL', deliveryTagLabel: '반납',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000001', destinationWarehouseId: null,
      },
      {
        id: 'sq-009', slipType: 'OUTBOUND', slipNo: '2026/05/06-4',
        slipDate: '2026-05-06', status: 'CONFIRMED', partnerName: '포스코건설',
        partnerCode: 'PC-009', businessNumber: '901-23-45678',
        deliveryAddress: '광양시 금호동 포스코 1공장',
        supervisionAddress: '광양 1공장 B구역', projectName: '광양제철소 냉각설비',
        recipientPhone: '061-777-8888', paymentDueDate: '2026-05-31',
        printed: true, memo: null, totalAmount: 21000000, totalQuantity: 12,
        salesPersonName: '이정훈', editHistoryCount: 0,
        deliveryTag: 'GYEONGDONG_PARCEL', deliveryTagLabel: '경동택배',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000001', destinationWarehouseId: null,
      },
      {
        id: 'sq-010', slipType: 'OUTBOUND', slipNo: '2026/05/06-1',
        slipDate: '2026-05-06', status: 'SAVED', partnerName: '두산중공업',
        partnerCode: 'DS-010', businessNumber: '012-34-56789',
        deliveryAddress: '창원시 성산구 두산대로 22',
        supervisionAddress: '창원공장 C동', projectName: '창원 스팀터빈 보조냉각',
        recipientPhone: '055-999-1111', paymentDueDate: '2026-06-30',
        printed: false, memo: '특수 사양 주의', totalAmount: 15400000, totalQuantity: 7,
        salesPersonName: '오병승', editHistoryCount: 5,
        deliveryTag: 'REGION', deliveryTagLabel: '지방',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000002', destinationWarehouseId: null,
      },
      {
        id: 'sq-011', slipType: 'OUTBOUND', slipNo: '2026/05/05-8',
        slipDate: '2026-05-05', status: 'CANCELED', partnerName: '에스케이에코플랜트',
        partnerCode: 'SK-011', businessNumber: '111-22-33444',
        deliveryAddress: '수원시 권선구 SK로 1',
        supervisionAddress: null, projectName: 'SK 수원캠퍼스 IDC 공조',
        recipientPhone: '031-333-4444', paymentDueDate: '2026-05-31',
        printed: true, memo: null, totalAmount: 9800000, totalQuantity: 6,
        salesPersonName: '박서연', editHistoryCount: 0,
        deliveryTag: 'DAY', deliveryTagLabel: '당일',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000001', destinationWarehouseId: null,
      },
      {
        id: 'sq-012', slipType: 'OUTBOUND', slipNo: '2026/05/05-3',
        slipDate: '2026-05-05', status: 'REJECTED', partnerName: '롯데케미칼',
        partnerCode: 'LC-012', businessNumber: '222-33-44555',
        deliveryAddress: '울산광역시 남구 석유화학로 10',
        supervisionAddress: '울산공장 A라인', projectName: '울산 석화단지 냉동 증설',
        recipientPhone: '052-444-5555', paymentDueDate: '2026-06-15',
        printed: false, memo: '야간 배송 가능', totalAmount: 5600000, totalQuantity: 4,
        salesPersonName: '이정훈', editHistoryCount: 1,
        deliveryTag: 'STACK', deliveryTagLabel: '야적',
        sourceWarehouseId: '11111111-1111-1111-1111-000000000001', destinationWarehouseId: null,
      },
    ]

    /** 구매(INBOUND) 조회 12건 mock rows */
    const INBOUND_QUERY_ROWS = [
      {
        id: 'iq-001', slipType: 'INBOUND', slipNo: '2026/05/10-1',
        slipDate: '2026-05-10', status: 'SAVED', partnerName: '삼성전자',
        partnerCode: 'SE-001', businessNumber: '101-81-25508',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: '2026-05-31',
        printed: false, memo: '회차 입고 — 창고 B', totalAmount: 3700000, totalQuantity: 4,
        salesPersonName: '오병승', editHistoryCount: 0,
        deliveryTag: 'RETURN_TRIP', deliveryTagLabel: '회차',
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000001',
      },
      {
        id: 'iq-002', slipType: 'INBOUND', slipNo: '2026/05/10-2',
        slipDate: '2026-05-10', status: 'CONFIRMED', partnerName: 'LG전자',
        partnerCode: 'LG-001', businessNumber: '107-86-14075',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: '2026-05-31',
        printed: true, memo: null, totalAmount: 2120000, totalQuantity: 2,
        salesPersonName: '박서연', editHistoryCount: 0,
        deliveryTag: null, deliveryTagLabel: null,
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000001',
      },
      {
        id: 'iq-003', slipType: 'INBOUND', slipNo: '2026/05/09-3',
        slipDate: '2026-05-09', status: 'COMPLETED', partnerName: '캐리어에어컨',
        partnerCode: 'CA-001', businessNumber: '126-87-00312',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: null,
        printed: false, memo: '반품 처리', totalAmount: 1450000, totalQuantity: 1,
        salesPersonName: '이정훈', editHistoryCount: 1,
        deliveryTag: 'RETURN', deliveryTagLabel: '반품',
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000001',
      },
      {
        id: 'iq-004', slipType: 'INBOUND', slipNo: '2026/05/09-4',
        slipDate: '2026-05-09', status: 'SAVED', partnerName: '대우일렉트로닉스',
        partnerCode: 'DW-001', businessNumber: '201-81-74932',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: '2026-05-28',
        printed: false, memo: '차용품 반납 포함', totalAmount: 5100000, totalQuantity: 3,
        salesPersonName: '오병승', editHistoryCount: 0,
        deliveryTag: 'BORROW', deliveryTagLabel: '차용',
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000002',
      },
      {
        id: 'iq-005', slipType: 'INBOUND', slipNo: '2026/05/08-5',
        slipDate: '2026-05-08', status: 'CONFIRMED', partnerName: '삼성전자',
        partnerCode: 'SE-001', businessNumber: '101-81-25508',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: '2026-05-31',
        printed: true, memo: null, totalAmount: 8400000, totalQuantity: 6,
        salesPersonName: '박서연', editHistoryCount: 2,
        deliveryTag: 'RETURN_TRIP', deliveryTagLabel: '회차',
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000001',
      },
      {
        id: 'iq-006', slipType: 'INBOUND', slipNo: '2026/05/08-6',
        slipDate: '2026-05-08', status: 'CANCELED', partnerName: '대성산업',
        partnerCode: 'DS-001', businessNumber: '130-81-28742',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: '2026-06-10',
        printed: false, memo: '특가 구매', totalAmount: 4200000, totalQuantity: 2,
        salesPersonName: '이정훈', editHistoryCount: 0,
        deliveryTag: null, deliveryTagLabel: null,
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000001',
      },
      {
        id: 'iq-007', slipType: 'INBOUND', slipNo: '2026/05/07-7',
        slipDate: '2026-05-07', status: 'SAVED', partnerName: 'LG전자',
        partnerCode: 'LG-001', businessNumber: '107-86-14075',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: '2026-05-31',
        printed: true, memo: null, totalAmount: 6300000, totalQuantity: 5,
        salesPersonName: '오병승', editHistoryCount: 1,
        deliveryTag: null, deliveryTagLabel: null,
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000002',
      },
      {
        id: 'iq-008', slipType: 'INBOUND', slipNo: '2026/05/07-8',
        slipDate: '2026-05-07', status: 'CONFIRMED', partnerName: '캐리어에어컨',
        partnerCode: 'CA-001', businessNumber: '126-87-00312',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: null,
        printed: false, memo: '반품 재입고', totalAmount: 1850000, totalQuantity: 1,
        salesPersonName: '박서연', editHistoryCount: 0,
        deliveryTag: 'RETURN', deliveryTagLabel: '반품',
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000001',
      },
      {
        id: 'iq-009', slipType: 'INBOUND', slipNo: '2026/05/06-9',
        slipDate: '2026-05-06', status: 'COMPLETED', partnerName: '삼성전자',
        partnerCode: 'SE-001', businessNumber: '101-81-25508',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: '2026-05-31',
        printed: true, memo: null, totalAmount: 7350000, totalQuantity: 5,
        salesPersonName: '이정훈', editHistoryCount: 3,
        deliveryTag: 'RETURN_TRIP', deliveryTagLabel: '회차',
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000001',
      },
      {
        id: 'iq-010', slipType: 'INBOUND', slipNo: '2026/05/06-10',
        slipDate: '2026-05-06', status: 'SAVED', partnerName: '대우일렉트로닉스',
        partnerCode: 'DW-001', businessNumber: '201-81-74932',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: '2026-05-28',
        printed: false, memo: '차용 — 반납 예정일 05/15', totalAmount: 3100000, totalQuantity: 3,
        salesPersonName: '오병승', editHistoryCount: 0,
        deliveryTag: 'BORROW', deliveryTagLabel: '차용',
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000002',
      },
      {
        id: 'iq-011', slipType: 'INBOUND', slipNo: '2026/05/05-11',
        slipDate: '2026-05-05', status: 'CONFIRMED', partnerName: '대성산업',
        partnerCode: 'DS-001', businessNumber: '130-81-28742',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: '2026-06-15',
        printed: true, memo: null, totalAmount: 9600000, totalQuantity: 8,
        salesPersonName: '박서연', editHistoryCount: 0,
        deliveryTag: null, deliveryTagLabel: null,
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000001',
      },
      {
        id: 'iq-012', slipType: 'INBOUND', slipNo: '2026/05/05-12',
        slipDate: '2026-05-05', status: 'REJECTED', partnerName: 'LG전자',
        partnerCode: 'LG-001', businessNumber: '107-86-14075',
        deliveryAddress: null, supervisionAddress: null, projectName: null,
        recipientPhone: null, paymentDueDate: '2026-05-31',
        printed: false, memo: '회차 + 추가 구매 혼합', totalAmount: 2640000, totalQuantity: 2,
        salesPersonName: '이정훈', editHistoryCount: 1,
        deliveryTag: 'RETURN_TRIP', deliveryTagLabel: '회차',
        sourceWarehouseId: null, destinationWarehouseId: '11111111-1111-1111-1111-000000000002',
      },
    ]

    const allRows = slipType === 'OUTBOUND'
      ? OUTBOUND_QUERY_ROWS
      : slipType === 'INBOUND'
        ? INBOUND_QUERY_ROWS
        : [...OUTBOUND_QUERY_ROWS, ...INBOUND_QUERY_ROWS]

    const start = pageNo * pageSize
    const pageContent = allRows.slice(start, start + pageSize)
    const totalElements = allRows.length
    const totalPages = Math.ceil(totalElements / pageSize)

    return envelope({
      content: pageContent,
      totalElements,
      totalPages,
      number: pageNo,
      size: pageSize,
      first: pageNo === 0,
      last: pageNo >= totalPages - 1,
    })
  }

  // GET /slips (페이지) — lookup-product / {id} 가 아닌 경우.
  // legacy SlipListPage 가 ?slipType=OUTBOUND (판매관리 legacy) 또는 INBOUND (구매관리 legacy) 로 필터링 →
  // mock 도 BE 와 동등하게 query param 으로 분리해 잘못된 슬립 노출 방지.
  if (
    method === 'GET'
    && url.includes('/slips')
    && !url.includes('/slips/lookup-product')
    && !url.includes('/slips/estimates') // Phase 2.2: estimate path 는 위 estimate 블록이 처리
    && !url.match(/\/slips\/cleanup/)
    && !slipDetailMatch
  ) {
    const slipTypeMatch = url.match(/[?&]slipType=([^&]+)/)
    const slipType = slipTypeMatch?.[1]
    const filtered = slipType === 'OUTBOUND' || slipType === 'INBOUND'
      ? MOCK_SLIPS.filter((s) => s.slipType === slipType)
      : MOCK_SLIPS
    return envelope({
      content: filtered,
      totalElements: filtered.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // POST /slips → 신규 전표 1건 (라인 포함, V20 필드 echo)
  if (method === 'POST' && url.endsWith('/slips')) {
    const reqBody = (config.data ? JSON.parse(config.data as string) : {}) as {
      partnerName?: string
      deliveryAddress?: string
      supervisionAddress?: string
      projectName?: string
      recipientPhone?: string
      paymentDueDate?: string
      slipType?: string
      deliveryTag?: string
      memo?: string
    }
    return envelope({
      id: 'new-slip-' + Date.now(),
      slipNo: '2026/05/04-99',
      slipType: reqBody.slipType ?? 'OUTBOUND',
      slipDate: '2026-05-04',
      seqNo: 99,
      status: 'DRAFT',
      partnerId: null,
      partnerName: reqBody.partnerName ?? '신규 거래처',
      sourceWarehouseId: HQ_ID,
      destinationWarehouseId: null,
      deliveryTag: reqBody.deliveryTag ?? 'DAY',
      memo: reqBody.memo ?? null,
      // V20 필드 echo
      deliveryAddress: reqBody.deliveryAddress ?? null,
      supervisionAddress: reqBody.supervisionAddress ?? null,
      projectName: reqBody.projectName ?? null,
      recipientPhone: reqBody.recipientPhone ?? null,
      paymentDueDate: reqBody.paymentDueDate ?? null,
      businessNumber: null,
      printed: false,
      lines: SAMPLE_LINES,
    })
  }

  // POST /slips/{id}/{action} — 라이프사이클 transition (Slice A: inspect 신규)
  const slipTransitionMatch = url.match(
    /\/slips\/([^/]+)\/(save|send|accept|process|inspect|complete|ship|deliver|confirm|reject|cancel)$/,
  )
  if (method === 'POST' && slipTransitionMatch) {
    const id = slipTransitionMatch[1]!
    const action = slipTransitionMatch[2]!
    const found = MOCK_SLIPS.find((s) => s.id === id) ?? MOCK_SLIPS[0]!
    const nextStatus: Record<string, string> = {
      save: 'SAVED',
      send: 'SENT',
      accept: 'ACCEPTED',
      process: 'PROCESSING',
      inspect: 'INSPECTING', // Slice A 신규
      complete: 'COMPLETED',
      ship: 'SHIPPING',
      deliver: 'DELIVERED',
      confirm: 'CONFIRMED',
      reject: 'REJECTED',
      cancel: 'CANCELED',
    }
    // accept 트랜지션 시 dispatcher 자동 채움 (Designer ux-flow.md § 2.1)
    const dispatcher
      = action === 'accept'
        ? {
          userId: '00000000-0000-0000-0000-000000020001',
          fullName: '홍지수',
          signedAt: new Date().toISOString(),
        }
        : found.dispatcher
    // inspect 트랜지션 시 inspector 자동 채움 (Designer ux-flow.md § 2.2)
    const inspector
      = action === 'inspect'
        ? {
          userId: '00000000-0000-0000-0000-000000020002',
          fullName: '김기철',
          signedAt: new Date().toISOString(),
        }
        : found.inspector
    return envelope({
      ...found,
      status: nextStatus[action] ?? found.status,
      dispatcher,
      inspector,
      lines: SAMPLE_LINES,
    })
  }

  // ==========================================================================
  // link-dispatch-slice: 배송 묶음 (delivery-batch) mock
  // LinkDispatchListPage 시연용 — 4 배치 (sent 2 / unsent 2)
  // ==========================================================================
  const MOCK_BATCHES = [
    {
      id: 'batch-001',
      deliveryDate: '2026-05-04',
      driverName: '홍지수',
      driverPhone: '010-1234-5678',
      slipCount: 3,
      signUrl: 'https://sign.samhan-air.com/b/abcd1234',
      smsSentAt: '2026-05-04T08:30:15+09:00',
    },
    {
      id: 'batch-002',
      deliveryDate: '2026-05-04',
      driverName: '김기철',
      driverPhone: '010-9876-5432',
      slipCount: 2,
      signUrl: 'https://sign.samhan-air.com/b/efgh5678',
      smsSentAt: null,
    },
    {
      id: 'batch-003',
      deliveryDate: '2026-05-04',
      driverName: '박서연',
      driverPhone: '010-2222-3333',
      slipCount: 5,
      signUrl: 'https://sign.samhan-air.com/b/ijkl9012',
      smsSentAt: '2026-05-04T09:15:42+09:00',
    },
    {
      id: 'batch-004',
      deliveryDate: '2026-05-04',
      driverName: '이정훈',
      driverPhone: '010-5555-7777',
      slipCount: 1,
      signUrl: 'https://sign.samhan-air.com/b/mnop3456',
      smsSentAt: null,
    },
  ]

  // GET /delivery-batches/{id}
  const batchDetailMatch = url.match(/\/delivery-batches\/([^/?]+)$/)
  if (method === 'GET' && batchDetailMatch && !url.includes('auto-group')) {
    const id = batchDetailMatch[1]!
    const found = MOCK_BATCHES.find((b) => b.id === id) ?? MOCK_BATCHES[0]!
    return envelope({
      ...found,
      tokenIssuedAt: '2026-05-04T07:00:00+09:00',
      tokenExpiresAt: null,
      slips: [
        {
          slipId: 'slip-001',
          slipNo: '2026/05/04-1',
          partnerName: '주식회사 윌리-정현수',
          shippingAddress: '서울특별시 강남구 테헤란로 152',
          lineCount: 3,
        },
        {
          slipId: 'slip-006',
          slipNo: '2026/05/04-3',
          partnerName: '주식회사 윌리-정현수',
          shippingAddress: '서울특별시 마포구 양화로 45',
          lineCount: 2,
        },
      ],
    })
  }

  // POST /delivery-batches/auto-group?date=...
  if (method === 'POST' && url.includes('/delivery-batches/auto-group')) {
    return envelope([
      {
        id: 'batch-new-' + Date.now(),
        deliveryDate: (config.params?.['date'] ?? '2026-05-04') as string,
        driverName: '신규 자동그룹',
        driverPhone: '010-0000-0000',
        slipCount: 2,
        signUrl: 'https://sign.samhan-air.com/b/newauto',
        smsSentAt: null,
      },
    ])
  }

  // POST /delivery-batches/{id}/send-sms — SMS 발송
  const batchSmsMatch = url.match(/\/delivery-batches\/([^/]+)\/send-sms$/)
  if (method === 'POST' && batchSmsMatch) {
    const id = batchSmsMatch[1]!
    const found = MOCK_BATCHES.find((b) => b.id === id) ?? MOCK_BATCHES[0]!
    return envelope({
      ...found,
      smsSentAt: new Date().toISOString(),
    })
  }

  // POST /delivery-batches/{id}/regenerate-token — 토큰 재발행
  const batchRegenMatch = url.match(/\/delivery-batches\/([^/]+)\/regenerate-token$/)
  if (method === 'POST' && batchRegenMatch) {
    const id = batchRegenMatch[1]!
    const found = MOCK_BATCHES.find((b) => b.id === id) ?? MOCK_BATCHES[0]!
    return envelope({
      ...found,
      signUrl: `https://sign.samhan-air.com/b/regen-${Date.now().toString(36)}`,
      tokenIssuedAt: new Date().toISOString(),
      tokenExpiresAt: null,
      slips: [],
    })
  }

  // POST /delivery-batches/{id}/slips — 전표 추가
  const batchAddSlipMatch = url.match(/\/delivery-batches\/([^/]+)\/slips$/)
  if (method === 'POST' && batchAddSlipMatch) {
    const id = batchAddSlipMatch[1]!
    const found = MOCK_BATCHES.find((b) => b.id === id) ?? MOCK_BATCHES[0]!
    return envelope({
      ...found,
      tokenIssuedAt: '2026-05-04T07:00:00+09:00',
      tokenExpiresAt: null,
      slips: [],
    })
  }

  // GET /delivery-batches (목록)
  if (method === 'GET' && url.includes('/delivery-batches')) {
    return envelope(MOCK_BATCHES)
  }

  // PATCH /slips/{id}/driver — 기사 정보 부분 갱신
  const driverPatchMatch = url.match(/\/slips\/([^/]+)\/driver$/)
  if (method === 'PATCH' && driverPatchMatch) {
    const id = driverPatchMatch[1]!
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      driverName?: string | null
      driverPhone?: string | null
    }
    const found = MOCK_SLIPS.find((s) => s.id === id) ?? MOCK_SLIPS[0]!
    return envelope({
      ...found,
      driverName: body.driverName ?? null,
      driverPhone: body.driverPhone ?? null,
      lines: SAMPLE_LINES,
    })
  }

  // POST /inventory/balances/batch — 다건 재고 조회 (sales-form-polish 슬라이스)
  if (method === 'POST' && url.endsWith('/inventory/balances/batch')) {
    // parseMockBody 로 config.data 가 object/string 모두 안전 처리 (Phase 2.6d 수정)
    const body = parseMockBody(config) as { productIds?: string[] }
    const ids = body.productIds ?? []

    // Phase 2.6d: 에러 시나리오 테스트 트리거 — '__error_test__' productId 포함 시 500 반환 (R-4)
    if (ids.includes('__error_test__')) {
      return mockError(500, 'INVENTORY_SERVER_ERROR', '재고 서버 일시 오류가 발생했습니다.')
    }

    /**
     * 시연용 mock — 실제 BE `ProductBalanceResponse[]` 평면 응답 구조를 모사.
     * 각 product 의 본사/차량/위탁/가상 4 창고 잔량을 balances 배열로 반환한다.
     * (모델명/품목명은 BE 미포함 — FE `fetchStockBalanceBatch` 가 선택 라인 메타로 결합.)
     *
     * 창고 메타: HQ-001(본사, HEADQUARTERS) / VH-001(차량, VEHICLE) /
     * CS-001(위탁, CONSIGNMENT) / VR-001(가상, VIRTUAL).
     */
    const warehouseMeta: Array<{
      id: string
      code: string
      name: string
      type: 'HEADQUARTERS' | 'VEHICLE' | 'CONSIGNMENT' | 'VIRTUAL'
    }> = [
      { id: 'wh-hq', code: 'HQ-001', name: '본사창고', type: 'HEADQUARTERS' },
      { id: 'wh-vh', code: 'VH-001', name: '차량1', type: 'VEHICLE' },
      { id: 'wh-cs', code: 'CS-001', name: '위탁창고', type: 'CONSIGNMENT' },
      { id: 'wh-vr', code: 'VR-001', name: '가상창고', type: 'VIRTUAL' },
    ]

    // 창고 코드 → { totalQty, reservedQty }. null/미존재 코드는 balances 에서 제외 (잔량 row 없음).
    // Phase 2.6c: reservedQty 필드 추가 — availableQty = totalQty - reservedQty.
    const mockPerProduct: Record<string, Record<string, { total: number; reserved: number }>> = {
      'p-aj040': { 'HQ-001': { total: 12, reserved: 2 }, 'VH-001': { total: 3, reserved: 0 }, 'CS-001': { total: 0, reserved: 0 } },
      'p-aj052': { 'HQ-001': { total: 5, reserved: 1 }, 'VH-001': { total: 2, reserved: 0 }, 'CS-001': { total: 0, reserved: 0 } },
      'p-aj036': { 'HQ-001': { total: 8, reserved: 0 }, 'VH-001': { total: 0, reserved: 0 }, 'CS-001': { total: 1, reserved: 0 } },
      'p-aj100': { 'HQ-001': { total: 2, reserved: 2 }, 'VH-001': { total: 0, reserved: 0 }, 'CS-001': { total: 0, reserved: 0 } },
      'p-mwr10': { 'HQ-001': { total: 45, reserved: 5 }, 'VH-001': { total: 10, reserved: 0 }, 'CS-001': { total: 2, reserved: 0 } },
    }

    const data = ids.map((pid) => {
      const per = mockPerProduct[pid] ?? { 'HQ-001': { total: 0, reserved: 0 }, 'VH-001': { total: 0, reserved: 0 }, 'CS-001': { total: 0, reserved: 0 } }
      const balances = warehouseMeta
        // 잔량 row 가 존재하는 창고만 포함 (가상창고는 항상 포함하여 dash 표시).
        .filter((w) => w.type === 'VIRTUAL' || per[w.code] !== undefined)
        .map((w) => {
          const slot = w.type === 'VIRTUAL' ? { total: 0, reserved: 0 } : (per[w.code] ?? { total: 0, reserved: 0 })
          const totalQty = slot.total
          const reservedQty = slot.reserved
          const availableQty = Math.max(0, totalQty - reservedQty)
          return {
            warehouseId: w.id,
            warehouseCode: w.code,
            warehouseName: w.name,
            warehouseType: w.type,
            availableQty,
            reservedQty,
            totalQty,
          }
        })
      return { productId: pid, balances }
    })

    return envelope(data)
  }

  // GET /inventory/balances — 재고 현황 목록 (Phase 2.6c 신규)
  // warehouseId 필터 + page/size 지원. 화면 노출: productCode/productName/warehouseCode/warehouseName (UUID 비공개).
  // VITE_MOCK_MODE 한정 테스트용 — QA 증빙 캡처에는 미사용.
  // reservedQty: 주문 전환(reserve) 으로 잠긴 수량 — 일부 행 현실적 예약값 포함(0 고정 해소).
  if (method === 'GET' && url.includes('/inventory/balances') && !url.includes('/batch')) {
    const mockRows = [
      // 본사창고 HQ: AJ040 — 예약 3건 (주문 전환 중)
      { productId: 'p-aj040', productCode: 'AJ040RXH4BC1', productName: '시스템에어컨 4Way 4HP', warehouseId: 'wh-hq', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 9, reservedQty: 3, totalQty: 12 },
      // 차량창고 VH: AJ040 — 예약 1건 (당일 출고 전환 중)
      { productId: 'p-aj040', productCode: 'AJ040RXH4BC1', productName: '시스템에어컨 4Way 4HP', warehouseId: 'wh-vh', warehouseCode: 'VH-001', warehouseName: '1호차 차량재고', warehouseType: 'VEHICLE', availableQty: 2, reservedQty: 1, totalQty: 3 },
      // 본사창고 HQ: AJ052 — 예약 1건
      { productId: 'p-aj052', productCode: 'AJ052RXH5BC1', productName: '시스템에어컨 4Way 5HP', warehouseId: 'wh-hq', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 4, reservedQty: 1, totalQty: 5 },
      // 차량창고 VH: AJ052 — 예약 2건 (전환 대기)
      { productId: 'p-aj052', productCode: 'AJ052RXH5BC1', productName: '시스템에어컨 4Way 5HP', warehouseId: 'wh-vh', warehouseCode: 'VH-001', warehouseName: '1호차 차량재고', warehouseType: 'VEHICLE', availableQty: 0, reservedQty: 2, totalQty: 2 },
      // 본사창고 HQ: AJ036 — 예약 2건
      { productId: 'p-aj036', productCode: 'AJ036NCH3CH', productName: '천장형 1Way 3HP', warehouseId: 'wh-hq', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 6, reservedQty: 2, totalQty: 8 },
      // 위탁창고 CS: AJ036 — 예약 없음 (위탁 재고 특성상 예약 미발생)
      { productId: 'p-aj036', productCode: 'AJ036NCH3CH', productName: '천장형 1Way 3HP', warehouseId: 'wh-cs', warehouseCode: 'CS-001', warehouseName: '거래처 위탁창고', warehouseType: 'CONSIGNMENT', availableQty: 1, reservedQty: 0, totalQty: 1 },
      // 본사창고 HQ: AJ100 — 가용 0 강조 케이스 (예약 2건, 전환 불가)
      { productId: 'p-aj100', productCode: 'AJ100NCDKH', productName: '실외기 10HP', warehouseId: 'wh-hq', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 0, reservedQty: 2, totalQty: 2 },
      // 본사창고 HQ: MWR-WE10N — 예약 5건
      { productId: 'p-mwr10', productCode: 'MWR-WE10N', productName: '유선 리모컨 (WE10N)', warehouseId: 'wh-hq', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 40, reservedQty: 5, totalQty: 45 },
      // 차량창고 VH: MWR-WE10N — 예약 3건 (당일 출고 묶음)
      { productId: 'p-mwr10', productCode: 'MWR-WE10N', productName: '유선 리모컨 (WE10N)', warehouseId: 'wh-vh', warehouseCode: 'VH-001', warehouseName: '1호차 차량재고', warehouseType: 'VEHICLE', availableQty: 7, reservedQty: 3, totalQty: 10 },
      // 가상창고 VR: PC1NWSK3NW — VIRTUAL 수량 개념 없음 (— 표시 검증)
      { productId: 'p-pc1nw', productCode: 'PC1NWSK3NW', productName: 'WIFI 판넬', warehouseId: 'wh-vr', warehouseCode: 'VR-001', warehouseName: '가상창고', warehouseType: 'VIRTUAL', availableQty: 0, reservedQty: 0, totalQty: 0 },
    ]
    const params = mockLocationParams()
    const warehouseIdFilter = params.get('warehouseId')
    const filtered = warehouseIdFilter
      ? mockRows.filter((r) => r.warehouseId === warehouseIdFilter)
      : mockRows
    return envelope({
      content: filtered,
      number: 0,
      size: 50,
      totalElements: filtered.length,
      totalPages: 1,
    })
  }

  // GET /inventory/transfers/{id}
  const transferDetailMatch = url.match(/\/inventory\/transfers\/([^/?]+)$/)
  if (method === 'GET' && transferDetailMatch) {
    const id = transferDetailMatch[1]!
    const found = MOCK_TRANSFERS.find((t) => t.id === id) ?? MOCK_TRANSFERS[0]!
    return envelope({
      ...found,
      lines: SAMPLE_TRANSFER_LINES,
    })
  }

  // GET /inventory/transfers (페이지)
  if (method === 'GET' && url.includes('/inventory/transfers')) {
    return envelope({
      content: MOCK_TRANSFERS,
      totalElements: MOCK_TRANSFERS.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // POST /inventory/transfers → 신규 이동전표 1건
  if (method === 'POST' && url.endsWith('/inventory/transfers')) {
    return envelope({
      id: 'new-tr-' + Date.now(),
      transferNo: '2026/05/04-99',
      sourceWarehouseId: HQ_ID,
      sourceWarehouseCode: 'HQ-001',
      destinationWarehouseId: VH_ID,
      destinationWarehouseCode: 'VH-001',
      reason: 'REBALANCE',
      reasonDetail: null,
      status: 'REQUESTED',
      requesterId: MOCK_AUTH.userId,
      approverId: null,
      requestedAt: new Date().toISOString(),
      approvedAt: null,
      shippedAt: null,
      receivedAt: null,
      confirmedAt: null,
      lines: SAMPLE_TRANSFER_LINES,
    })
  }

  // POST /inventory/transfers/{id}/{action} — 라이프사이클 transition
  const trTransitionMatch = url.match(
    /\/inventory\/transfers\/([^/]+)\/(approve|reject|ship|receive|confirm|cancel)$/,
  )
  if (method === 'POST' && trTransitionMatch) {
    const id = trTransitionMatch[1]!
    const action = trTransitionMatch[2]!
    const found = MOCK_TRANSFERS.find((t) => t.id === id) ?? MOCK_TRANSFERS[0]!
    const nextStatus: Record<string, string> = {
      approve: 'APPROVED',
      reject: 'REJECTED',
      ship: 'SHIPPED',
      receive: 'RECEIVED',
      confirm: 'CONFIRMED',
      cancel: 'CANCELED',
    }
    return envelope({
      ...found,
      status: nextStatus[action] ?? found.status,
      lines: SAMPLE_TRANSFER_LINES,
    })
  }

  // ==========================================================================
  // accounting-slice-A: 회계 mock endpoint
  // ==========================================================================

  // GET /accounting/accounts — 한국 일반기업회계기준 표준 계정과목
  if (method === 'GET' && url.endsWith('/accounting/accounts')) {
    return envelope(MOCK_ACCOUNTS)
  }

  // GET /accounting/journals/{id} — 단건 상세 (라인 포함)
  const journalDetailMatch = url.match(/\/accounting\/journals\/([^/?]+)$/)
  if (method === 'GET' && journalDetailMatch) {
    const id = journalDetailMatch[1]!
    const found = MOCK_JOURNALS.find((j) => j.id === id) ?? MOCK_JOURNALS[0]!
    return envelope(found)
  }

  // GET /accounting/journals (페이지)
  if (method === 'GET' && url.includes('/accounting/journals')) {
    const summaries = MOCK_JOURNALS.map((j) => ({
      id: j.id,
      journalNo: j.journalNo,
      journalDate: j.journalDate,
      status: j.status,
      description: j.description,
      totalDebit: j.totalDebit,
      totalCredit: j.totalCredit,
      createdByName: j.createdByName,
    }))
    return envelope({
      content: summaries,
      totalElements: summaries.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // POST /accounting/journals → 신규 분개 1건
  if (method === 'POST' && url.endsWith('/accounting/journals')) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      journalDate?: string
      description?: string
      lines?: Array<{
        accountCode: string
        debit: string
        credit: string
        partnerName?: string
        note?: string
      }>
    }
    const lines = body.lines ?? []
    const totalDebit = lines.reduce(
      (sum, l) => sum + Number.parseInt(l.debit || '0', 10),
      0,
    )
    const totalCredit = lines.reduce(
      (sum, l) => sum + Number.parseInt(l.credit || '0', 10),
      0,
    )
    return envelope({
      id: 'jv-new-' + Date.now(),
      journalNo: 'JV-2026/05-099',
      journalDate: body.journalDate ?? '2026-05-04',
      status: 'DRAFT',
      description: body.description ?? null,
      totalDebit: String(totalDebit),
      totalCredit: String(totalCredit),
      createdByName: MOCK_AUTH.fullName,
      createdAt: new Date().toISOString(),
      postedAt: null,
      reversedAt: null,
      reverseReason: null,
      lines: lines.map((l, i) => ({
        id: 'jl-new-' + i,
        lineNo: i,
        accountCode: l.accountCode,
        accountName:
          MOCK_ACCOUNTS.find((a) => a.code === l.accountCode)?.name ?? null,
        debit: l.debit,
        credit: l.credit,
        partnerName: l.partnerName ?? null,
        note: l.note ?? null,
      })),
      version: 0,
    })
  }

  // POST /accounting/journals/{id}/post — 확정
  const journalPostMatch = url.match(
    /\/accounting\/journals\/([^/]+)\/post$/,
  )
  if (method === 'POST' && journalPostMatch) {
    const id = journalPostMatch[1]!
    const found = MOCK_JOURNALS.find((j) => j.id === id) ?? MOCK_JOURNALS[0]!
    return envelope({
      ...found,
      status: 'POSTED' as const,
      postedAt: new Date().toISOString(),
    })
  }

  // POST /accounting/journals/{id}/reverse — 역분개
  const journalReverseMatch = url.match(
    /\/accounting\/journals\/([^/]+)\/reverse$/,
  )
  if (method === 'POST' && journalReverseMatch) {
    const id = journalReverseMatch[1]!
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      reason?: string
    }
    const found = MOCK_JOURNALS.find((j) => j.id === id) ?? MOCK_JOURNALS[0]!
    return envelope({
      ...found,
      status: 'REVERSED' as const,
      reversedAt: new Date().toISOString(),
      reverseReason: body.reason ?? '사유 미기재',
    })
  }

  // GET /accounting/balances?period=YYYYMM — 시산표
  if (method === 'GET' && url.includes('/accounting/balances')) {
    const period = (config.params?.['period'] ?? '202605') as string
    return envelope({
      ...MOCK_TRIAL_BALANCE,
      period,
    })
  }

  // ==========================================================================
  // P0-1 Slice A: 재무 보고서 mock endpoint
  // ==========================================================================

  // GET /accounting/reports/income-statement?period=YYYYMM — 손익계산서
  if (method === 'GET' && url.includes('/accounting/reports/income-statement')) {
    const period = (config.params?.['period'] ?? '202604') as string
    const fromYear = period.slice(0, 4)
    const fromMonth = period.slice(4, 6)
    const lastDay = new Date(
      Number.parseInt(fromYear, 10),
      Number.parseInt(fromMonth, 10),
      0,
    ).getDate()
    return envelope({
      ...MOCK_INCOME_STATEMENT,
      period,
      fromDate: `${fromYear}-${fromMonth}-01`,
      toDate: `${fromYear}-${fromMonth}-${String(lastDay).padStart(2, '0')}`,
    })
  }

  // GET /accounting/reports/balance-sheet?asOfDate=YYYY-MM-DD — 재무상태표
  if (method === 'GET' && url.includes('/accounting/reports/balance-sheet')) {
    const asOfDate = (config.params?.['asOfDate'] ?? '2026-04-30') as string
    return envelope({
      ...MOCK_BALANCE_SHEET,
      asOfDate,
    })
  }

  // ==========================================================================
  // P0-1 Slice B: 세금/거래처 보고서 mock endpoint
  // ==========================================================================

  // GET /accounting/reports/vat?period=YYYYMM — 부가세 신고서
  // BE 가 period 라벨을 "YYYY-MM" 형식으로 반환 → mock 도 동일 정렬 (TM PR #136 검증).
  if (method === 'GET' && url.includes('/accounting/reports/vat')) {
    const periodParam = (config.params?.['period'] ?? '202604') as string
    const fromYear = periodParam.slice(0, 4)
    const fromMonth = periodParam.slice(4, 6)
    const lastDay = new Date(
      Number.parseInt(fromYear, 10),
      Number.parseInt(fromMonth, 10),
      0,
    ).getDate()
    return envelope({
      ...MOCK_VAT_REPORT,
      period: `${fromYear}-${fromMonth}`,
      fromDate: `${fromYear}-${fromMonth}-01`,
      toDate: `${fromYear}-${fromMonth}-${String(lastDay).padStart(2, '0')}`,
    })
  }

  // GET /accounting/reports/corporate-tax?fiscalYear=YYYY — 법인세 신고서
  // BE 필드명 정렬: filingDeadline / fromDate / toDate (TM PR #136 검증).
  if (method === 'GET' && url.includes('/accounting/reports/corporate-tax')) {
    const fiscalYear = Number.parseInt(
      String(config.params?.['fiscalYear'] ?? '2026'),
      10,
    )
    return envelope({
      ...MOCK_CORPORATE_TAX_REPORT,
      fiscalYear,
      fromDate: `${fiscalYear}-01-01`,
      toDate: `${fiscalYear}-12-31`,
      filingDeadline: `${fiscalYear + 1}-03-31`,
    })
  }

  // GET /accounting/reports/partner-aging?asOfDate=&type= — 거래처별 미수/미지급
  if (method === 'GET' && url.includes('/accounting/reports/partner-aging')) {
    const asOfDate = (config.params?.['asOfDate'] ?? '2026-05-31') as string
    const type = (config.params?.['type'] ?? 'RECEIVABLE') as 'RECEIVABLE' | 'PAYABLE'
    const base = type === 'RECEIVABLE'
      ? MOCK_PARTNER_AGING_RECEIVABLE
      : MOCK_PARTNER_AGING_PAYABLE
    return envelope({ ...base, asOfDate })
  }

  // ==========================================================================
  // P0-1 Slice C: 분석 보고서 mock endpoint
  // ==========================================================================

  // GET /accounting/reports/cash-flow?period=YYYYMM — 현금흐름표
  // B-4 fix (PR #137): CashFlowLine spec — accountCode/accountName/activityType/amount/flowDirection
  // W-3 fix (PR #137): generatedAt 고정 ISO string (캡처 재현성)
  if (method === 'GET' && url.includes('/accounting/reports/cash-flow')) {
    const period = (config.params?.['period'] ?? '202604') as string
    const fromYear = period.slice(0, 4)
    const fromMonth = period.slice(4, 6)
    const lastDay = new Date(
      Number.parseInt(fromYear, 10),
      Number.parseInt(fromMonth, 10),
      0,
    ).getDate()
    return envelope({
      period: `${fromYear}-${fromMonth}`,
      fromDate: `${fromYear}-${fromMonth}-01`,
      toDate: `${fromYear}-${fromMonth}-${String(lastDay).padStart(2, '0')}`,
      netIncome: '8000000',
      operatingAdjustments: [
        { accountCode: '110', accountName: '외상매출금', activityType: 'OPERATING', amount: '2000000', flowDirection: 'INFLOW' },
        { accountCode: '201', accountName: '외상매입금', activityType: 'OPERATING', amount: '1500000', flowDirection: 'INFLOW' },
        { accountCode: '801', accountName: '급여', activityType: 'OPERATING', amount: '-500000', flowDirection: 'OUTFLOW' },
      ],
      cashFromOperating: '11000000',
      investingActivities: [
        { accountCode: '130', accountName: '유형자산 취득', activityType: 'INVESTING', amount: '-3000000', flowDirection: 'OUTFLOW' },
        { accountCode: '140', accountName: '무형자산 처분', activityType: 'INVESTING', amount: '500000', flowDirection: 'INFLOW' },
      ],
      cashFromInvesting: '-2500000',
      financingActivities: [
        { accountCode: '210', accountName: '단기차입금 차입/증자', activityType: 'FINANCING', amount: '500000', flowDirection: 'INFLOW' },
        { accountCode: '260', accountName: '장기차입금 상환', activityType: 'FINANCING', amount: '-1000000', flowDirection: 'OUTFLOW' },
      ],
      cashFromFinancing: '-500000',
      netCashFlow: '8000000',
      beginningCash: '2000000',
      endingCash: '10000000',
      cashReconciled: true,
      generatedAt: '2026-05-11T09:00:00.000Z',
    })
  }

  // GET /accounting/reports/equity-changes?fromDate=&toDate= — 자본변동표
  // B-2 fix (PR #137): EquityChangesResponse spec — period/lines[]/beginningEquity/totalChange/endingEquity/generatedAt
  // W-3 fix (PR #137): generatedAt 고정 ISO string (캡처 재현성)
  if (method === 'GET' && url.includes('/accounting/reports/equity-changes')) {
    const fromDate = (config.params?.['fromDate'] ?? '2026-01-01') as string
    const toDate = (config.params?.['toDate'] ?? '2026-12-31') as string
    return envelope({
      period: `${fromDate} ~ ${toDate}`,
      fromDate,
      toDate,
      lines: [
        { accountCode: '310', accountName: '자본금', changeType: 'CAPITAL_INCREASE', description: '기간 중 유상증자', amount: '0' },
        { accountCode: '343', accountName: '미처분이익잉여금', changeType: 'NET_INCOME', description: '당기순이익', amount: '8000000' },
        { accountCode: '343', accountName: '미처분이익잉여금', changeType: 'DIVIDEND', description: '배당금 지급', amount: '-3000000' },
      ],
      beginningEquity: '145000000',
      totalChange: '5000000',
      endingEquity: '150000000',
      generatedAt: '2026-05-11T09:00:00.000Z',
    })
  }

  // GET /accounting/reports/daily-summary?date=YYYY-MM-DD — 일계표
  // B-1 fix (PR #137): DailySummaryResponse spec — summaryDate/accountTotals[]/debitTotal/creditTotal/generatedAt
  // W-3 fix (PR #137): generatedAt 고정 ISO string (캡처 재현성)
  if (method === 'GET' && url.includes('/accounting/reports/daily-summary')) {
    const date = (config.params?.['date'] ?? '2026-05-10') as string
    return envelope({
      summaryDate: date,
      journalCount: 7,
      totalDebit: '15200000',
      totalCredit: '15200000',
      balanced: true,
      accountTotals: [
        { accountCode: '101', accountName: '현금', debitTotal: '3000000', creditTotal: '1500000' },
        { accountCode: '102', accountName: '보통예금', debitTotal: '5000000', creditTotal: '2000000' },
        { accountCode: '110', accountName: '외상매출금', debitTotal: '4200000', creditTotal: '0' },
        { accountCode: '201', accountName: '외상매입금', debitTotal: '0', creditTotal: '3500000' },
        { accountCode: '401', accountName: '상품매출', debitTotal: '0', creditTotal: '6200000' },
        { accountCode: '501', accountName: '상품매입', debitTotal: '3000000', creditTotal: '0' },
        { accountCode: '801', accountName: '급여', debitTotal: '0', creditTotal: '2000000' },
      ],
      generatedAt: '2026-05-11T09:00:00.000Z',
    })
  }

  // GET /accounting/reports/monthly-summary?period=YYYYMM — 월계표
  // B-3 fix (PR #137): MonthlySummaryResponse spec — accountSummary 없음, dailyBreakdown만
  //   DailyBreakdownLine: journalDate/debitTotal/creditTotal (date/totalDebit X)
  // W-3 fix (PR #137): Math.random() 제거 → 결정적 하드코딩 + generatedAt 고정 (캡처 재현성)
  if (method === 'GET' && url.includes('/accounting/reports/monthly-summary')) {
    const period = (config.params?.['period'] ?? '202604') as string
    const fromYear = period.slice(0, 4)
    const fromMonth = period.slice(4, 6)
    const lastDay = new Date(
      Number.parseInt(fromYear, 10),
      Number.parseInt(fromMonth, 10),
      0,
    ).getDate()
    const DAILY_SEED: Array<[number, string, string]> = [
      [7, '18500000', '18500000'],
      [3, '9200000', '9200000'],
      [5, '14000000', '14000000'],
      [8, '22100000', '22100000'],
      [2, '5800000', '5800000'],
      [6, '17300000', '17300000'],
      [4, '11000000', '11000000'],
      [9, '24500000', '24500000'],
      [1, '3200000', '3200000'],
      [5, '15500000', '15500000'],
    ]
    const dailyBreakdown = Array.from({ length: Math.min(lastDay, 10) }, (_, i) => {
      const [jc, dt, ct] = DAILY_SEED[i] ?? [4, '10000000', '10000000']
      return {
        journalDate: `${fromYear}-${fromMonth}-${String(i + 1).padStart(2, '0')}`,
        journalCount: jc,
        debitTotal: dt,
        creditTotal: ct,
      }
    })
    return envelope({
      period: `${fromYear}-${fromMonth}`,
      yearMonth: `${fromYear}-${fromMonth}`,
      fromDate: `${fromYear}-${fromMonth}-01`,
      toDate: `${fromYear}-${fromMonth}-${String(lastDay).padStart(2, '0')}`,
      journalCount: 82,
      totalDebit: '185600000',
      totalCredit: '185600000',
      balanced: true,
      dailyBreakdown,
      generatedAt: '2026-05-11T09:00:00.000Z',
    })
  }

  // ==========================================================================
  // [Phase 6 v4] 판매 메뉴 mock — 캡처용 최소 시드
  // ==========================================================================

  // GET /api/v1/estimates — 견적 목록
  if (method === 'GET' && url.includes('/api/v1/estimates')) {
    return envelope({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size: 50,
      first: true,
      last: true,
    })
  }

  // GET /api/v1/partner-orders — 주문서 관리 (Phase 2.5: status 필터 분기 추가)
  if (method === 'GET' && /\/api\/v1\/partner-orders(?:\?.*)?$/.test(url)) {
    // status 쿼리 파라미터 추출 (URL 또는 config.params 에서)
    const urlObj = new URL(url.startsWith('http') ? url : `http://mock${url}`)
    const statusParam = urlObj.searchParams.get('status') ?? (config.params?.['status'] as string | undefined)

    // Phase 2.5 — status 별 fixture rows
    const DRAFT_ROW = {
      orderNumber: '2026/05/04-1',
      partnerCode: '1234567890',
      partnerName: '엘에이시스템에어',
      submittedAt: '2026-05-04T10:30:00',
      status: 'DRAFT' as const,
      totalAmount: 3700000,
      linkedSlipNo: null,
    }
    const ON_HOLD_ROW = {
      orderNumber: '2026/05/05-2',
      partnerCode: '2345678901',
      partnerName: '강남에어솔루션',
      submittedAt: '2026-05-05T09:00:00',
      status: 'ON_HOLD' as const,
      totalAmount: 1850000,
      linkedSlipNo: null,
    }
    const CONFIRMED_ROW = {
      orderNumber: '2026/05/03-1',
      partnerCode: '3456789012',
      partnerName: '한빛쾌적',
      submittedAt: '2026-05-03T14:00:00',
      status: 'CONFIRMED' as const,
      totalAmount: 5200000,
      linkedSlipNo: 'SL-20260503-001',
    }
    // Phase 2.6b D2: 병합 시나리오 4·5용 — SAME_PARTNER 같은 거래처 2건 (DRAFT + ON_HOLD).
    // partnerCode = '1234567890' (DRAFT_ROW 와 동일 거래처).
    const SAME_PARTNER_DRAFT_ROW = {
      orderNumber: '2026/05/31-3',
      partnerCode: '1234567890',
      partnerName: '엘에이시스템에어',
      submittedAt: '2026-05-31T08:00:00',
      status: 'DRAFT' as const,
      totalAmount: 2500000,
      linkedSlipNo: null,
    }
    const SAME_PARTNER_ON_HOLD_ROW = {
      orderNumber: '2026/05/31-4',
      partnerCode: '1234567890',
      partnerName: '엘에이시스템에어',
      submittedAt: '2026-05-31T09:00:00',
      status: 'ON_HOLD' as const,
      totalAmount: 1200000,
      linkedSlipNo: null,
    }

    let content: (
      | typeof DRAFT_ROW
      | typeof ON_HOLD_ROW
      | typeof CONFIRMED_ROW
      | typeof SAME_PARTNER_DRAFT_ROW
      | typeof SAME_PARTNER_ON_HOLD_ROW
    )[]
    if (statusParam === 'DRAFT') {
      // DRAFT 필터: 같은 거래처 DRAFT 2건 포함 (시나리오 2/4/5 직접 접근 가능)
      content = [DRAFT_ROW, SAME_PARTNER_DRAFT_ROW]
    } else if (statusParam === 'ON_HOLD') {
      content = [ON_HOLD_ROW, SAME_PARTNER_ON_HOLD_ROW]
    } else if (statusParam === 'CONFIRMED') {
      content = [CONFIRMED_ROW]
    } else {
      // 전체 또는 기타 — 모든 행 반환 (혼합 시나리오 포함)
      content = [DRAFT_ROW, SAME_PARTNER_DRAFT_ROW, SAME_PARTNER_ON_HOLD_ROW, ON_HOLD_ROW, CONFIRMED_ROW]
    }

    return envelope({
      content,
      totalElements: content.length,
      totalPages: 1,
      number: 0,
      size: 50,
      first: true,
      last: true,
    })
  }

  // GET /api/v1/partner-approvals — 주문서 승인 (status 6종)
  if (method === 'GET' && url.includes('/api/v1/partner-approvals')) {
    const sample = [
      {
        partnerCode: '1234567890',
        partnerName: '엘에이시스템에어',
        status: 'APPROVED' as const,
        approvedAt: '2026-04-12T10:23:00+09:00',
        approvedBy: '오병승',
        passwordRequestedAt: null,
        pcTutorialCompleted: true,
        mobileTutorialCompleted: false,
      },
      {
        partnerCode: '2345678901',
        partnerName: '강남에어솔루션',
        status: 'UNAPPROVED' as const,
        approvedAt: null,
        approvedBy: null,
        passwordRequestedAt: null,
        pcTutorialCompleted: false,
        mobileTutorialCompleted: false,
      },
      {
        partnerCode: '3456789012',
        partnerName: '한빛쾌적',
        status: 'PASSWORD_RESET_PENDING' as const,
        approvedAt: '2026-03-01T09:00:00+09:00',
        approvedBy: '오병승',
        passwordRequestedAt: '2026-05-04T14:21:00+09:00',
        pcTutorialCompleted: true,
        mobileTutorialCompleted: true,
      },
      {
        partnerCode: '4567890123',
        partnerName: '미래시스템',
        status: 'PASSWORD_ERROR' as const,
        approvedAt: '2026-02-21T11:30:00+09:00',
        approvedBy: '강현구',
        passwordRequestedAt: null,
        pcTutorialCompleted: true,
        mobileTutorialCompleted: false,
      },
      {
        partnerCode: '5678901234',
        partnerName: '대박종합건설',
        status: 'ACCESS_DENIED' as const,
        approvedAt: '2026-01-10T16:45:00+09:00',
        approvedBy: '강현구',
        passwordRequestedAt: null,
        pcTutorialCompleted: true,
        mobileTutorialCompleted: true,
      },
      {
        partnerCode: '6789012345',
        partnerName: '경기냉난방',
        status: 'LONG_PENDING' as const,
        approvedAt: '2025-12-05T08:15:00+09:00',
        approvedBy: '오병승',
        passwordRequestedAt: null,
        pcTutorialCompleted: true,
        mobileTutorialCompleted: true,
      },
    ]
    return envelope({
      content: sample,
      totalElements: sample.length,
      totalPages: 1,
      number: 0,
      size: 50,
      first: true,
      last: true,
    })
  }

  // GET /api/v1/partner-dc-configs — 거래처 DC 설정 (222 row 시뮬레이션)
  if (method === 'GET' && url.includes('/api/v1/partner-dc-configs')) {
    const partners = [
      ['1234567890', '엘에이시스템에어'],
      ['2345678901', '강남에어솔루션'],
      ['3456789012', '한빛쾌적'],
      ['4567890123', '미래시스템'],
      ['5678901234', '대박종합건설'],
      ['6789012345', '경기냉난방'],
      ['7890123456', '서초에어월드'],
      ['8901234567', '도매콘'],
      ['9012345678', '파주냉동공조'],
      ['0123456789', '안양시스템'],
    ]
    const sample = partners.map(([code, name], idx) => ({
      partnerCode: code,
      partnerName: name,
      homeMultiDc: idx % 2 === 0 ? 0.12 : 0.15,
      commercialMultiDc: idx % 3 === 0 ? 0.18 : null,
      flexibleHoseI: idx % 4 === 0,
      option360: 0.05,
      option4way: 0.04,
      option1way: null,
      optionStand: 0.03,
      optionDeluxe: idx % 2 === 0 ? 0.06 : null,
      option1Grade: 0.07,
      unitProcessing: idx % 3 === 0 ? 1500 : null,
      note: idx === 0 ? '주거래처 — VIP' : null,
    }))
    return envelope({
      content: sample,
      totalElements: 222,
      totalPages: 23,
      number: 0,
      size: 250,
      first: true,
      last: false,
    })
  }

  // ===== PR-F2 vendor OCR — QA 작동 캡처용 mock (BE 미연결 환경) =====
  // POST /api/v1/admin/partner-order/vendor/upload — multipart, vendor query 보고 fixture 반환
  if (method === 'POST' && url.includes('/admin/partner-order/vendor/upload')) {
    // FormData / multipart payload 에서 vendor query 추출 시도. 실패 시 에어디자이너 default.
    let vendor = 'AIRDESIGNER'
    try {
      const data = config.data as FormData | undefined
      if (data && typeof (data as FormData).get === 'function') {
        const v = (data as FormData).get('vendor')
        if (typeof v === 'string') vendor = v
      }
    } catch {
      // ignore
    }
    if (vendor === '제이시스템' || vendor === 'JSYSTEM') {
      return envelope({
        vendorName: '제이시스템',
        partnerCode: 'P-J001',
        ocrText:
          '제이시스템 발주서\nPartner: P-J001\nHM-7000 헬로멀티 7kW 2 EA 1,500,000\nTOTAL 3,000,000',
        parsedLines: [
          {
            modelCode: 'HM-7000',
            productName: '헬로멀티 7kW',
            quantity: 2,
            unitPrice: 1500000,
            dcRate: 0.10,
            finalPrice: 1350000,
            subtotal: 2700000,
            source: 'CATALOG',
          },
        ],
        totalAmount: 2700000,
        parsedTotal: 3000000,
        suggestions: [
          'OCR 합계 (3,000,000) 와 라인 합산 (2,700,000) 불일치 — DC 10% 적용 차이',
        ],
      })
    }
    // AIRDESIGNER default — 매칭 실패 라인 1건 포함 (Step 2 빨간 highlight 캡처용)
    return envelope({
      vendorName: '에어디자이너',
      partnerCode: 'AIRD-001',
      ocrText:
        '에어디자이너 발주서\n거래처: AIRD-001\n1. 헬로멀티 5kW [HM-5000] 2개 1,000,000원\n2. 신규품목 [UNKNOWN-CODE] 1개 350,000원\n합계: 2,350,000원',
      parsedLines: [
        {
          modelCode: 'HM-5000',
          productName: '헬로멀티 5kW',
          quantity: 2,
          unitPrice: 950000,
          dcRate: 0.10,
          finalPrice: 855000,
          subtotal: 1710000,
          source: 'CATALOG',
        },
        {
          modelCode: 'UNKNOWN-CODE',
          productName: '[매칭미상] 신규품목',
          quantity: 1,
          unitPrice: 0,
          dcRate: 0,
          finalPrice: 0,
          subtotal: 0,
          source: 'MANUAL',
        },
      ],
      totalAmount: 1710000,
      parsedTotal: 2350000,
      suggestions: [
        'OCR 합계 (2,350,000) 와 라인 합산 (2,060,000) 불일치 — 운영자 보정 필요',
        '모델 코드 [UNKNOWN-CODE] 미식별 — 단가 OCR fallback 적용',
      ],
    })
  }

  // ==========================================================================
  // Phase 12 step-6 manual-rewrite Phase A — 50+ page mount 보장 mock 보강.
  // 기존 mock 매칭 체인 (slip / journal / partner-order) 보존 우선,
  // admin / region / chat-room / blocked-partner / edit-request / audit /
  // closing / estimate / tax-invoice / arologis dispatch 등 추가.
  // 각 endpoint 는 매뉴얼 캡처 1 컷 분량의 한국어 라벨 + UUID 비공개 fixture 만 반환.
  // ==========================================================================

  // GET /admin/users — admin/UsersPage list (AdminPage<AdminUser>)
  if (method === 'GET' && url.includes('/admin/users') && !url.includes('/role-history') && !url.match(/\/admin\/users\/roles/)) {
    return envelope({
      items: MOCK_ADMIN_USERS,
      total: MOCK_ADMIN_USERS.length,
      page: 0,
      size: 20,
    })
  }

  // GET /admin/users/roles — 8 ROLE string array (BE AdminRole[] 직렬화)
  // 결함 #8: 기존 {code,label}[] → AdminRole[] string array 정정 ([object Object] 회피)
  if (method === 'GET' && url.endsWith('/admin/users/roles')) {
    return envelope([
      'MASTER',
      'DEVELOPER',
      'MANAGER',
      'DISPATCH',
      'SALES',
      'ACCOUNTANT',
      'WAREHOUSE',
      'INVENTORY',
    ])
  }

  // PATCH /admin/users/{id}/disable, /enable, /role
  const adminUserActionMatch = url.match(/\/admin\/users\/([^/]+)\/(disable|enable|role)$/)
  if (method === 'PATCH' && adminUserActionMatch) {
    return envelope({ id: adminUserActionMatch[1], message: '처리되었습니다' })
  }

  // GET /admin/users/{id}/role-history
  const adminUserHistoryMatch = url.match(/\/admin\/users\/([^/]+)\/role-history$/)
  if (method === 'GET' && adminUserHistoryMatch) {
    return envelope([
      {
        previousRole: 'SALES',
        nextRole: 'MANAGER',
        changedByName: '김미선',
        changedAt: '2026-04-21T10:23:00+09:00',
        reason: '영업1팀 매니저 승격',
      },
      {
        previousRole: null,
        nextRole: 'SALES',
        changedByName: '김미선',
        changedAt: '2026-01-05T09:00:00+09:00',
        reason: '신규 입사 초기 권한',
      },
    ])
  }

  // GET /users/departments — 부서 목록 (5건)
  if (method === 'GET' && url.endsWith('/users/departments')) {
    return envelope([
      { id: 'dept-001', name: '영업1팀', sortOrder: 1 },
      { id: 'dept-002', name: '영업2팀', sortOrder: 2 },
      { id: 'dept-003', name: '회계팀', sortOrder: 3 },
      { id: 'dept-004', name: '창고팀', sortOrder: 4 },
      { id: 'dept-005', name: '관리팀', sortOrder: 5 },
    ])
  }

  // GET /admin/partners/search — admin/PartnersPage list + AC-3 PartnerAutocomplete 검색
  // q 파라미터로 partnerCode/name/bizNo/phone LIKE 필터 (대소문자 무시)
  if (method === 'GET' && url.includes('/admin/partners/search')) {
    const q = (config.params?.['q'] as string | undefined) ?? ''
    const lower = q.trim().toLowerCase()
    const allItems = MOCK_ADMIN_PARTNERS.map((row) => normalizeAdminPartner(row))
    const filtered = lower
      ? allItems.filter(
          (item) =>
            item.partnerCode.toLowerCase().includes(lower) ||
            item.name.toLowerCase().includes(lower) ||
            item.bizNo.toLowerCase().includes(lower) ||
            (item.phone ?? '').toLowerCase().includes(lower),
        )
      : allItems
    return envelope({
      items: filtered,
      total: filtered.length,
      page: 0,
      size: 20,
    })
  }

  // POST /api/v1/partners/full — PartnerCreatePage 4탭 신규 등록.
  if (method === 'POST' && url.endsWith('/api/v1/partners/full')) {
    const body = parseMockBody(config)
    const full = buildMockPartnerFull(body)
    if (!MOCK_ADMIN_PARTNERS.some((row) => row.partnerCode === full.basic.partnerCode)) {
      MOCK_ADMIN_PARTNERS.unshift({
        partnerCode: full.basic.partnerCode,
        name: full.basic.name,
        bizNo: full.basic.bizNo,
        phone: null,
        status: 'ACTIVE' as const,
        creditLimit: '0',
        outstandingBalance: '0',
        createdAt: new Date().toISOString(),
      })
    }
    return envelope(full)
  }

  // ==========================================================================
  // Phase 2.3: 거래처 버전이력/복원 — `/api/v1/partners/{partnerCode}/revisions...`
  //   아래 `/full$` match 및 generic `/admin/partners` match 와 suffix 가 달라 충돌은
  //   없으나, estimate 패턴(most-specific path 우선) 을 미러하여 restore(POST) →
  //   revisions(GET) 순으로 `/full` 보다 앞단에 배치한다.
  // ==========================================================================

  // POST /api/v1/partners/{partnerCode}/revisions/{n}/restore — 특정 시점 복원.
  // 복원 결과는 4탭 풀(PartnerFullResponse) — ACTIVE 상태로 응답.
  const partnerRestoreMatch = url.match(/\/api\/v1\/partners\/([^/]+)\/revisions\/(\d+)\/restore$/)
  if (method === 'POST' && partnerRestoreMatch) {
    const code = decodeURIComponent(partnerRestoreMatch[1] ?? '')
    const row = MOCK_ADMIN_PARTNERS.find((partner) => partner.partnerCode === code)
    return envelope(buildMockPartnerFull({
      partnerCode: row?.partnerCode ?? code,
      bizNo: (row as Record<string, unknown> | undefined)?.['businessNumber'] ?? '123-45-67890',
      name: (row as Record<string, unknown> | undefined)?.['partnerName'] ?? '(주)SP01검증공조',
      status: 'ACTIVE',
    }))
  }

  // GET /api/v1/partners/{partnerCode}/revisions — 버전이력 목록 (최신 우선).
  // 결정적 fixture 2건 (rev2 EDIT 자식+1, rev1 CREATE) — estimate fixture 미러.
  const partnerRevisionsGetMatch = url.match(/\/api\/v1\/partners\/([^/]+)\/revisions(\?.*)?$/)
  if (method === 'GET' && partnerRevisionsGetMatch) {
    const code = decodeURIComponent(partnerRevisionsGetMatch[1] ?? '')
    return envelope([
      {
        revisionNo: 2,
        revisionType: 'EDIT',
        sourceRevisionNo: null,
        partnerCode: code,
        actorName: MOCK_AUTH.fullName,
        createdAt: '2026-05-29T14:32:18',
        changeSummary: { headerChanged: 1, childAdded: 1, childRemoved: 0, childModified: 0 },
      },
      {
        revisionNo: 1,
        revisionType: 'CREATE',
        sourceRevisionNo: null,
        partnerCode: code,
        actorName: MOCK_AUTH.fullName,
        createdAt: '2026-05-29T09:10:00',
        changeSummary: { headerChanged: 0, childAdded: 0, childRemoved: 0, childModified: 0 },
      },
    ])
  }

  // GET/PATCH /api/v1/partners/{partnerCode}/full — PartnerDetailDialog mock.
  const partnerFullMatch = url.match(/\/api\/v1\/partners\/([^/]+)\/full$/)
  if ((method === 'GET' || method === 'PATCH') && partnerFullMatch) {
    const row = MOCK_ADMIN_PARTNERS.find((partner) => partner.partnerCode === decodeURIComponent(partnerFullMatch[1] ?? ''))
    return envelope(buildMockPartnerFull({
      partnerCode: row?.partnerCode ?? decodeURIComponent(partnerFullMatch[1] ?? 'P-SP01-0001'),
      bizNo: (row as Record<string, unknown> | undefined)?.['bizNo']
        ?? (row as Record<string, unknown> | undefined)?.['businessNumber']
        ?? '123-45-67890',
      name: (row as Record<string, unknown> | undefined)?.['name']
        ?? (row as Record<string, unknown> | undefined)?.['partnerName']
        ?? '(주)SP01검증공조',
      // row 의 거래 상태 반영 — 버전이력 패널 TERMINATED 복원 가드 검증용.
      status: (row as Record<string, unknown> | undefined)?.['status'] ?? 'ACTIVE',
    }))
  }

  // GET /admin/partners/{partnerCode} — 거래처 상세 (lookupPartnerForAutoFill + AC-3 detail fill)
  // 주의: /admin/partners/search 보다 반드시 뒤에 배치 (search 가 더 specific 하므로 먼저 매칭됨)
  const adminPartnerDetailMatch = url.match(/\/admin\/partners\/([^/?]+)$/)
  if (method === 'GET' && adminPartnerDetailMatch) {
    const code = decodeURIComponent(adminPartnerDetailMatch[1] ?? '')
    const row = MOCK_ADMIN_PARTNERS.find((p) => p['partnerCode'] === code)
    if (!row) {
      return mockError(404, 'PARTNER_NOT_FOUND', `거래처 코드 '${code}' 를 찾을 수 없습니다.`)
    }
    return envelope({
      partnerCode: String(row['partnerCode'] ?? ''),
      name: String(row['partnerName'] ?? row['name'] ?? ''),
      phone: (row['phone'] as string | null | undefined) ?? null,
      address: (row['address'] as string | null | undefined) ?? null,
      representative: (row['representative'] as string | null | undefined) ?? null,
      bizNo: String(row['businessNumber'] ?? row['bizNo'] ?? ''),
      status: row['status'] ?? 'ACTIVE',
    })
  }

  // POST/PUT/DELETE /admin/partners — 신규/수정/삭제
  if (method === 'POST' && url.endsWith('/admin/partners')) {
    return envelope({ partnerCode: 'NEW-' + Date.now(), message: '거래처가 등록되었습니다' })
  }
  if (method === 'PUT' && url.match(/\/admin\/partners\/[^/]+$/)) {
    return envelope({ message: '거래처 정보가 수정되었습니다' })
  }
  if (method === 'DELETE' && url.match(/\/admin\/partners\/[^/]+$/)) {
    return envelope({ message: '거래처가 삭제되었습니다' })
  }

  // GET /inventory/warehouses/search — admin/WarehousesPage
  if (method === 'GET' && url.includes('/inventory/warehouses/search')) {
    return envelope({
      items: MOCK_WAREHOUSES,
      total: MOCK_WAREHOUSES.length,
      page: 0,
      size: 20,
    })
  }

  // GET /admin/arologis/regions — RegionsPage list
  if (method === 'GET' && url.endsWith('/admin/arologis/regions')) {
    return envelope(MOCK_REGIONS)
  }
  if (method === 'POST' && url.endsWith('/admin/arologis/regions')) {
    return envelope({ id: 'reg-new-' + Date.now() })
  }
  if ((method === 'PUT' || method === 'DELETE') && url.match(/\/admin\/arologis\/regions\/[^/]+$/)) {
    return envelope({ message: '처리되었습니다' })
  }
  if (method === 'POST' && url.includes('/admin/arologis/regions/import')) {
    return envelope({ inserted: 4, updated: 1, rejected: [] })
  }

  // GET /admin/chat-rooms — ChatRoomsPage list
  if (method === 'GET' && url.includes('/admin/chat-rooms')) {
    return envelope(MOCK_CHAT_ROOMS)
  }

  // GET /api/v1/partners/admin/blocks — BlockedPartnersPage list
  // 결함 #4: items/total AdminPage envelope → PageResponse<BlockedPartner> envelope 정정 (빈 표 회피)
  if (method === 'GET' && (url.includes('/admin/partners/blocks') || url.includes('/admin/blocked-partners') || url.includes('/partners/admin/blocks'))) {
    return envelope({
      content: MOCK_BLOCKED_PARTNERS,
      totalElements: MOCK_BLOCKED_PARTNERS.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // GET /admin/aligo/address-book — AligoAddressBookPage
  if (method === 'GET' && url.includes('/admin/aligo/address-book')) {
    return envelope({
      lastSyncAt: '2026-05-10T08:30:15+09:00',
      totalContacts: 487,
      newContacts: 12,
      updatedContacts: 8,
      removedContacts: 2,
      status: 'SYNCED',
    })
  }
  if (method === 'POST' && url.includes('/admin/aligo/address-book/sync')) {
    return envelope({
      jobId: 'aligo-sync-' + Date.now(),
      status: 'IN_PROGRESS',
      message: '알리고 주소록 동기화를 시작했습니다',
    })
  }

  // GET /admin/sheet-sync — SheetSyncPage
  if (method === 'GET' && url.includes('/admin/sheet-sync')) {
    return envelope({
      lastSyncAt: '2026-05-10T07:15:42+09:00',
      sheets: [
        { sheetName: '거래처마스터', rowCount: 487, status: 'SYNCED' },
        { sheetName: '품목마스터', rowCount: 1245, status: 'SYNCED' },
        { sheetName: '단가표', rowCount: 222, status: 'PENDING' },
      ],
    })
  }

  // GET /api/v1/slips/edit-requests — SlipEditRequestsPage.
  // BE 가 raw array (List<SlipEditRequestResponse>) 를 반환하므로 mock 도 동일하게 envelope.data = array.
  // (Page envelope 으로 감싸면 SlipEditRequestsPage `list = query.data ?? []` → object → list.map 에러)
  if (method === 'GET' && url.includes('/slips/edit-requests')) {
    return envelope(MOCK_EDIT_REQUESTS)
  }
  // POST /api/v1/slips/{slipId}/edit-request — 작성자 신규 요청 (CONFIRMED 단계).
  // body { type: 'EDIT'|'DELETE', reason: string } → SlipEditRequest 응답.
  const createEditRequestMatch = url.match(/\/slips\/([^/]+)\/edit-request(?:\?|$)/)
  if (method === 'POST' && createEditRequestMatch) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      type?: 'EDIT' | 'DELETE'
      reason?: string
    }
    const slipId = createEditRequestMatch[1]
    const slipNo = MOCK_SLIPS.find((s) => s.id === slipId)?.slipNo ?? slipId
    return envelope({
      id: `er-new-${Date.now()}`,
      slipId,
      slipNo,
      requesterId: 'user-001',
      requesterName: '오병승',
      type: body.type ?? 'EDIT',
      reason: body.reason ?? '',
      requestedAt: new Date().toISOString(),
      status: 'PENDING',
      decidedAt: null,
      decidedBy: null,
      decidedByName: null,
      decisionReason: null,
    })
  }
  // POST /api/v1/slips/{slipId}/edit-request/{requestId}/approve|reject — 창고 직원 결정.
  if (method === 'POST' && url.match(/\/slips\/[^/]+\/edit-request\/[^/]+\/(approve|reject)$/)) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      reason?: string
    }
    const isApprove = url.endsWith('/approve')
    return envelope({
      id: 'er-decided',
      status: isApprove ? 'APPROVED' : 'REJECTED',
      decidedAt: new Date().toISOString(),
      decidedBy: 'user-warehouse',
      decidedByName: '김창고',
      decisionReason: isApprove ? null : (body.reason ?? null),
    })
  }

  // ==========================================================================
  // 회계 — supplier-profiles (사업자 양식)
  // ==========================================================================

  /**
   * 사업자 seed 1건 — (주)삼한공조시스템 기본 사업자.
   * UUID 비공개 가드: id 는 내부 경로용. 화면은 businessNumber / companyName 표시.
   */
  const MOCK_SUPPLIER_PRIMARY = {
    id: '00000000-0000-0000-0000-supplier0001',
    businessNumber: '1112233333',
    subBusinessNumber: null,
    companyName: '(주)삼한공조시스템',
    ceoName: '김미선',
    address: '서울특별시 강남구 테헤란로 152, 10층',
    businessType: '도소매',
    businessItem: '냉난방 설비, 물류 운송',
    email: 'accounting@samhan-air.com',
    isPrimary: true,
    createdAt: '2026-01-01T00:00:00+09:00',
    updatedAt: '2026-01-01T00:00:00+09:00',
  }

  // GET /accounting/supplier-profiles/primary → seed 기본 사업자
  if (method === 'GET' && url.endsWith('/accounting/supplier-profiles/primary')) {
    return envelope(MOCK_SUPPLIER_PRIMARY)
  }

  // GET /accounting/supplier-profiles → seed 목록 (1건)
  if (method === 'GET' && url.endsWith('/accounting/supplier-profiles')) {
    return envelope([MOCK_SUPPLIER_PRIMARY])
  }

  // POST /accounting/supplier-profiles → 신규 등록 echo
  if (method === 'POST' && url.endsWith('/accounting/supplier-profiles')) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as Record<string, unknown>
    return envelope({
      ...MOCK_SUPPLIER_PRIMARY,
      ...body,
      id: `00000000-0000-0000-0000-supplier${Date.now()}`,
      isPrimary: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  // PUT /accounting/supplier-profiles/{id} → echo 수정
  const supplierPutMatch = url.match(/\/accounting\/supplier-profiles\/([^/]+)$/)
  if (method === 'PUT' && supplierPutMatch) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as Record<string, unknown>
    return envelope({
      ...MOCK_SUPPLIER_PRIMARY,
      ...body,
      id: supplierPutMatch[1]!,
      updatedAt: new Date().toISOString(),
    })
  }

  // POST /accounting/supplier-profiles/{id}/mark-primary → echo
  const supplierMarkPrimaryMatch = url.match(/\/accounting\/supplier-profiles\/([^/]+)\/mark-primary$/)
  if (method === 'POST' && supplierMarkPrimaryMatch) {
    return envelope({ ...MOCK_SUPPLIER_PRIMARY, isPrimary: true, id: supplierMarkPrimaryMatch[1]! })
  }

  // DELETE /accounting/supplier-profiles/{id} → 204 no content
  const supplierDeleteMatch = url.match(/\/accounting\/supplier-profiles\/([^/]+)$/)
  if (method === 'DELETE' && supplierDeleteMatch) {
    return null // 204 no content — axios adapter 는 null 을 정상 처리
  }

  // ==========================================================================
  // 회계 — tax-invoices / closing / partner-ledger / statement-batch / hometax-export
  // ==========================================================================

  // POST /accounting/tax-invoices/{id}/issue — DRAFT → ISSUED
  const taxInvoiceIssueMatch = url.match(/\/accounting\/tax-invoices\/([^/?]+)\/issue$/)
  if (method === 'POST' && taxInvoiceIssueMatch) {
    const id = taxInvoiceIssueMatch[1]!
    const found = MOCK_TAX_INVOICES.find((t) => t.id === id) ?? MOCK_TAX_INVOICES[1]!
    return envelope({
      ...found,
      taxInvoiceNo: found.taxInvoiceNo ?? `TI-2026/05-${String(Date.now()).slice(-3)}`,
      status: 'ISSUED' as const,
      issuedAt: new Date().toISOString(),
      issuedBy: '이정훈',
      journalId: 'jv-auto-' + Date.now(),
    })
  }

  // POST /accounting/tax-invoices/{id}/cancel — ISSUED → CANCELLED
  // P0-4 (PR #139): cancelReason body 필수 (5자 이상) — mock 도 echo back.
  const taxInvoiceCancelMatch = url.match(/\/accounting\/tax-invoices\/([^/?]+)\/cancel$/)
  if (method === 'POST' && taxInvoiceCancelMatch) {
    const id = taxInvoiceCancelMatch[1]!
    const found = MOCK_TAX_INVOICES.find((t) => t.id === id) ?? MOCK_TAX_INVOICES[0]!
    const req = (config.data ? JSON.parse(config.data as string) : {}) as Record<string, unknown>
    const reason = typeof req['reason'] === 'string' ? (req['reason'] as string).trim() : ''
    return envelope({
      ...found,
      status: 'CANCELLED' as const,
      cancelledAt: new Date().toISOString(),
      cancelledBy: '이정훈',
      cancelReason: reason || '취소 사유 미입력 (mock)',
      reverseJournalId: 'jv-rev-' + Date.now(),
    })
  }

  // POST /accounting/tax-invoices/{id}/emit-nts — 국세청 전자세금계산서 발행 (SP-09-1)
  const taxInvoiceEmitNtsMatch = url.match(/\/accounting\/tax-invoices\/([^/?]+)\/emit-nts$/)
  if (method === 'POST' && taxInvoiceEmitNtsMatch) {
    const id = taxInvoiceEmitNtsMatch[1]!
    const found = MOCK_TAX_INVOICES.find((t) => t.id === id)
    // 세금계산서를 찾지 못한 경우 404
    if (!found) {
      return mockError(404, 'TAX_INVOICE_NOT_FOUND', '세금계산서를 찾을 수 없습니다.')
    }
    // ISSUED 가 아닌 경우 422 — BE TaxInvoiceEmitService 동작과 동일
    if (found.status !== 'ISSUED') {
      return mockError(
        422,
        'TAX_INVOICE_NOT_EMITTABLE',
        `e-Tax 전송은 ISSUED 상태에서만 허용됩니다 (현재: ${found.status}).`,
      )
    }
    // 이미 발행된 경우 409
    if (found.eTaxExternalId) {
      return mockError(
        409,
        'TAX_INVOICE_ALREADY_EMITTED',
        '이미 국세청에 전송된 세금계산서입니다.',
      )
    }
    const req = parseMockBody(config)
    const submitMethod = typeof req['submitMethod'] === 'string' ? req['submitMethod'] : 'DRY_RUN'
    const externalId = submitMethod === 'DRY_RUN'
      ? `DRY-${found.taxInvoiceNo}-${String(Date.now()).slice(-6)}`
      : `NTS-${String(Date.now()).slice(-8)}`
    const now = new Date().toISOString()
    return envelope({
      taxInvoiceNo: found.taxInvoiceNo,
      status: found.status,
      eTaxExternalId: externalId,
      submittedAt: now,
      submitMethod,
    })
  }

  // GET /accounting/tax-invoices/{id}/print — 인쇄용 데이터 (단건 상세와 동일 shape)
  const taxInvoicePrintMatch = url.match(/\/accounting\/tax-invoices\/([^/?]+)\/print$/)
  if (method === 'GET' && taxInvoicePrintMatch) {
    const id = taxInvoicePrintMatch[1]!
    const found = MOCK_TAX_INVOICES.find((t) => t.id === id) ?? MOCK_TAX_INVOICES[0]!
    return envelope(found)
  }

  // GET /accounting/tax-invoices/{id} (단건 상세) — print/issue/cancel 보다 후 등록
  const taxInvoiceDetailMatch = url.match(/\/accounting\/tax-invoices\/([^/?]+)$/)
  if (method === 'GET' && taxInvoiceDetailMatch) {
    const id = taxInvoiceDetailMatch[1]!
    const found = MOCK_TAX_INVOICES.find((t) => t.id === id) ?? MOCK_TAX_INVOICES[0]!
    return envelope(found)
  }

  // PUT /accounting/tax-invoices/{id} — DRAFT 수정 (헤더 + 라인 일괄 교체)
  const taxInvoiceUpdateMatch = url.match(/\/accounting\/tax-invoices\/([^/?]+)$/)
  if (method === 'PUT' && taxInvoiceUpdateMatch) {
    const id = taxInvoiceUpdateMatch[1]!
    const found = MOCK_TAX_INVOICES.find((t) => t.id === id) ?? MOCK_TAX_INVOICES[1]!
    const req = (config.data ? JSON.parse(config.data as string) : {}) as Record<string, unknown>
    return envelope({
      ...found,
      partnerName: typeof req['partnerName'] === 'string' ? req['partnerName'] : found.partnerName,
      partnerBusinessNo: typeof req['partnerBusinessNo'] === 'string' ? req['partnerBusinessNo'] : found.partnerBusinessNo,
      supplyDate: typeof req['supplyDate'] === 'string' ? req['supplyDate'] : found.supplyDate,
      description: typeof req['description'] === 'string' ? req['description'] : found.description,
    })
  }

  // GET /accounting/tax-invoices (페이지 목록)
  if (method === 'GET' && url.includes('/accounting/tax-invoices')) {
    // TaxInvoiceSummary shape — lines 제외
    const summaries = MOCK_TAX_INVOICES.map(({ lines: _lines, ...rest }) => rest)
    return envelope({
      content: summaries,
      totalElements: summaries.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // POST /accounting/tax-invoices — 신규 DRAFT 생성
  if (method === 'POST' && url.endsWith('/accounting/tax-invoices')) {
    const req = (config.data ? JSON.parse(config.data as string) : {}) as Record<string, unknown>
    const now = Date.now()
    return envelope({
      id: 'ti-new-' + now,
      taxInvoiceNo: null,
      partnerId: typeof req['partnerId'] === 'string' ? req['partnerId'] : 'partner-uuid-new',
      partnerBusinessNo: typeof req['partnerBusinessNo'] === 'string' ? req['partnerBusinessNo'] : null,
      partnerName: typeof req['partnerName'] === 'string' ? req['partnerName'] : '거래처명',
      partnerAddress: typeof req['partnerAddress'] === 'string' ? req['partnerAddress'] : null,
      supplyDate: typeof req['supplyDate'] === 'string' ? req['supplyDate'] : '2026-05-11',
      supplyAmount: '0',
      vatAmount: '0',
      totalAmount: '0',
      status: 'DRAFT' as const,
      issuedAt: null,
      issuedBy: null,
      cancelledAt: null,
      cancelledBy: null,
      journalId: null,
      reverseJournalId: null,
      eTaxExternalId: null,
      description: typeof req['description'] === 'string' ? req['description'] : null,
      lines: [],
    })
  }

  // GET /accounting/closing — MonthEndClosingPage
  if (method === 'GET' && url.includes('/accounting/closing')) {
    return envelope({
      period: '202605',
      status: 'OPEN',
      lockedAt: null,
      lockedByName: null,
      checks: [
        { name: '분개 균형 검증', status: 'PASSED', detail: '5월 분개 87건 모두 차변/대변 일치' },
        { name: 'DRAFT 분개 확정', status: 'WARNING', detail: 'DRAFT 분개 1건 남음 (jv-004)' },
        { name: '재고 이동 확정', status: 'PASSED', detail: 'CONFIRMED/CANCELED 외 0건' },
        { name: '세금계산서 매핑', status: 'PASSED', detail: '발행 세금계산서 12건 모두 분개 연결' },
      ],
    })
  }
  if (method === 'POST' && url.match(/\/accounting\/closing\/(close|reopen)$/)) {
    return envelope({ message: '처리되었습니다', period: '202605' })
  }

  // GET /accounting/sales/aggregate — PartnerLedgerPage
  if (method === 'GET' && url.includes('/accounting/sales/aggregate')) {
    return envelope({
      from: '2026-04-01',
      to: '2026-04-30',
      partners: [
        { partnerCode: '1234567890', partnerName: '엘에이시스템에어', totalSales: 12450000, totalReceived: 8200000, balance: 4250000 },
        { partnerCode: '2345678901', partnerName: '강남에어솔루션', totalSales: 8700000, totalReceived: 8700000, balance: 0 },
        { partnerCode: '3456789012', partnerName: '한빛쾌적', totalSales: 5500000, totalReceived: 0, balance: 5500000 },
      ],
    })
  }

  // GET /accounting/journals/ledger-data — PartnerLedger detail
  if (method === 'GET' && url.includes('/accounting/journals/ledger-data')) {
    return envelope({
      partnerCode: '1234567890',
      partnerName: '엘에이시스템에어',
      from: '2026-04-01',
      to: '2026-04-30',
      openingBalance: 0,
      closingBalance: 4250000,
      lines: [
        { date: '2026-04-05', type: 'SALE', description: '4월 1주 출고', debit: 3700000, credit: 0, balance: 3700000 },
        { date: '2026-04-12', type: 'PAYMENT', description: '계좌이체 입금', debit: 0, credit: 2000000, balance: 1700000 },
        { date: '2026-04-19', type: 'SALE', description: '4월 3주 출고', debit: 4750000, credit: 0, balance: 6450000 },
        { date: '2026-04-26', type: 'PAYMENT', description: '계좌이체 입금', debit: 0, credit: 2200000, balance: 4250000 },
      ],
    })
  }

  // GET /accounting/statements/batch-data — StatementBatchPage
  // 결함 #5: raw object → StatementBatchRow[] raw array 정정 (list.map TypeError 회피, PR #133 회귀 패턴)
  // 각 row: { chatRoomNames[], slips: [{ slipNo, slipDate, totalSupply, totalVat, totalAmount, lines[] }] }
  if (method === 'GET' && url.includes('/accounting/statements/batch-data')) {
    return envelope([
      {
        partnerCode: '1234567890',
        partnerBusinessName: '엘에이시스템에어',
        chatRoomNames: ['서울 1톤 단톡방'],
        slips: [
          {
            slipNo: '2026/04/05-1',
            slipDate: '2026-04-05',
            totalSupply: 3700000,
            totalVat: 370000,
            totalAmount: 4070000,
            lines: [
              { modelName: 'AJ040RXH4BC1', productName: '시스템에어컨 4Way 4HP', quantity: 2, unitPrice: 1850000, lineTotal: 3700000 },
            ],
          },
          {
            slipNo: '2026/04/19-3',
            slipDate: '2026-04-19',
            totalSupply: 4750000,
            totalVat: 475000,
            totalAmount: 5225000,
            lines: [
              { modelName: 'AJ052RXH5BC1', productName: '시스템에어컨 4Way 5HP', quantity: 2, unitPrice: 2120000, lineTotal: 4240000 },
              { modelName: 'MWR-WE10N', productName: '유선 리모컨', quantity: 6, unitPrice: 85000, lineTotal: 510000 },
            ],
          },
        ],
      },
      {
        partnerCode: '2345678901',
        partnerBusinessName: '강남에어솔루션',
        chatRoomNames: ['서울 2.5톤 단톡방'],
        slips: [
          {
            slipNo: '2026/04/08-2',
            slipDate: '2026-04-08',
            totalSupply: 8700000,
            totalVat: 870000,
            totalAmount: 9570000,
            lines: [
              { modelName: 'AJ100NCDKH', productName: '실외기 10HP', quantity: 2, unitPrice: 4200000, lineTotal: 8400000 },
              { modelName: 'MWR-WE10N', productName: '유선 리모컨', quantity: 3, unitPrice: 85000, lineTotal: 255000 },
            ],
          },
        ],
      },
      {
        partnerCode: '3456789012',
        partnerBusinessName: '한빛쾌적',
        chatRoomNames: ['경기 1톤 단톡방'],
        slips: [
          {
            slipNo: '2026/04/15-5',
            slipDate: '2026-04-15',
            totalSupply: 5500000,
            totalVat: 550000,
            totalAmount: 6050000,
            lines: [
              { modelName: 'AJ036NCH3CH', productName: '천장형 1Way 3HP', quantity: 3, unitPrice: 1450000, lineTotal: 4350000 },
              { modelName: 'MWR-WE10N', productName: '유선 리모컨', quantity: 3, unitPrice: 85000, lineTotal: 255000 },
            ],
          },
        ],
      },
    ])
  }

  // GET /accounting/tax-invoice/hometax-export — HometaxExportPage
  if (method === 'GET' && url.includes('/accounting/tax-invoice/hometax-export')) {
    return envelope({
      period: '202604',
      totalCount: 12,
      eligibleCount: 11,
      ineligibleCount: 1,
      previewRows: [
        { no: 1, partnerCode: '1234567890', partnerName: '엘에이시스템에어', amount: 4250000, status: 'READY' },
        { no: 2, partnerCode: '2345678901', partnerName: '강남에어솔루션', amount: 8700000, status: 'READY' },
        { no: 3, partnerCode: '3456789012', partnerName: '한빛쾌적', amount: 5500000, status: 'INELIGIBLE', reason: '사업자번호 미등록' },
      ],
    })
  }

  // SP-08-2: DPS 저장내역 — legacy GAS history 탭 mock
  if (url.includes('/warehouse/audit/dps-history')) {
    const isByProduct = String(config.params?.['programType'] ?? '').includes('DPS_BY_PRODUCT')
      || url.includes('dps-history-mock-by-product')
    const comparePayload = {
      from: '2026-05-01',
      to: '2026-05-16',
      groupBy: 'SLIP',
      outboundCount: 18,
      dpsRowCount: 18,
      matchedCount: 16,
      mismatchCount: 2,
      mismatches: [
        {
          rowType: 'QUANTITY_MISMATCH',
          slipNo: '2026/05/16-1',
          productCode: 'AJ052RXH5BC1',
          partnerCode: 'P-001',
          expectedQty: 5,
          actualQty: 4,
          reason: '수량 불일치 — 출고: 5 / DPS: 4',
        },
        {
          rowType: 'DPS_NOT_FOUND',
          slipNo: '2026/05/16-2',
          productCode: 'MWR-WE10N',
          partnerCode: 'P-002',
          expectedQty: 3,
          actualQty: 0,
          reason: 'DPS 엑셀에서 매칭 row 미발견',
        },
      ],
    }
    const byProductPayload = {
      fromDate: '2026-05-01',
      toDate: '2026-05-16',
      warehouseId: null,
      warehouseName: null,
      generatedAt: new Date().toISOString(),
      totalProductCount: 3,
      rows: [
        { productCode: 'PRD-0001', productName: '냉난방 실외기 (5HP)', pendingQty: 12, completedQty: 85, qcQty: 3, returnQty: -2, totalQty: 98, diffFromDps: 0 },
        { productCode: 'PRD-0002', productName: '냉난방 실내기 (스탠드형)', pendingQty: 0, completedQty: 64, qcQty: 1, returnQty: 0, totalQty: 65, diffFromDps: -3 },
        { productCode: 'PRD-0003', productName: '천장형 에어컨 2way', pendingQty: 5, completedQty: 42, qcQty: 0, returnQty: 0, totalQty: 47, diffFromDps: 2 },
      ],
    }
    const detail = {
      id: isByProduct ? 'dps-history-mock-by-product-001' : 'dps-history-mock-compare-001',
      programType: isByProduct ? 'DPS_BY_PRODUCT' : 'DPS_COMPARE',
      saveMode: 'AUTO_LATEST',
      topic: '자동저장',
      createdAt: '2026-05-16T14:32:00',
      createdBy: MOCK_AUTH.fullName,
      requestParams: { from: '2026-05-01', to: '2026-05-16', mismatchCount: 2 },
      mismatchCount: 2,
      responsePayload: isByProduct ? byProductPayload : comparePayload,
    }
    if (method === 'POST') {
      return envelope({ id: 'dps-history-mock-saved', savedAt: new Date().toISOString() })
    }
    if (method === 'GET' && url.includes('/latest')) {
      return envelope(detail)
    }
    if (method === 'GET' && /\/warehouse\/audit\/dps-history\/[^/?]+$/.test(url)) {
      return envelope({ ...detail, saveMode: 'MANUAL_NAMED', topic: '오전 마감 점검' })
    }
    return envelope({
      content: [
        { ...detail, saveMode: 'MANUAL_NAMED', topic: '오전 마감 점검', mismatchCount: 2 },
        {
          ...detail,
          id: isByProduct ? 'dps-history-mock-by-product-002' : 'dps-history-mock-compare-002',
          saveMode: 'MANUAL_NAMED',
          topic: '월말 마감',
          mismatchCount: 0,
        },
      ],
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 50,
      first: true,
      last: true,
    })
  }

  // GET /warehouse/audit (재고 실사 목록)
  if (method === 'GET' && url.includes('/warehouse/audit') && !url.includes('/dps-compare')) {
    const auditMatch = url.match(/\/warehouse\/audit\/([^/?]+)$/)
    if (auditMatch && auditMatch[1] !== 'new') {
      const id = auditMatch[1]!
      const found = MOCK_INVENTORY_AUDITS.find((a) => a.id === id) ?? MOCK_INVENTORY_AUDITS[0]!
      return envelope(found)
    }
    return envelope({
      content: MOCK_INVENTORY_AUDITS,
      totalElements: MOCK_INVENTORY_AUDITS.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // GET /warehouse/audit/dps-compare/by-product — DpsByProductPage (P0-B GAS 보강)
  // 정적 path — /warehouse/dps-compare 핸들러보다 먼저 위치해야 함
  if (method === 'GET' && url.includes('/warehouse/audit/dps-compare/by-product')) {
    const productSeeds = [
      { productCode: 'PRD-0001', productName: '냉난방 실외기 (5HP)', pendingQty: 12, completedQty: 85, qcQty: 3, returnQty: -2, totalQty: 98, diffFromDps: 0 },
      { productCode: 'PRD-0002', productName: '냉난방 실내기 (스탠드형)', pendingQty: 0, completedQty: 64, qcQty: 1, returnQty: 0, totalQty: 65, diffFromDps: -3 },
      { productCode: 'PRD-0003', productName: '천장형 에어컨 2way', pendingQty: 5, completedQty: 42, qcQty: 0, returnQty: 0, totalQty: 47, diffFromDps: 2 },
      { productCode: 'PRD-0004', productName: '덕트형 에어컨 (대형)', pendingQty: 0, completedQty: 30, qcQty: 2, returnQty: -5, totalQty: 27, diffFromDps: -5 },
      { productCode: 'PRD-0005', productName: '환기유닛 ERV-200', pendingQty: 8, completedQty: 55, qcQty: 0, returnQty: 0, totalQty: 63, diffFromDps: 0 },
      { productCode: 'PRD-0006', productName: '공조기 AHU-500', pendingQty: 2, completedQty: 18, qcQty: 4, returnQty: 0, totalQty: 24, diffFromDps: 1 },
      { productCode: 'PRD-0007', productName: '보일러 가스형 24K', pendingQty: 0, completedQty: 72, qcQty: 0, returnQty: -1, totalQty: 71, diffFromDps: -8 },
      { productCode: 'PRD-0008', productName: '열교환기 판형 (소)', pendingQty: 15, completedQty: 33, qcQty: 2, returnQty: 0, totalQty: 50, diffFromDps: 0 },
      { productCode: 'PRD-0009', productName: '냉매 R-410A 10kg', pendingQty: 3, completedQty: 120, qcQty: 0, returnQty: -10, totalQty: 113, diffFromDps: -12 },
      { productCode: 'PRD-0010', productName: '드레인 펌프 소형', pendingQty: 0, completedQty: 48, qcQty: 1, returnQty: 0, totalQty: 49, diffFromDps: 0 },
      { productCode: 'PRD-0011', productName: '전기제어반 (표준형)', pendingQty: 6, completedQty: 22, qcQty: 0, returnQty: 0, totalQty: 28, diffFromDps: 4 },
      { productCode: 'PRD-0012', productName: '배관 동관 1/2" (30m)', pendingQty: 20, completedQty: 200, qcQty: 5, returnQty: -3, totalQty: 222, diffFromDps: 0 },
    ]
    const whId = (config.params?.['warehouseId'] ?? null) as string | null
    return envelope({
      fromDate: (config.params?.['fromDate'] ?? '2026-05-01') as string,
      toDate: (config.params?.['toDate'] ?? '2026-05-11') as string,
      warehouseId: whId,
      warehouseName: whId ? '본사창고' : null,
      generatedAt: new Date().toISOString(),
      totalProductCount: productSeeds.length,
      rows: productSeeds,
    })
  }

  // GET /warehouse/dps-compare — DpsComparePage
  if (method === 'GET' && url.includes('/warehouse/dps-compare')) {
    return envelope({
      compareDate: '2026-05-10',
      totalRows: 24,
      matchedRows: 22,
      mismatchedRows: 2,
      rows: [
        { dpsCode: 'AJ040RXH4BC1', expectedQty: 12, actualQty: 12, status: 'MATCH' },
        { dpsCode: 'AJ052RXH5BC1', expectedQty: 5, actualQty: 4, status: 'MISMATCH', reason: '실측 차이' },
        { dpsCode: 'AJ036NCH3CH', expectedQty: 8, actualQty: 8, status: 'MATCH' },
      ],
    })
  }

  // ==========================================================================
  // arologis — manual / pre-classify / unassigned / dispatch-sms / dispatch-reconcile
  // ==========================================================================

  // GET /arologis/dispatches — manual / unassigned 공통
  if (method === 'GET' && url.includes('/arologis/dispatches')) {
    const dispatchDetailMatch = url.match(/\/arologis\/dispatches\/([^/?]+)$/)
    if (dispatchDetailMatch) {
      const id = dispatchDetailMatch[1]!
      const found = MOCK_DISPATCHES.find((d) => d.id === id) ?? MOCK_DISPATCHES[0]!
      return envelope(found)
    }
    return envelope({
      content: MOCK_DISPATCHES,
      totalElements: MOCK_DISPATCHES.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // GET /arologis/unassigned — UnassignedPage
  // 결함 #7: 필드명 정정 (totalSlips/unassignedSlips → totalOutbound/unassignedCount/entries)
  if (method === 'GET' && url.includes('/arologis/unassigned')) {
    return envelope({
      date: '2026-05-10',
      totalOutbound: 8,
      unassignedCount: 3,
      entries: MOCK_SLIPS.slice(0, 3).map((s) => ({
        slipId: s.id,
        slipNo: s.slipNo,
        partnerName: s.partnerName,
        shippingAddress: s.shippingAddress,
        memo: s.memo,
      })),
    })
  }

  // POST /arologis/manual/dispatch — 수동 배차 confirm
  if (method === 'POST' && url.includes('/arologis/manual')) {
    return envelope({
      dispatchId: 'disp-new-' + Date.now(),
      message: '수동 배차가 등록되었습니다',
    })
  }

  // GET /arologis/pre-classify — PreClassifyPage (REGION + 광역 prefix 2-탭)
  if (method === 'GET' && url.includes('/arologis/pre-classify')) {
    return envelope({
      date: '2026-05-10',
      regions: [
        { groupName: '서울권', slipCount: 12, slips: ['slip-001', 'slip-002'] },
        { groupName: '경기권', slipCount: 8, slips: ['slip-003'] },
        { groupName: '부산권', slipCount: 4, slips: ['slip-004'] },
        { groupName: '미분류', slipCount: 2, slips: ['slip-005'] },
      ],
      sigungus: [
        { prefix: '서울', slipCount: 12 },
        { prefix: '경기', slipCount: 8 },
        { prefix: '인천', slipCount: 3 },
        { prefix: '부산', slipCount: 4 },
      ],
    })
  }

  // SP-08-3-4: /admin/notifications/dispatch-sms/history — 배차문자 저장내역 mock.
  if (url.includes('/admin/notifications/dispatch-sms/history')) {
    const now = '2026-05-17T10:20:00'
    const previewPayload = {
      date: '2026-05-17',
      totalSlips: 3,
      mappedSlips: 2,
      unmappedSlips: 1,
      chatRooms: [
        {
          chatRoomName: '서울권 발주방',
          partners: [
            {
              partnerCode: 'P-001',
              partnerName: '엘에이시스템에어',
              slipNo: '2026/05/17-1',
              message: '[삼한] 5/17 오전 배송 예정입니다.',
              blocked: false,
            },
            {
              partnerCode: 'P-002',
              partnerName: '한일냉동기술',
              slipNo: '2026/05/17-2',
              message: '[발송 차단됨]',
              blocked: true,
            },
          ],
        },
      ],
      unmapped: [
        { partnerCode: 'P-404', partnerName: '미매핑 거래처', slipNo: '2026/05/17-3' },
      ],
    }
    const row: MockDispatchSmsHistoryRow = {
      id: 'dispatch-sms-history-demo',
      programType: 'DISPATCH_SMS',
      saveMode: 'MANUAL_NAMED',
      topic: '오전 발송 전 점검',
      createdAt: now,
      createdBy: 'dispatch-user',
      requestParams: { date: '2026-05-17', rowCount: 3 },
      rowCount: 3,
    }
    // SP-09-2: SEND_AUDIT mock 데이터 3건 (날짜별, 결과 혼합) — DispatchSmsSendAuditPage 시연용.
    const auditPayload1 = {
      date: '2026-05-17',
      sent: 2,
      failed: 0,
      blocked: 1,
      msgId: 'ALG-2026051700001',
      details: [
        { partnerCode: 'P-001', recipientPhone: '01012345678', status: 'SENT', reason: null },
        { partnerCode: 'P-003', recipientPhone: '01098765432', status: 'SENT', reason: null },
        { partnerCode: 'P-002', recipientPhone: '01055551234', status: 'BLOCKED', reason: '발송금지 등록됨' },
      ],
    }
    const auditPayload2 = {
      date: '2026-05-16',
      sent: 1,
      failed: 1,
      blocked: 0,
      msgId: 'ALG-2026051600002',
      details: [
        { partnerCode: 'P-005', recipientPhone: '01011112222', status: 'SENT', reason: null },
        { partnerCode: 'P-006', recipientPhone: '01033334444', status: 'FAILED', reason: 'Aligo 오류: result_code=-1' },
      ],
    }
    const auditPayload3 = {
      date: '2026-05-15',
      sent: 0,
      failed: 2,
      blocked: 0,
      msgId: null,
      details: [
        { partnerCode: 'P-007', recipientPhone: '01077778888', status: 'FAILED', reason: 'Aligo 오류: 잘못된 발신번호' },
        { partnerCode: 'P-008', recipientPhone: '01099990000', status: 'FAILED', reason: 'Aligo 오류: result_code=-2' },
      ],
    }
    const auditRow: MockDispatchSmsHistoryRow = {
      ...row,
      id: 'dispatch-sms-history-send-audit',
      saveMode: 'SEND_AUDIT',
      topic: '발송 감사 2026-05-17',
      requestParams: { date: '2026-05-17', rowCount: 3, sent: 2, failed: 0, blocked: 1 },
      createdAt: '2026-05-17T10:20:00',
      rowCount: 3,
      responsePayload: auditPayload1,
    }
    const auditRow2: MockDispatchSmsHistoryRow = {
      ...row,
      id: 'dispatch-sms-history-send-audit-2',
      saveMode: 'SEND_AUDIT',
      topic: '발송 감사 2026-05-16',
      requestParams: { date: '2026-05-16', rowCount: 2, sent: 1, failed: 1, blocked: 0 },
      createdAt: '2026-05-16T09:45:00',
      rowCount: 2,
      responsePayload: auditPayload2,
    }
    const auditRow3: MockDispatchSmsHistoryRow = {
      ...row,
      id: 'dispatch-sms-history-send-audit-3',
      saveMode: 'SEND_AUDIT',
      topic: '발송 감사 2026-05-15',
      requestParams: { date: '2026-05-15', rowCount: 2, sent: 0, failed: 2, blocked: 0 },
      createdAt: '2026-05-15T14:30:00',
      rowCount: 2,
      responsePayload: auditPayload3,
    }
    if (method === 'POST') {
      const body = parseMockBody(config)
      const saveMode = String(body['saveMode'] ?? 'MANUAL_NAMED')
      const requestParams = (body['requestParams'] && typeof body['requestParams'] === 'object')
        ? body['requestParams'] as Record<string, unknown>
        : {}
      const responsePayload = body['responsePayload']
      const rowCount = Number(requestParams['rowCount'] ?? 0)
      const savedRow: MockDispatchSmsHistoryRow = {
        id: `dispatch-sms-history-${saveMode.toLowerCase()}-${mockDispatchSmsHistoryRows.length + 1}`,
        programType: 'DISPATCH_SMS',
        saveMode,
        topic: String(body['topic'] ?? (saveMode === 'AUTO_LATEST' ? '자동저장' : '저장내역')),
        createdAt: new Date().toISOString(),
        createdBy: 'dispatch-user',
        requestParams,
        rowCount,
        responsePayload,
      }
      if (saveMode === 'AUTO_LATEST') {
        for (let i = mockDispatchSmsHistoryRows.length - 1; i >= 0; i -= 1) {
          if (mockDispatchSmsHistoryRows[i]?.saveMode === 'AUTO_LATEST') {
            mockDispatchSmsHistoryRows.splice(i, 1)
          }
        }
      }
      mockDispatchSmsHistoryRows.unshift(savedRow)
      return envelope({ id: savedRow.id, savedAt: savedRow.createdAt })
    }
    if (method === 'GET' && url.includes('/latest')) {
      if (mockLocationParams().get('mockDispatchSmsLatest404') === '1') {
        return mockError(404, 'DISPATCH_SMS_HISTORY_NOT_FOUND', '배차문자 저장내역을 찾을 수 없습니다.')
      }
      const latest = mockDispatchSmsHistoryRows.find(item => item.saveMode === 'AUTO_LATEST')
      return envelope(latest ?? { ...row, saveMode: 'AUTO_LATEST', topic: '자동저장', responsePayload: previewPayload })
    }
    if (method === 'GET' && /\/admin\/notifications\/dispatch-sms\/history\/[^/?]+/.test(url)) {
      const id = url.split('/').pop()?.split('?')[0] ?? ''
      const savedRow = mockDispatchSmsHistoryRows.find(item => item.id === id)
      if (savedRow) return envelope(savedRow)
      // SP-09-2: ID 별 SEND_AUDIT 상세 조회 — 3건 mock 지원
      if (id === 'dispatch-sms-history-send-audit-2') {
        return envelope({ ...auditRow2, responsePayload: auditPayload2 })
      }
      if (id === 'dispatch-sms-history-send-audit-3') {
        return envelope({ ...auditRow3, responsePayload: auditPayload3 })
      }
      if (id === 'dispatch-sms-history-send-audit' || url.includes('send-audit')) {
        return envelope({ ...auditRow, responsePayload: auditPayload1 })
      }
      return envelope({ ...row, responsePayload: previewPayload })
    }
    if (method === 'GET') {
      const mode = new URL(url, 'http://mock.local').searchParams.get('mode')
      // SP-09-2: SEND_AUDIT 전용 baseRows 3건 포함
      const baseAuditRows = [auditRow, auditRow2, auditRow3]
      const baseRows = [...baseAuditRows, row]
      const allRows = [...mockDispatchSmsHistoryRows, ...baseRows]
      const filteredRows = mode && mode !== 'ALL'
        ? allRows.filter(item => item.saveMode === mode)
        : allRows
      const pageSize = 20
      const urlParams = new URL(url, 'http://mock.local').searchParams
      const pageNum = Number(urlParams.get('page') ?? 0)
      const pageContent = filteredRows.slice(pageNum * pageSize, (pageNum + 1) * pageSize)
      return envelope({
        content: pageContent,
        totalElements: filteredRows.length,
        totalPages: Math.ceil(filteredRows.length / pageSize) || 1,
        size: pageSize,
        number: pageNum,
        first: pageNum === 0,
        last: (pageNum + 1) * pageSize >= filteredRows.length,
      })
    }
  }

  // POST /admin/notifications/dispatch-batch/preview — DispatchSmsPage preview
  if (method === 'POST' && url.includes('/admin/notifications/dispatch-batch/preview')) {
    return envelope({
      date: '2026-05-17',
      totalSlips: 3,
      mappedSlips: 2,
      unmappedSlips: 1,
      chatRooms: [
        {
          chatRoomName: '서울권 발주방',
          partners: [
            { partnerCode: 'P-001', partnerName: '엘에이시스템에어', slipNo: '2026/05/17-1', message: '[삼한] 5/17 오전 배송 예정입니다.', blocked: false },
            { partnerCode: 'P-002', partnerName: '한일냉동기술', slipNo: '2026/05/17-2', message: '[발송 차단됨]', blocked: true },
          ],
        },
      ],
      unmapped: [
        { partnerCode: 'P-404', partnerName: '미매핑 거래처', slipNo: '2026/05/17-3' },
      ],
    })
  }
  if (method === 'POST' && url.includes('/admin/notifications/dispatch-batch/send')) {
    return envelope({
      date: '2026-05-17',
      sent: 1,
      failed: 0,
      blocked: 0,
      details: [
        { partnerCode: 'P-001', recipientPhone: 'room:서울권 발주방', status: 'SENT', reason: null },
      ],
    })
  }

  // POST /arologis/dispatch/reconcile — 운송사 비교 (multipart)
  if (method === 'POST' && url.includes('/arologis/dispatch/reconcile')) {
    return envelope({
      uploadedRows: 18,
      matchedRows: 16,
      mismatchedRows: 2,
      mismatches: [
        { slipNo: '2026/05/04-1', samhanDriver: '홍지수', vendorDriver: '김민수', reason: '기사 불일치' },
        { slipNo: '2026/05/04-3', samhanDriver: '박서연', vendorDriver: '(미할당)', reason: '운송사 미배차' },
      ],
    })
  }

  // ==========================================================================
  // estimate — list / detail / form (P2-1 견적서) + 버전이력/복원 (Phase 2.2)
  // ==========================================================================
  // 주: estimate 버전이력/복원/상세 (`/api/v1/slips/estimates/{id}...`) mock 은
  //     slip list match (`url.includes('/slips')`) 가 가로채므로 그 앞단에 배치했다
  //     (위쪽 "Phase 2.2: estimate revisions/restore/detail" 블록 참조).

  // GET /api/v1/estimates/{id} (legacy 단건 상세 — Phase 6 캡처 시드)
  const estimateDetailMatch = url.match(/\/api\/v1\/estimates\/([^/?]+)$/)
  if (method === 'GET' && estimateDetailMatch && !url.includes('/print')) {
    const id = estimateDetailMatch[1]!
    const found = MOCK_ESTIMATES.find((e) => e.id === id) ?? MOCK_ESTIMATES[0]!
    return envelope(found)
  }

  // GET /api/v1/estimates (목록) — 기존 빈 list 덮어쓰기 위해 위에서 처리됨, 여기서 catch
  // (위쪽에 빈 list 매칭이 있으므로 매칭되지 않음 — endpoint 만 정의해두고 미사용)

  // POST /api/v1/estimates — 신규 견적
  if (method === 'POST' && url.endsWith('/api/v1/estimates')) {
    return envelope({
      id: 'est-new-' + Date.now(),
      estimateNumber: '2026/05/16-99',
      status: 'DRAFT',
    })
  }

  // ==========================================================================
  // Phase 2.4: 거래처 주문 버전이력/복원 — `/api/v1/partner-orders/{id}/revisions...`
  //
  // 중요: restore(POST) 가 revisions(GET) 보다 앞단 배치 (더 구체적인 path 우선).
  //       detail(GET) 보다도 앞단 배치 (/revisions path 가 detail `$` 에 미해당이므로
  //       순서는 안전하지만 명시적 앞단 권장).
  // ==========================================================================

  // POST /api/v1/partner-orders/{id}/revisions/{n}/restore — 특정 시점 복원.
  const partnerOrderRestoreMatch = url.match(
    /\/api\/v1\/partner-orders\/([^/]+)\/revisions\/(\d+)\/restore$/,
  )
  if (method === 'POST' && partnerOrderRestoreMatch) {
    const orderId = partnerOrderRestoreMatch[1]!
    // CONFIRMING / CANCELED 는 409 응답 (FE 는 버튼 비활성으로 예방하지만 BE 는 이중 가드).
    if (orderId === 'ord-confirming' || orderId === 'ord-canceled') {
      return mockError(409, 'PARTNER_ORDER_NOT_RESTORABLE', '이 상태의 주문은 복원할 수 없습니다.')
    }
    // CONFIRMED 복원 → slipResyncRequired=true.
    const slipResyncRequired = orderId === 'ord-confirmed'
    return envelope({
      order: {
        orderNumber: '2026/05/04-1',
        partnerCode: '1234567890',
        bizCode: '1234567890',
        partnerName: '엘에이시스템에어',
        submittedAt: '2026-05-04T10:30:00',
        updatedAt: '2026-05-30T11:00:00',
        status: slipResyncRequired ? 'CONFIRMED' : 'DRAFT',
        totalAmount: 240000,
        linkedSlipNo: slipResyncRequired ? 'SL-20260504-001' : null,
        deliveryAddress: '서울시 강남구 테헤란로 1',
        siteAddress: '현장 A동',
        contactPhone: '010-1234-5678',
        dueDate: '2026-05-30',
        memo: 'rev1 시점 복원본',
        lines: [
          {
            modelCode: 'AJ040RXH4BC1',
            productName: '실외기',
            categoryKey: 'homemulti',
            quantity: 2,
            deliveryPrice: 120000,
            subtotal: 240000,
            bundleMode: null,
            expandedComponents: [],
          },
        ],
      },
      slipResyncRequired,
    })
  }

  // GET /api/v1/partner-orders/{id}/revisions — 버전이력 목록 (최신 우선).
  const partnerOrderRevisionsGetMatch = url.match(
    /\/api\/v1\/partner-orders\/([^/]+)\/revisions(\?.*)?$/,
  )
  if (method === 'GET' && partnerOrderRevisionsGetMatch) {
    const orderId = partnerOrderRevisionsGetMatch[1]!
    // revisions fixture: 기본 3건 (rev3 RESTORE, rev2 EDIT, rev1 CREATE).
    // ord-delete-history: DELETE revision(rev4) 추가 — DELETE 배지 시나리오 6 용.
    // actorName: '오병승' (MOCK_AUTH.fullName), UUID 형태 아님 → 화면 노출.
    const baseRevisions = [
      {
        revisionNo: 3,
        revisionType: 'RESTORE',
        sourceRevisionNo: 1,
        orderNo: '2026/05/04-1',
        actorName: '오병승',
        actorColor: null,
        createdAt: '2026-05-30T11:00:00',
        changeSummary: { headerChanged: 1, lineAdded: 0, lineRemoved: 1, lineModified: 0 },
      },
      {
        revisionNo: 2,
        revisionType: 'EDIT',
        sourceRevisionNo: null,
        orderNo: '2026/05/04-1',
        actorName: '오병승',
        actorColor: null,
        createdAt: '2026-05-17T10:05:00',
        changeSummary: { headerChanged: 1, lineAdded: 1, lineRemoved: 0, lineModified: 0 },
      },
      {
        revisionNo: 1,
        revisionType: 'CREATE',
        sourceRevisionNo: null,
        orderNo: '2026/05/04-1',
        actorName: '오병승',
        actorColor: null,
        createdAt: '2026-05-04T10:30:00',
        changeSummary: { headerChanged: 0, lineAdded: 0, lineRemoved: 0, lineModified: 0 },
      },
    ]
    if (orderId === 'ord-delete-history') {
      // DELETE revision(rev4) 을 최신으로 prepend — 삭제 이력 배지 표시 검증용.
      return envelope([
        {
          revisionNo: 4,
          revisionType: 'DELETE',
          sourceRevisionNo: null,
          orderNo: '2026/05/04-1',
          actorName: '오병승',
          actorColor: null,
          createdAt: '2026-05-30T14:00:00',
          changeSummary: { headerChanged: 0, lineAdded: 0, lineRemoved: 0, lineModified: 0 },
        },
        ...baseRevisions,
      ])
    }
    return envelope(baseRevisions)
  }

  // ==========================================================================
  // Phase 2.6b D2: 다중주문 병합 전환 — POST /api/v1/partner-orders/convert-to-slip-merge
  //
  // 중요: partnerOrderDetailMatch 보다 앞단에 배치 (경로 더 구체적).
  // 성공 — { slipNo, convertedOrders } 반환.
  //   mockMerge409=mixed   → 409 (거래처 불일치)
  //   mockMerge409=stock   → 409 (재고 부족)
  //   기본                 → 성공 (SL-20260531-MERGE-001)
  // ==========================================================================

  if (method === 'POST' && /\/api\/v1\/partner-orders\/convert-to-slip-merge/.test(url)) {
    const params = mockLocationParams()
    const mock409 = params.get('mockMerge409')
    if (mock409 === 'mixed') {
      return mockError(
        409,
        'PARTNER_ORDER_MERGE_DIFFERENT_PARTNER',
        '병합은 같은 거래처 주문만 가능합니다.',
      )
    }
    if (mock409 === 'stock') {
      return mockError(
        409,
        'INVENTORY_INSUFFICIENT_STOCK',
        '재고 부족: 실외기(AJ040RXH4BC1) 요청 2, 가용 0',
      )
    }
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    const orders = (body?.orders as Array<{ partnerOrderId: string }>) ?? []
    // BE 확정 응답 형태: orderNo(주문번호) + orderStatus + fullyConverted.
    // 실 BE 는 PartnerOrderIdResolver 로 주문을 찾은 뒤 DB 의 orderNumber 컬럼을 orderNo 에 반환.
    // mock 고정 주문번호 상수로 BE 동작을 모사 — '2026/05/04-1', '2026/05/31-3' (DRAFT mock rows).
    const MOCK_ORDER_NOS = ['2026/05/04-1', '2026/05/31-3', '2026/05/05-2', '2026/05/31-4']
    return envelope({
      slipNo: 'SL-20260531-MERGE-001',
      convertedOrders: orders.map((_, idx) => ({
        orderNo: MOCK_ORDER_NOS[idx] ?? `2026/05/31-${idx + 1}`,
        orderStatus: 'CONVERTED',
        fullyConverted: true,
      })),
    })
  }

  // ==========================================================================
  // Phase 2.6a: 주문 부분전환 — POST /api/v1/partner-orders/{id}/convert-to-slip
  //
  // 중요: partnerOrderDetailMatch(`/([^/?]+)$`) 보다 앞단에 배치 (path suffix 가 더 구체적).
  // 성공 — { slipNo, orderStatus, fullyConverted } 반환.
  //   mockConvertFully=1   → fullyConverted=true (전량 전환)
  //   기본                 → fullyConverted=false (부분 전환)
  // 오류 — mockConvert409=1 → 409 (잔여 수량 초과)
  // ==========================================================================

  const partnerOrderConvertMatch = url.match(/\/api\/v1\/partner-orders\/([^/]+)\/convert-to-slip$/)
  if (method === 'POST' && partnerOrderConvertMatch) {
    const params = mockLocationParams()
    if (params.get('mockConvert409')) {
      return mockError(
        409,
        'PARTNER_ORDER_CONVERT_QUANTITY_EXCEEDED',
        '전환 수량이 잔여 수량을 초과하거나 이미 전환된 주문입니다.',
      )
    }
    // Phase 2.6c: 재고 부족 409 — inventory-service 사전차단 시뮬레이션.
    // mockConvertInventory409=1 → 재고 부족 메시지(품목명/수량 위주, UUID 미포함).
    if (params.get('mockConvertInventory409')) {
      return mockError(
        409,
        'INVENTORY_INSUFFICIENT_STOCK',
        '재고 부족: 실외기(AJ040RXH4BC1) 요청 2, 가용 0',
      )
    }
    const fullyConverted = params.get('mockConvertFully') === '1'
    return envelope({
      slipNo: 'SL-20260530-001',
      orderStatus: fullyConverted ? 'CONVERTED' : 'DRAFT',
      fullyConverted,
    })
  }

  // ==========================================================================
  // Phase 2.5: 주문 보류/해제 — POST /api/v1/partner-orders/{id}/hold|release
  //
  // 중요: partnerOrderDetailMatch(`/([^/?]+)$`) 보다 앞단에 배치 (path suffix 가 더 구체적).
  // hold   — DRAFT 주문 → ON_HOLD 반환. 비-DRAFT 시 409 (mockHold409 쿼리 파라미터로 시뮬레이션).
  // release — ON_HOLD 주문 → DRAFT 반환. 비-ON_HOLD 시 409 (mockRelease409 쿼리 파라미터로 시뮬레이션).
  // ==========================================================================

  const partnerOrderHoldMatch = url.match(/\/api\/v1\/partner-orders\/([^/]+)\/hold$/)
  if (method === 'POST' && partnerOrderHoldMatch) {
    const params = mockLocationParams()
    if (params.get('mockHold409')) {
      return mockError(409, 'PARTNER_ORDER_HOLD_INVALID_STATUS', '진행중(DRAFT) 상태인 주문서만 보류할 수 있습니다.')
    }
    const orderId = partnerOrderHoldMatch[1]!
    return envelope({
      orderNumber: '2026/05/04-1',
      partnerCode: '1234567890',
      bizCode: '1234567890',
      partnerName: '엘에이시스템에어',
      submittedAt: '2026-05-04T10:30:00',
      updatedAt: new Date().toISOString(),
      status: 'ON_HOLD',
      totalAmount: 3700000,
      linkedSlipNo: null,
      deliveryAddress: '서울시 강남구 테헤란로 1',
      siteAddress: '현장 A동',
      contactPhone: '010-1234-5678',
      dueDate: '2026-05-30',
      memo: `hold mock — orderId=${orderId}`,
      lines: [
        {
          modelCode: 'AJ040RXH4BC1',
          productName: '실외기',
          categoryKey: 'homemulti',
          quantity: 2,
          deliveryPrice: 120000,
          subtotal: 240000,
          bundleMode: null,
          expandedComponents: [],
        },
      ],
    })
  }

  const partnerOrderReleaseMatch = url.match(/\/api\/v1\/partner-orders\/([^/]+)\/release$/)
  if (method === 'POST' && partnerOrderReleaseMatch) {
    const params = mockLocationParams()
    if (params.get('mockRelease409')) {
      return mockError(409, 'PARTNER_ORDER_RELEASE_INVALID_STATUS', '보류(ON_HOLD) 상태인 주문서만 해제할 수 있습니다.')
    }
    const orderId = partnerOrderReleaseMatch[1]!
    return envelope({
      orderNumber: '2026/05/04-1',
      partnerCode: '1234567890',
      bizCode: '1234567890',
      partnerName: '엘에이시스템에어',
      submittedAt: '2026-05-04T10:30:00',
      updatedAt: new Date().toISOString(),
      status: 'DRAFT',
      totalAmount: 3700000,
      linkedSlipNo: null,
      deliveryAddress: '서울시 강남구 테헤란로 1',
      siteAddress: '현장 A동',
      contactPhone: '010-1234-5678',
      dueDate: '2026-05-30',
      memo: `release mock — orderId=${orderId}`,
      lines: [
        {
          modelCode: 'AJ040RXH4BC1',
          productName: '실외기',
          categoryKey: 'homemulti',
          quantity: 2,
          deliveryPrice: 120000,
          subtotal: 240000,
          bundleMode: null,
          expandedComponents: [],
        },
      ],
    })
  }

  // ==========================================================================
  // partner-orders detail (기존 빈 list 옆에 detail mock)
  // ==========================================================================
  const partnerOrderDetailMatch = url.match(/\/api\/v1\/partner-orders\/([^/?]+)$/)
  if (method === 'GET' && partnerOrderDetailMatch) {
    const poId = partnerOrderDetailMatch[1]!
    // Phase 2.4/2.5/2.6a spec 용: orderId 별 status 분기
    // ord-draft               → DRAFT     (Phase 2.4 복원 + Phase 2.5 보류 + Phase 2.6a 전환 진입점)
    // ord-hold                → ON_HOLD   (Phase 2.5 보류 해제 진입점 + Phase 2.6a 전환 가능)
    // ord-confirmed           → CONFIRMED (Phase 2.4 복원 slipResyncRequired=true) — 전환 버튼 미노출
    // ord-confirming          → CONFIRMING — 전환 버튼 미노출
    // ord-canceled            → CANCELED  — 전환 버튼 미노출
    // ord-linked-slip         → DRAFT + linkedSlipNo 있음 — 전환 버튼 미노출
    // ord-partially-converted → DRAFT + line 0 convertedQuantity=1 (부분 전환 후 잔여 1 남음)
    // 그 외 기존 fixture      → CONFIRMED (하위 호환)
    // Phase 2.6d: ord-error-test → 에러 배너 시나리오 (R-4). __error_test__ productId → batch 500
    if (poId === 'ord-error-test') {
      return envelope({
        orderNumber: '2026/05/31-ERR',
        partnerCode: '1234567890',
        bizCode: '1234567890',
        partnerName: '테스트에러거래처',
        submittedAt: '2026-05-31T10:00:00',
        updatedAt: '2026-05-31T10:00:00',
        status: 'DRAFT',
        totalAmount: 100000,
        linkedSlipNo: null,
        deliveryAddress: '서울시 강남구 테헤란로 1',
        siteAddress: '현장 B동',
        contactPhone: '010-0000-0000',
        dueDate: '2026-06-01',
        memo: null,
        lines: [
          {
            productId: '__error_test__',
            lineId: 'line-err-001',
            modelCode: 'ERR-MODEL-001',
            productName: '에러 테스트 품목',
            categoryKey: 'homemulti',
            quantity: 1,
            convertedQuantity: 0,
            deliveryPrice: 100000,
            subtotal: 100000,
            bundleMode: null,
            expandedComponents: [],
          },
        ],
      })
    }

    const poStatus: string =
      poId === 'ord-draft' || poId === 'ord-partially-converted' || poId === 'ord-linked-slip'
        ? 'DRAFT'
        : poId === 'ord-hold'
          ? 'ON_HOLD'
          : poId === 'ord-confirming'
            ? 'CONFIRMING'
            : poId === 'ord-canceled'
              ? 'CANCELED'
              : 'CONFIRMED'
    const poLinkedSlip =
      poId === 'ord-linked-slip'
        ? 'SL-20260504-001'
        : poStatus === 'CONFIRMED'
          ? 'SL-20260504-001'
          : null
    // Phase 2.6a: 라인별 convertedQuantity 분기
    //   ord-partially-converted → line-po-001: quantity=2, convertedQuantity=1 (잔여 1)
    //                             line-po-002: quantity=3, convertedQuantity=3 (전환완료, 잔여 0)
    //   그 외 DRAFT/ON_HOLD 전환 가능 fixture → convertedQuantity=0
    // Phase 2.6d: 주문 라인에 productId 추가 (재고 batch 조회 키. 화면 미노출)
    const poLines =
      poId === 'ord-partially-converted'
        ? [
            {
              productId: 'p-aj040',
              lineId: 'line-po-001',
              modelCode: 'AJ040RXH4BC1',
              productName: '실외기',
              categoryKey: 'homemulti',
              quantity: 2,
              convertedQuantity: 1,
              deliveryPrice: 120000,
              subtotal: 240000,
              bundleMode: null,
              expandedComponents: [],
            },
            {
              productId: 'p-mwr10',
              lineId: 'line-po-002',
              modelCode: 'MWR-WE10N',
              productName: '유선 리모컨',
              categoryKey: 'homemulti',
              quantity: 3,
              convertedQuantity: 3,
              deliveryPrice: 85000,
              subtotal: 255000,
              bundleMode: null,
              expandedComponents: [],
            },
          ]
        : [
            {
              productId: 'p-aj040',
              lineId: 'line-po-001',
              modelCode: 'AJ040RXH4BC1',
              productName: '실외기',
              categoryKey: 'homemulti',
              quantity: 2,
              convertedQuantity: 0,
              deliveryPrice: 120000,
              subtotal: 240000,
              bundleMode: null,
              expandedComponents: [],
            },
          ]
    return envelope({
      orderNumber: '2026/05/04-1',
      partnerCode: '1234567890',
      bizCode: '1234567890',
      partnerName: '엘에이시스템에어',
      submittedAt: '2026-05-04T10:30:00',
      updatedAt: '2026-05-17T10:00:00',
      status: poStatus,
      totalAmount: 3700000,
      linkedSlipNo: poLinkedSlip,
      deliveryAddress: '서울시 강남구 테헤란로 1',
      siteAddress: '현장 A동',
      contactPhone: '010-1234-5678',
      dueDate: '2026-05-30',
      memo: '5/5 오전 배송 부탁드립니다',
      lines: poLines,
    })
  }

  if (method === 'PUT' && partnerOrderDetailMatch) {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    if (body?.updatedAt === '409') {
      return mockError(409, 'PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT', '최신 내용으로 다시 확인해 주세요.')
    }
    return envelope({
      orderNumber: '2026/05/04-1',
      partnerCode: body?.partnerCode ?? '1234567890',
      bizCode: body?.bizCode ?? '1234567890',
      partnerName: '엘에이시스템에어',
      submittedAt: '2026-05-04T10:30:00',
      updatedAt: '2026-05-17T10:05:00',
      status: 'CONFIRMED',
      totalAmount: 685000,
      linkedSlipNo: 'SL-20260504-001',
      deliveryAddress: '서울시 강남구 테헤란로 1',
      siteAddress: '현장 A동',
      contactPhone: '010-1234-5678',
      dueDate: body?.dueDate ?? null,
      memo: body?.memo ?? null,
      lines: body?.lines?.map((line: Record<string, unknown>) => ({
        modelCode: line['modelCode'],
        productName: line['productName'],
        categoryKey: line['categoryKey'],
        quantity: line['quantity'],
        deliveryPrice: line['deliveryPrice'],
        subtotal: Number(line['quantity']) * Number(line['deliveryPrice']),
        bundleMode: null,
        expandedComponents: [],
      })) ?? [],
    })
  }

  if (method === 'DELETE' && partnerOrderDetailMatch) {
    const params = mockLocationParams()
    if (params.get('mockDelete404')) {
      return mockError(404, 'PARTNER_ORDER_NOT_FOUND', '주문서를 찾을 수 없습니다.')
    }
    if (params.get('mockDelete422')) {
      return mockError(422, 'PARTNER_ORDER_DELETE_FORBIDDEN_STATUS', '확정 또는 전표 발행된 주문서는 삭제할 수 없습니다.')
    }
    return envelope(null)
  }

  const partnerOrderAuditMatch = url.match(/\/api\/v1\/partner-orders\/([^/?]+)\/audit-logs/)
  if (method === 'GET' && partnerOrderAuditMatch) {
    return envelope([
      {
        revisionNo: 1,
        fieldName: '요청사항',
        oldValue: '5/5 오전 배송 부탁드립니다',
        newValue: '오전 납품 요청',
        actorId: 'hidden',
        actorName: '영업담당자',
        changedAt: '2026-05-17T10:05:00',
      },
    ])
  }

  // ==========================================================================
  // audit-logs 추가 (slip 외 — journal / tax-invoice / dispatch / user)
  // ==========================================================================
  const otherAuditLogsMatch = url.match(/\/(journals|tax-invoices|dispatches|users)\/([^/]+)\/audit-logs/)
  if (method === 'GET' && otherAuditLogsMatch) {
    const domain = otherAuditLogsMatch[1]!
    const sample = MOCK_AUDIT_LOGS_BY_DOMAIN[domain] ?? []
    return envelope(sample)
  }

  // ==========================================================================
  // SP-08-3-3: /slips/cleanup/history — 전표정리 저장내역 mock.
  // generic /slips/cleanup matcher 보다 먼저 처리해야 한다.
  // ==========================================================================
  if (url.includes('/slips/cleanup/history')) {
    const now = '2026-05-17T09:30:00'
    const row = {
      id: 'slip-cleanup-history-demo',
      programType: 'SLIP_CLEANUP',
      saveMode: 'MANUAL_NAMED',
      topic: '월말 마감 직전 점검',
      createdAt: now,
      createdBy: 'sales-user',
      requestParams: { from: '2026-05-01', to: '2026-05-16', rowCount: 2 },
      rowCount: 2,
    }
    const payload = {
      from: '2026-05-01',
      to: '2026-05-16',
      totalSlips: 2,
      byStatus: [{ status: 'SAVED', count: 2 }],
      byPartner: [{ partnerCode: 'P001', partnerName: '엘에이시스템에어', count: 2 }],
      entries: MOCK_SLIPS.slice(0, 2).map((s) => ({
        id: s.id,
        slipNo: s.slipNo,
        slipDate: s.slipDate,
        status: s.status,
        partnerCode: 'P001',
        partnerName: s.partnerName,
        classifiedRegionGroup: '서울권',
        lineCount: 2,
        totalAmount: '3870000',
        partnerCodeMissing: false,
        amountZero: false,
        linesMissing: false,
        regionMissing: false,
      })),
    }
    if (method === 'POST') {
      return envelope({ id: 'slip-cleanup-history-saved', savedAt: now })
    }
    if (method === 'GET' && url.includes('/latest')) {
      if (mockLocationParams().get('mockLatest404') === '1') {
        return mockError(404, 'SLIP_CLEANUP_HISTORY_NOT_FOUND', '전표정리 저장내역을 찾을 수 없습니다.')
      }
      return envelope({ ...row, saveMode: 'AUTO_LATEST', topic: '자동저장', responsePayload: payload })
    }
    if (method === 'GET' && /\/slips\/cleanup\/history\/[^/?]+/.test(url)) {
      return envelope({ ...row, responsePayload: payload })
    }
    if (method === 'GET') {
      return envelope({
        content: [row],
        totalElements: 1,
        totalPages: 1,
        size: 50,
        number: 0,
        first: true,
        last: true,
      })
    }
  }

  // ==========================================================================
  // 결함 #1: GET /slips/cleanup — SlipCleanupPage (Network Error 회피)
  // shape: SlipCleanupResponse { from, to, totalSlips, byStatus[], byPartner[], entries[] }
  // ==========================================================================
  if (method === 'GET' && url.includes('/slips/cleanup')) {
    return envelope({
      from: '2026-04-01',
      to: '2026-04-30',
      totalSlips: 12,
      byStatus: [
        { status: 'COMPLETED', count: 7 },
        { status: 'CANCELED', count: 3 },
        { status: 'CONFIRMED', count: 2 },
      ],
      byPartner: [
        { partnerCode: '1234567890', partnerBusinessName: '엘에이시스템에어', count: 5 },
        { partnerCode: '2345678901', partnerBusinessName: '강남에어솔루션', count: 4 },
        { partnerCode: '3456789012', partnerBusinessName: '한빛쾌적', count: 3 },
      ],
      entries: MOCK_SLIPS.slice(0, 5).map((s) => ({
        slipNo: s.slipNo,
        slipDate: s.slipDate,
        partnerCode: 'P' + s.partnerId,
        partnerBusinessName: s.partnerName,
        status: s.status,
        totalAmount: 3870000,
      })),
    })
  }

  // ==========================================================================
  // 결함 #2: GET /slips/next-day-image-data?date=YYYY-MM-DD — NextDaySlipPage (빈 화면 회피)
  // shape: NextDaySlipImageResponse { targetDate, totalSlips, regionGroups: [{ regionGroup, slipCount, slips }] }
  // ==========================================================================
  if (method === 'GET' && url.includes('/slips/next-day-image-data')) {
    const targetDate = (config.params?.['date'] ?? '2026-05-11') as string
    return envelope({
      targetDate,
      totalSlips: 7,
      regionGroups: [
        {
          regionGroup: '서울권',
          slipCount: 3,
          slips: [
            { slipNo: '2026/05/11-1', partnerBusinessName: '엘에이시스템에어', shippingAddress: '서울특별시 강남구 테헤란로 152', memo: '9시까지 배송요망' },
            { slipNo: '2026/05/11-2', partnerBusinessName: '강남에어솔루션', shippingAddress: '서울특별시 서초구 강남대로 27', memo: null },
            { slipNo: '2026/05/11-3', partnerBusinessName: '한빛쾌적', shippingAddress: '서울특별시 마포구 양화로 45', memo: '오후 배송 가능' },
          ],
        },
        {
          regionGroup: '경기남부',
          slipCount: 2,
          slips: [
            { slipNo: '2026/05/11-4', partnerBusinessName: '미래시스템', shippingAddress: '경기도 성남시 분당구 판교로 235', memo: null },
            { slipNo: '2026/05/11-5', partnerBusinessName: '대박종합건설', shippingAddress: '경기도 수원시 영통구 광교로 107', memo: '창고 직납' },
          ],
        },
        {
          regionGroup: '부산권',
          slipCount: 2,
          slips: [
            { slipNo: '2026/05/11-6', partnerBusinessName: '한일냉동기술', shippingAddress: '부산광역시 해운대구 센텀중앙로 79', memo: null },
            { slipNo: '2026/05/11-7', partnerBusinessName: '서초에어월드', shippingAddress: '부산광역시 사상구 낙동대로 241', memo: null },
          ],
        },
      ],
    })
  }

  // ==========================================================================
  // P0-2 셀프 비밀번호 재설정 — page 방식 신규 endpoint 2종
  // ==========================================================================

  // POST /api/v1/auth/password-reset/request — 인증번호 발송 요청
  // 항상 성공 응답 (enumeration 방지 — BE silent skip).
  // BE 는 ApiResponse.ok(null, "...") 를 반환하므로 envelope.message 에 사용자 메시지 포함.
  if (method === 'POST' && url.includes('/auth/password-reset/request')) {
    return {
      success: true,
      code: 'OK',
      message: '등록된 이메일로 인증번호가 전송되었습니다. 10분 이내에 입력해주세요.',
      data: null,
      timestamp: new Date().toISOString(),
    }
  }

  // POST /api/v1/auth/password-reset/confirm — 인증번호 + 새 비밀번호 확인
  // 결정적 mock: 인증번호 "123456" 일 때 성공, 그 외 envelope.success=false (mock 어댑터는 항상 200 반환)
  if (method === 'POST' && url.includes('/auth/password-reset/confirm')) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      token?: string
    }
    if (body.token === '123456') {
      return {
        success: true,
        code: 'OK',
        message: '비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요.',
        data: null,
        timestamp: new Date().toISOString(),
      }
    }
    // 인증번호 불일치 — envelope.success=false. ConfirmPage 가 success: false 시 에러 배너 처리.
    return {
      success: false,
      code: 'UNAUTHORIZED',
      message: '인증번호가 일치하지 않거나 만료되었습니다. 다시 요청해주세요.',
      data: null,
      timestamp: new Date().toISOString(),
    }
  }

  // POST /api/v1/admin/partner-order/vendor/confirm — 확정 → orderNo 반환
  if (method === 'POST' && url.includes('/admin/partner-order/vendor/confirm')) {
    const today = new Date()
    const yymmdd
      = today.getFullYear()
      + '/'
      + String(today.getMonth() + 1).padStart(2, '0')
      + '/'
      + String(today.getDate()).padStart(2, '0')
    const seq = String(Math.floor(Math.random() * 900) + 100)
    const body = config.data as
      | { vendorName?: string; partnerCode?: string; lines?: { quantity: number; finalPrice: number }[] }
      | string
      | undefined
    let total = 0
    let vendorName = '에어디자이너'
    let partnerCode = 'AIRD-001'
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body
      if (parsed?.vendorName) vendorName = parsed.vendorName
      if (parsed?.partnerCode) partnerCode = parsed.partnerCode
      if (Array.isArray(parsed?.lines)) {
        total = parsed.lines.reduce(
          (s: number, l: { quantity: number; finalPrice: number }) =>
            s + (l.quantity || 0) * (l.finalPrice || 0),
          0,
        )
      }
    } catch {
      // ignore
    }
    return envelope({
      orderNo: `${yymmdd}-${Number(seq)}`,
      partnerOrderId: '00000000-0000-0000-0000-' + Date.now().toString().padStart(12, '0'),
      status: 'PENDING',
      totalAmount: total,
      vendorName,
      partnerCode,
    })
  }

  // ==========================================================================
  // P0-9 입고 검수 mock endpoint
  // - GET  /api/v1/inventory/inbound-inspections          — 목록 (status 필터)
  // - GET  /api/v1/inventory/inbound-inspections/{slipId} — 상세 (라인 포함)
  // - POST /api/v1/inventory/inbound-inspections/{slipId}/inspect  — 검수 저장
  // - POST /api/v1/inventory/inbound-inspections/{slipId}/complete — 검수 완료
  // ==========================================================================

  /** 검수 목록 시연용 시드 — 3건 (검수대기 2, 검수완료 1). BE 정의 enum 정합. */
  const MOCK_INSPECTIONS_SUMMARY = [
    {
      slipId: 'iq-001',
      slipNo: '2026/05/10-1',
      partnerName: '삼성전자',
      slipDate: '2026-05-10',
      status: 'PENDING',
      inspectorName: null,
    },
    {
      slipId: 'iq-002',
      slipNo: '2026/05/10-2',
      partnerName: 'LG전자',
      slipDate: '2026-05-10',
      status: 'PENDING',
      inspectorName: null,
    },
    {
      slipId: 'iq-003',
      slipNo: '2026/05/09-3',
      partnerName: '캐리어에어컨',
      slipDate: '2026-05-09',
      status: 'COMPLETED',
      inspectorName: '김기철',
    },
  ]

  /** 검수 상세 라인 시연용 — 3개 품목. */
  const MOCK_INSPECTION_LINES = [
    {
      lineId: 'iline-001',
      slipLineId: 'sl-aj040',
      modelCode: 'AJ040RXH4BC1',
      productName: '시스템에어컨 4Way 4HP',
      expectedQty: 5,
      inspectedQty: 5,
      defectQty: 0,
      defectReason: null,
    },
    {
      lineId: 'iline-002',
      slipLineId: 'sl-aj052',
      modelCode: 'AJ052RXH5BC1',
      productName: '시스템에어컨 4Way 5HP',
      expectedQty: 3,
      inspectedQty: 2,
      defectQty: 1,
      defectReason: '외장 스크래치',
    },
    {
      lineId: 'iline-003',
      slipLineId: 'sl-mwr10',
      modelCode: 'MWR-WE10N',
      productName: '유선 리모컨 (WE10N)',
      expectedQty: 10,
      inspectedQty: 10,
      defectQty: 0,
      defectReason: null,
    },
  ]

  // GET /api/v1/inventory/inbound-inspections/{slipId} — 단건 상세
  const inspectionDetailMatch = url.match(
    /\/inventory\/inbound-inspections\/([^/?]+)$/,
  )
  if (method === 'GET' && inspectionDetailMatch) {
    const slipId = inspectionDetailMatch[1]!
    const summary = MOCK_INSPECTIONS_SUMMARY.find((s) => s.slipId === slipId)
      ?? MOCK_INSPECTIONS_SUMMARY[0]!
    return envelope({
      slipId: summary.slipId,
      slipNo: summary.slipNo,
      partnerName: summary.partnerName,
      slipDate: summary.slipDate,
      inspectorName: summary.inspectorName,
      status: summary.status,
      lines: MOCK_INSPECTION_LINES,
    })
  }

  // POST /api/v1/inventory/inbound-inspections/{slipId}/inspect — 검수 저장
  const inspectionInspectMatch = url.match(
    /\/inventory\/inbound-inspections\/([^/?]+)\/inspect$/,
  )
  if (method === 'POST' && inspectionInspectMatch) {
    return envelope({ message: '검수 내용이 임시 저장되었습니다.' })
  }

  // POST /api/v1/inventory/inbound-inspections/{slipId}/complete — 검수 완료
  const inspectionCompleteMatch = url.match(
    /\/inventory\/inbound-inspections\/([^/?]+)\/complete$/,
  )
  if (method === 'POST' && inspectionCompleteMatch) {
    return envelope({ message: '검수가 완료되어 재고에 반영되었습니다.' })
  }

  // GET /api/v1/inventory/inbound-inspections — 목록 (status 필터)
  if (method === 'GET' && url.includes('/inventory/inbound-inspections')) {
    const statusParam = (config.params?.['status'] ?? '') as string
    const filtered = statusParam
      ? MOCK_INSPECTIONS_SUMMARY.filter((s) => s.status === statusParam)
      : MOCK_INSPECTIONS_SUMMARY
    return envelope({
      content: filtered,
      totalElements: filtered.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // GET /inventory/alerts/safety-stock/count — 헤더 배지용 알림 건수 (BE 정합)
  if (method === 'GET' && url.endsWith('/inventory/alerts/safety-stock/count')) {
    return envelope({ count: MOCK_SAFETY_STOCK_ALERTS.length })
  }

  // GET /inventory/alerts/safety-stock — 임계 미만 List 평면 (BE 정합)
  if (method === 'GET' && url.endsWith('/inventory/alerts/safety-stock')) {
    return envelope(MOCK_SAFETY_STOCK_ALERTS)
  }

  // POST /inventory/products/{productId}/safety-stock — 임계값 upsert (BE 정합)
  if (method === 'POST' && /\/inventory\/products\/[^/]+\/safety-stock$/.test(url)) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      warehouseId?: string | null
      threshold?: number
      note?: string | null
    }
    const segments = url.split('/')
    // 마지막에서 두 번째 segment 가 productId
    const productId = segments[segments.length - 2] ?? 'UNKNOWN'
    return envelope({
      id: 'mock-config-uuid',
      productId,
      warehouseId: body.warehouseId ?? null,
      threshold: body.threshold ?? 0,
      note: body.note ?? null,
    })
  }

  // ==========================================================================
  // 홈택스 일괄 양식 — BE cleanup agent 신규 endpoint (/accounting/hometax-export/...)
  // ==========================================================================

  // POST /accounting/hometax-export/preview — 미리보기 생성 (250건, splitFileCount=3)
  if (method === 'POST' && url.includes('/accounting/hometax-export/preview')) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      fromDate?: string
      toDate?: string
    }
    return envelope({
      batchNo: `BATCH-${Date.now().toString().slice(-8)}`,
      batchId: '00000000-0000-0000-0000-batchmocknew1',
      totalRowCount: MOCK_BATCH_ROWS.length,
      splitFileCount: Math.ceil(MOCK_BATCH_ROWS.length / 100),
      rows: MOCK_BATCH_ROWS,
      exclusions: MOCK_BATCH_EXCLUSIONS.map((e) => e.partnerCode),
      fromDate: body.fromDate ?? '2026-05-01',
      toDate: body.toDate ?? '2026-05-31',
    })
  }

  // GET /accounting/hometax-export/{batchId}/split — 분할 Excel blob (text/csv 시뮬레이션)
  if (method === 'GET' && /\/accounting\/hometax-export\/[^/]+\/split/.test(url)) {
    const fileIndex = Number((config.params?.['fileIndex'] as string | undefined) ?? '0')
    const pageRows = MOCK_BATCH_ROWS.slice(fileIndex * 100, (fileIndex + 1) * 100)
    const header = '행번호,전표번호,작성일자,공급자상호,공급자사업자번호,공급받는자상호,공급받는자사업자번호,공급가액,세액,합계\n'
    const csv = pageRows
      .map((r) =>
        [r.rowNo, r.slipNo, r.issueDate, r.supplierName, r.supplierBusinessNo,
          r.recipientName, r.recipientBusinessNo, r.supplyAmount, r.vatAmount, r.totalAmount].join(','),
      )
      .join('\n')
    return `${header}${csv}`
  }

  // GET /accounting/hometax-export/history/{batchId} — 단건 이력 (Tab 4 복원)
  if (method === 'GET' && /\/accounting\/hometax-export\/history\/[^/]+$/.test(url)) {
    return envelope({
      batchNo: 'BATCH-20260501-001',
      batchId: '00000000-0000-0000-0000-batch0000001',
      totalRowCount: MOCK_BATCH_ROWS.length,
      splitFileCount: Math.ceil(MOCK_BATCH_ROWS.length / 100),
      rows: MOCK_BATCH_ROWS,
      exclusions: MOCK_BATCH_EXCLUSIONS.map((e) => e.partnerCode),
      fromDate: '2026-05-01',
      toDate: '2026-05-15',
    })
  }

  // GET /accounting/hometax-export/history — 이력 목록
  if (method === 'GET' && url.includes('/accounting/hometax-export/history')) {
    return envelope({
      content: MOCK_BATCH_HISTORIES,
      totalElements: MOCK_BATCH_HISTORIES.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // POST /accounting/hometax-export/exclusions — 제외 거래처 추가
  if (method === 'POST' && url.includes('/accounting/hometax-export/exclusions')) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      partnerCode?: string
      partnerName?: string
      reason?: string
    }
    return envelope({
      partnerCode: body.partnerCode ?? 'P-NEW',
      partnerName: body.partnerName ?? '신규 거래처',
      reason: body.reason ?? '—',
      createdAt: new Date().toISOString(),
      createdBy: '오병승',
    })
  }

  // DELETE /accounting/hometax-export/exclusions/{partnerCode}
  if (method === 'DELETE' && url.includes('/accounting/hometax-export/exclusions/')) {
    return envelope({ deleted: true })
  }

  // GET /accounting/hometax-export/exclusions — 제외 거래처 목록
  if (method === 'GET' && url.includes('/accounting/hometax-export/exclusions')) {
    return envelope(MOCK_BATCH_EXCLUSIONS)
  }

  // ==========================================================================
  // 세금계산서 일괄발행 — 구 endpoint (Deprecation: true 반환, URL 호환 유지)
  // ==========================================================================

  // @deprecated — POST /accounting/tax-invoices/batch/preview
  // HometaxExportPage 로 통합됨. /accounting/tax-invoices/batch route 는 Navigate redirect.
  if (method === 'POST' && url.includes('/accounting/tax-invoices/batch/preview')) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      fromDate?: string
      toDate?: string
    }
    return envelope({
      batchNo: `BATCH-${Date.now().toString().slice(-8)}`,
      batchId: '00000000-0000-0000-0000-batchmocknew1',
      totalRowCount: MOCK_BATCH_ROWS.length,
      splitFileCount: Math.ceil(MOCK_BATCH_ROWS.length / 100),
      rows: MOCK_BATCH_ROWS,
      exclusions: MOCK_BATCH_EXCLUSIONS.map((e) => e.partnerCode),
      fromDate: body.fromDate ?? '2026-05-01',
      toDate: body.toDate ?? '2026-05-31',
    })
  }

  // @deprecated — GET /accounting/tax-invoices/batch/{id}/excel
  if (method === 'GET' && /\/accounting\/tax-invoices\/batch\/[^/]+\/excel/.test(url)) {
    const fileIndex = Number((config.params?.['fileIndex'] as string | undefined) ?? '0')
    const pageRows = MOCK_BATCH_ROWS.slice(fileIndex * 100, (fileIndex + 1) * 100)
    const header = '행번호,전표번호,작성일자,공급자상호,공급자사업자번호,공급받는자상호,공급받는자사업자번호,공급가액,세액,합계\n'
    const csv = pageRows
      .map((r) =>
        [r.rowNo, r.slipNo, r.issueDate, r.supplierName, r.supplierBusinessNo,
          r.recipientName, r.recipientBusinessNo, r.supplyAmount, r.vatAmount, r.totalAmount].join(','),
      )
      .join('\n')
    return `${header}${csv}`
  }

  // @deprecated — GET /accounting/tax-invoices/batch/exclusions
  if (method === 'GET' && url.includes('/accounting/tax-invoices/batch/exclusions')) {
    return envelope(MOCK_BATCH_EXCLUSIONS)
  }

  // @deprecated — POST /accounting/tax-invoices/batch/exclusions
  if (method === 'POST' && url.includes('/accounting/tax-invoices/batch/exclusions')) {
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      partnerCode?: string
      partnerName?: string
      reason?: string
    }
    return envelope({
      partnerCode: body.partnerCode ?? 'P-NEW',
      partnerName: body.partnerName ?? '신규 거래처',
      reason: body.reason ?? '—',
      createdAt: new Date().toISOString(),
      createdBy: '오병승',
    })
  }

  // ============================================================================
  // SP-09-3 영수증 OCR 업로드 mock (POST /slips/receipt-ocr)
  //
  // submitMethod=DRY_RUN → 가짜 OCR 결과 + 매입 슬립 번호 반환.
  // 응답 shape = BE ReceiptParseResponse record 와 1:1 정합 (cycle 2 fix — Codex blocker 1).
  //
  // 시나리오:
  //   - 파일명에 "empty" 포함 → 422 빈 파일 에러 (code: RECEIPT_FILE_INVALID — BE ErrorCode 일치)
  //   - 파일 크기 > 10MB 또는 파일명에 "toolarge" 포함 → 422 크기 초과 에러 (code: RECEIPT_FILE_INVALID)
  //   - 파일명에"502" 포함 → 502 OCR 외부 서비스 오류 (code: OCR_SUBMIT_FAILED — BE ErrorCode 일치)
  //   - 그 외 → 정상 DRY_RUN 가짜 응답 (테스트마트)
  //
  // UUID 비공개: slipId 는 BE DTO 미포함. slipNo 만 사용자 노출.
  // ============================================================================
  if (method === 'POST' && url.includes('/slips/receipt-ocr')) {
    const formData = config.data instanceof FormData ? config.data : null
    const fileName = formData?.get('file') instanceof File
      ? (formData.get('file') as File).name.toLowerCase()
      : ''
    const fileSize = formData?.get('file') instanceof File
      ? (formData.get('file') as File).size
      : 0

    // 빈 파일 시나리오 (BE ErrorCode: RECEIPT_FILE_INVALID)
    if (fileName.includes('empty') || fileSize === 0) {
      return mockError(422, 'RECEIPT_FILE_INVALID', '파일이 비어있습니다. 유효한 영수증 이미지를 업로드하세요.')
    }

    // 10MB 초과 시나리오 (BE ErrorCode: RECEIPT_FILE_INVALID)
    const MAX_BYTES = 10 * 1024 * 1024
    if (fileSize > MAX_BYTES || fileName.includes('toolarge')) {
      return mockError(422, 'RECEIPT_FILE_INVALID', '파일 크기가 10MB 를 초과합니다. 이미지를 압축하거나 다른 파일을 선택하세요.')
    }

    // 502 OCR 외부 서비스 오류 시나리오 (BE ErrorCode: OCR_SUBMIT_FAILED)
    if (fileName.includes('502')) {
      return mockError(502, 'OCR_SUBMIT_FAILED', 'Naver Clova OCR 외부 서비스에 일시적 오류가 발생했습니다. 잠시 후 다시 시도하세요.')
    }

    // 정상 DRY_RUN 가짜 응답 — BE ReceiptParseResponse 필드명 1:1 정합
    // fields: slipNo / vendorName / totalAmount / vatAmount / issuedAt / submitMethod / parseRawJson
    const today = new Date().toISOString().slice(0, 10)
    const slipSeq = Math.floor(Math.random() * 9) + 1
    return envelope({
      slipNo: `${today}-${slipSeq}`,
      vendorName: '테스트마트',
      totalAmount: 55000,
      vatAmount: 5000,
      issuedAt: today,
      submitMethod: 'DRY_RUN',
      parseRawJson: JSON.stringify({
        _mode: 'DRY_RUN',
        vendorName: '테스트마트',
        totalAmount: 55000,
        vatAmount: 5000,
        issuedAt: today,
      }),
    })
  }

  // ============================================================================
  // SP-09-4 KFTC 오픈뱅킹 입금 매칭 mock (POST /accounting/deposits/fetch-and-match)
  //
  // submitMethod=DRY_RUN → 가짜 입금 매칭 결과 5건 반환.
  // 응답 shape = BE DepositMatchResponse 와 1:1 정합.
  //
  // 시나리오:
  //   - accountFinNo 가 빈 문자열 → 422 (code: DEPOSIT_VALIDATION_ERROR)
  //   - from > to → 422 (code: DEPOSIT_DATE_RANGE_INVALID)
  //   - accountFinNo 가 "502" 포함 → 502 KFTC 외부 서비스 오류 (code: KFTC_SUBMIT_FAILED)
  //   - 그 외 → 정상 DRY_RUN 5건 응답
  //
  // UUID 비공개: journalDraftId 는 내부 전용 — 화면 미노출 (matchedPartnerCode / matchedTaxInvoiceNo 만 표시).
  // ============================================================================
  if (method === 'POST' && url.includes('/accounting/deposits/fetch-and-match')) {
    const body = parseMockBody(config)
    const reqFrom = typeof body['from'] === 'string' ? body['from'] : ''
    const reqTo = typeof body['to'] === 'string' ? body['to'] : ''
    const reqAccountFinNo = typeof body['accountFinNo'] === 'string' ? body['accountFinNo'] : ''

    // 422 — accountFinNo 누락
    if (!reqAccountFinNo.trim()) {
      return mockError(422, 'DEPOSIT_VALIDATION_ERROR', '계좌 핀번호(accountFinNo)를 입력해주세요.')
    }

    // 422 — from > to
    if (reqFrom && reqTo && reqFrom > reqTo) {
      return mockError(422, 'DEPOSIT_DATE_RANGE_INVALID', '시작일은 종료일보다 이전이어야 합니다.')
    }

    // 502 — KFTC 외부 서비스 오류 시나리오
    if (reqAccountFinNo.includes('502')) {
      return mockError(502, 'KFTC_SUBMIT_FAILED', 'KFTC 오픈뱅킹 외부 서비스에 일시적 오류가 발생했습니다. 잠시 후 다시 시도하세요.')
    }

    // 정상 DRY_RUN 가짜 응답 — BE DepositMatchResponse 필드명 1:1 정합
    // fields: totalCount / matchedCount / unmatchedCount / results
    // results[].fields: depositorName / amount / transactionDate / matchedPartnerCode? / matchedTaxInvoiceNo? / journalDraftId? / status
    const baseDate = reqTo || new Date().toISOString().slice(0, 10)
    const [baseYear, baseMonth] = baseDate.split('-')
    const ym = `${baseYear ?? '2026'}-${baseMonth ?? '05'}`

    const dryRunResults = [
      {
        depositorName: '○○종합건설',
        amount: 2750000,
        transactionDate: `${ym}-02`,
        matchedPartnerCode: 'P-001',
        matchedTaxInvoiceNo: 'TI-20260502-001',
        status: 'MATCHED',
      },
      {
        depositorName: '△△인테리어',
        amount: 1320000,
        transactionDate: `${ym}-05`,
        matchedPartnerCode: 'P-002',
        matchedTaxInvoiceNo: null,
        status: 'UNMATCHED',
      },
      {
        depositorName: '□□설비공사',
        amount: 880000,
        transactionDate: `${ym}-08`,
        matchedPartnerCode: null,
        matchedTaxInvoiceNo: null,
        status: 'UNMATCHED',
      },
      {
        depositorName: '◇◇냉난방',
        amount: 4180000,
        transactionDate: `${ym}-12`,
        matchedPartnerCode: 'P-004',
        matchedTaxInvoiceNo: 'TI-20260512-003',
        status: 'MATCHED',
      },
      {
        depositorName: '홍길동',
        amount: 550000,
        transactionDate: `${ym}-15`,
        matchedPartnerCode: null,
        matchedTaxInvoiceNo: null,
        status: 'UNMATCHED',
      },
    ] as const

    const matchedCount = dryRunResults.filter((r) => r.status === 'MATCHED').length
    const unmatchedCount = dryRunResults.filter((r) => r.status === 'UNMATCHED').length

    return envelope({
      totalCount: dryRunResults.length,
      matchedCount,
      unmatchedCount,
      results: dryRunResults,
    })
  }

  // @deprecated — DELETE /accounting/tax-invoices/batch/exclusions/{partnerCode}
  if (method === 'DELETE' && url.includes('/accounting/tax-invoices/batch/exclusions/')) {
    return envelope({ deleted: true })
  }

  // @deprecated — GET /accounting/tax-invoices/batch/history/{batchId}
  if (method === 'GET' && /\/accounting\/tax-invoices\/batch\/history\/[^/]+$/.test(url)) {
    return envelope({
      batchNo: 'BATCH-20260501-001',
      batchId: '00000000-0000-0000-0000-batch0000001',
      totalRowCount: MOCK_BATCH_ROWS.length,
      splitFileCount: Math.ceil(MOCK_BATCH_ROWS.length / 100),
      rows: MOCK_BATCH_ROWS,
      exclusions: MOCK_BATCH_EXCLUSIONS.map((e) => e.partnerCode),
      fromDate: '2026-05-01',
      toDate: '2026-05-15',
    })
  }

  // @deprecated — GET /accounting/tax-invoices/batch/history
  if (method === 'GET' && url.includes('/accounting/tax-invoices/batch/history')) {
    return envelope({
      content: MOCK_BATCH_HISTORIES,
      totalElements: MOCK_BATCH_HISTORIES.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // ==========================================================================
  // SP-D1: 동적 RBAC 권한 매트릭스 mock
  // SP-D1 cycle 2 fix: BE 계약과 동일한 endpoint/응답 shape 사용.
  // ==========================================================================

  // GET /auth/admin/permissions — 전체 역할 × 페이지 매트릭스 (MASTER 전용)
  // BE 응답: Map<roleCode, Map<pageCode, PermissionDto>>
  if (method === 'GET' && (url.endsWith('/auth/admin/permissions') || url.endsWith('/admin/permissions'))) {
    const nestedMap: Record<string, Record<string, {
      roleCode: string; pageCode: string; displayName: string
      canView: boolean; canEdit: boolean; isOverride: boolean
    }>> = {}
    for (const cell of _mockPermissionCells) {
      if (!nestedMap[cell.roleCode]) nestedMap[cell.roleCode] = {} as Record<string, { roleCode: string; pageCode: string; displayName: string; canView: boolean; canEdit: boolean; isOverride: boolean }>
      const roleMap = nestedMap[cell.roleCode]
      if (!roleMap) continue
      roleMap[cell.pageCode] = {
        roleCode: cell.roleCode,
        pageCode: cell.pageCode,
        displayName: cell.pageCode,
        canView: cell.view,
        canEdit: cell.edit,
        isOverride: true,
      }
    }
    return envelope(nestedMap)
  }

  // POST /auth/admin/permissions/batch — 배치 업데이트 (MASTER 전용)
  // BE 요청: { permissions: [{ roleCode, pageCode, canView, canEdit }] }
  if (method === 'POST' && (url.includes('/auth/admin/permissions/batch') || url.includes('/admin/permissions/batch'))) {
    const body = parseMockBody(config) as {
      permissions?: Array<{ roleCode: string; pageCode: string; canView: boolean; canEdit: boolean }>
    }
    if (Array.isArray(body.permissions)) {
      for (const p of body.permissions) {
        const cell = _mockPermissionCells.find(
          (c) => c.roleCode === p.roleCode && c.pageCode === p.pageCode,
        )
        if (cell) {
          cell.view = p.canView
          cell.edit = p.canEdit
        }
      }
    }
    return envelope(null)
  }

  // GET /auth/admin/permissions/accounts — Task 12 계정 selector mock.
  if (method === 'GET' && (url.includes('/auth/admin/permissions/accounts') || url.includes('/admin/permissions/accounts'))) {
    return envelope([
      { id: 'mock-account-manager', displayName: '김관리', role: 'MANAGER', enabled: true },
      { id: 'mock-account-sales', displayName: '이영업', role: 'SALES', enabled: true },
      { id: 'mock-account-dispatch', displayName: '박배차', role: 'DISPATCH', enabled: true },
    ])
  }

  // POST /auth/admin/permissions/bulk — Task 13 다계정 일괄 wizard mock.
  if (method === 'POST' && (url.includes('/auth/admin/permissions/bulk') || url.includes('/admin/permissions/bulk'))) {
    const body = parseMockBody(config) as {
      accountIds?: string[]
      mode?: 'template' | 'grants'
      roleCode?: string
      grants?: Array<{ actions?: Record<string, boolean> }>
    }
    const accountCount = Array.isArray(body.accountIds) ? body.accountIds.length : 0
    if (body.mode === 'template' && body.roleCode) {
      return envelope({ changedCount: accountCount * SP_D1_PAGES.length * 7 })
    }
    if (body.mode === 'grants' && Array.isArray(body.grants)) {
      const actionCount = body.grants.reduce((sum, grant) => {
        return sum + Object.values(grant.actions ?? {}).filter(Boolean).length
      }, 0)
      return envelope({ changedCount: accountCount * actionCount })
    }
    return envelope({ changedCount: 0 })
  }

  if (
    (url.includes('/auth/admin/permissions/account/') || url.includes('/admin/permissions/account/')) &&
    !url.includes('/apply-template') &&
    !url.includes('/copy-from')
  ) {
    if (method === 'GET') {
      const role =
        url.includes('mock-account-sales') ? 'SALES'
          : url.includes('mock-account-dispatch') ? 'DISPATCH'
            : 'MANAGER'
      const accountMatrix: Record<string, {
        view: boolean
        create: boolean
        update: boolean
        delete: boolean
        restore: boolean
        download: boolean
        print: boolean
      }> = {}
      for (const page of SP_D1_PAGES) {
        const legacyCell = _mockPermissionCells.find((cell) => cell.roleCode === role && cell.pageCode === page)
        accountMatrix[page] = {
          view: legacyCell?.view ?? false,
          create: legacyCell?.edit ?? false,
          update: legacyCell?.edit ?? false,
          delete: legacyCell?.edit ?? false,
          restore: false,
          download: legacyCell?.view ?? false,
          print: legacyCell?.view ?? false,
        }
      }
      accountMatrix['system.permission-admin'] = {
        view: role === 'MANAGER',
        create: false,
        update: role === 'MANAGER',
        delete: false,
        restore: false,
        download: false,
        print: false,
      }
      return envelope(accountMatrix)
    }

    if (method === 'PUT') {
      const updates = parseMockBody(config)
      return envelope({ changedCount: Array.isArray(updates) ? updates.length : 0 })
    }
  }

  if (method === 'POST' && (url.includes('/apply-template') || url.includes('/copy-from'))) {
    return envelope({ changedCount: 12 })
  }

  // GET /auth/admin/permissions/my — 현재 사용자 권한 목록
  // BE 응답: Map<pageCode, PermissionAction[]>.
  if (method === 'GET' && (url.includes('/auth/admin/permissions/my') || url.includes('/admin/permissions/my'))) {
    const mockRole = MOCK_AUTH.role
    // 실 BE 응답은 대문자 PermissionAction enum (예: "VIEW") → actionsFromRaw 의
    // toLowerCase() 정규화 경로를 mock 으로도 회귀 포착하기 위해 대문자로 반환한다.
    const allActions = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'DOWNLOAD', 'PRINT']
    if (mockRole === 'MASTER') {
      const permissions: Record<string, string[]> = {}
      for (const page of SP_D1_PAGES) permissions[page] = allActions
      permissions['system.permission-admin'] = allActions
      return envelope(permissions)
    }
    const myCells = _mockPermissionCells.filter((c) => c.roleCode === mockRole)
    const permissions: Record<string, string[]> = {}
    for (const cell of myCells) {
      const actions = []
      if (cell.view) actions.push('VIEW')
      if (cell.edit) actions.push('CREATE', 'UPDATE', 'DELETE')
      if (cell.view) actions.push('DOWNLOAD', 'PRINT')
      permissions[cell.pageCode] = actions
    }
    return envelope(permissions)
  }

  return null
}

// ============================================================================
// accounting-slice-A: 회계 mock seed data
// ============================================================================

/**
 * 한국 일반기업회계기준 표준 계정과목 시드 (~50개).
 * BE 시드와 동일한 4자리 코드 + 한국어 라벨 + 카테고리 prefix.
 *
 * 카테고리:
 * - `100` 자산 (현금성 / 매출채권 / 재고 / 유형자산)
 * - `200` 부채 (매입채무 / 예수금 / 차입금)
 * - `300` 자본
 * - `400` 매출
 * - `500` 매출원가
 * - `800` 판매관리비
 * - `900` 영업외 (수익 / 비용)
 */
const MOCK_ACCOUNTS = [
  // 100 자산
  { code: '1010', name: '현금', category: '100' },
  { code: '1020', name: '보통예금', category: '100' },
  { code: '1030', name: '당좌예금', category: '100' },
  { code: '1040', name: '정기예금', category: '100' },
  { code: '1110', name: '외상매출금', category: '100' },
  { code: '1120', name: '받을어음', category: '100' },
  { code: '1130', name: '미수금', category: '100' },
  { code: '1200', name: '단기대여금', category: '100' },
  { code: '1310', name: '선급금', category: '100' },
  { code: '1320', name: '선급비용', category: '100' },
  { code: '1410', name: '부가세대급금', category: '100' },
  { code: '1500', name: '제품', category: '100' },
  { code: '1510', name: '상품', category: '100' },
  { code: '1520', name: '원재료', category: '100' },
  { code: '1700', name: '비품', category: '100' },
  { code: '1710', name: '차량운반구', category: '100' },
  { code: '1720', name: '기계장치', category: '100' },
  { code: '1800', name: '건물', category: '100' },
  // 200 부채
  { code: '2010', name: '외상매입금', category: '200' },
  { code: '2020', name: '지급어음', category: '200' },
  { code: '2030', name: '미지급금', category: '200' },
  { code: '2040', name: '미지급비용', category: '200' },
  { code: '2110', name: '예수금', category: '200' },
  { code: '2120', name: '선수금', category: '200' },
  { code: '2210', name: '부가세예수금', category: '200' },
  { code: '2300', name: '단기차입금', category: '200' },
  { code: '2310', name: '장기차입금', category: '200' },
  // 300 자본
  { code: '3010', name: '자본금', category: '300' },
  { code: '3020', name: '이익잉여금', category: '300' },
  // 400 매출
  { code: '4010', name: '제품매출', category: '400' },
  { code: '4020', name: '상품매출', category: '400' },
  { code: '4030', name: '서비스매출', category: '400' },
  // 500 매출원가
  { code: '5010', name: '제품매출원가', category: '500' },
  { code: '5020', name: '상품매출원가', category: '500' },
  // 800 판매관리비
  { code: '8010', name: '급여', category: '800' },
  { code: '8020', name: '복리후생비', category: '800' },
  { code: '8030', name: '퇴직급여', category: '800' },
  { code: '8110', name: '지급수수료', category: '800' },
  { code: '8120', name: '임차료', category: '800' },
  { code: '8130', name: '보험료', category: '800' },
  { code: '8210', name: '광고선전비', category: '800' },
  { code: '8220', name: '접대비', category: '800' },
  { code: '8310', name: '여비교통비', category: '800' },
  { code: '8320', name: '운반비', category: '800' },
  { code: '8410', name: '소모품비', category: '800' },
  { code: '8420', name: '수선비', category: '800' },
  { code: '8500', name: '감가상각비', category: '800' },
  // 900 영업외
  { code: '9010', name: '이자수익', category: '900' },
  { code: '9020', name: '잡이익', category: '900' },
  { code: '9510', name: '이자비용', category: '900' },
  { code: '9520', name: '잡손실', category: '900' },
]

/**
 * 시연용 mock 분개 5건 (DRAFT 1 / POSTED 3 / REVERSED 1).
 *
 * BE 응답 형태와 1:1 (라인 포함). 라인은 차변/대변 합계가 일치 (분개 균형 검증 통과).
 */
const MOCK_JOURNALS = [
  // 1. POSTED: 보통예금 입금 (제품매출 대금)
  {
    id: 'jv-001',
    journalNo: 'JV-2026/05-001',
    journalDate: '2026-05-04',
    status: 'POSTED' as const,
    description: '5월 1주차 제품매출 대금 입금 (윌리)',
    totalDebit: '3700000',
    totalCredit: '3700000',
    createdByName: '오병승',
    createdAt: '2026-05-04T09:30:00+09:00',
    postedAt: '2026-05-04T10:00:00+09:00',
    reversedAt: null,
    reverseReason: null,
    version: 1,
    lines: [
      {
        id: 'jl-001-1',
        lineNo: 0,
        accountCode: '1020',
        accountName: '보통예금',
        debit: '3700000',
        credit: '0',
        partnerName: '주식회사 윌리',
        note: '국민은행 입금',
      },
      {
        id: 'jl-001-2',
        lineNo: 1,
        accountCode: '4010',
        accountName: '제품매출',
        debit: '0',
        credit: '3700000',
        partnerName: '주식회사 윌리',
        note: '시스템에어컨 4Way 4HP 2EA',
      },
    ],
  },
  // 2. POSTED: 급여 지급
  {
    id: 'jv-002',
    journalNo: 'JV-2026/05-002',
    journalDate: '2026-05-03',
    status: 'POSTED' as const,
    description: '4월 급여 지급',
    totalDebit: '12000000',
    totalCredit: '12000000',
    createdByName: '이정훈',
    createdAt: '2026-05-03T16:00:00+09:00',
    postedAt: '2026-05-03T16:30:00+09:00',
    reversedAt: null,
    reverseReason: null,
    version: 1,
    lines: [
      {
        id: 'jl-002-1',
        lineNo: 0,
        accountCode: '8010',
        accountName: '급여',
        debit: '12000000',
        credit: '0',
        partnerName: null,
        note: '4월분 정규직 급여',
      },
      {
        id: 'jl-002-2',
        lineNo: 1,
        accountCode: '2110',
        accountName: '예수금',
        debit: '0',
        credit: '1080000',
        partnerName: null,
        note: '소득세 + 4대보험 원천징수',
      },
      {
        id: 'jl-002-3',
        lineNo: 2,
        accountCode: '1020',
        accountName: '보통예금',
        debit: '0',
        credit: '10920000',
        partnerName: null,
        note: '실지급액 이체',
      },
    ],
  },
  // 3. POSTED: 임차료 지급
  {
    id: 'jv-003',
    journalNo: 'JV-2026/05-003',
    journalDate: '2026-05-02',
    status: 'POSTED' as const,
    description: '5월 사무실 임차료',
    totalDebit: '2000000',
    totalCredit: '2000000',
    createdByName: '이정훈',
    createdAt: '2026-05-02T10:00:00+09:00',
    postedAt: '2026-05-02T10:15:00+09:00',
    reversedAt: null,
    reverseReason: null,
    version: 1,
    lines: [
      {
        id: 'jl-003-1',
        lineNo: 0,
        accountCode: '8120',
        accountName: '임차료',
        debit: '2000000',
        credit: '0',
        partnerName: '한일빌딩',
        note: '5월분',
      },
      {
        id: 'jl-003-2',
        lineNo: 1,
        accountCode: '1020',
        accountName: '보통예금',
        debit: '0',
        credit: '2000000',
        partnerName: '한일빌딩',
        note: '계좌이체',
      },
    ],
  },
  // 4. DRAFT: 광고비 (작성중)
  {
    id: 'jv-004',
    journalNo: 'JV-2026/05-004',
    journalDate: '2026-05-04',
    status: 'DRAFT' as const,
    description: '5월 네이버 광고 (검토중)',
    totalDebit: '500000',
    totalCredit: '500000',
    createdByName: '오병승',
    createdAt: '2026-05-04T14:00:00+09:00',
    postedAt: null,
    reversedAt: null,
    reverseReason: null,
    version: 0,
    lines: [
      {
        id: 'jl-004-1',
        lineNo: 0,
        accountCode: '8210',
        accountName: '광고선전비',
        debit: '500000',
        credit: '0',
        partnerName: '네이버',
        note: '5월 검색광고',
      },
      {
        id: 'jl-004-2',
        lineNo: 1,
        accountCode: '2030',
        accountName: '미지급금',
        debit: '0',
        credit: '500000',
        partnerName: '네이버',
        note: '카드 후불',
      },
    ],
  },
  // 5. REVERSED: 잘못 등록한 매출 (역분개됨)
  {
    id: 'jv-005',
    journalNo: 'JV-2026/05-005',
    journalDate: '2026-05-01',
    status: 'REVERSED' as const,
    description: '오등록 매출 (월말 정정)',
    totalDebit: '1500000',
    totalCredit: '1500000',
    createdByName: '오병승',
    createdAt: '2026-05-01T11:00:00+09:00',
    postedAt: '2026-05-01T11:30:00+09:00',
    reversedAt: '2026-05-04T17:00:00+09:00',
    reverseReason: '거래처 변경으로 분개 재작성 필요',
    version: 2,
    lines: [
      {
        id: 'jl-005-1',
        lineNo: 0,
        accountCode: '1110',
        accountName: '외상매출금',
        debit: '1500000',
        credit: '0',
        partnerName: '○○종합건설',
        note: '5/1 출고분',
      },
      {
        id: 'jl-005-2',
        lineNo: 1,
        accountCode: '4010',
        accountName: '제품매출',
        debit: '0',
        credit: '1500000',
        partnerName: '○○종합건설',
        note: '시스템에어컨 4Way 5HP 1EA (오등록)',
      },
    ],
  },
]

/**
 * 시연용 mock 시산표 1건 (period=202605).
 *
 * 위 MOCK_JOURNALS 의 POSTED 분개 (jv-001/002/003) 합산을 단순화한 시드.
 * 실제 BE 는 ledger_balance 테이블을 PIVOT 하여 동적 계산.
 */
const MOCK_TRIAL_BALANCE = {
  period: '202605',
  closed: false,
  totalDebit: '17700000',
  totalCredit: '17700000',
  rows: [
    {
      accountCode: '1020',
      accountName: '보통예금',
      category: '100',
      openingBalance: '50000000',
      periodDebit: '3700000',
      periodCredit: '12920000',
      closingBalance: '40780000',
    },
    {
      accountCode: '2110',
      accountName: '예수금',
      category: '200',
      openingBalance: '0',
      periodDebit: '0',
      periodCredit: '1080000',
      closingBalance: '1080000',
    },
    {
      accountCode: '4010',
      accountName: '제품매출',
      category: '400',
      openingBalance: '0',
      periodDebit: '0',
      periodCredit: '3700000',
      closingBalance: '3700000',
    },
    {
      accountCode: '8010',
      accountName: '급여',
      category: '800',
      openingBalance: '0',
      periodDebit: '12000000',
      periodCredit: '0',
      closingBalance: '12000000',
    },
    {
      accountCode: '8120',
      accountName: '임차료',
      category: '800',
      openingBalance: '0',
      periodDebit: '2000000',
      periodCredit: '0',
      closingBalance: '2000000',
    },
  ],
}

// ============================================================================
// Phase 12 step-6 manual-rewrite Phase A — 50+ page mount mock fixture
// ============================================================================

/**
 * 사용자 admin (admin/UsersPage) — 8건 + 8 ROLE 분포 + 부서 5건.
 * UUID 비공개 가드 — 사용자 노출 식별자는 loginId / fullName.
 */
const MOCK_ADMIN_USERS = [
  {
    id: 'user-001',
    loginId: 'kimmiseon',
    fullName: '김미선',
    position: '대표이사',
    role: 'MASTER' as const,
    departmentId: 'dept-005',
    departmentName: '관리팀',
    teamLead: true,
    hireDate: '2020-01-01',
    terminationDate: null,
    email: 'kimmiseon@samhan.com',
    phone: '010-1111-2222',
  },
  {
    id: 'user-002',
    loginId: 'leejunghoon',
    fullName: '이정훈',
    position: '회계팀장',
    role: 'ACCOUNTANT' as const,
    departmentId: 'dept-003',
    departmentName: '회계팀',
    teamLead: true,
    hireDate: '2021-03-15',
    terminationDate: null,
    email: 'lee@samhan.com',
    phone: '010-3333-4444',
  },
  {
    id: 'user-003',
    loginId: 'salesuser',
    fullName: '오병승',
    position: '영업1팀장',
    role: 'SALES' as const,
    departmentId: 'dept-001',
    departmentName: '영업1팀',
    teamLead: true,
    hireDate: '2022-06-20',
    terminationDate: null,
    email: 'oh@samhan.com',
    phone: '010-5555-6666',
  },
  {
    id: 'user-004',
    loginId: 'parkseoyeon',
    fullName: '박서연',
    position: '영업2팀',
    role: 'SALES' as const,
    departmentId: 'dept-002',
    departmentName: '영업2팀',
    teamLead: false,
    hireDate: '2023-04-10',
    terminationDate: null,
    email: 'park@samhan.com',
    phone: '010-7777-8888',
  },
  {
    id: 'user-005',
    loginId: 'hongjisu',
    fullName: '홍지수',
    position: '창고팀장',
    role: 'WAREHOUSE' as const,
    departmentId: 'dept-004',
    departmentName: '창고팀',
    teamLead: true,
    hireDate: '2021-08-01',
    terminationDate: null,
    email: 'hong@samhan.com',
    phone: '010-1234-5678',
  },
  {
    id: 'user-006',
    loginId: 'kimgicheol',
    fullName: '김기철',
    position: '재고원',
    role: 'INVENTORY' as const,
    departmentId: 'dept-004',
    departmentName: '창고팀',
    teamLead: false,
    hireDate: '2024-01-15',
    terminationDate: null,
    email: 'kim@samhan.com',
    phone: '010-9876-5432',
  },
  {
    id: 'user-007',
    loginId: 'devuser',
    fullName: '강현구',
    position: '시스템 개발',
    role: 'DEVELOPER' as const,
    departmentId: 'dept-005',
    departmentName: '관리팀',
    teamLead: false,
    hireDate: '2023-02-01',
    terminationDate: null,
    email: 'kang@samhan.com',
    phone: '010-2222-3333',
  },
  {
    id: 'user-008',
    loginId: 'manageruser',
    fullName: '정매니저',
    position: '운영매니저',
    role: 'MANAGER' as const,
    departmentId: 'dept-005',
    departmentName: '관리팀',
    teamLead: false,
    hireDate: '2022-11-05',
    terminationDate: '2026-04-30',
    email: 'jung@samhan.com',
    phone: '010-4444-5555',
  },
]

/**
 * 거래처 admin (admin/PartnersPage) — 6건 + ACTIVE/SUSPENDED/TERMINATED 분포.
 */
const MOCK_ADMIN_PARTNERS: Array<Record<string, unknown>> = [
  {
    partnerCode: '1234567890',
    partnerName: '엘에이시스템에어',
    representative: '이엘에이',
    businessNumber: '123-45-67890',
    address: '서울특별시 강남구 테헤란로 152',
    phone: '02-1234-5678',
    status: 'ACTIVE' as const,
    creditLimit: '50000000',
    currentBalance: '4250000',
    createdAt: '2024-03-15T09:00:00+09:00',
  },
  {
    partnerCode: '2345678901',
    partnerName: '강남에어솔루션',
    representative: '강솔루',
    businessNumber: '234-56-78901',
    address: '서울특별시 서초구 서초대로 200',
    phone: '02-2345-6789',
    status: 'ACTIVE' as const,
    creditLimit: '30000000',
    currentBalance: '0',
    createdAt: '2024-05-20T10:00:00+09:00',
  },
  {
    partnerCode: '3456789012',
    partnerName: '한빛쾌적',
    representative: '한빛이',
    businessNumber: '345-67-89012',
    address: '경기도 성남시 분당구 판교로 235',
    phone: '031-3456-7890',
    status: 'ACTIVE' as const,
    creditLimit: '20000000',
    currentBalance: '5500000',
    createdAt: '2024-07-01T11:00:00+09:00',
  },
  {
    partnerCode: '4567890123',
    partnerName: '미래시스템',
    representative: '미래길',
    businessNumber: '456-78-90123',
    address: '인천광역시 연수구 송도과학로 32',
    phone: '032-4567-8901',
    status: 'SUSPENDED' as const,
    creditLimit: '15000000',
    currentBalance: '12000000',
    createdAt: '2023-11-10T14:00:00+09:00',
  },
  {
    partnerCode: '5678901234',
    partnerName: '대박종합건설',
    representative: '김대박',
    businessNumber: '567-89-01234',
    address: '서울특별시 송파구 올림픽로 300',
    phone: '02-5678-9012',
    status: 'ACTIVE' as const,
    creditLimit: '100000000',
    currentBalance: '23500000',
    createdAt: '2022-08-25T16:00:00+09:00',
  },
  {
    partnerCode: '6789012345',
    partnerName: '경기냉난방',
    representative: '경기냉',
    businessNumber: '678-90-12345',
    address: '경기도 수원시 영통구 광교로 145',
    phone: '031-6789-0123',
    status: 'TERMINATED' as const,
    creditLimit: '0',
    currentBalance: '0',
    createdAt: '2021-04-12T08:30:00+09:00',
  },
]

/**
 * 가배차 지역 분류 (admin/RegionsPage) — 6건.
 */
const MOCK_REGIONS = [
  { id: 'reg-001', groupName: '서울권', keywords: '강남구,서초구,송파구,강동구,마포구,용산구', sortOrder: 1 },
  { id: 'reg-002', groupName: '경기남부', keywords: '성남시,수원시,용인시,화성시,평택시', sortOrder: 2 },
  { id: 'reg-003', groupName: '경기북부', keywords: '고양시,파주시,의정부시,남양주시', sortOrder: 3 },
  { id: 'reg-004', groupName: '인천권', keywords: '연수구,남동구,부평구,서구', sortOrder: 4 },
  { id: 'reg-005', groupName: '부산권', keywords: '해운대구,수영구,부산진구,동래구', sortOrder: 5 },
  { id: 'reg-006', groupName: '대구권', keywords: '수성구,중구,달서구', sortOrder: 6 },
]

/**
 * 단톡방 매핑 (admin/ChatRoomsPage) — 4건.
 * 결함 #3: ChatRoomMapping interface 일치로 shape 교체
 * (기존 { roomName, regionGroupName, vehicleType, driverCount, active } 폐기)
 * shape: { id, partnerCode, partnerBusinessName, chatRoomName, source, notionCreatedAt, createdAt }
 */
const MOCK_CHAT_ROOMS = [
  {
    id: 'cr-001',
    partnerCode: '1234567890',
    partnerBusinessName: '엘에이시스템에어',
    chatRoomName: '서울 1톤 단톡방',
    source: 'NOTION' as const,
    notionCreatedAt: '2026-01-10T09:00:00+09:00',
    createdAt: '2026-01-10T09:05:00+09:00',
  },
  {
    id: 'cr-002',
    partnerCode: '2345678901',
    partnerBusinessName: '강남에어솔루션',
    chatRoomName: '서울 2.5톤 단톡방',
    source: 'NOTION' as const,
    notionCreatedAt: '2026-01-15T10:00:00+09:00',
    createdAt: '2026-01-15T10:05:00+09:00',
  },
  {
    id: 'cr-003',
    partnerCode: '3456789012',
    partnerBusinessName: '한빛쾌적',
    chatRoomName: '경기 1톤 단톡방',
    source: 'MANUAL' as const,
    notionCreatedAt: null,
    createdAt: '2026-02-01T11:00:00+09:00',
  },
  {
    id: 'cr-004',
    partnerCode: '6789012345',
    partnerBusinessName: '경기냉난방',
    chatRoomName: '부산 1톤 단톡방',
    source: 'NOTION' as const,
    notionCreatedAt: '2026-03-05T08:30:00+09:00',
    createdAt: '2026-03-05T08:35:00+09:00',
  },
]

/**
 * 발송금지 거래처 (admin/BlockedPartnersPage) — 2건.
 * 결함 #4: BlockedPartner shape 정정
 * { id, partnerCode, businessNameSnapshot, blockReason, blockedAt, source }
 * (기존 partnerName / blockReasonDetail / blockedByName 폐기)
 */
const MOCK_BLOCKED_PARTNERS = [
  {
    id: 'block-001',
    partnerCode: '6789012345',
    businessNameSnapshot: '경기냉난방',
    blockReason: 'CUSTOMER_REQUEST' as const,
    blockedAt: '2026-04-15T10:00:00+09:00',
    source: 'MANUAL' as const,
  },
  {
    id: 'block-002',
    partnerCode: '4567890123',
    businessNameSnapshot: '미래시스템',
    blockReason: 'PAYMENT_OVERDUE' as const,
    blockedAt: '2026-05-01T09:30:00+09:00',
    source: 'MANUAL' as const,
  },
]

/**
 * 세금계산서 (`/accounting/tax-invoices`) — 3건 + DRAFT/ISSUED/CANCELLED 분포.
 *
 * BE TaxInvoiceDetailResponse 필드명 1:1 일치 (PR #136 + PR #139 회고 회귀 회피):
 * - taxInvoiceNo / partnerId / partnerCode / partnerBusinessNo / partnerName / partnerAddress
 * - invoiceType (P0-4 신규 — SALES/PURCHASE)
 * - supplyDate / supplyAmount / vatAmount / totalAmount / status
 * - issuedAt / issuedBy / cancelledAt / cancelledBy / cancelReason (P0-4 신규)
 * - journalId / reverseJournalId / eTaxExternalId / description / lines[]
 *
 * P0-4 라인 필드 (PR #139 BE rename):
 * - specification (legacy 'spec' → BE record 'specification' 으로 rename)
 * - unit (P0-4 신규 — 건/kg/CBM 등)
 *
 * UUID 비공개: id / partnerId / journalId 는 path param 전용 — 화면 미노출.
 */
const MOCK_TAX_INVOICES = [
  {
    id: 'ti-001',
    taxInvoiceNo: 'TI-2026/05-001',
    invoiceType: 'SALES' as const,
    partnerId: 'partner-uuid-0001',
    partnerCode: 'P-LASYS-001',
    partnerBusinessNo: '123-45-67890',
    partnerName: '엘에이시스템에어',
    partnerAddress: '서울특별시 강남구 테헤란로 152 강남파이낸스센터 20층',
    supplyDate: '2026-05-04',
    supplyAmount: '3700000',
    vatAmount: '370000',
    totalAmount: '4070000',
    status: 'ISSUED' as const,
    issuedAt: '2026-05-04T10:30:00+09:00',
    issuedBy: '이정훈',
    cancelledAt: null as string | null,
    cancelledBy: null as string | null,
    cancelReason: null as string | null,
    journalId: 'jv-ti-001',
    reverseJournalId: null as string | null,
    eTaxExternalId: null as string | null,
    description: '5월 1주차 시스템에어컨 출고',
    lines: [
      {
        lineId: 'tl-001-1',
        lineNo: 0,
        itemName: '시스템에어컨 4Way 4HP',
        specification: 'AJ040RXH4BC1',
        unit: '대' as string | null,
        quantity: '2',
        unitPrice: '1850000',
        supplyAmount: '3700000',
        vatAmount: '370000',
        memo: null as string | null,
      },
    ],
  },
  {
    id: 'ti-002',
    taxInvoiceNo: null as string | null,
    invoiceType: 'SALES' as const,
    partnerId: 'partner-uuid-0002',
    partnerCode: 'P-GANGNAM-002',
    partnerBusinessNo: '234-56-78901',
    partnerName: '강남에어솔루션',
    partnerAddress: '서울특별시 서초구 서초대로 320 KT 서초타워 5층',
    supplyDate: '2026-05-08',
    supplyAmount: '8000000',
    vatAmount: '800000',
    totalAmount: '8800000',
    status: 'DRAFT' as const,
    issuedAt: null as string | null,
    issuedBy: null as string | null,
    cancelledAt: null as string | null,
    cancelledBy: null as string | null,
    cancelReason: null as string | null,
    journalId: null as string | null,
    reverseJournalId: null as string | null,
    eTaxExternalId: null as string | null,
    description: '5월 2주차 (작성중)',
    lines: [
      {
        lineId: 'tl-002-1',
        lineNo: 0,
        itemName: '실외기 10HP',
        specification: 'AJ100NCDKH',
        unit: '대' as string | null,
        quantity: '2',
        unitPrice: '4000000',
        supplyAmount: '8000000',
        vatAmount: '800000',
        memo: null as string | null,
      },
    ],
  },
  {
    id: 'ti-003',
    taxInvoiceNo: 'TI-2026/04-099',
    invoiceType: 'SALES' as const,
    partnerId: 'partner-uuid-0003',
    partnerCode: 'P-HANBIT-003',
    partnerBusinessNo: '345-67-89012',
    partnerName: '한빛쾌적',
    partnerAddress: '경기도 수원시 영통구 삼성로 129',
    supplyDate: '2026-04-28',
    supplyAmount: '5000000',
    vatAmount: '500000',
    totalAmount: '5500000',
    status: 'CANCELLED' as const,
    issuedAt: '2026-04-28T09:00:00+09:00',
    issuedBy: '이정훈',
    cancelledAt: '2026-04-29T14:20:00+09:00',
    cancelledBy: '이정훈',
    cancelReason: '거래처 요청 — 모델 오등록 (수정 후 재발행)' as string | null,
    journalId: 'jv-ti-003',
    reverseJournalId: 'jv-ti-003-rev',
    eTaxExternalId: null as string | null,
    description: '거래처 요청 취소 (오등록)',
    lines: [
      {
        lineId: 'tl-003-1',
        lineNo: 0,
        itemName: '천장형 1Way 3HP',
        specification: 'AJ036NCH3CH',
        unit: '대' as string | null,
        quantity: '3',
        unitPrice: '1450000',
        supplyAmount: '4350000',
        vatAmount: '435000',
        memo: null as string | null,
      },
      {
        lineId: 'tl-003-2',
        lineNo: 1,
        itemName: '유선 리모컨',
        specification: 'MWR-WE10N',
        unit: '개' as string | null,
        quantity: '8',
        unitPrice: '81250',
        supplyAmount: '650000',
        vatAmount: '65000',
        memo: '추가 리모컨' as string | null,
      },
    ],
  },
]

/**
 * 재고 실사 (`/warehouse/audit`) — 3건 + PLANNED/IN_PROGRESS/COMPLETED 분포.
 * 결함 #6: status enum 정정 (DRAFT|SUBMITTED|POSTED → PLANNED|IN_PROGRESS|COMPLETED|CANCELLED)
 * warehouseCode 필드 추가, items[] → lines[] (AuditLine shape)
 */
const MOCK_INVENTORY_AUDITS = [
  {
    id: 'ia-001',
    auditNo: 'IA-2026/05-001',
    auditDate: '2026-05-08',
    warehouseId: '11111111-1111-1111-1111-000000000001',
    warehouseCode: 'HQ-001',
    warehouseName: '본사창고',
    status: 'PLANNED' as const,
    auditorName: '홍지수',
    note: '5월 정기 실사 (1차)',
    lines: [
      { productId: 'p-aj040', modelName: 'AJ040RXH4BC1', productName: '시스템에어컨 4Way 4HP', expectedQty: 12, actualQty: 12, adjustQty: 0 },
      { productId: 'p-aj052', modelName: 'AJ052RXH5BC1', productName: '시스템에어컨 4Way 5HP', expectedQty: 5, actualQty: 4, adjustQty: -1 },
      { productId: 'p-mwr10', modelName: 'MWR-WE10N', productName: '유선 리모컨', expectedQty: 45, actualQty: 47, adjustQty: 2 },
    ],
  },
  {
    id: 'ia-002',
    auditNo: 'IA-2026/05-002',
    auditDate: '2026-05-09',
    warehouseId: '11111111-1111-1111-1111-000000000002',
    warehouseCode: 'VH-001',
    warehouseName: '1호차 차량재고',
    status: 'IN_PROGRESS' as const,
    auditorName: '김기철',
    note: '차량 재고 실사 — 진행 중',
    lines: [
      { productId: 'p-aj040', modelName: 'AJ040RXH4BC1', productName: '시스템에어컨 4Way 4HP', expectedQty: 3, actualQty: 3, adjustQty: 0 },
      { productId: 'p-mwr10', modelName: 'MWR-WE10N', productName: '유선 리모컨', expectedQty: 10, actualQty: 9, adjustQty: -1 },
    ],
  },
  {
    id: 'ia-003',
    auditNo: 'IA-2026/04-099',
    auditDate: '2026-04-30',
    warehouseId: '11111111-1111-1111-1111-000000000001',
    warehouseCode: 'HQ-001',
    warehouseName: '본사창고',
    status: 'COMPLETED' as const,
    auditorName: '홍지수',
    note: '4월 마감 실사 — 완료',
    lines: [
      { productId: 'p-aj036', modelName: 'AJ036NCH3CH', productName: '천장형 1Way 3HP', expectedQty: 8, actualQty: 8, adjustQty: 0 },
    ],
  },
]

/**
 * arologis 배차 (`/arologis/dispatches`) — 3건.
 */
const MOCK_DISPATCHES = [
  {
    id: 'disp-001',
    dispatchNo: 'D-2026/05/10-001',
    dispatchDate: '2026-05-10',
    vehicleNo: '12가3456',
    vehicleType: '1톤',
    driverName: '홍지수',
    driverPhone: '010-1234-5678',
    sourceWarehouse: '본사창고',
    destination: '서울권 + 경기남부',
    status: 'DISPATCHED' as const,
    slipCount: 5,
    slips: ['slip-001', 'slip-002', 'slip-006'],
    departureAt: '2026-05-10T08:30:00+09:00',
  },
  {
    id: 'disp-002',
    dispatchNo: 'D-2026/05/10-002',
    dispatchDate: '2026-05-10',
    vehicleNo: '23나7890',
    vehicleType: '2.5톤',
    driverName: '김기철',
    driverPhone: '010-9876-5432',
    sourceWarehouse: '본사창고',
    destination: '인천권',
    status: 'IN_TRANSIT' as const,
    slipCount: 3,
    slips: ['slip-003', 'slip-007'],
    departureAt: '2026-05-10T09:15:00+09:00',
  },
  {
    id: 'disp-003',
    dispatchNo: 'D-2026/05/09-005',
    dispatchDate: '2026-05-09',
    vehicleNo: '34다1234',
    vehicleType: '1톤',
    driverName: '박서연',
    driverPhone: '010-7777-8888',
    sourceWarehouse: '본사창고',
    destination: '부산권',
    status: 'COMPLETED' as const,
    slipCount: 4,
    slips: ['slip-004'],
    departureAt: '2026-05-09T07:00:00+09:00',
  },
]

/**
 * 견적 (`/sales/estimates`) — 3건 + DRAFT/SENT/ACCEPTED 분포.
 */
const MOCK_ESTIMATES = [
  {
    id: 'est-001',
    estimateNumber: '2026/05/04-1',
    estimateDate: '2026-05-04',
    expirationDate: '2026-05-31',
    status: 'DRAFT' as const,
    partnerCode: '1234567890',
    partnerName: '엘에이시스템에어',
    totalAmount: '3700000',
    createdByName: '오병승',
    note: '시스템에어컨 4Way 4HP 2EA 견적',
    lines: SAMPLE_LINES,
  },
  {
    id: 'est-002',
    estimateNumber: '2026/05/06-2',
    estimateDate: '2026-05-06',
    expirationDate: '2026-06-06',
    status: 'SENT' as const,
    partnerCode: '2345678901',
    partnerName: '강남에어솔루션',
    totalAmount: '8000000',
    createdByName: '오병승',
    note: '신축건물 시스템에어컨 견적 — 5/6 발송',
    lines: SAMPLE_LINES,
  },
  {
    id: 'est-003',
    estimateNumber: '2026/04/28-99',
    estimateDate: '2026-04-28',
    expirationDate: '2026-05-28',
    status: 'ACCEPTED' as const,
    partnerCode: '5678901234',
    partnerName: '대박종합건설',
    totalAmount: '23500000',
    createdByName: '박서연',
    note: '대박빌딩 신축 — 채택 → 출고 진행',
    lines: SAMPLE_LINES,
  },
]

/**
 * 견적서 상세 (`/api/v1/slips/estimates/{id}`) 응답 — BE {@code EstimateDetailResponse} shape.
 *
 * <p>Phase 2.2 버전이력/복원 spec 용. {@code EstimateDetail} (api/estimateApi.ts) 와 1:1:
 * estimateNo / status(QUOTE_*) / totalSupply,Vat,Amount / lines(lineNo, supplyAmount, vatAmount).
 *
 * <p>id 별 status 분기 — est-003(또는 -accepted) 은 QUOTE_ACCEPTED(복원 불가) 로 응답하여
 * 편집 불가 가드(복원 버튼 비활성) 케이스를 결정적으로 노출한다. 그 외는 QUOTE_DRAFT.
 */
const MOCK_ESTIMATE_DETAIL_LINES = [
  {
    id: 'eline-001',
    lineNo: 0,
    productId: 'p-aj040',
    productName: '시스템에어컨 4Way 4HP',
    modelName: 'AJ040RXH4BC1',
    specification: '4HP',
    quantity: 2,
    unitPrice: '1850000',
    supplyAmount: '3700000',
    vatAmount: '370000',
    lineTotal: '4070000',
    note: null,
  },
  {
    id: 'eline-002',
    lineNo: 1,
    productId: 'p-mwr10',
    productName: '유선 리모컨 (WE10N)',
    modelName: 'MWR-WE10N',
    specification: '220V',
    quantity: 2,
    unitPrice: '85000',
    supplyAmount: '170000',
    vatAmount: '17000',
    lineTotal: '187000',
    note: null,
  },
]

/**
 * id → EstimateDetail mock 빌더. 견적 상세 / 버전이력 / 복원 응답이 공유한다.
 *
 * @param id 견적 UUID (path 전용 — 화면 노출 X). 'accepted' 포함 또는 est-003 이면 복원 불가 상태.
 */
function buildMockEstimateDetail(id: string) {
  // 편집 불가(복원 버튼 비활성) 케이스: id 에 'accepted' 가 들어가거나 est-003.
  const isAccepted = id.includes('accepted') || id === 'est-003'
  const status: EstimateStatusMock = isAccepted ? 'QUOTE_ACCEPTED' : 'QUOTE_DRAFT'
  return {
    id,
    estimateNo: isAccepted ? '2026/04/28-99' : '2026/05/04-1',
    estimateDate: isAccepted ? '2026-04-28' : '2026-05-04',
    seqNo: 1,
    status,
    partnerId: 'pt-mock-001',
    partnerName: isAccepted ? '대박종합건설' : '엘에이시스템에어',
    partnerBusinessNo: isAccepted ? '5678901234' : '1234567890',
    partnerAddress: '서울시 강남구 테헤란로 1',
    validUntil: '2026-05-31',
    totalSupply: '3870000',
    totalVat: '387000',
    totalAmount: '4257000',
    convertedSlipId: null,
    sentAt: null,
    acceptedAt: isAccepted ? '2026-04-29T10:00:00' : null,
    convertedAt: null,
    rejectedAt: null,
    requesterId: null,
    version: 2,
    memo: isAccepted ? '대박빌딩 신축 — 채택' : '시스템에어컨 4Way 4HP 2EA 견적',
    lines: MOCK_ESTIMATE_DETAIL_LINES,
  }
}

/** EstimateDetail status — api/estimateApi.ts EstimateStatus 미러 (mock 전용 타입 별칭). */
type EstimateStatusMock =
  | 'QUOTE_DRAFT'
  | 'QUOTE_SENT'
  | 'QUOTE_ACCEPTED'
  | 'QUOTE_REJECTED'
  | 'QUOTE_CONVERTED'

/**
 * 전표 수정/삭제 요청 (`/admin/slip-edit-requests`) — 2건 PENDING.
 *
 * <p>shape 은 {@code SlipEditRequest} interface (api/slipEditRequest.ts) 와 1:1.
 * BE `SlipEditRequestResponse` 직렬화와 동등하므로 PENDING 의 경우 decided* 필드는 null.
 */
const MOCK_EDIT_REQUESTS = [
  {
    id: 'er-001',
    slipId: 'slip-001',
    slipNo: '2026/05/04-1',
    requesterId: 'user-001',
    requesterName: '오병승',
    type: 'EDIT' as const,
    reason: '거래처 요청으로 배송 시각을 9시 → 오전 10시로 변경 부탁드립니다.',
    requestedAt: '2026-05-10T09:30:00+09:00',
    status: 'PENDING' as const,
    decidedAt: null,
    decidedBy: null,
    decidedByName: null,
    decisionReason: null,
  },
  {
    id: 'er-002',
    slipId: 'slip-002',
    slipNo: '2026/05/04-2',
    requesterId: 'user-001',
    requesterName: '오병승',
    type: 'DELETE' as const,
    reason: '기사 차량 정비 발생 — 본 전표를 취소 후 신규 발행 예정입니다.',
    requestedAt: '2026-05-10T10:15:00+09:00',
    status: 'PENDING' as const,
    decidedAt: null,
    decidedBy: null,
    decidedByName: null,
    decisionReason: null,
  },
]

/**
 * 도메인별 audit-log (slip 외) — journal / tax-invoice / dispatch / user 각 3 revision.
 */
const MOCK_AUDIT_LOGS_BY_DOMAIN: Record<string, Array<{
  revisionNo: number
  field: string
  beforeValue: string | null
  afterValue: string | null
  actorId: string
  actorName: string
  changedAt: string
}>> = {
  journals: [
    { revisionNo: 2, field: 'description', beforeValue: '5월 광고비', afterValue: '5월 네이버 광고 (검토중)', actorId: 'user-002', actorName: '이정훈', changedAt: '2026-05-04T14:32:00+09:00' },
    { revisionNo: 1, field: 'totalDebit', beforeValue: '450000', afterValue: '500000', actorId: 'user-002', actorName: '이정훈', changedAt: '2026-05-04T14:15:00+09:00' },
  ],
  'tax-invoices': [
    { revisionNo: 3, field: 'description', beforeValue: '5월 1주', afterValue: '5월 1주차 시스템에어컨 출고', actorId: 'user-002', actorName: '이정훈', changedAt: '2026-05-04T16:42:00+09:00' },
    { revisionNo: 2, field: 'supplyAmount', beforeValue: '3500000', afterValue: '3700000', actorId: 'user-002', actorName: '이정훈', changedAt: '2026-05-04T16:30:00+09:00' },
    { revisionNo: 1, field: 'buyerName', beforeValue: '엘에이', afterValue: '엘에이시스템에어', actorId: 'user-002', actorName: '이정훈', changedAt: '2026-05-04T16:15:00+09:00' },
  ],
  dispatches: [
    { revisionNo: 2, field: 'driverPhone', beforeValue: '010-1234-5678', afterValue: '010-1234-5679', actorId: 'user-005', actorName: '홍지수', changedAt: '2026-05-10T08:35:00+09:00' },
    { revisionNo: 1, field: 'driverName', beforeValue: '박서연', afterValue: '홍지수', actorId: 'user-005', actorName: '홍지수', changedAt: '2026-05-10T08:30:00+09:00' },
  ],
  users: [
    { revisionNo: 3, field: 'phone', beforeValue: '010-7777-7777', afterValue: '010-7777-8888', actorId: 'user-001', actorName: '김미선', changedAt: '2026-04-21T10:23:00+09:00' },
    { revisionNo: 2, field: 'departmentName', beforeValue: '영업1팀', afterValue: '영업2팀', actorId: 'user-001', actorName: '김미선', changedAt: '2026-04-15T09:00:00+09:00' },
    { revisionNo: 1, field: 'role', beforeValue: 'SALES', afterValue: 'SALES', actorId: 'user-001', actorName: '김미선', changedAt: '2026-01-05T09:00:00+09:00' },
  ],
}

// ==========================================================================
// P0-1 Slice A: 재무 보고서 fixture (손익계산서 / 재무상태표)
// 한국 일반기업회계기준 표준 계정명 + KRW 정수 금액. balanced=true 케이스.
// ==========================================================================

/**
 * 손익계산서 fixture — 4월 기준 (202604 as period).
 * 매출 2건 / 매출원가 2건 / 판관비 4건 / 영업외 2건.
 *
 * accountCode 는 한국 일반기업회계기준 3자리 코드 (V1 chart_of_accounts seed 일치).
 * 401/404 매출, 501 매출원가, 801/819 판관비, 901 이자수익, 951 이자비용 — V1 시드 준수.
 */
const MOCK_INCOME_STATEMENT = {
  period: '202604',
  fromDate: '2026-04-01',
  toDate: '2026-04-30',
  revenue: [
    { accountCode: '401', accountName: '상품매출', category: '400', amount: '45000000', sortOrder: 4010 },
    { accountCode: '404', accountName: '제품매출', category: '400', amount: '5000000', sortOrder: 4040 },
  ],
  costOfSales: [
    { accountCode: '501', accountName: '상품매출원가', category: '500', amount: '33000000', sortOrder: 5010 },
  ],
  grossProfit: '17000000',
  sga: [
    { accountCode: '801', accountName: '급여', category: '800', amount: '5000000', sortOrder: 8010 },
    { accountCode: '819', accountName: '임차료', category: '800', amount: '2000000', sortOrder: 8190 },
    { accountCode: '833', accountName: '광고선전비', category: '800', amount: '800000', sortOrder: 8330 },
    { accountCode: '814', accountName: '통신비', category: '800', amount: '200000', sortOrder: 8140 },
  ],
  operatingProfit: '9000000',
  nonOperating: [
    { accountCode: '901', accountName: '이자수익', category: '900', amount: '500000', sortOrder: 9010 },
    { accountCode: '951', accountName: '이자비용', category: '900', amount: '-300000', sortOrder: 9510 },
  ],
  incomeBeforeTax: '9200000',
  incomeTax: '1840000',
  netIncome: '7360000',
  generatedAt: '2026-05-10T09:00:00+09:00',
}

/**
 * 재무상태표 fixture — 2026-04-30 기준.
 * 자산 4건 / 부채 3건 / 자본 2건. balanced=true.
 * totalAssets = 55,000,000 = totalLiabilitiesAndEquity.
 *
 * accountCode 는 한국 일반기업회계기준 3자리 코드 (V1 chart_of_accounts seed 일치).
 * 102 보통예금 / 110 외상매출금 / 130 상품 / 142 건물 / 201 외상매입금 / 260 장기차입금 / 301 자본금 / 341 이익잉여금.
 */
const MOCK_BALANCE_SHEET = {
  asOfDate: '2026-04-30',
  assets: [
    { accountCode: '102', accountName: '보통예금', category: '100', amount: '12000000', sortOrder: 1020 },
    { accountCode: '110', accountName: '외상매출금', category: '100', amount: '18000000', sortOrder: 1100 },
    { accountCode: '130', accountName: '상품', category: '100', amount: '10000000', sortOrder: 1300 },
    { accountCode: '142', accountName: '건물', category: '100', amount: '15000000', sortOrder: 1420 },
  ],
  totalAssets: '55000000',
  liabilities: [
    { accountCode: '201', accountName: '외상매입금', category: '200', amount: '8000000', sortOrder: 2010 },
    { accountCode: '260', accountName: '장기차입금', category: '200', amount: '10000000', sortOrder: 2600 },
    { accountCode: '210', accountName: '미지급금', category: '200', amount: '7000000', sortOrder: 2100 },
  ],
  totalLiabilities: '25000000',
  equity: [
    { accountCode: '301', accountName: '자본금', category: '300', amount: '20000000', sortOrder: 3010 },
    { accountCode: '341', accountName: '이익잉여금', category: '300', amount: '10000000', sortOrder: 3410 },
  ],
  totalEquity: '30000000',
  totalLiabilitiesAndEquity: '55000000',
  balanced: true,
  generatedAt: '2026-05-10T09:00:00+09:00',
}

// ==========================================================================
// P0-1 Slice B: 세금/거래처 보고서 fixture
// ==========================================================================

/**
 * 부가세 신고서 fixture — 2026년 4월.
 *
 * 매출 공급가액 20,000,000 / 매출VAT 2,000,000.
 * 매입 공급가액 15,000,000 / 매입VAT 1,500,000.
 * 납부세액 500,000. 세금계산서 매수: 매출 12매 / 매입 8매.
 *
 * accountCode/accountName 없음 — VAT 보고서는 계정 집계 단위가 아님.
 * envelope() raw object 반환 — PageResponse 봉투 X (Slice A 패턴).
 */
const MOCK_VAT_REPORT = {
  period: '2026-04',
  fromDate: '2026-04-01',
  toDate: '2026-04-30',
  salesSupplyAmount: '20000000',
  salesVatAmount: '2000000',
  salesTotalAmount: '22000000',
  salesInvoiceCount: 12,
  purchaseSupplyAmount: '15000000',
  purchaseVatAmount: '1500000',
  purchaseTotalAmount: '16500000',
  purchaseInvoiceCount: 8,
  vatPayable: '500000',
  filingDeadline: '2026-07-25',
  generatedAt: '2026-05-10T09:00:00+09:00',
}

/**
 * 법인세 신고서 fixture — 2026 사업연도.
 *
 * 과세표준 9,250,000. 2억 이하 9% 세율 → 산출세액 832,500.
 * 중간예납 0. 차감납부세액 832,500.
 * 신고 기한: 2027-03-31 (12월 결산 법인).
 *
 * envelope() raw object 반환.
 */
const MOCK_CORPORATE_TAX_REPORT = {
  fiscalYear: 2026,
  fromDate: '2026-01-01',
  toDate: '2026-12-31',
  incomeBeforeTax: '9250000',
  addedDeductions: '0',
  subtractedDeductions: '0',
  taxableIncome: '9250000',
  calculatedTax: '832500',
  taxAlreadyPaid: '0',
  taxPayable: '832500',
  filingDeadline: '2027-03-31',
  generatedAt: '2026-05-10T09:00:00+09:00',
}

/**
 * 거래처별 미수 fixture (RECEIVABLE) — 2026-05-31 기준.
 *
 * 계정과목: 110 외상매출금. 거래처 4건. 총잔액 5,000,000.
 *
 * UUID 비공개 가드:
 * - `partnerId` 는 BE 내부 참조용 UUID (화면 노출 금지).
 * - 사용자 노출: partnerCode / partnerName 만.
 *
 * accountCode 는 3자리 (PR #134 회고 — V1 chart_of_accounts seed 일치).
 */
const MOCK_PARTNER_AGING_RECEIVABLE = {
  type: 'RECEIVABLE' as const,
  accountCode: '110',
  accountName: '외상매출금',
  asOfDate: '2026-05-31',
  partnerCount: 4,
  totalAmount: '5000000',
  lines: [
    {
      partnerCode: 'P-001',
      partnerName: '삼성건설(주)',
      balance: '1200000',
      oldestUnpaidDate: '2026-03-15',
      agingDays: 77,
      partnerId: '00000000-0000-0000-0000-partner00001',
    },
    {
      partnerCode: 'P-002',
      partnerName: '현대종합개발',
      balance: '800000',
      oldestUnpaidDate: '2026-04-01',
      agingDays: 60,
      partnerId: '00000000-0000-0000-0000-partner00002',
    },
    {
      partnerCode: 'P-003',
      partnerName: '대우건설',
      balance: '1500000',
      oldestUnpaidDate: '2026-04-20',
      agingDays: 41,
      partnerId: '00000000-0000-0000-0000-partner00003',
    },
    {
      partnerCode: 'P-004',
      partnerName: '롯데건설',
      balance: '1500000',
      oldestUnpaidDate: '2026-05-15',
      agingDays: 16,
      partnerId: '00000000-0000-0000-0000-partner00004',
    },
  ],
  generatedAt: '2026-05-10T09:00:00+09:00',
}

/**
 * 거래처별 미지급 fixture (PAYABLE) — 2026-05-31 기준.
 *
 * 계정과목: 201 외상매입금. 거래처 3건. 총잔액 3,200,000.
 */
const MOCK_PARTNER_AGING_PAYABLE = {
  type: 'PAYABLE' as const,
  accountCode: '201',
  accountName: '외상매입금',
  asOfDate: '2026-05-31',
  partnerCount: 3,
  totalAmount: '3200000',
  lines: [
    {
      partnerCode: 'V-001',
      partnerName: '(주)에어텍',
      balance: '1800000',
      oldestUnpaidDate: '2026-03-01',
      agingDays: 91,
      partnerId: '00000000-0000-0000-0000-vendor000001',
    },
    {
      partnerCode: 'V-002',
      partnerName: '대한냉각기',
      balance: '900000',
      oldestUnpaidDate: '2026-04-10',
      agingDays: 51,
      partnerId: '00000000-0000-0000-0000-vendor000002',
    },
    {
      partnerCode: 'V-003',
      partnerName: '한국공조부품',
      balance: '500000',
      oldestUnpaidDate: '2026-05-01',
      agingDays: 30,
      partnerId: '00000000-0000-0000-0000-vendor000003',
    },
  ],
  generatedAt: '2026-05-10T09:00:00+09:00',
}

// ==========================================================================
// 세금계산서 일괄발행 (홈택스 양식) mock — GAS 이식 슬라이스
// ==========================================================================

/**
 * 제외 거래처 마스터 시드 5건.
 *
 * UUID 비공개 가드 — partnerCode / partnerName 만 사용자 노출.
 */
const MOCK_BATCH_EXCLUSIONS = [
  {
    partnerCode: 'P-EX-001',
    partnerName: '삼성건설(주)',
    reason: '자체 전자세금계산서 발행',
    createdAt: '2026-04-01T09:00:00+09:00',
    createdBy: '오병승',
  },
  {
    partnerCode: 'P-EX-002',
    partnerName: '현대종합개발',
    reason: '세무대리인 직접 발행',
    createdAt: '2026-04-05T10:30:00+09:00',
    createdBy: '오병승',
  },
  {
    partnerCode: 'P-EX-003',
    partnerName: '대우건설',
    reason: '분기별 별도 일괄 처리',
    createdAt: '2026-04-10T14:00:00+09:00',
    createdBy: '김미선',
  },
  {
    partnerCode: 'P-EX-004',
    partnerName: '롯데건설',
    reason: '매월 수기 발행',
    createdAt: '2026-04-15T11:00:00+09:00',
    createdBy: '오병승',
  },
  {
    partnerCode: 'P-EX-005',
    partnerName: '(주)에어텍',
    reason: '비과세 거래처',
    createdAt: '2026-05-01T09:30:00+09:00',
    createdBy: '김미선',
  },
]

/**
 * 일괄발행 이력 시드 10건.
 *
 * batchId 는 path 전용 — 화면 미노출. batchNo 만 사용자 노출.
 */
const MOCK_BATCH_HISTORIES = Array.from({ length: 10 }, (_, i) => {
  const idx = i + 1
  const month = String(5 - Math.floor(i / 2)).padStart(2, '0')
  const day = String(15 - (i % 2) * 7).padStart(2, '0')
  return {
    batchId: `00000000-0000-0000-0000-batch${String(idx).padStart(7, '0')}`,
    batchNo: `BATCH-2026${month}${day}-${String(idx).padStart(3, '0')}`,
    fromDate: `2026-${month}-01`,
    toDate: `2026-${month}-${day}`,
    processedAt: `2026-${month}-${day}T09:${String(i * 6).padStart(2, '0')}:00+09:00`,
    processedBy: i % 2 === 0 ? '오병승' : '김미선',
    totalRowCount: 200 + idx * 5,
    splitFileCount: Math.ceil((200 + idx * 5) / 100),
  }
})

/**
 * 가상 미리보기 rows 250건 생성 — splitFileCount=3.
 *
 * UUID 비공개 가드: partnerCode / slipNo 만 사용자 노출. batchId 는 내부 전용.
 */
function generateMockBatchRows(count: number) {
  const partners = [
    { code: 'P-001', name: '○○종합건설', bizNo: '123-45-67890' },
    { code: 'P-002', name: '△△인테리어', bizNo: '234-56-78901' },
    { code: 'P-003', name: '□□설비공사', bizNo: '345-67-89012' },
    { code: 'P-004', name: '◇◇냉난방', bizNo: '456-78-90123' },
    { code: 'P-005', name: '☆☆건축자재', bizNo: '567-89-01234' },
  ]
  const supplier = { name: '(주)삼한로지스', bizNo: '111-22-33333' }

  return Array.from({ length: count }, (_, i) => {
    const p = partners[i % partners.length]!
    const rowNo = i + 1
    const day = String((i % 28) + 1).padStart(2, '0')
    const supplyAmount = String(1000000 + i * 50000)
    const vatAmount = String(Math.round((1000000 + i * 50000) * 0.1))
    const totalAmount = String(
      1000000 + i * 50000 + Math.round((1000000 + i * 50000) * 0.1),
    )
    return {
      rowNo,
      slipNo: `2026/05/${day}-${rowNo}`,
      issueDate: `2026-05-${day}`,
      supplierName: supplier.name,
      supplierBusinessNo: supplier.bizNo,
      recipientName: p.name,
      recipientBusinessNo: p.bizNo,
      recipientEmail: `billing@partner${(i % 5) + 1}.co.kr`,
      supplyAmount,
      vatAmount,
      totalAmount,
      itemName: i % 3 === 0 ? '냉난방 설비 운반' : i % 3 === 1 ? '자재 운송' : '물류 서비스',
      specification: i % 2 === 0 ? '일식' : null,
      quantity: '1',
      unitPrice: supplyAmount,
      partnerCode: p.code,
      remark: i % 5 === 0 ? '현장 배송 완료' : null,
    }
  })
}

const MOCK_BATCH_ROWS = generateMockBatchRows(250)

// ---------------------------------------------------------------------------
// SP-D1: 동적 RBAC 권한 매트릭스 mock
// ---------------------------------------------------------------------------

/**
 * 역할별 기본 권한 매트릭스 시드 (SP-03 §4.2 기준).
 *
 * UUID 비공개 가드: roleCode / pageCode 비즈니스 식별자만 사용.
 */
const SP_D1_ROLES = [
  'MANAGER', 'DISPATCH', 'SALES', 'ACCOUNTANT', 'WAREHOUSE', 'INVENTORY',
  'DEVELOPER', 'PARTNER',
] as const

/**
 * SP-D1 cycle 2 fix: 페이지 코드를 BE PageCode enum dot-separated code 와 일치.
 * SP-D2: 회계 카테고리 7개 신규 PageCode 추가 (V8 seed 기반).
 * Issue 4 Slice 4: 회계 수정/삭제 요청 PageCode 추가 (V28 seed 기반).
 * SP-D4: 잔여 7 도메인 22개 신규 PageCode 추가 (V10 seed 기반).
 */
const SP_D1_PAGES = [
  // SP-D1 초기 12개
  'accounting.tax-invoice.emit-nts',
  'accounting.tax-invoice.list',
  'accounting.tax-invoice.batch-issue',
  'accounting.tax-invoice.inbound',
  'accounting.sales-slip.list',
  'accounting.purchase-slip.list',
  'accounting.deposit-match',
  'accounting.daily-closing',
  'accounting.general-ledger',
  'notification.dispatch-sms.send-audit',
  'purchases.receipt-ocr',
  'purchases.slip.list',
  'sales.slip.list',
  'inbound.inspection',
  'dispatch.board',
  'admin.permissions',
  // SP-D2 회계 7개 신규
  'accounting.accounts',
  'accounting.journals',
  'accounting.balances',
  'accounting.reports',
  'accounting.period-close',
  'accounting.statement-batch',
  'accounting.partner-ledger',
  // Issue 4 Slice 4
  'accounting.edit-requests',
  // SP-D4 잔여 7 도메인 22개 신규 (V10 seed 기반)
  'estimates.list',
  'sales.partner-order.list',
  'sales.partner-order.draft',
  'sales.partner-order.confirm',
  'sales.partner-order.history',
  'sales.partner-order.print',
  'sales.vendor-order',
  'inventory.warehouse',
  'inventory.stock',
  'inventory.stock-transfer',
  'inventory.dps',
  'inventory.audit',
  'inventory.list',
  'inventory.detail',
  'inventory.adjust',
  'inventory.transfer',
  'inventory.stock-balance',
  'inventory.safety-stock',
  'inventory.edit-requests',
  'inventory.edit-requests.decide',
  'ecount.import.inventory',
  'admin.employees',
  'admin.users',
  'partners.list',
  'partners.detail',
  'partners.block',
  'partners.edit-request',
  'products.list',
  'products.admin',
  'arologis.admin',
  'arologis.region',
  // MIG-14 admin UI 4 groups
  'ecount.mig14.cash-list',
  'ecount.mig14.order-list',
  'ecount.mig14.aging-snapshot',
  'ecount.mig14.ledger',
] as const

/**
 * 역할 × 페이지 기본 view 권한 (V7+V8+V10 seed 기반 — SP-D1/D2/D4 통합 매트릭스).
 *
 * SP-D4 §2 표 V 열 기준:
 *  estimates.list:             MASTER/MANAGER/ACCOUNTANT/SALES
 *  sales.partner-order.list:   MASTER/MANAGER/ACCOUNTANT/SALES
 *  sales.partner-order.draft:  MASTER/MANAGER/SALES
 *  sales.partner-order.confirm:MASTER/MANAGER/SALES
 *  sales.partner-order.history:MASTER/MANAGER/ACCOUNTANT/SALES
 *  sales.partner-order.print:  MASTER/MANAGER/SALES/WAREHOUSE
 *  sales.vendor-order:         MASTER/MANAGER/SALES/WAREHOUSE
 *  inventory.warehouse:        MASTER/MANAGER/WAREHOUSE/INVENTORY
 *  inventory.stock:            MASTER/MANAGER/ACCOUNTANT/SALES/WAREHOUSE/DISPATCH/INVENTORY
 *  inventory.stock-transfer:   MASTER/MANAGER/WAREHOUSE/INVENTORY
 *  inventory.dps:              MASTER/MANAGER/WAREHOUSE/INVENTORY
 *  inventory.audit:            MASTER/MANAGER/ACCOUNTANT/WAREHOUSE/INVENTORY
 *  admin.employees:            MASTER/MANAGER
 *  admin.users:                MASTER
 *  partners.list:              MASTER/MANAGER/ACCOUNTANT/SALES
 *  partners.detail:            MASTER/MANAGER/ACCOUNTANT/SALES
 *  partners.block:             MASTER/MANAGER
 *  partners.edit-request:      MASTER/MANAGER/SALES
 *  products.list:              MASTER/MANAGER/ACCOUNTANT/SALES/WAREHOUSE/INVENTORY
 *  products.admin:             MASTER/MANAGER/SALES/INVENTORY
 *  arologis.admin:             MASTER/MANAGER/DISPATCH
 *  arologis.region:            MASTER/MANAGER/DISPATCH
 */
const SP_D1_DEFAULT_VIEW: Record<string, readonly string[]> = {
  MANAGER: [
    // SP-D1
    'accounting.tax-invoice.list', 'accounting.tax-invoice.batch-issue',
    'accounting.tax-invoice.inbound', 'accounting.sales-slip.list',
    'accounting.purchase-slip.list', 'accounting.deposit-match', 'accounting.daily-closing',
    'accounting.general-ledger', 'notification.dispatch-sms.send-audit',
    'purchases.receipt-ocr', 'purchases.slip.list', 'sales.slip.list',
    'inbound.inspection', 'dispatch.board',
    // SP-D2 회계 7개 — MANAGER: view 허용
    'accounting.accounts', 'accounting.journals', 'accounting.balances',
    'accounting.reports', 'accounting.period-close', 'accounting.statement-batch',
    'accounting.partner-ledger',
    // SP-D4 22개 — MANAGER: 대부분 view 허용
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit',
    'inventory.list', 'inventory.detail', 'inventory.adjust', 'inventory.transfer',
    'inventory.stock-balance', 'inventory.safety-stock', 'inventory.edit-requests',
    'inventory.edit-requests.decide', 'ecount.import.inventory',
    'admin.employees',
    'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region',
    // MIG-14 admin UI
    'ecount.mig14.cash-list', 'ecount.mig14.order-list',
    'ecount.mig14.aging-snapshot', 'ecount.mig14.ledger',
    // Issue 4 Slice 4
    'accounting.edit-requests',
  ],
  DISPATCH: [
    'notification.dispatch-sms.send-audit', 'dispatch.board',
    // SP-D4 — DISPATCH: inventory.stock (view 전용) + arologis.*
    'inventory.stock', 'arologis.admin', 'arologis.region',
  ],
  // SP-D3 V9 fix: SALES dispatch.board 제거 (사용자 요구 ② — SALES 에게 배차 메뉴 숨김)
  SALES: [
    'accounting.tax-invoice.list', 'sales.slip.list',
    // SP-D4 — SALES: 견적/주문/거래처/상품 view
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.stock', 'inventory.list', 'inventory.transfer',
    'partners.list', 'partners.detail', 'partners.edit-request',
    'products.list', 'products.admin',
  ],
  ACCOUNTANT: [
    // SP-D1
    'accounting.tax-invoice.emit-nts', 'accounting.tax-invoice.list',
    'accounting.tax-invoice.batch-issue', 'accounting.tax-invoice.inbound',
    'accounting.sales-slip.list', 'accounting.purchase-slip.list',
    'accounting.deposit-match', 'accounting.daily-closing', 'accounting.general-ledger',
    'purchases.receipt-ocr', 'purchases.slip.list', 'sales.slip.list',
    // SP-D2 회계 7개 — ACCOUNTANT: view + edit 허용
    'accounting.accounts', 'accounting.journals', 'accounting.balances',
    'accounting.reports', 'accounting.period-close', 'accounting.statement-batch',
    'accounting.partner-ledger',
    // SP-D4 — ACCOUNTANT: 견적/주문 이력/재고/거래처/상품 view 만
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.history',
    'inventory.stock', 'inventory.list', 'inventory.detail', 'inventory.transfer',
    'inventory.edit-requests', 'inventory.edit-requests.decide',
    'partners.list', 'partners.detail',
    // MIG-14 admin UI — ACCOUNTANT: view 전용
    'ecount.mig14.cash-list', 'ecount.mig14.order-list',
    'ecount.mig14.aging-snapshot', 'ecount.mig14.ledger',
  ],
  // SP-D3 V9 fix: sales.slip.list 제거 + purchases.receipt-ocr 추가
  // (사용자 요구 ② — WAREHOUSE 에게 매출 슬립 숨김, 매입 영수증 OCR 허용)
  WAREHOUSE: [
    'purchases.slip.list', 'purchases.receipt-ocr', 'inbound.inspection',
    // SP-D4 — WAREHOUSE: 재고/창고/인쇄/벤더주문 view
    'sales.partner-order.print', 'sales.vendor-order',
    'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'inventory.list', 'inventory.detail',
    'inventory.transfer', 'inventory.stock-balance', 'inventory.safety-stock',
    'products.list',
  ],
  INVENTORY: [
    'purchases.slip.list', 'sales.slip.list', 'inbound.inspection',
    // SP-D4 — INVENTORY: 재고/창고 view
    'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'inventory.list', 'inventory.detail',
    'inventory.adjust', 'inventory.transfer', 'inventory.stock-balance',
    'inventory.safety-stock', 'inventory.edit-requests',
    'products.list', 'products.admin',
  ],
}

/**
 * 역할 × 페이지 기본 edit 권한 (V7+V8+V10 seed 기반 — SP-D1/D2/D4 통합 매트릭스).
 *
 * SP-D4 §2 표 E 열 기준:
 *  estimates.list:             MASTER/MANAGER/SALES
 *  sales.partner-order.list:   MASTER/MANAGER/SALES
 *  sales.partner-order.draft:  MASTER/MANAGER/SALES
 *  sales.partner-order.confirm:MASTER/MANAGER/SALES
 *  sales.partner-order.history:(없음 — view 전용)
 *  sales.partner-order.print:  MASTER/SALES
 *  sales.vendor-order:         MASTER/MANAGER/SALES/WAREHOUSE (BE EP 에 따라 WAREHOUSE 포함)
 *  inventory.warehouse:        MASTER/MANAGER/WAREHOUSE/INVENTORY
 *  inventory.stock:            MASTER/WAREHOUSE/INVENTORY (MANAGER view 전용)
 *  inventory.stock-transfer:   MASTER/MANAGER/WAREHOUSE/INVENTORY
 *  inventory.dps:              MASTER/WAREHOUSE/INVENTORY (MANAGER view 전용)
 *  inventory.audit:            (없음 — 전 역할 view 전용 per §2 표)
 *  admin.employees:            MASTER/MANAGER
 *  admin.users:                MASTER
 *  partners.list:              MASTER/MANAGER/SALES
 *  partners.detail:            MASTER/MANAGER/SALES
 *  partners.block:             MASTER/MANAGER
 *  partners.edit-request:      MASTER/MANAGER (SALES view 전용)
 *  products.list:              MASTER/MANAGER/SALES/INVENTORY
 *  products.admin:             MASTER/MANAGER/SALES/INVENTORY
 *  arologis.admin:             MASTER/MANAGER/DISPATCH
 *  arologis.region:            MASTER/MANAGER/DISPATCH
 */
const SP_D1_DEFAULT_EDIT: Record<string, readonly string[]> = {
  MANAGER: [
    'accounting.tax-invoice.batch-issue', 'accounting.tax-invoice.inbound',
    'accounting.sales-slip.list', 'accounting.purchase-slip.list',
    // SP-D1 — MANAGER: edit 미허용 (view 전용)
    // SP-D4 — MANAGER: 대부분 edit 허용
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock-transfer',
    'inventory.list', 'inventory.adjust', 'inventory.transfer', 'inventory.stock-balance',
    'inventory.safety-stock', 'inventory.edit-requests',
    'inventory.edit-requests.decide', 'ecount.import.inventory',
    'admin.employees',
    'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region',
    // MIG-14 admin UI
    'ecount.mig14.cash-list', 'ecount.mig14.order-list',
    'ecount.mig14.aging-snapshot', 'ecount.mig14.ledger',
    // Issue 4 Slice 4
    'accounting.edit-requests',
  ],
  DISPATCH: [
    'notification.dispatch-sms.send-audit', 'dispatch.board',
    // SP-D4 — DISPATCH: arologis.* edit
    'arologis.admin', 'arologis.region',
  ],
  SALES: [
    'sales.slip.list',
    // SP-D4 — SALES: 견적/주문/거래처/상품 edit
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.list',
    'partners.list', 'partners.detail',
    'products.admin',
  ],
  ACCOUNTANT: [
    // SP-D1
    'accounting.tax-invoice.emit-nts', 'accounting.tax-invoice.list',
    'accounting.tax-invoice.batch-issue', 'accounting.tax-invoice.inbound',
    'accounting.sales-slip.list', 'accounting.purchase-slip.list',
    'accounting.deposit-match', 'accounting.daily-closing',
    'purchases.receipt-ocr',
    // SP-D2 회계 7개 — ACCOUNTANT: edit 허용 (accounts/journals/period-close/statement-batch)
    'accounting.accounts', 'accounting.journals', 'accounting.period-close',
    'accounting.statement-batch',
    // SP-D4 — ACCOUNTANT: edit 없음 (모두 view 전용)
    'inventory.edit-requests', 'inventory.edit-requests.decide',
  ],
  // SP-D3 V9 fix: purchases.receipt-ocr edit 추가 (WAREHOUSE 매입 영수증 OCR 입력 가능)
  WAREHOUSE: [
    'inbound.inspection', 'purchases.receipt-ocr',
    // SP-D4 — WAREHOUSE: 재고/창고 edit
    'inventory.warehouse', 'inventory.stock',
    'inventory.stock-transfer', 'inventory.dps',
    'inventory.list', 'inventory.transfer', 'inventory.stock-balance',
    'inventory.safety-stock',
  ],
  INVENTORY: [
    'inbound.inspection',
    // SP-D4 — INVENTORY: 재고/창고 edit
    'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps',
    'inventory.list', 'inventory.adjust', 'inventory.transfer',
    'inventory.stock-balance', 'inventory.safety-stock', 'inventory.edit-requests',
    'products.admin',
  ],
}

/**
 * in-memory 매트릭스 — MASTER 포함 mock 페이지 × role 기본 셀.
 * POST /batch 로 변경 반영.
 */
let _mockPermissionCells: Array<{
  roleCode: string
  pageCode: string
  view: boolean
  edit: boolean
}> = [
  // MASTER — 항상 전 페이지 전권
  ...SP_D1_PAGES.map((page) => ({
    roleCode: 'MASTER', pageCode: page, view: true, edit: true,
  })),
  // 나머지 8 역할
  ...SP_D1_ROLES.flatMap((role) =>
    SP_D1_PAGES.map((page) => ({
      roleCode: role,
      pageCode: page,
      view: (SP_D1_DEFAULT_VIEW[role] ?? []).includes(page),
      edit: (SP_D1_DEFAULT_EDIT[role] ?? []).includes(page),
    })),
  ),
]
