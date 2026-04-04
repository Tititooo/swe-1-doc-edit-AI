/**
 * App.tsx - Main Application Container
 *
 * Orchestrates all hooks, components, and state for the 5 user stories:
 * - US-01: Load Document
 * - US-02: Text Editing & Selection
 * - US-03: AI Rewrite
 * - US-04: Conflict Prevention
 * - US-05: Error Communication
 */

import { useState, useCallback, useEffect } from 'react'
import { useDocument } from './hooks/useDocument'
import { useAI } from './hooks/useAI'
import { useVersionConflict } from './hooks/useVersionConflict'
import { LoadDocumentButton } from './components/LoadDocumentButton'
import { TextAreaEditor } from './components/TextAreaEditor'
import { ExperimentalTiptapEditor } from './components/ExperimentalTiptapEditor'
import { RichSuggestionPreview } from './components/RichSuggestionPreview'
import { AISidebar } from './components/AISidebar'
import { ConflictWarningBanner } from './components/ConflictWarningBanner'
import { ErrorBanner } from './components/ErrorBanner'
import { updateDocument } from './api/documentAPI'
import { APIError, TextSelection } from './types/document'
import type { AIRequestOptions } from './hooks/useAI'
import './App.css'

function App() {
  // State management hooks
  const {
    document,
    content,
    versionId,
    loading,
    error: docError,
    loadDocument,
    setContent,
    syncDocument,
    clearError: clearDocumentError,
  } = useDocument()
  const {
    aiResponse,
    aiLoading,
    aiError,
    activeFeature,
    cancelRequest,
    history,
    markSuggestion,
    refreshHistory,
    requestRewrite,
    clearError: clearAIError,
    reset: resetAI,
  } = useAI()
  const { hasConflict, conflictMessage, checkConflict, clearConflict } = useVersionConflict()

  // Local state for UI
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null)
  const [isUpdateLoading, setIsUpdateLoading] = useState(false)
  const [editorMode, setEditorMode] = useState<'plain' | 'rich'>('plain')
  const selectedText = selection?.text || ''

  // Show error banner when document or AI errors occur
  const activeErrorMessage =
    localErrorMessage ||
    docError?.message ||
    aiError?.message ||
    null

  const handleLoadDocument = useCallback(async () => {
    setSelection(null)
    setLocalErrorMessage(null)
    clearConflict()
    await loadDocument()
    await refreshHistory()
    resetAI()
  }, [clearConflict, loadDocument, refreshHistory, resetAI])

  useEffect(() => {
    if (!document?.id) return
    void refreshHistory()
  }, [document?.id, refreshHistory])

  const handleSelectText = useCallback((nextSelection: TextSelection | null) => {
    setSelection(nextSelection)
  }, [])

  const handleRewrite = useCallback(
    async (options: AIRequestOptions) => {
      const continueContext = options.feature === 'continue'
        ? content.slice(Math.max(0, content.length - 600))
        : options.documentText

      await requestRewrite(document?.id ?? null, selectedText, versionId, {
        ...options,
        documentText: continueContext,
      })
    },
    [content, document?.id, requestRewrite, selectedText, versionId]
  )

  const handleApplyRewrite = useCallback(
    async (newText: string) => {
      if (versionId === null) {
        setLocalErrorMessage('Load a document before applying an AI result.')
        return
      }

      // Check for conflict before applying
      const conflict = await checkConflict(versionId)
      if (conflict) {
        return
      }

      // Replace selected text with new text
      const updatedContent = selection
        ? content.slice(0, selection.start) + newText + content.slice(selection.end)
        : `${content.trimEnd()}\n\n${newText}`.trim()

      // Update document on server
      setIsUpdateLoading(true)
      setLocalErrorMessage(null)
      try {
        const updatedDocument = await updateDocument({
          content: updatedContent,
          versionId,
        })

        // Update local state
        syncDocument(updatedDocument)
        await markSuggestion('accepted')
        clearConflict()
        resetAI()
        setSelection(null)
      } catch (err) {
        console.error('Failed to update document:', err)
        const error = err as APIError
        setLocalErrorMessage(error.message || 'Failed to update document.')
      } finally {
        setIsUpdateLoading(false)
      }
    },
    [checkConflict, clearConflict, content, resetAI, selection, syncDocument, versionId]
  )

  const handleTextChange = useCallback(
    (newContent: string) => {
      if (selection) {
        setSelection(null)
        resetAI()
        clearConflict()
      }
      setContent(newContent)
    },
    [clearConflict, resetAI, selection, setContent]
  )

  const handleDismissError = useCallback(() => {
    setLocalErrorMessage(null)
    clearDocumentError()
    clearAIError()
  }, [clearAIError, clearDocumentError])

  const handleDismissConflict = useCallback(() => {
    clearConflict()
  }, [clearConflict])

  const handleRejectSuggestion = useCallback(async () => {
    await markSuggestion('rejected')
    resetAI()
  }, [markSuggestion, resetAI])

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1>📝 Collaborative Document Editor</h1>
          <p className="subtitle">AI-powered writing assistant</p>
        </div>
        <LoadDocumentButton
          onLoad={handleLoadDocument}
          isLoading={loading}
          hasDocument={!!document}
        />
        <button
          className="load-button"
          onClick={() => setEditorMode((mode) => (mode === 'plain' ? 'rich' : 'plain'))}
          type="button"
        >
          {editorMode === 'plain' ? 'Rich Editor Beta' : 'Plain Editor'}
        </button>
      </header>

      {/* Error Banner (US-05) */}
      <ErrorBanner
        visible={!!activeErrorMessage}
        message={activeErrorMessage || undefined}
        onDismiss={handleDismissError}
      />

      {/* Conflict Warning Banner (US-04) */}
      <ConflictWarningBanner
        visible={hasConflict}
        message={conflictMessage || 'Document has changed.'}
        onDismiss={handleDismissConflict}
      />

      {/* Main Content */}
      <main className="app-main">
        {!document ? (
          <div className="placeholder-state">
            <div className="placeholder-icon">📄</div>
            <h2>Click "Load Document" to begin</h2>
            <p>Your document will appear here once loaded from the server.</p>
          </div>
        ) : (
          <div className="editor-layout">
            {/* Text Editor (US-02) */}
            <div className="editor-section">
              {editorMode === 'plain' ? (
                <TextAreaEditor
                  content={content}
                  onChange={handleTextChange}
                  onSelect={handleSelectText}
                  placeholder="Content will appear here..."
                  disabled={isUpdateLoading}
                />
              ) : (
                <>
                  <ExperimentalTiptapEditor
                    content={content}
                    onChange={handleTextChange}
                    onSelect={handleSelectText}
                    disabled={isUpdateLoading}
                  />
                  <RichSuggestionPreview
                    selection={selection}
                    aiResponse={aiResponse}
                    activeFeature={activeFeature}
                  />
                </>
              )}
            </div>

            {/* AI Sidebar (US-03) */}
            <AISidebar
              selectedText={selectedText}
              documentText={content}
              aiResponse={aiResponse}
              activeFeature={activeFeature}
              history={history}
              isLoading={aiLoading}
              onCancel={cancelRequest}
              onReject={handleRejectSuggestion}
              onRewrite={handleRewrite}
              onApply={handleApplyRewrite}
              isApplyDisabled={hasConflict || isUpdateLoading}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <span className="version-info">
          {document && `Version: ${versionId}`}
        </span>
      </footer>
    </div>
  )
}

export default App
