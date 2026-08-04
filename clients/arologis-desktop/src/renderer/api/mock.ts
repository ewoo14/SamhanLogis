/**
 * arologis-desktop 개발용 in-process mock.
 *
 * 현재 패키지는 별도 Playwright/MSW mock 인프라가 없으므로, 메인 desktop 의
 * VITE_MOCK_MODE axios adapter 패턴을 최소 복제한다. 처리하지 않는 URL 은 null 을
 * 반환해 기존 실 API 흐름을 유지한다.
 */
import type { AxiosRequestConfig } from 'axios'
import { useAuthStore } from '../stores/authStore'

type PermissionMap = Record<string, string[]>

interface MockEnvelope<T> {
  success: true
  code: 'SUCCESS'
  message: string
  data: T
  timestamp: string
}

const ALL_ADMIN_PERMISSIONS: PermissionMap = {
  'arologis.hr.employees': fullActions(),
  'arologis.hr.departments': fullActions(),
  'arologis.accounting.cashbook': fullActions(),
  'arologis.accounting.summary': fullActions(),
  'arologis.accounting.accounts': fullActions(),
  'arologis.admin.permissions': fullActions(),
}

const ROLE_PERMISSION_FIXTURES: Record<string, PermissionMap> = {
  AROLOGIS_MASTER: ALL_ADMIN_PERMISSIONS,
  AROLOGIS_MANAGER: {
    'arologis.hr.employees': fullActions(),
    'arologis.hr.departments': fullActions(),
    'arologis.accounting.cashbook': fullActions(),
    'arologis.accounting.summary': fullActions(),
  },
  AROLOGIS_DEVELOPER: {
    'arologis.accounting.cashbook': fullActions(),
    'arologis.accounting.summary': fullActions(),
  },
  AROLOGIS_ACCOUNTANT: {
    'arologis.accounting.cashbook': fullActions(),
    'arologis.accounting.summary': fullActions(),
    'arologis.accounting.accounts': fullActions(),
  },
  AROLOGIS_SALES: {},
  AROLOGIS_DRIVER: {},
}

const permissionFixtures: Record<string, PermissionMap> = clonePermissionFixtures(ROLE_PERMISSION_FIXTURES)

export function isMockMode(): boolean {
  return import.meta.env['VITE_MOCK_MODE'] === '1'
}

export function getMockResponse(config: AxiosRequestConfig): unknown | null {
  const method = (config.method ?? 'get').toLowerCase()
  const url = String(config.url ?? '')

  if (method === 'get' && url.endsWith('/admin/arologis/permissions/my')) {
    const role = useAuthStore.getState().auth?.role ?? ''
    return envelope(clonePermissionMap(permissionFixtures[role] ?? {}))
  }
  if (method === 'get' && url.startsWith('/admin/arologis/dispatch-groups')) {
    return envelope([{ groupNo: 'DG-20260804-01', dispatchDate: '2026-08-04', vehicleLabel: '1톤 냉동 01', carrierCode: 'ARO', carrierName: '아로로지스', slips: '[2026/08/04-1]' }])
  }

  // 배차 상세(GET /admin/arologis/dispatches/{id}) 와 동일한 depth 의 형제 라우트.
  // detailMatch 정규식은 단일 세그먼트만 구분하므로, 아래 예약어는 상세 mock 에서
  // 제외해 실제 형제 endpoint 응답(각각 별도 mock 또는 실 API 위임)을 가리지 않는다.
  const RESERVED_DISPATCH_SEGMENTS = new Set(['pre-classify', 'unassigned', 'regional', 'history'])

  const detailMatch = url.match(/^\/admin\/arologis\/dispatches\/([^/]+)$/)
  if (method === 'get' && detailMatch && !RESERVED_DISPATCH_SEGMENTS.has(detailMatch[1] ?? '')) {
    const dispatchId = decodeURIComponent(detailMatch[1] ?? 'mock-dispatch')
    return envelope({
      dispatchId,
      dispatchDate: '2026-07-14',
      dispatchType: 'EXPRESS',
      sandboxMode: true,
      vehicles: [
        {
          sequence: 1,
          tonnage: 'TONNAGE_1',
          label: '상일+초월',
          assignedDriverCode: 'INSUNG-001',
          matchSource: 'EXTERNAL_INSUNG_QUICK',
          externalRefId: 'EXT-MOCK-001',
          vendorOrderId: 'INSUNG-ORDER-MOCK-001',
          status: 'ASSIGNED',
          notifyResults: [
            {
              channel: 'aligo',
              status: 'SUCCESS',
              sentAt: '2026-07-14T10:30:00',
              recipientPhone: '010-1111-2222',
              errorCode: null,
            },
          ],
          gpsSources: [
            {
              source: 'EXTERNAL_INSUNG_LBS',
              latitude: 37.1000000,
              longitude: 127.1000000,
              lastReceivedAt: '2026-07-14T09:00:00',
              active: false,
            },
            {
              source: 'APP_GPS_ACTIVE',
              latitude: 37.2000000,
              longitude: 127.2000000,
              lastReceivedAt: new Date().toISOString(),
              active: true,
            },
          ],
          stops: [
            {
              sequence: 1,
              rawText: '-인천 남동구 구월동(에스엠하나공조-214)',
              parsedAddress: '인천 남동구 구월동',
              parsedPartnerName: '에스엠하나공조',
              parsedKakaoSeq: 214,
              parsedPartnerCode: 'P-2026-0001',
              notes: null,
              status: 'PENDING',
            },
          ],
        },
      ],
    })
  }

  const manualLocationMatch = url.match(/^\/admin\/arologis\/dispatches\/([^/]+)\/vehicles\/(\d+)\/manual-location$/)
  if (method === 'post' && manualLocationMatch) {
    return envelope({
      sequence: manualLocationMatch[2] ?? '',
      source: 'MANUAL',
    })
  }

  return null
}

function envelope<T>(data: T): MockEnvelope<T> {
  return {
    success: true,
    code: 'SUCCESS',
    message: 'OK',
    data,
    timestamp: new Date().toISOString(),
  }
}

function fullActions(): string[] {
  return ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'DOWNLOAD', 'PRINT']
}

function clonePermissionFixtures(fixtures: Record<string, PermissionMap>): Record<string, PermissionMap> {
  return Object.fromEntries(
    Object.entries(fixtures).map(([role, permissions]) => [role, clonePermissionMap(permissions)]),
  )
}

function clonePermissionMap(permissions: PermissionMap): PermissionMap {
  return Object.fromEntries(
    Object.entries(permissions).map(([pageCode, actions]) => [pageCode, [...actions]]),
  )
}
