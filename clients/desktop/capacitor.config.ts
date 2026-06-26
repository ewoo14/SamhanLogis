import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 네이티브 셸 설정 (Native Phase 1, Android 우선).
 *
 * webDir 는 PWA 산출물(dist/web)과 분리된 dist/capacitor 를 사용한다.
 * 개발 중 LAN/localhost 게이트웨이(http)를 허용하기 위해 cleartext 를 켠다.
 * ⚠️ N2 production BLOCKING: 릴리즈 빌드 전 cleartext 제거 + Android Network
 * Security Config(HTTPS-only) 적용 필수 — 미적용 시 Play Store 정책 위반·MITM.
 */
const config: CapacitorConfig = {
  appId: 'com.samhanair.backoffice',
  appName: '삼한 백오피스',
  webDir: 'dist/capacitor',
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
      style: 'DARK',
      backgroundColor: '#2D77A8',
    },
  },
}

export default config
