/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 아로로지스 API base URL (예: https://api.arologis.samhan-air.com). 미지정 시 localhost:8097 fallback. */
  readonly VITE_AROLOGIS_API_BASE?: string
  /** dashboard-service 공개 버전 API base URL. */
  readonly VITE_VERSION_API_BASE_URL?: string
  /** 릴리스 빌드에 주입되는 앱 버전. 개발 모드는 공통 sentinel을 사용한다. */
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
