/**
 * 배차안내문자 표시·편집·복사 admin UI — `/arologis/dispatch-sms`.
 *
 * <p>미리보기 결과는 AUTO_LATEST 로 자동 저장하고, 운영자 명시 저장은 MANUAL_NAMED로 남긴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, CopyButton, Input, Tabs } from '@samhan/design-system'
import axios from 'axios'
import {
  previewDispatchBatch,
  type DispatchDriverContactInput,
  type DispatchSmsPreviewResponse,
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
import {
  buildDispatchSmsClipboardText,
  getDispatchSmsRowKey,
  type DispatchSmsClipboardRow,
} from './dispatchSmsClipboard'

export type EditedMessages = Record<string, string>
type DriverContactDraft = DispatchDriverContactInput
type PreviewHistoryPayload =
  | DispatchSmsPreviewResponse
  | {
      preview: DispatchSmsPreviewResponse
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
      result[getDispatchSmsRowKey(p)] = p.groupMessage ?? p.message
    }
  }
  for (const p of preview.unmapped) {
    result[getDispatchSmsRowKey(p)] = p.groupMessage ?? p.message
  }
  return result
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

export function DispatchSmsPage() {
  usePageTitle('배차안내문자')
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canBatch = canAccess('notification.dispatch-sms.display', 'create')

  const [date, setDate] = useState<string>(todayIso())
  const [driverContacts, setDriverContacts] = useState<DriverContactDraft[]>([])
  const [preview, setPreview] = useState<DispatchSmsPreviewResponse | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [edited, setEdited] = useState<EditedMessages>({})
  const [activeTab, setActiveTab] = useState(0)
  const [restoreBanner, setRestoreBanner] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [latestRestoreSettled, setLatestRestoreSettled] = useState(false)
  const [selectedClipboardIds, setSelectedClipboardIds] = useState<Set<string>>(new Set())
  const lastAutoSaveKeyRef = useRef<string | null>(null)
  const skipNextAutoSaveRef = useRef(false)

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
    try {
      const result = await previewDispatchBatch(date, driverContacts)
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

  const clipboardRows = useMemo<DispatchSmsClipboardRow[]>(() => {
    if (!preview) return []
    return [
      ...preview.chatRooms.flatMap((room) => room.partners.map((p) => ({
        id: getDispatchSmsRowKey(p),
        partnerName: p.partnerName,
        slipNo: p.slipNo,
        message: edited[getDispatchSmsRowKey(p)] ?? p.groupMessage ?? p.message,
        chatRoomName: room.chatRoomName,
      }))),
      ...preview.unmapped.map((p) => ({
        id: getDispatchSmsRowKey(p),
        partnerName: p.partnerName,
        slipNo: p.slipNo,
        message: edited[getDispatchSmsRowKey(p)] ?? p.groupMessage ?? p.message,
        chatRoomName: '',
      })),
    ]
  }, [edited, preview])

  const clipboardText = useMemo(
    () => buildDispatchSmsClipboardText(clipboardRows, selectedClipboardIds),
    [clipboardRows, selectedClipboardIds],
  )

  const handleRestore = useCallback((detail: DispatchSmsSaveHistoryDetailResponse) => {
    const restored = readPreviewHistoryPayload(detail.responsePayload)
    setPreview(restored.preview)
    setEdited(restored.edited ?? buildInitialEdited(restored.preview))
    setSelectedClipboardIds(new Set())
    setDate(restored.preview.date)
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
            driverContacts={driverContacts}
            onDriverContactsChange={setDriverContacts}
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
            onMessageChange={(rowKey, message) => {
              setEdited((prev) => ({ ...prev, [rowKey]: message }))
            }}
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
         <h3 style={{ margin: 0 }}>배차안내문자</h3>
        <span data-testid="dispatch-sms-realtime-notice" style={noticeStyle}>
           미리보기 저장내역 + 선택 복사
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
  driverContacts,
  onDriverContactsChange,
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
  driverContacts: DriverContactDraft[]
  onDriverContactsChange: (rows: DriverContactDraft[]) => void
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
  onMessageChange: (rowKey: string, message: string) => void
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

      <fieldset style={{ marginTop: 12, padding: 12, border: '1px solid var(--color-neutral-200)', borderRadius: 6 }}>
        <legend style={{ padding: '0 6px', fontSize: 13 }}>배송기사내역 입력</legend>
        <p style={mutedTextStyle}>레거시 입력 경로와 같이 전표번호(업체명)·배송기사 연락처를 입력합니다. 공란은 기존 오류 문구로 표시됩니다.</p>
        {driverContacts.map((row, index) => (
          <div key={`${row.slipNo}-${index}`} className="form-row" style={{ alignItems: 'flex-end', marginBottom: 8 }}>
            <Input label="업체명/전표번호" value={row.companyName || row.slipNo} onChange={(e) => {
              const next = [...driverContacts]; next[index] = { ...row, slipNo: e.target.value, companyName: e.target.value }; onDriverContactsChange(next)
            }} />
            <Input label="배송기사 연락처" value={row.driverPhone} onChange={(e) => {
              const next = [...driverContacts]; next[index] = { ...row, driverPhone: e.target.value }; onDriverContactsChange(next)
            }} />
            <Button variant="ghost" onClick={() => onDriverContactsChange(driverContacts.filter((_, i) => i !== index))}>삭제</Button>
          </div>
        ))}
        <Button variant="ghost" data-testid="dispatch-sms-add-driver-contact" onClick={() => onDriverContactsChange([
          ...driverContacts,
          { slipNo: '', companyName: '', driverPhone: '', date },
        ])}>기사 연락처 행 추가</Button>
      </fieldset>

      {previewError ? <div className="error-banner" role="alert" style={{ marginTop: 12 }}>{previewError}</div> : null}

      {preview ? (
        <div style={{ marginTop: 16 }}>
          <p style={summaryTextStyle}>
            배차일: <strong>{preview.date}</strong> · 출고전표 <strong>{preview.totalSlips}</strong>건 ·
            단톡방 매핑 <strong>{preview.mappedSlips}</strong>건 · 미매핑 <strong>{preview.unmappedSlips}</strong>건
          </p>

          <div style={copyToolbarStyle}>
            <span style={noticeStyle}>선택한 배차 대상만 복사 · 거래처명 / 전표번호 / 코멘트 / 단톡방</span>
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
                <div key={getDispatchSmsRowKey(p)} style={partnerBoxStyle(p.blocked)}>
                  <div style={partnerHeaderStyle}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        aria-label={`${p.partnerName} 배차 대상 선택`}
                        checked={selectedClipboardIds.has(getDispatchSmsRowKey(p))}
                        onChange={(e) => onClipboardSelectionChange(getDispatchSmsRowKey(p), e.target.checked)}
                      />
                      <span>
                      <strong>{p.partnerName}</strong>{' '}
                      <span style={noticeStyle}>[{p.partnerCode}] · 전표 {p.slipNo}</span>
                      </span>
                    </label>
                    {p.blocked ? (
                      <Badge data-testid={`dispatch-sms-blocked-badge-${getDispatchSmsRowKey(p)}`} variant="danger">
                        발송금지
                      </Badge>
                    ) : null}
                  </div>

                    <textarea
                        data-testid={`dispatch-sms-message-${getDispatchSmsRowKey(p)}`}
                        value={edited[getDispatchSmsRowKey(p)] ?? p.groupMessage ?? p.message}
                    onChange={(e) => onMessageChange(getDispatchSmsRowKey(p), e.target.value)}
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
               <strong>단톡방 미매핑 전표 {preview.unmapped.length}건</strong> — 인수자 번호와 관계없이 안내 문구를 확인·편집·복사할 수 있습니다.
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {preview.unmapped.map((u) => {
                  const unmappedId = getDispatchSmsRowKey(u)
                  return (
                    <li key={unmappedId} style={{ marginBottom: 10 }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          aria-label={`${u.partnerName} 배차 대상 선택`}
                          checked={selectedClipboardIds.has(unmappedId)}
                          onChange={(e) => onClipboardSelectionChange(unmappedId, e.target.checked)}
                        />
                        {u.partnerName} [미매핑] · 전표 {u.slipNo}
                      </label>
                      <textarea
                        data-testid={`dispatch-sms-unmapped-message-${unmappedId}`}
                        aria-label={`${u.partnerName} 미매핑 안내 문구`}
                        value={edited[unmappedId] ?? u.groupMessage ?? u.message}
                        onChange={(e) => onMessageChange(unmappedId, e.target.value)}
                        rows={4}
                        style={textareaStyle(false)}
                      />
                    </li>
                  )
                })}
              </ul>
            </div>
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
