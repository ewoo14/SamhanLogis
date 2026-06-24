/**
 * 인사 메뉴 — 출고 마감시간 설정 (`/admin/slip-cutoff`).
 *
 * <p>UUID 비공개 가드: 사용자 노출 식별자는 deliveryTagLabel 이며
 * data-testid suffix 도 deliveryTag enum name 기준이다.
 * id(UUID)는 mutation path key 로만 사용한다.
 *
 * <p>ExternalCarriersPage 패턴 적용:
 * - DataTable(태그라벨/마감시각/활성 Badge/수정·삭제 액션)
 * - 등록 Modal: 미설정 OUTBOUND 태그 select + time input + 활성 checkbox
 * - 수정 Modal: 태그 고정 라벨 + 시각/활성 변경
 * - canAccess('hr.slip-cutoff','create') 로 관리 버튼 노출 제어
 *
 * <p>page-code: hr.slip-cutoff (actions: view/create/update/delete)
 */
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  FormField,
  Modal,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  createSlipCutoff,
  listDeliveryTagOptions,
  listSlipCutoffs,
  removeSlipCutoff,
  updateSlipCutoff,
  OUTBOUND_DELIVERY_TAG_LABELS,
  type OutboundDeliveryTag,
  type SlipCutoff,
  type SlipCutoffCreateRequest,
  type SlipCutoffUpdateRequest,
} from '../../api/slipCutoff'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'

// ---------------------------------------------------------------------------
// 폼 상태
// ---------------------------------------------------------------------------

export interface SlipCutoffFormState {
  /** null = 신규 등록 모드, non-null = 수정 모드. */
  editing: SlipCutoff | null
  /** 선택된 배송태그 enum name. 수정 모드에서는 고정. */
  deliveryTag: OutboundDeliveryTag | ''
  /** 마감시각 (HH:mm). */
  cutoffTime: string
  /** 활성 여부. */
  active: boolean
}

export const EMPTY_SLIP_CUTOFF_FORM: SlipCutoffFormState = {
  editing: null,
  deliveryTag: '',
  cutoffTime: '',
  active: true,
}

// ---------------------------------------------------------------------------
// 순수 모델 함수 (export — vitest 대상)
// ---------------------------------------------------------------------------

/**
 * 등록/수정 폼 유효성 검증.
 *
 * @returns 오류 메시지 문자열(실패) 또는 null(성공).
 */
export function validateSlipCutoffForm(form: SlipCutoffFormState): string | null {
  if (!form.editing && !form.deliveryTag) return '배송태그를 선택하세요.'
  if (!form.cutoffTime) return '마감시각을 입력하세요.'
  if (!/^\d{2}:\d{2}$/.test(form.cutoffTime)) return '마감시각은 HH:mm 형식이어야 합니다.'
  return null
}

/**
 * 등록 버튼 노출 여부 — hr.slip-cutoff CREATE 권한 보유 시.
 *
 * <p>FE canAccess page-code = BE @RequirePermission 정확 일치
 * (feedback_fe_canaccess_pagecode_be_match).
 */
export function canManageSlipCutoff(
  canAccess: (pageCode: 'hr.slip-cutoff', action: 'create') => boolean,
): boolean {
  return canAccess('hr.slip-cutoff', 'create')
}

/**
 * 수정 버튼 노출 여부 — hr.slip-cutoff UPDATE 권한 보유 시.
 *
 * <p>BE @RequirePermission(action = "update") 와 정확 일치.
 */
export function canUpdateSlipCutoff(
  canAccess: (pageCode: 'hr.slip-cutoff', action: 'update') => boolean,
): boolean {
  return canAccess('hr.slip-cutoff', 'update')
}

/**
 * 삭제 버튼 노출 여부 — hr.slip-cutoff DELETE 권한 보유 시.
 *
 * <p>BE @RequirePermission(action = "delete") 와 정확 일치.
 */
export function canDeleteSlipCutoff(
  canAccess: (pageCode: 'hr.slip-cutoff', action: 'delete') => boolean,
): boolean {
  return canAccess('hr.slip-cutoff', 'delete')
}

/**
 * 등록 가능한 태그 목록 — 전체 OUTBOUND 태그 중 이미 설정(활성)된 태그를 제외.
 *
 * <p>중복 태그 등록을 FE 수준에서 방지 (BE도 409로 차단하지만 UX 개선).
 *
 * @param all        전체 OUTBOUND 태그 옵션 목록 (delivery-tags API 응답).
 * @param configured 이미 등록된 마감시간 항목 목록 (현재 slip-cutoffs 목록).
 */
export function availableTagsForForm(
  all: Array<{ tag: OutboundDeliveryTag; label: string }>,
  configured: SlipCutoff[],
): Array<{ tag: OutboundDeliveryTag; label: string }> {
  const configuredTags = new Set(configured.map((c) => c.deliveryTag))
  return all.filter((opt) => !configuredTags.has(opt.tag))
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function extractErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const anyErr = err as {
      response?: { data?: { message?: string } }
      message?: string
    }
    const beMsg = anyErr.response?.data?.message
    if (beMsg) return beMsg
    if (anyErr.message) return anyErr.message
  }
  return '요청 처리 중 오류가 발생했습니다.'
}

// ---------------------------------------------------------------------------
// 페이지 컴포넌트
// ---------------------------------------------------------------------------

export function SlipCutoffConfigPage() {
  usePageTitle('출고 마감시간 설정')
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canManage = canManageSlipCutoff(canAccess)
  const canUpdate = canUpdateSlipCutoff(canAccess)
  const canDelete = canDeleteSlipCutoff(canAccess)

  const [form, setForm] = useState<SlipCutoffFormState | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // 마감시간 목록
  const cutoffQuery = useQuery({
    queryKey: ['admin', 'slip-cutoffs'],
    queryFn: listSlipCutoffs,
  })

  // 전체 OUTBOUND 태그 옵션 (등록 Modal 드롭다운용)
  const tagsQuery = useQuery({
    queryKey: ['admin', 'slip-cutoffs', 'delivery-tags'],
    queryFn: listDeliveryTagOptions,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'slip-cutoffs'] })

  const createMutation = useMutation({
    mutationFn: (req: SlipCutoffCreateRequest) => createSlipCutoff(req),
    onSuccess: () => {
      void invalidate()
      setForm(null)
      setSubmitError(null)
    },
    onError: (err: unknown) => setSubmitError(extractErrorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: SlipCutoffUpdateRequest }) =>
      updateSlipCutoff(id, req),
    onSuccess: () => {
      void invalidate()
      setForm(null)
      setSubmitError(null)
    },
    onError: (err: unknown) => setSubmitError(extractErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: removeSlipCutoff,
    onSuccess: () => void invalidate(),
    // 삭제 실패(403/404 등)는 폼 밖 액션이므로 alert 로 사용자 통지(무음 실패 방지)
    onError: (err: unknown) => window.alert(extractErrorMessage(err)),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    const validationError = validateSlipCutoffForm(form)
    if (validationError) {
      setSubmitError(validationError)
      return
    }
    if (form.editing) {
      // 방어 가드: UI 권한 노출과 일관성 유지 (BE 가 최종 권위)
      if (!canUpdate) return
      updateMutation.mutate({
        id: form.editing.id,
        req: {
          cutoffTime: form.cutoffTime,
          active: form.active,
        },
      })
      return
    }
    // 방어 가드: UI 권한 노출과 일관성 유지 (BE 가 최종 권위)
    if (!canManage) return
    createMutation.mutate({
      deliveryTag: form.deliveryTag as OutboundDeliveryTag,
      cutoffTime: form.cutoffTime,
      active: form.active,
    })
  }

  // 등록 Modal 에서 선택 가능한 태그 (이미 설정된 태그 제외)
  const rows = cutoffQuery.data ?? []
  const allTags = tagsQuery.data ?? []
  const availableTags = useMemo(
    () => availableTagsForForm(allTags, rows),
    [allTags, rows],
  )

  const columns: DataTableColumn<SlipCutoff>[] = useMemo(
    () => [
      {
        key: 'deliveryTagLabel',
        header: '배송태그',
        width: '130px',
        render: (row) => (
          <span data-testid={`admin-slip-cutoff-row-${row.deliveryTag}`}>
            {row.deliveryTagLabel}
          </span>
        ),
      },
      {
        key: 'cutoffTime',
        header: '마감시각',
        width: '100px',
        render: (row) => row.cutoffTime,
      },
      {
        key: 'active',
        header: '활성',
        width: '100px',
        render: (row) => (
          <Badge variant={row.active ? 'success' : 'neutral'}>
            {row.active ? '활성' : '비활성'}
          </Badge>
        ),
      },
      {
        key: 'id',
        header: '관리',
        width: '150px',
        render: (row) => {
          const hasAnyAction = canUpdate || canDelete
          if (!hasAnyAction) {
            return <span style={{ color: 'var(--color-neutral-500)' }}>조회 전용</span>
          }
          return (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {canUpdate ? (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`admin-slip-cutoff-edit-${row.deliveryTag}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!canUpdate) return
                    setSubmitError(null)
                    setForm({
                      editing: row,
                      deliveryTag: row.deliveryTag,
                      cutoffTime: row.cutoffTime,
                      active: row.active,
                    })
                  }}
                >
                  수정
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`admin-slip-cutoff-delete-${row.deliveryTag}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!canDelete) return
                    const label =
                      row.deliveryTagLabel ||
                      OUTBOUND_DELIVERY_TAG_LABELS[row.deliveryTag] ||
                      row.deliveryTag
                    if (
                      window.confirm(
                        `"${label}" 마감시간 설정을 삭제하시겠습니까?`,
                      )
                    ) {
                      deleteMutation.mutate(row.id)
                    }
                  }}
                >
                  삭제
                </Button>
              ) : null}
            </div>
          )
        },
      },
    ],
    [canUpdate, canDelete, deleteMutation.mutate],
  )

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <div style={headerStyle}>
        <h3 style={{ margin: 0 }}>출고 마감시간 설정</h3>
      </div>
      <p style={descriptionStyle}>
        배송태그별 당일 출고전표 생성 마감시각을 설정합니다. 마감시각 이후 해당 태그의 당일 출고전표 생성이 차단됩니다.
      </p>

      {canManage ? (
        <div style={{ marginBottom: 16 }}>
          <Button
            variant="primary"
            data-testid="admin-slip-cutoff-add-button"
            onClick={() => {
              setSubmitError(null)
              setForm({ ...EMPTY_SLIP_CUTOFF_FORM })
            }}
          >
            등록
          </Button>
        </div>
      ) : null}

      {cutoffQuery.isError ? (
        <div
          role="alert"
          style={errorStyle}
          data-testid="admin-slip-cutoff-load-error"
        >
          목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : null}

      <div data-testid="admin-slip-cutoff-table">
        <DataTable
          columns={columns}
          rows={rows}
          loading={cutoffQuery.isLoading}
          rowKey={(row) => row.id}
          emptyMessage="등록된 마감시간 설정이 없습니다."
        />
      </div>

      {form ? (
        <div data-testid="admin-slip-cutoff-form-modal">
          <Modal
            open
            onClose={() => {
              if (!isSubmitting) {
                setForm(null)
                setSubmitError(null)
              }
            }}
            title={form.editing ? '마감시간 수정' : '마감시간 등록'}
            description={
              form.editing
                ? '마감시각과 활성 여부를 변경할 수 있습니다. 배송태그는 변경할 수 없습니다.'
                : '설정할 배송태그와 당일 마감시각을 입력하세요.'
            }
            size="md"
            footer={
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setForm(null)
                    setSubmitError(null)
                  }}
                  disabled={isSubmitting}
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {form.editing ? '수정' : '등록'}
                </Button>
              </>
            }
          >
            <form onSubmit={handleSubmit} style={formStyle}>
              {/* 배송태그 — 등록 시 select, 수정 시 고정 라벨 */}
              {form.editing ? (
                <FormField
                  label="배송태그"
                  render={({ id }) => (
                    <div
                      id={id}
                      style={readonlyFieldStyle}
                      data-testid="admin-slip-cutoff-form-tag-label"
                    >
                      {form.editing?.deliveryTagLabel ||
                        (form.editing ? OUTBOUND_DELIVERY_TAG_LABELS[form.editing.deliveryTag] : '') ||
                        form.editing?.deliveryTag}
                    </div>
                  )}
                />
              ) : (
                <FormField
                  label="배송태그"
                  required
                  render={({ id, ariaDescribedBy }) => (
                    <select
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      value={form.deliveryTag}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          deliveryTag: e.target.value as OutboundDeliveryTag,
                        })
                      }
                      disabled={isSubmitting}
                      data-testid="admin-slip-cutoff-form-tag"
                      style={selectStyle}
                    >
                      <option value="">태그 선택</option>
                      {availableTags.map((opt) => (
                        <option key={opt.tag} value={opt.tag}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                />
              )}

              {/* 마감시각 — 24시간제 명시(브라우저 로케일 12h/24h 혼동 방지) */}
              <FormField
                label="마감시각 (24시간제, 예: 14:00)"
                required
                render={({ id, ariaDescribedBy }) => (
                  <input
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    type="time"
                    value={form.cutoffTime}
                    onChange={(e) =>
                      setForm({ ...form, cutoffTime: e.target.value })
                    }
                    disabled={isSubmitting}
                    data-testid="admin-slip-cutoff-form-time"
                    style={inputStyle}
                  />
                )}
              />

              {/* 활성 여부 */}
              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  disabled={isSubmitting}
                  data-testid="admin-slip-cutoff-form-active"
                />
                활성 (해제 시 마감 차단 미적용)
              </label>

              {submitError ? (
                <div role="alert" style={errorStyle}>
                  {submitError}
                </div>
              ) : null}
            </form>
          </Modal>
        </div>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// 스타일 상수
// ---------------------------------------------------------------------------

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 8,
}

const descriptionStyle: CSSProperties = {
  marginTop: 0,
  color: '#6B7280',
  fontSize: 13,
}

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const inputStyle: CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
}

const selectStyle: CSSProperties = {
  ...inputStyle,
  paddingRight: 4,
}

const readonlyFieldStyle: CSSProperties = {
  height: 32,
  lineHeight: '32px',
  padding: '0 10px',
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  fontSize: 13,
  background: '#F9FAFB',
  color: '#374151',
}

const checkboxRowStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
}

const errorStyle: CSSProperties = {
  padding: 8,
  borderRadius: 4,
  background: '#FEE2E2',
  color: '#991B1B',
  fontSize: 13,
}
