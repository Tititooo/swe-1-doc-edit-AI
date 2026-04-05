import { useCallback, useEffect, useMemo, useState } from 'react'
import { updateDocument } from './api/documentAPI'
import { AISidebar } from './components/AISidebar'
import { AuthPanel } from './components/AuthPanel'
import { ConflictWarningBanner } from './components/ConflictWarningBanner'
import { ErrorBanner } from './components/ErrorBanner'
import { ExperimentalTiptapEditor } from './components/ExperimentalTiptapEditor'
import { LoadDocumentButton } from './components/LoadDocumentButton'
import { useAI } from './hooks/useAI'
import { useAuth } from './hooks/useAuth'
import { useDocument } from './hooks/useDocument'
import { useVersionConflict } from './hooks/useVersionConflict'
import { useEditorStore } from './stores/editorStore'
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
    dismissResponse,
    history,
    markSuggestion,
    refreshHistory,
    requestRewrite,
    restoreResponse,
    clearError: clearAIError,
    reset: resetAI,
  } = useAI()
  const { hasConflict, conflictMessage, checkConflict, clearConflict } = useVersionConflict()
  const connectionError = useEditorStore((state) => state.connectionError)
  const collaborationStatus = useEditorStore((state) => state.collaborationStatus)
  const presenceCount = useEditorStore((state) => state.presenceCount)

  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null)
  const [isUpdateLoading, setIsUpdateLoading] = useState(false)

  const selectedText = selection?.text || ''

  const activeErrorMessage = useMemo(
    () =>
      localErrorMessage ||
      connectionError ||
      docError?.message ||
      aiError?.message ||
      (!authRequired ? authError?.message : null) ||
      null,
    [aiError?.message, authError?.message, authRequired, connectionError, docError?.message, localErrorMessage]
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
    await loadDocument(document?.id ?? null)
    await refreshHistory()
    resetAI()
  }, [clearConflict, document?.id, loadDocument, refreshHistory, resetAI])

  const handleSelectText = useCallback((nextSelection: TextSelection | null) => {
    setSelection(nextSelection)
  }, [])

  const handleRewrite = useCallback(
    async (options: AIRequestOptions) => {
      const continueContext =
        options.feature === 'continue'
          ? content.slice(Math.max(0, content.length - 600))
          : options.documentText

      await requestRewrite(document?.id ?? null, selectedText, {
        ...options,
        documentText: continueContext,
      })
    },
    [content, document?.id, requestRewrite, selectedText]
  )

  const handleApplyRewrite = useCallback(
    async (newText: string) => {
      if (document?.id === undefined || versionId === null) {
        setLocalErrorMessage('Load a document before applying an AI result.')
        return
      }

      const conflict = await checkConflict(document.id, versionId)
      if (conflict) {
        return
      }

      const featureToRestore = activeFeature
      dismissResponse()

      setIsUpdateLoading(true)
      setLocalErrorMessage(null)
      try {
        const updatedDocument = await updateDocument(document.id, {
          content: newText,
          versionId,
        })

        syncDocument(updatedDocument)
        await markSuggestion('accepted')
        clearConflict()
        resetAI()
        setSelection(null)
      } catch (error) {
        const apiError = error as APIError
        restoreResponse(newText, featureToRestore)
        setLocalErrorMessage(apiError.message || 'Failed to update document.')
      } finally {
        setIsUpdateLoading(false)
      }
    },
    [
      activeFeature,
      checkConflict,
      clearConflict,
      dismissResponse,
      document?.id,
      markSuggestion,
      resetAI,
      restoreResponse,
      syncDocument,
      versionId,
    ]
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
              <ExperimentalTiptapEditor
                documentId={document?.id ?? null}
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
        <span className="version-info">
          {document &&
            `Sync: ${collaborationStatus}${presenceCount ? ` · ${presenceCount} peers` : ''}${
              versionId ? ` · Version ${versionId}` : ''
            }`}
        </span>
      </footer>
    </div>
  )
}

export default App
