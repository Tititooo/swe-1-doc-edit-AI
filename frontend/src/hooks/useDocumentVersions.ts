import { useCallback, useState } from 'react'
import { fetchDocumentVersions, revertDocumentVersion } from '../api/documentAPI'
import type { APIError, DocumentVersionItem } from '../types/document'

interface UseDocumentVersionsReturn {
  versions: DocumentVersionItem[]
  loading: boolean
  restoring: boolean
  error: APIError | null
  loadVersions: (docId: string) => Promise<DocumentVersionItem[]>
  restoreVersion: (docId: string, versionId: number) => Promise<boolean>
  clearError: () => void
  reset: () => void
}

export const useDocumentVersions = (): UseDocumentVersionsReturn => {
  const [versions, setVersions] = useState<DocumentVersionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<APIError | null>(null)

  const loadVersions = useCallback(async (docId: string) => {
    setLoading(true)
    setError(null)
    try {
      const nextVersions = await fetchDocumentVersions(docId)
      setVersions(nextVersions)
      return nextVersions
    } catch (nextError) {
      setError(nextError as APIError)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const restoreVersion = useCallback(async (docId: string, versionId: number) => {
    setRestoring(true)
    setError(null)
    try {
      await revertDocumentVersion(docId, versionId)
      return true
    } catch (nextError) {
      setError(nextError as APIError)
      return false
    } finally {
      setRestoring(false)
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const reset = useCallback(() => {
    setVersions([])
    setLoading(false)
    setRestoring(false)
    setError(null)
  }, [])

  return {
    versions,
    loading,
    restoring,
    error,
    loadVersions,
    restoreVersion,
    clearError,
    reset,
  }
}
