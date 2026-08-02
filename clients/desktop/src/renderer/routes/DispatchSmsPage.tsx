/**
 * 배차안내 SMS 발송 admin UI — `/arologis/dispatch-sms`.
 *
 * <p>미리보기 결과는 AUTO_LATEST 로 자동 저장하고, 운영자 명시 저장은 MANUAL_NAMED,
 * 실 발송 결과는 발송 감사 append-only 저장내역으로 남긴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, CopyButton, Input, Tabs } from '@samhan/design-system'
import axios from 'axios'
import {
  previewDispatchBatch,
  sendDispatchBatch,
  type DispatchSmsPreviewResponse,
  type DispatchSmsSendEntry,
  type DispatchSmsSendResponse,
} from '../api/dispatchSmsApi'
import {
  getLatestDispatchSmsHistory,
  saveDispatchSmsHistory,
  type DispatchSmsSaveHistoryDetailResponse,
} from '../api/dispatchSmsSaveHistoryApi'
import {
  DispatchSmsHistoryTab,
  dispatchSmsHistoryListQueryKey,
  formatDateTime,
} from '../components/DispatchSmsHistoryTab'
import { DispatchSmsRestoredBanner } from '../components/DispatchSmsRestoredBanner'
import { DispatchSmsSaveDialog } from '../components/DispatchSmsSaveDialog'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { maskCreatedBy } from '../utils/maskCreatedBy'
import { buildDispatchSmsClipboardText, type DispatchSmsClipboardRow } from './dispatchSmsClipboard'

export type EditedMessages = Record<string, string>
type PreviewHistoryPayload =
  | DispatchSmsPreviewResponse
  | {
      preview: DispatchSmsPreviewResponse
      edited?: EditedMessages
    }
type SendAuditHistoryPayload =
  | DispatchSmsSendResponse
  | {
      result: DispatchSmsSendResponse
      preview?: DispatchSmsPreviewResponse
      edited?: EditedMessages
    }

const TEST_ID_PREFIX = 'dispatch-sms-history'

const todayIso = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildInitialEdited(preview: DispatchSmsPreviewResponse): EditedMessages {
  const result: EditedMessages = {}
  for (const room of preview.chatRooms) {
    for (const p of room.partners) {
      result[p.partnerCode] = p.message
    }
  }
  return result
}

/**
 * 실제 SMS 요청으로 만들 수 있는 미매핑·인수자 번호 보유 전표만 선별한다.
 * 단톡방 매핑 전표는 현재 단톡방 직접 전송 수단이 없어 SMS 요청 대상이 아니다.
 * 같은 날짜의 같은 수신번호는 레거시 P_<번호> 키처럼 한 entry로 병합한다.
 */
export function buildSendEntries(
  preview: DispatchSmsPreviewResponse,
  edited: EditedMessages,
): DispatchSmsSendEntry[] {
  const entriesByRecipient = new Map<string, DispatchSmsSendEntry>()
  // 단톡방 직접 전송 API가 없으므로 매핑된 room은 수동 전달 경로로 남긴다.
  // 매핑이 없는 건만 인수자 전화번호 SMS fallback으로 보낸다.
  for (const p of preview.unmapped) {
    const recipientPhone = p.recipientPhone?.trim() ?? ''
    if (!recipientPhone) continue
    const message = edited[p.partnerCode] ?? p.message
    const existing = entriesByRecipient.get(recipientPhone)
    if (existing) {
      existing.message = `${existing.message}\n\n${message}`
      continue
    }
    entriesByRecipient.set(recipientPhone, {
      partnerCode: p.partnerCode,
      recipientPhone,
      message,
    })
  }
  return [...entriesByRecipient.values()]
}

/** 화면의 SMS 발송 건수와 buildSendEntries의 실제 요청 건수를 동일하게 계산한다. */
export function countSendableEntries(preview: DispatchSmsPreviewResponse): number {
  return new Set(
    preview.unmapped
      .map((p) => p.recipientPhone?.trim() ?? '')
      .filter(Boolean),
  ).size
}

function previewRequestParams(preview: DispatchSmsPreviewResponse): Record<string, unknown> {
  return {
    date: preview.date,
    rowCount: preview.totalSlips,
    mappedSlips: preview.mappedSlips,
    unmappedSlips: preview.unmappedSlips,
  }
}

function previewHistoryPayload(
  preview: DispatchSmsPreviewResponse,
  edited: EditedMessages,
): { preview: DispatchSmsPreviewResponse; edited: EditedMessages } {
  return { preview, edited }
}

function readPreviewHistoryPayload(payload: unknown): {
  preview: DispatchSmsPreviewResponse
  edited?: EditedMessages
} {
  const candidate = payload as PreviewHistoryPayload
  if (candidate && typeof candidate === 'object' && 'preview' in candidate) {
    return {
      preview: candidate.preview,
      edited: candidate.edited,
    }
  }
  return { preview: candidate as DispatchSmsPreviewResponse }
}

function readSendAuditHistoryPayload(payload: unknown): DispatchSmsSendResponse {
  const candidate = payload as SendAuditHistoryPayload
  if (candidate && typeof candidate === 'object' && 'result' in candidate) {
    return candidate.result
  }
  return candidate as DispatchSmsSendResponse
}

function sendAuditRequestParams(
  date: string,
  entries: DispatchSmsSendEntry[],
  result: DispatchSmsSendResponse,
): Record<string, unknown> {
  return {
    date,
    rowCount: entries.length,
    sent: result.sent,
    failed: result.failed,
    blocked: result.blocked,
  }
}

export function DispatchSmsPage() {
  usePageTitle('배차안내 SMS 발송')
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canBatch = canAccess('dispatch.batch', 'create')

  const [date, setDate] = useState<string>(todayIso())
  const [preview, setPreview] = useState<DispatchSmsPreviewResponse | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [edited, setEdited] = useState<EditedMessages>({})
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [sendResult, setSendResult] = useState<DispatchSmsSendResponse | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [restoreBanner, setRestoreBanner] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [latestRestoreSettled, setLatestRestoreSettled] = useState(false)
  const [selectedClipboardIds, setSelectedClipboardIds] = useState<Set<string>>(new Set())
  const lastAutoSaveKeyRef = useRef<string | null>(null)
  const skipNextAutoSaveRef = useRef(false)
  const lastSendEntriesRef = useRef<DispatchSmsSendEntry[]>([])

  useEffect(() => {
    let cancelled = false
    void getLatestDispatchSmsHistory('DISPATCH_SMS')
      .then((detail) => {
        if (cancelled || !detail) return
        if (detail.saveMode !== 'AUTO_LATEST') return
        const restored = readPreviewHistoryPayload(detail.responsePayload)
        setPreview(restored.preview)
        setEdited(restored.edited ?? buildInitialEdited(restored.preview))
        setDate(restored.preview.date)
        skipNextAutoSaveRef.current = true
        setRestoreBanner(`이전 미리보기 복원됨 · ${formatDateTime(detail.createdAt)}`)
      })
      .catch(() => {
        // latest 없음/조회 실패는 첫 방문 UX 를 막지 않는다.
      })
      .finally(() => {
        if (!cancelled) setLatestRestoreSettled(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!latestRestoreSettled || !preview) return
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false
      return
    }
    const autoSaveKey = `${preview.date}|${preview.totalSlips}|${preview.mappedSlips}|${preview.unmappedSlips}|${JSON.stringify(edited)}`
    if (lastAutoSaveKeyRef.current === autoSaveKey) return
    lastAutoSaveKeyRef.current = autoSaveKey
    void saveDispatchSmsHistory({
      programType: 'DISPATCH_SMS',
      saveMode: 'AUTO_LATEST',
      requestParams: previewRequestParams(preview),
      responsePayload: previewHistoryPayload(preview, edited),
    }).then(() => {
      void queryClient.invalidateQueries({ queryKey: dispatchSmsHistoryListQueryKey('DISPATCH_SMS') })
      void queryClient.invalidateQueries({ queryKey: dispatchSmsHistoryListQueryKey() })
    }).catch(() => {
      // 자동 저장 실패는 미리보기 검토 UX 를 막지 않는다.
    })
  }, [edited, latestRestoreSettled, preview, queryClient])

  const handlePreview = async () => {
    if (!canBatch) return
    setPreviewLoading(true)
    setPreviewError(null)
    setSendResult(null)
    setAuditError(null)
    setConfirmChecked(false)
    try {
      const result = await previewDispatchBatch(date)
      setPreview(result)
      setEdited(buildInitialEdited(result))
      setSelectedClipboardIds(new Set())
      setRestoreBanner(null)
    } catch (err) {
      setPreview(null)
      setEdited({})
      setSelectedClipboardIds(new Set())
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

  const saveManualMutation = useMutation({
    mutationFn: (topic: string) => {
      if (!preview) throw new Error('저장할 배차문자 미리보기 결과가 없습니다.')
      return saveDispatchSmsHistory({
        programType: 'DISPATCH_SMS',
        saveMode: 'MANUAL_NAMED',
        topic,
        requestParams: previewRequestParams(preview),
        responsePayload: previewHistoryPayload(preview, edited),
      })
    },
    onSuccess: () => {
      setSaveDialogOpen(false)
      setActiveTab(1)
      void queryClient.invalidateQueries({ queryKey: dispatchSmsHistoryListQueryKey('DISPATCH_SMS') })
      void queryClient.invalidateQueries({ queryKey: dispatchSmsHistoryListQueryKey() })
    },
  })

  const saveSendAudit = useCallback(async (
    result: DispatchSmsSendResponse,
    entries: DispatchSmsSendEntry[],
  ) => {
    try {
      setAuditError(null)
      await saveDispatchSmsHistory({
        programType: 'DISPATCH_SMS',
        saveMode: 'SEND_AUDIT',
        topic: `발송 감사 ${result.date}`,
        requestParams: sendAuditRequestParams(result.date ?? todayIso(), entries, result),
        responsePayload: {
          result,
          preview,
          edited,
        },
      })
      void queryClient.invalidateQueries({ queryKey: dispatchSmsHistoryListQueryKey('DISPATCH_SMS') })
      void queryClient.invalidateQueries({ queryKey: dispatchSmsHistoryListQueryKey() })
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message ?? '발송 감사 저장에 실패했습니다.')
        : '발송 감사 저장에 실패했습니다.'
      setAuditError(message)
    }
  }, [edited, preview, queryClient])

  const sendMutation = useMutation<DispatchSmsSendResponse, unknown, void>({
    mutationFn: async () => {
      if (!preview) throw new Error('미리보기 결과가 없습니다.')
      const entries = buildSendEntries(preview, edited)
      lastSendEntriesRef.current = entries
      return await sendDispatchBatch(date, entries)
    },
    onSuccess: (data) => {
      setSendResult(data)
      setConfirmChecked(false)
      void saveSendAudit(data, lastSendEntriesRef.current)
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

  const sendableCount = useMemo(() => {
    if (!preview) return 0
    return countSendableEntries(preview)
  }, [preview])

  const blockedCount = useMemo(() => {
    if (!preview) return 0
    return preview.chatRooms.reduce(
      (sum, room) => sum + room.partners.filter((p) => p.blocked).length,
      0,
    )
  }, [preview])

  const sendDisabled = !preview || !confirmChecked || sendableCount === 0 || sendMutation.isPending || !canBatch

  const clipboardRows = useMemo<DispatchSmsClipboardRow[]>(() => {
    if (!preview) return []
    return [
      ...preview.chatRooms.flatMap((room) => room.partners.map((p) => ({
        id: p.partnerCode,
        partnerName: p.partnerName,
        slipNo: p.slipNo,
        message: edited[p.partnerCode] ?? p.message,
        chatRoomName: room.chatRoomName,
      }))),
      ...preview.unmapped.map((p) => ({
        id: p.partnerCode,
        partnerName: p.partnerName,
        slipNo: p.slipNo,
        message: edited[p.partnerCode] ?? p.message,
        chatRoomName: '',
      })),
    ]
  }, [edited, preview])

  const clipboardText = useMemo(
    () => buildDispatchSmsClipboardText(clipboardRows, selectedClipboardIds),
    [clipboardRows, selectedClipboardIds],
  )

  const handleSend = () => {
    if (!canBatch) return
    if (sendDisabled) return
    const firstOk = window.confirm(
      `발송 전 최종 확인입니다.\n발송 대상 ${sendableCount}건, 발송금지 ${blockedCount}건 제외 상태입니다.`,
    )
    if (!firstOk) return
    const secondOk = window.confirm('정말 실 발송을 진행하시겠습니까? 발송 후 발송 감사 이력이 자동 저장됩니다.')
    if (!secondOk) return
    sendMutation.mutate()
  }

  const handleRestore = useCallback((detail: DispatchSmsSaveHistoryDetailResponse) => {
    setAuditError(null)
    if (detail.saveMode === 'SEND_AUDIT') {
      setSendResult(readSendAuditHistoryPayload(detail.responsePayload))
      setPreview(null)
      setEdited({})
      lastSendEntriesRef.current = []
      setConfirmChecked(false)
      setActiveTab(0)
      setRestoreBanner(`발송 감사 확인: ${formatDateTime(detail.createdAt)} ${maskCreatedBy(detail.createdBy)}`)
      return
    }
    const restored = readPreviewHistoryPayload(detail.responsePayload)
    setPreview(restored.preview)
    setEdited(restored.edited ?? buildInitialEdited(restored.preview))
    setSelectedClipboardIds(new Set())
    setDate(restored.preview.date)
    setSendResult(null)
    skipNextAutoSaveRef.current = true
    setActiveTab(0)
    setRestoreBanner(`복원: ${formatDateTime(detail.createdAt)} ${maskCreatedBy(detail.createdBy)} '${detail.topic}'`)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Tabs
        tabs={[
          { label: '실행', testId: 'dispatch-sms-history-tab-run' },
          { label: '저장내역', testId: 'dispatch-sms-history-tab-list' },
        ]}
        activeIndex={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="배차문자 저장내역 탭"
      >
        <div>
          {restoreBanner ? (
            <DispatchSmsRestoredBanner
              message={restoreBanner}
              testIdPrefix={TEST_ID_PREFIX}
              onClose={() => setRestoreBanner(null)}
            />
          ) : null}
          <Header preview={preview} onSaveClick={() => setSaveDialogOpen(true)} />
          <PreviewSection
            date={date}
            preview={preview}
            edited={edited}
            previewError={previewError}
            previewLoading={previewLoading}
            canPreview={canBatch}
            onDateChange={setDate}
            onPreview={() => void handlePreview()}
            clipboardText={clipboardText}
            selectedClipboardIds={selectedClipboardIds}
            onClipboardSelectionChange={(id, selected) => {
              setSelectedClipboardIds((previous) => {
                const next = new Set(previous)
                if (selected) next.add(id)
                else next.delete(id)
                return next
              })
            }}
            onMessageChange={(partnerCode, message) => {
              setEdited((prev) => ({ ...prev, [partnerCode]: message }))
            }}
          />
          <SendSection
            preview={preview}
            confirmChecked={confirmChecked}
            sendableCount={sendableCount}
            blockedCount={blockedCount}
            sendDisabled={sendDisabled}
            sendPending={sendMutation.isPending}
            sendResult={sendResult}
            sendErrorMessage={sendErrorMessage}
            auditError={auditError}
            onConfirmChange={setConfirmChecked}
            onSend={handleSend}
          />
        </div>
        <DispatchSmsHistoryTab
          programType="DISPATCH_SMS"
          testIdPrefix={TEST_ID_PREFIX}
          isSaving={saveManualMutation.isPending}
          onRestore={handleRestore}
        />
      </Tabs>
      <DispatchSmsSaveDialog
        open={saveDialogOpen}
        isSaving={saveManualMutation.isPending}
        testIdPrefix={TEST_ID_PREFIX}
        onClose={() => setSaveDialogOpen(false)}
        onSave={(topic) => saveManualMutation.mutate(topic)}
      />
    </div>
  )
}

function Header({
  preview,
  onSaveClick,
}: {
  preview: DispatchSmsPreviewResponse | null
  onSaveClick: () => void
}) {
  return (
    <div style={headerStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>배차안내 SMS 발송</h3>
        <span data-testid="dispatch-sms-realtime-notice" style={noticeStyle}>
          미리보기 저장내역 + 발송 감사
        </span>
      </div>
      <Button
        variant="primary"
        data-testid="dispatch-sms-history-save-button"
        onClick={onSaveClick}
        disabled={!preview || preview.totalSlips === 0}
      >
        내역으로 저장
      </Button>
    </div>
  )
}

function PreviewSection({
  date,
  preview,
  edited,
  previewError,
  previewLoading,
  canPreview,
  onDateChange,
  onPreview,
  clipboardText,
  selectedClipboardIds,
  onClipboardSelectionChange,
  onMessageChange,
}: {
  date: string
  preview: DispatchSmsPreviewResponse | null
  edited: EditedMessages
  previewError: string | null
  previewLoading: boolean
  canPreview: boolean
  onDateChange: (value: string) => void
  onPreview: () => void
  clipboardText: string
  selectedClipboardIds: ReadonlySet<string>
  onClipboardSelectionChange: (id: string, selected: boolean) => void
  onMessageChange: (partnerCode: string, message: string) => void
}) {
  return (
    <Card padding={5} shadow="sm" style={{ marginBottom: 16 }}>
      <h4 style={{ marginTop: 0 }}>Step 1. 미리보기</h4>
      <p style={mutedTextStyle}>
        출고전표를 자동 조회하여 단톡방별로 그룹핑합니다. 발송금지 거래처는 자동 제외됩니다.
      </p>

      <div className="form-row" style={{ alignItems: 'flex-end' }}>
        <Input
          label="배차일"
          required
          data-testid="dispatch-sms-date"
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          inputSize="md"
          fullWidth={false}
        />
        <div style={{ paddingBottom: 4 }}>
          <Button
            data-testid="dispatch-sms-preview-button"
            variant="secondary"
            onClick={onPreview}
            loading={previewLoading}
            disabled={!canPreview}
          >
            미리보기
          </Button>
        </div>
      </div>

      {previewError ? <div className="error-banner" role="alert" style={{ marginTop: 12 }}>{previewError}</div> : null}

      {preview ? (
        <div style={{ marginTop: 16 }}>
          <p style={summaryTextStyle}>
            배차일: <strong>{preview.date}</strong> · 출고전표 <strong>{preview.totalSlips}</strong>건 ·
            단톡방 매핑 <strong>{preview.mappedSlips}</strong>건 · 미매핑 <strong>{preview.unmappedSlips}</strong>건
          </p>

          <div style={copyToolbarStyle}>
            <span style={noticeStyle}>선택한 배차 대상만 복사 · 거래처명 / 전표번호 / 발송멘트 / 단톡방</span>
            <CopyButton
              text={clipboardText}
              label={`선택 복사 (${selectedClipboardIds.size}건)`}
              disabled={!clipboardText}
            />
          </div>

          {preview.chatRooms.length === 0 ? (
            <div style={emptyBoxStyle}>해당 일자에 발송할 출고전표가 없습니다.</div>
          ) : null}

          {preview.chatRooms.map((room) => (
            <section
              key={room.chatRoomName}
              data-testid={`dispatch-sms-room-${room.chatRoomName}`}
              style={roomSectionStyle}
            >
              <h5 style={{ margin: '0 0 8px' }}>
                단톡방: {room.chatRoomName}{' '}
                <span style={noticeStyle}>({room.partners.length}건)</span>
              </h5>

              {room.partners.map((p) => (
                <div key={p.partnerCode} style={partnerBoxStyle(p.blocked)}>
                  <div style={partnerHeaderStyle}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        aria-label={`${p.partnerName} 배차 대상 선택`}
                        checked={selectedClipboardIds.has(p.partnerCode)}
                        onChange={(e) => onClipboardSelectionChange(p.partnerCode, e.target.checked)}
                      />
                      <span>
                      <strong>{p.partnerName}</strong>{' '}
                      <span style={noticeStyle}>[{p.partnerCode}] · 전표 {p.slipNo}</span>
                      </span>
                    </label>
                    {p.blocked ? (
                      <Badge data-testid={`dispatch-sms-blocked-badge-${p.partnerCode}`} variant="danger">
                        발송금지
                      </Badge>
                    ) : null}
                  </div>

                  <textarea
                    data-testid={`dispatch-sms-message-${p.partnerCode}`}
                    value={edited[p.partnerCode] ?? p.message}
                    onChange={(e) => onMessageChange(p.partnerCode, e.target.value)}
                    disabled={p.blocked}
                    rows={3}
                    style={textareaStyle(p.blocked)}
                  />
                </div>
              ))}
            </section>
          ))}

          {preview.unmapped.length > 0 ? (
            <div style={warningBoxStyle}>
              <strong>단톡방 미매핑 전표 {preview.unmapped.length}건</strong> — 인수자 번호가 있는 전표는 아래 SMS 발송 대상에 포함되고, 번호가 없으면 발송하지 않습니다.
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {preview.unmapped.map((u) => (
                  <li key={`${u.partnerCode}-${u.slipNo}`}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        aria-label={`${u.partnerName} 배차 대상 선택`}
                        checked={selectedClipboardIds.has(u.partnerCode)}
                        onChange={(e) => onClipboardSelectionChange(u.partnerCode, e.target.checked)}
                      />
                    {u.partnerName} [{u.partnerCode}] · 전표 {u.slipNo}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

function SendSection({
  preview,
  confirmChecked,
  sendableCount,
  blockedCount,
  sendDisabled,
  sendPending,
  sendResult,
  sendErrorMessage,
  auditError,
  onConfirmChange,
  onSend,
}: {
  preview: DispatchSmsPreviewResponse | null
  confirmChecked: boolean
  sendableCount: number
  blockedCount: number
  sendDisabled: boolean
  sendPending: boolean
  sendResult: DispatchSmsSendResponse | null
  sendErrorMessage: string | null
  auditError: string | null
  onConfirmChange: (value: boolean) => void
  onSend: () => void
}) {
  return (
    <Card padding={5} shadow="sm">
      <h4 style={{ marginTop: 0 }}>Step 2. 실 발송</h4>
      <p style={mutedTextStyle}>
        실 발송은 비가역 작업입니다. 미리보기 결과를 확인하고 발송 확인 체크 후 진행하세요.
      </p>

      {!preview ? (
        <div style={emptyBoxStyle}>먼저 Step 1 미리보기를 실행하세요.</div>
      ) : (
        <>
          <label style={confirmLabelStyle(sendableCount === 0)}>
            <input
              data-testid="dispatch-sms-confirm-checkbox"
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => onConfirmChange(e.target.checked)}
              disabled={sendableCount === 0}
            />
            <strong>발송 확인</strong> — 미리보기 결과를 검토했고 실 발송에 동의합니다.
          </label>

          <div style={sendButtonRowStyle}>
            <Button
              data-testid="dispatch-sms-send-button"
              variant="warning"
              onClick={onSend}
              disabled={sendDisabled}
              loading={sendPending}
            >
              SMS 발송 ({sendableCount}건)
            </Button>
            <span style={noticeStyle}>미매핑·인수자 번호 보유 전표만 요청 · 발송금지 자동 제외: {blockedCount}건</span>
          </div>
        </>
      )}

      {sendErrorMessage ? <div className="error-banner" role="alert" style={{ marginTop: 12 }}>{sendErrorMessage}</div> : null}
      {auditError ? (
        <div role="alert" data-testid="dispatch-sms-history-send-audit-error" style={auditErrorStyle}>
          {auditError}
        </div>
      ) : null}

      {sendResult ? (
        <div data-testid="dispatch-sms-result-stats" style={successBoxStyle}>
          <h5 style={{ margin: '0 0 8px', color: 'var(--state-success)' }}>
            발송 결과 ({sendResult.date})
          </h5>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>성공: <strong>{sendResult.sent}</strong>건</span>
            <span>실패: <strong>{sendResult.failed}</strong>건</span>
            <span>발송금지 제외: <strong>{sendResult.blocked}</strong>건</span>
          </div>
          {sendResult.details.length > 0 ? (
            <details open style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12 }}>발송 대상·결과 상세 ({sendResult.details.length}건)</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                {sendResult.details.map((d, i) => (
                  <li key={`${d.partnerCode}-${i}`}>
                    [{d.status}] {d.partnerCode} · {d.recipientPhone}{d.reason ? ` - ${d.reason}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 16,
  gap: 12,
  flexWrap: 'wrap',
}
const noticeStyle: React.CSSProperties = { fontSize: 12, color: 'var(--color-neutral-500)' }
const mutedTextStyle: React.CSSProperties = { fontSize: 12, color: 'var(--color-neutral-500)', marginTop: 0 }
const summaryTextStyle: React.CSSProperties = { fontSize: 13, marginTop: 0, marginBottom: 12 }
const copyToolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 12,
  padding: '8px 10px',
  background: 'var(--color-neutral-50)',
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 6,
}
const emptyBoxStyle: React.CSSProperties = {
  padding: 12,
  background: 'var(--color-neutral-50)',
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 6,
  fontSize: 13,
  color: 'var(--color-neutral-500)',
}
const roomSectionStyle: React.CSSProperties = {
  marginBottom: 12,
  padding: 16,
  background: 'var(--color-neutral-50)',
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 6,
}
const partnerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 6,
  gap: 8,
}
const partnerBoxStyle = (blocked: boolean): React.CSSProperties => ({
  padding: 10,
  borderRadius: 4,
  border: '1px solid var(--color-neutral-200)',
  marginBottom: 8,
  background: blocked ? 'var(--color-neutral-100)' : 'var(--surface-card)',
  opacity: blocked ? 0.7 : 1,
})
const textareaStyle = (blocked: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '8px 10px',
  borderRadius: 4,
  border: '1px solid var(--color-neutral-300)',
  fontSize: 13,
  fontFamily: 'inherit',
  resize: 'vertical',
  background: blocked ? 'var(--color-neutral-50)' : 'var(--surface-card)',
})
const warningBoxStyle: React.CSSProperties = {
  marginTop: 8,
  padding: 10,
  borderRadius: 6,
  background: 'var(--state-warning-bg)',
  border: '1px solid var(--color-warning)',
  fontSize: 12,
  color: 'var(--state-warning)',
}
const confirmLabelStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  cursor: disabled ? 'not-allowed' : 'pointer',
  marginBottom: 12,
})
const sendButtonRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 12,
  flexWrap: 'wrap',
}
const auditErrorStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 8,
  border: '1px solid var(--state-danger)',
  borderRadius: 4,
  background: 'var(--state-danger-bg)',
  color: 'var(--state-danger)',
  fontSize: 12,
}
const successBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 6,
  background: 'var(--state-success-bg)',
  border: '1px solid var(--state-success)',
  fontSize: 13,
}
