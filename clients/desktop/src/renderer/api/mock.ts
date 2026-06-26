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
import {
  DISPATCH_TONNAGE_LABEL,
  DISPATCH_VEHICLE_BODY_TYPE_LABEL,
  DISPATCH_VEHICLE_TYPE_LABEL,
  TONNAGE_OPTIONS,
  getAllowedDispatchTonnages,
} from './dispatchTask'
import type {
  AddVehicleGroupPayload,
  DispatchTonnage,
  DispatchTaskResponse,
  DispatchTaskSummaryResponse,
  DispatchVehicleBodyType,
  DispatchVehicleGroupResponse,
  DispatchVehicleGroupSlipResponse,
  DispatchVehicleType,
  MatchedDriverSource,
  SetMatchedDriverPayload,
} from './dispatchTask'
import type { DispatchCollabEdit, DispatchComment } from './dispatchCollab'
import type {
  ApprovalLineAdminResponse,
  ApprovalStatus,
} from './groupwareApproval'
import type { ApproverOption } from './groupwareApprovalApprover'
import type { ApprovalAttachment } from './groupwareApprovalAttachment'
import type { ApprovalTemplate } from './groupwareApprovalTemplate'
import type {
  GroupwareApprovalCollabComment,
  GroupwareApprovalCollabEdit,
} from './groupwareApprovalCollab'

declare global {
  interface Window {
    __SAMHAN_MOCK_LAST_ADD_VEHICLE_GROUP_BODY__?: AddVehicleGroupPayload
    __SAMHAN_MOCK_LAST_DISPATCH_BODY__?: { groupIds?: string[] }
  }
}

function toManualMatchedDriverSource(value: string): MatchedDriverSource | null {
  switch (value) {
    case 'GYEONGGI_QUICK':
      return 'GYEONGGI_QUICK'
    case 'JEONGUK_HWAMUL':
      return 'JEONGUK_HWAMUL'
    case 'OTHER':
      return 'OTHER'
    default:
      return null
  }
}

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

type MockAppClientType = 'DESKTOP' | 'WEB' | 'MOBILE'
type MockAppForceLevel = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL'

type MockAppRelease = {
  id: string
  clientType: MockAppClientType
  version: string
  minSupportedVersion: string
  forceLevel: Exclude<MockAppForceLevel, 'NONE'>
  releaseNotes: string
  releasedAt: string
}

function mockAppReleaseId(seq: number): string {
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`
}

let mockAppReleaseSeq = 4
let MOCK_APP_RELEASES: MockAppRelease[] = [
  {
    id: mockAppReleaseId(1),
    clientType: 'DESKTOP',
    version: '0.1.0',
    minSupportedVersion: '0.1.0',
    forceLevel: 'MINOR',
    releaseNotes: '데스크톱 배차 화면 안정화와 버전관리 안내를 추가했습니다.',
    releasedAt: '2026-06-27T09:00:00+09:00',
  },
  {
    id: mockAppReleaseId(2),
    clientType: 'WEB',
    version: '0.1.0',
    minSupportedVersion: '0.1.0',
    forceLevel: 'MINOR',
    releaseNotes: '웹 백오피스 PWA와 별개인 앱 버전 정책을 적용했습니다.',
    releasedAt: '2026-06-27T09:00:00+09:00',
  },
  {
    id: mockAppReleaseId(3),
    clientType: 'MOBILE',
    version: '0.1.0',
    minSupportedVersion: '0.1.0',
    forceLevel: 'MINOR',
    releaseNotes: '모바일 V1c 준비용 시드입니다.',
    releasedAt: '2026-06-27T09:00:00+09:00',
  },
]

function normalizeMockClientType(value: unknown): MockAppClientType {
  if (value === 'DESKTOP' || value === 'WEB' || value === 'MOBILE') return value
  return 'WEB'
}

function normalizeMockForceLevel(value: unknown): Exclude<MockAppForceLevel, 'NONE'> {
  if (value === 'CRITICAL' || value === 'MAJOR' || value === 'MINOR') return value
  return 'MINOR'
}

function compareSemverDesc(a: string, b: string): number {
  const left = a.split('.').map((part) => Number(part) || 0)
  const right = b.split('.').map((part) => Number(part) || 0)
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (right[i] ?? 0) - (left[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function isSemverLessThan(a: string, b: string): boolean {
  return compareSemverDesc(a, b) > 0
}

function mockAppReleaseFromBody(body: Record<string, unknown>, id: string): MockAppRelease {
  return {
    id,
    clientType: normalizeMockClientType(body['clientType']),
    version: String(body['version'] ?? '').trim() || '0.1.0',
    minSupportedVersion: String(body['minSupportedVersion'] ?? '').trim() || '0.1.0',
    forceLevel: normalizeMockForceLevel(body['forceLevel']),
    releaseNotes: String(body['releaseNotes'] ?? '').trim() || '릴리스 노트가 등록되지 않았습니다.',
    releasedAt: String(body['releasedAt'] ?? '').trim() || new Date().toISOString(),
  }
}

function sortedMockAppReleases(): MockAppRelease[] {
  return [...MOCK_APP_RELEASES].sort((a, b) => {
    const clientCompare = a.clientType.localeCompare(b.clientType)
    if (clientCompare !== 0) return clientCompare
    return compareSemverDesc(a.version, b.version)
  })
}

function readMockFormValue(data: unknown, key: string): string {
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    const value = data.get(key)
    return value == null ? '' : String(value)
  }
  if (data && typeof data === 'object') {
    const value = (data as Record<string, unknown>)[key]
    return value == null ? '' : String(value)
  }
  return ''
}

const DEFAULT_ESTIMATE_CONFIG_MOCK = {
  commonHomeDiscountRate: 0.45,
  commonCommercialDiscountRate: 0.45,
  oldProductDiscountRate: 0.5,
  vatRate: 0.1,
  cardFeeRate: 0.03,
  advanceDiscountRate: 0,
  comboWarnRate: 0,
  homeNoHose: false,
  homeNoBranch: false,
  homeWithFoot: false,
  homeDefaultPanel: '',
  singleDefaultWiredRemote: '',
  singleNoRemote: false,
  singleWithBase: false,
  singleDefaultPanel: '',
  singlePanelShape: '원형',
  singleDiscount: 0,
  singleOneWayDiscount: 0,
  singleMaterialInclusion: '별도',
  footerNotice:
    '※ 분기관은 임의 산정입니다.\n'
    + '※ 견적 내용 확정 시 재고확인 요청 부탁드립니다.\n'
    + '※ 본 견적은 견적일로부터 30일 이내에만 유효합니다.\n'
    + '※ 공공기관 발주 현장의 경우 본 견적은 무효이며, 별도의 검토가 필요합니다.',
}

let estimateConfigMock = { ...DEFAULT_ESTIMATE_CONFIG_MOCK }

type MockPermissionAction = 'view' | 'create' | 'update' | 'delete' | 'restore'

function mockCanAccess(pageCode: string, action: MockPermissionAction): boolean {
  const mockPerms = _resolveMockPerms()
  if (mockPerms) {
    const override = mockPerms.find((p) => p.pageCode === pageCode)
    if (!override) return false
    // BE 는 7-action 을 정밀 판정하지만 mock 은 권한 매트릭스 UI 와 같은 view/edit 이진 근사로 보수 적용한다.
    return action === 'view' ? override.view : override.edit
  }
  if (MOCK_AUTH.role === 'MASTER') return true
  const cell = _mockPermissionCells.find((p) => p.roleCode === MOCK_AUTH.role && p.pageCode === pageCode)
  if (!cell) return false
  // create/update/delete 는 mockActionMatrixFromRole 의 edit 셀과 동일하게 처리한다.
  return action === 'view' ? cell.view : cell.edit
}

function mockRequirePermission(pageCode: string, action: MockPermissionAction): ReturnType<typeof mockError> | null {
  if (mockCanAccess(pageCode, action)) return null
  return mockError(403, 'FORBIDDEN', '해당 기능에 대한 권한이 없습니다. 관리자에게 문의해 주세요.')
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

/**
 * V43 빌트인 그룹 UUID 카탈로그 — role 코드 → 고정 UUID + 한국어 그룹명.
 * UUID 는 내부 식별 전용이며 사용자 화면에 직접 노출하지 않는다
 * (feedback_uuid_no_user_visibility).
 */
const BUILTIN_GROUP_BY_ROLE: Record<string, { id: string; name: string }> = {
  MASTER:       { id: '00000000-0000-0000-0000-000000000100', name: '마스터' },
  MANAGER:      { id: '00000000-0000-0000-0000-000000000101', name: '매니저' },
  SALES:        { id: '00000000-0000-0000-0000-000000000102', name: '영업원' },
  WAREHOUSE:    { id: '00000000-0000-0000-0000-000000000103', name: '창고원' },
  ACCOUNTANT:   { id: '00000000-0000-0000-0000-000000000104', name: '회계원' },
  INVENTORY:    { id: '00000000-0000-0000-0000-000000000105', name: '재고원' },
  DISPATCH:     { id: '00000000-0000-0000-0000-000000000106', name: '배차담당자' },
  DRIVER:       { id: '00000000-0000-0000-0000-000000000107', name: '기사' },
  STAFF:        { id: '00000000-0000-0000-0000-000000000108', name: '사원' },
  DEVELOPER:    { id: '00000000-0000-0000-0000-000000000109', name: '개발자' },
}

/**
 * role 코드에 대응하는 빌트인 그룹 항목 배열을 반환한다.
 * 알 수 없는 role 은 빈 배열 반환. 기존 mockRole 쿼리 파라미터 호환 유지.
 */
function _resolveMockGroups(role: string): Array<{ id: string; name: string; builtin: boolean }> {
  const entry = BUILTIN_GROUP_BY_ROLE[role]
  if (!entry) return []
  // V43 seed 정합: is_builtin=TRUE 는 MASTER(…100) 단 하나 — 나머지 role 그룹은 FALSE.
  // (PR #414 dual review P1 — mock 이 실서버와 다른 builtin 플래그를 주면
  //  builtin 의존 로직이 mock 에서만 통과하는 위양성 발생)
  return [{ id: entry.id, name: entry.name, builtin: role === 'MASTER' }]
}

/**
 * 권한 시나리오 override — dev/test 전용. `?mockPerms=<base64(JSON)>` 로 revoke/grant 시나리오를
 * in-process mock 에 주입한다(Playwright `page.route` 가 mock 모드에서 무효인 한계 우회 — 3-A2-③).
 * JSON = Array<{ pageCode: string; view?: boolean; edit?: boolean }>. view 기본 true / edit 기본 false.
 * 미지정(null) 시 기존 mockRole 기반 권한 유지(회귀 0).
 */
function _resolveMockPerms(): Array<{ pageCode: string; view: boolean; edit: boolean }> | null {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') return null
  const raw = mockLocationParams().get('mockPerms')
  if (!raw) return null
  try {
    const decoded = typeof atob === 'function' ? atob(raw) : raw
    const parsed = JSON.parse(decoded) as Array<{ pageCode: string; view?: boolean; edit?: boolean }>
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter((p) => p && typeof p.pageCode === 'string')
      .map((p) => ({ pageCode: p.pageCode, view: p.view ?? true, edit: p.edit ?? false }))
  } catch {
    return null
  }
}

const _mockRole = _resolveMockRole()

export const MOCK_AUTH = {
  token: 'mock-jwt-token',
  userId: '00000000-0000-0000-0000-000000010001',
  role: _mockRole,
  fullName: '오병승',
  partnerCode: 'P-MOCK-001',
  groups: _resolveMockGroups(_mockRole),
}

/**
 * 3-D 배지 갱신 E2E 토대 — 병합/전환된 주문번호를 기억하여 이후 목록 조회 시
 * status 를 CONVERTED 로 덮어쓴다. (테스트별 새 page = 새 모듈 → 자동 초기화)
 */
const mockConvertedOrderNos = new Set<string>()

/**
 * 시리얼 보상 실패 복구 mock seed — D-SER-23 (resolved 혼합 3건).
 *
 * resolved 상태는 Map 으로 in-memory 보존 — PATCH resolve 후 GET 에 반영.
 * id 는 내부 key 전용 (화면 비표시). slipNo 만 사용자 노출.
 */
const MOCK_COMPENSATION_FAILURES = [
  {
    id: 'cf510001-0000-0000-0000-000000000001',
    slipNo: '2026/06/03-001',
    slipType: 'OUTBOUND',
    phase: 'SERIAL_DEDUCTION',
    productCode: 'PRD-A-001',
    attemptedOperation: 'RESTORE_SERIAL',
    failureReason: '시리얼 번호 DB 락 타임아웃 초과',
    originalFailureReason: '시리얼 번호 DB 락 타임아웃 초과',
    resolved: false,
    occurredAt: '2026-06-03T08:15:00+09:00',
    createdAt: '2026-06-03T08:15:01+09:00',
  },
  {
    id: 'cf510002-0000-0000-0000-000000000002',
    slipNo: '2026/06/02-017',
    slipType: 'INBOUND',
    phase: 'SERIAL_ASSIGNMENT',
    productCode: 'PRD-B-003',
    attemptedOperation: 'ROLLBACK_SERIAL',
    failureReason: '재고 서비스 일시 불가 (5회 재시도 실패)',
    originalFailureReason: 'Connection refused',
    resolved: false,
    occurredAt: '2026-06-02T14:32:00+09:00',
    createdAt: '2026-06-02T14:32:05+09:00',
  },
  {
    id: 'cf510003-0000-0000-0000-000000000003',
    slipNo: '2026/06/01-042',
    slipType: 'OUTBOUND',
    phase: 'SERIAL_DEDUCTION',
    productCode: 'PRD-C-007',
    attemptedOperation: 'RESTORE_SERIAL',
    failureReason: '시리얼 레코드 미존재 — 수동 정합 완료',
    originalFailureReason: 'Entity not found: SerialRecord',
    resolved: true,
    occurredAt: '2026-06-01T10:05:00+09:00',
    createdAt: '2026-06-01T10:05:02+09:00',
  },
]

/** PATCH resolve 상태 보존 — id → resolved 전이 추적 */
const mockCompensationResolvedIds = new Set<string>(
  MOCK_COMPENSATION_FAILURES.filter((f) => f.resolved).map((f) => f.id),
)

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
    acceptedBy: '00000000-0000-0000-0000-000000020003',
    acceptedAt: '2026-05-03T10:12:00+09:00',
    acceptedByFullName: '최입고',
    inspectorFullName: '김검수',
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

// §7 협업 수정완료: BE SlipDetailResponse 가 V16 audit overlay 10필드를 상세 응답에 포함한다.
// mock 시드가 누락한 필드는 기존 표시 필드에서 보수적으로 보강해 mock QA가 빈 현재값으로 통과하지 않게 한다.
for (const slip of MOCK_SLIPS as Array<Record<string, unknown>>) {
  const dispatcher = slip.dispatcher as { fullName?: string } | null | undefined
  const inspector = slip.inspector as { fullName?: string } | null | undefined
  if (slip.dispatcherFullName === undefined) slip.dispatcherFullName = dispatcher?.fullName ?? null
  if (slip.inspectorFullName === undefined) slip.inspectorFullName = inspector?.fullName ?? null
  if (slip.acceptedByFullName === undefined) slip.acceptedByFullName = null
  if (slip.inspectionAddress === undefined) slip.inspectionAddress = null
  if (slip.receiverPhone === undefined) slip.receiverPhone = slip.contactPhone ?? null
  if (slip.customerTel === undefined) slip.customerTel = slip.contactPhone ?? null
  if (slip.customerAddress === undefined) slip.customerAddress = slip.shippingAddress ?? null
  if (slip.customerRepresentative === undefined) slip.customerRepresentative = null
  if (slip.paymentDueLabel === undefined) slip.paymentDueLabel = null
  if (slip.discountInfo === undefined) slip.discountInfo = null
  if (slip.collectTerm === undefined) slip.collectTerm = null
  if (slip.agreeTerm === undefined) slip.agreeTerm = null
}

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

/**
 * 모델명 lookup 시연용 — mock product (대소문자 구분 없음).
 * PR-3b: `productType` 추가 — "BUNDLE" 이면 세트 옵션 picker 노출.
 * `modelCode` 미지정 시 modelName 을 그대로 사용 (BE ProductSummary 기본값).
 */
const MOCK_PRODUCTS_BY_MODEL: Record<
  string,
  {
    productId: string
    modelName: string
    productName: string
    sellingPrice: string
    purchasePrice?: string
    categoryId?: string
    description?: string | null
    goods?: boolean
    productType?: string
    modelCode?: string
    productCategory?: string | null
  }
> = {
  AJ040RXH4BC1: {
    productId: 'p-aj040',
    modelName: 'AJ040RXH4BC1',
    productName: '시스템에어컨 4Way 4HP',
    sellingPrice: '1850000',
    purchasePrice: '1500000',
    categoryId: 'cat-home',
    goods: true,
    productType: 'SINGLE',
  },
  'SET-HM2WAY': {
    productId: 'p-set-hm2way',
    modelName: 'SET-HM2WAY',
    productName: '가정용 멀티 2in1 세트 (실내2 + 실외1 + 판넬 + 자재)',
    sellingPrice: '5400000',
    purchasePrice: '4300000',
    categoryId: 'cat-home',
    goods: true,
    productType: 'BUNDLE',
    modelCode: 'SET-HM2WAY',
  },
  AJ052RXH5BC1: {
    productId: 'p-aj052',
    modelName: 'AJ052RXH5BC1',
    productName: '시스템에어컨 4Way 5HP',
    sellingPrice: '2120000',
    purchasePrice: '1750000',
    categoryId: 'cat-home',
    goods: true,
  },
  AJ036NCH3CH: {
    productId: 'p-aj036',
    modelName: 'AJ036NCH3CH',
    productName: '천장형 1Way 3HP',
    sellingPrice: '1450000',
    purchasePrice: '1180000',
    categoryId: 'cat-home',
    goods: true,
  },
  AJ100NCDKH: {
    productId: 'p-aj100',
    modelName: 'AJ100NCDKH',
    productName: '실외기 10HP',
    sellingPrice: '4200000',
    purchasePrice: '3500000',
    categoryId: 'cat-home',
    goods: true,
  },
  'MWR-WE10N': {
    productId: 'p-mwr10',
    modelName: 'MWR-WE10N',
    productName: '유선 리모컨 (WE10N)',
    sellingPrice: '85000',
    purchasePrice: '50000',
    categoryId: 'cat-home',
    goods: true,
  },
  'PNL-BASIC': {
    productId: 'p-pnl-basic',
    modelName: 'PNL-BASIC',
    productName: '표준 판넬',
    sellingPrice: '60000',
    purchasePrice: '30000',
    categoryId: 'cat-home',
    goods: true,
    productType: 'SINGLE',
  },
  'PNL-BLACK': {
    productId: 'p-pnl-black',
    modelName: 'PNL-BLACK',
    productName: '블랙 판넬',
    sellingPrice: '90000',
    purchasePrice: '50000',
    categoryId: 'cat-home',
    goods: true,
    productType: 'SINGLE',
  },
  'PNL-LIFT': {
    productId: 'p-pnl-lift',
    modelName: 'PNL-LIFT',
    productName: '승강 판넬',
    sellingPrice: '120000',
    purchasePrice: '70000',
    categoryId: 'cat-home',
    goods: true,
    productType: 'SINGLE',
  },
  'PNL-CLEAN': {
    productId: 'p-pnl-clean',
    modelName: 'PNL-CLEAN',
    productName: '공청 판넬',
    sellingPrice: '110000',
    purchasePrice: '65000',
    categoryId: 'cat-home',
    goods: true,
    productType: 'SINGLE',
  },
  'MWR-WE13N': {
    productId: 'p-mwr13',
    modelName: 'MWR-WE13N',
    productName: '컬러 유선 리모컨',
    sellingPrice: '120000',
    purchasePrice: '70000',
    categoryId: 'cat-home',
    goods: true,
    productType: 'SINGLE',
  },
  'MWR-SH11N': {
    productId: 'p-mwr-sh11',
    modelName: 'MWR-SH11N',
    productName: '서브 유선 리모컨',
    sellingPrice: '65000',
    purchasePrice: '35000',
    categoryId: 'cat-home',
    goods: true,
    productType: 'SINGLE',
  },
  'MAT-MOCK-REMOTE': {
    productId: 'p-mat-mock-remote',
    modelName: 'MAT-MOCK-REMOTE',
    modelCode: 'MAT-MOCK-REMOTE',
    productName: '유선리모컨',
    sellingPrice: '40000',
    purchasePrice: '0',
    categoryId: 'cat-home',
    goods: false,
    productType: 'SINGLE',
    productCategory: 'MATERIAL',
  },
}

// 자재 단가 lookup 참조모달 mock. 자재는 material_price(legacy D-key) 가 원천이며 데스크톱 참조용으로만
// 표시된다(가격 계산 미참여). 실제 자재(패널/리모컨/부품)는 이미 실모델코드 가진 카탈로그 품목이다.
const MOCK_MATERIAL_PRICE_ROWS = [
  { materialKey: 'D2', name: '유선리모컨', price: 40000, optionLabel: null },
  { materialKey: 'D3', name: '컬러유선리모컨', price: 75000, optionLabel: null },
  { materialKey: 'D4', name: '블랙판넬', price: 50000, optionLabel: null },
  { materialKey: 'D9', name: 'FPH-1412XS3', price: 130000, optionLabel: null },
]

const MOCK_ODU_RECOMMENDATION_ROWS = [
  { recommendationType: 'HOME_MULTI', indoorCapacity: null, indoorCount: 2, outdoorHp: '4HP' },
  { recommendationType: 'HOME_MULTI', indoorCapacity: null, indoorCount: 3, outdoorHp: '5HP' },
  { recommendationType: 'MULTI_HEATING_COOLING', indoorCapacity: 5.2, indoorCount: null, outdoorHp: '6HP' },
  { recommendationType: 'MULTI_HEATING_COOLING', indoorCapacity: 7.2, indoorCount: null, outdoorHp: '8HP' },
]

const MOCK_BRANCH_PIPE_ROWS = [
  { branchCode: '1509', description: null, summaryQty: null },
  { branchCode: '2512', description: null, summaryQty: null },
  { branchCode: '2812', description: null, summaryQty: null },
  { branchCode: '2815', description: null, summaryQty: null },
  { branchCode: '3419', description: null, summaryQty: null },
  { branchCode: '4119', description: null, summaryQty: null },
]

type MockProductCatalogRow = {
  modelCode: string
  name: string
  usageScope: string
  estimateCategories: Array<{ category: string; displayOrder: number | null }>
  estimateCategory: string | null
  productCategory: string | null
  catL: { id: string; name: string } | null
  catM: { id: string; name: string } | null
  catS: { id: string; name: string } | null
  usageScopeManual: boolean
  displayOrder: number | null
  releasePrice: number
  deliveryPrice: number
  fixedDiscountRate: number | null
  hasVariableDiscount: boolean
  variableDiscountManual: boolean
  legacyDiscountFlag: boolean
  discountFlags: null
  productType: string
  componentCount: number
}

type MockClassification = {
  id: string
  estimateCategory: string
  catLevel: 'L' | 'M' | 'S'
  parentId: string | null
  name: string
  displayOrder: number
  active: boolean
}

let MOCK_CLASSIFICATIONS: MockClassification[] = [
  { id: 'cls-home-l-indoor', estimateCategory: 'HOME_MULTI', catLevel: 'L', parentId: null, name: '실내기', displayOrder: 1, active: true },
  { id: 'cls-home-m-1way', estimateCategory: 'HOME_MULTI', catLevel: 'M', parentId: 'cls-home-l-indoor', name: '1-Way WIFI', displayOrder: 1, active: true },
  { id: 'cls-home-s-small', estimateCategory: 'HOME_MULTI', catLevel: 'S', parentId: 'cls-home-m-1way', name: '소형', displayOrder: 1, active: true },
  { id: 'cls-home-l-panel', estimateCategory: 'HOME_MULTI', catLevel: 'L', parentId: null, name: '판넬', displayOrder: 2, active: true },
  { id: 'cls-home-m-panel-air', estimateCategory: 'HOME_MULTI', catLevel: 'M', parentId: 'cls-home-l-panel', name: '공기청정 WIFI', displayOrder: 1, active: true },
  { id: 'cls-home-s-panel-round', estimateCategory: 'HOME_MULTI', catLevel: 'S', parentId: 'cls-home-m-panel-air', name: '360원형', displayOrder: 1, active: true },
  { id: 'cls-single-l-indoor', estimateCategory: 'SINGLE_SET', catLevel: 'L', parentId: null, name: '실내기', displayOrder: 1, active: true },
  { id: 'cls-single-m-stand', estimateCategory: 'SINGLE_SET', catLevel: 'M', parentId: 'cls-single-l-indoor', name: '스탠드형', displayOrder: 1, active: true },
  { id: 'cls-commercial-l-outdoor', estimateCategory: 'COMMERCIAL_MULTI', catLevel: 'L', parentId: null, name: '실외기', displayOrder: 1, active: true },
  { id: 'cls-commercial-m-prime', estimateCategory: 'COMMERCIAL_MULTI', catLevel: 'M', parentId: 'cls-commercial-l-outdoor', name: '프라임', displayOrder: 1, active: true },
  { id: 'cls-legacy-l-old', estimateCategory: 'LEGACY', catLevel: 'L', parentId: null, name: '구형', displayOrder: 1, active: true },
]

function mockClassificationRef(id: string | null | undefined): { id: string; name: string } | null {
  if (!id) return null
  const found = MOCK_CLASSIFICATIONS.find((item) => item.id === id)
  return found ? { id: found.id, name: found.name } : null
}

function mockDefaultClassificationRefs(category: string): {
  catL: { id: string; name: string } | null
  catM: { id: string; name: string } | null
  catS: { id: string; name: string } | null
} {
  if (category === 'HOME_MULTI') {
    return {
      catL: mockClassificationRef('cls-home-l-indoor'),
      catM: mockClassificationRef('cls-home-m-1way'),
      catS: mockClassificationRef('cls-home-s-small'),
    }
  }
  if (category === 'COMMERCIAL_MULTI') {
    return {
      catL: mockClassificationRef('cls-commercial-l-outdoor'),
      catM: mockClassificationRef('cls-commercial-m-prime'),
      catS: null,
    }
  }
  if (category === 'SINGLE_SET') {
    return {
      catL: mockClassificationRef('cls-single-l-indoor'),
      catM: mockClassificationRef('cls-single-m-stand'),
      catS: null,
    }
  }
  return { catL: null, catM: null, catS: null }
}

function deriveLegacyExposureFields(row: MockProductCatalogRow): MockProductCatalogRow {
  const firstExposure = row.estimateCategories[0] ?? null
  return {
    ...row,
    estimateCategory: firstExposure?.category ?? null,
    displayOrder: firstExposure?.displayOrder ?? null,
  }
}

function exposureForCategory(row: MockProductCatalogRow, category: string): { category: string; displayOrder: number | null } | null {
  return row.estimateCategories.find((entry) => entry.category === category) ?? null
}

function normalizeMockExposures(raw: {
  estimateCategories?: unknown
  estimateCategory?: unknown
  displayOrder?: unknown
}): Array<{ category: string; displayOrder: number | null }> {
  if (Array.isArray(raw.estimateCategories)) {
    return raw.estimateCategories
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const category = String((entry as { category?: unknown }).category ?? '').trim()
        if (!category) return null
        const displayOrder = (entry as { displayOrder?: unknown }).displayOrder
        return {
          category,
          displayOrder: displayOrder == null ? null : Number(displayOrder),
        }
      })
      .filter((entry): entry is { category: string; displayOrder: number | null } => entry != null)
  }
  if (raw.estimateCategory == null) return []
  return [{
    category: String(raw.estimateCategory),
    displayOrder: raw.displayOrder == null ? null : Number(raw.displayOrder),
  }]
}

// MOCK_PRODUCT_CATALOG_ROWS: mutable 로 선언하여 PATCH/DELETE 가 업데이트 가능.
// usageScopeManual / displayOrder 필드 추가 (PR-B 확장).
// productType / componentCount 추가 (PR-E 확장).
let MOCK_PRODUCT_CATALOG_ROWS: MockProductCatalogRow[] = [
  ...Object.values(MOCK_PRODUCTS_BY_MODEL).filter((p) => p.productCategory !== 'MATERIAL').map((p, index) => {
    const isBundle = p.productType === 'BUNDLE'
    const primaryCategory = isBundle ? 'SINGLE_SET' : index % 2 === 0 ? 'HOME_MULTI' : 'OTHER'
    return deriveLegacyExposureFields({
      ...mockDefaultClassificationRefs(primaryCategory),
      modelCode: p.modelName,
      name: p.productName,
      // BUNDLE(세트)은 판매 가능 품목 → 전표 라인 자동완성(usageScope=PARTNER_ORDER, BE IN-확장 {PARTNER_ORDER,BOTH})에
      // 노출되어야 하므로 항상 BOTH. (index-parity 로 ESTIMATE 가 되면 슬립 라인 검색에서 제외돼 bundle-set-options 회귀.)
      usageScope: isBundle || index % 2 === 0 ? 'BOTH' : 'ESTIMATE',
      estimateCategories: index === 0
        ? [
            { category: 'HOME_MULTI', displayOrder: index + 1 },
            { category: 'COMMERCIAL_MULTI', displayOrder: 101 },
          ]
        : [{ category: primaryCategory, displayOrder: index + 1 }],
      estimateCategory: null,
      productCategory: isBundle ? 'SINGLE_SET' : index % 2 === 0 ? 'HOME_MULTI' : 'SINGLE_PART',
      usageScopeManual: false,
      displayOrder: null,
      releasePrice: Number(p.sellingPrice),
      deliveryPrice: Number(p.sellingPrice),
      fixedDiscountRate: index % 2 === 0 ? 0 : 10,
      hasVariableDiscount: false,
      variableDiscountManual: false,
      legacyDiscountFlag: false,
      discountFlags: null,
      productType: p.productType ?? 'SINGLE',
      componentCount: isBundle && p.modelName === 'SET-HM2WAY' ? 9 : isBundle ? 3 : 0,
    })
  }),
  // §2-1 NONE 품목 시드 — 노출 한정 시나리오 검증용 (displayOrder=null, 정렬 대상 제외).
  {
    modelCode: 'MOCK-NONE-ITEM',
    name: '미노출 품목 (테스트)',
    usageScope: 'NONE' as const,
    estimateCategories: [{ category: 'HOME_MULTI', displayOrder: 999 }],
    estimateCategory: null,
    productCategory: 'SINGLE_PART',
    catL: null,
    catM: null,
    catS: null,
    usageScopeManual: false,
    displayOrder: null,
    releasePrice: 0,
    deliveryPrice: 0,
    fixedDiscountRate: null,
    hasVariableDiscount: false,
    variableDiscountManual: false,
    legacyDiscountFlag: false,
    discountFlags: null,
    productType: 'SINGLE',
    componentCount: 0,
  },
  {
    modelCode: 'MAT-MOCK-REMOTE',
    name: '유선리모컨',
    usageScope: 'NONE',
    estimateCategories: [],
    estimateCategory: null,
    productCategory: 'MATERIAL',
    catL: null,
    catM: null,
    catS: null,
    usageScopeManual: false,
    displayOrder: null,
    releasePrice: 40000,
    deliveryPrice: 40000,
    fixedDiscountRate: null,
    hasVariableDiscount: false,
    variableDiscountManual: false,
    legacyDiscountFlag: false,
    discountFlags: null,
    productType: 'SINGLE',
    componentCount: 0,
  },
]

let mockProductCatalogExtraRowsSeeded = false

/**
 * Playwright 회귀 전용 대량 fixture 주입.
 * in-process mock 은 route() 로 가로챌 수 없어 globalThis seed 를 모듈 로드 후 1회 반영한다.
 */
function ensureMockProductCatalogRowsSeeded() {
  if (mockProductCatalogExtraRowsSeeded) return
  mockProductCatalogExtraRowsSeeded = true
  const seed = (globalThis as Record<string, unknown>)['__SAMHAN_MOCK_PRODUCT_CATALOG_EXTRA_ROWS']
  if (!Array.isArray(seed)) return

  const existing = new Set(MOCK_PRODUCT_CATALOG_ROWS.map((row) => row.modelCode))
  const extraRows = seed
    .map((raw): MockProductCatalogRow | null => {
      if (!raw || typeof raw !== 'object') return null
      const row = raw as Partial<MockProductCatalogRow>
      const modelCode = String(row.modelCode ?? '').trim()
      if (!modelCode || existing.has(modelCode)) return null
      existing.add(modelCode)
      return {
        ...deriveLegacyExposureFields({
        modelCode,
        name: String(row.name ?? modelCode),
        usageScope: String(row.usageScope ?? 'BOTH'),
        estimateCategories: normalizeMockExposures(row),
        estimateCategory: null,
        productCategory: row.productCategory == null ? null : String(row.productCategory),
        catL: row.catL ?? null,
        catM: row.catM ?? null,
        catS: row.catS ?? null,
        usageScopeManual: Boolean(row.usageScopeManual ?? false),
        displayOrder: null,
        releasePrice: Number(row.releasePrice ?? 0),
        deliveryPrice: Number(row.deliveryPrice ?? 0),
        fixedDiscountRate: row.fixedDiscountRate == null ? null : Number(row.fixedDiscountRate),
        hasVariableDiscount: Boolean(row.hasVariableDiscount ?? false),
        variableDiscountManual: Boolean(row.variableDiscountManual ?? false),
        legacyDiscountFlag: Boolean(row.legacyDiscountFlag ?? false),
        discountFlags: null,
        productType: String(row.productType ?? 'SINGLE'),
        componentCount: Number(row.componentCount ?? 0),
        }),
      }
    })
    .filter((row): row is MockProductCatalogRow => row != null)

  if (extraRows.length > 0) {
    MOCK_PRODUCT_CATALOG_ROWS = [...MOCK_PRODUCT_CATALOG_ROWS, ...extraRows]
  }
}

// 구성품 데이터 (BUNDLE 품목 전용) — BE BundleComponentResponse 1:1 동형 — PUT replace-all 로 업데이트됨.
let MOCK_BUNDLE_COMPONENTS: Record<string, Array<{
  componentProductCode: string
  componentName: string
  defaultQty: number
  qtyMode: 'FIXED' | 'FOLLOW_SET'
  componentKind: 'INDOOR' | 'OUTDOOR' | 'PANEL' | 'REMOTE' | 'MATERIAL' | 'ACCESSORY' | 'FOOT'
  componentVariant: string | null
  isDefault: boolean
  specText: string | null
  displayOrder: number
}>> = {
  'SET-HM2WAY': [
    { componentProductCode: 'AJ040RXH4BC1', componentName: '시스템에어컨 4Way 4HP', defaultQty: 2, qtyMode: 'FOLLOW_SET', componentKind: 'INDOOR', componentVariant: '기본', isDefault: true, specText: null, displayOrder: 1 },
    { componentProductCode: 'AJ100NCDKH', componentName: '실외기 10HP', defaultQty: 1, qtyMode: 'FOLLOW_SET', componentKind: 'OUTDOOR', componentVariant: null, isDefault: true, specText: '10HP', displayOrder: 2 },
    { componentProductCode: 'PNL-BASIC', componentName: '표준 판넬', defaultQty: 2, qtyMode: 'FOLLOW_SET', componentKind: 'PANEL', componentVariant: '기본', isDefault: true, specText: null, displayOrder: 3 },
    { componentProductCode: 'PNL-BLACK', componentName: '블랙 판넬', defaultQty: 2, qtyMode: 'FOLLOW_SET', componentKind: 'PANEL', componentVariant: '블랙', isDefault: false, specText: null, displayOrder: 4 },
    { componentProductCode: 'PNL-LIFT', componentName: '승강 판넬', defaultQty: 2, qtyMode: 'FOLLOW_SET', componentKind: 'PANEL', componentVariant: '승강', isDefault: false, specText: null, displayOrder: 5 },
    { componentProductCode: 'PNL-CLEAN', componentName: '공청 판넬', defaultQty: 2, qtyMode: 'FOLLOW_SET', componentKind: 'PANEL', componentVariant: '공청', isDefault: false, specText: null, displayOrder: 6 },
    { componentProductCode: 'MWR-WE10N', componentName: '유선 리모컨 (WE10N)', defaultQty: 2, qtyMode: 'FIXED', componentKind: 'REMOTE', componentVariant: '기본', isDefault: true, specText: null, displayOrder: 7 },
    { componentProductCode: 'MWR-WE13N', componentName: '컬러 유선 리모컨', defaultQty: 1, qtyMode: 'FIXED', componentKind: 'REMOTE', componentVariant: '컬러', isDefault: false, specText: null, displayOrder: 8 },
    { componentProductCode: 'MWR-SH11N', componentName: '서브 유선 리모컨', defaultQty: 1, qtyMode: 'FIXED', componentKind: 'REMOTE', componentVariant: '서브', isDefault: false, specText: null, displayOrder: 9 },
  ],
}

let mockProductSpecsByModel: Record<string, Array<{
  id: string
  specKey: string
  specValue: string | null
  unit: string | null
  displayOrder: number | null
}>> = {
  AJ040RXH4BC1: [
    { id: 'spec-aj040-cooling', specKey: '냉방능력, kW', specValue: '5.6', unit: 'kW', displayOrder: 1 },
    { id: 'spec-aj040-power', specKey: '전원선', specValue: '2.5SQ', unit: null, displayOrder: 2 },
  ],
}

function mockProductSpecsFromBody(modelCode: string, rawSpecs: unknown) {
  if (!Array.isArray(rawSpecs)) return []
  return rawSpecs
    .map((raw, index) => {
      const row = raw as Record<string, unknown>
      return {
        id: `spec-${modelCode}-${index + 1}`,
        specKey: String(row['specKey'] ?? '').trim(),
        specValue: String(row['specValue'] ?? '').trim(),
        unit: row['unit'] == null ? null : String(row['unit']).trim() || null,
        displayOrder: index + 1,
      }
    })
    .filter((spec) => spec.specKey.length > 0 && spec.specValue.length > 0)
}

const GAS_SPEC_KEY_TEMPLATE_ROWS = [
  {
    estimateCategory: 'HOME_MULTI',
    rows: [
      ['배관경', null, 'TEXT'],
      ['냉방능력, kcal/h', 'kcal/h', 'NUMBER'],
      ['냉방능력, kW', 'kW', 'NUMBER'],
      ['냉방소비전력, kW', 'kW', 'NUMBER'],
      ['냉매가스', null, 'TEXT'],
      ['에너지소비효율등급', null, 'TEXT'],
      ['전원선, mm²', 'mm²', 'NUMBER'],
      ['차단기, A', 'A', 'NUMBER'],
      ['제품크기, mm', 'mm', 'DIMENSION'],
      ['제품중량, kg', 'kg', 'NUMBER'],
      ['포장치수, mm', 'mm', 'DIMENSION'],
      ['포장중량, kg', 'kg', 'NUMBER'],
      ['배관길이, m', 'm', 'NUMBER'],
      ['고낙차, m', 'm', 'NUMBER'],
      ['최대 연결 실내기 대수, 대', '대', 'NUMBER'],
      ['타공사이즈, mm', 'mm', 'NUMBER'],
      ['전산볼트간격, mm', 'mm', 'NUMBER'],
    ],
  },
  {
    estimateCategory: 'SINGLE_SET',
    rows: [
      ['배관경', null, 'TEXT'],
      ['냉방능력, kcal/h', 'kcal/h', 'RANGE'],
      ['난방능력, kcal/h', 'kcal/h', 'RANGE'],
      ['냉방능력, kW', 'kW', 'RANGE'],
      ['난방능력, kW', 'kW', 'RANGE'],
      ['냉방소비전력, kW', 'kW', 'RANGE'],
      ['난방소비전력, kW', 'kW', 'RANGE'],
      ['냉매가스', null, 'TEXT'],
      ['에너지소비효율등급', null, 'TEXT'],
      ['전원선, mm²', 'mm²', 'NUMBER'],
      ['차단기, A', 'A', 'NUMBER'],
      ['실내기크기, mm', 'mm', 'DIMENSION'],
      ['실외기크기, mm', 'mm', 'DIMENSION'],
      ['실내기중량, kg', 'kg', 'NUMBER'],
      ['실외기중량, kg', 'kg', 'NUMBER'],
      ['실내기포장, mm', 'mm', 'DIMENSION'],
      ['실외기포장, mm', 'mm', 'DIMENSION'],
      ['실내기포장중량, kg', 'kg', 'NUMBER'],
      ['실외기포장중량, kg', 'kg', 'NUMBER'],
      ['배관길이, m', 'm', 'NUMBER'],
      ['고낙차, m', 'm', 'NUMBER'],
      ['타공사이즈, mm', 'mm', 'NUMBER'],
      ['전산볼트간격, mm', 'mm', 'NUMBER'],
    ],
  },
  {
    estimateCategory: 'COMMERCIAL_MULTI',
    rows: [
      ['배관경', null, 'TEXT'],
      ['냉방능력, kcal/h', 'kcal/h', 'NUMBER'],
      ['난방능력, kcal/h', 'kcal/h', 'NUMBER'],
      ['냉방능력, kW', 'kW', 'NUMBER'],
      ['난방능력, kW', 'kW', 'NUMBER'],
      ['냉방소비전력, kW', 'kW', 'NUMBER'],
      ['난방소비전력, kW', 'kW', 'NUMBER'],
      ['냉매가스', null, 'TEXT'],
      ['소비효율등급', null, 'TEXT'],
      ['전원선, mm²', 'mm²', 'NUMBER'],
      ['차단기, A', 'A', 'NUMBER'],
      ['제품크기, mm', 'mm', 'DIMENSION'],
      ['제품중량, kg', 'kg', 'NUMBER'],
      ['포장치수, mm', 'mm', 'DIMENSION'],
      ['포장중량, kg', 'kg', 'NUMBER'],
      ['배관길이, m', 'm', 'TEXT'],
      ['고낙차, m', 'm', 'TEXT'],
      ['최대 연결 실내기 대수, 대', '대', 'NUMBER'],
      ['타공사이즈, mm', 'mm', 'NUMBER'],
      ['전산볼트간격, mm', 'mm', 'NUMBER'],
    ],
  },
] as const

const MOCK_SPEC_KEY_TEMPLATES = GAS_SPEC_KEY_TEMPLATE_ROWS.flatMap((group) =>
  group.rows.map(([specKey, defaultUnit, valueType], index) => ({
    id: `template-${group.estimateCategory.toLowerCase()}-${index + 1}`,
    estimateCategory: group.estimateCategory,
    specKey,
    defaultUnit,
    valueType,
    displayOrder: index + 1,
    isRecommended: true,
  })),
)

const MOCK_PRODUCT_CATEGORIES = [
  {
    id: 'cat-home',
    code: 'HOME_MULTI',
    name: '홈멀티',
    parentId: null,
    displayOrder: 1,
    children: [],
  },
]

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
 * 사업자 양식(supplier-profiles) 목록 — POST 신규 등록이 실제로 목록에 반영되도록 stateful 보관.
 * 페이지 로드(테스트별 fresh context)마다 모듈 재평가로 빈 배열 → 첫 GET 시 seed 1건 주입.
 */
const mockSupplierProfileList: Record<string, unknown>[] = []

/**
 * 홈택스 일괄 제외 거래처(hometax-export/exclusions) 목록 — POST 추가/DELETE 제거가 실제로 목록에 반영되도록 stateful.
 * 페이지 로드마다 재seed(첫 접근 시 MOCK_BATCH_EXCLUSIONS 주입).
 */
const mockBatchExclusionList: Record<string, unknown>[] = []

// =============================================================================
// Presence mock 공용 헬퍼 — 슬립/회계/주문/견적/그룹웨어 4문서 공유
// [[inprocess-mock-principles]]: 공용 hoist 로 redeclare 컴파일 에러 방지
// =============================================================================

export type MockPresenceColor = 'BLUE' | 'GREEN' | 'AMBER' | 'ROSE' | 'VIOLET' | 'CYAN' | 'LIME' | 'PINK'

export type MockPresenceEntry = {
  sessionId: string
  displayName: string
  color: MockPresenceColor
}

const MOCK_PRESENCE_COLORS: readonly MockPresenceColor[] = [
  'BLUE', 'GREEN', 'AMBER', 'ROSE', 'VIOLET', 'CYAN', 'LIME', 'PINK',
]

function readMockHeader(config: AxiosRequestConfig, headerName: string): string {
  const headers = config.headers as unknown
  if (typeof headers !== 'object' || headers === null) return ''
  const getHeader = (headers as { get?: (name: string) => unknown }).get
  if (typeof getHeader === 'function') {
    const value = getHeader.call(headers, headerName)
    if (typeof value === 'string') return value.trim()
  }
  const lowerHeaderName = headerName.toLowerCase()
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== lowerHeaderName || value == null) continue
    return String(value).trim()
  }
  return ''
}

function colorForPresence(seed: string): MockPresenceColor {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return MOCK_PRESENCE_COLORS[hash % MOCK_PRESENCE_COLORS.length]!
}

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
      displayName: MOCK_AUTH.fullName,
      partnerCode: MOCK_AUTH.partnerCode,
      groups: MOCK_AUTH.groups,
    })
  }

  if (method === 'GET' && url.includes('/app/version')) {
    const urlObj = new URL(url.startsWith('http') ? url : `http://mock${url}`)
    const clientType = normalizeMockClientType(
      config.params?.['clientType'] ?? urlObj.searchParams.get('clientType'),
    )
    const currentVersion = String(
      config.params?.['currentVersion'] ?? urlObj.searchParams.get('currentVersion') ?? '0.0.0',
    )
    const params = mockLocationParams()
    const forcedLevel = params.get('mockAppForce')
    const forcedLatest = params.get('mockAppLatestVersion')
    const latest = [...MOCK_APP_RELEASES]
      .filter((release) => release.clientType === clientType)
      .sort((a, b) => compareSemverDesc(a.version, b.version))[0]

    if (!latest) {
      return envelope({
        latestVersion: currentVersion,
        minSupportedVersion: currentVersion,
        forceLevel: 'NONE' satisfies MockAppForceLevel,
        releaseNotes: '',
        releasedAt: new Date().toISOString(),
      })
    }

    const latestVersion = forcedLatest || latest.version
    const forceLevel =
      forcedLevel === 'CRITICAL' || forcedLevel === 'MAJOR' || forcedLevel === 'MINOR' || forcedLevel === 'NONE'
        ? forcedLevel
        : isSemverLessThan(currentVersion, latest.minSupportedVersion)
          ? 'CRITICAL'
          : isSemverLessThan(currentVersion, latestVersion)
            ? latest.forceLevel
            : 'NONE'

    return envelope({
      latestVersion,
      minSupportedVersion: latest.minSupportedVersion,
      forceLevel,
      releaseNotes: latest.releaseNotes,
      releasedAt: latest.releasedAt,
    })
  }

  if (method === 'GET' && url.endsWith('/app/releases')) {
    const denied = mockRequirePermission('admin.app-release', 'view')
    if (denied) return denied
    return envelope(sortedMockAppReleases())
  }

  if (method === 'POST' && url.endsWith('/app/releases')) {
    const denied = mockRequirePermission('admin.app-release', 'create')
    if (denied) return denied
    const created = mockAppReleaseFromBody(parseMockBody(config), mockAppReleaseId(mockAppReleaseSeq))
    mockAppReleaseSeq += 1
    MOCK_APP_RELEASES = [...MOCK_APP_RELEASES, created]
    return envelope(created)
  }

  const appReleaseItemMatch = url.match(/\/app\/releases\/([^/?#]+)$/)
  if (appReleaseItemMatch) {
    const encodedId = appReleaseItemMatch[1]
    if (!encodedId) return null
    const id = decodeURIComponent(encodedId)
    const index = MOCK_APP_RELEASES.findIndex((release) => release.id === id)
    if (index < 0) return mockError(404, 'NOT_FOUND', '릴리스를 찾을 수 없습니다.')

    if (method === 'PUT') {
      const denied = mockRequirePermission('admin.app-release', 'update')
      if (denied) return denied
      const updated = mockAppReleaseFromBody(parseMockBody(config), id)
      MOCK_APP_RELEASES = MOCK_APP_RELEASES.map((release) => release.id === id ? updated : release)
      return envelope(updated)
    }

    if (method === 'DELETE') {
      const denied = mockRequirePermission('admin.app-release', 'delete')
      if (denied) return denied
      MOCK_APP_RELEASES = MOCK_APP_RELEASES.filter((release) => release.id !== id)
      return envelope(null)
    }
  }

  // GET /users/me/is-executive-office — 대표실 부서 소속 여부 판정.
  // ?mockRole=MASTER + ?mockDepartment=대표실 시 isExecutiveOffice: true.
  // MASTER 이하 또는 대표실 미소속 시 false.
  // [PR-HR] AdminLayout 진입 가드용 mock.
  if (method === 'GET' && url.includes('/users/me/is-executive-office')) {
    // HashRouter 에서 mockRole/mockDepartment 는 hash query 에 있으므로 mockLocationParams()(hash 병합)로 읽는다.
    // (기존 window.location.search 직접 파싱은 hash 쿼리를 못 읽어 항상 빈값 → MASTER 면 무조건 대표실 판정되는 버그.)
    const params = mockLocationParams()
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
    const body = parseMockBody(config) as Record<string, unknown>
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

  const productCategoryTreeMatch = url.match(/\/api\/products\/categories(?:\?.*)?$/)
  if (method === 'GET' && productCategoryTreeMatch) {
    const denied = mockRequirePermission('products.list', 'view')
    if (denied) return denied
    return envelope(MOCK_PRODUCT_CATEGORIES)
  }

  // GET/POST /api/v1/classifications — F1-b 분류 마스터 CRUD.
  if (url.match(/\/api\/v1\/classifications(?:\?.*)?$/)) {
    if (method === 'GET') {
      const denied = mockRequirePermission('products.list', 'view')
      if (denied) return denied
      const urlObj = new URL(url.startsWith('http') ? url : `http://mock${url}`)
      const estimateCategory = String(
        config.params?.['estimateCategory'] ?? urlObj.searchParams.get('estimateCategory') ?? '',
      )
      const parentIdRaw = config.params?.['parentId'] ?? urlObj.searchParams.get('parentId')
      const parentId = parentIdRaw == null || String(parentIdRaw) === '' ? null : String(parentIdRaw)
      return MOCK_CLASSIFICATIONS
        .filter((item) => item.estimateCategory === estimateCategory)
        .filter((item) => (parentId == null ? item.parentId == null : item.parentId === parentId))
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'ko-KR'))
    }
    if (method === 'POST') {
      const denied = mockRequirePermission('products.admin', 'create')
      if (denied) return denied
      const body = parseMockBody(config)
      const estimateCategory = String(body['estimateCategory'] ?? '')
      const catLevel = String(body['catLevel'] ?? 'L') as 'L' | 'M' | 'S'
      const parentId = body['parentId'] == null ? null : String(body['parentId'])
      const name = String(body['name'] ?? '').trim()
      if (!estimateCategory || !name) return mockError(400, 'INVALID_INPUT', '분류명은 필수입니다.')
      if (catLevel !== 'L' && !parentId) return mockError(400, 'INVALID_INPUT', '상위 분류는 필수입니다.')
      const siblingOrders = MOCK_CLASSIFICATIONS
        .filter((item) => item.estimateCategory === estimateCategory && item.catLevel === catLevel && item.parentId === parentId)
        .map((item) => item.displayOrder)
      const created: MockClassification = {
        id: `cls-${estimateCategory.toLowerCase()}-${Date.now()}`,
        estimateCategory,
        catLevel,
        parentId,
        name,
        displayOrder: body['displayOrder'] == null ? Math.max(0, ...siblingOrders) + 1 : Number(body['displayOrder']),
        active: body['active'] == null ? true : Boolean(body['active']),
      }
      MOCK_CLASSIFICATIONS = [...MOCK_CLASSIFICATIONS, created]
      return { __mockStatus: 201, body: created }
    }
  }

  // PATCH/DELETE /api/v1/classifications/{id}
  const classificationItemMatch = url.match(/\/api\/v1\/classifications\/([^/?]+)(?:\?.*)?$/)
  if (classificationItemMatch) {
    const id = decodeURIComponent(classificationItemMatch[1]!)
    const idx = MOCK_CLASSIFICATIONS.findIndex((item) => item.id === id)
    if (idx < 0) return mockError(404, 'NOT_FOUND', '분류를 찾을 수 없습니다.')
    const existing = MOCK_CLASSIFICATIONS[idx]!

    if (method === 'PATCH') {
      const denied = mockRequirePermission('products.admin', 'update')
      if (denied) return denied
      const body = parseMockBody(config)
      const updated: MockClassification = {
        ...existing,
        parentId: 'parentId' in body ? (body['parentId'] == null ? null : String(body['parentId'])) : existing.parentId,
        name: body['name'] == null ? existing.name : String(body['name']).trim(),
        displayOrder: body['displayOrder'] == null ? existing.displayOrder : Number(body['displayOrder']),
        active: body['active'] == null ? existing.active : Boolean(body['active']),
      }
      MOCK_CLASSIFICATIONS = MOCK_CLASSIFICATIONS.map((item, i) => (i === idx ? updated : item))
      MOCK_PRODUCT_CATALOG_ROWS = MOCK_PRODUCT_CATALOG_ROWS.map((row) => ({
        ...row,
        catL: row.catL?.id === updated.id ? { id: updated.id, name: updated.name } : row.catL,
        catM: row.catM?.id === updated.id ? { id: updated.id, name: updated.name } : row.catM,
        catS: row.catS?.id === updated.id ? { id: updated.id, name: updated.name } : row.catS,
      }))
      return updated
    }

    if (method === 'DELETE') {
      const denied = mockRequirePermission('products.admin', 'delete')
      if (denied) return denied
      const hasChild = MOCK_CLASSIFICATIONS.some((item) => item.parentId === id)
      const used = MOCK_PRODUCT_CATALOG_ROWS.some((row) => row.catL?.id === id || row.catM?.id === id || row.catS?.id === id)
      if (hasChild || used) {
        return mockError(409, 'CONFLICT', '하위 분류 또는 품목에서 사용 중인 분류는 삭제할 수 없습니다.')
      }
      MOCK_CLASSIFICATIONS = MOCK_CLASSIFICATIONS.filter((item) => item.id !== id)
      return { __mockStatus: 204, body: null }
    }
  }

  // PUT /api/v1/products/display-orders — 표시 순서 일괄 갱신 (드래그 후 저장)
  // 경로 우선순위: 리터럴 /display-orders 가 /{modelCode}/components 패턴보다 먼저 매칭돼야 함.
  if (method === 'PUT' && url.match(/\/api\/v1\/products\/display-orders(?:\?.*)?$/)) {
    const denied = mockRequirePermission('products.admin', 'update')
    if (denied) return denied
    ensureMockProductCatalogRowsSeeded()
    const body = parseMockBody(config)
    const orders = Array.isArray(body)
      ? (body as Array<{ modelCode?: unknown; estimateCategory?: unknown; displayOrder?: unknown }>)
      : []
    // [#20] BE updateDisplayOrders 동형 — 빈 배열은 no-op 으로 204 성공(기존: 400 BAD_REQUEST 오정).
    //   BE: `if (requests == null || requests.isEmpty()) return;` → 컨트롤러 204 No Content.
    if (orders.length === 0) {
      return { updated: true }
    }
    // [#10] BE updateDisplayOrders H fix 동형 — 요청 내 중복 modelCode → 400 INVALID_INPUT.
    //   같은 modelCode 가 두 번 들어오면 마지막 값으로 덮어써 의도와 다른 순서가 저장된다.
    const seenModelCodes = new Set<string>()
    const requestCategories = new Set<string>()
    for (const o of orders as Array<{ modelCode?: unknown; estimateCategory?: unknown; displayOrder?: unknown }>) {
      const code = String(o.modelCode ?? '').trim()
      if (!code) {
        return mockError(400, 'INVALID_INPUT', 'modelCode는 필수입니다')
      }
      const estimateCategory = String(o.estimateCategory ?? '').trim()
      if (!estimateCategory) {
        return mockError(400, 'INVALID_INPUT', 'estimateCategory는 필수입니다')
      }
      requestCategories.add(estimateCategory)
      if (o.displayOrder == null || !isFinite(Number(o.displayOrder))) {
        return mockError(400, 'INVALID_INPUT', 'displayOrder는 필수입니다')
      }
      if (seenModelCodes.has(code)) {
        return mockError(400, 'INVALID_INPUT', `표시 순서 갱신에 중복 modelCode 가 있습니다: ${code}`)
      }
      seenModelCodes.add(code)
    }
    // 미존재 modelCode 404 전건 롤백 (BE BundleComponentService.updateDisplayOrders 동형)
    // 하나라도 카탈로그에 없으면 EntityNotFoundException→404, 부분 적용 없음.
    const missing = (orders as Array<{ modelCode?: unknown }>).find(
      (o) => !MOCK_PRODUCT_CATALOG_ROWS.some((r) => r.modelCode === String(o.modelCode ?? '')),
    )
    if (missing) {
      return mockError(404, 'NOT_FOUND', '품목을 찾을 수 없습니다.')
    }
    // estimateCategory 혼합 400 검증: 신규 BE 계약은 요청 항목의 estimateCategory 가 모두 같아야 한다.
    if (requestCategories.size > 1) {
      return mockError(
        400,
        'INVALID_INPUT',
        '표시 순서 일괄 갱신은 동일 견적 카테고리(estimateCategory) 품목만 허용됩니다.',
      )
    }
    const targetCategory = [...requestCategories][0]!
    const targetCategoryCodes = MOCK_PRODUCT_CATALOG_ROWS
      .filter((row) => row.usageScope !== 'NONE' && exposureForCategory(row, targetCategory) != null)
      .map((row) => row.modelCode)
      .sort()
    const requestCodes = [...seenModelCodes].sort()
    if (
      targetCategoryCodes.length !== requestCodes.length
      || targetCategoryCodes.some((code, index) => code !== requestCodes[index])
    ) {
      return mockError(
        400,
        'INVALID_INPUT',
        '표시 순서 일괄 갱신은 대상 견적 카테고리의 전체 활성 노출을 포함해야 합니다.',
      )
    }
    MOCK_PRODUCT_CATALOG_ROWS = MOCK_PRODUCT_CATALOG_ROWS.map((row) => {
      const entry = orders.find((o) => String(o.modelCode ?? '') === row.modelCode)
      if (!entry) return row
      const nextExposures = row.estimateCategories.map((exposure) =>
        exposure.category === targetCategory
          ? { ...exposure, displayOrder: Number(entry.displayOrder ?? exposure.displayOrder) }
          : exposure,
      )
      return deriveLegacyExposureFields({ ...row, estimateCategories: nextExposures })
    })
    // in-process mock 은 page.route 로 가로챌 수 없으므로([[inprocess-mock-principles]])
    // 마지막 표시순서 저장 요청 본문을 globalThis 에 노출 → Playwright page.evaluate 로 displayOrder 재번호 단언.
    try {
      ;(globalThis as Record<string, unknown>)['__SAMHAN_LAST_DISPLAY_ORDERS'] = orders
    } catch {
      /* noop */
    }
    // 204 No Content 동형 — non-null 마커 반환
    return { updated: true }
  }

  // GET /api/v1/products/{modelCode}/components — 구성품 목록 (BUNDLE 전용)
  // PUT /api/v1/products/{modelCode}/components — 구성품 replace-all 저장
  // 경로 우선순위: /components 패턴이 /usage, /specs, /display-orders 보다 아래, /{modelCode} 패턴보다 위.
  const productComponentsMatch = url.match(/\/api\/v1\/products\/([^/?]+)\/components(?:\?.*)?$/)
  if (productComponentsMatch) {
    ensureMockProductCatalogRowsSeeded()
    const modelCode = decodeURIComponent(productComponentsMatch[1]!)
    const catalogRow = MOCK_PRODUCT_CATALOG_ROWS.find((r) => r.modelCode === modelCode)
    if (!catalogRow) {
      return mockError(404, 'NOT_FOUND', '품목을 찾을 수 없습니다.')
    }

    if (method === 'GET') {
      const denied = mockRequirePermission('products.list', 'view')
      if (denied) return denied
      // 비-BUNDLE 에 대해서는 BE 계약 동형: 200 빈배열 (409 대신 — P1-A fix)
      if (catalogRow.productType !== 'BUNDLE') {
        return []
      }
      return MOCK_BUNDLE_COMPONENTS[modelCode] ?? []
    }

    if (method === 'PUT') {
      const denied = mockRequirePermission('products.admin', 'update')
      if (denied) return denied
      if (catalogRow.productType !== 'BUNDLE') {
        return mockError(409, 'CONFLICT', '세트(BUNDLE) 품목만 구성품 편집이 가능합니다.')
      }
      const body = parseMockBody(config)
      const components = Array.isArray(body)
        ? (body as Array<{
            componentProductCode?: unknown
            defaultQty?: unknown
            qtyMode?: unknown
            componentKind?: unknown
            componentVariant?: unknown
            isDefault?: unknown
            specText?: unknown
          }>)
        : []
      if (components.length === 0) {
        return mockError(400, 'BAD_REQUEST', '구성품 목록이 비어 있습니다.')
      }
      // [#10] BE BundleComponentService.replaceComponents 동형 검증 — 존재/자기참조 + 중복코드 + 수량범위.
      //   (1) 미존재/자기참조: 기존 유지.
      //   (2) 요청 내 중복 componentProductCode → 400 INVALID_INPUT (부분 유니크 인덱스 사전 차단).
      //   (3) defaultQty 범위 0.01~999.99 (BE @DecimalMin/@DecimalMax NUMERIC(5,2)) 위반 → 400.
      const seenCompCodes = new Set<string>()
      for (const comp of components) {
        const compCode = String(comp.componentProductCode ?? '')
        const compRow = MOCK_PRODUCT_CATALOG_ROWS.find((r) => r.modelCode === compCode)
        if (!compRow) {
          return mockError(400, 'INVALID_INPUT', `구성 품목 '${compCode}'을(를) 찾을 수 없습니다.`)
        }
        if (compCode === modelCode) {
          return mockError(400, 'INVALID_INPUT', '세트 품목 자신을 구성품으로 포함할 수 없습니다.')
        }
        if (compRow.productType === 'BUNDLE') {
          return mockError(400, 'INVALID_INPUT', `세트 품목은 구성품으로 등록할 수 없습니다: ${compCode}`)
        }
        if (seenCompCodes.has(compCode)) {
          return mockError(400, 'INVALID_INPUT', `구성품에 중복 모델코드가 있습니다: ${compCode}`)
        }
        seenCompCodes.add(compCode)
        const qty = Number(comp.defaultQty ?? 1)
        if (!isFinite(qty) || qty < 0.01 || qty > 999.99) {
          return mockError(400, 'INVALID_INPUT', '구성품 수량은 0.01~999.99 범위여야 합니다.')
        }
      }
      // BE BundleComponentResponse 1:1 동형 변환
      const newComponents = components.map((comp, idx) => {
        const compCode = String(comp.componentProductCode ?? '')
        const compRow = MOCK_PRODUCT_CATALOG_ROWS.find((r) => r.modelCode === compCode)
        return {
          componentProductCode: compCode,
          componentName: compRow?.name ?? compCode,
          defaultQty: Number(comp.defaultQty ?? 1),
          qtyMode: (comp.qtyMode as 'FIXED' | 'FOLLOW_SET' | undefined) ?? 'FOLLOW_SET',
          componentKind: (comp.componentKind as string | undefined) ?? 'ACCESSORY',
          componentVariant: (comp.componentVariant as string | null | undefined) ?? null,
          isDefault: Boolean(comp.isDefault ?? false),
          specText: (comp.specText as string | null | undefined) ?? null,
          displayOrder: idx + 1,
        } as (typeof MOCK_BUNDLE_COMPONENTS)[string][number]
      })
      MOCK_BUNDLE_COMPONENTS = { ...MOCK_BUNDLE_COMPONENTS, [modelCode]: newComponents }
      // componentCount 갱신
      MOCK_PRODUCT_CATALOG_ROWS = MOCK_PRODUCT_CATALOG_ROWS.map((row) =>
        row.modelCode === modelCode ? { ...row, componentCount: newComponents.length } : row,
      )
      return newComponents
    }
  }

  // PATCH /api/v1/products/{modelCode}/classification — F1-b 품목 분류 저장.
  const productClassificationMatch = url.match(/\/api\/v1\/products\/([^/?]+)\/classification(?:\?.*)?$/)
  if (method === 'PATCH' && productClassificationMatch) {
    const denied = mockRequirePermission('products.admin', 'update')
    if (denied) return denied
    ensureMockProductCatalogRowsSeeded()
    const modelCode = decodeURIComponent(productClassificationMatch[1]!)
    const idx = MOCK_PRODUCT_CATALOG_ROWS.findIndex((row) => row.modelCode === modelCode)
    if (idx < 0) return mockError(404, 'NOT_FOUND', '제품을 찾을 수 없습니다')
    const body = parseMockBody(config)
    const updated = {
      ...MOCK_PRODUCT_CATALOG_ROWS[idx]!,
      catL: mockClassificationRef(body['catLId'] == null ? null : String(body['catLId'])),
      catM: mockClassificationRef(body['catMId'] == null ? null : String(body['catMId'])),
      catS: mockClassificationRef(body['catSId'] == null ? null : String(body['catSId'])),
    }
    MOCK_PRODUCT_CATALOG_ROWS = MOCK_PRODUCT_CATALOG_ROWS.map((row, i) => (i === idx ? updated : row))
    return updated
  }

  // PATCH /api/v1/products/{modelCode}/fixed-discount — 고정DC 인라인 자동 저장.
  const productFixedDiscountMatch = url.match(/\/api\/v1\/products\/([^/?]+)\/fixed-discount(?:\?.*)?$/)
  if (method === 'PATCH' && productFixedDiscountMatch) {
    const denied = mockRequirePermission('products.admin', 'update')
    if (denied) return denied
    ensureMockProductCatalogRowsSeeded()
    const modelCode = decodeURIComponent(productFixedDiscountMatch[1]!)
    const idx = MOCK_PRODUCT_CATALOG_ROWS.findIndex((row) => row.modelCode === modelCode)
    if (idx < 0) return mockError(404, 'NOT_FOUND', '제품을 찾을 수 없습니다')
    const body = parseMockBody(config)
    const fixedDiscountRateRaw = body['fixedDiscountRate']
    const fixedDiscountRate = fixedDiscountRateRaw == null || String(fixedDiscountRateRaw).trim() === ''
      ? null
      : Number(fixedDiscountRateRaw)
    if (
      fixedDiscountRate != null &&
      (!Number.isFinite(fixedDiscountRate) || fixedDiscountRate < 0 || fixedDiscountRate > 100)
    ) {
      return mockError(400, 'INVALID_INPUT', '고정DC율은 0~100 범위여야 합니다.')
    }
    const updated = {
      ...MOCK_PRODUCT_CATALOG_ROWS[idx]!,
      fixedDiscountRate,
    }
    MOCK_PRODUCT_CATALOG_ROWS = MOCK_PRODUCT_CATALOG_ROWS.map((row, i) => (i === idx ? updated : row))
    return updated
  }

  // PATCH /api/v1/products/{modelCode}/usage — 수동 override 설정 (usageScopeManual=true)
  // DELETE /api/v1/products/{modelCode}/usage — 시트 자동 복귀 (usageScopeManual=false)
  // 경로 우선순위: /usage 패턴이 /specs/ 보다 먼저 위치해야 선점 회귀 방지 (#459 교훈)
  //
  // BE 계약 (PR-B 사이클1 확정):
  //   PATCH → bare ProductCatalogResponse (envelope 없음, res.data = DTO 직접)
  //   DELETE → 204 무본문 (void). non-null 반환 규칙상 { deleted:true } 마커 사용
  //   미존재 modelCode → 404
  const productUsageMatch = url.match(/\/api\/v1\/products\/([^/?]+)\/usage(?:\?.*)?$/)
  if (productUsageMatch) {
    const denied = mockRequirePermission('products.admin', 'update')
    if (denied) return denied
    const modelCode = decodeURIComponent(productUsageMatch[1]!)
    const idx = MOCK_PRODUCT_CATALOG_ROWS.findIndex((row) => row.modelCode === modelCode)
    // 미존재 modelCode → 404 (BE 계약 동형 — EntityNotFoundException → "제품을 찾을 수 없습니다")
    if (idx < 0) {
      return mockError(404, 'NOT_FOUND', '제품을 찾을 수 없습니다')
    }
    const existing = MOCK_PRODUCT_CATALOG_ROWS[idx]!

    if (method === 'PATCH') {
      const body = parseMockBody(config)
      const newScope = (body['usageScope'] as string | undefined) ?? existing.usageScope
      // BE markUsageManual 동형 룰: NONE / PARTNER_ORDER 는 견적 노출 카테고리 전부 정리.
      const requestedCategories = Array.isArray(body['estimateCategories'])
        ? (body['estimateCategories'] as unknown[])
            .map((category) => String(category).trim())
            .filter((category) => category.length > 0)
        : normalizeMockExposures(existing).map((entry) => entry.category)
      const existingDisplayOrderByCategory = new Map(
        existing.estimateCategories.map((entry) => [entry.category, entry.displayOrder] as const),
      )
      const estimateCategoriesResolved =
        newScope === 'NONE' || newScope === 'PARTNER_ORDER'
          ? []
          : Array.from(new Set(requestedCategories)).map((category) => ({
              category,
              displayOrder: existingDisplayOrderByCategory.get(category) ?? null,
            }))
      const updated = deriveLegacyExposureFields({
        ...existing,
        modelCode,
        usageScope: newScope,
        estimateCategories: estimateCategoriesResolved,
        usageScopeManual: true,
      })
      MOCK_PRODUCT_CATALOG_ROWS = MOCK_PRODUCT_CATALOG_ROWS.map((row, i) =>
        i === idx ? updated : row,
      )
      // BE 반환 = bare ProductCatalogResponse (ApiResponse envelope 없음)
      // productCatalogApi.ts updateProductUsage 가 res.data 를 직접 사용하므로 bare 객체 반환
      return updated
    }
    if (method === 'DELETE') {
      const updated = {
        ...existing,
        modelCode,
        usageScopeManual: false,
      }
      MOCK_PRODUCT_CATALOG_ROWS = MOCK_PRODUCT_CATALOG_ROWS.map((row, i) =>
        i === idx ? updated : row,
      )
      // BE 204 무본문. null 반환은 "미매칭 fallthrough" 로 취급되므로 non-null 마커 반환.
      // clearProductUsage 호출자는 void 반환을 기대하므로 body 는 무시됨.
      return { deleted: true }
    }
  }

  // POST /api/products — 품목 신규 등록 (CreateProductRequest mock, gateway StripPrefix=1 → ProductController.create)
  if (method === 'POST' && url.match(/\/api\/products(?:\?.*)?$/)) {
    const denied = mockRequirePermission('products.admin', 'create')
    if (denied) return denied
    ensureMockProductCatalogRowsSeeded()
    const body = parseMockBody(config)
    const modelName = String(body['modelName'] ?? '').trim()
    const name = String(body['name'] ?? '').trim()
    if (!modelName || !name) {
      return mockError(400, 'INVALID_INPUT', '모델명과 품목명은 필수입니다.')
    }
    const modelCode = modelName
    if (MOCK_PRODUCT_CATALOG_ROWS.some((row) => row.modelCode === modelCode)) {
      return mockError(409, 'CONFLICT', '이미 등록된 모델명입니다.')
    }
    const itemKind = String(body['itemKind'] ?? 'GENERAL') === 'SET' ? 'SET' : 'GENERAL'
    const productCategory = String(body['productCategory'] ?? (itemKind === 'SET' ? 'SINGLE_SET' : 'SINGLE_PART'))
    const isMaterial = productCategory === 'MATERIAL'
    const productType = itemKind === 'SET' ? 'BUNDLE' : 'SINGLE'

    const productId = `p-${modelCode.toLowerCase().replace(/[^a-z0-9]+/g, '-') || Date.now()}`
    MOCK_PRODUCTS_BY_MODEL[modelName] = {
      productId,
      modelName,
      productName: name,
      sellingPrice: String(body['sellingPrice'] ?? '0'),
      purchasePrice: String(body['purchasePrice'] ?? '0'),
      categoryId: String(body['categoryId'] ?? 'cat-home'),
      description: (body['description'] as string | null | undefined) ?? null,
      goods: isMaterial ? false : String(body['goodsType'] ?? 'GOODS') !== 'NON_GOODS',
      productType: isMaterial ? 'SINGLE' : productType,
      modelCode,
      productCategory,
    }
    const specs = mockProductSpecsFromBody(modelCode, body['specs'])
    mockProductSpecsByModel = {
      ...mockProductSpecsByModel,
      [modelCode]: specs,
    }
    const usageScope = isMaterial
      ? 'NONE'
      : String(body['usageScope'] ?? 'NONE')
    const estimateCategories =
      usageScope === 'ESTIMATE' || usageScope === 'BOTH'
        ? normalizeMockExposures({
            estimateCategories: body['estimateCategories'],
            displayOrder: MOCK_PRODUCT_CATALOG_ROWS.length + 1,
          })
        : []
    MOCK_PRODUCT_CATALOG_ROWS = [
      deriveLegacyExposureFields({
        ...mockDefaultClassificationRefs(estimateCategories[0]?.category ?? ''),
        modelCode,
        name,
        usageScope,
        estimateCategories,
        estimateCategory: null,
        productCategory,
        usageScopeManual: false,
        displayOrder: null,
        releasePrice: Number(body['releasePrice'] ?? body['sellingPrice'] ?? 0),
        deliveryPrice: Number(body['deliveryPrice'] ?? 0),
        fixedDiscountRate: null,
        hasVariableDiscount: false,
        variableDiscountManual: false,
        legacyDiscountFlag: false,
        discountFlags: null,
        productType: isMaterial ? 'SINGLE' : productType,
        componentCount: 0,
      }),
      ...MOCK_PRODUCT_CATALOG_ROWS,
    ]
    return envelope({
      id: productId,
      name,
      modelName,
      modelCode,
      categoryId: String(body['categoryId'] ?? 'cat-home'),
      categoryName: '홈멀티',
      sellingPrice: String(body['sellingPrice'] ?? '0'),
      purchasePrice: String(body['purchasePrice'] ?? '0'),
      currency: String(body['currency'] ?? 'KRW'),
      tags: {},
      description: (body['description'] as string | null | undefined) ?? null,
      productCategory,
      itemKind,
      unit: isMaterial ? 'EA' : ((body['unit'] as string | null | undefined) ?? 'EA'),
      goodsType: isMaterial ? 'NON_GOODS' : String(body['goodsType'] ?? 'GOODS'),
      specs,
    })
  }

  // PATCH /api/products/{id} — 품목 부분 수정 (UpdateProductRequest mock, gateway StripPrefix=1 → ProductController.update)
  const productUpdateMatch = url.match(/\/api\/products\/([^/?]+)(?:\?.*)?$/)
  if (method === 'PATCH' && productUpdateMatch) {
    const denied = mockRequirePermission('products.admin', 'update')
    if (denied) return denied
    ensureMockProductCatalogRowsSeeded()
    const productId = decodeURIComponent(productUpdateMatch[1]!)
    const entry = Object.entries(MOCK_PRODUCTS_BY_MODEL).find(([, value]) => value.productId === productId)
    if (!entry) {
      return mockError(404, 'NOT_FOUND', '제품을 찾을 수 없습니다')
    }
    const [oldKey, existing] = entry
    const body = parseMockBody(config)
    const nextModelName = String(body['modelName'] ?? existing.modelName).trim()
    const nextName = String(body['name'] ?? existing.productName).trim()
    const itemKind = String(body['itemKind'] ?? (existing.productType === 'BUNDLE' ? 'SET' : 'GENERAL')) === 'SET'
      ? 'SET'
      : 'GENERAL'
    const productCategory = String(body['productCategory'] ?? existing.productCategory ?? (itemKind === 'SET' ? 'SINGLE_SET' : 'SINGLE_PART'))
    const isMaterial = productCategory === 'MATERIAL'
    const productType = itemKind === 'SET' ? 'BUNDLE' : 'SINGLE'
    const stableModelCode = existing.modelCode ?? existing.modelName
    delete MOCK_PRODUCTS_BY_MODEL[oldKey]
    MOCK_PRODUCTS_BY_MODEL[nextModelName] = {
      ...existing,
      modelName: nextModelName,
      productName: nextName,
      categoryId: String(body['categoryId'] ?? existing.categoryId ?? 'cat-home'),
      description: (body['description'] as string | null | undefined) ?? existing.description ?? null,
      goods: isMaterial ? false : body['goodsType'] == null ? existing.goods : String(body['goodsType']) !== 'NON_GOODS',
      productType: isMaterial ? 'SINGLE' : productType,
      modelCode: stableModelCode,
      productCategory,
    }
    if ('specs' in body) {
      mockProductSpecsByModel = {
        ...mockProductSpecsByModel,
        [nextModelName]: mockProductSpecsFromBody(nextModelName, body['specs']),
      }
    }
    MOCK_PRODUCT_CATALOG_ROWS = MOCK_PRODUCT_CATALOG_ROWS.map((row) => {
      if (row.modelCode !== stableModelCode) return row
      const usageScope = isMaterial
        ? 'NONE'
        : String(body['usageScope'] ?? row.usageScope)
      const estimateCategories =
        usageScope === 'ESTIMATE' || usageScope === 'BOTH'
          ? ('estimateCategories' in body
              ? normalizeMockExposures({
                  estimateCategories: body['estimateCategories'],
                  displayOrder: row.displayOrder,
                })
              : row.estimateCategories)
          : []
      return deriveLegacyExposureFields({
        ...row,
        modelCode: stableModelCode,
        name: nextName,
        productCategory,
        usageScope,
        estimateCategories,
        productType: isMaterial ? 'SINGLE' : productType,
        releasePrice: body['releasePrice'] == null ? row.releasePrice : Number(body['releasePrice']),
        deliveryPrice: body['deliveryPrice'] == null ? row.deliveryPrice : Number(body['deliveryPrice']),
      })
    })
    return envelope({
      id: productId,
      name: nextName,
      modelName: nextModelName,
      modelCode: stableModelCode,
      categoryId: String(body['categoryId'] ?? existing.categoryId ?? 'cat-home'),
      categoryName: '홈멀티',
      sellingPrice: existing.sellingPrice,
      purchasePrice: existing.purchasePrice ?? '0',
      currency: 'KRW',
      tags: {},
      description: (body['description'] as string | null | undefined) ?? existing.description ?? null,
      productCategory,
      itemKind,
      unit: isMaterial ? 'EA' : ((body['unit'] as string | null | undefined) ?? 'EA'),
      goodsType: isMaterial ? 'NON_GOODS' : String(body['goodsType'] ?? (existing.goods === false ? 'NON_GOODS' : 'GOODS')),
      specs: mockProductSpecsByModel[nextModelName] ?? [],
    })
  }

  const productSpecReorderMatch = url.match(/\/api\/v1\/products\/([^/?]+)\/specs\/reorder(?:\?.*)?$/)
  if (method === 'PATCH' && productSpecReorderMatch) {
    const denied = mockRequirePermission('products.admin', 'update')
    if (denied) return denied
    parseMockBody(config)
    return envelope(null)
  }

  // PATCH /api/v1/products/{modelCode}/variable-discount — 변동DC 수동 override 설정.
  // DELETE /api/v1/products/{modelCode}/variable-discount — 시트 자동 복귀(variableDiscountManual=false).
  // BE 계약: PATCH 는 bare ProductCatalogResponse, DELETE 는 204 무본문(non-null marker 반환).
  const productVariableDiscountMatch = url.match(/\/api\/v1\/products\/([^/?]+)\/variable-discount(?:\?.*)?$/)
  if (productVariableDiscountMatch) {
    const denied = mockRequirePermission('products.admin', 'update')
    if (denied) return denied
    ensureMockProductCatalogRowsSeeded()
    const modelCode = decodeURIComponent(productVariableDiscountMatch[1]!)
    const idx = MOCK_PRODUCT_CATALOG_ROWS.findIndex((row) => row.modelCode === modelCode)
    if (idx < 0) {
      return mockError(404, 'NOT_FOUND', '제품을 찾을 수 없습니다')
    }
    const existing = MOCK_PRODUCT_CATALOG_ROWS[idx]!

    if (method === 'PATCH') {
      const body = parseMockBody(config)
      const updated = {
        ...existing,
        hasVariableDiscount: Boolean(body['hasVariableDiscount']),
        variableDiscountManual: true,
      }
      MOCK_PRODUCT_CATALOG_ROWS = MOCK_PRODUCT_CATALOG_ROWS.map((row, i) =>
        i === idx ? updated : row,
      )
      return updated
    }

    if (method === 'DELETE') {
      const updated = {
        ...existing,
        variableDiscountManual: false,
      }
      MOCK_PRODUCT_CATALOG_ROWS = MOCK_PRODUCT_CATALOG_ROWS.map((row, i) =>
        i === idx ? updated : row,
      )
      return { __mockStatus: 204, body: null }
    }

    return mockError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 변동DC 요청입니다.')
  }

  const productSpecItemMatch = url.match(/\/api\/v1\/products\/([^/?]+)\/specs\/([^/?]+)(?:\?.*)?$/)
  if (productSpecItemMatch) {
    const modelCode = decodeURIComponent(productSpecItemMatch[1]!)
    const specId = decodeURIComponent(productSpecItemMatch[2]!)
    if (method === 'PATCH') {
      const denied = mockRequirePermission('products.admin', 'update')
      if (denied) return denied
      const body = parseMockBody(config)
      const specs = mockProductSpecsByModel[modelCode] ?? []
      const current = specs.find((spec) => spec.id === specId) ?? {
        id: specId,
        specKey: '냉방능력, kW',
        specValue: null,
        unit: null,
        displayOrder: 1,
      }
      const edited = {
        ...current,
        specValue: (body['specValue'] as string | null | undefined) ?? current.specValue,
        unit: (body['unit'] as string | null | undefined) ?? current.unit,
      }
      mockProductSpecsByModel = {
        ...mockProductSpecsByModel,
        [modelCode]: specs.map((spec) => spec.id === specId ? edited : spec),
      }
      return edited
    }
    if (method === 'DELETE') {
      const denied = mockRequirePermission('products.admin', 'delete')
      if (denied) return denied
      const specs = mockProductSpecsByModel[modelCode] ?? []
      mockProductSpecsByModel = {
        ...mockProductSpecsByModel,
        [modelCode]: specs.filter((spec) => spec.id !== specId),
      }
      return envelope(null)
    }
  }

  const productSpecsMatch = url.match(/\/api\/v1\/products\/([^/?]+)\/specs(?:\?.*)?$/)
  if (productSpecsMatch) {
    const modelCode = decodeURIComponent(productSpecsMatch[1]!)
    if (method === 'GET') {
      const denied = mockRequirePermission('products.list', 'view')
      if (denied) return denied
      return mockProductSpecsByModel[modelCode] ?? []
    }
    if (method === 'POST') {
      const denied = mockRequirePermission('products.admin', 'create')
      if (denied) return denied
      const body = parseMockBody(config)
      const specs = mockProductSpecsByModel[modelCode] ?? []
      const created = {
        id: `spec-${Date.now()}`,
        specKey: String(body['specKey'] ?? '스펙'),
        specValue: (body['specValue'] as string | null | undefined) ?? '',
        unit: (body['unit'] as string | null | undefined) ?? null,
        displayOrder: Number(body['displayOrder'] ?? specs.length + 1),
      }
      mockProductSpecsByModel = {
        ...mockProductSpecsByModel,
        [modelCode]: [...specs, created],
      }
      return created
    }
  }

  const specTemplateApplyMatch = url.match(/\/api\/v1\/spec-key-templates\/([^/?]+)\/apply-to-existing(?:\?.*)?$/)
  if (method === 'POST' && specTemplateApplyMatch) {
    const denied = mockRequirePermission('products.admin', 'create')
    if (denied) return denied
    const template = MOCK_SPEC_KEY_TEMPLATES.find((row) => row.id === decodeURIComponent(specTemplateApplyMatch[1]!))
      ?? MOCK_SPEC_KEY_TEMPLATES[0]!
    return {
      specKey: template.specKey,
      estimateCategory: template.estimateCategory,
      previewModelCodes: MOCK_PRODUCT_CATALOG_ROWS.map((row) => row.modelCode),
      actuallyAdded: 0,
      dryRun: true,
    }
  }

  if (method === 'GET' && url.includes('/api/v1/spec-key-templates')) {
    const denied = mockRequirePermission('products.list', 'view')
    if (denied) return denied
    const urlObj = new URL(url.startsWith('http') ? url : `http://mock${url}`)
    const category = (config.params?.['category'] as string | undefined)
      ?? urlObj.searchParams.get('category')
    return category
      ? MOCK_SPEC_KEY_TEMPLATES.filter((row) => row.estimateCategory === category)
      : MOCK_SPEC_KEY_TEMPLATES
  }

  // GET /api/v1/products — 품목 카탈로그 목록 (품목관리 화면 + 기존 estimate 소비처 공용)
  // usageScope/category/q 필터 + usageScopeManual/displayOrder 응답 포함 (PR-B 확장)
  // note: 경로 규칙상 /api/v1/products/{modelCode}/usage 패턴이 먼저 매칭되어야 하므로
  //       이 핸들러는 그 아래 위치함 (#459 mock 핸들러 선점 회귀 교훈)
  if (method === 'GET' && (url.endsWith('/api/v1/products') || url.includes('/api/v1/products?'))) {
    const denied = mockRequirePermission('products.list', 'view')
    if (denied) return denied
    ensureMockProductCatalogRowsSeeded()
    const urlObj = new URL(url.startsWith('http') ? url : `http://mock${url}`)
    const q = ((config.params?.['q'] as string | undefined) ?? urlObj.searchParams.get('q') ?? '').toLowerCase()
    const usageScope = (config.params?.['usageScope'] as string | undefined)
      ?? urlObj.searchParams.get('usageScope')
    const category = (config.params?.['category'] as string | undefined)
      ?? urlObj.searchParams.get('category')
    // usageScope IN-확장 시멘틱 (BE 계약 동형, PR-B 사이클1):
    //   PARTNER_ORDER → PARTNER_ORDER | BOTH
    //   ESTIMATE      → ESTIMATE | BOTH
    //   BOTH          → BOTH 만
    //   NONE          → NONE 만
    //   미지정         → 전체
    // note: 검색(q) 동작 단언 TC 는 이 mock q 필터 기반임 (BE q 파라미터는 BE 측에서 실효화)
    function matchesUsageScope(rowScope: string, filter: string): boolean {
      if (filter === 'PARTNER_ORDER') return rowScope === 'PARTNER_ORDER' || rowScope === 'BOTH'
      if (filter === 'ESTIMATE') return rowScope === 'ESTIMATE' || rowScope === 'BOTH'
      return rowScope === filter
    }
    const filtered = MOCK_PRODUCT_CATALOG_ROWS.filter((row) =>
      (!q || row.modelCode.toLowerCase().includes(q) || row.name.toLowerCase().includes(q))
      && (!usageScope || matchesUsageScope(row.usageScope, usageScope))
      && (!category || exposureForCategory(row, category) != null),
    )
    // [#9] BE 정렬 동형 — displayOrder asc(null=맨뒤), 동률 시 modelCode 사전순.
    //   순서 저장(PUT /display-orders) 후 displayOrder 가 갱신되면 재조회 시 그 순서로 보여야
    //   가시 반영이 일치한다(기존: 시드 순서 전량 반환 → 영구 불일치).
    filtered.sort(
      (a, b) => {
        const aOrder = category
          ? exposureForCategory(a, category)?.displayOrder
          : a.displayOrder
        const bOrder = category
          ? exposureForCategory(b, category)?.displayOrder
          : b.displayOrder
        return (aOrder ?? Infinity) - (bOrder ?? Infinity)
          || a.modelCode.localeCompare(b.modelCode)
      },
    )
    // [#9] BE 페이지 슬라이싱 동형 — page/size slice + totalPages 계산(기존: 전량+totalPages=1).
    const page = Number(config.params?.['page'] ?? urlObj.searchParams.get('page') ?? 0)
    const size = Number(config.params?.['size'] ?? urlObj.searchParams.get('size') ?? 50)
    const totalElements = filtered.length
    const totalPages = size > 0 ? Math.max(1, Math.ceil(totalElements / size)) : 1
    const start = page * size
    const content = filtered.slice(start, start + size)
    return {
      content,
      totalElements,
      totalPages,
      number: page,
      size,
      first: page === 0,
      last: page >= totalPages - 1,
    }
  }

  // GET /api/products/by-model/{modelName} — ProductFormPage edit 초기값 조회
  const productByModelMatch = url.match(/\/api\/products\/by-model\/([^/?]+)(?:\?.*)?$/)
  if (method === 'GET' && productByModelMatch) {
    const denied = mockRequirePermission('products.list', 'view')
    if (denied) return denied
    const modelName = decodeURIComponent(productByModelMatch[1] ?? '')
    const found = MOCK_PRODUCTS_BY_MODEL[modelName]
      ?? Object.values(MOCK_PRODUCTS_BY_MODEL).find((p) => (p.modelCode ?? p.modelName) === modelName)
    if (!found) {
      return mockError(404, 'NOT_FOUND', '모델명에 해당하는 제품이 없습니다')
    }
    const visibleModelCode = found.modelCode ?? found.modelName
    const catalogRow = MOCK_PRODUCT_CATALOG_ROWS.find((row) => row.modelCode === visibleModelCode)
    const productCategory = found.productCategory ?? catalogRow?.productCategory ?? null
    const isMaterial = productCategory === 'MATERIAL'
    return envelope({
      id: found.productId,
      name: found.productName,
      modelName: found.modelName,
      modelCode: visibleModelCode,
      categoryId: found.categoryId ?? 'cat-home',
      categoryName: '홈멀티',
      sellingPrice: found.sellingPrice,
      purchasePrice: found.purchasePrice ?? '0',
      currency: 'KRW',
      tags: {},
      description: found.description ?? null,
      productCategory,
      itemKind: found.productType === 'BUNDLE' ? 'SET' : 'GENERAL',
      unit: isMaterial ? 'EA' : 'EA',
      goodsType: isMaterial ? 'NON_GOODS' : (found.goods === false ? 'NON_GOODS' : 'GOODS'),
      specs: mockProductSpecsByModel[visibleModelCode] ?? mockProductSpecsByModel[found.modelName] ?? [],
    })
  }

  // GET /api/products?q=... — AC-2 품목 자동완성 검색 (product-service `/products?q=` 프록시)
  if (method === 'GET' && (url.endsWith('/api/products') || url.includes('/api/products?'))) {
    const q = String(config.params?.['q'] ?? '').toLowerCase()
    const usageScope = config.params?.['usageScope'] == null ? null : String(config.params['usageScope'])
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
      content: matched
        .filter((p) => {
          if (!usageScope) return true
          const modelCode = p.modelCode ?? p.modelName
          const rowScope = MOCK_PRODUCT_CATALOG_ROWS.find((row) => row.modelCode === modelCode)?.usageScope
          if (usageScope === 'PARTNER_ORDER') return rowScope === 'PARTNER_ORDER' || rowScope === 'BOTH'
          if (usageScope === 'ESTIMATE') return rowScope === 'ESTIMATE' || rowScope === 'BOTH'
          return rowScope === usageScope
        })
        .map((p) => ({
        id: p.productId,
        name: p.productName,
        modelName: p.modelName,
        productCode: null,
        categoryId: p.categoryId ?? 'cat-home',
        sellingPrice: p.sellingPrice,
        status: 'ACTIVE',
        goods: p.goods ?? true,
        modelCode: p.modelCode ?? p.modelName,
        productType: p.productType ?? 'SINGLE',
      })),
      totalElements: matched.length,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }

  if (method === 'GET' && url.includes('/api/v1/material-prices')) {
    const denied = mockRequirePermission('products.list', 'view')
    if (denied) return denied
    return MOCK_MATERIAL_PRICE_ROWS
  }

  if (method === 'GET' && url.includes('/api/v1/odu-recommendations')) {
    const denied = mockRequirePermission('products.list', 'view')
    if (denied) return denied
    const urlObj = new URL(url.startsWith('http') ? url : `http://mock${url}`)
    const type = (config.params?.['type'] as string | undefined)
      ?? urlObj.searchParams.get('type')
    const oduRows = type
      ? MOCK_ODU_RECOMMENDATION_ROWS.filter((row) => row.recommendationType === type)
      : MOCK_ODU_RECOMMENDATION_ROWS
    return oduRows
  }

  if (method === 'GET' && url.includes('/api/v1/branch-pipes')) {
    const denied = mockRequirePermission('products.list', 'view')
    if (denied) return denied
    const urlObj = new URL(url.startsWith('http') ? url : `http://mock${url}`)
    const branchCode = (config.params?.['branchCode'] as string | undefined)
      ?? urlObj.searchParams.get('branchCode')
    const branchRows = branchCode
      ? MOCK_BRANCH_PIPE_ROWS.filter((row) => row.branchCode === branchCode)
      : MOCK_BRANCH_PIPE_ROWS
    return branchRows
  }

  // GET /slips/lookup-product?modelName=...
  if (method === 'GET' && url.includes('/slips/lookup-product')) {
    const modelName = (config.params?.['modelName'] ?? '') as string
    const found = MOCK_PRODUCTS_BY_MODEL[modelName.toUpperCase()]
      ?? MOCK_PRODUCTS_BY_MODEL[modelName]
    if (found) {
      return envelope({
        ...found,
        modelCode: found.modelCode ?? found.modelName,
        productType: found.productType ?? 'SINGLE',
      })
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
    const body = parseMockBody(config) as {
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
  // §7: slip collab-core mock (comments + direct edits)
  // - 화면 노출 = authorName/proposerName/decidedByName (UUID 비공개 가드)
  // ==========================================================================
  type MockSlipCollabComment = {
    id: string
    anchor: string | null
    authorName: string
    body: string
    parentId: string | null
    status: 'OPEN' | 'RESOLVED'
    createdAt: string
  }
  type MockSlipCollabEdit = {
    id: string
    changeSet: string
    reason: string | null
    proposerName: string
    status: 'ACCEPTED'
    decidedByName: string | null
    decidedAt: string | null
    createdAt: string
  }
  const gc = globalThis as unknown as {
    __SAMHAN_MOCK_SLIP_COLLAB_COMMENTS?: Record<string, MockSlipCollabComment[]>
    __SAMHAN_MOCK_SLIP_COLLAB_SUGGESTIONS?: Record<string, MockSlipCollabEdit[]>
  }
  if (!gc.__SAMHAN_MOCK_SLIP_COLLAB_COMMENTS) gc.__SAMHAN_MOCK_SLIP_COLLAB_COMMENTS = {}
  if (!gc.__SAMHAN_MOCK_SLIP_COLLAB_SUGGESTIONS) gc.__SAMHAN_MOCK_SLIP_COLLAB_SUGGESTIONS = {}
  const collabCommentsStore = gc.__SAMHAN_MOCK_SLIP_COLLAB_COMMENTS
  const collabSuggestionsStore = gc.__SAMHAN_MOCK_SLIP_COLLAB_SUGGESTIONS

  const collabCommentCollectionMatch = url.match(/\/slips\/([^/?]+)\/collab\/comments(?:\?.*)?$/)
  if (collabCommentCollectionMatch) {
    const slipId = collabCommentCollectionMatch[1]!
    if (method === 'GET') {
      // FE 호출부(slipCollab.ts getSlipCollabComments)는 limit 을 axios `params` 로 전달하므로
      // config.params 우선 — URL querystring 만 읽으면 dead 파싱 (compensation-failures 7195행 패턴).
      const params = config.params as Record<string, unknown> | undefined
      const urlLimit = new URLSearchParams(url.split('?')[1] ?? '').get('limit')
      const rawLimit = Number.parseInt(String(params?.['limit'] ?? urlLimit ?? '20'), 10)
      const safeLimit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 100)) : 20
      return envelope([...(collabCommentsStore[slipId] ?? [])].slice(0, safeLimit))
    }
    if (method === 'POST') {
      const body = parseMockBody(config)
      const created: MockSlipCollabComment = {
        id: `mock-slip-collab-comment-${Date.now()}`,
        anchor: (body['anchor'] as string | null | undefined) ?? null,
        authorName: MOCK_AUTH.fullName,
        body: String(body['body'] ?? ''),
        parentId: (body['parentId'] as string | null | undefined) ?? null,
        status: 'OPEN',
        createdAt: new Date().toISOString(),
      }
      collabCommentsStore[slipId] = [created, ...(collabCommentsStore[slipId] ?? [])]
      return envelope(created)
    }
  }

  const collabCommentItemMatch = url.match(/\/slips\/([^/?]+)\/collab\/comments\/([^/?]+)(?:\/(resolve))?(?:\?.*)?$/)
  if (collabCommentItemMatch) {
    const slipId = collabCommentItemMatch[1]!
    const commentId = collabCommentItemMatch[2]!
    const action = collabCommentItemMatch[3]
    const list = collabCommentsStore[slipId] ?? []
    const target = list.find((item) => item.id === commentId)
    if (method === 'POST' && action === 'resolve') {
      // BE CollabCommentService.resolve — 대상 부재 시 NOT_FOUND. target 없을 때 fallthrough
      // 하면 미매칭 블랭크(null envelope)로 위장되므로 404 명시 ([[inprocess-mock-principles]]).
      if (!target) return mockError(404, 'NOT_FOUND', '댓글을 찾을 수 없습니다')
      target.status = 'RESOLVED'
      return envelope(target)
    }
    if (method === 'DELETE') {
      // BE CollabCommentService.softDelete 와 동일 메시지 ("댓글을 찾을 수 없습니다").
      if (!target) return mockError(404, 'NOT_FOUND', '댓글을 찾을 수 없습니다')
      collabCommentsStore[slipId] = list.filter((item) => item.id !== commentId)
      return envelope({ deleted: true })
    }
  }

  const collabEditCollectionMatch = url.match(/\/slips\/([^/?]+)\/collab\/edits(?:\?.*)?$/)
  if (collabEditCollectionMatch) {
    const slipId = collabEditCollectionMatch[1]!
    if (method === 'GET') return envelope([...(collabSuggestionsStore[slipId] ?? [])])
    if (method === 'POST') {
      const body = parseMockBody(config)
      const created: MockSlipCollabEdit = {
        id: `mock-slip-collab-edit-${Date.now()}`,
        changeSet: String(body['changeSet'] ?? '{}'),
        reason: (body['reason'] as string | null | undefined) ?? null,
        proposerName: MOCK_AUTH.fullName,
        status: 'ACCEPTED',
        decidedByName: MOCK_AUTH.fullName,
        decidedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      collabSuggestionsStore[slipId] = [created, ...(collabSuggestionsStore[slipId] ?? [])]
      const slip = MOCK_SLIPS.find((s) => s.id === slipId) as Record<string, unknown> | undefined
      if (slip) {
        try {
          const parsed = JSON.parse(created.changeSet) as Record<string, { after?: unknown }>
          for (const [field, change] of Object.entries(parsed)) {
            slip[field] = change.after ?? null
          }
        } catch {
          return mockError(400, 'INVALID_INPUT', 'changeSet JSON 형식이 올바르지 않습니다')
        }
      }
      if (!slip) return mockError(404, 'NOT_FOUND', '전표를 찾을 수 없습니다')
      return envelope({ edit: created, slip })
    }
  }

  // ---- slip presence store (globalThis — 공용 MockPresenceEntry 타입 재사용) ----
  const gp = globalThis as unknown as {
    __SAMHAN_MOCK_SLIP_PRESENCE?: Record<string, MockPresenceEntry[]>
  }
  if (!gp.__SAMHAN_MOCK_SLIP_PRESENCE) gp.__SAMHAN_MOCK_SLIP_PRESENCE = {}
  const slipPresenceStore = gp.__SAMHAN_MOCK_SLIP_PRESENCE

  const presenceActionMatch = url.match(/\/api\/v1\/slips\/([^/?]+)\/collab\/presence\/(join|leave)(?:\?.*)?$/)
  if (presenceActionMatch && method === 'POST') {
    // Presence mock 은 미매칭 시 실 HTTP 로 fallthrough 되면 401 리다이렉트가 발생한다.
    // [[inprocess-mock-principles]]: Void 도 envelope(null) 객체로 반환해 non-null 계약을 지킨다.
    const slipId = presenceActionMatch[1]!
    const action = presenceActionMatch[2]!
    const body = parseMockBody(config)
    const rawSessionId = typeof body['sessionId'] === 'string' ? body['sessionId'].trim() : ''
    const rawDisplayName = typeof body['displayName'] === 'string' ? body['displayName'].trim() : ''
    const sessionId = rawSessionId || `mock-presence-${Date.now()}`
    if (action === 'leave') {
      slipPresenceStore[slipId] = (slipPresenceStore[slipId] ?? [])
        .filter((entry) => entry.sessionId !== sessionId)
      return envelope(null)
    }

    const displayName = rawDisplayName || MOCK_AUTH.fullName
    const colorSeed = readMockHeader(config, 'X-User-Id') || sessionId
    const entry: MockPresenceEntry = {
      sessionId,
      displayName,
      color: colorForPresence(colorSeed),
    }
    slipPresenceStore[slipId] = [
      ...(slipPresenceStore[slipId] ?? []).filter((item) => item.sessionId !== sessionId),
      entry,
    ]
    return envelope(entry)
  }

  const presenceListMatch = url.match(/\/api\/v1\/slips\/([^/?]+)\/collab\/presence(?:\?.*)?$/)
  if (presenceListMatch && method === 'GET') {
    const slipId = presenceListMatch[1]!
    return envelope([...(slipPresenceStore[slipId] ?? [])])
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

  // ---- estimate collab (stream + comments + edits + presence) ----
  // /slips/estimates/{id}/collab/* — slip list 가드(`url.includes('/slips')`) 보다 앞서 처리.
  {
    const gecStore = globalThis as unknown as {
      __SAMHAN_MOCK_ESTIMATE_COLLAB_COMMENTS?: Record<string, Array<{
        id: string; anchor: string | null; authorName: string; body: string
        parentId: string | null; status: 'OPEN' | 'RESOLVED'; createdAt: string
      }>>
      __SAMHAN_MOCK_ESTIMATE_COLLAB_EDITS?: Record<string, Array<{
        id: string; changeSet: string; reason: string | null; proposerName: string
        status: 'ACCEPTED'; decidedByName: string | null; decidedAt: string | null; createdAt: string
      }>>
      __SAMHAN_MOCK_ESTIMATE_PRESENCE?: Record<string, MockPresenceEntry[]>
    }
    if (!gecStore.__SAMHAN_MOCK_ESTIMATE_COLLAB_COMMENTS) gecStore.__SAMHAN_MOCK_ESTIMATE_COLLAB_COMMENTS = {}
    if (!gecStore.__SAMHAN_MOCK_ESTIMATE_COLLAB_EDITS) gecStore.__SAMHAN_MOCK_ESTIMATE_COLLAB_EDITS = {}
    if (!gecStore.__SAMHAN_MOCK_ESTIMATE_PRESENCE) gecStore.__SAMHAN_MOCK_ESTIMATE_PRESENCE = {}
    const estimateCommentsStore = gecStore.__SAMHAN_MOCK_ESTIMATE_COLLAB_COMMENTS
    const estimateEditsStore = gecStore.__SAMHAN_MOCK_ESTIMATE_COLLAB_EDITS
    const estimatePresenceStore = gecStore.__SAMHAN_MOCK_ESTIMATE_PRESENCE

    const estimateCollabStreamMatch = url.match(/\/slips\/estimates\/([^/?]+)\/collab\/stream(?:\?.*)?$/)
    if (method === 'GET' && estimateCollabStreamMatch) {
      return new Blob([': mock estimate collab stream\n\n'], { type: 'text/event-stream;charset=utf-8' })
    }

    const estimatePresenceActionMatch = url.match(/\/slips\/estimates\/([^/?]+)\/collab\/presence\/(join|leave)(?:\?.*)?$/)
    if (estimatePresenceActionMatch && method === 'POST') {
      const estimateId = estimatePresenceActionMatch[1]!
      const action = estimatePresenceActionMatch[2]!
      const body = parseMockBody(config)
      const rawSessionId = typeof body['sessionId'] === 'string' ? body['sessionId'].trim() : ''
      const rawDisplayName = typeof body['displayName'] === 'string' ? body['displayName'].trim() : ''
      const sessionId = rawSessionId || `mock-presence-${Date.now()}`
      if (action === 'leave') {
        estimatePresenceStore[estimateId] = (estimatePresenceStore[estimateId] ?? [])
          .filter((entry) => entry.sessionId !== sessionId)
        return envelope(null)
      }
      const displayName = rawDisplayName || MOCK_AUTH.fullName
      const colorSeed = readMockHeader(config, 'X-User-Id') || sessionId
      const entry: MockPresenceEntry = { sessionId, displayName, color: colorForPresence(colorSeed) }
      estimatePresenceStore[estimateId] = [
        ...(estimatePresenceStore[estimateId] ?? []).filter((item) => item.sessionId !== sessionId),
        entry,
      ]
      return envelope(entry)
    }

    const estimatePresenceListMatch = url.match(/\/slips\/estimates\/([^/?]+)\/collab\/presence(?:\?.*)?$/)
    if (estimatePresenceListMatch && method === 'GET') {
      const estimateId = estimatePresenceListMatch[1]!
      return envelope([...(estimatePresenceStore[estimateId] ?? [])])
    }

    const estimateCollabCommentCollectionMatch = url.match(/\/slips\/estimates\/([^/?]+)\/collab\/comments(?:\?.*)?$/)
    if (estimateCollabCommentCollectionMatch) {
      const estimateId = estimateCollabCommentCollectionMatch[1]!
      if (method === 'GET') {
        return envelope([...(estimateCommentsStore[estimateId] ?? [])])
      }
      if (method === 'POST') {
        const body = parseMockBody(config)
        const created = {
          id: `mock-estimate-collab-comment-${Date.now()}`,
          anchor: (body['anchor'] as string | null | undefined) ?? null,
          authorName: MOCK_AUTH.fullName,
          body: String(body['body'] ?? ''),
          parentId: (body['parentId'] as string | null | undefined) ?? null,
          status: 'OPEN' as const,
          createdAt: new Date().toISOString(),
        }
        estimateCommentsStore[estimateId] = [created, ...(estimateCommentsStore[estimateId] ?? [])]
        return envelope(created)
      }
    }

    const estimateCollabCommentItemMatch = url.match(/\/slips\/estimates\/([^/?]+)\/collab\/comments\/([^/?]+)(?:\/(resolve))?(?:\?.*)?$/)
    if (estimateCollabCommentItemMatch) {
      const estimateId = estimateCollabCommentItemMatch[1]!
      const commentId = estimateCollabCommentItemMatch[2]!
      const action = estimateCollabCommentItemMatch[3]
      const list = estimateCommentsStore[estimateId] ?? []
      const target = list.find((item) => item.id === commentId)
      if (method === 'POST' && action === 'resolve') {
        if (!target) return mockError(404, 'NOT_FOUND', '코멘트를 찾을 수 없습니다')
        target.status = 'RESOLVED'
        return envelope(target)
      }
      if (method === 'DELETE') {
        estimateCommentsStore[estimateId] = list.filter((item) => item.id !== commentId)
        return envelope(null)
      }
    }

    const estimateCollabEditCollectionMatch = url.match(/\/slips\/estimates\/([^/?]+)\/collab\/edits(?:\?.*)?$/)
    if (estimateCollabEditCollectionMatch) {
      const estimateId = estimateCollabEditCollectionMatch[1]!
      if (method === 'GET') return envelope([...(estimateEditsStore[estimateId] ?? [])])
      if (method === 'POST') {
        const body = parseMockBody(config) as { changeSet?: string; reason?: string }
        const changeSet = String(body.changeSet ?? '{}')
        const created = {
          id: `mock-estimate-collab-edit-${Date.now()}`,
          changeSet,
          reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
          proposerName: MOCK_AUTH.fullName,
          status: 'ACCEPTED' as const,
          decidedByName: MOCK_AUTH.fullName,
          decidedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }
        // 커밋된 편집을 가변 상세에 실제 반영 — memo/validUntil/line.{n}.note 만 (false-green fix)
        let parsed: Record<string, { after?: unknown }>
        try {
          const value = JSON.parse(changeSet)
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return mockError(400, 'INVALID_INPUT', 'changeSet JSON 형식이 올바르지 않습니다')
          }
          parsed = value as Record<string, { after?: unknown }>
        } catch {
          return mockError(400, 'INVALID_INPUT', 'changeSet JSON 형식이 올바르지 않습니다')
        }
        const entries = Object.entries(parsed)
        if (entries.length === 0) {
          return mockError(400, 'INVALID_INPUT', 'changeSet에 적용할 필드가 없습니다')
        }
        const estimate = getMutableEstimateDetail(estimateId)
        for (const [rawPath, change] of entries) {
          const fieldPath = normalizeEstimateEditPath(rawPath)
          if (!fieldPath || !change || typeof change !== 'object' || Array.isArray(change) || !('after' in change)) {
            return mockError(400, 'INVALID_INPUT', '견적 협업은 memo, validUntil, line.{lineKey}.note 만 수정할 수 있습니다')
          }
          const after = change.after == null ? null : String(change.after)
          if (fieldPath === 'memo') {
            estimate.memo = after
          } else if (fieldPath === 'validUntil') {
            estimate.validUntil = after
          } else {
            const lineKey = Number.parseInt(fieldPath.match(/^line\.(\d+)\.note$/)![1]!, 10)
            const line = estimate.lines[lineKey - 1]
            if (!line) return mockError(400, 'INVALID_INPUT', `견적 라인 lineKey 범위가 올바르지 않습니다: ${lineKey}`)
            line.note = after
          }
        }
        estimate.version += 1
        estimateEditsStore[estimateId] = [created, ...(estimateEditsStore[estimateId] ?? [])]
        return envelope({ edit: created, estimate })
      }
    }
  }

  // GET /api/v1/slips/estimates/{id} (단건 상세) — EstimateDetail shape. 협업 edit 반영 가변 상세.
  const estimateSlipsDetailMatch = url.match(/\/slips\/estimates\/([^/?]+)$/)
  if (method === 'GET' && estimateSlipsDetailMatch && !url.includes('/print')) {
    const id = estimateSlipsDetailMatch[1]!
    return envelope(getMutableEstimateDetail(id))
  }

  // PATCH /api/v1/slips/{slipId}/audit/overlay — 단일 필드 수정 + audit row INSERT
  const auditOverlayMatch = url.match(/\/slips\/([^/?]+)\/audit\/overlay$/)
  if (method === 'PATCH' && auditOverlayMatch) {
    const slipId = auditOverlayMatch[1]!
    const body = parseMockBody(config) as {
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

  // GET /admin/slips/search?q=... — 그룹웨어 결재 전표 참조 자동완성.
  if (method === 'GET' && /\/(?:admin\/)?slips\/search(?:\?|$)/.test(url)) {
    const params = new URLSearchParams(url.split('?')[1] ?? '')
    const q = (params.get('q') ?? '').trim().toLowerCase()
    const slipType = params.get('slipType')
    const rawLimit = Number(params.get('limit') ?? '10')
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1), 20)
    const rows = !q
      ? []
      : [...MOCK_SLIPS]
        .filter((slip) => {
          const typeMatched = slipType === 'OUTBOUND' || slipType === 'INBOUND'
            ? slip.slipType === slipType
            : true
          const keywordMatched = String(slip.slipNo).toLowerCase().includes(q)
            || String(slip.partnerName ?? '').toLowerCase().includes(q)
          return typeMatched && keywordMatched
        })
        .sort((a, b) => {
          const dateCompare = String(b.slipDate).localeCompare(String(a.slipDate))
          if (dateCompare !== 0) return dateCompare
          return Number(b.seqNo ?? 0) - Number(a.seqNo ?? 0)
        })
        .slice(0, limit)
        .map((slip) => {
          const row = slip as Record<string, unknown>
          return {
            slipNo: slip.slipNo,
            slipType: slip.slipType,
            partnerName: slip.partnerName ?? null,
            totalAmount: row['totalAmount'] ?? Number(slip.seqNo ?? 1) * 100000,
            slipDate: slip.slipDate,
          }
        })
    return envelope(rows)
  }

  // GET /admin/accounting/*/search — 그룹웨어 결재 통합 문서 참조 자동완성.
  if (method === 'GET' && /\/admin\/accounting\/(?:journals|tax-invoices|statements|ledgers\/partners)\/search(?:\?|$)/.test(url)) {
    const params = new URLSearchParams(url.split('?')[1] ?? '')
    const q = (params.get('q') ?? '').trim().toLowerCase()
    const rawLimit = Number(params.get('limit') ?? '10')
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1), 20)
    const contains = (value: unknown) => String(value ?? '').toLowerCase().includes(q)
    if (!q) return envelope([])

    if (url.includes('/admin/accounting/journals/search')) {
      return envelope(
        MOCK_JOURNALS
          .filter((journal) => contains(journal.journalNo) || contains(journal.description))
          .sort((a, b) => String(b.journalDate).localeCompare(String(a.journalDate)))
          .slice(0, limit)
          .map((journal) => ({
            journalNo: journal.journalNo,
            journalDate: journal.journalDate,
            description: journal.description,
            totalAmount: journal.totalDebit,
          })),
      )
    }

    if (url.includes('/admin/accounting/tax-invoices/search')) {
      return envelope(
        MOCK_TAX_INVOICES
          .filter((invoice) => contains(invoice.taxInvoiceNo) || contains(invoice.partnerName))
          .sort((a, b) => String(b.supplyDate).localeCompare(String(a.supplyDate)))
          .slice(0, limit)
          .map((invoice) => ({
            taxInvoiceNo: invoice.taxInvoiceNo ?? invoice.description,
            date: invoice.supplyDate,
            partnerName: invoice.partnerName,
            amount: invoice.totalAmount,
          })),
      )
    }

    if (url.includes('/admin/accounting/statements/search')) {
      return envelope(
        MOCK_TAX_INVOICES
          .filter((invoice) => contains(invoice.taxInvoiceNo) || contains(invoice.partnerName))
          .sort((a, b) => String(b.supplyDate).localeCompare(String(a.supplyDate)))
          .slice(0, limit)
          .map((invoice) => ({
            statementNo: invoice.taxInvoiceNo ?? invoice.description,
            date: invoice.supplyDate,
            partnerName: invoice.partnerName,
            amount: invoice.totalAmount,
          })),
      )
    }

    const ledgerPartners = [
      ...MOCK_TAX_INVOICES.map((invoice) => ({
        partnerCode: invoice.partnerCode,
        partnerName: invoice.partnerName,
      })),
      { partnerCode: 'P-WILLY-001', partnerName: '주식회사 윌리' },
      { partnerCode: 'P-HANIL-002', partnerName: '한일빌딩' },
      { partnerCode: 'P-NAVER-003', partnerName: '네이버' },
    ]
    const unique = new Map<string, { partnerCode: string; partnerName: string }>()
    for (const partner of ledgerPartners) {
      if (!unique.has(partner.partnerCode)) unique.set(partner.partnerCode, partner)
    }
    return envelope(
      [...unique.values()]
        .filter((partner) => contains(partner.partnerCode) || contains(partner.partnerName))
        .slice(0, limit),
    )
  }

  // GET /slips/{id} (단건 상세) — UUID-like 또는 'slip-001' 패턴
  const slipDetailMatch = url.match(/\/slips\/([^/?]+)$/)
  if (method === 'GET' && slipDetailMatch && !url.includes('lookup-product') && !url.includes('/slips/edit-requests') && !url.match(/\/slips\/cleanup/) && !url.includes('compensation-failures')) {
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
    const body = parseMockBody(config) as {
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
  // mock 도 BE 와 동등하게 query param 으로 분리해 잘못된 전표 노출 방지.
  if (
    method === 'GET'
    && url.includes('/slips')
    && !url.includes('/slips/lookup-product')
    && !url.includes('/slips/estimates') // Phase 2.2: estimate path 는 위 estimate 블록이 처리
    && !url.includes('/slips/edit-requests')
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
  if (method === 'POST' && url.endsWith('/slips') && !url.includes('/vehicle-groups/')) {
    // parseMockBody — config.data 가 object/string 모두 안전 처리(직 JSON.parse 는 object 에서 throw,
    // [[inprocess-mock-principles]] 원칙①). 신규 전표 저장 mock QA 가 최초 적발한 잠복 버그.
    const reqBody = parseMockBody(config) as {
      partnerName?: string
      deliveryAddress?: string
      supervisionAddress?: string
      projectName?: string
      recipientPhone?: string
      paymentDueDate?: string
      slipType?: string
      deliveryTag?: string
      memo?: string
      lines?: unknown[]
    }
    // PR-3b: in-process mock 은 page.route 로 가로챌 수 없으므로([[inprocess-mock-principles]])
    // 마지막 전표 생성 요청 본문을 globalThis 에 노출 → Playwright page.evaluate 로 setOptions 단언.
    try {
      ;(globalThis as Record<string, unknown>)['__SAMHAN_LAST_SLIP_CREATE'] = reqBody
    } catch {
      /* noop */
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
      dispatcherFullName: null,
      inspectorFullName: null,
      acceptedByFullName: null,
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
      dispatcherFullName: null,
      inspectorFullName: null,
      acceptedByFullName: null,
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
    const body = parseMockBody(config) as {
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
     * (모델명/품목명은 BE 미포함 — FE `fetchProductBalancesMatrix` 가 선택 라인 메타로 결합.)
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

  // ==========================================================================
  // §7: journal collab-core mock (comments + direct edits)
  // - 화면 노출 = authorName/proposerName/decidedByName + journalNo/lineNo (UUID 비공개 가드)
  // - 일반 /accounting/journals/{id} 매칭보다 먼저 처리해야 /collab/* 경로를 빼앗기지 않는다.
  // ==========================================================================
  type MockJournalCollabComment = {
    id: string
    anchor: string | null
    authorName: string
    body: string
    parentId: string | null
    status: 'OPEN' | 'RESOLVED'
    createdAt: string
  }
  type MockJournalCollabEdit = {
    id: string
    changeSet: string
    reason: string | null
    proposerName: string
    status: 'ACCEPTED'
    decidedByName: string | null
    decidedAt: string | null
    createdAt: string
  }
  type MockJournalMutable = {
    id: string
    status: string
    description: string | null
    lines: Array<{
      lineNo: number
      memo: string | null
    }>
  }
  const gjc = globalThis as unknown as {
    __SAMHAN_MOCK_JOURNAL_COLLAB_COMMENTS?: Record<string, MockJournalCollabComment[]>
    __SAMHAN_MOCK_JOURNAL_COLLAB_SUGGESTIONS?: Record<string, MockJournalCollabEdit[]>
  }
  if (!gjc.__SAMHAN_MOCK_JOURNAL_COLLAB_COMMENTS) gjc.__SAMHAN_MOCK_JOURNAL_COLLAB_COMMENTS = {}
  if (!gjc.__SAMHAN_MOCK_JOURNAL_COLLAB_SUGGESTIONS) gjc.__SAMHAN_MOCK_JOURNAL_COLLAB_SUGGESTIONS = {}
  const journalCollabCommentsStore = gjc.__SAMHAN_MOCK_JOURNAL_COLLAB_COMMENTS
  const journalCollabSuggestionsStore = gjc.__SAMHAN_MOCK_JOURNAL_COLLAB_SUGGESTIONS

  const journalCollabStreamMatch = url.match(/\/accounting\/journals\/([^/?]+)\/collab\/stream(?:\?.*)?$/)
  if (method === 'GET' && journalCollabStreamMatch) {
    return new Blob([': mock journal collab stream\n\n'], { type: 'text/event-stream;charset=utf-8' })
  }

  const journalCollabCommentCollectionMatch = url.match(
    /\/accounting\/journals\/([^/?]+)\/collab\/comments(?:\?.*)?$/,
  )
  if (journalCollabCommentCollectionMatch) {
    const journalId = journalCollabCommentCollectionMatch[1]!
    if (method === 'GET') {
      const params = config.params as Record<string, unknown> | undefined
      const urlLimit = new URLSearchParams(url.split('?')[1] ?? '').get('limit')
      const rawLimit = Number.parseInt(String(params?.['limit'] ?? urlLimit ?? '20'), 10)
      const safeLimit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 100)) : 20
      return envelope([...(journalCollabCommentsStore[journalId] ?? [])].slice(0, safeLimit))
    }
    if (method === 'POST') {
      const body = parseMockBody(config)
      const created: MockJournalCollabComment = {
        id: `mock-journal-collab-comment-${Date.now()}`,
        anchor: (body['anchor'] as string | null | undefined) ?? null,
        authorName: MOCK_AUTH.fullName,
        body: String(body['body'] ?? ''),
        parentId: (body['parentId'] as string | null | undefined) ?? null,
        status: 'OPEN',
        createdAt: new Date().toISOString(),
      }
      journalCollabCommentsStore[journalId] = [created, ...(journalCollabCommentsStore[journalId] ?? [])]
      return envelope(created)
    }
  }

  const journalCollabCommentItemMatch = url.match(
    /\/accounting\/journals\/([^/?]+)\/collab\/comments\/([^/?]+)(?:\/(resolve))?(?:\?.*)?$/,
  )
  if (journalCollabCommentItemMatch) {
    const journalId = journalCollabCommentItemMatch[1]!
    const commentId = journalCollabCommentItemMatch[2]!
    const action = journalCollabCommentItemMatch[3]
    const list = journalCollabCommentsStore[journalId] ?? []
    const target = list.find((item) => item.id === commentId)
    if (method === 'POST' && action === 'resolve') {
      if (!target) return mockError(404, 'NOT_FOUND', '댓글을 찾을 수 없습니다')
      target.status = 'RESOLVED'
      return envelope(target)
    }
    if (method === 'DELETE') {
      if (!target) return mockError(404, 'NOT_FOUND', '댓글을 찾을 수 없습니다')
      journalCollabCommentsStore[journalId] = list.filter((item) => item.id !== commentId)
      return envelope({ deleted: true })
    }
  }

  const journalCollabEditCollectionMatch = url.match(
    /\/accounting\/journals\/([^/?]+)\/collab\/edits(?:\?.*)?$/,
  )
  if (journalCollabEditCollectionMatch) {
    const journalId = journalCollabEditCollectionMatch[1]!
    if (method === 'GET') return envelope([...(journalCollabSuggestionsStore[journalId] ?? [])])
    if (method === 'POST') {
      const journal = MOCK_JOURNALS.find((j) => j.id === journalId) as MockJournalMutable | undefined
      if (!journal) return mockError(404, 'NOT_FOUND', '분개를 찾을 수 없습니다')
      if (journal.status === 'REVERSED') return mockError(409, 'COLLAB_LOCKED', '역분개된 분개는 수정할 수 없습니다')

      const body = parseMockBody(config)
      const created: MockJournalCollabEdit = {
        id: `mock-journal-collab-edit-${Date.now()}`,
        changeSet: String(body['changeSet'] ?? '{}'),
        reason: (body['reason'] as string | null | undefined) ?? null,
        proposerName: MOCK_AUTH.fullName,
        status: 'ACCEPTED',
        decidedByName: MOCK_AUTH.fullName,
        decidedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }

      try {
        const parsed = JSON.parse(created.changeSet) as Record<string, { after?: unknown }>
        for (const [field, change] of Object.entries(parsed)) {
          if (field === 'description') {
            journal.description = change.after == null ? null : String(change.after)
            continue
          }
          const lineMemoMatch = field.match(/^line\.(\d+)\.memo$/)
          if (lineMemoMatch) {
            const lineNo = Number.parseInt(lineMemoMatch[1]!, 10)
            const line = journal.lines.find((item) => item.lineNo === lineNo)
            if (!line) return mockError(400, 'INVALID_INPUT', '라인 번호가 올바르지 않습니다')
            line.memo = change.after == null ? null : String(change.after)
            continue
          }
          return mockError(400, 'INVALID_INPUT', '수정 가능한 필드는 적요와 라인 메모뿐입니다')
        }
      } catch {
        return mockError(400, 'INVALID_INPUT', 'changeSet JSON 형식이 올바르지 않습니다')
      }

      journalCollabSuggestionsStore[journalId] = [created, ...(journalCollabSuggestionsStore[journalId] ?? [])]
      return envelope({ edit: created, journal })
    }
  }

  // ---- journal presence (join|leave POST + list GET) ----
  {
    const gjp = globalThis as unknown as {
      __SAMHAN_MOCK_JOURNAL_PRESENCE?: Record<string, MockPresenceEntry[]>
    }
    if (!gjp.__SAMHAN_MOCK_JOURNAL_PRESENCE) gjp.__SAMHAN_MOCK_JOURNAL_PRESENCE = {}
    const journalPresenceStore = gjp.__SAMHAN_MOCK_JOURNAL_PRESENCE

    const journalPresenceActionMatch = url.match(/\/accounting\/journals\/([^/?]+)\/collab\/presence\/(join|leave)(?:\?.*)?$/)
    if (journalPresenceActionMatch && method === 'POST') {
      const journalId = journalPresenceActionMatch[1]!
      const action = journalPresenceActionMatch[2]!
      const body = parseMockBody(config)
      const rawSessionId = typeof body['sessionId'] === 'string' ? body['sessionId'].trim() : ''
      const rawDisplayName = typeof body['displayName'] === 'string' ? body['displayName'].trim() : ''
      const sessionId = rawSessionId || `mock-presence-${Date.now()}`
      if (action === 'leave') {
        journalPresenceStore[journalId] = (journalPresenceStore[journalId] ?? [])
          .filter((entry) => entry.sessionId !== sessionId)
        return envelope(null)
      }
      const displayName = rawDisplayName || MOCK_AUTH.fullName
      const colorSeed = readMockHeader(config, 'X-User-Id') || sessionId
      const entry: MockPresenceEntry = { sessionId, displayName, color: colorForPresence(colorSeed) }
      journalPresenceStore[journalId] = [
        ...(journalPresenceStore[journalId] ?? []).filter((item) => item.sessionId !== sessionId),
        entry,
      ]
      return envelope(entry)
    }

    const journalPresenceListMatch = url.match(/\/accounting\/journals\/([^/?]+)\/collab\/presence(?:\?.*)?$/)
    if (journalPresenceListMatch && method === 'GET') {
      const journalId = journalPresenceListMatch[1]!
      return envelope([...(journalPresenceStore[journalId] ?? [])])
    }
  }

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
    const body = parseMockBody(config) as {
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
      journalNo: '2026/05/04-099',
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
    const body = parseMockBody(config) as {
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

  // GET /accounting/reports/trial-balance/summary?from=&to=&granularity= — 합계잔액시산표
  if (method === 'GET' && url.includes('/accounting/reports/trial-balance/summary')) {
    const fromDate = (config.params?.['from'] ?? '2026-05-01') as string
    const toDate = (config.params?.['to'] ?? '2026-05-31') as string
    const granularity = (config.params?.['granularity'] ?? 'MONTH') as string
    return envelope({
      ...MOCK_TRIAL_BALANCE_SUMMARY,
      fromDate,
      toDate,
      granularity,
    })
  }

  // ==========================================================================
  // P0-1 Slice A: 재무 보고서 mock endpoint
  // ==========================================================================

  // GET /accounting/reports/income-statement/monthly?year=YYYY — 월별손익분석
  if (method === 'GET' && url.includes('/accounting/reports/income-statement/monthly')) {
    const fiscalYear = Number(config.params?.['year'] ?? 2027)
    return envelope({
      fiscalYear,
      priorYear: fiscalYear - 1,
      fromDate: `${fiscalYear}-01-01`,
      toDate: `${fiscalYear}-12-31`,
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      rows: [
        {
          rowKind: 'ACCOUNT',
          section: 'REVENUE',
          accountCode: '401',
          accountName: '상품매출',
          category: 'REVENUE',
          monthlyAmounts: ['10000000', '12000000', '9800000', '11000000', '13500000', '14200000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '70500000',
          priorYearTotal: '61200000',
          difference: '9300000',
          sortOrder: 4010,
        },
        {
          rowKind: 'SUBTOTAL',
          section: 'REVENUE',
          accountCode: null,
          accountName: '매출액 합계',
          category: null,
          monthlyAmounts: ['10000000', '12000000', '9800000', '11000000', '13500000', '14200000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '70500000',
          priorYearTotal: '61200000',
          difference: '9300000',
          sortOrder: 4099,
        },
        {
          rowKind: 'ACCOUNT',
          section: 'COST_OF_SALES',
          accountCode: '501',
          accountName: '상품매출원가',
          category: 'COST_OF_SALES',
          monthlyAmounts: ['4200000', '5100000', '3900000', '4400000', '5300000', '5700000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '28600000',
          priorYearTotal: '25100000',
          difference: '3500000',
          sortOrder: 5010,
        },
        {
          rowKind: 'SUBTOTAL',
          section: 'COST_OF_SALES',
          accountCode: null,
          accountName: '매출원가 합계',
          category: null,
          monthlyAmounts: ['4200000', '5100000', '3900000', '4400000', '5300000', '5700000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '28600000',
          priorYearTotal: '25100000',
          difference: '3500000',
          sortOrder: 5099,
        },
        {
          rowKind: 'SUBTOTAL',
          section: 'GROSS_PROFIT',
          accountCode: null,
          accountName: '매출총이익',
          category: null,
          monthlyAmounts: ['5800000', '6900000', '5900000', '6600000', '8200000', '8500000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '41900000',
          priorYearTotal: '36100000',
          difference: '5800000',
          sortOrder: 5999,
        },
        {
          rowKind: 'ACCOUNT',
          section: 'SGA',
          accountCode: '801',
          accountName: '직원급여(판)',
          category: 'SGA',
          monthlyAmounts: ['1800000', '1800000', '1800000', '1800000', '1800000', '1800000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '10800000',
          priorYearTotal: '9600000',
          difference: '1200000',
          sortOrder: 8010,
        },
        {
          rowKind: 'SUBTOTAL',
          section: 'SGA',
          accountCode: null,
          accountName: '판매비와관리비 합계',
          category: null,
          monthlyAmounts: ['1800000', '1800000', '1800000', '1800000', '1800000', '1800000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '10800000',
          priorYearTotal: '9600000',
          difference: '1200000',
          sortOrder: 8999,
        },
        {
          rowKind: 'SUBTOTAL',
          section: 'OPERATING_PROFIT',
          accountCode: null,
          accountName: '영업이익',
          category: null,
          monthlyAmounts: ['4000000', '5100000', '4100000', '4800000', '6400000', '6700000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '31100000',
          priorYearTotal: '26500000',
          difference: '4600000',
          sortOrder: 9000,
        },
        {
          rowKind: 'ACCOUNT',
          section: 'NON_OPERATING',
          accountCode: '951',
          accountName: '이자비용',
          category: 'NON_OPERATING',
          monthlyAmounts: ['-120000', '-120000', '-120000', '-120000', '-120000', '-120000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '-720000',
          priorYearTotal: '-650000',
          difference: '-70000',
          sortOrder: 9510,
        },
        {
          rowKind: 'SUBTOTAL',
          section: 'NON_OPERATING',
          accountCode: null,
          accountName: '영업외손익 합계',
          category: null,
          monthlyAmounts: ['-120000', '-120000', '-120000', '-120000', '-120000', '-120000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '-720000',
          priorYearTotal: '-650000',
          difference: '-70000',
          sortOrder: 9899,
        },
        {
          rowKind: 'SUBTOTAL',
          section: 'INCOME_BEFORE_TAX',
          accountCode: null,
          accountName: '법인세차감전순이익',
          category: null,
          monthlyAmounts: ['3880000', '4980000', '3980000', '4680000', '6280000', '6580000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '30380000',
          priorYearTotal: '25850000',
          difference: '4530000',
          sortOrder: 9900,
        },
        {
          rowKind: 'SUBTOTAL',
          section: 'INCOME_TAX',
          accountCode: null,
          accountName: '법인세비용',
          category: null,
          monthlyAmounts: ['380000', '490000', '390000', '460000', '620000', '650000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '2990000',
          priorYearTotal: '2500000',
          difference: '490000',
          sortOrder: 9910,
        },
        {
          rowKind: 'TOTAL',
          section: 'NET_INCOME',
          accountCode: null,
          accountName: '당기순이익',
          category: null,
          monthlyAmounts: ['3500000', '4490000', '3590000', '4220000', '5660000', '5930000', '0', '0', '0', '0', '0', '0'],
          annualTotal: '27390000',
          priorYearTotal: '23350000',
          difference: '4040000',
          sortOrder: 9999,
        },
      ],
      generatedAt: '2026-06-23T09:00:00.000Z',
    })
  }

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

  // GET /accounting/reports/receivables-payables?asOfDate=&direction= — 채권채무 현황
  if (method === 'GET' && url.includes('/accounting/reports/receivables-payables')) {
    const asOfDate = (config.params?.['asOfDate'] ?? '2026-06-30') as string
    const direction = (config.params?.['direction'] ?? 'ALL') as 'RECEIVABLE' | 'PAYABLE' | 'ALL'
    const lines = MOCK_RECEIVABLES_PAYABLES.lines
      .filter((row) => {
        if (direction === 'RECEIVABLE') return Number(row.receivableBalance) > 0 || Number(row.notesHeldAmount) > 0
        if (direction === 'PAYABLE') return Number(row.payableBalance) > 0
        return true
      })
      .map((row) => ({
        ...row,
        payableBalance: direction === 'RECEIVABLE' ? '0' : row.payableBalance,
        receivableBalance: direction === 'PAYABLE' ? '0' : row.receivableBalance,
        netBalance: direction === 'PAYABLE'
          ? String(-Number(row.payableBalance))
          : direction === 'RECEIVABLE'
          ? String(Number(row.receivableBalance))
          : row.netBalance,
        agingBuckets: direction === 'PAYABLE'
          ? {
              currentMonth: String(-Math.abs(Number(row.payableAgingBuckets.currentMonth))),
              oneMonthElapsed: String(-Math.abs(Number(row.payableAgingBuckets.oneMonthElapsed))),
              twoMonthsElapsed: String(-Math.abs(Number(row.payableAgingBuckets.twoMonthsElapsed))),
              threeMonthsOver: String(-Math.abs(Number(row.payableAgingBuckets.threeMonthsOver))),
            }
          : direction === 'RECEIVABLE'
          ? row.receivableAgingBuckets
          : row.agingBuckets,
      }))
      .map(({ receivableAgingBuckets: _receivableAgingBuckets, payableAgingBuckets: _payableAgingBuckets, ...row }) => row)
    const receivableTotal = lines.reduce((sum, row) => sum + Number(row.receivableBalance), 0)
    const payableTotal = lines.reduce((sum, row) => sum + Number(row.payableBalance), 0)
    return envelope({
      asOfDate,
      direction,
      receivableTotal: String(receivableTotal),
      payableTotal: String(payableTotal),
      netTotal: String(receivableTotal - payableTotal),
      partnerCount: lines.length,
      lines,
      generatedAt: new Date().toISOString(),
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

  // G-1 받을어음 — 등록/목록/상태전이. UUID 미노출 mock.
  if (method === 'GET' && url.includes('/accounting/notes-receivable')) {
    const noteNoMatch = url.match(/\/accounting\/notes-receivable\/([^/?]+)$/)
    if (noteNoMatch?.[1]) {
      const noteNo = decodeURIComponent(noteNoMatch[1])
      const found = MOCK_NOTES_RECEIVABLE.find((row) => row.noteNo === noteNo)
      return found ? envelope(found) : mockError(404, 'NOT_FOUND', '받을어음을 찾을 수 없습니다.')
    }
    const status = (config.params?.['status'] as string | undefined) ?? ''
    const partnerCode = (config.params?.['partnerCode'] as string | undefined) ?? ''
    const rows = MOCK_NOTES_RECEIVABLE
      .filter((row) => !status || row.status === status)
      .filter((row) => !partnerCode || row.partnerCode === partnerCode)
      .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate) || a.noteNo.localeCompare(b.noteNo))
    return envelope(rows)
  }

  if (method === 'POST' && url.includes('/accounting/notes-receivable')) {
    const body = parseMockBody(config)
    const partnerCode = String(body.partnerCode ?? 'P-2026-0001')
    const partner = MOCK_ADMIN_PARTNERS.find((row) => row.partnerCode === partnerCode)
      ?? { partnerCode, bizNo: '', name: '' }
    const noteNo = String(body.noteNo ?? `NR-MOCK-${Date.now()}`)
    if (MOCK_NOTES_RECEIVABLE.some((row) => row.noteNo === noteNo)) {
      return mockError(409, 'CONFLICT', '이미 등록된 어음번호입니다.')
    }
    const row = {
      noteNo,
      partnerCode: String(partner.partnerCode ?? partnerCode),
      bizNo: String(partner.bizNo ?? ''),
      partnerName: String(partner.name ?? ''),
      issueDate: String(body.issueDate ?? new Date().toISOString().slice(0, 10)),
      maturityDate: String(body.maturityDate ?? new Date().toISOString().slice(0, 10)),
      amount: String(body.amount ?? '0'),
      noteType: String(body.noteType ?? 'PROMISSORY') as 'PROMISSORY' | 'BILL_OF_EXCHANGE',
      status: 'BOARDING' as 'BOARDING' | 'COLLECTING' | 'SETTLED' | 'DISHONORED',
      memo: body.memo == null ? null : String(body.memo),
    }
    MOCK_NOTES_RECEIVABLE = [...MOCK_NOTES_RECEIVABLE, row]
    return envelope(row)
  }

  if (method === 'PATCH' && url.includes('/accounting/notes-receivable') && url.includes('/status')) {
    const body = parseMockBody(config)
    const noteNo = decodeURIComponent(url.match(/\/accounting\/notes-receivable\/([^/?]+)\/status/)?.[1] ?? '')
    const status = String(body.status ?? '')
    const index = MOCK_NOTES_RECEIVABLE.findIndex((row) => row.noteNo === noteNo)
    if (index < 0) return mockError(404, 'NOT_FOUND', '받을어음을 찾을 수 없습니다.')
    const current = MOCK_NOTES_RECEIVABLE[index]
    if (!current) return mockError(404, 'NOT_FOUND', '받을어음을 찾을 수 없습니다.')
    const canNotesReceivableTransition =
      (status === 'COLLECTING' && current.status === 'BOARDING') ||
      ((status === 'SETTLED' || status === 'DISHONORED') &&
        (current.status === 'BOARDING' || current.status === 'COLLECTING'))
    if (!canNotesReceivableTransition) {
      return mockError(
        409,
        'CONFLICT',
        `Cannot transition notes receivable ${noteNo} from ${current.status} to ${status}`,
      )
    }
    const updated = {
      ...current,
      status: status as 'BOARDING' | 'COLLECTING' | 'SETTLED' | 'DISHONORED',
    }
    MOCK_NOTES_RECEIVABLE = MOCK_NOTES_RECEIVABLE.map((row, rowIndex) =>
      rowIndex === index ? updated : row,
    )
    return envelope(updated)
  }

  // G-2 수금계획 — 등록/목록/상태전이/자동제안/예측. UUID 미노출 mock.
  if (method === 'GET' && url.includes('/accounting/collection-plans/suggestions')) {
    const partnerCode = String(config.params?.['partnerCode'] ?? '')
    const partner = MOCK_ADMIN_PARTNERS.find((row) => row.partnerCode === partnerCode)
    const aging = MOCK_PARTNER_AGING_RECEIVABLE.lines.find((row) => row.partnerCode === partnerCode)
    const fallbackName = String(partner?.name ?? partner?.partnerName ?? aging?.partnerName ?? partnerCode)
    const fallbackBizNo = String(partner?.bizNo ?? partner?.businessNumber ?? aging?.bizNo ?? '').replace(/\D/g, '')
    const rows = []
    if (aging && Number(aging.balance) > 0) {
      rows.push({
        partnerCode,
        bizNo: fallbackBizNo,
        partnerName: fallbackName,
        plannedDate: new Date().toISOString().slice(0, 10),
        plannedAmount: String(aging.balance),
        basis: 'RECEIVABLE_BALANCE' as const,
        sourceReference: '110',
        memo: '외상매출금 잔액 기준 자동 제안',
      })
    }
    for (const note of MOCK_NOTES_RECEIVABLE.filter((row) =>
      row.partnerCode === partnerCode && (row.status === 'BOARDING' || row.status === 'COLLECTING'),
    )) {
      rows.push({
        partnerCode,
        bizNo: note.bizNo,
        partnerName: note.partnerName,
        plannedDate: note.maturityDate,
        plannedAmount: note.amount,
        basis: 'NOTE_MATURITY' as const,
        sourceReference: note.noteNo,
        memo: '받을어음 만기 기준 자동 제안',
      })
    }
    return envelope(rows.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)))
  }

  if (method === 'GET' && url.includes('/accounting/collection-plans/forecast')) {
    const from = String(config.params?.['from'] ?? '2026-01-01')
    const to = String(config.params?.['to'] ?? '2026-12-31')
    const buckets = new Map<string, number>()
    let year = Number(from.slice(0, 4))
    let monthIndex = Number(from.slice(5, 7))
    const endYear = Number(to.slice(0, 4))
    const endMonth = Number(to.slice(5, 7))
    while (year < endYear || (year === endYear && monthIndex <= endMonth)) {
      const month = `${year}-${String(monthIndex).padStart(2, '0')}`
      buckets.set(month, 0)
      monthIndex += 1
      if (monthIndex > 12) {
        monthIndex = 1
        year += 1
      }
    }
    for (const row of MOCK_COLLECTION_PLANS) {
      if (row.status === 'COLLECTED') continue
      if (row.plannedDate < from || row.plannedDate > to) continue
      const month = row.plannedDate.slice(0, 7)
      buckets.set(month, (buckets.get(month) ?? 0) + Number(row.plannedAmount))
    }
    const months = Array.from(buckets.entries()).map(([month, plannedAmount]) => ({
      month,
      plannedAmount: String(plannedAmount),
    }))
    const totalAmount = months.reduce((sum, row) => sum + Number(row.plannedAmount), 0)
    return envelope({ from, to, totalAmount: String(totalAmount), months })
  }

  if (method === 'GET' && url.includes('/accounting/collection-plans')) {
    const status = (config.params?.['status'] as string | undefined) ?? ''
    const partnerCode = (config.params?.['partnerCode'] as string | undefined) ?? ''
    const rows = MOCK_COLLECTION_PLANS
      .filter((row) => !status || row.status === status)
      .filter((row) => !partnerCode || row.partnerCode === partnerCode)
      .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.planNo.localeCompare(b.planNo))
    return envelope(rows)
  }

  if (method === 'POST' && url.includes('/accounting/collection-plans')) {
    const body = parseMockBody(config)
    const partnerCode = String(body.partnerCode ?? 'P-2026-0001')
    const partner = MOCK_ADMIN_PARTNERS.find((row) => row.partnerCode === partnerCode)
    const aging = MOCK_PARTNER_AGING_RECEIVABLE.lines.find((row) => row.partnerCode === partnerCode)
    const plannedDate = String(body.plannedDate ?? new Date().toISOString().slice(0, 10))
    const plannedAmount = String(body.plannedAmount ?? '1')
    if (Number(plannedAmount) <= 0) {
      return mockError(400, 'INVALID_INPUT', 'plannedAmount 는 0보다 커야 합니다.')
    }
    const basis = String(body.basis ?? 'MANUAL') as 'RECEIVABLE_BALANCE' | 'NOTE_MATURITY' | 'MANUAL'
    const sourceReference = body.sourceReference == null || String(body.sourceReference).trim() === ''
      ? null
      : String(body.sourceReference).trim()
    if (sourceReference && MOCK_COLLECTION_PLANS.some((row) =>
      row.partnerCode === partnerCode &&
      row.basis === basis &&
      row.sourceReference === sourceReference &&
      (row.status === 'PLANNED' || row.status === 'OVERDUE'),
    )) {
      return mockError(409, 'CONFLICT', `이미 등록된 자동제안 출처입니다: ${sourceReference}`)
    }
    const planNo = `CP-${plannedDate.replace(/-/g, '')}-${String(Date.now()).slice(-6)}`
    const row = {
      planNo,
      partnerCode,
      bizNo: String(partner?.bizNo ?? partner?.businessNumber ?? aging?.bizNo ?? '').replace(/\D/g, ''),
      partnerName: String(partner?.name ?? partner?.partnerName ?? aging?.partnerName ?? ''),
      plannedDate,
      plannedAmount,
      basis,
      status: 'PLANNED' as 'PLANNED' | 'COLLECTED' | 'OVERDUE',
      sourceReference,
      memo: body.memo == null ? null : String(body.memo),
    }
    MOCK_COLLECTION_PLANS = [...MOCK_COLLECTION_PLANS, row]
    return envelope(row)
  }

  if (method === 'POST' && url.includes('/accounting/codef/import')) {
    const body = parseMockBody(config) as {
      type?: string
      from?: string
      to?: string
      accountRef?: string
      cardRef?: string
      loanRef?: string
    }
    const type = String(body.type ?? 'ALL')
    const from = String(body.from ?? new Date().toISOString().slice(0, 10))
    const to = String(body.to ?? from)
    if (from && to && from > to) {
      return mockError(422, 'CODEF_DATE_RANGE_INVALID', '시작일은 종료일보다 이전이어야 합니다.')
    }
    const accountRef = String(body.accountRef ?? '국민 123456-78-901234')
    const cardRef = String(body.cardRef ?? '삼한 물류카드')
    const loanRef = String(body.loanRef ?? '운전자금 대출')

    const shouldInclude = (target: 'BANK' | 'CARD' | 'LOAN') => type === 'ALL' || type === target
    const importedRows = [
      ...(shouldInclude('BANK') ? [
        {
          transactedAt: `${to}T09:15:00`,
          txnType: 'DEPOSIT' as const,
          amount: '2750000',
          balanceAfter: '15275000',
          description: '운임 입금',
          counterpartyName: '삼한테스트상사',
          counterpartyAccount: null,
          bankAccountLabel: accountRef,
          source: 'CODEF_BANK' as const,
          externalRef: `CODEF-BANK-${to}-001`,
          cardName: null,
          approvalId: null,
          loanName: null,
          matchStatus: 'UNREFLECTED' as const,
          matchedPartnerCode: null,
          matchedBizNo: null,
          matchedPartnerName: null,
        },
        {
          transactedAt: `${to}T10:20:00`,
          txnType: 'WITHDRAWAL' as const,
          amount: '420000',
          balanceAfter: '14855000',
          description: '운임 정산',
          counterpartyName: '아로물류 B',
          counterpartyAccount: null,
          bankAccountLabel: accountRef,
          source: 'CODEF_BANK' as const,
          externalRef: `CODEF-BANK-${to}-002`,
          cardName: null,
          approvalId: null,
          loanName: null,
          matchStatus: 'UNREFLECTED' as const,
          matchedPartnerCode: null,
          matchedBizNo: null,
          matchedPartnerName: null,
        },
      ] : []),
      ...(shouldInclude('CARD') ? [
        {
          transactedAt: `${to}T12:05:00`,
          txnType: 'WITHDRAWAL' as const,
          amount: '187000',
          balanceAfter: '0',
          description: '주유소 법인카드 승인',
          counterpartyName: '삼한주유소',
          counterpartyAccount: null,
          bankAccountLabel: cardRef,
          source: 'CODEF_CARD' as const,
          externalRef: `CODEF-CARD-${to}-001`,
          cardName: '삼한 물류카드',
          approvalId: `CARD-${to.replace(/-/g, '')}-001`,
          loanName: null,
          matchStatus: 'UNREFLECTED' as const,
          matchedPartnerCode: null,
          matchedBizNo: null,
          matchedPartnerName: null,
        },
        {
          transactedAt: `${to}T14:35:00`,
          txnType: 'WITHDRAWAL' as const,
          amount: '66000',
          balanceAfter: '0',
          description: '통행료 법인카드 승인',
          counterpartyName: '고속도로공사',
          counterpartyAccount: null,
          bankAccountLabel: cardRef,
          source: 'CODEF_CARD' as const,
          externalRef: `CODEF-CARD-${to}-002`,
          cardName: '삼한 물류카드',
          approvalId: `CARD-${to.replace(/-/g, '')}-002`,
          loanName: null,
          matchStatus: 'UNREFLECTED' as const,
          matchedPartnerCode: null,
          matchedBizNo: null,
          matchedPartnerName: null,
        },
      ] : []),
      ...(shouldInclude('LOAN') ? [
        {
          transactedAt: `${to}T16:10:00`,
          txnType: 'WITHDRAWAL' as const,
          amount: '1200000',
          balanceAfter: '0',
          description: '대출 이자 출금',
          counterpartyName: '국민은행',
          counterpartyAccount: null,
          bankAccountLabel: loanRef,
          source: 'CODEF_LOAN' as const,
          externalRef: `CODEF-LOAN-${to}-001`,
          cardName: null,
          approvalId: null,
          loanName: '운전자금 대출',
          matchStatus: 'UNREFLECTED' as const,
          matchedPartnerCode: null,
          matchedBizNo: null,
          matchedPartnerName: null,
        },
        {
          transactedAt: `${to}T16:11:00`,
          txnType: 'DEPOSIT' as const,
          amount: '50000000',
          balanceAfter: '50000000',
          description: '대출 실행 입금',
          counterpartyName: '국민은행',
          counterpartyAccount: null,
          bankAccountLabel: loanRef,
          source: 'CODEF_LOAN' as const,
          externalRef: `CODEF-LOAN-${to}-002`,
          cardName: null,
          approvalId: null,
          loanName: '운전자금 대출',
          matchStatus: 'UNREFLECTED' as const,
          matchedPartnerCode: null,
          matchedBizNo: null,
          matchedPartnerName: null,
        },
      ] : []),
    ]

    let importedCount = 0
    let duplicateSkippedCount = 0
    for (const row of importedRows) {
      const exists = MOCK_BANK_TRANSACTIONS.some((existing) =>
        existing.bankAccountLabel === row.bankAccountLabel
        && existing.transactedAt === row.transactedAt
        && String(existing.amount) === String(row.amount)
        && existing.externalRef === row.externalRef)
      if (exists) {
        duplicateSkippedCount += 1
      } else {
        MOCK_BANK_TRANSACTIONS = [row, ...MOCK_BANK_TRANSACTIONS]
        importedCount += 1
      }
    }

    return envelope({
      fetchedCount: importedRows.length,
      importedCount,
      duplicateSkippedCount,
      matchedCount: 0,
    })
  }

  if (method === 'GET' && url.includes('/accounting/bank-transactions')) {
    const statusFilter = String(config.params?.['matchStatus'] ?? '')
    const from = String(config.params?.['from'] ?? '')
    const to = String(config.params?.['to'] ?? '')
    const bankAccountLabel = String(config.params?.['bankAccountLabel'] ?? '').trim()
    const rows = MOCK_BANK_TRANSACTIONS
      .filter((row) => !statusFilter || row.matchStatus === statusFilter)
      .filter((row) => !from || row.transactedAt.slice(0, 10) >= from)
      .filter((row) => !to || row.transactedAt.slice(0, 10) <= to)
      .filter((row) => !bankAccountLabel || row.bankAccountLabel.includes(bankAccountLabel))
      .sort((a, b) => b.transactedAt.localeCompare(a.transactedAt))
    return envelope(rows)
  }

  if (method === 'PATCH' && url.includes('/accounting/bank-transactions/match-partner')
    && !url.includes('/match-partner/clear')) {
    const body = parseMockBody(config)
    const bankAccountLabel = String(body.bankAccountLabel ?? '').trim()
    const transactedAt = String(body.transactedAt ?? '').trim()
    const amount = String(body.amount ?? '').trim()
    const externalRef = String(body.externalRef ?? '').trim()
    const partnerCode = String(body.partnerCode ?? '').trim()
    if (!bankAccountLabel || !transactedAt || !amount || !externalRef || !partnerCode) {
      return mockError(400, 'INVALID_INPUT', 'bankAccountLabel, transactedAt, amount, externalRef, partnerCode 는 필수입니다.')
    }
    const index = MOCK_BANK_TRANSACTIONS.findIndex((row) =>
      row.bankAccountLabel === bankAccountLabel
      && row.transactedAt === transactedAt
      && String(row.amount) === amount
      && row.externalRef === externalRef)
    if (index < 0) {
      return mockError(404, 'NOT_FOUND', '통장 거래를 찾을 수 없습니다.')
    }
    const current = MOCK_BANK_TRANSACTIONS[index]!
    if (current.matchStatus !== 'UNREFLECTED') {
      return mockError(409, 'CONFLICT', 'UNREFLECTED 거래만 거래처 매칭을 변경할 수 있습니다.')
    }
    const partner = MOCK_ADMIN_PARTNERS.map((row) => normalizeAdminPartner(row))
      .find((row) => row.partnerCode === partnerCode)
    if (!partner) {
      return mockError(404, 'NOT_FOUND', `등록된 거래처를 찾을 수 없습니다: ${partnerCode}`)
    }
    const next = {
      ...current,
      matchedPartnerCode: partner.partnerCode,
      matchedBizNo: partner.bizNo.replace(/\D/g, ''),
      matchedPartnerName: partner.name,
    }
    MOCK_BANK_TRANSACTIONS = MOCK_BANK_TRANSACTIONS.map((row, rowIndex) =>
      rowIndex === index ? next : row)
    return envelope(next)
  }

  if (method === 'PATCH' && url.includes('/accounting/bank-transactions/match-partner/clear')) {
    const body = parseMockBody(config)
    const bankAccountLabel = String(body.bankAccountLabel ?? '').trim()
    const transactedAt = String(body.transactedAt ?? '').trim()
    const amount = String(body.amount ?? '').trim()
    const externalRef = String(body.externalRef ?? '').trim()
    if (!bankAccountLabel || !transactedAt || !amount || !externalRef) {
      return mockError(400, 'INVALID_INPUT', 'bankAccountLabel, transactedAt, amount, externalRef 는 필수입니다.')
    }
    const index = MOCK_BANK_TRANSACTIONS.findIndex((row) =>
      row.bankAccountLabel === bankAccountLabel
      && row.transactedAt === transactedAt
      && String(row.amount) === amount
      && row.externalRef === externalRef)
    if (index < 0) {
      return mockError(404, 'NOT_FOUND', '통장 거래를 찾을 수 없습니다.')
    }
    const current = MOCK_BANK_TRANSACTIONS[index]!
    if (current.matchStatus !== 'UNREFLECTED') {
      return mockError(409, 'CONFLICT', 'UNREFLECTED 거래만 거래처 매칭을 해제할 수 있습니다.')
    }
    const next = {
      ...current,
      matchedPartnerCode: null,
      matchedBizNo: null,
      matchedPartnerName: null,
    }
    MOCK_BANK_TRANSACTIONS = MOCK_BANK_TRANSACTIONS.map((row, rowIndex) =>
      rowIndex === index ? next : row)
    return envelope(next)
  }

  if (method === 'POST' && url.includes('/accounting/bank-transactions/import')) {
    const bankAccountLabel =
      readMockFormValue(config.data, 'bankAccountLabel').trim() || '국민 123-456'
    const now = Date.now()
    const importedRows = [
      {
        transactedAt: '2026-06-23T09:10:00',
        txnType: 'DEPOSIT' as const,
        amount: '150000',
        balanceAfter: '1150000',
        description: '삼한테스트상사 입금',
        counterpartyName: '삼한테스트상사',
        counterpartyAccount: null,
        bankAccountLabel,
        source: 'CSV_IMPORT' as const,
        externalRef: `mock-csv-${bankAccountLabel}-1`,
        matchStatus: 'UNREFLECTED' as const,
        matchedPartnerCode: null,
        matchedBizNo: null,
        matchedPartnerName: null,
      },
      {
        transactedAt: '2026-06-23T11:30:00',
        txnType: 'WITHDRAWAL' as const,
        amount: '50000',
        balanceAfter: '1100000',
        description: '이체 수수료',
        counterpartyName: '국민은행',
        counterpartyAccount: null,
        bankAccountLabel,
        source: 'CSV_IMPORT' as const,
        externalRef: `mock-csv-${bankAccountLabel}-2`,
        matchStatus: 'UNREFLECTED' as const,
        matchedPartnerCode: null,
        matchedBizNo: null,
        matchedPartnerName: null,
      },
      {
        transactedAt: new Date(now).toISOString().slice(0, 19),
        txnType: 'DEPOSIT' as const,
        amount: '300000',
        balanceAfter: null,
        description: '입금 샘플',
        counterpartyName: '샘플거래처',
        counterpartyAccount: null,
        bankAccountLabel,
        source: 'CSV_IMPORT' as const,
        externalRef: `mock-csv-${bankAccountLabel}-3`,
        matchStatus: 'UNREFLECTED' as const,
        matchedPartnerCode: null,
        matchedBizNo: null,
        matchedPartnerName: null,
      },
    ]
    let importedCount = 0
    let duplicateSkippedCount = 0
    for (const row of importedRows) {
      // BE V43 unique 4-key(bankAccountLabel+transactedAt+amount+externalRef) 와 동일 dedup.
      if (MOCK_BANK_TRANSACTIONS.some((existing) =>
        existing.bankAccountLabel === row.bankAccountLabel
        && existing.transactedAt === row.transactedAt
        && existing.amount === row.amount
        && existing.externalRef === row.externalRef)) {
        duplicateSkippedCount += 1
      } else {
        MOCK_BANK_TRANSACTIONS = [row, ...MOCK_BANK_TRANSACTIONS]
        importedCount += 1
      }
    }
    return envelope({
      totalRows: importedRows.length,
      importedCount,
      duplicateSkippedCount,
    })
  }

  if (method === 'PATCH' && url.includes('/accounting/collection-plans') && url.includes('/status')) {
    const body = parseMockBody(config)
    const planNo = decodeURIComponent(url.match(/\/accounting\/collection-plans\/([^/?]+)\/status/)?.[1] ?? '')
    const status = String(body.status ?? '')
    const index = MOCK_COLLECTION_PLANS.findIndex((row) => row.planNo === planNo)
    if (index < 0) return mockError(404, 'NOT_FOUND', '수금계획을 찾을 수 없습니다.')
    const current = MOCK_COLLECTION_PLANS[index]
    if (!current) return mockError(404, 'NOT_FOUND', '수금계획을 찾을 수 없습니다.')
    const canCollectionPlanTransition =
      (status === 'OVERDUE' && current.status === 'PLANNED') ||
      (status === 'COLLECTED' && (current.status === 'PLANNED' || current.status === 'OVERDUE'))
    if (!canCollectionPlanTransition) {
      return mockError(
        409,
        'CONFLICT',
        `Cannot transition collection plan ${planNo} from ${current.status} to ${status}`,
      )
    }
    const updated = {
      ...current,
      status: status as 'PLANNED' | 'COLLECTED' | 'OVERDUE',
    }
    MOCK_COLLECTION_PLANS = MOCK_COLLECTION_PLANS.map((row, rowIndex) =>
      rowIndex === index ? updated : row,
    )
    return envelope(updated)
  }

  // GET /accounting/reports/account-statement?asOfDate=&accountCode= — 계정명세서
  if (method === 'GET' && url.includes('/accounting/reports/account-statement')) {
    const asOfDate = (config.params?.['asOfDate'] ?? '2026-06-30') as string
    const accountCode = ((config.params?.['accountCode'] ?? '') as string).trim()
    const amount = (
      openingBalance: number,
      increase: number,
      decrease: number,
      debitTotal: number,
      creditTotal: number,
      balance: number,
    ) => ({
      openingBalance: String(openingBalance),
      increase: String(increase),
      decrease: String(decrease),
      debitTotal: String(debitTotal),
      creditTotal: String(creditTotal),
      balance: String(balance),
    })
    const line = (
      code: string,
      name: string,
      partnerCode: string,
      bizNo: string,
      partnerName: string,
      increase: number,
      decrease: number,
      debitTotal: number,
      creditTotal: number,
      balance: number,
    ) => ({
      accountCode: code,
      accountName: name,
      partnerCode,
      bizNo,
      partnerName,
      openingBalance: '0',
      increase: String(increase),
      decrease: String(decrease),
      debitTotal: String(debitTotal),
      creditTotal: String(creditTotal),
      balance: String(balance),
    })
    const account = (
      code: string,
      name: string,
      category: string,
      categoryDisplayName: string,
      balanceDirection: 'DEBIT' | 'CREDIT',
      lines: ReturnType<typeof line>[],
    ) => {
      const subtotal = lines.reduce(
        (acc, row) => ({
          openingBalance: acc.openingBalance,
          increase: acc.increase + Number(row.increase),
          decrease: acc.decrease + Number(row.decrease),
          debitTotal: acc.debitTotal + Number(row.debitTotal),
          creditTotal: acc.creditTotal + Number(row.creditTotal),
          balance: acc.balance + Number(row.balance),
        }),
        { openingBalance: 0, increase: 0, decrease: 0, debitTotal: 0, creditTotal: 0, balance: 0 },
      )
      return {
        accountCode: code,
        accountName: name,
        category,
        categoryDisplayName,
        balanceDirection,
        balanceDirectionDisplayName: balanceDirection === 'DEBIT' ? '차변잔액' : '대변잔액',
        lines,
        subtotal: amount(
          subtotal.openingBalance,
          subtotal.increase,
          subtotal.decrease,
          subtotal.debitTotal,
          subtotal.creditTotal,
          subtotal.balance,
        ),
      }
    }
    const groups = [
      {
        groupCode: 'RECEIVABLE',
        groupName: '채권',
        balanceDirection: 'DEBIT' as const,
        accounts: [
          account('110', '외상매출금', 'ASSET', '자산', 'DEBIT', [
            line('110', '외상매출금', 'P-2026-0001', '111-22-33333', '삼한공조 A', 10000000, 2500000, 10000000, 2500000, 7500000),
            line('110', '외상매출금', 'P-2026-0002', '222-33-44444', '아로물류 B', 3200000, 0, 3200000, 0, 3200000),
            line('110', '외상매출금', '', '', '임시거래처', 0, 120000, 0, 120000, -120000),
          ]),
          account('120', '미수금', 'ASSET', '자산', 'DEBIT', [
            line('120', '미수금', 'P-2026-0004', '444-55-66666', '세종냉열', 880000, 300000, 880000, 300000, 580000),
          ]),
        ],
      },
      {
        groupCode: 'PAYABLE',
        groupName: '채무',
        balanceDirection: 'CREDIT' as const,
        accounts: [
          account('201', '외상매입금', 'LIABILITY', '부채', 'CREDIT', [
            line('201', '외상매입금', 'P-2026-0003', '333-44-55555', '대한운송 C', 8000000, 2000000, 2000000, 8000000, 6000000),
            line('201', '외상매입금', 'P-2026-0005', '555-66-77777', '남부상사', 1450000, 450000, 450000, 1450000, 1000000),
          ]),
          account('210', '미지급금', 'LIABILITY', '부채', 'CREDIT', [
            line('210', '미지급금', '', '', '월말 정산', 530000, 0, 0, 530000, 530000),
          ]),
        ],
      },
    ].map((group) => {
      const accounts = accountCode
        ? group.accounts.filter((row) => row.accountCode === accountCode)
        : group.accounts
      const subtotal = accounts.reduce(
        (acc, row) => ({
          openingBalance: acc.openingBalance + Number(row.subtotal.openingBalance),
          increase: acc.increase + Number(row.subtotal.increase),
          decrease: acc.decrease + Number(row.subtotal.decrease),
          debitTotal: acc.debitTotal + Number(row.subtotal.debitTotal),
          creditTotal: acc.creditTotal + Number(row.subtotal.creditTotal),
          balance: acc.balance + Number(row.subtotal.balance),
        }),
        { openingBalance: 0, increase: 0, decrease: 0, debitTotal: 0, creditTotal: 0, balance: 0 },
      )
      return {
        ...group,
        accounts,
        subtotal: amount(
          subtotal.openingBalance,
          subtotal.increase,
          subtotal.decrease,
          subtotal.debitTotal,
          subtotal.creditTotal,
          subtotal.balance,
        ),
      }
    }).filter((group) => group.accounts.length > 0)
    return envelope({
      asOfDate,
      accountCode: accountCode || null,
      groups,
      total: {
        receivableTotal: groups.find((group) => group.groupCode === 'RECEIVABLE')?.subtotal ?? null,
        payableTotal: groups.find((group) => group.groupCode === 'PAYABLE')?.subtotal ?? null,
      },
      generatedAt: '2026-06-23T09:00:00.000Z',
    })
  }

  // GET /accounting/reports/journal-status?from=&to=&sourceTypes=&partnerCode=&groupBy= — 전표현황
  if (method === 'GET' && url.includes('/accounting/reports/journal-status')) {
    const from = (config.params?.['from'] ?? '2026-05-01') as string
    const to = (config.params?.['to'] ?? '2026-05-31') as string
    const groupBy = ((config.params?.['groupBy'] ?? 'DATE') as string) || 'DATE'
    const status = ((config.params?.['status'] ?? 'POSTED') as string) || 'POSTED'
    const rawSourceTypes = config.params?.['sourceTypes'] as string | string[] | undefined
    const selectedSourceTypes = Array.isArray(rawSourceTypes)
      ? rawSourceTypes
      : String(rawSourceTypes ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    const partnerCode = (config.params?.['partnerCode'] as string | undefined) ?? ''
    const partnerCodeByName: Record<string, string> = {
      '주식회사 윌리': 'P-WILLY-001',
      '한일빌딩': 'P-HANIL-002',
      '네이버': 'P-NAVER-003',
    }
    const bizNoByName: Record<string, string> = {
      '주식회사 윌리': '1111111111',
      '한일빌딩': '2222222222',
      '네이버': '3333333333',
    }
    const sourceLabel: Record<string, string> = {
      SLIP: '전표',
      MANUAL: '수기',
      CLOSING: '결산',
      KFTC_DEPOSIT: '계좌입금',
      CASH_DISBURSEMENT: '지출결의서',
      CASH_RECEIPT: '현금입금',
    }
    const journals = MOCK_JOURNALS
      .filter((journal) => journal.status === status)
      .filter((journal) => journal.journalDate >= from && journal.journalDate <= to)
      .filter((journal) =>
        selectedSourceTypes.length === 0 || selectedSourceTypes.includes(String(journal.sourceType ?? 'MANUAL')),
      )

    const lines = groupBy === 'PARTNER'
      ? journals.flatMap((journal) => {
        const byPartner = new Map<string, { totalDebit: number; totalCredit: number }>()
        for (const line of journal.lines) {
          const partnerName = line.partnerName ?? '기타'
          if (partnerCode && partnerCodeByName[partnerName] !== partnerCode) continue
          const prev = byPartner.get(partnerName) ?? { totalDebit: 0, totalCredit: 0 }
          byPartner.set(partnerName, {
            totalDebit: prev.totalDebit + Number(line.debit),
            totalCredit: prev.totalCredit + Number(line.credit),
          })
        }
        return Array.from(byPartner.entries()).map(([partnerName, subtotal]) => ({
          journalNo: journal.journalNo,
          journalDate: journal.journalDate,
          sourceType: journal.sourceType ?? 'MANUAL',
          sourceTypeDisplayName: journal.sourceTypeDisplayName ?? sourceLabel[String(journal.sourceType ?? 'MANUAL')],
          bizNo: bizNoByName[partnerName] ?? '',
          partnerName,
          description: journal.description,
          totalDebit: String(subtotal.totalDebit),
          totalCredit: String(subtotal.totalCredit),
        }))
      })
      : journals.map((journal) => {
        const partnerNames = Array.from(new Set(
          journal.lines
            .map((line) => line.partnerName)
            .filter((name): name is string => Boolean(name)),
        )).sort()
        return {
          journalNo: journal.journalNo,
          journalDate: journal.journalDate,
          sourceType: journal.sourceType ?? 'MANUAL',
          sourceTypeDisplayName: journal.sourceTypeDisplayName ?? sourceLabel[String(journal.sourceType ?? 'MANUAL')],
          bizNo: partnerNames.map((name) => bizNoByName[name] ?? '').filter(Boolean).join(' / '),
          partnerName: partnerNames.length > 0 ? partnerNames.join(' / ') : '기타',
          description: journal.description,
          totalDebit: journal.totalDebit,
          totalCredit: journal.totalCredit,
        }
      })
        .filter((line) => !partnerCode || line.partnerName.split(' / ').some((name) => partnerCodeByName[name] === partnerCode))

    const groupKeyOf = (line: typeof lines[number]) => {
      if (groupBy === 'SOURCE_TYPE') return String(line.sourceType)
      if (groupBy === 'PARTNER') return line.partnerName
      return line.journalDate
    }
    const groupLabelOf = (line: typeof lines[number]) => {
      if (groupBy === 'SOURCE_TYPE') return line.sourceTypeDisplayName
      if (groupBy === 'PARTNER') return line.partnerName
      return line.journalDate
    }
    const sum = (rows: typeof lines) => ({
      totalDebit: String(rows.reduce((acc, row) => acc + Number(row.totalDebit), 0)),
      totalCredit: String(rows.reduce((acc, row) => acc + Number(row.totalCredit), 0)),
      journalCount: rows.length,
    })
    const grouped = new Map<string, typeof lines>()
    for (const line of lines) {
      const key = groupKeyOf(line)
      grouped.set(key, [...(grouped.get(key) ?? []), line])
    }
    const groups = Array.from(grouped.entries()).map(([groupKey, rows]) => ({
      groupKey,
      groupLabel: groupLabelOf(rows[0]!),
      lines: rows,
      subtotal: sum(rows),
    }))
    return envelope({
      fromDate: from,
      toDate: to,
      status,
      sourceTypes: selectedSourceTypes.length > 0
        ? selectedSourceTypes
        : ['SLIP', 'MANUAL', 'CLOSING', 'KFTC_DEPOSIT', 'CASH_DISBURSEMENT', 'CASH_RECEIPT'],
      groupBy,
      groups,
      total: sum(lines),
      generatedAt: '2026-06-23T09:00:00.000Z',
    })
  }

  // GET /accounting/reports/funds-status?from=&to= — 자금현황
  if (method === 'GET' && url.includes('/accounting/reports/funds-status/increase-detail')) {
    return envelope({
      fromDate: (config.params?.['from'] ?? '2026-06-01') as string,
      toDate: (config.params?.['to'] ?? '2026-06-30') as string,
      accountCode: (config.params?.['accountCode'] ?? '102') as string,
      accountName: '보통예금',
      partnerName: null,
      lines: [
        {
          txDate: '2026-06-10',
          counterAccountName: '외상매출금',
          counterPartnerName: '삼한거래처',
          description: '외상매출금 회수',
          amount: '4000000',
        },
      ],
      totalAmount: '4000000',
      generatedAt: '2026-06-23T09:00:00.000Z',
    })
  }

  if (method === 'GET' && url.includes('/accounting/reports/funds-status')) {
    const fromDate = (config.params?.['from'] ?? '2026-06-01') as string
    const toDate = (config.params?.['to'] ?? '2026-06-30') as string
    const line = {
      accountCode: '102',
      accountName: '보통예금',
      bizNo: '1112233333',
      partnerName: '국민은행 운영계좌',
      openingBalance: '10000000',
      increase: '4000000',
      decrease: '1000000',
      closingBalance: '13000000',
    }
    return envelope({
      fromDate,
      toDate,
      groups: [
        {
          groupCode: 'CASH_EQUIVALENT',
          groupName: '현금성',
          accounts: [
            {
              accountCode: '102',
              accountName: '보통예금',
              category: 'ASSET',
              lines: [line],
              subtotal: {
                openingBalance: line.openingBalance,
                increase: line.increase,
                decrease: line.decrease,
                closingBalance: line.closingBalance,
              },
            },
          ],
          subtotal: {
            openingBalance: line.openingBalance,
            increase: line.increase,
            decrease: line.decrease,
            closingBalance: line.closingBalance,
          },
        },
      ],
      total: {
        openingBalance: line.openingBalance,
        increase: line.increase,
        decrease: line.decrease,
        closingBalance: line.closingBalance,
      },
      generatedAt: '2026-06-23T09:00:00.000Z',
    })
  }

  // ==========================================================================
  // P0-1 Slice C: 분석 보고서 mock endpoint
  // ==========================================================================

  // GET /accounting/reports/funds-flow-comparison?from=&to= — 자금 입출금내역 2기간 비교
  if (method === 'GET' && url.includes('/accounting/reports/funds-flow-comparison')) {
    const from = (config.params?.['from'] ?? '2026-06-01') as string
    const to = (config.params?.['to'] ?? '2026-06-30') as string
    const fromDate = new Date(`${from}T00:00:00`)
    const toDate = new Date(`${to}T00:00:00`)
    const periodMs = toDate.getTime() - fromDate.getTime()
    const priorToDate = new Date(fromDate)
    priorToDate.setDate(priorToDate.getDate() - 1)
    const priorFromDate = new Date(priorToDate)
    priorFromDate.setTime(priorToDate.getTime() - periodMs)
    const isoDate = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return envelope({
      current: {
        fromDate: from,
        toDate: to,
        openingBalance: '12500000',
        increases: [
          { counterAccountCode: '110', counterAccountName: '외상매출금', amount: '4200000' },
          { counterAccountCode: '120', counterAccountName: '미수금', amount: '800000' },
          { counterAccountCode: '901', counterAccountName: '이자수익', amount: '120000' },
        ],
        increaseSubtotal: '5120000',
        decreases: [
          { counterAccountCode: '201', counterAccountName: '외상매입금', amount: '2100000' },
          { counterAccountCode: '210', counterAccountName: '미지급금', amount: '950000' },
          { counterAccountCode: '801', counterAccountName: '직원급여(판)', amount: '1800000' },
          { counterAccountCode: '835', counterAccountName: '지급수수료(판)', amount: '310000' },
        ],
        decreaseSubtotal: '5160000',
        closingBalance: '12460000',
        reconciled: true,
      },
      prior: {
        fromDate: isoDate(priorFromDate),
        toDate: isoDate(priorToDate),
        openingBalance: '9800000',
        increases: [
          { counterAccountCode: '110', counterAccountName: '외상매출금', amount: '3100000' },
          { counterAccountCode: '120', counterAccountName: '미수금', amount: '600000' },
        ],
        increaseSubtotal: '3700000',
        decreases: [
          { counterAccountCode: '201', counterAccountName: '외상매입금', amount: '1500000' },
          { counterAccountCode: '801', counterAccountName: '직원급여(판)', amount: '1200000' },
          { counterAccountCode: '835', counterAccountName: '지급수수료(판)', amount: '250000' },
        ],
        decreaseSubtotal: '2950000',
        closingBalance: '10550000',
        reconciled: true,
      },
      generatedAt: '2026-06-23T09:00:00.000Z',
    })
  }

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

    let content: Array<{
      orderNumber: string
      partnerCode: string
      partnerName: string
      submittedAt: string
      status: string
      totalAmount: number
      linkedSlipNo: string | null
    }>
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

    // 3-D: 병합/전환된 주문은 CONVERTED 로 표시. DRAFT 필터에서는 제외(BE 동작 모사).
    content = content
      .map((row) =>
        mockConvertedOrderNos.has(row.orderNumber)
          ? { ...row, status: 'CONVERTED' as const, linkedSlipNo: 'SL-20260531-MERGE-001' }
          : row,
      )
      .filter((row) => !(statusParam === 'DRAFT' && row.status === 'CONVERTED'))

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

  // GET/PUT /api/v1/estimate-config — 종합견적서 전역 가격 설정
  if (url.match(/\/api\/v1\/estimate-config(?:\?.*)?$/)) {
    if (method === 'GET') {
      return envelope(estimateConfigMock)
    }
    if (method === 'PUT') {
      estimateConfigMock = {
        ...estimateConfigMock,
        ...parseMockBody(config),
      }
      return envelope(estimateConfigMock)
    }
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
  if (method === 'GET' && url.includes('/admin/users') && !url.includes('/signature/') && !url.includes('/role-history') && !url.match(/\/admin\/users\/roles/)) {
    return envelope({
      items: MOCK_ADMIN_USERS,
      total: MOCK_ADMIN_USERS.length,
      page: 0,
      size: 20,
    })
  }

  // GET /admin/users/roles — 10 ROLE string array (BE AdminRole[] 직렬화)
  // 결함 #8: 기존 {code,label}[] → AdminRole[] string array 정정 ([object Object] 회피)
  if (method === 'GET' && url.endsWith('/admin/users/roles')) {
    return envelope([
      'MASTER',
      'DEVELOPER',
      'MANAGER',
      'DISPATCH',
      'DRIVER',
      'STAFF',
      'SALES',
      'ACCOUNTANT',
      'WAREHOUSE',
      'INVENTORY',
    ])
  }

  // PATCH /admin/users/{id}/disable, /enable, /role
  const adminUserActionMatch = url.match(/\/admin\/users\/([^/]+)\/(disable|enable|role)$/)
  if (method === 'PATCH' && adminUserActionMatch) {
    const userId = adminUserActionMatch[1]!
    const action = adminUserActionMatch[2]!
    if (action === 'role') {
      // C3b: role PATCH — newRole 을 받아 사용자 role 업데이트 + 빌트인 그룹 동기화 mock
      const body = parseMockBody(config)
      const newRole = String(body['newRole'] ?? '')
      const userIdx = MOCK_ADMIN_USERS.findIndex((u) => u.id === userId)
      if (userIdx >= 0 && newRole) {
        // role 필드 업데이트
        ;(MOCK_ADMIN_USERS[userIdx] as Record<string, unknown>)['role'] = newRole
        // 빌트인 그룹 동기화: 기존 빌트인 그룹 제거 후 새 빌트인 그룹 추가
        const BUILTIN_IDS_SET = new Set([
          BUILTIN_GROUP_ID_MASTER, BUILTIN_GROUP_ID_MANAGER, BUILTIN_GROUP_ID_SALES,
          BUILTIN_GROUP_ID_WAREHOUSE, BUILTIN_GROUP_ID_ACCOUNTANT, BUILTIN_GROUP_ID_INVENTORY,
          BUILTIN_GROUP_ID_DISPATCH, BUILTIN_GROUP_ID_DRIVER, BUILTIN_GROUP_ID_STAFF,
          BUILTIN_GROUP_ID_DEVELOPER,
        ])
        const ROLE_TO_BUILTIN: Record<string, string> = {
          MASTER: BUILTIN_GROUP_ID_MASTER, MANAGER: BUILTIN_GROUP_ID_MANAGER,
          SALES: BUILTIN_GROUP_ID_SALES,   WAREHOUSE: BUILTIN_GROUP_ID_WAREHOUSE,
          ACCOUNTANT: BUILTIN_GROUP_ID_ACCOUNTANT, INVENTORY: BUILTIN_GROUP_ID_INVENTORY,
          DISPATCH: BUILTIN_GROUP_ID_DISPATCH, DRIVER: BUILTIN_GROUP_ID_DRIVER,
          STAFF: BUILTIN_GROUP_ID_STAFF,   DEVELOPER: BUILTIN_GROUP_ID_DEVELOPER,
        }
        const existing = _mockAccountGroups[userId] ?? []
        const nonBuiltin = existing.filter((gid) => !BUILTIN_IDS_SET.has(gid))
        const newBuiltinId = ROLE_TO_BUILTIN[newRole]
        _mockAccountGroups[userId] = newBuiltinId ? [newBuiltinId, ...nonBuiltin] : nonBuiltin
        return envelope(MOCK_ADMIN_USERS[userIdx])
      }
    }
    return envelope({ id: userId, message: '처리되었습니다' })
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

  // PATCH /api/v1/admin/users/{id}/signature — 업로드 등록 (C2.3)
  if (method === 'PATCH' && /\/api\/v1\/admin\/users\/[^/]+\/signature$/.test(url)) {
    const body = parseMockBody(config)
    if (typeof body['signatureHash'] !== 'string' || (body['signatureHash'] as string).length !== 64) {
      return mockError(400, 'SIGNATURE_HASH_MISMATCH', '서명 해시가 올바르지 않습니다.')
    }
    return envelope({ registered: true, signedAt: '2026-06-21T10:00:00', signatureChannel: body['channel'] ?? 'UPLOAD' })
  }
  // POST /api/v1/admin/users/{id}/signature/handoff-token — 토큰 발급 (C2.3)
  if (method === 'POST' && /\/api\/v1\/admin\/users\/[^/]+\/signature\/handoff-token$/.test(url)) {
    const w = window as unknown as {
      __SIG_HANDOFF__?: { nextIssue: number; polls: Record<string, number>; expiredOnceIssued: boolean }
    }
    const state = w.__SIG_HANDOFF__ ?? { nextIssue: 0, polls: {}, expiredOnceIssued: false }
    w.__SIG_HANDOFF__ = state
    state.nextIssue += 1
    const scenario = mockLocationParams().get('mockSignatureHandoff')
    const shouldExpire = scenario === 'expired-once' && !state.expiredOnceIssued
    if (shouldExpire) state.expiredOnceIssued = true
    const token = shouldExpire ? `mock-token-expired-${state.nextIssue}` : `mock-token-${state.nextIssue}`
    state.polls[token] = 0
    return envelope({ token, qrUrl: `https://sign.samhan-air.com/s/${token}`, expiresAt: '2026-06-21T10:10:00' })
  }
  // GET /api/v1/admin/users/{id}/signature/handoff/{token}/status — 폴링 (2번째부터 used, C2.3)
  if (method === 'GET' && /\/api\/v1\/admin\/users\/[^/]+\/signature\/handoff\/[^/]+\/status$/.test(url)) {
    const token = decodeURIComponent(url.match(/\/signature\/handoff\/([^/]+)\/status$/)?.[1] ?? '')
    const w = window as unknown as {
      __SIG_HANDOFF__?: { nextIssue: number; polls: Record<string, number>; expiredOnceIssued: boolean }
    }
    const state = w.__SIG_HANDOFF__ ?? { nextIssue: 0, polls: {}, expiredOnceIssued: false }
    w.__SIG_HANDOFF__ = state
    state.polls[token] = (state.polls[token] ?? 0) + 1
    if (token.startsWith('mock-token-expired-')) {
      return envelope({ used: false, expired: true })
    }
    return envelope({ used: state.polls[token] >= 2, expired: false })
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

  if (method === 'GET' && url.match(/\/admin\/external-carriers(?:\?.*)?$/)) {
    const denied = mockRequirePermission('dispatch.external-carriers', 'view')
    if (denied) return denied
    const queryStart = url.indexOf('?')
    const params = new URLSearchParams(queryStart >= 0 ? url.slice(queryStart + 1) : '')
    const q = (params.get('q') ?? '').trim().toLowerCase()
    const page = Number.parseInt(params.get('page') ?? '0', 10)
    const size = Number.parseInt(params.get('size') ?? '20', 10)
    const filtered = MOCK_EXTERNAL_CARRIERS
      .filter((row) => !row.deleted)
      .filter((row) => !q || row.name.toLowerCase().includes(q) || row.phone.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
    const start = Math.max(0, page) * Math.max(1, size)
    const content = filtered.slice(start, start + Math.max(1, size))
    return envelope({
      content,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / Math.max(1, size))),
      number: Math.max(0, page),
      size: Math.max(1, size),
      first: page <= 0,
      last: start + Math.max(1, size) >= filtered.length,
    })
  }
  if (method === 'POST' && url.match(/\/admin\/external-carriers(?:\?.*)?$/)) {
    const denied = mockRequirePermission('dispatch.external-carriers', 'create')
    if (denied) return denied
    const body = parseMockBody(config)
    const phone = String(body['phone'] ?? '').trim()
    if (MOCK_EXTERNAL_CARRIERS.some((row) => !row.deleted && row.phone === phone)) {
      return mockError(409, 'CONFLICT', '이미 사용 중인 외부기사/배송사 전화번호입니다.')
    }
    const now = new Date().toISOString()
    const created = {
      id: `carrier-${Date.now()}`,
      name: String(body['name'] ?? '').trim(),
      phone,
      email: body['email'] == null ? null : String(body['email']),
      defaultVehicleType: body['defaultVehicleType'] == null ? null : String(body['defaultVehicleType']),
      memo: body['memo'] == null ? null : String(body['memo']),
      active: body['active'] == null ? true : Boolean(body['active']),
      createdAt: now,
      modifiedAt: now,
      deleted: false,
    }
    MOCK_EXTERNAL_CARRIERS.push(created)
    return envelope(created)
  }
  const externalCarrierRestoreMatch = url.match(/\/admin\/external-carriers\/([^/]+)\/restore(?:\?.*)?$/)
  if (method === 'POST' && externalCarrierRestoreMatch) {
    const denied = mockRequirePermission('dispatch.external-carriers', 'restore')
    if (denied) return denied
    const id = decodeURIComponent(externalCarrierRestoreMatch[1]!)
    const row = MOCK_EXTERNAL_CARRIERS.find((item) => item.id === id)
    if (!row) return mockError(404, 'NOT_FOUND', '외부기사/배송사를 찾을 수 없습니다.')
    if (MOCK_EXTERNAL_CARRIERS.some((item) => item.id !== id && !item.deleted && item.phone === row.phone)) {
      return mockError(409, 'CONFLICT', '동일 전화번호의 활성 외부기사/배송사가 이미 존재합니다.')
    }
    row.deleted = false
    row.modifiedAt = new Date().toISOString()
    return envelope(row)
  }
  const externalCarrierDetailMatch = url.match(/\/admin\/external-carriers\/([^/?]+)(?:\?.*)?$/)
  if (method === 'GET' && externalCarrierDetailMatch) {
    const denied = mockRequirePermission('dispatch.external-carriers', 'view')
    if (denied) return denied
    const id = decodeURIComponent(externalCarrierDetailMatch[1]!)
    const row = MOCK_EXTERNAL_CARRIERS.find((item) => item.id === id && !item.deleted)
    return row ? envelope(row) : mockError(404, 'NOT_FOUND', '외부기사/배송사를 찾을 수 없습니다.')
  }
  if (method === 'PATCH' && externalCarrierDetailMatch) {
    const denied = mockRequirePermission('dispatch.external-carriers', 'update')
    if (denied) return denied
    const id = decodeURIComponent(externalCarrierDetailMatch[1]!)
    const row = MOCK_EXTERNAL_CARRIERS.find((item) => item.id === id && !item.deleted)
    if (!row) return mockError(404, 'NOT_FOUND', '외부기사/배송사를 찾을 수 없습니다.')
    const body = parseMockBody(config)
    const nextPhone = body['phone'] == null ? row.phone : String(body['phone']).trim()
    if (nextPhone !== row.phone && MOCK_EXTERNAL_CARRIERS.some((item) => item.id !== id && !item.deleted && item.phone === nextPhone)) {
      return mockError(409, 'CONFLICT', '이미 사용 중인 외부기사/배송사 전화번호입니다.')
    }
    // PATCH 시맨틱: null=미변경, ""=클리어(null), 값=trim 설정. 필수 name 은 blank 면 기존 유지.
    row.name = body['name'] == null ? row.name : (String(body['name']).trim() || row.name)
    row.phone = nextPhone
    row.email = body['email'] == null ? row.email : (String(body['email']).trim() || null)
    row.defaultVehicleType =
      body['defaultVehicleType'] == null
        ? row.defaultVehicleType
        : (String(body['defaultVehicleType']).trim() || null)
    row.memo = body['memo'] == null ? row.memo : (String(body['memo']).trim() || null)
    row.active = body['active'] == null ? row.active : Boolean(body['active'])
    row.modifiedAt = new Date().toISOString()
    return envelope(row)
  }
  if (method === 'DELETE' && externalCarrierDetailMatch) {
    const denied = mockRequirePermission('dispatch.external-carriers', 'delete')
    if (denied) return denied
    const id = decodeURIComponent(externalCarrierDetailMatch[1]!)
    const row = MOCK_EXTERNAL_CARRIERS.find((item) => item.id === id && !item.deleted)
    if (!row) return mockError(404, 'NOT_FOUND', '외부기사/배송사를 찾을 수 없습니다.')
    row.deleted = true
    row.modifiedAt = new Date().toISOString()
    return envelope(null)
  }

  // ---------------------------------------------------------------------------
  // 출고전표 마감시간 설정 (hr.slip-cutoff) — /admin/slip-cutoffs
  // 핸들러 3원칙: parseMockBody / non-null envelope / blob 없음
  // ---------------------------------------------------------------------------

  // GET /admin/slip-cutoffs/delivery-tags — OUTBOUND 배송태그 전체 옵션
  if (method === 'GET' && url.match(/\/admin\/slip-cutoffs\/delivery-tags(?:\?.*)?$/)) {
    const denied = mockRequirePermission('hr.slip-cutoff', 'view')
    if (denied) return denied
    return envelope(MOCK_DELIVERY_TAGS)
  }

  // GET /admin/slip-cutoffs — 목록 조회
  if (method === 'GET' && url.match(/\/admin\/slip-cutoffs(?:\?.*)?$/)) {
    const denied = mockRequirePermission('hr.slip-cutoff', 'view')
    if (denied) return denied
    const rows = MOCK_SLIP_CUTOFFS.filter((r) => !r.deleted)
    return envelope(rows)
  }

  // POST /admin/slip-cutoffs — 등록 (중복 태그 409)
  if (method === 'POST' && url.match(/\/admin\/slip-cutoffs(?:\?.*)?$/)) {
    const denied = mockRequirePermission('hr.slip-cutoff', 'create')
    if (denied) return denied
    const body = parseMockBody(config)
    const deliveryTag = String(body['deliveryTag'] ?? '').trim()
    const cutoffTime = String(body['cutoffTime'] ?? '').trim()
    const active = body['active'] !== false
    if (!deliveryTag) return mockError(400, 'INVALID_INPUT', '배송태그는 필수입니다.')
    if (!cutoffTime) return mockError(400, 'INVALID_INPUT', '마감시각은 필수입니다.')
    if (MOCK_SLIP_CUTOFFS.some((r) => !r.deleted && r.deliveryTag === deliveryTag)) {
      const label = OUTBOUND_TAG_LABELS[deliveryTag] ?? deliveryTag
      return mockError(409, 'CONFLICT', `${label} 태그의 마감시간이 이미 설정되어 있습니다.`)
    }
    const created: MockSlipCutoff = {
      id: `cutoff-${deliveryTag.toLowerCase().replace(/_/g, '-')}-${Date.now()}`,
      deliveryTag,
      deliveryTagLabel: OUTBOUND_TAG_LABELS[deliveryTag] ?? deliveryTag,
      cutoffTime,
      active,
      createdAt: new Date().toISOString(),
      modifiedAt: null,
    }
    MOCK_SLIP_CUTOFFS.push(created)
    return envelope(created)
  }

  // PATCH /admin/slip-cutoffs/{id} — 수정 (시각/활성)
  const slipCutoffDetailMatch = url.match(/\/admin\/slip-cutoffs\/([^/?]+)(?:\?.*)?$/)
  if (method === 'PATCH' && slipCutoffDetailMatch) {
    const denied = mockRequirePermission('hr.slip-cutoff', 'update')
    if (denied) return denied
    const id = decodeURIComponent(slipCutoffDetailMatch[1]!)
    const row = MOCK_SLIP_CUTOFFS.find((r) => r.id === id && !r.deleted)
    if (!row) return mockError(404, 'NOT_FOUND', '마감시간 설정을 찾을 수 없습니다.')
    const body = parseMockBody(config)
    if (body['cutoffTime'] != null) row.cutoffTime = String(body['cutoffTime'])
    if (body['active'] != null) row.active = Boolean(body['active'])
    row.modifiedAt = new Date().toISOString()
    return envelope({ ...row })
  }

  // DELETE /admin/slip-cutoffs/{id} — Soft Delete
  if (method === 'DELETE' && slipCutoffDetailMatch) {
    const denied = mockRequirePermission('hr.slip-cutoff', 'delete')
    if (denied) return denied
    const id = decodeURIComponent(slipCutoffDetailMatch[1]!)
    const row = MOCK_SLIP_CUTOFFS.find((r) => r.id === id && !r.deleted)
    if (!row) return mockError(404, 'NOT_FOUND', '마감시간 설정을 찾을 수 없습니다.')
    row.deleted = true
    row.modifiedAt = new Date().toISOString()
    return envelope(null)
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
    const body = parseMockBody(config) as {
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
    const body = parseMockBody(config) as {
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
   *
   * 신규 필드(spec §2a):
   * - tel / fax: 대표 전화 / 팩스
   * - bankAccounts: 입금계좌 목록 (replace-all, displayOrder 배열 순)
   * - hasStamp: 인감 등록 여부 (초기 false)
   * - stampPngBase64: 인감 PNG base64 (목록은 null, detail/primary 는 실 값)
   * - representativeName: 대표자 성명 (BE DTO 필드명 일치 — ceoName 대체)
   * - businessAddress: 사업장 주소 (BE DTO 필드명 일치 — address 대체)
   *
   * UUID 비공개 가드: id 는 내부 경로용. 화면은 businessNumber / companyName 표시.
   */
  const MOCK_SUPPLIER_PRIMARY = {
    id: '00000000-0000-0000-0000-supplier0001',
    version: 0,
    businessNumber: '2148720659',
    subBusinessNumber: null,
    companyName: '(주)삼한공조시스템',
    representativeName: '김미선',
    businessAddress: '서울특별시 서초구 마방로2길 9 (양재동) 삼한빌딩 4층',
    businessType: '도매 및 소매업',
    businessItem: '공조설비, 냉난방기',
    email: 'accounting@samhan-air.com',
    isPrimary: true,
    tel: '02-3461-0000',
    fax: '02-3461-0001',
    bankAccounts: [] as Array<{
      accountHolder: string
      bankName: string
      accountNumber: string
      displayOrder: number
      exposed: boolean
    }>,
    hasStamp: false,
    stampPngBase64: null as string | null,
    hasLogo: false,
    logoPngBase64: null as string | null,
  }

  // 첫 접근 시 seed 1건 주입 (테스트별 fresh page → 모듈 재평가로 재seed).
  // Fix 2: seed에 계좌 1건(exposed=true) + 인감 stub base64 포함 — TC-SP-10 런타임 단언 지원.
  const STUB_STAMP_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  if (mockSupplierProfileList.length === 0) {
    mockSupplierProfileList.push({
      ...MOCK_SUPPLIER_PRIMARY,
      bankAccounts: [
        {
          accountHolder: '삼한공조시스템',
          bankName: '국민은행',
          accountNumber: '123456-78-901234',
          displayOrder: 0,
          exposed: true,
        },
      ],
      hasStamp: true,
      stampPngBase64: STUB_STAMP_BASE64,
    })
  }

  // stamp PUT/DELETE 는 id match 패턴보다 앞에 위치해야 함 (더 구체적인 경로)
  // PUT /accounting/supplier-profiles/{id}/stamp → 인감 업로드/교체
  const supplierStampPutMatch = url.match(/\/accounting\/supplier-profiles\/([^/]+)\/stamp$/)
  if (method === 'PUT' && supplierStampPutMatch) {
    const stampId = supplierStampPutMatch[1]!
    const body = parseMockBody(config) as { stampPngBase64: string; stampHash: string }
    const idx = mockSupplierProfileList.findIndex((p) => p['id'] === stampId)
    if (idx < 0) {
      return mockError(404, 'NOT_FOUND', '사업자 정보를 찾을 수 없습니다.')
    }
    mockSupplierProfileList[idx] = {
      ...mockSupplierProfileList[idx],
      hasStamp: true,
      stampPngBase64: body.stampPngBase64 ?? null,
    }
    return envelope(mockSupplierProfileList[idx])
  }

  // DELETE /accounting/supplier-profiles/{id}/stamp → 인감 삭제
  const supplierStampDeleteMatch = url.match(/\/accounting\/supplier-profiles\/([^/]+)\/stamp$/)
  if (method === 'DELETE' && supplierStampDeleteMatch) {
    const stampId = supplierStampDeleteMatch[1]!
    const idx = mockSupplierProfileList.findIndex((p) => p['id'] === stampId)
    if (idx >= 0) {
      mockSupplierProfileList[idx] = {
        ...mockSupplierProfileList[idx],
        hasStamp: false,
        stampPngBase64: null,
      }
    }
    return envelope({ deleted: true })
  }

  // PUT /accounting/supplier-profiles/{id}/logo → 로고 업로드/교체 (stamp 패턴 동형)
  const supplierLogoPutMatch = url.match(/\/accounting\/supplier-profiles\/([^/]+)\/logo$/)
  if (method === 'PUT' && supplierLogoPutMatch) {
    const logoId = supplierLogoPutMatch[1]!
    const body = parseMockBody(config) as { logoPngBase64: string; logoHash: string }
    const idx = mockSupplierProfileList.findIndex((p) => p['id'] === logoId)
    if (idx < 0) {
      return mockError(404, 'NOT_FOUND', '사업자 정보를 찾을 수 없습니다.')
    }
    mockSupplierProfileList[idx] = {
      ...mockSupplierProfileList[idx],
      hasLogo: true,
      logoPngBase64: body.logoPngBase64 ?? null,
    }
    return envelope(mockSupplierProfileList[idx])
  }

  // DELETE /accounting/supplier-profiles/{id}/logo → 로고 삭제 (stamp 패턴 동형)
  const supplierLogoDeleteMatch = url.match(/\/accounting\/supplier-profiles\/([^/]+)\/logo$/)
  if (method === 'DELETE' && supplierLogoDeleteMatch) {
    const logoId = supplierLogoDeleteMatch[1]!
    const idx = mockSupplierProfileList.findIndex((p) => p['id'] === logoId)
    if (idx >= 0) {
      mockSupplierProfileList[idx] = {
        ...mockSupplierProfileList[idx],
        hasLogo: false,
        logoPngBase64: null,
      }
    }
    return envelope({ deleted: true })
  }

  // GET /accounting/supplier-profiles/print-profile → primary 공개 정보 (권한 게이트 없음)
  // ※ 반드시 GET /{id} 정규식 핸들러보다 앞에 위치해야 함 — 'print-profile' 이 [^/]+ 에 매칭되어
  //   상세 핸들러가 가로채는 것을 방지. exposed=true 계좌만 반환 (BE 동형).
  if (method === 'GET' && url.endsWith('/accounting/supplier-profiles/print-profile')) {
    const primary = mockSupplierProfileList.find((p) => p['isPrimary']) ?? MOCK_SUPPLIER_PRIMARY
    const accounts = ((primary['bankAccounts'] as unknown[]) ?? []).filter(
      (a) => (a as Record<string, unknown>)['exposed'] !== false,
    )
    return envelope({
      companyName: primary['companyName'],
      businessNumber: primary['businessNumber'],
      subBusinessNumber: primary['subBusinessNumber'] ?? null,
      representativeName: primary['representativeName'],
      businessAddress: primary['businessAddress'],
      businessType: primary['businessType'],
      businessItem: primary['businessItem'],
      email: primary['email'],
      tel: primary['tel'] ?? null,
      fax: primary['fax'] ?? null,
      bankAccounts: accounts,
      stampPngBase64: primary['stampPngBase64'] ?? null,
      logoPngBase64: primary['logoPngBase64'] ?? null,
    })
  }

  // GET /accounting/supplier-profiles/primary → 기본 사업자 (stamp/logo payload 포함)
  // ※ 반드시 GET /{id} 정규식 핸들러보다 앞에 위치해야 함 (동일 이유)
  if (method === 'GET' && url.endsWith('/accounting/supplier-profiles/primary')) {
    const primary = mockSupplierProfileList.find((p) => p['isPrimary']) ?? MOCK_SUPPLIER_PRIMARY
    return envelope(primary)
  }

  // GET /accounting/supplier-profiles/{id} 상세 → stamp/logo payload 포함 전체 반환
  // ※ /primary, /print-profile 리터럴 핸들러 뒤에 위치해야 함 — 'primary'/'print-profile' 문자열이
  //   [^/]+ 에 매칭되어 리터럴 핸들러를 dead code 로 만드는 버그 방지.
  //   안전망: detailId 가 리터럴 예약어와 같으면 skip 가드 적용.
  const supplierDetailMatch = url.match(/\/accounting\/supplier-profiles\/([^/]+)$/)
  if (method === 'GET' && supplierDetailMatch) {
    const detailId = supplierDetailMatch[1]!
    if (detailId === 'primary' || detailId === 'print-profile') {
      // 리터럴 핸들러가 위에서 이미 처리했어야 하는 경로 — 여기 도달 시 미매칭으로 처리
      return null
    }
    const found = mockSupplierProfileList.find((p) => p['id'] === detailId)
    if (!found) {
      return mockError(404, 'NOT_FOUND', '사업자 정보를 찾을 수 없습니다.')
    }
    return envelope(found)
  }

  // GET /accounting/supplier-profiles → 목록 (stamp/logo payload 제외 — hasStamp/hasLogo 만)
  if (method === 'GET' && url.endsWith('/accounting/supplier-profiles')) {
    return envelope(
      [...mockSupplierProfileList].map((p) => {
        const { stampPngBase64: _stamp, logoPngBase64: _logo, ...rest } = p as Record<string, unknown>
        void _stamp // 목록 응답에서 stamp payload 제외
        void _logo // 목록 응답에서 logo payload 제외
        return rest
      }),
    )
  }

  // POST /accounting/supplier-profiles → 신규 등록 (목록에 실제 append)
  if (method === 'POST' && url.endsWith('/accounting/supplier-profiles')) {
    const body = parseMockBody(config) as Record<string, unknown>
    const rawAccounts = (body['bankAccounts'] as unknown[] | undefined) ?? []
    // Fix 4: 빈 필드 검증 — BE @NotBlank 동형 400 반환
    const blankIdx = rawAccounts.findIndex((a) => {
      const acct = a as Record<string, unknown>
      return !String(acct['accountHolder'] ?? '').trim() || !String(acct['bankName'] ?? '').trim() || !String(acct['accountNumber'] ?? '').trim()
    })
    if (blankIdx >= 0) {
      return mockError(400, 'INVALID_INPUT', `${blankIdx + 1}번째 계좌의 예금주·은행명·계좌번호를 모두 입력해 주세요.`)
    }
    // exposed 기본값 true 채움, displayOrder = 배열 index (BE 동형)
    const bankAccounts = rawAccounts.map((a, i) => {
      const acct = a as Record<string, unknown>
      return {
        accountHolder: acct['accountHolder'] ?? '',
        bankName: acct['bankName'] ?? '',
        accountNumber: acct['accountNumber'] ?? '',
        displayOrder: i,
        exposed: acct['exposed'] !== false,
      }
    })
    const created: Record<string, unknown> = {
      ...MOCK_SUPPLIER_PRIMARY,
      ...body,
      id: `00000000-0000-0000-0000-supplier${Date.now()}`,
      version: 0,
      isPrimary: false,
      hasStamp: false,
      stampPngBase64: null,
      hasLogo: false,
      logoPngBase64: null,
      bankAccounts,
    }
    mockSupplierProfileList.push(created)
    return envelope(created)
  }

  // PUT /accounting/supplier-profiles/{id} → echo 수정 (bankAccounts replace-all)
  // ※ stamp/logo/mark-primary 경로보다 아래에 위치 (정규식 중복 방지)
  const supplierPutMatch = url.match(/\/accounting\/supplier-profiles\/([^/]+)$/)
  if (method === 'PUT' && supplierPutMatch) {
    const body = parseMockBody(config) as Record<string, unknown>
    const updatedId = supplierPutMatch[1]!
    const idx = mockSupplierProfileList.findIndex((p) => p['id'] === updatedId)
    const base = idx >= 0 ? (mockSupplierProfileList[idx] as Record<string, unknown>) : (MOCK_SUPPLIER_PRIMARY as unknown as Record<string, unknown>)
    const rawAccounts = (body['bankAccounts'] as unknown[] | undefined) ?? (base['bankAccounts'] as unknown[]) ?? []
    // Fix 4: 빈 필드 검증 — BE @NotBlank 동형 400 반환
    const blankPutIdx = rawAccounts.findIndex((a) => {
      const acct = a as Record<string, unknown>
      return !String(acct['accountHolder'] ?? '').trim() || !String(acct['bankName'] ?? '').trim() || !String(acct['accountNumber'] ?? '').trim()
    })
    if (blankPutIdx >= 0) {
      return mockError(400, 'INVALID_INPUT', `${blankPutIdx + 1}번째 계좌의 예금주·은행명·계좌번호를 모두 입력해 주세요.`)
    }
    // exposed 기본값 true 채움, displayOrder = 배열 index 재계산 (BE 동형)
    const bankAccounts = rawAccounts.map((a, i) => {
      const acct = a as Record<string, unknown>
      return {
        accountHolder: acct['accountHolder'] ?? '',
        bankName: acct['bankName'] ?? '',
        accountNumber: acct['accountNumber'] ?? '',
        displayOrder: i,
        exposed: acct['exposed'] !== false,
      }
    })
    const updated: Record<string, unknown> = {
      ...base,
      ...body,
      id: updatedId,
      bankAccounts,
    }
    if (idx >= 0) mockSupplierProfileList[idx] = updated
    return envelope(updated)
  }

  // PATCH /accounting/supplier-profiles/{id}/primary → 목록 전체 isPrimary swap (P2-1)
  const supplierMarkPrimaryMatch = url.match(/\/accounting\/supplier-profiles\/([^/]+)\/primary$/)
  if (method === 'PATCH' && supplierMarkPrimaryMatch) {
    const targetId = supplierMarkPrimaryMatch[1]!
    let target: Record<string, unknown> | null = null
    mockSupplierProfileList.forEach((p) => {
      const isTarget = p['id'] === targetId
      p['isPrimary'] = isTarget
      if (isTarget) target = p as Record<string, unknown>
    })
    return envelope(target ?? { ...MOCK_SUPPLIER_PRIMARY, isPrimary: true, id: targetId })
  }

  // DELETE /accounting/supplier-profiles/{id} → primary 는 삭제 거부(BusinessException), 그 외 목록에서 제거
  const supplierDeleteMatch = url.match(/\/accounting\/supplier-profiles\/([^/]+)$/)
  if (method === 'DELETE' && supplierDeleteMatch) {
    const delId = supplierDeleteMatch[1]!
    const target = mockSupplierProfileList.find((p) => p['id'] === delId)
    if (target && target['isPrimary']) {
      return mockError(409, 'SUPPLIER_PRIMARY_DELETE_FORBIDDEN', '기본 사업자는 삭제할 수 없습니다. 먼저 다른 사업자를 기본으로 지정하세요.')
    }
    const idx = mockSupplierProfileList.findIndex((p) => p['id'] === delId)
    if (idx >= 0) mockSupplierProfileList.splice(idx, 1)
    // 주의: 어댑터(client.ts)는 getMockResponse 가 null 이면 "미매칭"으로 보고 실 HTTP 로 fallthrough 한다.
    // 따라서 204 라도 null 반환 금지 — non-null envelope 로 성공을 알린다(삭제 mutation 은 body 무시).
    return envelope({ deleted: true })
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
      taxInvoiceNo: found.taxInvoiceNo ?? `2026/05/19-${String(Date.now()).slice(-4)}`,
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
    const req = parseMockBody(config) as Record<string, unknown>
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
    if (mockLocationParams().get('mockNts502') === '1') {
      return mockError(502, 'ETAX_SUBMIT_FAILED', 'NTS 외부 서비스에 일시적 오류가 발생했습니다.')
    }
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
    const req = parseMockBody(config) as Record<string, unknown>
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
    const req = parseMockBody(config) as Record<string, unknown>
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

  const mockDailyClosingRow = {
    closingKind: 'SALES' as const,
    sourceKind: 'TAX_INVOICE' as const,
    closingDate: '2026-06-07',
    partnerCode: null,
    totalSupply: '1000000',
    totalVat: '100000',
    totalAmount: '1100000',
    slipCount: 3,
    isLocked: true,
    lockedAt: '2026-06-07T18:00:00+09:00',
    lockedBy: 'system',
  }

  // GET/POST/PATCH /accounting/daily-closings — DailyClosingPage mock runtime contract.
  if (method === 'GET' && url.includes('/accounting/daily-closings')) {
    return envelope({
      content: [mockDailyClosingRow],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
  }
  if (method === 'POST' && url.endsWith('/accounting/daily-closings')) {
    const req = parseMockBody(config) as Record<string, unknown>
    return envelope({
      ...mockDailyClosingRow,
      closingKind: req['closingKind'] === 'PURCHASE' ? 'PURCHASE' : mockDailyClosingRow.closingKind,
      sourceKind: typeof req['sourceKind'] === 'string' ? req['sourceKind'] : mockDailyClosingRow.sourceKind,
      closingDate: typeof req['closingDate'] === 'string' ? req['closingDate'] : mockDailyClosingRow.closingDate,
      partnerCode: typeof req['partnerCode'] === 'string' ? req['partnerCode'] : null,
      lockedAt: new Date().toISOString(),
    })
  }
  if (method === 'PATCH' && /\/accounting\/daily-closings\/[^/]+\/lock$/.test(url)) {
    return envelope({
      ...mockDailyClosingRow,
      isLocked: false,
      lockedAt: null,
      lockedBy: null,
    })
  }

  // GET /accounting/closings/daily — DailyClosingPage detail.
  if (method === 'GET' && url.includes('/accounting/closings/daily')) {
    const date = (config.params?.['date'] ?? '2026-06-07') as string
    return envelope({
      date,
      totalTaxInvoiceCount: 1,
      totalSupply: '1000000',
      totalVat: '100000',
      totalAmount: '1100000',
      totalDiscount: '0',
      taxInvoices: [
        {
          taxInvoiceNo: 'TI-20260607-001',
          salesSlipNo: 'SA-20260607-001',
          sourceSlipNo: '2026/06/07-1',
          bizNo: '1112233333',
          partnerName: '삼한거래처',
          supplyAmount: '1000000',
          vatAmount: '100000',
          totalAmount: '1100000',
        },
      ],
      productSummaries: [
        {
          productName: '시스템에어컨',
          modelName: '4Way',
          quantity: '1',
          supplyAmount: '1000000',
        },
      ],
    })
  }

  // GET /accounting/ledgers — GeneralLedgerPage.
  if (method === 'GET' && url.includes('/accounting/ledgers')) {
    const from = (config.params?.['from'] ?? '2026-06-01') as string
    const to = (config.params?.['to'] ?? '2026-06-30') as string
    return envelope({
      periodFrom: from,
      periodTo: to,
      partnerCode: (config.params?.['partnerCode'] as string | undefined) ?? null,
      totalDebit: '4000000',
      totalCredit: '4000000',
      closingBalance: '0',
      lines: [
        {
          date: '2026-06-10',
          journalNo: 'JV-2026/06-001',
          accountCode: '102',
          accountName: '보통예금',
          accountCategory: 'ASSET',
          accountCategoryDisplayName: '자산',
          balanceDirection: 'DEBIT',
          balanceDirectionDisplayName: '차변잔액',
          bizNo: '1112233333',
          partnerCode: 'P-FUND-001',
          description: '외상매출금 회수',
          debit: '4000000',
          credit: '0',
          balance: '4000000',
        },
      ],
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
    return envelope([
      {
        partnerCode: 'P-001',
        bizNo: '1234567890',
        partnerName: '엘에이시스템에어',
        salesTotal: '12450000',
        paymentTotal: '8200000',
        receivableBalance: '4250000',
        periodFrom: '2026-04-01',
        periodTo: '2026-04-30',
      },
      {
        partnerCode: 'P-002',
        bizNo: '2345678901',
        partnerName: '강남에어솔루션',
        salesTotal: '8700000',
        paymentTotal: '8700000',
        receivableBalance: '0',
        periodFrom: '2026-04-01',
        periodTo: '2026-04-30',
      },
      {
        partnerCode: 'P-003',
        bizNo: '3456789012',
        partnerName: '한빛쾌적',
        salesTotal: '5500000',
        paymentTotal: '0',
        receivableBalance: '5500000',
        periodFrom: '2026-04-01',
        periodTo: '2026-04-30',
      },
    ])
  }

  // GET /accounting/journals/ledger-data — PartnerLedger detail
  if (method === 'GET' && url.includes('/accounting/journals/ledger-data')) {
    return envelope({
      partnerCode: '1234567890',
      partnerName: '엘에이시스템에어',
      partnerBusinessNo: '123-45-67890',
      chatRoomNames: ['서울 1톤 단톡방'],
      periodFrom: '2026-04-01',
      periodTo: '2026-04-30',
      lines: [
        { date: '2026-04-05', journalNo: 'JV-2026/04-001', accountCode: '110', description: '4월 1주 출고', debit: '3700000', credit: '0', balance: '3700000' },
        { date: '2026-04-12', journalNo: 'JV-2026/04-002', accountCode: '110', description: '계좌이체 입금', debit: '0', credit: '2000000', balance: '1700000' },
        { date: '2026-04-19', journalNo: 'JV-2026/04-003', accountCode: '110', description: '4월 3주 출고', debit: '4750000', credit: '0', balance: '6450000' },
        { date: '2026-04-26', journalNo: 'JV-2026/04-004', accountCode: '110', description: '계좌이체 입금', debit: '0', credit: '2200000', balance: '4250000' },
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

  if (method === 'GET' && url.match(/\/admin\/dispatch-board\/undispatched-slips(?:\?.*)?$/)) {
    const denied = mockRequirePermission('dispatch.board', 'view')
    if (denied) return denied
    const content = MOCK_DISPATCH_READY_SLIPS.filter((slip) => slip.dispatchStatus === 'UNDISPATCHED')
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

  if (method === 'POST' && url.match(/\/admin\/external-dispatches(?:\?.*)?$/)) {
    const denied = mockRequirePermission('dispatch.board', 'create')
    if (denied) return denied
    const body = parseMockBody(config)
    const carrierId = String(body['carrierId'] ?? '')
    const slipIds = Array.isArray(body['slipIds']) ? body['slipIds'].map(String) : []
    const channel = String(body['channel'] ?? 'SMS')
    if (!['SMS', 'PRINT', 'BOTH'].includes(channel)) {
      return mockError(400, 'INVALID_INPUT', '타배송사 발송 채널은 SMS, PRINT, BOTH 만 지원합니다.')
    }
    const externalChannel = channel as 'SMS' | 'PRINT' | 'BOTH'
    if (!carrierId) return mockError(400, 'INVALID_INPUT', '외부기사/배송사를 선택하세요.')
    if (slipIds.length === 0) return mockError(400, 'INVALID_INPUT', '발송할 전표를 선택하세요.')
    const carrier = MOCK_EXTERNAL_CARRIERS.find((row) => row.id === carrierId && !row.deleted && row.active)
    if (!carrier) return mockError(404, 'NOT_FOUND', '외부기사/배송사를 찾을 수 없습니다.')
    const selected = MOCK_DISPATCH_READY_SLIPS.filter((slip) => slipIds.includes(slip.id))
    if (selected.length !== slipIds.length) {
      return mockError(404, 'NOT_FOUND', '발송 대상 전표 중 찾을 수 없는 전표가 있습니다.')
    }
    const notReady = selected.find((slip) => slip.dispatchStatus !== 'UNDISPATCHED')
    if (notReady) {
      return mockError(409, 'CONFLICT', `미배차 상태의 출고전표만 발송할 수 있습니다: ${notReady.slipNo}`)
    }
    // BE 와 동일하게 SMS 실패도 HTTP 200 + status='FAILED' 로 응답한다(graceful, 재시도 가능).
    // 이름에 '[발송실패]' 를 포함한 carrier 로 FAILED 분기를 시뮬레이션해 FE 거짓양성 회귀를 검증한다.
    const sent = externalChannel === 'PRINT' || !carrier.name.includes('[발송실패]')
    if (sent) {
      selected.forEach((slip) => {
        slip.dispatchStatus = 'DISPATCHED'
      })
    }
    const id = `external-dispatch-${Date.now()}`
    const response = {
      id,
      carrierName: carrier.name,
      channel: externalChannel,
      dispatchDate: mockTodayIsoSeoul(),
      sentAt: sent ? new Date().toISOString() : null,
      status: sent ? 'SENT' : 'FAILED',
      slipCount: selected.length,
      slipNos: selected.map((slip) => slip.slipNo),
    }
    MOCK_EXTERNAL_DISPATCH_PRINT_DATA.set(id, {
      carrierName: carrier.name,
      carrierPhone: carrier.phone,
      dispatchDate: response.dispatchDate,
      channel: externalChannel,
      items: selected.map((slip, index) => ({
        slipNo: slip.slipNo,
        deliveryAddress: slip.deliveryAddress,
        recipientName: slip.partnerName,
        recipientPhone: slip.recipientPhone,
        itemSummary: index === 0 ? 'AJ040 2대' : 'AJ060 1대',
        sequence: index + 1,
      })),
    })
    return envelope(response)
  }

  const externalDispatchPrintMatch = url.match(/\/admin\/external-dispatches\/([^/]+)\/print-data(?:\?.*)?$/)
  if (method === 'GET' && externalDispatchPrintMatch) {
    const denied = mockRequirePermission('dispatch.board', 'view')
    if (denied) return denied
    const id = decodeURIComponent(externalDispatchPrintMatch[1]!)
    const data = MOCK_EXTERNAL_DISPATCH_PRINT_DATA.get(id)
    if (!data) return mockError(404, 'NOT_FOUND', '타배송사 발송 이력을 찾을 수 없습니다.')
    return envelope(data)
  }

  if (method === 'POST' && url.match(/\/admin\/dispatch-tasks(?:\?.*)?$/)) {
    const denied = mockRequirePermission('dispatch.board', 'update')
    if (denied) return denied
    const body = parseMockBody(config)
    const dispatchDate = String(body['dispatchDate'] ?? mockTodayIsoSeoul())
    const nextSequence = mockDispatchTaskCreateSequence++
    const created: DispatchTaskResponse = {
      id: `11111111-dddd-4ddd-8ddd-${String(nextSequence).padStart(12, '0')}`,
      taskCode: mockTaskCode(dispatchDate, String(nextSequence)),
      dispatchDate,
      status: 'DRAFT',
      arologisDispatchId: null,
      failureReason: null,
      memo: null,
      modificationReason: null,
      rejectionReason: null,
      modificationRequestedAt: null,
      modificationDecidedAt: null,
      duplicateSlipIds: [],
      vehicleGroups: [],
      matchedDrivers: [],
    }
    MOCK_DISPATCH_TASK_DETAILS.push(created)
    return envelope(created)
  }

  if (method === 'POST' && url.match(/\/admin\/dispatch-tasks\/today-draft(?:\?.*)?$/)) {
    const denied = mockRequirePermission('dispatch.board', 'update')
    if (denied) return denied
    const body = parseMockBody(config)
    const dispatchDate = String(body['dispatchDate'] ?? mockTodayIsoSeoul())
    const existing = [...MOCK_DISPATCH_TASK_DETAILS]
      .reverse()
      .find((task) => task.dispatchDate === dispatchDate && task.status === 'DRAFT')
    if (existing) {
      return envelope(existing)
    }
    const nextSequence = mockDispatchTaskCreateSequence++
    const created: DispatchTaskResponse = {
      id: `11111111-dddd-4ddd-8ddd-${String(nextSequence).padStart(12, '0')}`,
      taskCode: mockTaskCode(dispatchDate, String(nextSequence)),
      dispatchDate,
      status: 'DRAFT',
      arologisDispatchId: null,
      failureReason: null,
      memo: null,
      modificationReason: null,
      rejectionReason: null,
      modificationRequestedAt: null,
      modificationDecidedAt: null,
      duplicateSlipIds: [],
      vehicleGroups: [],
      matchedDrivers: [],
    }
    MOCK_DISPATCH_TASK_DETAILS.push(created)
    return envelope(created)
  }

  const addDispatchVehicleGroupMatch = url.match(
    /\/admin\/dispatch-tasks\/([^/?]+)\/vehicle-groups(?:\?.*)?$/,
  )
  if (method === 'POST' && addDispatchVehicleGroupMatch) {
    const denied = mockRequirePermission('dispatch.board', 'update')
    if (denied) return denied
    const taskId = decodeURIComponent(addDispatchVehicleGroupMatch[1]!)
    const task = MOCK_DISPATCH_TASK_DETAILS.find((item) => item.id === taskId)
    if (!task) {
      return mockError(404, 'NOT_FOUND', 'DispatchTask 를 찾을 수 없습니다.')
    }
    if (task.status !== 'DRAFT') {
      return mockError(409, 'CONFLICT', `배차 작업 편집은 DRAFT 상태에서만 가능합니다 — 현재=${task.status}`)
    }

    const body = parseMockBody(config) as Partial<AddVehicleGroupPayload>
    const vehicleBodyType = body.vehicleBodyType as DispatchVehicleBodyType | undefined
    const tonnage = (body.tonnage ?? null) as DispatchTonnage | null
    recordMockAddVehicleGroupBody({ vehicleBodyType, tonnage })

    if (!vehicleBodyType) {
      return mockError(400, 'INVALID_INPUT', 'vehicleBodyType 은 필수입니다.')
    }
    const allowedTonnages = getAllowedDispatchTonnages(vehicleBodyType)
    if (allowedTonnages === null) {
      return mockError(400, 'INVALID_INPUT', '선택할 수 없는 차종입니다.')
    }
    if (tonnage !== null && !TONNAGE_OPTIONS.includes(tonnage)) {
      return mockError(400, 'INVALID_INPUT', '선택할 수 없는 톤수입니다.')
    }
    if (allowedTonnages.length === 0 && tonnage !== null) {
      return mockError(400, 'INVALID_INPUT', '소형 차종은 tonnage 불필요')
    }
    if (allowedTonnages.length > 0 && (tonnage === null || !allowedTonnages.includes(tonnage))) {
      return mockError(400, 'INVALID_INPUT', '허용되지 않은 차종/톤수 조합')
    }

    const sequence = task.vehicleGroups.length + 1
    const vehicleType = mockDeriveLegacyVehicleType(vehicleBodyType, tonnage)
    const created: DispatchVehicleGroupResponse = {
      id: `33333333-dddd-4ddd-8ddd-${String(mockDispatchVehicleGroupCreateSequence++).padStart(12, '0')}`,
      vehicleType,
      vehicleTypeDisplay: DISPATCH_VEHICLE_TYPE_LABEL[vehicleType],
      vehicleBodyType,
      vehicleBodyTypeDisplay: DISPATCH_VEHICLE_BODY_TYPE_LABEL[vehicleBodyType],
      tonnage,
      tonnageDisplay: tonnage ? DISPATCH_TONNAGE_LABEL[tonnage] : null,
      dispatchStatus: 'PENDING',
      sequence,
      slips: [],
    }
    task.vehicleGroups.push(created)
    return envelope(created)
  }

  const assignDispatchSlipMatch = url.match(
    /\/admin\/dispatch-tasks\/([^/?]+)\/vehicle-groups\/([^/?]+)\/slips(?:\?.*)?$/,
  )
  if (method === 'POST' && assignDispatchSlipMatch) {
    const denied = mockRequirePermission('dispatch.board', 'update')
    if (denied) return denied
    const taskId = decodeURIComponent(assignDispatchSlipMatch[1]!)
    const groupId = decodeURIComponent(assignDispatchSlipMatch[2]!)
    const task = MOCK_DISPATCH_TASK_DETAILS.find((item) => item.id === taskId)
    const group = task?.vehicleGroups.find((item) => item.id === groupId)
    if (!task || !group) {
      return mockError(404, 'NOT_FOUND', 'DispatchTask 차량 그룹이 존재하지 않습니다.')
    }
    if (group.dispatchStatus === 'DISPATCHED') {
      return mockError(409, 'CONFLICT', '이미 발송된 차량 그룹에는 전표를 추가할 수 없습니다.')
    }
    if (task.status !== 'DRAFT') {
      return mockError(409, 'CONFLICT', `배차 작업 편집은 DRAFT 상태에서만 가능합니다 — 현재=${task.status}`)
    }
    const body = parseMockBody(config) as { slipId?: string }
    const slipId = String(body.slipId ?? '')
    const source =
      mockDispatchBoardSlipById(slipId) ??
      task.vehicleGroups.flatMap((item) => item.slips).find((row) => row.slipId === slipId)?.slip
    if (!source) {
      return mockError(404, 'NOT_FOUND', '미배차 전표를 찾을 수 없습니다.')
    }
    const created: DispatchVehicleGroupSlipResponse = {
      id: `44444444-dddd-4ddd-8ddd-${String(Date.now()).slice(-12)}`,
      slipId,
      sequence: group.slips.length + 1,
      slip: {
        slipNo: source.slipNo,
        partnerCode: source.partnerCode,
        partnerName: source.partnerName,
        deliveryAddress: source.deliveryAddress,
        recipientPhone: source.recipientPhone,
        dispatchStatus: 'UNDISPATCHED',
      },
    }
    group.slips.push(created)
    refreshMockDuplicateSlipIds(task)
    return envelope(created)
  }

  const dispatchTaskSendMatch = url.match(/\/admin\/dispatch-tasks\/([^/?]+)\/dispatch(?:\?.*)?$/)
  if (method === 'POST' && dispatchTaskSendMatch) {
    const denied = mockRequirePermission('dispatch.board', 'update')
    if (denied) return denied
    const taskId = decodeURIComponent(dispatchTaskSendMatch[1]!)
    const task = MOCK_DISPATCH_TASK_DETAILS.find((item) => item.id === taskId)
    if (!task) {
      return mockError(404, 'NOT_FOUND', 'DispatchTask 를 찾을 수 없습니다.')
    }
    const body = parseMockBody(config) as { groupIds?: string[] }
    const groupIds = Array.isArray(body.groupIds) ? body.groupIds : undefined
    window.__SAMHAN_MOCK_LAST_DISPATCH_BODY__ = groupIds ? { groupIds } : {}
    // Round C P1-2 BE parity — 발송 이력이 있는 task 의 추가 부분발송 명시 차단 (D-DMR-06).
    if (task.vehicleGroups.some((group) => group.dispatchStatus !== 'PENDING')) {
      return mockError(409, 'CONFLICT', '이미 아로로지스로 발송된 배차입니다 — 수정하려면 [재배차 시작] 후 전체 재발송하세요')
    }
    if (task.status !== 'DRAFT') {
      return mockError(409, 'CONFLICT', `발송 가능한 미발송 차량 그룹이 없습니다 — 현재=${task.status}`)
    }
    const targetGroupIds = new Set(groupIds ?? task.vehicleGroups.map((group) => group.id))
    const targetGroups = task.vehicleGroups
      .filter((group) => targetGroupIds.has(group.id) && group.dispatchStatus === 'PENDING')
    if (targetGroups.length === 0) {
      return mockError(400, 'INVALID_INPUT', '발송할 미발송 차량 그룹이 없습니다.')
    }
    targetGroups.forEach((group) => {
      group.dispatchStatus = 'DISPATCHED'
      group.slips.forEach((row) => {
        row.slip.dispatchStatus = 'DISPATCHING'
      })
    })
    task.status = task.vehicleGroups.every((group) => group.dispatchStatus === 'DISPATCHED')
      ? 'DISPATCHING'
      : 'DRAFT'
    refreshMockDuplicateSlipIds(task)
    syncMockDispatchTaskSummary(task)
    return envelope(task)
  }

  const modificationRequestMatch = url.match(
    /\/admin\/dispatch-tasks\/([^/?]+)\/modification-request(?:\?.*)?$/,
  )
  if (method === 'POST' && modificationRequestMatch) {
    const denied = mockRequirePermission('dispatch.board', 'update')
    if (denied) return denied
    const taskId = decodeURIComponent(modificationRequestMatch[1]!)
    const task = MOCK_DISPATCH_TASK_DETAILS.find((item) => item.id === taskId)
    if (!task) {
      return mockError(404, 'NOT_FOUND', 'DispatchTask 를 찾을 수 없습니다.')
    }
    // BE parity (DispatchTaskModificationRequestService) — 수동-only 완료 task 는
    // arologis dispatch 가 없어 수정 요청 발송 자체가 409 (Round E 버튼 게이트의 서버측 근거).
    if (!task.arologisDispatchId) {
      return mockError(409, 'CONFLICT', `arologisDispatchId 가 없어 수정 요청 발송 불가 — taskCode=${task.taskCode}`)
    }
    if (task.status !== 'DISPATCHED') {
      return mockError(409, 'CONFLICT', `MODIFICATION_REQUESTED 는 DISPATCHED 에서만 가능 — 현재=${task.status}`)
    }
    const body = parseMockBody(config) as { reason?: string }
    const decision = mockLocationParams().get('mockModificationDecision')
    task.modificationReason = String(body.reason ?? '').trim() || null
    task.modificationRequestedAt = new Date().toISOString()
    task.modificationDecidedAt = decision ? new Date().toISOString() : null
    if (decision === 'accepted') {
      task.status = 'MODIFICATION_ACCEPTED'
    } else if (decision === 'rejected') {
      task.status = 'MODIFICATION_REJECTED'
      task.rejectionReason = 'mock 수정 거부'
    } else {
      task.status = 'MODIFICATION_REQUESTED'
    }
    syncMockDispatchTaskSummary(task)
    return envelope(task)
  }

  const cancellationRequestMatch = url.match(
    /\/admin\/dispatch-tasks\/([^/?]+)\/cancellation-request(?:\?.*)?$/,
  )
  if (method === 'POST' && cancellationRequestMatch) {
    const denied = mockRequirePermission('dispatch.board', 'update')
    if (denied) return denied
    const taskId = decodeURIComponent(cancellationRequestMatch[1]!)
    const task = MOCK_DISPATCH_TASK_DETAILS.find((item) => item.id === taskId)
    if (!task) {
      return mockError(404, 'NOT_FOUND', 'DispatchTask 를 찾을 수 없습니다.')
    }
    // BE parity (DispatchTaskCancellationRequestService) — 수동-only 완료 task 는
    // arologis dispatch 가 없어 취소 요청 발송 자체가 409 (Round E 버튼 게이트의 서버측 근거).
    if (!task.arologisDispatchId) {
      return mockError(409, 'CONFLICT', `arologisDispatchId 가 없어 취소 요청 발송 불가 — taskCode=${task.taskCode}`)
    }
    if (task.status !== 'DISPATCHED') {
      return mockError(409, 'CONFLICT', `CANCEL_REQUESTED 는 DISPATCHED 에서만 가능 — 현재=${task.status}`)
    }
    const body = parseMockBody(config) as { reason?: string }
    const decision = mockLocationParams().get('mockCancellationDecision')
    task.modificationReason = String(body.reason ?? '').trim() || null
    task.modificationRequestedAt = new Date().toISOString()
    task.modificationDecidedAt = decision ? new Date().toISOString() : null
    if (decision === 'accepted') {
      task.status = 'CANCELLED'
      task.vehicleGroups.forEach((group) => {
        group.dispatchStatus = 'PENDING'
        group.slips.forEach((row) => {
          row.slip.dispatchStatus = 'UNDISPATCHED'
        })
      })
    } else if (decision === 'rejected') {
      task.status = 'CANCEL_REJECTED'
      task.rejectionReason = 'mock 취소 거부'
    } else {
      task.status = 'CANCEL_REQUESTED'
    }
    syncMockDispatchTaskSummary(task)
    return envelope(task)
  }

  const startRedispatchMatch = url.match(
    /\/admin\/dispatch-tasks\/([^/?]+)\/start-redispatch(?:\?.*)?$/,
  )
  if (method === 'POST' && startRedispatchMatch) {
    const denied = mockRequirePermission('dispatch.board', 'update')
    if (denied) return denied
    const taskId = decodeURIComponent(startRedispatchMatch[1]!)
    const task = MOCK_DISPATCH_TASK_DETAILS.find((item) => item.id === taskId)
    if (!task) {
      return mockError(404, 'NOT_FOUND', 'DispatchTask 를 찾을 수 없습니다.')
    }
    if (task.status !== 'MODIFICATION_ACCEPTED') {
      return mockError(409, 'CONFLICT', `DRAFT 재 진입은 MODIFICATION_ACCEPTED 에서만 가능 — 현재=${task.status}`)
    }
    task.status = 'DRAFT'
    task.arologisDispatchId = null
    task.vehicleGroups.forEach((group) => {
      if (group.dispatchStatus === 'DISPATCHED') {
        group.dispatchStatus = 'PENDING'
        group.slips.forEach((row) => {
          row.slip.dispatchStatus = 'UNDISPATCHED'
        })
      }
    })
    task.matchedDrivers = []
    refreshMockDuplicateSlipIds(task)
    syncMockDispatchTaskSummary(task)
    return envelope(task)
  }

  const dispatchCommentItemMatch = url.match(/\/admin\/dispatch-tasks\/([^/?]+)\/comments\/([^/?]+)(?:\?.*)?$/)
  if (method === 'DELETE' && dispatchCommentItemMatch) {
    const taskId = decodeURIComponent(dispatchCommentItemMatch[1]!)
    const commentId = decodeURIComponent(dispatchCommentItemMatch[2]!)
    const denied = mockRequirePermission('dispatch.board', 'update')
    if (denied) return denied
    const dispatchCommentsStore = getMockDispatchCommentsStore()
    const comments = dispatchCommentsStore[taskId] ?? []
    dispatchCommentsStore[taskId] = comments.filter((comment) => comment.id !== commentId)
    return envelope(null)
  }

  const dispatchCommentCollectionMatch = url.match(/\/admin\/dispatch-tasks\/([^/?]+)\/comments(?:\?.*)?$/)
  if (dispatchCommentCollectionMatch) {
    const dispatchCommentsStore = getMockDispatchCommentsStore()
    const taskId = decodeURIComponent(dispatchCommentCollectionMatch[1]!)
    if (method === 'GET') {
      const denied = mockRequirePermission('dispatch.board', 'view')
      if (denied) return denied
      return envelope([...(dispatchCommentsStore[taskId] ?? [])])
    }
    if (method === 'POST') {
      const denied = mockRequirePermission('dispatch.board', 'update')
      if (denied) return denied
      const body = parseMockBody(config) as {
        body?: string
        parentId?: string
        anchor?: string
      }
      const text = String(body.body ?? '').trim()
      if (!text) {
        return mockError(400, 'INVALID_INPUT', '코멘트 내용은 필수입니다.')
      }
      const nextSequence = mockDispatchCommentSequence++
      const created: DispatchComment = {
        id: `66666666-aaaa-4aaa-8aaa-${String(nextSequence).padStart(12, '0')}`,
        anchor: typeof body.anchor === 'string' && body.anchor.trim() ? body.anchor.trim() : null,
        authorName: MOCK_AUTH.fullName,
        body: text,
        parentId: typeof body.parentId === 'string' && body.parentId.trim() ? body.parentId.trim() : null,
        status: 'OPEN',
        createdAt: new Date().toISOString(),
      }
      dispatchCommentsStore[taskId] = [
        created,
        ...(dispatchCommentsStore[taskId] ?? []),
      ]
      return envelope(created)
    }
  }

  const dispatchEditCollectionMatch = url.match(/\/admin\/dispatch-tasks\/([^/?]+)\/edits(?:\?.*)?$/)
  if (dispatchEditCollectionMatch) {
    const dispatchEditsStore = getMockDispatchEditsStore()
    const taskId = decodeURIComponent(dispatchEditCollectionMatch[1]!)
    const task = MOCK_DISPATCH_TASK_DETAILS.find((item) => item.id === taskId)
    if (!task) {
      return mockError(404, 'NOT_FOUND', 'DispatchTask 를 찾을 수 없습니다.')
    }
    if (method === 'GET') {
      const denied = mockRequirePermission('dispatch.board', 'view')
      if (denied) return denied
      return envelope([...(dispatchEditsStore[taskId] ?? [])])
    }
    if (method === 'POST') {
      const denied = mockRequirePermission('dispatch.board', 'update')
      if (denied) return denied
      if (task.status !== 'DISPATCHED') {
        return mockError(409, 'CONFLICT', `배차 협업 수정완료는 배차 완료 상태에서만 가능합니다: ${task.status}`)
      }
      const body = parseMockBody(config) as { changeSet?: string; reason?: string }
      let parsed: Record<string, { after?: unknown }>
      try {
        parsed = JSON.parse(String(body.changeSet ?? ''))
      } catch {
        return mockError(400, 'INVALID_INPUT', 'changeSet JSON 형식이 올바르지 않습니다')
      }
      const entries = Object.entries(parsed)
      if (entries.length === 0) {
        return mockError(400, 'INVALID_INPUT', 'changeSet 에 적용할 필드가 없습니다')
      }
      if (entries.some(([path, change]) => path.replace(/^\/+/, '').replace(/\//g, '.') !== 'memo' || !change || !('after' in change))) {
        return mockError(400, 'INVALID_INPUT', '배차 협업은 memo 만 수정할 수 있습니다')
      }
      const after = parsed.memo?.after == null ? null : String(parsed.memo.after)
      if (after && after.length > 1000) {
        return mockError(400, 'INVALID_INPUT', '배차 비고는 1000자 이하여야 합니다')
      }
      const before = task.memo ?? null
      task.memo = after
      const nextSequence = mockDispatchEditSequence++
      const created: DispatchCollabEdit = {
        id: `66666666-bbbb-4bbb-8bbb-${String(nextSequence).padStart(12, '0')}`,
        changeSet: JSON.stringify({ memo: { before, after } }),
        reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
        proposerName: MOCK_AUTH.fullName,
        status: 'ACCEPTED',
        decidedByName: MOCK_AUTH.fullName,
        decidedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      dispatchEditsStore[taskId] = [created, ...(dispatchEditsStore[taskId] ?? [])]
      syncMockDispatchTaskSummary(task)
      return envelope({ edit: created, task })
    }
  }

  // ---- dispatch collab stream mock ----
  {
    const dispatchCollabStreamMatch = url.match(/\/admin\/dispatch-tasks\/([^/?]+)\/collab\/stream(?:\?.*)?$/)
    if (method === 'GET' && dispatchCollabStreamMatch) {
      return new Blob([': mock dispatch collab stream\n\n'], { type: 'text/event-stream;charset=utf-8' })
    }
  }

  // ---- dispatch presence (join|leave POST + list GET) ----
  {
    const gdp = globalThis as unknown as {
      __SAMHAN_MOCK_DISPATCH_PRESENCE?: Record<string, MockPresenceEntry[]>
    }
    if (!gdp.__SAMHAN_MOCK_DISPATCH_PRESENCE) gdp.__SAMHAN_MOCK_DISPATCH_PRESENCE = {}
    const dispatchPresenceStore = gdp.__SAMHAN_MOCK_DISPATCH_PRESENCE

    const dispatchPresenceActionMatch = url.match(/\/admin\/dispatch-tasks\/([^/?]+)\/collab\/presence\/(join|leave)(?:\?.*)?$/)
    if (dispatchPresenceActionMatch && method === 'POST') {
      const taskId = decodeURIComponent(dispatchPresenceActionMatch[1]!)
      const action = dispatchPresenceActionMatch[2]!
      const body = parseMockBody(config)
      const rawSessionId = typeof body['sessionId'] === 'string' ? body['sessionId'].trim() : ''
      const rawDisplayName = typeof body['displayName'] === 'string' ? body['displayName'].trim() : ''
      const sessionId = rawSessionId || `mock-presence-${Date.now()}`
      if (action === 'leave') {
        dispatchPresenceStore[taskId] = (dispatchPresenceStore[taskId] ?? [])
          .filter((entry) => entry.sessionId !== sessionId)
        // [[inprocess-mock-principles]]: leave 도 envelope(null) non-null 계약 유지.
        return envelope(null)
      }
      const displayName = rawDisplayName || MOCK_AUTH.fullName
      const colorSeed = readMockHeader(config, 'X-User-Id') || sessionId
      const entry: MockPresenceEntry = { sessionId, displayName, color: colorForPresence(colorSeed) }
      dispatchPresenceStore[taskId] = [
        ...(dispatchPresenceStore[taskId] ?? []).filter((item) => item.sessionId !== sessionId),
        entry,
      ]
      return envelope(entry)
    }

    const dispatchPresenceListMatch = url.match(/\/admin\/dispatch-tasks\/([^/?]+)\/collab\/presence(?:\?.*)?$/)
    if (dispatchPresenceListMatch && method === 'GET') {
      const taskId = decodeURIComponent(dispatchPresenceListMatch[1]!)
      return envelope([...(dispatchPresenceStore[taskId] ?? [])])
    }
  }

  if (url.match(/\/admin\/groupware\/approval-templates(?:\?.*)?$/)) {
    const templates = getMockGroupwareApprovalTemplatesStore()
    if (method === 'GET') {
      const denied = mockRequirePermission('groupware.approval-templates', 'view')
      if (denied) return denied
      return envelope(templates.map(mockTemplateDto))
    }
    if (method === 'POST') {
      const denied = mockRequirePermission('groupware.approval-templates', 'update')
      if (denied) return denied
      const body = parseMockBody(config) as {
        code?: string
        name?: string
        description?: string | null
        active?: boolean
        displayOrder?: number
        fields?: Array<Record<string, unknown>>
      }
      const code = String(body.code ?? '').trim()
      const name = String(body.name ?? '').trim()
      const fields = Array.isArray(body.fields) ? body.fields : []
      if (!code || !name || fields.length === 0) {
        return mockError(400, 'INVALID_INPUT', '템플릿 코드, 이름, 필드는 필수입니다.')
      }
      if (templates.some((template) => template.code === code)) {
        return mockError(400, 'INVALID_INPUT', '이미 존재하는 결재유형 코드입니다.')
      }
      const nextSequence = mockGroupwareApprovalTemplateSequence++
      const created: ApprovalTemplate = {
        id: `77777777-dddd-4ddd-8ddd-${String(nextSequence).padStart(12, '0')}`,
        code,
        name,
        description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null,
        active: body.active !== false,
        displayOrder: Number(body.displayOrder ?? templates.length + 1),
        fields: fields.map((field, index) => ({
          fieldKey: String(field.fieldKey ?? '').trim(),
          label: String(field.label ?? '').trim(),
          fieldType: String(field.fieldType ?? 'TEXT') as ApprovalTemplate['fields'][number]['fieldType'],
          required: Boolean(field.required),
          displayOrder: Number(field.displayOrder ?? index + 1),
          options: mockParseOptionsJson(field.optionsJson),
          placeholder: typeof field.placeholder === 'string' && field.placeholder.trim() ? field.placeholder.trim() : null,
        })),
      }
      templates.push(created)
      return { __mockStatus: 201, body: envelope(mockTemplateDto(created)) }
    }
  }

  if (method === 'GET' && url.match(/\/(?:admin\/)?groupware\/approval-templates\/active(?:\?.*)?$/)) {
    if (url.match(/\/admin\/groupware\/approval-templates\/active(?:\?.*)?$/)) {
      const denied = mockRequirePermission('groupware.approvals', 'view')
      if (denied) return denied
    }
    return envelope(
      getMockGroupwareApprovalTemplatesStore()
        .filter((template) => template.active)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(mockTemplateDto),
    )
  }

  const groupwareApprovalTemplateDetailMatch = url.match(
    /\/admin\/groupware\/approval-templates\/([^/?]+)(?:\?.*)?$/,
  )
  if (groupwareApprovalTemplateDetailMatch) {
    const templateId = decodeURIComponent(groupwareApprovalTemplateDetailMatch[1]!)
    const templates = getMockGroupwareApprovalTemplatesStore()
    const template = templates.find((item) => item.id === templateId)
    if (!template) {
      return mockError(404, 'NOT_FOUND', '결재유형 템플릿을 찾을 수 없습니다.')
    }
    if (method === 'GET') {
      const denied = mockRequirePermission('groupware.approval-templates', 'view')
      if (denied) return denied
      return envelope(mockTemplateDto(template))
    }
    if (method === 'PUT') {
      const denied = mockRequirePermission('groupware.approval-templates', 'update')
      if (denied) return denied
      const body = parseMockBody(config) as {
        code?: string
        name?: string
        description?: string | null
        active?: boolean
        displayOrder?: number
        fields?: Array<Record<string, unknown>>
      }
      const fields = Array.isArray(body.fields) ? body.fields : []
      template.code = String(body.code ?? template.code).trim()
      template.name = String(body.name ?? template.name).trim()
      template.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
      template.active = body.active !== false
      template.displayOrder = Number(body.displayOrder ?? template.displayOrder)
      template.fields = fields.map((field, index) => ({
        fieldKey: String(field.fieldKey ?? '').trim(),
        label: String(field.label ?? '').trim(),
        fieldType: String(field.fieldType ?? 'TEXT') as ApprovalTemplate['fields'][number]['fieldType'],
        required: Boolean(field.required),
        displayOrder: Number(field.displayOrder ?? index + 1),
        options: mockParseOptionsJson(field.optionsJson),
        placeholder: typeof field.placeholder === 'string' && field.placeholder.trim() ? field.placeholder.trim() : null,
      }))
      return envelope(mockTemplateDto(template))
    }
    if (method === 'DELETE') {
      const denied = mockRequirePermission('groupware.approval-templates', 'update')
      if (denied) return denied
      template.active = false
      return envelope(null)
    }
  }

  const groupwareApprovalAttachmentDownloadMatch = url.match(
    /\/admin\/groupware\/approvals\/([^/?]+)\/attachments\/([^/?]+)\/download(?:\?.*)?$/,
  )
  if (method === 'GET' && groupwareApprovalAttachmentDownloadMatch) {
    const denied = mockRequirePermission('groupware.approvals', 'view')
    if (denied) return denied
    const approvalId = decodeURIComponent(groupwareApprovalAttachmentDownloadMatch[1]!)
    const attachmentId = decodeURIComponent(groupwareApprovalAttachmentDownloadMatch[2]!)
    const attachment = (getMockGroupwareApprovalAttachmentsStore()[approvalId] ?? [])
      .find((item) => item.id === attachmentId)
    if (!attachment || attachment.attachmentType !== 'FILE') {
      return mockError(404, 'NOT_FOUND', '다운로드할 파일 첨부를 찾을 수 없습니다.')
    }
    return {
      __mockStatus: 200,
      body: new Blob([`mock file: ${attachment.fileName ?? 'approval-attachment'}`], {
        type: attachment.contentType ?? 'application/octet-stream',
      }),
    }
  }

  const groupwareApprovalAttachmentItemMatch = url.match(
    /\/admin\/groupware\/approvals\/([^/?]+)\/attachments\/([^/?]+)(?:\?.*)?$/,
  )
  if (method === 'DELETE' && groupwareApprovalAttachmentItemMatch) {
    const denied = mockRequirePermission('groupware.approvals', 'update')
    if (denied) return denied
    const approvalId = decodeURIComponent(groupwareApprovalAttachmentItemMatch[1]!)
    const attachmentId = decodeURIComponent(groupwareApprovalAttachmentItemMatch[2]!)
    const approval = getMockGroupwareApprovalsStore().find((item) => item.approvalId === approvalId)
    if (!approval) return mockError(404, 'NOT_FOUND', '대상 결재 문서를 찾을 수 없습니다.')
    if (approval.status === 'APPROVED' || approval.status === 'REJECTED' || approval.status === 'WITHDRAWN') {
      return mockError(409, 'CONFLICT', '잠긴 결재 문서의 첨부는 삭제할 수 없습니다.')
    }
    const store = getMockGroupwareApprovalAttachmentsStore()
    store[approvalId] = (store[approvalId] ?? []).filter((item) => item.id !== attachmentId)
    return envelope(null)
  }

  const groupwareApprovalAttachmentFileMatch = url.match(
    /\/admin\/groupware\/approvals\/([^/?]+)\/attachments\/file(?:\?.*)?$/,
  )
  if (method === 'POST' && groupwareApprovalAttachmentFileMatch) {
    const denied = mockRequirePermission('groupware.approvals', 'update')
    if (denied) return denied
    const approvalId = decodeURIComponent(groupwareApprovalAttachmentFileMatch[1]!)
    const approval = getMockGroupwareApprovalsStore().find((item) => item.approvalId === approvalId)
    if (!approval) return mockError(404, 'NOT_FOUND', '대상 결재 문서를 찾을 수 없습니다.')
    if (approval.status === 'APPROVED' || approval.status === 'REJECTED' || approval.status === 'WITHDRAWN') {
      return mockError(409, 'CONFLICT', '잠긴 결재 문서에는 첨부를 추가할 수 없습니다.')
    }
    const formData = config.data instanceof FormData ? config.data : null
    const file = formData?.get('file')
    if (!(file instanceof File)) {
      return mockError(400, 'INVALID_INPUT', '파일은 필수입니다.')
    }
    const nextSequence = mockGroupwareApprovalAttachmentSequence++
    const created: ApprovalAttachment = {
      id: `77777777-eeee-4eee-8eee-${String(nextSequence).padStart(12, '0')}`,
      attachmentType: 'FILE',
      label: String(formData?.get('label') ?? file.name).trim() || file.name,
      displayOrder: Number(formData?.get('displayOrder') ?? 0),
      refSlipNo: null,
      refSlipType: null,
      refPartnerCode: null,
      refPartnerName: null,
      refPeriod: null,
      refDocType: null,
      refDocNo: null,
      refDocLabel: null,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileSize: file.size,
      downloadUrl: null,
    }
    const store = getMockGroupwareApprovalAttachmentsStore()
    store[approvalId] = [...(store[approvalId] ?? []), created]
    return { __mockStatus: 201, body: envelope(created) }
  }

  const groupwareApprovalAttachmentCollectionMatch = url.match(
    /\/admin\/groupware\/approvals\/([^/?]+)\/attachments(?:\?.*)?$/,
  )
  if (groupwareApprovalAttachmentCollectionMatch) {
    const approvalId = decodeURIComponent(groupwareApprovalAttachmentCollectionMatch[1]!)
    const approval = getMockGroupwareApprovalsStore().find((item) => item.approvalId === approvalId)
    if (!approval) return mockError(404, 'NOT_FOUND', '대상 결재 문서를 찾을 수 없습니다.')
    const store = getMockGroupwareApprovalAttachmentsStore()
    if (method === 'GET') {
      const denied = mockRequirePermission('groupware.approvals', 'view')
      if (denied) return denied
      return envelope([...(store[approvalId] ?? [])].sort((a, b) => a.displayOrder - b.displayOrder))
    }
    if (method === 'POST') {
      const denied = mockRequirePermission('groupware.approvals', 'update')
      if (denied) return denied
      if (approval.status === 'APPROVED' || approval.status === 'REJECTED' || approval.status === 'WITHDRAWN') {
        return mockError(409, 'CONFLICT', '잠긴 결재 문서에는 첨부를 추가할 수 없습니다.')
      }
      const body = parseMockBody(config) as Partial<ApprovalAttachment>
      const type = body.attachmentType
      if (type !== 'SLIP_REF' && type !== 'PARTNER_LEDGER_REF') {
        return mockError(400, 'INVALID_INPUT', '참조 첨부 유형이 올바르지 않습니다.')
      }
      const nextSequence = mockGroupwareApprovalAttachmentSequence++
      const created: ApprovalAttachment = {
        id: `77777777-eeee-4eee-8eee-${String(nextSequence).padStart(12, '0')}`,
        attachmentType: type,
        label: body.label ?? null,
        displayOrder: Number(body.displayOrder ?? 0),
        refSlipNo: body.refSlipNo ?? null,
        refSlipType: body.refSlipType ?? null,
        refPartnerCode: body.refPartnerCode ?? null,
        refPartnerName: body.refPartnerName ?? null,
        refPeriod: body.refPeriod ?? null,
        refDocType: body.refDocType ?? (
          type === 'PARTNER_LEDGER_REF'
            ? 'PARTNER_LEDGER'
            : body.refSlipType === 'SLIP_INBOUND' || body.refSlipType === 'INBOUND'
              ? 'INBOUND_SLIP'
              : 'OUTBOUND_SLIP'
        ),
        refDocNo: body.refDocNo ?? body.refSlipNo ?? null,
        refDocLabel: body.refDocLabel ?? body.refPartnerName ?? body.label ?? null,
        fileName: null,
        contentType: null,
        fileSize: null,
        downloadUrl: null,
      }
      store[approvalId] = [...(store[approvalId] ?? []), created]
      return { __mockStatus: 201, body: envelope(created) }
    }
  }

  const groupwareApprovalCommentResolveMatch = url.match(
    /\/admin\/groupware\/approvals\/([^/?]+)\/collab\/comments\/([^/?]+)\/resolve(?:\?.*)?$/,
  )
  if (method === 'POST' && groupwareApprovalCommentResolveMatch) {
    const denied = mockRequirePermission('groupware.approvals', 'update')
    if (denied) return denied
    const approvalId = decodeURIComponent(groupwareApprovalCommentResolveMatch[1]!)
    const commentId = decodeURIComponent(groupwareApprovalCommentResolveMatch[2]!)
    const commentsStore = getMockGroupwareApprovalCommentsStore()
    const comment = (commentsStore[approvalId] ?? []).find((item) => item.id === commentId)
    if (!comment) {
      return mockError(404, 'NOT_FOUND', '결재 코멘트를 찾을 수 없습니다.')
    }
    comment.status = 'RESOLVED'
    return envelope(comment)
  }

  const groupwareApprovalCommentItemMatch = url.match(
    /\/admin\/groupware\/approvals\/([^/?]+)\/collab\/comments\/([^/?]+)(?:\?.*)?$/,
  )
  if (method === 'DELETE' && groupwareApprovalCommentItemMatch) {
    const denied = mockRequirePermission('groupware.approvals', 'update')
    if (denied) return denied
    const approvalId = decodeURIComponent(groupwareApprovalCommentItemMatch[1]!)
    const commentId = decodeURIComponent(groupwareApprovalCommentItemMatch[2]!)
    const commentsStore = getMockGroupwareApprovalCommentsStore()
    commentsStore[approvalId] = (commentsStore[approvalId] ?? []).filter((comment) => comment.id !== commentId)
    return envelope(null)
  }

  const groupwareApprovalCommentCollectionMatch = url.match(
    /\/admin\/groupware\/approvals\/([^/?]+)\/collab\/comments(?:\?.*)?$/,
  )
  if (groupwareApprovalCommentCollectionMatch) {
    const approvalId = decodeURIComponent(groupwareApprovalCommentCollectionMatch[1]!)
    const approvals = getMockGroupwareApprovalsStore()
    if (!approvals.some((approval) => approval.approvalId === approvalId)) {
      return mockError(404, 'NOT_FOUND', '대상 결재 문서를 찾을 수 없습니다.')
    }
    const commentsStore = getMockGroupwareApprovalCommentsStore()
    if (method === 'GET') {
      const denied = mockRequirePermission('groupware.approvals', 'view')
      if (denied) return denied
      return envelope([...(commentsStore[approvalId] ?? [])])
    }
    if (method === 'POST') {
      const denied = mockRequirePermission('groupware.approvals', 'update')
      if (denied) return denied
      const body = parseMockBody(config) as {
        body?: string
        parentId?: string
        anchor?: string
      }
      const text = String(body.body ?? '').trim()
      if (!text) {
        return mockError(400, 'INVALID_INPUT', '코멘트 내용은 필수입니다.')
      }
      const nextSequence = mockGroupwareApprovalCommentSequence++
      const created: GroupwareApprovalCollabComment = {
        id: `77777777-bbbb-4bbb-8bbb-${String(nextSequence).padStart(12, '0')}`,
        anchor: typeof body.anchor === 'string' && body.anchor.trim() ? body.anchor.trim() : null,
        authorName: MOCK_AUTH.fullName,
        body: text,
        parentId: typeof body.parentId === 'string' && body.parentId.trim() ? body.parentId.trim() : null,
        status: 'OPEN',
        createdAt: new Date().toISOString(),
      }
      commentsStore[approvalId] = [created, ...(commentsStore[approvalId] ?? [])]
      return envelope(created)
    }
  }

  const groupwareApprovalEditCollectionMatch = url.match(
    /\/admin\/groupware\/approvals\/([^/?]+)\/collab\/edits(?:\?.*)?$/,
  )
  if (groupwareApprovalEditCollectionMatch) {
    const approvalId = decodeURIComponent(groupwareApprovalEditCollectionMatch[1]!)
    const approval = getMockGroupwareApprovalsStore().find((item) => item.approvalId === approvalId)
    if (!approval) {
      return mockError(404, 'NOT_FOUND', '대상 결재 문서를 찾을 수 없습니다.')
    }
    const editsStore = getMockGroupwareApprovalEditsStore()
    if (method === 'GET') {
      const denied = mockRequirePermission('groupware.approvals', 'view')
      if (denied) return denied
      return envelope([...(editsStore[approvalId] ?? [])])
    }
    if (method === 'POST') {
      const denied = mockRequirePermission('groupware.approvals', 'update')
      if (denied) return denied
      if (approval.status !== 'PENDING' && approval.status !== 'IN_PROGRESS') {
        return mockError(409, 'CONFLICT', `협업 수정완료가 불가능한 상태입니다: ${approval.status}`)
      }
      const body = parseMockBody(config) as { changeSet?: string; reason?: string }
      let parsed: Record<string, { after?: unknown; before?: unknown }>
      try {
        parsed = JSON.parse(String(body.changeSet ?? ''))
      } catch {
        return mockError(400, 'INVALID_INPUT', 'changeSet JSON 형식이 올바르지 않습니다')
      }
      const entries = Object.entries(parsed)
      if (entries.length === 0) {
        return mockError(400, 'INVALID_INPUT', 'changeSet 에 적용할 필드가 없습니다')
      }
      if (entries.some(([path, change]) => {
        const normalized = path.replace(/^\/+/, '').replace(/\//g, '.')
        const fieldKey = normalized.startsWith('field.') ? normalized.slice('field.'.length) : ''
        const template = approval.templateId
          ? getMockGroupwareApprovalTemplatesStore().find((item) => item.id === approval.templateId)
          : undefined
        const templateHasField = Boolean(fieldKey && template?.fields.some((field) => field.fieldKey === fieldKey))
        return (normalized !== 'title' && normalized !== 'content' && !templateHasField) || !change || !('after' in change)
      })) {
        return mockError(400, 'INVALID_INPUT', '결재 협업은 title/content/템플릿 필드만 수정할 수 있습니다')
      }
      const normalizedChangeSet: Record<string, { before: string | null; after: string | null }> = {}
      for (const [path, change] of entries) {
        const normalized = path.replace(/^\/+/, '').replace(/\//g, '.')
        const after = change.after == null ? null : String(change.after)
        if (normalized === 'title') {
          if (!after || !after.trim()) {
            return mockError(400, 'INVALID_INPUT', '결재 제목은 필수입니다')
          }
          if (after.length > 200) {
            return mockError(400, 'INVALID_INPUT', '결재 제목은 200자 이하여야 합니다')
          }
          normalizedChangeSet.title = { before: approval.title, after }
          approval.title = after
        }
        if (normalized === 'content') {
          if (after && after.length > 2000) {
            return mockError(400, 'INVALID_INPUT', '결재 본문은 2000자 이하여야 합니다')
          }
          normalizedChangeSet.content = { before: approval.content ?? null, after }
          approval.content = after
        }
        if (normalized.startsWith('field.')) {
          const fieldKey = normalized.slice('field.'.length)
          const before = approval.fieldValues[fieldKey] ?? null
          approval.fieldValues = {
            ...approval.fieldValues,
            [fieldKey]: after ?? '',
          }
          normalizedChangeSet[normalized] = { before, after }
        }
      }
      const nextSequence = mockGroupwareApprovalEditSequence++
      const created: GroupwareApprovalCollabEdit = {
        id: `77777777-cccc-4ccc-8ccc-${String(nextSequence).padStart(12, '0')}`,
        changeSet: JSON.stringify(normalizedChangeSet),
        reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
        proposerName: MOCK_AUTH.fullName,
        status: 'ACCEPTED',
        decidedByName: MOCK_AUTH.fullName,
        decidedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      editsStore[approvalId] = [created, ...(editsStore[approvalId] ?? [])]
      return envelope({ edit: created, approval })
    }
  }

  // ---- groupware-approval presence (join|leave POST + list GET) ----
  {
    const ggap = globalThis as unknown as {
      __SAMHAN_MOCK_GROUPWARE_APPROVAL_PRESENCE?: Record<string, MockPresenceEntry[]>
    }
    if (!ggap.__SAMHAN_MOCK_GROUPWARE_APPROVAL_PRESENCE) ggap.__SAMHAN_MOCK_GROUPWARE_APPROVAL_PRESENCE = {}
    const groupwareApprovalPresenceStore = ggap.__SAMHAN_MOCK_GROUPWARE_APPROVAL_PRESENCE

    const gapPresenceActionMatch = url.match(/\/admin\/groupware\/approvals\/([^/?]+)\/collab\/presence\/(join|leave)(?:\?.*)?$/)
    if (gapPresenceActionMatch && method === 'POST') {
      const approvalId = decodeURIComponent(gapPresenceActionMatch[1]!)
      const action = gapPresenceActionMatch[2]!
      const body = parseMockBody(config)
      const rawSessionId = typeof body['sessionId'] === 'string' ? body['sessionId'].trim() : ''
      const rawDisplayName = typeof body['displayName'] === 'string' ? body['displayName'].trim() : ''
      const sessionId = rawSessionId || `mock-presence-${Date.now()}`
      if (action === 'leave') {
        groupwareApprovalPresenceStore[approvalId] = (groupwareApprovalPresenceStore[approvalId] ?? [])
          .filter((entry) => entry.sessionId !== sessionId)
        return envelope(null)
      }
      const displayName = rawDisplayName || MOCK_AUTH.fullName
      const colorSeed = readMockHeader(config, 'X-User-Id') || sessionId
      const entry: MockPresenceEntry = { sessionId, displayName, color: colorForPresence(colorSeed) }
      groupwareApprovalPresenceStore[approvalId] = [
        ...(groupwareApprovalPresenceStore[approvalId] ?? []).filter((item) => item.sessionId !== sessionId),
        entry,
      ]
      return envelope(entry)
    }

    const gapPresenceListMatch = url.match(/\/admin\/groupware\/approvals\/([^/?]+)\/collab\/presence(?:\?.*)?$/)
    if (gapPresenceListMatch && method === 'GET') {
      const approvalId = decodeURIComponent(gapPresenceListMatch[1]!)
      return envelope([...(groupwareApprovalPresenceStore[approvalId] ?? [])])
    }
  }

  const groupwareApprovalDecisionMatch = url.match(
    /\/admin\/groupware\/approvals\/([^/?]+)\/(approve|reject)(?:\?.*)?$/,
  )
  if ((method === 'PUT' || method === 'POST') && groupwareApprovalDecisionMatch) {
    const denied = mockRequirePermission('groupware.approvals', 'update')
    if (denied) return denied
    const approvalId = decodeURIComponent(groupwareApprovalDecisionMatch[1]!)
    const action = groupwareApprovalDecisionMatch[2]!
    const approval = getMockGroupwareApprovalsStore().find((item) => item.approvalId === approvalId)
    if (!approval) {
      return mockError(404, 'NOT_FOUND', '결재 문서를 찾을 수 없습니다.')
    }
    const body = parseMockBody(config) as { reason?: string }
    const current = approval.steps.find((step) => step.status === 'PENDING')
    if (!current) {
      return mockError(409, 'CONFLICT', '처리 대기 중인 결재 단계가 없습니다')
    }
    if (action === 'approve') {
      current.status = 'APPROVED'
      current.decidedAt = new Date().toISOString()
      approval.status = approval.steps.every((step) => step.status === 'APPROVED') ? 'APPROVED' : 'IN_PROGRESS'
    } else {
      current.status = 'REJECTED'
      current.decidedAt = new Date().toISOString()
      current.reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
      approval.status = 'REJECTED'
    }
    return envelope(approval)
  }

  if (method === 'GET' && url.match(/\/admin\/groupware\/approvals\/approver-search(?:\?.*)?$/)) {
    const denied = mockRequirePermission('groupware.approvals', 'view')
    if (denied) return denied
    const params = new URLSearchParams(url.split('?')[1] ?? '')
    const configParams = config.params as Record<string, unknown> | undefined
    const q = String(configParams?.q ?? params.get('q') ?? '').trim()
    const rawLimit = Number(configParams?.limit ?? params.get('limit') ?? 20)
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20
    if (!q) return envelope<ApproverOption[]>([])
    const normalized = q.toLowerCase()
    return envelope(
      MOCK_GROUPWARE_APPROVER_OPTIONS
        .filter((option) =>
          option.name.toLowerCase().includes(normalized)
          || option.userId.toLowerCase().includes(normalized)
          || (option.department ?? '').toLowerCase().includes(normalized),
        )
        .slice(0, limit),
    )
  }

  const groupwareApprovalDetailMatch = url.match(/\/admin\/groupware\/approvals\/([^/?]+)(?:\?.*)?$/)
  if (method === 'GET' && groupwareApprovalDetailMatch) {
    const denied = mockRequirePermission('groupware.approvals', 'view')
    if (denied) return denied
    const approvalId = decodeURIComponent(groupwareApprovalDetailMatch[1]!)
    const approval = getMockGroupwareApprovalsStore().find((item) => item.approvalId === approvalId)
    if (!approval) {
      return mockError(404, 'NOT_FOUND', '결재 문서를 찾을 수 없습니다.')
    }
    return envelope(approval)
  }

  if (url.match(/\/admin\/groupware\/approvals(?:\?.*)?$/)) {
    const approvals = getMockGroupwareApprovalsStore()
    if (method === 'GET') {
      const denied = mockRequirePermission('groupware.approvals', 'view')
      if (denied) return denied
      const params = new URLSearchParams(url.split('?')[1] ?? '')
      const configParams = config.params as Record<string, unknown> | undefined
      const status = String(configParams?.status ?? params.get('status') ?? '')
      const requesterId = String(configParams?.requesterId ?? params.get('requesterId') ?? '')
      return envelope(approvals.filter((approval) => {
        const statusOk = !status || approval.status === status
        const requesterOk = !requesterId || approval.requesterId === requesterId
        return statusOk && requesterOk
      }))
    }
    if (method === 'POST') {
      const denied = mockRequirePermission('groupware.approvals', 'update')
      if (denied) return denied
      const body = parseMockBody(config) as {
        requesterId?: string
        title?: string
        content?: string
        approverIds?: string[]
        templateId?: string | null
        fieldValues?: Record<string, string>
      }
      const title = String(body.title ?? '').trim()
      const approverIds = Array.isArray(body.approverIds) ? body.approverIds : []
      if (!body.requesterId || !title || approverIds.length === 0) {
        return mockError(400, 'INVALID_INPUT', '요청자, 제목, 결재자는 필수입니다.')
      }
      const approverSet = new Set<string>()
      for (const approverId of approverIds) {
        if (typeof approverId !== 'string' || !approverId.trim()) {
          return mockError(400, 'INVALID_INPUT', '결재자는 필수입니다.')
        }
        if (approverId === body.requesterId) {
          return mockError(400, 'INVALID_INPUT', '요청자 본인은 결재자가 될 수 없습니다.')
        }
        if (approverSet.has(approverId)) {
          return mockError(400, 'INVALID_INPUT', '동일 결재자를 결재선에 중복 추가할 수 없습니다.')
        }
        approverSet.add(approverId)
      }
      const template = body.templateId
        ? getMockGroupwareApprovalTemplatesStore().find((item) => item.id === body.templateId)
        : undefined
      const fieldValues = body.fieldValues ?? {}
      if (body.templateId && !template) {
        return mockError(404, 'NOT_FOUND', '결재유형 템플릿을 찾을 수 없습니다.')
      }
      if (template) {
        for (const field of template.fields) {
          const value = fieldValues[field.fieldKey] ?? ''
          if (field.required && !String(value).trim()) {
            return mockError(400, 'INVALID_INPUT', `${field.label} 값은 필수입니다.`)
          }
          if (field.fieldType === 'SELECT' && value && !field.options.includes(value)) {
            return mockError(400, 'INVALID_INPUT', `${field.label} 값이 선택지에 없습니다.`)
          }
        }
      }
      const next = approvals.length + 1
      const created: ApprovalLineAdminResponse = {
        approvalId: `77777777-aaaa-4aaa-8aaa-${String(next + 10).padStart(12, '0')}`,
        approvalNo: `${MOCK_DISPATCH_HISTORY_TODAY.replace(/-/g, '/')}-${next}`,
        requesterId: body.requesterId,
        requesterName: mockApprovalUserName(body.requesterId) ?? '요청자',
        title,
        content: typeof body.content === 'string' && body.content.trim() ? body.content : null,
        templateId: template?.id ?? null,
        templateName: template?.name ?? null,
        fieldValues: { ...fieldValues },
        status: 'PENDING',
        steps: approverIds.map((approverId, sequence) => ({
          sequence,
          approverId,
          approverName: mockApprovalUserName(approverId) ?? `결재자 ${sequence + 1}`,
          status: 'PENDING',
          decidedAt: null,
          reason: null,
        })),
      }
      approvals.unshift(created)
      return envelope(created)
    }
  }

  const setMatchedDriverMatch = url.match(
    /\/admin\/dispatch-tasks\/([^/?]+)\/vehicle-groups\/([^/?]+)\/matched-driver(?:\?.*)?$/,
  )
  if (method === 'PUT' && setMatchedDriverMatch) {
    const denied = mockRequirePermission('dispatch.board', 'update')
    if (denied) return denied
    const taskId = decodeURIComponent(setMatchedDriverMatch[1]!)
    const groupId = decodeURIComponent(setMatchedDriverMatch[2]!)
    const task = MOCK_DISPATCH_TASK_DETAILS.find((item) => item.id === taskId)
    const group = task?.vehicleGroups.find((item) => item.id === groupId)
    if (!task || !group) {
      return mockError(404, 'NOT_FOUND', 'DispatchTask 차량 그룹이 존재하지 않습니다.')
    }
    if (task.status !== 'DRAFT' && task.status !== 'DISPATCHING' && task.status !== 'DISPATCHED') {
      return mockError(409, 'CONFLICT', `기사/차량 기록은 작성/발송/완료 상태의 배차 작업에서만 가능합니다 — 현재=${task.status}`)
    }
    const body = parseMockBody(config) as Partial<SetMatchedDriverPayload>
    const driverName = String(body.driverName ?? '').trim()
    const driverPhoneNumber = String(body.driverPhoneNumber ?? '').trim()
    const vehiclePlateNumber = String(body.vehiclePlateNumber ?? '').trim()
    const rawDriverSource = String(body.driverSource ?? '').trim()
    // BE parity (DispatchMatchedDriverManualService) — AROLOGIS 출처는 자동 매칭 회신 전용 409.
    if (rawDriverSource === 'AROLOGIS') {
      return mockError(409, 'CONFLICT', '아로로지스 출처는 자동 매칭 회신으로만 기록할 수 있습니다.')
    }
    const driverSource = toManualMatchedDriverSource(rawDriverSource)
    if (!driverName || !vehiclePlateNumber || !driverSource) {
      return mockError(400, 'INVALID_INPUT', '기사/차량 입력값은 필수입니다.')
    }
    const nextMatched = {
      vehicleGroupSequence: group.sequence,
      driverCode: 'MANUAL',
      driverName,
      driverPhoneNumber,
      driverSource,
      vehiclePlateNumber,
    }
    const currentIndex = task.matchedDrivers.findIndex(
      (driver) => driver.vehicleGroupSequence === group.sequence,
    )
    if (currentIndex >= 0) {
      task.matchedDrivers[currentIndex] = nextMatched
    } else {
      task.matchedDrivers.push(nextMatched)
    }
    syncMockDispatchTaskSummary(task)
    return envelope(task)
  }

  const manualDispatchCompleteMatch = url.match(
    /\/admin\/dispatch-tasks\/([^/?]+)\/vehicle-groups\/([^/?]+)\/manual-dispatch-complete(?:\?.*)?$/,
  )
  if (method === 'POST' && manualDispatchCompleteMatch) {
    const denied = mockRequirePermission('dispatch.board', 'update')
    if (denied) return denied
    const taskId = decodeURIComponent(manualDispatchCompleteMatch[1]!)
    const groupId = decodeURIComponent(manualDispatchCompleteMatch[2]!)
    const task = MOCK_DISPATCH_TASK_DETAILS.find((item) => item.id === taskId)
    const group = task?.vehicleGroups.find((item) => item.id === groupId)
    if (!task || !group) {
      return mockError(404, 'NOT_FOUND', 'DispatchTask 차량 그룹이 존재하지 않습니다.')
    }
    if (task.status !== 'DRAFT' && task.status !== 'DISPATCHING') {
      return mockError(409, 'CONFLICT', `수동기입은 작성 중이거나 일부 발송 중인 배차 작업에서만 가능합니다 — 현재=${task.status}`)
    }
    if (group.dispatchStatus !== 'PENDING') {
      return mockError(409, 'CONFLICT', '이미 발송된 차량 그룹에는 수동기입할 수 없습니다.')
    }
    const matched = task.matchedDrivers.find(
      (driver) => driver.vehicleGroupSequence === group.sequence,
    )
    if (!matched || matched.driverCode !== 'MANUAL' || matched.driverSource === 'AROLOGIS') {
      return mockError(409, 'CONFLICT', '수동 발송완료 전 기사/차량 정보를 먼저 입력해야 합니다.')
    }
    group.dispatchStatus = 'DISPATCHED'
    group.slips.forEach((row) => {
      row.slip.dispatchStatus = 'DISPATCHED'
    })
    if (task.vehicleGroups.every((item) => item.dispatchStatus === 'DISPATCHED')) {
      task.status = 'DISPATCHED'
    }
    refreshMockDuplicateSlipIds(task)
    syncMockDispatchTaskSummary(task)
    return envelope(task)
  }

  const dispatchTaskDetailMatch = url.match(/\/admin\/dispatch-tasks\/([^/?]+)(?:\?.*)?$/)
  if (method === 'GET' && dispatchTaskDetailMatch) {
    const id = decodeURIComponent(dispatchTaskDetailMatch[1]!)
    const denied = mockRequirePermission('dispatch.board', 'view')
    if (denied) return denied
    if (id === 'mock-detail-error') {
      return mockError(500, 'DISPATCH_DETAIL_FAILED', '배차현황 상세 조회에 실패했습니다.')
    }
    const found = MOCK_DISPATCH_TASK_DETAILS.find(
      (task) => task.id === id || task.arologisDispatchId === id,
    )
    if (!found) {
      return mockError(404, 'NOT_FOUND', 'DispatchTask 를 찾을 수 없습니다.')
    }
    return envelope(refreshMockDuplicateSlipIds(found))
  }

  if (method === 'GET' && url.match(/\/admin\/dispatch-tasks(?:\?.*)?$/)) {
    const denied = mockRequirePermission('dispatch.board', 'view')
    if (denied) return denied
    const params = config.params instanceof URLSearchParams
      ? config.params
      : new URLSearchParams(url.split('?')[1] ?? '')
    const from = params.get('from') ?? mockOffsetIsoSeoul(MOCK_DISPATCH_HISTORY_TODAY, -30)
    const to = params.get('to') ?? MOCK_DISPATCH_HISTORY_TODAY
    const statuses = params.getAll('status')
    const effectiveStatuses = statuses.length > 0 ? statuses : ['DISPATCHED']
    const pageNo = Number(params.get('page') ?? 0)
    const size = Number(params.get('size') ?? 20)
    const forceArologisDetailError = mockLocationParams().get('mockDispatchDetailError') === '1'
    const forceTaskIdDetailError = mockLocationParams().get('mockDispatchTaskIdDetailError') === '1'
    const filtered = MOCK_DISPATCH_TASK_SUMMARIES.filter((row) =>
      row.dispatchDate >= from &&
      row.dispatchDate <= to &&
      effectiveStatuses.includes(row.status),
    ).map((row, index) =>
      forceArologisDetailError && index === 0
        ? { ...row, arologisDispatchId: 'mock-detail-error' }
        : forceTaskIdDetailError && index === 0
          ? { ...row, id: 'mock-detail-error' }
        : row,
    )
    const start = pageNo * size
    return envelope({
      content: filtered.slice(start, start + size),
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
      number: pageNo,
      size,
      first: pageNo === 0,
      last: start + size >= filtered.length,
    })
  }

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
      if (mockLocationParams().get('mockAligo502') === '1') {
        return mockError(502, 'SEND_FAILED', 'Aligo SMS 외부 서비스 오류가 발생했습니다.')
      }
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
    // index 0/1 은 DRAFT 2-주문 테스트 fixture 순서 ['2026/05/04-1', '2026/05/31-3'] 와
    // 의도적으로 1:1 매핑한다. 우연한 통과가 아니므로 목록 fixture 순서 변경 시 함께 갱신해야 한다.
    const MOCK_ORDER_NOS = ['2026/05/04-1', '2026/05/31-3', '2026/05/05-2', '2026/05/31-4']
    const convertedOrders = orders.map((_, idx) => ({
      orderNo: MOCK_ORDER_NOS[idx] ?? `2026/05/31-${idx + 1}`,
      orderStatus: 'CONVERTED' as const,
      fullyConverted: true,
    }))
    // 3-D: 변환된 주문번호 기억 → 이후 목록 재페치 시 CONVERTED 로 노출
    for (const co of convertedOrders) mockConvertedOrderNos.add(co.orderNo)
    return envelope({
      slipNo: 'SL-20260531-MERGE-001',
      convertedOrders,
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
  type MockPartnerOrderCollabComment = {
    id: string
    anchor: string | null
    authorName: string
    body: string
    parentId: string | null
    status: 'OPEN' | 'RESOLVED'
    createdAt: string
  }
  type MockPartnerOrderCollabEdit = {
    id: string
    changeSet: string
    reason: string | null
    proposerName: string
    status: 'ACCEPTED'
    decidedByName: string | null
    decidedAt: string | null
    createdAt: string
  }
  type MockPartnerOrderMutable = {
    orderNumber: string
    partnerCode: string
    bizCode: string
    partnerName: string | null
    submittedAt: string
    updatedAt: string
    status: string
    totalAmount: number
    linkedSlipNo: string | null
    deliveryAddress: string | null
    siteAddress: string | null
    contactPhone: string | null
    dueDate: string | null
    memo: string | null
    lines: Array<{
      productId: string
      lineId: string
      modelCode: string
      productName: string
      categoryKey: string
      quantity: number
      convertedQuantity: number
      deliveryPrice: number
      subtotal: number
      remark: string | null
      bundleMode: 'EXPAND' | 'KEEP' | null
      productType: string
      expandedComponents: Array<{ modelCode: string; productName: string; quantity: number }>
    }>
  }
  const gpoc = globalThis as unknown as {
    __SAMHAN_MOCK_PARTNER_ORDER_COLLAB_COMMENTS?: Record<string, MockPartnerOrderCollabComment[]>
    __SAMHAN_MOCK_PARTNER_ORDER_COLLAB_EDITS?: Record<string, MockPartnerOrderCollabEdit[]>
    __SAMHAN_MOCK_PARTNER_ORDER_COLLAB_DETAILS?: Record<string, MockPartnerOrderMutable>
  }
  if (!gpoc.__SAMHAN_MOCK_PARTNER_ORDER_COLLAB_COMMENTS) gpoc.__SAMHAN_MOCK_PARTNER_ORDER_COLLAB_COMMENTS = {}
  if (!gpoc.__SAMHAN_MOCK_PARTNER_ORDER_COLLAB_EDITS) gpoc.__SAMHAN_MOCK_PARTNER_ORDER_COLLAB_EDITS = {}
  if (!gpoc.__SAMHAN_MOCK_PARTNER_ORDER_COLLAB_DETAILS) gpoc.__SAMHAN_MOCK_PARTNER_ORDER_COLLAB_DETAILS = {}
  const partnerOrderCollabCommentsStore = gpoc.__SAMHAN_MOCK_PARTNER_ORDER_COLLAB_COMMENTS!
  const partnerOrderCollabEditsStore = gpoc.__SAMHAN_MOCK_PARTNER_ORDER_COLLAB_EDITS!
  const partnerOrderCollabDetailsStore = gpoc.__SAMHAN_MOCK_PARTNER_ORDER_COLLAB_DETAILS!

  const buildPartnerOrderDetail = (poId: string): MockPartnerOrderMutable => {
    const poStatus: string =
      poId === 'ord-draft' || poId === 'ord-partially-converted' || poId === 'ord-linked-slip'
        ? 'DRAFT'
        : poId === 'ord-hold'
          ? 'ON_HOLD'
          : poId === 'ord-confirming'
            ? 'CONFIRMING'
            : poId === 'ord-canceled'
              ? 'CANCELED'
              : poId === 'ord-converted'
                ? 'CONVERTED'
                : 'CONFIRMED'
    const poLinkedSlip =
      poId === 'ord-linked-slip' || poId === 'ord-converted'
        ? 'SL-20260504-001'
        : poStatus === 'CONFIRMED'
          ? 'SL-20260504-001'
          : null
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
              remark: '실외기는 1층 하역장으로 입고',
              bundleMode: null,
              productType: 'SINGLE',
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
              remark: '전환 완료 라인',
              bundleMode: null,
              productType: 'SINGLE',
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
              remark: '초기 라인 비고',
              bundleMode: null,
              productType: 'SINGLE',
              expandedComponents: [],
            },
          ]
    return {
      orderNumber: poId === 'ord-canceled'
        ? '2026/05/04-CAN'
        : poId === 'ord-converted'
          ? '2026/05/04-CVT'
          : '2026/05/04-1',
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
    }
  }

  const getPartnerOrderMutable = (poId: string): MockPartnerOrderMutable => {
    if (!partnerOrderCollabDetailsStore[poId]) {
      partnerOrderCollabDetailsStore[poId] = buildPartnerOrderDetail(poId)
    }
    return partnerOrderCollabDetailsStore[poId]!
  }

  const partnerOrderCollabStreamMatch = url.match(/\/api\/v1\/partner-orders\/([^/?]+)\/collab\/stream(?:\?.*)?$/)
  if (method === 'GET' && partnerOrderCollabStreamMatch) {
    return new Blob([': mock partner order collab stream\n\n'], { type: 'text/event-stream;charset=utf-8' })
  }

  const partnerOrderCollabCommentCollectionMatch = url.match(
    /\/api\/v1\/partner-orders\/([^/?]+)\/collab\/comments(?:\?.*)?$/,
  )
  if (partnerOrderCollabCommentCollectionMatch) {
    const poId = partnerOrderCollabCommentCollectionMatch[1]!
    if (method === 'GET') {
      const params = config.params as Record<string, unknown> | undefined
      const urlLimit = new URLSearchParams(url.split('?')[1] ?? '').get('limit')
      const rawLimit = Number.parseInt(String(params?.['limit'] ?? urlLimit ?? '20'), 10)
      const safeLimit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 100)) : 20
      return envelope([...(partnerOrderCollabCommentsStore[poId] ?? [])].slice(0, safeLimit))
    }
    if (method === 'POST') {
      const body = parseMockBody(config)
      const created: MockPartnerOrderCollabComment = {
        id: `mock-partner-order-collab-comment-${Date.now()}`,
        anchor: (body['anchor'] as string | null | undefined) ?? null,
        authorName: MOCK_AUTH.fullName,
        body: String(body['body'] ?? ''),
        parentId: (body['parentId'] as string | null | undefined) ?? null,
        status: 'OPEN',
        createdAt: new Date().toISOString(),
      }
      partnerOrderCollabCommentsStore[poId] = [created, ...(partnerOrderCollabCommentsStore[poId] ?? [])]
      return envelope(created)
    }
  }

  const partnerOrderCollabCommentItemMatch = url.match(
    /\/api\/v1\/partner-orders\/([^/?]+)\/collab\/comments\/([^/?]+)(?:\/(resolve))?(?:\?.*)?$/,
  )
  if (partnerOrderCollabCommentItemMatch) {
    const poId = partnerOrderCollabCommentItemMatch[1]!
    const commentId = partnerOrderCollabCommentItemMatch[2]!
    const action = partnerOrderCollabCommentItemMatch[3]
    const list = partnerOrderCollabCommentsStore[poId] ?? []
    const target = list.find((item) => item.id === commentId)
    if (method === 'POST' && action === 'resolve') {
      if (!target) return mockError(404, 'NOT_FOUND', '댓글을 찾을 수 없습니다')
      target.status = 'RESOLVED'
      return envelope(target)
    }
    if (method === 'DELETE') {
      if (!target) return mockError(404, 'NOT_FOUND', '댓글을 찾을 수 없습니다')
      partnerOrderCollabCommentsStore[poId] = list.filter((item) => item.id !== commentId)
      return envelope({ deleted: true })
    }
  }

  const partnerOrderCollabEditCollectionMatch = url.match(
    /\/api\/v1\/partner-orders\/([^/?]+)\/collab\/edits(?:\?.*)?$/,
  )
  if (partnerOrderCollabEditCollectionMatch) {
    const poId = partnerOrderCollabEditCollectionMatch[1]!
    if (method === 'GET') return envelope([...(partnerOrderCollabEditsStore[poId] ?? [])])
    if (method === 'POST') {
      const order = getPartnerOrderMutable(poId)
      if (['CANCELED', 'CONVERTED', 'CONFIRMING'].includes(order.status)) {
        return mockError(409, 'COLLAB_LOCKED', '잠금 상태 주문은 수정할 수 없습니다')
      }
      const body = parseMockBody(config)
      const created: MockPartnerOrderCollabEdit = {
        id: `mock-partner-order-collab-edit-${Date.now()}`,
        changeSet: String(body['changeSet'] ?? '{}'),
        reason: (body['reason'] as string | null | undefined) ?? null,
        proposerName: MOCK_AUTH.fullName,
        status: 'ACCEPTED',
        decidedByName: MOCK_AUTH.fullName,
        decidedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }

      try {
        const parsed = JSON.parse(created.changeSet) as Record<string, { after?: unknown }>
        for (const [field, change] of Object.entries(parsed)) {
          if (field === 'memo') {
            order.memo = change.after == null ? null : String(change.after)
            continue
          }
          if (field === 'dueDate') {
            order.dueDate = change.after == null ? null : String(change.after)
            continue
          }
          const lineRemarkMatch = field.match(/^line\.(\d+)\.remark$/)
          if (lineRemarkMatch) {
            const lineKey = Number.parseInt(lineRemarkMatch[1]!, 10)
            const line = order.lines[lineKey - 1]
            if (!line) return mockError(400, 'INVALID_INPUT', '라인 번호가 올바르지 않습니다')
            line.remark = change.after == null ? null : String(change.after)
            continue
          }
          return mockError(400, 'INVALID_INPUT', '수정 가능한 필드는 요청사항, 납기, 라인 비고뿐입니다')
        }
      } catch {
        return mockError(400, 'INVALID_INPUT', 'changeSet JSON 형식이 올바르지 않습니다')
      }

      order.updatedAt = new Date().toISOString()
      partnerOrderCollabEditsStore[poId] = [created, ...(partnerOrderCollabEditsStore[poId] ?? [])]
      return envelope({ edit: created, order })
    }
  }

  // ---- partner-order presence (join|leave POST + list GET) ----
  {
    const gop = globalThis as unknown as {
      __SAMHAN_MOCK_PARTNER_ORDER_PRESENCE?: Record<string, MockPresenceEntry[]>
    }
    if (!gop.__SAMHAN_MOCK_PARTNER_ORDER_PRESENCE) gop.__SAMHAN_MOCK_PARTNER_ORDER_PRESENCE = {}
    const partnerOrderPresenceStore = gop.__SAMHAN_MOCK_PARTNER_ORDER_PRESENCE

    const poPresenceActionMatch = url.match(/\/api\/v1\/partner-orders\/([^/?]+)\/collab\/presence\/(join|leave)(?:\?.*)?$/)
    if (poPresenceActionMatch && method === 'POST') {
      const orderId = poPresenceActionMatch[1]!
      const action = poPresenceActionMatch[2]!
      const body = parseMockBody(config)
      const rawSessionId = typeof body['sessionId'] === 'string' ? body['sessionId'].trim() : ''
      const rawDisplayName = typeof body['displayName'] === 'string' ? body['displayName'].trim() : ''
      const sessionId = rawSessionId || `mock-presence-${Date.now()}`
      if (action === 'leave') {
        partnerOrderPresenceStore[orderId] = (partnerOrderPresenceStore[orderId] ?? [])
          .filter((entry) => entry.sessionId !== sessionId)
        return envelope(null)
      }
      const displayName = rawDisplayName || MOCK_AUTH.fullName
      const colorSeed = readMockHeader(config, 'X-User-Id') || sessionId
      const entry: MockPresenceEntry = { sessionId, displayName, color: colorForPresence(colorSeed) }
      partnerOrderPresenceStore[orderId] = [
        ...(partnerOrderPresenceStore[orderId] ?? []).filter((item) => item.sessionId !== sessionId),
        entry,
      ]
      return envelope(entry)
    }

    const poPresenceListMatch = url.match(/\/api\/v1\/partner-orders\/([^/?]+)\/collab\/presence(?:\?.*)?$/)
    if (poPresenceListMatch && method === 'GET') {
      const orderId = poPresenceListMatch[1]!
      return envelope([...(partnerOrderPresenceStore[orderId] ?? [])])
    }
  }

  const partnerOrderDetailMatch = url.match(/\/api\/v1\/partner-orders\/([^/?]+)$/)
  if (method === 'GET' && partnerOrderDetailMatch) {
    const poId = partnerOrderDetailMatch[1]!
    try {
      const key = `__SAMHAN_PARTNER_ORDER_DETAIL_GET_COUNT_${poId}`
      const g = globalThis as Record<string, unknown>
      g[key] = Number(g[key] ?? 0) + 1
    } catch {
      /* noop */
    }
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
            remark: '에러 테스트 라인 비고',
            bundleMode: null,
            productType: 'SINGLE',
            expandedComponents: [],
          },
        ],
      })
    }

    // Round C #23: 세트(BUNDLE) 재고 가드 fixture
    //   ord-bundle-only  → BUNDLE 라인 1건만 → 재고조회 시 bundle-only 안내(세트 단위 재고 미표시)
    //   ord-bundle-mixed → BUNDLE 1 + SINGLE 1 → 혼합: "세트 1건 제외" 캡션 + 단품 매트릭스
    if (poId === 'ord-bundle-only' || poId === 'ord-bundle-mixed') {
      const bundleLine = {
        productId: 'p-set-hm2way',
        lineId: 'line-bundle-001',
        modelCode: 'SET-HM2WAY',
        productName: '홈멀티 2way 세트',
        categoryKey: 'singleSets',
        quantity: 1,
        convertedQuantity: 0,
        deliveryPrice: 2500000,
        subtotal: 2500000,
        remark: '세트 라인 비고',
        bundleMode: 'KEEP' as const,
        // BE PartnerOrderDetailResponse.LineResponse.productType enrich 정합 (product-service 조회)
        productType: 'BUNDLE',
        expandedComponents: [],
      }
      const singleLine = {
        productId: 'p-aj040',
        lineId: 'line-bundle-002',
        modelCode: 'AJ040RXH4BC1',
        productName: '실외기',
        categoryKey: 'homemulti',
        quantity: 2,
        convertedQuantity: 0,
        deliveryPrice: 120000,
        subtotal: 240000,
        remark: '단품 라인 비고',
        bundleMode: null,
        productType: 'SINGLE',
        expandedComponents: [],
      }
      return envelope({
        orderNumber: poId === 'ord-bundle-only' ? '2026/06/11-SET1' : '2026/06/11-MIX1',
        partnerCode: '1234567890',
        bizCode: '1234567890',
        partnerName: '엘에이시스템에어',
        submittedAt: '2026-06-11T10:00:00',
        updatedAt: '2026-06-11T10:00:00',
        status: 'DRAFT',
        totalAmount: poId === 'ord-bundle-only' ? 2500000 : 2740000,
        linkedSlipNo: null,
        deliveryAddress: '서울시 강남구 테헤란로 1',
        siteAddress: '현장 A동',
        contactPhone: '010-1234-5678',
        dueDate: '2026-06-20',
        memo: null,
        lines: poId === 'ord-bundle-only' ? [bundleLine] : [bundleLine, singleLine],
      })
    }

    return envelope(getPartnerOrderMutable(poId))
  }

  if (method === 'PUT' && partnerOrderDetailMatch) {
    ensureMockProductCatalogRowsSeeded()
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    if (body?.updatedAt === '409') {
      return mockError(409, 'PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT', '최신 내용으로 다시 확인해 주세요.')
    }
    const lineIdByModelCode: Record<string, string> = {
      'SET-HM2WAY': 'line-bundle-001',
      AJ040RXH4BC1: 'line-bundle-002',
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
      lines: body?.lines?.map((line: Record<string, unknown>, index: number) => {
        const modelCode = String(line['modelCode'] ?? '')
        const product = Object.values(MOCK_PRODUCTS_BY_MODEL).find(
          (p) => p.modelName === modelCode || p.modelCode === modelCode,
        )
        const catalogRow = MOCK_PRODUCT_CATALOG_ROWS.find((row) => row.modelCode === modelCode)
        return {
          productId: product?.productId ?? `mock-product-${index + 1}`,
          lineId: lineIdByModelCode[modelCode] ?? `line-po-${String(index + 1).padStart(3, '0')}`,
          modelCode,
          productName: line['productName'],
          categoryKey: line['categoryKey'],
          quantity: line['quantity'],
          convertedQuantity: 0,
          deliveryPrice: line['deliveryPrice'],
          subtotal: Number(line['quantity']) * Number(line['deliveryPrice']),
          remark: (line['remark'] as string | null | undefined) ?? null,
          bundleMode: modelCode === 'SET-HM2WAY' ? 'KEEP' : null,
          productType: product?.productType ?? catalogRow?.productType ?? 'SINGLE',
          expandedComponents: [],
        }
      }) ?? [],
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
    const body = parseMockBody(config) as {
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
    const body = parseMockBody(config) as {
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
    const body = parseMockBody(config) as { fromDate?: string; toDate?: string }
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
    // responseType:'blob' 소비자(downloadHometaxSplit)가 res.data 를 Blob 으로 사용하므로 실제 Blob 반환.
    // (string 반환 시 triggerDownload 가 실패 → 다운로드 이벤트 미발생.)
    return new Blob([`${header}${csv}`], { type: 'text/csv;charset=utf-8' })
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

  // 첫 접근 시 제외 거래처 seed 주입 (테스트별 fresh page → 재seed).
  if (url.includes('/accounting/hometax-export/exclusions') && mockBatchExclusionList.length === 0) {
    mockBatchExclusionList.push(...MOCK_BATCH_EXCLUSIONS.map((e) => ({ ...e })))
  }

  // POST /accounting/hometax-export/exclusions — 제외 거래처 추가 (목록에 실제 append)
  if (method === 'POST' && url.includes('/accounting/hometax-export/exclusions')) {
    const body = parseMockBody(config) as { partnerCode?: string; partnerName?: string; reason?: string }
    const created = {
      partnerCode: body.partnerCode ?? 'P-NEW',
      partnerName: body.partnerName ?? '신규 거래처',
      reason: body.reason ?? '—',
      createdAt: new Date().toISOString(),
      createdBy: '오병승',
    }
    // 동일 partnerCode 중복 방지 후 append.
    if (!mockBatchExclusionList.some((e) => e['partnerCode'] === created.partnerCode)) {
      mockBatchExclusionList.push(created)
    }
    return envelope(created)
  }

  // DELETE /accounting/hometax-export/exclusions/{partnerCode} — 목록에서 제거
  if (method === 'DELETE' && url.includes('/accounting/hometax-export/exclusions/')) {
    const code = decodeURIComponent(url.split('/exclusions/')[1]?.split('?')[0] ?? '')
    const idx = mockBatchExclusionList.findIndex((e) => e['partnerCode'] === code)
    if (idx >= 0) mockBatchExclusionList.splice(idx, 1)
    return envelope({ deleted: true })
  }

  // GET /accounting/hometax-export/exclusions — 제외 거래처 목록
  if (method === 'GET' && url.includes('/accounting/hometax-export/exclusions')) {
    return envelope([...mockBatchExclusionList])
  }

  // ==========================================================================
  // 세금계산서 일괄발행 — 구 endpoint (Deprecation: true 반환, URL 호환 유지)
  // ==========================================================================

  // @deprecated — POST /accounting/tax-invoices/batch/preview
  // HometaxExportPage 로 통합됨. /accounting/tax-invoices/batch route 는 Navigate redirect.
  if (method === 'POST' && url.includes('/accounting/tax-invoices/batch/preview')) {
    const body = parseMockBody(config) as {
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
    // responseType:'blob' 소비자(downloadHometaxSplit)가 res.data 를 Blob 으로 사용하므로 실제 Blob 반환.
    // (string 반환 시 triggerDownload 가 실패 → 다운로드 이벤트 미발생.)
    return new Blob([`${header}${csv}`], { type: 'text/csv;charset=utf-8' })
  }

  // @deprecated — GET /accounting/tax-invoices/batch/exclusions
  if (method === 'GET' && url.includes('/accounting/tax-invoices/batch/exclusions')) {
    return envelope(MOCK_BATCH_EXCLUSIONS)
  }

  // @deprecated — POST /accounting/tax-invoices/batch/exclusions
  if (method === 'POST' && url.includes('/accounting/tax-invoices/batch/exclusions')) {
    const body = parseMockBody(config) as {
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
  // submitMethod=DRY_RUN → 가짜 OCR 결과 + 매입 전표 번호 반환.
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
        matchedTaxInvoiceNo: '2026/05/02-0001',
        status: 'MATCHED',
        journalDraft: {
          lines: [
            { side: 'DEBIT', accountCode: '102', accountName: '보통예금', amount: 2750000 },
            { side: 'CREDIT', accountCode: '110', accountName: '외상매출금', amount: 2750000 },
          ],
        },
      },
      {
        depositorName: '△△인테리어',
        amount: 1320000,
        transactionDate: `${ym}-05`,
        matchedPartnerCode: null,
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
        matchedTaxInvoiceNo: '2026/05/12-0003',
        status: 'MATCHED',
        journalDraft: {
          lines: [
            { side: 'DEBIT', accountCode: '102', accountName: '보통예금', amount: 4180000 },
            { side: 'CREDIT', accountCode: '110', accountName: '외상매출금', amount: 4180000 },
          ],
        },
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

  // Permission Groups Phase A — stateful in-process mock.
  if (method === 'GET' && (url.endsWith('/auth/admin/approval-line-configs/groups') || url.endsWith('/admin/approval-line-configs/groups'))) {
    return envelope(
      _mockPermissionGroups
        .filter((group) => !group.systemMaster)
        .map((group) => ({ id: group.id, name: group.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    )
  }

  const approvalLineUsersMatch = url.match(/\/(?:auth\/)?admin\/approval-line-configs\/users(?:\?([^#]*))?$/)
  if (method === 'GET' && approvalLineUsersMatch) {
    const params = new URLSearchParams(approvalLineUsersMatch[1] ?? '')
    const q = (params.get('q') ?? '').trim().toLocaleLowerCase()
    const limit = Math.max(1, Math.min(Number(params.get('limit') ?? '20') || 20, 50))
    return envelope(
      MOCK_ADMIN_USERS
        .filter((user) => user.terminationDate === null)
        .filter((user) => !mockAccountBelongsToSystemMaster(user.id))
        .filter((user) => !q || user.fullName.toLocaleLowerCase().includes(q))
        .slice(0, limit)
        .map((user) => ({
          id: user.id,
          displayName: user.departmentName ? `${user.fullName} (${user.departmentName})` : user.fullName,
        })),
    )
  }

  const approvalLineConfigListMatch = url.match(/\/(?:auth\/)?admin\/approval-line-configs(?:\?([^#]*))?$/)
  if (method === 'GET' && approvalLineConfigListMatch) {
    const params = new URLSearchParams(approvalLineConfigListMatch[1] ?? '')
    const documentType = params.get('documentType') ?? 'SLIP_OUTBOUND'
    return envelope(
      _mockApprovalLineConfigRoles
        .filter((role) => role.documentType === documentType && !role.isDeleted)
        .sort((a, b) => a.sequence - b.sequence)
        .map(mockApprovalLineRoleView),
    )
  }

  const approvalLineStructureMatch = url.match(/\/(?:auth\/)?approval-line-configs\/([^/?]+)\/structure$/)
  if (method === 'GET' && approvalLineStructureMatch) {
    const documentType = decodeURIComponent(approvalLineStructureMatch[1] ?? 'SLIP_OUTBOUND')
    return envelope(
      _mockApprovalLineConfigRoles
        .filter((role) => role.documentType === documentType && !role.isDeleted)
        .sort((a, b) => a.sequence - b.sequence)
        .map(mockApprovalLineStructureView),
    )
  }

  const approvalLineDefaultApproversMatch = url.match(/\/(?:auth\/)?approval-line-configs\/([^/?]+)\/default-approvers$/)
  if (method === 'GET' && approvalLineDefaultApproversMatch) {
    const documentType = decodeURIComponent(approvalLineDefaultApproversMatch[1] ?? '')
    return envelope(
      _mockApprovalLineConfigRoles
        .filter((role) => role.documentType === documentType && !role.isDeleted)
        .sort((a, b) => a.sequence - b.sequence)
        .flatMap(mockApprovalLineDefaultApproverViews),
    )
  }

  if (method === 'POST' && url.match(/\/(?:auth\/)?admin\/approval-line-configs$/)) {
    const body = parseMockBody(config)
    const documentType = String(body['documentType'] ?? '').trim()
    const label = String(body['label'] ?? '').trim()
    if (!documentType) return mockError(400, 'INVALID_INPUT', '전표 종류(documentType)를 입력해야 합니다.')
    if (!label) return mockError(400, 'INVALID_INPUT', '라벨은 빈 값일 수 없습니다.')
    const active = _mockApprovalLineConfigRoles.filter((role) => role.documentType === documentType && !role.isDeleted)
    const role: MockApprovalLineRole = {
      id: `mock-approval-line-${documentType.toLocaleLowerCase()}-${Date.now()}`,
      documentType,
      sequence: active.reduce((max, item) => Math.max(max, item.sequence), -1) + 1,
      label,
      stepType: 'GROUP',
      approvers: [],
      required: true,
      actionKey: null,
      createdBy: 'mock-actor',
    }
    _mockApprovalLineConfigRoles.push(role)
    return envelope(mockApprovalLineRoleView(role))
  }

  const approvalLineApproverMatch = url.match(/\/(?:auth\/)?admin\/approval-line-configs\/([^/?]+)\/approvers(?:\/([^/?]+))?$/)
  if (approvalLineApproverMatch && method === 'POST') {
    const roleId = decodeURIComponent(approvalLineApproverMatch[1]!)
    const role = _mockApprovalLineConfigRoles.find((item) => item.id === roleId && !item.isDeleted)
    if (!role) return mockError(404, 'NOT_FOUND', '결재 역할을 찾을 수 없습니다.')
    if (role.stepType === 'CREATOR') {
      return mockError(400, 'INVALID_INPUT', '작성자 역할은 변경할 수 없습니다.')
    }
    const body = parseMockBody(config)
    const type = String(body['type'] ?? '').toUpperCase()
    const refId = String(body['refId'] ?? '').trim()
    if (type !== 'GROUP' && type !== 'USER') {
      return mockError(400, 'INVALID_INPUT', '결재자 유형은 GROUP 또는 USER 여야 합니다.')
    }
    if (!refId) return mockError(400, 'INVALID_INPUT', '결재자 참조 ID를 입력해야 합니다.')
    if (type === 'GROUP') {
      const group = _mockPermissionGroups.find((item) => item.id === refId)
      if (!group) return mockError(400, 'INVALID_INPUT', '존재하지 않는 권한 그룹입니다.')
      if (group.systemMaster) return mockError(400, 'INVALID_INPUT', '시스템 마스터 그룹은 결재 그룹으로 지정할 수 없습니다.')
    } else {
      if (!mockAccountById(refId)) {
        return mockError(400, 'INVALID_INPUT', '존재하지 않는 사원입니다.')
      }
      if (mockAccountBelongsToSystemMaster(refId)) {
        return mockError(400, 'INVALID_INPUT', '시스템 마스터 계정은 결재자로 지정할 수 없습니다')
      }
    }
    if (role.approvers.some((item) => item.type === type && item.refId === refId)) {
      return mockError(400, 'INVALID_INPUT', '이미 지정된 결재자입니다.')
    }
    role.approvers.push({
      id: `mock-approval-line-approver-${Date.now()}-${role.approvers.length}`,
      type: type as 'GROUP' | 'USER',
      refId,
    })
    return envelope(mockApprovalLineRoleView(role))
  }

  if (approvalLineApproverMatch && method === 'DELETE') {
    const roleId = decodeURIComponent(approvalLineApproverMatch[1]!)
    const approverId = decodeURIComponent(approvalLineApproverMatch[2] ?? '')
    const role = _mockApprovalLineConfigRoles.find((item) => item.id === roleId && !item.isDeleted)
    if (!role) return mockError(404, 'NOT_FOUND', '결재 역할을 찾을 수 없습니다.')
    if (role.stepType === 'CREATOR') {
      return mockError(400, 'INVALID_INPUT', '작성자 역할은 변경할 수 없습니다.')
    }
    role.approvers = role.approvers.filter((item) => item.id !== approverId)
    return envelope(mockApprovalLineRoleView(role))
  }

  // PUT /approval-line-configs/{id}/label — 역할 라벨 인라인 편집 (stateful)
  const approvalLineConfigLabelMatch = url.match(/\/(?:auth\/)?admin\/approval-line-configs\/([^/?]+)\/label$/)
  if (method === 'PUT' && approvalLineConfigLabelMatch) {
    const roleId = decodeURIComponent(approvalLineConfigLabelMatch[1]!)
    const role = _mockApprovalLineConfigRoles.find((item) => item.id === roleId && !item.isDeleted)
    if (!role) return mockError(404, 'NOT_FOUND', '결재 역할을 찾을 수 없습니다.')
    if (role.stepType === 'CREATOR') {
      return mockError(400, 'INVALID_INPUT', '작성자 역할은 변경할 수 없습니다.')
    }
    const body = parseMockBody(config)
    const nextLabel = String(body['label'] ?? '').trim()
    if (!nextLabel) return mockError(400, 'INVALID_INPUT', '라벨은 빈 값일 수 없습니다.')
    role.label = nextLabel
    return envelope(mockApprovalLineRoleView(role))
  }

  // PUT /approval-line-configs/reorder?documentType= — 역할 순서 변경 (stateful, 2-phase in-process)
  const approvalLineConfigReorderMatch = url.match(/\/(?:auth\/)?admin\/approval-line-configs\/reorder(\?.*)?$/)
  if (method === 'PUT' && approvalLineConfigReorderMatch) {
    const params = new URLSearchParams(approvalLineConfigReorderMatch[1]?.replace(/^\?/, '') ?? '')
    const documentType = params.get('documentType') ?? 'SLIP_OUTBOUND'
    const body = parseMockBody(config)
    const orderedIds: string[] = Array.isArray(body['orderedIds'])
      ? (body['orderedIds'] as unknown[]).map(String)
      : []

    const active = _mockApprovalLineConfigRoles.filter((r) => r.documentType === documentType && !r.isDeleted)

    // 부분요청 가드: orderedIds 집합 == active 집합
    const activeIdSet = new Set(active.map((r) => r.id))
    const requestedIdSet = new Set(orderedIds)
    if (
      orderedIds.length !== active.length ||
      orderedIds.some((id) => !activeIdSet.has(id)) ||
      active.some((r) => !requestedIdSet.has(r.id))
    ) {
      return mockError(400, 'INVALID_INPUT', '결재라인 역할 전체를 순서대로 전달해야 합니다.')
    }

    // CREATOR 1순위 가드
    const firstRole = _mockApprovalLineConfigRoles.find((r) => r.id === orderedIds[0] && !r.isDeleted)
    if (!firstRole || firstRole.stepType !== 'CREATOR') {
      return mockError(400, 'INVALID_INPUT', '작성자는 항상 첫 순서여야 합니다.')
    }

    // sequence 재할당
    orderedIds.forEach((id, index) => {
      const r = _mockApprovalLineConfigRoles.find((item) => item.id === id && !item.isDeleted)
      if (r) r.sequence = index
    })

    return envelope(
      _mockApprovalLineConfigRoles
        .filter((r) => r.documentType === documentType && !r.isDeleted)
        .sort((a, b) => a.sequence - b.sequence)
        .map(mockApprovalLineRoleView),
    )
  }

  const approvalLineConfigRoleMatch = url.match(/\/(?:auth\/)?admin\/approval-line-configs\/([^/?]+)$/)
  if (method === 'DELETE' && approvalLineConfigRoleMatch) {
    const roleId = decodeURIComponent(approvalLineConfigRoleMatch[1]!)
    const role = _mockApprovalLineConfigRoles.find((item) => item.id === roleId)
    if (!role || role.isDeleted) return envelope(null)
    if (role.stepType === 'CREATOR') {
      return mockError(400, 'INVALID_INPUT', '작성자 역할은 삭제할 수 없습니다.')
    }
    role.isDeleted = true
    role.approvers = []
    return envelope(null)
  }

  if (method === 'PUT' && approvalLineConfigRoleMatch) {
    const roleId = decodeURIComponent(approvalLineConfigRoleMatch[1]!)
    const role = _mockApprovalLineConfigRoles.find((item) => item.id === roleId && !item.isDeleted)
    if (!role) return mockError(404, 'NOT_FOUND', '결재 역할을 찾을 수 없습니다.')

    if (role.stepType === 'CREATOR') {
      return mockError(400, 'INVALID_INPUT', '작성자 역할은 변경할 수 없습니다.')
    }
    const body = parseMockBody(config)
    role.required = Boolean(body['required'])
    return envelope(mockApprovalLineRoleView(role))
  }

  if (method === 'GET' && (url.endsWith('/auth/admin/permission-groups') || url.endsWith('/admin/permission-groups'))) {
    return envelope(_mockPermissionGroups.map(mockPermissionGroupSummary))
  }

  if (method === 'POST' && (url.endsWith('/auth/admin/permission-groups') || url.endsWith('/admin/permission-groups'))) {
    const body = parseMockBody(config)
    const name = String(body['name'] ?? '').trim()
    if (!name) return mockError(400, 'INVALID_INPUT', '권한그룹 이름은 필수입니다.')
    if (_mockPermissionGroups.some((group) => group.name === name)) {
      return mockError(409, 'CONFLICT', '이미 사용 중인 권한그룹 이름입니다.')
    }
    const group: MockPermissionGroup = {
      id: `mock-group-${Date.now()}`,
      name,
      description: typeof body['description'] === 'string' && body['description'].trim()
        ? body['description'].trim()
        : null,
      builtin: false,
      systemMaster: false,
    }
    _mockPermissionGroups.push(group)
    _mockPermissionGroupMatrices[group.id] = Object.fromEntries(
      SP_D1_PAGES.map((page) => [page, emptyMockActionMatrix()]),
    ) as Record<string, MockActionMatrix>
    return envelope(mockPermissionGroupSummary(group))
  }

  const groupDelegationMatch = url.match(/\/(?:auth\/)?admin\/permission-groups\/([^/]+)\/delegations$/)
  if (groupDelegationMatch) {
    const groupId = decodeURIComponent(groupDelegationMatch[1]!)
    const group = _mockPermissionGroups.find((g) => g.id === groupId)
    if (!group) return mockError(404, 'NOT_FOUND', '권한그룹을 찾을 수 없습니다.')

    if (method === 'GET') {
      return envelope(mockGroupDelegations(groupId))
    }

    if (method === 'PUT') {
      if (MOCK_AUTH.role !== 'MASTER') {
        return mockError(403, 'FORBIDDEN', '권한 위임은 MASTER 만 수행할 수 있습니다.')
      }
      if (group.builtin || group.systemMaster) {
        return mockError(409, 'CONFLICT', '시스템 권한그룹은 변경하거나 삭제할 수 없습니다.')
      }
      const body = parseMockBody(config)
      setMockDelegation(groupId, 'system.permission-admin', Boolean(body['permissionAdmin']))
      setMockDelegation(groupId, 'hr.role-management', Boolean(body['hrRoleManagement']))
      setMockDelegation(groupId, 'admin.permission-groups', Boolean(body['permissionGroups']))
      return envelope(mockGroupDelegations(groupId))
    }
  }

  const groupCrudMatch = url.match(/\/(?:auth\/)?admin\/permission-groups\/([^/]+)$/)
  if (groupCrudMatch && !url.includes('/permissions')) {
    const groupId = decodeURIComponent(groupCrudMatch[1]!)
    const group = _mockPermissionGroups.find((g) => g.id === groupId)
    if (!group) return mockError(404, 'NOT_FOUND', '권한그룹을 찾을 수 없습니다.')

    if (method === 'PUT') {
      if (group.builtin || group.systemMaster) {
        return mockError(409, 'CONFLICT', '시스템 권한그룹은 변경할 수 없습니다.')
      }
      const body = parseMockBody(config)
      const name = String(body['name'] ?? '').trim()
      if (!name) return mockError(400, 'INVALID_INPUT', '권한그룹 이름은 필수입니다.')
      if (_mockPermissionGroups.some((g) => g.id !== group.id && g.name === name)) {
        return mockError(409, 'CONFLICT', '이미 사용 중인 권한그룹 이름입니다.')
      }
      group.name = name
      group.description = typeof body['description'] === 'string' && body['description'].trim()
        ? body['description'].trim()
        : null
      return envelope(mockPermissionGroupSummary(group))
    }

    if (method === 'DELETE') {
      if (group.builtin || group.systemMaster) {
        return mockError(409, 'CONFLICT', '시스템 권한그룹은 삭제할 수 없습니다.')
      }
      const assignedCount = Object.values(_mockAccountGroups).filter((ids) => ids.includes(group.id)).length
      if (assignedCount > 0) {
        return mockError(409, 'CONFLICT', '배속 계정이 있는 권한그룹은 삭제할 수 없습니다.')
      }
      const index = _mockPermissionGroups.findIndex((g) => g.id === group.id)
      if (index >= 0) _mockPermissionGroups.splice(index, 1)
      delete _mockPermissionGroupMatrices[group.id]
      return envelope({ deleted: true })
    }
  }

  const groupMatrixMatch = url.match(/\/(?:auth\/)?admin\/permission-groups\/([^/]+)\/permissions$/)
  if (groupMatrixMatch) {
    const groupId = decodeURIComponent(groupMatrixMatch[1]!)
    if (!_mockPermissionGroups.some((group) => group.id === groupId)) {
      return mockError(404, 'NOT_FOUND', '권한그룹을 찾을 수 없습니다.')
    }
    if (method === 'GET') {
      return envelope(_mockPermissionGroupMatrices[groupId] ?? {})
    }
    if (method === 'PUT') {
      const body = parseMockBody(config) as { rows?: Array<Record<string, unknown>> }
      if (!Array.isArray(body.rows)) {
        return mockError(400, 'INVALID_INPUT', '권한그룹 권한 rows 는 필수입니다.')
      }
      const matrix = _mockPermissionGroupMatrices[groupId] ?? {}
      for (const row of body.rows) {
        const pageCode = String(row['pageCode'] ?? '')
        const actions = row['actions']
        if (!pageCode || typeof actions !== 'object' || actions === null || Array.isArray(actions)) {
          return mockError(400, 'INVALID_INPUT', '권한그룹 권한 rows.actions 는 필수입니다.')
        }
        const actionMatrix = actions as Partial<MockActionMatrix>
        const next = matrix[pageCode] ?? emptyMockActionMatrix()
        next.view = Boolean(actionMatrix.view)
        next.create = Boolean(actionMatrix.create)
        next.update = Boolean(actionMatrix.update)
        next.delete = Boolean(actionMatrix.delete)
        next.restore = Boolean(actionMatrix.restore)
        next.download = Boolean(actionMatrix.download)
        next.print = Boolean(actionMatrix.print)
        matrix[pageCode] = next
      }
      _mockPermissionGroupMatrices[groupId] = matrix
      return envelope({ changedCount: body.rows.length })
    }
  }

  const accountGroupsMatch = url.match(/\/(?:auth\/)?admin\/accounts\/([^/]+)\/groups(?:\/([^/]+))?$/)
  if (accountGroupsMatch) {
    const accountId = decodeURIComponent(accountGroupsMatch[1]!)
    const pathGroupId = accountGroupsMatch[2] ? decodeURIComponent(accountGroupsMatch[2]) : null
    const account = mockAccountById(accountId)
    if (!account) return mockError(404, 'NOT_FOUND', '계정을 찾을 수 없습니다.')

    if (method === 'GET' && !pathGroupId) {
      const assigned = (_mockAccountGroups[accountId] ?? [])
        .map((groupId) => _mockPermissionGroups.find((group) => group.id === groupId))
        .filter((group): group is MockPermissionGroup => Boolean(group))
        .map((group) => mockAccountGroupSummary(accountId, group))
      return envelope(assigned)
    }

    if (method === 'POST' && !pathGroupId) {
      const body = parseMockBody(config)
      const groupId = String(body['groupId'] ?? '')
      const group = _mockPermissionGroups.find((g) => g.id === groupId)
      if (!group) return mockError(404, 'NOT_FOUND', '권한그룹을 찾을 수 없습니다.')
      const current = _mockAccountGroups[accountId] ?? []
      if (!current.includes(groupId)) current.push(groupId)
      _mockAccountGroups[accountId] = current
      return envelope(mockAccountGroupSummary(accountId, group))
    }

    if (method === 'DELETE' && pathGroupId) {
      _mockAccountGroups[accountId] = (_mockAccountGroups[accountId] ?? [])
        .filter((groupId) => groupId !== pathGroupId)
      return envelope({ deleted: true })
    }
  }

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
        const actionOnly = MOCK_ACTION_ONLY_PAGES[page]
        if (actionOnly) {
          const editable = legacyCell?.edit ?? false
          accountMatrix[page] = {
            view: legacyCell?.view ?? false,
            create: editable && actionOnly.includes('CREATE'),
            update: editable && actionOnly.includes('UPDATE'),
            delete: editable && actionOnly.includes('DELETE'),
            restore: editable && actionOnly.includes('RESTORE'),
            download: editable && actionOnly.includes('DOWNLOAD'),
            print: editable && actionOnly.includes('PRINT'),
          }
          continue
        }
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
      // system.permission-admin 는 MASTER 전용 이중 가드 (RoleGuard + PermissionGuard).
      // mock 계정(MANAGER/SALES/DISPATCH)에는 MASTER 가 없으므로 일괄 미부여(false) — 실 BE MASTER 전용 정책과 정합.
      accountMatrix['system.permission-admin'] = {
        view: false,
        create: false,
        update: false,
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
    // 3-A2-③: ?mockPerms= 시나리오 주입이 있으면 role 기본보다 우선(revoke/grant 재현).
    const mockPerms = _resolveMockPerms()
    if (mockPerms) {
      const permissions: Record<string, string[]> = {}
      for (const p of mockPerms) {
        const actions: string[] = []
        if (p.view) actions.push('VIEW', 'DOWNLOAD', 'PRINT')
        if (p.edit) actions.push('CREATE', 'UPDATE', 'DELETE')
        if (actions.length > 0) permissions[p.pageCode] = actions
      }
      return envelope(permissions)
    }
    if (mockRole === 'MASTER') {
      const permissions: Record<string, string[]> = {}
      for (const page of SP_D1_PAGES) permissions[page] = allActions
      permissions['system.permission-admin'] = allActions
      return envelope(permissions)
    }
    const myCells = _mockPermissionCells.filter((c) => c.roleCode === mockRole)
    const permissions: Record<string, string[]> = {}
    for (const cell of myCells) {
      const actions: string[] = []
      if (cell.view) actions.push('VIEW')
      // [C2c] 특수 page-code 는 action-only(seed 정합) — 일반 edit→CRUD 도출 대신 지정 액션만.
      // sales.partner-order.convert = create-only(V41) → update/delete 과다 grant 방지(Codex review P1).
      const actionOnly = MOCK_ACTION_ONLY_PAGES[cell.pageCode]
      if (actionOnly) {
        if (cell.edit) actions.push(...actionOnly)
      } else {
        if (cell.edit) actions.push('CREATE', 'UPDATE', 'DELETE')
        // download/print 는 BE read-side export 계약을 따르므로 view 권한에서 파생한다.
        if (cell.view) actions.push('DOWNLOAD', 'PRINT')
      }
      permissions[cell.pageCode] = actions
    }
    return envelope(permissions)
  }

  // ============================================================================
  // D-SER-23: 시리얼 보상 실패 복구 API mock
  // ============================================================================

  // GET /api/v1/slips/compensation-failures?resolved=&page=&size=
  if (method === 'GET' && url.includes('/api/v1/slips/compensation-failures')) {
    const params = config.params as Record<string, unknown> | undefined
    const resolvedFilter = params?.['resolved']
    // resolved 파라미터는 boolean 또는 문자열 'true'/'false' 로 올 수 있음
    const showResolved =
      resolvedFilter === true || resolvedFilter === 'true'
    const pageNum = Number(params?.['page'] ?? 0)
    const pageSize = Number(params?.['size'] ?? 20)

    const filtered = MOCK_COMPENSATION_FAILURES.map((f) => ({
      ...f,
      resolved: mockCompensationResolvedIds.has(f.id),
    })).filter((f) => f.resolved === showResolved)

    const start = pageNum * pageSize
    const content = filtered.slice(start, start + pageSize)
    return envelope({
      content,
      totalElements: filtered.length,
      totalPages: Math.ceil(filtered.length / pageSize) || 1,
      number: pageNum,
      size: pageSize,
      first: pageNum === 0,
      last: start + pageSize >= filtered.length,
    })
  }

  // PATCH /api/v1/slips/compensation-failures/{id}/resolve
  const cfResolveMatch = url.match(
    /\/api\/v1\/slips\/compensation-failures\/([^/]+)\/resolve$/,
  )
  if (method === 'PATCH' && cfResolveMatch) {
    const id = cfResolveMatch[1]!
    const target = MOCK_COMPENSATION_FAILURES.find((f) => f.id === id)
    if (!target) {
      return mockError(404, 'COMPENSATION_FAILURE_NOT_FOUND', '보상 실패 레코드를 찾을 수 없습니다.')
    }
    // 멱등: 이미 resolved 면 변경 없음
    mockCompensationResolvedIds.add(id)
    return envelope({ ...target, resolved: true })
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
    journalNo: '2026/05/01-001',
    journalDate: '2026-05-04',
    sourceType: 'SLIP' as const,
    sourceTypeDisplayName: '전표',
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
        lineNo: 1,
        accountCode: '1020',
        accountName: '보통예금',
        debit: '3700000',
        credit: '0',
        partnerName: '주식회사 윌리',
        memo: '국민은행 입금',
      },
      {
        id: 'jl-001-2',
        lineNo: 2,
        accountCode: '4010',
        accountName: '제품매출',
        debit: '0',
        credit: '3700000',
        partnerName: '주식회사 윌리',
        memo: '시스템에어컨 4Way 4HP 2EA',
      },
    ],
  },
  // 2. POSTED: 급여 지급
  {
    id: 'jv-002',
    journalNo: '2026/05/03-002',
    journalDate: '2026-05-03',
    sourceType: 'MANUAL' as const,
    sourceTypeDisplayName: '수기',
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
        lineNo: 1,
        accountCode: '8010',
        accountName: '급여',
        debit: '12000000',
        credit: '0',
        partnerName: null,
        memo: '4월분 정규직 급여',
      },
      {
        id: 'jl-002-2',
        lineNo: 2,
        accountCode: '2110',
        accountName: '예수금',
        debit: '0',
        credit: '1080000',
        partnerName: null,
        memo: '소득세 + 4대보험 원천징수',
      },
      {
        id: 'jl-002-3',
        lineNo: 3,
        accountCode: '1020',
        accountName: '보통예금',
        debit: '0',
        credit: '10920000',
        partnerName: null,
        memo: '실지급액 이체',
      },
    ],
  },
  // 3. POSTED: 임차료 지급
  {
    id: 'jv-003',
    journalNo: '2026/05/02-003',
    journalDate: '2026-05-02',
    sourceType: 'CASH_DISBURSEMENT' as const,
    sourceTypeDisplayName: '지출결의서',
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
        lineNo: 1,
        accountCode: '8120',
        accountName: '임차료',
        debit: '2000000',
        credit: '0',
        partnerName: '한일빌딩',
        memo: '5월분',
      },
      {
        id: 'jl-003-2',
        lineNo: 2,
        accountCode: '1020',
        accountName: '보통예금',
        debit: '0',
        credit: '2000000',
        partnerName: '한일빌딩',
        memo: '계좌이체',
      },
    ],
  },
  // 4. DRAFT: 광고비 (작성중)
  {
    id: 'jv-004',
    journalNo: '2026/05/04-004',
    journalDate: '2026-05-04',
    sourceType: 'MANUAL' as const,
    sourceTypeDisplayName: '수기',
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
        lineNo: 1,
        accountCode: '8210',
        accountName: '광고선전비',
        debit: '500000',
        credit: '0',
        partnerName: '네이버',
        memo: '5월 검색광고',
      },
      {
        id: 'jl-004-2',
        lineNo: 2,
        accountCode: '2030',
        accountName: '미지급금',
        debit: '0',
        credit: '500000',
        partnerName: '네이버',
        memo: '카드 후불',
      },
    ],
  },
  // 5. REVERSED: 잘못 등록한 매출 (역분개됨)
  {
    id: 'jv-005',
    journalNo: '2026/05/01-005',
    journalDate: '2026-05-01',
    sourceType: 'CLOSING' as const,
    sourceTypeDisplayName: '결산',
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
        lineNo: 1,
        accountCode: '1110',
        accountName: '외상매출금',
        debit: '1500000',
        credit: '0',
        partnerName: '○○종합건설',
        memo: '5/1 출고분',
      },
      {
        id: 'jl-005-2',
        lineNo: 2,
        accountCode: '4010',
        accountName: '제품매출',
        debit: '0',
        credit: '1500000',
        partnerName: '○○종합건설',
        memo: '시스템에어컨 4Way 5HP 1EA (오등록)',
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

const MOCK_TRIAL_BALANCE_SUMMARY = {
  fromDate: '2026-05-01',
  toDate: '2026-05-31',
  granularity: 'MONTH',
  rows: [
    {
      accountCode: '1020',
      accountName: '보통예금',
      category: 'ASSET',
      categoryDisplayName: '자산',
      openingBalance: '50000000',
      debitBalance: '40780000',
      debitTotal: '3700000',
      creditTotal: '12920000',
      creditBalance: '0',
      closingBalance: '40780000',
    },
    {
      accountCode: '2110',
      accountName: '예수금',
      category: 'LIABILITY',
      categoryDisplayName: '부채',
      openingBalance: '0',
      debitBalance: '0',
      debitTotal: '0',
      creditTotal: '1080000',
      creditBalance: '1080000',
      closingBalance: '1080000',
    },
    {
      accountCode: '4010',
      accountName: '제품매출',
      category: 'REVENUE',
      categoryDisplayName: '매출',
      openingBalance: '0',
      debitBalance: '0',
      debitTotal: '0',
      creditTotal: '3700000',
      creditBalance: '3700000',
      closingBalance: '3700000',
    },
    {
      accountCode: '3010',
      accountName: '자본금',
      category: 'EQUITY',
      categoryDisplayName: '자본',
      openingBalance: '30000000',
      debitBalance: '0',
      debitTotal: '0',
      creditTotal: '0',
      creditBalance: '30000000',
      closingBalance: '30000000',
    },
    {
      accountCode: '3020',
      accountName: '이익잉여금',
      category: 'EQUITY',
      categoryDisplayName: '자본',
      openingBalance: '20000000',
      debitBalance: '0',
      debitTotal: '0',
      creditTotal: '0',
      creditBalance: '20000000',
      closingBalance: '20000000',
    },
    {
      accountCode: '8010',
      accountName: '급여',
      category: 'SGA',
      categoryDisplayName: '판매비와관리비',
      openingBalance: '0',
      debitBalance: '12000000',
      debitTotal: '12000000',
      creditTotal: '0',
      creditBalance: '0',
      closingBalance: '12000000',
    },
    {
      accountCode: '8120',
      accountName: '임차료',
      category: 'SGA',
      categoryDisplayName: '판매비와관리비',
      openingBalance: '0',
      debitBalance: '2000000',
      debitTotal: '2000000',
      creditTotal: '0',
      creditBalance: '0',
      closingBalance: '2000000',
    },
  ],
  totals: {
    openingBalanceTotal: '100000000',
    debitBalanceTotal: '54780000',
    debitTotal: '17700000',
    creditTotal: '17700000',
    creditBalanceTotal: '54780000',
    closingBalanceTotal: '109560000',
    balanced: true,
  },
  generatedAt: '2026-05-31T18:00:00',
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
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
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
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
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
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
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
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
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
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
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
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
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
  {
    id: '11111111-1111-1111-1111-111111111111',
    partnerCode: 'P-WILLY-001',
    partnerName: '주식회사 윌리',
    representative: '윌리',
    businessNumber: '111-11-11111',
    address: '서울특별시 중구 세종대로 1',
    phone: '02-1111-1111',
    status: 'ACTIVE' as const,
    creditLimit: '50000000',
    currentBalance: '3700000',
    createdAt: '2024-01-10T09:00:00+09:00',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    partnerCode: 'P-HANIL-002',
    partnerName: '한일빌딩',
    representative: '한일',
    businessNumber: '222-22-22222',
    address: '서울특별시 서초구 반포대로 2',
    phone: '02-2222-2222',
    status: 'ACTIVE' as const,
    creditLimit: '20000000',
    currentBalance: '2000000',
    createdAt: '2024-02-10T09:00:00+09:00',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    partnerCode: 'P-NAVER-003',
    partnerName: '네이버',
    representative: '네이버',
    businessNumber: '333-33-33333',
    address: '경기도 성남시 분당구 정자일로 95',
    phone: '031-3333-3333',
    status: 'ACTIVE' as const,
    creditLimit: '10000000',
    currentBalance: '500000',
    createdAt: '2024-03-10T09:00:00+09:00',
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

// ---------------------------------------------------------------------------
// 출고전표 마감시간 설정 mock 시드 (V51 4행 기본값과 동일)
// ---------------------------------------------------------------------------

type MockSlipCutoff = {
  id: string
  deliveryTag: string
  deliveryTagLabel: string
  cutoffTime: string
  active: boolean
  createdAt: string
  modifiedAt: string | null
  deleted?: boolean
}

/** OUTBOUND DeliveryTag 한국어 라벨 맵. */
const OUTBOUND_TAG_LABELS: Record<string, string> = {
  DAY: '당일',
  STACK: '야적',
  REGION: '지방',
  LOGEN: '로젠택배',
  GYEONGDONG_PARCEL: '경동택배',
  GYEONGDONG_FREIGHT: '경동화물',
  RENTAL: '대여',
  RETURN_RENTAL: '반납',
}

/** OUTBOUND 배송태그 전체 8종 (delivery-tags 엔드포인트 응답). */
const MOCK_DELIVERY_TAGS = Object.entries(OUTBOUND_TAG_LABELS).map(([tag, label]) => ({
  tag,
  label,
}))

const MOCK_SLIP_CUTOFFS: MockSlipCutoff[] = [
  {
    id: 'cutoff-region',
    deliveryTag: 'REGION',
    deliveryTagLabel: '지방',
    cutoffTime: '12:00',
    active: true,
    createdAt: '2026-06-24T00:00:00',
    modifiedAt: null,
  },
  {
    id: 'cutoff-stack',
    deliveryTag: 'STACK',
    deliveryTagLabel: '야적',
    cutoffTime: '14:00',
    active: true,
    createdAt: '2026-06-24T00:00:00',
    modifiedAt: null,
  },
  {
    id: 'cutoff-gyeongdong-parcel',
    deliveryTag: 'GYEONGDONG_PARCEL',
    deliveryTagLabel: '경동택배',
    cutoffTime: '15:00',
    active: true,
    createdAt: '2026-06-24T00:00:00',
    modifiedAt: null,
  },
  {
    id: 'cutoff-gyeongdong-freight',
    deliveryTag: 'GYEONGDONG_FREIGHT',
    deliveryTagLabel: '경동화물',
    cutoffTime: '15:00',
    active: true,
    createdAt: '2026-06-24T00:00:00',
    modifiedAt: null,
  },
]

const MOCK_EXTERNAL_CARRIERS: Array<{
  id: string
  name: string
  phone: string
  email: string | null
  defaultVehicleType: string | null
  memo: string | null
  active: boolean
  createdAt: string
  modifiedAt: string | null
  deleted?: boolean
}> = [
  {
    id: 'carrier-001',
    name: '한빛퀵',
    phone: '010-7000-0001',
    email: 'dispatch@hanbit.example',
    defaultVehicleType: '1톤',
    memo: '강남/서초 우선 배정',
    active: true,
    createdAt: '2026-06-24T09:00:00',
    modifiedAt: null,
  },
  {
    id: 'carrier-002',
    name: '서울공조용달',
    phone: '010-7000-0002',
    email: null,
    defaultVehicleType: '다마스',
    memo: '오전 연락 선호',
    active: true,
    createdAt: '2026-06-24T09:10:00',
    modifiedAt: null,
  },
  {
    id: 'carrier-003',
    name: '경기북부화물',
    phone: '010-7000-0003',
    email: null,
    defaultVehicleType: '2.5톤',
    memo: '비활성 예시',
    active: false,
    createdAt: '2026-06-24T09:20:00',
    modifiedAt: null,
  },
]

type MockDispatchReadySlip = {
  id: string
  slipNo: string
  slipDate: string
  partnerCode: string
  partnerName: string
  deliveryAddress: string
  recipientPhone: string
  inspectorName: string
  inspectorSignedAt: string
  dispatchStatus: 'UNDISPATCHED' | 'DISPATCHING' | 'DISPATCHED'
}

const MOCK_DISPATCH_READY_SLIPS: MockDispatchReadySlip[] = [
  {
    id: '77777777-d333-4d33-8d33-000000000001',
    slipNo: '2026/06/11-SPD3-001',
    slipDate: '2026-06-11',
    partnerCode: 'P-SPD3-001',
    partnerName: '동탄공조',
    deliveryAddress: '경기도 화성시 동탄대로 10',
    recipientPhone: '010-1111-2222',
    inspectorName: '김검수',
    inspectorSignedAt: '2026-06-11T09:20:00',
    dispatchStatus: 'UNDISPATCHED',
  },
  {
    id: '77777777-d333-4d33-8d33-000000000002',
    slipNo: '2026/06/11-SPD3-002',
    slipDate: '2026-06-11',
    partnerCode: 'P-SPD3-002',
    partnerName: '성남냉열',
    deliveryAddress: '경기도 성남시 분당구 판교로 20',
    recipientPhone: '010-3333-4444',
    inspectorName: '박검수',
    inspectorSignedAt: '2026-06-11T10:05:00',
    dispatchStatus: 'UNDISPATCHED',
  },
]

type MockExternalDispatchPrintData = {
  carrierName: string
  carrierPhone: string
  dispatchDate: string
  channel: 'SMS' | 'PRINT' | 'BOTH'
  items: Array<{
    slipNo: string
    deliveryAddress: string
    recipientName: string
    recipientPhone: string
    itemSummary: string
    sequence: number
  }>
}

const MOCK_EXTERNAL_DISPATCH_PRINT_DATA = new Map<string, MockExternalDispatchPrintData>()

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
    taxInvoiceNo: '2026/05/02-0001',
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
    taxInvoiceNo: '2026/04/28-0099',
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
function mockTodayIsoSeoul(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mockOffsetIsoSeoul(baseIso: string, offsetDays: number): string {
  const d = new Date(baseIso + 'T00:00:00')
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mockTaskCode(dateIso: string, suffix: string): string {
  return `${dateIso.replace(/-/g, '/')}-${suffix}`
}

const MOCK_DISPATCH_HISTORY_TODAY = mockTodayIsoSeoul()
const MOCK_DISPATCH_HISTORY_PREVIOUS = mockOffsetIsoSeoul(MOCK_DISPATCH_HISTORY_TODAY, -6)
const MOCK_DISPATCH_HISTORY_TODAY_CODE = mockTaskCode(MOCK_DISPATCH_HISTORY_TODAY, '1')
const MOCK_DISPATCH_HISTORY_PREVIOUS_CODE = mockTaskCode(MOCK_DISPATCH_HISTORY_PREVIOUS, '2')
const MOCK_DISPATCH_HISTORY_TODAY_SLIP_PREFIX = MOCK_DISPATCH_HISTORY_TODAY.replace(/-/g, '/')
const MOCK_DISPATCH_HISTORY_PREVIOUS_SLIP_PREFIX = MOCK_DISPATCH_HISTORY_PREVIOUS.replace(/-/g, '/')

const MOCK_GROUPWARE_APPROVAL_TEMPLATES: ApprovalTemplate[] = [
  {
    id: '77777777-dddd-4ddd-8ddd-000000000001',
    code: 'EXPENSE_REPORT',
    name: '지출결의서',
    description: '지출 내역 승인 요청',
    active: true,
    displayOrder: 1,
    fields: [
      { fieldKey: 'expenseItem', label: '지출항목', fieldType: 'TEXT', required: true, displayOrder: 1, options: [], placeholder: '예: 배송비 정산' },
      { fieldKey: 'amount', label: '금액', fieldType: 'NUMBER', required: true, displayOrder: 2, options: [], placeholder: '0' },
      { fieldKey: 'accountCode', label: '계정과목', fieldType: 'SELECT', required: true, displayOrder: 3, options: ['복리후생비', '여비교통비', '소모품비', '접대비', '기타'], placeholder: null },
      { fieldKey: 'expenseDate', label: '지출일', fieldType: 'DATE', required: true, displayOrder: 4, options: [], placeholder: null },
      { fieldKey: 'summary', label: '적요', fieldType: 'TEXTAREA', required: false, displayOrder: 5, options: [], placeholder: '지출 사유' },
    ],
  },
  {
    id: '77777777-dddd-4ddd-8ddd-000000000002',
    code: 'LEAVE_REQUEST',
    name: '휴가신청서',
    description: '휴가 사용 승인 요청',
    active: true,
    displayOrder: 2,
    fields: [
      { fieldKey: 'leaveType', label: '휴가종류', fieldType: 'SELECT', required: true, displayOrder: 1, options: ['연차', '반차(오전)', '반차(오후)', '병가', '경조사'], placeholder: null },
      { fieldKey: 'startDate', label: '시작일', fieldType: 'DATE', required: true, displayOrder: 2, options: [], placeholder: null },
      { fieldKey: 'endDate', label: '종료일', fieldType: 'DATE', required: true, displayOrder: 3, options: [], placeholder: null },
      { fieldKey: 'reason', label: '사유', fieldType: 'TEXTAREA', required: true, displayOrder: 4, options: [], placeholder: '휴가 사유' },
    ],
  },
  {
    id: '77777777-dddd-4ddd-8ddd-000000000003',
    code: 'INACTIVE_TEMPLATE',
    name: '비활성 양식',
    description: '비활성 템플릿은 active 목록에서 제외된다.',
    active: false,
    displayOrder: 3,
    fields: [
      { fieldKey: 'title', label: '제목', fieldType: 'TEXT', required: true, displayOrder: 1, options: [], placeholder: null },
    ],
  },
]

const MOCK_GROUPWARE_APPROVER_OPTIONS: ApproverOption[] = [
  {
    userId: '00000000-0000-0000-0000-000000010002',
    name: '김기철',
    department: '영업2팀',
  },
  {
    userId: '00000000-0000-0000-0000-000000010003',
    name: '김은지',
    department: '회계팀',
  },
  {
    userId: '00000000-0000-0000-0000-000000010004',
    name: '박배차',
    department: '물류팀',
  },
]

function mockApprovalUserName(userId: string | null | undefined): string | null {
  if (!userId) return null
  if (userId === MOCK_AUTH.userId) return MOCK_AUTH.fullName
  return MOCK_GROUPWARE_APPROVER_OPTIONS.find((option) => option.userId === userId)?.name ?? null
}

const MOCK_GROUPWARE_APPROVALS: ApprovalLineAdminResponse[] = [
  {
    approvalId: '77777777-aaaa-4aaa-8aaa-000000000001',
    approvalNo: `${MOCK_DISPATCH_HISTORY_TODAY.replace(/-/g, '/')}-1`,
    requesterId: MOCK_AUTH.userId,
    requesterName: MOCK_AUTH.fullName,
    title: '6월 2주차 배송비 정산 승인',
    content: '아로로지스 외주 배차 정산 내역 승인 요청입니다.',
    templateId: '77777777-dddd-4ddd-8ddd-000000000001',
    templateName: '지출결의서',
    fieldValues: {
      expenseItem: '아로로지스 외주 배차',
      amount: '1840000',
      accountCode: '여비교통비',
      expenseDate: MOCK_DISPATCH_HISTORY_TODAY,
      summary: '6월 2주차 배송비 정산',
    },
    status: 'PENDING',
    steps: [
      {
        sequence: 0,
        approverId: '00000000-0000-0000-0000-000000010002',
        approverName: '김기철',
        status: 'PENDING',
        decidedAt: null,
        reason: null,
      },
      {
        sequence: 1,
        approverId: '00000000-0000-0000-0000-000000010003',
        approverName: '김은지',
        status: 'PENDING',
        decidedAt: null,
        reason: null,
      },
    ],
  },
  {
    approvalId: '77777777-aaaa-4aaa-8aaa-000000000002',
    approvalNo: `${MOCK_DISPATCH_HISTORY_PREVIOUS.replace(/-/g, '/')}-2`,
    requesterId: MOCK_AUTH.userId,
    requesterName: MOCK_AUTH.fullName,
    title: '창고 소모품 구매 품의',
    content: '분류 라벨과 포장재 구매 건입니다.',
    templateId: '77777777-dddd-4ddd-8ddd-000000000001',
    templateName: '지출결의서',
    fieldValues: {
      expenseItem: '창고 소모품',
      amount: '320000',
      accountCode: '소모품비',
      expenseDate: MOCK_DISPATCH_HISTORY_PREVIOUS,
      summary: '분류 라벨과 포장재 구매',
    },
    status: 'IN_PROGRESS',
    steps: [
      {
        sequence: 0,
        approverId: '00000000-0000-0000-0000-000000010002',
        approverName: '김기철',
        status: 'APPROVED',
        decidedAt: `${MOCK_DISPATCH_HISTORY_PREVIOUS}T11:20:00`,
        reason: null,
      },
      {
        sequence: 1,
        approverId: '00000000-0000-0000-0000-000000010003',
        approverName: '김은지',
        status: 'PENDING',
        decidedAt: null,
        reason: null,
      },
    ],
  },
  {
    approvalId: '77777777-aaaa-4aaa-8aaa-000000000003',
    approvalNo: `${MOCK_DISPATCH_HISTORY_PREVIOUS.replace(/-/g, '/')}-3`,
    requesterId: MOCK_AUTH.userId,
    requesterName: MOCK_AUTH.fullName,
    title: '반품 운송비 예외 처리',
    content: '거래처 요청에 따른 운송비 예외 승인 건입니다.',
    templateId: null,
    templateName: null,
    fieldValues: {},
    status: 'APPROVED',
    steps: [
      {
        sequence: 0,
        approverId: '00000000-0000-0000-0000-000000010002',
        approverName: '김기철',
        status: 'APPROVED',
        decidedAt: `${MOCK_DISPATCH_HISTORY_PREVIOUS}T14:00:00`,
        reason: null,
      },
    ],
  },
]

const MOCK_GROUPWARE_APPROVAL_COMMENTS: Record<string, GroupwareApprovalCollabComment[]> = {
  '77777777-aaaa-4aaa-8aaa-000000000001': [
    {
      id: '77777777-bbbb-4bbb-8bbb-000000000001',
      anchor: null,
      authorName: '오병승',
      body: '정산 첨부 기준으로 제목만 보강하면 될 것 같습니다.',
      parentId: null,
      status: 'OPEN',
      createdAt: `${MOCK_DISPATCH_HISTORY_TODAY}T10:10:00`,
    },
  ],
}

const MOCK_GROUPWARE_APPROVAL_EDITS: Record<string, GroupwareApprovalCollabEdit[]> = {
  '77777777-aaaa-4aaa-8aaa-000000000002': [
    {
      id: '77777777-cccc-4ccc-8ccc-000000000001',
      changeSet: JSON.stringify({
        title: {
          before: '창고 소모품 구매',
          after: '창고 소모품 구매 품의',
        },
      }),
      reason: '문서 성격 명확화',
      proposerName: '오병승',
      status: 'ACCEPTED',
      decidedByName: '오병승',
      decidedAt: `${MOCK_DISPATCH_HISTORY_PREVIOUS}T10:40:00`,
      createdAt: `${MOCK_DISPATCH_HISTORY_PREVIOUS}T10:40:00`,
    },
  ],
}

const MOCK_GROUPWARE_APPROVAL_ATTACHMENTS: Record<string, ApprovalAttachment[]> = {
  '77777777-aaaa-4aaa-8aaa-000000000001': [
    {
      id: '77777777-eeee-4eee-8eee-000000000001',
      attachmentType: 'SLIP_REF',
      label: '정산 대상 전표',
      displayOrder: 1,
      refSlipNo: `${MOCK_DISPATCH_HISTORY_TODAY_SLIP_PREFIX}-1`,
      refSlipType: 'SLIP_OUTBOUND',
      refPartnerCode: null,
      refPartnerName: null,
      refPeriod: null,
      refDocType: 'OUTBOUND_SLIP',
      refDocNo: `${MOCK_DISPATCH_HISTORY_TODAY_SLIP_PREFIX}-1`,
      refDocLabel: '정산 대상 전표',
      fileName: null,
      contentType: null,
      fileSize: null,
      downloadUrl: null,
    },
    {
      id: '77777777-eeee-4eee-8eee-000000000002',
      attachmentType: 'FILE',
      label: '정산서 PDF',
      displayOrder: 2,
      refSlipNo: null,
      refSlipType: null,
      refPartnerCode: null,
      refPartnerName: null,
      refPeriod: null,
      refDocType: null,
      refDocNo: null,
      refDocLabel: null,
      fileName: 'dispatch-settlement.pdf',
      contentType: 'application/pdf',
      fileSize: 123456,
      downloadUrl: null,
    },
  ],
}

let mockGroupwareApprovalCommentSequence = 2
let mockGroupwareApprovalEditSequence = 2
let mockGroupwareApprovalTemplateSequence = 4
let mockGroupwareApprovalAttachmentSequence = 3

type GroupwareApprovalMockStores = {
  __SAMHAN_MOCK_GROUPWARE_APPROVALS?: ApprovalLineAdminResponse[]
  __SAMHAN_MOCK_GROUPWARE_APPROVALS_SEED?: ApprovalLineAdminResponse[]
  __SAMHAN_MOCK_GROUPWARE_APPROVAL_TEMPLATES?: ApprovalTemplate[]
  __SAMHAN_MOCK_GROUPWARE_APPROVAL_TEMPLATES_SEED?: ApprovalTemplate[]
  __SAMHAN_MOCK_GROUPWARE_APPROVAL_ATTACHMENTS?: Record<string, ApprovalAttachment[]>
  __SAMHAN_MOCK_GROUPWARE_APPROVAL_ATTACHMENTS_SEED?: Record<string, ApprovalAttachment[]>
  __SAMHAN_MOCK_GROUPWARE_APPROVAL_COMMENTS?: Record<string, GroupwareApprovalCollabComment[]>
  __SAMHAN_MOCK_GROUPWARE_APPROVAL_COMMENTS_SEED?: Record<string, GroupwareApprovalCollabComment[]>
  __SAMHAN_MOCK_GROUPWARE_APPROVAL_EDITS?: Record<string, GroupwareApprovalCollabEdit[]>
  __SAMHAN_MOCK_GROUPWARE_APPROVAL_EDITS_SEED?: Record<string, GroupwareApprovalCollabEdit[]>
}

function cloneGroupwareApprovals(source: ApprovalLineAdminResponse[]): ApprovalLineAdminResponse[] {
  return source.map((approval) => ({
    ...approval,
    fieldValues: { ...approval.fieldValues },
    steps: approval.steps.map((step) => ({ ...step })),
  }))
}

function cloneGroupwareApprovalTemplates(source: ApprovalTemplate[]): ApprovalTemplate[] {
  return source.map((template) => ({
    ...template,
    fields: template.fields.map((field) => ({
      ...field,
      options: [...field.options],
    })),
  }))
}

function cloneGroupwareApprovalAttachments(
  source: Record<string, ApprovalAttachment[]>,
): Record<string, ApprovalAttachment[]> {
  return Object.fromEntries(
    Object.entries(source).map(([approvalId, attachments]) => [
      approvalId,
      attachments.map((attachment) => ({ ...attachment })),
    ]),
  )
}

function getMockGroupwareApprovalTemplatesStore(): ApprovalTemplate[] {
  const g = globalThis as unknown as GroupwareApprovalMockStores
  if (!g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_TEMPLATES) {
    g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_TEMPLATES = cloneGroupwareApprovalTemplates([
      ...MOCK_GROUPWARE_APPROVAL_TEMPLATES,
      ...(g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_TEMPLATES_SEED ?? []),
    ])
  }
  return g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_TEMPLATES
}

function getMockGroupwareApprovalAttachmentsStore(): Record<string, ApprovalAttachment[]> {
  const g = globalThis as unknown as GroupwareApprovalMockStores
  if (!g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_ATTACHMENTS) {
    g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_ATTACHMENTS =
      cloneGroupwareApprovalAttachments(MOCK_GROUPWARE_APPROVAL_ATTACHMENTS)
    if (g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_ATTACHMENTS_SEED) {
      g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_ATTACHMENTS = {
        ...g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_ATTACHMENTS,
        ...cloneGroupwareApprovalAttachments(g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_ATTACHMENTS_SEED),
      }
    }
  }
  return g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_ATTACHMENTS
}

function mockTemplateDto(template: ApprovalTemplate) {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    description: template.description,
    active: template.active,
    displayOrder: template.displayOrder,
    fields: template.fields.map((field, index) => ({
      id: field.id ?? `${template.id}-field-${index + 1}`,
      fieldKey: field.fieldKey,
      label: field.label,
      fieldType: field.fieldType,
      required: field.required,
      displayOrder: field.displayOrder,
      optionsJson: field.fieldType === 'SELECT' ? JSON.stringify(field.options) : null,
      placeholder: field.placeholder,
    })),
  }
}

function mockParseOptionsJson(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item).trim()).filter((item) => item.length > 0)
  } catch {
    return []
  }
}

function cloneGroupwareApprovalComments(
  source: Record<string, GroupwareApprovalCollabComment[]>,
): Record<string, GroupwareApprovalCollabComment[]> {
  return Object.fromEntries(
    Object.entries(source).map(([approvalId, comments]) => [
      approvalId,
      comments.map((comment) => ({ ...comment })),
    ]),
  )
}

function cloneGroupwareApprovalEdits(
  source: Record<string, GroupwareApprovalCollabEdit[]>,
): Record<string, GroupwareApprovalCollabEdit[]> {
  return Object.fromEntries(
    Object.entries(source).map(([approvalId, edits]) => [
      approvalId,
      edits.map((edit) => ({ ...edit })),
    ]),
  )
}

function getMockGroupwareApprovalsStore(): ApprovalLineAdminResponse[] {
  const g = globalThis as unknown as GroupwareApprovalMockStores
  if (!g.__SAMHAN_MOCK_GROUPWARE_APPROVALS) {
    g.__SAMHAN_MOCK_GROUPWARE_APPROVALS = cloneGroupwareApprovals([
      ...MOCK_GROUPWARE_APPROVALS,
      ...(g.__SAMHAN_MOCK_GROUPWARE_APPROVALS_SEED ?? []),
    ])
  }
  return g.__SAMHAN_MOCK_GROUPWARE_APPROVALS
}

function getMockGroupwareApprovalCommentsStore(): Record<string, GroupwareApprovalCollabComment[]> {
  const g = globalThis as unknown as GroupwareApprovalMockStores
  if (!g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_COMMENTS) {
    g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_COMMENTS =
      cloneGroupwareApprovalComments(MOCK_GROUPWARE_APPROVAL_COMMENTS)
    if (g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_COMMENTS_SEED) {
      Object.assign(
        g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_COMMENTS,
        cloneGroupwareApprovalComments(g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_COMMENTS_SEED),
      )
    }
  }
  return g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_COMMENTS
}

function getMockGroupwareApprovalEditsStore(): Record<string, GroupwareApprovalCollabEdit[]> {
  const g = globalThis as unknown as GroupwareApprovalMockStores
  if (!g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_EDITS) {
    g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_EDITS =
      cloneGroupwareApprovalEdits(MOCK_GROUPWARE_APPROVAL_EDITS)
    if (g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_EDITS_SEED) {
      Object.assign(
        g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_EDITS,
        cloneGroupwareApprovalEdits(g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_EDITS_SEED),
      )
    }
  }
  return g.__SAMHAN_MOCK_GROUPWARE_APPROVAL_EDITS
}

const MOCK_DISPATCH_COMMENTS: Record<string, DispatchComment[]> = {
  '11111111-aaaa-4aaa-8aaa-000000000001': [
    {
      id: '66666666-aaaa-4aaa-8aaa-000000000001',
      anchor: null,
      authorName: 'system',
      body: '배차 완료 후 기사 매칭 확인했습니다.',
      parentId: null,
      status: 'OPEN',
      createdAt: `${MOCK_DISPATCH_HISTORY_TODAY}T10:20:00`,
    },
    {
      id: '66666666-aaaa-4aaa-8aaa-000000000002',
      anchor: null,
      authorName: '이운영',
      body: '성남냉열 연락처는 오전 중 한 번 더 확인 필요합니다.',
      parentId: null,
      status: 'OPEN',
      createdAt: `${MOCK_DISPATCH_HISTORY_TODAY}T10:05:00`,
    },
  ],
}
let mockDispatchCommentSequence = 3
const MOCK_DISPATCH_EDITS: Record<string, DispatchCollabEdit[]> = {
  '11111111-aaaa-4aaa-8aaa-000000000001': [
    {
      id: '66666666-bbbb-4bbb-8bbb-000000000001',
      changeSet: JSON.stringify({
        memo: {
          before: null,
          after: '성남냉열 연락처 오전 재확인',
        },
      }),
      reason: '기사 안내 보강',
      proposerName: '이운영',
      status: 'ACCEPTED',
      decidedByName: '이운영',
      decidedAt: `${MOCK_DISPATCH_HISTORY_TODAY}T10:30:00`,
      createdAt: `${MOCK_DISPATCH_HISTORY_TODAY}T10:30:00`,
    },
  ],
}
let mockDispatchEditSequence = 2
let mockDispatchTaskCreateSequence = 1
let mockDispatchVehicleGroupCreateSequence = 3

type DispatchMockCollabStores = {
  __SAMHAN_MOCK_DISPATCH_COMMENTS?: Record<string, DispatchComment[]>
  __SAMHAN_MOCK_DISPATCH_COMMENTS_SEED?: Record<string, DispatchComment[]>
  __SAMHAN_MOCK_DISPATCH_EDITS?: Record<string, DispatchCollabEdit[]>
  __SAMHAN_MOCK_DISPATCH_EDITS_SEED?: Record<string, DispatchCollabEdit[]>
}

function cloneDispatchComments(
  source: Record<string, DispatchComment[]>,
): Record<string, DispatchComment[]> {
  return Object.fromEntries(
    Object.entries(source).map(([taskId, comments]) => [
      taskId,
      comments.map((comment) => ({ ...comment })),
    ]),
  )
}

function cloneDispatchEdits(
  source: Record<string, DispatchCollabEdit[]>,
): Record<string, DispatchCollabEdit[]> {
  return Object.fromEntries(
    Object.entries(source).map(([taskId, edits]) => [
      taskId,
      edits.map((edit) => ({ ...edit })),
    ]),
  )
}

function getMockDispatchCommentsStore(): Record<string, DispatchComment[]> {
  const g = globalThis as unknown as DispatchMockCollabStores
  if (!g.__SAMHAN_MOCK_DISPATCH_COMMENTS) {
    g.__SAMHAN_MOCK_DISPATCH_COMMENTS = cloneDispatchComments(MOCK_DISPATCH_COMMENTS)
    if (g.__SAMHAN_MOCK_DISPATCH_COMMENTS_SEED) {
      Object.assign(
        g.__SAMHAN_MOCK_DISPATCH_COMMENTS,
        cloneDispatchComments(g.__SAMHAN_MOCK_DISPATCH_COMMENTS_SEED),
      )
    }
  }
  return g.__SAMHAN_MOCK_DISPATCH_COMMENTS
}

function getMockDispatchEditsStore(): Record<string, DispatchCollabEdit[]> {
  const g = globalThis as unknown as DispatchMockCollabStores
  if (!g.__SAMHAN_MOCK_DISPATCH_EDITS) {
    g.__SAMHAN_MOCK_DISPATCH_EDITS = cloneDispatchEdits(MOCK_DISPATCH_EDITS)
    if (g.__SAMHAN_MOCK_DISPATCH_EDITS_SEED) {
      Object.assign(
        g.__SAMHAN_MOCK_DISPATCH_EDITS,
        cloneDispatchEdits(g.__SAMHAN_MOCK_DISPATCH_EDITS_SEED),
      )
    }
  }
  return g.__SAMHAN_MOCK_DISPATCH_EDITS
}

function recordMockAddVehicleGroupBody(body: {
  vehicleBodyType?: DispatchVehicleBodyType
  tonnage: DispatchTonnage | null
}) {
  if (typeof window === 'undefined' || !body.vehicleBodyType) return
  window.__SAMHAN_MOCK_LAST_ADD_VEHICLE_GROUP_BODY__ = {
    vehicleBodyType: body.vehicleBodyType,
    tonnage: body.tonnage,
  }
}

function mockDeriveLegacyVehicleType(
  bodyType: DispatchVehicleBodyType,
  tonnage: DispatchTonnage | null,
): DispatchVehicleType {
  if (bodyType === 'MOTORCYCLE') {
    return 'MOTORCYCLE'
  }
  if (bodyType === 'DAMAS' || bodyType === 'SEDAN' || bodyType === 'LABO') {
    return 'DAMAS'
  }
  switch (tonnage) {
    case 'T_1':
    case 'T_1_2':
      return 'TONNAGE_1'
    case 'T_1_4':
      return 'TONNAGE_1_5'
    case 'T_2_5':
      return 'TONNAGE_2_5'
    case 'T_3_5':
      return 'TONNAGE_3'
    case 'T_5':
      return 'TONNAGE_5'
    case 'T_11':
    case 'T_14':
      return 'TONNAGE_10'
    case 'T_18':
    case 'T_25':
      return 'TONNAGE_20'
    default:
      return 'TONNAGE_1'
  }
}

function refreshMockDuplicateSlipIds(task: DispatchTaskResponse): DispatchTaskResponse {
  const counts = new Map<string, number>()
  for (const row of task.vehicleGroups.flatMap((group) => group.slips)) {
    counts.set(row.slipId, (counts.get(row.slipId) ?? 0) + 1)
  }
  task.duplicateSlipIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([slipId]) => slipId)
  return task
}

/**
 * 배차현황 목록 summary 를 상세 task 상태와 동기화한다 (Round C).
 *
 * <p>수정요청/재배차/수동완료/발송 같은 상태 전이 후 목록 refetch 가 stale status 를 보지
 * 않도록 한다. 재배차 후 arologisDispatchId 가 null 로 바뀌므로 매칭 키는 taskCode (안정 키).
 * 보드에서 새로 만든 task 는 seed summary 가 없어 no-op (배차현황 목록은 seed 한정 — 날짜
 * 민감 flake 방지를 위해 upsert 하지 않는다).
 */
function syncMockDispatchTaskSummary(task: DispatchTaskResponse): void {
  const summary = MOCK_DISPATCH_TASK_SUMMARIES.find((row) => row.taskCode === task.taskCode)
  if (!summary) return
  summary.status = task.status
  summary.arologisDispatchId = task.arologisDispatchId
  summary.vehicleGroupCount = task.vehicleGroups.length
  summary.slipCount = task.vehicleGroups.reduce((sum, group) => sum + group.slips.length, 0)
  summary.driverCount = task.matchedDrivers.length
}

function mockDispatchBoardSlipById(slipId: string) {
  return [
    {
      id: '77777777-d333-4d33-8d33-000000000001',
      slipNo: '2026/06/11-SPD3-001',
      partnerCode: 'P-SPD3-001',
      partnerName: '동탄공조',
      deliveryAddress: '경기도 화성시 동탄대로 10',
      recipientPhone: '010-1111-2222',
      dispatchStatus: 'UNDISPATCHED',
    },
    {
      id: '77777777-d333-4d33-8d33-000000000002',
      slipNo: '2026/06/11-SPD3-002',
      partnerCode: 'P-SPD3-002',
      partnerName: '성남냉열',
      deliveryAddress: '경기도 성남시 분당구 판교로 20',
      recipientPhone: '010-3333-4444',
      dispatchStatus: 'UNDISPATCHED',
    },
  ].find((slip) => slip.id === slipId)
}

const MOCK_DISPATCH_TASK_DETAILS: DispatchTaskResponse[] = [
  {
    id: '11111111-aaaa-4aaa-8aaa-000000000001',
    taskCode: MOCK_DISPATCH_HISTORY_TODAY_CODE,
    dispatchDate: MOCK_DISPATCH_HISTORY_TODAY,
    status: 'DISPATCHED',
    arologisDispatchId: '22222222-aaaa-4aaa-8aaa-000000000001',
    failureReason: null,
    memo: '성남냉열 연락처 오전 재확인',
    modificationReason: null,
    rejectionReason: null,
    modificationRequestedAt: null,
    modificationDecidedAt: null,
    duplicateSlipIds: [],
    vehicleGroups: [
      {
        id: '33333333-aaaa-4aaa-8aaa-000000000001',
        vehicleType: 'TONNAGE_1',
        vehicleTypeDisplay: '1톤',
        vehicleBodyType: 'CARGO',
        vehicleBodyTypeDisplay: '카고',
        tonnage: 'T_1',
        tonnageDisplay: '1톤',
        dispatchStatus: 'DISPATCHED',
        sequence: 1,
        slips: [
          {
            id: '44444444-aaaa-4aaa-8aaa-000000000001',
            slipId: '55555555-aaaa-4aaa-8aaa-000000000001',
            sequence: 1,
            slip: {
              slipNo: `${MOCK_DISPATCH_HISTORY_TODAY_SLIP_PREFIX}-001`,
              partnerCode: 'P-DCH-001',
              partnerName: '동탄공조',
              deliveryAddress: '경기도 화성시 동탄대로 10',
              recipientPhone: '010-1111-2222',
              dispatchStatus: 'DISPATCHED',
            },
          },
          {
            id: '44444444-aaaa-4aaa-8aaa-000000000002',
            slipId: '55555555-aaaa-4aaa-8aaa-000000000002',
            sequence: 2,
            slip: {
              slipNo: `${MOCK_DISPATCH_HISTORY_TODAY_SLIP_PREFIX}-002`,
              partnerCode: 'P-DCH-002',
              partnerName: '성남냉열',
              deliveryAddress: '경기도 성남시 분당구 판교로 20',
              recipientPhone: '010-3333-4444',
              dispatchStatus: 'DISPATCHED',
            },
          },
        ],
      },
    ],
    matchedDrivers: [
      {
        vehicleGroupSequence: 1,
        driverCode: 'DRV-101',
        driverName: '김배차',
        driverPhoneNumber: '010-9000-1001',
        driverSource: 'AROLOGIS',
        vehiclePlateNumber: '12가3456',
      },
    ],
  },
  {
    id: '11111111-bbbb-4bbb-8bbb-000000000002',
    taskCode: MOCK_DISPATCH_HISTORY_PREVIOUS_CODE,
    dispatchDate: MOCK_DISPATCH_HISTORY_PREVIOUS,
    status: 'DISPATCHED',
    arologisDispatchId: '22222222-bbbb-4bbb-8bbb-000000000002',
    failureReason: null,
    memo: null,
    modificationReason: null,
    rejectionReason: null,
    modificationRequestedAt: null,
    modificationDecidedAt: null,
    duplicateSlipIds: [],
    vehicleGroups: [
      {
        id: '33333333-bbbb-4bbb-8bbb-000000000002',
        vehicleType: 'DAMAS',
        vehicleTypeDisplay: '다마스',
        vehicleBodyType: 'DAMAS',
        vehicleBodyTypeDisplay: '다마스',
        tonnage: null,
        tonnageDisplay: null,
        dispatchStatus: 'DISPATCHED',
        sequence: 1,
        slips: [
          {
            id: '44444444-bbbb-4bbb-8bbb-000000000003',
            slipId: '55555555-bbbb-4bbb-8bbb-000000000003',
            sequence: 1,
            slip: {
              slipNo: `${MOCK_DISPATCH_HISTORY_PREVIOUS_SLIP_PREFIX}-004`,
              partnerCode: 'P-DCH-003',
              partnerName: '수원설비',
              deliveryAddress: '경기도 수원시 영통구 광교로 30',
              recipientPhone: '010-5555-6666',
              dispatchStatus: 'DISPATCHED',
            },
          },
        ],
      },
    ],
    matchedDrivers: [
      {
        vehicleGroupSequence: 1,
        driverCode: 'DRV-205',
        driverName: '박기사',
        driverPhoneNumber: '010-9000-2005',
        driverSource: 'AROLOGIS',
        vehiclePlateNumber: '34나5678',
      },
    ],
  },
  {
    id: '11111111-cccc-4ccc-8ccc-000000000003',
    taskCode: `${MOCK_DISPATCH_HISTORY_TODAY.replace(/-/g, '/')}-MANUAL`,
    dispatchDate: MOCK_DISPATCH_HISTORY_TODAY,
    status: 'DISPATCHED',
    arologisDispatchId: null,
    failureReason: null,
    memo: '경기퀵 수동 발송완료',
    modificationReason: null,
    rejectionReason: null,
    modificationRequestedAt: null,
    modificationDecidedAt: null,
    duplicateSlipIds: [],
    vehicleGroups: [
      {
        id: '33333333-cccc-4ccc-8ccc-000000000003',
        vehicleType: 'TONNAGE_1',
        vehicleTypeDisplay: '1톤',
        vehicleBodyType: 'CARGO',
        vehicleBodyTypeDisplay: '카고',
        tonnage: 'T_1',
        tonnageDisplay: '1톤',
        dispatchStatus: 'DISPATCHED',
        sequence: 1,
        slips: [
          {
            id: '44444444-cccc-4ccc-8ccc-000000000004',
            slipId: '55555555-cccc-4ccc-8ccc-000000000004',
            sequence: 1,
            slip: {
              slipNo: `${MOCK_DISPATCH_HISTORY_TODAY_SLIP_PREFIX}-MANUAL`,
              partnerCode: 'P-DCH-MANUAL',
              partnerName: '수동완료거래처',
              deliveryAddress: '경기도 안양시 동안구 시민대로 40',
              recipientPhone: '010-7777-9999',
              dispatchStatus: 'DISPATCHED',
            },
          },
        ],
      },
    ],
    matchedDrivers: [
      {
        vehicleGroupSequence: 1,
        driverCode: 'MANUAL',
        driverName: '이경기',
        driverPhoneNumber: '010-7777-8888',
        driverSource: 'GYEONGGI_QUICK',
        vehiclePlateNumber: '12가9999',
      },
    ],
  },
]

const MOCK_DISPATCH_TASK_SUMMARIES: DispatchTaskSummaryResponse[] = MOCK_DISPATCH_TASK_DETAILS.map((task) => {
  const slips = task.vehicleGroups.flatMap((group) => group.slips)
  const partnerNames = Array.from(new Set(slips.map((row) => row.slip.partnerName)))
  const head = partnerNames.slice(0, 3).join(', ')
  const rest = partnerNames.length - 3
  return {
    id: task.id,
    taskCode: task.taskCode,
    dispatchDate: task.dispatchDate,
    status: task.status,
    vehicleGroupCount: task.vehicleGroups.length,
    slipCount: slips.length,
    partnerNames: rest > 0 ? `${head} +${rest}` : head,
    driverCount: task.matchedDrivers.length,
    arologisDispatchId: task.arologisDispatchId,
  }
})

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

/**
 * 견적 협업 edit 가 반영되는 가변 상세. memo/validUntil/line.note 만 편집 허용(실 EstimateDocumentCollaborationPort 정합).
 * note: 기존 mock 은 buildMockEstimateDetail 을 매번 새로 반환해 커밋 편집이 상세에 미반영(false-green) — Codex 라운드 P2 fix.
 */
type MutableEstimateDetail =
  & Omit<ReturnType<typeof buildMockEstimateDetail>, 'memo' | 'validUntil' | 'lines'>
  & { memo: string | null; validUntil: string | null }
  & { lines: Array<Omit<ReturnType<typeof buildMockEstimateDetail>['lines'][number], 'note'> & { note: string | null }> }

function getMutableEstimateDetail(id: string): MutableEstimateDetail {
  const g = globalThis as unknown as { __SAMHAN_MOCK_ESTIMATE_DETAILS?: Record<string, MutableEstimateDetail> }
  if (!g.__SAMHAN_MOCK_ESTIMATE_DETAILS) g.__SAMHAN_MOCK_ESTIMATE_DETAILS = {}
  const store = g.__SAMHAN_MOCK_ESTIMATE_DETAILS
  if (!store[id]) {
    const seed = buildMockEstimateDetail(id)
    store[id] = {
      ...seed,
      memo: seed.memo,
      validUntil: seed.validUntil,
      lines: seed.lines.map((line) => ({ ...line, note: line.note as string | null })),
    }
  }
  return store[id]!
}

/** 견적 협업 changeSet path 정규화 — memo / validUntil / line.{n}.note 만 허용(그 외 null). */
function normalizeEstimateEditPath(rawPath: string): string | null {
  const normalized = rawPath.trim().replace(/^\/+/, '').replace(/\//g, '.')
  if (normalized === 'memo' || normalized === 'validUntil') return normalized
  const lineNoteMatch = normalized.match(/^line\.(\d+)\.note$/)
  if (!lineNoteMatch) return null
  return Number.parseInt(lineNoteMatch[1]!, 10) >= 1 ? normalized : null
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
    type: 'DELETE' as const,
    reason: '거래처 요청으로 출고 전표를 취소 후 재발행 예정입니다.',
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
      bizNo: '1234567890',
      partnerName: '삼성건설(주)',
      balance: '1200000',
      oldestUnpaidDate: '2026-03-15',
      agingDays: 77,
      partnerId: '00000000-0000-0000-0000-partner00001',
    },
    {
      partnerCode: 'P-002',
      bizNo: '2345678901',
      partnerName: '현대종합개발',
      balance: '800000',
      oldestUnpaidDate: '2026-04-01',
      agingDays: 60,
      partnerId: '00000000-0000-0000-0000-partner00002',
    },
    {
      partnerCode: 'P-003',
      bizNo: '3456789012',
      partnerName: '대우건설',
      balance: '1500000',
      oldestUnpaidDate: '2026-04-20',
      agingDays: 41,
      partnerId: '00000000-0000-0000-0000-partner00003',
    },
    {
      partnerCode: 'P-004',
      bizNo: '4567890123',
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
      bizNo: '5678901234',
      partnerName: '(주)에어텍',
      balance: '1800000',
      oldestUnpaidDate: '2026-03-01',
      agingDays: 91,
      partnerId: '00000000-0000-0000-0000-vendor000001',
    },
    {
      partnerCode: 'V-002',
      bizNo: '6789012345',
      partnerName: '대한냉각기',
      balance: '900000',
      oldestUnpaidDate: '2026-04-10',
      agingDays: 51,
      partnerId: '00000000-0000-0000-0000-vendor000002',
    },
    {
      partnerCode: 'V-003',
      bizNo: '7890123456',
      partnerName: '한국공조부품',
      balance: '500000',
      oldestUnpaidDate: '2026-05-01',
      agingDays: 30,
      partnerId: '00000000-0000-0000-0000-vendor000003',
    },
  ],
  generatedAt: '2026-05-10T09:00:00+09:00',
}

const MOCK_RECEIVABLES_PAYABLES = {
  lines: [
    {
      bizNo: '1234567890',
      partnerCode: 'P-2026-0001',
      partnerName: '삼한공조 A',
      receivableBalance: '6500000',
      payableBalance: '0',
      netBalance: '6500000',
      receivableAgingBuckets: {
        currentMonth: '1000000',
        oneMonthElapsed: '2000000',
        twoMonthsElapsed: '0',
        threeMonthsOver: '3500000',
      },
      payableAgingBuckets: {
        currentMonth: '0',
        oneMonthElapsed: '0',
        twoMonthsElapsed: '0',
        threeMonthsOver: '0',
      },
      agingBuckets: {
        currentMonth: '1000000',
        oneMonthElapsed: '2000000',
        twoMonthsElapsed: '0',
        threeMonthsOver: '3500000',
      },
      creditLimit: '10000000',
      creditUsageRate: '65.00',
      notesHeldAmount: '1000000',
      notesMaturingSoonAmount: '800000',
      collectionPlanPlannedAmount: '700000',
      collectionPlanOverdueAmount: '300000',
      collectionPlanTotalAmount: '1000000',
    },
    {
      bizNo: '2223344444',
      partnerCode: 'P-2026-0002',
      partnerName: '아로물류 B',
      receivableBalance: '1800000',
      payableBalance: '2500000',
      netBalance: '-700000',
      receivableAgingBuckets: {
        currentMonth: '0',
        oneMonthElapsed: '1800000',
        twoMonthsElapsed: '0',
        threeMonthsOver: '0',
      },
      payableAgingBuckets: {
        currentMonth: '500000',
        oneMonthElapsed: '0',
        twoMonthsElapsed: '2000000',
        threeMonthsOver: '0',
      },
      agingBuckets: {
        currentMonth: '-500000',
        oneMonthElapsed: '1800000',
        twoMonthsElapsed: '-2000000',
        threeMonthsOver: '0',
      },
      creditLimit: '5000000',
      creditUsageRate: '36.00',
      notesHeldAmount: '880000',
      notesMaturingSoonAmount: '880000',
      collectionPlanPlannedAmount: '0',
      collectionPlanOverdueAmount: '880000',
      collectionPlanTotalAmount: '880000',
    },
    {
      bizNo: '3334455555',
      partnerCode: 'P-2026-0003',
      partnerName: '대한운송 C',
      receivableBalance: '0',
      payableBalance: '3200000',
      netBalance: '-3200000',
      receivableAgingBuckets: {
        currentMonth: '0',
        oneMonthElapsed: '0',
        twoMonthsElapsed: '0',
        threeMonthsOver: '0',
      },
      payableAgingBuckets: {
        currentMonth: '0',
        oneMonthElapsed: '900000',
        twoMonthsElapsed: '0',
        threeMonthsOver: '2300000',
      },
      agingBuckets: {
        currentMonth: '0',
        oneMonthElapsed: '-900000',
        twoMonthsElapsed: '0',
        threeMonthsOver: '-2300000',
      },
      creditLimit: null,
      creditUsageRate: null,
      notesHeldAmount: '0',
      notesMaturingSoonAmount: '0',
      collectionPlanPlannedAmount: '0',
      collectionPlanOverdueAmount: '0',
      collectionPlanTotalAmount: '0',
    },
  ],
}

let MOCK_NOTES_RECEIVABLE: Array<{
  noteNo: string
  partnerCode: string
  bizNo: string
  partnerName: string
  issueDate: string
  maturityDate: string
  amount: string
  noteType: 'PROMISSORY' | 'BILL_OF_EXCHANGE'
  status: 'BOARDING' | 'COLLECTING' | 'SETTLED' | 'DISHONORED'
  memo: string | null
}> = [
  {
    noteNo: 'NR-2026-0001',
    partnerCode: 'P-2026-0001',
    bizNo: '1112233333',
    partnerName: '삼한공조 A',
    issueDate: '2026-06-01',
    maturityDate: '2026-07-05',
    amount: '12500000',
    noteType: 'PROMISSORY',
    status: 'BOARDING',
    memo: '7월 만기',
  },
  {
    noteNo: 'NR-2026-0002',
    partnerCode: 'P-2026-0002',
    bizNo: '2223344444',
    partnerName: '아로물류 B',
    issueDate: '2026-06-10',
    maturityDate: '2026-07-20',
    amount: '8800000',
    noteType: 'BILL_OF_EXCHANGE',
    status: 'COLLECTING',
    memo: null,
  },
]

let MOCK_COLLECTION_PLANS: Array<{
  planNo: string
  partnerCode: string
  bizNo: string
  partnerName: string
  plannedDate: string
  plannedAmount: string
  basis: 'RECEIVABLE_BALANCE' | 'NOTE_MATURITY' | 'MANUAL'
  status: 'PLANNED' | 'COLLECTED' | 'OVERDUE'
  sourceReference: string | null
  memo: string | null
}> = [
  {
    planNo: 'CP-20260705-000101',
    partnerCode: 'P-2026-0001',
    bizNo: '1112233333',
    partnerName: '삼한공조 A',
    plannedDate: '2026-07-05',
    plannedAmount: '12500000',
    basis: 'NOTE_MATURITY',
    status: 'PLANNED',
    sourceReference: 'NR-2026-0001',
    memo: '받을어음 만기 기준',
  },
  {
    planNo: 'CP-20260720-000102',
    partnerCode: 'P-2026-0002',
    bizNo: '2223344444',
    partnerName: '아로물류 B',
    plannedDate: '2026-07-20',
    plannedAmount: '8800000',
    basis: 'MANUAL',
    status: 'OVERDUE',
    sourceReference: null,
    memo: null,
  },
]

let MOCK_BANK_TRANSACTIONS: Array<{
  transactedAt: string
  txnType: 'DEPOSIT' | 'WITHDRAWAL'
  amount: string
  balanceAfter: string | null
  description: string
  counterpartyName: string | null
  counterpartyAccount: string | null
  bankAccountLabel: string
  source: 'CSV_IMPORT' | 'KFTC' | 'CODEF_BANK' | 'CODEF_CARD' | 'CODEF_LOAN'
  externalRef: string
  cardName?: string | null
  approvalId?: string | null
  loanName?: string | null
  matchStatus: 'UNREFLECTED' | 'REFLECTED' | 'FORCED'
  matchedPartnerCode: string | null
  matchedBizNo: string | null
  matchedPartnerName: string | null
}> = [
  {
    transactedAt: '2026-06-23T09:10:00',
    txnType: 'DEPOSIT',
    amount: '1500000',
    balanceAfter: '11500000',
    description: '삼한상사 입금',
    counterpartyName: '삼한상사',
    counterpartyAccount: null,
    bankAccountLabel: '국민 123-456',
    source: 'CSV_IMPORT',
    externalRef: 'mock-bank-20260623-001',
    matchStatus: 'UNREFLECTED',
    matchedPartnerCode: null,
    matchedBizNo: null,
    matchedPartnerName: null,
  },
  {
    transactedAt: '2026-06-22T15:40:00',
    txnType: 'WITHDRAWAL',
    amount: '45000',
    balanceAfter: '10000000',
    description: '이체 수수료',
    counterpartyName: '국민은행',
    counterpartyAccount: null,
    bankAccountLabel: '국민 123-456',
    source: 'CSV_IMPORT',
    externalRef: 'mock-bank-20260622-002',
    matchStatus: 'FORCED',
    matchedPartnerCode: null,
    matchedBizNo: null,
    matchedPartnerName: null,
  },
  {
    transactedAt: '2026-06-21T11:20:00',
    txnType: 'DEPOSIT',
    amount: '8800000',
    balanceAfter: '9955000',
    description: '아로물류 B 수금',
    counterpartyName: '아로물류 B',
    counterpartyAccount: null,
    bankAccountLabel: '신한 777-888',
    source: 'CSV_IMPORT',
    externalRef: 'mock-bank-20260621-003',
    matchStatus: 'REFLECTED',
    matchedPartnerCode: 'P-2026-0002',
    matchedBizNo: '2223344444',
    matchedPartnerName: '아로물류 B',
  },
]

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
  'accounting.tax-invoice.cancel',
  'accounting.tax-invoice.batch-issue',
  'accounting.tax-invoice.inbound',
  'accounting.sales-slip.list',
  'accounting.purchase-slip.list',
  'accounting.deposit-match',
  'accounting.daily-closing',
  'accounting.daily-closing.run',
  'accounting.daily-closing.unlock',
  'accounting.general-ledger',
  'notification.dispatch-sms.send-audit',
  'purchases.receipt-ocr',
  'purchases.slip.list',
  'sales.slip.list',
  'inbound.inspection',
  'dispatch.board',
  'dispatch.external-carriers',
  'admin.permissions',
  'admin.permission-groups',
  'admin.app-release',
  'hr.role-management',
  'hr.slip-cutoff',
  // SP-D2 회계 7개 신규
  'accounting.accounts',
  'accounting.journals',
  'accounting.balances',
  'accounting.reports',
  'accounting.receivables',
  'accounting.bank-matching',
  'accounting.period-close',
  'accounting.statement-batch',
  'accounting.partner-ledger',
  // V37 회계 전표/거래처 원장 보조 도메인
  'accounting.supplier-profiles',
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
  'partners.edit',
  'partners.4tab.edit',
  'partners.block',
  'partners.edit-request',
  'products.list',
  'products.admin',
  'arologis.admin',
  'arologis.region',
  // MIG-14 admin UI
  'ecount.mig14.order-list',
  'ecount.mig14.ledger',
    // C2b 단독→PermissionGuard 전환 page-codes (V29/V30/V33/V34/V36 seed 기반)
    'sales.slip.create',
    'slip.delivery-batch',
    'slip.print.next-day',
    'slip.print.export',
    'sales.partner-dc-config',
    'sales.estimate-config',
    'slip.cleanup',
  'arologis.dispatch.admin',
  'arologis.dispatch.ops',
  'dispatch.batch',
  'aligo.address-book',
  'groupware.approvals',
  'groupware.approval-templates',
  'messenger.admin',
  'slip.edit-requests',
  'slip.edit-requests.decide',
  'slip.photo-audit',
  'accounting.edit-requests.decide',
  // C2c 동적 권한 전환 page-codes (V36/V30/V41 seed 기반)
  'purchases.slip.edit',
  'purchases.slip.delete',
  'sales.slip.edit',
  'sales.partner-order.edit',
  'sales.partner-order.convert',
  // C5-2b 이관 대상 page-codes (slip.signature/partners.block.bulk/arologis.region.manage)
  'slip.signature',
  'partners.block.bulk',
  'arologis.region.manage',
  // C5-2c 이관 대상 page-codes (V36 slip transition + V35 warehouse.admin seed 기반)
  'slip.transfer.process',
  'sales.slip.confirm',
  'slip.reject',
  'sales.slip.cancel',
  'inventory.warehouse.admin',
  // C5 follow-up V47 — product-service sheet sync (MANAGER view/create, MASTER bypass)
  'products.sync',
  // §7 입출고전표 협업 — V36 seed(MASTER/MANAGER/SALES/WAREHOUSE view+edit)
  // + V38 view 보강(내부 전 role can_view=TRUE). 누락 시 mock 모드 canAccess 전건
  // false → 협업 패널 버튼 전부 숨김 (silent regression — Fable5 Round C P2 fix).
  'slip.comments',
  'slip.audit-overlay',
  // V36 동일 블록 — 버전이력 revert(MASTER/MANAGER view+edit). canAccess 소비자는
  // 아직 없으나 매트릭스 화면 행 정합 + 동일 silent regression 예방 (계열 sweep).
  'slip.audit-revert',
  // [Round C 계열 sweep] canAccess 소비자 있는데 mock 부재였던 MASTER-only 코드 2건 —
  // 누락 시 mock 모드에서 MASTER 조차 false (V37: 역마감 버튼 / V29: DC CSV import CTA).
  // 비-MASTER 는 seed 전건 FALSE 이므로 DEFAULT_VIEW/EDIT 등재 없음이 정확.
  'accounting.period-close.reverse',
  'dc-config.import',
] as const

/**
 * [C2c] action-only page-codes — view/edit 셀의 일반 CRUD 도출 대신 지정 액션만 grant.
 * seed 정합(예: V41 convert = create-only). 비-MASTER `/permissions/my` mock 도출에 적용.
 */
const MOCK_ACTION_ONLY_PAGES: Record<string, string[]> = {
  // V37: accounting.daily-closing.run 은 실행 CREATE endpoint 전용.
  'accounting.daily-closing.run': ['CREATE'],
  // V37: accounting.daily-closing.unlock 은 잠금 해제 UPDATE endpoint 전용.
  'accounting.daily-closing.unlock': ['UPDATE'],
  'sales.partner-order.convert': ['CREATE'],
  'products.sync': ['CREATE'],
  'dispatch.external-carriers': ['CREATE', 'UPDATE', 'DELETE', 'RESTORE'],
}

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
 *  products.list:              MASTER/MANAGER/ACCOUNTANT/SALES/WAREHOUSE/INVENTORY/DEVELOPER
 *  products.admin:             MASTER/MANAGER/SALES/INVENTORY/DEVELOPER
 *  arologis.admin:             MASTER/MANAGER/DISPATCH
 *  arologis.region:            MASTER/MANAGER/DISPATCH
 */
const SP_D1_DEFAULT_VIEW: Record<string, readonly string[]> = {
  MANAGER: [
    // SP-D1
    'accounting.tax-invoice.list', 'accounting.tax-invoice.cancel', 'accounting.tax-invoice.batch-issue',
    'accounting.tax-invoice.inbound', 'accounting.sales-slip.list',
    'accounting.purchase-slip.list', 'accounting.deposit-match', 'accounting.daily-closing',
    'accounting.daily-closing.run',
    'accounting.general-ledger', 'notification.dispatch-sms.send-audit',
    'purchases.receipt-ocr', 'purchases.slip.list', 'sales.slip.list',
    'inbound.inspection', 'dispatch.board', 'dispatch.external-carriers',
    // SP-D2 회계 7개 — MANAGER: view 허용
    'accounting.accounts', 'accounting.journals', 'accounting.balances',
    'accounting.reports', 'accounting.receivables', 'accounting.bank-matching', 'accounting.period-close', 'accounting.statement-batch',
    'accounting.partner-ledger',
    // V37 supplier-profiles — MANAGER: view/edit 허용
    'accounting.supplier-profiles',
    // SP-D4 22개 — MANAGER: 대부분 view 허용
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit',
    'inventory.list', 'inventory.detail', 'inventory.adjust', 'inventory.transfer',
    'inventory.stock-balance', 'inventory.safety-stock', 'inventory.edit-requests',
    'inventory.edit-requests.decide', 'ecount.import.inventory',
    'admin.employees', 'admin.app-release',
    'partners.list', 'partners.detail', 'partners.edit', 'partners.4tab.edit',
    'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region',
    // MIG-14 admin UI
    'ecount.mig14.order-list',
    'ecount.mig14.ledger',
    // Issue 4 Slice 4
    'accounting.edit-requests', 'accounting.edit-requests.decide',
    // C2b PermissionGuard 전환 — MANAGER: 전 12개 page view 허용 (V29/V30/V33/V34/V36 seed)
    'sales.slip.create', 'slip.delivery-batch', 'slip.print.next-day', 'slip.print.export',
    'sales.partner-dc-config', 'sales.estimate-config', 'slip.cleanup',
    'arologis.dispatch.admin', 'arologis.dispatch.ops', 'dispatch.batch', 'dispatch.external-carriers',
    'aligo.address-book', 'groupware.approvals', 'groupware.approval-templates', 'messenger.admin', 'slip.edit-requests', 'slip.edit-requests.decide',
    'slip.photo-audit',
    // C2c 동적 권한 전환 — MANAGER: view 허용 (V36/V30/V41 seed)
    'purchases.slip.edit', 'purchases.slip.delete',
    'sales.slip.edit', 'sales.partner-order.edit', 'sales.partner-order.convert',
    // P1-C seed 정합 — MANAGER VIEW:
    //   slip.signature: V36 MANAGER can_view=TRUE (유지)
    //   partners.block.bulk: V34 MASTER-only → MANAGER VIEW 제거
    //   arologis.region.manage: V34 MANAGER can_view=TRUE (유지)
    'slip.signature', 'arologis.region.manage',
    // C5-2c: V35/V36 seed 기반 MANAGER VIEW 추가
    'slip.transfer.process', 'sales.slip.confirm', 'slip.reject',
    'sales.slip.cancel', 'inventory.warehouse.admin',
    // C5 follow-up V47 — MANAGER sheet sync view.
    'products.sync',
    // §7 협업 — V36: MANAGER view+edit (slip.comments / slip.audit-overlay / slip.audit-revert)
    'slip.comments', 'slip.audit-overlay', 'slip.audit-revert',
    // V70: hr.slip-cutoff — MANAGER view 허용
    'hr.slip-cutoff',
  ],
  DISPATCH: [
    'notification.dispatch-sms.send-audit', 'dispatch.board', 'dispatch.external-carriers',
    // SP-D4 — DISPATCH: inventory.stock (view 전용) + arologis.*
    'inventory.stock', 'arologis.admin', 'arologis.region',
    // C2b PermissionGuard 전환 — DISPATCH: arologis.dispatch.ops + dispatch.batch view
    'arologis.dispatch.ops', 'dispatch.batch',
    // P1-C: arologis.region.manage — V34 seed MASTER/MANAGER 만 허용, DISPATCH 없음 → 제거
    // §7 협업 — V38: 내부 전 role view-only 보강 (can_edit=FALSE)
    'slip.comments', 'slip.audit-overlay',
  ],
  // SP-D3 V9 fix: SALES dispatch.board 제거 (사용자 요구 ② — SALES 에게 배차 메뉴 숨김)
  SALES: [
    'sales.slip.list',
    // SP-D4 — SALES: 견적/주문/거래처/상품 view
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.stock', 'inventory.list', 'inventory.transfer',
    'partners.list', 'partners.detail', 'partners.edit-request',
    'products.list', 'products.admin',
    // C2b PermissionGuard 전환 — SALES: view 허용 (V36 seed)
    'sales.slip.create', 'slip.print.next-day', 'sales.partner-dc-config',
    'slip.cleanup', 'slip.edit-requests',
    // C2c 동적 권한 전환 — SALES: view 허용 (V36/V30/V41 seed)
    'sales.slip.edit', 'sales.partner-order.edit', 'sales.partner-order.convert',
    // C5-2c: V36 seed 기반 SALES VIEW 추가
    'sales.slip.cancel',
    // §7 협업 — V36: SALES view+edit
    'slip.comments', 'slip.audit-overlay',
  ],
  ACCOUNTANT: [
    // SP-D1
    'accounting.tax-invoice.emit-nts', 'accounting.tax-invoice.list',
    'accounting.tax-invoice.cancel',
    'accounting.tax-invoice.batch-issue', 'accounting.tax-invoice.inbound',
    'accounting.sales-slip.list', 'accounting.purchase-slip.list',
    'accounting.deposit-match', 'accounting.daily-closing',
    'accounting.daily-closing.run', 'accounting.general-ledger',
    'purchases.receipt-ocr', 'purchases.slip.list', 'sales.slip.list',
    // SP-D2 회계 7개 — ACCOUNTANT: view + edit 허용
    'accounting.accounts', 'accounting.journals', 'accounting.balances',
    'accounting.reports', 'accounting.receivables', 'accounting.bank-matching', 'accounting.period-close', 'accounting.statement-batch',
    'accounting.partner-ledger',
    // V37 supplier-profiles — ACCOUNTANT: view only
    'accounting.supplier-profiles',
    // SP-D4 — ACCOUNTANT: 견적/주문 이력/재고/거래처/상품 view 만
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.history',
    'inventory.stock', 'inventory.list', 'inventory.detail', 'inventory.transfer',
    'inventory.edit-requests', 'inventory.edit-requests.decide',
    'partners.list', 'partners.detail',
    // MIG-14 admin UI — ACCOUNTANT: view 전용
    'ecount.mig14.order-list',
    'ecount.mig14.ledger',
    // C2b PermissionGuard 전환 — ACCOUNTANT: slip.edit-requests view (V38 broadened)
    'slip.edit-requests',
    // C5-2c: V36 seed 기반 ACCOUNTANT VIEW 추가
    'sales.slip.confirm',
    // §7 협업 — V38: 내부 전 role view-only 보강 (can_edit=FALSE)
    'slip.comments', 'slip.audit-overlay',
  ],
  // SP-D3 V9 fix: sales.slip.list 제거 + purchases.receipt-ocr 추가
  // (사용자 요구 ② — WAREHOUSE 에게 매출 전표 숨김, 매입 영수증 OCR 허용)
  WAREHOUSE: [
    'purchases.slip.list', 'purchases.receipt-ocr', 'inbound.inspection',
    // SP-D4 — WAREHOUSE: 재고/창고/인쇄/벤더주문 view
    'sales.partner-order.print', 'sales.vendor-order',
    'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'inventory.list', 'inventory.detail',
    'inventory.transfer', 'inventory.stock-balance', 'inventory.safety-stock',
    'products.list',
    // C2b PermissionGuard 전환 — WAREHOUSE: slip.edit-requests(V38 broadened) + slip.photo-audit(V36)
    'slip.edit-requests', 'slip.photo-audit',
    // C2c 동적 권한 전환 — WAREHOUSE: purchases.slip.edit/delete view 허용 (V36 seed)
    'purchases.slip.edit', 'purchases.slip.delete',
    // C5-2c: V36 seed 기반 WAREHOUSE VIEW 추가
    'slip.transfer.process',
    // §7 협업 — V36: WAREHOUSE view+edit
    'slip.comments', 'slip.audit-overlay',
  ],
  INVENTORY: [
    'purchases.slip.list', 'sales.slip.list', 'inbound.inspection',
    // SP-D4 — INVENTORY: 재고/창고 view
    'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'inventory.list', 'inventory.detail',
    'inventory.adjust', 'inventory.transfer', 'inventory.stock-balance',
    'inventory.safety-stock', 'inventory.edit-requests',
    'products.list', 'products.admin',
    // C2b PermissionGuard 전환 — INVENTORY: slip.edit-requests view (V38 broadened)
    'slip.edit-requests',
    // C5-2c: V36 seed 기반 INVENTORY VIEW 추가
    'slip.transfer.process',
    // §7 협업 — V38: 내부 전 role view-only 보강 (can_edit=FALSE)
    'slip.comments', 'slip.audit-overlay',
  ],
  DEVELOPER: [
    // V30/V43 seed — product 운영 보조 그룹.
    'products.list', 'products.admin',
    // §7 협업 — V38: 내부 전 role view-only 보강 (can_edit=FALSE)
    'slip.comments', 'slip.audit-overlay',
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
 *  products.list:              MASTER/MANAGER/SALES/INVENTORY/DEVELOPER
 *  products.admin:             MASTER/MANAGER/SALES/INVENTORY/DEVELOPER
 *  arologis.admin:             MASTER/MANAGER/DISPATCH
 *  arologis.region:            MASTER/MANAGER/DISPATCH
 */
const SP_D1_DEFAULT_EDIT: Record<string, readonly string[]> = {
  MANAGER: [
    'accounting.tax-invoice.cancel',
    'accounting.tax-invoice.batch-issue', 'accounting.tax-invoice.inbound',
    'accounting.sales-slip.list', 'accounting.purchase-slip.list',
    'accounting.daily-closing.run',
    'accounting.receivables', 'accounting.bank-matching',
    // V37 supplier-profiles — MANAGER: view/edit 허용
    'accounting.supplier-profiles',
    // SP-D1 — MANAGER: edit 미허용 (view 전용)
    // SP-D4 — MANAGER: 대부분 edit 허용
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock-transfer',
    'inventory.list', 'inventory.adjust', 'inventory.transfer', 'inventory.stock-balance',
    'inventory.safety-stock', 'inventory.edit-requests',
    'inventory.edit-requests.decide', 'ecount.import.inventory',
    'admin.employees', 'admin.app-release',
    'partners.list', 'partners.detail', 'partners.edit', 'partners.4tab.edit',
    'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region',
    // MIG-14 admin UI
    'ecount.mig14.order-list',
    'ecount.mig14.ledger',
    // Issue 4 Slice 4
    'accounting.edit-requests', 'accounting.edit-requests.decide',
    // C2b PermissionGuard 전환 — MANAGER: 전 12개 page edit 허용 (V29/V30/V33/V34/V36 seed)
    'sales.slip.create', 'slip.delivery-batch', 'slip.print.next-day', 'slip.print.export',
    'sales.partner-dc-config', 'sales.estimate-config', 'slip.cleanup',
    'arologis.dispatch.admin', 'arologis.dispatch.ops', 'dispatch.batch', 'dispatch.external-carriers',
    'aligo.address-book', 'groupware.approvals', 'groupware.approval-templates', 'messenger.admin', 'slip.edit-requests', 'slip.edit-requests.decide',
    // slip.photo-audit: MANAGER can_edit=FALSE per V36
    // C2c 동적 권한 전환 — MANAGER: edit 허용 (V36/V30/V41 seed)
    'purchases.slip.edit', 'purchases.slip.delete',
    'sales.slip.edit', 'sales.partner-order.edit', 'sales.partner-order.convert',
    // P1-C seed 정합 — MANAGER EDIT:
    //   slip.signature: V36 MANAGER can_edit=FALSE → 제거
    //   partners.block.bulk: V34 MASTER-only → 제거
    //   arologis.region.manage: V34 MANAGER can_edit=TRUE (유지)
    'arologis.region.manage',
    // C5-2c: V35/V36 seed 기반 MANAGER EDIT 추가
    'slip.transfer.process', 'sales.slip.confirm', 'slip.reject',
    'sales.slip.cancel', 'inventory.warehouse.admin',
    // C5 follow-up V47 — MANAGER sheet sync create.
    'products.sync',
    // §7 협업 — V36: MANAGER can_edit=TRUE (slip.audit-revert 포함)
    'slip.comments', 'slip.audit-overlay', 'slip.audit-revert',
    // V70: hr.slip-cutoff — MANAGER edit 허용 (create/update/delete)
    'hr.slip-cutoff',
  ],
  DISPATCH: [
    'notification.dispatch-sms.send-audit', 'dispatch.board',
    // SP-D4 — DISPATCH: arologis.* edit
    'arologis.admin', 'arologis.region',
    // C2b PermissionGuard 전환 — DISPATCH: arologis.dispatch.ops + dispatch.batch edit (V33/V34)
    'arologis.dispatch.ops', 'dispatch.batch', 'dispatch.external-carriers',
  ],
  SALES: [
    'sales.slip.list',
    // SP-D4 — SALES: 견적/주문/거래처/상품 edit
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.list',
    'partners.list', 'partners.detail',
    'products.admin',
    // C2b PermissionGuard 전환 — SALES: edit 허용 (V36 seed)
    'sales.slip.create', 'slip.print.next-day', 'slip.cleanup', 'slip.edit-requests',
    // sales.partner-dc-config: SALES can_edit=FALSE per V29
    // C2c 동적 권한 전환 — SALES: edit 허용 (V36/V30/V41 seed)
    'sales.slip.edit', 'sales.partner-order.edit', 'sales.partner-order.convert',
    // C5-2c: V36 seed 기반 SALES EDIT 추가
    'sales.slip.cancel',
    // §7 협업 — V36: SALES can_edit=TRUE
    'slip.comments', 'slip.audit-overlay',
  ],
  ACCOUNTANT: [
    // SP-D1
    'accounting.tax-invoice.emit-nts', 'accounting.tax-invoice.list',
    'accounting.tax-invoice.cancel',
    'accounting.tax-invoice.batch-issue', 'accounting.tax-invoice.inbound',
    'accounting.sales-slip.list', 'accounting.purchase-slip.list',
    'accounting.deposit-match', 'accounting.daily-closing',
    'accounting.daily-closing.run',
    'purchases.receipt-ocr',
    // SP-D2 회계 7개 — ACCOUNTANT: edit 허용 (accounts/journals/period-close/statement-batch)
    'accounting.accounts', 'accounting.journals', 'accounting.receivables', 'accounting.bank-matching', 'accounting.period-close',
    'accounting.statement-batch',
    // SP-D4 — ACCOUNTANT: edit 없음 (모두 view 전용)
    'inventory.edit-requests', 'inventory.edit-requests.decide',
    // C2b PermissionGuard 전환 — ACCOUNTANT: 12개 모두 edit 없음 (V36/V29 seed 확인)
    // C5-2c: V36 seed 기반 ACCOUNTANT EDIT 추가
    'sales.slip.confirm',
  ],
  // SP-D3 V9 fix: purchases.receipt-ocr edit 추가 (WAREHOUSE 매입 영수증 OCR 입력 가능)
  WAREHOUSE: [
    'inbound.inspection', 'purchases.receipt-ocr',
    // SP-D4 — WAREHOUSE: 재고/창고 edit
    'inventory.warehouse', 'inventory.stock',
    'inventory.stock-transfer', 'inventory.dps',
    'inventory.list', 'inventory.transfer', 'inventory.stock-balance',
    'inventory.safety-stock',
    // C2b PermissionGuard 전환 — WAREHOUSE: slip.photo-audit can_edit=FALSE, slip.edit-requests can_edit=FALSE (V36)
    // C2c 동적 권한 전환 — WAREHOUSE: purchases.slip.edit/delete edit 허용 (V36 seed)
    'purchases.slip.edit', 'purchases.slip.delete',
    // C5-2c: V36 seed 기반 WAREHOUSE EDIT 추가
    'slip.transfer.process',
    // §7 협업 — V36: WAREHOUSE can_edit=TRUE
    'slip.comments', 'slip.audit-overlay',
  ],
  INVENTORY: [
    'inbound.inspection',
    // SP-D4 — INVENTORY: 재고/창고 edit
    'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps',
    'inventory.list', 'inventory.adjust', 'inventory.transfer',
    'inventory.stock-balance', 'inventory.safety-stock', 'inventory.edit-requests',
    'products.admin',
    // C2b PermissionGuard 전환 — INVENTORY: 12개 모두 edit 없음 (V36 seed 확인)
    // C5-2c: V36 seed 기반 INVENTORY EDIT 추가 (can_edit=TRUE)
    'slip.transfer.process',
  ],
  DEVELOPER: [
    // V30/V43 seed — product 운영 보조 그룹.
    'products.list', 'products.admin',
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

type MockPermissionGroup = {
  id: string
  name: string
  description: string | null
  builtin: boolean
  systemMaster: boolean
}

type MockApprovalLineRole = {
  id: string
  documentType: string
  sequence: number
  label: string
  stepType: 'CREATOR' | 'GROUP' | 'USER'
  approvers: MockApprovalLineApprover[]
  required: boolean
  actionKey: string | null
  createdBy: string
  isDeleted?: boolean
}

type MockApprovalLineApprover = {
  id: string
  type: 'GROUP' | 'USER'
  refId: string
}

type MockActionMatrix = {
  view: boolean
  create: boolean
  update: boolean
  delete: boolean
  restore: boolean
  download: boolean
  print: boolean
}

const emptyMockActionMatrix = (): MockActionMatrix => ({
  view: false,
  create: false,
  update: false,
  delete: false,
  restore: false,
  download: false,
  print: false,
})

const mockActionMatrixFromRole = (role: string, page: string): MockActionMatrix => {
  const cell = _mockPermissionCells.find((c) => c.roleCode === role && c.pageCode === page)
  return {
    view: cell?.view ?? false,
    create: cell?.edit ?? false,
    update: cell?.edit ?? false,
    delete: cell?.edit ?? false,
    restore: false,
    download: cell?.view ?? false,
    print: cell?.view ?? false,
  }
}

// ---------------------------------------------------------------------------
// C3b: 빌트인 role-group 10개 (V43 UUID 체계 00000000-0000-0000-0000-0000000001XX)
// ---------------------------------------------------------------------------
const BUILTIN_GROUP_ID_MASTER     = '00000000-0000-0000-0000-000000000100'
const BUILTIN_GROUP_ID_MANAGER    = '00000000-0000-0000-0000-000000000101'
const BUILTIN_GROUP_ID_SALES      = '00000000-0000-0000-0000-000000000102'
const BUILTIN_GROUP_ID_WAREHOUSE  = '00000000-0000-0000-0000-000000000103'
const BUILTIN_GROUP_ID_ACCOUNTANT = '00000000-0000-0000-0000-000000000104'
const BUILTIN_GROUP_ID_INVENTORY  = '00000000-0000-0000-0000-000000000105'
const BUILTIN_GROUP_ID_DISPATCH   = '00000000-0000-0000-0000-000000000106'
const BUILTIN_GROUP_ID_DRIVER     = '00000000-0000-0000-0000-000000000107'
const BUILTIN_GROUP_ID_STAFF      = '00000000-0000-0000-0000-000000000108'
const BUILTIN_GROUP_ID_DEVELOPER  = '00000000-0000-0000-0000-000000000109'

const _mockPermissionGroups: MockPermissionGroup[] = [
  // --- 빌트인 역할 그룹 10개 (isBuiltin=true) ---
  { id: BUILTIN_GROUP_ID_MASTER,     name: '마스터',      description: '시스템 최고관리자 (빌트인)', builtin: true, systemMaster: true },
  { id: BUILTIN_GROUP_ID_MANAGER,    name: '매니저',      description: '운영 매니저 (빌트인)',       builtin: true, systemMaster: false },
  { id: BUILTIN_GROUP_ID_SALES,      name: '영업원',      description: '영업 담당 (빌트인)',         builtin: true, systemMaster: false },
  { id: BUILTIN_GROUP_ID_WAREHOUSE,  name: '창고원',      description: '창고 운영 (빌트인)',         builtin: true, systemMaster: false },
  { id: BUILTIN_GROUP_ID_ACCOUNTANT, name: '회계원',      description: '회계 처리 (빌트인)',         builtin: true, systemMaster: false },
  { id: BUILTIN_GROUP_ID_INVENTORY,  name: '재고원',      description: '재고 관리 (빌트인)',         builtin: true, systemMaster: false },
  { id: BUILTIN_GROUP_ID_DISPATCH,   name: '배차담당자',  description: '배차 담당 (빌트인)',         builtin: true, systemMaster: false },
  { id: BUILTIN_GROUP_ID_DRIVER,     name: '기사',        description: '기사 역할 (빌트인)',         builtin: true, systemMaster: false },
  { id: BUILTIN_GROUP_ID_STAFF,      name: '사원',        description: '일반 사원 (빌트인)',         builtin: true, systemMaster: false },
  { id: BUILTIN_GROUP_ID_DEVELOPER,  name: '개발자',      description: '시스템 개발자 (빌트인)',     builtin: true, systemMaster: false },
  // --- 커스텀 그룹 3개 (isBuiltin=false) ---
  { id: 'mock-group-custom-sales',      name: '영업팀',  description: '영업 운영 커스텀 그룹',          builtin: false, systemMaster: false },
  { id: 'mock-group-custom-dispatch',   name: '배차팀',  description: '아로로지스 배차 담당 커스텀 그룹', builtin: false, systemMaster: false },
  { id: 'mock-group-custom-accounting', name: '회계팀',  description: '회계 처리 담당 커스텀 그룹',     builtin: false, systemMaster: false },
]

const _mockApprovalLineConfigRoles: MockApprovalLineRole[] = [
  {
    id: 'mock-approval-line-slip-outbound-creator',
    documentType: 'SLIP_OUTBOUND',
    sequence: 0,
    label: '작성자',
    stepType: 'CREATOR',
    approvers: [],
    required: true,
    actionKey: null,
    createdBy: 'v61-seed',
  },
  {
    id: 'mock-approval-line-slip-outbound-dispatcher',
    documentType: 'SLIP_OUTBOUND',
    sequence: 1,
    label: '출고자',
    stepType: 'GROUP',
    approvers: [],
    required: true,
    actionKey: 'OUTBOUND_DISPATCH',
    createdBy: 'v61-seed',
  },
  {
    id: 'mock-approval-line-slip-outbound-inspector',
    documentType: 'SLIP_OUTBOUND',
    sequence: 2,
    label: '검수자',
    stepType: 'GROUP',
    approvers: [],
    required: true,
    actionKey: 'OUTBOUND_INSPECT',
    createdBy: 'v61-seed',
  },
  // A2-3 입고전표 — V63 시드(작성자/입고인=INBOUND_RECEIVE/검수인=INBOUND_INSPECT)와 mock 패리티.
  {
    id: 'mock-approval-line-slip-inbound-creator',
    documentType: 'SLIP_INBOUND',
    sequence: 0,
    label: '작성자',
    stepType: 'CREATOR',
    approvers: [],
    required: true,
    actionKey: null,
    createdBy: 'v63-seed',
  },
  {
    id: 'mock-approval-line-slip-inbound-receiver',
    documentType: 'SLIP_INBOUND',
    sequence: 1,
    label: '입고인',
    stepType: 'GROUP',
    approvers: [],
    required: true,
    actionKey: 'INBOUND_RECEIVE',
    createdBy: 'v63-seed',
  },
  {
    id: 'mock-approval-line-slip-inbound-inspector',
    documentType: 'SLIP_INBOUND',
    sequence: 2,
    label: '검수인',
    stepType: 'GROUP',
    approvers: [],
    required: true,
    actionKey: 'INBOUND_INSPECT',
    createdBy: 'v63-seed',
  },
  // A2-4 주문 — V64 시드(작성자/승인자=PARTNER_ORDER_CONVERT)와 mock 패리티.
  {
    id: 'mock-approval-line-partner-order-creator',
    documentType: 'PARTNER_ORDER',
    sequence: 0,
    label: '작성자',
    stepType: 'CREATOR',
    approvers: [],
    required: true,
    actionKey: null,
    createdBy: 'v64-seed',
  },
  {
    id: 'mock-approval-line-partner-order-approver',
    documentType: 'PARTNER_ORDER',
    sequence: 1,
    label: '승인자',
    stepType: 'GROUP',
    approvers: [],
    required: true,
    actionKey: 'PARTNER_ORDER_CONVERT',
    createdBy: 'v64-seed',
  },
  // 슬4c 그룹웨어 지출결의서 — default-approvers 프리필 검증용 USER 결재자.
  {
    id: 'mock-approval-line-groupware-expense-reviewer',
    documentType: 'GROUPWARE_EXPENSE_REPORT',
    sequence: 1,
    label: '검토자',
    stepType: 'USER',
    approvers: [{ id: 'mock-approval-line-groupware-expense-reviewer-user', type: 'USER', refId: 'user-002' }],
    required: true,
    actionKey: null,
    createdBy: 'mock-s4c-seed',
  },
  {
    id: 'mock-approval-line-groupware-expense-approver',
    documentType: 'GROUPWARE_EXPENSE_REPORT',
    sequence: 2,
    label: '승인자',
    stepType: 'USER',
    approvers: [{ id: 'mock-approval-line-groupware-expense-approver-user', type: 'USER', refId: 'user-005' }],
    required: true,
    actionKey: null,
    createdBy: 'mock-s4c-seed',
  },
]

const _mockPermissionGroupMatrices: Record<string, Record<string, MockActionMatrix>> = {
  [BUILTIN_GROUP_ID_MASTER]: {},
  [BUILTIN_GROUP_ID_MANAGER]:    Object.fromEntries(SP_D1_PAGES.map((page) => [page, mockActionMatrixFromRole('MANAGER',    page)])) as Record<string, MockActionMatrix>,
  [BUILTIN_GROUP_ID_SALES]:      Object.fromEntries(SP_D1_PAGES.map((page) => [page, mockActionMatrixFromRole('SALES',      page)])) as Record<string, MockActionMatrix>,
  [BUILTIN_GROUP_ID_WAREHOUSE]:  Object.fromEntries(SP_D1_PAGES.map((page) => [page, mockActionMatrixFromRole('WAREHOUSE',  page)])) as Record<string, MockActionMatrix>,
  [BUILTIN_GROUP_ID_ACCOUNTANT]: Object.fromEntries(SP_D1_PAGES.map((page) => [page, mockActionMatrixFromRole('ACCOUNTANT', page)])) as Record<string, MockActionMatrix>,
  [BUILTIN_GROUP_ID_INVENTORY]:  Object.fromEntries(SP_D1_PAGES.map((page) => [page, mockActionMatrixFromRole('INVENTORY',  page)])) as Record<string, MockActionMatrix>,
  [BUILTIN_GROUP_ID_DISPATCH]:   Object.fromEntries(SP_D1_PAGES.map((page) => [page, mockActionMatrixFromRole('DISPATCH',   page)])) as Record<string, MockActionMatrix>,
  [BUILTIN_GROUP_ID_DRIVER]: {},
  [BUILTIN_GROUP_ID_STAFF]: {},
  [BUILTIN_GROUP_ID_DEVELOPER]:  Object.fromEntries(SP_D1_PAGES.map((page) => [page, mockActionMatrixFromRole('DEVELOPER',  page)])) as Record<string, MockActionMatrix>,
  'mock-group-custom-sales':      Object.fromEntries(SP_D1_PAGES.map((page) => [page, mockActionMatrixFromRole('SALES',      page)])) as Record<string, MockActionMatrix>,
  'mock-group-custom-dispatch':   Object.fromEntries(SP_D1_PAGES.map((page) => [page, mockActionMatrixFromRole('DISPATCH',   page)])) as Record<string, MockActionMatrix>,
  'mock-group-custom-accounting': Object.fromEntries(SP_D1_PAGES.map((page) => [page, mockActionMatrixFromRole('ACCOUNTANT', page)])) as Record<string, MockActionMatrix>,
}

// C3b: 각 mock 사용자(user-001~user-008)에 대한 초기 빌트인 그룹 배속.
// user-xxx → admin account UUID 로 역매핑 (mock 환경에서는 user.id 를 accountId 로 사용).
const _mockAccountGroups: Record<string, string[]> = {
  'user-001': [BUILTIN_GROUP_ID_MASTER],
  'user-002': [BUILTIN_GROUP_ID_ACCOUNTANT, 'mock-group-custom-accounting'],
  'user-003': [BUILTIN_GROUP_ID_SALES, 'mock-group-custom-sales'],
  'user-004': [BUILTIN_GROUP_ID_SALES],
  'user-005': [BUILTIN_GROUP_ID_WAREHOUSE],
  'user-006': [BUILTIN_GROUP_ID_INVENTORY],
  'user-007': [BUILTIN_GROUP_ID_DEVELOPER],
  'user-008': [BUILTIN_GROUP_ID_MANAGER],
  // PermissionGroupManagePage 에서 사용하는 계정 ID
  'mock-account-manager':  [BUILTIN_GROUP_ID_MANAGER, 'mock-group-custom-accounting'],
  'mock-account-sales':    [BUILTIN_GROUP_ID_SALES, 'mock-group-custom-sales'],
  'mock-account-dispatch': [BUILTIN_GROUP_ID_DISPATCH, 'mock-group-custom-dispatch'],
}

function mockPermissionGroupSummary(group: MockPermissionGroup) {
  const assignedAccountCount = Object.values(_mockAccountGroups)
    .filter((groupIds) => groupIds.includes(group.id)).length
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    builtin: group.builtin,
    systemMaster: group.systemMaster,
    isBuiltin: group.builtin,
    isSystemMaster: group.systemMaster,
    assignedAccountCount,
  }
}

function mockApprovalLineRoleView(role: MockApprovalLineRole) {
  return {
    id: role.id,
    sequence: role.sequence,
    label: role.label,
    stepType: role.stepType,
    approvers: role.approvers.map((approver) => ({
      id: approver.id,
      type: approver.type,
      refId: approver.refId,
      displayName: mockApprovalLineApproverDisplayName(approver),
    })),
    required: role.required,
    enforced: Boolean(role.actionKey),
    seedManaged: ['v61-seed', 'v63-seed', 'v64-seed'].includes(role.createdBy),
  }
}

function mockApprovalLineStructureView(role: MockApprovalLineRole) {
  return {
    sequence: role.sequence,
    label: role.label,
    stepType: role.stepType,
    actionKey: role.actionKey,
  }
}

function mockApprovalLineDefaultApproverViews(role: MockApprovalLineRole) {
  return role.approvers
    .filter((approver) => approver.type === 'USER')
    .map((approver) => ({
      sequence: role.sequence,
      label: role.label,
      userId: approver.refId,
      displayName: mockApprovalLineApproverDisplayName(approver),
    }))
}

function mockApprovalLineApproverDisplayName(approver: MockApprovalLineApprover) {
  if (approver.type === 'GROUP') {
    return _mockPermissionGroups.find((item) => item.id === approver.refId)?.name ?? '(삭제된 그룹)'
  }
  const account = mockAccountById(approver.refId)
  return account?.displayName ?? '(삭제된 사원)'
}

function mockAccountById(accountId: string) {
  // PermissionGroupManagePage 전용 3계정
  const permPageAccounts = [
    { id: 'mock-account-manager', displayName: '김관리', role: 'MANAGER', enabled: true },
    { id: 'mock-account-sales', displayName: '이영업', role: 'SALES', enabled: true },
    { id: 'mock-account-dispatch', displayName: '박배차', role: 'DISPATCH', enabled: true },
  ]
  const found = permPageAccounts.find((account) => account.id === accountId)
  if (found) return found

  // UsersPage MOCK_ADMIN_USERS(user-001~008) fallback — GroupAssignModal 에서 accountId 로 user.id 사용
  const adminUser = MOCK_ADMIN_USERS.find((u) => u.id === accountId)
  if (adminUser) {
    return {
      id: adminUser.id,
      displayName: adminUser.fullName,
      role: adminUser.role as string,
      enabled: adminUser.terminationDate === null,
    }
  }

  return undefined
}

function mockAccountBelongsToSystemMaster(accountId: string) {
  return (_mockAccountGroups[accountId] ?? []).some((groupId) =>
    Boolean(_mockPermissionGroups.find((group) => group.id === groupId)?.systemMaster),
  )
}

function mockAccountGroupSummary(accountId: string, group: MockPermissionGroup) {
  const account = mockAccountById(accountId)
  return {
    accountId,
    accountDisplayName: account?.displayName ?? '알 수 없음',
    groupId: group.id,
    groupName: group.name,
    groupDescription: group.description,
    groupBuiltin: group.builtin,
    groupSystemMaster: group.systemMaster,
  }
}

function mockGroupDelegations(groupId: string) {
  const matrix = _mockPermissionGroupMatrices[groupId] ?? {}
  return {
    permissionAdmin: isMockDelegated(matrix['system.permission-admin']),
    hrRoleManagement: isMockDelegated(matrix['hr.role-management']),
    permissionGroups: isMockDelegated(matrix['admin.permission-groups']),
  }
}

function isMockDelegated(row: MockActionMatrix | undefined): boolean {
  return Boolean(row?.view && row.update)
}

function setMockDelegation(groupId: string, pageCode: string, grant: boolean) {
  const matrix = _mockPermissionGroupMatrices[groupId] ?? {}
  matrix[pageCode] = {
    view: grant,
    create: false,
    update: grant,
    delete: false,
    restore: false,
    download: false,
    print: false,
  }
  _mockPermissionGroupMatrices[groupId] = matrix
}
