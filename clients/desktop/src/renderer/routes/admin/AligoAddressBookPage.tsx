/**
 * 관리자 — 알리고 주소록 자동 동기화 (`/admin/aligo-address-book`).
 *
 * Phase 10 PR-F1 FE-1 — Designer mock (commit 2a1f11f) → 실 API 연결.
 *
 * <h2>용도</h2>
 * 거래처 마스터 → 알리고 (SMS/카카오톡 발송 vendor) 주소록 자동 sync.
 * 사용자가 알리고 콘솔을 직접 열지 않고 우리 desktop UI 에서 단일 클릭으로 실행:
 * <ol>
 *   <li>"거래처 CSV 다운로드" — partner-service 가 SF벤더 그룹 CSV (UTF-8 BOM) 생성
 *       → 한국어 파일명 {@code 알리고_주소록_YYYY-MM-DD.csv} 로 사용자 저장</li>
 *   <li>"주소록 동기화 실행" — notification-service 외부 미전달 mock (PR-F1) →
 *       4 카테고리 chip 과 외부 전달 상태 표시 (added / updated / skipped / failed)</li>
 * </ol>
 *
 * <h2>BE 연결</h2>
 * <ul>
 *   <li>GET {@code /admin/partners/export/aligo-csv} — partner-service commit f3b313a</li>
 *   <li>POST {@code /admin/notification/aligo/address-book/sync} —
 *       notification-service commit f3b313a (외부 미전달 mock)</li>
 * </ul>
 *
 * <h2>설계 노트</h2>
 * <ul>
 *   <li>UUID 비공개 (feedback_uuid_no_user_visibility) — 본 도메인 UUID 노출 없음
 *       (CSV / sync 응답 모두 비즈니스 식별자만).</li>
 *   <li>풀네임 ROLE (feedback_role_naming_full) — MANAGER / MASTER route 가드.</li>
 *   <li>한국어 라벨 100% — 영문 라벨 금지.</li>
 *   <li>한국어 파일명 의무 — {@code 알리고_주소록_YYYY-MM-DD.csv} (BE filename 무시).</li>
 *   <li>Designer mock 색상 / 4분 chip / UX 보존 — CSS 무수정.</li>
 * </ul>
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code admin-aligo-csv-btn}</li>
 *   <li>{@code admin-aligo-sync-btn}</li>
 *   <li>{@code admin-aligo-result-added / updated / skipped / failed}</li>
 *   <li>{@code admin-aligo-delivery-status}</li>
 * </ul>
 */
import { useMutation } from '@tanstack/react-query'
import { Button, Spinner } from '@samhan/design-system'
import {
  buildAligoCsvFilename,
  exportAligoCsv,
  syncAligoAddressBook,
  type AligoAddressBookSyncResponse,
} from '../../api/aligoAddressBookApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export function AligoAddressBookPage() {
  usePageTitle('알리고 주소록 자동 동기화')
  const { canAccess } = usePermissions()
  const canSync = canAccess('aligo.address-book', 'update')

  // CSV 다운로드 mutation — Blob 응답 → anchor click.
  const csvMutation = useMutation({
    mutationFn: async () => {
      const blob = await exportAligoCsv()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = buildAligoCsvFilename()
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  })

  // 주소록 sync mutation — 외부 전달 상태를 포함한 응답.
  const syncMutation = useMutation({
    mutationFn: syncAligoAddressBook,
  })

  const csvPending = csvMutation.isPending
  const syncPending = syncMutation.isPending
  const result: AligoAddressBookSyncResponse | null =
    syncMutation.data ?? null
  const hasExternalDelivery =
    result?.deliveryStatus === 'DELIVERED' || result?.deliveryStatus === 'PARTIALLY_DELIVERED'

  return (
    <>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 4px' }}>알리고 주소록 자동 동기화</h3>
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-neutral-600)',
            }}
          >
            거래처 마스터 → 알리고 주소록 동기화. 발송금지 거래처는 자동
            제외됩니다.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {syncPending ? (
            <Spinner
              size="sm"
              tone="var(--color-brand-500)"
              label="동기화 중"
            />
          ) : null}
          <Button
            type="button"
            variant="secondary"
            data-testid="admin-aligo-csv-btn"
            disabled={csvPending}
            onClick={() => csvMutation.mutate()}
          >
            {csvPending ? '내려받는 중…' : '거래처 CSV 다운로드'}
          </Button>
          <Button
            type="button"
            variant="primary"
            data-testid="admin-aligo-sync-btn"
            disabled={syncPending || !canSync}
            onClick={() => {
              if (!canSync) return
              syncMutation.mutate()
            }}
          >
            {syncPending ? '동기화 중…' : '주소록 동기화 실행'}
          </Button>
        </div>
      </header>

      <p
        style={{
          margin: '0 0 12px',
          padding: '8px 12px',
          fontSize: 12,
          color: 'var(--color-warning-800, #8C5C13)',
          background: 'var(--color-warning-50, #fffbeb)',
          border: '1px solid var(--color-warning-200, #fde68a)',
          borderRadius: 4,
        }}
      >
        {hasExternalDelivery ? (
          'CSV 다운로드도 알리고 전달 완료를 뜻하지 않습니다.'
        ) : (
          <>
            주소록 동기화는 현재 외부 전달 없는 mock 모드입니다. 실행해도 알리고에
            연락처가 등록·변경되지 않으며, CSV 다운로드도 알리고 전달 완료를 뜻하지 않습니다.
          </>
        )}
      </p>

      {csvMutation.isError ? (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            border: '1px solid var(--color-danger-300, #fca5a5)',
            background: 'var(--color-danger-50, #fef2f2)',
            color: 'var(--color-danger-700, #b91c1c)',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          CSV 다운로드 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : null}

      {syncMutation.isError ? (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            border: '1px solid var(--color-danger-300, #fca5a5)',
            background: 'var(--color-danger-50, #fef2f2)',
            color: 'var(--color-danger-700, #b91c1c)',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          동기화 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : null}

      {result ? <DeliveryStatusNotice status={result.deliveryStatus} /> : null}

      {result ? <ResultChips result={result} /> : null}

      {result && result.failed.length > 0 ? (
        <FailedList failures={result.failed} />
      ) : null}

      {!result && !syncPending ? (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            color: 'var(--color-neutral-500, #6B7280)',
            fontSize: 13,
            border: '1px dashed var(--color-neutral-300, #D1D5DB)',
            borderRadius: 6,
            background: 'var(--color-neutral-50, #F9FAFB)',
          }}
        >
          상단의 "주소록 동기화 실행" 버튼을 눌러 sync 를 시작하세요.
        </div>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// 결과 4분 chip — added / updated / skipped / failed (Designer mock 보존)
// ---------------------------------------------------------------------------

interface DeliveryStatusNoticeProps {
  status: AligoAddressBookSyncResponse['deliveryStatus'] | undefined
}

function DeliveryStatusNotice({ status }: DeliveryStatusNoticeProps) {
  const copy =
    status === 'DELIVERED'
      ? '현재 상태: 알리고에 실제 전달된 결과입니다.'
      : status === 'PARTIALLY_DELIVERED'
        ? '현재 상태: 일부 연락처만 실제 알리고에 전달되었습니다. 신규·변경 건수는 실제 전달된 알리고 응답 기준입니다.'
        : '현재 상태: 실제 알리고 전달 0건입니다. 이 결과의 신규·변경 건수는 성공으로 볼 수 없습니다.'

  return (
    <div
      role="status"
      data-testid="admin-aligo-delivery-status"
      style={{
        marginBottom: 12,
        padding: '8px 12px',
        fontSize: 12,
        color: 'var(--color-warning-800, #8C5C13)',
        background: 'var(--color-warning-50, #fffbeb)',
        border: '1px solid var(--color-warning-200, #fde68a)',
        borderRadius: 4,
      }}
    >
      {copy}
    </div>
  )
}

interface ResultChipsProps {
  result: AligoAddressBookSyncResponse
}

function ResultChips({ result }: ResultChipsProps) {
  const hasExternalDelivery =
    result.deliveryStatus === 'DELIVERED' || result.deliveryStatus === 'PARTIALLY_DELIVERED'

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        marginBottom: 16,
        flexWrap: 'wrap',
        fontSize: 13,
      }}
    >
      <ResultChip
        label="신규"
        value={hasExternalDelivery ? result.added : 0}
        tone="brand"
        testId="admin-aligo-result-added"
      />
      <ResultChip
        label="변경"
        value={hasExternalDelivery ? result.updated : 0}
        tone="success"
        testId="admin-aligo-result-updated"
      />
      <ResultChip
        label="제외"
        value={result.skipped}
        tone="neutral"
        testId="admin-aligo-result-skipped"
      />
      <ResultChip
        label="실패"
        value={result.failed.length}
        tone="danger"
        testId="admin-aligo-result-failed"
      />
    </div>
  )
}

interface ResultChipProps {
  label: string
  value: number | string
  tone: 'brand' | 'success' | 'warning' | 'neutral' | 'danger'
  testId?: string
}

const CHIP_BG: Record<ResultChipProps['tone'], string> = {
  brand: 'var(--color-brand-50)',
  success: 'var(--color-success-50, #ecfdf5)',
  warning: 'var(--color-warning-50, #fffbeb)',
  neutral: 'var(--color-neutral-50)',
  danger: 'var(--color-danger-50, #fef2f2)',
}

const CHIP_FG: Record<ResultChipProps['tone'], string> = {
  brand: 'var(--color-brand-700)',
  success: 'var(--color-success-700, #047857)',
  warning: 'var(--color-warning-800, #8C5C13)',
  neutral: 'var(--color-neutral-700)',
  danger: 'var(--color-danger-700, #b91c1c)',
}

function ResultChip({ label, value, tone, testId }: ResultChipProps) {
  return (
    <div
      data-testid={testId}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        background: CHIP_BG[tone],
        color: CHIP_FG[tone],
        fontWeight: 600,
      }}
    >
      {label} {value}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 실패 chunk 메시지 리스트
// ---------------------------------------------------------------------------

interface FailedListProps {
  failures: string[]
}

function FailedList({ failures }: FailedListProps) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: '12px 16px',
        border: '1px solid var(--color-danger-300, #fca5a5)',
        background: 'var(--color-danger-50, #fef2f2)',
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-danger-700, #b91c1c)',
          marginBottom: 6,
        }}
      >
        실패한 chunk ({failures.length}건)
      </div>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          fontSize: 12,
          color: 'var(--color-danger-700, #b91c1c)',
        }}
      >
        {failures.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
    </div>
  )
}
