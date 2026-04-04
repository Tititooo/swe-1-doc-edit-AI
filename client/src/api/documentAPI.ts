/**
 * API client for document and AI operations.
 * Keeps mock mode for local development while routing real API calls
 * through the shared auth-aware HTTP layer.
 */

import type {
  AIFeature,
  AIHistoryItem,
  AIRewriteRequest,
  AIRewriteResponse,
  APIError,
  Document,
  UpdateDocumentPayload,
} from '../types/document'
import * as mockAPI from './mockAPI'
import { API_BASE_URL, MOCK_MODE, apiClient, authorizedFetch, handleAPIError } from './client'

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

interface HistoryFilters {
  feature?: string
  status?: string
}

export const fetchDocument = async (): Promise<Document> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockFetchDocument()
    }
    const response = await apiClient.get<Document>('/document')
    return response.data
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const updateDocument = async (payload: UpdateDocumentPayload): Promise<Document> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockUpdateDocument(payload.content, payload.versionId)
    }
    const response = await apiClient.put<Document>('/document', payload)
    return response.data
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const requestAIRewrite = async (request: AIRewriteRequest): Promise<AIRewriteResponse> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockRequestAIRewrite(request)
    }
    const response = await apiClient.post<AIRewriteResponse>('/ai/rewrite', request)
    return response.data
  } catch (error) {
    throw handleAPIError(error)
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

  const response = await authorizedFetch(`${API_BASE_URL}${endpointMap[feature]}`, {
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
      const errorBody = (await response.json()) as { message?: string }
      message = errorBody.message || message
    } catch {
      // Ignore parse failures and keep the fallback message.
    }
    throw { message, status: response.status } satisfies APIError
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let latestSuggestionId: string | undefined

  let streaming = true

  while (streaming) {
    const { value, done } = await reader.read()
    if (done) {
      streaming = false
      continue
    }

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
    await apiClient.post(`/ai/cancel/${suggestionId}`)
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const sendAIFeedback = async ({ suggestionId, action }: FeedbackPayload): Promise<void> => {
  try {
    await apiClient.post('/ai/feedback', {
      suggestion_id: suggestionId,
      action,
    })
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const fetchAIHistory = async (limit = 10, filters: HistoryFilters = {}): Promise<AIHistoryItem[]> => {
  try {
    const response = await apiClient.get<AIHistoryItem[]>('/ai/history', {
      params: {
        limit,
        feature: filters.feature,
        status: filters.status,
      },
    })
    return response.data
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const checkDocumentVersion = async (): Promise<{ versionId: number }> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockCheckDocumentVersion()
    }
    const response = await apiClient.get<{ versionId: number }>('/document/version')
    return response.data
  } catch (error) {
    throw handleAPIError(error)
  }
}

export default apiClient
