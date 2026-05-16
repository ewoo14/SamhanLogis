/**
 * arologis 미배차 리스트 admin 화면 — `/dispatches/unassigned` (Phase 10 PR-E1 FE-3).
 *
 * <p>BE: services/arologis-service/.../ArologisAdminController#unassigned
 *       (commit e5dc20f). legacy GAS 7번 (slip × dispatch left join 시뮬레이션) 이식.
 *
 * <p>화면 흐름:
 * <ul>
 *   <li>date 단일 일자 필터 (기본=오늘) → {@code GET /admin/arologis/dispatches/unassigned}</li>
 *   <li>표 — slipNo / partnerCode / partnerName / address + "수동 배차로 이동" 액션</li>
 *   <li>"수동 배차로 이동" 클릭 → /dispatches/manual?date&slipNo&partnerCode&partnerName&address
 *       — 수동 배차 폼이 query param 으로 첫 정차를 자동 채움</li>
 *   <li>"CSV 다운로드" 버튼 — Blob URL 기반 client-side 생성 (BE export endpoint 부재)</li>
 * </ul>
 *
 * <p>UUID 비공개 (feedback_uuid_no_user_visibility.md):
 * 사용자 노출 식별자 = slipNo / partnerCode / partnerName / address 만. dispatch /
 * slip UUID 는 응답에 포함되지 않으며 화면에도 노출 안 함.
 *
 * <p>ROLE 가드 — RoleGuard ARO_UNASSIGNED_ROLES (MASTER/MANAGER/DISPATCH).
 * 풀네임 의무 (feedback_role_naming_full.md).
 *
 * <p>data-testid (slice 명세):
 * <ul>
 *   <li>{@code arologis-unassigned-date} — 일자 input</li>
 *   <li>{@code arologis-unassigned-table} — 표 wrapper</li>
 *   <li>{@code arologis-unassigned-row-{slipNo}} — 각 행</li>
 *   <li>{@code arologis-unassigned-manual-dispatch-{slipNo}} — 행별 액션 버튼</li>
 * </ul>
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Tabs } from '@samhan/design-system'
import {
  getUnassigned,
  type UnassignedEntry,
  type UnassignedResponse,
} from '../../api/arologisDispatch'
import {
  getLatestDispatchHistory,
  saveDispatchHistory,
  type DispatchSaveHistoryDetailResponse,
} from '../../api/dispatchSaveHistoryApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { HistoryTab, formatDateTime } from './HistoryTab'
import { RestoredBanner } from './RestoredBanner'
import { SaveDialog } from './SaveDialog'

/** 오늘 날짜 (YYYY-MM-DD) — 기본 필터값. */
function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * CSV 한 셀 escape — 콤마/따옴표/개행 포함 시 RFC 4180 따라 감싸기.
 */
function csvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * UnassignedEntry[] → CSV 문자열. 헤더 1행 + 데이터 N행.
 *
 * <p>Excel 한글 호환을 위해 UTF-8 BOM 을 prefix 한다.
 */
function entriesToCsv(entries: UnassignedEntry[]): string {
  const header = ['전표번호', '거래처코드', '거래처명', '주소'].join(',')
  const rows = entries.map((e) =>
    [csvCell(e.slipNo), csvCell(e.partnerCode), csvCell(e.partnerName), csvCell(e.address)].join(','),
  )
  return '﻿' + [header, ...rows].join('\r\n')
}

export function ArologisUnassignedPage() {
  usePageTitle('미배차 리스트')
  const navigate = useNavigate()

  const [date, setDate] = useState<string>(todayIso())
  const [activeTab, setActiveTab] = useState(0)
  const [restoredData, setRestoredData] = useState<UnassignedResponse | null>(null)
  const [restoreBanner, setRestoreBanner] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const lastAutoSaveKeyRef = useRef<string | null>(null)

  const query = useQuery({
    queryKey: ['arologis-unassigned', date],
    queryFn: () => getUnassigned(date),
    enabled: !!date,
    // PR-H4c FE-B: 30초 polling — 멀티 워크스테이션 동기화 안전망
    refetchInterval: 30_000,
  })

  const displayData = restoredData ?? query.data
  const entries: UnassignedEntry[] = displayData?.entries ?? []

  useEffect(() => {
    let cancelled = false
    void getLatestDispatchHistory('UNASSIGNED')
      .then((detail) => {
        if (cancelled || !detail) return
        setRestoredData(detail.responsePayload as UnassignedResponse)
        setRestoreBanner(`이전 결과 복원됨 · ${formatDateTime(detail.createdAt)}`)
      })
      .catch(() => {
        // latest 없음/조회 실패는 첫 방문 UX 를 막지 않는다.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setRestoredData(null)
    setRestoreBanner(null)
  }, [date])

  useEffect(() => {
    if (!query.data) return
    const autoSaveKey = `${query.data.date}|${query.data.unassignedCount}|${query.data.totalOutbound}`
    if (lastAutoSaveKeyRef.current === autoSaveKey) return
    lastAutoSaveKeyRef.current = autoSaveKey
    void saveDispatchHistory({
      programType: 'UNASSIGNED',
      saveMode: 'AUTO_LATEST',
      requestParams: {
        date: query.data.date,
        rowCount: query.data.unassignedCount,
        totalOutbound: query.data.totalOutbound,
      },
      responsePayload: query.data,
    }).catch(() => {
      // 자동 저장 실패는 조회 UX 를 막지 않는다.
    })
  }, [query.data])

  const saveManualMutation = useMutation({
    mutationFn: (topic: string) => {
      if (!displayData) throw new Error('저장할 미배차 결과가 없습니다.')
      return saveDispatchHistory({
        programType: 'UNASSIGNED',
        saveMode: 'MANUAL_NAMED',
        topic,
        requestParams: {
          date: displayData.date,
          rowCount: displayData.unassignedCount,
          totalOutbound: displayData.totalOutbound,
        },
        responsePayload: displayData,
      })
    },
    onSuccess: () => {
      setSaveDialogOpen(false)
      setActiveTab(1)
    },
  })

  const handleRestore = useCallback((detail: DispatchSaveHistoryDetailResponse) => {
    setRestoredData(detail.responsePayload as UnassignedResponse)
    setActiveTab(0)
    setRestoreBanner(`복원: ${formatDateTime(detail.createdAt)} ${detail.createdBy} '${detail.topic}'`)
  }, [])

  const handleManualDispatch = (entry: UnassignedEntry) => {
    // /dispatches/manual 이 useSearchParams 로 자동 채움 (FE-3 추가 hook 은 manual page 측 책임).
    // 본 페이지는 query param 으로 신뢰 가능한 자동 채움 데이터를 전달한다.
    const params = new URLSearchParams()
    params.set('date', date)
    params.set('slipNo', entry.slipNo)
    if (entry.partnerCode) params.set('partnerCode', entry.partnerCode)
    if (entry.partnerName) params.set('partnerName', entry.partnerName)
    if (entry.address) params.set('address', entry.address)
    navigate(`/dispatches/manual?${params.toString()}`)
  }

  const handleCsvDownload = () => {
    if (entries.length === 0) {
      alert('내려받을 미배차 전표가 없습니다.')
      return
    }
    const csv = entriesToCsv(entries)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `arologis-unassigned-${date}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 표 placeholder 메시지 분기.
  const emptyMessage = useMemo(() => {
    if (query.isLoading) return '불러오는 중…'
    if (query.isError) return '미배차 리스트를 불러오지 못했습니다.'
    return '해당 일자의 미배차 출고전표가 없습니다.'
  }, [query.isLoading, query.isError])

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h3 style={{ margin: 0 }}>미배차 리스트</h3>
          {/* PR-H4c FE-B: 실시간 자동 갱신 안내 (30s polling) */}
          <span
            data-testid="arologis-unassigned-realtime-indicator"
            style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
          >
            실시간 자동 갱신 · 30초
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
              조회 일자
            </span>
            <input
              type="date"
              data-testid="arologis-unassigned-date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--color-neutral-300)',
                fontSize: 13,
              }}
            />
          </label>
          <Button
            variant="secondary"
            onClick={handleCsvDownload}
            disabled={entries.length === 0 || query.isLoading}
          >
            CSV 다운로드
          </Button>
        </div>
      </div>

      {/* 요약 banner — 사용자가 일자별 분포를 즉시 확인. */}
      <Tabs
        tabs={[
          { label: '실행', testId: 'unassigned-history-tab-run' },
          { label: '저장내역', testId: 'unassigned-history-tab-list' },
        ]}
        activeIndex={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="미배차 저장내역 탭"
      >
        <div>
          {restoreBanner ? (
            <RestoredBanner
              message={restoreBanner}
              testIdPrefix="unassigned-history"
              onClose={() => setRestoreBanner(null)}
            />
          ) : null}

      {displayData ? (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 6,
            background: 'var(--color-neutral-50)',
            border: '1px solid var(--color-neutral-200)',
            fontSize: 13,
            color: 'var(--color-neutral-700)',
          }}
        >
          기준 일자 <strong>{displayData.date}</strong> · 출고전표{' '}
          <strong>{displayData.totalOutbound}</strong>건 중 미배차{' '}
          <strong>{displayData.unassignedCount}</strong>건
          <Button
            variant="primary"
            size="sm"
            data-testid="unassigned-history-save-button"
            onClick={() => setSaveDialogOpen(true)}
            disabled={entries.length === 0}
            style={{ marginLeft: 16 }}
          >
            내역으로 저장
          </Button>
        </div>
      ) : null}

      <div
        data-testid="arologis-unassigned-table"
        style={{
          border: '1px solid var(--color-neutral-200)',
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--surface-card)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
          }}
        >
          <thead style={{ background: 'var(--color-neutral-50)' }}>
            <tr>
              <th style={thStyle}>전표번호</th>
              <th style={thStyle}>거래처코드</th>
              <th style={thStyle}>거래처명</th>
              <th style={thStyle}>주소</th>
              <th style={{ ...thStyle, width: 160, textAlign: 'right' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: '24px 12px',
                    textAlign: 'center',
                    color: 'var(--color-neutral-500)',
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr
                  key={entry.slipNo}
                  data-testid={`arologis-unassigned-row-${entry.slipNo}`}
                  style={{ borderTop: '1px solid var(--color-neutral-200)' }}
                >
                  <td style={tdStyle}>{entry.slipNo}</td>
                  <td style={tdStyle}>{entry.partnerCode ?? '—'}</td>
                  <td style={tdStyle}>{entry.partnerName ?? '—'}</td>
                  <td style={tdStyle}>{entry.address ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      data-testid={`arologis-unassigned-manual-dispatch-${entry.slipNo}`}
                      onClick={() => handleManualDispatch(entry)}
                    >
                      수동 배차로 이동
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {query.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          미배차 리스트를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : null}
        </div>
        <HistoryTab
          programType="UNASSIGNED"
          testIdPrefix="unassigned-history"
          rowCountLabel="미배차 건수"
          onRestore={handleRestore}
        />
      </Tabs>
      <SaveDialog
        open={saveDialogOpen}
        isSaving={saveManualMutation.isPending}
        testIdPrefix="unassigned-history"
        title="미배차 결과 저장"
        onClose={() => setSaveDialogOpen(false)}
        onSave={(topic) => saveManualMutation.mutate(topic)}
      />
    </>
  )
}

const thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-neutral-700)',
  borderBottom: '1px solid var(--color-neutral-200)',
} as const

const tdStyle = {
  padding: '10px 12px',
  verticalAlign: 'top',
  color: 'var(--color-neutral-800)',
} as const
