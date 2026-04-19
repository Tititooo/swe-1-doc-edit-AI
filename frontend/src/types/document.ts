/**
 * Document-related TypeScript interfaces
 */

export interface Document {
  id: string
  title: string
  content: string
  versionId: number
  lastModified: string
}

export type DocumentRole = 'owner' | 'editor' | 'commenter' | 'viewer'

export interface DocumentListItem {
  id: string
  title: string
  role: DocumentRole
  updatedAt: string
}

export interface DocumentPermissionItem {
  permissionId: string
  userId: string
  email: string
  name: string
  role: DocumentRole
}

export interface DocumentVersionItem {
  versionId: number
  createdAt: string
  createdBy: string
}

export interface TextSelection {
  start: number
  end: number
  text: string
}

export type CollaborationStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export type AIFeature = 'rewrite' | 'summarize' | 'translate' | 'restructure' | 'continue'

export interface AIHistoryItem {
  id: string
  feature: string
  input_text: string
  suggestion_text?: string | null
  status: string
  tokens_used: number
  created_at: string
}

export interface AIResponse {
  success: boolean
  result?: string
  error?: string
  message?: string
}

export interface APIError {
  message: string
  code?: string
  status?: number
}

export interface UpdateDocumentPayload {
  content: string
  versionId: number
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface RealtimeAwarenessUser {
  id: string
  name: string
  color: string
}

export interface RealtimeSession {
  doc_id: string
  ws_url: string
  role: DocumentRole
  expires_at: string
  token_query_param: 'token'
  awareness_user: RealtimeAwarenessUser
}
