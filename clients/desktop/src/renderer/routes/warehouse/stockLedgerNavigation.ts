import type { SlipType } from '../../api/slip'

/** 수불부에서 전표번호를 눌렀을 때 사용하는 전표별 opaque 화면 경로. */
export function stockLedgerSlipDestination(slipType: SlipType, slipNo: string): string {
  const pathname = slipType === 'OUTBOUND' ? '/sales/by-number' : '/purchases/by-number'
  return `${pathname}?slipNo=${encodeURIComponent(slipNo)}`
}
