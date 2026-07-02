/**
 * `virtual:pwa-register` stub — QA 전용 renderer 단독 Vite 서버용.
 *
 * vite.renderer.dev.config.ts 는 electron.vite.config 의 VitePWA 플러그인을 태우지 않으므로
 * PWA 가상 모듈을 no-op 으로 대체한다 (서비스워커 등록은 실 QA 범위 밖).
 */
export type RegisterSWOptions = Record<string, unknown>

export function registerSW(_options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void> {
  return async () => undefined
}
