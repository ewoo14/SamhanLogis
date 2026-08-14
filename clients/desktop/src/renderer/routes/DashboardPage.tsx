/**
 * 대시보드 — 환영 메시지 + 4 개의 통계 카드 + 빠른 액션 버튼.
 *
 * 본 슬라이스에서는:
 * - "오늘 출고전표" 카드만 실제 BE 호출 (`GET /slips?slipType=OUTBOUND&status=PROCESSING`)
 * - 나머지 3개 카드는 준비 중 placeholder
 *
 * 후속 슬라이스에서 inventory 잔고/저재고 알림/메신저 카운트 등으로 확장.
 */
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Card } from '@samhan/design-system'
import { listSlips } from '../api/slip'
import { canQueryPurchases, canQuerySales, useSessionStore } from '../stores/session'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

export function DashboardPage() {
  usePageTitle('대시보드')
  const auth = useSessionStore((s) => s.auth)
  const navigate = useNavigate()
  const { canAccess } = usePermissions()
  const canReadSales = canAccess('sales.slip.list', 'view') && canQuerySales(auth)
  const canReadPurchases = canAccess('purchases.slip.list', 'view') && canQueryPurchases(auth)

  const processingQuery = useQuery({
    queryKey: ['slips', 'processing-count'],
    enabled: canReadSales,
    queryFn: () =>
      listSlips({
        slipType: 'OUTBOUND',
        status: 'PROCESSING',
        page: 0,
        size: 1,
      }),
  })

  const processingCount = processingQuery.data?.totalElements ?? 0

  return (
    <>
      <p style={{ marginTop: 0 }}>
        환영합니다, <strong>{auth?.fullName ?? '사용자'}</strong> 님.
      </p>

      <div className="dashboard-grid">
        {canReadSales ? (
          <Card padding={4} shadow="sm">
            <p className="stat-label">처리중 출고전표</p>
            <p className="stat-value">
              {processingQuery.isLoading ? '...' : processingCount}
            </p>
          </Card>
        ) : null}
        <Card padding={4} shadow="sm">
          <p className="stat-label">저재고 알림</p>
          <p className="stat-value" style={{ color: 'var(--color-neutral-400)' }}>
            준비중
          </p>
        </Card>
        <Card padding={4} shadow="sm">
          <p className="stat-label">미확인 메시지</p>
          <p className="stat-value" style={{ color: 'var(--color-neutral-400)' }}>
            준비중
          </p>
        </Card>
        <Card padding={4} shadow="sm">
          <p className="stat-label">결재 대기</p>
          <p className="stat-value" style={{ color: 'var(--color-neutral-400)' }}>
            준비중
          </p>
        </Card>
      </div>

      <Card padding={4} shadow="sm">
        <h3 style={{ marginTop: 0 }}>빠른 액션</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={() => navigate('/sales/new')}
            disabled={!canAccess('sales.slip.create', 'create')}
          >
            새 출고전표
          </Button>
          {canReadSales ? (
            <Button variant="secondary" onClick={() => navigate('/sales')}>
              판매관리
            </Button>
          ) : null}
          {canReadPurchases ? (
            <Button variant="secondary" onClick={() => navigate('/purchases')}>
              구매관리
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => navigate('/transfers')}>
            재고이동 관리
          </Button>
          <Button variant="ghost" onClick={() => navigate('/warehouses')}>
            창고관리
          </Button>
        </div>
        {!canAccess('sales.slip.create', 'create') ? (
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--color-neutral-500)' }}>
            전표 작성은 전표 작성 권한이 있는 계정에서만 가능합니다.
          </p>
        ) : null}
      </Card>
    </>
  )
}
