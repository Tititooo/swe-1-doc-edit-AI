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

import { useState, useCallback } from 'react'
import { useDocument } from './hooks/useDocument'
import { useAI } from './hooks/useAI'
import { useVersionConflict } from './hooks/useVersionConflict'
import { LoadDocumentButton } from './components/LoadDocumentButton'
import { TextAreaEditor } from './components/TextAreaEditor'
import { AISidebar } from './components/AISidebar'
import { ConflictWarningBanner } from './components/ConflictWarningBanner'
import { ErrorBanner } from './components/ErrorBanner'
import { updateDocument } from './api/documentAPI'
import './App.css'

function App() {
  // State management hooks
  const { document, content, versionId, loading, error: docError, loadDocument, setContent } = useDocument()
  const { aiResponse, aiLoading, aiError, requestRewrite, clearError: clearAIError, reset: resetAI } = useAI()
  const { hasConflict, conflictMessage, checkConflict, clearConflict } = useVersionConflict()

  // Local state for UI
  const [selectedText, setSelectedText] = useState('')
  const [showErrorBanner, setShowErrorBanner] = useState(false)
  const [isUpdateLoading, setIsUpdateLoading] = useState(false)

  // Show error banner when document or AI errors occur
  const activeError = docError || aiError
  const activeErrorMessage = activeError
    ? activeError.message || 'An unexpected error occurred'
    : ''

  const handleLoadDocument = useCallback(async () => {
    await loadDocument()
    resetAI()
  }, [loadDocument, resetAI])

  const handleSelectText = useCallback((text: string) => {
    setSelectedText(text)
  }, [])

  const handleRewrite = useCallback(async () => {
    await requestRewrite(selectedText, versionId)
  }, [selectedText, versionId, requestRewrite])

  const handleApplyRewrite = useCallback(
    async (newText: string) => {
      if (!versionId) {
        setShowErrorBanner(true)
        return
      }

      // Check for conflict before applying
      const conflict = await checkConflict(versionId)
      if (conflict) {
        return
      }

      // Replace selected text with new text
      const beforeSelection = content.substring(0, content.indexOf(selectedText))
      const afterSelection = content.substring(
        content.indexOf(selectedText) + selectedText.length
      )
      const updatedContent = beforeSelection + newText + afterSelection

      // Update document on server
      setIsUpdateLoading(true)
      try {
        await updateDocument({
          content: updatedContent,
          versionId,
        })

        // Update local state
        setContent(updatedContent)
        resetAI()
        setSelectedText('')
      } catch (err) {
        console.error('Failed to update document:', err)
        setShowErrorBanner(true)
      } finally {
        setIsUpdateLoading(false)
      }
    },
    [content, selectedText, versionId, checkConflict, setContent, resetAI]
  )

  const handleTextChange = useCallback(
    (newContent: string) => {
      setContent(newContent)
    },
    [setContent]
  )

  const handleDismissError = useCallback(() => {
    setShowErrorBanner(false)
    clearAIError()
  }, [clearAIError])

  const handleDismissConflict = useCallback(() => {
    clearConflict()
  }, [clearConflict])

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
      </header>

      {/* Error Banner (US-05) */}
      <ErrorBanner
        visible={showErrorBanner || !!activeError}
        message={activeErrorMessage}
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
              <TextAreaEditor
                content={content}
                onChange={handleTextChange}
                onSelect={handleSelectText}
                placeholder="Content will appear here..."
                disabled={isUpdateLoading}
              />
            </div>

            {/* AI Sidebar (US-03) */}
            <AISidebar
              selectedText={selectedText}
              aiResponse={aiResponse}
              isLoading={aiLoading}
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
