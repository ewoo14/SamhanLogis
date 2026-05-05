/**
 * 판매 메뉴 sub-navigation — `/sales/estimates`, `/sales/partner-orders`,
 * `/sales/long-pending` 3 sub-route 의 1단계 탭.
 *
 * <p>기존 `/sales` (출고전표 SlipListPage) 와 충돌 회피를 위해 본 sub-nav 는 `/sales/...`
 * 하위 sales 화면 상단에만 표시한다. AppLayout 의 좌측 사이드바 에서는 [판매] 그룹
 * label + 3 NavLink 로 직접 노출한다.
 */
import { NavLink } from 'react-router-dom'
import styles from './sales.module.css'

const ITEMS = [
  { to: '/sales/estimates', label: '견적서' },
  { to: '/sales/partner-orders', label: '주문서 조회' },
  { to: '/sales/long-pending', label: '장기미발주' },
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
