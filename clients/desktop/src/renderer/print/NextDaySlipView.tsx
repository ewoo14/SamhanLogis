/**
 * 내일자 전표 인쇄 미리보기 — `/sales/next-day/print?date=YYYY-MM-DD`.
 *
 * Phase 10 Step 10 PR-E1 Designer 1차 mock — Samhan Public 이식.
 *
 * <h2>이식 배경 (legacy GAS 6번)</h2>
 * <p>Legacy 구글 앱스 스크립트 (Samhan Public sheet) 의 "내일자 전표 이미지 생성"
 * 기능을 desktop print view 로 대체한다. legacy 는 단톡방별로 별도 PNG 를
 * 생성하여 영업/배차 담당자가 카카오톡 단톡방에 수동 공유했으나, 본 화면은
 * 한 페이지에 단톡방 섹션을 분리 렌더링하고 {@code window.print()} native +
 * page-break-after 옵션으로 단톡방별 분리 인쇄를 제공한다. 외부 의존 0.
 *
 * <h2>구성 (A4 세로)</h2>
 * <ul>
 *   <li>상단: 회사 표기 ((주)삼한공조시스템) + "내일자 전표" 타이틀 + 다음날 일자</li>
 *   <li>본문: 단톡방별 섹션 (sectionHeader + 거래처/슬립 표 + 빈 안내)</li>
 *   <li>하단: 발송금지 거래처 자동 제외 안내 + 발행자 footer</li>
 * </ul>
 *
 * <h2>데이터 source (FE 연결 단계)</h2>
 * <p>BE-1 BE-A5 commit 의 {@code GET /slips/next-day-image-data?date=YYYY-MM-DD}
 * endpoint 가 출고전표 + 거래처 + 단톡방 매핑 + 발송금지 + 지역 분류를 응답
 * 형식으로 묶어 반환한다 (PR-E2 BE-A9 후속 활성화). 본 1차 mock 단계에서는
 * 데이터 source 미연결 — {@link MOCK_DATA} 를 사용한다.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>화면 노출 식별자는 {@code slipNo} / {@code partnerCode} / {@code partnerName} /
 * {@code chatRoomName} 만. UUID 는 useParams 에서 추출하지 않으며, 필요 시
 * mutation key 전용 (현재 본 view 는 read-only).
 *
 * <h2>Iteration 가드 (memory feedback_print_design_iteration)</h2>
 * <p>본 1차 mock — 단톡방별 컬럼 / 폭 / 색감 모두 placeholder.
 * 사용자 Edge 캡처 검토 후 2~5차 iteration 으로 미세 조정 예정.
 */
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { PrintLayout, COMPANY, krDate } from './PrintLayout'
import styles from './NextDaySlipView.module.css'

/**
 * 한 단톡방 내 배송 라인 — mock + BE-A5 응답 형식 (예상).
 *
 * <p>BE-A5 response shape 예상치:
 * <pre>
 * {
 *   chatRoomName: string,
 *   rows: [{ slipNo, partnerCode, partnerName, address, item, qty, deliveryTime }]
 * }
 * </pre>
 */
interface NextDaySlipRow {
  /** 사용자 노출 전표번호 (예: 2026/05/10-1). */
  slipNo: string
  /** 거래처 코드 (사용자 노출 식별자 — UUID 비공개 가드). */
  partnerCode: string
  /** 거래처명 (snapshot — 인쇄 양식 표시용). */
  partnerName: string
  /** 배송지 주소 (요약 — full 주소는 출고전표 상세 참조). */
  address: string
  /** 품목 요약 (예: "AJ040RXH4BC1 외 2종"). */
  item: string
  /** 수량 (총 수량 합계). */
  qty: number
  /** 약속 시간 (HH:mm — 미정 시 "-"). */
  deliveryTime: string
}

interface NextDaySlipChatRoom {
  /** 단톡방명 (사용자 노출 — chat-rooms admin 매핑 결과). */
  chatRoomName: string
  rows: NextDaySlipRow[]
}

/**
 * BE-A5 응답 형식 — 1차 mock 단계 placeholder.
 */
interface NextDaySlipImageData {
  /** 다음날 일자 (YYYY-MM-DD). */
  targetDate: string
  /** 단톡방별 그룹. */
  chatRooms: NextDaySlipChatRoom[]
  /** 발송금지 거래처 자동 제외 건수 (BE 가 BLOCK 매핑 후 응답 시 포함). */
  blockedExcludedCount: number
}

/**
 * 1차 mock 데이터 — 단톡방 3건 (서울/경기/지방) + 발송금지 제외 2건.
 *
 * <p>실제 운영 데이터는 BE-A5 endpoint 가 출고전표 SAVED 상태 + slip_date = 다음날
 * 조건으로 lookup 후 chat-rooms 매핑 적용 → BLOCK 자동 제외 → 응답.
 *
 * <p>본 mock 은 전형적 운영 시나리오 (단톡방당 3~5 거래처, 1~3 라인 / 거래처).
 */
const MOCK_DATA: NextDaySlipImageData = {
  targetDate: '',
  chatRooms: [
    {
      chatRoomName: '서울 강남 단톡방',
      rows: [
        {
          slipNo: '2026/05/10-1',
          partnerCode: 'P-00123',
          partnerName: '강남공조㈜',
          address: '서울 강남구 테헤란로 152',
          item: 'AJ040RXH4BC1 외 2종',
          qty: 5,
          deliveryTime: '09:30',
        },
        {
          slipNo: '2026/05/10-2',
          partnerCode: 'P-00456',
          partnerName: '역삼냉동',
          address: '서울 강남구 역삼동 736-12',
          item: 'AJ052NXJ4FH1',
          qty: 2,
          deliveryTime: '11:00',
        },
        {
          slipNo: '2026/05/10-3',
          partnerCode: 'P-00789',
          partnerName: '대치설비',
          address: '서울 강남구 대치동 945',
          item: 'AVXC4H145EE 외 1종',
          qty: 3,
          deliveryTime: '14:30',
        },
      ],
    },
    {
      chatRoomName: '경기 남부 단톡방',
      rows: [
        {
          slipNo: '2026/05/10-4',
          partnerCode: 'P-01024',
          partnerName: '수원에어시스템',
          address: '경기 수원시 영통구 광교로 145',
          item: 'AJ080RBJ5KH 외 4종',
          qty: 8,
          deliveryTime: '10:00',
        },
        {
          slipNo: '2026/05/10-5',
          partnerCode: 'P-01155',
          partnerName: '용인냉난방',
          address: '경기 용인시 처인구 김량장동 232',
          item: 'AJ052NXJ4FH1',
          qty: 1,
          deliveryTime: '-',
        },
      ],
    },
    {
      chatRoomName: '충청 지방 단톡방',
      rows: [
        {
          slipNo: '2026/05/10-6',
          partnerCode: 'P-02001',
          partnerName: '천안공조설비',
          address: '충남 천안시 동남구 신부동 451',
          item: 'AJ040RXH4BC1',
          qty: 4,
          deliveryTime: '13:00',
        },
      ],
    },
  ],
  blockedExcludedCount: 2,
}

/**
 * 다음날 일자 (YYYY-MM-DD) 계산 — query string 미지정 시 today + 1 fallback.
 *
 * <p>local 시간 기준 — 운영 환경 (한국) 만 가정 (KST = UTC+9). UTC 변환 미수행.
 *
 * @param iso 사용자가 query string 으로 전달한 날짜 (YYYY-MM-DD). 미지정 시 undefined.
 * @return YYYY-MM-DD 형식 date string
 */
function resolveTargetDate(iso: string | null | undefined): string {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 단톡방별 합계 (거래처 수 + 라인 합계 수량) — 섹션 헤더 우측 표시.
 */
function chatRoomMeta(room: NextDaySlipChatRoom): string {
  const partners = room.rows.length
  const totalQty = room.rows.reduce((s, r) => s + r.qty, 0)
  return `거래처 ${partners}건 / 총 ${totalQty.toLocaleString('ko-KR')}수량`
}

interface NextDaySlipViewProps {
  /**
   * 단톡방별 분리 인쇄 — true 일 경우 각 섹션을 별도 페이지로 인쇄.
   * legacy GAS 의 단톡방당 PNG 1장 출력 컨셉을 page-break-after 로 재현.
   *
   * <p>본 1차 mock 의 기본값은 false (한 페이지에 모든 단톡방 표시) — 사용자
   * Edge 캡처 검토 후 토글 UI 추가 여부 결정 (PR-E2 FE 단계).
   */
  pageBreakPerRoom?: boolean
}

export function NextDaySlipView({ pageBreakPerRoom = false }: NextDaySlipViewProps = {}) {
  const [searchParams] = useSearchParams()
  const targetDate = useMemo(
    () => resolveTargetDate(searchParams.get('date')),
    [searchParams],
  )

  // PR-E2 BE-A9 활성 후 useQuery 로 교체 — 본 mock 단계는 정적 데이터.
  const data: NextDaySlipImageData = useMemo(
    () => ({ ...MOCK_DATA, targetDate }),
    [targetDate],
  )

  usePageTitle('내일자 전표', krDate(targetDate))

  const totalSlipCount = data.chatRooms.reduce((s, r) => s + r.rows.length, 0)

  return (
    <PrintLayout paper="a4-portrait" backTo="/sales">
      <div className={styles.page} data-testid="next-day-slip-print-area">
        <header className={styles.header}>
          <div className={styles.brand}>{COMPANY.legalName}</div>
          <h1 className={styles.title}>내일자 전표</h1>
          <div className={styles.targetDate}>{krDate(targetDate)}</div>
          <div className={styles.metaRow}>
            <span>단톡방 {data.chatRooms.length}건</span>
            <span>전표 합계 {totalSlipCount.toLocaleString('ko-KR')}건</span>
          </div>
        </header>

        {data.chatRooms.length === 0 ? (
          <div className={styles.empty}>다음날 출고 예정 전표가 없습니다.</div>
        ) : (
          data.chatRooms.map((room) => (
            <section
              key={room.chatRoomName}
              className={`${styles.section} ${
                pageBreakPerRoom ? styles.sectionPageBreak : ''
              }`}
            >
              <header className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{room.chatRoomName}</h2>
                <span className={styles.sectionMeta}>{chatRoomMeta(room)}</span>
              </header>

              {room.rows.length === 0 ? (
                <div className={styles.empty}>해당 단톡방의 다음날 전표가 없습니다.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.colPartner}>거래처</th>
                      <th className={styles.colAddress}>주소</th>
                      <th className={styles.colItem}>품목</th>
                      <th className={styles.colQty}>수량</th>
                      <th className={styles.colTime}>시간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {room.rows.map((row) => (
                      <tr key={row.slipNo}>
                        <td className={styles.partnerCell}>
                          {row.partnerName}
                          <span className={styles.partnerCode}>{row.partnerCode}</span>
                        </td>
                        <td className={styles.addressCell}>{row.address}</td>
                        <td className={styles.itemCell}>{row.item}</td>
                        <td className={styles.qtyCell}>
                          {row.qty.toLocaleString('ko-KR')}
                        </td>
                        <td className={styles.timeCell}>{row.deliveryTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))
        )}

        <footer className={styles.footer}>
          <span className={styles.blockedNote}>
            ※ 발송금지 거래처 {data.blockedExcludedCount.toLocaleString('ko-KR')}건 자동 제외
          </span>
          <span>발행: {COMPANY.legalName}</span>
        </footer>
      </div>
    </PrintLayout>
  )
}
