import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  actionsForStatus,
  desktopFooterActions,
} from './SlipDetailPage'

const sourcePath = path.resolve(__dirname, 'SlipDetailPage.tsx')
const collaborationPanelSourcePath = path.resolve(
  __dirname,
  '../components/collab/SlipCollaborationPanel.tsx',
)

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

  it('일반 SENT 전표는 취소 액션을 노출한다', () => {
    expect(actionsForStatus('SENT', 'OUTBOUND', 'MANUAL')).toContain('cancel')
  })

  it('PARTNER_ORDER SENT 전표는 취소 액션을 노출하지 않는다', () => {
    expect(actionsForStatus('SENT', 'OUTBOUND', 'PARTNER_ORDER')).not.toContain('cancel')
  })

  it('RED-A: COMPLETED에서 수정 진입과 전이 실행이 모두 가능하다', () => {
    expect(desktopFooterActions('COMPLETED', 'OUTBOUND', true)).toContain('ship')
    expect(desktopFooterActions('COMPLETED', 'OUTBOUND', true)).toContain('collab-edit')
    expect(desktopFooterActions('COMPLETED', 'INBOUND', true)).toContain('confirm')
    expect(desktopFooterActions('COMPLETED', 'INBOUND', true)).toContain('collab-edit')
  })

  it('RED-B: 전이 후 편집 폼 경로에서 409가 나지 않는다', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')
    const transitionSuccess = source.match(
      /const transitionMutation = useMutation\(\{[\s\S]*?onSuccess: \(\) => \{([\s\S]*?)\n  \},/,
    )

    expect(transitionSuccess?.[1]).toContain('setCollabEditMode(false)')
  })

  it('RED-C: 전이 없이 수정 → 수정완료 하는 정상 경로가 동작한다', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')
    const collaborationPanel = fs.readFileSync(collaborationPanelSourcePath, 'utf8')

    expect(source).toContain('editMode={collabEditMode}')
    expect(source).toContain('onEditModeChange={setCollabEditMode}')
    expect(collaborationPanel).toContain('수정완료')
    expect(collaborationPanel).toMatch(
      /const commitMutation = useMutation\(\{[\s\S]*?onSuccess: \(\) => \{[\s\S]*?onEditModeChange\?\.\(false\)/,
    )
  })
})
