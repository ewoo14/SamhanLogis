import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { Badge, Button, Card } from '@samhan/design-system'
import { confirmQrScan, listInboundQrInstances, type InboundQrInstanceRow } from '../../api/inventory'
import { addScannedItem, parseScannerValue, type QrScanState } from '../warehouse/qrScanSession'
import { extractScanError } from '../warehouse/qrScanError'

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>
}

function CameraScanner({ onValue }: { onValue: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    let stream: MediaStream | null = null
    let timer: number | undefined
    let disposed = false
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) return
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      if (disposed || !videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      const Detector = (window as Window & { BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector
      if (!Detector) return
      const detector = new Detector({ formats: ['qr_code'] })
      const tick = async () => {
        if (disposed || !videoRef.current) return
        const result = await detector.detect(videoRef.current)
        const value = result[0]?.rawValue
        if (value) onValue(value)
        timer = window.setTimeout(() => void tick(), 250)
      }
      await tick()
    }
    void start().catch(() => setOpen(false))
    return () => {
      disposed = true
      if (timer !== undefined) window.clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [onValue, open])

  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <Button type="button" variant="secondary" onClick={() => setOpen((current) => !current)}>{open ? '카메라 닫기' : '휴대폰 카메라 열기'}</Button>
    <input type="file" accept="image/*" capture="environment" aria-label="카메라 사진으로 QR 스캔" onChange={() => undefined} />
    {open ? <video ref={videoRef} muted playsInline style={{ width: 220, maxWidth: '100%', borderRadius: 8 }} aria-label="QR 카메라 미리보기" /> : null}
  </div>
}

function SerialQr({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvasRef.current) void QRCode.toCanvas(canvasRef.current, value, { width: 112, margin: 1 }).catch(() => undefined)
  }, [value])
  return <canvas ref={canvasRef} data-testid={`slip-qr-${value}`} aria-label={`${value} QR 코드`} />
}

export function SlipQrScanPanel({ slipNo, canScan }: { slipNo: string; canScan: boolean }) {
  const [input, setInput] = useState('')
  const [state, setState] = useState<QrScanState>({ direction: 'OUTBOUND', slipNo, items: [], rejection: null, confirmed: false })
  const inputRef = useRef<HTMLInputElement>(null)
  const mutation = useMutation({
    mutationFn: () => confirmQrScan('OUTBOUND', { slipNo, items: state.items }),
    onSuccess: () => setState((current) => ({ ...current, confirmed: true, rejection: null })),
    onError: (error) => setState((current) => ({ ...current, rejection: extractScanError(error) })),
  })
  const handleCameraValue = useCallback((value: string) => {
    setInput(value)
    window.setTimeout(() => inputRef.current?.form?.requestSubmit(), 0)
  }, [])

  const scan = (event: FormEvent) => {
    event.preventDefault()
    const item = parseScannerValue(input)
    setInput('')
    if (!item) {
      setState((current) => ({ ...current, rejection: { code: 'SERIAL_NOT_FOUND', message: 'QR에는 시리얼키와 품목코드가 필요합니다. 예: SI-00012 OUT-001' } }))
      return
    }
    setState((current) => addScannedItem({ ...current, slipNo }, item))
  }

  if (!canScan) return null
  return <Card padding={4} shadow="sm" data-testid="slip-qr-scan-panel" style={{ marginTop: 16 }}>
    <h3 style={{ marginTop: 0 }}>출고 QR 스캔</h3>
    <p>현재 전표번호 <strong>{slipNo}</strong>에 귀속하여 스캔합니다. 확정 전에는 재고가 변하지 않습니다.</p>
    <form onSubmit={scan} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 240 }}>휴대폰 카메라 또는 연결 스캐너
        <input ref={inputRef} aria-label="출고 QR 스캔 입력" value={input} onChange={(event) => setInput(event.target.value)} placeholder="카메라/스캐너 결과를 입력하세요" autoComplete="off" disabled={mutation.isPending || state.confirmed} />
      </label>
      <Button type="submit" variant="primary" disabled={!input.trim() || mutation.isPending || state.confirmed}>스캔</Button>
    </form>
    <CameraScanner onValue={handleCameraValue} />
    {state.rejection ? <div role="alert" style={{ color: 'var(--color-danger-strong)', marginTop: 8 }}>{state.rejection.message}</div> : null}
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12, alignItems: 'center' }}>
      <span>{state.items.length}건 · 전부 되거나 전부 취소</span>
      <Button variant="primary" onClick={() => mutation.mutate()} disabled={!state.items.length || mutation.isPending || state.confirmed}>{state.confirmed ? '확정 완료' : '전체 출고 확정'}</Button>
    </div>
    {state.items.length ? <ul>{state.items.map((item) => <li key={item.serialKey}><code>{item.serialKey}</code> · {item.productCode}<Badge variant="success">검증 대기</Badge></li>)}</ul> : null}
  </Card>
}

export function SlipQrPrintPanel({ slipNo, deliveryTag }: { slipNo: string; deliveryTag: string | null }) {
  const blocked = deliveryTag === 'RETURN' || deliveryTag === 'RETURN_TRIP'
  const allowed = !blocked && (deliveryTag === 'PURCHASE' || deliveryTag === 'BORROW')
  const [instances, setInstances] = useState<InboundQrInstanceRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const rows = await listInboundQrInstances(slipNo)
      setInstances(rows)
    } finally {
      setLoading(false)
    }
  }

  if (!allowed) return null
  return <Card padding={4} shadow="sm" data-testid="slip-qr-print-panel" style={{ marginTop: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <div><h3 style={{ margin: 0 }}>QR 라벨 출력</h3><p style={{ marginBottom: 0 }}>구매·차용 입고로 생성된 인스턴스의 라벨을 출력합니다.</p></div>
      <Button variant="secondary" onClick={() => void load()} disabled={loading}>{loading ? '불러오는 중…' : 'QR 불러오기'}</Button>
    </div>
    {instances.length ? <div className="slip-qr-print-grid">{instances.map((item) => <div className="slip-qr-print-label" key={`${item.serialKey}-${item.productCode}`}><SerialQr value={`${item.serialKey} ${item.productCode}`} /><strong>{item.serialKey}</strong><span>{item.productCode}</span></div>)}</div> : <p>출력할 QR을 불러오세요.</p>}
    {instances.length ? <Button variant="primary" onClick={() => window.print()}>QR 라벨 출력</Button> : null}
  </Card>
}
