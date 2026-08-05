/**
 * `usePartnerPriceRefresh` — 거래처 변경 시 라인 단가 bulk 재조회 공용 훅.
 *
 * <p><b>왜 공용인가 (D-R8-10 · R8-QA-11)</b>: 전표 생성 폼(SlipFormPage)은 거래처를 바꾸면
 * 자동단가 라인을 새 거래처 기준으로 재조회(POST /slips/price-memory/bulk)하고 변경행을
 * 하이라이트하며 배너를 띄운다. 그런데 <b>전표 수정 모달</b>(SlipDetailPage)에는 그 로직이
 * 없어, 수정 중 거래처만 바꿔 저장하면 <b>옛 거래처의 협상단가가 새 거래처에 각인</b>됐다
 * (R8-QA-11 라이브 실증, 배너 count=0). 로직을 복붙하면 두 경로가 다시 어긋나므로, 요청
 * 수명주기(stale guard) + 가격기억→단가 해석 + 변경 판정을 이 훅에 <b>단일 진실원</b>으로 둔다.
 *
 * <p><b>왜 outcome 반환형인가</b>: 두 소비자의 적용 방식이 근본적으로 다르다. 폼은 로컬 state
 * (setLines)를 갱신하고, 수정 모달은 CRDT provider(Y.Doc)에 써야 원격 피어에 전파되고 doc-sync
 * 되돌림을 피한다. 따라서 훅은 공통 코어(수명주기·조회·해석)만 담당하고, 적용(setLines vs
 * provider write)은 각 화면이 outcome 을 받아 수행한다. 라인 후보 build 와 stale 재검증도
 * 소비자가 각자 규약으로 한다(폼=priceSource, 모달=lineId).
 */
import { useRef, useState } from 'react'
import { getPriceMemories as defaultGetPriceMemories, type BulkPriceMemoryLookupResult } from '../api/slip'
import { calculateSlipDiscount, type SlipDiscountConfig, type SlipDiscountInput } from './slipDiscount'

/** 최근단가 조회가 네트워크에서 영영 끝나 저장을 영구 차단하지 않도록 하는 상한. */
export const PRICE_LOOKUP_TIMEOUT_MS = 5000

/** 단건·bulk 조회가 같은 timeout/finally 계약을 공유하도록 감싼다. */
export function withPriceLookupTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error('최근단가 조회 시간 초과')),
      PRICE_LOOKUP_TIMEOUT_MS,
    )
    operation.then(resolve, reject).finally(() => clearTimeout(timeoutId))
  })
}

/** 재조회 후보 — 소비자가 현재 라인에서 뽑아 넘긴다. */
export interface PartnerRepriceCandidate {
  /** 라인 식별자(폼=line.id, 모달=line.key/lineId). */
  key: string
  productId: string
  /** 변경 판정 기준 단가(후보 build 시점 현재값). */
  currentUnitPrice: string
  /** 가격기억 miss/실패 시 fallback 단가. null이면 카탈로그 미확보로 명시 처리한다. */
  catalogFallback: string | null
  /** 최근단가 miss 때 새 거래처의 고정/전역DC를 재계산할 원 품목 입력. */
  discountInput?: Omit<SlipDiscountInput, 'listPrice'>
}

/** 거래처 변경 재조회의 라인별 해석 결과. */
export interface PartnerRepriceOutcome {
  key: string
  productId: string
  /**
   * 가격기억 hit 이면 기억단가, miss/실패면 catalogFallback.
   *
   * <p>⚠️ <b>값 도메인</b>: hit(REMEMBERED)은 <b>기억 도메인 = VAT 포함</b>
   * (BE PartnerProductPriceMemory — utils/vatPrice.ts 실증), miss(CATALOG)는
   * <b>candidate.catalogFallback 도메인 그대로</b>다. #937 R-3 이후 두 소비자(폼·전표 수정
   * 화면) 모두 필드가 VAT 포함이라 도메인이 일치 — 적용 시 변환이 없다(SlipDetailPage
   * {@code repricedFieldValue} 참고). 과거(#809 R8 잔여2 시절) 전표 수정 화면 필드가 VAT
   * 제외였을 때는 여기서 vatExclusiveOf 변환이 필요했다 — 그 문서는 utils/vatPrice.ts 상단에
   * 역사적 기록으로 남겨 두었다.
   */
  unitPrice: string
  /** hit 이면 기억 저장시각(remembered_at), miss/실패면 null. */
  updatedAt: string | null
  /** hit=REMEMBERED / miss·실패+판매가 확보=CATALOG / 판매가 미확보=UNAVAILABLE. */
  source: 'REMEMBERED' | 'CATALOG' | 'UNAVAILABLE'
  /**
   * unitPrice 가 후보 시점 currentUnitPrice 와 다른가(하이라이트 힌트 — 소비자가 재확인 가능).
   * 도메인 변환이 필요한 소비자는 변환 후 필드 도메인에서 실변경을 재판정할 것.
   */
  changed: boolean
  /** miss fallback에 실제 적용된 고정/전역DC 안내. */
  discountInfo: string | null
}

export interface PartnerRepriceRun {
  outcomes: PartnerRepriceOutcome[]
  /** 이 결과가 아직 최신인가(더 새 run/해제로 대체되지 않았는가). 적용 직전 호출한다. */
  isCurrent: () => boolean
}

export interface UsePartnerPriceRefreshOptions {
  /** 테스트 주입용. 기본은 실제 bulk API. */
  fetchMemories?: (partnerId: string, productIds: string[]) => Promise<BulkPriceMemoryLookupResult>
}

export interface UsePartnerPriceRefreshResult {
  /**
   * 거래처 기준으로 후보를 bulk 재조회해 outcome 을 계산한다. 후보 0건이면 빈 outcome.
   * 반환 후 `isCurrent()` 가 false 면 소비자는 적용을 건너뛴다(더 새 거래처 선택으로 대체됨).
   */
  run: (
    partnerId: string,
    candidates: PartnerRepriceCandidate[],
    discountConfig?: SlipDiscountConfig | null,
  ) => Promise<PartnerRepriceRun>
  /** in-flight 재조회 무효화(거래처 해제 등) — 이후 도착 결과의 isCurrent 를 false 로 만든다. */
  invalidate: (partnerId?: string | null) => void
  /** 최신 거래처 재조회가 진행 중인지 여부 — 저장/발송 race 차단용. */
  isPending: boolean
}

/**
 * 카탈로그 조회까지 포함한 소비자 세션의 최종 적용 가드.
 * seq·현재 거래처·공용 훅 세 조건 중 하나라도 바뀌면 이전 결과는 state/CRDT에 쓸 수 없다.
 */
export function partnerRepriceSessionIsCurrent(
  requestSeq: number,
  currentSeq: number,
  requestedPartnerId: string,
  currentPartnerId: string,
  hookIsCurrent: boolean,
): boolean {
  return hookIsCurrent
    && requestSeq === currentSeq
    && requestedPartnerId === currentPartnerId
}

export function usePartnerPriceRefresh(
  options?: UsePartnerPriceRefreshOptions,
): UsePartnerPriceRefreshResult {
  const fetchMemories = options?.fetchMemories ?? defaultGetPriceMemories
  const requestRef = useRef(0)
  const activePartnerRef = useRef<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const invalidate = (partnerId: string | null = null) => {
    requestRef.current += 1
    activePartnerRef.current = partnerId
    setIsPending(false)
  }

  const run = async (
    partnerId: string,
    candidates: PartnerRepriceCandidate[],
    discountConfig?: SlipDiscountConfig | null,
  ): Promise<PartnerRepriceRun> => {
    // 후보가 없어도 activePartner 는 먼저 갱신해 in-flight 이전 거래처 run 을 무효화한다.
    activePartnerRef.current = partnerId
    const requestId = ++requestRef.current
    const isCurrent = () => requestRef.current === requestId && activePartnerRef.current === partnerId
    if (candidates.length === 0) return { outcomes: [], isCurrent }
    setIsPending(true)

    const toOutcome = (
      candidate: PartnerRepriceCandidate,
      memory: { unitPrice: number; updatedAt: string | null } | undefined,
    ): PartnerRepriceOutcome => {
      const discount = candidate.discountInput != null && candidate.catalogFallback != null
        ? calculateSlipDiscount({
          ...candidate.discountInput,
          listPrice: Number(candidate.catalogFallback),
        }, discountConfig ?? null)
        : null
      const source: PartnerRepriceOutcome['source'] = memory != null
        ? 'REMEMBERED'
        : candidate.catalogFallback != null
          ? 'CATALOG'
          : 'UNAVAILABLE'
      const hasAuthoritativeDiscount = discount != null && discount.source !== 'NONE'
      const unitPrice = hasAuthoritativeDiscount
        ? String(discount.unitPrice)
        : memory != null
          ? String(memory.unitPrice)
          : candidate.catalogFallback ?? ''
      return {
        key: candidate.key,
        productId: candidate.productId,
        unitPrice,
        updatedAt: hasAuthoritativeDiscount ? null : memory?.updatedAt ?? null,
        source: hasAuthoritativeDiscount ? 'CATALOG' : source,
        changed: unitPrice !== candidate.currentUnitPrice,
        discountInfo: discount != null && discount.source !== 'NONE' ? discount.info : null,
      }
    }

    try {
      const { hits } = await withPriceLookupTimeout(
        fetchMemories(partnerId, candidates.map((candidate) => candidate.productId)),
      )
      const byProductId = new Map(hits.map((hit) => [hit.productId, hit]))
      return { outcomes: candidates.map((candidate) => toOutcome(candidate, byProductId.get(candidate.productId))), isCurrent }
    } catch {
      // bulk 자체 실패 — 판매가가 있으면 CATALOG, 없으면 UNAVAILABLE 로 조용한 오염을 막는다.
      return { outcomes: candidates.map((candidate) => toOutcome(candidate, undefined)), isCurrent }
    } finally {
      // 이전 요청이 늦게 끝나도 최신 요청의 pending 상태를 내리지 않는다.
      if (requestRef.current === requestId) setIsPending(false)
    }
  }

  return { run, invalidate, isPending }
}
