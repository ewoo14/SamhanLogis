import { apiClient, type ApiEnvelope } from './client'
import { isMockMode } from './mock'

export type AllocationSourceSlipType = 'OUTBOUND' | 'INBOUND'

export interface SlipAllocationSourceLine {
  lineId: string
  lineNo: number
  productCode: string
  productName: string
  quantity: number
  unitPrice: string
  lineTotal: string
}

export interface SlipAllocationSourceSummary {
  slipId: string
  slipNo: string
  slipType: AllocationSourceSlipType
  status: string
  slipDate: string
  partnerId: string | null
  partnerCode: string | null
  partnerName: string | null
  lines: SlipAllocationSourceLine[]
}

export interface ListSlipAllocationSourcesOptions {
  type: AllocationSourceSlipType
  from: string
  to: string
  partnerId?: string
}

function unwrap<T>(payload: T | ApiEnvelope<T>): T {
  if (
    typeof payload === 'object'
    && payload !== null
    && 'data' in payload
    && 'success' in payload
  ) {
    return (payload as ApiEnvelope<T>).data
  }
  return payload as T
}

function mockUuid(seed: string): string {
  let hash = 0x811c9dc5
  for (const ch of seed) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8)
  return `${hex}-0000-4000-8000-${hex}${hex.slice(0, 4)}`
}

function mockSource(
  type: AllocationSourceSlipType,
  slipNo: string,
  slipDate: string,
  partnerCode: string,
  partnerName: string,
  productName: string,
  quantity: number,
  lineTotal: string,
): SlipAllocationSourceSummary {
  return {
    slipId: mockUuid(`${slipNo}:slip`),
    slipNo,
    slipType: type,
    status: 'CONFIRMED',
    slipDate,
    partnerId: null,
    partnerCode,
    partnerName,
    lines: [
      {
        lineId: mockUuid(`${slipNo}:line:1`),
        lineNo: 1,
        productCode: productName,
        productName,
        quantity,
        unitPrice: String(Math.round(Number(lineTotal) / quantity)),
        lineTotal,
      },
    ],
  }
}

const MOCK_SOURCE_SLIPS: SlipAllocationSourceSummary[] = [
  mockSource('OUTBOUND', 'OUT-20260520-014', '2026-05-20', 'P-10021', '삼한물류 안산센터', '표준 팔레트 A', 6, '750000'),
  mockSource('OUTBOUND', 'OUT-20260520-018', '2026-05-20', 'P-10021', '삼한물류 안산센터', '표준 팔레트 A', 4, '500000'),
  mockSource('INBOUND', 'IN-20260520-006', '2026-05-20', 'V-30011', '한빛포장', '완충 포장재 B', 12, '516000'),
  mockSource('INBOUND', 'IN-20260520-011', '2026-05-20', 'V-30011', '한빛포장', '완충 포장재 B', 8, '344000'),
]

export async function listSlipAllocationSources(
  options: ListSlipAllocationSourcesOptions,
): Promise<SlipAllocationSourceSummary[]> {
  if (isMockMode()) {
    return MOCK_SOURCE_SLIPS.filter((row) => {
      if (row.slipType !== options.type) return false
      if (row.slipDate < options.from) return false
      if (row.slipDate > options.to) return false
      return true
    })
  }

  const params = new URLSearchParams()
  params.set('type', options.type)
  params.set('from', options.from)
  params.set('to', options.to)
  if (options.partnerId) params.set('partnerId', options.partnerId)
  const res = await apiClient.get<
    SlipAllocationSourceSummary[] | ApiEnvelope<SlipAllocationSourceSummary[]>
  >(`/internal/slips/by-period?${params.toString()}`)
  return unwrap(res.data)
}
