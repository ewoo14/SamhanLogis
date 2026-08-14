import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rendererRoot = resolve(__dirname, '../..')
const read = (relativePath: string) => readFileSync(resolve(rendererRoot, relativePath), 'utf8')

describe('QR 수명주기 정정 계약', () => {
  it('독립 QR 스캔 라우트와 메뉴를 노출하지 않는다', () => {
    const routes = read('routes/index.tsx')
    const layout = read('components/AppLayout.tsx')

    expect(routes).not.toContain("path: '/inventory/qr-scan'")
    expect(routes).not.toContain("import { QrScanPage }")
    expect(layout).not.toContain('QR 스캔 입출고')
    expect(layout).not.toContain('/inventory/qr-scan')
  })

  it('출고전표 상세 안에만 출고 QR 스캔 영역을 둔다', () => {
    const detail = read('routes/SlipDetailPage.tsx')
    const panel = read('routes/components/SlipQrScanPanel.tsx')

    expect(detail).toContain('SlipQrScanPanel')
    expect(panel).toContain('confirmQrScan')
    expect(panel).toContain("'OUTBOUND'")
    expect(detail).toContain('slipNo')
    expect(panel).not.toContain('listSlips({ slipType')
    expect(panel).toContain('getUserMedia')
    expect(panel).toContain('BarcodeDetector')
    expect(panel).toContain('capture="environment"')
  })
})
