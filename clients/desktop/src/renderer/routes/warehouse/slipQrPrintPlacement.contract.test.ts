import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (relativePath: string) => readFileSync(resolve(__dirname, '..', relativePath), 'utf8')

describe('입고 전표 QR 출력 위치 계약', () => {
  it('QR 출력은 구매·차용 입고전표 상세 안에만 존재한다', () => {
    const detail = read('SlipDetailPage.tsx')
    const inventoryList = read('warehouse/StockInstanceListModal.tsx')
    const panel = read('components/SlipQrScanPanel.tsx')

    expect(detail).toContain('SlipQrPrintPanel')
    expect(panel).toContain('QRCode')
    expect(panel).toContain("new Set(['PURCHASE', 'BORROW', 'RENTAL_RETURN'])")
    expect(detail).toContain("mode === 'INBOUND'")
    expect(panel).toContain('window.print')
    expect(inventoryList).toContain("from 'qrcode'")
    expect(inventoryList).toContain('serial-qr-')
  })

  it('허용목록 밖의 입고 태그와 모든 출고 태그에는 QR 출력 동작을 만들지 않는다', () => {
    const detail = read('SlipDetailPage.tsx')
    const panel = read('components/SlipQrScanPanel.tsx')

    expect(detail).toContain('SlipQrPrintPanel')
    expect(panel).not.toContain("new Set(['PURCHASE', 'BORROW', 'RENTAL_RETURN', 'DELIVERY_RETURN'])")
    expect(panel).not.toContain("new Set(['SALE'")
    expect(panel).toContain("new Set(['PURCHASE', 'BORROW', 'RENTAL_RETURN'])")
  })
})
