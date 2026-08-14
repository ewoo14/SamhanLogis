import type { SlipDetail, SlipLineDetail } from '../api/slip'
import type { ApprovalLineStructure } from '../api/approvalLineConfigApi'
import { OUTBOUND_DELIVERY_TAG_LABELS } from '../api/slipCutoff'
import { stripSlipNoZeros } from '../utils/orderNo'
import { ApprovalRoleCells, RoleCell, fallbackRoles } from './approvalRoleCells'

/**
 * 배송태그 한국어 라벨 맵 — 설정 화면(slipCutoff.ts)과 단일 소스를 공유한다(중복 정의 금지).
 * 인쇄 양식 배송주소 앞 표시용. slip.deliveryTag(11종) 인덱싱 위해 string 키로 확장.
 */
const DISPATCH_TAG_LABELS = OUTBOUND_DELIVERY_TAG_LABELS as Record<string, string>

/**
 * 특이사항(메모)에서 배송태그 자동 접두("[지방] …")를 제거한다.
 * 배송태그는 배송주소 앞에 별도 강조 표시하므로 특이사항 중복을 제거한다(개발책임자 2026-06-25).
 */
function memoWithoutTagPrefix(
  memo: string | null | undefined,
  tagLabel: string | null,
): string {
  if (!memo) return '-'
  if (tagLabel) {
    const prefix = `[${tagLabel}]`
    if (memo.startsWith(prefix)) {
      return memo.slice(prefix.length).trim() || '-'
    }
  }
  return memo
}

export interface DispatchDocumentSignatures {
  driverSignaturePng?: string | null
  recipientSignaturePng?: string | null
}

export interface DispatchDocumentProps {
  slip: SlipDetail
  roles: ApprovalLineStructure[] | null
  sourceWarehouseName: string
  signatures?: DispatchDocumentSignatures
}

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

function normalizeSignature(src: string | null | undefined): string | null {
  if (!src) return null
  return src.startsWith('data:') ? src : `data:image/png;base64,${src}`
}

/** 출고전표 인쇄 본문. 라우터/쿼리 없이 props 만으로 렌더한다. */
export function DispatchDocument({
  slip,
  roles,
  sourceWarehouseName,
  signatures,
}: DispatchDocumentProps) {
  const totalQty = slip.lines.reduce((sum, l) => sum + l.quantity, 0)
  const displaySlipNoFallback = stripSlipNoZeros(
    slip.slipNo ?? `${(slip.slipDate ?? '').split('-').join('/')}-${slip.seqNo}`,
  )
  const monthDay = toMonthDay(slip.slipDate)
  const paymentDueMmdd = slip.paymentDueDate ? toMonthDay(slip.paymentDueDate) : ''
  const roleCells = (roles ?? fallbackRoles('OUTBOUND'))
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
  const driverSignaturePng = normalizeSignature(signatures?.driverSignaturePng ?? slip.driverSignaturePng)
  const recipientSignaturePng = normalizeSignature(signatures?.recipientSignaturePng ?? slip.signaturePng)

  return (
    <div className="dispatch-page">
      <div className="dispatch-logo-strip">
        <span className="dispatch-logo-placeholder">SAMSUNG</span>
      </div>

      <header className="dispatch-header-row">
        <div className="dispatch-partner-name-box">
          {slip.partnerName ?? '-'}
        </div>
        <div
          className="dispatch-roles"
          aria-label="작성자 및 결재"
          style={{ gridTemplateColumns: `repeat(${roleCells.length + 2}, 1fr)` }}
        >
          <RoleCell label="담당부서" value={slip.ownerDepartment ?? null} />
          <ApprovalRoleCells slip={slip} roles={roleCells} slipType="OUTBOUND" />
          <RoleCell label="결제예정일" value={paymentDueMmdd} />
        </div>
      </header>

      <div className="dispatch-meta-row">
        <div className="dispatch-slip-no-box">
          {displaySlipNoFallback}
        </div>
        <div className="dispatch-warehouse-emphasis">
          {sourceWarehouseName}
        </div>
      </div>

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
        {slip.deliveryTag ? (
          <div className="dispatch-delivery-tag-label">
            [{DISPATCH_TAG_LABELS[slip.deliveryTag] ?? slip.deliveryTag}]
          </div>
        ) : null}
        <div className="dispatch-address-box">
          {slip.shippingAddress ?? '-'}
        </div>
        <div className="dispatch-info-box">
          <span className="label">연락처:</span>
          <span className="content">{slip.contactPhone ?? '-'}</span>
        </div>
        {/*
          배송일정 라벨(deliveryScheduleLabel)은 특이사항과 별도 행으로 표시한다.
          인쇄 양식에서 강조: 굵기(bold) + 박스 테두리, 색상 아닌 굵기로 구분.
          자유 메모(특이사항)와 시각적으로 분리하여 배송일정 정보를 명확히 전달한다.
        */}
        {slip.deliveryScheduleLabel ? (
          <div
            className="dispatch-delivery-schedule-box"
            data-testid="dispatch-delivery-schedule-label"
          >
            <span className="label">배송일정:</span>
            <strong className="content">{slip.deliveryScheduleLabel}</strong>
          </div>
        ) : null}
        <div className="dispatch-info-box">
          <span className="label">특이사항:</span>
          <span className="content">
            {/*
              레거시 전표의 "[지방] …" 등 태그 접두는 memoWithoutTagPrefix 로 제거.
              deliveryScheduleLabel 은 위 별도 행으로 분리되어 이중 표시 없음.
            */}
            {memoWithoutTagPrefix(
              slip.memo,
              slip.deliveryTag
                ? (DISPATCH_TAG_LABELS[slip.deliveryTag] ?? slip.deliveryTag)
                : null,
            )}
          </span>
        </div>

        <p className="dispatch-driver-call-notice">
          기사님 출발전에 수요처에 전화주세요~ 감사합니다^^
        </p>

        <div className="dispatch-liability-box">
          <p className="dispatch-confirm-notice">
            ※ 제품수량 및 이상유무 확인 후 서명 必
          </p>

          <div className="dispatch-signatures" aria-label="서명">
            <div className="dispatch-sign-label-only dispatch-recipient-sign-cell">
              용달기사 서명
              {driverSignaturePng ? (
                <>
                  <img
                    className="dispatch-role-signature-img"
                    src={driverSignaturePng}
                    alt="용달기사 서명"
                  />
                  <div className="dispatch-role-signature-meta">
                    <span className="date">{slip.driverSignedAt?.slice(0, 10) ?? ''}</span>
                  </div>
                </>
              ) : null}
            </div>
            <div className="dispatch-sign-label-only dispatch-recipient-sign-cell">
              인수자 서명
              {recipientSignaturePng ? (
                <>
                  <img
                    className="dispatch-role-signature-img"
                    src={recipientSignaturePng}
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
  )
}
