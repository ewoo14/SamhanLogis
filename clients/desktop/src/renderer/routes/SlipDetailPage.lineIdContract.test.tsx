import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import {
  encodeBase64Update,
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
  computeDetailVatChange,
  detailAmountDocWrites,
  detailAmountState,
  detailVatLine,
  editUnitPriceColumnHeader,
  editUnitPriceLabel,
  parseEditableDetailAmountInput,
  parseEditableDetailQuantityInput,
  partnerRepriceBannerText,
  partnerRepriceMarkerText,
  persistedDetailLines,
  repricedFieldValue,
  slipLineAmounts,
  syncDetailAmountToDoc,
  toPurchaseEditLines,
} from './SlipDetailPage'
import { toServerLineIdSet } from '../realtime/coeditLineIds'
import { editLineVat, editSlipLineAmount, recalculateLineVat } from '../utils/lineVat'
import { removeLinePreservingMinimum } from '../utils/autoBlankRow'
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

describe('SlipDetailPage — 수정 화면 단가 라벨 의미 계약 (재수렴 R-1 근본수정 반영)', () => {
  // 🚨 이 describe 는 원래 unitPrice/unitPriceWithVat 비교로 행마다 다른 라벨을 매기는
  // 것을 "정상"으로 단언했다 — 그 자체가 #937 R-1 결함(라벨과 실제 계산 불일치)이었다.
  // 실제 계산({@link computeDetailUnitPriceChange}/{@link computeDetailQuantityChange})은
  // 두 컬럼 값과 무관하게 예외 없이 PRICE 권위(VAT 포함)이므로, 라벨도 데이터에 의존하지
  // 않는 상수여야 한다(V1). 아래는 그 불변식에 맞춘 갱신이다 — "안 고쳤고 괜찮다" 판정이
  // 아니라 근본수정이 뒤집은 스펙이다.
  it('unitPrice/unitPriceWithVat 값과 무관하게 항상 "단가(VAT포함)" 이다 — 실제 계산이 항상 PRICE 권위이므로', () => {
    expect(editUnitPriceLabel({ unitPrice: '10000', unitPriceWithVat: '11000' }))
      .toBe('단가(VAT포함)')
    expect(editUnitPriceLabel({ unitPrice: '11000', unitPriceWithVat: '11000' }))
      .toBe('단가(VAT포함)')
    expect(editUnitPriceLabel({ unitPrice: '10000', unitPriceWithVat: null }))
      .toBe('단가(VAT포함)')
  })

  it('헤더도 행 구성과 무관하게 항상 "단가(VAT포함)" 이다 — 더 이상 행별로 갈릴 수 없다(라벨이 상수이므로)', () => {
    expect(editUnitPriceColumnHeader([
      { unitPrice: '10000', unitPriceWithVat: '11000' },
    ])).toBe('단가(VAT포함)')
    expect(editUnitPriceColumnHeader([
      { unitPrice: '11000', unitPriceWithVat: '11000' },
    ])).toBe('단가(VAT포함)')
    expect(editUnitPriceColumnHeader([
      { unitPrice: '10000', unitPriceWithVat: '11000' },
      { unitPrice: '11000', unitPriceWithVat: '11000' },
    ])).toBe('단가(VAT포함)')
    expect(editUnitPriceColumnHeader([])).toBe('단가(VAT포함)')
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

async function makeProviderFromSnapshot(snapshot: string): Promise<DocCoeditProvider> {
  return createDocCoeditProvider({
    documentId: 'slip-1',
    basePath: '/slips/slip-1',
    initialUpdates: async () => ({ updates: [snapshot] }),
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
  it('첫 라인 삭제와 둘째 라인 단가 편집이 동시에 일어나도 둘째 라인의 금액을 보존한다 (D1\')', async () => {
    const source = readFileSync(
      fileURLToPath(new URL('./SlipDetailPage.tsx', import.meta.url)),
      'utf8',
    )
    expect(source).toMatch(/function removePurchaseLine\(index: number\)[\s\S]*?removeItem\(lineId\)/)
    expect(source).toMatch(/function removeSalesLine\(index: number\)[\s\S]*?removeItem\(lineId\)/)
    expect(source).toMatch(/function detailCoeditFieldPath\([\s\S]*lineId[\s\S]*items\.\$\{line\.lineId \|\| index\}/)
    expect(source).toMatch(/function detailCoeditTestIdPath\([\s\S]*items\.\$\{index\}/)
    expect(source).not.toMatch(/fieldPath=\{`items\.\$\{index\}\./)
    const detailDomPaths = Array.from(source.matchAll(
      /testIdPath=\{detailCoeditTestIdPath\(index, '([^']+)'\)\}/g,
    ), (match) => match[1])
    expect(detailDomPaths).toEqual([
      'productName', 'modelName', 'specification', 'quantity', 'unitPrice', 'supplyAmount', 'vatAmount', 'lineTotalWithVat',
      'productName', 'modelName', 'specification', 'quantity', 'unitPrice', 'supplyAmount', 'vatAmount', 'lineTotalWithVat',
    ])
    const inputSource = readFileSync(
      fileURLToPath(new URL('../components/collab/CollaborativeSlipInput.tsx', import.meta.url)),
      'utf8',
    )
    expect(inputSource).toMatch(/getItemIndexById\([\s\S]*rowKey/)

    const baseDoc = new Y.Doc()
    const baseItems = baseDoc.getArray<Y.Map<unknown>>('items')
    const first = new Y.Map<unknown>()
    first.set('lineId', SERVER_LINE_1)
    first.set('productId', PRODUCT_1)
    first.set('quantity', '1')
    first.set('unitPrice', '10000')
    first.set('supplyAmount', '10000')
    first.set('vatAmount', '1000')
    first.set('lineTotalWithVat', '11000')
    const second = new Y.Map<unknown>()
    second.set('lineId', SERVER_LINE_2)
    second.set('productId', PRODUCT_2)
    second.set('quantity', '1')
    second.set('unitPrice', '20000')
    second.set('supplyAmount', '20000')
    second.set('vatAmount', '2000')
    second.set('lineTotalWithVat', '22000')
    baseItems.push([first, second])
    const snapshot = encodeBase64Update(Y.encodeStateAsUpdate(baseDoc))

    const deletingPeer = await makeProviderFromSnapshot(snapshot)
    const editingPeer = await makeProviderFromSnapshot(snapshot)

    // A: SlipDetailPage 의 수정된 삭제 경로 — 행 자신을 안정키로 제거한다.
    deletingPeer.removeItem(SERVER_LINE_1)
    // B: 실제 단가 편집이 동기적으로 쓰는 대상 라인의 필드를 동시에 변경한다.
    editingPeer.doc.transact(() => {
      editingPeer.setItemValue(1, 'unitPrice', '80000')
      editingPeer.setItemValueById(SERVER_LINE_2, 'supplyAmount', '72727')
      editingPeer.setItemValueById(SERVER_LINE_2, 'vatAmount', '7273')
      editingPeer.setItemValueById(SERVER_LINE_2, 'lineTotalWithVat', '80000')
    })

    deletingPeer.applyRemoteUpdate(encodeBase64Update(Y.encodeStateAsUpdate(editingPeer.doc)))
    editingPeer.applyRemoteUpdate(encodeBase64Update(Y.encodeStateAsUpdate(deletingPeer.doc)))

    for (const peer of [deletingPeer, editingPeer]) {
      expect(peer.items).toHaveLength(1)
      expect(peer.getItemValueById(SERVER_LINE_2, 'unitPrice')).toBe('80000')
      expect(peer.getItemValueById(SERVER_LINE_2, 'supplyAmount')).toBe('72727')
      expect(peer.getItemValueById(SERVER_LINE_2, 'vatAmount')).toBe('7273')
      expect(peer.getItemValueById(SERVER_LINE_2, 'lineTotalWithVat')).toBe('80000')
      peer.destroy()
    }
  })

  it('삭제는 React 행 언마운트 후에 coedit Map을 제거한다 (D1\' 인덱스 구독 경합)', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./SlipDetailPage.tsx', import.meta.url)),
      'utf8',
    )
    // provider removeItem을 같은 클릭 핸들러에서 즉시 호출하면, 아직 살아 있는
    // items.1 입력 구독이 빈 1번 행을 읽어 잔여 라인의 금액을 덮어쓴다. 삭제 대상은
    // 먼저 로컬 배열에서 빠져야 하며, 그 뒤 안정키 Map을 제거해야 한다.
    expect(source).toMatch(/function detailCoeditFieldPath\([\s\S]*lineId[\s\S]*items\.\$\{line\.lineId \|\| index\}/)
    expect(source).not.toMatch(/fieldPath=\{`items\.\$\{index\}\./)
    const inputSource = readFileSync(
      fileURLToPath(new URL('../components/collab/CollaborativeSlipInput.tsx', import.meta.url)),
      'utf8',
    )
    expect(inputSource).toMatch(/getItemIndexById\([\s\S]*rowKey/)
  })

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

describe('판매전표 수정 모드 trailing 빈행 계약', () => {
  it('RED-A: 수정 hydrate 후 맨 아래 빈행이 있고, 빈행 확정 시 그 아래에 다시 빈행을 둔다', () => {
    const slip = {
      lines: [{
        id: SERVER_LINE_1,
        productId: PRODUCT_1,
        productName: '품목 1',
        modelName: 'MODEL-1',
        quantity: 1,
        unitPrice: '1000',
        lineTotal: '1000',
      }],
    } as unknown as SlipDetail

    const hydrated = toPurchaseEditLines(slip)
    expect(hydrated).toHaveLength(2)
    expect(hydrated[1]?.productId).toBe('')

    const next = toPurchaseEditLines({ ...slip, lines: [
      { ...slip.lines[0], id: SERVER_LINE_1 },
      { id: null, productId: PRODUCT_2, productName: '품목 2', quantity: 1, unitPrice: '2000', lineTotal: '2000' },
    ] } as unknown as SlipDetail)
    expect(next.at(-1)?.productId).toBe('')
    expect(toPurchaseEditLines({ lines: [] } as unknown as SlipDetail)).toHaveLength(1)
  })

  it('RED-B: 빈행만 남겨 저장해도 payload에는 빈행이 없고, 신규 증식·최소 1행 계약은 유지한다', () => {
    const blank = {
      key: 'blank',
      lineId: null,
      productId: '',
      productName: '',
      modelName: '',
      specification: '',
      quantity: 0,
      unitPrice: '0',
      note: '',
    }
    const confirmed = { ...blank, key: 'confirmed', lineId: SERVER_LINE_1, productId: PRODUCT_1, quantity: 1, unitPrice: '1000' }

    expect(persistedDetailLines([confirmed, blank])).toEqual([confirmed])
    expect(persistedDetailLines([blank])).toEqual([])
    const afterDeletingAll = removeLinePreservingMinimum(
      [confirmed], confirmed.key, (line) => line.key, () => blank, 1,
    )
    expect(afterDeletingAll).toHaveLength(1)
    expect(afterDeletingAll[0]?.productId).toBe('')
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
 * #937 R-3 재수렴 — 거래처 재조회가 필드에 넣는 값의 VAT 도메인.
 *
 * <p>1041bad17 이 이 화면의 실제 계산(recalculateLineVat PRICE 권위)을 "필드=VAT 포함"으로
 * 정렬했고 071e6c7ac 가 라벨도 상수 "단가(VAT포함)"로 고정했지만, 거래처 변경 재조회
 * ({@code repriceEditLinesForPartner} 의 핵심 변환 {@link repricedFieldValue})는 그 전환에서
 * 빠져 여전히 기억/카탈로그(VAT 포함)를 {@code vatExclusiveOf}(÷1.1)로 필드에 실었다 —
 * "필드=VAT 제외"였던 옛 계약 그대로다. 두 도메인이 이제 같으므로 변환 없이 그대로 실려야
 * 하는데, 옛 변환이 남아 있으면 기억 500,000 이 필드에 454,545 로 들어가 실단가가 9.09%
 * 낮아지고 그 값이 다시 기억에 각인돼 거래처를 왕복할 때마다 복리로 준다.
 *
 * <p>근본수정 전 RED(라이브 실증 #937-R3 그대로 재현):
 *   expected '500000' to be '454545'  (기억 500,000 hit)
 *   expected '250000' to be '227272'  (카탈로그 판매가 250,000 miss)
 */
describe('SlipDetailPage — 거래처 재조회 필드 VAT 도메인 (#937 R-3)', () => {
  it('기억(REMEMBERED) hit — 필드에 기억단가가 변환 없이 그대로 실린다(÷1.1 아니다)', () => {
    expect(repricedFieldValue({ source: 'REMEMBERED', unitPrice: '500000' })).toBe('500000')
  })

  it('카탈로그(CATALOG) miss — 필드에 판매가가 변환 없이 그대로 실린다(÷1.1 아니다)', () => {
    expect(repricedFieldValue({ source: 'CATALOG', unitPrice: '250000' })).toBe('250000')
  })

  it('소수 2자리 기억값도 절사 없이 그대로 승격된다(왕복 무손실 — 정수 절사는 더 이상 없다)', () => {
    expect(repricedFieldValue({ source: 'REMEMBERED', unitPrice: '499999.50' })).toBe('499999.50')
  })

  it('UNAVAILABLE(카탈로그도 미확보) — 값을 지어내지 않고 빈 문자열로 저장을 막는다(기존 계약 유지)', () => {
    expect(repricedFieldValue({ source: 'UNAVAILABLE', unitPrice: '' })).toBe('')
  })

  /**
   * #937-R3 라이브 실증 그대로 — B 기억 500,000 인데 필드에 454,545(=round(500000/1.1))가
   * 실리는 회귀를 죽인다. 뮤테이션(÷1.1 복원) 시 이 단언만 RED 로 되돌아온다.
   */
  it('회귀 가드 — 필드값이 기억÷1.1(454545) 이면 실패한다(#937-R3 라이브 실증 값)', () => {
    const value = repricedFieldValue({ source: 'REMEMBERED', unitPrice: '500000' })
    expect(value).not.toBe('454545')
    expect(value).toBe('500000')
  })
})

/**
 * BLOCKING-1(#824 R1) — 전표 상세(수정) 화면 수량 변경 시 금액 폭증 회귀.
 *
 * <p>이 describe 는 실제 화면 핸들러({@code updateDetailQuantity}/{@code updateDetailVat})가
 * 호출하는 그 함수들을 그대로 쓴다(재구현 아님) — SlipDetailPage.tsx 555줄 변경분에 도달
 * 테스트가 0건이던 공백(LOW-8)이 이 회귀를 통과시켰다.
 *
 * <p>🚨 #937 R2 갱신 — 첫 테스트의 기대값은 원래 "단가=VAT 제외 공급단가"(#937 R1 이 세운
 * 이제는 틀린 것으로 밝혀진 가정) 기준이었다. 2차 적대검증 E-1 근본수정(단가=VAT 포함,
 * 생성 화면과 동일 도메인) 이후 같은 (수량, 단가) 입력의 <b>합계</b>는 그대로 300,000
 * (100,000 × 3)이지만, 그 300,000 이 이제는 "공급가액"이 아니라 "VAT 포함 합계"이므로
 * 공급가액/부가세는 그 합계에서 분리한 272,727/27,273 이다(0 방향 절사) — 옛 330,000
 * (공급가액 300,000 에 부가세 10%를 얹은 값)은 더 이상 나오지 않는다.
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

  it('수량 2→3(#937 R2 갱신 — 단가 VAT 포함 도메인): 합계는 300,000(단가×3) 에서 공급 272,727/부가세 27,273 로 분리 — 660,000(직전 합계×3)도, 330,000(구 SUPPLY 도메인)도 아니다', () => {
    const patch = computeDetailQuantityChange(baseLine, '3')

    expect(patch.unitPrice).toBe('100000')
    expect(patch.quantity).toBe(3)
    expect(patch.supplyAmount).toBe('272727')
    expect(patch.vatAmount).toBe('27273')
    expect(patch.lineTotalWithVat).toBe('300000')
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
      /fieldPath=\{detailCoeditFieldPath\(index, line, 'lineTotalWithVat'\)\}[\s\S]*?\/>/g,
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
 *
 * <p>🚨 #937 R2 갱신 — 아래 단가 60,000 관련 기대값(120,000/12,000/132,000)은 #937 R1 이
 * 세운 "단가=VAT 제외 공급단가" 가정 기준이었다. 2차 적대검증 E-1 이 이 가정 자체가 생성
 * 화면과 다른 세금 정책이라 틀렸다고 확정해(수량 2·단가 60,000 이 생성 120,000 대 수정
 * 132,000 으로 갈렸다), 이제는 생성 화면과 같은 VAT 포함 단가 도메인(109,090/10,910/
 * 120,000)으로 재계산한다. 문서 흐름(재열기·무수정 재저장이 stale 값을 되돌리지 않는다)
 * 자체는 이 라운드에서 바뀌지 않았다 — 바뀐 것은 그 흐름이 보존하는 "정답" 숫자뿐이다.
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

  it('1단계 전제 — REST 하이드레이션: 단가(VAT포함) 110,000 / 공급 200,000 / 부가세 20,000 / 합계 220,000 (재수렴 3차 U1 갱신)', () => {
    // 🚨 재수렴 3차(#937) U1 근본수정으로 갱신 — 이 fixture 는 종전 unitPriceWithVat 를 아예
    // 지정하지 않아 하이드레이션이 line.unitPrice(VAT 제외 100,000)를 그대로 싣는 것을
    // "전제"로 삼고 있었다. 그 자체가 U1 결함(필드=VAT 제외, 라벨·계산=VAT 포함)이었다 — 이
    // describe 블록 자신의 2단계(아래)도 "생성 화면과 같은 VAT 포함 정책"이라 명시한다. 이제
    // unit_price/unit_price_with_vat 두 컬럼을 실제 DB 형태로 모두 명시(둘 다 자기 도메인
    // 안에서 일관 — 100,000×2=200,000=supply, 110,000×2=220,000=supply+vat)하고, 하이드레이션이
    // unit_price_with_vat 를 싣는 것을 검증한다(U1 전용 describe 블록과 같은 계약).
    const slip = {
      lines: [{
        id: SERVER_LINE_1,
        productId: PRODUCT_1,
        productName: '품목1',
        modelName: 'MODEL-1',
        specification: '',
        quantity: 2,
        unitPrice: '100000',
        unitPriceWithVat: '110000',
        supplyAmount: '200000',
        vatAmount: '20000',
        lineTotal: '220000',
        note: '',
      }],
    } as unknown as SlipDetail

    const hydrated = toPurchaseEditLines(slip)[0]!

    expect(hydrated).toMatchObject({
      unitPrice: '110000', supplyAmount: '200000', vatAmount: '20000', lineTotalWithVat: '220000',
    })
    // REST 하이드레이션은 저장된 라인(공급/부가세/합계 모두 non-null)을 전부 vatDirty=true 로 본다
    // — 재열기 후 무수정 저장이 4단계처럼 payload 에 supplyAmount 를 싣는 이유.
    expect(hydrated.vatDirty).toBe(true)
  })

  it('2단계 — 단가만 60,000 으로 바꾸면 화면이 즉시 생성 화면과 같은 VAT 포함 정책대로(109,090/10,910/120,000) 재계산된다 (#937 R2 갱신 — E-1)', () => {
    const patch = computeDetailUnitPriceChange(seedLine, '60000')

    expect(patch.unitPrice).toBe('60000')
    expect(patch.supplyAmount).toBe('109090')
    expect(patch.vatAmount).toBe('10910')
    expect(patch.lineTotalWithVat).toBe('120000')
  })

  it('값을 바꾸지 않은 단가 재입력은 어떤 금액도 바꾸지 않는다(드리프트 원천 차단)', () => {
    expect(computeDetailUnitPriceChange(seedLine, '100000')).toEqual({ unitPrice: '100000' })
  })

  it('RED→GREEN: 3단계 재열기 화면이 stale Y.Doc 값(200,000/20,000)이 아니라 재계산값(109,090/10,910)과 일치한다(#937 R2 갱신)', async () => {
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

    expect(reopened.supplyAmount).toBe('109090')
    expect(reopened.vatAmount).toBe('10910')
    provider.destroy()
  })

  it('RED→GREEN: 4단계 무수정 재저장 payload 가 서버 값(109,090/10,910)을 되돌리지 않는다 (E1, #937 R2 갱신)', async () => {
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
      expect(payload.supplyAmount).toBe('109090')
      expect(payload.vatAmount).toBe('10910')
    } else {
      // vatDirty=false 여도 안전하다 — BE 가 quantity×unitPrice(2×60000)로 재계산해 같은 120,000
      // (BE 자신의 기본 재계산은 단가=VAT 제외 공급단가 가정이라 FE 의 VAT 포함 재계산과 다른
      // 수치를 낸다 — 그러나 computeDetailUnitPriceChange 는 항상 vatDirty:true 를 반환하므로
      // buildDetailLinePayload 가 이 분기를 타는 경우는 이 화면에서 실질적으로 없다).
      expect(payload.supplyAmount).toBeUndefined()
    }
    provider.destroy()
  })

  it('RED→GREEN(발견 2 — 발견 1 과 같은 뿌리): 수량 2→3 변경도 화면 금액이 즉시 바뀌고 doc-sync 가 되돌리지 않는다 (E3, #937 R2 갱신)', async () => {
    const provider = await makeProvider()
    provider.replaceItems([seedLine])

    const afterQtyEdit = { ...seedLine, ...computeDetailQuantityChange(seedLine, '3') }
    // 단가(100,000, VAT 포함, 고정) × 수량 3 = 합계 300,000 에서 분리한 공급 272,727/부가세 27,273.
    expect(afterQtyEdit.supplyAmount).toBe('272727')
    expect(afterQtyEdit.vatAmount).toBe('27273')
    provider.setItemValueById(SERVER_LINE_1, 'quantity', String(afterQtyEdit.quantity))

    for (const write of detailAmountDocWrites(provider, [afterQtyEdit])) {
      provider.setItemValueById(write.lineId, 'supplyAmount', write.supplyAmount)
      provider.setItemValueById(write.lineId, 'vatAmount', write.vatAmount)
    }

    const resynced = coeditLinesToEditLines(provider, [{ ...afterQtyEdit, key: 'k1' }], knownIds)[0]!
    expect(resynced.supplyAmount).toBe('272727')
    expect(resynced.vatAmount).toBe('27273')
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
  it('RED→GREEN(스택오버플로 회귀 가드, 라이브QA 실측): syncDetailAmountToDoc 를 같은 목표값으로 재호출해도 추가 문서변경을 내지 않는다(#937 R2 갱신)', async () => {
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
    expect(provider.getItemValueById(SERVER_LINE_1, 'supplyAmount')).toBe('109090')
    expect(provider.getItemValueById(SERVER_LINE_1, 'vatAmount')).toBe('10910')

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
      /fieldPath=\{detailCoeditFieldPath\(index, line, '(?:unitPrice|supplyAmount|vatAmount)'\)\}[\s\S]*?\/>/g,
    ), (match) => match[0])

    expect(amountFieldBindings).toHaveLength(6) // 매출 3(단가·공급가액·부가세) + 매입 3
    expect(amountFieldBindings.every(
      (binding) => binding.includes('parseValue={parseEditableDetailAmountInput}'),
    )).toBe(true)
  })
})

/**
 * 2차 적대검증(CODEX SOL) E-1(#937 R2) — RED-first.
 *
 * <p>1차 fix(#937 R1)의 {@code computeDetailUnitPriceChange} 는 "이 화면의 단가는 VAT 제외
 * 공급단가"라는 <b>틀린 계약</b>을 의도적으로 세워(커밋 메시지에 그렇게 적었다) 생성 화면의
 * PRICE authority(단가=VAT 포함, {@link recalculateLineVat})를 우회했다. 두 화면에 같은
 * (수량, 단가) 를 입력하면 생성 120,000/10,910/109,090 대 수정 132,000/12,000/120,000 로
 * 갈린다 — 이 PR 제목("두 화면 정책 일치")의 정면 반박.
 *
 * <p>F1 — 같은 (수량, 단가) 입력은 두 화면에서 같은 금액을 낸다. 단가는 VAT 포함으로
 * 해석한다(개발책임자 결정 "입력한 단가를 보존"·"소비처를 VAT포함 인식으로 수정" · 생성
 * payload {@code priceVatInclusive: true} · #926 동적 라벨 라이브 실측 "단가(VAT포함)").
 *
 * <p>근본수정 전 RED(이 테스트 추가 시점 그대로 실행): 아래 첫 테스트가
 * `expected '120000' to be '109090'`(공급가액) 로 실패한다 — 수정 화면이 생성 화면의
 * VAT 포함 단가 도메인과 다른 값을 냈다는 뜻이다.
 */
describe('SlipDetailPage — 생성/수정 단가 세금 정책 일치 (E-1, #937 R2, F1)', () => {
  it('단가 변경 — 생성 화면(recalculateLineVat PRICE)과 수정 화면(computeDetailUnitPriceChange)이 수량 2·단가 60,000 에 같은 금액을 낸다', () => {
    const created = recalculateLineVat(
      { quantity: 2, unitPrice: '60000', supplyAmount: '0', vatAmount: '0', lineTotal: '0' },
      'PRICE',
    )
    // 생성 화면 기대값 고정핀 — VAT 포함 60,000 × 2 = 120,000 총액에서 공급가액을
    // 분리(0 방향 절사, 2차 적대검증 원문과 동일).
    expect(created.supplyAmount).toBe('109090')
    expect(created.vatAmount).toBe('10910')
    expect(created.lineTotal).toBe('120000')

    // 수정 화면 — 직전 단가(999999)는 의도적으로 무관한 값을 넣어, 결과가 "새 입력값"에만
    // 좌우됨을 확인한다(직전 단가에 의존하는 계산식이면 이 값이 새어 나온다).
    const patch = computeDetailUnitPriceChange({ quantity: 2, unitPrice: '999999' }, '60000')

    expect(patch.supplyAmount).toBe(created.supplyAmount)
    expect(patch.vatAmount).toBe(created.vatAmount)
    expect(patch.lineTotalWithVat).toBe(created.lineTotal)
  })

  it('수량 변경도 같은 VAT 포함 단가 도메인으로 재계산한다 — 단가 100,000·수량 2→3(생성 changeLineQuantity 와 동일 함수 경로)', () => {
    const created = recalculateLineVat(
      { quantity: 3, unitPrice: '100000', supplyAmount: '0', vatAmount: '0', lineTotal: '0' },
      'PRICE',
    )
    const patch = computeDetailQuantityChange({ quantity: 2, unitPrice: '100000' }, '3')

    expect(patch.unitPrice).toBe('100000') // 단가는 수량 변경으로 바뀌지 않는다
    expect(patch.supplyAmount).toBe(created.supplyAmount)
    expect(patch.vatAmount).toBe(created.vatAmount)
    expect(patch.lineTotalWithVat).toBe(created.lineTotal)
  })
})

/**
 * 2차 적대검증(CODEX SOL) E-2(#937 R2) — RED-first.
 *
 * <p>수량 셀({@code items.${index}.quantity})은 단가/공급가액/부가세 셀과 달리 parseValue
 * 필터가 아예 배선되지 않았다(SlipDetailPage.tsx 원 리뷰 지적 지점) — `2.7`(조용히 2로
 * 절삭)·`-3`(0)·`1e3`(1000) 이 그대로 수용되고 공급가액·부가세까지 재계산된다. 1차 라운드가
 * 추가한 "6개 셀 parseValue 배선" 테스트(위)가 단가·공급가액·부가세만 세느라 수량을 빼서
 * 이 결함이 살아남았다(F3).
 *
 * <p>근본수정 전 RED: 첫 테스트가 `expected 0 to be 2`(수량 셀 중 parseValue 배선 개수) 로
 * 실패한다.
 */
describe('SlipDetailPage — 수량 입력 거부 규칙 (E-2, #937 R2, F2·F3)', () => {
  it('매출·매입 수량 셀(2개) 모두 parseValue 필터를 연결한다 — 소스 배선 확인(F3, 발견 3 계열 sweep)', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./SlipDetailPage.tsx', import.meta.url)),
      'utf8',
    )
    const qtyFieldBindings = Array.from(source.matchAll(
      /fieldPath=\{detailCoeditFieldPath\(index, line, 'quantity'\)\}[\s\S]*?\/>/g,
    ), (match) => match[0])

    expect(qtyFieldBindings).toHaveLength(2) // 매출 1 + 매입 1
    expect(qtyFieldBindings.every(
      (binding) => binding.includes('parseValue={parseEditableDetailQuantityInput}'),
    )).toBe(true)
  })

  it.each(['2.7', '-3', '1e3', '1,000', 'abc', ' 3', '3 '])(
    '생성 화면(LineRow.tsx)과 같은 게이트 — 잘못된 수량 문자열 "%s"는 거부(null)한다',
    (raw) => {
      expect(parseEditableDetailQuantityInput(raw)).toBeNull()
    },
  )

  it.each([['', ''], ['0', '0'], ['3', '3'], ['999999999999', '999999999999']])(
    '순수 자연수(빈 값 포함) "%s"는 정규화 없이 그대로 통과한다(생성 화면과 동일 — 콤마 그룹 미지원)',
    (raw, expected) => {
      expect(parseEditableDetailQuantityInput(raw)).toBe(expected)
    },
  )

  it('LineRow.tsx 수량 게이트(`/^\\d*$/`)와 같은 정규식이다 — 생성 화면 소스 대조(F2)', () => {
    const lineRowSource = readFileSync(
      fileURLToPath(new URL(
        '../../../../web/design-system/src/components/LineRow/LineRow.tsx',
        import.meta.url,
      )),
      'utf8',
    )
    // LineRow.tsx 는 이 PR 의 변경 금지 대상(적대검증 각도 ②, 바이트 단위 0)이라 그 인라인
    // 게이트를 import 할 수 없다 — 소스에 그 정규식이 여전히 그대로 있는지만 대조한다.
    expect(lineRowSource).toContain('if (!/^\\d*$/.test(e.target.value)) return')
  })
})

/**
 * 재수렴 라운드 R-1(#937) — RED-first.
 *
 * <p>1차 fix(#937 R1, {@code 1041bad17})는 계산을 SUPPLY 에서 PRICE 권위로 옮겨 생성 화면과
 * 정렬했다({@link computeDetailUnitPriceChange}/{@link computeDetailQuantityChange} 모두 예외
 * 없이 PRICE 하나만 쓴다) — 그러나 {@link editUnitPriceLabel}/{@link editUnitPriceColumnHeader}
 * 는 옛 SUPPLY 계약(unitPrice vs unitPriceWithVat 비교) 위에 세워진 채 그대로 남았다. 실 DB
 * 인구조사: 활성 slip_lines 2,709 중 unitPrice≠unitPriceWithVat 2,698(99.6%), 그중 수정 가능
 * DRAFT 2,164건 — 전부 "단가(VAT제외)" 라벨로 열리는데, 그 라벨의 약속(공급가액=단가×수량)과
 * 실제 계산(공급가액=VAT 포함 합계에서 분리)이 어긋난다. 단가를 전혀 건드리지 않고 수량만
 * 바꿔도 발생한다(재현 B).
 *
 * <p>근본수정 전 RED(이 describe 추가 시점 그대로 실행 — 원문은 dev 보고 참조): 첫 테스트가
 * `expected '272727' to be '300000'`(공급가액) 로 실패한다 — 라벨이 약속한 값과 실제 화면이
 * 보여줄 값이 다르다는 뜻이다.
 */
describe('SlipDetailPage — 단가 라벨의 약속과 실제 계산 일치 (재수렴 R-1, RED-first)', () => {
  it('헤더/aria-label 이 말하는 VAT 도메인과, 수량만 바꿔도 실제 적용되는 도메인이 항상 같다', () => {
    // 실 DB 다수(활성 라인 99.6%)를 대표: unitPrice(단가)와 unitPriceWithVat(서버 원본)가 다르다.
    const line = { quantity: 2, unitPrice: '100000', unitPriceWithVat: '110000' }
    const label = editUnitPriceLabel(line)
    expect(editUnitPriceColumnHeader([line])).toBe(label) // 단일 라인 — 행별 라벨과 헤더가 같아야 함

    // 단가는 손대지 않고 수량만 2→3으로 바꾼다 — 사용자 눈에는 "단가 열"을 전혀 건드리지 않은 편집이다.
    const patch = computeDetailQuantityChange({ quantity: line.quantity, unitPrice: line.unitPrice }, '3')

    // 라벨의 약속을 그대로 재현한다: "VAT제외"라면 단가×수량이 공급가액 그 자체(분리 없음),
    // "VAT포함"이라면 단가×수량이 VAT 포함 합계이고 공급가액은 거기서 분리한 값(생성 화면과
    // 동일한 recalculateLineVat PRICE 분기 — 같은 함수로 "정답"을 재현해 이중 유지보수를 피한다).
    const promisedSupply = label === '단가(VAT제외)'
      ? String(Number(line.unitPrice) * 3)
      : recalculateLineVat(
          { quantity: 3, unitPrice: line.unitPrice, supplyAmount: '0', vatAmount: '0', lineTotal: '0' },
          'PRICE',
        ).supplyAmount

    expect(patch.supplyAmount).toBe(promisedSupply)
  })

  it('단가를 직접 편집해도 라벨의 약속과 실제 계산이 같다(단가 편집 축도 함께 대조)', () => {
    const line = { quantity: 2, unitPrice: '100000', unitPriceWithVat: '110000' }
    const label = editUnitPriceLabel(line)

    // 직전 단가(999999)는 의도적으로 무관한 값 — 결과가 "새 입력값"에만 좌우됨을 함께 확인한다.
    const patch = computeDetailUnitPriceChange({ quantity: 2, unitPrice: '999999' }, '80000')

    const promisedSupply = label === '단가(VAT제외)'
      ? String(2 * 80000)
      : recalculateLineVat(
          { quantity: 2, unitPrice: '80000', supplyAmount: '0', vatAmount: '0', lineTotal: '0' },
          'PRICE',
        ).supplyAmount

    expect(patch.supplyAmount).toBe(promisedSupply)
  })

  it('V3 — 편집 중에도 저장 후 재열기에도 라벨이 뒤집히지 않는다(우연히 두 컬럼이 같아진 라인도 동일 라벨)', () => {
    // #937 R-1 부수 증상: 입력값이 저장된 unitPriceWithVat 와 우연히 같아지는 순간 라벨이
    // 뒤집혔다("단가(VAT제외)" → "단가(VAT포함)"). 저장 전/후 두 상태를 대조해 라벨이
    // 데이터에 의존하지 않는 상수임을 확인한다.
    const beforeSave = { unitPrice: '100000', unitPriceWithVat: '110000' } // 흔한 케이스(불일치, 99.6%)
    const afterSave = { unitPrice: '100000', unitPriceWithVat: '100000' } // 저장 후 재열기(우연 일치)

    expect(editUnitPriceLabel(beforeSave)).toBe(editUnitPriceLabel(afterSave))
  })
})

/**
 * 재수렴 라운드 R-2(#937) — RED-first.
 *
 * <p>생성 화면({@code SlipFormPage.tsx:464})은 렌더 시점에 {@code line.vatWarning}
 * (={@code lineVat.ts} {@code fromAmounts} 가 PRICE 권위에서 이미 false 로 닫아 저장해 둔 값)을
 * 그대로 쓴다. 수정 화면은 그 저장값을 쓰지 않고 렌더마다 {@code hasVatWarning}(supply, vat)를
 * 독립적으로 다시 계산했다(SlipDetailPage.tsx 옛 :2553/:2867) — PRICE 권위의 공급가액 분리
 * (÷1.1, 0 방향 절사)와 hasVatWarning 의 "공급가액의 10%"(별도 절사) 기대치가 서로 다른
 * 반올림 공식이라, 앱이 방금 스스로 계산해 자체 정의상 맞는 값에도 반올림 경계마다 거짓
 * 경고를 붙였다(원문 sweep: 단가 11종 중 8건 경고).
 *
 * <p>근본수정 전 RED: {@link computeDetailUnitPriceChange} 의 patch 에는 vatWarning 키 자체가
 * 없어(undefined) 생성 화면의 판정(전부 false)과 다르다 — 첫 테스트가
 * `expected [ undefined, undefined, ... ] to deeply equal [ false, false, ... ]` 로 실패한다.
 */
describe('SlipDetailPage — 생성/수정 화면 부가세 경고 판정 일치 (재수렴 R-2, RED-first)', () => {
  const quantity = 2
  // #937 R-2 원문 sweep 재현 — 단가 11종.
  const prices = ['11111', '22222', '33333', '44444', '55555', '66666', '77777', '88888', '99999', '60000', '80000']

  it('단가 11종 sweep — 두 화면의 경고 판정이 (수량,단가) 쌍마다 같다(개수 대조)', () => {
    const createWarnings = prices.map((unitPrice) => recalculateLineVat(
      { quantity, unitPrice, supplyAmount: '0', vatAmount: '0', lineTotal: '0' },
      'PRICE',
    ).vatWarning)

    const editWarnings = prices.map((unitPrice) => (
      computeDetailUnitPriceChange({ quantity, unitPrice: '1' }, unitPrice).vatWarning
    ))

    // 생성 화면은 PRICE 권위에서 전부 경고 없음(fromAmounts 정의상 false)이어야 정상 기준선이다.
    expect(createWarnings.filter(Boolean)).toHaveLength(0)
    // RED(수정 전): patch 에 vatWarning 자체가 없어 editWarnings 전부가 undefined 다
    // (undefined !== false). GREEN(수정 후): 생성 화면과 완전히 같은 판정(전부 false)이 된다.
    expect(editWarnings).toEqual(createWarnings)
  })

  it('render 는 hasVatWarning 재계산이 아니라 line.vatWarning 저장값을 쓴다 — 소스 배선 확인(매출·매입 2 지점)', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./SlipDetailPage.tsx', import.meta.url)),
      'utf8',
    )
    // 근본수정 전: 이 패턴(렌더의 독립 재계산)이 매출·매입 두 곳에 있었다.
    expect(source).not.toMatch(/hasVatWarning\(line\.supplyAmount \?\? line\.lineTotalWithVat \?\? '0', line\.vatAmount\)/)
    // 근본수정 후: 두 렌더 지점(경고 <span> 조건) 모두 저장된 판정을 그대로 읽는다 — 주석 등
    // 다른 문맥의 우발적 문자열 일치를 배제하기 위해 실제 JSX 가드 표현식을 그대로 찾는다.
    const vatWarningGuardCount = (
      source.match(/line\.vatAmount != null && line\.vatWarning/g) ?? []
    ).length
    expect(vatWarningGuardCount).toBe(2)
  })

  /**
   * 라이브QA 추가 발견(R-2 계열, vitest 순수함수로는 안 잡히던 결함) — CollaborativeSlipInput
   * 은 자기 필드의 Y.Doc 값이 "직전 렌더값"과 다르면 실사용자 입력이 아니어도 onValueChange
   * 를 다시 부른다(syncFromDoc doc-sync echo). 단가 편집(PRICE 권위)이 같은 이벤트 안에서
   * supplyAmount/vatAmount 를 Y.Doc 에 동기 반영하면(syncDetailAmountToDoc), 아직 재렌더 전인
   * SUPPLY/VAT 입력이 이 변화를 "자기 필드가 바뀜"으로 오인해 updateDetailVat(SUPPLY/VAT) 를
   * 다시 호출한다 — 값은 이미 같은데도 editSlipLineAmount(SUPPLY/VAT authority, 값 무관 항상
   * 독립 재판정)를 타면 PRICE 권위가 방금 false 로 닫은 vatWarning 을 덮어써 되살린다.
   * vitest 는 render 를 마운트하지 않아 이 echo 자체가 발생하지 않으므로(이 파일의 순수함수
   * 조합 관례), computeDetailVatChange 를 echo 시나리오 입력으로 직접 호출해 재현한다.
   *
   * <p>근본수정 전 RED: `expected { vatWarning: true, ... } to equal {}` 로 실패한다(echo 가
   * 무변경이 아니라 재계산·vatWarning 훼손으로 처리됐다는 뜻).
   */
  it('doc-sync 에코 가드 — SUPPLY/VAT 셀이 이미 같은 값을 되돌려 받으면 아무것도 재계산하지 않는다(라이브QA 실측)', () => {
    // 단가 60,000·수량 2 편집 직후의 라인 — fromAmounts(PRICE)가 이미 vatWarning:false 로 닫았다.
    const afterPriceEdit = {
      quantity: 2,
      unitPrice: '60000',
      supplyAmount: '109090',
      vatAmount: '10910',
      lineTotalWithVat: '120000',
      authority: 'PRICE' as const,
    }

    // 공급가액 필드 자신의 doc-sync echo — 같은 값 '109090' 이 "변경"으로 오인되어 되돌아온다.
    expect(computeDetailVatChange(afterPriceEdit, 'SUPPLY', '109090')).toEqual({})
    // 부가세 필드도 동일하게 echo 될 수 있다 — 같은 값이면 마찬가지로 무변경.
    expect(computeDetailVatChange(afterPriceEdit, 'VAT', '10910')).toEqual({})

    // 대조군 — 진짜 다른 값이면(사용자가 실제로 공급가액을 직접 고치면) 정상적으로 재계산하고
    // 그 편집만의 경고 판정(warningFor)을 낸다. echo 가드가 진짜 편집까지 삼키지 않는지 확인한다.
    const genuineEdit = computeDetailVatChange(afterPriceEdit, 'SUPPLY', '300000')
    expect(genuineEdit.supplyAmount).toBe('300000')
    expect(genuineEdit.vatAmount).toBe('10910') // VAT 편집이 아니므로 기존 부가세 보존(P6)
    expect(genuineEdit.vatWarning).toBe(true) // 300000 의 10%(30000) != 10910 — 진짜 불일치 경고
  })

  /**
   * 라이브QA 3차 발견(R-2 계열) — 하이드레이션은 라인의 authority 를 'PRICE' 로 표시하면서도
   * vatWarning 은 원시 DB 값에 {@code hasVatWarning}(공급가액의 10%와 다른가)을 독립 적용해
   * PRICE 권위 자신의 정책(fromAmounts: authority==='PRICE' 는 항상 false)과 모순됐다. PRICE
   * 권위의 실제 분리 공식(합계를 ÷1.1 로 나눈 몫/나머지)은 "공급가액×10%"와 구조적으로 잘
   * 안 맞아떨어지므로, 저장 직후 재열기만 해도 라이브에서 거짓 경고가 떴다(단가 60,000·수량
   * 2 저장 → 재열기 시 "⚠ 10%와 다름" — 공급 109,090 의 정확한 10%는 10,909 인데 저장된
   * 부가세는 합계-공급가액인 10,910). 근본수정 전 RED:
   * `expected true to be false` 로 실패한다.
   */
  it('하이드레이션은 authority=PRICE 와 짝을 맞춰 vatWarning 도 항상 false 다 — 저장 직후 재열기만으로 경고가 뜨면 안 된다(라이브QA 3차 발견)', () => {
    const slip = {
      lines: [{
        id: SERVER_LINE_1,
        productId: PRODUCT_1,
        productName: '품목1',
        modelName: 'MODEL-1',
        specification: '',
        quantity: 2,
        unitPrice: '60000',
        supplyAmount: '109090', // 120,000 을 PRICE 권위로 분리한 값 — 정확한 10%(10,909)와는 다른 10,910 이 부가세로 저장된다.
        vatAmount: '10910',
        lineTotal: '120000',
        note: '',
      }],
    } as unknown as SlipDetail

    const hydrated = toPurchaseEditLines(slip)[0]!
    expect(hydrated.authority).toBe('PRICE')
    // 재수렴 3차(#937) 갱신 — 메커니즘이 "무조건 false 하드코딩"에서 "hasVatWarning(±1원 허용
    // 오차)로 계산하되 이 구체적 값(diff=+1)은 허용 오차 안이라 false" 로 바뀌었다. 관측값은
    // 이 테스트가 세운 원래 케이스에서 동일해(회귀 없음) 아래 단언은 그대로 유지한다 — 아래
    // 새 describe 블록(U2)이 "무조건 false" 가 아님을 별도로 확정한다(실질 불일치는 true).
    expect(hydrated.vatWarning).toBe(false)
  })
})

/**
 * 재수렴 3차(#937) 근본수정 — U1·U3, RED-first.
 *
 * <p>PM 진단 원문 그대로: 저장 전 DB 상태(unit_price=100,000·unit_price_with_vat=110,000·
 * supply=200,000·vat=20,000·qty=2)는 그 자체로 자기모순이 없다 — 100,000(VAT 제외) × 2 =
 * 200,000 = supply, 110,000(VAT 포함) × 2 = 220,000 = supply+vat, 둘 다 성립한다. 그런데 종전
 * 하이드레이션({@link toPurchaseEditLines})은 VAT 제외 unit_price(100,000)를 unitPrice
 * 필드에 실었다 — 이 화면의 라벨("단가(VAT포함)", R-1)과 실제 계산({@link recalculateLineVat}
 * PRICE 권위, R-2)은 예외 없이 이 필드를 VAT 포함으로 해석하므로, 편집 진입 즉시(수량·단가
 * 무편집) 필드 값의 세금 도메인이 라벨·계산과 어긋났다(U1) — 그 결과 수량만 2→3 으로 바꿔도
 * 과세표준이 300,000(origin/main 이 보존하던 값) 대신 272,727 로 떨어졌다(U3 회귀). 근본수정은
 * unit_price_with_vat(authoritative 저장 경로가 그대로 각인하는 컬럼 — 이미 VAT 포함 도메인)
 * 를 싣는다.
 */
describe('SlipDetailPage — 재수렴 3차(#937) U1 근본수정 — 하이드레이션 unitPrice 의 세금 도메인 (RED-first)', () => {
  const slipWithBothColumns = {
    lines: [{
      id: SERVER_LINE_1,
      productId: PRODUCT_1,
      productName: '품목1',
      modelName: 'MODEL-1',
      specification: '',
      quantity: 2,
      unitPrice: '100000', // VAT 제외 공급단가(DB 원본) — 필드가 실으면 안 되는 값.
      unitPriceWithVat: '110000', // VAT 포함 단가 — 필드가 실어야 하는 값.
      supplyAmount: '200000',
      vatAmount: '20000',
      lineTotal: '220000',
      note: '',
    }],
  } as unknown as SlipDetail

  it('U1 — 하이드레이션 unitPrice 는 unit_price_with_vat(VAT 포함)를 싣는다 — unit_price(VAT 제외)가 아니다', () => {
    const hydrated = toPurchaseEditLines(slipWithBothColumns)[0]!

    // RED(수정 전): hydrated.unitPrice === '100000'(line.unitPrice 그대로) — 라벨·계산과 반대 도메인.
    expect(hydrated.unitPrice).toBe('110000')
    // 무편집 진입 시점부터 이미 자기 정의상 일관돼야 한다: unitPrice × quantity === supply+vat.
    expect(Number(hydrated.unitPrice) * hydrated.quantity).toBe(Number(hydrated.supplyAmount) + Number(hydrated.vatAmount))
  })

  it('U1+U3 — 무편집 진입 후 수량만 2→3 으로 바꾸면 origin/main 이 보존하던 과세표준(300,000)이 재현된다(회귀 0)', () => {
    const hydrated = toPurchaseEditLines(slipWithBothColumns)[0]!
    const afterQtyEdit = computeDetailQuantityChange(hydrated, '3')

    // RED(수정 전): hydrated.unitPrice='100000' 이 VAT 포함으로 오인되어 100000×3=300000 을
    // "합계"로 분리해 supply=272727 로 떨어진다(PM 진단 원문 실측치). GREEN(수정 후):
    // unitPrice=110000(VAT 포함) × 3 = 330000 을 분리해 origin/main 과 같은 300,000 이 나온다.
    expect(afterQtyEdit.supplyAmount).toBe('300000')
    expect(afterQtyEdit.vatAmount).toBe('30000')
    expect(afterQtyEdit.lineTotalWithVat).toBe('330000')
  })

  it('U1 legacy 폴백 — unit_price_with_vat 가 null 인 라인은 unit_price 를 VAT 포함으로 환산해 싣는다(vatInclusiveOf 재사용, ×1.1 HALF_UP)', () => {
    const legacySlip = {
      lines: [{
        id: SERVER_LINE_1,
        productId: PRODUCT_1,
        productName: '품목1',
        modelName: 'MODEL-1',
        specification: '',
        quantity: 1,
        unitPrice: '100000',
        unitPriceWithVat: null,
        supplyAmount: '100000',
        vatAmount: '10000',
        lineTotal: '110000',
        note: '',
      }],
    } as unknown as SlipDetail

    const hydrated = toPurchaseEditLines(legacySlip)[0]!

    // vatInclusiveOf('100000') = 100000 × 1.1 = '110000' (BE collectPriceMemory 미러, HALF_UP 2dp).
    expect(hydrated.unitPrice).toBe('110000')
  })
})

/**
 * 재수렴 6차(#937) 근본수정 — D-1R6, 개발책임자 결정 A안 "저장 시점에 도메인 기록".
 *
 * <p>읽기전용 표({@link slipLineAmounts})와 수정 모달 하이드레이션({@link toPurchaseEditLines})은
 * <b>같은 전표에 대해 같은 단가</b>를 보여야 한다(불변식 3). 라이브 실증(전표 2026/07/27-209,
 * 실 GUI): 사용자가 단가(VAT포함) 100,000 을 입력하고 공급가액 200,000 · 부가세 20,000 으로
 * "부가세 별도" 정정하자 <b>읽기전용 표 110,000 · 수정 모달 100,000</b> — 같은 세션에서 10,000원
 * 차이가 났고, Y.Doc 없는 진입에서는 무편집 재저장만으로 사용자 입력이 영구 소멸했다.
 *
 * <p>두 지점 모두 저장 시점 도메인({@code unitPriceDomain})을 <b>읽어야</b> 판정 없이 같은 답을
 * 낸다 — 한쪽만 읽으면 두 화면이 다시 갈린다.
 */
describe('SlipDetailPage — 재수렴 6차(#937) D-1R6 — 저장 시점 단가 도메인 (RED-first)', () => {
  /** 라이브 실증 좌표: 100000|100000|200000|20000|2. */
  function slipAtD1R6Coordinate(unitPriceDomain: string | null) {
    return {
      lines: [{
        id: SERVER_LINE_1,
        productId: PRODUCT_1,
        productName: '품목1',
        modelName: 'MODEL-1',
        specification: '',
        quantity: 2,
        unitPrice: '100000',
        unitPriceWithVat: '100000',
        supplyAmount: '200000',
        vatAmount: '20000',
        lineTotal: '200000',
        unitPriceDomain,
        note: '',
      }],
    } as unknown as SlipDetail
  }

  it('읽기전용 표 — 도메인이 기록된 행은 사용자 입력 단가(100,000)를 그대로 보인다', () => {
    // RED(수정 전): 110000 — slipLineAmounts 가 도메인을 읽지 않아 휴리스틱이 유도했다.
    expect(slipLineAmounts(slipAtD1R6Coordinate('VAT_INCLUSIVE').lines[0]!).unitWithVat).toBe(100000)
  })

  it('수정 모달 하이드레이션 — 같은 행에서 같은 단가를 싣는다(불변식 3)', () => {
    const slip = slipAtD1R6Coordinate('VAT_INCLUSIVE')
    const readonlyUnit = slipLineAmounts(slip.lines[0]!).unitWithVat
    const hydrated = toPurchaseEditLines(slip)[0]!

    // RED(수정 전): toPurchaseEditLines 가 도메인을 읽지 않으면 하이드레이션만 110000 이 된다.
    expect(Number(hydrated.unitPrice)).toBe(100000)
    expect(Number(hydrated.unitPrice)).toBe(readonlyUnit)
  })

  it('무편집 재저장 payload — 하이드레이션 단가가 저장값과 같아 DB 를 덮지 않는다(불변식 2)', () => {
    const hydrated = toPurchaseEditLines(slipAtD1R6Coordinate('VAT_INCLUSIVE'))[0]!

    // Y.Doc 없는 진입(다른 담당자·다른 PC)이 그대로 저장해도 사용자 입력이 소멸하지 않는다.
    expect(hydrated.unitPrice).toBe('100000')
    expect(hydrated.supplyAmount).toBe('200000')
    expect(hydrated.vatAmount).toBe('20000')
  })

  it('legacy(도메인 null) 동일 좌표는 두 지점 모두 현행 휴리스틱을 유지한다 — 개발책임자 결정', () => {
    const slip = slipAtD1R6Coordinate(null)

    expect(slipLineAmounts(slip.lines[0]!).unitWithVat).toBe(110000)
    expect(Number(toPurchaseEditLines(slip)[0]!.unitPrice)).toBe(110000)
  })
})

/**
 * 재수렴 7차(#937) R7-2 — FE/BE 미러의 <b>FE 쪽 못</b>(회귀 울타리).
 *
 * <p>실전표 {@code 2026/06/24-7} rev3~5 계열: {@code supplyAmount}·{@code vatAmount}·
 * {@code unitPriceWithVat} 가 전부 없는 구 라인이다. 이 좌표에서 화면(FE)은 총액을
 * {@code lineTotal + 10%} 로, BE {@code SlipRevisionService.lineTotalDisplayValue} 는
 * {@code lineTotal} 그대로로 읽어 <b>버전이력에만</b> 사용자가 하지 않은 단가 변경
 * {@code 100000 → 110000} 이 생겼다. 개발책임자 결정에 따라 <b>BE 를 화면에 맞췄으므로</b>,
 * 이 테스트는 FE 가 반대로 움직여 미러가 다시 갈리는 것을 막는 못이다(따라서 RED-first 가
 * 아니라 처음부터 GREEN — 고친 쪽은 BE 다).
 */
describe('SlipDetailPage — 재수렴 7차(#937) R7-2 — 금액 3값 없는 구 라인의 총액 도메인 (미러 고정)', () => {
  it('금액 3값이 없는 구 라인의 표 합계(VAT포함)는 lineTotal + 10% 다 — BE 버전이력이 맞춰야 할 값', () => {
    const legacySlip = {
      lines: [{
        id: SERVER_LINE_1,
        productId: PRODUCT_1,
        productName: '품목1',
        modelName: 'MODEL-1',
        specification: '',
        quantity: 1,
        unitPrice: '100000.00',
        lineTotal: '100000.00',
        note: '',
      }],
    } as unknown as SlipDetail

    const amounts = slipLineAmounts(legacySlip.lines[0]!)

    expect(amounts.totalIncl).toBe(110000)
    expect(amounts.unitWithVat).toBe(110000)
  })
})

/**
 * 재수렴 3차(#937) 근본수정 — U2, RED-first.
 *
 * <p>R-2(이전 라운드)는 하이드레이션 vatWarning 을 무조건 false 로 닫아 "저장 직후 재열기
 * 거짓 경고"(±1원 잔차)를 없앴다. 그런데 그 근거 진술("저장된 라인은 거의 전부 10%를 만족하지
 * 못한다")이 실측과 반대였다 — 2026-07-27 slip_lines 직접 조회: 정확히 10% 2,658건(97.8%),
 * ±1원 잔차 48건(1.8%), 그 밖의 실질 불일치(3,000~18,000원) 11건(0.4%). 무조건 false 는 그
 * 11건의 참 경고까지 함께 없앴다. hasVatWarning(±1원 허용 오차, lineVat.test.ts 근본수정)을
 * 하이드레이션·원격 피어 동기화에 실사용해 두 결함(거짓 양성/거짓 음성)을 모두 피한다.
 */
describe('SlipDetailPage — 재수렴 3차(#937) U2 근본수정 — 하이드레이션·원격 피어 VAT 경고 (RED-first)', () => {
  function slipWithAmounts(supplyAmount: string, vatAmount: string) {
    return {
      lines: [{
        id: SERVER_LINE_1,
        productId: PRODUCT_1,
        productName: '품목1',
        modelName: 'MODEL-1',
        specification: '',
        quantity: 1,
        unitPrice: '100000',
        unitPriceWithVat: '100000',
        supplyAmount,
        vatAmount,
        lineTotal: String(Number(supplyAmount) + Number(vatAmount)),
        note: '',
      }],
    } as unknown as SlipDetail
  }

  it('U2 — 저장된 라인의 실질 VAT 불일치(3,000원, 2026-07-27 slip_lines 실측 케이스)는 재열기 시 경고된다', () => {
    // 실측 케이스(slip_lines.id=f2c4abed-...): supply=50,000 인데 vat=2,000(기대 5,000) — 3,000원 과소.
    const hydrated = toPurchaseEditLines(slipWithAmounts('50000', '2000'))[0]!

    // RED(수정 전): 하이드레이션이 vatWarning 을 무조건 false 로 닫아 실질 불일치가 숨는다.
    expect(hydrated.vatWarning).toBe(true)
  })

  it('R-2 회귀 방지 — ±1원 잔차(PRICE 권위 ÷1.1 분리 구조적 잔차)는 재열기 시 여전히 경고하지 않는다', () => {
    // 단가 60,000·수량 2 저장분(#937 R-2 원 재현 시나리오) — 공급 109,090 의 정확한 10%는
    // 10,909 인데 저장된 부가세는 10,910(합계-공급가액). diff=+1, 허용 오차 안이다.
    const hydrated = toPurchaseEditLines(slipWithAmounts('109090', '10910'))[0]!

    expect(hydrated.vatWarning).toBe(false)
  })

  it('원격 피어 — previous 가 (구) 하이드레이션 스냅샷(vatWarning:false 고정)이어도 Y.Doc 에 동기화된 실질 불일치 supply/vat 로 재판정한다(2-peer)', async () => {
    const provider = await makeProvider()
    // 실질 불일치 라인을 Y.Doc 에 직접 심는다 — 편집자 피어가 이미 저장/동기화를 마친 상태 모사.
    provider.replaceItems([{
      lineId: SERVER_LINE_1,
      productId: PRODUCT_1,
      productName: '품목1',
      modelName: 'MODEL-1',
      specification: '',
      quantity: 1,
      unitPrice: '100000',
      supplyAmount: '50000',
      vatAmount: '2000',
      lineTotalWithVat: '52000',
      note: '',
    }])

    // 원격 피어의 로컬 previous — REST 하이드레이션 직후 스냅샷을 흉내낸다. (구) 하이드레이션은
    // vatWarning 을 무조건 false 로 닫았으므로 previous.vatWarning=false 로 시작한다.
    const previous = [{
      key: 'k1',
      lineId: SERVER_LINE_1,
      productId: PRODUCT_1,
      productName: '품목1',
      modelName: 'MODEL-1',
      specification: '',
      quantity: 1,
      unitPrice: '100000',
      supplyAmount: '50000',
      vatAmount: '2000',
      lineTotalWithVat: '52000',
      note: '',
      authority: 'PRICE' as const,
      vatWarning: false,
    }]
    const knownIds = toServerLineIdSet([{ id: SERVER_LINE_1 }])

    const next = coeditLinesToEditLines(provider, previous, knownIds)[0]!

    // RED(수정 전): previous.vatWarning(false) 를 그대로 승계 — 편집자는 경고를 봤어도 원격
    // 피어는 못 본다(재수렴 3차 2-peer 실측 결함). GREEN(수정 후): 동기화된 supply/vat 로
    // 재판정해 원격 피어도 경고를 본다.
    expect(next.vatWarning).toBe(true)
    provider.destroy()
  })

  it('원격 피어 — ±1원 잔차 라인을 동기화해도 거짓 경고를 재도입하지 않는다(R-2 원 결함 회귀 방지)', async () => {
    const provider = await makeProvider()
    provider.replaceItems([{
      lineId: SERVER_LINE_1,
      productId: PRODUCT_1,
      productName: '품목1',
      modelName: 'MODEL-1',
      specification: '',
      quantity: 2,
      unitPrice: '60000',
      supplyAmount: '109090',
      vatAmount: '10910',
      lineTotalWithVat: '120000',
      note: '',
    }])
    const previous = [{
      key: 'k1',
      lineId: SERVER_LINE_1,
      productId: PRODUCT_1,
      productName: '품목1',
      modelName: 'MODEL-1',
      specification: '',
      quantity: 2,
      unitPrice: '60000',
      supplyAmount: '109090',
      vatAmount: '10910',
      lineTotalWithVat: '120000',
      note: '',
      authority: 'PRICE' as const,
      vatWarning: false,
    }]
    const knownIds = toServerLineIdSet([{ id: SERVER_LINE_1 }])

    const next = coeditLinesToEditLines(provider, previous, knownIds)[0]!

    expect(next.vatWarning).toBe(false)
    provider.destroy()
  })
})

/**
 * 재수렴 4차(#937) 근본수정 — ⑤ "두 컬럼이 같아진 기존 행" (RED-first).
 *
 * <p>PM 각도 ② 실측: 실 DB(2026-07-27 활성 2,779건)에 {@code unit_price = unit_price_with_vat}
 * 인 행이 55건 있다. 그 상태만으로는 <b>둘 다 VAT 포함인지 둘 다 VAT 제외인지 구별할 수 없다</b> —
 * 권위 금액(공급가액/부가세/수량)과 대조해야 판정된다. 재수렴 3차 U1 fix 는
 * {@code unit_price_with_vat} 를 무조건 VAT 포함으로 믿었기 때문에, main 편집화면 페이로드가
 * 만든 {@code 100000|100000|200000|20000|2} 행에서 그 값을 다시 ÷1.1 해 과세표준이 9.09%
 * 떨어졌다(수량 2→3: 300,000 기대 → 272,727 실측).
 *
 * <p>라이브 실증(2026-07-27, throwaway 전표 46ec2d03-…): 생성 직후 {@code 100000|110000|
 * 200000|20000|2} → main 페이로드(unitPrice=100000) 저장 → {@code 100000|100000|200000|20000|2}.
 */
describe('SlipDetailPage — 재수렴 4차(#937) ⑤ 두 컬럼이 같아진 행의 세금 도메인 (RED-first)', () => {
  /** 실 DB 재현 — 두 컬럼이 모두 VAT 제외 공급단가(100,000)인 행. */
  const bothColumnsVatExclusive = {
    lines: [{
      id: SERVER_LINE_1,
      productId: PRODUCT_1,
      productName: '품목1',
      modelName: 'MODEL-1',
      specification: '',
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '100000',
      supplyAmount: '200000',
      vatAmount: '20000',
      lineTotal: '200000',
      note: '',
    }],
  } as unknown as SlipDetail

  /** 재수렴 4차 진단 ①② — HEAD 무수정 재저장이 만드는, 두 컬럼이 모두 VAT 포함인 행. */
  const bothColumnsVatInclusive = {
    lines: [{
      id: SERVER_LINE_1,
      productId: PRODUCT_1,
      productName: '품목1',
      modelName: 'MODEL-1',
      specification: '',
      quantity: 2,
      unitPrice: '110000',
      unitPriceWithVat: '110000',
      supplyAmount: '200000',
      vatAmount: '20000',
      lineTotal: '200000',
      note: '',
    }],
  } as unknown as SlipDetail

  it('⑤ 하이드레이션 — 두 컬럼이 VAT 제외로 같아진 행도 권위 금액에서 VAT 포함 단가를 유도한다', () => {
    const hydrated = toPurchaseEditLines(bothColumnsVatExclusive)[0]!

    // RED(수정 전): unit_price_with_vat 를 무조건 믿어 '100000' — 라벨/계산 도메인과 반대.
    expect(hydrated.unitPrice).toBe('110000')
    expect(Number(hydrated.unitPrice) * hydrated.quantity)
      .toBe(Number(hydrated.supplyAmount) + Number(hydrated.vatAmount))
  })

  it('⑤ 수량 2→3 — 과세표준이 9.09% 떨어지지 않는다', () => {
    const hydrated = toPurchaseEditLines(bothColumnsVatExclusive)[0]!
    const afterQtyEdit = computeDetailQuantityChange(hydrated, '3')

    // RED(수정 전): 272,727 / 27,273 / 300,000 (PM 각도 ② 실측).
    expect(afterQtyEdit.supplyAmount).toBe('300000')
    expect(afterQtyEdit.vatAmount).toBe('30000')
    expect(afterQtyEdit.lineTotalWithVat).toBe('330000')
  })

  it('⑤ 읽기전용 상세 표시 — 단가 x 수량 = 공급가액 + 부가세 가 성립한다', () => {
    const amounts = slipLineAmounts(bothColumnsVatExclusive.lines[0]!)

    // RED(수정 전): unitWithVat=100000 → 100,000 x 2 = 200,000 인데 표시 합계는 220,000.
    expect(amounts.unitWithVat).toBe(110000)
    expect(amounts.unitWithVat * 2).toBe(amounts.totalIncl)
  })

  it('①② 두 컬럼이 VAT 포함으로 같아진 행도 하이드레이션·표시가 흔들리지 않는다', () => {
    const hydrated = toPurchaseEditLines(bothColumnsVatInclusive)[0]!
    const amounts = slipLineAmounts(bothColumnsVatInclusive.lines[0]!)

    expect(hydrated.unitPrice).toBe('110000')
    expect(amounts.unitWithVat).toBe(110000)
  })

  it('무수정 재저장 안정성 — ⑤ 행을 재저장한 뒤(두 컬럼 정상화) 표시 값이 그대로다', () => {
    const before = slipLineAmounts(bothColumnsVatExclusive.lines[0]!)
    // BE 근본수정 후의 저장 결과: unit_price = 공급가액/수량, unit_price_with_vat = 입력(VAT 포함).
    const afterResave = slipLineAmounts({
      ...bothColumnsVatExclusive.lines[0]!,
      unitPrice: '100000',
      unitPriceWithVat: '110000',
    } as never)

    expect(afterResave.unitWithVat).toBe(before.unitWithVat)
    expect(afterResave.totalIncl).toBe(before.totalIncl)
  })
})

/**
 * 재수렴 5차(#937) 근본수정 — 표시·하이드레이션도 P4 를 따른다 (RED-first).
 *
 * <p>PM 진단 원문(라이브 실측 2026-07-27): 단가(VAT포함) 110,000 x 2 로 저장한 뒤 <b>부가세만</b>
 * 20,000 → 25,000 으로 고치면 DB 는 {@code 100000|110000|200000|25000|2} 가 된다(사용자 입력
 * 단가는 그대로 남는다). 그런데 재열기하면 읽기전용 표와 수정 모달이 모두 <b>112,500</b> 을
 * 보였고, 아무것도 고치지 않고 저장만 해도 {@code unit_price_with_vat} 가 112,500 으로 덮여
 * 사용자가 입력한 단가가 영구 소멸했다(가격기억 각인 원천 컬럼이라 자동채움까지 오염).
 *
 * <p>{@code editSlipLineAmount}(편집 계층)는 2026-07-25 개발책임자 결정 P4 를 따라 단가를 결코
 * 역산하지 않는데, 표시·하이드레이션 계층만 반대 규칙을 쓰고 있었다.
 */
describe('SlipDetailPage — 재수렴 5차(#937) 사용자 권위 단가 보존 (RED-first)', () => {
  /** 부가세만 편집해 항등식이 정당하게 깨진 라인 — 두 단가 컬럼이 서로 다르다. */
  const vatOnlyEdited = {
    lines: [{
      id: SERVER_LINE_1,
      productId: PRODUCT_1,
      productName: '품목1',
      modelName: 'MODEL-1',
      specification: '',
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '110000',
      supplyAmount: '200000',
      vatAmount: '25000',
      lineTotal: '200000',
      note: '',
    }],
  } as unknown as SlipDetail

  it('하이드레이션 — 부가세만 편집한 라인의 단가를 역산하지 않는다', () => {
    const hydrated = toPurchaseEditLines(vatOnlyEdited)[0]!

    // RED(수정 전): '112500' — (200,000+25,000)/2. 사용자는 110,000 을 입력했다.
    expect(hydrated.unitPrice).toBe('110000')
  })

  it('읽기전용 표 — 같은 라인을 같은 단가로 보인다', () => {
    const amounts = slipLineAmounts(vatOnlyEdited.lines[0]!)

    // RED(수정 전): 112500.
    expect(amounts.unitWithVat).toBe(110000)
    expect(amounts.supply).toBe(200000)
    expect(amounts.vat).toBe(25000)
    expect(amounts.totalIncl).toBe(225000)
  })

  it('불변식 3 — 읽기전용 표와 수정 모달이 같은 단가를 보인다', () => {
    const hydrated = toPurchaseEditLines(vatOnlyEdited)[0]!
    const amounts = slipLineAmounts(vatOnlyEdited.lines[0]!)

    expect(Number(hydrated.unitPrice)).toBe(amounts.unitWithVat)
  })

  it('불변식 2 — 무편집 재저장(BE 가 같은 값을 되돌려줌) 후에도 표시가 그대로다', () => {
    const before = slipLineAmounts(vatOnlyEdited.lines[0]!)
    // BE createFromAuthoritativeAmounts: unit_price = S/Q, unit_price_with_vat = 요청 단가.
    const hydrated = toPurchaseEditLines(vatOnlyEdited)[0]!
    const afterResave = slipLineAmounts({
      ...vatOnlyEdited.lines[0]!,
      unitPrice: String(Number(hydrated.supplyAmount) / hydrated.quantity),
      unitPriceWithVat: hydrated.unitPrice,
    } as never)

    expect(afterResave.unitWithVat).toBe(before.unitWithVat)
    expect(afterResave.totalIncl).toBe(before.totalIncl)
  })

  it('끝수 단가 + 부가세 편집 — 끝수가 반올림으로 증발하지 않는다', () => {
    const fractional = {
      lines: [{
        ...vatOnlyEdited.lines[0]!,
        quantity: 3,
        unitPrice: '30303',
        unitPriceWithVat: '33333.33',
        supplyAmount: '90909',
        vatAmount: '12000',
        lineTotal: '90909',
      }],
    } as unknown as SlipDetail

    // RED(수정 전): 읽기전용 34303 vs 수정모달 33333.33(Y.Doc 복원) — 두 화면 불일치.
    expect(toPurchaseEditLines(fractional)[0]!.unitPrice).toBe('33333.33')
    expect(slipLineAmounts(fractional.lines[0]!).unitWithVat).toBe(33333.33)
  })
})
