import { useCallback, useEffect, useState } from 'react'
import { fetchBackendHealth, fetchCurrentUser, login, logout, register } from '../api/authAPI'
import { MOCK_MODE, clearStoredSession, getSessionChangeEventName, getStoredSession } from '../api/client'
import type { AuthLoginRequest, AuthRegisterRequest, AuthUser } from '../types/auth'
import type { APIError } from '../types/document'

interface UseAuthReturn {
  authRequired: boolean
  authReady: boolean
  authLoading: boolean
  user: AuthUser | null
  authError: APIError | null
  loginUser: (payload: AuthLoginRequest) => Promise<void>
  registerUser: (payload: AuthRegisterRequest) => Promise<void>
  logoutUser: () => void
  clearError: () => void
}

const DEV_EMAIL = import.meta.env.VITE_DEV_BOOTSTRAP_EMAIL || 'temiko.dev@local'
const DEV_PASSWORD = import.meta.env.VITE_DEV_BOOTSTRAP_PASSWORD || 'temiko-preview-pass'
const DEV_AUTOLOGIN = import.meta.env.VITE_DEV_AUTOLOGIN === 'true'

const MOCK_USER: AuthUser = {
  id: 'mock-user',
  email: 'mock@local',
  name: 'Mock Preview',
  role: 'owner',
}

export const useAuth = (): UseAuthReturn => {
  const [authRequired, setAuthRequired] = useState(false)
  const [authReady, setAuthReady] = useState(MOCK_MODE)
  const [authLoading, setAuthLoading] = useState(!MOCK_MODE)
  const [user, setUser] = useState<AuthUser | null>(MOCK_MODE ? MOCK_USER : null)
  const [authError, setAuthError] = useState<APIError | null>(null)

  useEffect(() => {
    if (MOCK_MODE) {
      return
    }

    let cancelled = false

    const syncSession = async () => {
      setAuthLoading(true)
      setAuthError(null)

      try {
        const health = await fetchBackendHealth()
        if (cancelled) {
          return
        }

        setAuthRequired(health.auth_required)
        const session = getStoredSession()

        if (!session) {
          if (health.auth_required && DEV_AUTOLOGIN) {
            const response = await login({ email: DEV_EMAIL, password: DEV_PASSWORD })
            if (!cancelled) {
              setUser(response.user)
            }
          } else if (!cancelled) {
            setUser(null)
          }
          return
        }

        const currentUser = await fetchCurrentUser()
        if (!cancelled) {
          setUser(currentUser)
        }
      } catch (nextError) {
        if (!cancelled) {
          clearStoredSession()
          setUser(null)
          setAuthError(nextError as APIError)
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true)
          setAuthLoading(false)
        }
      }
    }

    void syncSession()

    const onSessionChange = () => {
      if (!getStoredSession()) {
        setUser(null)
      }
    }

    window.addEventListener(getSessionChangeEventName(), onSessionChange)
    return () => {
      cancelled = true
      window.removeEventListener(getSessionChangeEventName(), onSessionChange)
    }
  }, [])

  const loginUser = useCallback(async (payload: AuthLoginRequest) => {
    if (MOCK_MODE) {
      setUser(MOCK_USER)
      setAuthRequired(false)
      setAuthReady(true)
      return
    }

    setAuthLoading(true)
    setAuthError(null)
    try {
      const response = await login(payload)
      setUser(response.user)
    } catch (nextError) {
      setAuthError(nextError as APIError)
      throw nextError
    } finally {
      setAuthLoading(false)
      setAuthReady(true)
    }
  }, [])

  const registerUser = useCallback(async (payload: AuthRegisterRequest) => {
    if (MOCK_MODE) {
      setUser(MOCK_USER)
      setAuthRequired(false)
      setAuthReady(true)
      return
    }

    setAuthLoading(true)
    setAuthError(null)
    try {
      const response = await register(payload)
      setUser(response.user)
    } catch (nextError) {
      setAuthError(nextError as APIError)
      throw nextError
    } finally {
      setAuthLoading(false)
      setAuthReady(true)
    }
  }, [])

  const logoutUser = useCallback(() => {
    logout()
    setUser(MOCK_MODE ? MOCK_USER : null)
    setAuthError(null)
  }, [])

  const clearError = useCallback(() => {
    setAuthError(null)
  }, [])

  return {
    authRequired,
    authReady,
    authLoading,
    user,
    authError,
    loginUser,
    registerUser,
    logoutUser,
    clearError,
  }
}
