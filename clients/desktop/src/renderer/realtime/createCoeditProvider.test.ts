import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { encodeAwarenessUpdate } from 'y-protocols/awareness'
import { createCoeditProvider, decodeBase64Update, encodeBase64Update } from './createCoeditProvider'

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
      slipId: 'slip-1',
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
      slipId: 'slip-1',
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

  it('base64 update 변환은 Uint8Array를 보존한다', () => {
    const update = new Uint8Array([1, 2, 3, 250])
    expect(Array.from(decodeBase64Update(encodeBase64Update(update)))).toEqual(Array.from(update))
  })
  it('resyncs snapshot updates missed between initial load and SSE delivery', async () => {
    vi.useFakeTimers()
    const remoteDoc = new Y.Doc()
    remoteDoc.getText('memo').insert(0, 'remote during reconnect')
    const update = encodeBase64Update(Y.encodeStateAsUpdate(remoteDoc))
    let reads = 0

    const provider = await createCoeditProvider({
      slipId: 'slip-1',
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
      slipId: 'slip-1',
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

  it('cleans up stream and pending awareness when initial snapshot load fails', async () => {
    vi.useFakeTimers()
    const abort = vi.fn()
    const postAwareness = vi.fn()

    await expect(createCoeditProvider({
      slipId: 'slip-1',
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
      slipId: 'slip-1',
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
