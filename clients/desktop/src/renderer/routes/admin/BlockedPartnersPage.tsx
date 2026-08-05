/**
 * 관리자 — 발송금지 거래처 (`/admin/blocked-partners`).
 *
 * Phase 10 PR-D Phase B FE-E. BE-E (commit d05c0ae) {@code partner-service}
 * `/api/v1/partners/admin/blocks` 4 endpoint backing.
 *
 * <h2>접근 제어</h2>
 * MANAGER / MASTER 진입. 목록/단건 등록은 MANAGER 가능, CSV import / 차단 해제는 MASTER 전용.
 *
 * <h2>UI 구성</h2>
 * <ul>
 *   <li>표 columns: partnerCode / 상호 snapshot / 차단 사유 / 차단 시점 / 출처 / 액션</li>
 *   <li>"단건 차단" 버튼 → form 다이얼로그 (partner_code + reason)</li>
 *   <li>"CSV 업로드" 버튼 → CsvUploadDialog (이카운트 사업자명 → 거래처코드 자동 매핑)</li>
 *   <li>행 액션: "차단 해제" 버튼 (확인 후 soft-delete) — MASTER 가 본 화면 진입한 사용자이므로 노출</li>
 * </ul>
 *
 * <h2>PR-H4c FE-C 보강 — 실시간 동기화</h2>
 * <ul>
 *   <li>30초 polling — 다중 워크스테이션 동시 차단/해제 결과 자동 반영.</li>
 *   <li>partner-service SSE (PR-H4b BE-A): {@code GET /admin/partners/{entityId}/realtime}
 *       — entity-id 단위. PartnersPage 와 동일 broker 채널 — 거래처 본 화면 등록/해제가
 *       PartnersPage 에도 polling 으로 자동 반영됨.</li>
 * </ul>
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code admin-blocked-table}</li>
 *   <li>{@code admin-blocked-row} (각 행의 partnerCode 셀)</li>
 *   <li>{@code admin-blocked-add-button}</li>
 *   <li>{@code admin-blocked-import-button}</li>
 *   <li>{@code admin-blocked-unblock-{partnerCode}} — UUID 비공개 가드 (TM PR #115 정정)</li>
 *   <li>{@code admin-blocked-realtime-indicator}</li>
 * </ul>
 *
 * <p>UUID 비공개 — 화면 표시는 partnerCode + businessName + reason. id 는 액션
 * data-testid 와 unblock path variable 전용 (사용자 시각 노출 X).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  CsvUploadDialog,
  DataTable,
  Modal,
  PartnerAutocomplete,
  type DataTableColumn,
  type PartnerOption,
} from '@samhan/design-system'
import {
  addBlockedPartner,
  BLOCK_SOURCE_LABEL,
  importBlockedPartnersCsv,
  listBlockedPartners,
  unblockPartner,
  type BlockedPartner,
  type BlockedPartnerSource,
} from '../../api/blockedPartnerApi'
import { searchPartners } from '../../api/partnerApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'

/** source enum → Badge variant 매핑. */
const SOURCE_VARIANT: Record<
  BlockedPartnerSource,
  'brand' | 'neutral' | 'success' | 'warning' | 'danger'
> = {
  NOTION_IMPORT: 'brand',
  MANUAL: 'neutral',
  LEGACY_GAS: 'warning',
}

/** ISO 시각 → "YYYY-MM-DD HH:mm" (BE LocalDateTime 직렬화 — timezone 없음). */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  if (iso.length >= 16) {
    return `${iso.substring(0, 10)} ${iso.substring(11, 16)}`
  }
  return iso
}

/** axios/Error 객체에서 표시 가능한 메시지 추출. */
function extractMessage(err: unknown): string | null {
  if (!err) return null
  const anyErr = err as {
    response?: { data?: { message?: string } }
    message?: string
  }
  return (
    anyErr.response?.data?.message ??
    anyErr.message ??
    '요청 처리 중 오류가 발생했습니다.'
  )
}

export function BlockedPartnersPage() {
  usePageTitle('발송금지 거래처')

  const { canAccess } = usePermissions()
  // [C5-2b] role==='MASTER' → canAccess('partners.block.bulk', 'create').
  // BE @RequirePermission(page="partners.block.bulk", action=CREATE/DELETE) — PartnerBlockAdminController.
  const canBulkManage = canAccess('partners.block.bulk', 'create')
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [unblockTarget, setUnblockTarget] = useState<BlockedPartner | null>(
    null,
  )

  const query = useQuery({
    queryKey: ['admin', 'blocked-partners', page],
    queryFn: () => listBlockedPartners({ page, size: 20 }),
    // PR-H4c FE-C: 30초 polling — 멀티 워크스테이션 동기화 안전망 (BE broadcast SSE 합류 전 단계).
    refetchInterval: 30_000,
  })

  const totalPages = query.data ? Math.max(1, query.data.totalPages) : 1

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'blocked-partners'] })

  const addMutation = useMutation({
    mutationFn: addBlockedPartner,
    onSuccess: () => {
      invalidateList()
      setAddOpen(false)
    },
  })

  const unblockMutation = useMutation({
    mutationFn: unblockPartner,
    onSuccess: () => {
      invalidateList()
      setUnblockTarget(null)
    },
  })

  const columns: DataTableColumn<BlockedPartner>[] = useMemo(
    () => [
      {
        key: 'partnerCode',
        header: '거래처 코드',
        width: '140px',
        mobilePriority: 'primary',
        render: (b) => (
          <span data-testid="admin-blocked-row" data-partner-code={b.partnerCode}>
            {b.partnerCode}
          </span>
        ),
      },
      {
        key: 'businessNameSnapshot',
        header: '상호',
        mobilePriority: 'secondary',
      },
      {
        key: 'blockReason',
        header: '차단 사유',
        mobilePriority: 'secondary',
        render: (b) => b.blockReason ?? '—',
      },
      {
        key: 'blockedAt',
        header: '차단 시점',
        width: '160px',
        mobilePriority: 'secondary',
        render: (b) => formatDateTime(b.blockedAt),
      },
      {
        key: 'source',
        header: '출처',
        width: '120px',
        mobilePriority: 'hidden',
        render: (b) => (
          <Badge variant={SOURCE_VARIANT[b.source]}>
            {BLOCK_SOURCE_LABEL[b.source]}
          </Badge>
        ),
      },
      {
        key: 'action',
        header: '액션',
        width: '110px',
        mobilePriority: 'secondary',
        render: (b) =>
          canBulkManage ? (
            <button
              type="button"
              onClick={() => setUnblockTarget(b)}
              data-testid={`admin-blocked-unblock-${b.partnerCode}`}
              style={{
                height: 28,
                padding: '0 10px',
                border: '1px solid var(--color-danger-300, #FCA5A5)',
                borderRadius: 4,
                background: 'var(--color-danger-50, #FEF2F2)',
                color: 'var(--color-danger-700, #B91C1C)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              차단 해제
            </button>
          ) : (
            <span style={{ color: 'var(--color-neutral-500, #6B7280)' }}>
              MASTER 전용
            </span>
          ),
      },
    ],
    [canBulkManage],
  )

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          margin: '0 0 16px',
        }}
      >
        <h3 style={{ margin: 0 }}>발송금지 거래처</h3>
        <span
          data-testid="admin-blocked-realtime-indicator"
          style={{ fontSize: 12, color: 'var(--color-neutral-500, #6B7280)' }}
        >
          실시간 자동 갱신 · 30초
        </span>
      </div>

      <p
        style={{
          margin: '0 0 16px',
          fontSize: 13,
          color: 'var(--color-neutral-700, #374151)',
        }}
      >
        본 화면에 등록된 거래처는 알림(SMS/카카오톡) 발송 대상에서 제외됩니다.
        partnerCode 가 source-of-truth 이며, 상호는 차단 시점 snapshot 입니다.
      </p>

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
          onClick={() => setAddOpen(true)}
          data-testid="admin-blocked-add-button"
        >
          단건 차단
        </Button>
        {canBulkManage ? (
          <Button
            variant="secondary"
            onClick={() => setImportOpen(true)}
            data-testid="admin-blocked-import-button"
          >
            CSV 업로드
          </Button>
        ) : null}
      </div>

      <div data-testid="admin-blocked-table">
        <DataTable
          columns={columns}
          rows={query.data?.content ?? []}
          loading={query.isLoading}
          rowKey={(b) => b.id}
          emptyMessage="등록된 발송금지 거래처가 없습니다."
        />
      </div>

      {query.data && totalPages > 1 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            marginTop: 16,
            fontSize: 13,
          }}
        >
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => p - 1)}
            style={pagerBtnStyle}
          >
            이전
          </button>
          <span>
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={pagerBtnStyle}
          >
            다음
          </button>
        </div>
      ) : null}

      <AddBlockedPartnerDialog
        open={addOpen}
        submitting={addMutation.isPending}
        errorMessage={extractMessage(addMutation.error)}
        onClose={() => {
          if (!addMutation.isPending) {
            setAddOpen(false)
            addMutation.reset()
          }
        }}
        onSubmit={(req) => addMutation.mutate(req)}
      />

      <CsvUploadDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="발송금지 거래처 CSV 업로드"
        description="이카운트 사업자명 → 거래처코드 자동 매핑. 매핑 실패는 reject 보고서."
        onUpload={async (file) => {
          // TM PR #115 정정 — invalidate 위치를 onUpload resolve 시점으로 이동
          // (타 3 admin CSV 페이지 패턴 일관 — SalesPartnerDcConfigPage / SheetSyncPage / RegionsPage).
          // onClose 위치는 dialog 닫힘만 처리, 업로드 결과 반영은 mutation 직후 invalidate.
          const result = await importBlockedPartnersCsv(file)
          invalidateList()
          return result
        }}
      />

      <UnblockConfirmDialog
        target={unblockTarget}
        submitting={unblockMutation.isPending}
        errorMessage={extractMessage(unblockMutation.error)}
        onClose={() => {
          if (!unblockMutation.isPending) {
            setUnblockTarget(null)
            unblockMutation.reset()
          }
        }}
        onConfirm={(id) => unblockMutation.mutate(id)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// 단건 차단 다이얼로그
// ---------------------------------------------------------------------------

interface AddBlockedPartnerDialogProps {
  open: boolean
  submitting: boolean
  errorMessage: string | null
  onClose: () => void
  onSubmit: (req: { partnerCode: string; blockReason?: string }) => void
}

function AddBlockedPartnerDialog({
  open,
  submitting,
  errorMessage,
  onClose,
  onSubmit,
}: AddBlockedPartnerDialogProps) {
  const [partner, setPartner] = useState<PartnerOption | null>(null)
  const [partnerCommitted, setPartnerCommitted] = useState(true)
  const [blockReason, setBlockReason] = useState('')
  /**
   * [#825 재수렴 #5] 등록 시점 미확정 draft 가드 안내 (DailyClosingPage #4 와 동일 root).
   *
   * <p>AsyncAutocomplete 는 목록 선택(pick) 전까지 onChange 를 발화하지 않아, P1 선택 후
   * 다른 거래처명을 타이핑만 한 채(또는 재포커스로 입력이 비워진 채) '차단 등록'을 누르면
   * draft 가 무시되고 확정 선택(P1) payload 로 차단된다 — 화면과 실제 차단 대상이 어긋나는
   * 오대상. 등록 시점에 partnerCode 기준 확정 출력 계약이 아니면 차단하고 목록
   * 재선택을 안내한다. 안내는 PartnerAutocomplete `error` prop(FormField role=alert +
   * aria-invalid 계약)으로 렌더한다.
   */
  const [partnerDraftError, setPartnerDraftError] = useState('')
  const partnerInputRef = useRef<HTMLInputElement | null>(null)

  // open 토글 시 입력 reset. 거래처 입력 자동 포커스는 Modal `initialFocusRef` 계약이
  // 담당한다 — [#825 CM3] 구 로컬 rAF 는 Modal 내부 "첫 focusable 포커스" rAF 와
  // 경합(승자가 React effect 순서 + rAF FIFO 구현 세부 의존)이라 결정적 계약으로 대체.
  useEffect(() => {
    if (!open) return
    setPartner(null)
    setPartnerCommitted(true)
    setBlockReason('')
    setPartnerDraftError('')
  }, [open])

  const canSubmit = Boolean(partner?.partnerCode) && !submitting

  const handleSubmit = () => {
    if (!canSubmit) return
    // 이름 문자열은 동명이 가능하므로 AsyncAutocomplete가 partnerCode(getKey)로
    // 계산해 전달한 committed 출력만 사용한다.
    const typedDraft = (partnerInputRef.current?.value ?? '').trim()
    const confirmedLabel = (partner?.name ?? '').trim()
    const draftDiffersFromSelection = Boolean(partner) && typedDraft !== confirmedLabel
    if (!partnerCommitted || draftDiffersFromSelection || !partner?.partnerCode) {
      setPartnerDraftError(
        typedDraft === ''
          ? `입력을 비워도 선택한 거래처(${confirmedLabel})가 해제되지 않습니다. 차단할 거래처를 목록에서 다시 선택한 뒤 등록하세요.`
          : '입력한 거래처가 아직 선택되지 않았습니다. 차단할 거래처를 목록에서 선택한 뒤 등록하세요.',
      )
      return
    }
    setPartnerDraftError('')
    const req: { partnerCode: string; blockReason?: string } = {
      partnerCode: partner!.partnerCode,
    }
    if (blockReason.trim()) req.blockReason = blockReason.trim()
    onSubmit(req)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="발송금지 거래처 단건 등록"
      description="차단할 거래처를 검색해 선택하세요."
      size="sm"
      // [#825 CM3] open 시 초기 포커스 = 거래처 입력 (PartnerAutocomplete ref forward).
      initialFocusRef={partnerInputRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? '등록 중…' : '차단 등록'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PartnerAutocomplete
          ref={partnerInputRef}
          value={partner}
          onChange={(option) => {
            setPartner(option)
            setPartnerCommitted(true)
            // [#825 재수렴 #5] 목록 선택 확정 즉시 draft 안내 소거 — 화면=상태 정합 회복.
            setPartnerDraftError('')
          }}
          onInputCommitChange={setPartnerCommitted}
          searchPartners={searchPartners}
          // [#825 R1 L2] required prop 이 FormField 필수 마커를 렌더하므로 라벨 텍스트의
          // "(필수)" 중복 표기(SR 이중 낭독)를 제거한다.
          label="거래처"
          placeholder="거래처명 또는 코드 검색"
          required
          error={partnerDraftError || undefined}
          inputTestId="admin-blocked-add-partner-code-input"
        />
        <label style={fieldLabelStyle}>
          차단 사유 (선택, 최대 500자)
          <textarea
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="예: 장기 미수금 / 분쟁 중"
            data-testid="admin-blocked-add-reason-input"
            style={{
              ...fieldInputStyle,
              height: 'auto',
              padding: '8px 10px',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </label>
        {errorMessage ? (
          <p
            style={{
              margin: 0,
              padding: '8px 10px',
              fontSize: 13,
              color: 'var(--color-danger-700, #B91C1C)',
              background: 'var(--color-danger-50, #FEF2F2)',
              border: '1px solid var(--color-danger-200, #FECACA)',
              borderRadius: 4,
            }}
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// 차단 해제 확인 다이얼로그
// ---------------------------------------------------------------------------

interface UnblockConfirmDialogProps {
  target: BlockedPartner | null
  submitting: boolean
  errorMessage: string | null
  onClose: () => void
  onConfirm: (id: string) => void
}

function UnblockConfirmDialog({
  target,
  submitting,
  errorMessage,
  onClose,
  onConfirm,
}: UnblockConfirmDialogProps) {
  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title="차단 해제 확인"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (target) onConfirm(target.id)
            }}
            disabled={submitting || !target}
          >
            {submitting ? '해제 중…' : '차단 해제'}
          </Button>
        </>
      }
    >
      {target ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            아래 거래처의 차단을 해제합니다. 해제 후 알림(SMS/카카오톡) 발송이
            재개됩니다.
          </p>
          <dl
            style={{
              margin: 0,
              padding: '12px',
              border: '1px solid var(--color-neutral-200, #E5E7EB)',
              borderRadius: 6,
              background: 'var(--color-neutral-50, #F9FAFB)',
              display: 'grid',
              gridTemplateColumns: '110px 1fr',
              rowGap: 6,
              fontSize: 13,
            }}
          >
            <dt style={{ color: 'var(--color-neutral-600, #4B5563)' }}>
              거래처 코드
            </dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{target.partnerCode}</dd>
            <dt style={{ color: 'var(--color-neutral-600, #4B5563)' }}>상호</dt>
            <dd style={{ margin: 0 }}>{target.businessNameSnapshot}</dd>
            <dt style={{ color: 'var(--color-neutral-600, #4B5563)' }}>
              차단 사유
            </dt>
            <dd style={{ margin: 0 }}>{target.blockReason ?? '—'}</dd>
          </dl>
          {errorMessage ? (
            <p
              style={{
                margin: 0,
                padding: '8px 10px',
                fontSize: 13,
                color: 'var(--color-danger-700, #B91C1C)',
                background: 'var(--color-danger-50, #FEF2F2)',
                border: '1px solid var(--color-danger-200, #FECACA)',
                borderRadius: 4,
              }}
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// 스타일 상수
// ---------------------------------------------------------------------------

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 13,
  color: 'var(--color-neutral-700, #374151)',
  fontWeight: 500,
}

const fieldInputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--color-neutral-300, #D1D5DB)',
  borderRadius: 6,
  fontSize: 13,
}

const pagerBtnStyle: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  border: '1px solid #D1D5DB',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
}
