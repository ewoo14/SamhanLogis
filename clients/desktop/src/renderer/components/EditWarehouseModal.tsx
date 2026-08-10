/**
 * 창고 편집 모달 — admin/WarehousesPage 목록 row 에서 호출.
 *
 * <p>변경된 필드만 PATCH payload 에 포함 (null/undefined 필드는 backend 가 무시).
 * 권한: MASTER / MANAGER / DEVELOPER (backend @PreAuthorize 가드).
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormGrid, safeActorName } from '@samhan/design-system'
import {
  listWarehouseAuditLogs,
  revertAdminWarehouseRevision,
  updateAdminWarehouse,
  type AdminWarehouse,
  type UpdateAdminWarehousePayload,
  type WarehouseAuditLog,
} from '../api/adminApi'
import { WarehouseRealtimeClient } from '../realtime/WarehouseRealtimeClient'
import styles from './EditWarehouseModal.module.css'

interface Props {
  warehouse: AdminWarehouse | null
  onClose: () => void
  onSaved: () => void
}

const TYPE_OPTIONS: { value: AdminWarehouse['type']; label: string }[] = [
  { value: 'HEADQUARTERS', label: '본사' },
  { value: 'VEHICLE', label: '차량' },
  { value: 'CONSIGNMENT', label: '위탁' },
  { value: 'VIRTUAL', label: '가상' },
]

export function EditWarehouseModal({ warehouse, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AdminWarehouse['type']>('HEADQUARTERS')
  const [address, setAddress] = useState('')
  const [displayOrder, setDisplayOrder] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAudit, setShowAudit] = useState(false)
  const queryClient = useQueryClient()

  // 4b 후속 — 변경 이력 timeline. 패널을 펼친 시점에만 조회 (lazy fetch).
  const auditQuery = useQuery({
    queryKey: ['warehouse-audit-logs', warehouse?.id],
    queryFn: () => listWarehouseAuditLogs(warehouse!.id),
    enabled: !!warehouse && showAudit,
  })

  // 4b 후속 — audit timeline 실시간 SSE 구독. 다른 admin 이 PATCH / soft-delete 한 결과를
  // 30초 polling 없이 즉시 반영. 패널이 닫혀있거나 warehouse 가 없으면 구독 안 함.
  useEffect(() => {
    if (!warehouse || !showAudit) return
    const ctrl = WarehouseRealtimeClient.subscribe(warehouse.id, (ev) => {
      if (ev.event === 'inventory:edit') {
        void queryClient.invalidateQueries({
          queryKey: ['warehouse-audit-logs', warehouse.id],
        })
        // 다른 사용자의 PATCH 가 본 화면의 명시적 폼에 영향 — 목록 query 도 동기화
        void queryClient.invalidateQueries({ queryKey: ['admin', 'warehouses'] })
      }
    })
    return () => ctrl.abort()
  }, [warehouse, showAudit, queryClient])

  /** audit revert mutation — POST /inventory/warehouses/{id}/audit/revert/{revisionNo}. */
  const revertMutation = useMutation({
    mutationFn: (revisionNo: number) =>
      revertAdminWarehouseRevision(warehouse!.id, revisionNo),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['warehouse-audit-logs', warehouse?.id],
      })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'warehouses'] })
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      // 폼 필드도 갱신되어야 하므로 onSaved 호출 (parent 가 list 재조회 trigger).
      onSaved()
    },
  })

  useEffect(() => {
    if (warehouse) {
      setName(warehouse.name)
      setType(warehouse.type)
      setAddress(warehouse.address ?? '')
      setDisplayOrder(warehouse.displayOrder)
      setDescription(warehouse.description ?? '')
      setError(null)
    }
  }, [warehouse])

  if (!warehouse) return null

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload: UpdateAdminWarehousePayload = {}
      if (name !== warehouse.name) payload.name = name
      if (type !== warehouse.type) payload.type = type
      if (address !== (warehouse.address ?? '')) payload.address = address || null
      if (displayOrder !== warehouse.displayOrder) payload.displayOrder = displayOrder
      if (description !== (warehouse.description ?? ''))
        payload.description = description || null

      if (Object.keys(payload).length === 0) {
        onClose()
        return
      }

      await updateAdminWarehouse(warehouse.id, payload)
      onSaved()
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      setError(e?.response?.data?.message ?? e?.message ?? '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>
          창고 편집 <span style={{ color: '#6b7280', fontSize: 14 }}>· {warehouse.code}</span>
        </h3>
        <FormGrid columns={2} gap="12px">
          <label style={fieldStyle}>
            <span>창고명 *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span>분류</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AdminWarehouse['type'])}
              style={inputStyle}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span>표시 순서</span>
            <input
              type="number"
              min={0}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>
          <FormGrid.Full>
            <label style={fieldStyle}>
              <span>주소</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                maxLength={255}
                style={inputStyle}
              />
            </label>
          </FormGrid.Full>
          <FormGrid.Full>
            <label style={fieldStyle}>
              <span>설명</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </label>
          </FormGrid.Full>
        </FormGrid>
        {error ? (
          <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{error}</div>
        ) : null}

        {/* [4b 후속] 변경 이력 timeline — 접힘/펼침 토글. 펼친 시점에 GET 호출. */}
        <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowAudit((v) => !v)}
            data-testid="edit-warehouse-audit-toggle"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#2563eb',
              cursor: 'pointer',
              fontSize: 13,
              padding: 0,
            }}
          >
            {showAudit ? '▾ 변경 이력 접기' : '▸ 변경 이력 보기'}
          </button>

          {showAudit ? (
            <div
              data-testid="edit-warehouse-audit-panel"
              style={{
                marginTop: 8,
                maxHeight: 200,
                overflow: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: 4,
                padding: 8,
                fontSize: 12,
                background: '#f9fafb',
              }}
            >
              {auditQuery.isLoading ? (
                <div style={{ color: '#6b7280' }}>이력 조회 중…</div>
              ) : auditQuery.isError ? (
                <div style={{ color: '#dc2626' }}>이력을 불러올 수 없습니다.</div>
              ) : (auditQuery.data ?? []).length === 0 ? (
                <div style={{ color: '#6b7280' }}>아직 기록된 변경 이력이 없습니다.</div>
              ) : (
                <AuditTimeline
                  rows={auditQuery.data!}
                  onRevert={(rev) => revertMutation.mutate(rev)}
                  revertingRevision={
                    revertMutation.isPending
                      ? (revertMutation.variables ?? null)
                      : null
                  }
                />
              )}
              {revertMutation.isError ? (
                <div
                  style={{ color: '#dc2626', marginTop: 8 }}
                  data-testid="edit-warehouse-audit-revert-error"
                >
                  되돌리기 실패: {extractAxiosMsg(revertMutation.error)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={actionsStyle}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={btnGhostStyle}
            data-testid="edit-warehouse-cancel"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={btnPrimaryStyle}
            data-testid="edit-warehouse-save"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 13,
}

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 8px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: 13,
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 20,
}

const btnGhostStyle: CSSProperties = {
  padding: '8px 14px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
}

const btnPrimaryStyle: CSSProperties = {
  padding: '8px 14px',
  border: 'none',
  borderRadius: 4,
  background: '#2563eb',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
}

/** 필드명 → 한국어 라벨 (audit 표시용). */
const FIELD_LABEL: Record<string, string> = {
  name: '창고명',
  type: '분류',
  address: '주소',
  displayOrder: '표시 순서',
  description: '설명',
  isDeleted: '비활성화',
}

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

/** actorName 이 없거나 UUID 로 오염된 과거 값이면 사용자에게 식별자를 표시하지 않는다. */
function displayWarehouseActor(actorId: string, actorName: string | null): string {
  if (actorId === SYSTEM_ACTOR_ID) return '시스템'
  return safeActorName(actorName) ?? '변경자 미상'
}

interface AuditTimelineProps {
  rows: WarehouseAuditLog[]
  onRevert: (revisionNo: number) => void
  revertingRevision: number | null
}

/** 변경 이력 timeline — revision 별 그룹 + 필드별 row + 되돌리기 버튼. */
function AuditTimeline({ rows, onRevert, revertingRevision }: AuditTimelineProps) {
  // backend 가 이미 revisionNo desc + changedAt desc 로 정렬해서 반환.
  // 같은 revisionNo 의 여러 row 를 그룹화해 같은 헤더 아래 표시.
  const grouped = new Map<number, WarehouseAuditLog[]>()
  for (const r of rows) {
    const list = grouped.get(r.revisionNo) ?? []
    list.push(r)
    grouped.set(r.revisionNo, list)
  }
  const sortedRevisions = Array.from(grouped.keys()).sort((a, b) => b - a)
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {sortedRevisions.map((rev) => {
        const group = grouped.get(rev)!
        const head = group[0]!
        const actorDisplay = displayWarehouseActor(head.actorId, head.actorName)
        // isDeleted revert 는 미지원 — group 내 isDeleted 필드만 있는 경우 버튼 숨김
        const revertable = group.some((r) => r.fieldName && r.fieldName !== 'isDeleted')
        const isReverting = revertingRevision === rev
        return (
          <li
            key={rev}
            data-testid={`edit-warehouse-audit-revision-${rev}`}
            style={{
              borderBottom: '1px dashed #e5e7eb',
              paddingBottom: 6,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <div style={{ color: '#374151', fontWeight: 600 }}>
                #{rev} · {actorDisplay}{' '}
                <span style={{ color: '#9ca3af', fontWeight: 400 }}>
                  {fmtChangedAt(head.changedAt)}
                </span>
              </div>
              {revertable ? (
                <button
                  type="button"
                  onClick={() => onRevert(rev)}
                  disabled={isReverting}
                  data-testid={`edit-warehouse-audit-revert-${rev}`}
                  style={{
                    padding: '2px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: 3,
                    background: '#fff',
                    color: '#4b5563',
                    cursor: isReverting ? 'wait' : 'pointer',
                    fontSize: 11,
                  }}
                  title="이 revision 의 변경을 되돌립니다 (신규 audit row 로 기록)"
                >
                  {isReverting ? '되돌리는 중…' : '되돌리기'}
                </button>
              ) : null}
            </div>
            {group.map((r) => (
              <div
                key={r.id}
                style={{ marginLeft: 8, color: '#4b5563', marginBottom: 2 }}
              >
                <strong>{FIELD_LABEL[r.fieldName ?? ''] ?? r.fieldName}</strong>
                {': '}
                <span style={{ color: '#9ca3af', textDecoration: 'line-through' }}>
                  {r.oldValue ?? '—'}
                </span>
                {' → '}
                <span style={{ color: '#111827' }}>{r.newValue ?? '—'}</span>
              </div>
            ))}
          </li>
        )
      })}
    </ul>
  )
}

/** axios 에러 메시지 추출 — backend 의 message field 우선, 없으면 fallback. */
function extractAxiosMsg(err: unknown): string {
  const e = err as {
    response?: { data?: { message?: string } }
    message?: string
  }
  return e?.response?.data?.message ?? e?.message ?? '알 수 없는 오류'
}

function fmtChangedAt(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
