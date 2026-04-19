import { useCallback, useEffect, useMemo, useState } from 'react'
import { renameDocument, updateDocument } from './api/documentAPI'
import { AISidebar } from './components/AISidebar'
import { AuthPanel } from './components/AuthPanel'
import { ConflictWarningBanner } from './components/ConflictWarningBanner'
import { DocumentDashboard } from './components/DocumentDashboard'
import { DocumentUtilityPanel } from './components/DocumentUtilityPanel'
import { DocumentWorkspaceHeader } from './components/DocumentWorkspaceHeader'
import { ErrorBanner } from './components/ErrorBanner'
import { ExperimentalTiptapEditor } from './components/ExperimentalTiptapEditor'
import { ReadOnlyBanner } from './components/ReadOnlyBanner'
import { useAI } from './hooks/useAI'
import { useAuth } from './hooks/useAuth'
import { useAutoSave } from './hooks/useAutoSave'
import { useDashboardDocuments } from './hooks/useDashboardDocuments'
import { useDocument } from './hooks/useDocument'
import { useDocumentPermissions } from './hooks/useDocumentPermissions'
import { useDocumentVersions } from './hooks/useDocumentVersions'
import { useVersionConflict } from './hooks/useVersionConflict'
import { useEditorStore } from './stores/editorStore'
import type { AIRequestOptions } from './hooks/useAI'
import type { APIError, DocumentListItem, DocumentRole, TextSelection } from './types/document'
import './App.css'

type AppView = 'dashboard' | 'editor'
type UtilityPanelMode = 'share' | 'history' | null

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
    updateDocumentState,
    clearError: clearDocumentError,
    reset: resetDocument,
  } = useDocument()
  const {
    documents,
    loading: dashboardLoading,
    creating,
    error: dashboardError,
    refreshDocuments,
    createNewDocument,
    clearError: clearDashboardError,
  } = useDashboardDocuments()
  const {
    permissions,
    loading: permissionsLoading,
    submitting: permissionsSubmitting,
    error: permissionsError,
    loadPermissions,
    shareDocument,
    revokePermission,
    reset: resetPermissions,
  } = useDocumentPermissions()
  const {
    versions,
    loading: versionsLoading,
    restoring,
    error: versionsError,
    loadVersions,
    restoreVersion,
    reset: resetVersions,
  } = useDocumentVersions()
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
    restoreResponse,
    dismissResponse,
    clearError: clearAIError,
    reset: resetAI,
  } = useAI()
  const { hasConflict, conflictMessage, checkConflict, clearConflict } = useVersionConflict()
  const realtimeSession = useEditorStore((state) => state.realtimeSession)
  const connectionError = useEditorStore((state) => state.connectionError)
  const collaborationStatus = useEditorStore((state) => state.collaborationStatus)
  const presenceCount = useEditorStore((state) => state.presenceCount)

  const [view, setView] = useState<AppView>('dashboard')
  const [activeDocumentRole, setActiveDocumentRole] = useState<DocumentRole | null>(null)
  const [panelMode, setPanelMode] = useState<UtilityPanelMode>(null)
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null)
  const [isApplyingSuggestion, setIsApplyingSuggestion] = useState(false)
  const [isTitleSaving, setIsTitleSaving] = useState(false)
  const [editorSyncToken, setEditorSyncToken] = useState(0)

  const selectedText = selection?.text || ''
  const effectiveRole = realtimeSession?.role || activeDocumentRole
  const isReadOnlyRole = effectiveRole === 'viewer' || effectiveRole === 'commenter'

  const { saveStatus, statusLabel, resetSaveState } = useAutoSave({
    document,
    role: effectiveRole,
    enabled: view === 'editor',
    onDocumentSynced: updateDocumentState,
    onError: (message) => setLocalErrorMessage(message),
  })

  const activeErrorMessage = useMemo(
    () =>
      localErrorMessage ||
      connectionError ||
      docError?.message ||
      dashboardError?.message ||
      aiError?.message ||
      (!authRequired ? authError?.message : null) ||
      null,
    [
      aiError?.message,
      authError?.message,
      authRequired,
      connectionError,
      dashboardError?.message,
      docError?.message,
      localErrorMessage,
    ]
  )

  const authShellVisible = authReady && authRequired && !user

  useEffect(() => {
    if (!authReady || authShellVisible) {
      return
    }
    void refreshDocuments()
  }, [authReady, authShellVisible, refreshDocuments])

  useEffect(() => {
    if (realtimeSession?.role) {
      setActiveDocumentRole(realtimeSession.role)
    }
  }, [realtimeSession?.role])

  useEffect(() => {
    if (!authRequired || user) {
      return
    }

    setView('dashboard')
    setPanelMode(null)
    setSelection(null)
    setActiveDocumentRole(null)
    setLocalErrorMessage(null)
    resetPermissions()
    resetVersions()
    resetSaveState(null)
    resetDocument()
    resetAI()
    clearConflict()
  }, [
    authRequired,
    clearConflict,
    resetAI,
    resetDocument,
    resetPermissions,
    resetSaveState,
    resetVersions,
    user,
  ])

  useEffect(() => {
    if (!document?.id || (authRequired && !user)) return
    void refreshHistory(document.id)
  }, [authRequired, document?.id, refreshHistory, user])

  const handleOpenDocument = useCallback(
    async (documentItem: DocumentListItem) => {
      setLocalErrorMessage(null)
      setPanelMode(null)
      setSelection(null)
      clearConflict()
      resetAI()
      resetPermissions()
      resetVersions()

      const loaded = await loadDocument(documentItem.id)
      if (!loaded) {
        return
      }

      setActiveDocumentRole(documentItem.role)
      setView('editor')
      setEditorSyncToken((value) => value + 1)
      resetSaveState(loaded)
      await refreshHistory(documentItem.id)
    },
    [
      clearConflict,
      loadDocument,
      refreshHistory,
      resetAI,
      resetPermissions,
      resetSaveState,
      resetVersions,
    ]
  )

  const handleCreateDocument = useCallback(async () => {
    setLocalErrorMessage(null)
    setPanelMode(null)
    setSelection(null)
    clearConflict()
    resetAI()
    resetPermissions()
    resetVersions()

    const created = await createNewDocument()
    if (!created) {
      return
    }

    syncDocument(created)
    setActiveDocumentRole('owner')
    setView('editor')
    setEditorSyncToken((value) => value + 1)
    resetSaveState(created)
    await refreshHistory(created.id)
  }, [
    clearConflict,
    createNewDocument,
    refreshHistory,
    resetAI,
    resetPermissions,
    resetSaveState,
    resetVersions,
    syncDocument,
  ])

  const handleBackToDashboard = useCallback(() => {
    setView('dashboard')
    setPanelMode(null)
    setSelection(null)
    setActiveDocumentRole(null)
    setLocalErrorMessage(null)
    clearConflict()
    resetPermissions()
    resetVersions()
    resetSaveState(null)
    resetDocument()
    resetAI()
    void refreshDocuments()
  }, [
    clearConflict,
    refreshDocuments,
    resetAI,
    resetDocument,
    resetPermissions,
    resetSaveState,
    resetVersions,
  ])

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
      if (!document?.id || versionId === null) {
        setLocalErrorMessage('Open a document before applying an AI result.')
        return
      }

      resetSaveState(document)
      const conflict = await checkConflict(document.id, versionId)
      if (conflict) {
        return
      }

      const featureToRestore = activeFeature
      dismissResponse()
      setIsApplyingSuggestion(true)
      setLocalErrorMessage(null)

      try {
        const updatedDocument = await updateDocument(document.id, {
          content: newText,
          versionId,
        })

        syncDocument(updatedDocument)
        resetSaveState(updatedDocument)
        await markSuggestion('accepted')
        clearConflict()
        resetAI()
        setSelection(null)
      } catch (error) {
        const apiError = error as APIError
        restoreResponse(newText, featureToRestore)
        setLocalErrorMessage(apiError.message || 'Failed to update document.')
      } finally {
        setIsApplyingSuggestion(false)
      }
    },
    [
      activeFeature,
      checkConflict,
      clearConflict,
      dismissResponse,
      document,
      markSuggestion,
      resetAI,
      resetSaveState,
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

  const handleRenameTitle = useCallback(
    async (nextTitle: string) => {
      if (!document?.id || !effectiveRole || isReadOnlyRole) {
        return false
      }

      setIsTitleSaving(true)
      setLocalErrorMessage(null)
      try {
        const updated = await renameDocument(document.id, nextTitle)
        updateDocumentState((previous) =>
          previous && previous.id === document.id
            ? {
                ...previous,
                title: updated.title,
                lastModified: updated.updatedAt || previous.lastModified,
              }
            : previous
        )
        await refreshDocuments()
        return true
      } catch (nextError) {
        const apiError = nextError as APIError
        setLocalErrorMessage(apiError.message || 'Failed to rename document.')
        return false
      } finally {
        setIsTitleSaving(false)
      }
    },
    [document?.id, effectiveRole, isReadOnlyRole, refreshDocuments, updateDocumentState]
  )

  const handleOpenSharePanel = useCallback(async () => {
    if (!document?.id) return
    setPanelMode('share')
    await loadPermissions(document.id)
  }, [document?.id, loadPermissions])

  const handleOpenHistoryPanel = useCallback(async () => {
    if (!document?.id) return
    setPanelMode('history')
    await loadVersions(document.id)
  }, [document?.id, loadVersions])

  const handleShareDocument = useCallback(
    async (userEmail: string, role: DocumentRole) => {
      if (!document?.id) return false
      return shareDocument(document.id, userEmail, role)
    },
    [document?.id, shareDocument]
  )

  const handleRevokePermission = useCallback(
    async (permissionId: string) => {
      if (!document?.id) return false
      return revokePermission(document.id, permissionId)
    },
    [document?.id, revokePermission]
  )

  const handleRestoreVersion = useCallback(
    async (restoreVersionId: number) => {
      if (!document?.id) {
        return false
      }

      const restored = await restoreVersion(document.id, restoreVersionId)
      if (!restored) {
        return false
      }

      const refreshed = await loadDocument(document.id)
      if (!refreshed) {
        return false
      }

      syncDocument(refreshed)
      setEditorSyncToken((value) => value + 1)
      resetSaveState(refreshed)
      clearConflict()
      resetAI()
      setSelection(null)
      await Promise.all([loadVersions(document.id), refreshHistory(document.id), refreshDocuments()])
      return true
    },
    [
      clearConflict,
      document?.id,
      loadDocument,
      loadVersions,
      refreshDocuments,
      refreshHistory,
      resetAI,
      resetSaveState,
      restoreVersion,
      syncDocument,
    ]
  )

  const handleDismissError = useCallback(() => {
    setLocalErrorMessage(null)
    clearDocumentError()
    clearDashboardError()
    clearAIError()
    clearAuthError()
  }, [clearAIError, clearAuthError, clearDashboardError, clearDocumentError])

  const handleDismissConflict = useCallback(() => {
    clearConflict()
  }, [clearConflict])

  const handleRejectSuggestion = useCallback(async () => {
    await markSuggestion('rejected')
    resetAI()
  }, [markSuggestion, resetAI])

  const handleLogout = useCallback(() => {
    logoutUser()
    setView('dashboard')
    setPanelMode(null)
    setSelection(null)
    setActiveDocumentRole(null)
    setLocalErrorMessage(null)
    resetPermissions()
    resetVersions()
    resetSaveState(null)
    resetDocument()
    resetAI()
    clearConflict()
  }, [
    clearConflict,
    logoutUser,
    resetAI,
    resetDocument,
    resetPermissions,
    resetSaveState,
    resetVersions,
  ])

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
                <span>{user ? `${user.name} · ${user.email}` : 'Auth is currently optional'}</span>
              </div>
              <button className="load-button" onClick={handleLogout} type="button">
                Reset Session
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
        ) : view === 'dashboard' ? (
          <DocumentDashboard
            documents={documents}
            loading={dashboardLoading || loading}
            creating={creating}
            onCreate={handleCreateDocument}
            onOpen={handleOpenDocument}
          />
        ) : !document ? (
          <div className="placeholder-state">
            <div className="placeholder-icon">📄</div>
            <h2>Loading document</h2>
            <p>Opening the selected document and preparing the live editor session.</p>
          </div>
        ) : (
          <div className="workspace-shell">
            <DocumentWorkspaceHeader
              title={document.title}
              role={effectiveRole}
              documentId={document.id}
              saveStatus={saveStatus}
              statusLabel={statusLabel}
              titleSaving={isTitleSaving}
              onBack={handleBackToDashboard}
              onOpenShare={handleOpenSharePanel}
              onOpenHistory={handleOpenHistoryPanel}
              onRenameTitle={handleRenameTitle}
              onExportError={setLocalErrorMessage}
            />

            {isReadOnlyRole && effectiveRole && <ReadOnlyBanner role={effectiveRole} />}

            <div className="editor-layout">
              <div className="editor-section">
                <ExperimentalTiptapEditor
                  documentId={document.id}
                  content={content}
                  externalSyncToken={editorSyncToken}
                  selection={selection}
                  aiResponse={aiResponse}
                  activeFeature={activeFeature}
                  isStreaming={aiLoading}
                  onChange={handleTextChange}
                  onSelect={handleSelectText}
                  onAccept={handleApplyRewrite}
                  onReject={() => void handleRejectSuggestion()}
                  disabled={isApplyingSuggestion}
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
                isApplyDisabled={hasConflict || isApplyingSuggestion || isReadOnlyRole}
              />
            </div>
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

      <DocumentUtilityPanel
        mode={panelMode}
        role={effectiveRole}
        permissions={permissions}
        versions={versions}
        currentVersionId={versionId}
        permissionsLoading={permissionsLoading}
        versionsLoading={versionsLoading}
        permissionsSubmitting={permissionsSubmitting}
        restoringVersion={restoring}
        permissionsError={permissionsError}
        versionsError={versionsError}
        onClose={() => setPanelMode(null)}
        onShare={handleShareDocument}
        onRevoke={handleRevokePermission}
        onRestore={handleRestoreVersion}
      />
    </div>
  )
}

export default App
