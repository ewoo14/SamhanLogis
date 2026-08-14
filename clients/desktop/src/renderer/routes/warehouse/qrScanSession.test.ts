import { describe, expect, it } from 'vitest'
import {
  addScannedItem,
  createInitialQrScanState,
  getScanRejectionMessage,
  type QrScanItem,
} from './qrScanSession'

const item = (serialKey = 'SI-00012', productCode = 'OUT-001'): QrScanItem => ({
  serialKey,
  productCode,
})

describe('QR scan session', () => {
  it('부자재는 대상 품목이 아니라는 이유를 그대로 보여준다', () => {
    expect(getScanRejectionMessage('NON_SERIAL_MANAGED')).toContain('실외기·실내기·판넬')
  })

  it.each([
    ['PRODUCT_MISMATCH', '품목이 전표와 일치하지 않습니다'],
    ['DUPLICATE_SCAN', '이미 스캔한 시리얼키입니다'],
    ['SERIAL_NOT_FOUND', '시리얼키를 찾을 수 없습니다'],
    ['ALREADY_SHIPPED', '이미 출고된 개체입니다'],
    ['NON_SERIAL_MANAGED', '시리얼 관리 대상이 아닙니다'],
    ['SLIP_NOT_FOUND', '전표를 찾을 수 없습니다'],
  ] as const)('서버 거부 사유 %s를 뭉개지 않는다', (reason, message) => {
    expect(getScanRejectionMessage(reason)).toContain(message)
  })

  it('연속 스캔은 확정 전 목록에만 쌓이고 중복은 추가하지 않는다', () => {
    const initial = createInitialQrScanState()
    const afterFirst = addScannedItem(initial, item())
    const afterSecond = addScannedItem(afterFirst, item('SI-00013'))
    const afterDuplicate = addScannedItem(afterSecond, item())

    expect(afterSecond.items).toHaveLength(2)
    expect(afterDuplicate.items).toHaveLength(2)
    expect(afterDuplicate.confirmed).toBe(false)
    expect(afterDuplicate.rejection?.code).toBe('DUPLICATE_SCAN')
  })
})
