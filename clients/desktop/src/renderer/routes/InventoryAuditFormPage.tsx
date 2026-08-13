/**
 * 재고 실사 신규 등록 (`/warehouse/audit/new`).
 *
 * Phase 10 P2-6 슬라이스 9. BE `POST /inventory/audits` (PLANNED + snapshot 라인) backing.
 *
 * 입력: 창고 + 실사 일자. 등록 성공 시 상세 화면으로 이동 (snapshot 라인 자동 생성됨).
 *
 * <h2>PR-H4c FE-B 보강</h2>
 * <ul>
 *   <li>신규 등록 form — entity 가 아직 없어 audit overlay/SSE 미적용 (저장 후 detail 화면에서 활성).</li>
 *   <li>저장 성공 시 `/warehouse/audit/{id}` 로 이동 → InventoryAuditDetailPage 가
 *       SSE + audit-overlay 자동 활성.</li>
 *   <li>안내 텍스트에 "등록 후 상세 화면에서 변경 이력이 자동 추적됩니다" 명시.</li>
 * </ul>
 *
 * data-testid:
 * - audit-form-warehouse-select
 * - audit-form-date-input
 * - audit-form-submit
 */
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Button, Card, FormField } from '@samhan/design-system'
import { createAudit } from '../api/auditApi'
import { listWarehouses, type Warehouse } from '../api/inventory'
import { usePageTitle } from '../hooks/usePageTitle'

/** 오늘 YYYY-MM-DD ISO. */
function todayIso(): string {
  const d = new Date()
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function InventoryAuditFormPage() {
  usePageTitle('재고 실사', '신규')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [warehouseId, setWarehouseId] = useState('')
  const [auditDate, setAuditDate] = useState(todayIso())

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const mutation = useMutation({
    mutationFn: () => createAudit({ warehouseId, auditDate }),
    onSuccess: (audit) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'audits'] })
      navigate(`/warehouse/audit/${audit.id}`, { replace: true })
    },
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending) return
    if (!warehouseId || !auditDate) return
    mutation.mutate()
  }

  const errorMessage = (() => {
    if (!mutation.isError) return null
    const err = mutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '실사 등록에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  return (
    <Card>
      <h3 style={{ margin: '0 0 16px' }}>신규 재고 실사</h3>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}
      >
        <FormField
          label="대상 창고"
          required
          render={({ id }) => (
            <select
              id={id}
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              data-testid="audit-form-warehouse-select"
              style={inputStyle}
            >
              <option value="">선택...</option>
              {(Array.isArray(warehousesQuery.data) ? warehousesQuery.data : [])
                .filter((w: Warehouse) => w.type !== 'VIRTUAL')
                .map((w: Warehouse) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
            </select>
          )}
        />
        <FormField
          label="실사 일자"
          required
          render={({ id }) => (
            <input
              id={id}
              type="date"
              value={auditDate}
              onChange={(e) => setAuditDate(e.target.value)}
              data-testid="audit-form-date-input"
              style={inputStyle}
            />
          )}
        />
        {errorMessage ? (
          <div className="error-banner" role="alert">
            {errorMessage}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button
            variant="ghost"
            onClick={() => navigate('/warehouse/audit')}
          >
            취소
          </Button>
          <Button
            type="submit"
            variant="primary"
            data-testid="audit-form-submit"
            loading={mutation.isPending}
            disabled={!warehouseId || !auditDate}
          >
            실사 등록
          </Button>
        </div>
      </form>
      <p style={{ marginTop: 16, color: '#6B7280', fontSize: 12 }}>
        등록 시 해당 창고의 모든 활성 재고를 snapshot 라인으로 자동 생성합니다
        (PLANNED 상태). 이후 상세 화면에서 [시작] → 라인 입력 → [완료] 순으로
        진행합니다.
        <br />
        <span data-testid="audit-form-realtime-notice">
          등록 후 상세 화면에서 변경 이력 (수정 횟수 / overlay) 이 자동 추적됩니다 (PR-H4c).
        </span>
      </p>
    </Card>
  )
}

const inputStyle: React.CSSProperties = {
  height: 36,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 14,
  width: '100%',
}
