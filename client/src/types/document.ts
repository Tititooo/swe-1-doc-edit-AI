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

export type AIFeature = 'rewrite' | 'summarize' | 'translate' | 'restructure' | 'continue'

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
