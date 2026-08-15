/**
 * 종합견적서 전역 가격 설정 — `/sales/estimate-config`.
 *
 * <p>거래처 무관 전역 파라미터만 편집한다. 거래처별 DC는 기존
 * `SalesPartnerDcConfigPage` 가 담당한다.
 */
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type EstimateConfig,
  getEstimateConfig,
  updateEstimateConfig,
} from '../api/sales'
import { usePermissions } from '../hooks/usePermissions'
import { usePageTitleStore } from '../stores/pageTitle'
import styles from '../components/sales/sales.module.css'
import { SINGLE_PANEL_OPTIONS } from '../utils/bundleOptionDomain'
import { EditableAmountInput } from '../components/common/EditableAmountInput'

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
    <div style={{ color: 'var(--ink-primary)', background: 'var(--surface-card)' }}>
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
                      <EditableAmountInput
                        label="할인"
                        value={form.singleDiscount}
                        onValueChange={(value) => setField('singleDiscount', value)}
                        enableAmountKeyboardStep
                      />
                      <EditableAmountInput
                        label="1WAY할인"
                        value={form.singleOneWayDiscount}
                        onValueChange={(value) => setField('singleOneWayDiscount', value)}
                        enableAmountKeyboardStep
                      />
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

      </div>
    </div>
  )
}
