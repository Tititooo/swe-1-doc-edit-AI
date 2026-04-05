import type { AuthLoginRequest, AuthRegisterRequest, AuthResponse, AuthUser } from '../types/auth'
import type { APIError } from '../types/document'
import { API_BASE_URL, MOCK_MODE, apiClient, authClient, clearStoredSession, handleAPIError, storeAuthResponse } from './client'

export const DEV_AUTOLOGIN_EMAIL = 'atharv.dev@local'
export const DEV_AUTOLOGIN_PASSWORD = 'atharv-preview-pass'

const mockUser: AuthUser = {
  id: 'preview-user',
  email: DEV_AUTOLOGIN_EMAIL,
  name: 'Preview Owner',
  role: 'owner',
}

const mockResponse: AuthResponse = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  user: mockUser,
  tokenType: 'bearer',
  expiresIn: 900,
}

export const fetchBackendHealth = async (): Promise<{ auth_required: boolean }> => {
  if (MOCK_MODE) {
    return { auth_required: false }
  }

  const response = await fetch(`${API_BASE_URL.replace(/\/api\/?$/, '')}/health`)
  if (!response.ok) {
    throw {
      message: 'Backend health check failed.',
      status: response.status,
    } satisfies APIError
  }

  return (await response.json()) as { auth_required: boolean }
}

export const register = async (payload: AuthRegisterRequest): Promise<AuthResponse> => {
  try {
    if (MOCK_MODE) {
      storeAuthResponse({
        ...mockResponse,
        user: {
          ...mockUser,
          email: payload.email,
          name: payload.name || mockUser.name,
        },
      })
      return {
        ...mockResponse,
        user: {
          ...mockUser,
          email: payload.email,
          name: payload.name || mockUser.name,
        },
      }
    }

    const response = await authClient.post<AuthResponse>('/auth/register', payload)
    storeAuthResponse(response.data)
    return response.data
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const login = async (payload: AuthLoginRequest): Promise<AuthResponse> => {
  try {
    if (MOCK_MODE) {
      storeAuthResponse(mockResponse)
      return mockResponse
    }

    const response = await authClient.post<AuthResponse>('/auth/login', payload)
    storeAuthResponse(response.data)
    return response.data
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const fetchCurrentUser = async (): Promise<AuthUser> => {
  try {
    if (MOCK_MODE) {
      return mockUser
    }

    const response = await apiClient.get<AuthUser>('/users/me')
    return response.data
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const logout = () => {
  clearStoredSession()
}

export const registerUser = register
export const loginUser = login
