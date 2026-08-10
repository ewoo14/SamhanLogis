import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createDocCoeditProvider, type DocCoeditProvider } from '../realtime/createCoeditProvider'
import {
  buildSalesEditLinePayloads,
  coeditLinesToEditLines,
  promoteSalesProductSelection,
  removeSalesEditLine,
  syncDetailAmountToDoc,
} from './SlipDetailPage'

const SERVER_LINE_ID = 'server-line-1'

async function providerWithRows(rows: Record<string, unknown>[]): Promise<DocCoeditProvider> {
  return createDocCoeditProvider({
    documentId: 's2-test',
    basePath: '/slips/s2-test',
    initialUpdates: async () => ({ updates: [] }),
    postUpdate: vi.fn(),
    postAwareness: vi.fn(),
    subscribe: () => ({ abort: vi.fn() }) as unknown as AbortController,
  }).then((provider) => {
    provider.replaceItems(rows)
    return provider
  })
}

function line(overrides: Record<string, unknown> = {}) {
  return {
    key: 'local-line',
    lineId: null,
    productId: null,
    productName: '',
    modelName: '',
    specification: '',
    quantity: 0,
    unitPrice: '0',
    note: '',
    ...overrides,
  }
}

describe('S2 #1071 매출 수정 품목 추가 RED-A', () => {
  it('품목 선택기와 승격 중 저장 write fence가 실제 수정 화면에 연결된다', () => {
    const source = readFileSync(fileURLToPath(new URL('./SlipDetailPage.tsx', import.meta.url)), 'utf8')

    expect(source).toContain('<ProductAutocomplete')
    expect(source).toContain('provider={lineProvider}')
    expect(source).toContain('if (salesEditPromotionPendingRef.current)')
    expect(source).toContain('lines: buildSalesEditLinePayloads(salesEditLines)')
  })

  it('품목을 확정한 신규 행은 저장 payload에 포함된다', () => {
    const payload = buildSalesEditLinePayloads([
      line({
        key: 'new-product',
        productId: 'product-new',
        productName: '신규 품목',
        modelName: 'MODEL-NEW',
        quantity: 2,
        unitPrice: '15000',
      }),
    ])

    expect(payload).toEqual([
      expect.objectContaining({
        lineId: null,
        productId: 'product-new',
        productName: '신규 품목',
        modelName: 'MODEL-NEW',
        quantity: 2,
        unitPrice: '15000',
      }),
    ])
  })

  it('trailing 빈 행과 삭제 후 남지 않은 행은 저장 payload를 오염시키지 않는다', () => {
    const payload = buildSalesEditLinePayloads([
      line({
        key: 'survivor',
        lineId: 'server-line-1',
        productId: 'product-existing',
        productName: '기존 품목',
        modelName: 'MODEL-EXISTING',
        quantity: 1,
        unitPrice: '10000',
      }),
      line({ key: 'trailing-draft' }),
    ])

    expect(payload).toHaveLength(1)
    expect(payload[0]).toEqual(expect.objectContaining({
      lineId: 'server-line-1',
      productId: 'product-existing',
    }))
  })

  it('신규 draft 품목 확정은 provider 행을 한 번 승격하고 payload lineId는 null로 둔다', async () => {
    const provider = await providerWithRows([])
    const promoted = promoteSalesProductSelection(
      provider,
      line({ key: 'draft', quantity: 1 }),
      {
        id: 'product-new',
        modelName: 'MODEL-NEW',
        productName: '신규 품목',
        specification: '규격 A',
      },
    )

    expect(provider.items).toHaveLength(1)
    expect(promoted.lineId).toBeNull()
    expect(promoted.coeditLineId).toBeTruthy()
    expect(provider.getItemValueById(promoted.coeditLineId!, 'productId')).toBe('product-new')
    expect(provider.getItemValueById(promoted.coeditLineId!, 'quantity')).toBe('1')
    provider.destroy()
  })

  it('신규 승격행의 금액 동기화는 payload lineId 대신 coeditLineId를 쓴다', async () => {
    const provider = await providerWithRows([])
    const promoted = promoteSalesProductSelection(
      provider,
      line({ key: 'draft', quantity: 1, unitPrice: '100' }),
      { id: 'product-new', modelName: 'MODEL-NEW', productName: '신규 품목' },
    )

    syncDetailAmountToDoc(provider, promoted, {
      quantity: 2,
      unitPrice: '200',
      supplyAmount: '364',
      vatAmount: '36',
    })

    expect(provider.getItemValueById(promoted.coeditLineId!, 'quantity')).toBe('2')
    expect(provider.getItemValueById(promoted.coeditLineId!, 'unitPrice')).toBe('200')
    expect(provider.getItemValueById(promoted.coeditLineId!, 'supplyAmount')).toBe('364')
    expect(provider.getItemValueById(promoted.coeditLineId!, 'vatAmount')).toBe('36')
    provider.destroy()
  })

  it('기존 행에서 품목을 바꿔도 provider 행과 기존 lineId를 유지한다', async () => {
    const provider = await providerWithRows([{
      lineId: SERVER_LINE_ID,
      productId: 'product-old',
      productName: '기존 품목',
      modelName: 'MODEL-OLD',
      quantity: 1,
      unitPrice: '1000',
    }])
    const promoted = promoteSalesProductSelection(
      provider,
      line({
        key: 'existing',
        lineId: SERVER_LINE_ID,
        productId: 'product-old',
        productName: '기존 품목',
        modelName: 'MODEL-OLD',
        quantity: 1,
        unitPrice: '1000',
      }),
      {
        id: 'product-replaced',
        modelName: 'MODEL-REPLACED',
        productName: '교체 품목',
      },
    )

    expect(provider.items).toHaveLength(1)
    expect(promoted.lineId).toBe(SERVER_LINE_ID)
    expect(provider.getItemValueById(SERVER_LINE_ID, 'productId')).toBe('product-replaced')
    provider.destroy()
  })

  it('승격 후 품목을 지우면 local row와 payload에서 함께 사라진다', async () => {
    const provider = await providerWithRows([])
    const promoted = promoteSalesProductSelection(
      provider,
      line({ key: 'promoted', quantity: 1 }),
      { id: 'product-new', modelName: 'MODEL-NEW', productName: '신규 품목' },
    )
    provider.removeItem(promoted.coeditLineId!)
    const remaining = removeSalesEditLine(
      [promoted, line({ key: 'trailing-draft' })],
      promoted.key,
    )

    expect(provider.items).toHaveLength(0)
    expect(buildSalesEditLinePayloads(remaining)).toEqual([])
    provider.destroy()
  })

  it('협업 projection은 기존 lineId와 신규 coeditLineId를 각각 재부착하고 local draft는 만들지 않는다', async () => {
    const provider = await providerWithRows([{
      lineId: SERVER_LINE_ID,
      productId: 'product-existing',
      productName: '기존 품목',
      modelName: 'MODEL-EXISTING',
      quantity: 1,
      unitPrice: '1000',
    }])
    const newLine = promoteSalesProductSelection(
      provider,
      line({ key: 'new-line', quantity: 1 }),
      { id: 'product-new', modelName: 'MODEL-NEW', productName: '신규 품목' },
    )
    const projected = coeditLinesToEditLines(
      provider,
      [
        line({ key: 'existing', lineId: SERVER_LINE_ID, productId: 'product-existing', quantity: 1 }),
        newLine,
        line({ key: 'trailing-draft' }),
      ] as never,
      new Set([SERVER_LINE_ID]),
    )

    expect(projected).toHaveLength(2)
    expect(projected[0]!.lineId).toBe(SERVER_LINE_ID)
    expect(projected[1]!.lineId).toBeNull()
    expect(projected[1]!.coeditLineId).toBe(newLine.coeditLineId)
    provider.destroy()
  })

  it('두 신규 품목을 연속 확정해도 저장 내용은 두 행이고 trailing draft는 제외된다', async () => {
    const provider = await providerWithRows([])
    const first = promoteSalesProductSelection(
      provider,
      line({ key: 'first', quantity: 1 }),
      { id: 'product-1', modelName: 'MODEL-1', productName: '품목 1' },
    )
    const second = promoteSalesProductSelection(
      provider,
      line({ key: 'second', quantity: 2 }),
      { id: 'product-2', modelName: 'MODEL-2', productName: '품목 2' },
    )
    const payload = buildSalesEditLinePayloads([first, second, line({ key: 'trailing-draft' })])

    expect(provider.items).toHaveLength(2)
    expect(payload.map((item) => item.productId)).toEqual(['product-1', 'product-2'])
    provider.destroy()
  })
})
