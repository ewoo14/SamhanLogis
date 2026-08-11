import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dcConfigSource = readFileSync(
  fileURLToPath(new URL('./SalesPartnerDcConfigPage.tsx', import.meta.url)),
  'utf8',
)
const slipDetailSource = readFileSync(
  fileURLToPath(new URL('./SlipDetailPage.tsx', import.meta.url)),
  'utf8',
)

function sourceBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start, `source marker not found: ${startMarker}`).toBeGreaterThanOrEqual(0)
  expect(end, `source marker not found: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('PR #1134 R9·R10 version history contracts', () => {
  it('R9: DC 저장 성공은 선택 거래처 audit cache도 무효화한다', () => {
    const saveMutation = sourceBlock(dcConfigSource, 'const saveMutation = useMutation', 'const items = useMemo')

    expect(saveMutation).toContain("queryKey: ['partner-dc-config']")
  })

  it.each([
    ['memo', 'slip-detail-audit-overlay-memo'],
    ['shippingAddress', 'slip-detail-audit-overlay-shippingAddress'],
  ])('R10: %s overlay는 audit query 상태를 전달한다', (field, containerTestId) => {
    const container = sourceBlock(slipDetailSource, `data-testid="${containerTestId}"`, '</div>')
    const overlay = sourceBlock(container, `<AuditOverlay\n`, '/>,')

    expect(overlay).toContain('isError={auditLogsQuery.isError}')
    expect(overlay).toContain('isFetched={auditLogsQuery.isFetched}')
    expect(overlay).toContain('isLoading={auditLogsQuery.isLoading}')
    expect(overlay).toContain(`field="${field}"`)
  })
})
