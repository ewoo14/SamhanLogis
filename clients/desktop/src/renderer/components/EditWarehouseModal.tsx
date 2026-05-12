/**
 * 창고 편집 모달 — admin/WarehousesPage 목록 row 에서 호출.
 *
 * <p>변경된 필드만 PATCH payload 에 포함 (null/undefined 필드는 backend 가 무시).
 * 권한: MASTER / MANAGER / DEVELOPER (backend @PreAuthorize 가드).
 */
import { useEffect, useState, type CSSProperties } from 'react'
import {
  updateAdminWarehouse,
  type AdminWarehouse,
  type UpdateAdminWarehousePayload,
} from '../api/adminApi'

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
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-modal="true">
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>
          창고 편집 <span style={{ color: '#6b7280', fontSize: 14 }}>· {warehouse.code}</span>
        </h3>
        <div style={formGridStyle}>
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
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <span>주소</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={255}
              style={inputStyle}
            />
          </label>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <span>설명</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </label>
        </div>
        {error ? (
          <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{error}</div>
        ) : null}
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

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const dialogStyle: CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  padding: 24,
  width: 'min(560px, 90vw)',
  maxHeight: '90vh',
  overflow: 'auto',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
}

const formGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
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
