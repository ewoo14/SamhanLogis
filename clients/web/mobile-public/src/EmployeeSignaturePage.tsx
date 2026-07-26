/**
 * EmployeeSignaturePage — 모바일 공개 사원 서명 페이지 (NO-AUTH 토큰 게이트).
 *
 * 핸드오프 토큰(qrUrl 의 /s/:token)으로 진입 → design-system SignaturePad 손서명 →
 * POST /api/public/employee-signatures/{token}. 성공/만료(409 used·410 expired·404 무효) 화면.
 * UUID 비공개: 화면에 사원 식별자/UUID 미노출 — 토큰만.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, SignaturePad, type SignaturePadHandle } from '@samhan/design-system'
import * as api from './api'
import { WebVersionGate } from './version/WebVersionGate'
import { resolveBuildAppVersion } from './version/versionCheck'

type Phase = 'sign' | 'success' | 'expired'

const SIGNATURE_PAD_MAX_WIDTH = 440
const SIGNATURE_PAD_SIDE_PADDING = 32
const SIGNATURE_PAD_HEIGHT_RATIO = 0.625

function getSignaturePadSize(): { width: number; height: number } {
  const availableWidth =
    typeof window === 'undefined' ? 320 : Math.max(160, window.innerWidth - SIGNATURE_PAD_SIDE_PADDING)
  const width = Math.min(availableWidth, SIGNATURE_PAD_MAX_WIDTH)
  return { width, height: Math.round(width * SIGNATURE_PAD_HEIGHT_RATIO) }
}

function isExpiredError(err: unknown): boolean {
  const e = err as { response?: { status?: number } }
  const s = e?.response?.status
  return s === 409 || s === 410 || s === 404
}

function isRetryableSignatureError(err: unknown): boolean {
  const e = err as { response?: { status?: number } }
  const s = e?.response?.status
  return s === 400 || s === 422
}

export function EmployeeSignaturePage({ token, currentVersion }: { token: string; currentVersion?: string }) {
  const padRef = useRef<SignaturePadHandle>(null)
  const [empty, setEmpty] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [phase, setPhase] = useState<Phase>('sign')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [signatureSize, setSignatureSize] = useState(getSignaturePadSize)

  useEffect(() => {
    const handleResize = () => {
      setSignatureSize(getSignaturePadSize())
      setEmpty(true)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const wrap = (content: ReactNode) => (
    <WebVersionGate currentVersion={currentVersion ?? resolveBuildAppVersion(import.meta.env.VITE_APP_VERSION)} isDirty={() => !empty}>
      {content}
    </WebVersionGate>
  )

  if (!token) {
    return wrap(
      <main style={{ padding: 24, textAlign: 'center' }}>
        <p data-testid="mobile-signature-invalid-token">유효하지 않은 서명 링크입니다.</p>
      </main>
    )
  }
  if (phase === 'success') {
    return wrap(
      <main style={{ padding: 24, textAlign: 'center' }}>
        <p data-testid="mobile-signature-success" role="status" aria-live="polite">
          서명이 등록되었습니다. 창을 닫으셔도 됩니다.
        </p>
      </main>
    )
  }
  if (phase === 'expired') {
    return wrap(
      <main style={{ padding: 24, textAlign: 'center' }}>
        <p data-testid="mobile-signature-expired" role="alert">
          서명 링크가 만료되었거나 이미 사용되었습니다. 관리자에게 재발급을 요청하세요.
        </p>
      </main>
    )
  }

  const handleSubmit = async () => {
    const pad = padRef.current
    if (!pad) return
    const dataUrl = pad.toDataURL()
    if (!dataUrl) {
      setErrorMsg('서명 데이터를 가져올 수 없습니다.')
      return
    }
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const hash = await api.sha256OfDataUrl(dataUrl)
      await api.submitPublicSignature(token, { signaturePngBase64: dataUrl, signatureHash: hash })
      setPhase('success')
    } catch (err) {
      if (isExpiredError(err)) setPhase('expired')
      else if (isRetryableSignatureError(err)) {
        padRef.current?.clear()
        setEmpty(true)
        setErrorMsg('서명 이미지를 다시 그려주세요.')
      }
      else setErrorMsg('전송에 실패했습니다. 잠시 후 다시 시도해주세요.')
      setSubmitting(false)
    }
  }

  return wrap(
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <header style={{ marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-secondary)' }}>(주)삼한공조시스템</div>
      </header>
      <h1 style={{ fontSize: 18, textAlign: 'center' }}>사원 서명 등록</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-tertiary)', textAlign: 'center' }}>아래 영역에 서명한 후 등록을 눌러주세요.</p>
      <div data-testid="mobile-signature-pad-area" style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
        <SignaturePad
          key={`${signatureSize.width}x${signatureSize.height}`}
          ref={padRef}
          width={signatureSize.width}
          height={signatureSize.height}
          disabled={submitting}
          onChange={setEmpty}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="secondary" disabled={empty || submitting} onClick={() => { padRef.current?.clear(); setEmpty(true) }}>다시 서명</Button>
        <Button variant="primary" data-testid="mobile-signature-submit" disabled={empty || submitting} loading={submitting} onClick={() => void handleSubmit()}>등록</Button>
      </div>
      {errorMsg ? <div role="alert" style={{ color: 'var(--state-danger)', marginTop: 8 }}>{errorMsg}</div> : null}
    </main>
  )
}
