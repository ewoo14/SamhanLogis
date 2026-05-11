/**
 * ExcelDownloadButton Storybook stories — P1-6 슬라이스.
 *
 * onFetch 콜백에 mock CSV blob 을 반환하는 함수를 주입해
 * 실 BE 없이 파일 다운로드 시연.
 *
 * <h2>색상 확인 포인트</h2>
 * <ul>
 *   <li>테두리/텍스트: #107C41 (Excel brand green)</li>
 *   <li>hover 배경: #E8F5E9</li>
 *   <li>active 배경: #C8E6C9</li>
 * </ul>
 *
 * <h2>data-testid 정책</h2>
 * <p>페이지별 고유 testid 를 전달. 컴포넌트 기본값 없음 (E2E 격리).
 */
import type { Meta, StoryObj } from '@storybook/react'
import { ExcelDownloadButton } from './ExcelDownloadButton'

// ---------------------------------------------------------------------------
// mock CSV 픽스처
// ---------------------------------------------------------------------------

function makeCsvBlob(csv: string): Blob {
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' })
}

const MOCK_PARTNERS_CSV = [
  '거래처코드,상호,사업자번호,대표자,전화,상태',
  'P-2026-0001,(주)한국공조,123-45-67890,홍길동,02-1234-5678,거래중',
  'P-2026-0002,강남에어솔루션,234-56-78901,이영희,02-9876-5432,거래중',
  'P-2026-0003,한빛쾌적,345-67-89012,박철수,031-1111-2222,거래중지',
].join('\n')

const MOCK_SLIPS_CSV = [
  '전표번호,구분,거래처,일자,상태,금액',
  '2026-05-001,출고,(주)한국공조,2026-05-08,확정,4250000',
  '2026-05-002,입고,강남에어솔루션,2026-05-09,저장,8700000',
].join('\n')

const MOCK_JOURNALS_CSV = [
  '분개번호,일자,상태,적요,차변합계,대변합계',
  'JV-2026/05-001,2026-05-08,확정,매출채권 발생,4250000,4250000',
  'JV-2026/05-002,2026-05-09,임시저장,매입 처리,8700000,8700000',
].join('\n')

const MOCK_STOCKS_CSV = [
  '창고코드,창고명,품목코드,품목명,가용수량,예약수량,합계',
  'WH-001,본사창고,P-AJ040,AJ040 싱글 VH,24,4,28',
  'WH-001,본사창고,P-AJ060,AJ060 더블 VH,12,0,12',
].join('\n')

const fetchPartners = () => Promise.resolve(makeCsvBlob(MOCK_PARTNERS_CSV))
const fetchSlips = () => Promise.resolve(makeCsvBlob(MOCK_SLIPS_CSV))
const fetchJournals = () => Promise.resolve(makeCsvBlob(MOCK_JOURNALS_CSV))
const fetchStocks = () => Promise.resolve(makeCsvBlob(MOCK_STOCKS_CSV))

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof ExcelDownloadButton> = {
  title: 'Components/ExcelDownloadButton',
  component: ExcelDownloadButton,
  args: {
    onFetch: fetchPartners,
    filename: '거래처목록_2026-05-11.xlsx',
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'layout 크기. 색상은 항상 Excel brand green (#107C41) 고정.',
    },
    disabled: { control: 'boolean' },
  },
}
export default meta

type Story = StoryObj<typeof ExcelDownloadButton>

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 거래처 목록 Excel 다운로드 (mock CSV 즉시 저장). */
export const 거래처목록: Story = {
  args: {
    onFetch: fetchPartners,
    filename: '거래처목록_2026-05-11.xlsx',
    children: 'Excel 다운로드',
    'data-testid': 'partners-excel-export',
  },
}

/** 전표 목록 Excel 다운로드. */
export const 전표목록: Story = {
  args: {
    onFetch: fetchSlips,
    filename: '출고전표목록_2026-05-11.xlsx',
    children: 'Excel 다운로드',
    'data-testid': 'slip-list-excel-export',
  },
}

/** 분개장 Excel 다운로드. */
export const 분개장: Story = {
  args: {
    onFetch: fetchJournals,
    filename: '분개장_202605.xlsx',
    children: 'Excel 다운로드',
    'data-testid': 'journal-list-excel-export',
  },
}

/** 재고 현황 Excel 다운로드. */
export const 재고현황: Story = {
  args: {
    onFetch: fetchStocks,
    filename: '재고현황_2026-05-11.xlsx',
    children: 'Excel 다운로드',
    'data-testid': 'transfer-list-stocks-excel-export',
  },
}

/** loading 상태 시각 확인 (disabled 로 시뮬레이션). */
export const 로딩중: Story = {
  args: {
    onFetch: fetchPartners,
    filename: '거래처목록.xlsx',
    disabled: true,
    children: '다운로드 중…',
    'data-testid': 'excel-loading-demo',
  },
}

/** sm (기본) 크기 — Excel brand green (#107C41) 확인. */
export const 기본_SM: Story = {
  args: {
    size: 'sm',
    onFetch: fetchPartners,
    filename: '거래처목록.xlsx',
    'data-testid': 'excel-sm-demo',
  },
}

/** md 크기 — Excel brand green (#107C41) 확인. */
export const 중간_MD: Story = {
  args: {
    size: 'md',
    onFetch: fetchPartners,
    filename: '거래처목록.xlsx',
    children: 'Excel 다운로드',
    'data-testid': 'excel-md-demo',
  },
}

/** lg 크기 — Excel brand green (#107C41) 확인. */
export const 크게_LG: Story = {
  args: {
    size: 'lg',
    onFetch: fetchPartners,
    filename: '거래처목록.xlsx',
    children: 'Excel 다운로드',
    'data-testid': 'excel-lg-demo',
  },
}

/** 3 size 한 번에 — 색상/레이아웃 일관성 확인. */
export const 전체Size: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <ExcelDownloadButton {...args} size="sm">SM — Excel 다운로드</ExcelDownloadButton>
      <ExcelDownloadButton {...args} size="md">MD — Excel 다운로드</ExcelDownloadButton>
      <ExcelDownloadButton {...args} size="lg">LG — Excel 다운로드</ExcelDownloadButton>
    </div>
  ),
  args: {
    onFetch: fetchPartners,
    filename: '거래처목록.xlsx',
    'data-testid': 'excel-size-demo',
  },
}
