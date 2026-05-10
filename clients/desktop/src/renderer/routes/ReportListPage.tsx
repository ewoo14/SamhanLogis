/**
 * 재무 보고서 목록 화면 (`/accounting/reports`).
 *
 * P0-1 Slice A 3개 + Slice B 4개 = 7개 카드 그리드.
 * 권한: ACCOUNTANT / MANAGER / MASTER 진입 (RoleGuard — AppRouter 에서 적용, BE @PreAuthorize 일치).
 *
 * PR #134 회고:
 * - raw hex 0건 — design-system 토큰만
 * - design-system Card / Button 재사용
 */
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '@samhan/design-system'
import { usePageTitle } from '../hooks/usePageTitle'

interface ReportCardProps {
  title: string
  description: string
  path: string
  icon: string
  badge?: string
}

/**
 * 보고서 카드 단일 항목.
 * design-system `Card` + `Button` 재사용.
 * D1: raw hex → design-system 토큰 교체.
 */
function ReportCard({ title, description, path, icon, badge }: ReportCardProps) {
  const navigate = useNavigate()
  return (
    <Card
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 200,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 36 }}>{icon}</div>
      <div
        style={{
          fontWeight: 700,
          fontSize: 16,
          color: 'var(--color-neutral-900)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {title}
        {badge ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 8,
              background: 'var(--color-bg-muted)',
              color: 'var(--color-neutral-600)',
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--color-neutral-500)',
          flexGrow: 1,
          lineHeight: 1.5,
        }}
      >
        {description}
      </div>
      <Button variant="primary" size="sm" onClick={() => navigate(path)}>
        조회
      </Button>
    </Card>
  )
}

/** 카드 섹션 헤더. */
function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        width: '100%',
        marginTop: 8,
        padding: '4px 0 2px',
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--color-neutral-500)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {label}
    </div>
  )
}

/**
 * 재무 보고서 목록 페이지 — Slice A 3개 + Slice B 4개 = 7개 카드.
 */
export function ReportListPage() {
  usePageTitle('재무 보고서')

  return (
    <>
      <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>재무 보고서</h3>

      {/* Slice A: 재무제표 3종 */}
      <SectionLabel label="재무제표 (Slice A)" />
      <div
        data-testid="accounting-report-list"
        style={{
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          alignItems: 'stretch',
          marginTop: 12,
          marginBottom: 24,
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

      {/* Slice B: 세금/거래처 4종 */}
      <SectionLabel label="세금/거래처 보고서 (Slice B)" />
      <div
        data-testid="accounting-report-list-slice-b"
        style={{
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          alignItems: 'stretch',
          marginTop: 12,
        }}
      >
        <ReportCard
          icon="🧾"
          title="부가세 신고서"
          badge="VAT"
          description="월별 매출/매입 VAT 집계 + 납부세액 계산. 세금계산서 기준."
          path="/accounting/reports/vat"
        />
        <ReportCard
          icon="🏛️"
          title="법인세 신고서"
          badge="CIT"
          description="사업연도 법인세 과세표준 + 단계별 세율 적용 + 차감납부세액."
          path="/accounting/reports/corporate-tax"
        />
        <ReportCard
          icon="📥"
          title="미수금 (거래처별)"
          badge="채권"
          description="기준일 외상매출금 잔액 + 연체일수. 거래처별 채권 현황."
          path="/accounting/reports/partner-aging?type=RECEIVABLE"
        />
        <ReportCard
          icon="📤"
          title="미지급금 (거래처별)"
          badge="채무"
          description="기준일 외상매입금 잔액 + 연체일수. 거래처별 채무 현황."
          path="/accounting/reports/partner-aging?type=PAYABLE"
        />
      </div>
    </>
  )
}
