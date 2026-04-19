import { useCallback, useState } from 'react'
import { createDocument, fetchDocuments } from '../api/documentAPI'
import type { APIError, Document, DocumentListItem } from '../types/document'

interface UseDashboardDocumentsReturn {
  documents: DocumentListItem[]
  loading: boolean
  creating: boolean
  error: APIError | null
  refreshDocuments: () => Promise<DocumentListItem[]>
  createNewDocument: (title?: string) => Promise<Document | null>
  clearError: () => void
}

export const useDashboardDocuments = (): UseDashboardDocumentsReturn => {
  const [documents, setDocuments] = useState<DocumentListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<APIError | null>(null)

  const refreshDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextDocuments = await fetchDocuments()
      setDocuments(nextDocuments)
      return nextDocuments
    } catch (nextError) {
      setError(nextError as APIError)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const createNewDocument = useCallback(async (title = 'Untitled Document') => {
    setCreating(true)
    setError(null)
    try {
      const created = await createDocument(title)
      const nextDocuments = await fetchDocuments()
      setDocuments(nextDocuments)
      return created
    } catch (nextError) {
      setError(nextError as APIError)
      return null
    } finally {
      setCreating(false)
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    documents,
    loading,
    creating,
    error,
    refreshDocuments,
    createNewDocument,
    clearError,
  }
}
