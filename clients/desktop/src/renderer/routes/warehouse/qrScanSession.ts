export type ScanDirection = 'INBOUND' | 'OUTBOUND'
export type ScanRejectionCode =
  | 'PRODUCT_MISMATCH'
  | 'DUPLICATE_SCAN'
  | 'SERIAL_NOT_FOUND'
  | 'ALREADY_SHIPPED'
  | 'NON_SERIAL_MANAGED'
  | 'SLIP_NOT_FOUND'

export interface QrScanItem {
  serialKey: string
  productCode: string
}

export interface QrScanRejection {
  code: ScanRejectionCode
  message: string
}

export interface QrScanState {
  direction: ScanDirection
  slipNo: string
  items: QrScanItem[]
  rejection: QrScanRejection | null
  confirmed: boolean
}

export function createInitialQrScanState(): QrScanState {
  return { direction: 'OUTBOUND', slipNo: '', items: [], rejection: null, confirmed: false }
}

const REJECTION_MESSAGES: Record<ScanRejectionCode, string> = {
  PRODUCT_MISMATCH: '품목이 전표와 일치하지 않습니다.',
  DUPLICATE_SCAN: '이미 스캔한 시리얼키입니다.',
  SERIAL_NOT_FOUND: '시리얼키를 찾을 수 없습니다.',
  ALREADY_SHIPPED: '이미 출고된 개체입니다.',
  NON_SERIAL_MANAGED: '시리얼 관리 대상이 아닙니다. 대상 품목은 실외기·실내기·판넬뿐입니다.',
  SLIP_NOT_FOUND: '전표를 찾을 수 없습니다.',
}

export function getScanRejectionMessage(code: ScanRejectionCode): string {
  return REJECTION_MESSAGES[code]
}

export function addScannedItem(state: QrScanState, item: QrScanItem): QrScanState {
  if (state.items.some((existing) => existing.serialKey === item.serialKey)) {
    return { ...state, rejection: { code: 'DUPLICATE_SCAN', message: getScanRejectionMessage('DUPLICATE_SCAN') } }
  }
  return { ...state, items: [...state.items, item], rejection: null }
}

export function parseScannerValue(value: string): QrScanItem | null {
  const [serialKey, productCode] = value.trim().split(/[|,\s]+/, 2)
  if (!serialKey || !productCode || !/^SI-[A-Z0-9]+$/i.test(serialKey)) return null
  return { serialKey, productCode }
}

