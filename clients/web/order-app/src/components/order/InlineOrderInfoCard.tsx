/**
 * 정정 #18 — 라인 1건 이상일 때 표시되는 인라인 주문정보 입력 카드.
 *
 * <p>legacy partner-order index.html 의 cardOrderInfo 흐름 1:1 모방:
 * <ol>
 *   <li>4 카테고리 카드 grid 표시 + 라인 0건 → 본 카드 숨김</li>
 *   <li>라인 1건 추가 → 본 카드 자동 표시 + 첫 input(배송지) focus</li>
 *   <li>거래처는 BizGate 인증 시 자동 채움 (read-only 표시)</li>
 *   <li>사용자 입력: 배송지 / 상세주소 / 현장명 / 인수자 / 연락처 / 납기일 / 요청사항</li>
 *   <li>cardFinal (합계 + 발주 버튼) 도 동시 활성</li>
 * </ol>
 *
 * <p>v2 의 별도 OrderInfoPage 는 보존 (route `/orders/info` 이전 흐름 유지) —
 * 본 카드는 OrderFormPage 내부에서 합계 직전에 inline 으로 mount.
 *
 * @param onProceed 발주 버튼 클릭 핸들러 (validation 후 호출).
 * @param disabled 발주 버튼 비활성 (라인 0건/필수 입력 미충족 시).
 */
import { useEffect, useRef } from 'react'
import { useOrderStore } from '../../stores/order'
import { useSessionStore } from '../../stores/session'

interface Props {
  onProceed: () => void
  disabled?: boolean
}

export function InlineOrderInfoCard({ onProceed, disabled }: Props) {
  const auth = useSessionStore((s) => s.auth)
  const info = useOrderStore((s) => s.info)
  const setInfo = useOrderStore((s) => s.setInfo)
  const lines = useOrderStore((s) => s.lines)
  const grandTotal = useOrderStore((s) => s.grandTotal())
  const selectedCount = useOrderStore((s) => s.selectedCount())

  /**
   * 정정 #18 — 라인 처음 추가 (0 → 1+) 순간 첫 input focus.
   *
   * <p>이전 lineCount 를 ref 로 저장 → 0→1+ 전환 감지.
   * 단순 lines.length > 0 만 의존하면 매 라인 추가마다 focus 가 강제로 이동 — 첫 전환에만 발생하도록 가드.
   */
  const prevLineCountRef = useRef(0)
  const firstInputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const prev = prevLineCountRef.current
    const cur = lines.length
    prevLineCountRef.current = cur
    if (prev === 0 && cur > 0) {
      // 다음 frame 에서 focus (mount 직후 ref 보장).
      window.requestAnimationFrame(() => {
        firstInputRef.current?.focus()
      })
    }
  }, [lines.length])

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 36,
    border: '1px solid var(--c-line)',
    borderRadius: 8,
    padding: '0 10px',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    color: 'var(--c-muted)',
    marginBottom: 4,
  }

  const validForSubmit = !!(info.deliveryAddress && info.receiver && info.receiverPhone && info.dueDate)

  return (
    <section
      id="cardOrderInfo"
      aria-label="주문 정보 입력"
      style={{
        marginTop: 16,
        padding: 16,
        border: '1px solid var(--c-line)',
        borderRadius: 12,
        background: '#fafafa',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: '1px solid var(--c-line)',
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          주문 정보 입력
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--c-muted)', fontWeight: 400 }}>
            라인 {selectedCount} 건 추가됨
          </span>
        </h2>
        <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>
          거래처: <strong style={{ color: 'var(--c-strong)' }}>{auth?.partnerName ?? '-'}</strong>
          <span style={{ marginLeft: 6 }}>({auth?.bizno ?? '-'})</span>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 10,
        }}
      >
        <div>
          <label style={labelStyle} htmlFor="orderInfoDeliveryAddress">
            배송지 <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            id="orderInfoDeliveryAddress"
            ref={firstInputRef}
            style={inputStyle}
            value={info.deliveryAddress}
            onChange={(e) => setInfo({ deliveryAddress: e.target.value })}
            placeholder="도로명 주소 (Daum Postcode 통합 예정)"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="orderInfoDeliveryAddressDetail">
            상세 주소
          </label>
          <input
            id="orderInfoDeliveryAddressDetail"
            style={inputStyle}
            value={info.deliveryAddressDetail ?? ''}
            onChange={(e) => setInfo({ deliveryAddressDetail: e.target.value })}
            placeholder="동/호수 등"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="orderInfoSiteName">
            현장명
          </label>
          <input
            id="orderInfoSiteName"
            style={inputStyle}
            value={info.siteName ?? ''}
            onChange={(e) => setInfo({ siteName: e.target.value })}
            placeholder="현장명"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="orderInfoReceiver">
            인수자 <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            id="orderInfoReceiver"
            style={inputStyle}
            value={info.receiver}
            onChange={(e) => setInfo({ receiver: e.target.value })}
            placeholder="홍길동"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="orderInfoReceiverPhone">
            연락처 <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            id="orderInfoReceiverPhone"
            style={inputStyle}
            value={info.receiverPhone}
            onChange={(e) => setInfo({ receiverPhone: e.target.value })}
            placeholder="010-0000-0000"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="orderInfoDueDate">
            출고희망일 <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            id="orderInfoDueDate"
            type="date"
            style={inputStyle}
            value={info.dueDate}
            onChange={(e) => setInfo({ dueDate: e.target.value })}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle} htmlFor="orderInfoRequestNote">
            요청사항
          </label>
          <textarea
            id="orderInfoRequestNote"
            style={{ ...inputStyle, height: 70, padding: 8 }}
            value={info.requestNote ?? ''}
            onChange={(e) => setInfo({ requestNote: e.target.value })}
            placeholder="배송 요청사항 등"
          />
        </div>
      </div>

      {/* cardFinal — 합계 + 발주 버튼 동시 활성 */}
      <footer
        id="cardFinal"
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid var(--c-line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 14 }}>
          <span style={{ color: 'var(--c-muted)' }}>전체 합계 (DC + 옵션 적용)</span>
          <strong style={{ marginLeft: 10, fontSize: 18 }}>
            {grandTotal.toLocaleString()} 원
          </strong>
          <span style={{ marginLeft: 6, color: 'var(--c-muted)', fontSize: 12 }}>
            ({selectedCount} 품목)
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!validForSubmit && (
            <span style={{ fontSize: 12, color: '#dc2626' }}>
              * 배송지 / 인수자 / 연락처 / 출고희망일은 필수입니다.
            </span>
          )}
          <button
            id="btnProceedFinal"
            className="btn"
            style={{ background: validForSubmit ? '#059669' : undefined }}
            disabled={disabled || !validForSubmit}
            onClick={onProceed}
          >
            견적 확인 및 발주
          </button>
        </div>
      </footer>
    </section>
  )
}
