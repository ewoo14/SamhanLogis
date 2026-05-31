import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { WarehouseAutocomplete } from './WarehouseAutocomplete'
import type { Warehouse } from './WarehouseAutocomplete'

/** 시연용 창고 목록 — 4-tier (HEADQUARTERS / VEHICLE / CONSIGNMENT / VIRTUAL) 샘플. */
const SAMPLE_WAREHOUSES: Warehouse[] = [
  {
    id: 'wh-hq-001',
    code: 'HQ-001',
    name: '본사창고',
    type: 'HEADQUARTERS',
    active: true,
  },
  {
    id: 'wh-vh-001',
    code: 'VH-001',
    name: '1호차 재고',
    type: 'VEHICLE',
    active: true,
  },
  {
    id: 'wh-cs-001',
    code: 'CS-001',
    name: '거래처위탁A',
    type: 'CONSIGNMENT',
    active: true,
  },
  {
    id: 'wh-vt-001',
    code: 'VT-001',
    name: '가상창고(서비스인보이스)',
    type: 'VIRTUAL',
    active: true,
  },
  {
    id: 'wh-hq-002',
    code: 'HQ-002',
    name: '구 본사창고(폐쇄)',
    type: 'HEADQUARTERS',
    active: false,
  },
]

const meta: Meta<typeof WarehouseAutocomplete> = {
  title: 'Components/WarehouseAutocomplete',
  component: WarehouseAutocomplete,
  args: {
    warehouses: SAMPLE_WAREHOUSES,
    value: null,
  },
}
export default meta

type Story = StoryObj<typeof WarehouseAutocomplete>

/** 기본 상태 — 클릭/포커스 시 전체 창고 후보 dropdown 표시. */
export const Default: Story = {
  render: () => {
    const [selected, setSelected] = useState<string | null>(null)
    return (
      <div style={{ width: 360, padding: 16 }}>
        <WarehouseAutocomplete
          warehouses={SAMPLE_WAREHOUSES}
          value={selected}
          onChange={(id) => setSelected(id || null)}
          label="창고 선택"
          placeholder="창고 코드 또는 이름 입력…"
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
          선택된 창고 ID: {selected ?? '(없음)'}
        </div>
      </div>
    )
  },
}

/** 검색 입력 시나리오 — "HQ" 입력 → 코드 prefix 매칭 후보 표시. */
export const SearchInput: Story = {
  render: () => {
    const [selected, setSelected] = useState<string | null>(null)
    return (
      <div style={{ width: 360, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          입력창에 "HQ" 또는 "본사" 를 입력해 보세요.
        </p>
        <WarehouseAutocomplete
          warehouses={SAMPLE_WAREHOUSES}
          value={selected}
          onChange={(id, wh) => {
            setSelected(id || null)
            console.log('selected warehouse:', wh)
          }}
          label="출고 창고"
          placeholder="창고 코드 또는 이름 입력…"
        />
      </div>
    )
  },
}

/** hideVirtual=true — VIRTUAL 창고 제외. 출고/이동 화면에서 사용. */
export const HideVirtual: Story = {
  render: () => {
    const [selected, setSelected] = useState<string | null>(null)
    return (
      <div style={{ width: 360, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          VIRTUAL 창고 (VT-001) 가 목록에서 제외됩니다.
        </p>
        <WarehouseAutocomplete
          warehouses={SAMPLE_WAREHOUSES}
          value={selected}
          onChange={(id) => setSelected(id || null)}
          label="출고 창고"
          placeholder="창고 코드 또는 이름 입력…"
          hideVirtual
        />
      </div>
    )
  },
}

/** required + error — 창고 미선택 오류 상태. */
export const RequiredWithError: Story = {
  render: () => {
    const [selected, setSelected] = useState<string | null>(null)
    return (
      <div style={{ width: 360, padding: 16 }}>
        <WarehouseAutocomplete
          warehouses={SAMPLE_WAREHOUSES}
          value={selected}
          onChange={(id) => setSelected(id || null)}
          label="출고 창고"
          placeholder="창고를 선택하세요"
          hideVirtual
          required
          error="출고 창고를 선택하세요."
        />
      </div>
    )
  },
}

/** disabled — 전환 진행 중 잠금 상태. */
export const Disabled: Story = {
  render: () => (
    <div style={{ width: 360, padding: 16 }}>
      <WarehouseAutocomplete
        warehouses={SAMPLE_WAREHOUSES}
        value="wh-hq-001"
        onChange={() => {}}
        label="출고 창고"
        placeholder="창고 코드 또는 이름 입력…"
        disabled
      />
    </div>
  ),
}
