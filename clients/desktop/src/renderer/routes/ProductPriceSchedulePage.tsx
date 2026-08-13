/**
 * 제품 카테고리별 단가변동 관리 — `/products/price-schedule`.
 *
 * `products.price-schedule` 권한과 productCatalogApi 의 기존 admin API만 사용한다.
 * 종합견적서 전역 가격 설정(`sales.estimate-config`)과는 별도 저장 경로다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@samhan/design-system'
import {
  type PriceChangeScheduleAdminItem,
  type PriceChangeScheduleCategory,
  type UpdatePriceChangeScheduleRequest,
  getPriceChangeScheduleAdmin,
  updatePriceChangeSchedule,
} from '../api/productCatalogApi'
import { usePermissions } from '../hooks/usePermissions'
import { usePageTitleStore } from '../stores/pageTitle'
import styles from '../components/sales/sales.module.css'

/** 카테고리 한국어 라벨 — BE `PriceChangeSchedule.CATEGORY_KEYS` 순서와 동일. */
const PRICE_SCHEDULE_CATEGORY_LABELS: Record<PriceChangeScheduleCategory, string> = {
  homemulti: '홈멀티',
  singleSets: '싱글',
  commercialMulti: '상업멀티',
  oldProducts: '구형',
}

/**
 * 단가변동 토글 표시 대상 카테고리. 구형은 토글을 제공하지만 현재가 baseline을
 * 사용하므로 전환 자체는 금액 no-op 이다.
 */
const PRICE_SCHEDULE_TOGGLE_CATEGORIES = new Set<PriceChangeScheduleCategory>([
  'homemulti',
  'singleSets',
  'commercialMulti',
  'oldProducts',
])

type PriceScheduleDirtyMap = Partial<Record<PriceChangeScheduleCategory, UpdatePriceChangeScheduleRequest>>

export function ProductPriceSchedulePage() {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const { canAccess } = usePermissions()
  const canViewPriceSchedule = canAccess('products.price-schedule')
  const canEditPriceSchedule = canAccess('products.price-schedule', 'update')
  const queryClient = useQueryClient()
  const [priceScheduleDirty, setPriceScheduleDirty] = useState<PriceScheduleDirtyMap>({})
  const [priceScheduleError, setPriceScheduleError] = useState('')

  useEffect(() => {
    setPageTitle({ title: '카테고리별 단가변동', meta: '제품' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

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
      // stale-flash 가드 — dirty 클리어 직후 refetch 전까지 저장 응답값을 즉시 반영한다.
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

  if (!canViewPriceSchedule) return null

  return (
    <div style={{ color: 'var(--ink-primary)', background: 'var(--surface-card)' }}>
      <div className={styles['wrap']}>
        <Card
          as="section"
          variant="outlined"
          padding={4}
          style={{ display: 'grid', gap: 12 }}
          aria-label="카테고리별 단가변동"
        >
          <h1 className={styles['title']} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            카테고리별 단가변동
            <span className={styles['badge']}>견적 인상 전/후 단가</span>
          </h1>

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
      </div>
    </div>
  )
}
