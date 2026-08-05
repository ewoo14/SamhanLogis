import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('S2 pre-classify API contract', () => {
  it('Samhan desktop pre-classify client calls slip-service', () => {
    const source = readFileSync(resolve(__dirname, 'arologisDispatchApi.ts'), 'utf8')
    expect(source).toContain("'/admin/dispatches/pre-classify'")
    expect(source).not.toContain("'/admin/arologis/dispatches/pre-classify'")
  })
})
