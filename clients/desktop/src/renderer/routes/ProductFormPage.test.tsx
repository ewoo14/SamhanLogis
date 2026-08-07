// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type {
  ProductCategoryNode,
  ProductDetailResponse,
  ProductSummaryResponse,
} from '../api/productCatalogApi'

const mocks = vi.hoisted(() => ({
  createProduct: vi.fn(),
  getProductByModelName: vi.fn(),
  listProductCategories: vi.fn(),
  listProducts: vi.fn(),
  listSpecKeyTemplates: vi.fn(),
  searchProductSummaries: vi.fn(),
  updateProduct: vi.fn(),
  listBundleComponents: vi.fn(),
  updateBundleComponents: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
  Button: ({ children, variant: _variant, loading: _loading, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Input: ({ label, error, ...props }: any) => (
    <div>
      {label ? <span>{label}</span> : null}
      <input {...props} />
      {error ? <span role="alert">{error}</span> : null}
    </div>
  ),
  Select: ({ label, error, children, ...props }: any) => (
    <div>
      {label ? <span>{label}</span> : null}
      <select {...props}>{children}</select>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  ),
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
}))

vi.mock('../api/productCatalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/productCatalogApi')>()
  return {
    ...actual,
    createProduct: mocks.createProduct,
    getProductByModelName: mocks.getProductByModelName,
    listProductCategories: mocks.listProductCategories,
    listProducts: mocks.listProducts,
    listSpecKeyTemplates: mocks.listSpecKeyTemplates,
    searchProductSummaries: mocks.searchProductSummaries,
    updateProduct: mocks.updateProduct,
    listBundleComponents: mocks.listBundleComponents,
    updateBundleComponents: mocks.updateBundleComponents,
  }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mocks.navigate }
})

import { ProductFormPage } from './ProductFormPage'
import { flushZeroDelayTasks } from '../test-utils/flush'

const categories: ProductCategoryNode[] = [
  { id: 'cat-1', code: 'C1', name: '싱글 구성품', parentId: null, displayOrder: 0, children: [] },
]

function emptyPage() {
  return { content: [], totalElements: 0, totalPages: 0, number: 0, size: 20, first: true, last: true }
}

function catalogPageWithComponentCount(modelCode: string, componentCount: number, componentSetToken = 'set-token-1108') {
  return {
    content: [{ modelCode, componentCount, componentSetToken }],
    totalElements: 1,
    totalPages: 1,
    number: 0,
    size: 20,
    first: true,
    last: true,
  }
}

function seedFor(modelCode: string): {
  summary: ProductSummaryResponse
  detail: ProductDetailResponse
} {
  const detail: ProductDetailResponse = {
    id: `uuid-${modelCode}`,
    name: '실내기 A',
    modelName: modelCode,
    modelCode,
    categoryId: 'cat-1',
    categoryName: '싱글 구성품',
    sellingPrice: '1000000',
    purchasePrice: '700000',
    currency: 'KRW',
    tags: {},
    description: null,
    productCategory: 'SINGLE_PART',
    itemKind: 'GENERAL',
    bundleMode: null,
    parentSetModelCode: null,
    componentKind: null,
    unit: 'EA',
    releasePrice: '900000',
    deliveryPrice: '20000',
    goodsType: 'GOODS',
    specs: [],
  }
  const summary: ProductSummaryResponse = {
    id: detail.id,
    name: detail.name,
    modelName: detail.modelName,
    productCode: modelCode,
    categoryId: 'cat-1',
    sellingPrice: '1000000',
    status: 'ACTIVE',
    goods: true,
    modelCode,
    productType: 'SINGLE',
  }
  return { summary, detail }
}

function renderPage(path = '/products/new') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.listProductCategories.mockResolvedValue(categories)
  mocks.listSpecKeyTemplates.mockResolvedValue([])
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/products/new" element={<ProductFormPage />} />
            <Route path="/products/:modelCode/edit" element={<ProductFormPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProductFormPage', () => {
  it('shows the component count and does not save when set-to-single confirmation is cancelled', async () => {
    const seed = seedFor('SET-1108')
    seed.summary.productType = 'BUNDLE'
    seed.detail.itemKind = 'SET'
    seed.detail.productCategory = 'SINGLE_SET'
    seed.detail.bundleMode = 'EXPAND'
    mocks.searchProductSummaries.mockResolvedValue([seed.summary])
    mocks.getProductByModelName.mockResolvedValue(seed.detail)
    mocks.listProducts.mockResolvedValue(catalogPageWithComponentCount('SET-1108', 4))
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderPage('/products/SET-1108/edit')
    await screen.findByTestId('product-form-model-name')
    fireEvent.click(screen.getByLabelText('단일'))
    fireEvent.click(screen.getByTestId('product-form-save-button'))

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('4'))
    expect(mocks.updateProduct).not.toHaveBeenCalled()
  })

  it('saves a material transition with an explicit confirmation flag', async () => {
    const seed = seedFor('SET-1108-MATERIAL')
    seed.summary.productType = 'BUNDLE'
    seed.detail.itemKind = 'SET'
    seed.detail.productCategory = 'SINGLE_SET'
    seed.detail.bundleMode = 'EXPAND'
    mocks.searchProductSummaries.mockResolvedValue([seed.summary])
    mocks.getProductByModelName.mockResolvedValue(seed.detail)
    mocks.listProducts.mockResolvedValue(catalogPageWithComponentCount('SET-1108-MATERIAL', 2))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mocks.updateProduct.mockResolvedValue(seed.detail)

    renderPage('/products/SET-1108-MATERIAL/edit')
    await screen.findByTestId('product-form-model-name')
    fireEvent.change(screen.getByTestId('product-form-product-category'), {
      target: { value: 'MATERIAL' },
    })
    fireEvent.click(screen.getByTestId('product-form-save-button'))

    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledTimes(1))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2'))
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      seed.detail.id,
      expect.objectContaining({
        productCategory: 'MATERIAL',
        confirmBundleChildrenDeletion: true,
        expectedBundleComponentSetToken: 'set-token-1108',
      }),
    )
  })

  it('세트 기초품목 상세에서 구성품 편집 영역을 제공한다', async () => {
    const seed = seedFor('SET-2000')
    seed.summary.productType = 'BUNDLE'
    seed.detail.itemKind = 'SET'
    mocks.searchProductSummaries.mockResolvedValue([seed.summary])
    mocks.getProductByModelName.mockResolvedValue(seed.detail)
    mocks.listProducts.mockResolvedValue(emptyPage())
    mocks.listBundleComponents.mockResolvedValue([
      {
        id: 'component-1',
        componentProductCode: 'IDU-001',
        componentName: '실내기',
        defaultQty: 1,
        qtyMode: 'FOLLOW_SET',
        componentKind: 'INDOOR',
        componentVariant: null,
        isDefault: true,
        specText: null,
        displayOrder: 1,
      },
    ])

    renderPage('/products/SET-2000/edit')

    expect(await screen.findByTestId('product-form-components-editor')).not.toBeNull()
  })

  it('편집 모드는 기존 품목을 hydrate하고 PATCH 저장을 호출한다', async () => {
    const seed = seedFor('AC-2000')
    mocks.searchProductSummaries.mockResolvedValue([seed.summary])
    mocks.getProductByModelName.mockResolvedValue(seed.detail)
    mocks.listProducts.mockResolvedValue(emptyPage())
    mocks.updateProduct.mockResolvedValue(seed.detail)

    renderPage('/products/AC-2000/edit')

    expect(await screen.findByTestId('product-form-model-name')).toHaveProperty('value', 'AC-2000')
    expect(screen.getByTestId('product-form-name')).toHaveProperty('value', '실내기 A')

    fireEvent.click(screen.getByTestId('product-form-save-button'))
    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledTimes(1))
    expect(mocks.updateProduct).toHaveBeenCalledWith('uuid-AC-2000', expect.objectContaining({
      name: '실내기 A',
      modelName: 'AC-2000',
      categoryId: 'cat-1',
    }))
  })

  it('신규 등록 모드에서 필수값을 비우고 저장하면 여전히 필수입력 오류를 표시한다 (정상 경로 검증 유지 — K2)', async () => {
    renderPage('/products/new')
    await screen.findByTestId('product-form-save-button')

    fireEvent.click(screen.getByTestId('product-form-save-button'))

    expect(await screen.findByText('품목명을 입력해 주세요.')).not.toBeNull()
    expect(screen.getByText('모델명을 입력해 주세요.')).not.toBeNull()
    expect(screen.getByText('카테고리를 선택해 주세요.')).not.toBeNull()
    expect(mocks.createProduct).not.toHaveBeenCalled()
  })

  it('동일 modelCode 재조회(refetch)는 로컬 편집을 덮어쓰지 않는다 (K4)', async () => {
    const seed = seedFor('AC-4000')
    mocks.searchProductSummaries.mockResolvedValue([seed.summary])
    mocks.getProductByModelName.mockResolvedValue(seed.detail)
    mocks.listProducts.mockResolvedValue(emptyPage())

    const { client } = renderPage('/products/AC-4000/edit')
    expect(await screen.findByTestId('product-form-name')).toHaveProperty('value', '실내기 A')

    fireEvent.change(screen.getByTestId('product-form-name'), { target: { value: '사용자 수정명' } })
    expect(screen.getByTestId('product-form-name')).toHaveProperty('value', '사용자 수정명')

    // 백그라운드 refetch 시뮬레이션 — 동일 modelCode, 새 객체 참조 주입.
    client.setQueryData(['product-form', 'AC-4000'], {
      summary: { ...seed.summary },
      detail: { ...seed.detail },
    })
    await flushZeroDelayTasks()

    expect(screen.getByTestId('product-form-name')).toHaveProperty('value', '사용자 수정명')
  })

  it('#831-hydrate 계열: editSeedQuery 커밋 직후 hydrate effect 가 아직 실행되지 않은 프레임에서 저장해도 초기값 기반 "필수 입력" 오류가 실제 품목에 대해 뜨지 않는다 (K1/K3)', async () => {
    const modelCode = 'AC-3000'
    const seed = seedFor(modelCode)
    // searchProductSummaries/getProductByModelName/listProducts 를 영원히 pending 으로 둔다 —
    // react-query 의 실 fetch 경로를 타지 않아야 "언제 commit 되는지" 완전히 통제할 수 있다
    // (CashReceiptFormPage #831-hydrate H4 기법과 동일 — client.setQueryData 로 캐시에 직접 주입).
    mocks.searchProductSummaries.mockImplementation(() => new Promise(() => {}))
    mocks.getProductByModelName.mockImplementation(() => new Promise(() => {}))
    mocks.listProducts.mockImplementation(() => new Promise(() => {}))
    mocks.updateProduct.mockResolvedValue(seed.detail)

    const { client } = renderPage(`/products/${modelCode}/edit`)
    // listProductCategories 는 resolve 되는 진짜 Promise — 이 대기는 categoriesQuery 게이트에만
    // 관여한다(editSeedQuery.data 는 아직 undefined 라 하이드레이트 로직의 guard 가 즉시 스킵되어
    // flush 할 게 없다 — 우리가 통제하려는 editSeed hydrate 창과는 무관).
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('품목 정보를 불러오는 중'))

    client.setQueryData(['product-form', modelCode], seed)
    // react-query notifyManager → React 커밋에는 매크로태스크가 필요하다(실측 — 순수
    // 마이크로태스크만으로는 200틱을 흘려도 커밋이 관측되지 않았다). 단 setTimeout(fn,0) 은
    // "중첩 타이머 4ms 클램프"(WHATWG 스펙) 대상이라 이전 테스트의 waitFor 폴링 등으로 중첩
    // 깊이가 쌓인 상태에서는 React 스케줄러가 쓰는 MessageChannel 기반 매크로태스크보다 내
    // setTimeout 이 더 늦게 실행돼 "effect 가 이미 flush 된 뒤" 관측되는 순서 역전이 실측
    // 재현됐다(파일 내 이전 테스트 유무에 따라 결과가 달라짐 — CashReceiptFormPage 의 동일
    // H4 테스트조차 파일 내 실행 순서에 따라 편차가 있었다). MessageChannel 로 직접 매크로
    // 태스크를 흘리면 React 스케줄러와 동일 메커니즘이라 클램프 편차 없이 결정적이다.
    //
    // #831-hydrate 계열 4파일 통일 기법(2026-07-26 PM 지적) — 매크로태스크를 정확히 1틱씩
    // MessageChannel 로 만들고, 그때마다 마이크로태스크를 흘려 "커밋을 처음 관측하는 순간"
    // 즉시 멈춘다(더 돌리지 않는다 — pre-fix 코드에서 hydrate effect 의 매크로태스크까지
    // 우연히 넘어가는 일이 없다). CashReceiptFormPage 는 부수 상태가 더 많아 2틱이 필요했던
    // 반면 이 파일은 1틱으로 충분함을 실측했지만, 다른 실행 컨텍스트에서도 안전하도록 동일한
    // 상한 있는 재시도 루프 구조를 쓴다.
    let saveButton: HTMLElement | null = null
    for (let macroTick = 0; macroTick < 10 && !saveButton; macroTick++) {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = () => resolve()
        channel.port2.postMessage(undefined)
      })
      saveButton = screen.queryByTestId('product-form-save-button')
      // 마이크로태스크만 정밀하게 추가로 흘려보낸다 — 매크로태스크는 섞이지 않으므로 구
      // hydrate effect 가 끼어들 수 없다.
      for (let microTick = 0; microTick < 300 && !saveButton; microTick++) {
        await Promise.resolve()
        saveButton = screen.queryByTestId('product-form-save-button')
      }
    }
    if (!saveButton) {
      throw new Error('editSeedQuery 커밋을 관측하지 못했다 (매크로 10틱 + 매 틱마다 마이크로 300틱)')
    }

    fireEvent.click(saveButton)
    // mutationFn(async, throw 이전 await 없음)의 동기 구간 + react-query 내부 마이크로태스크
    // 전파가 정리되도록 마이크로태스크만 추가로 흘려보낸다(매크로태스크 없음 — 구 hydrate
    // effect 는 여전히 끼어들 수 없다).
    for (let tick = 0; tick < 50; tick++) await Promise.resolve()

    // K1 — 아직 채워지지 않은 초기값 기준 "필수 입력" 오류가 실제 품목에 대해 뜨지 않는다.
    expect(screen.queryByTestId('product-form-error')).toBeNull()
    expect(screen.queryByText('품목명을 입력해 주세요.')).toBeNull()
    expect(screen.queryByText('모델명을 입력해 주세요.')).toBeNull()
    expect(screen.queryByText('카테고리를 선택해 주세요.')).toBeNull()

    // 저장이 실제로 hydrate 된 값으로 정상 진행된다(막히지 않는다).
    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledTimes(1))
    expect(mocks.updateProduct).toHaveBeenCalledWith(seed.detail.id, expect.objectContaining({
      name: '실내기 A',
      modelName: modelCode,
      categoryId: 'cat-1',
    }))
  })
})
