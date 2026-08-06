/**
 * 거래처별 원장 인쇄 미리보기 — `/accounting/ledger/print?partnerCode=&from=&to=`.
 *
 * Phase 10 Step 11 PR-E2 Designer 1차 mock — Samhan Public 이식.
 *
 * <h2>이식 배경 (legacy GAS 3번)</h2>
 * <p>Legacy 구글 앱스 스크립트 (Samhan Public sheet) 의 "거래처별 원장생성" 기능을
 * desktop print view 로 대체한다. legacy 는 거래처 1건당 PNG 원장 이미지를 생성하여
 * 회계팀이 수동 보관/공유했으나, 본 화면은 React print view + window.print() native
 * 로 거래처별 원장을 즉시 인쇄한다. 외부 의존 0.
 *
 * <h2>구성 (A4 세로)</h2>
 * <ul>
 *   <li>상단: 회사 표기 ((주)삼한공조시스템) + "거래처 원장" 타이틀 + 기간 (from~to)</li>
 *   <li>거래처 정보 박스: 사업자번호 + 거래처명 + 단톡방</li>
 *   <li>본문: 분개 line 표 (date / slipNo / 적요 / 차변 / 대변 / 잔액)</li>
 *   <li>합계 row: 차변 합계 / 대변 합계 / 기말 잔액</li>
 *   <li>하단: 발행자 footer</li>
 * </ul>
 *
 * <h2>데이터 source (FE 연결 단계)</h2>
 * <p>BE-A9 활성 후 {@code GET /accounting/journals/ledger-data?partnerCode=&from=&to=}
 * endpoint 로 거래처별 분개 line + 잔액 합산 결과를 응답받는다 (PR-E2 FE 단계 활성).
 * 본 1차 mock 단계에서는 데이터 source 미연결 — {@link MOCK_DATA} 를 사용한다.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>화면 노출 식별자는 {@code businessRegNo} / {@code partnerName} / {@code slipNo} /
 * {@code businessRegNo} / {@code chatRoomName} 만. UUID 는 useParams 에서
 * 추출하지 않으며, BE 응답에서도 partner_id 는 제거 대상.
 *
 * <h2>Iteration 가드 (memory feedback_print_design_iteration)</h2>
 * <p>본 1차 mock — 컬럼 / 폭 / 색감 모두 placeholder.
 * 사용자 Edge 캡처 검토 후 2~5차 iteration 으로 미세 조정 예정.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { PrintLayout, krw, krDate } from './PrintLayout'
import { useCompanyProfile } from './useCompanyProfile'
import { getLedgerData, mapLedgerSnapshotResponse, restoreLedger, type LedgerData } from '../api/partnerLedgerApi'
import styles from './PartnerLedgerView.module.css'

/**
 * 분개 line 1행 — mock + BE-A9 응답 형식 (예상).
 *
 * <p>BE-A9 response shape 예상치 (per partner):
 * <pre>
 * {
 *   partnerCode, partnerName, businessRegNo, chatRoomName, periodFrom, periodTo,
 *   openingBalance, lines: [{ date, slipNo, description, debit, credit, balance }],
 *   totalDebit, totalCredit, closingBalance
 * }
 * </pre>
 */
interface LedgerLine {
  /** 분개 일자 (YYYY-MM-DD). */
  date: string
  /** 사용자 노출 전표/분개 번호 (예: 2026/05/09-7 또는 2026/05/05-1). */
  slipNo: string
  /** 적요 (분개 헤더 description 또는 슬립 메모). */
  description: string
  /** 차변 금액 (KRW 정수). 0 이면 대변 row. */
  debit: number
  /** 대변 금액 (KRW 정수). 0 이면 차변 row. */
  credit: number
  /** 누적 잔액 (KRW 정수, 음수 가능). BE 가 라인 순서대로 누적 계산. */
  balance: number
  /** 구조화된 배송주소. 적요에서 파싱하지 않는다. */
  deliveryAddress?: string | null
  documentType?: string
  effect?: 'SALE' | 'PAYMENT' | 'ADJUSTMENT' | 'NONE'
}

/**
 * BE-A9 응답 형식 — 1차 mock 단계 placeholder.
 */
interface PartnerLedgerData {
  /** 내부 partnerCode. 조회 query key 로만 사용하고 화면에는 표시하지 않는다. */
  partnerCode: string
  /** 거래처명 (snapshot — 인쇄 양식 표시용). */
  partnerName: string
  /** 사업자번호 (snapshot, 미등록 거래처는 빈 문자열). */
  businessRegNo: string
  /** 거래처에 매핑된 단톡방명 (notification-service mapping 결과). 미매핑 시 "-". */
  chatRoomName: string
  /** 기간 시작 (YYYY-MM-DD). */
  periodFrom: string
  /** 기간 종료 (YYYY-MM-DD). */
  periodTo: string
  /** 기초 잔액 (전월 이월). KRW 정수, 음수 가능. */
  openingBalance: number
  /** 분개 line 목록 (date 오름차순 → slipNo 오름차순). */
  lines: LedgerLine[]
  /** 차변 합계 (BE 캐시). */
  totalDebit: number
  /** 대변 합계 (BE 캐시). */
  totalCredit: number
  /** 기말 잔액 = openingBalance + totalDebit - totalCredit (대변 계정 기준 부호 반전 가능). */
  closingBalance: number
}

/**
 * 1차 mock 데이터 — 거래처 1건 + 분개 line 6건 + 기초/기말 잔액.
 *
 * <p>실제 운영 데이터는 BE-A9 endpoint 가 partnerCode + period 조건으로 분개 line lookup
 * + opening balance 계산 + closing balance 합산 → 응답.
 *
 * <p>본 mock 은 전형적 운영 시나리오 (월간 거래처 6~10 line, 기초 잔액 + 매출/입금 mix).
 */
const _MOCK_DATA: PartnerLedgerData = {
  partnerCode: 'P-00123',
  partnerName: '강남공조㈜',
  businessRegNo: '120-81-23456',
  chatRoomName: '서울 강남 단톡방',
  periodFrom: '',
  periodTo: '',
  openingBalance: 1_250_000,
  lines: [
    {
      date: '2026-05-02',
      slipNo: '2026/05/02-14',
      description: '에어컨 출고 (AJ040RXH4BC1 외 2종)',
      debit: 3_450_000,
      credit: 0,
      balance: 4_700_000,
    },
    {
      date: '2026-05-05',
      slipNo: '2026/05/05-1',
      description: '입금 — 보통예금 (신한)',
      debit: 0,
      credit: 2_000_000,
      balance: 2_700_000,
    },
    {
      date: '2026-05-09',
      slipNo: '2026/05/09-7',
      description: '에어컨 출고 (AJ052NXJ4FH1)',
      debit: 1_870_000,
      credit: 0,
      balance: 4_570_000,
    },
    {
      date: '2026-05-15',
      slipNo: '2026/05/15-22',
      description: '실외기 출고 (AVXC4H145EE 외 1종)',
      debit: 2_640_000,
      credit: 0,
      balance: 7_210_000,
    },
    {
      date: '2026-05-20',
      slipNo: '2026/05/20-1',
      description: '입금 — 보통예금 (신한)',
      debit: 0,
      credit: 5_000_000,
      balance: 2_210_000,
    },
    {
      date: '2026-05-28',
      slipNo: '2026/05/28-31',
      description: '냉난방기 출고 (AJ080RBJ5KH 외 4종)',
      debit: 4_120_000,
      credit: 0,
      balance: 6_330_000,
    },
  ],
  totalDebit: 12_080_000,
  totalCredit: 7_000_000,
  closingBalance: 6_330_000,
}

/**
 * 기간 query string 정규화 — query string 미지정 시 당월 1일 ~ 말일 fallback.
 *
 * <p>local 시간 기준 — 운영 환경 (한국) 만 가정 (KST = UTC+9).
 *
 * @param iso 사용자가 query string 으로 전달한 날짜 (YYYY-MM-DD). 미지정 시 undefined.
 * @param mode 'from' = 당월 1일 / 'to' = 당월 말일
 * @return YYYY-MM-DD 형식 date string
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
 * 잔액 표시 헬퍼 — 음수 시 △ prefix (한국 회계 관행).
 */
function formatBalance(n: number): string {
  if (n === 0) return '—'
  if (n < 0) return `-${krw(Math.abs(n))}`
  return krw(n)
}

export function PartnerLedgerView({ partnerCode }: { partnerCode?: string } = {}) {
  const [searchParams] = useSearchParams()
  const partnerCodeParam = partnerCode ?? searchParams.get('partnerCode')
  const batchNoParam = searchParams.get('batchNo')
  const periodFrom = useMemo(
    () => resolvePeriodDate(searchParams.get('from'), 'from'),
    [searchParams],
  )
  const periodTo = useMemo(
    () => resolvePeriodDate(searchParams.get('to'), 'to'),
    [searchParams],
  )

  const ledgerQuery = useQuery<LedgerData>({
    queryKey: ['partner-ledger-print', partnerCodeParam, periodFrom, periodTo, batchNoParam ?? ''],
    queryFn: async () => batchNoParam
      ? mapLedgerSnapshotResponse((await restoreLedger(batchNoParam)).ledger!)
      : getLedgerData(partnerCodeParam ?? '', periodFrom, periodTo),
    enabled: Boolean(partnerCodeParam),
  })
  const data: PartnerLedgerData | null = useMemo(() => {
    if (!ledgerQuery.data) return null
    const source = ledgerQuery.data
    const lines = source.lines.map((line) => ({
      date: line.date,
      slipNo: line.journalNo,
      description: line.description,
      debit: Number(line.debit) || 0,
      credit: Number(line.credit) || 0,
      balance: Number(line.balance) || 0,
      deliveryAddress: line.deliveryAddress,
      documentType: line.documentType,
      effect: line.effect,
    }))
    return {
      partnerCode: source.partnerCode,
      partnerName: source.partnerName,
      businessRegNo: source.partnerBusinessNo,
      chatRoomName: source.chatRoomNames.join(' / '),
      periodFrom: source.periodFrom,
      periodTo: source.periodTo,
      openingBalance: Number(source.openingBalance) || 0,
      lines,
      totalDebit: lines.reduce((sum, line) => sum + line.debit, 0),
      totalCredit: lines.reduce((sum, line) => sum + line.credit, 0),
      closingBalance: Number(source.closingBalance ?? lines.at(-1)?.balance ?? source.openingBalance) || 0,
    }
  }, [ledgerQuery.data])

  const { company } = useCompanyProfile()

  usePageTitle('거래처 원장', data?.partnerName ?? '거래처 원장')

  if (!data) {
    return <div data-testid="partner-ledger-print-area">{ledgerQuery.isError ? '원장을 불러오지 못했습니다.' : '원장을 불러오는 중입니다.'}</div>
  }

  return (
    <PrintLayout paper="a4-portrait" backTo="/accounting">
      <div className={styles.page} data-testid="partner-ledger-print-area">
        <header className={styles.header}>
          <div className={styles.brand}>{company.legalName}</div>
          <h1 className={styles.title}>거래처 원장</h1>
          <div className={styles.period}>
            기간: {krDate(data.periodFrom)} ~ {krDate(data.periodTo)}
          </div>
        </header>

        {/* 거래처 정보 박스 */}
        <section className={styles.partnerBox}>
          <table className={styles.partnerTable}>
            <tbody>
              <tr>
                <th>거래처</th>
                <td className={styles.partnerName}>
                  {data.partnerName}
                </td>
                <th>사업자번호</th>
                <td className={styles.num}>{data.businessRegNo || '-'}</td>
              </tr>
              <tr>
                <th>단톡방</th>
                <td colSpan={3}>{data.chatRoomName || '-'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 분개 line 표 */}
        {data.lines.length === 0 ? (
          <div className={styles.empty}>해당 기간 거래 내역이 없습니다.</div>
        ) : (
          <table className={styles.ledgerTable}>
            <thead>
              <tr>
                <th className={styles.colDate}>일자</th>
                <th className={styles.colSlipNo}>분개번호</th>
                <th>구분</th>
                <th>배송주소</th>
                <th className={styles.colDesc}>적요</th>
                <th className={styles.colDebit}>차변</th>
                <th className={styles.colCredit}>대변</th>
                <th className={styles.colBalance}>잔액</th>
              </tr>
            </thead>
            <tbody>
              {/* 기초 잔액 row */}
              <tr className={styles.openingRow}>
                <td colSpan={5} className={styles.openingLabel}>
                  [기초 잔액 — {krDate(data.periodFrom)} 이전]
                </td>
                <td className={styles.num}>-</td>
                <td className={styles.num}>-</td>
                <td className={`${styles.num} ${styles.balanceCell}`} style={{ color: data.openingBalance < 0 ? '#DC2626' : undefined }}>
                  {formatBalance(data.openingBalance)}
                </td>
              </tr>

              {data.lines.map((line, idx) => (
                <tr key={`${line.date}-${line.slipNo}-${idx}`}>
                  <td className={styles.dateCell}>{line.date}</td>
                  <td className={styles.slipNoCell}>{line.slipNo}</td>
                  <td>{line.effect === 'PAYMENT' ? '수금' : line.effect === 'ADJUSTMENT' ? '조정' : '매출'}</td>
                  <td>{line.deliveryAddress || '—'}</td>
                  <td className={styles.descCell}>
                    {line.description}
                  </td>
                  <td className={`${styles.num} ${styles.debitCell}`} style={{ color: line.debit < 0 ? '#DC2626' : undefined }}>
                    {formatBalance(line.debit)}
                  </td>
                  <td className={`${styles.num} ${styles.creditCell}`} style={{ color: line.credit < 0 ? '#DC2626' : undefined }}>
                    {formatBalance(line.credit)}
                  </td>
                  <td className={`${styles.num} ${styles.balanceCell}`} style={{ color: line.balance < 0 ? '#DC2626' : undefined }}>
                    {formatBalance(line.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tbody className={styles.summaryBody} data-testid="partner-ledger-print-summary">
              <tr className={styles.totalRow}>
                <td colSpan={5} className={styles.totalLabel}>
                  합계
                </td>
                <td className={`${styles.num} ${styles.debitCell} ${styles.strong}`}>
                  {formatBalance(data.totalDebit)}
                </td>
                <td className={`${styles.num} ${styles.creditCell} ${styles.strong}`}>
                  {formatBalance(data.totalCredit)}
                </td>
                <td className={`${styles.num} ${styles.balanceCell} ${styles.strong}`}>
                  {formatBalance(0)}
                </td>
              </tr>
              <tr className={styles.closingRow}>
                <td colSpan={6} className={styles.closingLabel}>
                  기말 잔액 ({krDate(data.periodTo)} 기준)
                </td>
                <td className={`${styles.num} ${styles.balanceCell} ${styles.strong}`} style={{ color: data.closingBalance < 0 ? '#DC2626' : undefined }}>
                  {formatBalance(data.closingBalance)}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        <footer className={styles.footer}>
          <span>발행: {company.legalName}</span>
          <span className={styles.issuer}>
            사업자번호 {company.businessRegNo} / 대표 {company.ceo}
          </span>
        </footer>
      </div>
    </PrintLayout>
  )
}
