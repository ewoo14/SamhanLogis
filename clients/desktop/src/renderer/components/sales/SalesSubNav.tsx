/**
 * 판매 메뉴 sub-navigation — `/sales/estimates`, `/sales/partner-orders`,
 * `/sales/order-approvals`, `/sales/partner-dc-config` 4 sub-route 의 1단계 탭.
 *
 * <p>v2 변경 (정정 라운드 §정정 9 / §정정 14):
 * - `/sales/long-pending` → `/sales/order-approvals` (장기미발주 → '주문서 승인')
 * - `/sales/partner-dc-config` 신규 (거래처 DC 설정)
 *
 * <p>[2a 메뉴 통합] `/sales` 는 SalesQueryPage 직행이 되었고 legacy SlipListPage 는
 * `/sales/slips` 로 옮겨졌으므로 본 sub-nav 는 그대로 `/sales/...` 하위 화면 상단에서만
 * 노출한다. AppLayout 의 좌측 사이드바 에서는 [판매] 그룹 label + 4 NavLink 로 직접 노출한다.
 *
 * <p>[3a 데스크탑 ↔ 웹 분리] 좌측 NavLink 4종 (데스크탑 내장 — 내부 영업/관리자용) 과
 * 우측 EXTERNAL_ITEMS 2종 (거래처용 외부 웹앱) 사이를 시각 구분선 + "거래처용 외부 웹"
 * 라벨로 분리해 사용자 혼동을 줄인다.
 */
import { NavLink } from 'react-router-dom'
import styles from './sales.module.css'

const ITEMS = [
  { to: '/sales/estimates', label: '견적서 관리' },
  { to: '/sales/partner-orders', label: '주문서 관리' },
  { to: '/sales/order-approvals', label: '주문서 승인' },
  { to: '/sales/partner-dc-config', label: '거래처 DC 설정' },
  { to: '/sales/estimate-config', label: '견적 가격 설정' },
]

/**
 * 거래처(파트너) 가 사업자번호 로그인으로 직접 사용하는 외부 웹앱.
 * 데스크탑 사용자는 새 브라우저 창에서 열어 본인 직원 동작이 아닌 거래처 입장에서 확인한다.
 *
 * URL 은 Vite 빌드 시 환경변수로 주입:
 *   VITE_WEB_ESTIMATE_URL — 웹 종합견적서 origin (기본값: http://localhost:5183)
 *   VITE_WEB_ORDER_URL    — 웹 주문서 origin (기본값: http://localhost:5180)
 * production 빌드 시 실제 도메인 (https://order.samhan-air.com 등) 으로 override.
 */
const EXTERNAL_ITEMS = [
  {
    url: import.meta.env.VITE_WEB_ESTIMATE_URL ?? 'http://localhost:5183',
    label: '웹 종합견적서',
  },
  {
    url: import.meta.env.VITE_WEB_ORDER_URL ?? 'http://localhost:5180',
    label: '웹 주문서',
  },
]

export function SalesSubNav() {
  const openExternal = (url: string) => {
    const bridge = window.samhanLegacy
    if (!bridge) {
      // 웹(비-Electron) 빌드에는 preload 브리지(samhanLegacy)가 없다 → 새 탭 폴백.
      // (Electron 셸에서는 아래 openExternal(main 프로세스 shell.openExternal)로 처리.)
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    bridge.openExternal(url).catch((err) => {
      console.warn('[SalesSubNav] 외부 link 열기 실패', err)
    })
  }

  return (
    <nav className={styles['subNav']} aria-label="영업 sub navigation">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={false}
          className={({ isActive }) => (isActive ? styles['active']! : '')}
        >
          {item.label}
        </NavLink>
      ))}
      <span
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        data-testid="sales-subnav-external"
      >
        <span
          aria-hidden="true"
          style={{
            width: 1,
            height: 18,
            background: '#d0d7de',
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: '#6B7280',
            fontWeight: 500,
            letterSpacing: 0.2,
          }}
        >
          거래처용 외부 웹
        </span>
        {EXTERNAL_ITEMS.map((item) => (
          <button
            key={item.url}
            type="button"
            onClick={() => openExternal(item.url)}
            title={`${item.label} — 거래처가 직접 사용하는 외부 웹앱 (새 브라우저 창)`}
            style={{
              padding: '6px 10px',
              border: '1px solid #d0d7de',
              borderRadius: 4,
              background: '#f8fafc',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {item.label} ↗
          </button>
        ))}
      </span>
    </nav>
  )
}
