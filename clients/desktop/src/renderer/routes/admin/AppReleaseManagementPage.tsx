import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  Input,
  Modal,
  Select,
  type BadgeVariant,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  createAppRelease,
  deleteAppRelease,
  listAppReleases,
  updateAppRelease,
  type AppClientType,
  type AppForceLevel,
  type AppRelease,
  type AppReleasePayload,
} from '../../api/appVersion'
import { usePageTitle } from '../../hooks/usePageTitle'
import {
  formatKstDate,
  formatKstDateTimeInputValue,
  kstDateTimeInputToIsoOffset,
} from '../../utils/formatDate'
import styles from './AppReleaseManagementPage.module.css'

type ReleaseFormState = {
  clientType: AppClientType
  version: string
  minSupportedVersion: string
  forceLevel: Exclude<AppForceLevel, 'NONE'>
  releaseNotes: string
  releasedAt: string
}

const CLIENT_TYPE_LABEL: Record<AppClientType, string> = {
  DESKTOP: '데스크탑',
  WEB: '웹',
  MOBILE: '모바일',
}

const FORCE_LEVEL_LABEL: Record<Exclude<AppForceLevel, 'NONE'>, string> = {
  MINOR: '권고',
  MAJOR: '필수',
  CRITICAL: '긴급',
}

const FORCE_LEVEL_VARIANT: Record<Exclude<AppForceLevel, 'NONE'>, BadgeVariant> = {
  MINOR: 'brand',
  MAJOR: 'warning',
  CRITICAL: 'danger',
}

const emptyForm = (): ReleaseFormState => ({
  clientType: 'DESKTOP',
  version: '',
  minSupportedVersion: '',
  forceLevel: 'MINOR',
  releaseNotes: '',
  releasedAt: formatKstDateTimeInputValue(new Date()),
})

function toForm(row: AppRelease): ReleaseFormState {
  return {
    clientType: row.clientType,
    version: row.version,
    minSupportedVersion: row.minSupportedVersion,
    forceLevel: row.forceLevel,
    releaseNotes: row.releaseNotes,
    releasedAt: formatKstDateTimeInputValue(row.releasedAt),
  }
}

function toPayload(form: ReleaseFormState): AppReleasePayload {
  return {
    clientType: form.clientType,
    version: form.version.trim(),
    minSupportedVersion: form.minSupportedVersion.trim(),
    forceLevel: form.forceLevel,
    releaseNotes: form.releaseNotes.trim(),
    releasedAt: kstDateTimeInputToIsoOffset(form.releasedAt),
  }
}

function extractErrorMessage(err: unknown): string {
  const maybe = err as { response?: { data?: { message?: unknown } }; message?: unknown } | null
  const responseMessage = maybe?.response?.data?.message
  if (typeof responseMessage === 'string' && responseMessage.trim()) return responseMessage
  if (typeof maybe?.message === 'string' && maybe.message.trim()) return maybe.message
  return '릴리스 정보를 저장하지 못했습니다.'
}

function ForceBadge({ level }: { level: Exclude<AppForceLevel, 'NONE'> }) {
  return (
    <Badge variant={FORCE_LEVEL_VARIANT[level]}>
      {FORCE_LEVEL_LABEL[level]}
    </Badge>
  )
}

export function AppReleaseManagementPage() {
  usePageTitle('릴리스 관리')

  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AppRelease | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppRelease | null>(null)
  const [form, setForm] = useState<ReleaseFormState>(() => emptyForm())
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const query = useQuery({
    queryKey: ['admin', 'app-releases'],
    queryFn: listAppReleases,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'app-releases'] })

  const saveMutation = useMutation({
    mutationFn: (payload: AppReleasePayload) =>
      editing ? updateAppRelease(editing.id, payload) : createAppRelease(payload),
    onSuccess: () => {
      setModalOpen(false)
      setEditing(null)
      setForm(emptyForm())
      setToast({ type: 'success', message: '릴리스 정보를 저장했습니다.' })
      void invalidate()
    },
    onError: (err) => {
      setToast({ type: 'error', message: extractErrorMessage(err) })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (row: AppRelease) => deleteAppRelease(row.id),
    onSuccess: () => {
      setDeleteTarget(null)
      setToast({ type: 'success', message: '릴리스 정보를 삭제했습니다.' })
      void invalidate()
    },
    onError: (err) => {
      setToast({ type: 'error', message: extractErrorMessage(err) })
    },
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (row: AppRelease) => {
    setEditing(row)
    setForm(toForm(row))
    setModalOpen(true)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveMutation.mutate(toPayload(form))
  }

  const rows = query.data ?? []
  const columns = useMemo<DataTableColumn<AppRelease>[]>(() => [
    {
      key: 'clientType',
      header: '클라이언트',
      width: '110px',
      mobilePriority: 'secondary',
      render: (row) => CLIENT_TYPE_LABEL[row.clientType],
    },
    { key: 'version', header: '최신 버전', width: '120px', mobilePriority: 'primary' },
    { key: 'minSupportedVersion', header: '최소 지원', width: '120px', mobilePriority: 'secondary' },
    {
      key: 'forceLevel',
      header: '강제 수준',
      width: '100px',
      mobilePriority: 'primary',
      render: (row) => <ForceBadge level={row.forceLevel} />,
    },
    {
      key: 'releasedAt',
      header: '배포 일시',
      width: '190px',
      mobilePriority: 'secondary',
      render: (row) => formatKstDate(row.releasedAt),
    },
    {
      key: 'releaseNotes',
      header: '릴리스 노트',
      mobilePriority: 'hidden',
      render: (row) => (
        <span style={{ display: 'block', maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.releaseNotes}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '관리',
      width: '150px',
      mobilePriority: 'secondary',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => openEdit(row)}
            data-testid={`app-release-edit-${row.clientType}-${row.version}`}
          >
            수정
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => setDeleteTarget(row)}
            data-testid={`app-release-delete-${row.clientType}-${row.version}`}
          >
            삭제
          </Button>
        </div>
      ),
    },
  ], [])

  return (
    <div data-testid="app-release-admin-page">
      <section
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>릴리스 관리</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--color-neutral-600)', fontSize: 13 }}>
            클라이언트별 최신 버전, 최소 지원 버전, 강제 수준을 관리합니다.
          </p>
        </div>
        <Button type="button" onClick={openCreate} data-testid="app-release-create-open">
          릴리스 등록
        </Button>
      </section>

      {toast ? (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          data-testid="app-release-toast"
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 6,
            border: `1px solid ${toast.type === 'error' ? 'var(--state-danger)' : 'var(--state-success)'}`,
            background: toast.type === 'error' ? 'var(--state-danger-bg)' : 'var(--state-success-bg)',
            color: toast.type === 'error' ? 'var(--state-danger)' : 'var(--state-success)',
          }}
        >
          {toast.message}
        </div>
      ) : null}

      <div data-testid="app-release-table">
        <DataTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          rowKey={(row) => `${row.clientType}-${row.version}-${row.releasedAt}`}
          emptyMessage="등록된 릴리스가 없습니다."
          rowTestId={(row) => `app-release-row-${row.clientType}-${row.version}-${row.releasedAt}`}
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '릴리스 수정' : '릴리스 등록'}
        size="lg"
      >
        <form
          onSubmit={handleSubmit}
          data-testid="app-release-form"
          className={styles.releaseForm}
        >
          <div className={styles.formGridTwo} data-testid="app-release-primary-grid">
            <Select
              label="클라이언트"
              value={form.clientType}
              onChange={(event) => setForm((prev) => ({ ...prev, clientType: event.target.value as AppClientType }))}
              required
              data-testid="app-release-client-type"
            >
              <option value="DESKTOP">데스크탑</option>
              <option value="WEB">웹</option>
              <option value="MOBILE">모바일</option>
            </Select>
            <Select
              label="강제 수준"
              value={form.forceLevel}
              onChange={(event) => setForm((prev) => ({ ...prev, forceLevel: event.target.value as Exclude<AppForceLevel, 'NONE'> }))}
              required
              data-testid="app-release-force-level"
            >
              <option value="MINOR">권고</option>
              <option value="MAJOR">필수</option>
              <option value="CRITICAL">긴급</option>
            </Select>
          </div>
          <div className={styles.formGridThree} data-testid="app-release-version-grid">
            <Input
              label="최신 버전"
              value={form.version}
              onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))}
              placeholder="0.2.0"
              required
              data-testid="app-release-version"
            />
            <Input
              label="최소 지원 버전"
              value={form.minSupportedVersion}
              onChange={(event) => setForm((prev) => ({ ...prev, minSupportedVersion: event.target.value }))}
              placeholder="0.1.0"
              required
              data-testid="app-release-min-supported"
            />
            <Input
              label="배포 일시"
              type="datetime-local"
              value={form.releasedAt}
              onChange={(event) => setForm((prev) => ({ ...prev, releasedAt: event.target.value }))}
              required
              data-testid="app-release-released-at"
            />
          </div>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
            릴리스 노트
            <textarea
              value={form.releaseNotes}
              onChange={(event) => setForm((prev) => ({ ...prev, releaseNotes: event.target.value }))}
              required
              data-testid="app-release-notes"
              style={{
                minHeight: 140,
                resize: 'vertical',
                border: '1px solid var(--color-neutral-300)',
                borderRadius: 6,
                padding: 10,
                font: 'inherit',
              }}
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button
              type="submit"
              loading={saveMutation.isPending}
              data-testid="app-release-save"
            >
              저장
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="릴리스 삭제"
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget)
              }}
              data-testid="app-release-delete-confirm"
            >
              삭제
            </Button>
          </>
        )}
      >
        <p data-testid="app-release-delete-dialog" style={{ margin: 0 }}>
          {deleteTarget ? `${CLIENT_TYPE_LABEL[deleteTarget.clientType]} ${deleteTarget.version} 릴리스를 삭제합니다.` : ''}
        </p>
      </Modal>
    </div>
  )
}
