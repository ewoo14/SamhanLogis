export type OrderPriceItem = {
  model?: unknown
  qty?: unknown
  price?: unknown
  [key: string]: unknown
}

export type ServerPricePayload = {
  lines?: Array<{
    modelCode?: unknown
    quantity?: unknown
    finalPrice?: unknown
  }>
  totalFinalAmount?: unknown
}

/** 미리보기의 서버 최종 단가를 확인창과 전송에 쓰는 동일한 주문 행에 반영한다. */
export function applyServerPrices<T extends OrderPriceItem>(items: T[], payload: ServerPricePayload): T[] {
  const lines = Array.isArray(payload?.lines) ? payload.lines : []
  if (lines.length !== items.length) throw new Error('서버 가격 미리보기 라인 수가 주문 입력과 다릅니다')

  return items.map((item, index) => {
    const line = lines[index]
    const finalPrice = Number(line?.finalPrice)
    if (!Number.isFinite(finalPrice) || finalPrice < 0) {
      throw new Error('가격 미리보기 최종 단가가 유효하지 않습니다')
    }
    const modelCode = String(line?.modelCode ?? '').trim()
    const model = String(item.model ?? '').trim()
    if (modelCode && model && modelCode !== model) {
      throw new Error('서버 가격 미리보기 품목 순서가 주문 입력과 다릅니다')
    }
    return { ...item, price: finalPrice }
  })
}
