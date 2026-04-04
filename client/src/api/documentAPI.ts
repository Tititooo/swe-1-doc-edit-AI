/**
 * API client for document operations
 * Wraps HTTP calls to backend REST endpoints
 * Supports mock mode for local development
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import {
  AIFeature,
  Document,
  UpdateDocumentPayload,
  AIRewriteRequest,
  AIRewriteResponse,
  AIHistoryItem,
  APIError,
} from '../types/document'
import * as mockAPI from './mockAPI'

type StreamableFeature = AIFeature

interface StreamAIActionRequest {
  feature: StreamableFeature
  docId: string
  selectedText: string
  style?: string
  notes?: string
  targetLanguage?: string
  signal?: AbortSignal
  onToken: (token: string, suggestionId?: string) => void
}

interface FeedbackPayload {
  suggestionId: string
  action: 'accepted' | 'rejected' | 'partial' | 'cancelled'
}

// Initialize axios instance with base URL from env
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
const mockPreference = import.meta.env.VITE_ENABLE_MOCK_API?.toLowerCase()

// Default to mock mode in development unless explicitly disabled.
const MOCK_MODE = mockPreference
  ? mockPreference === 'true'
  : import.meta.env.DEV

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Helper to parse API errors into APIError format
 */
const handleError = (error: unknown): APIError => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message?: string }>
    return {
      message: axiosError.response?.data?.message || error.message,
      code: axiosError.code,
      status: axiosError.response?.status,
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message,
    }
  }

  return {
    message: 'An unknown error occurred',
  }
}

/**
 * Fetch document content from server
 * GET /document
 */
export const fetchDocument = async (): Promise<Document> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockFetchDocument()
    }
    const response = await client.get<Document>('/document')
    return response.data
  } catch (error) {
    throw handleError(error)
  }
}

/**
 * Update document content on server
 * PUT /document
 */
export const updateDocument = async (
  payload: UpdateDocumentPayload
): Promise<Document> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockUpdateDocument(payload.content, payload.versionId)
    }
    const response = await client.put<Document>('/document', payload)
    return response.data
  } catch (error) {
    throw handleError(error)
  }
}

/**
 * Request AI rewrite of selected text
 * POST /ai/rewrite
 */
export const requestAIRewrite = async (
  request: AIRewriteRequest
): Promise<AIRewriteResponse> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockRequestAIRewrite(request)
    }
    const response = await client.post<AIRewriteResponse>('/ai/rewrite', request)
    return response.data
  } catch (error) {
    throw handleError(error)
  }
}

export type { AIFeature }

export const streamAIAction = async ({
  feature,
  docId,
  selectedText,
  style,
  notes,
  targetLanguage,
  signal,
  onToken,
}: StreamAIActionRequest): Promise<{ suggestionId?: string }> => {
  const endpointMap: Record<StreamableFeature, string> = {
    rewrite: '/ai/rewrite',
    summarize: '/ai/summarize',
    translate: '/ai/translate',
    restructure: '/ai/restructure',
    continue: '/ai/continue',
  }

  const body =
    feature === 'rewrite'
      ? { doc_id: docId, selection: { text: selectedText }, style: style || notes || undefined }
      : feature === 'summarize'
        ? { doc_id: docId, selection: { text: selectedText } }
        : feature === 'translate'
          ? { doc_id: docId, selection: { text: selectedText }, target_lang: targetLanguage || 'English' }
          : feature === 'restructure'
            ? { doc_id: docId, selection: { text: selectedText }, instructions: notes || 'Improve structure.' }
            : { doc_id: docId, selection: { text: selectedText }, notes: notes || undefined }

  const response = await fetch(`${API_BASE_URL}${endpointMap[feature]}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok || !response.body) {
    let message = 'AI streaming request failed'
    try {
      const errorBody = await response.json()
      message = errorBody.message || message
    } catch {
      // Ignore JSON parse failure and use fallback message.
    }
    throw { message, status: response.status } satisfies APIError
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let latestSuggestionId: string | undefined

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const rawEvent of events) {
      const lines = rawEvent.split('\n').filter(Boolean)
      const eventLine = lines.find((line) => line.startsWith('event:'))
      const dataLine = lines.find((line) => line.startsWith('data:'))
      if (!eventLine || !dataLine) continue

      const eventName = eventLine.replace('event:', '').trim()
      const data = JSON.parse(dataLine.replace('data:', '').trim()) as {
        token?: string
        done?: boolean
        suggestion_id?: string
        message?: string
      }

      if (data.suggestion_id) {
        latestSuggestionId = data.suggestion_id
      }

      if (eventName === 'error') {
        throw { message: data.message || 'AI streaming failed' } satisfies APIError
      }

      if (eventName === 'token' && data.token) {
        onToken(data.token, latestSuggestionId)
      }
    }
  }

  return { suggestionId: latestSuggestionId }
}

export const cancelAISuggestion = async (suggestionId: string): Promise<void> => {
  try {
    await client.post(`/ai/cancel/${suggestionId}`)
  } catch (error) {
    throw handleError(error)
  }
}

export const sendAIFeedback = async ({ suggestionId, action }: FeedbackPayload): Promise<void> => {
  try {
    await client.post('/ai/feedback', {
      suggestion_id: suggestionId,
      action,
    })
  } catch (error) {
    throw handleError(error)
  }
}

export const fetchAIHistory = async (limit = 10): Promise<AIHistoryItem[]> => {
  try {
    const response = await client.get<AIHistoryItem[]>('/ai/history', {
      params: { limit },
    })
    return response.data
  } catch (error) {
    throw handleError(error)
  }
}

/**
 * Check server version to detect conflicts
 * GET /document/version
 */
export const checkDocumentVersion = async (): Promise<{ versionId: number }> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockCheckDocumentVersion()
    }
    const response = await client.get<{ versionId: number }>('/document/version')
    return response.data
  } catch (error) {
    throw handleError(error)
  }
}

export default client
