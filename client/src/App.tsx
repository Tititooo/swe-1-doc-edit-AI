import { useCallback, useEffect, useMemo, useState } from 'react'
import { updateDocument } from './api/documentAPI'
import { AISidebar } from './components/AISidebar'
import { AuthPanel } from './components/AuthPanel'
import { ConflictWarningBanner } from './components/ConflictWarningBanner'
import { ErrorBanner } from './components/ErrorBanner'
import { ExperimentalTiptapEditor } from './components/ExperimentalTiptapEditor'
import { LoadDocumentButton } from './components/LoadDocumentButton'
import { TextAreaEditor } from './components/TextAreaEditor'
import { useAI } from './hooks/useAI'
import { useAuth } from './hooks/useAuth'
import { useDocument } from './hooks/useDocument'
import { useVersionConflict } from './hooks/useVersionConflict'
import type { AIRequestOptions } from './hooks/useAI'
import type { APIError, TextSelection } from './types/document'
import './App.css'

function App() {
  const {
    authRequired,
    authReady,
    authLoading,
    user,
    authError,
    loginUser,
    registerUser,
    logoutUser,
    clearError: clearAuthError,
  } = useAuth()
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
    reset: resetDocument,
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

  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null)
  const [isUpdateLoading, setIsUpdateLoading] = useState(false)
  const [editorMode, setEditorMode] = useState<'plain' | 'rich'>('plain')

  const selectedText = selection?.text || ''

  const activeErrorMessage = useMemo(
    () => localErrorMessage || docError?.message || aiError?.message || (!authRequired ? authError?.message : null) || null,
    [aiError?.message, authError?.message, authRequired, docError?.message, localErrorMessage]
  )

  useEffect(() => {
    if (!authRequired || user) {
      return
    }
    resetDocument()
    resetAI()
    clearConflict()
    setSelection(null)
  }, [authRequired, clearConflict, resetAI, resetDocument, user])

  useEffect(() => {
    if (!document?.id || (authRequired && !user)) return
    void refreshHistory()
  }, [authRequired, document?.id, refreshHistory, user])

  const handleLoadDocument = useCallback(async () => {
    setSelection(null)
    setLocalErrorMessage(null)
    clearConflict()
    await loadDocument()
    await refreshHistory()
    resetAI()
  }, [clearConflict, loadDocument, refreshHistory, resetAI])

  const handleSelectText = useCallback((nextSelection: TextSelection | null) => {
    setSelection(nextSelection)
  }, [])

  const handleRewrite = useCallback(
    async (options: AIRequestOptions) => {
      const continueContext =
        options.feature === 'continue'
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

      const conflict = await checkConflict(versionId)
      if (conflict) {
        return
      }

      const updatedContent = selection
        ? content.slice(0, selection.start) + newText + content.slice(selection.end)
        : `${content.trimEnd()}\n\n${newText}`.trim()

      setIsUpdateLoading(true)
      setLocalErrorMessage(null)
      try {
        const updatedDocument = await updateDocument({
          content: updatedContent,
          versionId,
        })

        syncDocument(updatedDocument)
        await markSuggestion('accepted')
        clearConflict()
        resetAI()
        setSelection(null)
      } catch (error) {
        const apiError = error as APIError
        setLocalErrorMessage(apiError.message || 'Failed to update document.')
      } finally {
        setIsUpdateLoading(false)
      }
    },
    [checkConflict, clearConflict, content, markSuggestion, resetAI, selection, syncDocument, versionId]
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
    clearAuthError()
  }, [clearAIError, clearAuthError, clearDocumentError])

  const handleDismissConflict = useCallback(() => {
    clearConflict()
  }, [clearConflict])

  const handleRejectSuggestion = useCallback(async () => {
    await markSuggestion('rejected')
    resetAI()
  }, [markSuggestion, resetAI])

  const handleLogout = useCallback(() => {
    logoutUser()
    resetDocument()
    resetAI()
    clearConflict()
    setSelection(null)
    setLocalErrorMessage(null)
  }, [clearConflict, logoutUser, resetAI, resetDocument])

  const authShellVisible = authReady && authRequired && !user

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>Collaborative Document Editor</h1>
          <p className="subtitle">AI-powered writing assistant</p>
        </div>

        <div className="header-actions">
          {authRequired ? (
            user ? (
              <>
                <div className="auth-chip">
                  <strong>{user.name}</strong>
                  <span>
                    {user.role} · {user.email}
                  </span>
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
                <button className="load-button" onClick={handleLogout} type="button">
                  Sign Out
                </button>
              </>
            ) : (
              <div className="auth-chip auth-chip-muted">
                <strong>Auth enabled</strong>
                <span>{authLoading ? 'Preparing session...' : 'Sign in to access the editor'}</span>
              </div>
            )
          ) : (
            <>
              <div className="auth-chip auth-chip-muted">
                <strong>Preview mode</strong>
                <span>Auth is currently optional</span>
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
            </>
          )}
        </div>
      </header>

      <ErrorBanner
        visible={!authShellVisible && !!activeErrorMessage}
        message={activeErrorMessage || undefined}
        onDismiss={handleDismissError}
      />

      <ConflictWarningBanner
        visible={hasConflict}
        message={conflictMessage || 'Document has changed.'}
        onDismiss={handleDismissConflict}
      />

      <main className="app-main">
        {!authReady ? (
          <div className="placeholder-state">
            <div className="placeholder-icon">⌛</div>
            <h2>Preparing session</h2>
            <p>Checking the backend configuration and current auth state.</p>
          </div>
        ) : authShellVisible ? (
          <AuthPanel
            loading={authLoading}
            error={authError}
            onLogin={loginUser}
            onRegister={registerUser}
          />
        ) : !document ? (
          <div className="placeholder-state">
            <div className="placeholder-icon">📄</div>
            <h2>Click "Load Document" to begin</h2>
            <p>Your document will appear here once loaded from the server.</p>
          </div>
        ) : (
          <div className="editor-layout">
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
                <ExperimentalTiptapEditor
                  content={content}
                  selection={selection}
                  aiResponse={aiResponse}
                  activeFeature={activeFeature}
                  isStreaming={aiLoading}
                  onChange={handleTextChange}
                  onSelect={handleSelectText}
                  onAccept={handleApplyRewrite}
                  onReject={() => void handleRejectSuggestion()}
                  disabled={isUpdateLoading}
                />
              )}
            </div>

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

      <footer className="app-footer">
        <span className="version-info">{document && `Version: ${versionId}`}</span>
      </footer>
    </div>
  )
}

export default App
