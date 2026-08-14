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
    expect(panel).toContain('BORROW')
    expect(detail).toContain("mode === 'INBOUND'")
    expect(panel).toContain('window.print')
    expect(inventoryList).not.toContain("from 'qrcode'")
    expect(inventoryList).not.toContain('serial-qr-')
  })

  it('반품·회차 입고전표에는 QR 출력 동작을 만들지 않는다', () => {
    const detail = read('SlipDetailPage.tsx')
    const panel = read('components/SlipQrScanPanel.tsx')

    expect(detail).toContain('SlipQrPrintPanel')
    expect(panel).toContain('RETURN')
    expect(panel).toContain('RETURN_TRIP')
  })
})
