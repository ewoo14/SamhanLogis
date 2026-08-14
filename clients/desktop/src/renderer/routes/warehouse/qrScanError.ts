import type { QrScanRejection } from './qrScanSession'

const codeMap: Record<string, QrScanRejection['code']> = {
  PRODUCT_MISMATCH: 'PRODUCT_MISMATCH', DUPLICATE_SCAN: 'DUPLICATE_SCAN', SERIAL_NOT_FOUND: 'SERIAL_NOT_FOUND',
  ALREADY_SHIPPED: 'ALREADY_SHIPPED', NON_SERIAL_MANAGED: 'NON_SERIAL_MANAGED', SLIP_NOT_FOUND: 'SLIP_NOT_FOUND',
}

export function extractScanError(error: unknown): QrScanRejection {
  const candidate = error as { response?: { data?: { code?: string; message?: string; data?: { code?: string; message?: string } } }; message?: string }
  const body = candidate.response?.data
  const nested = body?.data
  const rawCode = nested?.code ?? body?.code
  const code = (rawCode ? codeMap[rawCode] : undefined) ?? 'SERIAL_NOT_FOUND'
  return { code, message: nested?.message ?? body?.message ?? candidate.message ?? '서버가 반환한 거부 사유를 확인할 수 없습니다.' }
}
