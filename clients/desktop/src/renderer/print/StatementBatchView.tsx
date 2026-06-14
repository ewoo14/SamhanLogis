/**
 * 거래명세서 일괄 인쇄 미리보기 — `/accounting/statements/print?from=&to=`.
 *
 * Phase 10 Step 11 PR-E2 Designer 1차 mock — Samhan Public 이식.
 *
 * <h2>이식 배경 (legacy GAS 4번)</h2>
 * <p>Legacy 구글 앱스 스크립트 (Samhan Public sheet) 의 "거래처별 일괄 거래명세서"
 * 기능을 desktop print view 로 대체한다. legacy 는 거래처마다 별도 PDF 명세서를
 * 생성하여 회계팀이 수동 발송했으나, 본 화면은 거래처별 섹션을 한 React print
 * view 로 묶고 page-break-after 로 거래처당 1페이지 분리 인쇄를 제공한다. 외부
 * 의존 0 — 한 번의 window.print() 호출로 batch 인쇄 완료.
 *
 * <h2>구성 (A4 세로 + page-break per partner)</h2>
 * <p>거래처 1건 = 1 섹션 = 1 페이지. 각 섹션 구조:
 * <ul>
 *   <li>상단: 회사 로고 + "거래명세서" 타이틀 + 발행일</li>
 *   <li>공급자 / 공급받는자 박스</li>
 *   <li>슬립 list 표 (slipDate / slipNo / 품목 / 수량 / 단가 / 공급가액 / 부가세 / 합계)</li>
 *   <li>합계 row + 한글 금액</li>
 *   <li>발행자 sign 영역</li>
 * </ul>
 *
 * <h2>데이터 source (FE 연결 단계)</h2>
 * <p>BE-A10 활성 후 {@code GET /accounting/statements/batch-data?from=&to=}
 * endpoint 로 기간 내 거래 발생 거래처 전체 + 각 거래처별 슬립 list 응답.
 * (PR-E2 FE 단계 활성). 본 1차 mock 단계에서는 데이터 source 미연결 — {@link MOCK_DATA} 사용.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>화면 노출 식별자는 {@code partnerCode} / {@code partnerName} / {@code slipNo} /
 * {@code businessRegNo} 만. UUID 는 useParams 에서 추출하지 않으며, BE 응답에서도
 * partner_id / slip_id 는 제거 대상.
 *
 * <h2>Iteration 가드 (memory feedback_print_design_iteration)</h2>
 * <p>본 1차 mock — 컬럼 / 폭 / 색감 / 사인란 모두 placeholder.
 * 사용자 Edge 캡처 검토 후 2~5차 iteration 으로 미세 조정 예정.
 */
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { stripSlipNoZeros } from '../utils/orderNo'
import { PrintLayout, krw, krDate, toKoreanAmount, calcAmounts } from './PrintLayout'
import { useCompanyProfile } from './useCompanyProfile'
import styles from './StatementBatchView.module.css'

/**
 * 명세서 라인 1행 — mock + BE-A10 응답 형식 (예상).
 *
 * <p>BE-A10 response shape 예상치 (per partner):
 * <pre>
 * {
 *   partnerCode, partnerName, businessRegNo, address, ceo, contactPhone,
 *   slips: [{ slipDate, slipNo, productName, specification, quantity,
 *             unitPrice, supply }]
 * }
 * </pre>
 */
interface StatementLine {
  /** 출고/거래 일자 (YYYY-MM-DD). */
  slipDate: string
  /** 사용자 노출 전표번호. */
  slipNo: string
  /** 품목명 (모델명 + 상품명 결합 가능). */
  productName: string
  /** 규격 (옵션). */
  specification: string
  /** 수량 (정수). */
  quantity: number
  /** 단가 (KRW 정수). */
  unitPrice: number
  /** 라인 공급가액 (KRW 정수, BE 가 quantity * unitPrice 캐시). */
  supply: number
}

/**
 * BE-A10 응답 형식 — 거래처 1건 + 슬립 list.
 */
interface PartnerStatement {
  /** 거래처 코드 (사용자 노출 식별자). */
  partnerCode: string
  /** 거래처명 (snapshot). */
  partnerName: string
  /** 사업자번호 (snapshot). */
  businessRegNo: string
  /** 거래처 주소 (snapshot, 미등록 시 빈 문자열). */
  address: string
  /** 거래처 대표자명 (snapshot). */
  ceo: string
  /** 연락처. */
  contactPhone: string
  /** 슬립 line list (slipDate 오름차순). */
  slips: StatementLine[]
}

/**
 * BE-A10 응답 root — 기간 + 거래처 batch.
 */
interface StatementBatchData {
  /** 기간 시작 (YYYY-MM-DD). */
  periodFrom: string
  /** 기간 종료 (YYYY-MM-DD). */
  periodTo: string
  /** 발행일 (today, YYYY-MM-DD). */
  issueDate: string
  /** 거래처별 명세서 batch (partnerCode 오름차순). */
  partners: PartnerStatement[]
}

/**
 * 1차 mock 데이터 — 거래처 3건 + 거래처당 슬립 2~3건.
 *
 * <p>실제 운영 데이터는 BE-A10 endpoint 가 기간 조건으로 SAVED 슬립 lookup
 * + 거래처 그룹핑 → 응답.
 *
 * <p>본 mock 은 batch 인쇄 시나리오 (거래처 3건 = 3 페이지).
 */
const MOCK_DATA: StatementBatchData = {
  periodFrom: '',
  periodTo: '',
  issueDate: '',
  partners: [
    {
      partnerCode: 'P-00123',
      partnerName: '강남공조㈜',
      businessRegNo: '120-81-23456',
      address: '서울특별시 강남구 테헤란로 152',
      ceo: '김강남',
      contactPhone: '02-555-0101',
      slips: [
        {
          slipDate: '2026-05-02',
          slipNo: '2026/05/02-14',
          productName: 'AJ040RXH4BC1 (시스템 에어컨)',
          specification: '4kW / 220V',
          quantity: 5,
          unitPrice: 690_000,
          supply: 3_450_000,
        },
        {
          slipDate: '2026-05-09',
          slipNo: '2026/05/09-7',
          productName: 'AJ052NXJ4FH1 (멀티)',
          specification: '5.2kW / 380V',
          quantity: 2,
          unitPrice: 935_000,
          supply: 1_870_000,
        },
        {
          slipDate: '2026-05-15',
          slipNo: '2026/05/15-22',
          productName: 'AVXC4H145EE (실외기)',
          specification: '14.5kW',
          quantity: 1,
          unitPrice: 2_640_000,
          supply: 2_640_000,
        },
      ],
    },
    {
      partnerCode: 'P-00456',
      partnerName: '역삼냉동',
      businessRegNo: '124-81-34567',
      address: '서울특별시 강남구 역삼동 736-12',
      ceo: '박역삼',
      contactPhone: '02-555-0202',
      slips: [
        {
          slipDate: '2026-05-08',
          slipNo: '2026/05/08-18',
          productName: 'AJ052NXJ4FH1',
          specification: '5.2kW / 380V',
          quantity: 3,
          unitPrice: 935_000,
          supply: 2_805_000,
        },
        {
          slipDate: '2026-05-22',
          slipNo: '2026/05/22-29',
          productName: 'AJ080RBJ5KH (시스템 에어컨)',
          specification: '8kW / 220V',
          quantity: 4,
          unitPrice: 1_120_000,
          supply: 4_480_000,
        },
      ],
    },
    {
      partnerCode: 'P-01024',
      partnerName: '수원에어시스템',
      businessRegNo: '134-81-45678',
      address: '경기도 수원시 영통구 광교로 145',
      ceo: '이수원',
      contactPhone: '031-555-0303',
      slips: [
        {
          slipDate: '2026-05-12',
          slipNo: '2026/05/12-19',
          productName: 'AJ040RXH4BC1',
          specification: '4kW / 220V',
          quantity: 8,
          unitPrice: 690_000,
          supply: 5_520_000,
        },
        {
          slipDate: '2026-05-25',
          slipNo: '2026/05/25-27',
          productName: 'AVXC4H145EE',
          specification: '14.5kW',
          quantity: 2,
          unitPrice: 2_640_000,
          supply: 5_280_000,
        },
      ],
    },
  ],
}

/**
 * 기간 query string 정규화 — 미지정 시 당월 1일 ~ 말일 fallback.
 *
 * @param iso 사용자가 query string 으로 전달한 날짜 (YYYY-MM-DD).
 * @param mode 'from' = 당월 1일 / 'to' = 당월 말일
 */
function resolvePeriodDate(
  iso: string | null | undefined,
  mode: 'from' | 'to',
): string {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth()
  const target = mode === 'from' ? new Date(y, m, 1) : new Date(y, m + 1, 0)
  const yy = target.getFullYear()
  const mm = String(target.getMonth() + 1).padStart(2, '0')
  const dd = String(target.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * today (YYYY-MM-DD) — 발행일 기본값.
 */
function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function StatementBatchView() {
  const [searchParams] = useSearchParams()
  const periodFrom = useMemo(
    () => resolvePeriodDate(searchParams.get('from'), 'from'),
    [searchParams],
  )
  const periodTo = useMemo(
    () => resolvePeriodDate(searchParams.get('to'), 'to'),
    [searchParams],
  )
  const issueDate = useMemo(() => todayIso(), [])

  // PR-E2 FE 단계에서 useQuery 로 교체 — 본 mock 단계는 정적 데이터.
  const data: StatementBatchData = useMemo(
    () => ({ ...MOCK_DATA, periodFrom, periodTo, issueDate }),
    [periodFrom, periodTo, issueDate],
  )

  const { company } = useCompanyProfile()

  usePageTitle(
    '거래명세서 일괄',
    `${data.partners.length}개 거래처`,
  )

  return (
    <PrintLayout paper="a4-portrait" backTo="/accounting">
      <div data-testid="statement-batch-print-area">
        {data.partners.length === 0 ? (
          <div className={styles.empty}>
            해당 기간 거래 발생 거래처가 없습니다.
          </div>
        ) : (
          data.partners.map((partner, partnerIdx) => {
            const totalSupply = partner.slips.reduce((s, l) => s + l.supply, 0)
            const { supply, vat, total } = calcAmounts(totalSupply)
            const isLast = partnerIdx === data.partners.length - 1
            return (
              <section
                key={partner.partnerCode}
                className={`${styles.page} ${
                  isLast ? '' : styles.pageBreak
                }`}
              >
                {/* 상단 헤더 — 회사 표기 + 타이틀 + 발행일 */}
                <header className={styles.header}>
                  <div className={styles.brand}>{company.legalName}</div>
                  <h1 className={styles.title}>거래명세서</h1>
                  <div className={styles.metaRow}>
                    <span>발행일: {krDate(data.issueDate)}</span>
                    <span>
                      기간: {krDate(data.periodFrom)} ~ {krDate(data.periodTo)}
                    </span>
                  </div>
                </header>

                {/* 공급자 / 공급받는자 박스 */}
                <div className={styles.partyRow}>
                  <table className={styles.partyTable}>
                    <thead>
                      <tr>
                        <th colSpan={2} className={styles.partyHeader}>
                          공급자
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>상호</th>
                        <td>{company.legalName}</td>
                      </tr>
                      <tr>
                        <th>대표자</th>
                        <td>{company.ceo}</td>
                      </tr>
                      <tr>
                        <th>사업자번호</th>
                        <td className={styles.num}>{company.businessRegNo}</td>
                      </tr>
                      <tr>
                        <th>주소</th>
                        <td>{company.address}</td>
                      </tr>
                      <tr>
                        <th>TEL</th>
                        <td className={styles.num}>{company.tel}</td>
                      </tr>
                    </tbody>
                  </table>

                  <table className={styles.partyTable}>
                    <thead>
                      <tr>
                        <th colSpan={2} className={styles.partyHeader}>
                          공급받는자
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>상호</th>
                        <td>
                          {partner.partnerName}
                          <span className={styles.partnerCode}>
                            ({partner.partnerCode})
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <th>대표자</th>
                        <td>{partner.ceo || '-'}</td>
                      </tr>
                      <tr>
                        <th>사업자번호</th>
                        <td className={styles.num}>
                          {partner.businessRegNo || '-'}
                        </td>
                      </tr>
                      <tr>
                        <th>주소</th>
                        <td>{partner.address || '-'}</td>
                      </tr>
                      <tr>
                        <th>TEL</th>
                        <td className={styles.num}>
                          {partner.contactPhone || '-'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 합계 한글 금액 (요약) */}
                <div className={styles.amountSummary}>
                  <span className={styles.amountLabel}>합계금액</span>
                  <span className={styles.amountKorean}>
                    {toKoreanAmount(total)}
                  </span>
                  <span className={styles.amountNumber}>(₩ {krw(total)})</span>
                </div>

                {/* 슬립 list 표 */}
                {partner.slips.length === 0 ? (
                  <div className={styles.empty}>
                    해당 기간 거래 내역이 없습니다.
                  </div>
                ) : (
                  <table className={styles.slipTable}>
                    <thead>
                      <tr>
                        <th className={styles.colNo}>No.</th>
                        <th className={styles.colDate}>일자</th>
                        <th className={styles.colSlipNo}>전표번호</th>
                        <th className={styles.colItem}>품목</th>
                        <th className={styles.colSpec}>규격</th>
                        <th className={styles.colQty}>수량</th>
                        <th className={styles.colPrice}>단가</th>
                        <th className={styles.colSupply}>공급가액</th>
                        <th className={styles.colVat}>부가세</th>
                        <th className={styles.colTotal}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partner.slips.map((line, idx) => {
                        const lineVat = Math.floor(line.supply * 0.1)
                        const lineTotal = line.supply + lineVat
                        return (
                          <tr key={`${line.slipNo}-${idx}`}>
                            <td className={styles.colNo}>{idx + 1}</td>
                            <td className={styles.dateCell}>{line.slipDate}</td>
                            <td className={styles.slipNoCell}>
                              {stripSlipNoZeros(line.slipNo)}
                            </td>
                            <td className={styles.itemCell}>
                              {line.productName}
                            </td>
                            <td className={styles.specCell}>
                              {line.specification || '-'}
                            </td>
                            <td className={`${styles.num} ${styles.qtyCell}`}>
                              {line.quantity.toLocaleString('ko-KR')}
                            </td>
                            <td className={styles.num}>
                              {krw(line.unitPrice)}
                            </td>
                            <td className={styles.num}>{krw(line.supply)}</td>
                            <td className={styles.num}>{krw(lineVat)}</td>
                            <td
                              className={`${styles.num} ${styles.totalCell}`}
                            >
                              {krw(lineTotal)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className={styles.totalRow}>
                        <td colSpan={7} className={styles.totalLabel}>
                          합계
                        </td>
                        <td className={`${styles.num} ${styles.strong}`}>
                          {krw(supply)}
                        </td>
                        <td className={`${styles.num} ${styles.strong}`}>
                          {krw(vat)}
                        </td>
                        <td
                          className={`${styles.num} ${styles.strong} ${styles.totalCell}`}
                        >
                          {krw(total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}

                {/* 사인 영역 */}
                <footer className={styles.footer}>
                  <div className={styles.signBox}>
                    <div className={styles.signLabel}>발행자</div>
                    <div className={styles.signValue}>
                      <span>{company.legalName}</span>
                      <span className={styles.seal}>[직인]</span>
                    </div>
                  </div>
                  <div className={styles.signBox}>
                    <div className={styles.signLabel}>인수자</div>
                    <div className={styles.signValue}>
                      <span>&nbsp;</span>
                      <span className={styles.seal}>[인]</span>
                    </div>
                  </div>
                </footer>
              </section>
            )
          })
        )}
      </div>
    </PrintLayout>
  )
}
