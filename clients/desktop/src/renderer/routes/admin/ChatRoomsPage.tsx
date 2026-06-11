/**
 * 관리자 — 단톡방 매핑 (`/admin/chat-rooms`).
 *
 * <p>PR-D Phase B FE-D — Samhan Public 프로그램 native 이식. BE-D
 * ({@code notification-service} commit 9c38506) 의 4 endpoint backing.
 *
 * <h2>화면 구성</h2>
 * <ul>
 *   <li>표 — partnerCode / businessName(snapshot) / chatRoomName / source / notionCreatedAt
 *       + 행 액션(삭제). chatRoomName 기준 그룹핑하여 같은 단톡방의 여러 거래처를
 *       묶어 표시한다 (header row 가 단톡방 이름, 그 아래 거래처 행 N개).</li>
 *   <li>"단건 추가" — partner_code + 사업자명 + 단톡방 이름 직접 입력 (source=MANUAL).</li>
 *   <li>"CSV 일괄 업로드" — 기존 "단톡방리스트" CSV (이카운트 사업자명 →
 *       partner_code 자동 변환, 변환 실패는 reject 보고서 다운로드).</li>
 * </ul>
 *
 * <h2>접근 제어</h2>
 * <ul>
 *   <li>route 진입 가드: MASTER / MANAGER ({@code RoleGuard}, BE {@code @PreAuthorize} 일치).</li>
 *   <li>UUID 비공개 — 사용자 노출 = partnerCode + businessName(snapshot) + chatRoomName.</li>
 * </ul>
 *
 * <h2>PR-H4c FE-C 보강 — 실시간 동기화</h2>
 * <ul>
 *   <li>30초 polling — 다중 워크스테이션 동시 매핑 등록/삭제 결과 자동 반영.</li>
 *   <li>notification-service SSE (PR-H4b BE-D) audit broker 합류 시 SSE 직접 구독으로 전환 가능
 *       (현재는 broker 만, /realtime endpoint 미존재).</li>
 * </ul>
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code admin-chatrooms-table}</li>
 *   <li>{@code admin-chatrooms-row} (각 데이터 행)</li>
 *   <li>{@code admin-chatrooms-add-button}</li>
 *   <li>{@code admin-chatrooms-import-button}</li>
 *   <li>{@code admin-chatrooms-delete-{id}}</li>
 *   <li>{@code admin-chatrooms-realtime-indicator}</li>
 * </ul>
 */
import { useMemo, useState, type FormEvent } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Badge, Button, CsvUploadDialog, Modal } from '@samhan/design-system'
import {
  CHAT_ROOM_SOURCE_LABEL,
  type ChatRoomMapping,
  type ChatRoomMappingSource,
  createChatRoom,
  deleteChatRoom,
  importChatRoomsCsv,
  listChatRooms,
} from '../../api/chatRoomApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'

const SOURCE_VARIANT: Record<
  ChatRoomMappingSource,
  'brand' | 'neutral' | 'success' | 'warning' | 'danger'
> = {
  NOTION_IMPORT: 'brand',
  MANUAL: 'success',
}

/** ISO-8601 → "YYYY-MM-DD HH:mm" (ko-KR 24시). null/undefined → "—". */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => n.toString().padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + ` ${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/** chatRoomName 별 그룹 — header row + 매핑 N건. */
interface ChatRoomGroup {
  chatRoomName: string
  rows: ChatRoomMapping[]
}

/**
 * 매핑 배열 → chatRoomName 별 그룹화. 그룹 내부는 partnerCode 오름차순.
 * 그룹 자체는 첫 매핑의 chatRoomName 한국어 정렬.
 */
function groupByChatRoom(items: ChatRoomMapping[]): ChatRoomGroup[] {
  const map = new Map<string, ChatRoomMapping[]>()
  for (const m of items) {
    const list = map.get(m.chatRoomName)
    if (list) list.push(m)
    else map.set(m.chatRoomName, [m])
  }
  return Array.from(map.entries())
    .map(([chatRoomName, rows]) => ({
      chatRoomName,
      rows: rows.slice().sort((a, b) => a.partnerCode.localeCompare(b.partnerCode)),
    }))
    .sort((a, b) => a.chatRoomName.localeCompare(b.chatRoomName, 'ko'))
}

export function ChatRoomsPage() {
  usePageTitle('단톡방 매핑')

  const [keyword, setKeyword] = useState('')
  const [committedKeyword, setCommittedKeyword] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canDeleteChatRoom = canAccess('messenger.admin', 'delete')
  const canCreateChatRoom = canAccess('messenger.admin', 'create')

  const query = useQuery({
    queryKey: ['admin', 'chat-rooms', committedKeyword],
    queryFn: () =>
      listChatRooms(
        committedKeyword
          // partnerCode 우선 매칭 — 사용자 명시 (partner_code 가 source-of-truth).
          // 숫자/영문만이면 partnerCode, 그 외(한글 등)는 chatRoomName 으로 query 분기.
          ? /^[0-9A-Za-z\-_.]+$/.test(committedKeyword)
            ? { partnerCode: committedKeyword }
            : { chatRoomName: committedKeyword }
          : {},
      ),
    // PR-H4c FE-C: 30초 polling — 멀티 워크스테이션 동기화 안전망 (BE broadcast SSE 합류 전 단계).
    refetchInterval: 30_000,
  })

  const groups: ChatRoomGroup[] = useMemo(
    () => groupByChatRoom(Array.isArray(query.data) ? query.data : []),
    [query.data],
  )

  const totalRows = query.data?.length ?? 0

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteChatRoom(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'chat-rooms'] })
    },
  })

  function handleSearch() {
    setCommittedKeyword(keyword.trim())
  }

  function handleDelete(row: ChatRoomMapping) {
    if (!canDeleteChatRoom) return
    const ok = window.confirm(
      `다음 매핑을 삭제하시겠습니까?\n\n`
      + `거래처: ${row.partnerCode} (${row.partnerBusinessName})\n`
      + `단톡방: ${row.chatRoomName}`,
    )
    if (!ok) return
    deleteMutation.mutate(row.id)
  }

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
        <h3 style={{ margin: 0 }}>
          단톡방 매핑
          <span
            style={{
              marginLeft: 12,
              fontSize: 12,
              color: 'var(--color-neutral-500, #6B7280)',
              fontWeight: 400,
            }}
          >
            전체 {totalRows}건 / 단톡방 {groups.length}개
          </span>
        </h3>
        <span
          data-testid="admin-chatrooms-realtime-indicator"
          style={{ fontSize: 12, color: 'var(--color-neutral-500, #6B7280)' }}
        >
          실시간 자동 갱신 · 30초
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="search"
          placeholder="거래처 코드 또는 단톡방 이름 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch()
          }}
          data-testid="admin-chatrooms-search-input"
          style={{
            flex: '1 1 280px',
            minWidth: 240,
            height: 32,
            padding: '0 10px',
            border: '1px solid #D1D5DB',
            borderRadius: 6,
            fontSize: 13,
          }}
        />
        <Button variant="ghost" size="sm" onClick={handleSearch}>
          검색
        </Button>
        <div style={{ flex: 1 }} />
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            if (!canCreateChatRoom) return
            setAddOpen(true)
          }}
          disabled={!canCreateChatRoom}
          data-testid="admin-chatrooms-add-button"
        >
          단건 추가
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            if (!canCreateChatRoom) return
            setImportOpen(true)
          }}
          disabled={!canCreateChatRoom}
          data-testid="admin-chatrooms-import-button"
        >
          CSV 업로드
        </Button>
      </div>

      <div
        data-testid="admin-chatrooms-table"
        style={{
          border: '1px solid var(--color-neutral-200, #E5E7EB)',
          borderRadius: 6,
          overflow: 'hidden',
          background: '#fff',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                background: 'var(--color-neutral-50, #F9FAFB)',
                borderBottom: '1px solid var(--color-neutral-200, #E5E7EB)',
                textAlign: 'left',
              }}
            >
              <th style={thStyle}>거래처 코드</th>
              <th style={thStyle}>사업자명 (snapshot)</th>
              <th style={thStyle}>단톡방 이름</th>
              <th style={{ ...thStyle, width: 110 }}>출처</th>
              <th style={{ ...thStyle, width: 160 }}>원본 생성</th>
              <th style={{ ...thStyle, width: 90, textAlign: 'right' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={6} style={emptyTdStyle}>
                  단톡방 매핑을 불러오는 중…
                </td>
              </tr>
            ) : query.isError ? (
              <tr>
                <td colSpan={6} style={emptyTdStyle}>
                  notification-service 가 응답하지 않습니다.
                </td>
              </tr>
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={6} style={emptyTdStyle}>
                  등록된 단톡방 매핑이 없습니다. 우상단의 "CSV 업로드" 또는
                  "단건 추가" 버튼으로 시작하세요.
                </td>
              </tr>
            ) : (
              groups.map((g) => (
                <ChatRoomGroupRows
                  key={g.chatRoomName}
                  group={g}
                  onDelete={handleDelete}
                  deletingId={
                    deleteMutation.isPending
                      ? deleteMutation.variables ?? null
                      : null
                  }
                  canDelete={canDeleteChatRoom}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <ChatRoomAddDialog
        open={addOpen}
        canCreate={canCreateChatRoom}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {
          setAddOpen(false)
          void queryClient.invalidateQueries({
            queryKey: ['admin', 'chat-rooms'],
          })
        }}
      />

      <CsvUploadDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="단톡방 매핑 일괄 등록"
        description="이카운트 사업자명을 거래처코드로 자동 변환합니다. 변환 실패는 reject 보고서로 다운로드 가능합니다."
        onUpload={async (file) => {
          if (!canCreateChatRoom) {
            return { inserted: 0, updated: 0, rejected: [] }
          }
          const result = await importChatRoomsCsv(file)
          void queryClient.invalidateQueries({
            queryKey: ['admin', 'chat-rooms'],
          })
          return result
        }}
      />
    </>
  )
}

interface ChatRoomGroupRowsProps {
  group: ChatRoomGroup
  onDelete: (row: ChatRoomMapping) => void
  deletingId: string | null
  canDelete: boolean
}

function ChatRoomGroupRows({
  group,
  onDelete,
  deletingId,
  canDelete,
}: ChatRoomGroupRowsProps) {
  const groupSize = group.rows.length
  return (
    <>
      {group.rows.map((row, idx) => (
        <tr
          key={row.id}
          data-testid="admin-chatrooms-row"
          style={{
            borderBottom: '1px solid var(--color-neutral-100, #F3F4F6)',
          }}
        >
          <td style={tdStyle}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {row.partnerCode}
            </span>
          </td>
          <td style={tdStyle}>{row.partnerBusinessName}</td>
          {idx === 0 ? (
            <td
              style={{
                ...tdStyle,
                fontWeight: 600,
                background: 'var(--color-brand-50, #EFF6FF)',
                verticalAlign: 'top',
              }}
              rowSpan={groupSize}
            >
              {row.chatRoomName}
              {groupSize > 1 ? (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    color: 'var(--color-neutral-500, #6B7280)',
                    fontWeight: 400,
                  }}
                >
                  ({groupSize}개 거래처)
                </span>
              ) : null}
            </td>
          ) : null}
          <td style={tdStyle}>
            <Badge variant={SOURCE_VARIANT[row.source]}>
              {CHAT_ROOM_SOURCE_LABEL[row.source]}
            </Badge>
          </td>
          <td style={tdStyle}>{formatDateTime(row.notionCreatedAt)}</td>
          <td style={{ ...tdStyle, textAlign: 'right' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(row)}
              disabled={deletingId === row.id || !canDelete}
              data-testid={`admin-chatrooms-delete-${row.id}`}
            >
              {deletingId === row.id ? '삭제 중…' : '삭제'}
            </Button>
          </td>
        </tr>
      ))}
    </>
  )
}

interface ChatRoomAddDialogProps {
  open: boolean
  canCreate: boolean
  onClose: () => void
  onSuccess: () => void
}

/**
 * 단건 등록 다이얼로그 — partner_code + 사업자명 + 단톡방 이름 입력.
 *
 * <p>사용자 명시: partner_code 직접 입력 (사업자명 lookup 우회). business_name 은
 * snapshot only — drift 감지 안 함.
 */
function ChatRoomAddDialog({
  open,
  canCreate,
  onClose,
  onSuccess,
}: ChatRoomAddDialogProps) {
  const [partnerCode, setPartnerCode] = useState('')
  const [partnerBusinessName, setPartnerBusinessName] = useState('')
  const [chatRoomName, setChatRoomName] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createChatRoom,
    onSuccess: () => {
      setPartnerCode('')
      setPartnerBusinessName('')
      setChatRoomName('')
      setErrorMessage(null)
      onSuccess()
    },
    onError: (err: unknown) => {
      setErrorMessage(extractErrorMessage(err))
    },
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canCreate) return
    setErrorMessage(null)
    if (!partnerCode.trim() || !partnerBusinessName.trim() || !chatRoomName.trim()) {
      setErrorMessage('모든 필드를 입력해 주세요.')
      return
    }
    mutation.mutate({
      partnerCode: partnerCode.trim(),
      partnerBusinessName: partnerBusinessName.trim(),
      chatRoomName: chatRoomName.trim(),
    })
  }

  function handleClose() {
    if (mutation.isPending) return
    setErrorMessage(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="단톡방 매핑 단건 추가"
      description="이카운트 거래처 코드를 직접 입력합니다. 사업자명은 화면 표시용 snapshot 입니다."
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              document
                .getElementById('chatroom-add-form')
                ?.dispatchEvent(
                  new Event('submit', { cancelable: true, bubbles: true }),
                )
            }
            disabled={mutation.isPending || !canCreate}
            data-testid="admin-chatrooms-add-submit"
          >
            {mutation.isPending ? '등록 중…' : '등록'}
          </Button>
        </>
      }
    >
      <form
        id="chatroom-add-form"
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <label style={labelStyle}>
          거래처 코드 (partner_code)
          <input
            type="text"
            value={partnerCode}
            onChange={(e) => setPartnerCode(e.target.value)}
            placeholder="예: 12345"
            autoFocus
            data-testid="admin-chatrooms-add-partner-code"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          사업자명 (snapshot)
          <input
            type="text"
            value={partnerBusinessName}
            onChange={(e) => setPartnerBusinessName(e.target.value)}
            placeholder="예: 삼한기업㈜"
            data-testid="admin-chatrooms-add-business-name"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          단톡방 이름
          <input
            type="text"
            value={chatRoomName}
            onChange={(e) => setChatRoomName(e.target.value)}
            placeholder="예: 삼한기업 영업팀"
            data-testid="admin-chatrooms-add-chatroom-name"
            style={inputStyle}
          />
        </label>
        {errorMessage ? (
          <div
            role="alert"
            style={{
              padding: '8px 10px',
              fontSize: 12,
              color: 'var(--color-danger-700, #B91C1C)',
              background: 'var(--color-danger-50, #FEF2F2)',
              border: '1px solid var(--color-danger-200, #FECACA)',
              borderRadius: 6,
            }}
          >
            {errorMessage}
          </div>
        ) : null}
      </form>
    </Modal>
  )
}

/** Axios 에러 → 한국어 메시지 추출 (BE ApiResponse.message 우선). */
function extractErrorMessage(err: unknown): string {
  // 형태가 axios error 인지 안전 추출.
  if (typeof err === 'object' && err !== null) {
    const anyErr = err as {
      response?: { data?: { message?: string }; status?: number }
      message?: string
    }
    const beMessage = anyErr.response?.data?.message
    if (beMessage && typeof beMessage === 'string') return beMessage
    if (anyErr.response?.status === 409) {
      return '동일한 거래처 + 단톡방 매핑이 이미 존재합니다.'
    }
    if (anyErr.message) return anyErr.message
  }
  return '등록 실패 — 잠시 후 다시 시도해 주세요.'
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-neutral-700, #374151)',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'middle',
}

const emptyTdStyle: React.CSSProperties = {
  padding: '32px 12px',
  textAlign: 'center',
  color: 'var(--color-neutral-500, #6B7280)',
  fontSize: 13,
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-neutral-700, #374151)',
}

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 13,
}
