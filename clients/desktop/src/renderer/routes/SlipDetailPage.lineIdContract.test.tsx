import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  createDocCoeditProvider,
  type DocCoeditProvider,
} from '../realtime/createCoeditProvider'
import {
  buildDetailLinePayload,
  bundleComponentLineIds,
  coeditHeaderValues,
  coeditLinesToEditLines,
  computeDetailQuantityChange,
  computeDetailUnitPriceChange,
  detailAmountDocWrites,
  detailAmountState,
  detailVatLine,
  editUnitPriceColumnHeader,
  editUnitPriceLabel,
  parseEditableDetailAmountInput,
  partnerRepriceBannerText,
  partnerRepriceMarkerText,
  syncDetailAmountToDoc,
  toPurchaseEditLines,
} from './SlipDetailPage'
import { toServerLineIdSet } from '../realtime/coeditLineIds'
import { editLineVat, editSlipLineAmount } from '../utils/lineVat'
import type { SlipDetail } from '../api/slip'

/**
 * #809 R8-FE-2 — lineId 왕복 계약의 FE 가드.
 *
 * <p>이 PR 의 간판 계약(상세 응답 `id` → 수정 payload `lineId` 왕복)은 도입 커밋
 * `34f978ec9` 의 FE diff 가 18줄·테스트 0 이었다. 그 결과 R8-FE-1(=R8-QA-2 · BLOCKING)
 * 이 desktop vitest 749건을 그대로 통과했고, 라이브 2창 coedit 에서만 잡혔다.
 *
 * <p>여기서 잠그는 것은 <b>"lineId 는 위치가 아니라 라인 자신을 따라간다"</b> 는 불변식이다.
 */

const SERVER_LINE_1 = '11111111-1111-1111-1111-111111111111'
const SERVER_LINE_2 = '22222222-2222-2222-2222-222222222222'
const SERVER_LINE_3 = '33333333-3333-3333-3333-333333333333'

const PRODUCT_1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const PRODUCT_2 = 'aaaaaaaa-0000-0000-0000-000000000002'
const PRODUCT_3 = 'aaaaaaaa-0000-0000-0000-000000000003'

/** 서버 상세 3라인 — 1행이 세트 head, 2·3행이 그 구성품인 전형적 세트 전표. */
const serverLines = [
  { id: SERVER_LINE_1, productId: PRODUCT_1 },
  { id: SERVER_LINE_2, productId: PRODUCT_2 },
  { id: SERVER_LINE_3, productId: PRODUCT_3 },
]

const knownServerLineIds = toServerLineIdSet(serverLines)

describe('SlipDetailPage — 수정 화면 단가 라벨 의미 계약', () => {
  it('정상 라인은 VAT 제외, authoritative 라인은 입력값 보존에 맞춰 VAT 포함으로 표시한다', () => {
    expect(editUnitPriceLabel({ unitPrice: '10000', unitPriceWithVat: '11000' }))
      .toBe('단가(VAT제외)')
    expect(editUnitPriceLabel({ unitPrice: '11000', unitPriceWithVat: '11000' }))
      .toBe('단가(VAT포함)')
  })

  it('행이 하나의 단가 도메인이면 그 라벨을, 섞이면 행별 기준을 헤더에 표시한다', () => {
    expect(editUnitPriceColumnHeader([
      { unitPrice: '10000', unitPriceWithVat: '11000' },
    ])).toBe('단가(VAT제외)')
    expect(editUnitPriceColumnHeader([
      { unitPrice: '11000', unitPriceWithVat: '11000' },
    ])).toBe('단가(VAT포함)')
    expect(editUnitPriceColumnHeader([
      { unitPrice: '10000', unitPriceWithVat: '11000' },
      { unitPrice: '11000', unitPriceWithVat: '11000' },
    ])).toBe('단가(행별 VAT 기준)')
  })
})

async function makeProvider(): Promise<DocCoeditProvider> {
  return createDocCoeditProvider({
    documentId: 'slip-1',
    basePath: '/slips/slip-1',
    initialUpdates: async () => ({ updates: [] }),
    postUpdate: vi.fn(),
    postAwareness: vi.fn(),
    subscribe: () => ({ abort: vi.fn() }) as unknown as AbortController,
  })
}

/** SlipDetailPage.toPurchaseEditLines 와 동일한 seed 형태 (서버 line.id → Y.Doc lineId). */
function seedRows(provider: DocCoeditProvider, rows: typeof serverLines) {
  provider.replaceItems(
    rows.map((line, index) => ({
      lineId: line.id,
      productId: line.productId,
      productName: `품목${index + 1}`,
      modelName: `MODEL-${index + 1}`,
      specification: '',
      quantity: 1,
      unitPrice: String((index + 1) * 1000),
      note: '',
    })),
  )
}

/** 폼 state 라인 (PurchaseEditLine) — seed 직후의 로컬 스냅샷. */
function editLinesFrom(rows: typeof serverLines) {
  return rows.map((line, index) => ({
    key: `key-${index + 1}`,
    lineId: line.id,
    productId: line.productId,
    productName: `품목${index + 1}`,
    modelName: `MODEL-${index + 1}`,
    specification: '',
    quantity: 1,
    unitPrice: String((index + 1) * 1000),
    note: '',
  }))
}

describe('SlipDetailPage — lineId 왕복 계약 (R8-FE-2)', () => {
  it('원격 피어가 1행을 삭제해도 잔여 행이 자기 lineId 를 유지한다 (R8-FE-1 = R8-QA-2 BLOCKING)', async () => {
    const provider = await makeProvider()
    seedRows(provider, serverLines)
    const current = editLinesFrom(serverLines)

    // 원격 피어(A창)가 1행(세트 head)을 삭제 — Y.Doc 은 즉시 2행으로 당겨진다.
    // 로컬(B창) `current` 는 이 시점에 아직 3행짜리 구 스냅샷이다. 이것이 라이브 재현 조건이다.
    provider.removeItem(SERVER_LINE_1)

    const next = coeditLinesToEditLines(provider, current, knownServerLineIds)

    expect(next).toHaveLength(2)
    // 위치복원이면 next[0].lineId 가 삭제된 1행의 SERVER_LINE_1 이 된다 =
    // 단품이 세트 head 계보를 상속하고 사용자 단가가 증발하는 경로.
    expect(next[0]!.lineId).toBe(SERVER_LINE_2)
    expect(next[1]!.lineId).toBe(SERVER_LINE_3)
    // lineId 와 productId 가 같은 행을 가리켜야 한다 — 라이브에서 깨진 바로 그 짝이다.
    expect(next[0]!.productId).toBe(PRODUCT_2)
    expect(next[1]!.productId).toBe(PRODUCT_3)

    provider.destroy()
  })

  it('hydrate → update 왕복에서 lineId 가 보존된다', async () => {
    const provider = await makeProvider()
    seedRows(provider, serverLines)

    const next = coeditLinesToEditLines(provider, editLinesFrom(serverLines), knownServerLineIds)

    expect(next.map((line) => line.lineId)).toEqual([
      SERVER_LINE_1,
      SERVER_LINE_2,
      SERVER_LINE_3,
    ])
    provider.destroy()
  })

  // BLOCKING-1 부수 발견 2(#824 R1 라이브 실증, slip-collab-panel.spec.ts) — supplyAmount/
  // vatAmount/lineTotalWithVat/authority/vatDirty 는 Y.Doc 에 쓰인 적 없는 라인(구 코드
  // 경로)에서 이 함수가 매번 undefined 로 지워버렸다. 같은 행의 다른 필드 편집(예: 단가)이
  // notifyDoc 을 내면 이 함수가 재호출되어, 방금 수량 편집이 React state 에 반영한 권위값을
  // "Y.Doc 에 없음" 으로 오판해 지운다 — previous 폴백으로 보존해야 한다(quantity/unitPrice
  // 는 타이핑 대상이라 폴백 없이 Y.Doc 직독을 유지, 이 필드들은 파생값이라 폴백 필요).
  it('Y.Doc 에 아직 쓰이지 않은 파생 금액(supplyAmount 등)은 이전 값을 보존한다(지우지 않는다)', async () => {
    const provider = await makeProvider()
    seedRows(provider, serverLines)
    const current = editLinesFrom(serverLines).map((line, i) => (
      i === 0
        ? {
            ...line,
            supplyAmount: '5550000',
            vatAmount: '555000',
            lineTotalWithVat: '6105000',
            authority: 'PRICE' as const,
            vatDirty: true,
          }
        : line
    ))

    // 0행의 supplyAmount/vatAmount/lineTotalWithVat 는 Y.Doc 에 한 번도 쓰인 적 없다(다른
    // 필드만 재시드) — 이 상태에서 재호출되어도 current[0] 의 파생값을 보존해야 한다.
    const next = coeditLinesToEditLines(provider, current, knownServerLineIds)

    expect(next[0]!.supplyAmount).toBe('5550000')
    expect(next[0]!.vatAmount).toBe('555000')
    expect(next[0]!.lineTotalWithVat).toBe('6105000')
    expect(next[0]!.authority).toBe('PRICE')
    expect(next[0]!.vatDirty).toBe(true)
    provider.destroy()
  })

  it('hydrate 후 헤더만 저장해도 서버 권위 S/V/T를 payload 대상으로 유지한다', () => {
    const slip = {
      lines: [{
        id: SERVER_LINE_1,
        productId: PRODUCT_1,
        productName: '품목 1',
        modelName: 'MODEL-1',
        specification: '',
        quantity: 1,
        unitPrice: '100005',
        supplyAmount: '100005',
        vatAmount: '9999',
        lineTotal: '110004',
        note: '기존 메모',
      }],
    } as unknown as SlipDetail

    const hydrated = toPurchaseEditLines(slip)
    const afterHeaderEdit = { ...hydrated[0]!, note: '새 메모' }

    expect(afterHeaderEdit.vatDirty).toBe(true)
    expect(afterHeaderEdit).toMatchObject({
      supplyAmount: '100005',
      vatAmount: '9999',
      lineTotalWithVat: '110004',
    })
  })

  it('원격 선행행 삭제 뒤 잔여 행은 자기 파생 금액을 유지한다', async () => {
    const provider = await makeProvider()
    seedRows(provider, serverLines)
    const current = editLinesFrom(serverLines).map((line, index) => index === 0
      ? { ...line, supplyAmount: '100005', vatAmount: '9999', lineTotalWithVat: '110004', authority: 'VAT' as const, vatDirty: true }
      : { ...line, supplyAmount: '200005', vatAmount: '19999', lineTotalWithVat: '220004', authority: 'VAT' as const, vatDirty: true })

    provider.removeItem(SERVER_LINE_1)

    const next = coeditLinesToEditLines(provider, current, knownServerLineIds)

    expect(next[0]).toMatchObject({
      lineId: SERVER_LINE_2,
      productId: PRODUCT_2,
      supplyAmount: '200005',
      vatAmount: '19999',
      lineTotalWithVat: '220004',
      authority: 'VAT',
      vatDirty: true,
    })
    provider.destroy()
  })

  it('Y.Doc 이 모르는 lineId(클라 랜덤 UUID)는 null 로 강등한다 — 전 라인 400 방지 (R8-FE-9)', async () => {
    const provider = await makeProvider()
    // seed 가 lineId 를 싣지 않으면 replaceItems 가 클라 랜덤 UUID 를 채운다 —
    // 이것이 견적의 기존 Y.Doc 상태이며, 직독값을 그대로 보내면 서버 소유검증에서 전 라인 400.
    provider.replaceItems(
      serverLines.map((line, index) => ({
        productId: line.productId,
        productName: `품목${index + 1}`,
        modelName: `MODEL-${index + 1}`,
        specification: '',
        quantity: 1,
        unitPrice: '1000',
        note: '',
      })),
    )

    const next = coeditLinesToEditLines(provider, editLinesFrom(serverLines), knownServerLineIds)

    expect(next.map((line) => line.lineId)).toEqual([null, null, null])
    provider.destroy()
  })

  it('신규 라인(lineId 미보유)은 null 로 전송한다', async () => {
    const provider = await makeProvider()
    seedRows(provider, serverLines.slice(0, 1))
    // coedit 중 추가된 신규 행 — addItem 이 클라 랜덤 lineId 를 부여한다.
    provider.addItem({ productId: PRODUCT_2, productName: '신규품목', quantity: 1, unitPrice: '500' })

    const next = coeditLinesToEditLines(
      provider,
      editLinesFrom(serverLines.slice(0, 1)),
      knownServerLineIds,
    )

    expect(next).toHaveLength(2)
    expect(next[0]!.lineId).toBe(SERVER_LINE_1)
    expect(next[1]!.lineId).toBeNull()
    provider.destroy()
  })

  it('coedit 헤더가 partnerId 를 싣는다 — 상대 피어가 구 거래처로 저장하지 않도록 (D-R8-7)', () => {
    const slip = {
      partnerId: '44f0cfc1-4a5f-4206-85cd-04ad5fa70922',
      partnerName: '한울냉열시스템',
      partnerCode: '000011111111',
      businessNumber: '000011111111',
      memo: null,
      deliveryAddress: null,
      supervisionAddress: null,
      projectName: null,
      recipientPhone: null,
      paymentDueDate: null,
    } as unknown as SlipDetail

    // partnerId 가 CRDT 헤더에 없으면 거래처 재선택이 상대 피어에 전파되지 않아, 상대는
    // 화면에 새 거래처를 보면서 구 partnerId 로 저장한다 → 가격기억이 원 거래처에 각인(R8-QA-3).
    expect(coeditHeaderValues(slip, 'OUTBOUND')['partnerId']).toBe('44f0cfc1-4a5f-4206-85cd-04ad5fa70922')
    expect(coeditHeaderValues(slip, 'OUTBOUND')['partnerName']).toBe('한울냉열시스템')
    // 거래처 미보유 전표도 빈 문자열로 키를 실어야 한다 — 키 부재 시 상대 피어의
    // getHeaderValue('partnerId') 가 ''를 돌려주는 것과 구분되지 않는다.
    expect(coeditHeaderValues({ ...slip, partnerId: null } as unknown as SlipDetail, 'INBOUND')['partnerId']).toBe('')
  })

  it('품목을 교체해도 그 행의 lineId 는 자기 것을 유지한다 (BE productId 게이트가 계보를 끊는다)', async () => {
    const provider = await makeProvider()
    seedRows(provider, serverLines)
    const current = editLinesFrom(serverLines)

    // 2행의 품목을 무관한 단품으로 교체.
    provider.setItemValueById(SERVER_LINE_2, 'productId', PRODUCT_3)

    const next = coeditLinesToEditLines(provider, current, knownServerLineIds)

    // lineId 는 위치·품목과 무관하게 자기 행을 따라간다. 계보 승계 거부는 BE
    // BundleLineageResolver 의 productId 동일성 게이트(D-R8-8) 책임이다.
    expect(next[1]!.lineId).toBe(SERVER_LINE_2)
    expect(next[1]!.productId).toBe(PRODUCT_3)
    provider.destroy()
  })
})

describe('bundleComponentLineIds — 거래처 변경 재조회의 세트 구성품 제외 (R8 재fix 회귀 교정)', () => {
  it('parentSetModel 비공백 라인만 제외한다 — setHead 무관(head 도 구성품, BE isBundleComponent 미러)', () => {
    const ids = bundleComponentLineIds([
      // 평면(단품) 라인 — 재가격 대상 유지.
      { id: SERVER_LINE_1, parentSetModel: null },
      // 세트 head — 첫 구성품(setHead=true 지만 parentSetModel 비공백) → 제외.
      // 라이브 실증: 재조회가 닿으면 배분가 88,000 → 80,000(−9.09%) 변형(전표 2026/07/16-94).
      { id: SERVER_LINE_2, parentSetModel: 'SET-HM2WAY' },
      // 세트 tail 구성품 → 제외.
      { id: SERVER_LINE_3, parentSetModel: 'SET-HM2WAY' },
    ])
    expect(ids.has(SERVER_LINE_1)).toBe(false)
    expect(ids.has(SERVER_LINE_2)).toBe(true)
    expect(ids.has(SERVER_LINE_3)).toBe(true)
  })

  it('공백 parentSetModel·undefined·id 없는 라인은 제외 집합에 넣지 않는다 (BE isBlank 미러)', () => {
    const ids = bundleComponentLineIds([
      { id: SERVER_LINE_1, parentSetModel: '  ' }, // 공백 = 계보 아님(BE isBlank)
      { id: SERVER_LINE_2 },                        // 필드 부재 = 평면
      { id: null, parentSetModel: 'SET-X' },        // id 없는 라인은 집합화 불가
    ])
    expect(ids.size).toBe(0)
  })
})

describe('SlipDetailPage — 거래처 재조회 출처 마커와 배너', () => {
  it('hit/miss/미확보를 서로 다른 사용자 문구로 표현한다', () => {
    expect(partnerRepriceMarkerText({ source: 'REMEMBERED', updatedAt: '2026-07-16T10:00:00' }))
      .toEqual({ label: '거래처 최근단가', description: '이 거래처에 마지막으로 저장된 단가 · 2026-07-16 저장' })
    expect(partnerRepriceMarkerText({ source: 'CATALOG', updatedAt: null }))
      .toEqual({ label: '판매가', description: '이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다' })
    expect(partnerRepriceMarkerText({ source: 'UNAVAILABLE', updatedAt: null }))
      .toEqual({ label: '단가 확인 필요', description: '카탈로그 판매가를 확인할 수 없어 단가를 비웠습니다. 직접 입력해 주세요' })
  })

  it('배너가 miss를 최근단가 재적용으로 오인하지 않고 출처별 건수를 알린다', () => {
    expect(partnerRepriceBannerText([
      { source: 'REMEMBERED' },
      { source: 'CATALOG' },
      { source: 'CATALOG' },
      { source: 'UNAVAILABLE' },
    ], 3)).toBe('거래처 변경 단가 확인 완료 · 최근단가 1건 · 판매가 2건 · 단가 확인 필요 1건 · 변경 3행')
  })
})

/**
 * BLOCKING-1(#824 R1) — 전표 상세(수정) 화면 수량 변경 시 금액 폭증 회귀.
 *
 * <p>이 describe 는 실제 화면 핸들러({@code updateDetailQuantity}/{@code updateDetailVat})가
 * 호출하는 그 함수들을 그대로 쓴다(재구현 아님) — SlipDetailPage.tsx 555줄 변경분에 도달
 * 테스트가 0건이던 공백(LOW-8)이 이 회귀를 통과시켰다.
 */
describe('SlipDetailPage — 수량 변경 금액 폭증 회귀 (BLOCKING-1, #824 R1)', () => {
  const baseLine = {
    quantity: 2,
    unitPrice: '100000',
    supplyAmount: '200000',
    vatAmount: '20000',
    lineTotalWithVat: '220000',
    authority: 'PRICE' as const,
  }

  it('수량 2→3: 단가는 고정, 합계는 330,000(단가×3+VAT) — 660,000(직전 합계×3) 아니다', () => {
    const patch = computeDetailQuantityChange(baseLine, '3')

    expect(patch.unitPrice).toBe('100000')
    expect(patch.quantity).toBe(3)
    expect(patch.supplyAmount).toBe('300000')
    expect(patch.vatAmount).toBe('30000')
    expect(patch.lineTotalWithVat).toBe('330000')
  })

  it('값을 바꾸지 않은 재입력(2→2)은 어떤 금액도 바꾸지 않는다 — 220,000 유지, 440,000 아니다', () => {
    const patch = computeDetailQuantityChange(baseLine, '2')

    expect(patch).toEqual({ quantity: 2 })
  })

  it('수량 입력칸을 비울 수 있다 — 빈 입력은 0으로, 직전 값(7)을 복원하지 않는다 (RED-1)', () => {
    const line = { ...baseLine, quantity: 7 }
    const patch = computeDetailQuantityChange(line, '')

    expect(patch.quantity).toBe(0)
    expect(patch.supplyAmount).toBe('0')
    expect(patch.vatAmount).toBe('0')
    expect(patch.lineTotalWithVat).toBe('0')
  })

  it('수정 화면 공급가액 편집은 단가와 기존 부가세를 보존하고 합계만 재계산한다', () => {
    const patch = detailAmountState(editSlipLineAmount(detailVatLine(baseLine), 'SUPPLY', '300000'), 'SUPPLY')

    expect(patch.quantity).toBe(2)
    expect(patch.unitPrice).toBe('100000')
    expect(patch.supplyAmount).toBe('300000')
    expect(patch.vatAmount).toBe('20000')
    expect(patch.lineTotalWithVat).toBe('320000')
  })

  it('수정 화면 부가세 편집은 단가와 기존 공급가액을 보존하고 합계만 재계산한다', () => {
    const patch = detailAmountState(editSlipLineAmount(detailVatLine(baseLine), 'VAT', '7000'), 'VAT')

    expect(patch.unitPrice).toBe('100000')
    expect(patch.supplyAmount).toBe('200000')
    expect(patch.vatAmount).toBe('7000')
    expect(patch.lineTotalWithVat).toBe('207000')
  })

  it('detailAmountState 는 수량 0을 "값 없음"으로 오판해 1로 되돌리지 않는다', () => {
    // updateDetailVat 은 SUPPLY/VAT/TOTAL 필드 각각의 CollaborativeSlipInput 이 자기
    // 값을 Y.Doc 원문과 비교해 재동기화할 때도 호출된다(수량 필드와 별개 필드). 방금
    // 수량을 0으로 비운 직후 이 재동기화가 겹치면, quantity=0 을 Number(0)||1 로
    // "값 없음" 취급해 1로 되돌리는 게 실측 회귀였다(clear 직후 "1"로 튐).
    const zeroQuantityLine = { ...baseLine, quantity: 0, supplyAmount: '0', vatAmount: '0', lineTotalWithVat: '0' }
    const patch = detailAmountState(editLineVat(detailVatLine(zeroQuantityLine), 'SUPPLY', ''), 'SUPPLY')

    expect(patch.quantity).toBe(0)
  })

  it('협업 중 공급가액이 바뀌면 합계는 Y.Doc의 공급가액+부가세로 파생된다', async () => {
    const provider = await makeProvider()
    seedRows(provider, serverLines)
    provider.setItemValue(0, 'supplyAmount', '200000')
    provider.setItemValue(0, 'vatAmount', '20000')
    provider.setItemValue(0, 'lineTotalWithVat', '220000')
    provider.setItemValue(0, 'supplyAmount', '300000')

    const current = editLinesFrom(serverLines).map((line, index) => index === 0
      ? { ...line, supplyAmount: '200000', vatAmount: '20000', lineTotalWithVat: '220000' }
      : line)
    const next = coeditLinesToEditLines(provider, current, knownServerLineIds)

    expect(next[0]).toMatchObject({
      supplyAmount: '300000',
      vatAmount: '20000',
      lineTotalWithVat: '320000',
    })
    provider.destroy()
  })

  it('수정 화면 합계 협업 입력은 읽기 전용이고 TOTAL 사용자 편집 경로를 노출하지 않는다', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./SlipDetailPage.tsx', import.meta.url)),
      'utf8',
    )
    const totalBindings = Array.from(source.matchAll(
      /fieldPath=\{`items\.\$\{index\}\.lineTotalWithVat`\}[\s\S]*?\/>/g,
    ), (match) => match[0])

    expect(totalBindings).toHaveLength(2)
    expect(totalBindings.every((binding) => /readOnly(?:=\{true\})?/.test(binding))).toBe(true)
    expect(totalBindings.every((binding) => !binding.includes("updateDetailVat(index, updateSalesLine, 'TOTAL'"))).toBe(true)
    expect(totalBindings.every((binding) => !binding.includes("updateDetailVat(index, updatePurchaseLine, 'TOTAL'"))).toBe(true)
    expect(source).toContain('editSlipLineAmount')
  })
})

/**
 * 1차 적대검증(OPUS) 발견 1·2(#937 R1) — PR #937(#926 슬라이스) 이 세운 "두 화면 정책 일치"
 * 주장이 정책표 1행(단가)에서 성립하지 않았다.
 *
 * <p>근본원인: quantity/unitPrice 변경({@link computeDetailQuantityChange}/
 * {@link computeDetailUnitPriceChange})은 로컬 React state 만 재계산하고 Y.Doc 의
 * supplyAmount/vatAmount 필드는 건드리지 않았다. 그 필드들 자신이 아니라 quantity/unitPrice
 * 자신의 {@code CollaborativeSlipInput} 이 Y.Doc 에 값을 쓸 때마다 전체 문서변경 이벤트가
 * 나가고, {@link coeditLinesToEditLines} 가 그 이벤트에서 "Y.Doc 원문이 있으면 그것을
 * 신뢰"(원격 피어 반영을 위한 정상 설계)하므로 방금 재계산한 로컬값을 stale Y.Doc 값으로
 * 되돌렸다. 이 Y.Doc 은 REST 재조회와 무관하게 세션 간 영속하므로 재열기도 같은 stale 값을
 * 본다 — 그 상태에서 무수정 재저장하면 payload 가 stale 값을 서버에 되돌려 쓴다.
 *
 * <p>이 describe 는 화면 핸들러가 실제로 호출하는 함수(computeDetailUnitPriceChange/
 * computeDetailQuantityChange/detailAmountDocWrites/buildDetailLinePayload)를 그대로 이어
 * 붙여 적대검증 원문의 4단계 조작을 판별한다 — 이 파일의 기존 관례(전체 컴포넌트 마운트
 * 없이 순수함수 조합)를 따른다. detailAmountDocWrites 를 호출하지 않으면(=근본수정 이전
 * 코드) 3·4단계 assertion 이 stale 200000/20000 을 받아 실패한다(RED — 보고서 원문 첨부).
 */
describe('SlipDetailPage — 단가·수량 변경 시 Y.Doc 공급가액·부가세 동기화 (발견 1·2, #937 R1)', () => {
  const seedLine = {
    lineId: SERVER_LINE_1,
    productId: PRODUCT_1,
    productName: '품목1',
    modelName: 'MODEL-1',
    specification: '',
    quantity: 2,
    unitPrice: '100000',
    supplyAmount: '200000',
    vatAmount: '20000',
    lineTotalWithVat: '220000',
    note: '',
  }
  const knownIds = toServerLineIdSet([{ id: SERVER_LINE_1 }])

  it('1단계 전제 — REST 하이드레이션: 단가 100,000 / 공급 200,000 / 부가세 20,000 / 합계 220,000', () => {
    const slip = {
      lines: [{
        id: SERVER_LINE_1,
        productId: PRODUCT_1,
        productName: '품목1',
        modelName: 'MODEL-1',
        specification: '',
        quantity: 2,
        unitPrice: '100000',
        supplyAmount: '200000',
        vatAmount: '20000',
        lineTotal: '220000',
        note: '',
      }],
    } as unknown as SlipDetail

    const hydrated = toPurchaseEditLines(slip)[0]!

    expect(hydrated).toMatchObject({
      unitPrice: '100000', supplyAmount: '200000', vatAmount: '20000', lineTotalWithVat: '220000',
    })
    // REST 하이드레이션은 저장된 라인(공급/부가세/합계 모두 non-null)을 전부 vatDirty=true 로 본다
    // — 재열기 후 무수정 저장이 4단계처럼 payload 에 supplyAmount 를 싣는 이유.
    expect(hydrated.vatDirty).toBe(true)
  })

  it('2단계 — 단가만 60,000 으로 바꾸면 화면이 즉시 정책대로(120,000/12,000/132,000) 재계산된다 (E2 — 이 PR 제목의 주장)', () => {
    const patch = computeDetailUnitPriceChange(seedLine, '60000')

    expect(patch.unitPrice).toBe('60000')
    expect(patch.supplyAmount).toBe('120000')
    expect(patch.vatAmount).toBe('12000')
    expect(patch.lineTotalWithVat).toBe('132000')
  })

  it('값을 바꾸지 않은 단가 재입력은 어떤 금액도 바꾸지 않는다(드리프트 원천 차단)', () => {
    expect(computeDetailUnitPriceChange(seedLine, '100000')).toEqual({ unitPrice: '100000' })
  })

  it('RED→GREEN: 3단계 재열기 화면이 stale Y.Doc 값(200,000/20,000)이 아니라 재계산값(120,000/12,000)과 일치한다', async () => {
    const provider = await makeProvider()
    provider.replaceItems([seedLine])

    // 2단계 — CollaborativeSlipInput 은 자신이 바인딩된 필드(unitPrice)만 Y.Doc 에 쓴다
    // (라이브 동작 그대로 재현 — supplyAmount/vatAmount 필드에는 이 시점에 아무도 쓰지 않는다).
    const afterPriceEdit = { ...seedLine, ...computeDetailUnitPriceChange(seedLine, '60000') }
    provider.setItemValueById(SERVER_LINE_1, 'unitPrice', afterPriceEdit.unitPrice as string)

    // 근본수정 — 실 컴포넌트의 sync effect 가 하는 일 그대로(detailAmountDocWrites 는 그
    // effect 가 호출하는 순수함수 자신 — 이 두 줄을 빼면 RED 로 되돌아간다).
    for (const write of detailAmountDocWrites(provider, [afterPriceEdit])) {
      provider.setItemValueById(write.lineId, 'supplyAmount', write.supplyAmount)
      provider.setItemValueById(write.lineId, 'vatAmount', write.vatAmount)
    }

    // 3단계 — 같은 문서를 새로 연다(새 컴포넌트 마운트, previous=REST 하이드레이션 스냅샷).
    const reopened = coeditLinesToEditLines(provider, [{ ...afterPriceEdit, key: 'k1' }], knownIds)[0]!

    expect(reopened.supplyAmount).toBe('120000')
    expect(reopened.vatAmount).toBe('12000')
    provider.destroy()
  })

  it('RED→GREEN: 4단계 무수정 재저장 payload 가 서버 값(120,000/12,000)을 되돌리지 않는다 (E1)', async () => {
    const provider = await makeProvider()
    provider.replaceItems([seedLine])
    const afterPriceEdit = { ...seedLine, ...computeDetailUnitPriceChange(seedLine, '60000') }
    provider.setItemValueById(SERVER_LINE_1, 'unitPrice', afterPriceEdit.unitPrice as string)
    for (const write of detailAmountDocWrites(provider, [afterPriceEdit])) {
      provider.setItemValueById(write.lineId, 'supplyAmount', write.supplyAmount)
      provider.setItemValueById(write.lineId, 'vatAmount', write.vatAmount)
    }
    const reopened = coeditLinesToEditLines(provider, [{ ...afterPriceEdit, key: 'k1' }], knownIds)[0]!

    // 4단계 — 아무것도 고치지 않고 저장.
    const payload = buildDetailLinePayload(reopened)

    if (reopened.vatDirty) {
      expect(payload.supplyAmount).toBe('120000')
      expect(payload.vatAmount).toBe('12000')
    } else {
      // vatDirty=false 여도 안전하다 — BE 가 quantity×unitPrice(2×60000)로 재계산해 같은 120,000.
      expect(payload.supplyAmount).toBeUndefined()
    }
    provider.destroy()
  })

  it('RED→GREEN(발견 2 — 발견 1 과 같은 뿌리): 수량 2→3 변경도 화면 금액이 즉시 바뀌고 doc-sync 가 되돌리지 않는다 (E3)', async () => {
    const provider = await makeProvider()
    provider.replaceItems([seedLine])

    const afterQtyEdit = { ...seedLine, ...computeDetailQuantityChange(seedLine, '3') }
    expect(afterQtyEdit.supplyAmount).toBe('300000') // 단가(100,000, 고정) × 수량 3
    expect(afterQtyEdit.vatAmount).toBe('30000')
    provider.setItemValueById(SERVER_LINE_1, 'quantity', String(afterQtyEdit.quantity))

    for (const write of detailAmountDocWrites(provider, [afterQtyEdit])) {
      provider.setItemValueById(write.lineId, 'supplyAmount', write.supplyAmount)
      provider.setItemValueById(write.lineId, 'vatAmount', write.vatAmount)
    }

    const resynced = coeditLinesToEditLines(provider, [{ ...afterQtyEdit, key: 'k1' }], knownIds)[0]!
    expect(resynced.supplyAmount).toBe('300000')
    expect(resynced.vatAmount).toBe('30000')
    provider.destroy()
  })

  it('detailAmountDocWrites 는 이미 Y.Doc 과 일치하는 라인은 걸러낸다(무한루프 방지 — 재기록 없음)', async () => {
    const provider = await makeProvider()
    provider.replaceItems([{ ...seedLine, supplyAmount: '120000', vatAmount: '12000' }])

    const writes = detailAmountDocWrites(provider, [
      { lineId: SERVER_LINE_1, supplyAmount: '120000', vatAmount: '12000' },
    ])

    expect(writes).toHaveLength(0)
    provider.destroy()
  })

  it('detailAmountDocWrites 는 lineId 없는 라인을 건너뛴다(이 화면은 신규 라인을 만들 수 없다 — "행 추가"가 SlipFormPage 로 안내만 함)', async () => {
    const provider = await makeProvider()
    const writes = detailAmountDocWrites(provider, [
      { lineId: null, supplyAmount: '999', vatAmount: '99' },
    ])
    expect(writes).toHaveLength(0)
    provider.destroy()
  })

  /**
   * 라이브QA 도중 실제로 터진 회귀(RED — vitest 는 못 잡고 브라우저에서만 재현됨,
   * "Maximum call stack size exceeded"): syncDetailAmountToDoc 최초 구현은 unitPrice/
   * quantity 를 무조건 썼다. 그 필드 자신의 개별 CollaborativeSlipInput 이 방금 쓴 값을
   * "원격 변경"으로 오인해 onValueChange 를 재호출하는데, 그 재호출은 JSX map 클로저의 stale
   * preEditLine 을 다시 넘겨받아 no-op 가드가 "값이 바뀌었다"고 영원히 오판 → 매 재귀마다
   * 다시 쓰기 → 무한루프. Y.Doc 현재값과 비교하는 이 가드가 없으면 재현된다.
   */
  it('RED→GREEN(스택오버플로 회귀 가드, 라이브QA 실측): syncDetailAmountToDoc 를 같은 목표값으로 재호출해도 추가 문서변경을 내지 않는다', async () => {
    const provider = await makeProvider()
    provider.replaceItems([seedLine])
    let docChangeCount = 0
    const unsubscribe = provider.subscribeDoc(() => { docChangeCount += 1 })

    const patch = computeDetailUnitPriceChange(seedLine, '60000')
    syncDetailAmountToDoc(provider, seedLine, patch)
    expect(docChangeCount).toBe(1) // 1차 — 실제 변경(unitPrice/supplyAmount/vatAmount 갱신) 발생

    // 실 브라우저의 재진입 캐스케이드는 stale JSX 클로저(seedLine — 편집 전 스냅샷)를 그대로
    // 다시 넘긴다. 이 재호출이 또 다른 문서변경을 내면 재귀가 끝나지 않는다.
    syncDetailAmountToDoc(provider, seedLine, patch)
    syncDetailAmountToDoc(provider, seedLine, patch)
    expect(docChangeCount).toBe(1) // 2·3차 — Y.Doc 이 이미 목표값이라 추가 변경 없음(재귀 종료 보장)

    expect(provider.getItemValueById(SERVER_LINE_1, 'unitPrice')).toBe('60000')
    expect(provider.getItemValueById(SERVER_LINE_1, 'supplyAmount')).toBe('120000')
    expect(provider.getItemValueById(SERVER_LINE_1, 'vatAmount')).toBe('12000')

    unsubscribe()
    provider.destroy()
  })
})

/**
 * 발견 3(#937 R1, 1차 적대검증) — 생성 화면(LineRow.tsx)은 단가/공급가액/부가세 입력에서
 * `2.7`(조용한 HALF_UP 반올림)·`-3`(음수 수용)·`1e3`(지수표기) 를 거부하지만, 전표 상세
 * 수정 화면은 아무 필터 없이 전부 수용했다(음수 공급가액까지). E4 — 두 화면의 거부 규칙은
 * 같아야 한다.
 */
describe('SlipDetailPage — 금액 입력 거부 규칙 (발견 3, #937 R1, E4)', () => {
  it.each(['2.7', '-3', '1e3', '1,,2'])('D-2 미러(LineRow.test.tsx): 잘못된 금액 문자열 "%s"은 숫자로 재조합하지 않고 거부한다', (raw) => {
    expect(parseEditableDetailAmountInput(raw)).toBeNull()
  })

  it.each([
    ['', ''],
    ['0', '0'],
    ['60000', '60000'],
    ['1,000', '1000'],
    ['12,345,678', '12345678'],
  ])('허용된 입력 "%s"은 콤마만 제거해 그대로 받는다', (raw, expected) => {
    expect(parseEditableDetailAmountInput(raw)).toBe(expected)
  })

  it('LineRow.tsx 의 parseEditableAmountInput 과 판정 규칙이 바이트 단위로 동일하다(E4) — 생성 화면 소스 정규식 대조', () => {
    const lineRowSource = readFileSync(
      fileURLToPath(new URL(
        '../../../../web/design-system/src/components/LineRow/LineRow.tsx',
        import.meta.url,
      )),
      'utf8',
    )
    const lineRowMatch = lineRowSource.match(
      /function parseEditableAmountInput\(raw: string\): string \| null \{([\s\S]*?)\n\}/,
    )
    expect(lineRowMatch).not.toBeNull()

    const detailSource = readFileSync(
      fileURLToPath(new URL('./SlipDetailPage.tsx', import.meta.url)),
      'utf8',
    )
    const detailMatch = detailSource.match(
      /export function parseEditableDetailAmountInput\(raw: string\): string \| null \{([\s\S]*?)\n\}/,
    )
    expect(detailMatch).not.toBeNull()

    expect(detailMatch![1]!.trim()).toBe(lineRowMatch![1]!.trim())
  })

  it('단가·공급가액·부가세 6개 셀(매출·매입) 모두 parseValue 필터를 연결한다 — 소스 배선 확인', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./SlipDetailPage.tsx', import.meta.url)),
      'utf8',
    )
    const amountFieldBindings = Array.from(source.matchAll(
      /fieldPath=\{`items\.\$\{index\}\.(?:unitPrice|supplyAmount|vatAmount)`\}[\s\S]*?\/>/g,
    ), (match) => match[0])

    expect(amountFieldBindings).toHaveLength(6) // 매출 3(단가·공급가액·부가세) + 매입 3
    expect(amountFieldBindings.every(
      (binding) => binding.includes('parseValue={parseEditableDetailAmountInput}'),
    )).toBe(true)
  })
})
