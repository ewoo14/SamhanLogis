/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 아로로지스 API base URL (예: https://api.arologis.samhan-air.com). 미지정 시 localhost:8097 fallback. */
  readonly VITE_AROLOGIS_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
