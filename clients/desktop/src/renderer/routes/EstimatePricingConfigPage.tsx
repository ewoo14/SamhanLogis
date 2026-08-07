/**
 * 종합견적서 전역 가격 설정 — `/sales/estimate-config`.
 *
 * <p>거래처 무관 전역 파라미터만 편집한다. 거래처별 DC는 기존
 * `SalesPartnerDcConfigPage` 가 담당한다.
 */
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@samhan/design-system'
import {
  type EstimateConfig,
  getEstimateConfig,
  updateEstimateConfig,
} from '../api/sales'
import {
  type PriceChangeScheduleAdminItem,
  type PriceChangeScheduleCategory,
  type UpdatePriceChangeScheduleRequest,
  getPriceChangeScheduleAdmin,
  updatePriceChangeSchedule,
} from '../api/productCatalogApi'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import { usePermissions } from '../hooks/usePermissions'
import { usePageTitleStore } from '../stores/pageTitle'
import styles from '../components/sales/sales.module.css'
import { SINGLE_PANEL_OPTIONS } from '../utils/bundleOptionDomain'

/** 카테고리 한국어 라벨 — BE `PriceChangeSchedule.CATEGORY_KEYS` 순서와 동일. */
const PRICE_SCHEDULE_CATEGORY_LABELS: Record<PriceChangeScheduleCategory, string> = {
  homemulti: '홈멀티',
  singleSets: '싱글',
  commercialMulti: '상업멀티',
  oldProducts: '구형',
}

/**
 * "인상 전 단가" 토글 표시 대상 카테고리 — estimate-app 에 대응 체크박스가 있는 3종만.
 * oldProducts 는 estimate-app 체크박스가 없어 적용일만 편집한다.
 */
const PRICE_SCHEDULE_TOGGLE_CATEGORIES = new Set<PriceChangeScheduleCategory>([
  'homemulti',
  'singleSets',
  'commercialMulti',
])

type PriceScheduleDirtyMap = Partial<Record<PriceChangeScheduleCategory, UpdatePriceChangeScheduleRequest>>

type FormState = Record<keyof EstimateConfig, string>

const RATE_FIELDS: Array<{ key: keyof EstimateConfig; label: string; help: string }> = [
  { key: 'commonHomeDiscountRate', label: '홈멀티 공통 DC율', help: '기본 0.45' },
  { key: 'commonCommercialDiscountRate', label: '상업멀티 공통 DC율', help: '기본 0.45' },
  { key: 'oldProductDiscountRate', label: '구형 제품 DC율', help: '기본 0.5' },
  { key: 'vatRate', label: '부가세율', help: '기본 0.1' },
  { key: 'cardFeeRate', label: '카드수수료율', help: '기본 0.03' },
  { key: 'advanceDiscountRate', label: '선금할인율', help: '기본 0' },
  { key: 'comboWarnRate', label: '조합비 경고 임계율', help: '0이면 off' },
]

const HOME_PANEL_OPTIONS = ['', '판넬제외', '공청판넬', '인피니트 25년형', '인피니트 공청+동작감지 AI']
const SINGLE_REMOTE_OPTIONS = ['', '유선리모컨', '컬러유선리모컨']
const SINGLE_PANEL_SHAPE_OPTIONS = ['원형', '사각']
const SINGLE_MATERIAL_OPTIONS = ['포함', '별도']

function toForm(config: EstimateConfig): FormState {
  return {
    commonHomeDiscountRate: String(config.commonHomeDiscountRate ?? 0),
    commonCommercialDiscountRate: String(config.commonCommercialDiscountRate ?? 0),
    oldProductDiscountRate: String(config.oldProductDiscountRate ?? 0),
    vatRate: String(config.vatRate ?? 0),
    cardFeeRate: String(config.cardFeeRate ?? 0),
    advanceDiscountRate: String(config.advanceDiscountRate ?? 0),
    comboWarnRate: String(config.comboWarnRate ?? 0),
    homeNoHose: String(config.homeNoHose ?? false),
    homeNoBranch: String(config.homeNoBranch ?? false),
    homeWithFoot: String(config.homeWithFoot ?? false),
    homeDefaultPanel: config.homeDefaultPanel ?? '',
    singleDefaultWiredRemote: config.singleDefaultWiredRemote ?? '',
    singleNoRemote: String(config.singleNoRemote ?? false),
    singleWithBase: String(config.singleWithBase ?? false),
    singleDefaultPanel: config.singleDefaultPanel ?? '',
    singlePanelShape: config.singlePanelShape ?? '원형',
    singleDiscount: String(config.singleDiscount ?? 0),
    singleOneWayDiscount: String(config.singleOneWayDiscount ?? 0),
    singleMaterialInclusion: config.singleMaterialInclusion ?? '별도',
    footerNotice: config.footerNotice ?? '',
  }
}

function toRequest(form: FormState): EstimateConfig {
  const numberValue = (key: keyof EstimateConfig) => {
    const parsed = Number(form[key])
    return Number.isFinite(parsed) ? parsed : 0
  }
  const booleanValue = (key: keyof EstimateConfig) => form[key] === 'true'
  return {
    commonHomeDiscountRate: numberValue('commonHomeDiscountRate'),
    commonCommercialDiscountRate: numberValue('commonCommercialDiscountRate'),
    oldProductDiscountRate: numberValue('oldProductDiscountRate'),
    vatRate: numberValue('vatRate'),
    cardFeeRate: numberValue('cardFeeRate'),
    advanceDiscountRate: numberValue('advanceDiscountRate'),
    comboWarnRate: numberValue('comboWarnRate'),
    homeNoHose: booleanValue('homeNoHose'),
    homeNoBranch: booleanValue('homeNoBranch'),
    homeWithFoot: booleanValue('homeWithFoot'),
    homeDefaultPanel: form.homeDefaultPanel,
    singleDefaultWiredRemote: form.singleDefaultWiredRemote,
    singleNoRemote: booleanValue('singleNoRemote'),
    singleWithBase: booleanValue('singleWithBase'),
    singleDefaultPanel: form.singleDefaultPanel,
    singlePanelShape: form.singlePanelShape,
    singleDiscount: numberValue('singleDiscount'),
    singleOneWayDiscount: numberValue('singleOneWayDiscount'),
    singleMaterialInclusion: form.singleMaterialInclusion,
    footerNotice: form.footerNotice,
  }
}

export function EstimatePricingConfigPage() {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const { canAccess } = usePermissions()
  const canEdit = canAccess('sales.estimate-config', 'update')
  // H1(#17 S4b R1): ACCOUNTANT 는 sales.estimate-config 가 없다 — estimateConfig 폼(요율 +
  // 옵션 기본값)은 이 page-code VIEW 로 별도 게이팅해 products.price-schedule 만 보유한
  // 계정에게는 미표시한다(query 는 enabled, 렌더는 조건부).
  const canViewEstimateConfig = canAccess('sales.estimate-config')
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setPageTitle({ title: '견적 가격 설정', meta: '영업' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  const query = useQuery({
    queryKey: ['estimate-config'],
    queryFn: getEstimateConfig,
    enabled: canViewEstimateConfig,
    retry: 1,
  })

  useEffect(() => {
    if (query.data) setForm(toForm(query.data))
  }, [query.data])

  const saveMutation = useMutation({
    mutationFn: updateEstimateConfig,
    onSuccess: (data) => {
      setForm(toForm(data))
      setMessage('저장되었습니다.')
      void queryClient.invalidateQueries({ queryKey: ['estimate-config'] })
    },
    onError: () => setMessage('저장에 실패했습니다. 입력값과 권한을 확인하세요.'),
  })

  const isDirty = useMemo(() => {
    if (!form || !query.data) return false
    return JSON.stringify(form) !== JSON.stringify(toForm(query.data))
  }, [form, query.data])

  const setField = (key: keyof EstimateConfig, value: string) => {
    if (!canEdit) return
    setMessage('')
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const save = () => {
    if (!form || !canEdit) return
    saveMutation.mutate(toRequest(form))
  }

  // 카테고리별 단가변동(#17 S4b) — estimateConfig 폼과 데이터 소스·저장 경로가 분리된
  // 자립 섹션. BE 가 다르므로(admin price-change-schedule endpoint) 위 폼 submit 과 엮지 않는다.
  const canViewPriceSchedule = canAccess('products.price-schedule')
  const canEditPriceSchedule = canAccess('products.price-schedule', 'update')
  const [priceScheduleDirty, setPriceScheduleDirty] = useState<PriceScheduleDirtyMap>({})
  const [priceScheduleError, setPriceScheduleError] = useState('')

  const priceScheduleQuery = useQuery({
    queryKey: ['price-change-schedule-admin'],
    queryFn: getPriceChangeScheduleAdmin,
    enabled: canViewPriceSchedule,
    retry: 1,
  })

  const priceScheduleSaveMutation = useMutation({
    mutationFn: ({
      category,
      patch,
    }: {
      category: PriceChangeScheduleCategory
      patch: UpdatePriceChangeScheduleRequest
    }) => updatePriceChangeSchedule(category, patch),
    onSuccess: (data, vars) => {
      setPriceScheduleError('')
      setPriceScheduleDirty((prev) => {
        const { [vars.category]: _omit, ...rest } = prev
        return rest
      })
      // stale-flash 가드(FE-MED-1) — dirty 클리어 직후 invalidate 배경 refetch 가 끝나기
      // 전까지의 간극에 구값이 보이지 않도록, 캐시를 저장 응답값으로 즉시 반영한다
      // (형제 estimateConfig saveMutation L143-151 의 setForm(toForm(data)) 즉시반영 패턴 정합).
      queryClient.setQueryData<PriceChangeScheduleAdminItem[]>(
        ['price-change-schedule-admin'],
        (old) => old?.map((row) => (row.category === vars.category ? data : row)) ?? old,
      )
      void queryClient.invalidateQueries({ queryKey: ['price-change-schedule-admin'] })
    },
    onError: (_err, vars) => {
      const categoryLabel = PRICE_SCHEDULE_CATEGORY_LABELS[vars.category]
      setPriceScheduleError(`${categoryLabel} 저장에 실패했습니다. 입력값과 권한을 확인하세요.`)
    },
  })

  const priceScheduleRows = useMemo(
    () => priceScheduleQuery.data ?? [],
    [priceScheduleQuery.data],
  )

  function getScheduleEffectiveDate(row: PriceChangeScheduleAdminItem): string {
    const patch = priceScheduleDirty[row.category]
    return patch?.effectiveDate != null ? patch.effectiveDate : row.effectiveDate
  }

  function getScheduleDefaultPreChange(row: PriceChangeScheduleAdminItem): boolean {
    const patch = priceScheduleDirty[row.category]
    return patch?.defaultPreChange != null ? patch.defaultPreChange : row.defaultPreChange
  }

  function isScheduleRowDirty(category: PriceChangeScheduleCategory): boolean {
    return priceScheduleDirty[category] !== undefined
  }

  function handleScheduleDateChange(category: PriceChangeScheduleCategory, value: string) {
    if (!canEditPriceSchedule || !value) return
    setPriceScheduleError('')
    setPriceScheduleDirty((prev) => ({
      ...prev,
      [category]: { ...prev[category], effectiveDate: value },
    }))
  }

  function handleScheduleToggleChange(category: PriceChangeScheduleCategory, checked: boolean) {
    if (!canEditPriceSchedule) return
    setPriceScheduleError('')
    setPriceScheduleDirty((prev) => ({
      ...prev,
      [category]: { ...prev[category], defaultPreChange: checked },
    }))
  }

  function handleScheduleSaveRow(row: PriceChangeScheduleAdminItem) {
    const patch = priceScheduleDirty[row.category]
    if (!patch || !canEditPriceSchedule) return
    priceScheduleSaveMutation.mutate({ category: row.category, patch })
  }

  const inputStyle: CSSProperties = {
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 13,
  }
  const sectionStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(260px, 1fr))',
    gap: 12,
    maxWidth: 920,
  }
  const renderSelect = (key: keyof EstimateConfig, label: string, options: string[]) => (
    <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <select
        value={form?.[key] ?? ''}
        disabled={!canEdit}
        onChange={(e) => setField(key, e.target.value)}
        style={inputStyle}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option || '__empty'} value={option}>
            {option || '기본'}
          </option>
        ))}
      </select>
    </label>
  )
  const renderCheckbox = (key: keyof EstimateConfig, label: string) => (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 36,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      <input
        type="checkbox"
        checked={form?.[key] === 'true'}
        disabled={!canEdit}
        onChange={(e) => setField(key, String(e.target.checked))}
      />
      {label}
    </label>
  )
  const renderNumber = (key: keyof EstimateConfig, label: string) => (
    <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <input
        type="number"
        min="0"
        step="1"
        value={form?.[key] ?? '0'}
        disabled={!canEdit}
        onChange={(e) => setField(key, e.target.value)}
        style={inputStyle}
        aria-label={label}
      />
    </label>
  )

  return (
    <div className={styles['salesScope']}>
      <SalesSubNav />
      <div className={styles['wrap']}>
        {canViewEstimateConfig ? (
          <>
            <div className={styles['top']}>
              <div className={styles['title']}>
                견적 가격 설정
                <span className={styles['badge']}>전역</span>
                {isDirty ? (
                  <span className={styles['badge']} style={{ background: '#fef3c7', color: '#92400e' }}>
                    미저장
                  </span>
                ) : null}
              </div>
              <div className={styles['topActions']}>
                <button
                  type="button"
                  className={styles['btnMini']}
                  onClick={() => query.data && setForm(toForm(query.data))}
                  disabled={!form || !isDirty}
                >
                  되돌리기
                </button>
                <button
                  type="button"
                  className={styles['btnMini']}
                  onClick={save}
                  disabled={!canEdit || !form || !isDirty || saveMutation.isPending}
                  style={{
                    background: isDirty ? '#059669' : '#11182710',
                    color: isDirty ? '#fff' : '#9ca3af',
                  }}
                >
                  {saveMutation.isPending ? '저장 중...' : canEdit ? '저장' : '조회 전용'}
                </button>
              </div>
            </div>

            {!canEdit ? (
              <p style={{ margin: '8px 0', fontSize: 12, color: '#b45309' }}>
                현재 권한은 조회 전용입니다. MASTER 또는 MANAGER 권한에서 변경할 수 있습니다.
              </p>
            ) : null}

            {query.isError ? (
              <div className={styles['emptyState']}>
                <h3>견적 가격 설정을 불러오지 못했습니다</h3>
                <p style={{ fontSize: 11 }}>endpoint: GET /api/v1/estimate-config</p>
              </div>
            ) : query.isLoading || !form ? (
              <div className={styles['emptyState']}>설정을 불러오는 중...</div>
            ) : (
              <div style={{ display: 'grid', gap: 22 }}>
                <div className="mobile-form-grid" style={sectionStyle}>
                  {RATE_FIELDS.map((field) => (
                    <label key={field.key} style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                      <span style={{ fontWeight: 700 }}>{field.label}</span>
                      <input
                        type="number"
                        min="0"
                        max="0.9999"
                        step="0.0001"
                        value={form[field.key]}
                        disabled={!canEdit}
                        onChange={(e) => setField(field.key, e.target.value)}
                        style={inputStyle}
                        aria-label={field.label}
                      />
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{field.help}</span>
                    </label>
                  ))}
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, gridColumn: '1 / -1' }}>
                    <span style={{ fontWeight: 700 }}>견적서 하단 안내문구</span>
                    <textarea
                      value={form.footerNotice}
                      disabled={!canEdit}
                      onChange={(e) => setField('footerNotice', e.target.value)}
                      rows={5}
                      style={{
                        ...inputStyle,
                        resize: 'vertical',
                      }}
                      aria-label="견적서 하단 안내문구"
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 16 }}>옵션 기본값</h2>
                  <div className="mobile-form-grid" style={sectionStyle}>
                    <div style={{ display: 'grid', gap: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 14 }}>홈멀티</h3>
                      {renderCheckbox('homeNoHose', '유연호스 제외')}
                      {renderCheckbox('homeNoBranch', '분기관 제외')}
                      {renderCheckbox('homeWithFoot', '발통 포함')}
                      {renderSelect('homeDefaultPanel', '판넬변경', HOME_PANEL_OPTIONS)}
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 14 }}>싱글중대형</h3>
                      {renderSelect('singleDefaultWiredRemote', '유선리모컨', SINGLE_REMOTE_OPTIONS)}
                      {renderCheckbox('singleNoRemote', '리모컨 제외')}
                      {renderCheckbox('singleWithBase', '실외기 받침대 포함')}
                      {renderSelect('singleDefaultPanel', '판넬변경', SINGLE_PANEL_OPTIONS)}
                      {renderSelect('singlePanelShape', '360판넬', SINGLE_PANEL_SHAPE_OPTIONS)}
                      {renderNumber('singleDiscount', '할인')}
                      {renderNumber('singleOneWayDiscount', '1WAY할인')}
                      {renderSelect('singleMaterialInclusion', '자재 포함 여부', SINGLE_MATERIAL_OPTIONS)}
                    </div>
                  </div>
                </div>

                {message ? (
                  <p style={{ margin: 0, fontSize: 12, color: message.includes('실패') ? '#b91c1c' : '#047857' }}>
                    {message}
                  </p>
                ) : null}
              </div>
            )}
          </>
        ) : null}

        {/* 카테고리별 단가변동(#17 S4b) — 위 estimateConfig 폼과 분리된 자립 섹션(BE 다름). */}
        {canViewPriceSchedule ? (
          <Card
            as="section"
            variant="outlined"
            padding={4}
            style={{ marginTop: 24, display: 'grid', gap: 12 }}
            aria-label="카테고리별 단가변동"
          >
            {/* Design-MED — 페이지 타이틀(.title 20px/700)과 병렬시키지 않고 형제 "옵션 기본값"
                h2/16 위계에 맞춘다(F). */}
            <h2 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              카테고리별 단가변동
              <span className={styles['badge']}>견적 인상 전/후 단가</span>
            </h2>

            {!canEditPriceSchedule ? (
              <p style={{ margin: 0, fontSize: 12, color: '#b45309' }}>
                현재 권한은 조회 전용입니다. MASTER, MANAGER 또는 ACCOUNTANT 권한에서 변경할 수 있습니다.
              </p>
            ) : null}

            {priceScheduleQuery.isLoading ? (
              <div className={styles['emptyState']}>단가변동 스케줄을 불러오는 중...</div>
            ) : priceScheduleQuery.isError ? (
              <div className={styles['emptyState']}>
                <h3>단가변동 스케줄을 불러오지 못했습니다</h3>
                <p style={{ fontSize: 11 }}>
                  endpoint: GET /api/v1/products/admin/price-change-schedule
                </p>
              </div>
            ) : (
              <table className={styles['listTable']} style={{ maxWidth: 640 }}>
                <thead>
                  <tr>
                    <th>카테고리</th>
                    <th>적용일</th>
                    <th>인상 전 단가 기본값</th>
                    <th>{canEditPriceSchedule ? '저장' : '권한'}</th>
                  </tr>
                </thead>
                <tbody>
                  {priceScheduleRows.map((row) => {
                    const rowDirty = isScheduleRowDirty(row.category)
                    const hasToggle = PRICE_SCHEDULE_TOGGLE_CATEGORIES.has(row.category)
                    const categoryLabel = PRICE_SCHEDULE_CATEGORY_LABELS[row.category]
                    const isSavingRow =
                      priceScheduleSaveMutation.isPending
                      && priceScheduleSaveMutation.variables?.category === row.category
                    return (
                      <tr
                        key={row.category}
                        data-testid={`price-schedule-row-${row.category}`}
                        style={rowDirty ? { background: '#fffbeb' } : undefined}
                      >
                        <td style={{ fontWeight: 700 }}>{categoryLabel}</td>
                        <td>
                          <Input
                            type="date"
                            inputSize="sm"
                            value={getScheduleEffectiveDate(row)}
                            disabled={!canEditPriceSchedule}
                            onChange={(e) => handleScheduleDateChange(row.category, e.target.value)}
                            aria-label={`${categoryLabel} 적용일`}
                          />
                        </td>
                        <td>
                          {hasToggle ? (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input
                                type="checkbox"
                                data-testid={`price-schedule-toggle-${row.category}`}
                                checked={getScheduleDefaultPreChange(row)}
                                disabled={!canEditPriceSchedule}
                                onChange={(e) =>
                                  handleScheduleToggleChange(row.category, e.target.checked)
                                }
                              />
                              인상 전 단가 기본 적용
                            </label>
                          ) : (
                            <span style={{ color: 'var(--color-neutral-600, #4D5562)', fontSize: 12 }}>
                              대상 아님
                            </span>
                          )}
                        </td>
                        <td>
                          <Button
                            type="button"
                            size="sm"
                            data-testid={`price-schedule-save-${row.category}`}
                            variant={rowDirty ? 'primary' : 'secondary'}
                            loading={isSavingRow}
                            disabled={
                              !canEditPriceSchedule
                              || !rowDirty
                              || priceScheduleSaveMutation.isPending
                            }
                            onClick={() => handleScheduleSaveRow(row)}
                          >
                            저장
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {priceScheduleError ? (
              <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>{priceScheduleError}</p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </div>
  )
}
