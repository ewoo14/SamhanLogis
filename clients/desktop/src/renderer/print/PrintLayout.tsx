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
import { vatFromSupply } from '../utils/vatRounding'

// 결재문서(approvalDoc) 헤더에서 회사명/사업자번호 블록 제거(2026-06-14 개발책임자
// 디자인 iteration 2) → useCompanyProfile 훅은 본 layout 에서 더 이상 쓰지 않는다.
// 회사 정보는 거래명세서/세금계산서 등 각 view 가 필요 시 자체적으로 useCompanyProfile() 사용.

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
  signaturePngBase64?: string
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
  /**
   * 결재 서류용 정중한 품의/제출 멘트. `approvalDoc=true` 일 때 본문 divider 아래에 렌더한다.
   *
   * 예) "위와 같이 품의하오니 재가하여 주시기 바랍니다." / "아래와 같이 견적서를 제출하오니 …".
   * 그 아래의 "※ 전자서명으로 결재된 문서입니다." 안내 문구는 본 멘트와 별개로 항상 유지된다.
   */
  closingNote?: string
  /**
   * DS-3b v2 문서 양식 편집기가 HEADER 밴드에 배치한 FIELD/TEXT 요소.
   *
   * `approvalDoc=true` 일 때만 문서 헤더 영역(제목/문서메타 아래)에 렌더한다. 미지정(undefined) 시
   * 아무 것도 렌더하지 않아 v1 문서(레거시 요소만)의 출력이 완전히 동일하게 유지된다(G3).
   */
  headerExtra?: ReactNode
  /**
   * DS-3b v2 문서 양식 편집기가 FOOTER 밴드에 배치한 FIELD/TEXT 요소.
   *
   * `approvalDoc=true` 일 때만 closingNote/전자서명 안내 아래에 렌더한다. 미지정 시 아무 것도
   * 렌더하지 않는다(G3).
   */
  footerExtra?: ReactNode
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
  closingNote,
  headerExtra,
  footerExtra,
}: PrintLayoutProps) {
  const navigate = useNavigate()
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
            {/* 헤더 = 좌(문서제목 + 문서메타) + 우(결재란 박스).
                회사명/사업자번호 블록은 제거(2026-06-14 개발책임자 디자인 iteration 2) →
                좌측 최상단이 문서 제목 h1, 그 아래 문서메타(번호/발행일/기간), 우상단이 결재란.
                한국 ERP/공문서/세금계산서 표준에 맞춰 결재란을 문서 우측 상단 코너로 배치한다. */}
            <header className="print-approval-doc-header">
              <div className="print-approval-doc-headline">
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
                {headerExtra ?? null}
              </div>
              {/* 결재 단계가 하나도 없으면 빈 grid 박스가 그려지므로 결재란 박스 자체를 렌더하지 않는다.
                  현재 호출처는 모두 3칸을 전달해 무해하나, 후속 호출처가 빈 배열을 넘길 때의 회귀 방어. */}
              {normalizedApprovalSteps.length > 0 ? (
                <section className="print-approval-section" aria-label="전자서명 결재란">
                  {/* 우측 상단 코너용 — 칸당 고정폭(코너 토큰) × N칸. 전체폭(1fr) 아님.
                      flex:0 0 auto 인 박스가 칸 폭만큼만 차지하도록 고정폭으로 그린다. */}
                  <div
                    className="print-approval-grid"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(2, normalizedApprovalSteps.length)}, var(--print-approval-corner-col, 19mm))`,
                    }}
                  >
                    {normalizedApprovalSteps.map((step, index) => {
                      const signerName = step.name ?? ''
                      const decidedAt = step.decidedAt ?? ''
                      return (
                        <div className="print-approval-cell" key={`${step.label}-${index}`}>
                          <div className="print-approval-label">{step.label}</div>
                          <div className="print-approval-signature">
                            {/* 슬라이스1 placeholder — 전자서명 이미지 실연동은 그룹웨어 결재 연동 후속. */}
                            <SignatureViewer
                              signaturePngBase64={step.signaturePngBase64 ?? ''}
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
                </section>
              ) : null}
            </header>
            <div className="print-approval-divider" aria-hidden="true" />
            <main className="print-approval-body">{children}</main>
            {/* 문서 하단(본문 아래) = 정중한 품의/제출 멘트(closingNote) + 전자서명 안내 문구.
                결재란 grid 는 우측 상단으로 이동했다(2026-06-14). closingNote 또는 결재란이
                하나라도 있으면 divider 를 그린다. 안내 문구는 결재란이 렌더될 때만(빈 배열 방어). */}
            {closingNote || normalizedApprovalSteps.length > 0 ? (
              <>
                <div className="print-approval-divider" aria-hidden="true" />
                {closingNote ? (
                  <p className="print-approval-closing">{closingNote}</p>
                ) : null}
                {normalizedApprovalSteps.length > 0 ? (
                  <p className="print-approval-notice">※ 전자서명으로 결재된 문서입니다.</p>
                ) : null}
              </>
            ) : null}
            {footerExtra ?? null}
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
  const vat = vatFromSupply(s)
  return { supply: s, vat, total: s + vat }
}
