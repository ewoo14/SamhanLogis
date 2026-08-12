import { getOutboundSlipBySlipNo } from '../api/slip'
import type { SlipLineDetail } from '../api/slip'
import type { ApprovalAttachment } from '../api/groupwareApprovalAttachment'

/** 결재 첨부의 기존 출고전표 문서번호를 권한 있는 상세 라인으로 해석한다. */
export async function loadApprovalSlipLineItems(
  attachments: ApprovalAttachment[],
): Promise<SlipLineDetail[] | null> {
  const slipNos = [...new Set(
    attachments
      .filter((attachment) => attachment.refDocType === 'OUTBOUND_SLIP')
      .map((attachment) => attachment.refDocNo?.trim())
      .filter((slipNo): slipNo is string => Boolean(slipNo)),
  )]
  if (slipNos.length === 0) return null

  const results = await Promise.allSettled(slipNos.map((slipNo) => getOutboundSlipBySlipNo(slipNo)))
  const successful = results.flatMap((result) => result.status === 'fulfilled' ? [result.value.lines] : [])
  return successful.length > 0 ? successful.flat() : null
}
