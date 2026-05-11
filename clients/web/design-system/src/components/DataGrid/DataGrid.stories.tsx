/**
 * DataGrid Storybook — Excel-like 데이터그리드 인터랙션 시나리오.
 *
 * 시나리오:
 * 1. Default (텍스트 필터 + 다중 셀 선택 + Ctrl+C 복사)
 * 2. SelectFilter (select 타입 checkbox 필터)
 * 3. PasteEnabled (Ctrl+V 붙여넣기 허용 — console.log 로 확인)
 * 4. LargeDataset (250행 × 10열 — 스크롤 + 성능)
 * 5. ReadOnly (enableMultiSelect=false, enableCopy=false)
 * 6. Loading (스피너 오버레이)
 * 7. EmptyState (빈 데이터 메시지)
 */
import type { Meta, StoryObj } from '@storybook/react'
import { DataGrid, type DataGridColumn } from './DataGrid'
import type { PasteCell } from './useClipboard'

// ── 공통 샘플 데이터 ────────────────────────────────────────────────────────

interface SampleRow {
  slipNo: string
  partnerName: string
  amount: number
  status: string
  date: string
  memo: string | null
}

const SAMPLE_ROWS: SampleRow[] = [
  { slipNo: '2026/05/04-1', partnerName: '주식회사 윌리', amount: 1500000, status: '처리중', date: '2026-05-04', memo: '9시까지 배송' },
  { slipNo: '2026/05/04-2', partnerName: '○○종합건설', amount: 3200000, status: '확정', date: '2026-05-04', memo: null },
  { slipNo: '2026/05/04-3', partnerName: '삼성전자', amount: 8700000, status: '검수중', date: '2026-05-04', memo: '야적 가능' },
  { slipNo: '2026/05/05-1', partnerName: 'LG전자', amount: 2100000, status: '처리중', date: '2026-05-05', memo: null },
  { slipNo: '2026/05/05-2', partnerName: '현대엘리베이터', amount: 5500000, status: '확정', date: '2026-05-05', memo: '현장 직납' },
  { slipNo: '2026/05/05-3', partnerName: '롯데케미칼', amount: 990000, status: '처리중', date: '2026-05-05', memo: null },
  { slipNo: '2026/05/06-1', partnerName: 'SK텔레콤', amount: 4300000, status: '검수중', date: '2026-05-06', memo: '포장 주의' },
  { slipNo: '2026/05/06-2', partnerName: '대우일렉트로닉스', amount: 1800000, status: '처리중', date: '2026-05-06', memo: null },
  { slipNo: '2026/05/06-3', partnerName: '캐리어에어컨', amount: 6200000, status: '확정', date: '2026-05-06', memo: '냉동차 필수' },
  { slipNo: '2026/05/07-1', partnerName: '대성산업', amount: 3750000, status: '확정', date: '2026-05-07', memo: null },
]

const TEXT_FILTER_COLUMNS: DataGridColumn<SampleRow>[] = [
  { key: 'slipNo', label: '전표번호', filter: 'text' },
  { key: 'partnerName', label: '거래처', filter: 'text' },
  { key: 'amount', label: '금액', align: 'right', filter: 'text', format: (v) => Number(v).toLocaleString('ko-KR') + '원' },
  { key: 'status', label: '상태', filter: 'text' },
  { key: 'date', label: '일자', filter: 'text' },
  { key: 'memo', label: '메모', filter: 'text' },
]

const SELECT_FILTER_COLUMNS: DataGridColumn<SampleRow>[] = [
  { key: 'slipNo', label: '전표번호', filter: 'text' },
  { key: 'partnerName', label: '거래처', filter: 'text' },
  { key: 'amount', label: '금액', align: 'right', filter: false, format: (v) => Number(v).toLocaleString('ko-KR') + '원' },
  { key: 'status', label: '상태', filter: 'select' },
  { key: 'date', label: '일자', filter: 'select' },
  { key: 'memo', label: '메모', filter: 'text' },
]

// ── 250행 대량 데이터 ────────────────────────────────────────────────────────
const LARGE_ROWS: SampleRow[] = Array.from({ length: 250 }, (_, i) => ({
  slipNo: `2026/05/${String(Math.floor(i / 10) + 1).padStart(2, '0')}-${(i % 10) + 1}`,
  partnerName: ['삼성전자', 'LG전자', '롯데케미칼', '현대엘리베이터', '캐리어에어컨'][i % 5] ?? '거래처',
  amount: 100000 + i * 12345,
  status: ['처리중', '확정', '검수중'][i % 3] ?? '처리중',
  date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
  memo: i % 4 === 0 ? '야적 가능' : null,
}))

// ── Meta ─────────────────────────────────────────────────────────────────────
const meta: Meta<typeof DataGrid> = {
  title: 'Components/DataGrid',
  component: DataGrid,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: [
          'Excel-like 데이터그리드.',
          '열헤더 필터(text/select) + 다중 셀 선택(Shift/Ctrl/Ctrl+A) + 복사(Ctrl+C) + 붙여넣기(Ctrl+V) 지원.',
          '',
          '**조작 방법**:',
          '- 셀 클릭: 단일 선택',
          '- Shift+클릭: 범위 선택',
          '- Ctrl+클릭: 토글 선택',
          '- Ctrl+A: 전체 선택',
          '- Ctrl+C: 선택 셀 TSV 복사',
          '- 헤더 깔때기 아이콘: 필터 팝오버 열기',
        ].join('\n'),
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof DataGrid>

// ── Stories ──────────────────────────────────────────────────────────────────

/** 1. 기본 — 텍스트 필터 + 다중 셀 선택 + Ctrl+C 복사 */
export const Default: Story = {
  name: '기본 (텍스트 필터 + 다중 셀 선택)',
  render: () => (
    <div style={{ height: '400px', padding: 16 }}>
      <DataGrid<SampleRow>
        columns={TEXT_FILTER_COLUMNS}
        rows={SAMPLE_ROWS}
        rowKey={(r) => r.slipNo}
        enableMultiSelect
        enableCopy
      />
    </div>
  ),
}

/** 2. Select 필터 — checkbox 리스트 */
export const SelectFilter: Story = {
  name: '선택 필터 (checkbox 목록)',
  render: () => (
    <div style={{ height: '400px', padding: 16 }}>
      <DataGrid<SampleRow>
        columns={SELECT_FILTER_COLUMNS}
        rows={SAMPLE_ROWS}
        rowKey={(r) => r.slipNo}
      />
    </div>
  ),
}

/** 3. 붙여넣기 활성 — Ctrl+V 후 콘솔 출력 */
export const PasteEnabled: Story = {
  name: '붙여넣기 활성 (Ctrl+V)',
  render: () => (
    <div style={{ height: '400px', padding: 16 }}>
      <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
        셀 선택 후 Ctrl+C 로 복사, 다른 위치 셀 클릭 후 Ctrl+V 로 붙여넣기 (콘솔 확인)
      </p>
      <DataGrid<SampleRow>
        columns={TEXT_FILTER_COLUMNS}
        rows={SAMPLE_ROWS}
        rowKey={(r) => r.slipNo}
        enableCopy
        enablePaste
        onPaste={(cells: PasteCell[]) => {
          // eslint-disable-next-line no-console
          console.log('[DataGrid] onPaste:', cells)
        }}
      />
    </div>
  ),
}

/** 4. 대량 데이터 — 250행 × 6열 스크롤 + 성능 */
export const LargeDataset: Story = {
  name: '대량 데이터 (250행)',
  render: () => (
    <div style={{ height: '500px', padding: 16 }}>
      <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
        250행 × 6열. 열헤더 필터 + Ctrl+A → Ctrl+C 로 전체 복사 가능.
      </p>
      <DataGrid<SampleRow>
        columns={TEXT_FILTER_COLUMNS}
        rows={LARGE_ROWS}
        rowKey={(r) => r.slipNo}
      />
    </div>
  ),
}

/** 5. 읽기 전용 — 선택 / 복사 모두 비활성 */
export const ReadOnly: Story = {
  name: '읽기 전용',
  render: () => (
    <div style={{ height: '400px', padding: 16 }}>
      <DataGrid<SampleRow>
        columns={TEXT_FILTER_COLUMNS}
        rows={SAMPLE_ROWS}
        rowKey={(r) => r.slipNo}
        enableMultiSelect={false}
        enableCopy={false}
      />
    </div>
  ),
}

/** 6. 로딩 상태 */
export const Loading: Story = {
  name: '로딩 상태',
  render: () => (
    <div style={{ height: '300px', padding: 16 }}>
      <DataGrid<SampleRow>
        columns={TEXT_FILTER_COLUMNS}
        rows={[]}
        rowKey={(r) => r.slipNo}
        loading
      />
    </div>
  ),
}

/** 7. 빈 상태 */
export const EmptyState: Story = {
  name: '빈 데이터',
  render: () => (
    <div style={{ height: '300px', padding: 16 }}>
      <DataGrid<SampleRow>
        columns={TEXT_FILTER_COLUMNS}
        rows={[]}
        rowKey={(r) => r.slipNo}
        emptyMessage="조회 결과가 없습니다."
      />
    </div>
  ),
}
