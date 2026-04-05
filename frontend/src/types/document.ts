/**
 * Document-related TypeScript interfaces
 */

export interface Document {
  id: string
  content: string
  versionId: number
  lastModified: string
  title?: string
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

export interface AIRewriteRequest {
  selectedText: string
  versionId: number
  feature?: AIFeature
  style?: string
  notes?: string
  targetLanguage?: string
  documentText?: string
}

export interface AIRewriteResponse extends AIResponse {
  result?: string
  feature?: AIFeature
  suggestionId?: string
}

export interface RealtimeAwarenessUser {
  id: string
  name: string
  color: string
}

export interface RealtimeSession {
  doc_id: string
  ws_url: string
  role: 'owner' | 'editor' | 'commenter' | 'viewer'
  expires_at: string
  token_query_param: 'token'
  awareness_user: RealtimeAwarenessUser
}
