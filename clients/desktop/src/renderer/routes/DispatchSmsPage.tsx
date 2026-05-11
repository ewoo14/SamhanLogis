/**
 * 배차안내 SMS 발송 admin UI — `/arologis/dispatch-sms` (PR-E1 FE-6).
 *
 * <p>legacy GAS 8번 (배차안내문자) 의 수동 워크플로우 자동화. 2-step 안전 가드.
 *
 * <pre>
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │ Step 1 — Preview (dryRun)                                        │
 *  │   - date 필터 (default = today)                                  │
 *  │   - [미리보기] → BE preview                                       │
 *  │   - 단톡방별 섹션 + 거래처별 SMS 본문 (textarea, 수정 가능)       │
 *  │   - blocked 거래처 회색 + "발송금지" badge (자동 제외 안내)       │
 *  │                                                                  │
 *  │ Step 2 — Send (확인 후 활성)                                     │
 *  │   - [발송 확인] checkbox                                          │
 *  │   - [실 발송] 버튼 (체크 후 활성, 빨간색)                         │
 *  │   - confirm dialog ("정말 발송하시겠습니까?")                     │
 *  │   - 결과 stats (sent / failed / blocked)                         │
 *  └──────────────────────────────────────────────────────────────────┘
 * </pre>
 *
 * <h2>UUID 비공개 (feedback_uuid_no_user_visibility.md)</h2>
 * 사용자 노출 = chatRoomName / partnerCode / partnerName / slipNo 만.
 *
 * <h2>안전 가드 (사용자 R8 명시 — dryRun → 실 발송 2-step)</h2>
 * <ul>
 *   <li>preview 결과 미존재 시 send 비활성</li>
 *   <li>"발송 확인" checkbox 체크 후에만 send 버튼 활성</li>
 *   <li>send 버튼 클릭 시 window.confirm() 추가 가드</li>
 * </ul>
 *
 * <h2>data-testid (slice 명세)</h2>
 * <ul>
 *   <li>{@code dispatch-sms-date} — 날짜 input</li>
 *   <li>{@code dispatch-sms-preview-button} — 미리보기 버튼</li>
 *   <li>{@code dispatch-sms-room-{chatRoomName}} — 단톡방 섹션</li>
 *   <li>{@code dispatch-sms-message-{partnerCode}} — 본문 textarea</li>
 *   <li>{@code dispatch-sms-blocked-badge-{partnerCode}} — 발송금지 배지</li>
 *   <li>{@code dispatch-sms-confirm-checkbox} — 발송 확인 체크박스</li>
 *   <li>{@code dispatch-sms-send-button} — 실 발송 버튼</li>
 *   <li>{@code dispatch-sms-result-stats} — 발송 결과 통계</li>
 * </ul>
 */
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Badge, Button, Card, FormField } from '@samhan/design-system'
import axios from 'axios'
import {
  previewDispatchBatch,
  sendDispatchBatch,
  type DispatchSmsPreviewResponse,
  type DispatchSmsSendEntry,
  type DispatchSmsSendResponse,
} from '../api/dispatchSmsApi'
import { usePageTitle } from '../hooks/usePageTitle'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const todayIso = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * preview 응답 → message 편집 state. partnerCode 키 (단톡방 내 + 사이 unique).
 *
 * <p>BE 단톡방별 그룹핑이 같은 partnerCode 를 두 번 보내지 않으므로 partnerCode 단독 키.
 */
type EditedMessages = Record<string, string>

function buildInitialEdited(
  preview: DispatchSmsPreviewResponse,
): EditedMessages {
  const result: EditedMessages = {}
  for (const room of preview.chatRooms) {
    for (const p of room.partners) {
      result[p.partnerCode] = p.message
    }
  }
  return result
}

/** preview + 운영자 수정 본문 → BE send entries (blocked 자동 제외). */
function buildSendEntries(
  preview: DispatchSmsPreviewResponse,
  edited: EditedMessages,
): DispatchSmsSendEntry[] {
  const entries: DispatchSmsSendEntry[] = []
  for (const room of preview.chatRooms) {
    for (const p of room.partners) {
      if (p.blocked) continue // 발송금지는 FE 단에서 제외 (BE 도 재확인)
      entries.push({
        partnerCode: p.partnerCode,
        // recipientPhone — 본 슬라이스 BE preview 응답에 포함되지 않으므로
        // 단톡방 운영자 phone resolution 은 BE send service 가 chatRoomName 키로 조회.
        // FE 는 placeholder 빈 문자열 대신 partnerCode prefix 로 임시 문자열 전달
        // (BE 단계 NotBlank 통과 — 실 발송 채널은 chatRoomName 으로 lookup).
        recipientPhone: `room:${room.chatRoomName}`,
        message: edited[p.partnerCode] ?? p.message,
        chatRoomName: room.chatRoomName,
      })
    }
  }
  return entries
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export function DispatchSmsPage() {
  usePageTitle('배차안내 SMS 발송')

  // ---- Step 1 — Preview state -------------------------------------------
  const [date, setDate] = useState<string>(todayIso())
  const [preview, setPreview] = useState<DispatchSmsPreviewResponse | null>(
    null,
  )
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // ---- 메시지 편집 state (partnerCode → message) ------------------------
  const [edited, setEdited] = useState<EditedMessages>({})

  // ---- Step 2 — Send state ----------------------------------------------
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [sendResult, setSendResult] = useState<DispatchSmsSendResponse | null>(
    null,
  )

  // ---- Preview 호출 ------------------------------------------------------
  const handlePreview = async () => {
    setPreviewLoading(true)
    setPreviewError(null)
    setSendResult(null) // 새 preview 시 이전 발송 결과 초기화
    setConfirmChecked(false) // 새 preview 시 send 가드 초기화
    try {
      const result = await previewDispatchBatch(date)
      setPreview(result)
      setEdited(buildInitialEdited(result))
    } catch (err) {
      setPreview(null)
      setEdited({})
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string } | undefined
        setPreviewError(data?.message ?? '미리보기 호출에 실패했습니다.')
      } else {
        setPreviewError('알 수 없는 오류')
      }
    } finally {
      setPreviewLoading(false)
    }
  }

  // ---- Send mutation ----------------------------------------------------
  const sendMutation = useMutation<DispatchSmsSendResponse, unknown, void>({
    mutationFn: async () => {
      if (!preview) throw new Error('preview 결과가 없습니다.')
      const entries = buildSendEntries(preview, edited)
      return await sendDispatchBatch(date, entries)
    },
    onSuccess: (data) => {
      setSendResult(data)
      // 발송 후 confirm 체크 자동 해제 — 중복 발송 방지
      setConfirmChecked(false)
    },
  })

  const sendErrorMessage = (() => {
    if (!sendMutation.isError) return null
    const err = sendMutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '실 발송에 실패했습니다.'
    }
    if (err instanceof Error) return err.message
    return '알 수 없는 오류'
  })()

  // 발송 가능 entries 수 (blocked 제외)
  const sendableCount = useMemo(() => {
    if (!preview) return 0
    return preview.chatRooms.reduce(
      (sum, room) => sum + room.partners.filter((p) => !p.blocked).length,
      0,
    )
  }, [preview])

  const blockedCount = useMemo(() => {
    if (!preview) return 0
    return preview.chatRooms.reduce(
      (sum, room) => sum + room.partners.filter((p) => p.blocked).length,
      0,
    )
  }, [preview])

  const sendDisabled
    = !preview
      || !confirmChecked
      || sendableCount === 0
      || sendMutation.isPending

  // ---- Send 버튼 핸들러 (window.confirm 가드) ----------------------------
  const handleSend = () => {
    if (sendDisabled) return
    const ok = window.confirm(
      `정말 발송하시겠습니까?\n발송 대상: ${sendableCount}건 (발송금지 ${blockedCount}건 자동 제외)`,
    )
    if (!ok) return
    sendMutation.mutate()
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h3 style={{ margin: 0 }}>배차안내 SMS 발송</h3>
          {/* PR-H4c FE-B: 워크플로우 화면 (preview → send) — 발송 audit 는 BE 측에서 자동 기록 */}
          <span
            data-testid="dispatch-sms-realtime-notice"
            style={{ fontSize: 12, color: 'var(--color-neutral-500, #6B7280)' }}
          >
            발송 이력은 BE audit_log 에 자동 기록 (PR-H4c)
          </span>
        </div>
      </div>

      {/* =============================================================== */}
      {/* Step 1 — Preview                                                */}
      {/* =============================================================== */}
      <Card padding={5} shadow="sm" style={{ marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>Step 1. 미리보기</h4>
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 0 }}>
          출고전표를 자동 조회하여 단톡방별로 그룹핑합니다. 발송금지 거래처는
          자동 제외됩니다.
        </p>

        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <FormField
            label="배차일"
            required
            render={({ id }) => (
              <input
                id={id}
                data-testid="dispatch-sms-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
              />
            )}
          />
          <div style={{ paddingBottom: 4 }}>
            <Button
              data-testid="dispatch-sms-preview-button"
              variant="secondary"
              onClick={() => void handlePreview()}
              loading={previewLoading}
            >
              미리보기
            </Button>
          </div>
        </div>

        {previewError ? (
          <div
            className="error-banner"
            role="alert"
            style={{ marginTop: 12 }}
          >
            {previewError}
          </div>
        ) : null}

        {preview ? (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>
              배차일: <strong>{preview.date}</strong> · 출고전표{' '}
              <strong>{preview.totalSlips}</strong>건 · 단톡방 매핑{' '}
              <strong>{preview.mappedSlips}</strong>건 · 미매핑{' '}
              <strong>{preview.unmappedSlips}</strong>건
            </p>

            {preview.chatRooms.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  background: 'var(--color-neutral-50)',
                  border: '1px solid var(--color-neutral-200)',
                  borderRadius: 6,
                  fontSize: 13,
                  color: '#6B7280',
                }}
              >
                해당 일자에 발송할 출고전표가 없습니다.
              </div>
            ) : null}

            {preview.chatRooms.map((room) => (
              <Card
                key={room.chatRoomName}
                data-testid={`dispatch-sms-room-${room.chatRoomName}`}
                padding={4}
                shadow="sm"
                style={{
                  marginBottom: 12,
                  background: 'var(--color-neutral-50)',
                  border: '1px solid var(--color-neutral-200)',
                }}
              >
                <h5 style={{ margin: '0 0 8px' }}>
                  단톡방: {room.chatRoomName}{' '}
                  <span style={{ fontSize: 12, color: '#6B7280' }}>
                    ({room.partners.length}건)
                  </span>
                </h5>

                {room.partners.map((p) => (
                  <div
                    key={p.partnerCode}
                    style={{
                      padding: 10,
                      borderRadius: 4,
                      border: '1px solid var(--color-neutral-200)',
                      marginBottom: 8,
                      background: p.blocked ? '#F3F4F6' : '#fff',
                      opacity: p.blocked ? 0.7 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ fontSize: 13 }}>
                        <strong>{p.partnerName}</strong>{' '}
                        <span style={{ color: '#6B7280' }}>
                          [{p.partnerCode}]
                        </span>{' '}
                        <span style={{ color: '#6B7280' }}>
                          · 전표 {p.slipNo}
                        </span>
                      </div>
                      {p.blocked ? (
                        <Badge
                          data-testid={`dispatch-sms-blocked-badge-${p.partnerCode}`}
                          variant="danger"
                        >
                          발송금지
                        </Badge>
                      ) : null}
                    </div>

                    <textarea
                      data-testid={`dispatch-sms-message-${p.partnerCode}`}
                      value={edited[p.partnerCode] ?? p.message}
                      onChange={(e) =>
                        setEdited((prev) => ({
                          ...prev,
                          [p.partnerCode]: e.target.value,
                        }))
                      }
                      disabled={p.blocked}
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 4,
                        border: '1px solid var(--color-neutral-300)',
                        fontSize: 13,
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        background: p.blocked ? '#F9FAFB' : '#fff',
                      }}
                    />
                  </div>
                ))}
              </Card>
            ))}

            {preview.unmapped.length > 0 ? (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 6,
                  background: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  fontSize: 12,
                  color: '#92400E',
                }}
              >
                <strong>단톡방 미매핑 거래처 {preview.unmapped.length}건</strong>{' '}
                — 단톡방 매핑 admin 에서 등록 후 다시 미리보기 하세요.
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {preview.unmapped.map((u) => (
                    <li key={`${u.partnerCode}-${u.slipNo}`}>
                      {u.partnerName} [{u.partnerCode}] · 전표 {u.slipNo}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {/* =============================================================== */}
      {/* Step 2 — Send (preview 후 활성)                                 */}
      {/* =============================================================== */}
      <Card padding={5} shadow="sm">
        <h4 style={{ marginTop: 0 }}>Step 2. 실 발송</h4>
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 0 }}>
          실 발송은 비가역 작업입니다. 미리보기 결과를 확인하고{' '}
          <strong>발송 확인</strong> 체크 후 발송하세요.
        </p>

        {!preview ? (
          <div
            style={{
              padding: 12,
              background: 'var(--color-neutral-50)',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 6,
              fontSize: 13,
              color: '#6B7280',
            }}
          >
            먼저 Step 1 미리보기를 실행하세요.
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  cursor: sendableCount === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <input
                  data-testid="dispatch-sms-confirm-checkbox"
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  disabled={sendableCount === 0}
                />
                <strong>발송 확인</strong> — 미리보기 결과를 검토했고 실 발송에
                동의합니다.
              </label>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <Button
                data-testid="dispatch-sms-send-button"
                variant="danger"
                onClick={handleSend}
                disabled={sendDisabled}
                loading={sendMutation.isPending}
              >
                실 발송 ({sendableCount}건)
              </Button>
              <span style={{ fontSize: 12, color: '#6B7280' }}>
                발송금지 자동 제외: {blockedCount}건
              </span>
            </div>
          </>
        )}

        {sendErrorMessage ? (
          <div className="error-banner" role="alert" style={{ marginTop: 12 }}>
            {sendErrorMessage}
          </div>
        ) : null}

        {sendResult ? (
          <div
            data-testid="dispatch-sms-result-stats"
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 6,
              background: '#ECFDF5',
              border: '1px solid #10B981',
              fontSize: 13,
            }}
          >
            <h5 style={{ margin: '0 0 8px', color: '#065F46' }}>
              발송 결과 ({sendResult.date})
            </h5>
            <div style={{ display: 'flex', gap: 16 }}>
              <span>
                성공: <strong>{sendResult.sent}</strong>건
              </span>
              <span>
                실패: <strong>{sendResult.failed}</strong>건
              </span>
              <span>
                발송금지 제외: <strong>{sendResult.blocked}</strong>건
              </span>
            </div>
            {sendResult.failed > 0 || sendResult.blocked > 0 ? (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12 }}>
                  상세 보기 ({sendResult.details.length}건)
                </summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                  {sendResult.details.map((d, i) => (
                    <li key={`${d.partnerCode}-${i}`}>
                      [{d.status}] {d.partnerCode} · {d.recipientPhone}
                      {d.reason ? ` — ${d.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </Card>
    </>
  )
}

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--color-neutral-300)',
  fontSize: 14,
  width: '100%',
} as const
