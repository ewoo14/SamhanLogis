/**
 * 재무 보고서 목록 화면 (`/accounting/reports`).
 *
 * 3대 재무 보고서 (손익계산서 / 재무상태표 / 시산표) 진입 카드 3개.
 * 권한: ACCOUNTANT / MANAGER / MASTER 진입 (RoleGuard — AppRouter 에서 적용, BE @PreAuthorize 일치).
 */
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '@samhan/design-system'
import { usePageTitle } from '../hooks/usePageTitle'

interface ReportCardProps {
  title: string
  description: string
  path: string
  icon: string
}

/**
 * 보고서 카드 단일 항목.
 * design-system `Card` + `Button` 재사용.
 */
function ReportCard({ title, description, path, icon }: ReportCardProps) {
  const navigate = useNavigate()
  return (
    <Card
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 220,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 36 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{title}</div>
      <div style={{ fontSize: 13, color: '#6B7280', flexGrow: 1 }}>{description}</div>
      <Button variant="primary" size="sm" onClick={() => navigate(path)}>
        조회
      </Button>
    </Card>
  )
}

export function ReportListPage() {
  usePageTitle('재무 보고서')

  return (
    <>
      <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>재무 보고서</h3>
      <div
        data-testid="accounting-report-list"
        style={{
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          alignItems: 'stretch',
        }}
      >
        <ReportCard
          icon="📊"
          title="손익계산서"
          description="매출 / 비용 / 영업이익 / 당기순이익을 월별로 조회합니다."
          path="/accounting/reports/income-statement"
        />
        <ReportCard
          icon="⚖️"
          title="재무상태표"
          description="기준일 기준 자산 / 부채 / 자본 잔액을 확인합니다."
          path="/accounting/reports/balance-sheet"
        />
        <ReportCard
          icon="📋"
          title="시산표"
          description="월별 계정 차변 / 대변 합계 + 잔액 균형 검증."
          path="/accounting/balances"
        />
      </div>
    </>
  )
}
