/**
 * 사업자 양식 페이지 — `/accounting/supplier-profiles`
 *
 * 기능:
 * - 사업자 목록 조회 (보통 1건: 기본 사업자)
 * - 수정 버튼 → Modal 인라인 편집 (BE Bean Validation 일치)
 * - 신규 추가 버튼 (다중 사업자 대비, MANAGER/MASTER 만)
 * - 기본 사업자 전환 토글 (MANAGER/MASTER 만)
 * - 삭제 버튼 (비기본 row 만, MANAGER/MASTER 만)
 *
 * RoleGuard:
 * - ACCOUNTANT: 조회 (read-only — 수정/추가/삭제 버튼 미표시)
 * - MANAGER/MASTER: 전체 CRUD
 *
 * UUID 비공개 가드:
 * - id UUID 화면 미노출. businessNumber / companyName 만 사용자 식별자.
 *
 * 필드 (BE `SupplierProfileRequest` Bean Validation 일치):
 * - businessNumber: 10자리 숫자 (@Pattern)
 * - subBusinessNumber: 4자리 숫자 optional (@Pattern, nullable)
 * - companyName: 필수 (@NotBlank)
 * - ceoName: 필수 (@NotBlank)
 * - address: 필수 (@NotBlank)
 * - businessType: 필수 (@NotBlank)
 * - businessItem: 필수 (@NotBlank)
 * - email: 이메일 형식 (@Email, nullable)
 */
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Modal,
  Input,
  Card,
  Badge,
} from '@samhan/design-system'
import {
  listSupplierProfiles,
  createSupplierProfile,
  updateSupplierProfile,
  markAsPrimarySupplierProfile,
  deleteSupplierProfile,
  canWriteSupplierProfile,
  type SupplierProfile,
  type SupplierProfileRequest,
} from '../../api/supplierProfileApi'
import { useSessionStore } from '../../stores/session'
import { usePageTitle } from '../../hooks/usePageTitle'

// ── 필드 유효성 검사 ─────────────────────────────────────────────────────────

interface FieldErrors {
  businessNumber?: string
  subBusinessNumber?: string
  companyName?: string
  ceoName?: string
  address?: string
  businessType?: string
  businessItem?: string
  email?: string
}

/** Bean Validation 기준 클라이언트 사이드 검사 */
function validate(form: SupplierProfileRequest): FieldErrors {
  const errors: FieldErrors = {}
  if (!/^\d{10}$/.test(form.businessNumber)) {
    errors.businessNumber = '사업자등록번호는 10자리 숫자여야 합니다.'
  }
  if (
    form.subBusinessNumber !== null
    && form.subBusinessNumber !== ''
    && !/^\d{4}$/.test(form.subBusinessNumber)
  ) {
    errors.subBusinessNumber = '종사업장번호는 4자리 숫자여야 합니다.'
  }
  if (!form.companyName.trim()) errors.companyName = '상호를 입력해 주세요.'
  if (!form.ceoName.trim()) errors.ceoName = '대표 성명을 입력해 주세요.'
  if (!form.address.trim()) errors.address = '사업장 주소를 입력해 주세요.'
  if (!form.businessType.trim()) errors.businessType = '업태를 입력해 주세요.'
  if (!form.businessItem.trim()) errors.businessItem = '종목을 입력해 주세요.'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = '이메일 형식이 올바르지 않습니다.'
  }
  return errors
}

/** 사업자등록번호 표시 포맷 (000-00-00000) */
function formatBizNo(raw: string): string {
  if (raw.length !== 10) return raw
  return `${raw.slice(0, 3)}-${raw.slice(3, 5)}-${raw.slice(5)}`
}

// ── 초기 폼 값 ───────────────────────────────────────────────────────────────

const EMPTY_FORM: SupplierProfileRequest = {
  businessNumber: '',
  subBusinessNumber: null,
  companyName: '',
  ceoName: '',
  address: '',
  businessType: '',
  businessItem: '',
  email: '',
}

function profileToForm(p: SupplierProfile): SupplierProfileRequest {
  return {
    businessNumber: p.businessNumber,
    subBusinessNumber: p.subBusinessNumber,
    companyName: p.companyName,
    ceoName: p.ceoName,
    address: p.address,
    businessType: p.businessType,
    businessItem: p.businessItem,
    email: p.email,
  }
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export function SupplierProfilePage() {
  usePageTitle('사업자 양식')

  const role = useSessionStore((s) => s.auth?.role)
  const canWrite = canWriteSupplierProfile(role)

  const queryClient = useQueryClient()

  // 목록 조회
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['supplier-profiles'],
    queryFn: listSupplierProfiles,
  })

  // ── 모달 상태 ──
  type ModalMode = 'create' | 'edit'
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editTarget, setEditTarget] = useState<SupplierProfile | null>(null)
  const [form, setForm] = useState<SupplierProfileRequest>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)

  const openCreate = useCallback(() => {
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setApiError(null)
    setEditTarget(null)
    setModalMode('create')
    setModalOpen(true)
  }, [])

  const openEdit = useCallback((profile: SupplierProfile) => {
    setForm(profileToForm(profile))
    setFieldErrors({})
    setApiError(null)
    setEditTarget(profile)
    setModalMode('edit')
    setModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setEditTarget(null)
    setApiError(null)
  }, [])

  // 폼 필드 변경
  const setField = useCallback(
    <K extends keyof SupplierProfileRequest>(key: K, value: SupplierProfileRequest[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
    },
    [],
  )

  // ── 뮤테이션 ──
  const createMutation = useMutation({
    mutationFn: createSupplierProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-profiles'] })
      closeModal()
    },
    onError: (err: unknown) => {
      setApiError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: SupplierProfileRequest }) =>
      updateSupplierProfile(id, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-profiles'] })
      closeModal()
    },
    onError: (err: unknown) => {
      setApiError(err instanceof Error ? err.message : '수정에 실패했습니다.')
    },
  })

  const markPrimaryMutation = useMutation({
    mutationFn: markAsPrimarySupplierProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-profiles'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSupplierProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-profiles'] })
    },
  })

  // ── 폼 제출 ──
  const handleSubmit = useCallback(() => {
    const errors = validate(form)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    if (modalMode === 'create') {
      createMutation.mutate(form)
    } else if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, req: form })
    }
  }, [form, modalMode, editTarget, createMutation, updateMutation])

  const isSaving = createMutation.isPending || updateMutation.isPending

  // ── 렌더 ──
  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      {/* 페이지 헤더 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-neutral-900)' }}>
            사업자 양식
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-neutral-500)' }}>
            세금계산서 발행 시 사용되는 공급자 정보입니다.
          </p>
        </div>
        {canWrite ? (
          <Button
            variant="primary"
            onClick={openCreate}
            data-testid="supplier-profile-add-btn"
          >
            신규 추가
          </Button>
        ) : null}
      </div>

      {/* 목록 */}
      {isLoading ? (
        <p style={{ color: 'var(--color-neutral-400)', fontSize: 13 }}>불러오는 중...</p>
      ) : profiles.length === 0 ? (
        <Card>
          <p
            style={{
              textAlign: 'center',
              padding: '40px 0',
              color: 'var(--color-neutral-400)',
              fontSize: 13,
            }}
          >
            등록된 사업자 정보가 없습니다.
            {canWrite ? (
              <> 위 <strong>신규 추가</strong> 버튼으로 등록하세요.</>
            ) : null}
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              canWrite={canWrite}
              onEdit={openEdit}
              onMarkPrimary={(id) => markPrimaryMutation.mutate(id)}
              onDelete={(id) => {
                if (window.confirm('사업자 정보를 삭제하시겠습니까?')) {
                  deleteMutation.mutate(id)
                }
              }}
            />
          ))}
        </div>
      )}

      {/* 수정/신규 모달 */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={modalMode === 'create' ? '사업자 정보 신규 등록' : '사업자 정보 수정'}
        size="lg"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px 20px',
            padding: '4px 0',
          }}
        >
          <Input
            label="사업자등록번호"
            required
            error={fieldErrors.businessNumber}
            hint="숫자 10자리 (하이픈 없이 입력)"
            value={form.businessNumber}
            onChange={(e) => setField('businessNumber', e.target.value.replace(/\D/g, ''))}
            placeholder="1112233333"
            maxLength={10}
            data-testid="supplier-field-businessNumber"
          />

          <Input
            label="종사업장번호"
            error={fieldErrors.subBusinessNumber}
            hint="4자리 숫자 (해당 없으면 공백)"
            value={form.subBusinessNumber ?? ''}
            onChange={(e) =>
              setField(
                'subBusinessNumber',
                e.target.value.replace(/\D/g, '') || null,
              )
            }
            placeholder="0000"
            maxLength={4}
            data-testid="supplier-field-subBusinessNumber"
          />

          <Input
            label="상호"
            required
            error={fieldErrors.companyName}
            value={form.companyName}
            onChange={(e) => setField('companyName', e.target.value)}
            placeholder="(주)삼한공조시스템"
            data-testid="supplier-field-companyName"
          />

          <Input
            label="대표 성명"
            required
            error={fieldErrors.ceoName}
            value={form.ceoName}
            onChange={(e) => setField('ceoName', e.target.value)}
            placeholder="홍길동"
            data-testid="supplier-field-ceoName"
          />

          {/* 사업장 주소 — 2컬럼 전체 */}
          <div style={{ gridColumn: '1 / -1' }}>
            <Input
              label="사업장 주소"
              required
              error={fieldErrors.address}
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
              placeholder="서울특별시 강남구 테헤란로 152, 10층"
              data-testid="supplier-field-address"
            />
          </div>

          <Input
            label="업태"
            required
            error={fieldErrors.businessType}
            value={form.businessType}
            onChange={(e) => setField('businessType', e.target.value)}
            placeholder="도소매"
            data-testid="supplier-field-businessType"
          />

          <Input
            label="종목"
            required
            error={fieldErrors.businessItem}
            value={form.businessItem}
            onChange={(e) => setField('businessItem', e.target.value)}
            placeholder="냉난방 설비, 물류 운송"
            data-testid="supplier-field-businessItem"
          />

          {/* 이메일 — 2컬럼 전체 */}
          <div style={{ gridColumn: '1 / -1' }}>
            <Input
              label="이메일"
              type="email"
              error={fieldErrors.email}
              hint="세금계산서 수신 이메일 (선택)"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="accounting@example.com"
              data-testid="supplier-field-email"
            />
          </div>
        </div>

        {apiError ? (
          <p
            style={{
              marginTop: 12,
              padding: '8px 12px',
              background: 'var(--color-danger-50)',
              color: 'var(--color-danger-700)',
              borderRadius: 4,
              fontSize: 13,
            }}
          >
            {apiError}
          </p>
        ) : null}

        {/* 모달 하단 버튼 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--color-neutral-100)',
          }}
        >
          <Button variant="ghost" onClick={closeModal} disabled={isSaving}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSaving}
            data-testid="supplier-profile-save-btn"
          >
            {isSaving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ── ProfileCard 내부 컴포넌트 ─────────────────────────────────────────────────

interface ProfileCardProps {
  profile: SupplierProfile
  canWrite: boolean
  onEdit: (p: SupplierProfile) => void
  onMarkPrimary: (id: string) => void
  onDelete: (id: string) => void
}

function ProfileCard({
  profile,
  canWrite,
  onEdit,
  onMarkPrimary,
  onDelete,
}: ProfileCardProps) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          {/* 상호 + 배지 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--color-neutral-900)',
              }}
              data-testid="supplier-company-name"
            >
              {profile.companyName}
            </span>
            {profile.isPrimary ? (
              <Badge variant="success" data-testid="supplier-primary-badge">
                기본 사업자
              </Badge>
            ) : (
              <Badge variant="neutral">보조</Badge>
            )}
          </div>

          {/* 정보 그리드 */}
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '6px 20px',
              fontSize: 13,
            }}
          >
            <InfoRow
              label="사업자등록번호"
              value={formatBizNo(profile.businessNumber)}
              testId="supplier-business-number"
            />
            {profile.subBusinessNumber ? (
              <InfoRow label="종사업장번호" value={profile.subBusinessNumber} />
            ) : null}
            <InfoRow label="대표 성명" value={profile.ceoName} />
            <InfoRow
              label="사업장 주소"
              value={profile.address}
              fullWidth
            />
            <InfoRow label="업태" value={profile.businessType} />
            <InfoRow label="종목" value={profile.businessItem} />
            {profile.email ? (
              <InfoRow label="이메일" value={profile.email} />
            ) : null}
          </dl>
        </div>

        {/* 액션 버튼 */}
        {canWrite ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              flexShrink: 0,
            }}
          >
            <Button
              variant="ghost"
              onClick={() => onEdit(profile)}
              data-testid={`supplier-edit-btn-${profile.businessNumber}`}
            >
              수정
            </Button>
            {!profile.isPrimary ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => onMarkPrimary(profile.id)}
                  data-testid={`supplier-mark-primary-btn-${profile.businessNumber}`}
                >
                  기본 전환
                </Button>
                <Button
                  variant="danger"
                  onClick={() => onDelete(profile.id)}
                  data-testid={`supplier-delete-btn-${profile.businessNumber}`}
                >
                  삭제
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

/** 정보 단일 항목 */
function InfoRow({
  label,
  value,
  testId,
  fullWidth,
}: {
  label: string
  value: string
  testId?: string
  fullWidth?: boolean
}) {
  return (
    <div style={fullWidth ? { gridColumn: '1 / -1' } : undefined}>
      <dt
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-neutral-500)',
          textTransform: 'uppercase' as const,
          letterSpacing: 0.3,
          marginBottom: 2,
        }}
      >
        {label}
      </dt>
      <dd
        style={{ margin: 0, color: 'var(--color-neutral-800)', fontSize: 13 }}
        data-testid={testId}
      >
        {value || '—'}
      </dd>
    </div>
  )
}
