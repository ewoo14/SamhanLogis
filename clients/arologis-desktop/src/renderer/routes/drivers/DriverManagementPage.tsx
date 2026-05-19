/**
 * DriverManagementPage — F4 — 기사 마스터 (읽기 전용).
 *
 * 현재 기사 마스터 데이터는 인성데이타 퀵프로그램과의 자동 매칭으로 관리된다.
 * 수동 CRUD (신규 등록 / 비활성화) 는 BE endpoint 미구현 상태이며,
 * Figma UI/UX 확정 + BE 도메인 정책 수립 후 별도 슬라이스로 도입 예정.
 *
 * 현재 기능:
 * - 기사 목록 조회 (GET /admin/arologis/drivers, ApiResponse 자동 unwrap)
 * - 수동 CUD — read-only 안내 메시지로 대체 (404 방지)
 *
 * UUID 비공개 가드 — driverCode / phoneNumber / vehicleType / source 만 노출.
 * BE DriverResponse 에 `name` 필드 없음; source 로 출처(인성데이타/수동) 표시.
 */
import { useQuery } from '@tanstack/react-query'
import { listDrivers, type DriverDto } from '../../api/arologis'
import { canManageDrivers, useAuthStore } from '../../stores/authStore'

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 16,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
}

const cellStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--color-border)',
  textAlign: 'left',
  fontSize: 'var(--font-size-base)',
}

const noticeBannerStyle: React.CSSProperties = {
  padding: '12px 16px',
  background: 'var(--color-warning-bg, #fffbe6)',
  border: '1px solid var(--color-warning-border, #ffe58f)',
  borderRadius: 4,
  fontSize: 'var(--font-size-base)',
  color: 'var(--color-text-secondary, #595959)',
  marginBottom: 16,
}

/** DriverSource 레이블 변환 */
function sourceLabel(source: string): string {
  if (source === 'INSUNG_QUICK') return '인성데이타'
  if (source === 'MANUAL') return '수동 등록'
  return source
}

/** 기사 행 컴포넌트 */
function DriverRow({ driver }: { driver: DriverDto }): JSX.Element {
  return (
    <tr key={driver.driverCode}>
      <td style={cellStyle}>{driver.driverCode}</td>
      <td style={cellStyle}>{driver.phoneNumber}</td>
      <td style={cellStyle}>{driver.vehicleType}</td>
      <td style={cellStyle}>{sourceLabel(driver.source)}</td>
      <td style={cellStyle}>
        {driver.appInstalled ? '설치됨' : '미설치'}
      </td>
    </tr>
  )
}

export function DriverManagementPage(): JSX.Element {
  const auth = useAuthStore((s) => s.auth)
  /** 관리자 여부 — 현재는 read-only 이므로 안내 메시지 표시에만 사용. */
  const canManage = canManageDrivers(auth?.role)

  const { data: drivers, isLoading, error } = useQuery<DriverDto[]>({
    queryKey: ['arologis', 'drivers'],
    queryFn: listDrivers,
  })

  return (
    <section>
      <h1 style={{ fontSize: 'var(--font-size-xl)', marginTop: 0 }}>기사 관리</h1>
      <p style={{ color: 'var(--color-text-muted)', marginTop: 0 }}>
        모바일 어플의 휴대번호 로그인(passwordless)은 본 화면에서 확인된
        기사만 허용됩니다.
      </p>

      {/* 수동 CUD 미구현 안내 */}
      <div
        role="note"
        aria-label="기능 안내"
        style={noticeBannerStyle}
        data-testid="driver-readonly-notice"
      >
        현재 기사 마스터는 인성데이타 퀵프로그램과의 자동 매칭으로 관리됩니다.
        수동 등록 및 비활성화는 추후 도입 예정입니다.
        {canManage && (
          <span>
            {' '}기사 정보 변경이 필요한 경우 관리자에게 문의하세요.
          </span>
        )}
      </div>

      {isLoading && (
        <p data-testid="driver-loading">기사 목록을 불러오는 중...</p>
      )}
      {error && (
        <p
          role="alert"
          data-testid="driver-error"
          style={{ color: 'var(--color-danger)' }}
        >
          기사 목록을 불러오지 못했습니다.
        </p>
      )}

      {drivers && (
        <table style={tableStyle} data-testid="driver-table">
          <thead>
            <tr>
              <th style={{ ...cellStyle, fontWeight: 600 }}>기사 코드</th>
              <th style={{ ...cellStyle, fontWeight: 600 }}>휴대번호</th>
              <th style={{ ...cellStyle, fontWeight: 600 }}>차량 유형</th>
              <th style={{ ...cellStyle, fontWeight: 600 }}>출처</th>
              <th style={{ ...cellStyle, fontWeight: 600 }}>어플</th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{ ...cellStyle, textAlign: 'center' }}
                  data-testid="driver-empty"
                >
                  등록된 기사가 없습니다.
                </td>
              </tr>
            )}
            {drivers.map((d) => (
              <DriverRow key={d.driverCode} driver={d} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
