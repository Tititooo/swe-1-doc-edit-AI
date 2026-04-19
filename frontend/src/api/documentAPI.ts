/**
 * API client for document and AI operations.
 * Keeps mock mode for local development while routing real API calls
 * through the shared auth-aware HTTP layer.
 */

import type {
  AIFeature,
  AIHistoryItem,
  APIError,
  Document,
  DocumentListItem,
  DocumentPermissionItem,
  DocumentRole,
  DocumentVersionItem,
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
  doc_id?: string
  feature?: string
  status?: string
}

interface DocumentListResponse {
  id: string
  title: string
  role: DocumentRole
  updated_at: string
}

interface DocumentDetailResponse {
  id: string
  title: string
  content: string
  updated_at: string
  version_id: number
}

interface DocumentContentMutationResponse {
  id: string
  title: string
  content: string
  versionId: number
  lastModified: string
}

interface DocumentMetadataMutationResponse {
  id: string
  title: string
  updated_at: string
  restored?: boolean
}

interface PermissionListResponse {
  permission_id: string
  user_id: string
  email: string
  name: string
  role: DocumentRole
}

interface PermissionMutationResponse {
  permission_id: string
  user_id: string
  role: DocumentRole
}

interface DocumentVersionResponse {
  version_id: number
  created_at: string
  created_by: string
}

interface RevertResponse {
  version_id: number
  created_at: string
}

const toDocument = (payload: DocumentDetailResponse | DocumentContentMutationResponse): Document => ({
  id: payload.id,
  title: payload.title,
  content: payload.content,
  versionId: 'version_id' in payload ? payload.version_id : payload.versionId,
  lastModified: 'updated_at' in payload ? payload.updated_at : payload.lastModified,
})

const toPermissionItem = (payload: PermissionListResponse): DocumentPermissionItem => ({
  permissionId: payload.permission_id,
  userId: payload.user_id,
  email: payload.email,
  name: payload.name,
  role: payload.role,
})

const toVersionItem = (payload: DocumentVersionResponse): DocumentVersionItem => ({
  versionId: payload.version_id,
  createdAt: payload.created_at,
  createdBy: payload.created_by,
})

export const fetchDocuments = async (): Promise<DocumentListItem[]> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockListDocuments()
    }
    const response = await apiClient.get<DocumentListResponse[]>('/documents')
    return response.data.map((item) => ({
      id: item.id,
      title: item.title,
      role: item.role,
      updatedAt: item.updated_at,
    }))
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const createDocument = async (title: string): Promise<Document> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockCreateDocument(title)
    }
    const response = await apiClient.post<{ id: string }>('/documents', { title })
    return await fetchDocument(response.data.id)
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const fetchDocument = async (docId: string): Promise<Document> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockFetchDocument(docId)
    }
    const response = await apiClient.get<DocumentDetailResponse>(`/documents/${docId}`)
    return toDocument(response.data)
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const loadInitialDocument = async (): Promise<Document> => {
  const documents = await fetchDocuments()
  const newest = [...documents].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]

  if (newest) {
    return fetchDocument(newest.id)
  }

  return createDocument('Working Draft')
}

export const updateDocument = async (docId: string, payload: UpdateDocumentPayload): Promise<Document> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockUpdateDocument(docId, payload.content, payload.versionId)
    }
    const response = await apiClient.put<DocumentContentMutationResponse>(`/documents/${docId}`, payload)
    return toDocument(response.data)
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const renameDocument = async (
  docId: string,
  title: string
): Promise<{ id: string; title: string; updatedAt: string }> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockRenameDocument(docId, title)
    }
    const response = await apiClient.patch<DocumentMetadataMutationResponse>(`/documents/${docId}`, { title })
    return {
      id: response.data.id,
      title: response.data.title,
      updatedAt: response.data.updated_at,
    }
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const fetchDocumentPermissions = async (docId: string): Promise<DocumentPermissionItem[]> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockListDocumentPermissions(docId)
    }
    const response = await apiClient.get<PermissionListResponse[]>(`/documents/${docId}/permissions`)
    return response.data.map(toPermissionItem)
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const createDocumentPermission = async (
  docId: string,
  userEmail: string,
  role: DocumentRole
): Promise<PermissionMutationResponse> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockCreateDocumentPermission(docId, userEmail, role)
    }
    const response = await apiClient.post<PermissionMutationResponse>(`/documents/${docId}/permissions`, {
      user_email: userEmail,
      role,
    })
    return response.data
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const deleteDocumentPermission = async (docId: string, permissionId: string): Promise<void> => {
  try {
    if (MOCK_MODE) {
      await mockAPI.mockDeleteDocumentPermission(docId, permissionId)
      return
    }
    await apiClient.delete(`/documents/${docId}/permissions/${permissionId}`)
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const fetchDocumentVersions = async (docId: string): Promise<DocumentVersionItem[]> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockListDocumentVersions(docId)
    }
    const response = await apiClient.get<DocumentVersionResponse[]>(`/documents/${docId}/versions`)
    return response.data.map(toVersionItem)
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const revertDocumentVersion = async (
  docId: string,
  versionId: number
): Promise<{ versionId: number; createdAt: string }> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockRevertDocumentVersion(docId, versionId)
    }
    const response = await apiClient.post<RevertResponse>(`/documents/${docId}/revert/${versionId}`)
    return {
      versionId: response.data.version_id,
      createdAt: response.data.created_at,
    }
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
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() || ''

    for (const rawEvent of events) {
      const lines = rawEvent.split(/\r?\n/).filter(Boolean)
      const eventLine = lines.find((line) => line.startsWith('event:'))
      const dataLine = lines.find((line) => line.startsWith('data:'))
      if (!eventLine || !dataLine) continue

      const eventName = eventLine.replace('event:', '').trim()
      const data = JSON.parse(dataLine.replace('data:', '').trim()) as {
        token?: string
        suggestion_id?: string
        message?: string
        code?: string
      }

      if (data.suggestion_id) {
        latestSuggestionId = data.suggestion_id
      }

      if (eventName === 'error') {
        throw {
          message: data.message || 'AI streaming failed',
          code: data.code || 'AI_SERVICE_UNAVAILABLE',
          status: 503,
        } satisfies APIError
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
        doc_id: filters.doc_id,
        feature: filters.feature,
        status: filters.status,
      },
    })
    return response.data
  } catch (error) {
    throw handleAPIError(error)
  }
}

export const checkDocumentVersion = async (docId: string): Promise<{ versionId: number }> => {
  try {
    if (MOCK_MODE) {
      return await mockAPI.mockCheckDocumentVersion(docId)
    }
    const response = await apiClient.get<DocumentDetailResponse>(`/documents/${docId}`)
    return { versionId: response.data.version_id }
  } catch (error) {
    throw handleAPIError(error)
  }
}

export default apiClient
