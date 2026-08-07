import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { encodeAwarenessUpdate } from 'y-protocols/awareness'
import {
  createCoeditProvider,
  createDocCoeditProvider,
  decodeBase64Update,
  encodeBase64Update,
} from './createCoeditProvider'

describe('createCoeditProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('remote update를 적용해 Y.Text 상태를 동기화한다', async () => {
    const remoteDoc = new Y.Doc()
    remoteDoc.getText('memo').insert(0, '원격 메모')
    const update = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))

    const postUpdate = vi.fn()
    const provider = await createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate,
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    provider.applyRemoteUpdate(update)

    expect(provider.text.toString()).toBe('원격 메모')
    // echo 루프 방지(리뷰 FE B-3): REMOTE_ORIGIN 으로 적용된 remote update 는 다시 POST 되지 않는다.
    // (debounce 150ms 경과 후에도 미호출 — REMOTE_ORIGIN 분기 삭제 시 이 단언이 회귀 검출)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(postUpdate).not.toHaveBeenCalled()
    provider.destroy()
  })

  it('서로 다른 Y.Doc 동시 편집 update가 같은 텍스트로 수렴한다', () => {
    const left = new Y.Doc()
    const right = new Y.Doc()
    const leftText = left.getText('memo')
    const rightText = right.getText('memo')

    leftText.insert(0, 'A')
    rightText.insert(0, 'B')

    Y.applyUpdate(left, Y.encodeStateAsUpdate(right))
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left))

    expect(leftText.toString()).toBe(rightText.toString())
    expect(leftText.toString()).toContain('A')
    expect(leftText.toString()).toContain('B')
  })

  it('awareness remote cursor는 displayName과 color만 노출한다', async () => {
    const remoteDoc = new Y.Doc()
    const remoteAwareness = new Awareness(remoteDoc)
    remoteAwareness.setLocalState({
      user: { displayName: '원격 사용자', color: '#2563EB' },
      cursor: { fieldName: 'memo', anchor: 1, head: 3 },
    })
    const awarenessUpdate = encodeBase64Update(
      encodeAwarenessUpdate(remoteAwareness, [remoteDoc.clientID]),
    )

    const provider = await createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    provider.applyRemoteAwareness(awarenessUpdate)

    expect(provider.getRemoteCursors()).toEqual([
      {
        clientId: remoteDoc.clientID,
        displayName: '원격 사용자',
        color: '#2563EB',
        anchor: 1,
        head: 3,
      },
    ])
    expect(provider.getRemoteCursors()[0]).not.toHaveProperty('userId')
    expect(provider.getRemoteCursors()[0]).not.toHaveProperty('sessionId')
    provider.destroy()
  })

  it('awareness remote edit는 최근 편집만 필터링하고 본인과 만료 편집을 제외한다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-30T03:00:00.000Z'))
    const remoteDoc = new Y.Doc()
    const remoteAwareness = new Awareness(remoteDoc)
    remoteAwareness.setLocalState({
      user: { displayName: '원격 사용자', color: '#2563EB' },
      lastEdit: { fieldPath: 'memo', ts: Date.now() },
    })
    const awarenessUpdate = encodeBase64Update(
      encodeAwarenessUpdate(remoteAwareness, [remoteDoc.clientID]),
    )

    const provider = await createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    provider.setLocalLastEdit('memo')
    provider.applyRemoteAwareness(awarenessUpdate)

    expect(provider.getRemoteEdits('memo', Date.now() + 100)).toEqual([
      {
        clientId: remoteDoc.clientID,
        displayName: '원격 사용자',
        color: '#2563EB',
        fieldPath: 'memo',
        ts: Date.now(),
      },
    ])
    expect(provider.getRemoteEdits('other', Date.now() + 100)).toEqual([])
    expect(provider.getRemoteEdits('memo', Date.now() + 2_500)).toEqual([])
    expect(provider.getRemoteEdits('memo')).not.toContainEqual(expect.objectContaining({
      clientId: provider.awareness.clientID,
    }))
    provider.destroy()
  })

  it('base64 update 변환은 Uint8Array를 보존한다', () => {
    const update = new Uint8Array([1, 2, 3, 250])
    expect(Array.from(decodeBase64Update(encodeBase64Update(update)))).toEqual(Array.from(update))
  })

  it('initialUpdates의 손상 update를 건너뛰고 정상 Y.Text update를 계속 적용한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const remoteDoc = new Y.Doc()
    const remoteText = remoteDoc.getText('memo')
    remoteText.insert(0, '정상1')
    const firstUpdate = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))
    remoteText.insert(remoteText.length, '정상2')
    const secondUpdate = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))

    const provider = await createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => ({ updates: [firstUpdate, 'dGVzdA==', secondUpdate] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    expect(provider.text.toString()).toBe('정상1정상2')
    expect(warn).toHaveBeenCalledWith('[coedit] corrupt coedit update 건너뜀', expect.any(Error))
    provider.destroy()
    warn.mockRestore()
  })

  it('SSE coedit:update의 손상 update를 건너뛰고 이후 정상 Y.Text update를 적용한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let emit: Parameters<NonNullable<Parameters<typeof createCoeditProvider>[0]['subscribe']>>[1] | undefined
    const remoteDoc = new Y.Doc()
    remoteDoc.getText('memo').insert(0, 'SSE 정상')
    const validUpdate = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))

    const provider = await createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: (_documentId, onEvent) => {
        emit = onEvent
        return { abort: vi.fn() }
      },
    })

    expect(() => emit?.({ event: 'coedit:update', data: { update: 'dGVzdA==' }, raw: '' })).not.toThrow()
    expect(provider.text.toString()).toBe('')

    emit?.({ event: 'coedit:update', data: { update: validUpdate }, raw: '' })

    expect(provider.text.toString()).toBe('SSE 정상')
    expect(warn).toHaveBeenCalledWith('[coedit] corrupt coedit update 건너뜀', expect.any(Error))
    provider.destroy()
    warn.mockRestore()
  })

  it('corrupt awareness를 SSE와 applyRemoteAwareness에서 건너뛰고 이후 정상 update를 적용한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let emit: Parameters<NonNullable<Parameters<typeof createCoeditProvider>[0]['subscribe']>>[1] | undefined
    const remoteDoc = new Y.Doc()
    remoteDoc.getText('memo').insert(0, 'after corrupt awareness')
    const validUpdate = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))
    const remoteAwareness = new Awareness(remoteDoc)
    remoteAwareness.setLocalState({
      user: { displayName: '원격 사용자', color: '#2563EB' },
      cursor: { fieldName: 'memo', anchor: 1, head: 4 },
    })
    const validAwareness = encodeBase64Update(
      encodeAwarenessUpdate(remoteAwareness, [remoteDoc.clientID]),
    )
    const partialCorruptAwarenessBytes = decodeBase64Update(validAwareness)
    partialCorruptAwarenessBytes[0] = 2
    const partialCorruptAwareness = encodeBase64Update(partialCorruptAwarenessBytes)

    const provider = await createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: (_documentId, onEvent) => {
        emit = onEvent
        return { abort: vi.fn() }
      },
    })

    expect(() => emit?.({
      event: 'coedit:awareness',
      data: { awareness: 'not-a-yjs-awareness-payload' },
      raw: '',
    })).not.toThrow()
    expect(() => provider.applyRemoteAwareness(partialCorruptAwareness)).not.toThrow()
    expect(provider.getRemoteCursors()).toEqual([])

    provider.applyRemoteAwareness(validAwareness)
    emit?.({ event: 'coedit:update', data: { update: validUpdate }, raw: '' })

    expect(provider.getRemoteCursors()).toEqual([{
      clientId: remoteDoc.clientID,
      displayName: '원격 사용자',
      color: '#2563EB',
      anchor: 1,
      head: 4,
    }])
    expect(provider.text.toString()).toBe('after corrupt awareness')
    expect(warn).toHaveBeenCalledWith('[coedit] corrupt coedit awareness 건너뜀', expect.any(Error))
    expect(warn).toHaveBeenCalledTimes(2)
    provider.destroy()
    warn.mockRestore()
  })

  it('applyRemoteUpdate의 손상 update를 건너뛰고 상태 부분변이 없이 이후 정상 Y.Text update를 적용한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const seedDoc = new Y.Doc()
    seedDoc.getText('memo').insert(0, '시드')
    const seedUpdate = encodeBase64Update(Y.encodeStateAsUpdate(seedDoc))
    // remoteDoc 을 seed 상태에서 fork 후 append — 독립 Y.Doc 2개가 위치0에 각각 insert 하면
    // 병합 순서가 clientID 의존이라 '시드시드 이후'/'시드 이후시드' 로 비결정(=flaky). seed 를 apply 후
    // 이어붙이면 결정적으로 '시드 이후'.
    const remoteDoc = new Y.Doc()
    Y.applyUpdate(remoteDoc, decodeBase64Update(seedUpdate))
    remoteDoc.getText('memo').insert(2, ' 이후')
    const validUpdate = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))

    const provider = await createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => ({ updates: [seedUpdate] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })
    const beforeCorruptState = provider.text.toString()

    expect(() => provider.applyRemoteUpdate('dGVzdA==')).not.toThrow()

    expect(provider.text.toString()).toBe(beforeCorruptState)
    provider.applyRemoteUpdate(validUpdate)
    expect(provider.text.toString()).toBe('시드 이후')
    expect(warn).toHaveBeenCalledWith('[coedit] corrupt coedit update 건너뜀', expect.any(Error))
    provider.destroy()
    warn.mockRestore()
  })

  it('resyncs snapshot updates missed between initial load and SSE delivery', async () => {
    vi.useFakeTimers()
    const remoteDoc = new Y.Doc()
    remoteDoc.getText('memo').insert(0, 'remote during reconnect')
    const update = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))
    let reads = 0

    const provider = await createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => {
        reads += 1
        return { updates: reads === 1 ? [] : [update] }
      },
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    expect(provider.text.toString()).toBe('')

    await vi.advanceTimersByTimeAsync(5_000)

    expect(provider.text.toString()).toBe('remote during reconnect')
    provider.destroy()
  })

  it('retries a failed local update post without dropping the Yjs update', async () => {
    vi.useFakeTimers()
    const postUpdate = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)

    const provider = await createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate,
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    provider.text.insert(0, 'local')
    await vi.advanceTimersByTimeAsync(150)
    expect(postUpdate).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(150)

    expect(postUpdate).toHaveBeenCalledTimes(2)
    const resentDoc = new Y.Doc()
    Y.applyUpdate(resentDoc, decodeBase64Update(postUpdate.mock.calls[1][1]))
    expect(resentDoc.getText('memo').toString()).toBe('local')
    provider.destroy()
  })

  it('local update override에는 documentId를 전달한다', async () => {
    vi.useFakeTimers()
    const postUpdate = vi.fn()

    const provider = await createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate,
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    provider.text.insert(0, 'local')
    await vi.advanceTimersByTimeAsync(150)

    expect(postUpdate).toHaveBeenCalledWith('doc-1', expect.any(String))
    provider.destroy()
  })

  it('cleans up stream and pending awareness when initial snapshot load fails', async () => {
    vi.useFakeTimers()
    const abort = vi.fn()
    const postAwareness = vi.fn()

    await expect(createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => {
        throw new Error('offline')
      },
      postUpdate: vi.fn(),
      postAwareness,
      subscribe: () => ({ abort }),
    })).rejects.toThrow('offline')

    expect(abort).toHaveBeenCalledTimes(1)
    await vi.runOnlyPendingTimersAsync()
    expect(postAwareness).not.toHaveBeenCalled()
  })

  it('does not schedule awareness removal posts after destroy', async () => {
    vi.useFakeTimers()
    const postAwareness = vi.fn()

    const provider = await createCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      fieldName: 'memo',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness,
      subscribe: () => ({ abort: vi.fn() }),
    })

    provider.destroy()

    expect(postAwareness).toHaveBeenCalledTimes(1)
    await vi.runOnlyPendingTimersAsync()
    expect(postAwareness).toHaveBeenCalledTimes(1)
  })
})

describe('createDocCoeditProvider', () => {
  it('header Y.Map 과 items Y.Array 문서 모델 update가 두 Y.Doc 사이에서 수렴한다', async () => {
    const base = new Y.Doc()
    base.getArray<Y.Map<unknown>>('items').push([new Y.Map<unknown>()])
    const baseUpdate = encodeBase64Update(Y.encodeStateAsUpdate(base))
    const left = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      headerTextFields: new Set(['memo']),
      initialUpdates: async () => ({ updates: [baseUpdate] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })
    const right = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      headerTextFields: new Set(['memo']),
      initialUpdates: async () => ({ updates: [baseUpdate] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    left.setHeaderValue('partnerName', '삼한공조')
    left.setItemValue(0, 'productName', '실외기')
    right.setHeaderValue('memo', '오전 배송')
    right.setItemValue(0, 'quantity', '3')

    right.applyRemoteUpdate(encodeBase64Update(Y.encodeStateAsUpdate(left.doc)))
    left.applyRemoteUpdate(encodeBase64Update(Y.encodeStateAsUpdate(right.doc)))

    expect(left.getHeaderValue('partnerName')).toBe('삼한공조')
    expect(right.getHeaderValue('partnerName')).toBe('삼한공조')
    expect(left.getHeaderValue('memo')).toBe('오전 배송')
    expect(left.header.get('memo')).toBeInstanceOf(Y.Text)
    expect(right.getItemValue(0, 'productName')).toBe('실외기')
    expect(left.getItemValue(0, 'quantity')).toBe('3')

    left.destroy()
    right.destroy()
  })

  it('two coedit consumers converge on specification value and provenance clear', async () => {
    const base = new Y.Doc()
    base.getArray<Y.Map<unknown>>('items').push([new Y.Map<unknown>()])
    const baseUpdate = encodeBase64Update(Y.encodeStateAsUpdate(base))
    const options = {
      documentId: 'estimate-spec-provenance',
      basePath: '/slips/estimate-spec-provenance',
      headerTextFields: new Set<string>(),
      initialUpdates: async () => ({ updates: [baseUpdate] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    }
    const left = await createDocCoeditProvider(options)
    const right = await createDocCoeditProvider(options)

    left.setItemValue(0, 'specification', '4HP')
    left.setItemValue(0, 'specificationSource', 'CATALOG')
    right.applyRemoteUpdate(encodeBase64Update(Y.encodeStateAsUpdate(left.doc)))
    expect(right.getItemValue(0, 'specification')).toBe('4HP')
    expect(right.getItemValue(0, 'specificationSource')).toBe('CATALOG')

    right.setItemValue(0, 'specification', '')
    right.setItemValue(0, 'specificationSource', '')
    left.applyRemoteUpdate(encodeBase64Update(Y.encodeStateAsUpdate(right.doc)))
    expect(left.getItemValue(0, 'specification')).toBe('')
    expect(left.getItemValue(0, 'specificationSource')).toBe('')

    left.destroy()
    right.destroy()
  })

  it('awareness cursor를 fieldPath 단위로 필터링하고 내부 식별자는 반환하지 않는다', async () => {
    const remoteDoc = new Y.Doc()
    const remoteAwareness = new Awareness(remoteDoc)
    remoteAwareness.setLocalState({
      user: { displayName: '김영업', color: '#2563EB' },
      cursor: { fieldPath: 'items.0.quantity', anchor: 0, head: 1 },
    })
    const awarenessUpdate = encodeBase64Update(
      encodeAwarenessUpdate(remoteAwareness, [remoteDoc.clientID]),
    )

    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    provider.applyRemoteAwareness(awarenessUpdate)

    expect(provider.getRemoteCursors('items.0.quantity')).toEqual([
      {
        clientId: remoteDoc.clientID,
        displayName: '김영업',
        color: '#2563EB',
        fieldPath: 'items.0.quantity',
        anchor: 0,
        head: 1,
      },
    ])
    expect(provider.getRemoteCursors('header.memo')).toEqual([])
    expect(provider.getRemoteCursors('items.0.quantity')[0]).not.toHaveProperty('sessionId')
    provider.destroy()
  })

  it('awareness lastEdit를 fieldPath 단위로 필터링하고 본인·만료 편집을 제외한다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-30T03:00:00.000Z'))
    const left = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })
    const right = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    left.setLocalLastEdit('header.memo')
    const editTs = Date.now()
    right.applyRemoteAwareness(encodeBase64Update(
      encodeAwarenessUpdate(left.awareness, [left.doc.clientID]),
    ))

    expect(right.getRemoteEdits('header.memo', editTs + 100)).toEqual([
      {
        clientId: left.doc.clientID,
        displayName: '사용자',
        color: expect.any(String),
        fieldPath: 'header.memo',
        ts: editTs,
      },
    ])
    expect(right.getRemoteEdits('items.0.quantity', editTs + 100)).toEqual([])
    expect(right.getRemoteEdits('header.memo', editTs + 2_500)).toEqual([])
    expect(left.getRemoteEdits('header.memo', editTs + 100)).toEqual([])

    left.destroy()
    right.destroy()
  })

  it('headerTextFields에 포함되지 않은 header 필드는 scalar로 저장한다', async () => {
    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      headerTextFields: new Set(['memo']),
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    provider.setHeaderValue('memo', '긴 메모')
    provider.setHeaderValue('partnerName', '삼한공조')

    expect(provider.header.get('memo')).toBeInstanceOf(Y.Text)
    expect(provider.header.get('partnerName')).toBe('삼한공조')
    provider.destroy()
  })

  it('initialUpdates의 손상 update를 건너뛰고 정상 문서 update를 계속 적용한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const remoteDoc = new Y.Doc()
    remoteDoc.getMap<unknown>('header').set('partnerName', '삼한공조')
    const firstUpdate = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))
    const item = new Y.Map<unknown>()
    item.set('productName', '실외기')
    remoteDoc.getArray<Y.Map<unknown>>('items').push([item])
    const secondUpdate = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))

    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [firstUpdate, 'dGVzdA==', secondUpdate] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    expect(provider.getHeaderValue('partnerName')).toBe('삼한공조')
    expect(provider.getItemValue(0, 'productName')).toBe('실외기')
    expect(warn).toHaveBeenCalledWith('[doc-coedit] corrupt coedit update 건너뜀', expect.any(Error))
    provider.destroy()
    warn.mockRestore()
  })

  it('SSE coedit:update의 손상 update를 건너뛰고 이후 정상 문서 update를 적용한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let emit: Parameters<NonNullable<Parameters<typeof createDocCoeditProvider>[0]['subscribe']>>[1] | undefined
    const remoteDoc = new Y.Doc()
    remoteDoc.getMap<unknown>('header').set('partnerName', 'SSE 거래처')
    const item = new Y.Map<unknown>()
    item.set('productName', 'SSE 품목')
    remoteDoc.getArray<Y.Map<unknown>>('items').push([item])
    const validUpdate = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))

    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: (_documentId, onEvent) => {
        emit = onEvent
        return { abort: vi.fn() }
      },
    })

    expect(() => emit?.({ event: 'coedit:update', data: { update: 'dGVzdA==' }, raw: '' })).not.toThrow()
    expect(provider.getHeaderValue('partnerName')).toBe('')
    expect(provider.items.length).toBe(0)

    emit?.({ event: 'coedit:update', data: { update: validUpdate }, raw: '' })

    expect(provider.getHeaderValue('partnerName')).toBe('SSE 거래처')
    expect(provider.getItemValue(0, 'productName')).toBe('SSE 품목')
    expect(warn).toHaveBeenCalledWith('[doc-coedit] corrupt coedit update 건너뜀', expect.any(Error))
    provider.destroy()
    warn.mockRestore()
  })

  it('doc corrupt awareness를 SSE와 applyRemoteAwareness에서 건너뛰고 이후 정상 update를 적용한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let emit: Parameters<NonNullable<Parameters<typeof createDocCoeditProvider>[0]['subscribe']>>[1] | undefined
    const remoteDoc = new Y.Doc()
    remoteDoc.getMap<unknown>('header').set('partnerName', 'after corrupt awareness')
    const validUpdate = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))
    const remoteAwareness = new Awareness(remoteDoc)
    remoteAwareness.setLocalState({
      user: { displayName: '원격 사용자', color: '#2563EB' },
      cursor: { fieldPath: 'header.partnerName', anchor: 2, head: 5 },
    })
    const validAwareness = encodeBase64Update(
      encodeAwarenessUpdate(remoteAwareness, [remoteDoc.clientID]),
    )
    const partialCorruptAwarenessBytes = decodeBase64Update(validAwareness)
    partialCorruptAwarenessBytes[0] = 2
    const partialCorruptAwareness = encodeBase64Update(partialCorruptAwarenessBytes)

    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: (_documentId, onEvent) => {
        emit = onEvent
        return { abort: vi.fn() }
      },
    })

    expect(() => emit?.({
      event: 'coedit:awareness',
      data: { awareness: 'not-a-yjs-awareness-payload' },
      raw: '',
    })).not.toThrow()
    expect(() => provider.applyRemoteAwareness(partialCorruptAwareness)).not.toThrow()
    expect(provider.getRemoteCursors('header.partnerName')).toEqual([])

    provider.applyRemoteAwareness(validAwareness)
    emit?.({ event: 'coedit:update', data: { update: validUpdate }, raw: '' })

    expect(provider.getRemoteCursors('header.partnerName')).toEqual([{
      clientId: remoteDoc.clientID,
      displayName: '원격 사용자',
      color: '#2563EB',
      fieldPath: 'header.partnerName',
      anchor: 2,
      head: 5,
    }])
    expect(provider.getHeaderValue('partnerName')).toBe('after corrupt awareness')
    expect(warn).toHaveBeenCalledWith('[doc-coedit] corrupt coedit awareness 건너뜀', expect.any(Error))
    expect(warn).toHaveBeenCalledTimes(2)
    provider.destroy()
    warn.mockRestore()
  })

  it('applyRemoteUpdate의 손상 update를 건너뛰고 상태 부분변이 없이 이후 정상 문서 update를 적용한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const seedDoc = new Y.Doc()
    seedDoc.getMap<unknown>('header').set('partnerName', '시드 거래처')
    const seedUpdate = encodeBase64Update(Y.encodeStateAsUpdate(seedDoc))
    const remoteDoc = new Y.Doc()
    remoteDoc.getMap<unknown>('header').set('memo', '정상 메모')
    const item = new Y.Map<unknown>()
    item.set('productName', '정상 품목')
    remoteDoc.getArray<Y.Map<unknown>>('items').push([item])
    const validUpdate = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))

    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [seedUpdate] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })
    const beforeCorruptHeader = provider.getHeaderValue('partnerName')
    const beforeCorruptItemCount = provider.items.length

    expect(() => provider.applyRemoteUpdate('dGVzdA==')).not.toThrow()

    expect(provider.getHeaderValue('partnerName')).toBe(beforeCorruptHeader)
    expect(provider.items.length).toBe(beforeCorruptItemCount)
    provider.applyRemoteUpdate(validUpdate)
    expect(provider.getHeaderValue('partnerName')).toBe('시드 거래처')
    expect(provider.getHeaderValue('memo')).toBe('정상 메모')
    expect(provider.getItemValue(0, 'productName')).toBe('정상 품목')
    expect(warn).toHaveBeenCalledWith('[doc-coedit] corrupt coedit update 건너뜀', expect.any(Error))
    provider.destroy()
    warn.mockRestore()
  })
})
describe('createDocCoeditProvider lineId APIs', () => {
  it('adds an item with a stable lineId and stringifies seed cells', async () => {
    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    const lineId = provider.addItem({ productName: 'paper', quantity: 3, nullable: null })

    expect(lineId).toBeTruthy()
    expect(provider.items.length).toBe(1)
    expect(provider.getItemIndexById(lineId)).toBe(0)
    expect(provider.getItemValueById(lineId, 'productName')).toBe('paper')
    expect(provider.getItemValueById(lineId, 'quantity')).toBe('3')
    expect(provider.getItemValueById(lineId, 'nullable')).toBe('')
    expect(provider.getItemValueById(lineId, 'lineId')).toBe(lineId)
    provider.destroy()
  })

  it('reads and writes line cells by lineId and no-ops missing lineIds', async () => {
    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })
    const lineId = provider.addItem({ quantity: 1 })

    provider.setItemValueById(lineId, 'quantity', '5')
    provider.setItemValueById('missing-line', 'quantity', '9')

    expect(provider.getItemValueById(lineId, 'quantity')).toBe('5')
    expect(provider.getItemValueById('missing-line', 'quantity')).toBe('')
    expect(provider.items.length).toBe(1)
    provider.destroy()
  })

  it('removes items by lineId and treats missing lineIds as idempotent no-ops', async () => {
    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })
    const first = provider.addItem({ productName: 'A' })
    const second = provider.addItem({ productName: 'B' })

    provider.removeItem(first)
    provider.removeItem('missing-line')

    expect(provider.items.length).toBe(1)
    expect(provider.getItemIndexById(first)).toBe(-1)
    expect(provider.getItemIndexById(second)).toBe(0)
    expect(provider.getItemValueById(second, 'productName')).toBe('B')
    provider.destroy()
  })

  it('replaceItems preserves seeded lineIds, generates missing lineIds, and keeps index APIs unchanged', async () => {
    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })

    provider.replaceItems([
      { lineId: 'seed-line-1', productName: 'A', quantity: 1 },
      { productName: 'B', quantity: 2 },
      { lineId: '', productName: 'C', quantity: 3 },
    ])

    const generatedSecond = provider.items.get(1).get('lineId')
    const generatedThird = provider.items.get(2).get('lineId')
    expect(provider.items.length).toBe(3)
    expect(provider.getItemIndexById('seed-line-1')).toBe(0)
    expect(provider.getItemValueById('seed-line-1', 'productName')).toBe('A')
    expect(typeof generatedSecond).toBe('string')
    expect(generatedSecond).not.toBe('')
    expect(typeof generatedThird).toBe('string')
    expect(generatedThird).not.toBe('')
    expect(provider.getItemValue(0, 'productName')).toBe('A')
    expect(provider.getItemValue(1, 'quantity')).toBe('2')
    provider.setItemValue(1, 'quantity', '7')
    expect(provider.getItemValue(1, 'quantity')).toBe('7')
    provider.destroy()
  })

  it('treats empty lineId as no match — never touches legacy lineId-less rows', async () => {
    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })
    // lineId 미보유 legacy row 모사(replaceItems 는 lineId 를 자동부여하므로 직접 push).
    const legacy = new Y.Map<unknown>()
    legacy.set('productName', 'LEGACY')
    provider.items.push([legacy])

    expect(provider.getItemIndexById('')).toBe(-1)
    expect(provider.getItemValueById('', 'productName')).toBe('')
    provider.setItemValueById('', 'productName', 'HACKED')
    provider.removeItem('')

    expect(provider.items.length).toBe(1)
    expect(provider.items.get(0).get('productName')).toBe('LEGACY')
    provider.destroy()
  })

  it('addItem ignores a caller-supplied lineId in seed and assigns a generated one', async () => {
    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })
    const lineId = provider.addItem({ lineId: 'manual-override', productName: 'X' })

    expect(lineId).not.toBe('manual-override')
    expect(provider.getItemIndexById('manual-override')).toBe(-1)
    expect(provider.getItemIndexById(lineId)).toBe(0)
    expect(provider.getItemValueById(lineId, 'productName')).toBe('X')
    provider.destroy()
  })

  it('removeItem is idempotent on an already-removed lineId (no negative length)', async () => {
    const provider = await createDocCoeditProvider({
      documentId: 'doc-1',
      basePath: '/slips/doc-1',
      initialUpdates: async () => ({ updates: [] }),
      postUpdate: vi.fn(),
      postAwareness: vi.fn(),
      subscribe: () => ({ abort: vi.fn() }),
    })
    const lineId = provider.addItem({ productName: 'A' })

    provider.removeItem(lineId)
    provider.removeItem(lineId)

    expect(provider.items.length).toBe(0)
    expect(provider.getItemIndexById(lineId)).toBe(-1)
    provider.destroy()
  })
})
