/**
 * 공통 인쇄 양식 shell — P0-4 인쇄 양식 5건 1차 mock (Designer 단계).
 *
 * 포함:
 * - 상단 no-print 액션 바 (돌아가기 / 인쇄 버튼)
 * - 회사 표준 정보 상수 (`COMPANY` — (주)삼한공조시스템)
 * - 양식 종류별 paper size CSS class (`a4-portrait` / `a4-landscape` / `receipt-88mm`)
 * - 한국 통화 / 일자 / 한글 금액 포맷 헬퍼 (5 view 공통 사용)
 *
 * 매뉴얼 출처: `docs/manual/06-트러블슈팅/03-인쇄-안됨.md` §1 표 (P0-4).
 *
 * Iteration 가드 (memory `feedback_print_design_iteration.md`):
 * - 본 1차 mock 은 사용자 Edge 캡처 검토 전 placeholder.
 * - 후속 PR-comment 단계에서 사용자 이미지 → mock → Edge 캡처 → CSS-only 미세 조정 2~5회 iteration 필수.
 */
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, SignatureViewer } from '@samhan/design-system'
import { useCompanyProfile } from './useCompanyProfile'

// COMPANY 정적 상수는 useCompanyProfile 훅으로 대체됨 (spec §2c, 2026-06-10).
// 외부에서 COMPANY 를 직접 import 하지 말 것 — useCompanyProfile() 훅 사용.
// 아래 DEFAULT_COMPANY 는 useCompanyProfile.ts 내부에서 fallback 으로만 사용.

/**
 * Paper size 종류 — `<PrintLayout>` 의 `paper` prop.
 * - `a4-portrait` — A4 세로 (210mm × 297mm) — 거래명세서 / 견적서 / 세금계산서
 * - `a4-landscape` — A4 가로 (297mm × 210mm) — 기존 InvoiceView (legacy)
 * - `receipt-88mm` — 88mm 영수증 프린터 (88mm × auto) — 출고/입고 분기 옵션
 */
export type PaperSize = 'a4-portrait' | 'a4-landscape' | 'receipt-88mm'

export interface PrintDocHeader {
  title: string
  docNo?: string
  issueDate?: string
  periodFrom?: string
  periodTo?: string
}

export interface PrintApprovalStep {
  label: string
  name?: string
  decidedAt?: string
}

interface PrintLayoutProps {
  /** 양식 종류 — `<body>` 단의 .paper-* 클래스 부여 (CSS @page size 분기). */
  paper: PaperSize
  /** 상단 no-print 액션 바 좌측 "돌아가기" 버튼이 가리킬 path (보통 `/sales/:id`). */
  backTo?: string
  /** 양식 본문 (5 view 가 자기 양식 컴포넌트를 children 으로 전달). */
  children: ReactNode
  /**
   * 88mm ↔ A4 분기 토글 노출 여부 (출고/입고 전표 한정 — props 로 제어할 prop 은
   * 호출자가 직접 paper 변경 / 본 layout 은 단순 노출 X 인 상태에서 wrap).
   *
   * 본 1차 mock 은 toggle UI placeholder 만 — 후속 iteration 에서 실제 toggle 로직 추가.
   */
  showFormatToggle?: boolean
  /** 88mm ↔ A4 toggle 콜백 — `showFormatToggle=true` 시. 본 1차 mock placeholder. */
  onToggleFormat?: () => void
  /**
   * 전자서명 결재문서 형식 opt-in.
   *
   * 기본값 false. 미전달 시 기존 출력 양식 DOM 을 그대로 children 만 렌더한다.
   */
  approvalDoc?: boolean
  /** 결재문서 공통 헤더 정보. `approvalDoc=true` 일 때만 렌더한다. */
  docHeader?: PrintDocHeader
  /** 결재란 정의. 2~5칸을 배열 길이로 동적 렌더한다. */
  approvalSteps?: PrintApprovalStep[]
}

/**
 * 인쇄 양식 5건 공통 shell.
 *
 * 책임:
 * - 상단 no-print 액션 바 (돌아가기 / 인쇄 / 옵션 toggle)
 * - 양식 본문에 paper size CSS class 부여 (`paper-a4-portrait` 등)
 * - 양식 본문은 children 으로 위임 (각 view 가 자기 layout 직접 결정)
 *
 * 인쇄 시 `.no-print` 가 모두 숨겨지므로, 액션 바는 print 출력에서 제외된다.
 */
export function PrintLayout({
  paper,
  backTo,
  children,
  showFormatToggle = false,
  onToggleFormat,
  approvalDoc = false,
  docHeader,
  approvalSteps = [],
}: PrintLayoutProps) {
  const navigate = useNavigate()
  const { company } = useCompanyProfile()
  const normalizedApprovalSteps = approvalSteps.slice(0, 5)
  return (
    <div>
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        {backTo ? (
          <Button variant="ghost" onClick={() => navigate(backTo)}>
            상세로 돌아가기
          </Button>
        ) : null}
        <Button variant="primary" onClick={() => window.print()}>
          인쇄
        </Button>
        {showFormatToggle ? (
          <Button variant="ghost" onClick={onToggleFormat}>
            {paper === 'receipt-88mm' ? 'A4 세로로 전환' : '88mm 영수증으로 전환'}
          </Button>
        ) : null}
      </div>

      <div className={`paper paper-${paper}`}>
        {approvalDoc ? (
          <div className="print-approval-doc">
            <header className="print-approval-doc-header">
              <div className="print-approval-company">
                <div className="print-approval-company-name">{company.legalName}</div>
                <div className="print-approval-company-meta">
                  사업자번호 {company.businessRegNo}
                </div>
              </div>
              <div className="print-approval-doc-meta">
                <h1>{docHeader?.title ?? ''}</h1>
                {docHeader?.docNo ? (
                  <div>
                    <span>문서번호</span>
                    <strong>{docHeader.docNo}</strong>
                  </div>
                ) : null}
                {docHeader?.issueDate ? (
                  <div>
                    <span>발행일</span>
                    <strong>{krDate(docHeader.issueDate)}</strong>
                  </div>
                ) : null}
                {docHeader?.periodFrom || docHeader?.periodTo ? (
                  <div>
                    <span>기간</span>
                    <strong>
                      {krDate(docHeader.periodFrom)} ~ {krDate(docHeader.periodTo)}
                    </strong>
                  </div>
                ) : null}
              </div>
            </header>
            <div className="print-approval-divider" aria-hidden="true" />
            <main className="print-approval-body">{children}</main>
            <div className="print-approval-divider" aria-hidden="true" />
            <section className="print-approval-section" aria-label="전자서명 결재란">
              <div
                className="print-approval-grid"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(2, normalizedApprovalSteps.length)}, minmax(0, 1fr))`,
                }}
              >
                {normalizedApprovalSteps.map((step) => {
                  const signerName = step.name ?? ''
                  const decidedAt = step.decidedAt ?? ''
                  return (
                    <div className="print-approval-cell" key={step.label}>
                      <div className="print-approval-label">{step.label}</div>
                      <div className="print-approval-signature">
                        <SignatureViewer
                          signaturePngBase64=""
                          signerName={signerName}
                          signedAt={decidedAt}
                          size="fluid"
                          className="print-approval-signature-viewer"
                        />
                      </div>
                      <div className="print-approval-name">
                        <div>{signerName}</div>
                        <time>{formatApprovalDecidedAt(decidedAt)}</time>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="print-approval-notice">※ 전자서명으로 결재된 문서입니다.</p>
            </section>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

/* ============================================================
 * 공통 포맷 헬퍼 — 5 view 가 import 하여 동일 형식 사용.
 * ============================================================
 */

/**
 * 한국 원화 천 단위 콤마 포맷 — 정수 / 문자열 모두 허용. NaN 시 빈 문자열.
 *
 * @example krw(1234567) → "1,234,567"
 */
export function krw(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return ''
  const v = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(v)) return ''
  return Math.round(v).toLocaleString('ko-KR')
}

/**
 * ISO 일자 (YYYY-MM-DD) → 한국식 "YYYY년 MM월 DD일" 포맷.
 *
 * @example krDate('2026-05-09') → "2026년 05월 09일"
 */
export function krDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[1]}년 ${m[2]}월 ${m[3]}일`
}

function formatApprovalDecidedAt(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return ''
  const datePart = iso.slice(0, 10).replace(/-/g, '/')
  if (iso.length < 16) return datePart
  return `${datePart} ${iso.slice(11, 16)}`
}

/**
 * 숫자 → 한글 금액 ("일금 ◯◯◯원 정") — 거래명세서 / 견적서 / 세금계산서 합계란 사용.
 *
 * 간단판 — 만/억/조 단위만 처리 (실무에서는 충분).
 */
export function toKoreanAmount(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '영원 정'
  const units = ['', '만', '억', '조']
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  const positions = ['', '십', '백', '천']
  let result = ''
  let unitIndex = 0
  let value = Math.floor(Math.abs(n))
  while (value > 0) {
    const chunk = value % 10000
    if (chunk > 0) {
      let chunkStr = ''
      const chunkDigits = String(chunk).split('').reverse()
      for (let i = 0; i < chunkDigits.length; i += 1) {
        const d = Number(chunkDigits[i])
        if (d > 0) {
          const digitChar = digits[d] ?? ''
          const positionChar = positions[i] ?? ''
          chunkStr = digitChar + positionChar + chunkStr
        }
      }
      const unitChar = units[unitIndex] ?? ''
      result = chunkStr + unitChar + result
    }
    value = Math.floor(value / 10000)
    unitIndex += 1
  }
  return `일금 ${result}원 정`
}

/**
 * 공급가액 + 부가세(10%) → 합계 — 5 view 라인/총계 계산 공통.
 *
 * @return `{ supply, vat, total }` (모두 정수 원, 부가세는 소수점 절사)
 */
export function calcAmounts(supply: number): {
  supply: number
  vat: number
  total: number
} {
  const s = Math.round(supply)
  const vat = Math.floor(s * 0.1)
  return { supply: s, vat, total: s + vat }
}
