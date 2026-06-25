/**
 * 공급자 설정 페이지 — `/accounting/supplier-profiles`
 *
 * 기능:
 * - 사업자 목록 조회 (보통 1건: 기본 사업자)
 * - 수정 버튼 → Modal 인라인 편집 (BE Bean Validation 일치)
 * - 신규 추가 버튼 (다중 사업자 대비, MANAGER/MASTER 만)
 * - 기본 사업자 전환 토글 (MANAGER/MASTER 만)
 * - 삭제 버튼 (비기본 row 만, MANAGER/MASTER 만)
 * - TEL/FAX 입력 (신규 — spec §2b)
 * - 입금계좌 리스트 편집기 (신규 — spec §2b): 행 추가/삭제, 예금주/은행/계좌번호, 순서 = displayOrder
 * - 인감 업로드 (신규 — spec §2b): PNG only, ≤200KB, base64 + SHA-256 → PUT /{id}/stamp, 미리보기 + 삭제
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
 * - representativeName: 필수 (@NotBlank)
 * - businessAddress: 필수 (@NotBlank)
 * - businessType: 필수 (@NotBlank)
 * - businessItem: 필수 (@NotBlank)
 * - email: 이메일 형식 (@Email, nullable)
 * - tel: nullable, 최대 30자
 * - fax: nullable, 최대 30자
 * - bankAccounts: replace-all 시맨틱
 */
import { useState, useCallback, useRef, type ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Modal,
  Input,
  Card,
  Badge,
  FormGrid,
} from '@samhan/design-system'
import {
  listSupplierProfiles,
  getSupplierProfile,
  createSupplierProfile,
  updateSupplierProfile,
  markAsPrimarySupplierProfile,
  deleteSupplierProfile,
  uploadSupplierStamp,
  deleteSupplierStamp,
  uploadSupplierLogo,
  deleteSupplierLogo,
  type SupplierProfile,
  type SupplierProfileRequest,
  type SupplierBankAccountRequest,
} from '../../api/supplierProfileApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'

// ── 입금계좌 행 편집 타입 ──────────────────────────────────────────────────────

interface BankAccountRow {
  accountHolder: string
  bankName: string
  accountNumber: string
  /** 명세서 노출 여부 (default: true) */
  exposed: boolean
}

// ── 필드 유효성 검사 ─────────────────────────────────────────────────────────

interface FieldErrors {
  businessNumber?: string
  subBusinessNumber?: string
  companyName?: string
  representativeName?: string
  businessAddress?: string
  businessType?: string
  businessItem?: string
  email?: string
  tel?: string
  fax?: string
  bankAccounts?: string
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
  if (!form.representativeName.trim()) errors.representativeName = '대표 성명을 입력해 주세요.'
  if (!form.businessAddress.trim()) errors.businessAddress = '사업장 주소를 입력해 주세요.'
  if (!form.businessType.trim()) errors.businessType = '업태를 입력해 주세요.'
  if (!form.businessItem.trim()) errors.businessItem = '종목을 입력해 주세요.'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = '이메일 형식이 올바르지 않습니다.'
  }
  if (form.tel && form.tel.length > 30) errors.tel = '전화번호는 30자 이하여야 합니다.'
  if (form.fax && form.fax.length > 30) errors.fax = '팩스 번호는 30자 이하여야 합니다.'
  // Fix 4: 입금계좌 행 빈 필드 검증 (BE @NotBlank 동형)
  const blankBankRow = form.bankAccounts.findIndex(
    (a) => !a.accountHolder.trim() || !a.bankName.trim() || !a.accountNumber.trim(),
  )
  if (blankBankRow >= 0) {
    errors.bankAccounts = `${blankBankRow + 1}번째 계좌의 예금주·은행명·계좌번호를 모두 입력해 주세요.`
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
  representativeName: '',
  businessAddress: '',
  businessType: '',
  businessItem: '',
  email: '',
  tel: null,
  fax: null,
  bankAccounts: [],
}

function profileToForm(p: SupplierProfile): SupplierProfileRequest {
  return {
    businessNumber: p.businessNumber,
    subBusinessNumber: p.subBusinessNumber,
    companyName: p.companyName,
    representativeName: p.representativeName ?? p.ceoName ?? '',
    businessAddress: p.businessAddress ?? p.address ?? '',
    businessType: p.businessType,
    businessItem: p.businessItem,
    email: p.email,
    tel: p.tel ?? null,
    fax: p.fax ?? null,
    bankAccounts: (p.bankAccounts ?? []).map((a) => ({
      accountHolder: a.accountHolder,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      exposed: a.exposed !== false, // undefined/null 시 true 로 정규화
    })),
  }
}

// ── Web Crypto SHA-256 ───────────────────────────────────────────────────────

/**
 * File → SHA-256 hex 64자 계산 (Web Crypto API).
 * BE stamp 업로드 요청에 포함 필수.
 */
async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  const hashArr = Array.from(new Uint8Array(hashBuf))
  return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * File → base64 문자열 (data: prefix 제외).
 * FileReader 비동기 패턴 (SalesVendorOrderUploadPage 재사용).
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // "data:image/png;base64,XXXXX" → "XXXXX"
      const base64 = result.split(',')[1] ?? result
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다.'))
    reader.readAsDataURL(file)
  })
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export function SupplierProfilePage() {
  usePageTitle('공급자 설정')

  const { canAccess } = usePermissions()
  const canCreateSupplierProfile = canAccess('accounting.supplier-profiles', 'create')
  const canUpdateSupplierProfile = canAccess('accounting.supplier-profiles', 'update')
  const canDeleteSupplierProfile = canAccess('accounting.supplier-profiles', 'delete')

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
  const [bankRows, setBankRows] = useState<BankAccountRow[]>([])
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)

  // ── 인감 업로드 상태 ──
  const [stampPreviewUrl, setStampPreviewUrl] = useState<string | null>(null)
  const [stampFile, setStampFile] = useState<File | null>(null)
  const [stampError, setStampError] = useState<string | null>(null)
  const stampInputRef = useRef<HTMLInputElement>(null)

  // ── 로고 업로드 상태 ──
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const openCreate = useCallback(() => {
    setForm(EMPTY_FORM)
    setBankRows([])
    setFieldErrors({})
    setApiError(null)
    setEditTarget(null)
    setModalMode('create')
    setStampPreviewUrl(null)
    setStampFile(null)
    setStampError(null)
    setLogoPreviewUrl(null)
    setLogoFile(null)
    setLogoError(null)
    setModalOpen(true)
  }, [])

  // P1-B: 편집 시 상세 fetch — 목록 row 대신 getSupplierProfile(id) 로 최신 상세 취득
  // (stampPngBase64/logoPngBase64 포함)
  const openEdit = useCallback(async (profile: SupplierProfile) => {
    setApiError(null)
    setFieldErrors({})
    try {
      const detail = await getSupplierProfile(profile.id)
      const f = profileToForm(detail)
      setForm(f)
      setBankRows(f.bankAccounts.map((a) => ({
        accountHolder: a.accountHolder,
        bankName: a.bankName,
        accountNumber: a.accountNumber,
        exposed: a.exposed !== false,
      })))
      setEditTarget(detail)
      setModalMode('edit')
      setStampPreviewUrl(
        detail.stampPngBase64 ? `data:image/png;base64,${detail.stampPngBase64}` : null,
      )
      setStampFile(null)
      setStampError(null)
      setLogoPreviewUrl(
        detail.logoPngBase64 ? `data:image/png;base64,${detail.logoPngBase64}` : null,
      )
      setLogoFile(null)
      setLogoError(null)
      setModalOpen(true)
    } catch (err) {
      // Fix 3: 상세 조회 실패 시에도 모달을 열어 에러 표시 (기존 목록 row 데이터로 fallback)
      const f = profileToForm(profile)
      setForm(f)
      setBankRows(f.bankAccounts.map((a) => ({
        accountHolder: a.accountHolder,
        bankName: a.bankName,
        accountNumber: a.accountNumber,
        exposed: a.exposed !== false,
      })))
      setEditTarget(profile)
      setModalMode('edit')
      setStampPreviewUrl(null)
      setStampFile(null)
      setStampError(null)
      setLogoPreviewUrl(null)
      setLogoFile(null)
      setLogoError(null)
      setApiError(err instanceof Error ? err.message : '상세 조회에 실패했습니다. 일부 정보가 누락될 수 있습니다.')
      setModalOpen(true)
    }
  }, [])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setEditTarget(null)
    setApiError(null)
    setStampFile(null)
    setStampError(null)
    setLogoFile(null)
    setLogoError(null)
  }, [])

  // 폼 필드 변경
  const setField = useCallback(
    <K extends keyof SupplierProfileRequest>(key: K, value: SupplierProfileRequest[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
    },
    [],
  )

  // ── 입금계좌 행 편집 ──
  const addBankRow = useCallback(() => {
    setBankRows((prev) => [...prev, { accountHolder: '', bankName: '', accountNumber: '', exposed: true }])
  }, [])

  const removeBankRow = useCallback((idx: number) => {
    setBankRows((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const setBankRowField = useCallback(
    (idx: number, key: keyof BankAccountRow, value: string | boolean) => {
      setBankRows((prev) =>
        prev.map((row, i) => (i === idx ? { ...row, [key]: value } : row)),
      )
    },
    [],
  )

  /** bankRows → SupplierBankAccountRequest[] (배열 인덱스 = displayOrder, BE 재계산) */
  const buildBankAccounts = useCallback(
    (): SupplierBankAccountRequest[] =>
      bankRows.map((row) => ({
        accountHolder: row.accountHolder,
        bankName: row.bankName,
        accountNumber: row.accountNumber,
        exposed: row.exposed,
      })),
    [bankRows],
  )

  // ── 인감 파일 입력 ──
  const handleStampFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'image/png') {
      setStampError('PNG 파일만 업로드 가능합니다.')
      if (stampInputRef.current) stampInputRef.current.value = ''
      return
    }
    if (file.size > 200 * 1024) {
      setStampError('인감 이미지는 200KB 이하여야 합니다.')
      if (stampInputRef.current) stampInputRef.current.value = ''
      return
    }
    setStampError(null)
    setStampFile(file)
    // 미리보기 URL
    const objectUrl = URL.createObjectURL(file)
    setStampPreviewUrl(objectUrl)
  }, [])

  const handleStampRemove = useCallback(() => {
    setStampFile(null)
    setStampPreviewUrl(null)
    setStampError(null)
    if (stampInputRef.current) stampInputRef.current.value = ''
  }, [])

  // ── 로고 파일 입력 ──
  const handleLogoFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'image/png') {
      setLogoError('PNG 파일만 업로드 가능합니다.')
      if (logoInputRef.current) logoInputRef.current.value = ''
      return
    }
    if (file.size > 200 * 1024) {
      setLogoError('로고 이미지는 200KB 이하여야 합니다.')
      if (logoInputRef.current) logoInputRef.current.value = ''
      return
    }
    setLogoError(null)
    setLogoFile(file)
    const objectUrl = URL.createObjectURL(file)
    setLogoPreviewUrl(objectUrl)
  }, [])

  const handleLogoRemove = useCallback(() => {
    setLogoFile(null)
    setLogoPreviewUrl(null)
    setLogoError(null)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }, [])

  // ── 뮤테이션 ──
  const createMutation = useMutation({
    mutationFn: createSupplierProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-profiles'] })
      void queryClient.invalidateQueries({ queryKey: ['supplier-profile-primary'] })
      void queryClient.invalidateQueries({ queryKey: ['supplier-print-profile'] })
      closeModal()
    },
    onError: (err: unknown) => {
      setApiError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: SupplierProfileRequest }) =>
      updateSupplierProfile(id, req),
    onSuccess: async (updated) => {
      // P3 invalidate fix: 프로필 수정 자체 성공 — stamp/logo 업로드 실패와 무관하게 목록 갱신
      void queryClient.invalidateQueries({ queryKey: ['supplier-profiles'] })
      void queryClient.invalidateQueries({ queryKey: ['supplier-profile-primary'] })
      void queryClient.invalidateQueries({ queryKey: ['supplier-print-profile'] })

      // 수정 후 인감 파일이 있으면 stamp 업로드
      if (stampFile) {
        try {
          const [base64, hash] = await Promise.all([
            fileToBase64(stampFile),
            sha256Hex(stampFile),
          ])
          await uploadSupplierStamp(updated.id, { stampPngBase64: base64, stampHash: hash })
          void queryClient.invalidateQueries({ queryKey: ['supplier-profiles'] })
          void queryClient.invalidateQueries({ queryKey: ['supplier-print-profile'] })
        } catch (err) {
          setApiError(err instanceof Error ? err.message : '인감 업로드에 실패했습니다.')
          return
        }
      }
      // 로고 파일이 있으면 logo 업로드
      if (logoFile) {
        try {
          const [base64, hash] = await Promise.all([
            fileToBase64(logoFile),
            sha256Hex(logoFile),
          ])
          await uploadSupplierLogo(updated.id, { logoPngBase64: base64, logoHash: hash })
          void queryClient.invalidateQueries({ queryKey: ['supplier-profiles'] })
          void queryClient.invalidateQueries({ queryKey: ['supplier-print-profile'] })
        } catch (err) {
          setApiError(err instanceof Error ? err.message : '로고 업로드에 실패했습니다.')
          return
        }
      }
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
      void queryClient.invalidateQueries({ queryKey: ['supplier-profile-primary'] })
      void queryClient.invalidateQueries({ queryKey: ['supplier-print-profile'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSupplierProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-profiles'] })
      void queryClient.invalidateQueries({ queryKey: ['supplier-profile-primary'] })
      void queryClient.invalidateQueries({ queryKey: ['supplier-print-profile'] })
    },
  })

  const deleteStampMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => deleteSupplierStamp(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-profiles'] })
      void queryClient.invalidateQueries({ queryKey: ['supplier-profile-primary'] })
      void queryClient.invalidateQueries({ queryKey: ['supplier-print-profile'] })
      setStampPreviewUrl(null)
      setStampFile(null)
    },
  })

  const deleteLogoMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => deleteSupplierLogo(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-profiles'] })
      void queryClient.invalidateQueries({ queryKey: ['supplier-profile-primary'] })
      void queryClient.invalidateQueries({ queryKey: ['supplier-print-profile'] })
      setLogoPreviewUrl(null)
      setLogoFile(null)
    },
  })

  // ── 폼 제출 ──
  const handleSubmit = useCallback(() => {
    const canSave =
      modalMode === 'create'
        ? canCreateSupplierProfile
        : canUpdateSupplierProfile
    if (!canSave) return

    const reqWithBanks: SupplierProfileRequest = {
      ...form,
      bankAccounts: buildBankAccounts(),
    }
    const errors = validate(reqWithBanks)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    if (modalMode === 'create') {
      createMutation.mutate(reqWithBanks)
    } else if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, req: reqWithBanks })
    }
  }, [
    canCreateSupplierProfile,
    canUpdateSupplierProfile,
    form,
    modalMode,
    editTarget,
    buildBankAccounts,
    createMutation,
    updateMutation,
  ])

  const isSaving = createMutation.isPending || updateMutation.isPending
  const canSaveProfile =
    modalMode === 'create'
      ? canCreateSupplierProfile
      : canUpdateSupplierProfile

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
            공급자 설정
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-neutral-500)' }}>
            거래명세서·세금계산서 인쇄 양식에 사용되는 공급자 정보, 입금계좌, 인감·로고를 관리합니다.
          </p>
        </div>
        {canCreateSupplierProfile ? (
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
            {canCreateSupplierProfile ? (
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
              canEdit={canUpdateSupplierProfile}
              canMarkPrimary={canUpdateSupplierProfile}
              canDelete={canDeleteSupplierProfile}
              onEdit={openEdit}
              onMarkPrimary={(id) => markPrimaryMutation.mutate(id)}
              onDeleteStamp={(id) => {
                if (window.confirm('등록된 인감을 삭제하시겠습니까?')) {
                  deleteStampMutation.mutate({ id })
                }
              }}
              onDeleteLogo={(id) => {
                if (window.confirm('등록된 로고를 삭제하시겠습니까?')) {
                  deleteLogoMutation.mutate({ id })
                }
              }}
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
        <div style={{ padding: '4px 0' }}>
          <FormGrid columns={2} gap="12px 20px">
          <Input
            label="사업자등록번호"
            required
            error={fieldErrors.businessNumber}
            hint="숫자 10자리 (하이픈 없이 입력)"
            value={form.businessNumber}
            onChange={(e) => setField('businessNumber', e.target.value.replace(/\D/g, ''))}
            placeholder="2148720659"
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
            error={fieldErrors.representativeName}
            value={form.representativeName}
            onChange={(e) => setField('representativeName', e.target.value)}
            placeholder="홍길동"
            data-testid="supplier-field-representativeName"
          />

          {/* 사업장 주소 — 2컬럼 전체 */}
          <FormGrid.Full>
            <Input
              label="사업장 주소"
              required
              error={fieldErrors.businessAddress}
              value={form.businessAddress}
              onChange={(e) => setField('businessAddress', e.target.value)}
              placeholder="서울특별시 서초구 마방로2길 9 삼한빌딩 4층"
              data-testid="supplier-field-businessAddress"
            />
          </FormGrid.Full>

          <Input
            label="업태"
            required
            error={fieldErrors.businessType}
            value={form.businessType}
            onChange={(e) => setField('businessType', e.target.value)}
            placeholder="도매 및 소매업"
            data-testid="supplier-field-businessType"
          />

          <Input
            label="종목"
            required
            error={fieldErrors.businessItem}
            value={form.businessItem}
            onChange={(e) => setField('businessItem', e.target.value)}
            placeholder="공조설비, 냉난방기"
            data-testid="supplier-field-businessItem"
          />

          <Input
            label="대표 전화"
            error={fieldErrors.tel}
            hint="선택 입력 (예: 02-3461-0000)"
            value={form.tel ?? ''}
            onChange={(e) => setField('tel', e.target.value || null)}
            placeholder="02-3461-0000"
            maxLength={30}
            data-testid="supplier-field-tel"
          />

          <Input
            label="팩스"
            error={fieldErrors.fax}
            hint="선택 입력 (예: 02-3461-0001)"
            value={form.fax ?? ''}
            onChange={(e) => setField('fax', e.target.value || null)}
            placeholder="02-3461-0001"
            maxLength={30}
            data-testid="supplier-field-fax"
          />

          {/* 이메일 — 2컬럼 전체 */}
          <FormGrid.Full>
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
          </FormGrid.Full>
          </FormGrid>
        </div>

        {/* 입금계좌 리스트 편집기 */}
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-neutral-700)',
              }}
            >
              입금계좌
            </span>
            <Button
              variant="ghost"
              onClick={addBankRow}
              data-testid="supplier-bank-add-btn"
            >
              + 계좌 추가
            </Button>
          </div>
          {/* Fix 4: 계좌 빈 필드 에러 표시 */}
          {fieldErrors.bankAccounts ? (
            <p
              style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--color-danger-600)' }}
              data-testid="supplier-bank-accounts-error"
            >
              {fieldErrors.bankAccounts}
            </p>
          ) : null}
          {bankRows.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: 'var(--color-neutral-400)',
                padding: '8px 0',
              }}
            >
              등록된 입금계좌가 없습니다. 계좌 추가 버튼으로 등록하세요.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bankRows.map((row, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1.5fr auto auto',
                    gap: 8,
                    alignItems: 'end',
                    padding: '8px 12px',
                    background: 'var(--color-neutral-50)',
                    borderRadius: 6,
                    border: '1px solid var(--color-neutral-100)',
                  }}
                  data-testid={`supplier-bank-row-${idx}`}
                >
                  <Input
                    label={idx === 0 ? '예금주' : undefined}
                    value={row.accountHolder}
                    onChange={(e) => setBankRowField(idx, 'accountHolder', e.target.value)}
                    placeholder="예금주"
                    data-testid={`supplier-bank-holder-${idx}`}
                  />
                  <Input
                    label={idx === 0 ? '은행명' : undefined}
                    value={row.bankName}
                    onChange={(e) => setBankRowField(idx, 'bankName', e.target.value)}
                    placeholder="국민은행"
                    data-testid={`supplier-bank-name-${idx}`}
                  />
                  <Input
                    label={idx === 0 ? '계좌번호' : undefined}
                    value={row.accountNumber}
                    onChange={(e) => setBankRowField(idx, 'accountNumber', e.target.value)}
                    placeholder="000000-00-000000"
                    data-testid={`supplier-bank-number-${idx}`}
                  />
                  {/* 명세서 노출 토글 — 확장① */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    {idx === 0 ? (
                      <span style={{ fontSize: 11, color: 'var(--color-neutral-500)', whiteSpace: 'nowrap' }}>
                        명세서 노출
                      </span>
                    ) : null}
                    <input
                      type="checkbox"
                      checked={row.exposed}
                      onChange={(e) => setBankRowField(idx, 'exposed', e.target.checked)}
                      data-testid={`supplier-bank-exposed-${idx}`}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => removeBankRow(idx)}
                    data-testid={`supplier-bank-remove-${idx}`}
                  >
                    삭제
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 인감 업로드 영역 (수정 모달에서만 표시 — 신규 등록은 저장 후 수정에서 업로드) */}
        {modalMode === 'edit' ? (
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-neutral-700)',
                marginBottom: 8,
              }}
            >
              법인 인감 (PNG, 최대 200KB)
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              {/* 미리보기 */}
              {stampPreviewUrl ? (
                <div style={{ position: 'relative' }}>
                  <img
                    src={stampPreviewUrl}
                    alt="법인 인감 미리보기"
                    style={{
                      width: 100,
                      height: 100,
                      objectFit: 'contain',
                      border: '1px solid var(--color-neutral-200)',
                      borderRadius: 4,
                    }}
                    data-testid="supplier-stamp-preview"
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: 100,
                    height: 100,
                    border: '2px dashed var(--color-neutral-300)',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    color: 'var(--color-neutral-400)',
                  }}
                >
                  미등록
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  ref={stampInputRef}
                  type="file"
                  accept="image/png"
                  onChange={handleStampFileChange}
                  style={{ display: 'none' }}
                  data-testid="supplier-stamp-file-input"
                />
                <Button
                  variant="ghost"
                  onClick={() => stampInputRef.current?.click()}
                  data-testid="supplier-stamp-upload-btn"
                >
                  {stampPreviewUrl ? '인감 교체' : 'PNG 업로드'}
                </Button>
                {stampPreviewUrl && editTarget?.hasStamp && !stampFile ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (editTarget && window.confirm('등록된 인감을 삭제하시겠습니까?')) {
                        deleteStampMutation.mutate({ id: editTarget.id })
                      }
                    }}
                    data-testid="supplier-stamp-delete-btn"
                  >
                    인감 삭제
                  </Button>
                ) : null}
                {stampFile ? (
                  <Button
                    variant="ghost"
                    onClick={handleStampRemove}
                    data-testid="supplier-stamp-clear-btn"
                  >
                    선택 취소
                  </Button>
                ) : null}
                {stampError ? (
                  <p
                    style={{ margin: 0, fontSize: 12, color: 'var(--color-danger-600)' }}
                    data-testid="supplier-stamp-error"
                  >
                    {stampError}
                  </p>
                ) : null}
                {stampFile ? (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500)' }}>
                    {stampFile.name} ({Math.round(stampFile.size / 1024)}KB) — 저장 시 업로드
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* 로고 업로드 영역 — 확장② (수정 모달에서만, 인감 섹션 동일 패턴) */}
        {modalMode === 'edit' ? (
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-neutral-700)',
                marginBottom: 8,
              }}
            >
              회사 로고 (PNG, 최대 200KB)
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              {logoPreviewUrl ? (
                <div style={{ position: 'relative' }}>
                  <img
                    src={logoPreviewUrl}
                    alt="회사 로고 미리보기"
                    style={{
                      width: 100,
                      height: 100,
                      objectFit: 'contain',
                      border: '1px solid var(--color-neutral-200)',
                      borderRadius: 4,
                    }}
                    data-testid="supplier-logo-preview"
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: 100,
                    height: 100,
                    border: '2px dashed var(--color-neutral-300)',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    color: 'var(--color-neutral-400)',
                  }}
                  data-testid="supplier-logo-empty"
                >
                  미등록
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png"
                  onChange={handleLogoFileChange}
                  style={{ display: 'none' }}
                  data-testid="supplier-logo-file-input"
                />
                <Button
                  variant="ghost"
                  onClick={() => logoInputRef.current?.click()}
                  data-testid="supplier-logo-upload-btn"
                >
                  {logoPreviewUrl ? '로고 교체' : 'PNG 업로드'}
                </Button>
                {logoPreviewUrl && editTarget?.hasLogo && !logoFile ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (editTarget && window.confirm('등록된 로고를 삭제하시겠습니까?')) {
                        deleteLogoMutation.mutate({ id: editTarget.id })
                      }
                    }}
                    data-testid="supplier-logo-delete-btn"
                  >
                    로고 삭제
                  </Button>
                ) : null}
                {logoFile ? (
                  <Button
                    variant="ghost"
                    onClick={handleLogoRemove}
                    data-testid="supplier-logo-clear-btn"
                  >
                    선택 취소
                  </Button>
                ) : null}
                {logoError ? (
                  <p
                    style={{ margin: 0, fontSize: 12, color: 'var(--color-danger-600)' }}
                    data-testid="supplier-logo-error"
                  >
                    {logoError}
                  </p>
                ) : null}
                {logoFile ? (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500)' }}>
                    {logoFile.name} ({Math.round(logoFile.size / 1024)}KB) — 저장 시 업로드
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

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
            disabled={isSaving || !canSaveProfile}
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
  canEdit: boolean
  canMarkPrimary: boolean
  canDelete: boolean
  onEdit: (p: SupplierProfile) => void
  onMarkPrimary: (id: string) => void
  onDeleteStamp: (id: string) => void
  onDeleteLogo: (id: string) => void
  onDelete: (id: string) => void
}

function ProfileCard({
  profile,
  canEdit,
  canMarkPrimary,
  canDelete,
  onEdit,
  onMarkPrimary,
  onDeleteStamp,
  onDeleteLogo,
  onDelete,
}: ProfileCardProps) {
  const representativeName = profile.representativeName ?? profile.ceoName ?? ''
  const businessAddress = profile.businessAddress ?? profile.address ?? ''

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
            {profile.hasStamp ? (
              <Badge variant="neutral" data-testid="supplier-stamp-badge">
                인감 등록됨
              </Badge>
            ) : null}
            {profile.hasLogo ? (
              <Badge variant="neutral" data-testid="supplier-logo-badge">
                로고 등록됨
              </Badge>
            ) : null}
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
            <InfoRow label="대표 성명" value={representativeName} />
            <InfoRow
              label="사업장 주소"
              value={businessAddress}
              fullWidth
            />
            <InfoRow label="업태" value={profile.businessType} />
            <InfoRow label="종목" value={profile.businessItem} />
            {profile.tel ? (
              <InfoRow label="대표 전화" value={profile.tel} testId="supplier-tel" />
            ) : null}
            {profile.fax ? (
              <InfoRow label="팩스" value={profile.fax} testId="supplier-fax" />
            ) : null}
            {profile.email ? (
              <InfoRow label="이메일" value={profile.email} />
            ) : null}
          </dl>

          {/* 입금계좌 목록 */}
          {profile.bankAccounts && profile.bankAccounts.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--color-neutral-500)',
                  textTransform: 'uppercase' as const,
                  letterSpacing: 0.3,
                }}
              >
                입금계좌
              </span>
              <ul
                style={{
                  margin: '4px 0 0',
                  padding: '0 0 0 16px',
                  fontSize: 13,
                  color: 'var(--color-neutral-700)',
                }}
                data-testid="supplier-bank-list"
              >
                {[...profile.bankAccounts]
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((acct, i) => (
                    <li key={i}>
                      {acct.accountHolder} / {acct.bankName} {acct.accountNumber}
                      {acct.exposed === false ? (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            color: 'var(--color-neutral-400)',
                            border: '1px solid var(--color-neutral-300)',
                            borderRadius: 3,
                            padding: '0 4px',
                          }}
                        >
                          비노출
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* 액션 버튼 */}
        {canEdit || canMarkPrimary || canDelete ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              flexShrink: 0,
            }}
          >
            {canEdit ? (
              <Button
                variant="ghost"
                onClick={() => onEdit(profile)}
                data-testid={`supplier-edit-btn-${profile.businessNumber}`}
              >
                수정
              </Button>
            ) : null}
            {!profile.isPrimary ? (
              <>
                {canMarkPrimary ? (
                <Button
                  variant="ghost"
                  onClick={() => onMarkPrimary(profile.id)}
                  data-testid={`supplier-mark-primary-btn-${profile.businessNumber}`}
                >
                  기본 전환
                </Button>
                ) : null}
                {canDelete ? (
                <Button
                  variant="danger"
                  onClick={() => onDelete(profile.id)}
                  data-testid={`supplier-delete-btn-${profile.businessNumber}`}
                >
                  삭제
                </Button>
                ) : null}
              </>
            ) : null}
            {profile.hasStamp && canEdit ? (
              <Button
                variant="ghost"
                onClick={() => onDeleteStamp(profile.id)}
                data-testid={`supplier-stamp-delete-card-btn-${profile.businessNumber}`}
              >
                인감 삭제
              </Button>
            ) : null}
            {profile.hasLogo && canEdit ? (
              <Button
                variant="ghost"
                onClick={() => onDeleteLogo(profile.id)}
                data-testid={`supplier-logo-delete-card-btn-${profile.businessNumber}`}
              >
                로고 삭제
              </Button>
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
