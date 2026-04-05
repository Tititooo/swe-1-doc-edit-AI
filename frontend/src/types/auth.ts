export type UserRole = 'owner' | 'editor' | 'commenter' | 'viewer'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
  tokenType: 'bearer'
  expiresIn: number
}

export interface AuthLoginRequest {
  email: string
  password: string
}

export interface AuthRegisterRequest extends AuthLoginRequest {
  name?: string
}

export interface StoredAuthSession {
  accessToken: string
  refreshToken: string
  user?: AuthUser
}

export type AuthenticatedUser = AuthUser
export type AuthSession = AuthResponse
export type AuthPayload = AuthLoginRequest
export type RegisterPayload = AuthRegisterRequest
export type RegisterRequest = AuthRegisterRequest
