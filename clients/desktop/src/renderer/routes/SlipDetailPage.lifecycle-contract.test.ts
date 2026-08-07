import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  actionsForStatus,
  canAccessSlipAction,
  canOpenDirectEdit,
  canOpenCollabEdit,
  canSoftDeleteSlip,
  classifyTransitionConflict,
  desktopFooterActions,
  editSurfaceEntryAvailability,
  isCollabEditStatus,
  isDirectEditStatus,
  slipActionPermissionRequirements,
  transitionActionLabel,
  transitionConflictEditPolicy,
  transitionDestinationStatus,
} from './SlipDetailPage'
import type { SlipTransitionAction } from './SlipDetailPage'

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
    expect(transitionActionLabel('PROCESSING', 'complete', 'OUTBOUND'))
      .toBe('재고 반영 후 검수 대기 (출고 완료)')
    expect(transitionActionLabel('PROCESSING', 'complete', 'INBOUND'))
      .toBe('재고 반영 후 검수 대기 (입고 완료)')
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
    expect(transitionConflictEditPolicy('inventory', 'complete')).toEqual({
      message: '재고가 부족하여 전표를 검수 대기 상태로 전환할 수 없습니다. 재고를 확인한 뒤 다시 시도하세요.',
      blockEditSurfaces: false,
    })
    expect(transitionConflictEditPolicy('inventory', 'complete').message).not.toContain('수락')

    const openSurfaces = ['direct', 'driver', 'collab'] as const
    const transitionKinds = ['accept', 'complete'] as const
    for (const transition of transitionKinds) {
      for (const surface of openSurfaces) {
        expect(transitionConflictEditPolicy('inventory').blockEditSurfaces,
          `${transition}/${surface}`).toBe(false)
      }
    }
  })

  it('R33 RED-A/B: 전표 유형별 서버 권한 요구사항과 화면 활성 조건을 일치시킨다', () => {
    expect(slipActionPermissionRequirements('save', 'INBOUND')).toEqual([
      { pageCode: 'purchases.slip.edit', action: 'update' },
    ])
    expect(slipActionPermissionRequirements('send', 'INBOUND')).toEqual([
      { pageCode: 'purchases.slip.edit', action: 'update' },
    ])
    expect(slipActionPermissionRequirements('cancel', 'INBOUND')).toEqual([
      { pageCode: 'purchases.slip.edit', action: 'update' },
    ])
    expect(slipActionPermissionRequirements('confirm', 'INBOUND')).toEqual([
      { pageCode: 'purchases.slip.edit', action: 'update' },
    ])
    expect(slipActionPermissionRequirements('inspect', 'INBOUND')).toEqual([
      { pageCode: 'slip.transfer.process', action: 'update' },
      { pageCode: 'inbound.inspection', action: 'update' },
    ])
    expect(slipActionPermissionRequirements('inspect', 'OUTBOUND')).toEqual([
      { pageCode: 'slip.transfer.process', action: 'update' },
    ])

    const managerInbound = (pageCode: string, action = 'view') =>
      pageCode === 'slip.transfer.process' && action === 'update'
    const warehouseInbound = (pageCode: string, action = 'view') =>
      ['purchases.slip.edit', 'slip.transfer.process', 'inbound.inspection'].includes(pageCode)
      && action === 'update'
    const managerOutbound = () => true
    const denied = () => false

    expect(canAccessSlipAction('inspect', 'INBOUND', managerInbound)).toBe(false)
    expect(canAccessSlipAction('inspect', 'INBOUND', managerInbound, true)).toBe(false)
    expect(canAccessSlipAction('inspect', 'OUTBOUND', denied, true)).toBe(true)
    expect(canAccessSlipAction('save', 'INBOUND', managerInbound, true)).toBe(false)
    expect(canAccessSlipAction('save', 'INBOUND', warehouseInbound)).toBe(true)
    expect(canAccessSlipAction('send', 'INBOUND', warehouseInbound)).toBe(true)
    expect(canAccessSlipAction('cancel', 'INBOUND', warehouseInbound)).toBe(true)
    expect(canAccessSlipAction('confirm', 'INBOUND', warehouseInbound)).toBe(true)
    expect(canAccessSlipAction('save', 'INBOUND', denied)).toBe(false)

    for (const action of [
      'save', 'send', 'accept', 'process', 'complete', 'inspect',
      'ship', 'deliver', 'confirm', 'cancel',
    ] as const) {
      expect(
        canAccessSlipAction(action, 'OUTBOUND', managerOutbound, action === 'inspect'),
        action,
      ).toBe(true)
    }
  })

  it('R33 RED-A/B: 대표 역할별 INBOUND·OUTBOUND 전이 권한 차집합이 0이다', () => {
    const permissionsByRole: Record<string, Set<string>> = {
      MANAGER: new Set([
        'purchases.slip.edit:update', 'purchases.slip.delete:delete',
        'sales.slip.edit:update', 'sales.slip.edit:delete',
        'slip.transfer.process:update', 'sales.slip.confirm:update',
        'slip.reject:update', 'sales.slip.cancel:update',
      ]),
      SALES: new Set(['sales.slip.edit:update', 'sales.slip.cancel:update']),
      WAREHOUSE: new Set([
        'purchases.slip.edit:update', 'purchases.slip.delete:delete',
        'slip.transfer.process:update', 'inbound.inspection:update',
      ]),
      ACCOUNTANT: new Set(['sales.slip.confirm:update']),
    }
    const canAccessFor = (role: string) => (pageCode: string, action = 'view') =>
      permissionsByRole[role].has(`${pageCode}:${action}`)
    const actionsByMode: Record<'INBOUND' | 'OUTBOUND', readonly SlipTransitionAction[]> = {
      INBOUND: [
        'save', 'send', 'accept', 'process', 'complete', 'inspect',
        'confirm', 'reject', 'cancel',
      ],
      OUTBOUND: [
        'save', 'send', 'accept', 'process', 'complete', 'inspect',
        'ship', 'deliver', 'confirm', 'reject', 'cancel',
      ],
    }
    const expected: Record<string, Record<'INBOUND' | 'OUTBOUND', string[]>> = {
      MANAGER: {
        INBOUND: ['save', 'send', 'accept', 'process', 'complete', 'confirm', 'reject', 'cancel'],
        OUTBOUND: ['save', 'send', 'accept', 'process', 'complete', 'ship', 'deliver', 'confirm', 'reject', 'cancel'],
      },
      SALES: {
        INBOUND: [],
        OUTBOUND: ['save', 'send', 'cancel'],
      },
      WAREHOUSE: {
        INBOUND: ['save', 'send', 'accept', 'process', 'complete', 'inspect', 'confirm', 'cancel'],
        OUTBOUND: ['accept', 'process', 'complete', 'ship', 'deliver'],
      },
      ACCOUNTANT: {
        INBOUND: [],
        OUTBOUND: ['confirm'],
      },
    }

    for (const [role, byMode] of Object.entries(expected)) {
      for (const mode of ['INBOUND', 'OUTBOUND'] as const) {
        for (const action of actionsByMode[mode]) {
          expect(
            canAccessSlipAction(action, mode, canAccessFor(role)),
            `${role}/${mode}/${action}`,
          ).toBe(byMode[mode].includes(action))
        }
      }
    }

    const surfacePermissionsByRole: Record<string, Set<string>> = {
      MANAGER: new Set([
        'purchases.slip.edit:update', 'purchases.slip.delete:delete',
        'sales.slip.edit:update', 'sales.slip.edit:delete', 'slip.audit-overlay:update',
      ]),
      SALES: new Set(['sales.slip.edit:update', 'sales.slip.edit:delete', 'slip.audit-overlay:update']),
      WAREHOUSE: new Set([
        'purchases.slip.edit:update', 'purchases.slip.delete:delete', 'slip.audit-overlay:update',
      ]),
      ACCOUNTANT: new Set(['sales.slip.confirm:update']),
    }
    const surfaceAccessFor = (role: string) => (pageCode: string, action = 'view') =>
      surfacePermissionsByRole[role].has(`${pageCode}:${action}`)
    const expectedSurfaceAccess: Record<string, Record<'INBOUND' | 'OUTBOUND', {
      directEdit: boolean
      softDelete: boolean
      collab: boolean
    }>> = {
      MANAGER: {
        INBOUND: { directEdit: true, softDelete: true, collab: true },
        OUTBOUND: { directEdit: true, softDelete: true, collab: true },
      },
      SALES: {
        INBOUND: { directEdit: false, softDelete: false, collab: true },
        OUTBOUND: { directEdit: true, softDelete: true, collab: true },
      },
      WAREHOUSE: {
        INBOUND: { directEdit: true, softDelete: true, collab: true },
        OUTBOUND: { directEdit: false, softDelete: false, collab: true },
      },
      ACCOUNTANT: {
        INBOUND: { directEdit: false, softDelete: false, collab: false },
        OUTBOUND: { directEdit: false, softDelete: false, collab: false },
      },
    }
    for (const [role, byMode] of Object.entries(expectedSurfaceAccess)) {
      for (const mode of ['INBOUND', 'OUTBOUND'] as const) {
        const canAccess = surfaceAccessFor(role)
        expect(canOpenDirectEdit(mode, 'DRAFT', canAccess), `${role}/${mode}/direct-edit`).toBe(byMode[mode].directEdit)
        expect(canOpenDirectEdit(mode, 'SAVED', canAccess), `${role}/${mode}/direct-edit-saved`).toBe(byMode[mode].directEdit)
        expect(canSoftDeleteSlip(mode, 'DRAFT', canAccess), `${role}/${mode}/soft-delete`).toBe(byMode[mode].softDelete)
        expect(canSoftDeleteSlip(mode, 'SAVED', canAccess), `${role}/${mode}/soft-delete-saved`).toBe(byMode[mode].softDelete)
        expect(canOpenCollabEdit('DRAFT', byMode[mode].collab), `${role}/${mode}/collab-draft`).toBe(byMode[mode].collab)
        expect(canOpenCollabEdit('SAVED', byMode[mode].collab), `${role}/${mode}/collab-saved`).toBe(byMode[mode].collab)
        for (const status of ['SHIPPING', 'DELIVERED', 'CANCELED', 'REJECTED'] as const) {
          expect(canOpenDirectEdit(mode, status, canAccess), `${role}/${mode}/${status}/direct-edit`).toBe(false)
          expect(canSoftDeleteSlip(mode, status, canAccess), `${role}/${mode}/${status}/soft-delete`).toBe(false)
          expect(canOpenCollabEdit(status, byMode[mode].collab), `${role}/${mode}/${status}/collab`).toBe(false)
        }
      }
    }
  })

  it('R33 RED-B3: 직접수정 권한이 있어도 DRAFT/SAVED 협업수정 진입점이 있고 종결 상태는 닫혀 있다', () => {
    for (const status of ['DRAFT', 'SAVED'] as const) {
      expect(canOpenCollabEdit(status, true)).toBe(true)
    }
    for (const status of ['SHIPPING', 'DELIVERED', 'CANCELED', 'REJECTED'] as const) {
      expect(canOpenCollabEdit(status, true)).toBe(false)
    }

    const source = fs.readFileSync(sourcePath, 'utf8')
    const collabEntry = source.match(
      /data-testid="slip-collab-edit-open"[\s\S]{0,300}/,
    )?.[0] ?? ''
    expect(collabEntry).toContain('협업 수정')
    expect(source).not.toContain('canCollabEdit && !canDirectEditSales && !canDirectEditPurchase')
  })

  it('R35: 직접수정·협업수정 진입점은 이름이 다르고 두 편집 표면이 동시에 열리지 않는다', () => {
    expect(editSurfaceEntryAvailability(true, true, false, false)).toEqual({ direct: true, collab: true })
    expect(editSurfaceEntryAvailability(true, true, true, false)).toEqual({ direct: true, collab: false })
    expect(editSurfaceEntryAvailability(true, true, false, true)).toEqual({ direct: false, collab: true })
    expect(editSurfaceEntryAvailability(true, true, true, true)).toEqual({ direct: false, collab: false })

    const source = fs.readFileSync(sourcePath, 'utf8')
    expect(source).toContain('직접 수정')
    expect(source).toContain('협업 수정')
    expect(source).toContain('const canCollabEditEntry = editSurfaceEntries.collab')
  })

  it('R33 RED-B4: 취소와 soft delete는 이름·핸들러·확인 문구가 실제 동작과 다르지 않다', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')

    expect(source).toContain('const handleCancelSlip')
    expect(source).not.toContain('handleDeleteSlip')
    expect(source).toMatch(/>\s*전표 삭제\s*</)
    expect(source).toMatch(/>\s*전표 취소\s*</)
    expect(source).toContain('deletePurchaseSlipMutation.mutate()')
    expect(source).toContain('deleteSalesSlipMutation.mutate()')
    expect(source).toContain("handleTransition('cancel')")
  })

  it('R33 RED-B5: 알 수 없는 409를 동시전이로 조용히 대체하지 않고 서버 표지 결합을 검사한다', () => {
    const source = fs.readFileSync(sourcePath, 'utf8')
    const inventoryClientPath = path.resolve(
      __dirname,
      '../../../../../services/slip-service/src/main/java/com/samhanair/logis/slip/client/InventoryClient.java',
    )
    const inventoryClient = fs.readFileSync(inventoryClientPath, 'utf8')
    const changedInventoryMessage = {
      isAxiosError: true,
      response: {
        status: 409,
        data: { code: 'CONFLICT', message: '재고가 모자랍니다: 가용 0, 필요 1' },
      },
    }

    expect(classifyTransitionConflict(changedInventoryMessage)).toBe('unknown')
    expect(transitionConflictEditPolicy('unknown')).toEqual({
      message: '전이 실패 원인을 확인할 수 없습니다. 최신 전표 상태를 확인한 뒤 다시 시도하세요.',
      blockEditSurfaces: true,
    })
    expect(source).toContain('INVENTORY_SHORTAGE_MARKERS')
    expect(inventoryClient).toContain('재고 부족')
    expect(inventoryClient).toContain('return body.isBlank() ? "재고 부족 등" : body')
  })
})
