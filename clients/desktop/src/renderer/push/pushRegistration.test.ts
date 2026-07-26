// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushZeroDelayTasks } from '../test-utils/flush'

let nativePlatform = true

const registerPushToken = vi.fn()
const deletePushToken = vi.fn()

type ListenerCallback = (payload: unknown) => void | Promise<void>
const listeners: Record<string, ListenerCallback[]> = {}

const PushNotifications = {
  requestPermissions: vi.fn(),
  register: vi.fn(),
  addListener: vi.fn((eventName: string, callback: ListenerCallback) => {
    listeners[eventName] = listeners[eventName] ?? []
    listeners[eventName].push(callback)
    return Promise.resolve({
      remove: vi.fn(async () => {
        listeners[eventName] = (listeners[eventName] ?? []).filter((item) => item !== callback)
      }),
    })
  }),
}

const Capacitor = {
  getPlatform: vi.fn(),
}

vi.mock('../auth/authProvider', () => ({
  get isCapacitorPlatform() {
    return nativePlatform
  },
}))

vi.mock('../api/pushTokens', () => ({
  registerPushToken,
  deletePushToken,
}))

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor,
}))

async function importPushRegistration() {
  const mod = await import('./pushRegistration')
  return mod
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('pushRegistration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    nativePlatform = true
    Object.keys(listeners).forEach((key) => {
      delete listeners[key]
    })
    PushNotifications.requestPermissions.mockResolvedValue({ receive: 'granted' })
    PushNotifications.register.mockResolvedValue(undefined)
    Capacitor.getPlatform.mockReturnValue('ios')
    window.location.hash = '#/'
  })

  it('권한이 denied 이면 네이티브 register 와 POST를 실행하지 않는다', async () => {
    PushNotifications.requestPermissions.mockResolvedValueOnce({ receive: 'denied' })
    const { registerPush } = await importPushRegistration()

    await registerPush()

    expect(PushNotifications.register).not.toHaveBeenCalled()
    expect(registerPushToken).not.toHaveBeenCalled()
  })

  it('권한이 denied 이면 인앱 안내 이벤트를 발행한다', async () => {
    PushNotifications.requestPermissions.mockResolvedValueOnce({ receive: 'denied' })
    const denied = vi.fn()
    window.addEventListener('samhan:push-permission-denied', denied)
    const { registerPush } = await importPushRegistration()

    await registerPush()

    expect(denied).toHaveBeenCalledTimes(1)
    expect((denied.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({
      message: '푸시 알림 권한이 거부되었습니다. 기기 설정에서 허용해 주세요.',
    })
    window.removeEventListener('samhan:push-permission-denied', denied)
  })

  it('권한 granted 후 registration 토큰을 N3a API에 등록한다', async () => {
    const { registerPush } = await importPushRegistration()

    await registerPush()
    await listeners['registration']?.[0]?.({ value: 'fcm-ios-token' })

    expect(PushNotifications.requestPermissions).toHaveBeenCalledTimes(1)
    expect(PushNotifications.register).toHaveBeenCalledTimes(1)
    expect(registerPushToken).toHaveBeenCalledWith({
      token: 'fcm-ios-token',
      platform: 'IOS',
      appClient: 'DESKTOP_NATIVE',
    })
  })

  it('unregisterPush 는 등록된 토큰을 DELETE 한다', async () => {
    const { unregisterPush } = await importPushRegistration()

    await unregisterPush('fcm-token-logout')

    expect(deletePushToken).toHaveBeenCalledWith('fcm-token-logout')
  })

  it('pushNotificationActionPerformed 수신 시 deeplink 를 HashRouter 경로로 이동한다', async () => {
    const { registerPush } = await importPushRegistration()

    await registerPush()
    listeners['pushNotificationActionPerformed']?.[0]?.({
      notification: {
        data: {
          deeplink: '/notifications/center',
        },
      },
    })

    expect(window.location.hash).toBe('#/notifications/center')
  })

  it('비-Capacitor 런타임에서는 푸시 플러그인을 호출하지 않는다', async () => {
    nativePlatform = false
    const { registerPush, unregisterPush } = await importPushRegistration()

    await registerPush()
    await unregisterPush('ignored-token')

    expect(PushNotifications.requestPermissions).not.toHaveBeenCalled()
    expect(PushNotifications.register).not.toHaveBeenCalled()
    expect(deletePushToken).not.toHaveBeenCalled()
  })

  it('ignores external URL deeplinks', async () => {
    const { registerPush } = await importPushRegistration()

    await registerPush()
    listeners['pushNotificationActionPerformed']?.[0]?.({
      notification: {
        data: {
          deeplink: 'https://example.com/notifications/center',
        },
      },
    })

    expect(window.location.hash).toBe('#/')
  })

  it('dispatches a CustomEvent for foreground push notifications', async () => {
    const { registerPush } = await importPushRegistration()
    const received = vi.fn()
    window.addEventListener('samhan:push-notification-received', received)

    await registerPush()
    listeners['pushNotificationReceived']?.[0]?.({
      title: 'notice',
      body: 'body',
    })

    expect(received).toHaveBeenCalledTimes(1)
    expect((received.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({
      title: 'notice',
      body: 'body',
    })
    window.removeEventListener('samhan:push-notification-received', received)
  })

  it('removePushListeners removes registration listeners', async () => {
    const { registerPush, removePushListeners } = await importPushRegistration()

    await registerPush()
    expect(listeners['registration']).toHaveLength(1)

    await removePushListeners()
    await listeners['registration']?.[0]?.({ value: 'removed-token' })

    expect(listeners['registration'] ?? []).toHaveLength(0)
    expect(registerPushToken).not.toHaveBeenCalled()
  })

  it('unregisterPush removes listeners so late registration events do not POST', async () => {
    const { registerPush, unregisterPush } = await importPushRegistration()

    await registerPush()
    await unregisterPush('logout-token')
    await listeners['registration']?.[0]?.({ value: 'late-token' })

    expect(deletePushToken).toHaveBeenCalledWith('logout-token')
    expect(registerPushToken).not.toHaveBeenCalled()
  })

  it('unregisterPush ignores queued registration callbacks after logout', async () => {
    const { registerPush, unregisterPush } = await importPushRegistration()

    await registerPush()
    const registrationCallback = listeners['registration']?.[0]
    await unregisterPush('logout-token')
    await registrationCallback?.({ value: 'queued-token' })

    expect(deletePushToken).toHaveBeenCalledWith('logout-token')
    expect(registerPushToken).not.toHaveBeenCalled()
  })

  it('unregisterPush waits for in-flight registration POST before authenticated DELETE', async () => {
    const registrationPost = createDeferred<void>()
    registerPushToken.mockReturnValueOnce(registrationPost.promise)
    const { registerPush, unregisterPush } = await importPushRegistration()

    await registerPush()
    const registrationCallback = listeners['registration']?.[0]
    const registration = registrationCallback?.({ value: 'in-flight-token' })

    expect(registerPushToken).toHaveBeenCalledWith({
      token: 'in-flight-token',
      platform: 'IOS',
      appClient: 'DESKTOP_NATIVE',
    })

    const unregister = unregisterPush().then(() => 'unregistered')
    const beforePostDone = await Promise.race([
      unregister,
      flushZeroDelayTasks().then(() => 'pending'),
    ])

    expect(beforePostDone).toBe('pending')
    expect(deletePushToken).not.toHaveBeenCalled()

    registrationPost.resolve()
    await registration
    await expect(unregister).resolves.toBe('unregistered')

    expect(deletePushToken).toHaveBeenCalledTimes(1)
    expect(deletePushToken).toHaveBeenCalledWith('in-flight-token')
    expect(deletePushToken.mock.invocationCallOrder[0]).toBeGreaterThan(
      registerPushToken.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('unregisterPush deletes attempted token after registration POST rejects', async () => {
    registerPushToken.mockRejectedValueOnce(new Error('timeout after server commit'))
    const { registerPush, unregisterPush } = await importPushRegistration()

    await registerPush()
    await listeners['registration']?.[0]?.({ value: 'reject-but-committed-token' })
    await unregisterPush()

    expect(deletePushToken).toHaveBeenCalledTimes(1)
    expect(deletePushToken).toHaveBeenCalledWith('reject-but-committed-token')
  })

  it('unregisterPush aborts an in-flight registerPush before listeners are attached', async () => {
    const permission = createDeferred<{ receive: 'granted' }>()
    PushNotifications.requestPermissions.mockReturnValueOnce(permission.promise)
    const { registerPush, unregisterPush } = await importPushRegistration()

    const registration = registerPush()
    await unregisterPush('logout-token')
    permission.resolve({ receive: 'granted' })
    await registration
    await listeners['registration']?.[0]?.({ value: 'late-token' })

    expect(deletePushToken).toHaveBeenCalledWith('logout-token')
    expect(PushNotifications.addListener).not.toHaveBeenCalled()
    expect(PushNotifications.register).not.toHaveBeenCalled()
    expect(listeners['registration'] ?? []).toHaveLength(0)
    expect(registerPushToken).not.toHaveBeenCalled()
  })

  it('does not attach duplicate listeners after repeated registration', async () => {
    const { registerPush } = await importPushRegistration()

    await registerPush()
    await registerPush()

    expect(PushNotifications.addListener).toHaveBeenCalledTimes(3)
    expect(listeners['registration']).toHaveLength(1)
    expect(listeners['pushNotificationReceived']).toHaveLength(1)
    expect(listeners['pushNotificationActionPerformed']).toHaveLength(1)
  })

  it('deduplicates concurrent registerPush calls with one in-flight request', async () => {
    const { registerPush } = await importPushRegistration()

    await Promise.all([registerPush(), registerPush()])

    expect(PushNotifications.requestPermissions).toHaveBeenCalledTimes(1)
    expect(PushNotifications.register).toHaveBeenCalledTimes(1)
    expect(PushNotifications.addListener).toHaveBeenCalledTimes(3)
  })
})
