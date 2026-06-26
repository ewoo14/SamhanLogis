import { isCapacitorPlatform } from '../auth/authProvider'
import {
  deletePushToken,
  registerPushToken,
  type PushDevicePlatform,
} from '../api/pushTokens'
import type { PushNotificationsPlugin } from '@capacitor/push-notifications'

const APP_CLIENT = 'DESKTOP_NATIVE'

interface PluginListenerHandle {
  remove: () => Promise<void>
}

interface CapacitorBridge {
  getPlatform: () => string
}

let listenerHandles: PluginListenerHandle[] = []
let lastRegisteredToken: string | null = null
let registerInFlight: Promise<void> | null = null
let registrationEpoch = 0

async function loadPushRuntime(): Promise<{
  PushNotifications: PushNotificationsPlugin
  Capacitor: CapacitorBridge
} | null> {
  if (!isCapacitorPlatform) return null

  try {
    const [pushModule, coreModule] = await Promise.all([
      import('@capacitor/push-notifications'),
      import('@capacitor/core'),
    ])
    return {
      PushNotifications: pushModule.PushNotifications,
      Capacitor: coreModule.Capacitor,
    }
  } catch (error) {
    console.warn('[push] native plugin load failed', error)
    return null
  }
}

function toPushDevicePlatform(platform: string): PushDevicePlatform {
  switch (platform.toLowerCase()) {
    case 'ios':
      return 'IOS'
    case 'android':
      return 'ANDROID'
    default:
      return 'WEB'
  }
}

async function attachListeners(
  PushNotifications: PushNotificationsPlugin,
  Capacitor: CapacitorBridge,
): Promise<void> {
  if (listenerHandles.length > 0) return

  const epoch = registrationEpoch
  const registrationHandle = await PushNotifications.addListener('registration', async (token) => {
    if (epoch !== registrationEpoch) return

    const tokenValue = token.value

    lastRegisteredToken = tokenValue
    try {
      await registerPushToken({
        token: tokenValue,
        platform: toPushDevicePlatform(Capacitor.getPlatform()),
        appClient: APP_CLIENT,
      })
    } catch (error) {
      console.warn('[push] token registration failed', error)
    }
  })

  const receivedHandle = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('samhan:push-notification-received', {
      detail: notification,
    }))
  })

  const actionHandle = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    routeNotificationDeeplink(action.notification.data)
  })

  listenerHandles = [registrationHandle, receivedHandle, actionHandle]
}

function routeNotificationDeeplink(data: Record<string, unknown> | undefined): void {
  if (typeof window === 'undefined' || !data) return

  const deeplink = typeof data['deeplink'] === 'string'
    ? data['deeplink']
    : typeof data['link'] === 'string'
      ? data['link']
      : null
  if (!deeplink) return

  if (deeplink.startsWith('#/')) {
    window.location.hash = deeplink
    return
  }
  if (deeplink.startsWith('/')) {
    window.location.hash = `#${deeplink}`
  }
}

/**
 * Capacitor 네이티브 런타임에서 FCM/APNs registration token 을 요청하고 서버에 등록한다.
 *
 * Electron/PWA 에서는 no-op 이며, 플러그인은 동적 import 로만 로드한다.
 */
export async function registerPush(): Promise<void> {
  if (!isCapacitorPlatform) return
  if (registerInFlight) return registerInFlight

  registerInFlight = (async () => {
    const runtime = await loadPushRuntime()
    if (!runtime) return

    const permission = await runtime.PushNotifications.requestPermissions()
    if (permission.receive !== 'granted') return

    await attachListeners(runtime.PushNotifications, runtime.Capacitor)
    await runtime.PushNotifications.register()
  })().finally(() => {
    registerInFlight = null
  })

  return registerInFlight
}

/**
 * 서버에 저장된 현재 기기의 push token 을 해제한다.
 *
 * 해제 실패가 로그아웃을 막지 않도록 오류는 로깅 후 삼킨다.
 */
export async function unregisterPush(token = lastRegisteredToken): Promise<void> {
  if (!isCapacitorPlatform) return

  await removePushListeners()
  if (!token) {
    lastRegisteredToken = null
    return
  }

  try {
    await deletePushToken(token)
  } catch (error) {
    console.warn('[push] token unregister failed', error)
  } finally {
    if (lastRegisteredToken === token) {
      lastRegisteredToken = null
    }
  }
}

export async function removePushListeners(): Promise<void> {
  registrationEpoch += 1
  const handles = listenerHandles
  listenerHandles = []
  await Promise.allSettled(handles.map((handle) => handle.remove()))
}
