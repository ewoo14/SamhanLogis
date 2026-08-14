/**
 * SP-08-5-5 매입 인쇄 양식 정적 계약 검증
 *
 * 목적: PurchaseSlipPrintPage (또는 동등 컴포넌트) 가 입고 전표 인쇄 양식
 *       A4 portrait 계약, 한국어 라벨, UUID 비공개, @media print 트리거를
 *       모두 만족하는지 소스 정적 단언으로 보장한다.
 *
 * 실행 환경: dev server 없이 소스 정적 분석 (파일 read + 문자열 단언).
 *
 * 5 case:
 *   T1 — FE 라우트 계약: `/purchases/:id/print/purchase` 존재 + useParams slipId + useQuery(['slip', id]) 재사용
 *   T2 — 인쇄 영역 구조: paper-a4-portrait 클래스 + 헤더/거래처/라인테이블/합계/결재란/푸터 6 섹션
 *   T3 — 한국어 라벨: "입고 전표", "거래처", "사업자번호", "입고창고", "수량", "단가", "합계", "결 재 란", "입고자", "검수자"
 *   T4 — UUID 비공개: internal id 미노출, slipNo 만 표시
 *   T5 — @media print + 인쇄 트리거: @media print CSS + window.print() 호출 또는 인쇄 버튼
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(desktopRoot, '../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relPath))
}

/**
 * 입고 전표 인쇄 컴포넌트 후보 경로 목록.
 * FE agent 가 실제 생성한 파일명에 따라 첫 번째로 존재하는 경로를 사용한다.
 */
const PRINT_COMPONENT_CANDIDATES = [
  'clients/desktop/src/renderer/print/PurchaseSlipPrintPage.tsx',
  'clients/desktop/src/renderer/routes/purchase-query/PurchaseSlipPrintPage.tsx',
  'clients/desktop/src/renderer/print/PurchaseSlipPrintView.tsx',
  'clients/desktop/src/renderer/print/PurchasePrintView.tsx',
  'clients/desktop/src/renderer/routes/PurchaseSlipPrintPage.tsx',
]

function resolvePrintComponent(): string {
  for (const candidate of PRINT_COMPONENT_CANDIDATES) {
    if (fileExists(candidate)) return candidate
  }
  return 'clients/desktop/src/renderer/print/PurchaseSlipPrintPage.tsx'
}

const routesPath = 'clients/desktop/src/renderer/routes/index.tsx'
const printLayoutPath = 'clients/desktop/src/renderer/print/PrintLayout.tsx'

test.describe('SP-08-5-5 매입 인쇄 양식 정적 계약', () => {
  /**
   * T1 — FE 라우트 계약
   *
   * routes/index.tsx 가 `/purchases/:id/print/purchase` 경로를 등록하고,
   * 컴포넌트가 useParams 로 slipId 를 추출하며, useQuery(['slip', id]) 를
   * 재사용해 BE endpoint 를 호출한다는 계약 확인.
   *
   * 대안 라우트: `/slips/:id/print` — FE agent 결정에 따라 허용.
   */
  test('T1: FE 라우트 계약 — /purchases/:id/print/purchase 존재 + useParams slipId + useQuery 재사용', () => {
    const routes = read(routesPath)
    const printComponent = read(resolvePrintComponent())

    // 라우트 등록 단언 — /print/purchase 또는 동등 경로
    const hasPurchasePrintRoute =
      routes.includes('/purchases/:id/print/purchase') ||
      routes.includes('/slips/:id/print')
    expect(hasPurchasePrintRoute).toBeTruthy()

    // useParams 로 id 추출
    expect(printComponent).toMatch(/useParams/)
    expect(printComponent).toMatch(/params\.id|id\s*=\s*params/)

    // useQuery 로 슬립 상세 조회 재사용 (기존 GET /slips/{id})
    expect(printComponent).toMatch(/useQuery/)
    expect(printComponent).toMatch(/['"`]slip['"`]\s*,\s*id|queryKey.*slip.*id/)
  })

  /**
   * T2 — 인쇄 영역 구조 단언
   *
   * A4 portrait 클래스 (`paper-a4-portrait` 또는 `a4-portrait`) +
   * 헤더 / 거래처 / 라인 테이블 / 합계 / 결재란 / 푸터 6 섹션이
   * 컴포넌트 또는 PrintLayout 에 존재함을 단언한다.
   */
  test('T2: 인쇄 영역 구조 — A4 portrait + 6 섹션 (헤더/거래처/라인테이블/합계/결재란/푸터)', () => {
    const printComponent = read(resolvePrintComponent())
    const printLayout = read(printLayoutPath)

    // A4 portrait 클래스
    const hasA4Portrait =
      printComponent.includes('a4-portrait') ||
      printComponent.includes('paper-a4-portrait') ||
      printLayout.includes('a4-portrait')
    expect(hasA4Portrait).toBeTruthy()

    // 헤더 섹션
    const hasHeader =
      printComponent.includes('header') ||
      printComponent.includes('inbound-header') ||
      printComponent.includes('purchase-header')
    expect(hasHeader).toBeTruthy()

    // 거래처 섹션 (supplier / partner)
    const hasPartnerSection =
      printComponent.includes('inbound-supplier') ||
      printComponent.includes('purchase-partner') ||
      printComponent.includes('partnerName') ||
      printComponent.includes('거래처')
    expect(hasPartnerSection).toBeTruthy()

    // 라인 테이블 (tbody + SlipLineDetail)
    expect(printComponent).toMatch(/tbody|inbound-table|purchase-table/)

    // 합계는 하단 별도 박스가 아니라 라인 테이블 tfoot에만 유지한다.
    const hasTableTotals =
      printComponent.includes('purchase-print-table-totals-label') ||
      printComponent.includes('합계')
    expect(hasTableTotals).toBeTruthy()
    expect(printComponent).not.toContain('purchase-print-totals')
    expect(printComponent).not.toContain('purchase-print-pad-row')
    expect(printComponent).not.toContain('purchase-print-logo')
    expect(printComponent).not.toContain('전표일자')

    // 결재란 (SLIP_INBOUND 설정 구조 기반)
    expect(printComponent).toContain('purchase-print-approval')
    expect(printComponent).toContain('ApprovalRoleCells')
    expect(printComponent).toContain('SLIP_INBOUND')

    // 푸터 섹션
    const hasFooter =
      printComponent.includes('inbound-footer') ||
      printComponent.includes('purchase-footer') ||
      printComponent.includes('footer')
    expect(hasFooter).toBeTruthy()
  })

  /**
   * T3 — 한국어 라벨 단언
   *
   * 입고 전표 인쇄 화면에 필수 한국어 라벨과 결재란 fallback 구조가 존재해야 한다.
   */
  test('T3: 한국어 라벨 — 입고 전표 / 거래처 / 사업자번호 / 입고창고 / 수량 / 단가 / 합계 / 결재란', () => {
    const printComponent = read(resolvePrintComponent())

    // 입고 전표 타이틀 (신규 SP-08-5-5 고유 라벨)
    const hasPurchaseTitle =
      printComponent.includes('입고 전표') ||
      printComponent.includes('매 입 전 표')
    expect(hasPurchaseTitle).toBeTruthy()

    // 거래처 / 공급처
    const hasPartnerLabel =
      printComponent.includes('거래처') || printComponent.includes('공급처')
    expect(hasPartnerLabel).toBeTruthy()

    // 사업자번호 (신규 매입 양식 필수 — 공급자 사업자번호 표기)
    const hasBusinessNo =
      printComponent.includes('사업자번호') ||
      printComponent.includes('businessRegNo') ||
      printComponent.includes('business_reg_no')
    expect(hasBusinessNo).toBeTruthy()

    // 입고창고
    expect(printComponent).toMatch(/입고창고|destinationWarehouse/)

    // 수량
    expect(printComponent).toContain('수량')

    // 단가
    expect(printComponent).toContain('단가')

    // 합계
    expect(printComponent).toContain('합계')

    expect(printComponent).toContain('결 재 란')
    expect(printComponent).toContain('slipType="INBOUND"')
  })

  /**
   * T4 — UUID 비공개 단언
   *
   * 인쇄 화면에서 internal slip.id (UUID) 가 직접 노출되지 않으며,
   * 사용자에게 표시되는 식별자는 slipNo (예: 2026/05/18-1) 만임을 보장.
   *
   * memory feedback_uuid_no_user_visibility.md 준수.
   */
  test('T4: UUID 비공개 — internal id 미노출, slipNo 만 표시', () => {
    const printComponent = read(resolvePrintComponent())

    // slipNo 표시 확인
    expect(printComponent).toContain('slipNo')

    // UUID raw 출력 패턴 미사용 — {slip.id} 또는 {id} 직접 렌더 금지
    expect(printComponent).not.toMatch(/>\s*\{\s*slip\.id\s*\}/)
    expect(printComponent).not.toMatch(/>\s*\{\s*id\s*\}\s*</)

    // data-testid 가 slipNo 기반이거나 UUID 미사용
    const testIdPattern = /data-testid=\{`[^`]*\$\{[\w.]*[Ii][dD]\}`\}/
    if (testIdPattern.test(printComponent)) {
      // testid 에 id 가 있더라도 slipNo 기반이어야 함
      expect(printComponent).toMatch(/data-testid=\{`[^`]*\$\{.*slipNo.*\}`\}/)
    }

    // partnerId UUID 화면 노출 금지
    expect(printComponent).not.toMatch(/>\s*\{\s*slip\.partnerId\s*\}/)
    expect(printComponent).not.toMatch(/>\s*\{\s*slip\.destinationWarehouseId\s*\}/)
  })

  /**
   * T5 — @media print + 인쇄 트리거 단언
   *
   * 인쇄 양식 CSS 에 @media print 규칙이 존재하고,
   * PrintLayout 또는 컴포넌트에서 window.print() 자동 호출 또는
   * 인쇄 버튼이 존재함을 보장한다.
   */
  test('T5: @media print + 인쇄 트리거 — @media print CSS + window.print() 또는 인쇄 버튼', () => {
    const printLayout = read(printLayoutPath)
    const printComponent = read(resolvePrintComponent())
    const printLayoutCss = fileExists('clients/desktop/src/renderer/print/PrintLayout.module.css')
      ? read('clients/desktop/src/renderer/print/PrintLayout.module.css')
      : ''
    const globalCss = fileExists('clients/desktop/src/renderer/styles/global.css')
      ? read('clients/desktop/src/renderer/styles/global.css')
      : ''

    // @media print CSS 규칙 — PrintLayout 에서 공통 처리하거나 컴포넌트 모듈에 존재
    const hasMediaPrint =
      printLayout.includes('@media print') ||
      printComponent.includes('@media print') ||
      printLayoutCss.includes('@media print') ||
      printLayoutCss.includes('@page') ||
      globalCss.includes('@media print') ||
      globalCss.includes('@page')
    expect(hasMediaPrint).toBeTruthy()

    // 인쇄 트리거 — window.print() 자동 호출 또는 인쇄 버튼
    const hasPrintTrigger =
      printLayout.includes('window.print') ||
      printComponent.includes('window.print') ||
      printLayout.includes("'인쇄'") ||
      printLayout.includes('"인쇄"') ||
      printLayout.includes('인쇄') // 버튼 라벨
    expect(hasPrintTrigger).toBeTruthy()

    // PrintLayout 재사용 확인 (공통 shell 계약)
    const usesPrintLayout =
      printComponent.includes('PrintLayout') ||
      printComponent.includes('print-layout') ||
      printComponent.includes('paper-a4-portrait')
    expect(usesPrintLayout).toBeTruthy()
  })
})
