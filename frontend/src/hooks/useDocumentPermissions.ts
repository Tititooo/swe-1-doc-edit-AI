import { useCallback, useState } from 'react'
import {
  createDocumentPermission,
  deleteDocumentPermission,
  fetchDocumentPermissions,
} from '../api/documentAPI'
import type { APIError, DocumentPermissionItem, DocumentRole } from '../types/document'

interface UseDocumentPermissionsReturn {
  permissions: DocumentPermissionItem[]
  loading: boolean
  submitting: boolean
  error: APIError | null
  loadPermissions: (docId: string) => Promise<DocumentPermissionItem[]>
  shareDocument: (docId: string, userEmail: string, role: DocumentRole) => Promise<boolean>
  revokePermission: (docId: string, permissionId: string) => Promise<boolean>
  clearError: () => void
  reset: () => void
}

export const useDocumentPermissions = (): UseDocumentPermissionsReturn => {
  const [permissions, setPermissions] = useState<DocumentPermissionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<APIError | null>(null)

  const loadPermissions = useCallback(async (docId: string) => {
    setLoading(true)
    setError(null)
    try {
      const nextPermissions = await fetchDocumentPermissions(docId)
      setPermissions(nextPermissions)
      return nextPermissions
    } catch (nextError) {
      setError(nextError as APIError)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const shareDocument = useCallback(
    async (docId: string, userEmail: string, role: DocumentRole) => {
      setSubmitting(true)
      setError(null)
      try {
        await createDocumentPermission(docId, userEmail, role)
        const nextPermissions = await fetchDocumentPermissions(docId)
        setPermissions(nextPermissions)
        return true
      } catch (nextError) {
        setError(nextError as APIError)
        return false
      } finally {
        setSubmitting(false)
      }
    },
    []
  )

  const revokePermission = useCallback(async (docId: string, permissionId: string) => {
    setSubmitting(true)
    setError(null)
    try {
      await deleteDocumentPermission(docId, permissionId)
      const nextPermissions = await fetchDocumentPermissions(docId)
      setPermissions(nextPermissions)
      return true
    } catch (nextError) {
      setError(nextError as APIError)
      return false
    } finally {
      setSubmitting(false)
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const reset = useCallback(() => {
    setPermissions([])
    setLoading(false)
    setSubmitting(false)
    setError(null)
  }, [])

  return {
    permissions,
    loading,
    submitting,
    error,
    loadPermissions,
    shareDocument,
    revokePermission,
    clearError,
    reset,
  }
}
