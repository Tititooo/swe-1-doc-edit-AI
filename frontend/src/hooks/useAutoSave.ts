import { useCallback, useEffect, useRef, useState } from 'react'
import { checkDocumentVersion, updateDocument } from '../api/documentAPI'
import type { APIError, Document, DocumentRole, SaveStatus } from '../types/document'

interface UseAutoSaveArgs {
  document: Document | null
  role: DocumentRole | null
  enabled: boolean
  onDocumentSynced: (updater: (previous: Document | null) => Document | null) => void
  onError: (message: string) => void
}

interface UseAutoSaveReturn {
  saveStatus: SaveStatus
  statusLabel: string
  resetSaveState: (nextDocument?: Document | null) => void
}

const AUTOSAVE_DELAY_MS = 2000

export const useAutoSave = ({
  document,
  role,
  enabled,
  onDocumentSynced,
  onError,
}: UseAutoSaveArgs): UseAutoSaveReturn => {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const timeoutRef = useRef<number | null>(null)
  const lastSavedContentRef = useRef('')
  const currentDocumentRef = useRef<Document | null>(null)
  const saveInFlightRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const resetSaveState = useCallback((nextDocument?: Document | null) => {
    const targetDocument = nextDocument === undefined ? document : nextDocument
    clearTimer()
    saveInFlightRef.current = false
    currentDocumentRef.current = targetDocument || null
    lastSavedContentRef.current = targetDocument?.content || ''
    setSaveStatus('idle')
  }, [clearTimer, document])

  useEffect(() => {
    currentDocumentRef.current = document
  }, [document])

  useEffect(() => {
    clearTimer()
    saveInFlightRef.current = false
    // Read content through the ref so this effect only resets on doc ID change,
    // not on every keystroke (adding document?.content to deps would cause the
    // "last saved" baseline to update on every character, defeating dirty detection).
    lastSavedContentRef.current = currentDocumentRef.current?.content || ''
    setSaveStatus('idle')
  }, [clearTimer, document?.id])

  useEffect(() => {
    if (!document || !enabled || role === 'viewer' || role === 'commenter') {
      clearTimer()
      setSaveStatus('idle')
      lastSavedContentRef.current = document?.content || ''
      return
    }

    const currentContent = document.content
    if (currentContent === lastSavedContentRef.current) {
      if (!saveInFlightRef.current && saveStatus === 'dirty') {
        setSaveStatus('saved')
      }
      return
    }

    setSaveStatus('dirty')
    clearTimer()

    timeoutRef.current = window.setTimeout(async () => {
      const snapshot = currentDocumentRef.current
      if (!snapshot || saveInFlightRef.current) {
        return
      }

      const snapshotContent = snapshot.content
      const snapshotVersion = snapshot.versionId
      saveInFlightRef.current = true
      setSaveStatus('saving')

      const applySavedDocument = (savedDocument: Document) => {
        lastSavedContentRef.current = snapshotContent
        onDocumentSynced((previous) => {
          if (!previous || previous.id !== savedDocument.id) {
            return previous
          }

          const contentChangedDuringSave = previous.content !== snapshotContent
          return {
            ...previous,
            title: savedDocument.title,
            versionId: savedDocument.versionId,
            lastModified: savedDocument.lastModified,
            content: contentChangedDuringSave ? previous.content : savedDocument.content,
          }
        })

        const latestDocument = currentDocumentRef.current
        const hasNewUnsavedChanges = latestDocument?.id === savedDocument.id && latestDocument.content !== snapshotContent
        setSaveStatus(hasNewUnsavedChanges ? 'dirty' : 'saved')
      }

      try {
        const updated = await updateDocument(snapshot.id, {
          content: snapshotContent,
          versionId: snapshotVersion,
        })
        applySavedDocument(updated)
      } catch (nextError) {
        const apiError = nextError as APIError

        if (apiError.code === 'VERSION_CONFLICT') {
          try {
            const latest = await checkDocumentVersion(snapshot.id)
            const updated = await updateDocument(snapshot.id, {
              content: snapshotContent,
              versionId: latest.versionId,
            })
            applySavedDocument(updated)
          } catch (retryError) {
            const retryApiError = retryError as APIError
            setSaveStatus('error')
            onError(retryApiError.message || 'Auto-save failed.')
          }
        } else {
          setSaveStatus('error')
          onError(apiError.message || 'Auto-save failed.')
        }
      } finally {
        saveInFlightRef.current = false
      }
    }, AUTOSAVE_DELAY_MS)

    return clearTimer
  }, [clearTimer, document, document?.content, enabled, onDocumentSynced, onError, role, saveStatus])

  useEffect(() => () => clearTimer(), [clearTimer])

  const statusLabel =
    saveStatus === 'dirty'
      ? 'Unsaved changes'
      : saveStatus === 'saving'
        ? 'Saving…'
        : saveStatus === 'saved'
          ? 'Saved'
          : saveStatus === 'error'
            ? 'Save failed'
            : 'All changes synced'

  return {
    saveStatus,
    statusLabel,
    resetSaveState,
  }
}
