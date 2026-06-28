import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  Input,
  Modal,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  createAppNotice,
  deleteAppNotice,
  deleteAppNoticeImage,
  listAppNotices,
  reorderAppNoticeImages,
  updateAppNotice,
  uploadAppNoticeImage,
  type AppNotice,
  type AppNoticeImage,
  type AppNoticePayload,
} from '../../api/appNotice'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'
import {
  formatKstDate,
  formatKstDateTimeInputValue,
  kstDateTimeInputToLocalDateTime,
} from '../../utils/formatDate'
import styles from './AppNoticeManagementPage.module.css'

type NoticeFormState = {
  title: string
  isActive: boolean
  startAt: string
  endAt: string
  displayOrder: number
}

const emptyForm = (): NoticeFormState => {
  const now = formatKstDateTimeInputValue(new Date())
  return {
    title: '',
    isActive: true,
    startAt: now,
    endAt: now,
    displayOrder: 0,
  }
}

function toForm(row: AppNotice): NoticeFormState {
  return {
    title: row.title,
    isActive: row.isActive,
    startAt: formatKstDateTimeInputValue(row.startAt),
    endAt: formatKstDateTimeInputValue(row.endAt),
    displayOrder: row.displayOrder,
  }
}

function toPayload(form: NoticeFormState): AppNoticePayload {
  return {
    title: form.title.trim(),
    isActive: form.isActive,
    startAt: kstDateTimeInputToLocalDateTime(form.startAt),
    endAt: kstDateTimeInputToLocalDateTime(form.endAt),
    displayOrder: Number(form.displayOrder) || 0,
  }
}

function extractErrorMessage(err: unknown): string {
  const maybe = err as { response?: { data?: { message?: unknown } }; message?: unknown } | null
  const responseMessage = maybe?.response?.data?.message
  if (typeof responseMessage === 'string' && responseMessage.trim()) return responseMessage
  if (typeof maybe?.message === 'string' && maybe.message.trim()) return maybe.message
  return '팝업공지 정보를 저장하지 못했습니다.'
}

function sortedImages(images: AppNoticeImage[]): AppNoticeImage[] {
  return [...images].sort((a, b) => a.displayOrder - b.displayOrder)
}

const MAX_UPLOAD_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

function selectImageFiles(files: FileList | File[]): { accepted: File[]; rejectedReasons: string[] } {
  const accepted: File[] = []
  const rejectedReasons: string[] = []
  Array.from(files).forEach((file) => {
    if (!file.type.startsWith('image/')) {
      rejectedReasons.push(`${file.name}: 이미지 파일만 업로드할 수 있습니다.`)
      return
    }
    if (file.size > MAX_UPLOAD_IMAGE_SIZE_BYTES) {
      rejectedReasons.push(`${file.name}: 5MB 이하 이미지만 업로드할 수 있습니다.`)
      return
    }
    accepted.push(file)
  })
  return { accepted, rejectedReasons }
}

function displayImageFileName(image: AppNoticeImage): string {
  return image.fileName?.trim() || '파일명 없음'
}

function uploadRejectMessage(rejectedReasons: string[]): string {
  if (rejectedReasons.length === 1) {
    return rejectedReasons[0] ?? '이미지를 선택할 수 없습니다.'
  }
  return `선택하지 않은 파일이 있습니다. ${rejectedReasons.join(' ')}`
}

export function AppNoticeManagementPage() {
  usePageTitle('팝업공지')

  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canCreate = canAccess('dev.popup-notice', 'create')
  const canUpdate = canAccess('dev.popup-notice', 'update')
  const canDelete = canAccess('dev.popup-notice', 'delete')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AppNotice | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppNotice | null>(null)
  const [form, setForm] = useState<NoticeFormState>(() => emptyForm())
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadCaption, setUploadCaption] = useState('')
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const query = useQuery({
    queryKey: ['admin', 'app-notices'],
    queryFn: listAppNotices,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'app-notices'] })

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3_000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const saveMutation = useMutation({
    mutationFn: (payload: AppNoticePayload) =>
      editing ? updateAppNotice(editing.id, payload) : createAppNotice(payload),
    onSuccess: (row) => {
      setToast({ type: 'success', message: '팝업공지를 저장했습니다.' })
      setEditing(row)
      setModalOpen(true)
      void invalidate()
    },
    onError: (err) => setToast({ type: 'error', message: extractErrorMessage(err) }),
  })

  const deleteMutation = useMutation({
    mutationFn: (row: AppNotice) => deleteAppNotice(row.id),
    onSuccess: () => {
      setDeleteTarget(null)
      setToast({ type: 'success', message: '팝업공지를 삭제했습니다.' })
      void invalidate()
    },
    onError: (err) => setToast({ type: 'error', message: extractErrorMessage(err) }),
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return []
      const baseOrder = sortedImages(editing.images).length
      const uploaded: AppNoticeImage[] = []
      for (let index = 0; index < uploadFiles.length; index += 1) {
        const file = uploadFiles[index]
        if (!file) continue
        uploaded.push(await uploadAppNoticeImage(editing.id, {
          file,
          caption: uploadCaption.trim() || undefined,
          displayOrder: baseOrder + index + 1,
        }))
      }
      return uploaded
    },
    onSuccess: () => {
      setUploadFiles([])
      setUploadCaption('')
      setToast({ type: 'success', message: '이미지를 업로드했습니다.' })
      void invalidate()
    },
    onError: (err) => setToast({ type: 'error', message: extractErrorMessage(err) }),
  })

  const reorderMutation = useMutation({
    mutationFn: (images: AppNoticeImage[]) => {
      if (!editing) return Promise.resolve([])
      return reorderAppNoticeImages(editing.id, images.map((image, index) => ({
        id: image.id,
        displayOrder: index + 1,
      })))
    },
    onSuccess: () => {
      setToast({ type: 'success', message: '이미지 순서를 저장했습니다.' })
      void invalidate()
    },
    onError: (err) => setToast({ type: 'error', message: extractErrorMessage(err) }),
  })

  const imageDeleteMutation = useMutation({
    mutationFn: (image: AppNoticeImage) => {
      if (!editing) return Promise.resolve()
      return deleteAppNoticeImage(editing.id, image.id)
    },
    onSuccess: () => {
      setToast({ type: 'success', message: '이미지를 삭제했습니다.' })
      void invalidate()
    },
    onError: (err) => setToast({ type: 'error', message: extractErrorMessage(err) }),
  })

  const rows = query.data ?? []
  const currentEditing = editing
    ? rows.find((row) => row.id === editing.id) ?? editing
    : null
  const images = currentEditing ? sortedImages(currentEditing.images) : []

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setUploadFiles([])
    setUploadCaption('')
    setModalOpen(true)
  }

  const openEdit = (row: AppNotice) => {
    setEditing(row)
    setForm(toForm(row))
    setUploadFiles([])
    setUploadCaption('')
    setModalOpen(true)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveMutation.mutate(toPayload(form))
  }

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const { accepted, rejectedReasons } = selectImageFiles(event.target.files ?? [])
    setUploadFiles(accepted)
    if (rejectedReasons.length > 0) {
      setToast({ type: 'error', message: uploadRejectMessage(rejectedReasons) })
    }
  }

  const handleDropFiles = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const { accepted, rejectedReasons } = selectImageFiles(event.dataTransfer.files)
    setUploadFiles(accepted)
    if (rejectedReasons.length > 0) {
      setToast({ type: 'error', message: uploadRejectMessage(rejectedReasons) })
    }
  }

  const handleImageDrop = (targetId: string) => {
    if (!draggedImageId || draggedImageId === targetId) return
    const fromIndex = images.findIndex((image) => image.id === draggedImageId)
    const toIndex = images.findIndex((image) => image.id === targetId)
    if (fromIndex < 0 || toIndex < 0) return
    const next = [...images]
    const [moved] = next.splice(fromIndex, 1)
    if (!moved) return
    next.splice(toIndex, 0, moved)
    reorderMutation.mutate(next)
    setDraggedImageId(null)
  }

  const columns = useMemo<DataTableColumn<AppNotice>[]>(() => [
    { key: 'title', header: '제목', mobilePriority: 'primary' },
    {
      key: 'isActive',
      header: '상태',
      width: '100px',
      mobilePriority: 'primary',
      render: (row) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? '게시' : '중지'}
        </Badge>
      ),
    },
    {
      key: 'period',
      header: '게시기간',
      width: '220px',
      mobilePriority: 'secondary',
      render: (row) => `${formatKstDate(row.startAt)} - ${formatKstDate(row.endAt)}`,
    },
    {
      key: 'images',
      header: '이미지',
      width: '90px',
      mobilePriority: 'secondary',
      render: (row) => `${row.images.length}개`,
    },
    { key: 'displayOrder', header: '순서', width: '80px', mobilePriority: 'hidden' },
    {
      key: 'actions',
      header: '관리',
      width: '150px',
      mobilePriority: 'primary',
      render: (row) => (
        <div className={styles.actionButtons}>
          <Button type="button" size="sm" variant="secondary" disabled={!canUpdate} onClick={() => openEdit(row)}>
            수정
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={!canDelete}
            onClick={() => setDeleteTarget(row)}
          >
            삭제
          </Button>
        </div>
      ),
    },
  ], [canDelete, canUpdate])

  return (
    <div data-testid="app-notice-admin-page">
      <section className={styles.toolbar}>
        <div>
          <h1>팝업공지</h1>
          <p>앱 부팅 후 표시할 공지와 이미지를 게시기간 기준으로 관리합니다.</p>
        </div>
        <Button type="button" onClick={openCreate} disabled={!canCreate} data-testid="app-notice-create-open">
          공지 등록
        </Button>
      </section>

      {toast ? (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}
          data-testid="app-notice-toast"
        >
          <span>{toast.message}</span>
          <button type="button" className={styles.toastClose} onClick={() => setToast(null)} aria-label="알림 닫기">
            닫기
          </button>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        loading={query.isLoading}
        rowKey={(row) => row.id}
        emptyMessage="등록된 팝업공지가 없습니다."
        rowTestId={(row) => `app-notice-row-${row.title}`}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '팝업공지 수정' : '팝업공지 등록'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className={styles.noticeForm} data-testid="app-notice-form">
          {!currentEditing ? (
            <p className={styles.formNotice}>
              공지 저장 후 이미지를 추가할 수 있습니다.
            </p>
          ) : null}
          <Input
            label="제목"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            required
            data-testid="app-notice-title"
          />
          <div className={styles.formGridTwo}>
            <Input
              label="게시 시작"
              type="datetime-local"
              value={form.startAt}
              onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))}
              required
              data-testid="app-notice-start-at"
            />
            <Input
              label="게시 종료"
              type="datetime-local"
              value={form.endAt}
              onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))}
              required
              data-testid="app-notice-end-at"
            />
          </div>
          <div className={styles.formGridTwo}>
            <Input
              label="표시 순서"
              type="number"
              value={String(form.displayOrder)}
              onChange={(event) => setForm((prev) => ({ ...prev, displayOrder: Number(event.target.value) }))}
              data-testid="app-notice-display-order"
            />
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                data-testid="app-notice-is-active"
              />
              게시 활성화
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              닫기
            </Button>
            <Button type="submit" disabled={editing ? !canUpdate : !canCreate} loading={saveMutation.isPending}>
              저장
            </Button>
          </div>
        </form>

        {currentEditing ? (
          <section style={{ marginTop: 18, display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>이미지</h2>
            <div
              className={styles.uploadBox}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDropFiles}
              data-testid="app-notice-image-dropzone"
            >
              <p className={styles.dropzoneHelp}>파일을 끌어다 놓거나 클릭해서 이미지를 선택합니다.</p>
              <Input
                label="이미지 파일"
                type="file"
                multiple
                accept="image/*"
                onChange={handleFiles}
                data-testid="app-notice-image-input"
              />
              <Input
                label="이미지 캡션"
                value={uploadCaption}
                onChange={(event) => setUploadCaption(event.target.value)}
                placeholder="선택 입력"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!canUpdate || uploadFiles.length === 0}
                loading={uploadMutation.isPending}
                onClick={() => uploadMutation.mutate()}
                data-testid="app-notice-image-upload"
              >
                이미지 업로드
              </Button>
            </div>
            <ul className={styles.imageList} data-testid="app-notice-image-list">
              {images.map((image) => (
                <li
                  key={image.id}
                  className={styles.imageItem}
                  draggable={canUpdate}
                  onDragStart={() => setDraggedImageId(image.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleImageDrop(image.id)}
                  data-testid={`app-notice-image-${image.id}`}
                >
                  <img className={styles.thumb} src={image.imageUrl} alt={image.caption ?? currentEditing.title} />
                  <div className={styles.imageMeta}>
                    <strong>{image.caption ?? '캡션 없음'}</strong>
                    <span>{image.displayOrder} · {displayImageFileName(image)}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={!canUpdate}
                    onClick={() => imageDeleteMutation.mutate(image)}
                  >
                    삭제
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="팝업공지 삭제"
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
              data-testid="app-notice-delete-confirm"
            >
              삭제
            </Button>
          </>
        )}
      >
        <p style={{ margin: 0 }}>
          {deleteTarget ? `${deleteTarget.title} 공지를 삭제합니다.` : ''}
        </p>
      </Modal>
    </div>
  )
}
