/**
 * 판매 메뉴 sub-navigation — `/sales/estimates`, `/sales/partner-orders`,
 * `/sales/order-approvals`, `/sales/partner-dc-config` 4 sub-route 의 1단계 탭.
 *
 * <p>v2 변경 (정정 라운드 §정정 9 / §정정 14):
 * - `/sales/long-pending` → `/sales/order-approvals` (장기미발주 → '주문서 승인')
 * - `/sales/partner-dc-config` 신규 (거래처 DC율 설정)
 *
 * <p>기존 `/sales` (출고전표 SlipListPage) 와 충돌 회피를 위해 본 sub-nav 는 `/sales/...`
 * 하위 sales 화면 상단에만 표시한다. AppLayout 의 좌측 사이드바 에서는 [판매] 그룹
 * label + 4 NavLink 로 직접 노출한다.
 */
import { NavLink } from 'react-router-dom'
import styles from './sales.module.css'

const ITEMS = [
  { to: '/sales/estimates', label: '견적서' },
  { to: '/sales/partner-orders', label: '주문서 조회' },
  { to: '/sales/order-approvals', label: '주문서 승인' },
  { to: '/sales/partner-dc-config', label: '거래처 DC 설정' },
]

export function SalesSubNav() {
  return (
    <nav className={styles['subNav']} aria-label="판매 sub navigation">
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
    </nav>
  )
}
