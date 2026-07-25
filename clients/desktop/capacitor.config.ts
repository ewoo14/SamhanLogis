import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 네이티브 셸 설정 (Native Phase 1, Android 우선).
 *
 * webDir 는 PWA 산출물(dist/web)과 분리된 dist/capacitor 를 사용한다.
 * 개발 중 LAN/localhost 게이트웨이(http)를 허용하기 위해 cleartext 를 켠다.
 * ⚠️ N2 production BLOCKING: 릴리즈 빌드 전 cleartext 제거 + Android Network
 * Security Config(HTTPS-only) 적용 필수 — 미적용 시 Play Store 정책 위반·MITM.
 */
const syncMode = process.env.CAPACITOR_SYNC_MODE
if (syncMode !== 'development') {
  const releaseMarkerPath = resolve(__dirname, 'dist/capacitor/.samhan-release.json')
  if (!existsSync(releaseMarkerPath)) {
    throw new Error('Capacitor sync는 명시 버전으로 build:capacitor:release를 먼저 실행해야 합니다.')
  }

  const releaseMarker = JSON.parse(readFileSync(releaseMarkerPath, 'utf8')) as {
    release?: boolean
    appVersion?: string
  }
  if (releaseMarker.release !== true || !/^\d{4}\/\d{2}\/\d{2}-[1-9]\d*$/.test(releaseMarker.appVersion ?? '')) {
    throw new Error('Capacitor sync 대상이 릴리스 표식이 없는 개발 sentinel 산출물입니다.')
  }
}

const config: CapacitorConfig = {
  appId: 'com.samhanair.backoffice',
  appName: '삼한 백오피스',
  webDir: 'dist/capacitor',
  ios: {
    contentInset: 'automatic',
    scheme: 'SamhanPublic',
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#2D77A8',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
