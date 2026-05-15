/**
 * Phase F (D-DF-06) — print-renderer 진입점.
 *
 * Playwright Chromium headless 가 본 entry 를 file:// URL 로 goto 한 후 query param 으로 데이터 주입.
 *
 * 쿼리 파라미터:
 * - slip        : base64url 인코딩된 SlipData JSON (PlaywrightCopyRenderer 가 직렬화)
 * - driverSig   : base64 PNG (서명 png 의 data URI body 부분만)
 * - recipientSig: base64 PNG
 *
 * slip 파라미터 누락 시 root 에 안내 텍스트 출력 (renderer 가 비어 있는 PNG 캡처를 피하도록 fail-fast).
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { PrintRendererApp, type SlipData } from './PrintRendererApp'

function decodeSlipParam(raw: string): SlipData {
  // base64url → base64 (Playwright Java 측에서 url-safe 인코딩 사용 가정).
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const json = atob(padded)
  // UTF-8 디코딩 (한글 보존) — atob 결과가 binary string 이므로 TextDecoder 로 변환.
  const bytes = Uint8Array.from(json, (c) => c.charCodeAt(0))
  const decoded = new TextDecoder('utf-8').decode(bytes)
  return JSON.parse(decoded) as SlipData
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('#root 가 print-renderer index.html 에 없음')
}

const params = new URLSearchParams(window.location.search)
const slipB64 = params.get('slip')
const driverSig = params.get('driverSig') ?? ''
const recipientSig = params.get('recipientSig') ?? ''

if (!slipB64) {
  rootEl.textContent = 'slip 파라미터 누락'
} else {
  let slipData: SlipData
  try {
    slipData = decodeSlipParam(slipB64)
  } catch (err) {
    rootEl.textContent = `slip 파라미터 디코딩 실패: ${(err as Error).message}`
    throw err
  }

  const root = createRoot(rootEl)
  root.render(
    <React.StrictMode>
      <PrintRendererApp
        slipData={slipData}
        driverSignatureBase64={driverSig}
        recipientSignatureBase64={recipientSig}
      />
    </React.StrictMode>,
  )
}
