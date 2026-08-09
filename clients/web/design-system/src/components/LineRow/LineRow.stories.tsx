import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { LineRow, type LineDraft } from './LineRow'
import { LineTableHeader } from './LineTableHeader'

const baseLine: LineDraft = {
  id: 'line-1',
  productId: '2e40fa30-10b2-3a9b-a99c-570ac92287ad',
  modelName: 'AJ040RXH4BC1',
  productName: '시스템에어컨 4Way 4HP',
  specification: '4HP', // Slice A 신규 (피드백 #4)
  quantity: '2',
  unitPrice: '1850000',
  lookupError: null,
  lookupLoading: false,
}

const noopHandlers = {
  onSelect: () => undefined,
  onModelNameChange: () => undefined,
  onModelNameBlur: () => undefined,
  onSpecificationChange: () => undefined,
  onQuantityChange: () => undefined,
  onUnitPriceChange: () => undefined,
  onDelete: () => undefined,
  dragHandleProps: {},
}

const meta: Meta<typeof LineRow> = {
  title: 'Sales-Form-Polish/LineRow',
  component: LineRow,
  args: {
    lineNumber: 1,
    line: baseLine,
    selected: false,
    isDragging: false,
    canDelete: true,
    ...noopHandlers,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 1024, padding: 24, background: 'var(--surface-app)' }}>
        <div
          style={{
            border: '1px solid var(--line-default)',
            borderRadius: 8,
            background: 'var(--surface-card)',
            overflow: 'hidden',
          }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'sales-form-polish 슬라이스 핵심 컴포넌트. 9-column grid, 5 states (default/hover/selected/dragging/error), 자동 라인 번호, 모델명 lookup spinner, 수량×단가 합계 자동 계산.',
      },
    },
  },
}
export default meta

type Story = StoryObj<typeof LineRow>

export const Default: Story = {}

export const Selected: Story = {
  args: { selected: true },
}

export const Loading: Story = {
  args: {
    line: { ...baseLine, lookupLoading: true, productName: '' },
  },
}

export const Error: Story = {
  args: {
    line: {
      ...baseLine,
      productId: null,
      productName: '',
      lookupError: '해당 모델명을 찾을 수 없습니다',
    },
  },
}

export const Empty: Story = {
  args: {
    line: {
      id: 'line-empty',
      productId: null,
      modelName: '',
      productName: '',
      specification: '',
      quantity: '1',
      unitPrice: '0',
      lookupError: null,
      lookupLoading: false,
    },
  },
}

/** 규격 입력 — Slice A 신규 컬럼 동작 확인 (피드백 #4). */
export const WithSpecification: Story = {
  args: {
    line: { ...baseLine, specification: '220V' },
  },
}

/** 규격 빈 값 — placeholder "예: 220V" 표시. */
export const EmptySpecification: Story = {
  args: {
    line: { ...baseLine, specification: '' },
  },
}

export const Dragging: Story = {
  args: { isDragging: true },
}

/**
 * #809 단가 출처 마커 — 거래처 최근단가(REMEMBERED) hit.
 * 강조행(priceRefreshChanged) + 칩 + 저장일 title. 칩 있는 행만 단가 input 22px(R4-D6 :has 조건부).
 */
export const PriceMemoryRemembered: Story = {
  args: {
    line: {
      ...baseLine,
      priceSource: 'REMEMBERED',
      priceMemoryUpdatedAt: '2026-07-10T09:00:00',
      priceRefreshChanged: true,
    },
    partnerSelected: true,
  },
}

/**
 * #809 단가 출처 마커 — 기억 miss 로 판매가(CATALOG) 폴백 (D-R4-1: '정가' 라벨 금지).
 * 거래처 선택 상태 → 설명 "이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다".
 */
export const PriceCatalogFallback: Story = {
  args: {
    line: { ...baseLine, priceSource: 'CATALOG' },
    partnerSelected: true,
  },
}

/**
 * #809 거래처 미선택 — CATALOG 설명이 거래처를 단정하지 않음("판매가를 적용했습니다", R4-D4a).
 * REMEMBERED 라인이라면 마커 자체가 해제된다(D-R4-4 — 단가값은 유지).
 */
export const PriceCatalogWithoutPartner: Story = {
  args: {
    line: { ...baseLine, priceSource: 'CATALOG' },
    partnerSelected: false,
  },
}

export const FullTable: Story = {
  render: () => {
    const Demo = () => {
      const [lines, setLines] = useState<LineDraft[]>([
        { ...baseLine, id: 'l1' },
        {
          id: 'l2',
          productId: 'p-mwr10',
          modelName: 'MWR-WE10N',
          productName: '유선 리모컨',
          specification: '220V',
          quantity: '2',
          unitPrice: '85000',
          lookupError: null,
          lookupLoading: false,
        },
        {
          id: 'l3',
          productId: 'p-pc1',
          modelName: 'PC1NWSK3NW',
          productName: 'WIFI판넬',
          specification: '',
          quantity: '1',
          unitPrice: '120000',
          lookupError: null,
          lookupLoading: false,
        },
      ])
      const [selected, setSelected] = useState<Set<string>>(new Set(['l3']))

      const allSelected = selected.size === lines.length && lines.length > 0
      const someSelected = selected.size > 0 && selected.size < lines.length

      return (
        <div>
          <LineTableHeader
            allSelected={allSelected}
            someSelected={someSelected}
            onToggleAll={(checked) => {
              if (checked) setSelected(new Set(lines.map((l) => l.id)))
              else setSelected(new Set())
            }}
          />
          {lines.map((line, idx) => (
            <LineRow
              key={line.id}
              lineNumber={idx + 1}
              line={line}
              selected={selected.has(line.id)}
              onSelect={(s) => {
                const next = new Set(selected)
                if (s) next.add(line.id)
                else next.delete(line.id)
                setSelected(next)
              }}
              onModelNameChange={(v) =>
                setLines((ls) =>
                  ls.map((l, i) => (i === idx ? { ...l, modelName: v } : l)),
                )
              }
              onModelNameBlur={() => undefined}
              onSpecificationChange={(v) =>
                setLines((ls) =>
                  ls.map((l, i) => (i === idx ? { ...l, specification: v } : l)),
                )
              }
              onQuantityChange={(v) =>
                setLines((ls) =>
                  ls.map((l, i) => (i === idx ? { ...l, quantity: v } : l)),
                )
              }
              onUnitPriceChange={(v) =>
                setLines((ls) =>
                  ls.map((l, i) => (i === idx ? { ...l, unitPrice: v } : l)),
                )
              }
              onDelete={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
              dragHandleProps={{}}
              canDelete={lines.length > 1}
            />
          ))}
        </div>
      )
    }
    return <Demo />
  },
  parameters: {
    docs: {
      description: {
        story: '실제 사용 패턴 — header + 3개 라인 + state 관리 (3번 라인 선택됨).',
      },
    },
  },
}
