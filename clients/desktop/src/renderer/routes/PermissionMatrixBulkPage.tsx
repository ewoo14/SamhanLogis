import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Spinner } from '@samhan/design-system'
import {
  PERMISSION_ACTIONS,
  bulkApply,
  fetchAccounts,
  type BulkPermissionRequest,
  type PageCode,
  type PermissionAccount,
  type PermissionAction,
  type PermissionActionMatrix,
  type RbacRole,
} from '../api/permissionsApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { PAGE_GROUPS, PAGE_LABEL } from './permissionPageCatalog'

const ROLE_LABEL: Record<RbacRole, string> = {
  MASTER: '마스터',
  DEVELOPER: '개발자',
  MANAGER: '매니저',
  DISPATCH: '배차담당자',
  SALES: '영업원',
  ACCOUNTANT: '회계원',
  WAREHOUSE: '창고원',
  INVENTORY: '재고원',
  PARTNER: '파트너',
  STAFF: '스태프',
  DRIVER: '운전기사',
}

const ACTION_LABEL: Record<PermissionAction, string> = {
  view: '보기',
  create: '생성',
  update: '수정',
  delete: '삭제',
  restore: '복원',
  download: '엑셀',
  print: '인쇄',
}

type WizardStep = 1 | 2 | 3 | 4
type BulkMode = BulkPermissionRequest['mode']

function emptyPermissionActions(): PermissionActionMatrix {
  return {
    view: false,
    create: false,
    update: false,
    delete: false,
    restore: false,
    download: false,
    print: false,
  }
}

function buildActionMatrix(actions: readonly PermissionAction[]): PermissionActionMatrix {
  const matrix = emptyPermissionActions()
  for (const action of actions) {
    matrix[action] = true
  }
  return matrix
}

function pageOptionLabel(page: PageCode): string {
  return `${PAGE_LABEL[page] ?? page} (${page})`
}

function selectedAccounts(accounts: PermissionAccount[], selectedIds: Set<string>): PermissionAccount[] {
  return accounts.filter((account) => selectedIds.has(account.id))
}

export function PermissionMatrixBulkPage() {
  usePageTitle('권한 일괄 적용')

  const queryClient = useQueryClient()
  const accountsQuery = useQuery({
    queryKey: ['admin', 'permission-accounts'],
    queryFn: fetchAccounts,
  })

  const [step, setStep] = useState<WizardStep>(1)
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(() => new Set())
  const [roleFilter, setRoleFilter] = useState<RbacRole | 'ALL'>('ALL')
  const [enabledOnly, setEnabledOnly] = useState(true)
  const [mode, setMode] = useState<BulkMode>('template')
  const [templateRole, setTemplateRole] = useState<RbacRole>('MANAGER')
  const [selectedPage, setSelectedPage] = useState<PageCode>('dispatch.board')
  const [selectedActions, setSelectedActions] = useState<Set<PermissionAction>>(() => new Set(['view']))
  const [toast, setToast] = useState<string | null>(null)
  const [changedCount, setChangedCount] = useState<number | null>(null)

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const accounts = accountsQuery.data ?? []
  const selected = useMemo(() => selectedAccounts(accounts, selectedAccountIds), [accounts, selectedAccountIds])
  const selectedActionList = useMemo(() => PERMISSION_ACTIONS.filter((action) => selectedActions.has(action)), [selectedActions])
  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      if (enabledOnly && !account.enabled) return false
      if (roleFilter !== 'ALL' && account.role !== roleFilter) return false
      return true
    })
  }, [accounts, enabledOnly, roleFilter])

  const payload = useMemo<BulkPermissionRequest | null>(() => {
    const accountIds = Array.from(selectedAccountIds)
    if (accountIds.length === 0) return null
    if (mode === 'template') {
      return { accountIds, mode: 'template', roleCode: templateRole }
    }
    if (selectedActionList.length === 0) return null
    return {
      accountIds,
      mode: 'grants',
      grants: [
        {
          pageCode: selectedPage,
          actions: buildActionMatrix(selectedActionList),
        },
      ],
    }
  }, [mode, selectedAccountIds, selectedActionList, selectedPage, templateRole])

  const previewActionCount = mode === 'template' ? PERMISSION_ACTIONS.length : selectedActionList.length
  const previewPageCount = mode === 'template' ? '템플릿 전체' : '1개 페이지'
  const previewImpactCount = selected.length * (mode === 'template' ? 1 : previewActionCount)

  const applyMutation = useMutation({
    mutationFn: (request: BulkPermissionRequest) => bulkApply(request),
    onSuccess: (result) => {
      setChangedCount(result.changedCount)
      setStep(4)
      setToast(`${result.changedCount}건의 권한을 일괄 적용했습니다.`)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'permission-account-matrix'] })
      void queryClient.invalidateQueries({ queryKey: ['permissions', 'my'] })
    },
    onError: () => setToast('권한 일괄 적용 중 오류가 발생했습니다.'),
  })

  const toggleAccount = useCallback((accountId: string) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }, [])

  const toggleAction = useCallback((action: PermissionAction) => {
    setSelectedActions((prev) => {
      const next = new Set(prev)
      if (next.has(action)) next.delete(action)
      else next.add(action)
      return next
    })
  }, [])

  const goPreview = useCallback(() => {
    if (!payload) return
    setStep(3)
  }, [payload])

  const applyBulk = useCallback(() => {
    if (!payload) return
    applyMutation.mutate(payload)
  }, [applyMutation, payload])

  if (accountsQuery.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner />
      </div>
    )
  }

  if (accountsQuery.isError) {
    return (
      <div style={{ padding: 48, color: 'var(--color-danger-600)' }}>
        계정 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.
      </div>
    )
  }

  return (
    <div style={{ padding: '0 4px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>권한 일괄 적용</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-neutral-500)' }}>
            여러 계정에 역할 템플릿 또는 단일 페이지 액션 권한을 한 번에 적용합니다.
          </p>
        </div>
        <Badge variant="brand">{ROLE_LABEL.MASTER}</Badge>
      </div>

      <StepHeader step={step} />

      <section style={panelStyle}>
        {step === 1 && (
          <AccountSelectionStep
            accounts={filteredAccounts}
            selectedAccountIds={selectedAccountIds}
            roleFilter={roleFilter}
            enabledOnly={enabledOnly}
            onRoleFilterChange={setRoleFilter}
            onEnabledOnlyChange={setEnabledOnly}
            onToggleAccount={toggleAccount}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <ModeStep
            mode={mode}
            templateRole={templateRole}
            selectedPage={selectedPage}
            selectedActions={selectedActions}
            canPreview={payload !== null}
            onModeChange={(nextMode) => setMode(nextMode)}
            onTemplateRoleChange={setTemplateRole}
            onSelectedPageChange={setSelectedPage}
            onToggleAction={toggleAction}
            onBack={() => setStep(1)}
            onPreview={goPreview}
          />
        )}

        {step === 3 && (
          <PreviewStep
            selectedAccounts={selected}
            mode={mode}
            templateRole={templateRole}
            selectedPage={selectedPage}
            selectedActions={selectedActionList}
            previewPageCount={previewPageCount}
            previewImpactCount={previewImpactCount}
            isPending={applyMutation.isPending}
            onBack={() => setStep(2)}
            onApply={applyBulk}
          />
        )}

        {step === 4 && (
          <ResultStep changedCount={changedCount ?? 0} selectedAccounts={selected} onRestart={() => {
            setChangedCount(null)
            setStep(1)
          }} />
        )}
      </section>

      {toast && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 100,
            borderRadius: 8,
            padding: '10px 14px',
            background: toast.includes('오류') ? 'var(--color-danger-600)' : 'var(--color-success-600)',
            color: 'var(--color-neutral-0)',
            boxShadow: 'var(--shadow-lg)',
            fontSize: 13,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

function StepHeader({ step }: { step: WizardStep }) {
  const labels = ['계정 선택', '방식 선택', '미리보기', '적용 결과'] as const
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
      {labels.map((label, index) => {
        const active = step === index + 1
        const done = step > index + 1
        return (
          <div
            key={label}
            aria-current={active ? 'step' : undefined}
            style={{
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 8,
              padding: '8px 10px',
              background: active ? 'var(--color-brand-50)' : done ? 'var(--color-success-50)' : 'var(--color-neutral-0)',
              color: active ? 'var(--color-brand-700)' : 'var(--color-neutral-700)',
              fontWeight: active ? 700 : 600,
              fontSize: 13,
            }}
          >
            {index + 1}. {label}
          </div>
        )
      })}
    </div>
  )
}

function AccountSelectionStep({
  accounts,
  selectedAccountIds,
  roleFilter,
  enabledOnly,
  onRoleFilterChange,
  onEnabledOnlyChange,
  onToggleAccount,
  onNext,
}: {
  accounts: PermissionAccount[]
  selectedAccountIds: Set<string>
  roleFilter: RbacRole | 'ALL'
  enabledOnly: boolean
  onRoleFilterChange: (role: RbacRole | 'ALL') => void
  onEnabledOnlyChange: (enabledOnly: boolean) => void
  onToggleAccount: (accountId: string) => void
  onNext: () => void
}) {
  return (
    <>
      <div style={toolbarStyle}>
        <select
          aria-label="역할 필터"
          value={roleFilter}
          onChange={(event) => onRoleFilterChange(event.target.value as RbacRole | 'ALL')}
          style={selectStyle}
        >
          <option value="ALL">전체 역할</option>
          {Object.keys(ROLE_LABEL).map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role as RbacRole]}
            </option>
          ))}
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={enabledOnly}
            onChange={(event) => onEnabledOnlyChange(event.target.checked)}
          />
          활성 계정만
        </label>
        <Badge variant="neutral">선택 {selectedAccountIds.size}개</Badge>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {accounts.map((account) => (
          <label key={account.id} style={accountRowStyle}>
            <input
              type="checkbox"
              data-testid={`perm-bulk-account-${account.id}`}
              checked={selectedAccountIds.has(account.id)}
              onChange={() => onToggleAccount(account.id)}
              style={{ accentColor: 'var(--color-brand-500)' }}
            />
            <span style={{ fontWeight: 700 }}>{account.displayName}</span>
            <Badge variant={account.enabled ? 'brand' : 'neutral'}>{ROLE_LABEL[account.role] ?? account.role}</Badge>
            {!account.enabled && <span style={{ color: 'var(--color-neutral-500)', fontSize: 12 }}>비활성</span>}
          </label>
        ))}
      </div>

      <WizardActions>
        <Button variant="primary" onClick={onNext} disabled={selectedAccountIds.size === 0}>
          다음
        </Button>
      </WizardActions>
    </>
  )
}

function ModeStep({
  mode,
  templateRole,
  selectedPage,
  selectedActions,
  canPreview,
  onModeChange,
  onTemplateRoleChange,
  onSelectedPageChange,
  onToggleAction,
  onBack,
  onPreview,
}: {
  mode: BulkMode
  templateRole: RbacRole
  selectedPage: PageCode
  selectedActions: Set<PermissionAction>
  canPreview: boolean
  onModeChange: (mode: BulkMode) => void
  onTemplateRoleChange: (role: RbacRole) => void
  onSelectedPageChange: (page: PageCode) => void
  onToggleAction: (action: PermissionAction) => void
  onBack: () => void
  onPreview: () => void
}) {
  return (
    <>
      <div style={toolbarStyle}>
        <select
          data-testid="perm-bulk-mode"
          aria-label="적용 방식"
          value={mode}
          onChange={(event) => onModeChange(event.target.value as BulkMode)}
          style={selectStyle}
        >
          <option value="template">템플릿</option>
          <option value="grants">명시</option>
        </select>
      </div>

      {mode === 'template' ? (
        <div style={fieldGridStyle}>
          <label style={fieldLabelStyle}>
            템플릿 역할
            <select
              value={templateRole}
              onChange={(event) => onTemplateRoleChange(event.target.value as RbacRole)}
              style={selectStyle}
            >
              {Object.keys(ROLE_LABEL).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role as RbacRole]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div style={fieldGridStyle}>
          <label style={fieldLabelStyle}>
            페이지
            <select
              aria-label="페이지"
              value={selectedPage}
              onChange={(event) => onSelectedPageChange(event.target.value as PageCode)}
              style={selectStyle}
            >
              {PAGE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.pages.map((page) => (
                    <option key={page} value={page}>
                      {PAGE_LABEL[page] ?? page}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {selectedActions.size === 0 && (
            <div style={{ color: 'var(--color-danger-600)', fontSize: 12 }}>
              액션을 1개 이상 선택하세요.
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {PERMISSION_ACTIONS.map((action) => (
              <label key={action} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  aria-label={ACTION_LABEL[action]}
                  checked={selectedActions.has(action)}
                  onChange={() => onToggleAction(action)}
                  style={{ accentColor: 'var(--color-brand-500)' }}
                />
                {ACTION_LABEL[action]}
              </label>
            ))}
          </div>
        </div>
      )}

      <WizardActions>
        <Button variant="ghost" onClick={onBack}>이전</Button>
        <Button variant="primary" onClick={onPreview} disabled={!canPreview}>
          미리보기
        </Button>
      </WizardActions>
    </>
  )
}

function PreviewStep({
  selectedAccounts,
  mode,
  templateRole,
  selectedPage,
  selectedActions,
  previewPageCount,
  previewImpactCount,
  isPending,
  onBack,
  onApply,
}: {
  selectedAccounts: PermissionAccount[]
  mode: BulkMode
  templateRole: RbacRole
  selectedPage: PageCode
  selectedActions: PermissionAction[]
  previewPageCount: string
  previewImpactCount: number
  isPending: boolean
  onBack: () => void
  onApply: () => void
}) {
  return (
    <>
      <div data-testid="perm-bulk-preview" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Badge variant="brand">{selectedAccounts.length}개 계정</Badge>
          <Badge variant="neutral">{previewPageCount}</Badge>
          {/* previewImpactCount 는 계정×액션 상한(이미 부여된 권한은 변경 0건이라 실제 changedCount ≤ 이 값).
              "예상"은 정확값 오인을 유발하므로 보수적 "최대 N건" 으로 표기. */}
          <Badge variant="neutral">최대 {previewImpactCount}건</Badge>
        </div>

        {mode === 'template' ? (
          <div style={previewBoxStyle}>
            <strong>{ROLE_LABEL[templateRole]} 템플릿</strong>을 선택한 계정에 적용합니다.
          </div>
        ) : (
          <div style={previewBoxStyle}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{pageOptionLabel(selectedPage)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedActions.map((action) => (
                <Badge key={action} variant="brand">{ACTION_LABEL[action]}</Badge>
              ))}
            </div>
            {/* grants 모드 = replace 시맨틱: 체크 안 한 액션은 false 로 덮어쓰여 기존 권한이 제거됨.
                additive 오인 방지를 위해 명시적 경고 표기. */}
            <div role="note" style={replaceWarningStyle}>
              선택한 페이지의 기존 권한이 이 설정으로 <strong>대체</strong>됩니다.
              체크하지 않은 액션은 해제됩니다.
            </div>
          </div>
        )}

        <div style={wideTableScrollStyle}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={tableHeaderStyle}>계정</th>
                <th style={tableHeaderStyle}>역할</th>
                <th style={tableHeaderStyle}>적용 내용</th>
              </tr>
            </thead>
            <tbody>
              {selectedAccounts.map((account) => (
                <tr key={account.id}>
                  <td style={tableCellStyle}>{account.displayName}</td>
                  <td style={tableCellStyle}>{ROLE_LABEL[account.role] ?? account.role}</td>
                  <td style={tableCellStyle}>
                    {mode === 'template'
                      ? `${ROLE_LABEL[templateRole]} 템플릿`
                      : `${selectedPage} / ${selectedActions.map((action) => ACTION_LABEL[action]).join(', ')}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WizardActions>
        <Button variant="ghost" onClick={onBack} disabled={isPending}>이전</Button>
        <Button variant="primary" data-testid="perm-bulk-apply" onClick={onApply} disabled={isPending}>
          {isPending ? '적용 중' : '적용'}
        </Button>
      </WizardActions>
    </>
  )
}

function ResultStep({
  changedCount,
  selectedAccounts,
  onRestart,
}: {
  changedCount: number
  selectedAccounts: PermissionAccount[]
  onRestart: () => void
}) {
  return (
    <>
      <div style={previewBoxStyle}>
        <h4 style={{ margin: '0 0 8px' }}>일괄 적용 결과</h4>
        <p style={{ margin: 0, fontSize: 14 }}>
          {selectedAccounts.length}개 계정에 {changedCount}건의 권한 변경을 적용했습니다.
        </p>
      </div>
      <WizardActions>
        <Button variant="secondary" onClick={onRestart}>다시 적용</Button>
      </WizardActions>
    </>
  )
}

function WizardActions({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
      {children}
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 8,
  padding: 14,
  background: 'var(--color-neutral-0)',
  boxShadow: 'var(--shadow-md)',
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 10,
  marginBottom: 12,
}

const selectStyle: React.CSSProperties = {
  height: 34,
  minWidth: 180,
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 6,
  padding: '0 8px',
  background: 'var(--color-neutral-0)',
  color: 'var(--color-neutral-900)',
  fontSize: 13,
}

const accountRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 40,
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 8,
  padding: '8px 10px',
  background: 'var(--color-neutral-50)',
}

const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  maxWidth: 640,
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 13,
  color: 'var(--color-neutral-700)',
  fontWeight: 700,
}

const previewBoxStyle: React.CSSProperties = {
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 8,
  padding: 12,
  background: 'var(--color-neutral-50)',
}

// grants 모드 replace 경고 — DS warning 토큰(테두리/배경/텍스트) 사용, 하드코딩 색 금지.
const replaceWarningStyle: React.CSSProperties = {
  marginTop: 10,
  border: '1px solid var(--color-warning-300)',
  borderRadius: 6,
  padding: '8px 10px',
  background: 'var(--color-warning-50)',
  color: 'var(--color-warning-800)',
  fontSize: 12,
  lineHeight: 1.5,
}

const wideTableScrollStyle: React.CSSProperties = {
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
}

const tableHeaderStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  borderBottom: '1px solid var(--color-neutral-300)',
  background: 'var(--color-neutral-50)',
  color: 'var(--color-neutral-700)',
}

const tableCellStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--color-neutral-200)',
}
