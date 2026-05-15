/**
 * Phase F (D-DF-06) — 출고전표 사본 양식 (PoC).
 *
 * OutboundView (`src/renderer/print/OutboundView.tsx`) 의 a4-portrait variant 디자인을 단순화 복제.
 *
 * **drift 0 정책**:
 * 본 컴포넌트는 OutboundView refactor (props 기반 분리) 가 완료될 때까지의 PoC.
 * 양식 변경 시 (1) OutboundView.tsx 와 (2) 본 PrintRendererApp.tsx 양쪽 동시 갱신 의무.
 * 후속 PR 에서 OutboundView 의 useQuery 분리 후 본 파일이 OutboundView 를 직접 import 하도록 refactor 예정.
 *
 * **Designer 검증 책임**: PR 본문에 OutboundView a4-portrait 캡처 vs 본 컴포넌트 캡처 side-by-side 첨부.
 */
import React from 'react'

export interface SlipLine {
  itemName: string
  spec: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface SlipData {
  slipNo: string
  slipDate: string
  partnerName: string
  recipientAddress: string
  contactPhone?: string
  driverName?: string
  driverPhone?: string
  lines: SlipLine[]
  totalQuantity: number
  totalSupply: number
  vat: number
  total: number
  sourceWarehouseName: string
  dispatcherName?: string
  recipientName?: string
  memo?: string
  /** 발행 회사 (기본: 삼한공조). */
  companyLegalName?: string
  /** 회사 대표 전화 (footer 표기). */
  companyTel?: string
}

export interface Props {
  slipData: SlipData
  /** PNG base64 (data URI body 부분만). 빈 문자열 가능 (서명 누락 fallback). */
  driverSignatureBase64: string
  recipientSignatureBase64: string
}

const krw = (n: number): string => n.toLocaleString('ko-KR')

const styles = {
  page: {
    width: 600,
    minHeight: 850,
    padding: '24px 32px',
    boxSizing: 'border-box' as const,
    background: '#ffffff',
    color: '#111111',
  },
  header: {
    textAlign: 'center' as const,
    borderBottom: '2px solid #111111',
    paddingBottom: 12,
    marginBottom: 16,
  },
  company: { fontSize: 14, fontWeight: 600, marginBottom: 4 },
  title: { fontSize: 26, fontWeight: 700, letterSpacing: 8, margin: '8px 0' },
  metaRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 },
  partner: { marginBottom: 12, fontSize: 13 },
  partnerRow: { display: 'flex', gap: 8, marginBottom: 4 },
  partnerLabel: { width: 64, color: '#444444' },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginBottom: 12,
    fontSize: 12,
  },
  thtd: {
    border: '1px solid #888888',
    padding: '6px 8px',
    textAlign: 'left' as const,
  },
  thtdNum: {
    border: '1px solid #888888',
    padding: '6px 8px',
    textAlign: 'right' as const,
  },
  thead: { background: '#f0f0f0', fontWeight: 600 },
  totals: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end' as const,
    gap: 4,
    fontSize: 13,
    marginBottom: 16,
  },
  totalRow: { display: 'flex', gap: 16, justifyContent: 'flex-end', minWidth: 240 },
  totalRowStrong: {
    display: 'flex',
    gap: 16,
    justifyContent: 'flex-end',
    minWidth: 240,
    fontWeight: 700,
    borderTop: '1px solid #111111',
    paddingTop: 4,
  },
  memo: { fontSize: 12, marginBottom: 12, padding: 8, background: '#fafafa', border: '1px dashed #cccccc' },
  signatures: {
    display: 'flex',
    gap: 24,
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 16,
    borderTop: '1px solid #888888',
  },
  signCell: {
    flex: 1,
    textAlign: 'center' as const,
  },
  signLabel: { fontSize: 12, color: '#444444', marginBottom: 8 },
  signImg: { width: 200, height: 80, border: '1px solid #cccccc', objectFit: 'contain' as const, background: '#ffffff' },
  signEmpty: {
    width: 200,
    height: 80,
    border: '1px dashed #cccccc',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#999999',
    fontSize: 11,
  },
  footer: {
    marginTop: 16,
    paddingTop: 8,
    fontSize: 11,
    color: '#666666',
    textAlign: 'center' as const,
    borderTop: '1px solid #cccccc',
  },
} as const

export function PrintRendererApp({ slipData, driverSignatureBase64, recipientSignatureBase64 }: Props): JSX.Element {
  const company = slipData.companyLegalName ?? '삼한공조'
  const tel = slipData.companyTel ?? ''

  return (
    <div
      className="outbound-page outbound-a4"
      data-testid="outbound-print-area"
      data-slip-no={slipData.slipNo}
      style={styles.page}
    >
      <header style={styles.header} className="outbound-header">
        <div style={styles.company} className="outbound-company">{company}</div>
        <h1 style={styles.title} className="outbound-title">출 고 전 표</h1>
        <div style={styles.metaRow} className="outbound-meta-row">
          <span>전표번호: <strong>{slipData.slipNo}</strong></span>
          <span>발행일: {slipData.slipDate}</span>
        </div>
        <div style={styles.metaRow} className="outbound-meta-row">
          <span>출하창고: <strong>{slipData.sourceWarehouseName}</strong></span>
          <span></span>
        </div>
      </header>

      <section style={styles.partner} className="outbound-partner">
        <div style={styles.partnerRow}>
          <span style={styles.partnerLabel}>거래처</span>
          <span>{slipData.partnerName}</span>
        </div>
        <div style={styles.partnerRow}>
          <span style={styles.partnerLabel}>배송지</span>
          <span>{slipData.recipientAddress}</span>
        </div>
        {slipData.contactPhone ? (
          <div style={styles.partnerRow}>
            <span style={styles.partnerLabel}>연락처</span>
            <span>{slipData.contactPhone}</span>
          </div>
        ) : null}
        {slipData.driverName ? (
          <div style={styles.partnerRow}>
            <span style={styles.partnerLabel}>기사</span>
            <span>
              {slipData.driverName}
              {slipData.driverPhone ? ` (${slipData.driverPhone})` : ''}
            </span>
          </div>
        ) : null}
      </section>

      <table style={styles.table} className="outbound-table">
        <thead style={styles.thead}>
          <tr>
            <th style={styles.thtd}>품목</th>
            <th style={styles.thtd}>규격</th>
            <th style={styles.thtdNum}>수량</th>
            <th style={styles.thtdNum}>단가</th>
            <th style={styles.thtdNum}>금액</th>
          </tr>
        </thead>
        <tbody>
          {slipData.lines.map((l, idx) => (
            <tr key={idx}>
              <td style={styles.thtd}>{l.itemName}</td>
              <td style={styles.thtd}>{l.spec}</td>
              <td style={styles.thtdNum}>{krw(l.quantity)}</td>
              <td style={styles.thtdNum}>{krw(l.unitPrice)}</td>
              <td style={styles.thtdNum}>{krw(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section style={styles.totals} className="outbound-totals">
        <div style={styles.totalRow}>
          <span>총 수량</span>
          <span>{krw(slipData.totalQuantity)}</span>
        </div>
        <div style={styles.totalRow}>
          <span>공급가액</span>
          <span>{krw(slipData.totalSupply)}</span>
        </div>
        <div style={styles.totalRow}>
          <span>부가세 (10%)</span>
          <span>{krw(slipData.vat)}</span>
        </div>
        <div style={styles.totalRowStrong}>
          <span>합계</span>
          <span>{krw(slipData.total)} 원</span>
        </div>
      </section>

      {slipData.memo ? (
        <section style={styles.memo} className="outbound-memo">
          비고: {slipData.memo}
        </section>
      ) : null}

      <section style={styles.signatures} className="outbound-signatures">
        <div style={styles.signCell}>
          <div style={styles.signLabel}>기사 서명{slipData.driverName ? ` — ${slipData.driverName}` : ''}</div>
          {driverSignatureBase64 ? (
            <img
              style={styles.signImg}
              src={`data:image/png;base64,${driverSignatureBase64}`}
              alt="기사 서명"
            />
          ) : (
            <span style={styles.signEmpty}>서명 누락</span>
          )}
        </div>
        <div style={styles.signCell}>
          <div style={styles.signLabel}>인수자 서명{slipData.recipientName ? ` — ${slipData.recipientName}` : ''}</div>
          {recipientSignatureBase64 ? (
            <img
              style={styles.signImg}
              src={`data:image/png;base64,${recipientSignatureBase64}`}
              alt="인수자 서명"
            />
          ) : (
            <span style={styles.signEmpty}>서명 누락</span>
          )}
        </div>
      </section>

      <footer style={styles.footer} className="outbound-footer">
        발행: {company}{tel ? ` / TEL ${tel}` : ''}
        {slipData.dispatcherName ? ` / 출고인: ${slipData.dispatcherName}` : ''}
      </footer>
    </div>
  )
}
