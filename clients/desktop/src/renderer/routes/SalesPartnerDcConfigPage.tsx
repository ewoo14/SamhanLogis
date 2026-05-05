/**
 * 거래처 DC율 설정 — `/sales/partner-dc-config` (v2 §정정 14 신규).
 *
 * <h2>기능</h2>
 * <ul>
 *   <li>거래처 검색 (partnerCode / 거래처명 부분 매칭).</li>
 *   <li>DC 컬럼 11개 인라인 수정 (홈멀티DC/상업멀티DC/유연호스I형/360/4way/1way/스탠드/디럭스/1등급/단위처리/특이사항).</li>
 *   <li>저장 — 변경된 행만 PATCH (단건 단위).</li>
 *   <li>csv 시드 222 row (`거래처별 DC리스트 *.csv`) 표시.</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — 사용자 노출 식별자는 partnerCode + companyName 만.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PARTNER_DC_CONFIG_COLUMNS,
  type PartnerDcConfig,
  listPartnerDcConfigs,
  updatePartnerDcConfig,
} from '../api/sales'
import { usePageTitleStore } from '../stores/pageTitle'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import styles from '../components/sales/sales.module.css'

type DirtyMap = Record<string, Partial<PartnerDcConfig>>

export function SalesPartnerDcConfigPage() {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const [keyword, setKeyword] = useState('')
  const [committedKeyword, setCommittedKeyword] = useState('')
  const [dirty, setDirty] = useState<DirtyMap>({})
  const queryClient = useQueryClient()

  useEffect(() => {
    setPageTitle({ title: '거래처 DC율 설정', meta: '판매' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  const query = useQuery({
    queryKey: ['partner-dc-configs', committedKeyword],
    queryFn: () => listPartnerDcConfigs(0, 250, committedKeyword || undefined),
    retry: 1,
  })

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
    },
  })

  const items = useMemo(() => query.data?.content ?? [], [query.data])

  function handleCellChange(
    code: string,
    key: keyof PartnerDcConfig,
    value: string,
  ) {
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

  return (
    <div className={styles['salesScope']}>
      <SalesSubNav />
      <div className={styles['wrap']}>
        <div className={styles['top']}>
          <div className={styles['title']}>
            거래처 DC율 설정
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
                  <th>저장</th>
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
                          disabled={!rowDirty || saveMutation.isPending}
                          style={{
                            background: rowDirty ? '#059669' : '#11182710',
                            color: rowDirty ? '#fff' : '#9ca3af',
                          }}
                        >
                          {saveMutation.isPending && saveMutation.variables?.code === row.partnerCode
                            ? '저장 중…'
                            : '저장'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
