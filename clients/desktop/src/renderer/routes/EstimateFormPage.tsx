/**
 * 견적서 작성/편집 화면 — `/sales/estimates/new` + `/:id/edit` (P2-1 #6).
 *
 * <p>UX:
 * <ul>
 *   <li>거래처 선택 — partner-service `searchPartners` 자동완성 (snapshot 자동 입력).</li>
 *   <li>유효기간 — 작성일 기준 +30일 default. 사용자 변경 가능.</li>
 *   <li>라인 입력 — 모델명 onBlur lookup → productId / productName / 단가 자동 채움.</li>
 *   <li>저장 — DRAFT 생성/갱신 후 상세로 이동.</li>
 *   <li>발송 — 편집 모드에서만. DRAFT → SENT 전이.</li>
 * </ul>
 *
 * <p>매뉴얼 출처: {@code docs/manual/01-영업/06-견적서.md}.
 * UUID 비공개 가드 — productId / partnerId 는 state 에만, 화면 표시는 modelName / partnerName.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  FormField,
  Input,
  PartnerAutocomplete,
  ProductAutocomplete,
  Spinner,
  type PartnerOption,
  type ProductOption,
} from '@samhan/design-system'
import {
  createEstimate,
  getEstimate,
  sendEstimate,
  updateEstimate,
  type BundleSetOptions,
  type CreateEstimateRequest,
  type EstimateDetail,
  type EstimateLineRequest,
  type UpdateEstimateRequest,
} from '../api/estimateApi'
import { getPartnerDcConfig, searchPartners, type PartnerSummary } from '../api/sales'
import {
  lookupProductByModelName,
  getPriceMemory,
  emptyBundleSetOptions,
  toApiBundleSetOptions,
} from '../api/slip'
import { isSelectableProductStatus, lookupProducts, searchProducts } from '../api/productApi'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { isAutoPriceSource, shouldAutoFillPrice } from '../utils/priceSourceRules'
import { resolveEstimateCatalogPrice, resolveEstimateNewLinePrice, shouldApplyPartnerDcToEstimate } from '../utils/estimatePrice'
import type { SlipDiscountConfig } from '../utils/slipDiscount'
import {
  changeLineQuantity,
  editLineVat,
  recalculateLineVat,
  type LineVatLine,
} from '../utils/lineVat'
import { vatFromSupply } from '../utils/vatRounding'
import {
  appendBlankRowIfLastChanged,
  ensureTrailingBlankRow,
  removeLinePreservingMinimum,
} from '../utils/autoBlankRow'
import {
  partnerRepriceSessionIsCurrent,
  usePartnerPriceRefresh,
  type PartnerRepriceCandidate,
  type PartnerRepriceOutcome,
} from '../utils/usePartnerPriceRefresh'
import { CollaborativeSlipInput } from '../components/collab/CollaborativeSlipInput'
import { createDocCoeditProvider, type DocCoeditProvider } from '../realtime/createCoeditProvider'
import {
  coeditLineIdsAreStale,
  reseedCoeditLineIds,
  resolveServerLineId,
  toServerLineIdSet,
} from '../realtime/coeditLineIds'
import { consumeEstimateRestoreFence } from '../utils/estimateRestoreFence'
import { LineLookupReferenceModal } from './components/LineLookupReferenceModal'
import { resolvePriceInputQuantitySync } from './estimateLineModel'
import {
  decodeEstimateSpecification,
} from '../utils/estimateSpecificationProvenance'
import { hydrateCurrentProductStatuses, isQuantityEditable } from '../utils/estimateLineStatus'
import { toOrderPathId } from '../utils/orderNo'

let __lineUidCounter = 0
const nextLineUid = (): string => `est-line-${++__lineUidCounter}`
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

interface DraftLine {
  uid: string
  /** 상세 응답 라인 UUID 왕복값 — payload 전용, 화면 미표시. 신규 라인은 null. */
  lineId: string | null
  /** lookup 성공 시 채워지는 product UUID — 화면 미노출. */
  productId: string | null
  modelName: string
  productName: string
  specification: string
  /** 품목 lookup 자동 반영 규격과 사용자가 직접 입력한 규격을 구분한다. */
  specificationSource?: 'CATALOG' | 'USER' | null
  quantity: string
  unitPrice: string
  supplyAmount: string
  vatAmount: string
  lineTotal: string
  authority?: 'PRICE' | 'SUPPLY' | 'VAT' | 'TOTAL'
  vatDirty?: boolean
  vatWarning?: boolean
  priceSource?: 'REMEMBERED' | 'CATALOG' | 'USER' | null
  catalogUnitPrice?: string | null
  priceMemoryUpdatedAt?: string | null
  priceRefreshChanged?: boolean
  /** 거래처 변경 자동 재조회 자격. 저장본 일반 라인은 true, 세트 구성품/사용자 직접입력은 false. */
  partnerRefreshEligible: boolean
  /** 저장 상세의 parentSetModel 비공백 여부 — 세트 구성품 배분가 재가격 금지. */
  isBundleComponent: boolean
  /**
   * legacy(단가 부가세포함 전환 이전, unitPriceWithVat=null) 라인의 원 공급단가 —
   * 편집 hydrate 시 박제. 사용자가 단가를 수정하지 않은 라인은 저장 시
   * priceVatInclusive=false + 이 원값으로 전송해 /1.1 재분리(약 9.1% 하락)와
   * 가격기억 오염을 막는다(R4-F2 — 전표 복사는 R6-H2 부터 BE 서버 복사
   * POST /slips/{id}/duplicate 가 동일 원칙을 라인 verbatim 승계로 보장).
   * 신규 라인/VAT포함 저장 라인은 null.
   */
  legacySupplyUnitPrice?: string | null
  /** legacy 공급단가를 사용자/원격 편집이 건드리지 않았는지 나타내는 명시적 provenance. */
  legacyPriceUntouched?: boolean
  note: string
  lookupError: string | null
  lookupLoading: boolean
  /** 품목 유형 — "SINGLE" | "BUNDLE". BUNDLE 일 때만 세트 옵션 노출. */
  productType: string | null
  modelCode?: string | null
  discountOption?: ProductOption['discountOption']
  classificationAssigned?: boolean
  categoryKey?: string | null
  hasVariableDiscount?: boolean | null
  fixedDiscountRate?: number | null
  goodsType: 'GOODS' | 'NON_GOODS' | null
  status?: string | null
  /** 세트 전개 옵션 — BUNDLE 라인에 한해 채움 (BE BundleSetOptions). */
  setOptions: BundleSetOptions
}

const emptyLine = (): DraftLine => ({
  uid: nextLineUid(),
  lineId: null,
  productId: null,
  modelName: '',
  productName: '',
  specification: '',
  specificationSource: null,
  quantity: '1',
  unitPrice: '0',
  supplyAmount: '0',
  vatAmount: '0',
  lineTotal: '0',
  authority: 'PRICE',
  vatDirty: false,
  vatWarning: false,
  priceSource: null,
  catalogUnitPrice: null,
  priceMemoryUpdatedAt: null,
  priceRefreshChanged: false,
  partnerRefreshEligible: false,
  isBundleComponent: false,
  legacySupplyUnitPrice: null,
  legacyPriceUntouched: false,
  note: '',
  lookupError: null,
  lookupLoading: false,
  productType: null,
  modelCode: null,
  discountOption: null,
  classificationAssigned: undefined,
  categoryKey: null,
  hasVariableDiscount: null,
  fixedDiscountRate: null,
  goodsType: null,
  status: null,
  setOptions: emptyBundleSetOptions(),
})

function asVatLine(line: DraftLine): DraftLine & LineVatLine {
  return {
    ...line,
    supplyAmount: line.supplyAmount || '0',
    vatAmount: line.vatAmount || '0',
    lineTotal: line.lineTotal || '0',
  }
}

const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const datePlusDays = (iso: string, days: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const fmt = (n: number): string => Math.trunc(n).toLocaleString('ko-KR')
const ESTIMATE_HEADER_TEXT_FIELDS = new Set<string>(['memo'])
/**
 * 견적 라인 헤더/행 공용 grid.
 *
 * 판매전표 LineRowVat 의 열 정책을 그대로 사용하되, 견적에 없는 체크박스와
 * 드래그 열만 제외한다. 모델명·품목명은 같은 minmax(100px, 1.5fr) 비율로
 * 남는 폭을 대등하게 나눈다.
 */
const ESTIMATE_LINE_GRID_TEMPLATE = 'var(--col-line-no) minmax(100px, 1.5fr) minmax(100px, 1.5fr) 86px var(--col-qty) var(--col-price) 108px 92px var(--col-sum) var(--col-delete)'
/** 서버 견적 version과 협업 Y.Doc의 seed 세대를 연결하는 내부 헤더 키. 화면 미노출. */
const ESTIMATE_SERVER_VERSION_HEADER = 'estimateServerVersion'

/**
 * 단가 출처 마커 라벨/설명 — 전표(LineRow/SlipMobileLineCard)와 동일 카피.
 *
 * D-R4-1: 자동채움 실체 = 제품 등록 화면 '판매가'(sellingPrice) — '정가' 라벨 금지(출고가 별칭 오도).
 * R4-D4(a): 거래처 미선택(hasPartner=false) 시 CATALOG 설명이 거래처를 단정하지 않는다.
 * D-R4-4: 거래처 해제 시 REMEMBERED 마커(저장일 포함)만 해제 — 단가값·priceSource state 는 유지해
 * 재선택 시 재조회(refreshAutoPricesForPartner) 대상 자격을 보존한다.
 */
function priceSourceStatus(line: DraftLine, hasPartner: boolean): {
  label: string
  description: string
} | null {
  if (line.priceSource === 'REMEMBERED') {
    if (!hasPartner) return null
    return {
      label: '거래처 최근단가',
      description: `이 거래처에 마지막으로 저장된 단가${line.priceMemoryUpdatedAt ? ` · ${line.priceMemoryUpdatedAt.slice(0, 10)} 저장` : ''}`,
    }
  }
  if (line.priceSource === 'CATALOG') {
    return {
      label: '판매가',
      description: hasPartner
        ? '이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다'
        : '판매가를 적용했습니다',
    }
  }
  return null
}

function PriceChangeIndicator({ id }: { id: string }) {
  return (
    <span id={id} className="price-change-indicator">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3 2v7m0 0L1.5 7.5M3 9l1.5-1.5M9 10V3m0 0L7.5 4.5M9 3l1.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      단가 변경
    </span>
  )
}

/** 전표 수정 모달과 동일하게 현재 남아 있는 재조회 outcome 만 배너에 집계한다. */
function estimatePartnerRepriceBannerText(
  outcomes: ReadonlyArray<Pick<PartnerRepriceOutcome, 'source'>>,
  changedCount: number,
): string {
  if (outcomes.length === 0) return ''
  const remembered = outcomes.filter((outcome) => outcome.source === 'REMEMBERED').length
  const catalog = outcomes.filter((outcome) => outcome.source === 'CATALOG').length
  const unavailable = outcomes.filter((outcome) => outcome.source === 'UNAVAILABLE').length
  return [
    '거래처 변경 단가 확인 완료',
    remembered > 0 ? `최근단가 ${remembered}건` : null,
    catalog > 0 ? `판매가 ${catalog}건` : null,
    unavailable > 0 ? `단가 확인 필요 ${unavailable}건` : null,
    `변경 ${changedCount}행`,
  ].filter(Boolean).join(' · ')
}

function toDraftLinesFromEstimate(estimate: EstimateDetail): DraftLine[] {
  return estimate.lines.length > 0
    ? estimate.lines.map((line) => {
        // legacy(unitPriceWithVat=null) 라인의 unitPrice 는 공급단가다. 값은 그대로 노출하되
        // 원 공급단가를 legacySupplyUnitPrice 에 박제 — 저장 시 미수정 라인만
        // priceVatInclusive=false 로 원값 전송(R4-F2 — 전표 복사는 R6-H2 부터 BE 서버
        // 복사가 동일 원칙 보장, FE 재조립 패턴은 제거됨).
        const hasVatInclusivePrice = line.unitPriceWithVat != null
        const canonicalUnitPrice = String(
          hasVatInclusivePrice ? line.unitPriceWithVat : line.unitPrice,
        )
        const decodedSpecification = decodeEstimateSpecification(line.specification)
        return {
          uid: nextLineUid(),
          lineId: line.id,
          productId: line.productId,
          modelName: line.modelName ?? '',
          productName: line.productName ?? '',
          // 신규 상세 API는 규격 원문과 provenance를 별도 전송한다. U+2060을 사용한
          // 구 저장 레코드는 decodeEstimateSpecification으로만 호환한다.
          specification: decodedSpecification.value,
          specificationSource: line.specificationSource ?? decodedSpecification.source,
          quantity: String(line.quantity),
          // 단가 부가세포함: 폼 단가 입력은 VAT 포함값. 편집 hydrate/coedit seed 모두 같은 값으로 보존.
          unitPrice: canonicalUnitPrice,
          supplyAmount: String(line.supplyAmount ?? '0'),
          vatAmount: String(line.vatAmount ?? '0'),
          lineTotal: String(line.lineTotal ?? '0'),
          authority: 'PRICE',
          // Existing S/V/T are server-authoritative. Preserve them on a
          // header-only save instead of treating hydration as a clean edit.
          vatDirty: line.supplyAmount != null && line.vatAmount != null && line.lineTotal != null,
          vatWarning: Number(line.vatAmount ?? 0)
            !== vatFromSupply(Number(line.supplyAmount ?? 0)),
          // R9 #5: 저장본 일반 라인은 거래처 변경 시 새 거래처 기준으로 다시 확인한다.
          // 세트 구성품(parentSetModel 보유)은 배분가이므로 재가격 대상이 아니다.
          priceSource: null,
          catalogUnitPrice: null,
          priceMemoryUpdatedAt: null,
          priceRefreshChanged: false,
          partnerRefreshEligible: !(line.parentSetModel ?? '').trim(),
          isBundleComponent: Boolean((line.parentSetModel ?? '').trim()),
          legacySupplyUnitPrice: hasVatInclusivePrice ? null : String(line.unitPrice),
          legacyPriceUntouched: !hasVatInclusivePrice,
          note: line.note ?? '',
          lookupError: null,
          lookupLoading: false,
          // 편집 모드: 이미 전개·저장된 구성품 라인이므로 재전개하지 않음.
          productType: null,
          discountOption: undefined,
          classificationAssigned: undefined,
          goodsType: null,
          setOptions: line.setOptions ?? emptyBundleSetOptions(),
        }
      })
    : [emptyLine()]
}

function seedEstimateCoeditProvider(provider: DocCoeditProvider, estimate: EstimateDetail) {
  // D-R8-7/R8-DESIGN-1: partnerId 를 CRDT 헤더에 편입 — 거래처 재선택을 상대 피어에 전파하지
  // 않으면 상대는 구 partnerId 로 저장해 가격기억이 원 거래처에 각인된다(전표 R8-QA-3 미러).
  // 화면에는 거래처명만 보이고 UUID 는 payload 전용이다(D-R3-1).
  provider.setHeaderValue('partnerId', estimate.partnerId ?? '')
  provider.setHeaderValue('partnerName', estimate.partnerName)
  provider.setHeaderValue('partnerBusinessNo', estimate.partnerBusinessNo ?? '')
  provider.setHeaderValue('partnerAddress', estimate.partnerAddress ?? '')
  provider.setHeaderValue('estimateDate', estimate.estimateDate)
  provider.setHeaderValue('validUntil', estimate.validUntil ?? '')
  provider.setHeaderValue('memo', estimate.memo ?? '')
  const draftLines = ensureTrailingBlankRow(
    toDraftLinesFromEstimate(estimate),
    emptyLine,
    (line) => Boolean(line.productId),
  )
  provider.replaceItems(
    draftLines.map((line) => ({
      // 🔴 lineId 는 반드시 Y.Doc 에 실어야 한다 (R8-FE-9 — fix 지뢰).
      // 종전 seed 는 lineId 를 pick 하지 않았고, replaceItems 는 lineId 가 비면 클라 랜덤
      // UUID(generateLineId())를 대신 채운다 → Y.Doc 의 lineId 가 전부 서버가 모르는 값 →
      // 직독값을 저장 payload 에 실으면 소유검증에서 전 라인 400. 서버 line.id 로 시드해
      // 전표(toPurchaseEditLines)와 같은 계약으로 맞춘다.
      lineId: line.lineId ?? '',
      modelName: line.modelName,
      productName: line.productName,
      specification: line.specification,
      specificationSource: line.specificationSource ?? '',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      productId: line.productId ?? '',
    })),
  )
}

type LocalAutoPriceWrite = Pick<
  DraftLine,
  'unitPrice' | 'priceSource' | 'priceMemoryUpdatedAt' | 'priceRefreshChanged' | 'partnerRefreshEligible' | 'lookupError'
>

type LocalSpecificationWrite = {
  previousSpecification: string
  specification: string
}

/**
 * coedit Y.Doc → 견적 폼 라인.
 *
 * <p>🔴 <b>lineId 는 Y.Doc 직독 + 서버 소유검증</b> (R8-FE-1 미러 — 전표/견적 비대칭 재발 차단).
 * 종전 {@code lineId: current[index]?.lineId ?? null} 은 전표와 동일한 위치복원 결함이었다.
 * 견적은 coedit 중 라인 추가·삭제를 잠그므로(lineStructureLocked) 전표만큼 자주 터지지는
 * 않으나, 잠금은 <b>로컬 UI</b> 만 막을 뿐 원격 피어의 Y.Doc 델타를 막지 못하므로 같은 계약으로 고친다.
 */
function coeditLinesToDraftLines(
  provider: DocCoeditProvider,
  current: DraftLine[],
  knownServerLineIds: ReadonlySet<string>,
  localAutoPriceWrites?: Map<string, LocalAutoPriceWrite>,
  localSpecificationWrites?: Map<string, LocalSpecificationWrite>,
): DraftLine[] {
  return provider.items.toArray().map((_, index) => {
    const previous = current[index]
    const quantity = provider.getItemValue(index, 'quantity') || '0'
    const unitPrice = provider.getItemValue(index, 'unitPrice') || '0'
    const recalculated = previous
      && (unitPrice !== previous.unitPrice || quantity !== previous.quantity)
      ? recalculateLineVat(asVatLine({ ...previous, quantity, unitPrice }), 'PRICE')
      : undefined
    const expectedAutoWrite = previous ? localAutoPriceWrites?.get(previous.uid) : undefined
    const isExpectedAutoWrite = expectedAutoWrite?.unitPrice === unitPrice
    if (previous && expectedAutoWrite) localAutoPriceWrites?.delete(previous.uid)
    const isRemoteUnitPriceChange = Boolean(
      previous && unitPrice !== previous.unitPrice && !isExpectedAutoWrite,
    )
    const specification = provider.getItemValue(index, 'specification')
    const expectedSpecificationWrite = previous
      ? localSpecificationWrites?.get(previous.uid)
      : undefined
    const isExpectedSpecificationWrite = expectedSpecificationWrite?.specification === specification
    const isStaleSpecificationSnapshot = Boolean(
      expectedSpecificationWrite
      && specification === expectedSpecificationWrite.previousSpecification,
    )
    if (expectedSpecificationWrite && (isExpectedSpecificationWrite || !isStaleSpecificationSnapshot)) {
      localSpecificationWrites?.delete(previous?.uid ?? '')
    }
    const isRemoteSpecificationChange = Boolean(
      previous && specification !== previous.specification && !isStaleSpecificationSnapshot,
    )
    const providerSpecificationSource = provider.getItemValue(index, 'specificationSource')
    const specificationSource = providerSpecificationSource === 'CATALOG' || providerSpecificationSource === 'USER'
      ? providerSpecificationSource
      : isRemoteSpecificationChange
        ? 'USER'
        : previous?.specificationSource ?? null
    return {
      uid: previous?.uid ?? nextLineUid(),
      lineId: resolveServerLineId(provider, index, knownServerLineIds),
      productId: provider.getItemValue(index, 'productId') || null,
      modelName: provider.getItemValue(index, 'modelName'),
      productName: provider.getItemValue(index, 'productName'),
      specification: isStaleSpecificationSnapshot
        ? previous?.specification ?? specification
        : specification,
      specificationSource,
      quantity,
      unitPrice,
      goodsType: previous?.goodsType ?? null,
      supplyAmount: recalculated?.supplyAmount ?? previous?.supplyAmount ?? '0',
      vatAmount: recalculated?.vatAmount ?? previous?.vatAmount ?? '0',
      lineTotal: recalculated?.lineTotal ?? previous?.lineTotal ?? '0',
      authority: recalculated?.authority ?? previous?.authority ?? 'PRICE',
      vatDirty: recalculated?.vatDirty ?? previous?.vatDirty ?? false,
      vatWarning: recalculated?.vatWarning ?? previous?.vatWarning ?? false,
      priceSource: isExpectedAutoWrite
        ? expectedAutoWrite.priceSource
        : isRemoteUnitPriceChange
          ? 'USER'
          : previous?.priceSource ?? null,
      catalogUnitPrice: previous?.catalogUnitPrice ?? null,
      priceMemoryUpdatedAt: isExpectedAutoWrite
        ? expectedAutoWrite.priceMemoryUpdatedAt
        : isRemoteUnitPriceChange
          ? null
          : previous?.priceMemoryUpdatedAt ?? null,
      priceRefreshChanged: isExpectedAutoWrite
        ? expectedAutoWrite.priceRefreshChanged
        : isRemoteUnitPriceChange
          ? false
          : previous?.priceRefreshChanged ?? false,
      partnerRefreshEligible: isRemoteUnitPriceChange
        ? false
        : isExpectedAutoWrite
          ? expectedAutoWrite.partnerRefreshEligible
          : previous?.partnerRefreshEligible ?? false,
      isBundleComponent: previous?.isBundleComponent ?? false,
      // legacy 공급단가 박제/provenance 는 라인 identity(uid) 에 따라 보존한다. 값 자체를 원값으로
      // 되돌려도 원격 편집이 있었으면 untouched 로 복귀하지 않는다(R5-H2).
      legacySupplyUnitPrice: previous?.legacySupplyUnitPrice ?? null,
      legacyPriceUntouched: isRemoteUnitPriceChange
        ? false
        : previous?.legacyPriceUntouched ?? false,
      note: previous?.note ?? '',
      // 원격 doc 변경마다 재빌드되므로 진행 중 lookup 상태는 previous 에서 보존(스피너 조기소멸 방지, 리뷰 MED).
      lookupError: isExpectedAutoWrite
        ? expectedAutoWrite.lookupError
        : previous?.lookupError ?? null,
      lookupLoading: previous?.lookupLoading ?? false,
      productType: previous?.productType ?? null,
      discountOption: previous?.discountOption ?? null,
      classificationAssigned: previous?.classificationAssigned,
      setOptions: previous?.setOptions ?? emptyBundleSetOptions(),
    }
  })
}

function EstimateMobileLineCard(props: {
  line: DraftLine
  index: number
  isReadOnly: boolean
  provider: DocCoeditProvider | null
  coeditPending: boolean
  lineStructureLocked: boolean
  lineIncl: number
  lineSupply: number
  lineVat: number
  /** 거래처 선택 여부 (R4-D4) — 마커 카피 분기/해제 기준. */
  hasPartner: boolean
  vatEditable: boolean
  onUpdate: (patch: Partial<DraftLine>, fromUser?: boolean) => void
  onLookup: () => void
  onRemove: () => void
  modelCell?: ReactNode
  children?: ReactNode
}) {
  const lineNumber = props.index + 1
  const priceStatus = priceSourceStatus(props.line, props.hasPartner)
  const priceStatusId = `estimate-mobile-price-status-${props.line.uid}`
  const priceChangedStatusId = `estimate-mobile-price-changed-${props.line.uid}`
  return (
    <div
      className={`mobile-line-card${props.line.priceRefreshChanged ? ' price-memory-refreshed-row' : ''}`}
      aria-describedby={props.line.priceRefreshChanged ? priceChangedStatusId : undefined}
      data-testid={`estimate-form-line-${props.index}`}
      data-price-source={props.line.priceSource ?? ''}
    >
      <div className="mobile-line-card-header">
        <span className="mobile-line-card-index">{lineNumber}</span>
        {props.line.priceRefreshChanged ? <PriceChangeIndicator id={priceChangedStatusId} /> : null}
        <button
          type="button"
          className="mobile-line-remove-button"
          onClick={props.onRemove}
          disabled={props.lineStructureLocked}
          aria-label={`라인 ${lineNumber} 삭제`}
        >
          삭제
        </button>
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">모델명</label>
        {props.modelCell ?? (
          <CollaborativeSlipInput
            provider={props.provider}
            coeditPending={props.coeditPending}
            fieldPath={`items.${props.index}.modelName`}
            value={props.line.modelName}
            onValueChange={(value) => props.onUpdate({
              modelName: value,
              productId: null,
              productName: '',
            }, true)}
            onDocSyncValueChange={(value) => props.onUpdate({
              modelName: value,
              productId: null,
              productName: '',
            })}
            onBlur={props.onLookup}
            inputSize="sm"
            readOnly={props.isReadOnly}
            type="text"
            placeholder="예: AJ040RXH4BC1"
            error={props.line.lookupError ?? undefined}
            aria-label={`라인 ${lineNumber} 모델명`}
          />
        )}
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">품목명</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.productName`}
          value={props.line.productName}
          onValueChange={(value) => props.onUpdate({ productName: value }, true)}
          onDocSyncValueChange={(value) => props.onUpdate({ productName: value })}
          inputSize="sm"
          readOnly={props.isReadOnly}
          type="text"
          aria-label={`라인 ${lineNumber} 품목명`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">규격</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.specification`}
          value={props.line.specification}
          onValueChange={(value) => props.onUpdate({ specification: value }, true)}
          onDocSyncValueChange={(value) => props.onUpdate({ specification: value })}
          inputSize="sm"
          readOnly={props.isReadOnly}
          type="text"
          aria-label={`라인 ${lineNumber} 규격`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">수량</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.quantity`}
          value={props.line.quantity}
          onValueChange={(value) => {
            if (!isQuantityEditable(props.line.productId, props.line.status)) return
            props.onUpdate(changeLineQuantity(asVatLine({ ...props.line, quantity: value }), value), true)
          }}
          onDocSyncValueChange={(value) => {
            if (!isQuantityEditable(props.line.productId, props.line.status)) return
            props.onUpdate(changeLineQuantity(asVatLine({ ...props.line, quantity: value }), value))
          }}
          inputSize="sm"
          readOnly={props.isReadOnly || !isQuantityEditable(props.line.productId, props.line.status)}
          type="text"
          inputMode="numeric"
          inputStyle={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          aria-label={`라인 ${lineNumber} 수량`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">단가(VAT포함)</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.unitPrice`}
          value={props.line.unitPrice}
          onValueChange={(value) => props.onUpdate({
            ...recalculateLineVat(asVatLine({ ...props.line, unitPrice: value }), 'PRICE'),
            unitPrice: value,
            priceSource: 'USER',
            priceMemoryUpdatedAt: null,
            priceRefreshChanged: false,
            partnerRefreshEligible: false,
            lookupLoading: false,
            lookupError: null,
            legacyPriceUntouched: false,
            vatDirty: false,
          })}
          // doc-sync 유래 값 반영은 분류(priceSource) 를 건드리지 않는다 — 자동채움 provider write
          // 가 pending REMEMBERED/CATALOG 분류를 USER 로 덮어 마커가 소멸하는 것을 차단(R4-F6).
          // 분류 판정은 페이지 구독(coeditLinesToDraftLines + localAutoPriceWrites)이 단일 소스.
          onDocSyncValueChange={(value) => props.onUpdate({ unitPrice: value })}
          inputSize="sm"
          readOnly={props.isReadOnly}
          type="text"
          inputMode="decimal"
          inputStyle={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          aria-label={`라인 ${lineNumber} 단가`}
          // [R8-DESIGN-6] 데스크톱 행과 동일 — 카드 div 의 aria-describedby 는 role=generic 이라
          // 전달되지 않으므로 "단가 변경" 을 이 input 의 describedby 체인에 append 한다.
          aria-describedby={[
            priceStatus ? priceStatusId : null,
            props.line.priceRefreshChanged ? priceChangedStatusId : null,
          ].filter(Boolean).join(' ') || undefined}
        />
        {/* R4-D2: 라인별 aria-live 제거 — 전역 고지는 배너(role="status") 1곳이 담당. */}
        {priceStatus ? (
          <span
            id={priceStatusId}
            role="note"
            aria-label={priceStatus.description}
            title={priceStatus.description}
            className="price-source-note"
          >
            {priceStatus.label}
          </span>
        ) : null}
        {/*
          [R8-DESIGN-5] 저장일 시각 병기 — 모바일 카드는 **터치 표면**이라 hover 가 없어
          title 이 영영 도달하지 않는다. SR 은 단가 input 의 aria-describedby → 위 note 의
          aria-label 로 저장일을 이미 듣지만(그래서 "키보드 미도달" 은 성립하지 않는다),
          **보이는 눈으로 터치하는 사용자**에게는 마커 라벨만 남고 "언제 저장된 단가인지" 가
          사라진다. 데스크톱 LineRow 는 hover 로 도달하므로 여유가 없는 그리드 행을 넓히지 않고
          공간이 있는 이 카드에만 병기한다.
          aria-hidden — 같은 정보를 위 note 의 aria-label 이 이미 전달하므로 SR 중복 낭독 방지.
        */}
        {priceStatus && props.line.priceMemoryUpdatedAt ? (
          <span className="price-source-note-date" aria-hidden="true">
            {`${props.line.priceMemoryUpdatedAt.slice(0, 10)} 저장`}
          </span>
        ) : null}
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">합계(VAT포함)</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.lineTotal`}
          value={props.line.lineTotal}
          onValueChange={(value) => props.onUpdate({
            ...editLineVat(asVatLine(props.line), 'TOTAL', value),
            vatDirty: true,
          }, true)}
          onDocSyncValueChange={(value) => props.onUpdate({ lineTotal: value })}
          readOnly={!props.vatEditable}
          inputMode="numeric"
          inputStyle={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          aria-label={`라인 ${lineNumber} 합계(VAT포함)`}
        />
        <span className="mobile-line-readonly mobile-line-readonly--strong">
          공급 {fmt(Number(props.line.supplyAmount))} · VAT {fmt(Number(props.line.vatAmount))}
        </span>
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">공급가액</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.supplyAmount`}
          value={props.line.supplyAmount}
          onValueChange={(value) => props.onUpdate({
            ...editLineVat(asVatLine(props.line), 'SUPPLY', value),
            vatDirty: true,
          }, true)}
          onDocSyncValueChange={(value) => props.onUpdate({ supplyAmount: value })}
          readOnly={!props.vatEditable}
          inputMode="numeric"
          inputStyle={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          aria-label={`라인 ${lineNumber} 공급가액`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">부가세</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.vatAmount`}
          value={props.line.vatAmount}
          onValueChange={(value) => props.onUpdate({
            ...editLineVat(asVatLine(props.line), 'VAT', value),
            vatDirty: true,
          }, true)}
          onDocSyncValueChange={(value) => props.onUpdate({ vatAmount: value })}
          readOnly={!props.vatEditable}
          inputMode="numeric"
          inputStyle={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          aria-label={`라인 ${lineNumber} 부가세`}
        />
        {props.line.vatWarning ? <span role="note">⚠ 부가세가 10%와 다릅니다</span> : null}
      </div>

      {props.children}
    </div>
  )
}

export function EstimateFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id?: string }>()
  const editId = params['id']
  const isEdit = Boolean(editId)
  const { canAccess } = usePermissions()
  const canViewProductLookups = canAccess('products.list', 'view')
  const isMobile = useIsMobile()

  usePageTitle(isEdit ? '견적서 편집' : '견적서 작성')

  const detailQuery = useQuery({
    queryKey: ['estimate', editId],
    queryFn: () => getEstimate(editId!),
    enabled: isEdit,
  })

  const [partner, setPartner] = useState<PartnerSummary | null>(null)
  const [partnerName, setPartnerName] = useState<string>('')
  const [partnerBusinessNo, setPartnerBusinessNo] = useState<string>('')
  const [partnerAddress, setPartnerAddress] = useState<string>('')
  const [partnerIdSnapshot, setPartnerIdSnapshot] = useState<string>('')
  /**
   * D-R8-1: hydrate 시점의 서버 partnerId — "legacy(원래 없음)" 와 "사용자가 해제함" 을 가르는 유일한 기준.
   *
   * <p>이 구분이 없으면 둘 중 하나를 반드시 틀린다: 공백 전반을 허용하면 <b>원래 거래처가 있던
   * 견적을 해제하고 저장</b>할 때 BE 가 null 을 "기존 보존" 으로 읽어 화면(빈칸)과 DB(구 거래처)가
   * 조용히 갈라지고, 공백 전반을 막으면 <b>legacy 견적이 영구히 저장 불가</b>가 된다.
   */
  const [hydratedPartnerId, setHydratedPartnerId] = useState<string>('')
  const [estimateDate, setEstimateDate] = useState<string>(today())
  const [validUntil, setValidUntil] = useState<string>(datePlusDays(today(), 30))
  const [memo, setMemo] = useState<string>('')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()])
  /**
   * 빈 lines 저장은 신규/우발적 공백 상태와 기존 견적의 명시적 전체 삭제를 구분해야 한다.
   * lineId 는 서버가 소유한 기존 라인만 식별하므로, 새 빈행이나 원격으로 비워진 행은 삭제 의도로
   * 승격되지 않는다.
   */
  const hydratedEstimateLineIdsRef = useRef<ReadonlySet<string>>(new Set())
  const explicitlyClearedEstimateLineIdsRef = useRef(new Set<string>())
  const hydratedEstimateDeletionContextRef = useRef<string | null>(null)
  // query data 커밋과 hydrate effect 사이에는 초기 빈 라인이 잠깐 렌더될 수 있다. 이때 거래처를
  // 선택하면 재조회 후보 0건으로 소실된 뒤 원 상세가 덮으므로, 어느 견적을 hydrate했는지 별도 추적한다.
  const [hydratedEstimateId, setHydratedEstimateId] = useState<string | null>(null)
  // R9 #5: 전표 생성/수정과 동일한 거래처 단가 재조회 수명주기·출처 해석을 공유한다.
  const partnerReprice = usePartnerPriceRefresh()
  const [topError, setTopError] = useState<string>('')
  const [lineLookupOpen, setLineLookupOpen] = useState(false)
  const [estimateFormCoeditProvider, setEstimateFormCoeditProvider] = useState<DocCoeditProvider | null>(null)
  const [estimateFormCoeditPending, setEstimateFormCoeditPending] = useState(false)
  const [priceLookupAnnouncement, setPriceLookupAnnouncement] = useState('')
  // 전표 수정의 repriceOutcomeByLineId 미러. 전역 문자열이 아니라 행별 outcome 을 보존해야
  // 사용자가 한 행만 직접 확정했을 때 그 행만 배너 집계에서 제거할 수 있다.
  const [partnerRefreshOutcomeByLineUid, setPartnerRefreshOutcomeByLineUid] = useState<
    ReadonlyMap<string, PartnerRepriceOutcome>
  >(() => new Map())
  /** D-R8-1: 거래처 가드 위반 표시 — 배너를 컨트롤과 결선(FormField error → aria-describedby+role=alert)한다. */
  const [partnerFieldInvalid, setPartnerFieldInvalid] = useState(false)
  /** D-R8-1: 가드 위반 시 해당 필드로 포커스 이동 — 배너만 띄우면 SR/키보드 사용자가 원인을 못 찾는다. */
  const partnerInputRef = useRef<HTMLInputElement>(null)
  const selectedPartnerIdRef = useRef<string>('')
  const partnerDcConfigRef = useRef<SlipDiscountConfig | null>(null)
  const partnerDcConfigPartnerCodeRef = useRef('')
  const partnerDcConfigPromiseRef = useRef<Promise<SlipDiscountConfig | null> | null>(null)
  const priceRefreshRequestRef = useRef(0)
  const modelLookupRequestRef = useRef(new Map<string, number>())
  const selectedProductRef = useRef(new Map<string, ProductOption>())
  const localAutoPriceWritesRef = useRef(new Map<string, LocalAutoPriceWrite>())
  const localSpecificationWritesRef = useRef(new Map<string, LocalSpecificationWrite>())
  const linesRef = useRef(lines)
  linesRef.current = lines
  const ensurePartnerDcConfig = async (partnerCode: string): Promise<SlipDiscountConfig | null> => {
    if (!shouldApplyPartnerDcToEstimate(!isEdit) || !partnerCode) return null
    if (partnerDcConfigPartnerCodeRef.current === partnerCode && partnerDcConfigPromiseRef.current) {
      return partnerDcConfigPromiseRef.current
    }
    partnerDcConfigPartnerCodeRef.current = partnerCode
    const promise = getPartnerDcConfig(partnerCode).then((config) => {
      const normalized = config
        ? {
            homeMultiDc: config.homeMultiDc,
            commercialMultiDc: config.commercialMultiDc,
            threeSixty: config.threeSixty,
            fourWay: config.fourWay,
            oneWay: config.oneWay,
            stand: config.stand,
            deluxe: config.deluxe,
            firstGrade: config.firstGrade,
          }
        : null
      partnerDcConfigRef.current = normalized
      return normalized
    })
    partnerDcConfigPromiseRef.current = promise
    return promise
  }
  const markExplicitLineDeletion = (line: DraftLine) => {
    if (!isEdit || !line.lineId || !hydratedEstimateLineIdsRef.current.has(line.lineId)) return
    explicitlyClearedEstimateLineIdsRef.current.add(line.lineId)
  }
  const clearExplicitLineDeletion = (line: DraftLine) => {
    if (!line.lineId) return
    explicitlyClearedEstimateLineIdsRef.current.delete(line.lineId)
  }
  /**
   * R4-D4: 마커 카피 분기/해제 기준 — 저장 payload partnerId·가격기억 흐름과 동일 소스(반응형 스냅샷).
   *
   * <p>R8-DESIGN-8 — 이 플래그의 의미는 "사용자가 거래처를 선택했나" 가 <b>아니라</b>
   * <b>"(거래처+품목) 가격기억을 귀속시킬 partnerId 가 지금 있나"</b> 다. 그래서 "사용자 해제" 와
   * "legacy 견적(partner_id NULL)" 이 같은 false 로 수렴하는 것은 <b>의도된 동치</b>다 —
   * 두 경우 모두 귀속 대상 UUID 가 없어 REMEMBERED 마커를 걸 근거가 없고, CATALOG 설명도
   * 거래처를 단정해선 안 된다. 두 상태를 <b>구분해야 하는 곳은 저장 가드 하나뿐</b>이며
   * (해제=차단 / legacy=허용), 그건 {@code hydratedPartnerId} 가 담당한다(D-R8-1).
   */
  const hasPartner = Boolean(partnerIdSnapshot)
  // R4-D9: 배너 live region 은 상시 마운트 — 내용과 함께 조건부 마운트하면 일부 SR 이 미낭독.
  const activePartnerRefreshEntries = lines.flatMap((line) => {
    const outcome = partnerRefreshOutcomeByLineUid.get(line.uid)
    if (!outcome) return []
    // 원격 공동편집에서 직접 단가를 확정한 행도 coedit 변환 결과가 USER 이므로 즉시 제외한다.
    const outcomeStillApplies = outcome.source === 'UNAVAILABLE'
      ? line.priceSource == null && Boolean(line.lookupError)
      : line.priceSource === outcome.source
    return outcomeStillApplies ? [{ line, outcome }] : []
  })
  const partnerRefreshAnnouncement = estimatePartnerRepriceBannerText(
    activePartnerRefreshEntries.map(({ outcome }) => outcome),
    activePartnerRefreshEntries.filter(({ line }) => line.priceRefreshChanged).length,
  )
  const priceRefreshNoticeActive = activePartnerRefreshEntries.length > 0
  const priceBannerAnnouncement = partnerRefreshAnnouncement || priceLookupAnnouncement

  const isReadOnly =
    isEdit &&
    detailQuery.data &&
    detailQuery.data.status !== 'QUOTE_DRAFT' &&
    detailQuery.data.status !== 'QUOTE_SENT'
  const canCollabEdit =
    isEdit &&
    !!editId &&
    !!detailQuery.data &&
    !isReadOnly &&
    canAccess('estimates.list', 'update')
  const coeditActive = Boolean(estimateFormCoeditProvider) || estimateFormCoeditPending
  // S7: coedit 연결 시점에 이미 존재하던 유효 라인만 품목 교체를 허용한다.
  // trailing 빈행은 coedit 중 구조 추가 대상이므로, 이후 productId가 채워져도 자격이
  // 승격되지 않도록 스냅샷을 한 번만 만든다. uid는 CRDT 재동기화에서도 기존 index에
  // 매핑되어 유지되고, lineId가 없는 미저장 행도 안전하게 구분한다.
  const coeditEditableLineUidsRef = useRef<ReadonlySet<string>>(new Set())
  const coeditLineSnapshotTakenRef = useRef(false)
  const isCoeditLineValueEditable = (line: DraftLine) =>
    !coeditActive || coeditEditableLineUidsRef.current.has(line.uid)
  // coedit useEffect 가 detailQuery.data 객체를 deps 로 두면 React Query 리페치/SSE invalidate 마다
  // provider 가 재생성돼 협업 세션이 끊기고 미저장 CRDT 델타가 재시드로 유실된다(듀얼리뷰 HIGH).
  // seed 용 최신 스냅샷은 ref 로 읽어 effect 를 안정 트리거(canCollabEdit/editId/isEdit)로만 재실행한다.
  const estimateDataRef = useRef<EstimateDetail | null>(null)
  estimateDataRef.current = detailQuery.data ?? null

  // edit mode hydrate
  useEffect(() => {
    if (!isEdit) return
    const e = detailQuery.data
    if (!e) return
    if (estimateFormCoeditProvider) return
    selectedPartnerIdRef.current = e.partnerId
    setPartnerIdSnapshot(e.partnerId)
    setHydratedPartnerId(e.partnerId ?? '')
    // D-R8-1: hydrate 가 setPartner() 를 끝내 호출하지 않아 `partner` state 가 편집 모드 내내
    // null 로 남았다 — 그 결과 (1) PartnerAutocomplete 이 거래처 보유 견적에서도 항상 빈 칸으로
    // 보이고 (2) effectivePartnerId 의 2차 폴백 분기가 구조적으로 죽어 있었다.
    // legacy(partnerId 없음)여도 거래처명이 있으면 표시한다 — 무엇이 들어있는지 감추지 않는다.
    setPartner(e.partnerName
      ? {
          partnerId: e.partnerId || null,
          businessRegistrationNumber: e.partnerBusinessNo ?? '',
          companyName: e.partnerName,
          representativeName: null,
          contactPhone: null,
          address: e.partnerAddress ?? null,
          groupName: null,
          note: null,
        }
      : null)
    setPartnerName(e.partnerName)
    setPartnerBusinessNo(e.partnerBusinessNo ?? '')
    setPartnerAddress(e.partnerAddress ?? '')
    setEstimateDate(e.estimateDate)
    setValidUntil(e.validUntil ?? '')
    setMemo(e.memo ?? '')
    const hydratedLines = toDraftLinesFromEstimate(e)
    const nextHydratedLineIds = new Set(
      hydratedLines.flatMap((line) => line.lineId ? [line.lineId] : []),
    )
    const sameHydratedLineIds = nextHydratedLineIds.size === hydratedEstimateLineIdsRef.current.size
      && [...nextHydratedLineIds].every((lineId) => hydratedEstimateLineIdsRef.current.has(lineId))
    if (hydratedEstimateDeletionContextRef.current !== editId || !sameHydratedLineIds) {
      hydratedEstimateLineIdsRef.current = nextHydratedLineIds
      explicitlyClearedEstimateLineIdsRef.current.clear()
      hydratedEstimateDeletionContextRef.current = editId ?? null
    }
    const readOnlyEstimate = e.status !== 'QUOTE_DRAFT' && e.status !== 'QUOTE_SENT'
    const draftLines = readOnlyEstimate
      ? hydratedLines
      : ensureTrailingBlankRow(hydratedLines, emptyLine, (line) => Boolean(line.productId))
    linesRef.current = draftLines
    setLines(draftLines)
    setHydratedEstimateId(editId ?? null)
  }, [editId, isEdit, detailQuery.data, estimateFormCoeditProvider])

  // 상태 조회는 협업 provider 연결/반영 경로와 분리한다. 품목 상태가 늦어져도 상대 입력
  // 수신을 기다리게 하지 않으며, 완료 시 현재 라인의 상태 필드만 병합한다.
  useEffect(() => {
    if (!isEdit || !editId || !detailQuery.data) return
    const estimateIdAtStart = detailQuery.data.id
    const draftLines = linesRef.current
    void hydrateCurrentProductStatuses(draftLines, lookupProducts).then((hydratedWithCurrentStatuses) => {
      if (estimateDataRef.current?.id !== estimateIdAtStart) return
      const statusByProductId = new Map(
        hydratedWithCurrentStatuses
          .filter((line) => line.productId)
          .map((line) => [line.productId!, line.status ?? null]),
      )
      const currentLines = linesRef.current.map((line) => line.productId && statusByProductId.has(line.productId)
        ? { ...line, status: statusByProductId.get(line.productId) ?? null }
        : line)
      linesRef.current = currentLines
      setLines(currentLines)
    })
  }, [editId, isEdit, detailQuery.data])

  useEffect(() => {
    const estimate = estimateDataRef.current
    if (!isEdit || !editId || !estimate || !canCollabEdit) {
      setEstimateFormCoeditProvider(null)
      setEstimateFormCoeditPending(false)
      return undefined
    }

    let disposed = false
    let provider: DocCoeditProvider | null = null
    let unsubscribeDoc: (() => void) | null = null
    coeditEditableLineUidsRef.current = new Set()
    coeditLineSnapshotTakenRef.current = false
    setEstimateFormCoeditPending(true)

    // 계보/가격기억 귀속의 권위 — 현재 로드된 상세 응답의 라인 id 집합(전표와 동일 계약).
    const knownServerLineIds = toServerLineIdSet(estimate.lines)

    const applyProviderState = (nextProvider: DocCoeditProvider) => {
      // D-R8-7: 상대 피어의 거래처 재선택 수신. 미수신 시 구 partnerId 로 저장한다.
      const nextPartnerId = nextProvider.getHeaderValue('partnerId')
      const nextPartnerName = nextProvider.getHeaderValue('partnerName')
      const nextPartnerBizNo = nextProvider.getHeaderValue('partnerBusinessNo')
      const nextPartnerAddress = nextProvider.getHeaderValue('partnerAddress')
      setPartnerIdSnapshot(nextPartnerId)
      setPartnerName(nextPartnerName)
      setPartnerBusinessNo(nextPartnerBizNo)
      setPartnerAddress(nextPartnerAddress)
      // `partner` 는 PartnerAutocomplete 의 controlled value 다 — 함께 갱신하지 않으면 원격
      // 거래처 변경 시 자동완성엔 구 거래처명이, 바로 옆 read-only '거래처명' 엔 새 이름이 떠
      // 한 화면이 두 거래처를 동시에 주장한다(R8-DESIGN-1 이 지적한 "입력 경로 2개" 의 재발).
      // selectedPartnerIdRef 도 함께 맞춰 in-flight 단가 재조회의 stale guard 기준을 일치시킨다.
      selectedPartnerIdRef.current = nextPartnerId
      setPartner(nextPartnerName
        ? {
            partnerId: nextPartnerId || null,
            businessRegistrationNumber: nextPartnerBizNo,
            companyName: nextPartnerName,
            representativeName: null,
            contactPhone: null,
            address: nextPartnerAddress || null,
            groupName: null,
            note: null,
          }
        : null)
      setEstimateDate(nextProvider.getHeaderValue('estimateDate'))
      setValidUntil(nextProvider.getHeaderValue('validUntil'))
      setMemo(nextProvider.getHeaderValue('memo'))
      const nextLines = ensureTrailingBlankRow(
        coeditLinesToDraftLines(
          nextProvider,
          linesRef.current,
          knownServerLineIds,
          localAutoPriceWritesRef.current,
          localSpecificationWritesRef.current,
        ),
        emptyLine,
        (line) => Boolean(line.productId),
      )
      nextLines.forEach((line) => {
        if (line.productId) clearExplicitLineDeletion(line)
      })
      if (!coeditLineSnapshotTakenRef.current) {
        coeditEditableLineUidsRef.current = new Set(
          nextLines.filter((line) => Boolean(line.productId)).map((line) => line.uid),
        )
        coeditLineSnapshotTakenRef.current = true
      }
      linesRef.current = nextLines
      setLines(nextLines)
    }

    void createDocCoeditProvider({
      documentId: editId,
      basePath: `/slips/estimates/${toOrderPathId(editId)}`,
      headerTextFields: ESTIMATE_HEADER_TEXT_FIELDS,
    }).then((nextProvider) => {
      if (disposed) {
        nextProvider.destroy()
        return
      }
      provider = nextProvider
      const serverLineCount = ensureTrailingBlankRow(
        toDraftLinesFromEstimate(estimate),
        emptyLine,
        (line) => Boolean(line.productId),
      ).length
      const providerLineCount = nextProvider.items.toArray().length
      const serverVersion = String(estimate.version)
      const providerServerVersion = nextProvider.getHeaderValue(ESTIMATE_SERVER_VERSION_HEADER)
      const serverVersionChanged = providerServerVersion !== ''
        && providerServerVersion !== serverVersion
      const restoreFenceMatched = consumeEstimateRestoreFence(editId, serverVersion)
      // 서버 응답은 trailing 빈행을 하나만 만들지만, Y.Doc에는 사용자가 이미 입력을
      // 시작한 미저장 행이 그보다 여러 개 존재할 수 있다. provider가 서버 기준보다
      // 앞선 경우를 구조 불일치로 오인해 full-seed하면 다른 참가자 진입/재연결 때
      // 미저장 입력을 잃는다. 비어 있거나 서버보다 뒤처진 문서만 서버 seed로 복구하고,
      // 같은 서버 version 세대의 앞선 Y.Doc은 협업 문서의 현재 상태로 보존한다.
      // 버전 복원은 서버 version을 바꾸므로, 그때만 stale-ahead 문서를 server seed로
      // 수렴시킨다. 이 marker가 없던 구 문서는 미저장 입력 보존을 우선해 그대로 읽고
      // 현재 세대를 기록한다.
      if (nextProvider.isEmpty() || providerLineCount < serverLineCount || serverVersionChanged || restoreFenceMatched) {
        seedEstimateCoeditProvider(nextProvider, estimate)
      } else if (providerLineCount === serverLineCount
        && coeditLineIdsAreStale(nextProvider, knownServerLineIds)) {
        // 라인수는 같은데 lineId 가 전부 클라 랜덤 UUID(lineId seed 이전 구 Y.Doc) — 그대로 두면
        // 전 라인이 신규로 강등돼 계보가 소실되고 계보 보유 견적이면 BE requireLineIdContract 가
        // 400(R8-FE-9). ⚠️ 전표 R8 회귀와 동일: full-seed 는 원격 헤더/셀 편집을 파괴하므로
        // 아이템 lineId 만 서버 기준 in-place 복구하고 나머지 값은 보존한다(reseedCoeditLineIds).
        reseedCoeditLineIds(
          nextProvider,
          toDraftLinesFromEstimate(estimate).map((line) => line.lineId ?? ''),
        )
        if (!nextProvider.getHeaderValue('partnerId') && estimate.partnerId) {
          nextProvider.setHeaderValue('partnerId', estimate.partnerId)
        }
      } else if (!nextProvider.getHeaderValue('partnerId') && estimate.partnerId) {
        // partnerId 헤더 편입(D-R8-7) 이전에 만들어져 서버에 영속된 Y.Doc 은 그 키가 없다.
        // 재시드 대상이 아니면(예: 라인 0건 견적) 여기서 backfill 하지 않는 한
        // applyProviderState 가 빈 문자열로 partnerIdSnapshot 을 덮어 저장이 막힌다.
        nextProvider.setHeaderValue('partnerId', estimate.partnerId)
      }
      if (providerServerVersion !== serverVersion) {
        nextProvider.setHeaderValue(ESTIMATE_SERVER_VERSION_HEADER, serverVersion)
      }
      applyProviderState(nextProvider)
      unsubscribeDoc = nextProvider.subscribeDoc(() => applyProviderState(nextProvider))
      setEstimateFormCoeditProvider(nextProvider)
      setEstimateFormCoeditPending(false)
    }).catch(() => {
      if (disposed) return
      setEstimateFormCoeditProvider(null)
      setEstimateFormCoeditPending(false)
    })

    return () => {
      disposed = true
      unsubscribeDoc?.()
      if (provider) provider.destroy()
      setEstimateFormCoeditProvider(null)
      setEstimateFormCoeditPending(false)
    }
    // deps 에서 detailQuery.data 제외 — 리페치/SSE 재생성 방지(estimate 는 estimateDataRef 로 최신값 사용).
  }, [canCollabEdit, editId, isEdit])

  const totals = useMemo(() => {
    // HIGH-3(#824 R1): 라인별 권위 열(recalculateLineVat(line.authority))을 그대로 합산한다.
    // 종전엔 raw unitPrice×quantity 를 이 memo 가 독자적으로 10% 재분해해, 행에서 SUPPLY/VAT/TOTAL
    // 권위로 직접 편집한 값(예: 부가세 0 직접 입력)이 하단 합계에 반영되지 않았다 — 행은 공급
    // 20,000·부가세 0 인데 하단은 독자 재계산으로 공급 18,182·부가세 1,818 을 보이는 식.
    // SlipFormPage(전표) 의 totals memo 와 동일 패턴으로 정렬한다.
    const valid = lines.filter((l) => l.productId && Number.parseInt(l.quantity || '0', 10) > 0)
    let supply = 0
    let total = 0
    for (const l of valid) {
      const calculated = recalculateLineVat(asVatLine(l), l.authority ?? 'PRICE')
      supply += Number(calculated.supplyAmount)
      total += Number(calculated.lineTotal)
    }
    return { supply, vat: total - supply, total }
  }, [lines])

  /**
   * D-R8-7/R8-DESIGN-1: 거래처 4필드를 CRDT 트랜잭션 1회로 원자 전파한다.
   *
   * <p>coedit 중에는 이 전파가 <b>필수</b>다 — applyProviderState 가 doc 변경마다 헤더를
   * 폼 state 로 되읽으므로, 전파하지 않으면 로컬 선택이 즉시 구 CRDT 값으로 되돌아간다.
   * 필드를 따로 쓰면 상대 피어가 중간 상태(새 이름 + 구 UUID)를 관측하는 창이 열린다.
   */
  const propagatePartnerToCoedit = (
    partnerId: string, name: string, bizNo: string, address: string,
  ) => {
    const provider = estimateFormCoeditProvider
    if (!provider) return
    provider.doc.transact(() => {
      provider.setHeaderValue('partnerId', partnerId)
      provider.setHeaderValue('partnerName', name)
      provider.setHeaderValue('partnerBusinessNo', bizNo)
      provider.setHeaderValue('partnerAddress', address)
    })
  }

  const handleSelectPartner = (p: PartnerSummary) => {
    const nextPartnerId = p.partnerId && UUID_PATTERN.test(p.partnerId) ? p.partnerId : ''
    const nextBizNo = p.businessRegistrationNumber
    const nextAddress = p.address ?? ''
    selectedPartnerIdRef.current = nextPartnerId
    setPartner(p)
    setPartnerIdSnapshot(nextPartnerId)
    setPartnerName(p.companyName)
    setPartnerBusinessNo(nextBizNo)
    setPartnerAddress(nextAddress)
    propagatePartnerToCoedit(nextPartnerId, p.companyName, nextBizNo, nextAddress)
    partnerDcConfigRef.current = null
    partnerDcConfigPromiseRef.current = null
    partnerDcConfigPartnerCodeRef.current = p.partnerCode ?? ''
    if (nextPartnerId) {
      const configPromise = ensurePartnerDcConfig(p.partnerCode ?? '')
      void refreshAutoPricesForPartner(nextPartnerId)
      void configPromise.then(() => {
        if (partnerDcConfigRef.current && selectedPartnerIdRef.current === nextPartnerId) {
          return refreshAutoPricesForPartner(nextPartnerId)
        }
        return undefined
      })
    }
  }

  const searchPartnerOptions = async (q: string): Promise<PartnerOption[]> => {
    const rows = await searchPartners(q, 8)
    return rows.map((row) => ({
      id: row.partnerId ?? undefined,
      partnerCode: row.partnerCode ?? '',
      name: row.companyName,
      bizNo: row.businessRegistrationNumber,
      phone: row.contactPhone ?? undefined,
    }))
  }

  /**
   * 견적 라인 품목 검색 — 판매전표와 같은 ProductAutocomplete 공용 검색 경로를 사용한다.
   * 기존 정확 모델 lookup은 레거시 서버/테스트 계약의 안전망으로만 남겨, 부분검색 API가
   * 후보를 반환하면 절대 실행하지 않는다.
   */
  const searchEstimateProducts = async (q: string): Promise<ProductOption[]> => {
    const candidates = (await searchProducts(q, { usageScope: 'ESTIMATE', size: 50 }))
      .filter((candidate) => isSelectableProductStatus(candidate.status))
    if (candidates.length > 0) return candidates
    try {
      const legacy = await lookupProductByModelName(q)
      if (!isSelectableProductStatus(legacy.status)) return []
      return [{
        id: legacy.productId,
        modelName: legacy.modelName,
        productName: legacy.productName,
        sellingPrice: Number(legacy.sellingPrice),
        modelCode: legacy.modelCode,
        productType: legacy.productType,
        fixedDiscountRate: legacy.fixedDiscountRate,
        fixedDiscountSource: legacy.fixedDiscountSource,
        discountOption: legacy.discountOption ?? null,
        classificationAssigned: legacy.discountOption != null,
        status: legacy.status,
      }]
    } catch {
      return []
    }
  }

  const handlePartnerOptionChange = (option: PartnerOption | null) => {
    if (!option) {
      selectedPartnerIdRef.current = ''
      priceRefreshRequestRef.current += 1
      partnerReprice.invalidate()
      setPartner(null)
      setPartnerIdSnapshot('')
      setPartnerName('')
      setPartnerBusinessNo('')
      setPartnerAddress('')
      // R8-FE-6(=R8-DESIGN-2·R7-FE-3): 해제 시 stale 단건 안내를 비운다 — 미클리어 시
      // 배너 비활성 폴백이 "라인 N 거래처 최근단가 적용" 을 계속 낭독한다(aria-live 거짓 고지).
      // 재선택 refresh 시작에서만 비우던 R6-M5 의 누락분. slip/estimate 양 폼 동시 처리.
      setPriceLookupAnnouncement('')
      setPartnerRefreshOutcomeByLineUid(new Map())
      // D-R4-4: 단가값·priceSource 는 유지하고 마커만 해제한다(재선택 시 재조회 자격 보존).
      propagatePartnerToCoedit('', '', '', '')
      setLines((prev) => {
        const next = prev.map((line) => ({
          ...line,
          lookupLoading: false,
          priceRefreshChanged: false,
        }))
        linesRef.current = next
        return next
      })
      return
    }
    handleSelectPartner({
      partnerId: option.id ?? null,
      businessRegistrationNumber: option.bizNo ?? '',
      partnerCode: option.partnerCode,
      companyName: option.name,
      representativeName: null,
      contactPhone: option.phone ?? null,
      address: null,
      groupName: null,
      note: null,
    })
  }

  const updateLine = (index: number, patch: Partial<DraftLine>, fromUser = false) => {
    if (fromUser && patch.specification !== undefined && estimateFormCoeditProvider) {
      const line = linesRef.current[index]
      if (line) {
        localSpecificationWritesRef.current.set(line.uid, {
          previousSpecification: estimateFormCoeditProvider.getItemValue(index, 'specification'),
          specification: patch.specification,
        })
      }
    }
    const normalizedPatch = fromUser
      && patch.specification !== undefined
      && patch.specificationSource === undefined
      ? { ...patch, specificationSource: 'USER' as const }
      : patch
    if (patch.unitPrice !== undefined && patch.priceSource === 'USER') {
      const lineUid = linesRef.current[index]?.uid
      // 사용자가 단가를 직접 확정하면 해당 행의 자동 출처/미확보 경고와 배너 집계만 해제한다.
      // 다른 행의 outcome 은 보존해 전표 수정 clearRepriceHighlight 와 같은 계약을 유지한다.
      if (lineUid) {
        setPartnerRefreshOutcomeByLineUid((prev) => {
          if (!prev.has(lineUid)) return prev
          const next = new Map(prev)
          next.delete(lineUid)
          return next
        })
      }
      setPriceLookupAnnouncement('')
    }
    setLines((prev) => {
      const before = prev[index]
      if (!before) return prev
      const after = { ...before, ...normalizedPatch }
      const next = fromUser
        ? appendBlankRowIfLastChanged(prev, before, after, (line) => line.uid, emptyLine, (a, b) => a.uid === b.uid
          && a.modelName === b.modelName && a.productName === b.productName && a.specification === b.specification
          && a.quantity === b.quantity && a.unitPrice === b.unitPrice && a.supplyAmount === b.supplyAmount
          && a.vatAmount === b.vatAmount && a.lineTotal === b.lineTotal && a.note === b.note)
        : prev.map((l, i) => (i === index ? after : l))
      linesRef.current = next
      return next
    })
    if (fromUser && patch.specification !== undefined && estimateFormCoeditProvider) {
      try {
        estimateFormCoeditProvider.setItemValue(index, 'specificationSource', 'USER')
      } catch {
        // local state remains authoritative while the coedit provider unmounts.
      }
    }
  }

  const updatePrice = (index: number, unitPrice: string) => {
    const current = linesRef.current[index]
    if (!current) return
    const { quantity, shouldSyncQuantity } = resolvePriceInputQuantitySync(
      current.goodsType,
      current.quantity,
      unitPrice,
    )
    updateLine(index, {
      ...recalculateLineVat(asVatLine({ ...current, unitPrice, quantity }), 'PRICE'),
      unitPrice,
      quantity,
      priceSource: 'USER',
      priceMemoryUpdatedAt: null,
      priceRefreshChanged: false,
      partnerRefreshEligible: false,
      lookupLoading: false,
      lookupError: null,
      legacyPriceUntouched: false,
      vatDirty: false,
    }, true)
    if (shouldSyncQuantity && estimateFormCoeditProvider) {
      try {
        estimateFormCoeditProvider.setItemValue(index, 'quantity', quantity)
      } catch {
        // provider가 해제되는 순간에는 로컬 라인을 권위로 유지한다.
      }
    }
  }

  const updateQuantity = (index: number, quantity: string) => {
    const current = linesRef.current[index]
    if (!current || !isQuantityEditable(current.productId, current.status)) return
    updateLine(index, changeLineQuantity(asVatLine({ ...current, quantity }), quantity), true)
  }

  const updateVat = (index: number, authority: 'SUPPLY' | 'VAT' | 'TOTAL', value: string) => {
    const current = linesRef.current[index]
    if (!current) return
    updateLine(index, {
      ...editLineVat(asVatLine(current), authority, value),
      vatDirty: true,
    }, true)
  }

  const refreshAutoPricesForPartner = async (effectivePartnerId: string) => {
    setPriceLookupAnnouncement('')
    setPartnerRefreshOutcomeByLineUid(new Map())
    const requestId = ++priceRefreshRequestRef.current
    const candidates = linesRef.current
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.productId
        && !line.isBundleComponent
        && (line.partnerRefreshEligible || isAutoPriceSource(line.priceSource)))
    if (candidates.length === 0) return
    const snapshotByUid = new Map(candidates.map(({ line }) => [line.uid, line]))
    const candidateUids = new Set(snapshotByUid.keys())
    const loadingLines = linesRef.current.map((line) =>
      candidateUids.has(line.uid)
        ? { ...line, lookupLoading: true, priceRefreshChanged: false }
        : line,
    )
    linesRef.current = loadingLines
    setLines(loadingLines)

    try {
      // 편집 hydrate 라인은 catalogUnitPrice가 없으므로 batch lookup으로 실제 판매가를 확보한다.
      // 삭제품목·sellingPrice null·실패는 null로 남겨 UNAVAILABLE 처리한다.
      const missingCatalogProductIds = candidates
        .filter(({ line }) => line.catalogUnitPrice == null)
        .map(({ line }) => line.productId!)
      const catalogProducts = missingCatalogProductIds.length > 0
        ? await lookupProducts(missingCatalogProductIds)
        : []
      if (priceRefreshRequestRef.current !== requestId) return
      const catalogByProductId = new Map<string, string>()
      for (const product of catalogProducts) {
        if (product.id && product.sellingPrice != null && Number.isFinite(product.sellingPrice)) {
          catalogByProductId.set(product.id, String(product.sellingPrice))
        }
      }
      const repriceCandidates: PartnerRepriceCandidate[] = candidates.map(({ line }) => ({
        key: line.uid,
        productId: line.productId!,
        currentUnitPrice: line.unitPrice,
        catalogFallback: line.catalogUnitPrice ?? catalogByProductId.get(line.productId!) ?? null,
        ...(partnerDcConfigRef.current
          ? {
              discountInput: {
                classificationOptions: line.discountOption ? [line.discountOption] : [],
                classificationAssigned: line.classificationAssigned,
                modelCode: line.modelCode,
                fixedDiscountRate: line.fixedDiscountRate,
                category: line.categoryKey === 'homemulti'
                  ? 'HOMEMULTI'
                  : line.categoryKey === 'commercialMulti'
                    ? 'COMMERCIAL_MULTI'
                    : 'OTHER',
                hasVariableDiscount: line.hasVariableDiscount,
              },
            }
          : {}),
      }))
      const { outcomes, isCurrent } = await partnerReprice.run(
        effectivePartnerId,
        repriceCandidates,
        partnerDcConfigRef.current,
      )
      const requestIsCurrent = () => partnerRepriceSessionIsCurrent(
        requestId,
        priceRefreshRequestRef.current,
        effectivePartnerId,
        selectedPartnerIdRef.current,
        isCurrent(),
      )
      if (!requestIsCurrent()) return
      const outcomeByUid = new Map(outcomes.map((outcome) => [outcome.key, outcome]))
      const appliedOutcomeByUid = new Map<string, PartnerRepriceOutcome>()
      const providerWrites: Array<{ index: number; line: DraftLine }> = []
      const nextLines = linesRef.current.map((current, index) => {
        const snapshot = snapshotByUid.get(current.uid)
        const outcome = outcomeByUid.get(current.uid)
        if (!snapshot || !outcome || current.productId !== snapshot.productId) return current
        if (current.isBundleComponent || (!current.partnerRefreshEligible && !isAutoPriceSource(current.priceSource))) {
          return { ...current, lookupLoading: false, priceRefreshChanged: false }
        }
        const nextUnitPrice = outcome.source === 'UNAVAILABLE' ? '' : outcome.unitPrice
        const nextLine: DraftLine = {
          ...recalculateLineVat(asVatLine({ ...current, unitPrice: nextUnitPrice }), 'PRICE'),
          unitPrice: nextUnitPrice,
          priceSource: outcome.source === 'UNAVAILABLE' ? null : outcome.source,
          priceMemoryUpdatedAt: outcome.updatedAt,
          priceRefreshChanged: nextUnitPrice !== current.unitPrice,
          partnerRefreshEligible: true,
          lookupLoading: false,
          lookupError: outcome.source === 'UNAVAILABLE'
            ? '카탈로그 판매가를 확인할 수 없습니다. 단가를 직접 입력해 주세요.'
            : null,
        }
        appliedOutcomeByUid.set(current.uid, outcome)
        providerWrites.push({ index, line: nextLine })
        return nextLine
      })
      // state 및 CRDT 적용 직전에 한 번 더 같은 세션인지 확인한다. 카탈로그→기억조회 사이에
      // 시작된 더 최신 거래처 요청은 여기부터 어떤 쓰기도 수행할 수 없다.
      if (!requestIsCurrent()) return
      linesRef.current = nextLines
      setLines(nextLines)
      setPartnerRefreshOutcomeByLineUid(appliedOutcomeByUid)
      if (estimateFormCoeditProvider && providerWrites.length > 0 && requestIsCurrent()) {
        // 전표 수정과 동일하게 모든 기대값을 먼저 등록하고 한 transaction으로 쓴다. 행별 write는
        // 중간 Y.Doc 알림이 아직 쓰지 않은 다음 행을 원격 USER 값으로 오인하는 창을 만든다.
        for (const write of providerWrites) {
          localAutoPriceWritesRef.current.set(write.line.uid, {
            unitPrice: write.line.unitPrice,
            priceSource: write.line.priceSource,
            priceMemoryUpdatedAt: write.line.priceMemoryUpdatedAt,
            priceRefreshChanged: write.line.priceRefreshChanged,
            partnerRefreshEligible: write.line.partnerRefreshEligible,
            lookupError: write.line.lookupError,
          })
        }
        try {
          estimateFormCoeditProvider.doc.transact(() => {
            for (const write of providerWrites) {
              // 동기 provider callback이 현재 거래처를 바꿨다면 남은 옛 요청 write를 중단한다.
              if (!requestIsCurrent()) break
              estimateFormCoeditProvider.setItemValue(write.index, 'unitPrice', write.line.unitPrice)
            }
          })
        } catch {
          for (const write of providerWrites) {
            localAutoPriceWritesRef.current.delete(write.line.uid)
          }
        }
      }
    } finally {
      // stale 요청은 최신 요청의 loading을 해제하지 않는다.
      if (priceRefreshRequestRef.current === requestId && selectedPartnerIdRef.current === effectivePartnerId) {
        const settled = linesRef.current.map((line) => snapshotByUid.has(line.uid)
          ? { ...line, lookupLoading: false }
          : line)
        linesRef.current = settled
        setLines(settled)
      }
    }
  }
  const removeLine = (index: number) => {
    setLines((prev) => {
      const target = prev[index]
      if (!target) return prev
      markExplicitLineDeletion(target)
      const normalized = removeLinePreservingMinimum(
        prev,
        target.uid,
        (line) => line.uid,
        emptyLine,
        1,
        (line) => Boolean(line.productId),
      )
      linesRef.current = normalized
      return normalized
    })
  }

  // 모델명 onBlur lookup
  const handleModelLookup = async (index: number) => {
    const line = linesRef.current[index]
    // provider 가 언마운트 중 destroy 됐을 때 getItemValue 예외로 lookup 이 중단되지 않게 방어(리뷰 LOW).
    let coeditModelName = ''
    try {
      coeditModelName = estimateFormCoeditProvider?.getItemValue(index, 'modelName') ?? ''
    } catch {
      coeditModelName = ''
    }
    const modelName = (coeditModelName || line?.modelName || '').trim()
    if (!line || !modelName) return
    const requestId = (modelLookupRequestRef.current.get(line.uid) ?? 0) + 1
    modelLookupRequestRef.current.set(line.uid, requestId)
    setPriceLookupAnnouncement('')
    updateLine(index, { lookupLoading: true, lookupError: null })

    // R4-F3: 품목 바인딩과 가격 적용의 신선도 게이트 분리.
    // 품목 게이트 — 같은 라인(uid)·같은 모델명 텍스트·최신 요청이면 lookup 결과의 품목 필드
    // (productId/productName/productType/catalogUnitPrice)를 적용한다. 기존에는 priceSource/
    // 거래처 변화까지 한 게이트여서 lookup 중 단가 타이핑·거래처 선택 시 productId 바인딩이
    // 통째로 폐기 → 저장 차단 + 사유 무표시가 발생했다(전표 applyProductSelection 과 정렬).
    const isProductBindCurrent = (current: DraftLine): boolean =>
      modelLookupRequestRef.current.get(line.uid) === requestId
      && current.uid === line.uid
      && (current.modelName || '').trim() === modelName

    const finishStaleRequest = () => {
      // 최신 요청이 따로 시작됐다면(requestId 불일치) 그 요청이 스피너를 관리한다. 모델명
      // 텍스트가 이미 바뀐 경우에도 스피너는 해제해야 저장 busy 게이트(R4-F4)가 고착되지 않는다.
      setLines((prev) => {
        const next = prev.map((current) =>
          modelLookupRequestRef.current.get(line.uid) === requestId && current.uid === line.uid
            ? { ...current, lookupLoading: false }
            : current,
        )
        linesRef.current = next
        return next
      })
    }

    try {
      const selectedProduct = selectedProductRef.current.get(line.uid)
      const rawResult = selectedProduct ?? await lookupProductByModelName(modelName)
      selectedProductRef.current.delete(line.uid)
      // 공용 ProductOption(id/sellingPrice:number/specification)과 레거시 lookup
      // 응답(productId/sellingPrice:string)을 여기서만 견적 내부 계약으로 정규화한다.
      // 후보 선택을 레거시 lookup처럼 처리하면 id가 productId로 승격되지 않고 규격도 유실된다.
      const result = {
        productId: 'productId' in rawResult ? rawResult.productId : rawResult.id,
        modelName: rawResult.modelName,
        productName: rawResult.productName,
        specification: 'specification' in rawResult ? rawResult.specification : null,
        sellingPrice: String(rawResult.sellingPrice ?? ''),
        fixedDiscountRate: 'fixedDiscountRate' in rawResult
          ? rawResult.fixedDiscountRate == null ? null : Number(rawResult.fixedDiscountRate)
          : null,
        fixedDiscountSource: 'fixedDiscountSource' in rawResult
          ? rawResult.fixedDiscountSource ?? null
          : null,
        modelCode: 'modelCode' in rawResult ? rawResult.modelCode ?? null : null,
        discountOption: 'discountOption' in rawResult ? rawResult.discountOption ?? null : null,
        classificationAssigned: 'discountOption' in rawResult && rawResult.discountOption != null,
        categoryKey: 'categoryKey' in rawResult ? rawResult.categoryKey ?? null : null,
        hasVariableDiscount: 'hasVariableDiscount' in rawResult
          ? rawResult.hasVariableDiscount ?? null
          : null,
        productType: rawResult.productType,
        goodsType: rawResult.goodsType,
        status: rawResult.status ?? null,
      }
      const currentAfterProductLookup = linesRef.current.find((current) => current.uid === line.uid)
      if (!currentAfterProductLookup || !isProductBindCurrent(currentAfterProductLookup)) {
        finishStaleRequest()
        return
      }
      // R4-F1: 전표(applyProductSelection)와 동일 semantics(공유 헬퍼) — 빈 단가뿐 아니라 이전
      // 품목의 자동채움(CATALOG/REMEMBERED) 단가도 새 품목 기준으로 재채움 + 가격기억 재조회.
      const shouldAutoFill = shouldAutoFillPrice(line.priceSource, line.unitPrice)
      // 거래처 선택 시 설정 조회가 진행 중이어도 품목 lookup의 stale 순서를 막는다.
      // 설정 도착 후 handleSelectPartner의 refresh가 신규 라인을 다시 계산한다.
      const partnerDcConfig = partnerDcConfigRef.current
      const catalogPrice = shouldApplyPartnerDcToEstimate(!isEdit)
        ? resolveEstimateNewLinePrice({
            sellingPrice: Number(result.sellingPrice),
            modelCode: result.modelCode,
            classificationOptions: result.discountOption ? [result.discountOption] : [],
            classificationAssigned: result.classificationAssigned,
            fixedDiscountRate: result.fixedDiscountRate,
            categoryKey: result.categoryKey,
            hasVariableDiscount: result.hasVariableDiscount,
          }, partnerDcConfig)
        : resolveEstimateCatalogPrice(Number(result.sellingPrice), result.fixedDiscountRate)
      let nextUnitPrice = String(catalogPrice.unitPrice)
      let nextPriceSource: DraftLine['priceSource'] = 'CATALOG'
      let nextPriceMemoryUpdatedAt: string | null = null
      let resolvedPartnerId = selectedPartnerIdRef.current
      if (shouldAutoFill) {
        // 품목 lookup 중 거래처가 바뀌면 새 거래처는 아직 productId 를 보지 못해 bulk 후보가 0건이다.
        // 현재 거래처가 응답 동안 다시 바뀌면 최신 partnerId 로 반복 resolve하고 busy 를 유지한다.
        while (true) {
          nextUnitPrice = String(catalogPrice.unitPrice)
          nextPriceSource = 'CATALOG'
          nextPriceMemoryUpdatedAt = null
          if (resolvedPartnerId) {
            try {
              const memory = await getPriceMemory(resolvedPartnerId, result.productId)
              if (memory?.unitPrice != null) {
                nextUnitPrice = String(memory.unitPrice)
                nextPriceSource = 'REMEMBERED'
                nextPriceMemoryUpdatedAt = memory.updatedAt ?? null
              }
            } catch {
              // 가격기억 조회 실패는 모델 lookup 자체를 실패시키지 않는다. 판매가 fallback 유지.
            }
          }
          const currentAfterPriceLookup = linesRef.current.find((candidate) => candidate.uid === line.uid)
          if (!currentAfterPriceLookup || !isProductBindCurrent(currentAfterPriceLookup)) {
            finishStaleRequest()
            return
          }
          if (currentAfterPriceLookup.priceSource === 'USER') break
          if (selectedPartnerIdRef.current === resolvedPartnerId) break
          resolvedPartnerId = selectedPartnerIdRef.current
        }
      }
      const current = linesRef.current.find((candidate) => candidate.uid === line.uid)
      if (!current || !isProductBindCurrent(current)) {
        finishStaleRequest()
        return
      }
      clearExplicitLineDeletion(current)
      // 명시적 USER 편집만 현재 단가를 보존한다. 거래처 stale 은 위에서 최신 partner+새 product 로
      // 재resolve했으므로 0원 중간 상태로 품목만 바인딩하지 않는다(R5-H3).
      const applyPrice = shouldAutoFill
        && current.priceSource !== 'USER'
        && selectedPartnerIdRef.current === resolvedPartnerId
      const currentIndex = linesRef.current.findIndex((candidate) => candidate.uid === line.uid)
      const hasCatalogSpecification = Boolean(result.specification?.trim())
      const preservesUserSpecification = current.specificationSource === 'USER'
      // 구버전 lookup-product 응답에는 specification이 없을 수 있다. 이미 확정된
      // 동일 품목의 자동 규격을 단순 blur가 회수하지 않도록 보존한다. 명시적인 새 품목
      // 선택(selectedProduct)이면 기존 자동 규격을 새 품목 기준으로 교체/회수한다.
      const existingSpecification = current.specification.trim() || line.specification
      const sameProductLookup = line.productId === result.productId || current.productId === result.productId
      const preservesExistingSpecification = sameProductLookup
        && Boolean(existingSpecification.trim())
      const isExplicitProductSelection = Boolean(selectedProduct && line.productId !== result.productId)
      const nextSpecification = hasCatalogSpecification
        ? result.specification!
        : isExplicitProductSelection
          ? preservesUserSpecification
            ? current.specification
            : ''
          : preservesExistingSpecification
            ? existingSpecification
            : current.specification
      const nextSpecificationSource = hasCatalogSpecification
        ? 'CATALOG' as const
        : isExplicitProductSelection
          ? preservesUserSpecification
            ? 'USER' as const
            : null
          : preservesExistingSpecification
            ? current.specificationSource ?? line.specificationSource
            : current.specificationSource
      const nextLine: DraftLine = {
        ...current,
        ...(applyPrice
          ? recalculateLineVat(asVatLine({ ...current, unitPrice: nextUnitPrice }), 'PRICE')
          : {}),
        modelName: result.modelName || current.modelName,
        productId: result.productId,
        productName: result.productName,
        specification: nextSpecification,
        specificationSource: nextSpecificationSource,
        productType: result.productType ?? 'SINGLE',
        modelCode: result.modelCode,
        discountOption: result.discountOption,
        classificationAssigned: result.classificationAssigned,
        categoryKey: result.categoryKey,
        hasVariableDiscount: result.hasVariableDiscount,
        fixedDiscountRate: result.fixedDiscountRate,
        goodsType: result.goodsType ?? current.goodsType,
        catalogUnitPrice: partnerDcConfig
          ? String(result.sellingPrice)
          : String(catalogPrice.unitPrice),
        unitPrice: applyPrice ? nextUnitPrice : current.unitPrice,
        priceSource: applyPrice ? nextPriceSource : current.priceSource,
        priceMemoryUpdatedAt: applyPrice ? nextPriceMemoryUpdatedAt : current.priceMemoryUpdatedAt,
        priceRefreshChanged: applyPrice ? false : current.priceRefreshChanged,
        partnerRefreshEligible: applyPrice ? true : current.partnerRefreshEligible,
        isBundleComponent: false,
        status: result.status ?? null,
        lookupError: null,
        lookupLoading: false,
      }
      if (hasCatalogSpecification) {
        // 품목 lookup의 catalog 규격은 사용자 입력의 stale snapshot이 아니라 새 권위값이다.
        localSpecificationWritesRef.current.delete(line.uid)
      }
      const nextLines = linesRef.current.map((candidate) =>
        candidate.uid === line.uid ? nextLine : candidate,
      )
      linesRef.current = nextLines
      setLines(nextLines)
      if (applyPrice) {
        setPriceLookupAnnouncement(
          `라인 ${currentIndex + 1} ${nextPriceSource === 'REMEMBERED' ? '거래처 최근단가' : '판매가'} 적용`,
        )
      }
      if (estimateFormCoeditProvider) {
        try {
          estimateFormCoeditProvider.setItemValue(currentIndex, 'modelName', result.modelName)
          estimateFormCoeditProvider.setItemValue(currentIndex, 'productName', result.productName)
          estimateFormCoeditProvider.setItemValue(currentIndex, 'specification', nextLine.specification)
          estimateFormCoeditProvider.setItemValue(
            currentIndex,
            'specificationSource',
            nextLine.specificationSource ?? '',
          )
          if (applyPrice) {
            localAutoPriceWritesRef.current.set(line.uid, {
              unitPrice: nextUnitPrice,
              priceSource: nextPriceSource,
              priceMemoryUpdatedAt: nextPriceMemoryUpdatedAt,
              priceRefreshChanged: false,
              partnerRefreshEligible: true,
              lookupError: null,
            })
            estimateFormCoeditProvider.setItemValue(currentIndex, 'unitPrice', nextUnitPrice)
          }
          estimateFormCoeditProvider.setItemValue(currentIndex, 'productId', result.productId)
        } catch {
          localAutoPriceWritesRef.current.delete(line.uid)
          // 언마운트 중 provider destroy 가능 — 로컬 state 는 이미 갱신됨. 동기화 실패는 무시(가짜 lookup 오류 방지, 리뷰 LOW).
        }
      }
    } catch (err: unknown) {
      const current = linesRef.current.find((candidate) => candidate.uid === line.uid)
      // lookup 실패 안내도 품목 게이트 기준 — 단가 타이핑/거래처 변경이 있었어도 같은 모델명
      // 텍스트의 최신 요청이면 실패 사유를 표시한다(사유 무표시 방지, R4-F3).
      if (!current || !isProductBindCurrent(current)) {
        finishStaleRequest()
        return
      }
      updateLine(linesRef.current.findIndex((candidate) => candidate.uid === line.uid), {
        lookupError: err instanceof Error ? '모델 미존재 또는 lookup 실패' : '알 수 없는 오류',
        lookupLoading: false,
      })
    }
  }

  const handleProductSelection = (index: number, product: ProductOption | null) => {
    const line = linesRef.current[index]
    if (!line || !isCoeditLineValueEditable(line)) return
    if (!product) {
      markExplicitLineDeletion(line)
      const hadAutoPrice = isAutoPriceSource(line.priceSource)
      const hadAutoSpecification = line.specificationSource === 'CATALOG'
      const nextLine: Partial<DraftLine> = {
        productId: null,
        modelName: '',
        productName: '',
        productType: null,
        discountOption: null,
        classificationAssigned: undefined,
        goodsType: null,
        status: null,
        catalogUnitPrice: null,
        ...(hadAutoSpecification
          ? { specification: '', specificationSource: null }
          : {}),
        priceMemoryUpdatedAt: null,
        priceRefreshChanged: false,
        partnerRefreshEligible: false,
        lookupError: null,
        lookupLoading: false,
        priceSource: hadAutoPrice ? null : line.priceSource,
        unitPrice: hadAutoPrice ? '0' : line.unitPrice,
      }
      selectedProductRef.current.delete(line.uid)
      updateLine(index, nextLine, true)
      try {
        estimateFormCoeditProvider?.setItemValue(index, 'modelName', '')
        estimateFormCoeditProvider?.setItemValue(index, 'productName', '')
        estimateFormCoeditProvider?.setItemValue(index, 'productId', '')
        if (hadAutoSpecification) estimateFormCoeditProvider?.setItemValue(index, 'specification', '')
        if (hadAutoSpecification) estimateFormCoeditProvider?.setItemValue(index, 'specificationSource', '')
        if (hadAutoPrice) estimateFormCoeditProvider?.setItemValue(index, 'unitPrice', '0')
      } catch {
        // Product clear remains local if the coedit provider is already unmounting.
      }
      return
    }
    clearExplicitLineDeletion(line)
    updateLine(index, {
      modelName: product.modelName,
      productId: null,
      productName: '',
      productType: product.productType ?? null,
      status: product.status ?? null,
    }, true)
    try {
      estimateFormCoeditProvider?.setItemValue(index, 'modelName', product.modelName)
    } catch {
      // Product selection remains local if the coedit provider is already unmounting.
    }
    selectedProductRef.current.set(line.uid, product)
    void handleModelLookup(index)
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateEstimateRequest) => createEstimate(body),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      navigate(`/sales/estimates/${created.id}`, { replace: true })
    },
    onError: (err: Error) => setTopError(`저장 실패: ${err.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: (body: UpdateEstimateRequest) => updateEstimate(editId!, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      queryClient.invalidateQueries({ queryKey: ['estimate', updated.id] })
      navigate(`/sales/estimates/${updated.id}`, { replace: true })
    },
    onError: (err: Error) => setTopError(`수정 실패: ${err.message}`),
  })

  const sendMutation = useMutation({
    mutationFn: (id: string) => sendEstimate(id),
    onSuccess: (sent) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      queryClient.invalidateQueries({ queryKey: ['estimate', sent.id] })
      alert(`발송 완료: ${sent.estimateNo}`)
      navigate(`/sales/estimates/${sent.id}`, { replace: true })
    },
    onError: (err: Error) => setTopError(`발송 실패: ${err.message}`),
  })

  const buildBody = (): CreateEstimateRequest | null => {
    setTopError('')
    // R4-F4: 거래처 변경 최근단가 재조회/모델 lookup 이 in-flight 인 동안 저장하면 이전 거래처
    // 단가가 새 거래처(partnerId)로 전송되어 가격기억이 교차 오염된다 — 완료 전 저장/발송 차단.
    // (버튼 disabled 와 이중 방어 — 발송 등 프로그래매틱 경로 포함)
    if (partnerReprice.isPending || lines.some((l) => l.lookupLoading)) {
      setTopError('최근단가 확인 중입니다. 잠시 후 다시 시도해 주세요.')
      return null
    }
    if (lines.some((line) => line.lookupError && !line.unitPrice.trim())) {
      setTopError('카탈로그 판매가를 확인할 수 없는 라인의 단가를 직접 입력해 주세요.')
      return null
    }
    const effectivePartnerId =
      partnerIdSnapshot && UUID_PATTERN.test(partnerIdSnapshot)
        ? partnerIdSnapshot
        : partner?.partnerId && UUID_PATTERN.test(partner.partnerId)
          ? partner.partnerId
          : ''
    // D-R8-1: legacy 견적(hydrate 시점에 partner_id 가 원래 없었고 사용자가 새로 선택하지도 않음)
    // 은 거래처 없이 저장을 허용한다. BE 는 이미 nullable 이고(Estimate.partnerId 에 nullable=false
    // 없음 + javadoc "거래처 UUID (선택)"), editHeader 는 null 을 "기존 값 보존" 으로 읽는다 —
    // 즉 FE 가드가 BE 계약보다 엄격했던 것이 데드락의 원인이다.
    //
    // 🔴 공백 전반을 열면 안 된다: 원래 거래처가 있던 견적을 사용자가 해제하고 저장하면 BE 가
    // 구 partnerId 를 보존해 화면(빈칸)과 DB(구 거래처)가 조용히 갈라지고 회계 귀속이 어긋난다.
    // 그래서 "원래 없었나"(hydratedPartnerId) 로만 좁힌다.
    const legacyWithoutPartner = isEdit && !hydratedPartnerId
    if (!effectivePartnerId && !legacyWithoutPartner) {
      setTopError(partnerName.trim()
        ? '거래처 정보를 다시 불러올 수 없습니다. 거래처를 다시 선택해 주세요.'
        : '거래처를 선택하세요.')
      setPartnerFieldInvalid(true)
      partnerInputRef.current?.focus()
      return null
    }
    if (!partnerName.trim() && !legacyWithoutPartner) {
      setTopError('거래처명이 비어있습니다.')
      setPartnerFieldInvalid(true)
      partnerInputRef.current?.focus()
      return null
    }
    setPartnerFieldInvalid(false)
    const valid = lines.filter(
      (l) => l.productId && Number.parseInt(l.quantity || '0', 10) > 0,
    )
    const allHydratedLinesExplicitlyCleared = isEdit
      && hydratedEstimateLineIdsRef.current.size > 0
      && [...hydratedEstimateLineIdsRef.current]
        .every((lineId) => explicitlyClearedEstimateLineIdsRef.current.has(lineId))
    const hasUnresolvedNewLineInput = lines.some((line) => {
      if (line.productId) return false
      const isExplicitlyClearedPersistedLine = Boolean(
        line.lineId
        && hydratedEstimateLineIdsRef.current.has(line.lineId)
        && explicitlyClearedEstimateLineIdsRef.current.has(line.lineId)
        && !line.modelName.trim()
        && !line.productName.trim(),
      )
      if (isExplicitlyClearedPersistedLine) return false
      return Boolean(
        line.modelName.trim()
        || line.productName.trim()
        || line.specification.trim()
        || line.note.trim()
        || line.unitPrice !== '0'
        || line.quantity !== '1',
      )
    })
    const canSaveExplicitEmptyLines = allHydratedLinesExplicitlyCleared && !hasUnresolvedNewLineInput
    if (valid.length === 0 && !canSaveExplicitEmptyLines) {
      setTopError(
        isEdit
          ? '유효한 라인이 없습니다. 품목을 입력하거나, 전체 삭제하려면 기존 품목을 모두 해제한 뒤 저장하세요.'
          : '신규 견적은 모델명 lookup 성공 + 수량 > 0인 품목 1개 이상을 입력하세요.',
      )
      return null
    }
    const apiLines: EstimateLineRequest[] = valid.map((l) => {
      // R4-F2: legacy(unitPriceWithVat=null) 라인의 단가는 공급단가다. 사용자가 단가를 수정하지
      // 않았으면(hydrate 원값 그대로) priceVatInclusive=false + 원 공급단가로 전송해 편집-저장 시
      // /1.1 재분리(약 9.1% 하락)와 가격기억 오염을 막는다 — 전표 복사는 R6-H2 부터
      // BE 서버 복사(POST /slips/{id}/duplicate)가 동일 원칙을 보장한다.
      // 사용자가 수정한 값은 '단가(VAT포함)' 입력이므로 기존대로 true.
      const keepsLegacySupplyPrice =
        l.legacySupplyUnitPrice != null && l.legacyPriceUntouched === true
      return {
        productId: l.productId!,
        productName: l.productName.trim() || undefined,
        modelName: l.modelName.trim() || undefined,
        specification: l.specification.trim() || undefined,
        specificationSource: l.specificationSource ?? undefined,
        quantity: Number.parseInt(l.quantity || '0', 10),
        unitPrice: l.unitPrice || '0',
        note: l.note.trim() || undefined,
        setOptions: toApiBundleSetOptions(l.productType, l.setOptions),
        // 단가 부가세포함 — BE 가 라인 단위로 공급가액/부가세 분리(eCount). legacy 미수정 라인만 예외.
        priceVatInclusive: !keepsLegacySupplyPrice,
        lineId: isEdit ? l.lineId : undefined,
        ...(l.vatDirty && !l.isBundleComponent
          ? {
              supplyAmount: l.supplyAmount,
              vatAmount: l.vatAmount,
              lineTotalWithVat: l.lineTotal,
            }
          : {}),
      }
    })
    return {
      estimateDate: estimateDate || undefined,
      partnerId: effectivePartnerId,
      partnerName: partnerName.trim(),
      partnerBusinessNo: partnerBusinessNo.trim() || undefined,
      partnerAddress: partnerAddress.trim() || undefined,
      validUntil: validUntil || undefined,
      memo: memo.trim() || undefined,
      lines: apiLines,
    }
  }

  const handleSave = () => {
    const body = buildBody()
    if (!body) return
    if (isEdit) {
      const updateBody: UpdateEstimateRequest = {
        // D-R8-1: legacy 견적은 빈 문자열이 될 수 있다 — 빈 값을 그대로 실으면 BE UUID 파싱이
        // 깨지므로 undefined 로 omit 해 editHeader 의 "null = 기존 값 보존" 계약에 태운다.
        partnerId: body.partnerId || undefined,
        partnerName: body.partnerName || undefined,
        partnerBusinessNo: body.partnerBusinessNo,
        partnerAddress: body.partnerAddress,
        validUntil: body.validUntil,
        memo: body.memo,
        lines: body.lines,
      }
      updateMutation.mutate(updateBody)
    } else {
      createMutation.mutate(body)
    }
  }

  const handleSend = async () => {
    if (!isEdit || !editId) {
      setTopError('먼저 저장 후 발송할 수 있습니다.')
      return
    }
    if (
      !confirm(
        '이 견적서를 발송하시겠습니까?\n발송 후 거래처가 수락/거절을 결정합니다.',
      )
    )
      return
    const body = buildBody()
    if (!body) return
    try {
      const updateBody: UpdateEstimateRequest = {
        // D-R8-1: legacy 견적은 빈 문자열이 될 수 있다 — 빈 값을 그대로 실으면 BE UUID 파싱이
        // 깨지므로 undefined 로 omit 해 editHeader 의 "null = 기존 값 보존" 계약에 태운다.
        partnerId: body.partnerId || undefined,
        partnerName: body.partnerName || undefined,
        partnerBusinessNo: body.partnerBusinessNo,
        partnerAddress: body.partnerAddress,
        validUntil: body.validUntil,
        memo: body.memo,
        lines: body.lines,
      }
      await updateEstimate(editId, updateBody)
      sendMutation.mutate(editId)
    } catch (err: unknown) {
      setTopError(
        `발송 전 저장 실패: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (isEdit && (detailQuery.isLoading || hydratedEstimateId !== editId)) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="견적서 불러오는 중" />
      </div>
    )
  }

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    sendMutation.isPending
  // 최근단가 재조회/모델 lookup in-flight — 저장/발송 차단 + busy 단서(R4-F4, 전표 폼과 대칭).
  const priceResolutionBusy = partnerReprice.isPending || lines.some((l) => l.lookupLoading)
  const hasUnresolvedCatalogPrice = lines.some((line) => line.lookupError && !line.unitPrice.trim())

  return (
    <>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>
            {isEdit ? '견적서 편집' : '견적서 작성'}
          </h3>
          <p style={{ marginTop: 4, fontSize: 13, color: '#6B7280' }}>
            모델명을 입력하고 다른 영역을 클릭하면 품목명/단가가 자동 입력됩니다.
          </p>
        </div>
      </div>

      {isReadOnly ? (
        <div
          className="error-banner"
          role="alert"
          style={{ marginBottom: 16, padding: 12 }}
        >
          이 견적서는 수락/거절/변환되어 더 이상 수정할 수 없습니다.
        </div>
      ) : null}

      <Card>
        {/* 거래처 선택 */}
        {/*
          D-R8-1 + R8-DESIGN-1: coedit 중에도 활성. 종전 `disabled={coeditActive}` 는
          "거래처를 다시 선택해 주세요" 안내와 결합해 저장 데드락을 만들었다(선택 수단이 비활성).
          거래처 4필드는 propagatePartnerToCoedit 이 CRDT 트랜잭션 1회로 원자 전파하므로
          협업 중 재선택이 안전하다. 로딩 중(coeditPending)에만 잠가 이중소스를 막는다.
        */}
        <div style={{ marginBottom: 16 }}>
          <PartnerAutocomplete
            ref={partnerInputRef}
            label="거래처 검색"
            placeholder="거래처명 또는 사업자번호"
            value={partner
              ? {
                  id: partner.partnerId ?? undefined,
                  partnerCode: partner.partnerCode ?? '',
                  name: partner.companyName,
                  bizNo: partner.businessRegistrationNumber,
                  phone: partner.contactPhone ?? undefined,
                }
              : null}
            onChange={handlePartnerOptionChange}
            searchPartners={searchPartnerOptions}
            disabled={Boolean(isReadOnly) || estimateFormCoeditPending}
            error={partnerFieldInvalid
              ? '거래처를 선택해 주세요. 저장하려면 거래처가 필요합니다.'
              : undefined}
          />
          {/* D-R8-1: legacy 견적 — 데드락 문구("다시 선택해 주세요") 대신 실제로 무슨 일이 일어나는지 알린다. */}
          {isEdit && !hydratedPartnerId && !partnerIdSnapshot ? (
            <p
              className="estimate-form-legacy-partner-note"
              data-testid="estimate-form-legacy-partner-note"
              style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}
            >
              이 견적서는 거래처 정보 없이 등록됐습니다. 거래처를 선택하지 않으면 거래처 없이 저장됩니다.
            </p>
          ) : null}
        </div>

        <div
          className="mobile-form-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            gap: 16,
            marginBottom: 16,
          }}
        >
          {/*
            R8-DESIGN-1: '거래처명'·'사업자번호' 를 자유입력에서 자동완성 파생 read-only 로 강등.
            종전엔 거래처 입력 경로가 2개인데 권위 있는 쪽(PartnerAutocomplete)만 잠겨 있어,
            거래처명만 고쳐 저장하면 화면 거래처와 partnerIdSnapshot 이 괴리되고 마커가 거짓말을
            했다. slip 이 "P0 D-AC3-01" 로 밟은 선례와 정렬한다.
          */}
          <FormField
            label="거래처명"
            required
            hint="거래처 검색에서 선택한 값입니다"
            render={({ id, ariaDescribedBy }) => (
              <Input
                id={id}
                aria-describedby={ariaDescribedBy}
                value={partnerName}
                readOnly
                aria-label="거래처명"
                data-testid="estimate-form-partner-name"
              />
            )}
          />
          <FormField
            label="사업자번호"
            render={({ id, ariaDescribedBy }) => (
              <Input
                id={id}
                aria-describedby={ariaDescribedBy}
                value={partnerBusinessNo}
                readOnly
                aria-label="사업자번호"
                data-testid="estimate-form-partner-business-no"
              />
            )}
          />
          <CollaborativeSlipInput
            provider={estimateFormCoeditProvider}
            coeditPending={estimateFormCoeditPending}
            fieldPath="header.estimateDate"
            label="작성일"
            type="date"
            value={estimateDate}
            onValueChange={setEstimateDate}
            readOnly={Boolean(isReadOnly)}
            aria-label="작성일"
            data-testid="estimate-form-estimate-date"
          />
          <CollaborativeSlipInput
            provider={estimateFormCoeditProvider}
            coeditPending={estimateFormCoeditPending}
            fieldPath="header.validUntil"
            label="유효기간"
            type="date"
            value={validUntil}
            onValueChange={setValidUntil}
            readOnly={Boolean(isReadOnly)}
            aria-label="유효기간"
            data-testid="estimate-form-valid-until"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <CollaborativeSlipInput
            provider={estimateFormCoeditProvider}
            coeditPending={estimateFormCoeditPending}
            fieldPath="header.partnerAddress"
            label="주소"
            value={partnerAddress}
            onValueChange={setPartnerAddress}
            readOnly={Boolean(isReadOnly)}
            aria-label="주소"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <CollaborativeSlipInput
            provider={estimateFormCoeditProvider}
            coeditPending={estimateFormCoeditPending}
            fieldPath="header.memo"
            label="비고"
            value={memo}
            onValueChange={setMemo}
            readOnly={Boolean(isReadOnly)}
            aria-label="비고"
          />
        </div>

        {/* R4-D9: live region 은 빈 컨테이너로 상시 렌더하고 텍스트만 토글 — ARIA 관행상
            live region 이 선존재해야 SR 낭독이 신뢰된다. 비활성 시 class 미부여로 시각 0px. */}
        <div
          className={priceRefreshNoticeActive
            ? 'price-memory-refresh-banner'
            : priceBannerAnnouncement
              ? 'price-lookup-status'
              : undefined}
          role="status"
          aria-live="polite"
          data-testid="estimate-price-refresh-banner"
        >
          {priceBannerAnnouncement || null}
        </div>

        {isMobile && !isReadOnly && canViewProductLookups ? (
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLineLookupOpen(true)}
              disabled={estimateFormCoeditPending}
              data-testid="estimate-line-lookup-btn"
            >
              참조 조회
            </Button>
          </div>
        ) : null}

        <div data-testid={!isMobile ? 'estimate-form-line-scroll' : undefined}>
        {!isMobile ? (
          /* 라인 헤더 — 행과 같은 grid 상수를 공유한다. */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: ESTIMATE_LINE_GRID_TEMPLATE,
              padding: '8px 0',
              borderBottom: '2px solid var(--line-default)',
              fontSize: 12,
              color: '#6B7280',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
            data-testid="estimate-form-line-header"
          >
            <div style={{ textAlign: 'center' }}>#</div>
            <div>모델명</div>
            <div>품목명</div>
            <div>규격</div>
            <div style={{ textAlign: 'right' }}>수량</div>
            <div style={{ textAlign: 'right' }}>단가(VAT포함)</div>
            <div style={{ textAlign: 'right' }}>공급가액</div>
            <div style={{ textAlign: 'right' }}>부가세</div>
            <div style={{ display: 'none' }}>합계(VAT포함)</div>
            <div />
          </div>
        ) : null}

        {!isMobile ? (
          <div data-testid="estimate-price-source-summary" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0', fontSize: 12, color: 'var(--ink-secondary, #5C6773)' }}>
            {lines.map((line, i) => {
              const status = priceSourceStatus(line, hasPartner)
              if (!status && !line.priceRefreshChanged) return null
              return (
                <span key={line.uid}>
                  라인 {i + 1}:{' '}
                  {status ? <span id={`estimate-price-status-${line.uid}`} title={status.description}>{status.label}</span> : null}
                  {line.priceRefreshChanged ? <span id={`estimate-price-changed-${line.uid}`}>{status ? ' · ' : ''}가격 변경됨</span> : null}
                </span>
              )
            })}
          </div>
        ) : null}

        <div
          className={isMobile ? 'mobile-line-card-list' : undefined}
        >
        {lines.map((line, i) => {
          const calculated = recalculateLineVat(asVatLine(line), line.authority ?? 'PRICE')
          const lineIncl = Number(calculated.lineTotal)
          const lineSupply = Number(calculated.supplyAmount)
          const lineVat = Number(calculated.vatAmount)
          const isBundle = line.productType === 'BUNDLE'
          const priceStatus = priceSourceStatus(line, hasPartner)
          const priceStatusId = `estimate-price-status-${line.uid}`
          const priceChangedStatusId = `estimate-price-changed-${line.uid}`
          if (isMobile) {
          return (
            <EstimateMobileLineCard
                key={line.uid}
                line={line}
                index={i}
                isReadOnly={Boolean(isReadOnly)}
                provider={estimateFormCoeditProvider}
                coeditPending={estimateFormCoeditPending}
                lineStructureLocked={Boolean(isReadOnly) || coeditActive}
                lineIncl={lineIncl}
                lineSupply={lineSupply}
                lineVat={lineVat}
                hasPartner={hasPartner}
                vatEditable={!isReadOnly && !isBundle && !coeditActive}
                onUpdate={(patch, fromUser) => updateLine(i, patch, fromUser)}
                onLookup={() => handleModelLookup(i)}
                onRemove={() => removeLine(i)}
              >
              </EstimateMobileLineCard>
            )
          }
          return (
           <div key={line.uid} className="estimate-line-input-grid" data-testid={`estimate-line-input-grid-${i}`} style={{ display: 'grid', gridTemplateColumns: ESTIMATE_LINE_GRID_TEMPLATE }}>
            {/*
              R6-L2: role="row" 는 부모 table/rowgroup 없는 orphan(axe aria-required-parent
              serious)이라 제거.

              [R8-DESIGN-6] 🔴 종전 주석은 *"aria-describedby 는 전역 attribute 라 role 없이 유효"*
              라고 적었으나 이는 **거짓 주장**이었다. 전역 attribute = "마크업상 허용" 일 뿐이고,
              role 없는 div 는 role=generic 으로 매핑돼 AT 가 그 description 을 낭독하지 않는다
              (사용자가 포커스할 수도, 탐색할 수도 없는 컨테이너다). 즉 이 배선은 무해하지만
              **전달되지 않는다**.
              실제 전달 경로는 아래 단가 input 의 aria-describedby 체인이다 — 거기에
              priceChangedStatusId 를 append 해 "단가 변경" 을 포커스 시 실제로 듣게 했다.
              이 div 의 속성은 시각/DOM 연관 표기로만 남긴다.
            */}
            <div
              className="estimate-line-input-grid"
              aria-describedby={line.priceRefreshChanged ? priceChangedStatusId : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: ESTIMATE_LINE_GRID_TEMPLATE,
                columnGap: 8,
                gridAutoRows: 'minmax(40px, auto)',
                padding: '6px 0',
                alignItems: 'center',
                // R6-H4: 강조행 구분선 #F3F4F6 on --surface-selected(#EFF6FF)=1.01:1 —
                // LineRow.module.css(.priceRefreshed border-bottom-color)와 동일하게
                // 강조행 한정 --line-focus(#3B82F6, 3.38:1)로 상향. 기본 행은 기존 유지.
                borderBottom: isBundle
                  ? 'none'
                  : `1px solid ${line.priceRefreshChanged ? 'var(--line-focus)' : '#F3F4F6'}`,
                borderLeft: line.priceRefreshChanged ? '4px solid var(--action-brand)' : '4px solid transparent',
                background: line.priceRefreshChanged ? 'var(--surface-selected)' : undefined,
                // R6-H4: inset 링 --state-info-border(#BFDBFE) on #EFF6FF=1.31:1 —
                // LineRow.module.css:202 교정과 1:1 정렬(--action-brand #1E40AF, 8.02:1).
                boxShadow: line.priceRefreshChanged ? 'inset 0 0 0 1px var(--action-brand)' : undefined,
              }}
              data-testid={`estimate-form-line-${i}`}
              data-price-source={line.priceSource ?? ''}
            >
              <div
                style={{
                  textAlign: 'center',
                  // R4-D1: 강조행 배경(--surface-selected 실값 #EFF6FF) 위 #6B7280 은 4.44:1 로
                  // AA(4.5) 미달 — 강조행 한정 --ink-secondary(실값 #5C6773, 5.30:1 PASS) 상향.
                  // 흰 배경 기본 행은 4.83:1 통과라 기존 색 유지.
                  color: line.priceRefreshChanged ? 'var(--ink-secondary, #5C6773)' : '#6B7280',
                }}
              >
                {i + 1}
              </div>
              <div>
                <ProductAutocomplete
                  value={line.productId && line.modelName ? {
                    id: line.productId,
                    modelName: line.modelName,
                    productName: line.productName,
                    productType: line.productType ?? undefined,
                    status: line.status,
                    sellingPrice: line.catalogUnitPrice == null ? undefined : Number(line.catalogUnitPrice),
                    specification: line.specification,
                  } : null}
                  onChange={(product) => handleProductSelection(i, product)}
                  onInputCommitChange={(committed) => {
                    if (committed) return
                    if (!isCoeditLineValueEditable(line)) return
                    handleProductSelection(i, null)
                  }}
                  onInputBlur={(draft) => {
                    if (!isCoeditLineValueEditable(line) || !draft.trim()) return
                    updateLine(i, { modelName: draft.trim(), productId: null, productName: '' }, true)
                    window.setTimeout(() => void handleModelLookup(i), 0)
                  }}
                  searchProducts={searchEstimateProducts}
                  label=""
                  ariaLabel={`라인 ${i + 1} 모델명`}
                  placeholder="모델명 또는 품목명"
                  resultSelectionMode="single"
                  autoSelectSingleResult
                  debounceMs={250}
                  disabled={Boolean(isReadOnly) || estimateFormCoeditPending || !isCoeditLineValueEditable(line)}
                  error={line.lookupError ?? undefined}
                />
                {/* 화면 입력은 ProductAutocomplete가 담당하고, 이 필드는 협업 문서 동기화만 담당한다. */}
                <CollaborativeSlipInput
                  provider={estimateFormCoeditProvider}
                  coeditPending={estimateFormCoeditPending}
                  fieldPath={`items.${i}.modelName`}
                  value={line.modelName}
                  onValueChange={(value) => updateLine(i, {
                    modelName: value,
                    productId: null,
                    productName: '',
                  }, true)}
                  onDocSyncValueChange={(value) => updateLine(i, {
                    modelName: value,
                    productId: null,
                    productName: '',
                  })}
                  onBlur={() => handleModelLookup(i)}
                  readOnly={Boolean(isReadOnly) || estimateFormCoeditPending || coeditActive}
                  aria-label={`라인 ${i + 1} 모델명 동기화`}
                  inputStyle={{ display: 'none' }}
                  data-testid={`estimate-coedit-items-${i}-modelName`}
                />
              </div>
              <CollaborativeSlipInput
                provider={estimateFormCoeditProvider}
                coeditPending={estimateFormCoeditPending}
                fieldPath={`items.${i}.productName`}
                type="text"
                value={line.productName}
                onValueChange={(value) => updateLine(i, { productName: value }, true)}
                onDocSyncValueChange={(value) => updateLine(i, { productName: value })}
                readOnly={Boolean(isReadOnly) || !isQuantityEditable(line.productId, line.status)}
                aria-label={`라인 ${i + 1} 품목명`}
              />
              <CollaborativeSlipInput
                provider={estimateFormCoeditProvider}
                coeditPending={estimateFormCoeditPending}
                fieldPath={`items.${i}.specification`}
                type="text"
                value={line.specification}
                onValueChange={(value) => updateLine(i, { specification: value }, true)}
                onDocSyncValueChange={(value) => updateLine(i, { specification: value })}
                readOnly={Boolean(isReadOnly)}
                aria-label={`라인 ${i + 1} 규격`}
              />
              <div>
                <CollaborativeSlipInput
                  provider={estimateFormCoeditProvider}
                  coeditPending={estimateFormCoeditPending}
                  fieldPath={`items.${i}.quantity`}
                  type="text"
                  value={line.quantity}
                  onValueChange={(value) => updateQuantity(i, value)}
                  onDocSyncValueChange={(value) => updateQuantity(i, value)}
                  readOnly={Boolean(isReadOnly) || !isQuantityEditable(line.productId, line.status)}
                  inputMode="numeric"
                  inputStyle={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                  aria-label={`라인 ${i + 1} 수량${line.status === 'OUT_OF_STOCK' ? ' 품절' : !isQuantityEditable(line.productId, line.status) ? ' 상태 확인 중' : ''}`}
                  data-testid={`estimate-form-line-${i}-qty`}
                />
                {!isQuantityEditable(line.productId, line.status) ? <span role="status">{line.status === 'OUT_OF_STOCK' ? '품절' : '상태 확인 중'}</span> : null}
              </div>
              <div>
                <CollaborativeSlipInput
                  provider={estimateFormCoeditProvider}
                  coeditPending={estimateFormCoeditPending}
                  fieldPath={`items.${i}.unitPrice`}
                  type="text"
                  value={line.unitPrice}
                  onValueChange={(value) => updatePrice(i, value)}
                  // doc-sync 유래 값 반영은 분류(priceSource) 를 건드리지 않는다 — 자동채움 provider
                  // write 가 pending REMEMBERED/CATALOG 분류를 USER 로 덮는 마커 소멸 차단(R4-F6).
                  // 분류 판정은 페이지 구독(coeditLinesToDraftLines + localAutoPriceWrites)이 단일 소스.
                  onDocSyncValueChange={(value) => updateLine(i, {
                    unitPrice: value,
                    quantity: resolvePriceInputQuantitySync(line.goodsType, line.quantity, value).quantity,
                  })}
                  readOnly={Boolean(isReadOnly)}
                  inputMode="decimal"
                  inputStyle={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                  aria-label={`라인 ${i + 1} 단가`}
                  // [R8-DESIGN-6] "단가 변경" 표시는 여기로만 AT 에 도달한다 — PriceChangeIndicator
                  // 는 role 없는 span 이라 스스로는 낭독되지 않는다.
                  aria-describedby={[
                    priceStatus ? priceStatusId : null,
                    line.priceRefreshChanged ? priceChangedStatusId : null,
                  ].filter(Boolean).join(' ') || undefined}
                  data-testid={`estimate-form-line-${i}-unit-price`}
                />
                {priceStatus ? (
                  <span
                    id={priceStatusId}
                    role="note"
                    aria-label={priceStatus.description}
                    title={priceStatus.description}
                    className="s4-line-metadata-visually-hidden"
                  >
                    {priceStatus.label}
                  </span>
                ) : null}
                {line.priceRefreshChanged ? (
                  <span className="s4-line-metadata-visually-hidden">
                    <PriceChangeIndicator id={priceChangedStatusId} />
                  </span>
                ) : null}
                {/* R4-D2: 라인별 aria-live 제거 — 전역 고지는 배너(role="status") 1곳이 담당. */}
              </div>
              <CollaborativeSlipInput
                provider={estimateFormCoeditProvider}
                coeditPending={estimateFormCoeditPending}
                fieldPath={`items.${i}.supplyAmount`}
                type="text"
                value={line.supplyAmount}
                onValueChange={(value) => updateVat(i, 'SUPPLY', value)}
                onDocSyncValueChange={(value) => updateLine(i, { supplyAmount: value })}
                readOnly={Boolean(isReadOnly) || isBundle || coeditActive}
                inputMode="numeric"
                inputStyle={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                aria-label={`라인 ${i + 1} 공급가액`}
              />
              <div>
                <CollaborativeSlipInput
                  provider={estimateFormCoeditProvider}
                  coeditPending={estimateFormCoeditPending}
                fieldPath={`items.${i}.vatAmount`}
                type="text"
                value={line.vatAmount}
                onValueChange={(value) => updateVat(i, 'VAT', value)}
                onDocSyncValueChange={(value) => updateLine(i, { vatAmount: value })}
                  readOnly={Boolean(isReadOnly) || isBundle || coeditActive}
                  inputMode="numeric"
                  inputStyle={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                  aria-label={`라인 ${i + 1} 부가세`}
                />
                {line.vatWarning ? <span role="note" style={{ color: '#9A6700', fontSize: 10 }}>⚠ 10%와 다름</span> : null}
              </div>
              <div style={{ display: 'none' }}>
                <CollaborativeSlipInput
                  provider={estimateFormCoeditProvider}
                  coeditPending={estimateFormCoeditPending}
                  fieldPath={`items.${i}.lineTotal`}
                  type="text"
                  value={String(lineIncl)}
                  onValueChange={() => undefined}
                  readOnly
                  aria-label={`라인 ${i + 1} 합계(VAT포함)`}
                  data-testid={`estimate-form-line-${i}-line-total`}
                />
                <span>{`${lineSupply} / ${lineVat}`}</span>
              </div>
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={Boolean(isReadOnly) || coeditActive}
                aria-label={`라인 ${i + 1} 삭제`}
                style={{
                  height: 32,
                  width: 32,
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  background: '#fff',
                  color: 'var(--state-danger)',
                  cursor: isReadOnly || coeditActive ? 'not-allowed' : 'pointer',
                }}
              >
                ×
              </button>
            </div>
           </div>
          )
        })}
        </div>
        </div>

        {!isReadOnly ? (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            {!isMobile && canViewProductLookups ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLineLookupOpen(true)}
                disabled={estimateFormCoeditPending}
                data-testid="estimate-line-lookup-btn"
              >
                참조 조회
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* 합계 */}
        <div
          className="mobile-form-grid"
          style={{
            marginTop: 16,
            padding: '12px 16px',
            background: '#F9FAFB',
            borderRadius: 6,
            display: 'grid',
            gridTemplateColumns: '1fr 140px 140px 140px',
            gap: 16,
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums',
            alignItems: 'center',
          }}
          data-testid="estimate-form-totals"
        >
          <div style={{ fontWeight: 600 }}>합계</div>
          <div style={{ textAlign: 'right' }}>
            공급가액 <strong>{fmt(totals.supply)}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            부가세 <strong>{fmt(totals.vat)}</strong>
          </div>
          <div style={{ textAlign: 'right', fontSize: 16 }}>
            총합 <strong>{fmt(totals.total)}</strong>
          </div>
        </div>
      </Card>

      {topError ? (
        <div
          className="error-banner"
          role="alert"
          style={{ marginTop: 16, padding: 12, color: 'var(--state-danger)' }}
        >
          {topError}
        </div>
      ) : null}

      {estimateFormCoeditPending ? (
        <p role="status" data-testid="estimate-form-coedit-pending">
          협업 연결 중…
        </p>
      ) : null}

      {/* R4-F4 busy 단서 — R4-D9 계열 sweep: live region 은 상시 렌더하고 텍스트만 토글 —
          ARIA 관행상 live region 이 선존재해야 SR 낭독이 신뢰된다. 비활성 시 margin 0
          빈 p = 시각 0px. */}
      <p
        role="status"
        aria-live="polite"
        data-testid="estimate-form-price-refresh-busy"
        style={priceResolutionBusy ? undefined : { margin: 0 }}
      >
        {priceResolutionBusy ? '최근단가 확인 중…' : null}
      </p>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 16,
        }}
      >
        <Button variant="ghost" onClick={() => navigate(-1)}>
          취소
        </Button>
        {!isReadOnly ? (
          <>
            <Button
              variant="ghost"
              onClick={handleSave}
              disabled={isPending || estimateFormCoeditPending || priceResolutionBusy || hasUnresolvedCatalogPrice}
              data-testid="estimate-form-save-button"
            >
              {isPending ? '저장 중...' : '임시저장'}
            </Button>
            {isEdit ? (
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={isPending || estimateFormCoeditPending || priceResolutionBusy || hasUnresolvedCatalogPrice}
                data-testid="estimate-form-send-button"
              >
                {sendMutation.isPending ? '발송 중...' : '발송'}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      <LineLookupReferenceModal
        open={lineLookupOpen}
        onClose={() => setLineLookupOpen(false)}
      />
    </>
  )
}
