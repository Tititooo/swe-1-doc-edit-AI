/**
 * useDocument Hook
 * Manages document loading, content, and version tracking
 * Handles: US-01 (Load Document)
 */

import { useState, useCallback } from 'react'
import { Document, APIError } from '../types/document'
import { fetchDocument } from '../api/documentAPI'

interface UseDocumentReturn {
  document: Document | null
  content: string
  versionId: number | null
  loading: boolean
  error: APIError | null
  loadDocument: () => Promise<void>
  setContent: (newContent: string) => void
  syncDocument: (nextDocument: Document) => void
  clearError: () => void
  reset: () => void
}

export const useDocument = (): UseDocumentReturn => {
  const [document, setDocument] = useState<Document | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<APIError | null>(null)

  const loadDocument = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const doc = await fetchDocument()
      setDocument(doc)
    } catch (err) {
      setError(err as APIError)
    } finally {
      setLoading(false)
    }
  }, [])

  const setContent = useCallback((newContent: string) => {
    setDocument((prev) =>
      prev ? { ...prev, content: newContent } : null
    )
  }, [])

  const syncDocument = useCallback((nextDocument: Document) => {
    setDocument(nextDocument)
    setError(null)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const reset = useCallback(() => {
    setDocument(null)
    setError(null)
    setLoading(false)
  }, [])

  return {
    document,
    content: document?.content || '',
    versionId: document?.versionId || null,
    loading,
    error,
    loadDocument,
    setContent,
    syncDocument,
    clearError,
    reset,
  }
}
