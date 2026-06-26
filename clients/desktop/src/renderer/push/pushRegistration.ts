import { isCapacitorPlatform } from '../auth/authProvider'
import {
  deletePushToken,
  registerPushToken,
  type PushDevicePlatform,
} from '../api/pushTokens'
import type { PushNotificationsPlugin } from '@capacitor/push-notifications'

const APP_CLIENT = 'DESKTOP_NATIVE'
const REGISTRATION_POST_TIMEOUT_MS = 15_000

interface PluginListenerHandle {
  remove: () => Promise<void>
}

interface CapacitorBridge {
  getPlatform: () => string
}

let listenerHandles: PluginListenerHandle[] = []
let lastRegisteredToken: string | null = null
let registerInFlight: Promise<void> | null = null
let pendingRegistrationPost: Promise<string | null> | null = null
let attemptedToken: string | null = null
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
  epoch: number,
): Promise<boolean> {
  if (epoch !== registrationEpoch) return false
  if (listenerHandles.length > 0) return true

  const registrationHandle = await PushNotifications.addListener('registration', async (token) => {
    if (epoch !== registrationEpoch) return

    const tokenValue = token.value
    attemptedToken = tokenValue
    const registrationPost = trackRegistrationPost(tokenValue, async () => {
      await registerPushToken({
        token: tokenValue,
        platform: toPushDevicePlatform(Capacitor.getPlatform()),
        appClient: APP_CLIENT,
      })
    })

    const registeredToken = await registrationPost
    if (!registeredToken || epoch !== registrationEpoch) return

    lastRegisteredToken = registeredToken
  })
  if (epoch !== registrationEpoch) {
    await registrationHandle.remove()
    return false
  }

  const receivedHandle = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('samhan:push-notification-received', {
      detail: notification,
    }))
  })
  if (epoch !== registrationEpoch) {
    await Promise.allSettled([
      registrationHandle.remove(),
      receivedHandle.remove(),
    ])
    return false
  }

  const actionHandle = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    routeNotificationDeeplink(action.notification.data)
  })
  if (epoch !== registrationEpoch) {
    await Promise.allSettled([
      registrationHandle.remove(),
      receivedHandle.remove(),
      actionHandle.remove(),
    ])
    return false
  }

  listenerHandles = [registrationHandle, receivedHandle, actionHandle]
  return true
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

function trackRegistrationPost(
  tokenValue: string,
  post: () => Promise<void>,
): Promise<string | null> {
  let operation: Promise<string | null>
  operation = post()
    .then(() => tokenValue)
    .catch((error) => {
      console.warn('[push] token registration failed', error)
      return null
    })
    .finally(() => {
      if (pendingRegistrationPost === operation) {
        pendingRegistrationPost = null
      }
    })

  pendingRegistrationPost = operation
  return operation
}

async function waitPendingRegistrationPostForLogout(): Promise<void> {
  const pendingPost = pendingRegistrationPost
  if (!pendingPost) return

  await Promise.race([
    pendingPost,
    new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn('[push] token registration timed out before logout')
        resolve()
      }, REGISTRATION_POST_TIMEOUT_MS)
    }),
  ])
}

/**
 * Capacitor 네이티브 런타임에서 FCM/APNs registration token 을 요청하고 서버에 등록한다.
 *
 * Electron/PWA 에서는 no-op 이며, 플러그인은 동적 import 로만 로드한다.
 */
export async function registerPush(): Promise<void> {
  if (!isCapacitorPlatform) return
  if (registerInFlight) return registerInFlight

  const operation = (async () => {
    const startEpoch = registrationEpoch
    const isStaleRegistration = () => registrationEpoch !== startEpoch

    const runtime = await loadPushRuntime()
    if (isStaleRegistration()) return
    if (!runtime) return

    const permission = await runtime.PushNotifications.requestPermissions()
    if (isStaleRegistration()) return
    if (permission.receive !== 'granted') return

    const listenersAttached = await attachListeners(
      runtime.PushNotifications,
      runtime.Capacitor,
      startEpoch,
    )
    if (isStaleRegistration() || !listenersAttached) return

    await runtime.PushNotifications.register()
    if (isStaleRegistration()) return
  })().finally(() => {
    if (registerInFlight === operation) {
      registerInFlight = null
    }
  })

  registerInFlight = operation
  return operation
}

/**
 * 서버에 저장된 현재 기기의 push token 을 해제한다.
 *
 * 해제 실패가 로그아웃을 막지 않도록 오류는 로깅 후 삼킨다.
 */
export async function unregisterPush(token?: string): Promise<void> {
  if (!isCapacitorPlatform) return

  await removePushListeners()
  await waitPendingRegistrationPostForLogout()
  registerInFlight = null
  const tokenToDelete = lastRegisteredToken ?? attemptedToken ?? token
  if (!tokenToDelete) {
    lastRegisteredToken = null
    attemptedToken = null
    pendingRegistrationPost = null
    return
  }

  try {
    await deletePushToken(tokenToDelete)
  } catch (error) {
    console.warn('[push] token unregister failed', error)
  } finally {
    if (lastRegisteredToken === tokenToDelete) {
      lastRegisteredToken = null
    }
    attemptedToken = null
    pendingRegistrationPost = null
  }
}

export async function removePushListeners(): Promise<void> {
  registrationEpoch += 1
  const handles = listenerHandles
  listenerHandles = []
  await Promise.allSettled(handles.map((handle) => handle.remove()))
}
