import { useMemo, useState } from 'react'
import type {
  APIError,
  DocumentPermissionItem,
  DocumentRole,
  DocumentVersionItem,
} from '../types/document'
import './DocumentUtilityPanel.css'

interface DocumentUtilityPanelProps {
  mode: 'share' | 'history' | null
  role: DocumentRole | null
  permissions: DocumentPermissionItem[]
  versions: DocumentVersionItem[]
  currentVersionId: number | null
  permissionsLoading: boolean
  versionsLoading: boolean
  permissionsSubmitting: boolean
  restoringVersion: boolean
  permissionsError: APIError | null
  versionsError: APIError | null
  onClose: () => void
  onShare: (userEmail: string, role: DocumentRole) => Promise<boolean>
  onRevoke: (permissionId: string) => Promise<boolean>
  onRestore: (versionId: number) => Promise<boolean>
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

export const DocumentUtilityPanel = ({
  mode,
  role,
  permissions,
  versions,
  currentVersionId,
  permissionsLoading,
  versionsLoading,
  permissionsSubmitting,
  restoringVersion,
  permissionsError,
  versionsError,
  onClose,
  onShare,
  onRevoke,
  onRestore,
}: DocumentUtilityPanelProps) => {
  const [email, setEmail] = useState('')
  const [selectedRole, setSelectedRole] = useState<DocumentRole>('editor')
  const [submitting, setSubmitting] = useState(false)
  const canRestore = role === 'owner' || role === 'editor'

  const panelTitle = useMemo(() => {
    if (mode === 'share') return 'Share document'
    if (mode === 'history') return 'Version history'
    return ''
  }, [mode])

  if (!mode) {
    return null
  }

  return (
    <div className="utility-panel-overlay" role="presentation">
      <div className="utility-panel-backdrop" onClick={onClose} />
      <aside className="utility-panel" data-testid="document-utility-panel">
        <div className="utility-panel-header">
          <div>
            <span className="utility-panel-kicker">Document tools</span>
            <h3>{panelTitle}</h3>
          </div>
          <button className="utility-panel-close" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        {mode === 'share' ? (
          <div className="utility-panel-content">
            <div className="utility-section">
              <h4>Invite by email</h4>
              <p>Owners can share access with editors, commenters, or viewers.</p>
              <form
                className="share-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  const trimmed = email.trim()
                  if (!trimmed) return

                  void (async () => {
                    setSubmitting(true)
                    const succeeded = await onShare(trimmed, selectedRole)
                    setSubmitting(false)
                    if (succeeded) {
                      setEmail('')
                      setSelectedRole('editor')
                    }
                  })()
                }}
              >
                <input
                  className="utility-input"
                  placeholder="teammate@example.com"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <select
                  className="utility-input"
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value as DocumentRole)}
                >
                  <option value="editor">Editor</option>
                  <option value="commenter">Commenter</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  className="utility-primary-button"
                  type="submit"
                  disabled={permissionsSubmitting || submitting}
                >
                  {permissionsSubmitting || submitting ? 'Sharing…' : 'Share Document'}
                </button>
              </form>
              {permissionsError && <p className="utility-error">{permissionsError.message}</p>}
            </div>

            <div className="utility-section">
              <h4>Current access</h4>
              {permissionsLoading ? (
                <p className="utility-muted">Loading current shares…</p>
              ) : permissions.length === 0 ? (
                <p className="utility-muted">Only the owner currently has access.</p>
              ) : (
                <div className="share-list">
                  {permissions.map((permission) => (
                    <div key={permission.permissionId} className="share-row">
                      <div>
                        <strong>{permission.name}</strong>
                        <p>{permission.email}</p>
                      </div>
                      <div className="share-row-actions">
                        <span className={`role-badge role-${permission.role}`}>{permission.role}</span>
                        {permission.role !== 'owner' && (
                          <button
                            className="utility-text-button"
                            type="button"
                            disabled={permissionsSubmitting}
                            onClick={() => void onRevoke(permission.permissionId)}
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="utility-panel-content">
            {versionsError && <p className="utility-error">{versionsError.message}</p>}
            {versionsLoading ? (
              <p className="utility-muted">Loading version history…</p>
            ) : versions.length === 0 ? (
              <p className="utility-muted">No versions available yet.</p>
            ) : (
              <div className="version-list">
                {versions.map((version) => {
                  const isCurrent = version.versionId === currentVersionId
                  return (
                    <div key={version.versionId} className="version-row">
                      <div>
                        <strong>Version {version.versionId}</strong>
                        <p>{formatDate(version.createdAt)}</p>
                        <span className="version-created-by">{version.createdBy}</span>
                      </div>
                      <div className="version-row-actions">
                        {isCurrent && <span className="version-current-pill">Current</span>}
                        {canRestore && (
                          <button
                            className="utility-text-button"
                            type="button"
                            disabled={restoringVersion || isCurrent}
                            onClick={() => void onRestore(version.versionId)}
                          >
                            {restoringVersion && !isCurrent ? 'Restoring…' : 'Restore'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
