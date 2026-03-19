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
}

export interface AIRewriteResponse extends AIResponse {
  result?: string
}
