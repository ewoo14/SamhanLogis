// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
})
