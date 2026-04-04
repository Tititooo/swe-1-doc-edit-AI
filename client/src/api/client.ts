import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import type { AuthResponse, StoredAuthSession } from '../types/auth'
import type { APIError } from '../types/document'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
const mockPreference = import.meta.env.VITE_ENABLE_MOCK_API?.toLowerCase()
const SESSION_STORAGE_KEY = 'collab-editor.auth-session'
const SESSION_EVENT_NAME = 'auth-session-changed'

export const MOCK_MODE = mockPreference
  ? mockPreference === 'true'
  : import.meta.env.DEV

export { API_BASE_URL }
export const AUTH_CHANGE_EVENT = SESSION_EVENT_NAME

const storageAvailable = typeof window !== 'undefined'

const readStoredSession = (): StoredAuthSession | null => {
  if (!storageAvailable) {
    return null
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as StoredAuthSession
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

let currentSession: StoredAuthSession | null = readStoredSession()
let refreshPromise: Promise<StoredAuthSession | null> | null = null

const authClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

const emitSessionChange = () => {
  if (!storageAvailable) {
    return
  }
  window.dispatchEvent(new CustomEvent(SESSION_EVENT_NAME))
}

export const getSessionChangeEventName = () => SESSION_EVENT_NAME

export const getStoredSession = (): StoredAuthSession | null => currentSession

export const setStoredSession = (session: StoredAuthSession | null) => {
  currentSession = session

  if (storageAvailable) {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  }

  emitSessionChange()
}

export const clearStoredSession = () => {
  setStoredSession(null)
}

const mapAxiosError = (error: AxiosError<{ message?: string; code?: string }>): APIError => ({
  message: error.response?.data?.message || error.message,
  code: error.response?.data?.code || error.code,
  status: error.response?.status,
})

export const handleAPIError = (error: unknown): APIError => {
  if (axios.isAxiosError(error)) {
    return mapAxiosError(error as AxiosError<{ message?: string; code?: string }>)
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  ) {
    const apiError = error as Record<string, unknown>
    return {
      message: String(apiError.message),
      code: typeof apiError.code === 'string' ? apiError.code : undefined,
      status: typeof apiError.status === 'number' ? apiError.status : undefined,
    }
  }

  if (error instanceof Error) {
    return { message: error.message }
  }

  return { message: 'An unknown error occurred' }
}

const storeAuthResponse = (response: AuthResponse): StoredAuthSession => {
  const session = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
  }
  setStoredSession(session)
  return session
}

export const refreshStoredSession = async (): Promise<StoredAuthSession | null> => {
  if (!currentSession?.refreshToken) {
    clearStoredSession()
    return null
  }

  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = authClient
    .post<AuthResponse>('/auth/refresh', { refreshToken: currentSession.refreshToken })
    .then((response) => storeAuthResponse(response.data))
    .catch(() => {
      clearStoredSession()
      return null
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

apiClient.interceptors.request.use((config) => {
  if (currentSession?.accessToken) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${currentSession.accessToken}`
  }
  return config
})

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string; code?: string }>) => {
    const config = error.config as RetriableConfig | undefined
    const errorCode = error.response?.data?.code

    if (
      error.response?.status === 401 &&
      errorCode === 'TOKEN_EXPIRED' &&
      config &&
      !config._retry
    ) {
      config._retry = true
      const refreshed = await refreshStoredSession()
      if (refreshed) {
        config.headers = config.headers ?? {}
        config.headers.Authorization = `Bearer ${refreshed.accessToken}`
        return apiClient.request(config)
      }
    }

    throw error
  }
)

const parseJSON = async (response: Response): Promise<Record<string, unknown> | null> => {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export const authorizedFetch = async (
  input: string,
  init: RequestInit,
  retry = true
): Promise<Response> => {
  const headers = new Headers(init.headers || {})
  if (currentSession?.accessToken) {
    headers.set('Authorization', `Bearer ${currentSession.accessToken}`)
  }

  const response = await fetch(input, {
    ...init,
    headers,
  })

  if (response.status === 401 && retry) {
    const parsed = await parseJSON(response.clone())
    if (parsed?.code === 'TOKEN_EXPIRED') {
      const refreshed = await refreshStoredSession()
      if (refreshed) {
        return authorizedFetch(input, init, false)
      }
    }
  }

  return response
}

export { authClient, storeAuthResponse }
