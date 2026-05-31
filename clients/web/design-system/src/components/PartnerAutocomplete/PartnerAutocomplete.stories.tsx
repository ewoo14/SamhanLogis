import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { PartnerAutocomplete } from './PartnerAutocomplete'
import type { PartnerOption } from './PartnerAutocomplete'

/** 시연용 거래처 목록 — AC-3 mock 6건 (MOCK_ADMIN_PARTNERS 반영). */
const SAMPLE_PARTNERS: PartnerOption[] = [
  {
    partnerCode: '1234567890',
    name: '엘에이시스템에어',
    bizNo: '123-45-67890',
    phone: '02-1234-5678',
  },
  {
    partnerCode: '2345678901',
    name: '강남에어솔루션',
    bizNo: '234-56-78901',
    phone: '02-2345-6789',
  },
  {
    partnerCode: '3456789012',
    name: '한빛쾌적',
    bizNo: '345-67-89012',
    phone: '031-3456-7890',
  },
  {
    partnerCode: '4567890123',
    name: '미래시스템',
    bizNo: '456-78-90123',
    phone: '032-4567-8901',
  },
  {
    partnerCode: '5678901234',
    name: '대박종합건설',
    bizNo: '567-89-01234',
    phone: '02-5678-9012',
  },
  {
    partnerCode: '6789012345',
    name: '경기냉난방',
    bizNo: '678-90-12345',
    phone: '031-6789-0123',
  },
]

/**
 * mock searchPartners — 부분 일치 필터, setTimeout 으로 async 모사.
 */
function makeMockSearch(
  options: {
    delayMs?: number
    failAfterMs?: number
    empty?: boolean
  } = {},
) {
  return (q: string): Promise<PartnerOption[]> =>
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
        const results = SAMPLE_PARTNERS.filter(
          (p) =>
            p.name.toLowerCase().includes(lower) ||
            p.partnerCode.toLowerCase().includes(lower) ||
            (p.bizNo ?? '').toLowerCase().includes(lower) ||
            (p.phone ?? '').includes(lower),
        )
        resolve(results)
      }, options.delayMs ?? 400)
    })
}

const meta: Meta<typeof PartnerAutocomplete> = {
  title: 'Components/PartnerAutocomplete',
  component: PartnerAutocomplete,
  args: {
    value: null,
    onChange: () => {},
    searchPartners: makeMockSearch(),
  },
}
export default meta

type Story = StoryObj<typeof PartnerAutocomplete>

/** 기본 상태 — 입력 후 debounce → 후보 표시 → 선택. */
export const Default: Story = {
  render: () => {
    const [selected, setSelected] = useState<PartnerOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          "강남" 또는 "에어" 를 입력하면 0.4초 후 후보가 표시됩니다.
        </p>
        <PartnerAutocomplete
          value={selected}
          onChange={setSelected}
          searchPartners={makeMockSearch()}
          label="거래처"
          placeholder="거래처명 또는 코드 입력…"
        />
        {/* UUID 비공개 — partnerCode/name 만 표시 */}
        <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
          선택됨:{' '}
          {selected
            ? `${selected.name} · ${selected.partnerCode}`
            : '(없음)'}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>
          연락처: {selected?.phone ?? '-'}
        </div>
      </div>
    )
  },
}

/** 로딩 상태 — 검색 delay 2초로 로딩 스피너 시연. */
export const LoadingState: Story = {
  render: () => {
    const [selected, setSelected] = useState<PartnerOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          응답 delay 2초 — 로딩 스피너 확인.
        </p>
        <PartnerAutocomplete
          value={selected}
          onChange={setSelected}
          searchPartners={makeMockSearch({ delayMs: 2000 })}
          label="거래처"
        />
      </div>
    )
  },
}

/** 빈 결과 — "검색 결과 없음" 표시. */
export const EmptyResults: Story = {
  render: () => {
    const [selected, setSelected] = useState<PartnerOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          어떤 입력도 후보 없음 — "검색 결과 없음" 상태.
        </p>
        <PartnerAutocomplete
          value={selected}
          onChange={setSelected}
          searchPartners={makeMockSearch({ empty: true, delayMs: 200 })}
          label="거래처"
        />
      </div>
    )
  },
}

/** 에러 상태 — searchPartners reject 시나리오. */
export const ErrorState: Story = {
  render: () => {
    const [selected, setSelected] = useState<PartnerOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          서버 오류 reject → "검색 중 오류" 메시지 표시.
        </p>
        <PartnerAutocomplete
          value={selected}
          onChange={setSelected}
          searchPartners={makeMockSearch({ failAfterMs: 300 })}
          label="거래처"
        />
      </div>
    )
  },
}

/** required + error 상태 — 필수 미선택 오류. */
export const RequiredWithError: Story = {
  render: () => {
    const [selected, setSelected] = useState<PartnerOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <PartnerAutocomplete
          value={selected}
          onChange={setSelected}
          searchPartners={makeMockSearch()}
          label="거래처"
          required
          error="거래처를 선택하세요."
        />
      </div>
    )
  },
}

/** disabled — 편집 불가 상태. */
export const Disabled: Story = {
  render: () => (
    <div style={{ width: 420, padding: 16 }}>
      <PartnerAutocomplete
        value={{
          partnerCode: '1234567890',
          name: '엘에이시스템에어',
          bizNo: '123-45-67890',
          phone: '02-1234-5678',
        }}
        onChange={() => {}}
        searchPartners={makeMockSearch()}
        label="거래처"
        disabled
      />
    </div>
  ),
}

/** minChars=2 — 2글자 미만 입력 시 안내 메시지 표시. */
export const MinChars: Story = {
  render: () => {
    const [selected, setSelected] = useState<PartnerOption | null>(null)
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          2글자 이상 입력해야 검색이 시작됩니다.
        </p>
        <PartnerAutocomplete
          value={selected}
          onChange={setSelected}
          searchPartners={makeMockSearch()}
          label="거래처"
          minChars={2}
        />
      </div>
    )
  },
}

/** 선택 후 blur — 선택값 복원 확인 (blur 게이트 AC-3 교훈 적용). */
export const SelectThenBlur: Story = {
  render: () => {
    const [selected, setSelected] = useState<PartnerOption | null>({
      partnerCode: '1234567890',
      name: '엘에이시스템에어',
      bizNo: '123-45-67890',
      phone: '02-1234-5678',
    })
    return (
      <div style={{ width: 420, padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          이미 선택된 상태. 포커스 후 임의 텍스트 입력 → blur → 이전 선택 복원 확인.
        </p>
        <PartnerAutocomplete
          value={selected}
          onChange={setSelected}
          searchPartners={makeMockSearch()}
          label="거래처"
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
          선택됨:{' '}
          {selected
            ? `${selected.name} · ${selected.partnerCode}`
            : '(없음)'}
        </div>
      </div>
    )
  },
}
