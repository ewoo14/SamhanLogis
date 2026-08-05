import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  actionsForStatus,
  classifyTransitionConflict,
  desktopFooterActions,
  isCollabEditStatus,
  isDirectEditStatus,
  transitionConflictEditPolicy,
  transitionDestinationStatus,
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
      /const transitionMutation = useMutation\(\{[\s\S]*?onSuccess: \([\s\S]*?\) => \{([\s\S]*?)\n  \},/,
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

  it('RED-1: 저장 가능한 협업 입력은 전이 시 보존하거나 명시적으로 폐기 확인한다', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')
    const collaborationPanel = fs.readFileSync(collaborationPanelSourcePath, 'utf8')

    expect(source).toContain('onDirtyChange={setCollabEditDirty}')
    expect(source).toContain('transitionDiscardRef')
    expect(source).toContain('저장되지 않은 편집 내용')
    expect(collaborationPanel).toContain('onDirtyChange')
    expect(collaborationPanel).toContain('editBlockedReason')
  })

  it('RED-2: 전이 성공 시 직접수정·기사 표면도 이전 상태 저장 409 경로를 닫는다', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')
    const transitionSuccess = source.match(
      /const transitionMutation = useMutation\(\{[\s\S]*?onSuccess: \([\s\S]*?\) => \{([\s\S]*?)\n  \},/,
    )

    expect(transitionSuccess?.[1]).toContain('setSalesEditOpen(false)')
    expect(transitionSuccess?.[1]).toContain('setPurchaseEditOpen(false)')
    expect(transitionSuccess?.[1]).toContain('setEditingDriver(false)')
    expect(source).toContain('if (salesEditStale)')
    expect(source).toContain('if (editingDriverStale)')
  })

  it('RED-3: 타 브라우저의 status 변경도 열린 편집 표면을 stale 저장 불가 상태로 수렴시킨다', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')
    const collaborationPanel = fs.readFileSync(collaborationPanelSourcePath, 'utf8')

    expect(source).toContain('previousSlipStatusRef')
    expect(source).toContain('setCollabEditBlockedReason')
    expect(source).toContain('setSalesEditStale')
    expect(source).toContain('setPurchaseEditStale')
    expect(collaborationPanel).toContain('editBlockedReason')
    expect(collaborationPanel).toContain('disabled={Boolean(editBlockedReason)}')
  })

  it('RED-4: 전이 실패에서는 discard 조정 플래그만 되돌리고 폼을 닫지 않는다', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')
    const transitionMutation = source.match(
      /const transitionMutation = useMutation\(\{([\s\S]*?)\n  \}\)/,
    )

    expect(transitionMutation?.[1]).toContain('onError')
    expect(transitionMutation?.[1]).toContain('transitionDiscardRef.current = false')
    expect(transitionMutation?.[1]).toContain("error.response?.status === 409")
    expect(transitionMutation?.[1]).toContain('void refetchDetail()')
    expect(transitionMutation?.[1]).not.toMatch(/onError:[\s\S]*set(?:Sales|Purchase)EditOpen\(false\)/)
  })

  it('R30: 전이 10종 × 편집 표면 3종 × 본인/타인 조정 정책을 전수 고정한다', () => {
    const cases: Array<[
      Parameters<typeof transitionDestinationStatus>[0],
      ReturnType<typeof transitionDestinationStatus>,
    ]> = [
      ['send', 'SENT'],
      ['accept', 'ACCEPTED'],
      ['reject', 'REJECTED'],
      ['process', 'PROCESSING'],
      ['complete', 'INSPECTING'],
      ['inspect', 'COMPLETED'],
      ['ship', 'SHIPPING'],
      ['deliver', 'DELIVERED'],
      ['confirm', 'CONFIRMED'],
      ['cancel', 'CANCELED'],
    ]

    const surfaces = ['direct', 'driver', 'collab'] as const
    const actors = ['self', 'other'] as const
    const matrix = cases.flatMap(([action, destination]) => actors.flatMap((actor) => surfaces.map((surface) => ({
      action,
      destination,
      actor,
      surface,
    }))))

    expect(matrix).toHaveLength(60)
    for (const { action, destination, actor, surface } of matrix) {
      expect(transitionDestinationStatus(action)).toBe(destination)
      // 본인 전이 성공과 타인 SSE 전이는 같은 도착 status 정책을 사용한다.
      const saveRemainsValid = surface === 'collab'
        ? isCollabEditStatus(destination)
        : isDirectEditStatus(destination)
      expect(saveRemainsValid, `${actor}/${surface}/${action}`).toBe(
        surface === 'collab'
          ? !['REJECTED', 'SHIPPING', 'DELIVERED', 'CANCELED'].includes(destination)
          : false,
      )
    }
  })

  it('R32 RED-A: 진짜 동시 전이는 종전 문구·stale/blocked를 유지하고 비-409 처리는 변하지 않는다', () => {
    const concurrent409Messages = [
      '전이 가능한 상태가 아닙니다: 현재 수락완료, 필요 전송완료',
      '동시 수정 충돌 — 다시 시도해 주세요',
    ]

    for (const message of concurrent409Messages) {
      const concurrent409 = {
        isAxiosError: true,
        response: {
          status: 409,
          data: { code: 'CONFLICT', message },
        },
      }

      expect(classifyTransitionConflict(concurrent409)).toBe('concurrent')
    }
    expect(transitionConflictEditPolicy('concurrent')).toEqual({
      message: '다른 사용자가 먼저 전표를 전이했습니다. 현재 편집 내용은 저장할 수 없습니다. 내용을 복사한 뒤 취소하세요.',
      blockEditSurfaces: true,
    })

    for (const status of [400, 403, 500]) {
      expect(classifyTransitionConflict({ isAxiosError: true, response: { status } })).toBe('other')
    }

    const openSurfaces = ['direct', 'driver', 'collab'] as const
    const transitionKinds = ['save', 'send', 'accept', 'process', 'complete', 'inspect', 'ship', 'deliver', 'confirm', 'cancel'] as const
    for (const transition of transitionKinds) {
      for (const surface of openSurfaces) {
        expect(transitionConflictEditPolicy('concurrent').blockEditSurfaces,
          `${transition}/${surface}`).toBe(true)
      }
    }
  })

  it('R32 RED-B: 재고 부족 409는 업무 실패로 안내하고 직접·기사·협업 입력을 잠그지 않는다', () => {
    const stock409 = {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          code: 'CONFLICT',
          message: 'inventory-service 호출 실패(CONFLICT): {"success":false,"code":"CONFLICT","message":"재고 부족: 가용 0, 필요 1"}',
        },
      },
    }

    expect(classifyTransitionConflict(stock409)).toBe('inventory')
    expect(transitionConflictEditPolicy('inventory')).toEqual({
      message: '재고가 부족하여 전표를 수락할 수 없습니다. 재고를 확인한 뒤 다시 시도하세요.',
      blockEditSurfaces: false,
    })

    const openSurfaces = ['direct', 'driver', 'collab'] as const
    const transitionKinds = ['accept', 'complete'] as const
    for (const transition of transitionKinds) {
      for (const surface of openSurfaces) {
        expect(transitionConflictEditPolicy('inventory').blockEditSurfaces,
          `${transition}/${surface}`).toBe(false)
      }
    }
  })
})
