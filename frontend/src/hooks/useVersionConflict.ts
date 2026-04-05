/**
 * useVersionConflict Hook
 * Detects version conflicts between local and server state
 * Handles: US-04 (Conflict Prevention - The Gatekeeper)
 */

import { useState, useCallback } from 'react'
import { APIError } from '../types/document'
import { checkDocumentVersion } from '../api/documentAPI'

interface UseVersionConflictReturn {
  hasConflict: boolean
  conflictMessage: string | null
  checkConflict: (docId: string | null, localVersionId: number | null) => Promise<boolean>
  clearConflict: () => void
}

export const useVersionConflict = (): UseVersionConflictReturn => {
  const [hasConflict, setHasConflict] = useState(false)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)

  const checkConflict = useCallback(
    async (docId: string | null, localVersionId: number | null): Promise<boolean> => {
      if (docId === null || localVersionId === null) {
        setConflict(false, null)
        return false
      }

      try {
        const { versionId: serverVersionId } = await checkDocumentVersion(docId)

        if (serverVersionId !== localVersionId) {
          setConflict(true, 'Document has changed.')
          return true
        }

        setConflict(false, null)
        return false
      } catch (err) {
        const error = err as APIError
        setConflict(true, `Error checking version: ${error.message}`)
        return true
      }
    },
    []
  )

  const clearConflict = useCallback(() => {
    setConflict(false, null)
  }, [])

  const setConflict = (conflict: boolean, message: string | null) => {
    setHasConflict(conflict)
    setConflictMessage(message)
  }

  return {
    hasConflict,
    conflictMessage,
    checkConflict,
    clearConflict,
  }
}
