import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('자동 생성 QR payload 계약', () => {
  it('QR에는 UUID 대신 시리얼키와 품목코드가 함께 들어간다', () => {
    const source = readFileSync(resolve(__dirname, '..', 'components', 'SlipQrScanPanel.tsx'), 'utf8')

    expect(source).toContain('productCode')
    expect(source).toContain('serialKey')
    expect(source).toContain('<SerialQr value={`${item.serialKey} ${item.productCode}`}')
    expect(source).not.toContain('instanceId')
  })
})
