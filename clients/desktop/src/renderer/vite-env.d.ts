/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string
  readonly VITE_WEB_ESTIMATE_URL?: string
  readonly VITE_WEB_ORDER_URL?: string
}
