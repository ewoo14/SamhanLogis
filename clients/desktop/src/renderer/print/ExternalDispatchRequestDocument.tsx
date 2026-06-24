import type { CSSProperties } from 'react'
import type { ExternalDispatchPrintDataResponse } from '../api/externalDispatch'
import { krDate } from './PrintLayout'

export interface ExternalDispatchRequestDocumentProps {
  data: ExternalDispatchPrintDataResponse
}

function safeText(value: string | null | undefined, fallback = '-'): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function channelLabel(channel: ExternalDispatchPrintDataResponse['channel']): string {
  switch (channel) {
    case 'PRINT':
      return '인쇄'
    case 'BOTH':
      return 'SMS + 인쇄'
    case 'SMS':
      return 'SMS'
    default:
      return channel
  }
}

/** 타배송사 배차의뢰서 A4 인쇄 본문. UUID 없이 업무 식별자만 표시한다. */
export function ExternalDispatchRequestDocument({ data }: ExternalDispatchRequestDocumentProps) {
  return (
    <article style={{
      display: 'grid',
      gap: 14,
      color: '#111827',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 12,
    }}
    >
      <header style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 16,
        alignItems: 'start',
        borderBottom: '2px solid #111827',
        paddingBottom: 12,
      }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: 0 }}>
            배차의뢰서
          </h1>
          <p style={{ margin: '8px 0 0', color: '#4B5563' }}>
            타배송사 기사님께 전달하는 인쇄용 배차 의뢰 문서입니다.
          </p>
        </div>
        <dl style={{
          display: 'grid',
          gridTemplateColumns: '64px 150px',
          gap: '6px 10px',
          margin: 0,
          padding: 10,
          border: '1px solid #D1D5DB',
        }}
        >
          <dt style={{ color: '#6B7280' }}>발송일</dt>
          <dd style={{ margin: 0, fontWeight: 700 }}>{krDate(data.dispatchDate)}</dd>
          <dt style={{ color: '#6B7280' }}>채널</dt>
          <dd style={{ margin: 0, fontWeight: 700 }}>{channelLabel(data.channel)}</dd>
        </dl>
      </header>

      <section aria-label="배송사 정보" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        border: '1px solid #111827',
      }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr' }}>
          <strong style={{ padding: 9, borderRight: '1px solid #111827', background: '#F3F4F6' }}>
            배송사/기사
          </strong>
          <span style={{ padding: 9 }}>{safeText(data.carrierName)}</span>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '72px 1fr',
          borderLeft: '1px solid #111827',
        }}
        >
          <strong style={{ padding: 9, borderRight: '1px solid #111827', background: '#F3F4F6' }}>
            연락처
          </strong>
          <span style={{ padding: 9 }}>{safeText(data.carrierPhone)}</span>
        </div>
      </section>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={thStyle}>순번</th>
            <th style={thStyle}>전표번호</th>
            <th style={thStyle}>배송지</th>
            <th style={thStyle}>수령자</th>
            <th style={thStyle}>연락처</th>
            <th style={thStyle}>품목요약</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', padding: 18 }}>
                인쇄할 전표가 없습니다.
              </td>
            </tr>
          ) : data.items.map((item) => (
            <tr key={`${item.sequence}-${item.slipNo}`}>
              <td style={{ ...tdStyle, width: 42, textAlign: 'center' }}>{item.sequence}</td>
              <td style={{ ...tdStyle, width: 116, fontWeight: 700 }}>{safeText(item.slipNo)}</td>
              <td style={{ ...tdStyle, width: 220 }}>{safeText(item.deliveryAddress)}</td>
              <td style={{ ...tdStyle, width: 90 }}>{safeText(item.recipientName)}</td>
              <td style={{ ...tdStyle, width: 104 }}>{safeText(item.recipientPhone)}</td>
              <td style={{ ...tdStyle }}>{safeText(item.itemSummary)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer style={{
        display: 'grid',
        gap: 8,
        borderTop: '1px solid #D1D5DB',
        paddingTop: 10,
        color: '#374151',
        lineHeight: 1.5,
      }}
      >
        <p style={{ margin: 0 }}>
          ※ 기사님은 출발 전 수령자에게 연락하시고, 제품 수량과 이상 유무 확인 후 인수 서명을 받아 주세요.
        </p>
        <p style={{ margin: 0 }}>
          ※ 본 문서는 타배송사 배차 의뢰용이며 전표 UUID 등 내부 식별자는 표시하지 않습니다.
        </p>
      </footer>
    </article>
  )
}

const thStyle: CSSProperties = {
  border: '1px solid #111827',
  background: '#F3F4F6',
  padding: '8px 6px',
  textAlign: 'center',
  fontWeight: 700,
}

const tdStyle: CSSProperties = {
  border: '1px solid #111827',
  padding: '8px 6px',
  verticalAlign: 'top',
  wordBreak: 'keep-all',
  overflowWrap: 'anywhere',
}
