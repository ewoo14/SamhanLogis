/**
 * 거래처 DC 설정 — `/sales/partner-dc-config` (v2 §정정 14 신규).
 *
 * <h2>기능</h2>
 * <ul>
 *   <li>거래처 검색 (partnerCode / 거래처명 부분 매칭).</li>
 *   <li>DC 컬럼 11개 인라인 수정 (홈멀티DC/상업멀티DC/유연호스I형/360/4way/1way/스탠드/디럭스/1등급/단위처리/특이사항).</li>
 *   <li>저장 — 변경된 행만 PATCH (단건 단위).</li>
 *   <li>기존 운영 CSV (`거래처 DC정보`) 기준 데이터 표시.</li>
 *   <li>CSV 일괄 업로드 (PR-D Phase B FE-C, MASTER 전용) — DB 이관용 CSV 를
 *       {@code POST /api/v1/dc-config/admin/import} 로 일괄 upsert.</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — 사용자 노출 식별자는 partnerCode + companyName 만.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AuditOverlay, CsvUploadDialog } from '@samhan/design-system'
import {
  PARTNER_DC_CONFIG_COLUMNS,
  type PartnerDcConfig,
  listPartnerDcConfigs,
  updatePartnerDcConfig,
} from '../api/sales'
import { importDcConfigCsv } from '../api/dcConfigImportApi'
import { dcConfigAuditApi } from '../api/createAuditApi'
import { DcConfigRealtimeClient } from '../realtime/DcConfigRealtimeClient'
import {
  AuditInfoBanner,
  AuditRevisionBadge,
  groupAuditLogsByField,
} from '../components/audit/AuditOverlaySection'
import {
  AuditVersionHistory,
  classifyAuditHistoryError,
  isAuditHistoryEndpointUnavailable,
} from '../components/audit/AuditVersionHistory'
import { usePageTitleStore } from '../stores/pageTitle'
import { usePermissions } from '../hooks/usePermissions'
import styles from '../components/sales/sales.module.css'

type DirtyMap = Record<string, Partial<PartnerDcConfig>>

export function SalesPartnerDcConfigPage() {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const [keyword, setKeyword] = useState('')
  const [committedKeyword, setCommittedKeyword] = useState('')
  const [dirty, setDirty] = useState<DirtyMap>({})
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  // PR-H4c: 선택 거래처 audit panel.
  const [selectedPartnerCode, setSelectedPartnerCode] = useState<string | null>(null)
  const [auditHistoryOpen, setAuditHistoryOpen] = useState(false)
  const [auditEndpointUnavailableFor, setAuditEndpointUnavailableFor] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  // [C5-2b] import CTA는 dc-config.import CREATE page-code/action 기준.
  // BE @RequirePermission(page="dc-config.import", action=CREATE) — DcConfigImportController.
  const canImportCsv = canAccess('dc-config.import', 'create')
  const canEditDcConfig = canAccess('sales.partner-dc-config', 'update')

  useEffect(() => {
    setPageTitle({ title: '거래처 DC 설정', meta: '영업' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  const query = useQuery({
    queryKey: ['partner-dc-configs', committedKeyword],
    queryFn: () => listPartnerDcConfigs(0, 250, committedKeyword || undefined),
    retry: 1,
  })

  // PR-H4c: 선택 거래처 audit log + SSE.
  const auditQuery = useQuery({
    queryKey: ['partner-dc-config', selectedPartnerCode, 'audit-logs'],
    queryFn: () =>
      dcConfigAuditApi.listAuditLogs(selectedPartnerCode!),
    enabled:
      !!selectedPartnerCode
      && auditHistoryOpen
      && auditEndpointUnavailableFor !== selectedPartnerCode,
    retry: false,
    staleTime: Infinity,
  })
  const auditErrorKind = auditQuery.isError
    ? classifyAuditHistoryError(auditQuery.error)
    : undefined

  useEffect(() => {
    if (!selectedPartnerCode
      || !auditQuery.isError
      || !isAuditHistoryEndpointUnavailable(auditQuery.error)) return
    setAuditEndpointUnavailableFor((current) =>
      current === selectedPartnerCode ? current : selectedPartnerCode,
    )
  }, [selectedPartnerCode, auditQuery.error, auditQuery.isError])

  useEffect(() => {
    if (!selectedPartnerCode) return
    const ctrl = DcConfigRealtimeClient.subscribe(selectedPartnerCode, (evt) => {
      void queryClient.invalidateQueries({ queryKey: ['partner-dc-configs'] })
      if (evt.event === 'dc-config:edit' || evt.event === 'message') {
        void queryClient.invalidateQueries({
          queryKey: ['partner-dc-config', selectedPartnerCode, 'audit-logs'],
        })
      }
    })
    return () => ctrl.abort()
  }, [selectedPartnerCode, queryClient])

  const saveMutation = useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: Partial<PartnerDcConfig> }) =>
      updatePartnerDcConfig(code, patch),
    onSuccess: (_data, vars) => {
      // dirty 에서 해당 partnerCode 제거.
      setDirty((d) => {
        const { [vars.code]: _omit, ...rest } = d
        return rest
      })
      void queryClient.invalidateQueries({ queryKey: ['partner-dc-configs'] })
      void queryClient.invalidateQueries({ queryKey: ['partner-dc-config'] })
    },
  })

  const items = useMemo(() => query.data?.content ?? [], [query.data])

  function handleCellChange(
    code: string,
    key: keyof PartnerDcConfig,
    value: string,
  ) {
    if (!canEditDcConfig) return
    setDirty((d) => ({
      ...d,
      [code]: { ...d[code], [key]: value || null },
    }))
  }

  function getCellValue(row: PartnerDcConfig, key: keyof PartnerDcConfig): string {
    const dirtyRow = dirty[row.partnerCode]
    if (dirtyRow && key in dirtyRow) {
      const v = dirtyRow[key]
      return v == null ? '' : String(v)
    }
    const v = row[key]
    return v == null ? '' : String(v)
  }

  function isCellDirty(code: string, key: keyof PartnerDcConfig): boolean {
    return dirty[code] !== undefined && key in dirty[code]!
  }

  function handleSaveRow(row: PartnerDcConfig) {
    const patch = dirty[row.partnerCode]
    if (!patch) return
    saveMutation.mutate({ code: row.partnerCode, patch })
  }

  function handleSearch() {
    setCommittedKeyword(keyword.trim())
  }

  const dirtyCount = Object.keys(dirty).length

  const selectedRow = useMemo(
    () => items.find((r) => r.partnerCode === selectedPartnerCode) ?? null,
    [items, selectedPartnerCode],
  )

  return (
    <div style={{ color: 'var(--ink-primary)', background: 'var(--surface-card)' }}>
      <div className={styles['wrap']}>
        {/* PR-H4c FE-A: DC 설정 변경은 거래처 단위 SSE + audit log 기록 */}
        <AuditInfoBanner
          message="DC 셀 변경은 BE audit log 에 자동 기록됩니다. 거래처 row 의 [이력] 버튼으로 변경 이력을 확인할 수 있습니다."
          testId="partner-dc-config-audit-info-banner"
        />
        {!canEditDcConfig ? (
          <p
            style={{
              margin: '8px 0 0',
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--color-warning-800, #8C5C13)',
              background: 'var(--color-warning-50, #fffbeb)',
              border: '1px solid var(--color-warning-200, #fde68a)',
              borderRadius: 4,
            }}
          >
            현재 권한은 조회 전용입니다. DC 수정 권한이 있는 계정에서 변경할 수 있습니다.
          </p>
        ) : null}
        <div className={styles['top']}>
          <div className={styles['title']}>
            거래처 DC 설정
            <span className={styles['badge']}>전체 {query.data?.totalElements ?? 0}건</span>
            {dirtyCount > 0 ? (
              <span
                className={styles['badge']}
                style={{ background: '#fef3c7', color: '#92400e' }}
              >
                미저장 {dirtyCount}건
              </span>
            ) : null}
          </div>
          <div className={styles['topActions']}>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch()
              }}
              placeholder="거래처명 또는 사업자번호로 검색…"
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 13,
                background: '#fff',
                width: 280,
              }}
              aria-label="거래처 DC 검색"
            />
            <button
              type="button"
              className={styles['btnMini']}
              onClick={handleSearch}
            >
              검색
            </button>
            {canImportCsv ? (
              <button
                type="button"
                className={styles['btnMini']}
                onClick={() => setImportDialogOpen(true)}
                data-testid="admin-dcconfig-import-button"
                style={{
                  background: '#1d4ed8',
                  color: '#fff',
                  borderColor: '#1d4ed8',
                }}
                title="기존 CSV 일괄 업로드 (MASTER 전용)"
              >
                CSV 일괄 업로드
              </button>
            ) : null}
          </div>
        </div>

        {query.isLoading ? (
          <div className={styles['emptyState']}>거래처 DC 목록을 불러오는 중…</div>
        ) : query.isError ? (
          <div className={styles['emptyState']}>
            <h3>partner-service 가 응답하지 않습니다</h3>
            <p>backend M5 partner_dc_config endpoint 가 미배포 상태일 수 있습니다.</p>
            <p style={{ fontSize: 11 }}>endpoint: GET /api/v1/partner-dc-configs</p>
          </div>
        ) : items.length === 0 ? (
          <div className={styles['emptyState']}>
            <h3>해당 조건의 거래처가 없습니다</h3>
          </div>
        ) : (
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
            <table
              className={styles['listTable']}
              style={{ minWidth: 1500 }}
            >
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: '#f9fafb', zIndex: 2 }}>
                    거래처 코드
                  </th>
                  <th style={{ position: 'sticky', left: 110, background: '#f9fafb', zIndex: 2 }}>
                    업체명
                  </th>
                  {PARTNER_DC_CONFIG_COLUMNS.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                  <th>{canEditDcConfig ? '저장' : '권한'}</th>
                  <th>이력</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const rowDirty = dirty[row.partnerCode] !== undefined
                  return (
                    <tr key={row.partnerCode}>
                      <td
                        style={{
                          position: 'sticky',
                          left: 0,
                          background: rowDirty ? '#fffbeb' : '#fff',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {row.partnerCode}
                      </td>
                      <td
                        style={{
                          position: 'sticky',
                          left: 110,
                          background: rowDirty ? '#fffbeb' : '#fff',
                        }}
                      >
                        {row.companyName}
                      </td>
                      {PARTNER_DC_CONFIG_COLUMNS.map((c) => {
                        const dirtyCell = isCellDirty(row.partnerCode, c.key)
                        return (
                          <td key={c.key}>
                            <input
                              type="text"
                              className={`${styles['dcInput']!} ${dirtyCell ? styles['dirty']! : ''}`}
                              value={getCellValue(row, c.key)}
                              onChange={(e) =>
                                handleCellChange(row.partnerCode, c.key, e.target.value)
                              }
                              disabled={!canEditDcConfig}
                              placeholder={c.placeholder}
                              aria-label={`${row.companyName} ${c.label}`}
                            />
                          </td>
                        )
                      })}
                      <td>
                        <button
                          type="button"
                          className={styles['btnMini']}
                          onClick={() => handleSaveRow(row)}
                          disabled={!canEditDcConfig || !rowDirty || saveMutation.isPending}
                          title={canEditDcConfig ? undefined : 'DC 설정 수정 권한 필요'}
                          style={{
                            background: rowDirty ? '#059669' : '#11182710',
                            color: rowDirty ? '#fff' : '#9ca3af',
                          }}
                        >
                          {!canEditDcConfig
                            ? '조회 전용'
                            : saveMutation.isPending && saveMutation.variables?.code === row.partnerCode
                              ? '저장 중…'
                              : '저장'}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles['btnMini']}
                          onClick={() => setSelectedPartnerCode(row.partnerCode)}
                          data-testid={`partner-dc-config-audit-button-${row.partnerCode}`}
                        >
                          보기
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {canImportCsv ? (
          <div data-testid="admin-dcconfig-import-dialog">
            <CsvUploadDialog
              open={importDialogOpen}
              onClose={() => setImportDialogOpen(false)}
              title="거래처 DC 정보 CSV 일괄 업로드"
              description="기존 운영 CSV 파일을 업로드합니다. 거래처코드 컬럼이 있어 자동으로 매핑됩니다."
              onUpload={async (file) => {
                const result = await importDcConfigCsv(file)
                // 업로드 성공 시 거래처 DC 목록 refetch.
                void queryClient.invalidateQueries({ queryKey: ['partner-dc-configs'] })
                return result
              }}
            />
          </div>
        ) : null}

        {/* PR-H4c FE-A: 선택 거래처 DC audit panel — 모든 변경 필드 overlay */}
        {selectedRow ? (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              background: '#fff',
            }}
            data-testid="partner-dc-config-audit-panel"
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <h4 style={{ margin: 0 }}>
                {selectedRow.companyName} ({selectedRow.partnerCode}) — DC 변경 이력
              </h4>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <AuditRevisionBadge
                  logs={Array.isArray(auditQuery.data) ? auditQuery.data : []}
                  isError={auditQuery.isError}
                  isFetched={auditQuery.isFetched}
                  isLoading={auditQuery.isLoading}
                  testIdPrefix="partner-dc-config-audit"
                />
                <AuditVersionHistory
                  logs={Array.isArray(auditQuery.data) ? auditQuery.data : []}
                  isLoading={auditQuery.isLoading}
                  isError={auditQuery.isError}
                  isFetched={auditQuery.isFetched}
                  error={auditQuery.error}
                  open={auditHistoryOpen}
                  onOpenChange={setAuditHistoryOpen}
                  testIdPrefix="partner-dc-config-audit"
                />
                <button
                  type="button"
                  className={styles['btnMini']}
                  onClick={() => setSelectedPartnerCode(null)}
                >
                  닫기
                </button>
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
              }}
            >
              {PARTNER_DC_CONFIG_COLUMNS.map((c) => {
                const history =
                  groupAuditLogsByField(Array.isArray(auditQuery.data) ? auditQuery.data : [])[c.key as string] ?? []
                if (history.length === 0) return null
                const cur = selectedRow[c.key]
                return (
                  <div
                    key={c.key as string}
                    data-testid={`partner-dc-config-audit-overlay-${String(c.key)}`}
                  >
                    <strong style={{ fontSize: 12 }}>{c.label}</strong>:{' '}
                    <AuditOverlay
                      field={String(c.key)}
                      currentValue={cur == null ? null : String(cur)}
                      history={history}
                      isError={auditQuery.isError}
                      isFetched={auditQuery.isFetched}
                      isLoading={auditQuery.isLoading}
                    />
                  </div>
                )
              })}
              {auditQuery.isError ? (
                <p style={{ margin: 0, fontSize: 12, color: '#b91c1c', gridColumn: '1 / -1' }}>
                  {auditErrorKind === 'not-supported'
                    ? '변경 이력 조회 기능이 아직 제공되지 않습니다.'
                    : auditErrorKind === 'forbidden'
                      ? '변경 이력을 조회할 권한이 없습니다.'
                      : '변경 이력을 불러오지 못했습니다.'}
                </p>
              ) : auditQuery.isLoading ? (
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280', gridColumn: '1 / -1' }}>
                  변경 이력을 불러오는 중입니다.
                </p>
              ) : !auditQuery.isFetched ? (
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280', gridColumn: '1 / -1' }}>
                  변경 이력 미조회
                </p>
              ) : (Array.isArray(auditQuery.data) ? auditQuery.data : []).length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280', gridColumn: '1 / -1' }}>
                  변경 이력이 없습니다.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
