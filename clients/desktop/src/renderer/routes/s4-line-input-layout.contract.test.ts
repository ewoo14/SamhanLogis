import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const globalCss = readFileSync(resolve(__dirname, '../styles/global.css'), 'utf8')
const estimateSource = readFileSync(resolve(__dirname, 'EstimateFormPage.tsx'), 'utf8')

describe('S4 line input layout contract', () => {
  it('gives slip rows a real gap and removes the visual sum column without changing input order', () => {
    expect(globalCss).toMatch(/\.sfp-line-table[\s\S]{0,500}column-gap:\s*8px/)
    expect(globalCss).toMatch(/\.sfp-line-table[\s\S]{0,500}--col-sum:\s*0px/)
  })

  it('keeps estimate line inputs in a fixed-height, gapped grid', () => {
    expect(estimateSource).toContain('className="estimate-line-input-grid"')
    expect(globalCss).toMatch(/\.estimate-line-input-grid[\s\S]{0,300}grid-auto-rows:\s*minmax\(40px, auto\)/)
  })
})
