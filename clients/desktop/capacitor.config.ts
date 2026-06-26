import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 네이티브 셸 설정 (Native Phase 1, Android 우선).
 *
 * webDir 는 PWA 산출물(dist/web)과 분리된 dist/capacitor 를 사용한다.
 * 개발 중 LAN/localhost 게이트웨이(http)를 허용하기 위해 cleartext 를 켜며,
 * 실기기/실배포 단계(N2/Phase 11 HTTPS)에서는 제거 대상이다.
 */
const config: CapacitorConfig = {
  appId: 'com.samhanair.backoffice',
  appName: '삼한 백오피스',
  webDir: 'dist/capacitor',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
}

export default config
