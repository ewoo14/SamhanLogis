export interface CurrentProductStatus {
  id: string
  status?: string | null
}

export interface ProductStatusLine {
  productId: string | null
  status?: string | null
}

/** 품목이 ACTIVE로 확인된 경우에만 수량을 편집할 수 있다. productId 없는 빈 행은 편집 가능하다. */
export function isQuantityEditable(productId: string | null, status?: string | null): boolean {
  return !productId || status === 'ACTIVE'
}

/** 화면 표시 시점의 현재 품목 상태를 견적 라인에 주입한다. 저장 payload에는 쓰지 않는다. */
export async function hydrateCurrentProductStatuses<T extends ProductStatusLine>(
  lines: T[],
  lookup: (productIds: string[]) => Promise<CurrentProductStatus[]>,
): Promise<T[]> {
  const productIds = [...new Set(lines.map((line) => line.productId).filter((id): id is string => Boolean(id)))]
  if (productIds.length === 0) return lines
  try {
    const products = await lookup(productIds)
    const statusByProductId = new Map(products.map((product) => [product.id, product.status ?? null]))
    return lines.map((line) => line.productId
      ? { ...line, status: statusByProductId.get(line.productId) ?? null }
      : line)
  } catch (error) {
    console.warn('[EstimateForm] 현재 품목 상태 조회 실패 — 상태 미확정으로 수량 편집을 잠급니다.', error)
    return lines.map((line) => line.productId ? { ...line, status: null } : line)
  }
}
