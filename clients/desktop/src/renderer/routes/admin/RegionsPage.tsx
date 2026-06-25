/**
 * 관리자 — 배차지역 관리 (`/admin/regions`).
 *
 * Phase 10 W10-1 PR-D Phase B FE-B 슬라이스. BE 출처 commit 645428e.
 *
 * <p>매뉴얼: 기존 "지역 분류 (가배차)" 운영 CSV 데이터를 Samhan Public 에 native 이식.
 * 외부 DB 직접 통신 X — CSV 데이터 우리 DB 에 native 저장 후 KakaoDispatchParser 가
 * sort_order 우선 + 광역 prefix fallback 으로 자동 매칭한다.
 *
 * <p>화면 구성:
 * - 표 (groupName / keywords (60자 truncate) / sortOrder / 액션)
 * - "단건 추가" 버튼 → form Modal (groupName / keywords / sortOrder)
 * - "CSV 업로드" 버튼 → CsvUploadDialog (Designer fa42fdf, design-system export)
 * - 행 액션: 수정 (form Modal — groupName 표시 read-only) / 삭제 (window.confirm 후 soft delete)
 *
 * <p>UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - 사용자 노출 식별자 = groupName
 * - data-testid 의 {id} suffix 도 groupName 기준 (UUID 노출 X)
 *
 * <p>풀네임 ROLE 가드: DISPATCH / MANAGER / MASTER — DISPATCH 는 조회 전용.
 *
 * <p><b>PR-H4c FE-C 보강 — 실시간 동기화</b>:
 * <ul>
 *   <li>30초 polling — 다중 워크스테이션이 같은 region table 을 수정 시 자동 반영.</li>
 *   <li>arologis-service SSE (PR-H4b BE-B): {@code GET /admin/arologis/dispatches/{id}/realtime}
 *       — entity-id 단위 dispatch SSE. region table 변경은 별도 broadcast endpoint
 *       합류 시 SSE 직접 구독으로 전환 가능.</li>
 * </ul>
 *
 * <p>data-testid:
 * - admin-regions-table
 * - admin-regions-row-{groupName}
 * - admin-regions-add-button
 * - admin-regions-import-button
 * - admin-regions-edit-{groupName}
 * - admin-regions-delete-{groupName}
 * - admin-regions-form-modal
 * - admin-regions-realtime-indicator
 */
import { useMemo, useState, type FormEvent } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Button,
  CsvUploadDialog,
  DataTable,
  FormField,
  Modal,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  createRegion,
  deleteRegion,
  importRegionsCsv,
  listRegions,
  updateRegion,
  type RegionResponse,
  type RegionUpsertRequest,
} from '../../api/regionApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'

/** keywords 컬럼 truncate 한도 (전각 문자 1자 = 1로 단순 계산). */
const KEYWORDS_TRUNCATE = 60

/** keywords 표시 truncate — 60자 초과 시 말줄임표. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

interface FormState {
  /** edit 모드일 때 set; create 모드는 null. */
  editing: RegionResponse | null
  groupName: string
  keywords: string
  sortOrder: string
}

const EMPTY_FORM: FormState = {
  editing: null,
  groupName: '',
  keywords: '',
  sortOrder: '',
}

export function RegionsPage() {
  usePageTitle('배차지역 관리')
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  // [C5-2b] auth?.role==='MASTER'||'MANAGER' → canAccess('arologis.region.manage', 'create').
  // BE @RequirePermission(page="arologis.region.manage", action=CREATE/UPDATE/DELETE) — RegionAdminController.
  const canManageRegions = canAccess('arologis.region.manage', 'create')

  const [form, setForm] = useState<FormState | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const regionsQuery = useQuery({
    queryKey: ['admin', 'regions'],
    queryFn: listRegions,
    // PR-H4c FE-C: 30초 polling — 멀티 워크스테이션 동기화 안전망 (BE broadcast SSE 합류 전 단계).
    refetchInterval: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: (req: RegionUpsertRequest) => createRegion(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'regions'] })
      setForm(null)
      setSubmitError(null)
    },
    onError: (err: unknown) => {
      setSubmitError(extractErrorMessage(err))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: RegionUpsertRequest }) =>
      updateRegion(id, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'regions'] })
      setForm(null)
      setSubmitError(null)
    },
    onError: (err: unknown) => {
      setSubmitError(extractErrorMessage(err))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRegion(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'regions'] })
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    const groupName = form.groupName.trim()
    const keywords = form.keywords.trim()
    const sortOrderRaw = form.sortOrder.trim()
    if (!keywords) {
      setSubmitError('검색어 (keywords) 는 필수입니다.')
      return
    }
    let sortOrder: number | null = null
    if (sortOrderRaw !== '') {
      const parsed = Number.parseInt(sortOrderRaw, 10)
      if (!Number.isFinite(parsed)) {
        setSubmitError('정렬 순서는 정수여야 합니다.')
        return
      }
      sortOrder = parsed
    }

    if (form.editing) {
      // 수정 — groupName 불변, keywords + sortOrder 만 갱신
      updateMutation.mutate({
        id: form.editing.id,
        req: { keywords, sortOrder },
      })
    } else {
      // 신규 — groupName 필수
      if (!groupName) {
        setSubmitError('분류 그룹명은 필수입니다.')
        return
      }
      createMutation.mutate({ groupName, keywords, sortOrder })
    }
  }

  const columns: DataTableColumn<RegionResponse>[] = useMemo(
    () => [
      {
        key: 'groupName',
        header: '분류 그룹',
        width: '180px',
        mobilePriority: 'primary',
        render: (r) => (
          <span data-testid={`admin-regions-row-${r.groupName}`}>
            {r.groupName}
          </span>
        ),
      },
      {
        key: 'keywords',
        header: '검색어 (시군구)',
        mobilePriority: 'secondary',
        render: (r) => (
          <span title={r.keywords}>{truncate(r.keywords, KEYWORDS_TRUNCATE)}</span>
        ),
      },
      {
        key: 'sortOrder',
        header: '정렬 순서',
        width: '100px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (r) => (r.sortOrder ?? 0).toLocaleString(),
      },
      {
        key: 'id',
        header: '관리',
        width: '180px',
        mobilePriority: 'hidden',
        render: (r) => (
          canManageRegions ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`admin-regions-edit-${r.groupName}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setSubmitError(null)
                  setForm({
                    editing: r,
                    groupName: r.groupName,
                    keywords: r.keywords,
                    sortOrder: r.sortOrder == null ? '' : String(r.sortOrder),
                  })
                }}
              >
                수정
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`admin-regions-delete-${r.groupName}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (
                    window.confirm(
                      `"${r.groupName}" 분류를 삭제하시겠습니까? (Soft Delete)`,
                    )
                  ) {
                    deleteMutation.mutate(r.id)
                  }
                }}
              >
                삭제
              </Button>
            </div>
          ) : (
            <span style={{ color: 'var(--color-neutral-500)' }}>조회 전용</span>
          )
        ),
      },
    ],
    [canManageRegions, deleteMutation],
  )

  const isSubmitting =
    createMutation.isPending || updateMutation.isPending

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <h3 style={{ margin: 0 }}>배차지역 관리</h3>
        <span
          data-testid="admin-regions-realtime-indicator"
          style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
        >
          실시간 자동 갱신 · 30초
        </span>
      </div>
      <p style={{ marginTop: 0, color: '#6B7280', fontSize: 13 }}>
        시군구 검색어로 가배차 정차 자동 매칭. 정렬 순서가 낮을수록 우선 평가됩니다.
      </p>

      {canManageRegions ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="primary"
            data-testid="admin-regions-add-button"
            onClick={() => {
              setSubmitError(null)
              setForm({ ...EMPTY_FORM })
            }}
          >
            단건 추가
          </Button>
          <Button
            variant="secondary"
            data-testid="admin-regions-import-button"
            onClick={() => setImportOpen(true)}
          >
            CSV 업로드
          </Button>
        </div>
      ) : null}

      <div data-testid="admin-regions-table">
        <DataTable
          columns={columns}
          rows={Array.isArray(regionsQuery.data) ? regionsQuery.data : []}
          loading={regionsQuery.isLoading}
          rowKey={(r) => r.id}
          emptyMessage="등록된 지역 분류가 없습니다."
        />
      </div>

      {form ? (
        <div data-testid="admin-regions-form-modal">
          <Modal
            open
            onClose={() => {
              if (!isSubmitting) {
                setForm(null)
                setSubmitError(null)
              }
            }}
            title={form.editing ? '지역 분류 수정' : '지역 분류 단건 추가'}
            description={
              form.editing
                ? '분류 그룹명은 변경할 수 없습니다. 검색어와 정렬 순서만 수정됩니다.'
                : '기존 지역 분류표와 동일 형식으로 입력하세요.'
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
                  {form.editing ? '수정' : '추가'}
                </Button>
              </>
            }
          >
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <FormField
                label="분류 그룹"
                required
                render={({ id, ariaDescribedBy }) => (
                  <input
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    type="text"
                    value={form.groupName}
                    onChange={(e) =>
                      setForm({ ...form, groupName: e.target.value })
                    }
                    disabled={!!form.editing || isSubmitting}
                    maxLength={50}
                    data-testid="admin-regions-form-group-name"
                    style={inputStyle}
                    placeholder="예: 서울 강남"
                  />
                )}
              />
              <FormField
                label="검색어 (시군구, 콤마 구분)"
                required
                hint="예: 서초구, 강남구, 송파구"
                render={({ id, ariaDescribedBy }) => (
                  <textarea
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    value={form.keywords}
                    onChange={(e) =>
                      setForm({ ...form, keywords: e.target.value })
                    }
                    disabled={isSubmitting}
                    rows={4}
                    data-testid="admin-regions-form-keywords"
                    style={{
                      ...inputStyle,
                      height: 'auto',
                      minHeight: 80,
                      paddingTop: 8,
                      paddingBottom: 8,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                    placeholder="시군구를 콤마로 구분하여 입력"
                  />
                )}
              />
              <FormField
                label="정렬 순서 (낮을수록 우선)"
                hint="비워두면 0 으로 처리됩니다."
                render={({ id, ariaDescribedBy }) => (
                  <input
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm({ ...form, sortOrder: e.target.value })
                    }
                    disabled={isSubmitting}
                    data-testid="admin-regions-form-sort-order"
                    style={inputStyle}
                    placeholder="0"
                  />
                )}
              />
              {submitError ? (
                <div
                  role="alert"
                  style={{
                    padding: 8,
                    borderRadius: 4,
                    background: '#FEE2E2',
                    color: '#991B1B',
                    fontSize: 13,
                  }}
                >
                  {submitError}
                </div>
              ) : null}
            </form>
          </Modal>
        </div>
      ) : null}

      <CsvUploadDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="지역 분류 CSV 일괄 등록"
        description="기존 운영 CSV (분류 그룹, 검색어 헤더) 를 업로드하세요. UTF-8 BOM 자동 처리."
        onUpload={async (file) => {
          const result = await importRegionsCsv(file)
          // 업로드 성공 시 표 갱신 — 결과 다이얼로그가 닫혀도 최신 상태 반영
          void queryClient.invalidateQueries({ queryKey: ['admin', 'regions'] })
          return result
        }}
      />
    </>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
}

/** axios / BE error 에서 한국어 message 추출 — fallback 영문 message. */
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
