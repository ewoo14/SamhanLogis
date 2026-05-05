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

/** 본 환경이 mock 모드인지 — Vite import.meta.env 기반 컴파일 타임 결정. */
export function isMockMode(): boolean {
  return import.meta.env['VITE_MOCK_MODE'] === '1'
}

/** Mock token snapshot — AuthGuard 자동 인증 우회 + 헤더 chip 표시용. */
export const MOCK_AUTH = {
  token: 'mock-jwt-token',
  userId: '00000000-0000-0000-0000-000000010001',
  role: 'MANAGER',
  fullName: '오병승',
}

/** 시드 4 창고 (V2 시드와 동일) */
const MOCK_WAREHOUSES = [
  {
    id: '11111111-1111-1111-1111-000000000001',
    code: 'HQ-001',
    name: '본사창고',
    type: 'HEADQUARTERS',
    address: '서울시 강남구 본사',
    displayOrder: 1,
    description: '본사 보유 메인 창고',
  },
  {
    id: '11111111-1111-1111-1111-000000000002',
    code: 'VH-001',
    name: '1호차 차량재고',
    type: 'VEHICLE',
    address: null,
    displayOrder: 2,
    description: '출장 차량 이동 재고 (창고원/기사 단위)',
  },
  {
    id: '11111111-1111-1111-1111-000000000003',
    code: 'CS-001',
    name: '거래처 위탁창고',
    type: 'CONSIGNMENT',
    address: null,
    displayOrder: 3,
    description: '거래처에 위탁한 재고 (소유권은 자사)',
  },
  {
    id: '11111111-1111-1111-1111-000000000004',
    code: 'VR-001',
    name: '가상창고',
    type: 'VIRTUAL',
    address: null,
    displayOrder: 4,
    description: '삼성 직배/반품/서비스 인보이스 등 비물리',
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
    transferNo: 'T-2026/05/04-1',
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
    transferNo: 'T-2026/05/03-2',
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
    transferNo: 'T-2026/05/04-3',
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
    transferNo: 'T-2026/05/04-4',
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
    transferNo: 'T-2026/05/02-7',
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
  MWR_WE10N: {
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
    })
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

  // GET /slips/{id} (단건 상세) — UUID-like 또는 'slip-001' 패턴
  const slipDetailMatch = url.match(/\/slips\/([^/?]+)$/)
  if (method === 'GET' && slipDetailMatch && !url.includes('lookup-product')) {
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

  // GET /slips (페이지) — lookup-product / {id} 가 아닌 경우
  if (
    method === 'GET'
    && url.includes('/slips')
    && !url.includes('/slips/lookup-product')
    && !slipDetailMatch
  ) {
    return envelope({
      content: MOCK_SLIPS,
      totalElements: MOCK_SLIPS.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  // POST /slips → 신규 전표 1건 (라인 포함)
  if (method === 'POST' && url.endsWith('/slips')) {
    return envelope({
      id: 'new-slip-' + Date.now(),
      slipNo: '2026/05/04-99',
      slipType: 'OUTBOUND',
      slipDate: '2026-05-04',
      seqNo: 99,
      status: 'DRAFT',
      partnerId: null,
      partnerName: '신규 거래처',
      sourceWarehouseId: HQ_ID,
      destinationWarehouseId: null,
      deliveryTag: 'DAY',
      memo: null,
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
  // notification-slice-B: 배송 묶음 (delivery-batch) mock
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

  // POST /delivery-batches/{id}/sms — SMS 발송
  const batchSmsMatch = url.match(/\/delivery-batches\/([^/]+)\/sms$/)
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
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      productIds?: string[]
    }
    const ids = body.productIds ?? []

    /**
     * 시연용 mock — 모든 product 에 대해 본사/차량/위탁/가상 4 창고 mock 수량.
     * 실제 BE 는 stock_balance 테이블에서 PIVOT 하여 응답.
     */
    const mockPerProduct: Record<string, Record<string, number | null>> = {
      'p-aj040': { 'HQ-001': 12, 'VH-001': 3, 'CS-001': 0, 'VR-001': null },
      'p-aj052': { 'HQ-001': 5, 'VH-001': 2, 'CS-001': 0, 'VR-001': null },
      'p-aj036': { 'HQ-001': 8, 'VH-001': 0, 'CS-001': 1, 'VR-001': null },
      'p-aj100': { 'HQ-001': 2, 'VH-001': 0, 'CS-001': 0, 'VR-001': null },
      'p-mwr10': { 'HQ-001': 45, 'VH-001': 10, 'CS-001': 2, 'VR-001': null },
    }

    const productNameById: Record<string, { modelName: string; productName: string }> = {
      'p-aj040': { modelName: 'AJ040RXH4BC1', productName: '시스템에어컨 4Way 4HP' },
      'p-aj052': { modelName: 'AJ052RXH5BC1', productName: '시스템에어컨 4Way 5HP' },
      'p-aj036': { modelName: 'AJ036NCH3CH', productName: '천장형 1Way 3HP' },
      'p-aj100': { modelName: 'AJ100NCDKH', productName: '실외기 10HP' },
      'p-mwr10': { modelName: 'MWR-WE10N', productName: '유선 리모컨 (WE10N)' },
    }

    const rows = ids.map((pid) => {
      const meta = productNameById[pid] ?? {
        modelName: '(샘플)' + pid,
        productName: '(샘플 품목)',
      }
      const per = mockPerProduct[pid] ?? {
        'HQ-001': 0,
        'VH-001': 0,
        'CS-001': 0,
        'VR-001': null,
      }
      const total = Object.entries(per).reduce(
        (sum, [code, qty]) =>
          sum + (qty ?? 0) * (code === 'VR-001' ? 0 : 1),
        0,
      )
      return {
        productId: pid,
        modelName: meta.modelName,
        productName: meta.productName,
        perWarehouse: per,
        total,
      }
    })

    return envelope({ rows })
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
      transferNo: 'T-2026/05/04-99',
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
  // [Phase 6 v2] sales 도메인 mock (M1a/M3/M4/M5 통합 시연 + QA 캡처용)
  // ==========================================================================

  // GET /api/v1/products?usageScope=&category=
  if (method === 'GET' && url.endsWith('/api/v1/products')) {
    const cat = (config.params?.['category'] ?? '') as string
    const items = MOCK_PRODUCTS_CATALOG.filter(
      (p) => !cat || p.estimateCategory === cat,
    )
    return {
      content: items,
      totalElements: items.length,
      totalPages: 1,
      number: 0,
      size: items.length,
      first: true,
      last: true,
      empty: items.length === 0,
    }
  }

  // GET /api/v1/products/{modelCode}/specs
  const productSpecsMatch = url.match(/\/api\/v1\/products\/([^/]+)\/specs$/)
  if (method === 'GET' && productSpecsMatch) {
    return [
      { id: 'spec-1', specKey: '냉방능력', specValue: '5.6', unit: 'kW', displayOrder: 1 },
      { id: 'spec-2', specKey: '소비전력', specValue: '1.4', unit: 'kW', displayOrder: 2 },
      { id: 'spec-3', specKey: '실외기 호환', specValue: 'AS-***', unit: null, displayOrder: 3 },
    ]
  }

  // GET /api/v1/spec-key-templates
  if (method === 'GET' && url.endsWith('/api/v1/spec-key-templates')) {
    return [
      {
        id: 'tpl-1',
        estimateCategory: 'HOME_MULTI',
        specKey: '냉방능력',
        defaultUnit: 'kW',
        displayOrder: 1,
        isRecommended: true,
      },
    ]
  }

  // GET /api/v1/estimates
  if (method === 'GET' && url.endsWith('/api/v1/estimates')) {
    return envelope({
      content: MOCK_ESTIMATES,
      totalElements: MOCK_ESTIMATES.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
      empty: false,
    })
  }

  // GET /api/v1/estimates/{number}
  const estimateDetailMatch = url.match(/\/api\/v1\/estimates\/([^/]+)$/)
  if (method === 'GET' && estimateDetailMatch) {
    const found = MOCK_ESTIMATES.find((e) => e.estimateNumber === decodeURIComponent(estimateDetailMatch[1]!))
      ?? MOCK_ESTIMATES[0]!
    return envelope({
      ...found,
      partnerCode: '4348703365',
      deliveryAddress: '서울시 강남구 테헤란로 123',
      siteAddress: '서울시 강남구 테헤란로 123 5층',
      contactPhone: '010-1234-5678',
      dueDate: '2026-05-12',
      paymentDueDate: '2026-05-31',
      memo: '오전 10시 도착 요청',
      lines: [
        {
          id: 'line-1',
          category: 'HOME_MULTI',
          modelCode: 'AJ040RXH4BC1',
          productName: '시스템에어컨 4Way 4HP',
          quantity: 2,
          releasePrice: 1800000,
          deliveryPrice: 1500000,
          subtotal: 3000000,
          hasVariableDiscount: false,
          bundleMode: null,
        },
      ],
      totalAmount: 3000000,
    })
  }

  // GET /api/v1/partner-orders
  if (method === 'GET' && url.endsWith('/api/v1/partner-orders')) {
    return envelope({
      content: MOCK_PARTNER_ORDERS,
      totalElements: MOCK_PARTNER_ORDERS.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
      empty: false,
    })
  }

  // GET /api/v1/partner-orders/{number}
  const partnerOrderDetailMatch = url.match(/\/api\/v1\/partner-orders\/([^/]+)$/)
  if (method === 'GET' && partnerOrderDetailMatch) {
    const found = MOCK_PARTNER_ORDERS.find(
      (o) => o.orderNumber === decodeURIComponent(partnerOrderDetailMatch[1]!),
    ) ?? MOCK_PARTNER_ORDERS[0]!
    return envelope({
      ...found,
      deliveryAddress: '서울시 강남구 테헤란로 123',
      siteAddress: '서울시 강남구 테헤란로 123 5층',
      contactPhone: '010-1234-5678',
      dueDate: '2026-05-15',
      memo: null,
      lines: [
        {
          id: 'pol-1',
          modelCode: 'AJ040RXH4BC1',
          productName: '시스템에어컨 4Way 4HP',
          quantity: 2,
          deliveryPrice: 1500000,
          subtotal: 3000000,
          bundleMode: null,
          expandedComponents: [],
        },
      ],
    })
  }

  // GET /api/v1/partners/long-pending (legacy v1 호환)
  if (method === 'GET' && url.includes('/api/v1/partners/long-pending')) {
    return envelope({
      content: MOCK_LONG_PENDING,
      totalElements: MOCK_LONG_PENDING.length,
      totalPages: 1,
      number: 0,
      size: 50,
      first: true,
      last: true,
      empty: false,
    })
  }

  // GET /api/v1/partners/search?keyword=
  if (method === 'GET' && url.endsWith('/api/v1/partners/search')) {
    const kw = ((config.params?.['keyword'] ?? '') as string).toLowerCase()
    const items = MOCK_PARTNERS.filter(
      (p) =>
        !kw
        || p.companyName.toLowerCase().includes(kw)
        || p.businessRegistrationNumber.includes(kw),
    ).slice(0, 10)
    return envelope(items)
  }

  // GET /api/v1/partner-approvals
  if (method === 'GET' && url.endsWith('/api/v1/partner-approvals')) {
    const status = (config.params?.['status'] ?? '') as string
    const items = MOCK_PARTNER_APPROVALS.filter((a) => !status || a.status === status)
    return envelope({
      content: items,
      totalElements: items.length,
      totalPages: 1,
      number: 0,
      size: 50,
      first: true,
      last: true,
      empty: items.length === 0,
    })
  }

  // PATCH /api/v1/partner-approvals/{code}/status
  const partnerApprovalStatusMatch = url.match(
    /\/api\/v1\/partner-approvals\/([^/]+)\/status$/,
  )
  if (method === 'PATCH' && partnerApprovalStatusMatch) {
    const code = decodeURIComponent(partnerApprovalStatusMatch[1]!)
    const body = (config.data ? JSON.parse(config.data as string) : {}) as {
      status?: string
    }
    const found = MOCK_PARTNER_APPROVALS.find((a) => a.partnerCode === code)
      ?? MOCK_PARTNER_APPROVALS[0]!
    return envelope({ ...found, status: body.status ?? 'APPROVED' })
  }

  // POST /api/v1/partner-approvals/{code}/reset-password
  const partnerApprovalResetMatch = url.match(
    /\/api\/v1\/partner-approvals\/([^/]+)\/reset-password$/,
  )
  if (method === 'POST' && partnerApprovalResetMatch) {
    const code = decodeURIComponent(partnerApprovalResetMatch[1]!)
    const found = MOCK_PARTNER_APPROVALS.find((a) => a.partnerCode === code)
      ?? MOCK_PARTNER_APPROVALS[0]!
    return envelope({ ...found, status: 'PASSWORD_RESET_PENDING' })
  }

  // GET /api/v1/partner-dc-configs
  if (method === 'GET' && url.endsWith('/api/v1/partner-dc-configs')) {
    const kw = ((config.params?.['keyword'] ?? '') as string).toLowerCase()
    const items = MOCK_PARTNER_DC_CONFIGS.filter(
      (c) =>
        !kw
        || c.companyName.toLowerCase().includes(kw)
        || c.partnerCode.includes(kw),
    )
    return envelope({
      content: items,
      totalElements: items.length,
      totalPages: 1,
      number: 0,
      size: items.length,
      first: true,
      last: true,
      empty: items.length === 0,
    })
  }

  // PATCH /api/v1/partner-dc-configs/{code}
  const partnerDcPatchMatch = url.match(/\/api\/v1\/partner-dc-configs\/([^/]+)$/)
  if (method === 'PATCH' && partnerDcPatchMatch) {
    const code = decodeURIComponent(partnerDcPatchMatch[1]!)
    const body = (config.data ? JSON.parse(config.data as string) : {}) as Record<
      string,
      unknown
    >
    const found = MOCK_PARTNER_DC_CONFIGS.find((c) => c.partnerCode === code)
      ?? MOCK_PARTNER_DC_CONFIGS[0]!
    return envelope({ ...found, ...body })
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
// [Phase 6 v2] sales 도메인 mock seed (M1a/M3/M4/M5 + 거래처 자동완성/승인/DC)
// ============================================================================

/** ProductCatalog 시연 시드 (홈멀티 4종 + 싱글 2종 + 상업 2종 + 구형 1종). */
const MOCK_PRODUCTS_CATALOG = [
  {
    modelCode: 'AJ040RXH4BC1',
    name: '시스템에어컨 4Way 4HP',
    usageScope: 'BOTH',
    estimateCategory: 'HOME_MULTI',
    releasePrice: 1800000,
    deliveryPrice: 1500000,
    hasVariableDiscount: false,
    legacyDiscountFlag: false,
    discountFlags: null,
  },
  {
    modelCode: 'AJ052RXH5BC1',
    name: '시스템에어컨 4Way 5HP',
    usageScope: 'BOTH',
    estimateCategory: 'HOME_MULTI',
    releasePrice: 2100000,
    deliveryPrice: 1700000,
    hasVariableDiscount: true,
    legacyDiscountFlag: false,
    discountFlags: 'HOMEMULTI',
  },
  {
    modelCode: 'AS-Q183C',
    name: '벽걸이 에어컨 1HP',
    usageScope: 'BOTH',
    estimateCategory: 'HOME_MULTI',
    releasePrice: 850000,
    deliveryPrice: 720000,
    hasVariableDiscount: false,
    legacyDiscountFlag: false,
    discountFlags: null,
  },
  {
    modelCode: 'MWR-WE10N',
    name: '유선 리모컨',
    usageScope: 'BOTH',
    estimateCategory: 'HOME_MULTI',
    releasePrice: 65000,
    deliveryPrice: 50000,
    hasVariableDiscount: false,
    legacyDiscountFlag: false,
    discountFlags: null,
  },
  {
    modelCode: 'AS-G180S',
    name: '싱글 세트 1형',
    usageScope: 'BOTH',
    estimateCategory: 'SINGLE_SET',
    releasePrice: 950000,
    deliveryPrice: 800000,
    hasVariableDiscount: false,
    legacyDiscountFlag: false,
    discountFlags: null,
  },
  {
    modelCode: 'AC-360-22HP',
    name: '상업멀티 22HP',
    usageScope: 'BOTH',
    estimateCategory: 'COMMERCIAL_MULTI',
    releasePrice: 7400000,
    deliveryPrice: 6300000,
    hasVariableDiscount: true,
    legacyDiscountFlag: false,
    discountFlags: 'COMMULTI',
  },
  {
    modelCode: 'OLD-1WAY-2HP',
    name: '구형 1way 2HP',
    usageScope: 'ESTIMATE',
    estimateCategory: 'LEGACY',
    releasePrice: 380000,
    deliveryPrice: 320000,
    hasVariableDiscount: false,
    legacyDiscountFlag: true,
    discountFlags: 'LEGACY',
  },
]

/** EstimateSummary 시연 시드 — 'YYYY/MM/DD - {seq}' 양식 (v2 §정정 8). */
const MOCK_ESTIMATES = [
  {
    estimateNumber: '2026/05/05 - 0001',
    createdAt: '2026-05-05T09:30:00+09:00',
    partnerName: '주식회사 엠엠시스템에어',
    category: 'HOME_MULTI',
    totalAmount: 8400000,
    status: 'CONFIRMED',
    authorName: '오병승',
  },
  {
    estimateNumber: '2026/05/04 - 0014',
    createdAt: '2026-05-04T15:12:00+09:00',
    partnerName: '제일냉온상사',
    category: 'COMMERCIAL_MULTI',
    totalAmount: 12600000,
    status: 'SENT',
    authorName: '오병승',
  },
  {
    estimateNumber: '2026/05/02 - 0007',
    createdAt: '2026-05-02T10:42:00+09:00',
    partnerName: '랜드유통(최경호)',
    category: 'HOME_MULTI',
    totalAmount: 5400000,
    status: 'DRAFT',
    authorName: '김미선',
  },
]

/** PartnerOrderSummary 시연 시드. */
const MOCK_PARTNER_ORDERS = [
  {
    orderNumber: '2026/05/05 - 0023',
    partnerCode: '4348703365',
    partnerName: '주식회사 엠엠시스템에어',
    submittedAt: '2026-05-05T08:11:00+09:00',
    status: 'CONFIRMED',
    totalAmount: 8400000,
    linkedSlipNo: '2026/05/05 - 0009',
  },
  {
    orderNumber: '2026/05/04 - 0019',
    partnerCode: '4091808577',
    partnerName: '제일냉온상사',
    submittedAt: '2026-05-04T17:08:00+09:00',
    status: 'SUBMITTED',
    totalAmount: 12600000,
    linkedSlipNo: null,
  },
  {
    orderNumber: '2026/05/03 - 0011',
    partnerCode: '1060818309',
    partnerName: '랜드유통(최경호)',
    submittedAt: '2026-05-03T13:25:00+09:00',
    status: 'CONVERTED',
    totalAmount: 5400000,
    linkedSlipNo: '2026/05/03 - 0017',
  },
]

/** LongPendingPartner 시연 시드 (legacy v1 호환). */
const MOCK_LONG_PENDING = [
  {
    businessRegistrationNumber: '6364201303',
    companyName: '태오파트너스(Tae.O Partners)-박천진',
    assignedManagerName: '오병승',
    lastOrderAt: '2026-03-20T10:00:00+09:00',
    lastEstimateAt: '2026-04-05T11:00:00+09:00',
    lastActivityAt: '2026-04-05T11:00:00+09:00',
    daysSinceLastActivity: 30,
    authStatus: 'LONG_PENDING_NO_ORDER',
  },
]

/** PartnerSummary 시연 시드 — 거래처 자동완성 (v2 §정정 16). */
const MOCK_PARTNERS = [
  {
    businessRegistrationNumber: '4348703365',
    companyName: '주식회사 엠엠시스템에어(고영현)',
    representativeName: '고영현',
    contactPhone: '010-2345-6789',
    address: '서울시 강남구 테헤란로 123',
    groupName: 'A그룹',
    note: '오전 10시 도착 요청',
  },
  {
    businessRegistrationNumber: '4091808577',
    companyName: '제일냉온상사',
    representativeName: '박철수',
    contactPhone: '010-3456-7890',
    address: '경기도 성남시 분당구 판교로 235',
    groupName: 'B그룹',
    note: null,
  },
  {
    businessRegistrationNumber: '1060818309',
    companyName: '랜드유통(최경호)',
    representativeName: '최경호',
    contactPhone: '010-4567-8901',
    address: '인천시 남동구 구월동 100',
    groupName: 'A그룹',
    note: null,
  },
]

/** PartnerApproval 시연 시드 — 6 status 모두 1건 이상. */
const MOCK_PARTNER_APPROVALS = [
  {
    partnerCode: '2463900815',
    partnerName: '윈디시스 - 김종선',
    status: 'APPROVED',
    approvalRequestedAt: '2026-05-04T17:27:00+09:00',
    pcTutorialDone: false,
    mobileTutorialDone: false,
    assignedManagerName: '오병승',
  },
  {
    partnerCode: '7288702408',
    partnerName: '주식회사 일진솔루션-최영주',
    status: 'APPROVED',
    approvalRequestedAt: '2026-05-04T17:01:00+09:00',
    pcTutorialDone: false,
    mobileTutorialDone: false,
    assignedManagerName: '오병승',
  },
  {
    partnerCode: '3544600512',
    partnerName: '프로이엔지(Pro ENG)-권오석',
    status: 'UNAPPROVED',
    approvalRequestedAt: '2026-05-04T09:29:00+09:00',
    pcTutorialDone: true,
    mobileTutorialDone: false,
    assignedManagerName: '김미선',
  },
  {
    partnerCode: '1143900240',
    partnerName: '토마토공조(곽인송)',
    status: 'PASSWORD_RESET_PENDING',
    approvalRequestedAt: '2026-05-04T06:45:00+09:00',
    pcTutorialDone: false,
    mobileTutorialDone: false,
    assignedManagerName: '오병승',
  },
  {
    partnerCode: '1220435073',
    partnerName: '만도에어컨서부냉열기-박승수',
    status: 'PASSWORD_ERROR',
    approvalRequestedAt: '2026-04-30T17:06:00+09:00',
    pcTutorialDone: false,
    mobileTutorialDone: true,
    assignedManagerName: '김미선',
  },
  {
    partnerCode: '6364201303',
    partnerName: '태오파트너스(Tae.O Partners)-박천진',
    status: 'LONG_PENDING',
    approvalRequestedAt: '2026-04-30T09:51:00+09:00',
    pcTutorialDone: true,
    mobileTutorialDone: false,
    assignedManagerName: '오병승',
  },
  {
    partnerCode: '6708701231',
    partnerName: '구)주식회사 그레이프시스템(휴먼넷)',
    status: 'ACCESS_DENIED',
    approvalRequestedAt: '2026-04-28T16:27:00+09:00',
    pcTutorialDone: true,
    mobileTutorialDone: false,
    assignedManagerName: '오병승',
  },
]

/** PartnerDcConfig 시연 시드 — csv 222 row 중 sample 12 (v2 §정정 14). */
const MOCK_PARTNER_DC_CONFIGS = [
  {
    partnerCode: '4348703365',
    companyName: '주식회사 엠엠시스템에어(고영현)',
    homeMultiDc: '46%',
    commercialMultiDc: null,
    flexibleHoseTypeI: 'Yes',
    threeSixty: null,
    fourWay: null,
    oneWay: null,
    stand: null,
    deluxe: null,
    firstGrade: null,
    unitProcess: null,
    remark: null,
  },
  {
    partnerCode: '4563501301',
    companyName: '엠엠시스템에어 호남지사-김유나',
    homeMultiDc: '46%',
    commercialMultiDc: null,
    flexibleHoseTypeI: 'Yes',
    threeSixty: null,
    fourWay: null,
    oneWay: null,
    stand: null,
    deluxe: null,
    firstGrade: null,
    unitProcess: null,
    remark: null,
  },
  {
    partnerCode: '2568700899',
    companyName: '주식회사 제이앤피공조',
    homeMultiDc: null,
    commercialMultiDc: null,
    flexibleHoseTypeI: 'No',
    threeSixty: '₩70,000',
    fourWay: '₩70,000',
    oneWay: '₩50,000',
    stand: '₩70,000',
    deluxe: null,
    firstGrade: null,
    unitProcess: null,
    remark: null,
  },
  {
    partnerCode: '2188601069',
    companyName: '(주)삼성에스에이씨비투비(더블유케이)',
    homeMultiDc: '45%',
    commercialMultiDc: null,
    flexibleHoseTypeI: 'No',
    threeSixty: '₩20,000',
    fourWay: '₩20,000',
    oneWay: '₩20,000',
    stand: '₩20,000',
    deluxe: null,
    firstGrade: null,
    unitProcess: null,
    remark: null,
  },
  {
    partnerCode: '4091808577',
    companyName: '제일냉온상사',
    homeMultiDc: '46%',
    commercialMultiDc: '46%',
    flexibleHoseTypeI: 'No',
    threeSixty: '₩20,000',
    fourWay: '₩20,000',
    oneWay: '₩20,000',
    stand: '₩20,000',
    deluxe: null,
    firstGrade: null,
    unitProcess: null,
    remark: null,
  },
  {
    partnerCode: '1985500078',
    companyName: '현주시스템(전현주)',
    homeMultiDc: '45%',
    commercialMultiDc: '47%',
    flexibleHoseTypeI: 'No',
    threeSixty: '₩20,000',
    fourWay: '₩20,000',
    oneWay: '₩20,000',
    stand: '₩20,000',
    deluxe: null,
    firstGrade: null,
    unitProcess: null,
    remark: null,
  },
  {
    partnerCode: '1060818309',
    companyName: '랜드유통(최경호)',
    homeMultiDc: '45%',
    commercialMultiDc: '46%',
    flexibleHoseTypeI: 'No',
    threeSixty: '₩30,000',
    fourWay: '₩30,000',
    oneWay: '₩30,000',
    stand: '₩30,000',
    deluxe: null,
    firstGrade: '₩30,000',
    unitProcess: null,
    remark: null,
  },
  {
    partnerCode: '6528702417',
    companyName: '(주)사계절솔루션(염은희)',
    homeMultiDc: '47%',
    commercialMultiDc: null,
    flexibleHoseTypeI: 'No',
    threeSixty: '₩30,000',
    fourWay: '₩30,000',
    oneWay: '₩30,000',
    stand: '₩30,000',
    deluxe: '₩30,000',
    firstGrade: '₩30,000',
    unitProcess: null,
    remark: null,
  },
  {
    partnerCode: '1110854627',
    companyName: '준공조-김준성대표님(구,와이케이공조)',
    homeMultiDc: null,
    commercialMultiDc: '47%',
    flexibleHoseTypeI: 'No',
    threeSixty: '₩40,000',
    fourWay: '₩40,000',
    oneWay: '₩40,000',
    stand: '₩40,000',
    deluxe: '₩20,000',
    firstGrade: '₩40,000',
    unitProcess: null,
    remark: null,
  },
  {
    partnerCode: '2463900815',
    companyName: '윈디시스 - 김종선',
    homeMultiDc: '46%',
    commercialMultiDc: null,
    flexibleHoseTypeI: 'No',
    threeSixty: '₩25,000',
    fourWay: '₩25,000',
    oneWay: '₩25,000',
    stand: null,
    deluxe: null,
    firstGrade: null,
    unitProcess: null,
    remark: 'VIP 거래처',
  },
  {
    partnerCode: '7288702408',
    companyName: '주식회사 일진솔루션-최영주',
    homeMultiDc: '47%',
    commercialMultiDc: '47%',
    flexibleHoseTypeI: 'Yes',
    threeSixty: null,
    fourWay: '₩30,000',
    oneWay: '₩30,000',
    stand: '₩30,000',
    deluxe: null,
    firstGrade: null,
    unitProcess: null,
    remark: null,
  },
  {
    partnerCode: '3544600512',
    companyName: '프로이엔지(Pro ENG)-권오석',
    homeMultiDc: '45%',
    commercialMultiDc: '45%',
    flexibleHoseTypeI: 'No',
    threeSixty: '₩30,000',
    fourWay: '₩30,000',
    oneWay: '₩30,000',
    stand: '₩30,000',
    deluxe: '₩30,000',
    firstGrade: '₩30,000',
    unitProcess: '단위처리',
    remark: '신규 (5/4)',
  },
]
