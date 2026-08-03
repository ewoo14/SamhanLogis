import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sourcePath = path.resolve(__dirname, 'SlipDetailPage.tsx')

describe('SlipDetailPage lifecycle contract', () => {
  it('PROCESSING action calls the backend complete transition to enter INSPECTING', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')

    expect(source).toMatch(/case 'PROCESSING':\s*return \['complete'\]/)
    expect(source).toContain('PROCESSING → complete (재고 반영 후 검수 대기 — BE complete endpoint)')
  })

  it('INSPECTING action calls the backend inspect transition to enter COMPLETED', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')

    expect(source).toMatch(/case 'INSPECTING':\s*return \['inspect', 'reject'\]/)
    expect(source).toContain("inspect: '처리 완료'")
  })

  it('INSPECTING exposes both inspect and reject actions allowed by Slip', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')

    expect(source).toMatch(/case 'INSPECTING':\s*return \['inspect', 'reject'\]/)
    expect(source).toContain('possibleActions.includes(\'reject\')')
  })

  it('PROCESSING primary action explains inventory application before inspection', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')

    expect(source).toContain("? '재고 반영 후 검수 대기'")
    expect(source).not.toContain("? '검수 시작'")
  })

  it('does not replace the backend INBOUND-only inspection permission guard', () => {
    const controllerPath = path.resolve(
      __dirname,
      '../../../../../services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java',
    )
    const controller = fs.readFileSync(controllerPath, 'utf8')

    expect(controller).toContain('if (SlipType.INBOUND.equals(slipType))')
    expect(controller).toContain('requireAccountPermission(callerHeader, INBOUND_INSPECTION_PAGE_CODE, PermissionAction.UPDATE)')
  })
})
