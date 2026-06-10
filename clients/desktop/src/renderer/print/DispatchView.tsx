/**
 * 출고전표 작업지시서 인쇄 미리보기 — `/sales/:id/print/dispatch`.
 *
 * PR #21 hotfix v2 — 개발책임자 첨부 이미지 기준 큰 재디자인.
 *
 * 2026-06-10 원본 양식 정렬 (개발책임자 샘플 이미지 재첨부 — docs/sample, 비커밋):
 * - 라인 표 4-col = 월/일 / 품목명(모델명+품목명 결합) / 규격 / 수량 — PR #21 의
 *   "월/일 열 제거" 결정을 원본 양식 반영 지시가 대체.
 * - 결재란 마지막 칸 "결 제" + 발행일 MMDD 표시 (샘플 '0610').
 * - 품목 다량 시 한 A4 자동 비율 축소 (useFitOneA4).
 *
 * 변경 요점 (PR #21 당시):
 * - 라인 표 4-col (모델명/품목명/규격/수량) — 월/일 열 제거 (사용자 명시)
 * - 헤더: SAMSUNG 로고 풀 스트립 + 큰 거래처명 박스 (좌) + 결재란 5칸 (우)
 * - 일련번호 박스 (좌) + 출하창고 (우, 빨강) — 창고명만 (코드 X)
 * - 배송지/연락처/특이사항 큰 박스
 * - "기사님 출발전에 수요처에 전화주세요~ 감사합니다^^" 가운데 안내
 * - "※ 제품수량 및 이상유무 확인 후 서명 必"
 * - 용달기사 서명 / 인수자 서명 — 박스 X, 라벨만
 * - 하단 안내문 "제품 인수시 ... 책임지지 않습니다."
 *
 * @page A4 portrait 12mm 여백 — global.css @media print 에 적용.
 *
 * UUID 비공개: 일련번호 `slipDate - seqNo` 만 노출. dispatcher.userId / inspector.userId
 * 는 부모로부터 받지만 화면 표시 X (이름만 표시). 출하창고 코드 미노출 (사용자 명시).
 */
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@samhan/design-system'
import { getSlip, type SlipDetail, type SlipLineDetail } from '../api/slip'
import { listWarehouses, type Warehouse } from '../api/inventory'
import { usePageTitle } from '../hooks/usePageTitle'
import { useFitOneA4 } from './useFitOneA4'

/**
 * 품목명 표시 — 원본 양식은 모델코드 + 괄호 설명 한 컬럼 (예: "AJ040MXHNBC1 (MX단배관)").
 * 모델명과 품목명이 다르면 결합, 같거나 한쪽만 있으면 그 값.
 */
function lineDisplayName(l: SlipLineDetail): string {
  const model = l.modelName?.trim() || ''
  const product = l.productName?.trim() || ''
  if (model && product && product !== model) return `${model} (${product})`
  return model || product || '-'
}

/** "YYYY-MM-DD" → "MM/DD" (원본 양식 월/일 컬럼). */
function toMonthDay(isoDate: string | null | undefined): string {
  if (!isoDate || isoDate.length < 10) return ''
  return `${isoDate.slice(5, 7)}/${isoDate.slice(8, 10)}`
}

/**
 * "2026-05-04T14:32:18+09:00" → "14:32" (Designer print-spec.md § 3.4).
 * 빈 ISO 시 빈 문자열.
 */
function formatHHmm(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(11, 16)
}

/**
 * `<RoleCell>` — 결재란 5칸 셀 (Designer components.md § 4.4).
 *
 * 출고인/검수인 셀은 value (이름) + time (HH:mm) 둘 다 표시.
 * 그 외 (담당부서/담당자/결재) 는 value 만.
 */
function RoleCell({
  label,
  value,
  time,
}: {
  label: string
  value?: string | null
  time?: string | null
}) {
  return (
    <div className="dispatch-role-cell">
      <div className="dispatch-role-label">{label}</div>
      <div className="dispatch-role-value">
        {value ? <span className="name">{value}</span> : null}
        {time ? <span className="time">{formatHHmm(time)}</span> : null}
      </div>
    </div>
  )
}

export function DispatchView() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const navigate = useNavigate()
  const detailQuery = useQuery({
    queryKey: ['slip', id],
    queryFn: () => getSlip(id),
    enabled: !!id,
  })
  const warehousesQuery = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  // 한 A4 자동 비율 — 품목 수 변동 시 재측정 (개발책임자 2026-06-10)
  const { ref: fitRef, zoom } = useFitOneA4<HTMLDivElement>([
    detailQuery.data?.lines?.length ?? 0,
  ])

  usePageTitle('출고전표 작업지시서', detailQuery.data?.slipNo)

  if (!id) return null
  if (detailQuery.isLoading) return <p>불러오는 중...</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        전표를 불러오지 못했습니다.
      </div>
    )
  }

  const slip: SlipDetail = detailQuery.data
  const totalQty = slip.lines.reduce((sum, l) => sum + l.quantity, 0)
  const sourceWarehouseName =
    warehousesQuery.data?.find((w) => w.id === slip.sourceWarehouseId)?.name ?? '-'
  const monthDay = toMonthDay(slip.slipDate)
  /** 결재칸 발행일 MMDD (샘플 '0610' = 발행 당일). */
  const issuedMmdd = (() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  })()

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <Button variant="ghost" onClick={() => navigate(`/sales/${id}`)}>
          상세로 돌아가기
        </Button>
        <Button variant="primary" onClick={() => window.print()}>
          인쇄
        </Button>
      </div>

      <div className="dispatch-page" ref={fitRef} style={{ zoom }}>
        <div className="dispatch-logo-strip">
          <span className="dispatch-logo-placeholder">SAMSUNG</span>
        </div>

        <header className="dispatch-header-row">
          <div className="dispatch-partner-name-box">
            {slip.partnerName ?? '-'}
          </div>
          <div className="dispatch-roles" aria-label="담당자 및 결재">
            <RoleCell label="담당부서" value={slip.ownerDepartment ?? null} />
            <RoleCell label="담당자" value={slip.ownerFullName ?? null} />
            <RoleCell
              label="출고인"
              value={slip.dispatcher?.fullName ?? null}
              time={slip.dispatcher?.signedAt ?? null}
            />
            <RoleCell
              label="검수인"
              value={slip.inspector?.fullName ?? null}
              time={slip.inspector?.signedAt ?? null}
            />
            <RoleCell label="결 제" value={issuedMmdd} />
          </div>
        </header>

        <div className="dispatch-meta-row">
          {/* 전표번호 표준 = 슬래시 YYYY/MM/DD-{번호} (feedback_slip_order_number_format) — slipNo 그대로 */}
          <div className="dispatch-slip-no-box">
            {slip.slipNo ?? `${(slip.slipDate ?? '').split('-').join('/')} -${slip.seqNo}`}
          </div>
          <div className="dispatch-warehouse-emphasis">
            {sourceWarehouseName}
          </div>
        </div>

        {/* 원본 양식(2026-06-10 샘플): 월/일 | 품목명(모델+명 결합) | 규격 | 수량 */}
        <table className="dispatch-table">
          <thead>
            <tr>
              <th className="col-date">월/일</th>
              <th className="col-product">품목명</th>
              <th className="col-spec">규격</th>
              <th className="col-qty">수량</th>
            </tr>
          </thead>
          <tbody>
            {slip.lines.map((l) => (
              <tr key={l.id}>
                <td className="col-date">{monthDay}</td>
                <td className="col-product">{lineDisplayName(l)}</td>
                <td className="col-spec">{l.specification || ''}</td>
                <td className="col-qty">{l.quantity.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="col-date" />
              <td className="total-label">총합계</td>
              <td className="col-spec" />
              <td className="col-qty total-qty">{totalQty.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>

        <div className="dispatch-bottom-group">
          <div className="dispatch-address-box">
            {slip.shippingAddress ?? '-'}
          </div>
          <div className="dispatch-info-box">
            <span className="label">연락처:</span>
            <span className="content">{slip.contactPhone ?? '-'}</span>
          </div>
          <div className="dispatch-info-box">
            <span className="label">특이사항:</span>
            <span className="content">{slip.memo ?? '-'}</span>
          </div>

          <p className="dispatch-driver-call-notice">
            기사님 출발전에 수요처에 전화주세요~ 감사합니다^^
          </p>

          {/* 사용자 명시 (Slice C2 follow-up): confirm + signatures + liability 한 박스로 묶기 */}
          <div className="dispatch-liability-box">
          <p className="dispatch-confirm-notice">
            ※ 제품수량 및 이상유무 확인 후 서명 必
          </p>

          <div className="dispatch-signatures" aria-label="서명">
            {/*
              link-dispatch-slice: 기사명이 입력된 경우 라벨에 자동 노출 (괄호 안).
              인쇄 본문 디자인 자체는 변경 X (피드백 `feedback_print_design_iteration.md` 가드).
            */}
            <div className="dispatch-sign-label-only dispatch-recipient-sign-cell">
              용달기사 서명
              {slip.driverSignaturePng ? (
                <>
                  <img
                    className="dispatch-role-signature-img"
                    src={slip.driverSignaturePng}
                    alt="용달기사 서명"
                  />
                  <div className="dispatch-role-signature-meta">
                    <span className="date">{slip.driverSignedAt?.slice(0, 10) ?? ''}</span>
                  </div>
                </>
              ) : null}
            </div>
            {/*
              signature-slice-C 신규: 인수자 서명 셀 안에 signaturePng 있으면 <img> 렌더.
              CSS-only 추가 (Designer wireframes.md §4.3 / tokens.md §1.3 — max-width 100% +
              max-height 18mm + object-fit contain). 셀 자체 grid / 폭 변경 없음.
              PNG 미존재 시 기존 라벨 유지 (서명 없음 분기 — wireframes.md §4.2).
            */}
            <div className="dispatch-sign-label-only dispatch-recipient-sign-cell">
              인수자 서명
              {slip.signaturePng ? (
                <>
                  <img
                    className="dispatch-role-signature-img"
                    src={slip.signaturePng}
                    alt="인수자 서명"
                  />
                  <div className="dispatch-role-signature-meta">
                    <span className="date">{slip.signedAt?.slice(0, 10) ?? ''}</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <p className="dispatch-liability-notice">
            제품 인수시 수량 제품상태 이상 유무 확인 후 서명 부탁드립니다.<br />
            서명 후 생긴 문제는 당사가 책임지지 않습니다.
          </p>
          </div>
        </div>
      </div>
    </div>
  )
}
