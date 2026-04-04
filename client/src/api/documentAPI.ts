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
  APIError,
} from '../types/document'
import * as mockAPI from './mockAPI'

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
