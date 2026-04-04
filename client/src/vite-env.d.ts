/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ENABLE_MOCK_API?: string
  readonly VITE_COLLAB_WS_URL?: string
  readonly VITE_DEV_AUTOLOGIN?: string
  readonly VITE_DEV_BOOTSTRAP_EMAIL?: string
  readonly VITE_DEV_BOOTSTRAP_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __MOCK_MODE__?: boolean
}
