import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { ProductAutocomplete } from './ProductAutocomplete'
import type { ProductOption } from './ProductAutocomplete'

/** 시연용 품목 목록 — AC-2 mock 5개. */
const SAMPLE_PRODUCTS: ProductOption[] = [
  {
    id: '2e40fa30-10b2-3a9b-a99c-570ac92287ad',
    modelName: 'AJ040RXH4BC1',
    productName: '시스템에어컨 4Way 4HP',
    sellingPrice: 1850000,
  },
  {
    id: 'p-aj052',
    modelName: 'AJ052RXH5BC1',
    productName: '시스템에어컨 4Way 5HP',
    sellingPrice: 2120000,
  },
  {
    id: 'p-aj036',
    modelName: 'AJ036NCH3CH',
    productName: '천장형 1Way 3HP',
    sellingPrice: 1450000,
  },
  {
    id: 'p-aj100',
    modelName: 'AJ100NCDKH',
    productName: '실외기 10HP',
    sellingPrice: 4200000,
  },
  {
    id: 'p-mwr10',
    modelName: 'MWR-WE10N',
    productName: '유선 리모컨 (WE10N)',
    sellingPrice: 85000,
  },
]

/**
 * mock searchProducts — 부분 일치 필터, setTimeout 으로 async 모사.
 */
function makeMockSearch(options: {
  delayMs?: number
  failAfterMs?: number
  empty?: boolean
} = {}) {
  return (q: string): Promise<ProductOption[]> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        if (options.failAfterMs !== undefined) {
          reject(new Error('서버 오류'))
          return
        }
        if (options.empty) {
          resolve([])
          return
        }
        const lower = q.toLowerCase()
        const results = SAMPLE_PRODUCTS.filter(
          (p) =>
            p.modelName.toLowerCase().includes(lower) ||
            p.productName.toLowerCase().includes(lower),
        )
        resolve(results)
      }, options.delayMs ?? 400)
    })
}

const meta: Meta<typeof ProductAutocomplete> = {
  title: 'Components/ProductAutocomplete',
  component: ProductAutocomplete,
  args: {
    value: null,
    onChange: () => {},
    searchProducts: makeMockSearch(),
  },
}
export default meta

type Story = StoryObj<typeof ProductAutocomplete>

/** 기본 상태 — 입력 후 debounce → 후보 표시 → 선택. */
export const Default: Story = {
  render: () => {
    const [selected, setSelected] = useState<ProductOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          "AJ" 또는 "에어컨" 을 입력하면 0.4초 후 후보가 표시됩니다.
        </p>
        <ProductAutocomplete
          value={selected}
          onChange={setSelected}
          searchProducts={makeMockSearch()}
          label="품목"
          placeholder="모델명 또는 품목명 입력…"
        />
        {/* UUID 비공개 — modelName/productName 만 표시 */}
        <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
          선택됨: {selected ? `${selected.modelName} · ${selected.productName}` : '(없음)'}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>
          단가: {selected?.sellingPrice != null ? `₩${selected.sellingPrice.toLocaleString()}` : '-'}
        </div>
      </div>
    )
  },
}

/** 로딩 상태 — 검색 delay 2초로 로딩 스피너 시연. */
export const LoadingState: Story = {
  render: () => {
    const [selected, setSelected] = useState<ProductOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          응답 delay 2초 — 로딩 스피너 확인.
        </p>
        <ProductAutocomplete
          value={selected}
          onChange={setSelected}
          searchProducts={makeMockSearch({ delayMs: 2000 })}
          label="품목"
        />
      </div>
    )
  },
}

/** 빈 결과 — "검색 결과 없음" 표시. */
export const EmptyResults: Story = {
  render: () => {
    const [selected, setSelected] = useState<ProductOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          어떤 입력도 후보 없음 — "검색 결과 없음" 상태.
        </p>
        <ProductAutocomplete
          value={selected}
          onChange={setSelected}
          searchProducts={makeMockSearch({ empty: true, delayMs: 200 })}
          label="품목"
        />
      </div>
    )
  },
}

/** 에러 상태 — searchProducts reject 시나리오. */
export const ErrorState: Story = {
  render: () => {
    const [selected, setSelected] = useState<ProductOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          서버 오류 reject → "검색 중 오류" 메시지 표시.
        </p>
        <ProductAutocomplete
          value={selected}
          onChange={setSelected}
          searchProducts={makeMockSearch({ failAfterMs: 300 })}
          label="품목"
        />
      </div>
    )
  },
}

/** required + error 상태 — 필수 미선택 오류. */
export const RequiredWithError: Story = {
  render: () => {
    const [selected, setSelected] = useState<ProductOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <ProductAutocomplete
          value={selected}
          onChange={setSelected}
          searchProducts={makeMockSearch()}
          label="품목"
          required
          error="품목을 선택하세요."
        />
      </div>
    )
  },
}

/** disabled — 편집 불가 상태 (이미 확정된 라인 등). */
export const Disabled: Story = {
  render: () => (
    <div style={{ width: 420, padding: 16 }}>
      <ProductAutocomplete
        value={{
          id: '2e40fa30-10b2-3a9b-a99c-570ac92287ad',
          modelName: 'AJ040RXH4BC1',
          productName: '시스템에어컨 4Way 4HP',
          sellingPrice: 1850000,
        }}
        onChange={() => {}}
        searchProducts={makeMockSearch()}
        label="품목"
        disabled
      />
    </div>
  ),
}

/** minChars=3 — 3글자 미만 입력 시 안내 메시지 표시. */
export const MinChars: Story = {
  render: () => {
    const [selected, setSelected] = useState<ProductOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          3글자 이상 입력해야 검색이 시작됩니다.
        </p>
        <ProductAutocomplete
          value={selected}
          onChange={setSelected}
          searchProducts={makeMockSearch()}
          label="품목"
          minChars={3}
        />
      </div>
    )
  },
}

/** 선택 후 blur — 선택값 복원 확인 (blur 게이트 AC-1 교훈 적용). */
export const SelectThenBlur: Story = {
  render: () => {
    const [selected, setSelected] = useState<ProductOption | null>({
      id: '2e40fa30-10b2-3a9b-a99c-570ac92287ad',
      modelName: 'AJ040RXH4BC1',
      productName: '시스템에어컨 4Way 4HP',
      sellingPrice: 1850000,
    })
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          이미 선택된 상태. 포커스 후 임의 텍스트 입력 → blur → 이전 선택 복원 확인.
        </p>
        <ProductAutocomplete
          value={selected}
          onChange={setSelected}
          searchProducts={makeMockSearch()}
          label="품목"
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
          선택됨: {selected ? `${selected.modelName} · ${selected.productName}` : '(없음)'}
        </div>
      </div>
    )
  },
}
