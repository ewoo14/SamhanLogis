/**
 * 주문 정보 입력 (legacy `#pageOrderInfo` line 1010 1:1).
 *
 * <p>배송지 / 현장명 / 인수자 / 출고희망일 / 입금 / 요청사항 form.
 * "발송" 클릭 시 `createOrderDraft` → `confirmOrder` 호출 (mock 단계 sessionStorage).
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrderStore } from '../stores/order'
import { useSessionStore } from '../stores/session'
import { confirmOrder, createOrderDraft } from '../api/orders'

export function OrderInfoPage() {
  const navigate = useNavigate()
  const auth = useSessionStore((s) => s.auth)
  const lines = useOrderStore((s) => s.lines)
  const info = useOrderStore((s) => s.info)
  const setInfo = useOrderStore((s) => s.setInfo)
  const clear = useOrderStore((s) => s.clear)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function handleSend() {
    setErr('')
    if (!info.deliveryAddress || !info.receiver || !info.receiverPhone || !info.dueDate) {
      setErr('배송지 / 인수자 / 연락처 / 출고희망일은 필수입니다.')
      return
    }
    if (lines.length === 0) {
      setErr('선택된 품목이 없습니다.')
      return
    }
    setBusy(true)
    try {
      const draft = await createOrderDraft({
        bizno: auth?.bizno ?? '',
        partnerName: auth?.partnerName ?? '',
        lines,
        info,
      })
      const confirmed = await confirmOrder(draft.orderNo)
      clear()
      // 정정 #8 — orderNo 'YYYY/MM/DD - 0001' (slash + space) → splat route 로 그대로 전달
      navigate(`/orders/detail/${confirmed.orderNo}`, { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '발송 실패')
    } finally {
      setBusy(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 36,
    border: '1px solid var(--c-line)',
    borderRadius: 8,
    padding: '0 10px',
  }

  return (
    <div className="wrap">
      <div className="top">
        <div className="title">주문 정보 입력</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>
            배송지
          </label>
          <input
            style={inputStyle}
            value={info.deliveryAddress}
            onChange={(e) => setInfo({ deliveryAddress: e.target.value })}
            placeholder="도로명 주소"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>
            상세 주소
          </label>
          <input
            style={inputStyle}
            value={info.deliveryAddressDetail ?? ''}
            onChange={(e) => setInfo({ deliveryAddressDetail: e.target.value })}
            placeholder="상세 주소"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>
            현장명
          </label>
          <input
            style={inputStyle}
            value={info.siteName ?? ''}
            onChange={(e) => setInfo({ siteName: e.target.value })}
            placeholder="현장명"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>
            인수자
          </label>
          <input
            style={inputStyle}
            value={info.receiver}
            onChange={(e) => setInfo({ receiver: e.target.value })}
            placeholder="홍길동"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>
            인수자 연락처
          </label>
          <input
            style={inputStyle}
            value={info.receiverPhone}
            onChange={(e) => setInfo({ receiverPhone: e.target.value })}
            placeholder="010-0000-0000"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>
            출고희망일
          </label>
          <input
            type="date"
            style={inputStyle}
            value={info.dueDate}
            onChange={(e) => setInfo({ dueDate: e.target.value })}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>
            요청사항
          </label>
          <textarea
            style={{ ...inputStyle, height: 90, padding: 8 }}
            value={info.requestNote ?? ''}
            onChange={(e) => setInfo({ requestNote: e.target.value })}
            placeholder="배송 요청사항 등"
          />
        </div>
      </div>

      {err && <div style={{ marginTop: 12, color: '#dc2626' }}>{err}</div>}

      <div className="biz-buttons" style={{ marginTop: 24, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/orders/preview')}>
          이전
        </button>
        <button className="btn" style={{ background: '#059669' }} disabled={busy} onClick={() => void handleSend()}>
          {busy ? '발송 중...' : '주문 발송'}
        </button>
      </div>
    </div>
  )
}
