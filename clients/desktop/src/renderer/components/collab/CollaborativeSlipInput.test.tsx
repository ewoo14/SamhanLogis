// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as Y from 'yjs'
import { CollaborativeSlipInput } from './CollaborativeSlipInput'
import type { DocCoeditProvider, RemoteFieldEdit } from '../../realtime/createCoeditProvider'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

type TestDocCoeditProvider = DocCoeditProvider & {
  getItemIndexById: (lineId: string) => number
  getItemValueById: (lineId: string, cellName: string) => string
  setItemValueById: (lineId: string, cellName: string, value: string) => void
  addItem: (seed?: Record<string, unknown>) => string
  removeItem: (lineId: string) => void
  __emitAwareness: () => void
}

function providerStub(): TestDocCoeditProvider {
  const doc = new Y.Doc()
  const header = doc.getMap<unknown>('header')
  const items = doc.getArray<Y.Map<unknown>>('items')
  const docListeners = new Set<() => void>()
  const awarenessListeners = new Set<() => void>()
  const findItemIndexById = (lineId: string) => {
    for (let i = 0; i < items.length; i += 1) {
      if (items.get(i).get('lineId') === lineId) return i
    }
    return -1
  }
  return {
    doc,
    header,
    items,
    awareness: {} as DocCoeditProvider['awareness'],
    applyRemoteUpdate: vi.fn(),
    applyRemoteAwareness: vi.fn(),
    setLocalCursor: vi.fn(),
    getRemoteCursors: (fieldPath?: string) => (fieldPath === 'items.0.quantity'
      ? [{
          clientId: 77,
          displayName: '김영업',
          color: '#2563EB',
          fieldPath: 'items.0.quantity',
          anchor: 0,
          head: 1,
        }]
      : []),
    setLocalLastEdit: vi.fn(),
    getRemoteEdits: vi.fn((): RemoteFieldEdit[] => []),
    getHeaderValue: (fieldName) => String(header.get(fieldName) ?? ''),
    setHeaderValue: (fieldName, value) => {
      header.set(fieldName, value)
      docListeners.forEach((listener) => listener())
    },
    getItemValue: (index, cellName) => String(items.get(index)?.get(cellName) ?? ''),
    setItemValue: (index, cellName, value) => {
      while (items.length <= index) items.push([new Y.Map<unknown>()])
      items.get(index).set(cellName, value)
      docListeners.forEach((listener) => listener())
    },
    getItemIndexById: findItemIndexById,
    getItemValueById: (lineId, cellName) => {
      const index = findItemIndexById(lineId)
      return index < 0 ? '' : String(items.get(index)?.get(cellName) ?? '')
    },
    setItemValueById: (lineId, cellName, value) => {
      const index = findItemIndexById(lineId)
      if (index < 0) return
      items.get(index).set(cellName, value)
      docListeners.forEach((listener) => listener())
    },
    addItem: (seed) => {
      const lineId = `test-line-${items.length}`
      const map = new Y.Map<unknown>()
      map.set('lineId', lineId)
      for (const [key, value] of Object.entries(seed ?? {})) {
        if (key !== 'lineId') map.set(key, value == null ? '' : String(value))
      }
      items.push([map])
      docListeners.forEach((listener) => listener())
      return lineId
    },
    removeItem: (lineId) => {
      const index = findItemIndexById(lineId)
      if (index >= 0) items.delete(index, 1)
      docListeners.forEach((listener) => listener())
    },
    replaceItems: vi.fn(),
    isEmpty: () => false,
    subscribeDoc: (listener) => {
      docListeners.add(listener)
      return () => docListeners.delete(listener)
    },
    subscribeAwareness: (listener) => {
      awarenessListeners.add(listener)
      listener()
      return () => awarenessListeners.delete(listener)
    },
    __emitAwareness: () => {
      awarenessListeners.forEach((listener) => listener())
    },
    destroy: vi.fn(),
  }
}

describe('CollaborativeSlipInput', () => {
  it('R15 RED-A1 draft 행의 규격·수량·단가·적요 입력은 Y.Doc 행을 생성하지 않는다', () => {
    const provider = providerStub()

    for (const [cellName, ariaLabel] of [
      ['specification', '규격 draft'],
      ['quantity', '수량 draft'],
      ['unitPrice', '단가 draft'],
      ['note', '적요 draft'],
    ] as const) {
      const view = render(
        <CollaborativeSlipInput
          provider={provider}
          fieldPath={`items.0.${cellName}`}
          value=""
          onValueChange={() => undefined}
          aria-label={ariaLabel}
        />,
      )

      fireEvent.change(screen.getByLabelText(ariaLabel), { target: { value: 'draft-value' } })
      expect(provider.items.length).toBe(0)
      view.unmount()
    }

    expect(provider.items.length).toBe(0)
  })

  it('forwards aria-describedby to the actual input', () => {
    render(
      <>
        <CollaborativeSlipInput
          provider={null}
          fieldPath="items.0.unitPrice"
          value="100000"
          onValueChange={() => undefined}
          aria-label="단가 1"
          aria-describedby="price-source-1"
        />
        <span id="price-source-1">거래처 최근단가</span>
      </>,
    )

    expect(screen.getByLabelText('단가 1').getAttribute('aria-describedby')).toBe('price-source-1')
  })

  it('입력값을 Yjs fieldPath 에 쓰고 원격 awareness 라벨은 이름만 표시한다', () => {
    const provider = providerStub()
    provider.addItem({ quantity: '1' })
    const onValueChange = vi.fn()

    render(
      <CollaborativeSlipInput
        provider={provider}
        fieldPath="items.0.quantity"
        value="1"
        onValueChange={onValueChange}
        aria-label="수량 1"
      />,
    )

    fireEvent.change(screen.getByLabelText('수량 1'), { target: { value: '3' } })

    expect(provider.getItemValue(0, 'quantity')).toBe('3')
    expect(onValueChange).toHaveBeenCalledWith('3')
    // 편집 시 lastEdit 송신(원격에 변경 하이라이트용) — QA NB-1 송신측 단언 보강
    expect(provider.setLocalLastEdit).toHaveBeenCalledWith('items.0.quantity')
    expect(screen.getByTestId('slip-coedit-field-items-0-quantity').textContent).toContain('김영업')
    expect(screen.queryByText('77')).toBeNull()
  })

  it('CRDT lineId 경로와 DOM testid 경로를 분리해 첫 행 식별자를 유지한다', () => {
    const provider = providerStub()
    const lineId = provider.addItem({ quantity: '1' })

    render(
      <CollaborativeSlipInput
        provider={provider}
        fieldPath={`items.${lineId}.quantity`}
        testIdPath="items.0.quantity"
        value="1"
        onValueChange={() => undefined}
        aria-label="수량 1"
      />,
    )

    expect(screen.getByTestId('slip-coedit-field-items-0-quantity')).toBeTruthy()
    expect(screen.queryByTestId(`slip-coedit-field-items-${lineId}-quantity`)).toBeNull()

    fireEvent.change(screen.getByLabelText('수량 1'), { target: { value: '2' } })
    expect(provider.getItemValueById(lineId, 'quantity')).toBe('2')
  })

  it('provider 문서 변경을 controlled input 값으로 반영한다', () => {
    const provider = providerStub()
    const onValueChange = vi.fn()

    render(
      <CollaborativeSlipInput
        provider={provider}
        fieldPath="header.memo"
        value=""
        onValueChange={onValueChange}
        aria-label="적요"
      />,
    )

    act(() => provider.setHeaderValue('memo', '원격 적요'))

    expect(onValueChange).toHaveBeenCalledWith('원격 적요')
  })

  it('doc-sync 유래 변경은 onDocSyncValueChange 로만 전달하고 실입력은 onValueChange 로 남긴다 (R4-F6)', () => {
    const provider = providerStub()
    // 초기 mount sync 가 콜백을 쏘지 않게 문서값을 controlled 값과 일치시켜 둔다.
    provider.setItemValue(0, 'unitPrice', '0')
    const onValueChange = vi.fn()
    const onDocSyncValueChange = vi.fn()

    render(
      <CollaborativeSlipInput
        provider={provider}
        fieldPath="items.0.unitPrice"
        value="0"
        onValueChange={onValueChange}
        onDocSyncValueChange={onDocSyncValueChange}
        aria-label="단가 1"
      />,
    )

    // 자동채움(가격기억) 등 provider write 유래 doc-sync — 분류 부수효과(priceSource=USER)가
    // 있는 onValueChange 를 우회해 전용 콜백으로만 전달돼야 pending 마커가 소멸하지 않는다.
    act(() => provider.setItemValue(0, 'unitPrice', '88000'))

    expect(onDocSyncValueChange).toHaveBeenCalledWith('88000')
    expect(onValueChange).not.toHaveBeenCalled()

    // 실사용자 타이핑은 여전히 onValueChange 경로(USER 재분류 부수효과 유지).
    fireEvent.change(screen.getByLabelText('단가 1'), { target: { value: '7777' } })

    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('7777')
  })

  it('원격 편집 lastEdit 수신 시 펄스와 수정 배지를 표시하고 2.5초 후 소멸한다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const provider = providerStub()
    const edit: RemoteFieldEdit = {
      clientId: 78,
      displayName: '김영업',
      color: '#DB2777',
      fieldPath: 'header.memo',
      ts: 0,
    }
    provider.getRemoteEdits = vi.fn((fieldPath?: string) => (
      fieldPath === 'header.memo' && Date.now() - edit.ts < 2_500 ? [edit] : []
    ))

    render(
      <CollaborativeSlipInput
        provider={provider}
        fieldPath="header.memo"
        value=""
        onValueChange={() => undefined}
        aria-label="적요"
      />,
    )

    act(() => provider.__emitAwareness())

    expect(screen.getByTestId('slip-coedit-edit-pulse')).toBeTruthy()
    expect(screen.getByText('김영업 수정')).toBeTruthy()

    act(() => vi.advanceTimersByTime(2_500))

    expect(screen.queryByTestId('slip-coedit-edit-pulse')).toBeNull()
    expect(screen.queryByText('김영업 수정')).toBeNull()
  })

  it('coedit 로딩 중(coeditPending)에는 입력을 잠가 Y.Doc 과 modal state 분리를 막는다', () => {
    const onValueChange = vi.fn()

    render(
      <CollaborativeSlipInput
        provider={null}
        fieldPath="header.memo"
        value="기존 적요"
        onValueChange={onValueChange}
        coeditPending
        aria-label="적요"
      />,
    )

    const input = screen.getByLabelText('적요')
    expect((input as HTMLInputElement).readOnly).toBe(true)

    fireEvent.change(input, { target: { value: 'provider 전 입력' } })

    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('coedit 로드 실패/비활성(provider=null·로딩완료) 시엔 평문 편집을 허용해 영구잠금 회귀를 막는다', () => {
    // 콜랩 서버 다운 등으로 provider 가 끝내 null 이어도 사용자가 전표를 편집할 수 있어야 함(리뷰 Opus 라운드2 BLOCKING).
    const onValueChange = vi.fn()

    render(
      <CollaborativeSlipInput
        provider={null}
        fieldPath="header.memo"
        value="기존 적요"
        onValueChange={onValueChange}
        aria-label="적요"
      />,
    )

    const input = screen.getByLabelText('적요')
    expect((input as HTMLInputElement).readOnly).toBe(false)

    fireEvent.change(input, { target: { value: '평문 편집' } })

    expect(onValueChange).toHaveBeenCalledWith('평문 편집')
  })
})
describe('CollaborativeSlipInput item fieldPath routing', () => {
  it('keeps a bare header fieldPath routed to the legacy empty header key', () => {
    const provider = providerStub()
    const getHeaderValue = vi.spyOn(provider, 'getHeaderValue')
    const setHeaderValue = vi.spyOn(provider, 'setHeaderValue')

    render(
      <CollaborativeSlipInput
        provider={provider}
        fieldPath="header"
        value=""
        onValueChange={() => undefined}
        aria-label="bare header"
      />,
    )

    fireEvent.change(screen.getByLabelText('bare header'), { target: { value: 'fallback' } })

    expect(getHeaderValue).toHaveBeenCalledWith('')
    expect(setHeaderValue).toHaveBeenCalledWith('', 'fallback')
    expect(provider.header.get('header')).toBeUndefined()
  })

  it('routes numeric item row keys through the existing index API', () => {
    const provider = providerStub()
    const getItemValue = vi.spyOn(provider, 'getItemValue')
    const getItemValueById = vi.spyOn(provider, 'getItemValueById')
    const setItemValue = vi.spyOn(provider, 'setItemValue')
    const setItemValueById = vi.spyOn(provider, 'setItemValueById')
    provider.setItemValue(0, 'quantity', '1')

    render(
      <CollaborativeSlipInput
        provider={provider}
        fieldPath="items.0.quantity"
        value=""
        onValueChange={() => undefined}
        aria-label="quantity"
      />,
    )

    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '4' } })

    expect(getItemValue).toHaveBeenCalledWith(0, 'quantity')
    expect(getItemValueById).not.toHaveBeenCalled()
    expect(setItemValue).toHaveBeenCalledWith(0, 'quantity', '4')
    expect(setItemValueById).not.toHaveBeenCalled()
  })

  it('routes non-numeric item row keys through the lineId API', () => {
    const provider = providerStub()
    const lineId = provider.addItem({ quantity: '1' })
    const getItemValue = vi.spyOn(provider, 'getItemValue')
    const getItemValueById = vi.spyOn(provider, 'getItemValueById')
    const setItemValue = vi.spyOn(provider, 'setItemValue')
    const setItemValueById = vi.spyOn(provider, 'setItemValueById')

    render(
      <CollaborativeSlipInput
        provider={provider}
        fieldPath={`items.${lineId}.quantity`}
        value=""
        onValueChange={() => undefined}
        aria-label="quantity"
      />,
    )

    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '6' } })

    expect(getItemValueById).toHaveBeenCalledWith(lineId, 'quantity')
    expect(getItemValue).not.toHaveBeenCalled()
    expect(setItemValueById).toHaveBeenCalledWith(lineId, 'quantity', '6')
    expect(setItemValue).not.toHaveBeenCalled()
  })
})
