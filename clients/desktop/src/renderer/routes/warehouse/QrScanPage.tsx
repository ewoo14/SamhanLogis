import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Badge, Button } from '@samhan/design-system'
import { confirmQrScan } from '../../api/inventory'
import { listSlips, type SlipSummary } from '../../api/slip'
import { usePageTitle } from '../../hooks/usePageTitle'
import { addScannedItem, createInitialQrScanState, parseScannerValue, type ScanDirection } from './qrScanSession'
import { extractScanError } from './qrScanError'

export function QrScanPage() {
  usePageTitle('QR 스캔 입출고')
  const [direction, setDirection] = useState<ScanDirection>('OUTBOUND')
  const [slipNo, setSlipNo] = useState('')
  const [input, setInput] = useState('')
  const [state, setState] = useState(() => createInitialQrScanState())
  const inputRef = useRef<HTMLInputElement>(null)
  const slips = useQuery({ queryKey: ['qr-scan-slips', direction], queryFn: () => listSlips({ slipType: direction, size: 100 }) })
  const mutation = useMutation({
    mutationFn: () => confirmQrScan(direction, { slipNo, items: state.items }),
    onSuccess: () => setState((current) => ({ ...current, confirmed: true, rejection: null })),
    onError: (error) => setState((current) => ({ ...current, rejection: extractScanError(error) })),
  })

  useEffect(() => { inputRef.current?.focus() }, [state.items.length, state.rejection])

  const selectedSlip = (slips.data?.content ?? []).find((slip) => slip.slipNo === slipNo)
  const handleScan = (event: FormEvent) => {
    event.preventDefault()
    const item = parseScannerValue(input)
    setInput('')
    if (!item) {
      setState((current) => ({ ...current, rejection: { code: 'SERIAL_NOT_FOUND', message: 'QR에는 시리얼키와 품목코드가 필요합니다. 예: SI-00012 OUT-001' } }))
      return
    }
    setState((current) => addScannedItem({ ...current, direction, slipNo }, item))
  }

  const selectDirection = (next: ScanDirection) => {
    setDirection(next); setSlipNo(''); setState({ ...createInitialQrScanState(), direction: next })
  }
  const reset = () => { setState({ ...createInitialQrScanState(), direction }); setInput(''); setTimeout(() => inputRef.current?.focus(), 0) }

  return <main style={styles.page}>
    <header style={styles.header}><div><h1 style={styles.title}>QR 스캔 입출고</h1><p style={styles.muted}>연결 스캐너가 입력하는 QR: <code>SI-시리얼키 품목코드</code></p></div><Badge variant="brand">전표 귀속만 허용</Badge></header>
    <section style={styles.notice} aria-label="원자성 안내"><strong>전부 되거나 전부 취소됩니다</strong><span>스캔한 개체는 확정 전까지 재고에 반영되지 않습니다. 확정 시 서버가 전체 목록을 한 번에 검증합니다.</span></section>
    <section style={styles.card}>
      <div style={styles.row}><label>동작<select value={direction} onChange={(e) => selectDirection(e.target.value as ScanDirection)} style={styles.select}><option value="OUTBOUND">출고</option><option value="INBOUND">입고</option></select></label><label>전표<select value={slipNo} onChange={(e) => { setSlipNo(e.target.value); setState((s) => ({ ...s, slipNo: e.target.value, rejection: null })) }} style={{ ...styles.select, minWidth: 280 }}><option value="">전표를 선택하세요</option>{(slips.data?.content ?? []).map((slip: SlipSummary) => <option key={slip.slipNo} value={slip.slipNo}>{slip.slipNo} ({slip.partnerName ?? '거래처 미상'})</option>)}</select></label>{selectedSlip ? <span style={styles.muted}>선택됨: {selectedSlip.slipNo}</span> : null}</div>
      <form onSubmit={handleScan} style={styles.scanForm}><label htmlFor="qr-scan-input" style={styles.label}>QR 스캔</label><input id="qr-scan-input" aria-label="QR 스캔 입력" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="스캐너로 QR을 연속 입력하세요" autoComplete="off" disabled={!slipNo || mutation.isPending || state.confirmed} /><Button type="submit" variant="primary" disabled={!slipNo || !input.trim() || mutation.isPending || state.confirmed}>스캔</Button></form>
      {state.rejection ? <div role="alert" style={styles.error}><strong>스캔을 반영하지 않았습니다</strong><span>{state.rejection.message}</span></div> : null}
      {state.confirmed ? <div role="status" style={styles.success}><strong>확정 완료</strong><span>{slipNo} 전표의 스캔 목록 전체가 처리되었습니다.</span><Button variant="secondary" onClick={reset}>새 작업</Button></div> : null}
    </section>
    <section style={styles.card}><div style={styles.listHeader}><h2 style={styles.sectionTitle}>스캔 목록</h2><span>{state.items.length}개 · 확정 전</span></div>{state.items.length === 0 ? <p style={styles.muted}>QR을 찍으면 이 목록에 쌓입니다. 다음 QR은 자동으로 받을 준비가 됩니다.</p> : <ul style={styles.list}>{state.items.map((item) => <li key={item.serialKey}><code>{item.serialKey}</code><span>{item.productCode}</span><Badge variant="success">품목 확인 대기</Badge></li>)}</ul>}<div style={styles.footer}><span style={styles.muted}>확정 전에는 아무 개체도 입출고되지 않습니다.</span><Button variant="primary" onClick={() => mutation.mutate()} disabled={!slipNo || state.items.length === 0 || mutation.isPending || state.confirmed}>{mutation.isPending ? '확정 중…' : '전체 확정'}</Button></div></section>
  </main>
}

const styles = { page: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--space-4, 16px)', padding: 'var(--space-6, 24px)', minHeight: '100%' }, header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4, 16px)' }, title: { margin: 0, font: 'var(--font-heading-lg, 600 24px/1.3 Pretendard, sans-serif)', color: 'var(--color-text-primary)' }, muted: { color: 'var(--color-text-secondary)', font: 'var(--font-body-sm, 400 13px/1.5 Pretendard, sans-serif)' }, notice: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--space-1, 4px)', padding: 'var(--space-4, 16px)', background: 'var(--color-info-subtle)', color: 'var(--color-text-primary)', borderRadius: 'var(--radius-md, 8px)' }, card: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--space-4, 16px)', padding: 'var(--space-5, 20px)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md, 8px)' }, row: { display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap' as const, gap: 'var(--space-4, 16px)' }, label: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--space-1, 4px)', color: 'var(--color-text-secondary)', font: 'var(--font-body-sm, 400 13px/1.5 Pretendard, sans-serif)' }, select: { marginTop: 'var(--space-1, 4px)', minHeight: 40, padding: '0 var(--space-3, 12px)', background: 'var(--color-surface-raised)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-sm, 4px)', font: 'var(--font-body-md, 400 14px/1.5 Pretendard, sans-serif)' }, scanForm: { display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3, 12px)' }, input: {}, listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { margin: 0, font: 'var(--font-heading-md, 600 18px/1.4 Pretendard, sans-serif)', color: 'var(--color-text-primary)' }, list: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--space-2, 8px)', margin: 0, padding: 0, listStyle: 'none' }, footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4, 16px)' }, error: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--space-1, 4px)', padding: 'var(--space-3, 12px)', background: 'var(--color-danger-subtle)', color: 'var(--color-danger-strong)', borderRadius: 'var(--radius-sm, 4px)' }, success: { display: 'flex', alignItems: 'center', gap: 'var(--space-3, 12px)', padding: 'var(--space-3, 12px)', background: 'var(--color-success-subtle)', color: 'var(--color-success-strong)', borderRadius: 'var(--radius-sm, 4px)' } } as const
